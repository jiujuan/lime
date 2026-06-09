//! Skill 执行编排适配层
//!
//! prompt/workflow 纯逻辑已下沉到 `lime-agent`，
//! 本模块只保留 Tauri emitter 与错误码映射。

use base64::{engine::general_purpose::STANDARD, Engine as _};
use lime_agent::{
    artifact_protocol::extend_unique_artifact_protocol_paths,
    execute_skill_prompt as execute_agent_skill_prompt,
    execute_skill_workflow as execute_agent_skill_workflow, AgentEvent as RuntimeAgentEvent,
    AgentToolResult, AsterAgentState, SkillEventEmitter, SkillExecutionError, SkillInputImage,
    SkillPromptExecution, SkillWorkflowExecution,
};
use lime_core::database::dao::agent_timeline::{AgentThreadItemPayload, AgentThreadItemStatus};
use lime_skills::{ExecutionCallback, LoadedSkillDefinition};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::skill_error::{
    format_skill_error, SKILL_ERR_EXECUTE_FAILED, SKILL_ERR_SESSION_INIT_FAILED,
};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::services::agent_timeline_service::AgentTimelineRecorder;
use crate::services::execution_tracker_service::{ExecutionTracker, RunSource};

use super::execution_callback::TauriExecutionCallback;
use super::load_executable_skill_definition;
use super::runtime::{
    build_skill_run_finish_decision, build_skill_run_start_metadata, prepare_skill_execution,
};
use super::social_post::finalize_skill_output;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillExecutionImageInput {
    pub data: String,
    pub media_type: String,
}

#[derive(Debug, Clone)]
pub struct SkillExecutionRequest {
    pub skill_name: String,
    pub user_input: String,
    pub images: Vec<SkillExecutionImageInput>,
    pub request_context: Option<Value>,
    pub provider_override: Option<String>,
    pub model_override: Option<String>,
    pub execution_id: Option<String>,
    pub session_id: Option<String>,
}

const SKILL_INPUT_IMAGE_REF_PREFIX: &str = "skill-input-image://";

fn build_skill_input_image_ref(index: usize) -> String {
    format!("{SKILL_INPUT_IMAGE_REF_PREFIX}{}", index + 1)
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        "image/svg+xml" => "svg",
        _ => "png",
    }
}

fn resolve_skill_input_artifact_root(
    db: &DbConnection,
    session_id: &str,
    execution_id: &str,
) -> PathBuf {
    let working_dir = lime_agent::get_session_sync(db, session_id)
        .ok()
        .and_then(|session| session.working_dir)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| std::env::temp_dir().join("lime-skill-inputs"));

    working_dir
        .join(".lime")
        .join("skill-inputs")
        .join(execution_id)
}

fn persist_skill_input_images(
    root: &Path,
    images: &[SkillExecutionImageInput],
) -> Vec<Option<String>> {
    if images.is_empty() {
        return Vec::new();
    }

    if let Err(error) = fs::create_dir_all(root) {
        tracing::warn!(
            "[execute_skill] 创建 skill 输入图片目录失败 path={}: {}",
            root.display(),
            error
        );
        return vec![None; images.len()];
    }

    images
        .iter()
        .enumerate()
        .map(|(index, image)| {
            let file_name = format!(
                "input-{}.{}",
                index + 1,
                extension_for_media_type(&image.media_type)
            );
            let file_path = root.join(file_name);
            let bytes = match STANDARD.decode(&image.data) {
                Ok(bytes) => bytes,
                Err(error) => {
                    tracing::warn!(
                        "[execute_skill] 解码 skill 输入图片失败 ref={} media_type={}: {}",
                        build_skill_input_image_ref(index),
                        image.media_type,
                        error
                    );
                    return None;
                }
            };
            match fs::write(&file_path, bytes) {
                Ok(_) => Some(file_path.to_string_lossy().to_string()),
                Err(error) => {
                    tracing::warn!(
                        "[execute_skill] 写入 skill 输入图片失败 path={}: {}",
                        file_path.display(),
                        error
                    );
                    None
                }
            }
        })
        .collect()
}

fn replace_skill_context_image_refs(value: &mut Value, materialized_paths: &[Option<String>]) {
    match value {
        Value::Array(items) => {
            for item in items {
                replace_skill_context_image_refs(item, materialized_paths);
            }
        }
        Value::Object(record) => {
            for item in record.values_mut() {
                replace_skill_context_image_refs(item, materialized_paths);
            }
        }
        Value::String(text) => {
            let normalized = text.trim();
            if let Some(index_text) = normalized.strip_prefix(SKILL_INPUT_IMAGE_REF_PREFIX) {
                if let Ok(index) = index_text.parse::<usize>() {
                    if let Some(Some(path)) = materialized_paths.get(index.saturating_sub(1)) {
                        *value = Value::String(path.clone());
                    }
                }
            }
        }
        _ => {}
    }
}

fn prepare_skill_request_context(
    db: &DbConnection,
    session_id: &str,
    execution_id: &str,
    request_context: Option<Value>,
    images: &[SkillExecutionImageInput],
) -> Option<Value> {
    let mut request_context = request_context?;
    let image_root = resolve_skill_input_artifact_root(db, session_id, execution_id);
    let materialized_paths = persist_skill_input_images(&image_root, images);

    if !materialized_paths.is_empty() {
        replace_skill_context_image_refs(&mut request_context, &materialized_paths);
    }

    Some(request_context)
}

fn build_skill_user_input(user_input: &str, request_context: Option<&Value>) -> String {
    let normalized_user_input = user_input.trim();
    if let Some(request_context) = request_context {
        let serialized_context = serde_json::to_string_pretty(request_context)
            .unwrap_or_else(|_| request_context.to_string());
        if normalized_user_input.is_empty() {
            return format!(
                "以下是调用方提供的结构化上下文，请严格按字段含义执行：\n```json\n{serialized_context}\n```"
            );
        }

        return format!(
            "以下是调用方提供的结构化上下文，请严格按字段含义执行：\n```json\n{serialized_context}\n```\n\n用户原始输入：\n{normalized_user_input}"
        );
    }

    normalized_user_input.to_string()
}

fn build_skill_images(images: &[SkillExecutionImageInput]) -> Vec<SkillInputImage> {
    images
        .iter()
        .map(|image| SkillInputImage {
            data: image.data.clone(),
            media_type: image.media_type.clone(),
        })
        .collect()
}

fn ensure_skill_error_code(code: &str, message: &str) -> String {
    if message.contains('|') {
        message.to_string()
    } else {
        format_skill_error(code, message)
    }
}

struct TauriExecutionCallbackAdapter<'a> {
    inner: &'a TauriExecutionCallback,
}

impl<'a> TauriExecutionCallbackAdapter<'a> {
    fn new(inner: &'a TauriExecutionCallback) -> Self {
        Self { inner }
    }
}

impl ExecutionCallback for TauriExecutionCallbackAdapter<'_> {
    fn on_step_start(
        &self,
        step_id: &str,
        step_name: &str,
        current_step: usize,
        total_steps: usize,
    ) {
        self.inner
            .on_step_start(step_id, step_name, current_step, total_steps);
    }

    fn on_step_complete(&self, step_id: &str, output: &str) {
        self.inner.on_step_complete(step_id, output);
    }

    fn on_step_error(&self, step_id: &str, error: &str, will_retry: bool) {
        self.inner.on_step_error(step_id, error, will_retry);
    }

    fn on_complete(&self, success: bool, final_output: Option<&str>, error: Option<&str>) {
        let mapped_error = if success {
            error.map(|value| value.to_string())
        } else {
            error.map(|value| ensure_skill_error_code(SKILL_ERR_EXECUTE_FAILED, value))
        };
        self.inner
            .on_complete(success, final_output, mapped_error.as_deref());
    }
}

#[derive(Debug, Clone)]
struct SkillInvocationTrace {
    execution_id: String,
    skill_name: String,
    display_name: String,
    execution_mode: String,
    version: Option<String>,
    is_standard: bool,
    markdown_content: String,
    markdown_content_bytes: usize,
}

impl SkillInvocationTrace {
    fn new(skill: &LoadedSkillDefinition, execution_id: &str) -> Self {
        Self {
            execution_id: execution_id.to_string(),
            skill_name: skill.skill_name.clone(),
            display_name: skill.display_name.clone(),
            execution_mode: skill.execution_mode.clone(),
            version: skill
                .metadata
                .get("lime_version")
                .or_else(|| skill.metadata.get("version"))
                .cloned(),
            is_standard: skill.standard_compliance.is_standard,
            markdown_content: skill.markdown_content.clone(),
            markdown_content_bytes: skill.markdown_content.len(),
        }
    }

    fn tool_id(&self) -> String {
        format!("skill:{}", self.execution_id)
    }

    fn arguments(&self) -> Value {
        let mut args = json!({
            "skill": self.skill_name,
            "name": self.skill_name,
            "display_name": self.display_name,
            "source": "SKILL.md",
            "execution_mode": self.execution_mode,
        });
        if let Some(version) = self.version.as_deref() {
            if let Some(record) = args.as_object_mut() {
                record.insert("version".to_string(), json!(version));
            }
        }
        args
    }

    fn metadata(&self) -> Value {
        json!({
            "tool_family": "skill",
            "skill_name": self.skill_name,
            "skill_display_name": self.display_name,
            "skill_source": "SKILL.md",
            "agent_skills_standard": self.is_standard,
            "skill_markdown_content": self.markdown_content.as_str(),
            "skill_markdown_content_format": "text/markdown",
            "markdown_content_bytes": self.markdown_content_bytes,
            "version": self.version,
        })
    }

    fn success_output(&self) -> String {
        format!("已从 SKILL.md 读取并执行 Skill：{}", self.display_name)
    }

    fn running_output(&self) -> String {
        format!("正在从 SKILL.md 读取并执行 Skill：{}", self.display_name)
    }
}

#[derive(Clone)]
struct SkillRuntimeEventBridge {
    app_handle: AppHandle,
    db: DbConnection,
    recorder: Arc<Mutex<Option<AgentTimelineRecorder>>>,
    invocation_trace: Arc<SkillInvocationTrace>,
    tool_start_emitted: Arc<Mutex<bool>>,
    invocation_item_started: Arc<Mutex<bool>>,
}

impl SkillRuntimeEventBridge {
    fn new(
        app_handle: &AppHandle,
        db: &DbConnection,
        skill: &LoadedSkillDefinition,
        execution_id: &str,
    ) -> Self {
        Self {
            app_handle: app_handle.clone(),
            db: db.clone(),
            recorder: Arc::new(Mutex::new(None)),
            invocation_trace: Arc::new(SkillInvocationTrace::new(skill, execution_id)),
            tool_start_emitted: Arc::new(Mutex::new(false)),
            invocation_item_started: Arc::new(Mutex::new(false)),
        }
    }

    fn emitter(&self) -> SkillEventEmitter {
        let bridge = self.clone();
        Arc::new(move |event_name: String, event: RuntimeAgentEvent| {
            bridge.emit_runtime_event(event_name, event);
        })
    }

    fn emit_final_done(&self, execution_id: &str) {
        let event_name = format!("skill-exec-{execution_id}");
        self.emit_runtime_event(event_name, RuntimeAgentEvent::FinalDone { usage: None });
    }

    fn finish_turn_success(&self, event_name: &str) {
        let events = {
            let mut recorder_guard = match self.recorder.lock() {
                Ok(guard) => guard,
                Err(error) => error.into_inner(),
            };
            let Some(recorder) = recorder_guard.as_mut() else {
                return;
            };
            match recorder.complete_turn_success() {
                Ok(events) => events,
                Err(error) => {
                    tracing::warn!(
                        "[execute_skill] 标记 Skill runtime turn 完成失败，已降级继续: {}",
                        error
                    );
                    return;
                }
            }
        };

        for event in events {
            self.emit_runtime_event_directly(event_name, &event);
        }
    }

    fn finish_turn_failed(&self, event_name: &str, message: &str) {
        let events = {
            let mut recorder_guard = match self.recorder.lock() {
                Ok(guard) => guard,
                Err(error) => error.into_inner(),
            };
            let Some(recorder) = recorder_guard.as_mut() else {
                return;
            };
            match recorder.fail_turn(message) {
                Ok(events) => events,
                Err(error) => {
                    tracing::warn!(
                        "[execute_skill] 标记 Skill runtime turn 失败状态失败，已降级继续: {}",
                        error
                    );
                    return;
                }
            }
        };

        for event in events {
            self.emit_runtime_event_directly(event_name, &event);
        }
    }

    fn finish_current_turn(&self, event_name: &str, success: bool, error_message: Option<&str>) {
        self.finish_skill_invocation(event_name, success, error_message);
        if success {
            self.finish_turn_success(event_name);
        } else {
            self.finish_turn_failed(
                event_name,
                error_message.unwrap_or("Skill 执行失败，未返回可用结果。"),
            );
        }
    }

    fn emit_runtime_event(&self, event_name: String, event: RuntimeAgentEvent) {
        let recorder_emitted_equivalent = self.record_runtime_event(&event_name, &event);
        if !recorder_emitted_equivalent {
            self.emit_runtime_event_directly(&event_name, &event);
        }
    }

    fn emit_runtime_event_directly(&self, event_name: &str, event: &RuntimeAgentEvent) {
        if let Err(error) = self.app_handle.emit(event_name, event) {
            tracing::error!("[execute_skill] 发送事件失败: {}", error);
        }
    }

    fn emit_skill_invocation_start(&self, event_name: &str) {
        let should_emit = {
            let mut started_guard = match self.tool_start_emitted.lock() {
                Ok(guard) => guard,
                Err(error) => error.into_inner(),
            };
            if *started_guard {
                false
            } else {
                *started_guard = true;
                true
            }
        };
        if !should_emit {
            return;
        }

        let arguments = self.invocation_trace.arguments();
        let tool_start = RuntimeAgentEvent::ToolStart {
            tool_name: "Skill".to_string(),
            tool_id: self.invocation_trace.tool_id(),
            arguments: Some(arguments.to_string()),
        };
        self.emit_runtime_event_directly(event_name, &tool_start);
    }

    fn start_skill_invocation_item(&self, event_name: &str) {
        let should_record = {
            let mut started_guard = match self.invocation_item_started.lock() {
                Ok(guard) => guard,
                Err(error) => error.into_inner(),
            };
            if *started_guard {
                false
            } else {
                *started_guard = true;
                true
            }
        };
        if !should_record {
            return;
        }

        self.record_skill_invocation_item(
            event_name,
            AgentThreadItemStatus::InProgress,
            None,
            None,
        );
    }

    fn start_skill_invocation(&self, event_name: &str) {
        self.emit_skill_invocation_start(event_name);
        self.start_skill_invocation_item(event_name);
    }

    fn finish_skill_invocation(
        &self,
        event_name: &str,
        success: bool,
        error_message: Option<&str>,
    ) {
        let started = match self.invocation_item_started.lock() {
            Ok(guard) => *guard,
            Err(error) => *error.into_inner(),
        };
        if !started {
            self.start_skill_invocation(event_name);
        }

        let output = if success {
            Some(self.invocation_trace.success_output())
        } else {
            None
        };
        let error = if success {
            None
        } else {
            Some(
                error_message
                    .unwrap_or("Skill 执行失败，未返回可用结果。")
                    .to_string(),
            )
        };
        self.record_skill_invocation_item(
            event_name,
            if success {
                AgentThreadItemStatus::Completed
            } else {
                AgentThreadItemStatus::Failed
            },
            output.clone(),
            error.clone(),
        );

        let tool_end = RuntimeAgentEvent::ToolEnd {
            tool_id: self.invocation_trace.tool_id(),
            result: AgentToolResult {
                success,
                output: output.unwrap_or_default(),
                error,
                images: None,
                metadata: Some(
                    serde_json::from_value(self.invocation_trace.metadata()).unwrap_or_default(),
                ),
            },
        };
        self.emit_runtime_event_directly(event_name, &tool_end);
    }

    fn build_skill_invocation_payload(
        &self,
        status: AgentThreadItemStatus,
        output: Option<String>,
        error: Option<String>,
    ) -> AgentThreadItemPayload {
        let success = match status {
            AgentThreadItemStatus::Completed => Some(true),
            AgentThreadItemStatus::Failed => Some(false),
            AgentThreadItemStatus::InProgress => None,
        };
        let visible_output = if matches!(status, AgentThreadItemStatus::InProgress) {
            Some(self.invocation_trace.running_output())
        } else {
            output
        };

        AgentThreadItemPayload::ToolCall {
            tool_name: "Skill".to_string(),
            arguments: Some(self.invocation_trace.arguments()),
            output: visible_output,
            success,
            error,
            metadata: Some(self.invocation_trace.metadata()),
        }
    }

    fn record_skill_invocation_item(
        &self,
        event_name: &str,
        status: AgentThreadItemStatus,
        output: Option<String>,
        error: Option<String>,
    ) {
        let completed_at = if matches!(status, AgentThreadItemStatus::InProgress) {
            None
        } else {
            Some(chrono::Utc::now().to_rfc3339())
        };
        let payload = self.build_skill_invocation_payload(status.clone(), output, error);
        let mut recorder_guard = match self.recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        let Some(recorder) = recorder_guard.as_mut() else {
            return;
        };
        if let Err(error) = recorder.record_synthetic_item(
            &self.app_handle,
            event_name,
            self.invocation_trace.tool_id(),
            status,
            completed_at,
            payload,
        ) {
            tracing::warn!("[execute_skill] 记录 Skill invocation item 失败，已降级继续: {error}");
        }
    }

    fn record_runtime_event(&self, event_name: &str, event: &RuntimeAgentEvent) -> bool {
        match event {
            RuntimeAgentEvent::TurnStarted { turn } => {
                let mut recorder_guard = match self.recorder.lock() {
                    Ok(guard) => guard,
                    Err(error) => error.into_inner(),
                };
                if let Some(recorder) = recorder_guard.as_mut() {
                    if recorder.turn_id() != turn.id {
                        match recorder.complete_turn_success() {
                            Ok(events) => {
                                for event in events {
                                    self.emit_runtime_event_directly(event_name, &event);
                                }
                            }
                            Err(error) => {
                                tracing::warn!(
                                    "[execute_skill] 结束上一段 Skill runtime turn 失败，已降级继续: {}",
                                    error
                                );
                            }
                        }
                    }
                }
                match AgentTimelineRecorder::from_started_turn(self.db.clone(), turn.clone()) {
                    Ok(recorder) => {
                        *recorder_guard = Some(recorder);
                        drop(recorder_guard);
                        self.emit_skill_invocation_start(event_name);
                    }
                    Err(error) => {
                        tracing::warn!(
                            "[execute_skill] 创建 Skill runtime timeline 失败，已降级继续: {}",
                            error
                        );
                    }
                }
                false
            }
            RuntimeAgentEvent::ItemStarted { .. }
            | RuntimeAgentEvent::ItemUpdated { .. }
            | RuntimeAgentEvent::ItemCompleted { .. } => {
                self.record_with_existing_recorder(event_name, event)
            }
            RuntimeAgentEvent::ArtifactSnapshot { .. }
            | RuntimeAgentEvent::ContextCompactionStarted { .. }
            | RuntimeAgentEvent::ContextCompactionCompleted { .. }
            | RuntimeAgentEvent::Warning { .. }
            | RuntimeAgentEvent::Error { .. } => {
                self.record_with_existing_recorder(event_name, event);
                false
            }
            _ => false,
        }
    }

    fn record_with_existing_recorder(&self, event_name: &str, event: &RuntimeAgentEvent) -> bool {
        let should_record_skill_item_after_event = matches!(
            event,
            RuntimeAgentEvent::ItemStarted { item }
                | RuntimeAgentEvent::ItemUpdated { item }
                | RuntimeAgentEvent::ItemCompleted { item }
                if matches!(item.payload, AgentThreadItemPayload::UserMessage { .. })
        );

        let mut recorder_guard = match self.recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        let Some(recorder) = recorder_guard.as_mut() else {
            return false;
        };
        if let Err(error) = recorder.record_runtime_event(&self.app_handle, event_name, event, "") {
            tracing::warn!(
                "[execute_skill] 记录 Skill runtime timeline 事件失败，已降级继续: {}",
                error
            );
            return false;
        }
        drop(recorder_guard);
        if should_record_skill_item_after_event {
            self.start_skill_invocation_item(event_name);
        }
        true
    }
}

fn create_skill_event_bridge(
    app_handle: &AppHandle,
    db: &DbConnection,
    skill: &LoadedSkillDefinition,
    execution_id: &str,
) -> SkillRuntimeEventBridge {
    SkillRuntimeEventBridge::new(app_handle, db, skill, execution_id)
}

fn map_execution_error(error: SkillExecutionError) -> String {
    match error {
        SkillExecutionError::SessionInitFailed(message) => {
            format_skill_error(SKILL_ERR_SESSION_INIT_FAILED, message)
        }
    }
}

fn map_execution_result(mut result: SkillExecutionResult) -> SkillExecutionResult {
    if !result.success {
        result.error = result
            .error
            .take()
            .map(|error| ensure_skill_error_code(SKILL_ERR_EXECUTE_FAILED, &error));
    }
    result
}

pub async fn execute_named_skill(
    app_handle: &AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    config_manager: &GlobalConfigManagerState,
    aster_state: &AsterAgentState,
    request: SkillExecutionRequest,
) -> Result<SkillExecutionResult, String> {
    let SkillExecutionRequest {
        skill_name,
        user_input,
        images,
        request_context,
        provider_override,
        model_override,
        execution_id,
        session_id,
    } = request;

    let execution_id = execution_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let session_id = session_id.unwrap_or_else(|| format!("skill-exec-{}", Uuid::new_v4()));
    let tracker = ExecutionTracker::new(db.clone());
    let provider_selection = Arc::new(Mutex::new(None));
    let prepared_request_context =
        prepare_skill_request_context(db, &session_id, &execution_id, request_context, &images);
    let effective_user_input =
        build_skill_user_input(&user_input, prepared_request_context.as_ref());
    let skill_images = build_skill_images(&images);
    let start_metadata = build_skill_run_start_metadata(
        skill_name.as_str(),
        execution_id.as_str(),
        user_input.as_str(),
        provider_override.as_deref(),
        model_override.as_deref(),
    );
    let provider_selection_for_run = Arc::clone(&provider_selection);
    let provider_selection_for_finalize = Arc::clone(&provider_selection);
    let skill_name_for_run = skill_name.clone();
    let execution_id_for_run = execution_id.clone();
    let session_id_for_run = session_id.clone();
    let user_input_for_run = effective_user_input.clone();
    let user_visible_input_for_run = user_input.clone();
    let skill_images_for_run = skill_images.clone();
    let provider_override_for_run = provider_override.clone();
    let model_override_for_run = model_override.clone();
    let skill_name_for_finalize = skill_name.clone();
    let execution_id_for_finalize = execution_id.clone();
    let provider_override_for_finalize = provider_override.clone();
    let model_override_for_finalize = model_override.clone();
    let app_handle = app_handle.clone();
    let db = db.clone();
    let api_key_provider_service = ApiKeyProviderServiceState(api_key_provider_service.0.clone());
    let config_manager = GlobalConfigManagerState(config_manager.0.clone());
    let aster_state = aster_state.clone();

    tracker
        .with_run_custom(
            RunSource::Skill,
            Some(skill_name.clone()),
            Some(session_id.clone()),
            Some(start_metadata),
            async move {
                tracing::info!(
                    "[execute_skill] 开始执行 Skill: name={}, execution_id={}, session_id={}, provider_override={:?}, model_override={:?}",
                    skill_name_for_run,
                    execution_id_for_run,
                    session_id_for_run,
                    provider_override_for_run,
                    model_override_for_run
                );

                let skill = load_executable_skill_definition(&skill_name_for_run)?;
                let prepared = prepare_skill_execution(
                    &app_handle,
                    &db,
                    &api_key_provider_service,
                    &config_manager,
                    &aster_state,
                    &skill,
                    &execution_id_for_run,
                    &session_id_for_run,
                    provider_override_for_run.as_deref(),
                    model_override_for_run.as_deref(),
                )
                .await?;

                if let Ok(mut slot) = provider_selection_for_run.lock() {
                    *slot = Some(prepared.provider_selection.clone());
                } else {
                    tracing::warn!(
                        "[execute_skill] provider 选择状态锁定失败，运行记录将缺少 resolved provider 元数据"
                    );
                }

                execute_skill_definition(
                    &app_handle,
                    &db,
                    &aster_state,
                    &skill,
                    &user_input_for_run,
                    Some(user_visible_input_for_run.as_str()),
                    &skill_images_for_run,
                    &execution_id_for_run,
                    &session_id_for_run,
                    &prepared.callback,
                    prepared.memory_prompt.as_deref(),
                )
                .await
            },
            move |result| {
                let provider_selection = provider_selection_for_finalize
                    .lock()
                    .ok()
                    .and_then(|slot| slot.as_ref().cloned());
                build_skill_run_finish_decision(
                    &skill_name_for_finalize,
                    &execution_id_for_finalize,
                    provider_override_for_finalize.as_deref(),
                    model_override_for_finalize.as_deref(),
                    provider_selection.as_ref(),
                    result,
                )
            },
        )
        .await
}

pub async fn execute_skill_prompt(
    app_handle: &AppHandle,
    db: &DbConnection,
    aster_state: &AsterAgentState,
    skill: &LoadedSkillDefinition,
    user_input: &str,
    user_visible_input: Option<&str>,
    images: &[SkillInputImage],
    execution_id: &str,
    session_id: &str,
    callback: &TauriExecutionCallback,
    memory_prompt: Option<&str>,
) -> Result<SkillExecutionResult, String> {
    let callback_adapter = TauriExecutionCallbackAdapter::new(callback);
    callback_adapter.on_step_start("main", &skill.display_name, 1, 1);
    let event_bridge = create_skill_event_bridge(app_handle, db, skill, execution_id);
    let event_name = format!("skill-exec-{execution_id}");

    let mut result = map_execution_result(
        execute_agent_skill_prompt(SkillPromptExecution {
            aster_state,
            skill,
            user_input,
            user_visible_input,
            images,
            execution_id,
            session_id,
            memory_prompt,
            emitter: event_bridge.emitter(),
        })
        .await
        .map_err(map_execution_error)?,
    );

    if !result.success {
        let error_message = result
            .error
            .clone()
            .unwrap_or_else(|| format_skill_error(SKILL_ERR_EXECUTE_FAILED, "Unknown error"));
        callback_adapter.on_step_error("main", &error_message, false);
        callback_adapter.on_complete(false, None, Some(&error_message));
        event_bridge.finish_current_turn(&event_name, false, Some(&error_message));
        event_bridge.emit_final_done(execution_id);
        return Ok(result);
    }

    let finalized = finalize_skill_output(
        app_handle,
        &skill.skill_name,
        user_visible_input.unwrap_or(user_input),
        execution_id,
        result.output.as_deref().unwrap_or(""),
    );
    extend_unique_artifact_protocol_paths(&mut result.artifact_paths, &finalized.artifact_paths);
    result.output = Some(finalized.final_output.clone());
    if let Some(step_result) = result.steps_completed.get_mut(0) {
        step_result.output = Some(finalized.final_output.clone());
    }

    callback_adapter.on_step_complete("main", &finalized.final_output);
    callback_adapter.on_complete(true, Some(&finalized.final_output), None);
    event_bridge.finish_current_turn(&event_name, true, None);
    event_bridge.emit_final_done(execution_id);
    Ok(result)
}

pub async fn execute_skill_workflow(
    app_handle: &AppHandle,
    db: &DbConnection,
    aster_state: &AsterAgentState,
    skill: &LoadedSkillDefinition,
    user_input: &str,
    user_visible_input: Option<&str>,
    images: &[SkillInputImage],
    execution_id: &str,
    session_id: &str,
    callback: &TauriExecutionCallback,
    memory_prompt: Option<&str>,
) -> Result<SkillExecutionResult, String> {
    let callback_adapter = TauriExecutionCallbackAdapter::new(callback);
    let event_bridge = create_skill_event_bridge(app_handle, db, skill, execution_id);
    let event_name = format!("skill-exec-{execution_id}");
    let result = execute_agent_skill_workflow(SkillWorkflowExecution {
        aster_state,
        skill,
        user_input,
        user_visible_input,
        images,
        execution_id,
        session_id,
        callback: &callback_adapter,
        memory_prompt,
        emitter: event_bridge.emitter(),
    })
    .await
    .map(map_execution_result)
    .map_err(map_execution_error)?;

    event_bridge.finish_current_turn(&event_name, result.success, result.error.as_deref());
    Ok(result)
}

pub async fn execute_skill_definition(
    app_handle: &AppHandle,
    db: &DbConnection,
    aster_state: &AsterAgentState,
    skill: &LoadedSkillDefinition,
    user_input: &str,
    user_visible_input: Option<&str>,
    images: &[SkillInputImage],
    execution_id: &str,
    session_id: &str,
    callback: &TauriExecutionCallback,
    memory_prompt: Option<&str>,
) -> Result<SkillExecutionResult, String> {
    if skill.execution_mode == "workflow" && !skill.workflow_steps.is_empty() {
        execute_skill_workflow(
            app_handle,
            db,
            aster_state,
            skill,
            user_input,
            user_visible_input,
            images,
            execution_id,
            session_id,
            callback,
            memory_prompt,
        )
        .await
    } else {
        execute_skill_prompt(
            app_handle,
            db,
            aster_state,
            skill,
            user_input,
            user_visible_input,
            images,
            execution_id,
            session_id,
            callback,
            memory_prompt,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::models::SkillStandardCompliance;
    use std::collections::HashMap;

    fn test_skill(markdown_content: &str) -> LoadedSkillDefinition {
        let mut metadata = HashMap::new();
        metadata.insert("lime_version".to_string(), "1.0.1".to_string());

        LoadedSkillDefinition {
            skill_name: "analysis".to_string(),
            display_name: "analysis".to_string(),
            description: "分析任务".to_string(),
            local_directory_path: std::path::PathBuf::from("/tmp/analysis"),
            markdown_content: markdown_content.to_string(),
            license: None,
            compatibility: None,
            metadata,
            allowed_tools: None,
            argument_hint: None,
            when_to_use: None,
            when_to_use_config: None,
            model: None,
            provider: None,
            disable_model_invocation: false,
            execution_mode: "prompt".to_string(),
            workflow_ref: None,
            workflow_steps: Vec::new(),
            standard_compliance: SkillStandardCompliance {
                is_standard: true,
                validation_errors: Vec::new(),
                deprecated_fields: Vec::new(),
            },
        }
    }

    #[test]
    fn skill_invocation_trace_metadata_should_include_skill_markdown_snapshot() {
        let markdown_content = "---\nname: analysis\n---\n\n# Analysis Skill\n\n必须先读取本文件。";
        let skill = test_skill(markdown_content);
        let trace = SkillInvocationTrace::new(&skill, "exec-1");

        let metadata = trace.metadata();

        assert_eq!(
            metadata
                .get("skill_source")
                .and_then(serde_json::Value::as_str),
            Some("SKILL.md")
        );
        assert_eq!(
            metadata
                .get("skill_markdown_content")
                .and_then(serde_json::Value::as_str),
            Some(markdown_content)
        );
        assert_eq!(
            metadata
                .get("markdown_content_bytes")
                .and_then(serde_json::Value::as_u64),
            Some(markdown_content.len() as u64)
        );
    }
}

pub use lime_agent::{SkillExecutionResult, StepResult};
