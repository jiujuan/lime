//! Agent 命令模块
//!
//! 提供 Agent 的进程与标题相关 Tauri 命令

use crate::agent::{
    build_auxiliary_session_config_with_turn_context, AsterAgentState, AsterAgentWrapper,
};
use crate::commands::aster_agent_cmd::ensure_browser_mcp_tools_registered;
use crate::commands::auxiliary_model_selection::{
    build_auxiliary_runtime_metadata, build_auxiliary_turn_context_override,
    prepare_auxiliary_provider_scope, AuxiliaryServiceModelSlot,
};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::services::runtime_auxiliary_projection_service::{
    project_auxiliary_runtime_to_parent_session, AuxiliaryRuntimeProjectionInput,
    AuxiliaryRuntimeProjectionResult,
};
use aster::conversation::message::Message;
use futures::StreamExt;
use lime_agent::merge_system_prompt_with_runtime_agents;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt::Display;
use std::future::Future;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, State};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const TITLE_GENERATION_THREAD_STACK_SIZE: usize = 8 * 1024 * 1024;
const TITLE_GENERATION_RUNTIME_SHUTDOWN_TIMEOUT_SECS: u64 = 2;
const TITLE_GENERATION_TOTAL_TIMEOUT_SECS: u64 = 45;
const TITLE_GENERATION_STREAM_START_TIMEOUT_SECS: u64 = 20;
const TITLE_GENERATION_STREAM_IDLE_TIMEOUT_SECS: u64 = 20;
const TITLE_GENERATION_QUEUE_TIMEOUT_SECS: u64 = 2;
const TITLE_GENERATION_MAX_CONCURRENCY: usize = 2;

const TITLE_FALLBACK_PROVIDER_CHAIN: [(&str, &str); 3] = [
    ("deepseek", "deepseek-chat"),
    ("openai", "gpt-4o-mini"),
    ("anthropic", "claude-3-haiku-20240307"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentGeneratedTitleResult {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_runtime: Option<lime_agent::SessionExecutionRuntime>,
    #[serde(default)]
    pub used_fallback: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_reason: Option<String>,
}

/// 安全截断字符串，确保不会在多字节字符中间切割
///
/// # 参数
/// - `s`: 要截断的字符串
/// - `max_chars`: 最大字符数（按 Unicode 字符计算，非字节）
///
/// # 返回
/// 截断后的字符串，如果被截断则添加 "..." 后缀
fn truncate_string(s: &str, max_chars: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max_chars {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_chars).collect();
        format!("{truncated}...")
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn strip_code_fence(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("```text")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string()
}

fn normalize_generated_title(value: &str) -> Option<String> {
    let normalized_content = strip_code_fence(value);
    let first_line = normalized_content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    let normalized = first_line
        .trim_start_matches("标题：")
        .trim_start_matches("标题:")
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim_matches('《')
        .trim_matches('》')
        .trim_matches('【')
        .trim_matches('】')
        .trim_matches('「')
        .trim_matches('」')
        .trim_matches('`')
        .trim();
    if normalized.is_empty() {
        None
    } else {
        Some(truncate_string(normalized, 18))
    }
}

fn build_session_title_source_text(
    messages: &[lime_agent::SessionTitlePreviewMessage],
) -> Option<String> {
    let normalized = messages
        .iter()
        .filter_map(|message| {
            let content = message.content.trim();
            if content.is_empty() {
                None
            } else {
                Some(format!("{}：{}", message.role, content))
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    normalize_optional_text(Some(normalized)).map(|value| truncate_string(&value, 1200))
}

fn build_fallback_title(source_text: &str, title_kind: &str) -> String {
    let normalized_source = source_text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(source_text)
        .trim();
    if normalized_source.is_empty() {
        return if title_kind == "image_task" {
            "图片任务".to_string()
        } else {
            "新话题".to_string()
        };
    }

    truncate_string(normalized_source, 15)
}

fn build_title_generation_system_prompt(title_kind: &str) -> String {
    if title_kind == "image_task" {
        [
            "你是 Lime 的图片任务命名助手。",
            "请根据给定的图片生成需求，生成一个简洁清晰的中文标题。",
            "要求：",
            "1. 标题控制在 6 到 18 个中文字符之间。",
            "2. 优先体现主体、场景或用途，不要空泛复述“图片任务”“配图”。",
            "3. 不要加引号、句号、编号、解释或 markdown。",
            "4. 只输出标题本身。",
        ]
        .join("\n")
    } else {
        [
            "你是 Lime 的会话命名助手。",
            "请根据给定的对话摘要生成一个简洁清晰的中文标题。",
            "要求：",
            "1. 标题控制在 6 到 18 个中文字符之间。",
            "2. 优先体现任务目标或讨论主题，不要泛泛写“新话题”“继续对话”。",
            "3. 不要加引号、句号、编号、解释或 markdown。",
            "4. 只输出标题本身。",
        ]
        .join("\n")
    }
}

fn force_direct_answer_tool_surface(metadata: &mut Option<Value>) {
    let Some(Value::Object(root)) = metadata else {
        return;
    };
    let Some(Value::Object(runtime_metadata)) = root.get_mut("lime_runtime") else {
        return;
    };

    runtime_metadata.insert(
        "tool_surface".to_string(),
        Value::String("direct_answer".to_string()),
    );
}

#[derive(Debug, Clone, Copy)]
struct TitleGenerationLimits {
    total_timeout: Duration,
    stream_start_timeout: Duration,
    stream_idle_timeout: Duration,
}

impl TitleGenerationLimits {
    fn production() -> Self {
        Self {
            total_timeout: Duration::from_secs(TITLE_GENERATION_TOTAL_TIMEOUT_SECS),
            stream_start_timeout: Duration::from_secs(TITLE_GENERATION_STREAM_START_TIMEOUT_SECS),
            stream_idle_timeout: Duration::from_secs(TITLE_GENERATION_STREAM_IDLE_TIMEOUT_SECS),
        }
    }

    #[cfg(test)]
    fn new(
        total_timeout: Duration,
        stream_start_timeout: Duration,
        stream_idle_timeout: Duration,
    ) -> Self {
        Self {
            total_timeout,
            stream_start_timeout,
            stream_idle_timeout,
        }
    }
}

struct TitleGenerationCancelOnDrop {
    token: CancellationToken,
}

impl TitleGenerationCancelOnDrop {
    fn new(token: CancellationToken) -> Self {
        Self { token }
    }
}

impl Drop for TitleGenerationCancelOnDrop {
    fn drop(&mut self) {
        self.token.cancel();
    }
}

fn title_generation_semaphore() -> Arc<Semaphore> {
    static TITLE_GENERATION_SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();
    TITLE_GENERATION_SEMAPHORE
        .get_or_init(|| Arc::new(Semaphore::new(TITLE_GENERATION_MAX_CONCURRENCY)))
        .clone()
}

async fn acquire_title_generation_permit() -> Result<OwnedSemaphorePermit, String> {
    let semaphore = title_generation_semaphore();
    match tokio::time::timeout(
        Duration::from_secs(TITLE_GENERATION_QUEUE_TIMEOUT_SECS),
        semaphore.acquire_owned(),
    )
    .await
    {
        Ok(Ok(permit)) => Ok(permit),
        Ok(Err(_)) => Err("标题生成并发队列已关闭".to_string()),
        Err(_) => Err(format!(
            "标题生成繁忙，等待超过 {} 后已降级",
            format_title_generation_duration(Duration::from_secs(
                TITLE_GENERATION_QUEUE_TIMEOUT_SECS
            ))
        )),
    }
}

fn format_title_generation_duration(duration: Duration) -> String {
    if duration.as_secs() > 0 {
        format!("{}秒", duration.as_secs())
    } else {
        format!("{}毫秒", duration.as_millis())
    }
}

fn title_generation_timeout_error(kind: &str, timeout: Duration) -> String {
    format!(
        "标题生成{}超时（{}）",
        kind,
        format_title_generation_duration(timeout)
    )
}

fn title_generation_remaining_total(
    started_at: Instant,
    limits: TitleGenerationLimits,
) -> Option<Duration> {
    match limits.total_timeout.checked_sub(started_at.elapsed()) {
        Some(remaining) if !remaining.is_zero() => Some(remaining),
        _ => None,
    }
}

async fn await_title_generation_stream_start<F, S, E>(
    stream_future: F,
    cancel_token: CancellationToken,
    started_at: Instant,
    limits: TitleGenerationLimits,
) -> Result<S, String>
where
    F: Future<Output = Result<S, E>>,
    E: Display,
{
    let Some(remaining_total) = title_generation_remaining_total(started_at, limits) else {
        cancel_token.cancel();
        return Err(title_generation_timeout_error(
            "总耗时",
            limits.total_timeout,
        ));
    };
    let wait_timeout = remaining_total.min(limits.stream_start_timeout);
    let is_total_timeout = remaining_total <= limits.stream_start_timeout;

    match tokio::time::timeout(wait_timeout, stream_future).await {
        Ok(Ok(stream)) => Ok(stream),
        Ok(Err(error)) => Err(format!("标题生成失败: {error}")),
        Err(_) => {
            cancel_token.cancel();
            let timeout_kind = if is_total_timeout {
                "总耗时"
            } else {
                "建流"
            };
            let timeout_value = if is_total_timeout {
                limits.total_timeout
            } else {
                limits.stream_start_timeout
            };
            Err(title_generation_timeout_error(timeout_kind, timeout_value))
        }
    }
}

async fn collect_title_from_agent_events<S, E>(
    stream: S,
    cancel_token: CancellationToken,
    started_at: Instant,
    limits: TitleGenerationLimits,
) -> Result<String, String>
where
    S: futures::Stream<Item = Result<aster::agents::AgentEvent, E>>,
    E: Display,
{
    let mut full_content = String::new();
    tokio::pin!(stream);

    loop {
        let Some(remaining_total) = title_generation_remaining_total(started_at, limits) else {
            cancel_token.cancel();
            return Err(title_generation_timeout_error(
                "总耗时",
                limits.total_timeout,
            ));
        };
        let wait_timeout = remaining_total.min(limits.stream_idle_timeout);
        let is_total_timeout = remaining_total <= limits.stream_idle_timeout;

        let mut pinned_stream = stream.as_mut();
        let next_event = tokio::select! {
            biased;
            _ = cancel_token.cancelled() => return Err("标题生成已取消".to_string()),
            event = pinned_stream.next() => event,
            _ = tokio::time::sleep(wait_timeout) => {
                cancel_token.cancel();
                let timeout_kind = if is_total_timeout { "总耗时" } else { "流式响应空闲" };
                let timeout_value = if is_total_timeout {
                    limits.total_timeout
                } else {
                    limits.stream_idle_timeout
                };
                return Err(title_generation_timeout_error(timeout_kind, timeout_value));
            }
        };

        let Some(event_result) = next_event else {
            break;
        };

        match event_result {
            Ok(agent_event) => {
                if let aster::agents::AgentEvent::Message(message) = agent_event {
                    for content in &message.content {
                        if let aster::conversation::message::MessageContent::Text(text_content) =
                            content
                        {
                            full_content.push_str(&text_content.text);
                        }
                    }
                }
            }
            Err(error) => {
                cancel_token.cancel();
                return Err(format!("标题生成流式事件失败: {error}"));
            }
        }
    }

    normalize_generated_title(&full_content).ok_or_else(|| "标题生成返回为空".to_string())
}

/// 标题生成复用完整 Agent/Provider 链路，隔离到 8MB 专用线程避免压穿默认 tokio worker 栈。
async fn run_title_generation_on_dedicated_runtime<F, T>(
    thread_label: String,
    future: F,
) -> Result<T, String>
where
    F: Future<Output = Result<T, String>> + Send + 'static,
    T: Send + 'static,
{
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let thread_name = format!("lime-title-generation-{thread_label}");
    let spawn_result = std::thread::Builder::new()
        .name(thread_name)
        .stack_size(TITLE_GENERATION_THREAD_STACK_SIZE)
        .spawn(move || {
            let result = match tokio::runtime::Builder::new_current_thread()
                .enable_io()
                .enable_time()
                .build()
            {
                Ok(runtime) => {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        runtime.block_on(future)
                    }))
                    .unwrap_or_else(|_| Err("标题生成专用线程发生 panic".to_string()));
                    runtime.shutdown_timeout(Duration::from_secs(
                        TITLE_GENERATION_RUNTIME_SHUTDOWN_TIMEOUT_SECS,
                    ));
                    result
                }
                Err(error) => Err(format!("创建标题生成专用运行时失败: {error}")),
            };
            let _ = sender.send(result);
        });

    if let Err(error) = spawn_result {
        return Err(format!("启动标题生成专用线程失败: {error}"));
    }

    receiver
        .await
        .map_err(|_| "标题生成专用线程异常退出".to_string())?
}

async fn generate_title_with_agent(
    agent_state: &AsterAgentState,
    db: &DbConnection,
    config_manager: &GlobalConfigManagerState,
    session_id: &str,
    title_kind: &str,
    source_text: &str,
) -> Result<String, String> {
    let limits = TitleGenerationLimits::production();
    let provider_scope = prepare_auxiliary_provider_scope(
        agent_state,
        db,
        config_manager,
        session_id,
        if title_kind == "image_task" {
            AuxiliaryServiceModelSlot::GenerationTopic
        } else {
            AuxiliaryServiceModelSlot::Topic
        },
        &TITLE_FALLBACK_PROVIDER_CHAIN,
    )
    .await?;

    let cancel_token = agent_state.create_cancel_token(session_id).await;
    let cancel_on_drop = TitleGenerationCancelOnDrop::new(cancel_token.clone());
    let result = async {
        let base_runtime_prompt = merge_system_prompt_with_runtime_agents(None, None);
        let system_prompt = match base_runtime_prompt {
            Some(base_prompt) => Some(format!(
                "{base_prompt}\n\n{}",
                build_title_generation_system_prompt(title_kind)
            )),
            None => Some(build_title_generation_system_prompt(title_kind)),
        };
        let mut auxiliary_runtime_metadata = build_auxiliary_runtime_metadata(
            provider_scope.resolution(),
            if title_kind == "image_task" {
                "auxiliary_generation_topic"
            } else {
                "auxiliary_title_generation"
            },
            Some(if title_kind == "image_task" {
                "image_task"
            } else {
                "session_title"
            }),
            if title_kind == "image_task" {
                &[
                    "service_model_slot",
                    "internal_turn",
                    "auxiliary_session",
                    "vision_input",
                ]
            } else {
                &["service_model_slot", "internal_turn", "auxiliary_session"]
            },
            &["当前为内部标题生成辅助任务，只会使用一条已解析的 provider/model 路线。"],
        );
        force_direct_answer_tool_surface(&mut auxiliary_runtime_metadata);
        let session_config = build_auxiliary_session_config_with_turn_context(
            session_id,
            system_prompt,
            false,
            build_auxiliary_turn_context_override(auxiliary_runtime_metadata),
        );
        let user_message = Message::user().with_text(source_text);

        let agent_arc = agent_state.get_agent_arc();
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent 未初始化")?;
        let started_at = Instant::now();
        let stream = await_title_generation_stream_start(
            agent.reply(user_message, session_config, Some(cancel_token.clone())),
            cancel_token.clone(),
            started_at,
            limits,
        )
        .await?;

        collect_title_from_agent_events(stream, cancel_token.clone(), started_at, limits).await
    }
    .await;

    drop(cancel_on_drop);
    agent_state.remove_cancel_token(session_id).await;
    provider_scope.restore(agent_state, db).await;
    result
}

/// 生成智能标题
///
/// 根据对话内容生成一个简洁的标题
#[tauri::command]
pub async fn agent_generate_title(
    app: AppHandle,
    agent_state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    config_manager: State<'_, GlobalConfigManagerState>,
    session_id: Option<String>,
    preview_text: Option<String>,
    title_kind: Option<String>,
) -> Result<AgentGeneratedTitleResult, String> {
    let resolved_title_kind =
        normalize_optional_text(title_kind).unwrap_or_else(|| "session".to_string());
    let resolved_preview_text = normalize_optional_text(preview_text);
    let resolved_session_id = normalize_optional_text(session_id);
    let source_text = if let Some(preview_text) = resolved_preview_text {
        preview_text
    } else if let Some(session_id) = resolved_session_id.as_deref() {
        let messages = AsterAgentWrapper::list_title_preview_messages_sync(&db, session_id, 6)?;
        build_session_title_source_text(&messages)
            .ok_or_else(|| "当前会话还没有足够的内容用于生成标题".to_string())?
    } else {
        return Err("缺少生成标题所需的内容".to_string());
    };

    agent_state.init_agent_with_db(&db).await?;
    ensure_browser_mcp_tools_registered(agent_state.inner(), &db).await?;
    let auxiliary_session_id = format!("title-gen-{}", Uuid::new_v4());

    let title_result = match acquire_title_generation_permit().await {
        Ok(_permit) => {
            run_title_generation_on_dedicated_runtime(auxiliary_session_id.clone(), {
                let agent_state = agent_state.inner().clone();
                let db = db.inner().clone();
                let config_manager = GlobalConfigManagerState(config_manager.0.clone());
                let auxiliary_session_id = auxiliary_session_id.clone();
                let resolved_title_kind = resolved_title_kind.clone();
                let source_text = source_text.clone();
                async move {
                    generate_title_with_agent(
                        &agent_state,
                        &db,
                        &config_manager,
                        &auxiliary_session_id,
                        &resolved_title_kind,
                        &source_text,
                    )
                    .await
                }
            })
            .await
        }
        Err(error) => Err(error),
    };
    let execution_runtime =
        AsterAgentWrapper::get_runtime_session_execution_runtime(&db, &auxiliary_session_id).await;

    let result = match title_result {
        Ok(title) => AgentGeneratedTitleResult {
            title,
            session_id: Some(auxiliary_session_id),
            execution_runtime,
            used_fallback: false,
            fallback_reason: None,
        },
        Err(error) => {
            tracing::warn!(
                "[AgentTitle] 智能标题生成失败，已回退摘要标题: kind={}, error={}",
                resolved_title_kind,
                error
            );
            AgentGeneratedTitleResult {
                title: build_fallback_title(&source_text, &resolved_title_kind),
                session_id: Some(auxiliary_session_id),
                execution_runtime,
                used_fallback: true,
                fallback_reason: Some(error),
            }
        }
    };

    if let (Some(parent_session_id), Some(auxiliary_session_id)) =
        (resolved_session_id.as_deref(), result.session_id.as_deref())
    {
        if let Err(error) = project_auxiliary_runtime_to_parent_session(
            &app,
            &db,
            AuxiliaryRuntimeProjectionInput {
                parent_session_id: parent_session_id.to_string(),
                auxiliary_session_id: auxiliary_session_id.to_string(),
                execution_runtime: result.execution_runtime.clone(),
                result: AuxiliaryRuntimeProjectionResult::TitleGeneration {
                    title: result.title.clone(),
                    used_fallback: result.used_fallback,
                    fallback_reason: result.fallback_reason.clone(),
                },
            },
        )
        .await
        {
            tracing::warn!(
                "[AgentTitle] 投影父会话辅助运行时失败，已降级继续: parent_session_id={}, auxiliary_session_id={}, error={}",
                parent_session_id,
                auxiliary_session_id,
                error
            );
        }
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn force_direct_answer_tool_surface_marks_auxiliary_runtime() {
        let mut metadata = Some(json!({
            "lime_runtime": {
                "task_profile": {
                    "kind": "title_generation"
                }
            }
        }));

        force_direct_answer_tool_surface(&mut metadata);

        assert_eq!(
            metadata
                .as_ref()
                .and_then(|value| value.get("lime_runtime"))
                .and_then(|value| value.get("tool_surface"))
                .and_then(Value::as_str),
            Some("direct_answer")
        );
    }

    #[tokio::test]
    async fn title_generation_dedicated_runtime_runs_future() {
        let thread_name =
            run_title_generation_on_dedicated_runtime("unit-test".to_string(), async {
                tokio::time::sleep(std::time::Duration::from_millis(1)).await;
                Ok::<_, String>(
                    std::thread::current()
                        .name()
                        .unwrap_or("missing-thread-name")
                        .to_string(),
                )
            })
            .await
            .expect("dedicated title runtime should run future");

        assert!(thread_name.starts_with("lime-title-generation-unit-test"));
    }

    #[tokio::test]
    async fn title_generation_dedicated_runtime_preserves_error() {
        let error =
            run_title_generation_on_dedicated_runtime("unit-test-error".to_string(), async {
                Err::<(), _>("boom".to_string())
            })
            .await
            .expect_err("dedicated title runtime should return future error");

        assert_eq!(error, "boom");
    }

    #[tokio::test]
    async fn title_generation_collects_first_message_text() {
        let cancel_token = CancellationToken::new();
        let stream = futures::stream::iter([Ok::<_, String>(aster::agents::AgentEvent::Message(
            Message::assistant().with_text("「崩溃诊断」\n"),
        ))]);

        let title = collect_title_from_agent_events(
            stream,
            cancel_token,
            Instant::now(),
            TitleGenerationLimits::new(
                Duration::from_millis(100),
                Duration::from_millis(50),
                Duration::from_millis(50),
            ),
        )
        .await
        .expect("title should be normalized from stream text");

        assert_eq!(title, "崩溃诊断");
    }

    #[tokio::test]
    async fn title_generation_idle_timeout_cancels_stream() {
        let cancel_token = CancellationToken::new();
        let stream = futures::stream::pending::<Result<aster::agents::AgentEvent, String>>();

        let error = collect_title_from_agent_events(
            stream,
            cancel_token.clone(),
            Instant::now(),
            TitleGenerationLimits::new(
                Duration::from_millis(100),
                Duration::from_millis(50),
                Duration::from_millis(5),
            ),
        )
        .await
        .expect_err("idle stream should time out");

        assert!(error.contains("流式响应空闲超时"));
        assert!(cancel_token.is_cancelled());
    }

    #[tokio::test]
    async fn title_generation_stream_start_timeout_cancels_request() {
        let cancel_token = CancellationToken::new();
        let pending_stream_start = futures::future::pending::<
            Result<futures::stream::Empty<Result<(), String>>, String>,
        >();

        let error = await_title_generation_stream_start(
            pending_stream_start,
            cancel_token.clone(),
            Instant::now(),
            TitleGenerationLimits::new(
                Duration::from_millis(100),
                Duration::from_millis(5),
                Duration::from_millis(50),
            ),
        )
        .await
        .expect_err("pending stream start should time out");

        assert!(error.contains("建流超时"));
        assert!(cancel_token.is_cancelled());
    }

    #[test]
    fn title_generation_cancel_guard_cancels_on_drop() {
        let token = CancellationToken::new();

        {
            let _guard = TitleGenerationCancelOnDrop::new(token.clone());
            assert!(!token.is_cancelled());
        }

        assert!(token.is_cancelled());
    }
}
