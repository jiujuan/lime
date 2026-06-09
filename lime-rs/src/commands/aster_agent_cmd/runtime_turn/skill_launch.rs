use super::runtime_turn_agent_app_skill_contract::{
    build_agent_app_required_skill_tool_params, resolve_agent_app_required_skill_contract,
};
use super::*;
use aster::providers::base::Provider;

pub(super) trait RuntimeSideEventPort: Send + Sync {
    fn emit_runtime_event(&self, event_name: &str, event: &RuntimeAgentEvent, error_label: &str);
}

pub(super) trait RuntimeTimelineEventPort: Send + Sync {
    fn record_runtime_event(&self, event: &RuntimeAgentEvent) -> Result<(), String>;

    fn record_request_user_input(
        &self,
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        questions: Option<Vec<lime_core::database::dao::agent_timeline::AgentRequestQuestion>>,
    ) -> Result<(), String>;
}

#[derive(Clone)]
pub(super) struct TauriRuntimeSideEventPort {
    app: AppHandle,
}

impl TauriRuntimeSideEventPort {
    pub(super) fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl RuntimeSideEventPort for TauriRuntimeSideEventPort {
    fn emit_runtime_event(&self, event_name: &str, event: &RuntimeAgentEvent, error_label: &str) {
        if let Err(error) = self.app.emit(event_name, event) {
            tracing::warn!("[AsterAgent] {}: {}", error_label, error);
        }
        let projection_port = TauriRuntimeProjectionEventPort::new(&self.app);
        emit_agent_app_runtime_event_projection_with_port(&projection_port, event_name, event);
    }
}

pub(super) struct TauriRuntimeTimelineEventPort<'a> {
    app: &'a AppHandle,
    event_name: &'a str,
    timeline_recorder: &'a Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &'a str,
}

impl<'a> TauriRuntimeTimelineEventPort<'a> {
    pub(super) fn new(
        app: &'a AppHandle,
        event_name: &'a str,
        timeline_recorder: &'a Arc<Mutex<AgentTimelineRecorder>>,
        workspace_root: &'a str,
    ) -> Self {
        Self {
            app,
            event_name,
            timeline_recorder,
            workspace_root,
        }
    }
}

impl RuntimeTimelineEventPort for TauriRuntimeTimelineEventPort<'_> {
    fn record_runtime_event(&self, event: &RuntimeAgentEvent) -> Result<(), String> {
        let mut recorder = match self.timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.record_runtime_event(self.app, self.event_name, event, self.workspace_root)
    }

    fn record_request_user_input(
        &self,
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        questions: Option<Vec<lime_core::database::dao::agent_timeline::AgentRequestQuestion>>,
    ) -> Result<(), String> {
        let mut recorder = match self.timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.record_request_user_input(
            self.app,
            self.event_name,
            request_id,
            action_type,
            prompt,
            questions,
        )
    }
}

#[derive(Clone)]
pub(super) struct RuntimeSideEventHostContext<'a> {
    app: &'a AppHandle,
    event_port: Arc<dyn RuntimeSideEventPort + 'a>,
    timeline_port: Arc<dyn RuntimeTimelineEventPort + 'a>,
    event_name: &'a str,
    workspace_root: &'a str,
}

pub(super) type RuntimeSkillLaunchHostContext<'a> = RuntimeSideEventHostContext<'a>;

impl<'a> RuntimeSideEventHostContext<'a> {
    pub(super) fn new(
        app: &'a AppHandle,
        event_name: &'a str,
        timeline_recorder: &'a Arc<Mutex<AgentTimelineRecorder>>,
        workspace_root: &'a str,
    ) -> Self {
        Self::with_event_port(
            app,
            Arc::new(TauriRuntimeSideEventPort::new(app.clone())),
            Arc::new(TauriRuntimeTimelineEventPort::new(
                app,
                event_name,
                timeline_recorder,
                workspace_root,
            )),
            event_name,
            workspace_root,
        )
    }

    pub(super) fn with_event_port(
        app: &'a AppHandle,
        event_port: Arc<dyn RuntimeSideEventPort + 'a>,
        timeline_port: Arc<dyn RuntimeTimelineEventPort + 'a>,
        event_name: &'a str,
        workspace_root: &'a str,
    ) -> Self {
        Self {
            app,
            event_port,
            timeline_port,
            event_name,
            workspace_root,
        }
    }

    pub(super) fn emit_side_event(&self, event: RuntimeAgentEvent) {
        if let Err(error) = self.timeline_port.record_runtime_event(&event) {
            tracing::warn!(
                "[AsterAgent] 记录 Artifact 运行时事件失败（已降级继续）: {}",
                error
            );
        }

        self.event_port
            .emit_runtime_event(self.event_name, &event, "发送 Artifact 运行时事件失败");
    }

    pub(super) fn record_request_user_input(
        &self,
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        questions: Option<Vec<lime_core::database::dao::agent_timeline::AgentRequestQuestion>>,
    ) -> Result<(), String> {
        self.timeline_port
            .record_request_user_input(request_id, action_type, prompt, questions)
    }

    pub(super) fn workspace_root(&self) -> &str {
        self.workspace_root
    }

    fn build_tool_context(
        &self,
        session_id: &str,
        thread_id: &str,
        turn_id: &str,
        project_id: Option<&str>,
        content_id: Option<&str>,
    ) -> ToolContext {
        build_image_skill_launch_tool_context(
            self.workspace_root,
            session_id,
            thread_id,
            turn_id,
            project_id,
            content_id,
        )
    }
}

pub(super) fn emit_service_skill_preload_runtime_events(
    host: RuntimeSkillLaunchHostContext<'_>,
    execution: &ServiceSkillLaunchPreloadExecution,
) {
    let projection = match build_service_skill_preload_tool_projection(execution) {
        Ok(projection) => projection,
        Err(error) => {
            tracing::warn!(
                "[AsterAgent] 构造站点技能预执行投影事件失败，已降级跳过可视过程: {}",
                error
            );
            return;
        }
    };

    host.emit_side_event(RuntimeAgentEvent::ToolStart {
        tool_name: projection.tool_name.clone(),
        tool_id: projection.tool_id.clone(),
        arguments: Some(projection.arguments),
    });
    host.emit_side_event(RuntimeAgentEvent::ToolEnd {
        tool_id: projection.tool_id,
        result: projection.result,
    });
}

pub(super) fn build_image_skill_launch_tool_context(
    workspace_root: &str,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    project_id: Option<&str>,
    content_id: Option<&str>,
) -> ToolContext {
    let mut environment = HashMap::new();
    environment.insert("LIME_THREAD_ID".to_string(), thread_id.to_string());
    environment.insert("PROXYCAST_THREAD_ID".to_string(), thread_id.to_string());
    environment.insert("LIME_TURN_ID".to_string(), turn_id.to_string());
    environment.insert("PROXYCAST_TURN_ID".to_string(), turn_id.to_string());
    if let Some(project_id) = project_id.map(str::trim).filter(|value| !value.is_empty()) {
        environment.insert("LIME_PROJECT_ID".to_string(), project_id.to_string());
        environment.insert("PROXYCAST_PROJECT_ID".to_string(), project_id.to_string());
    }
    if let Some(content_id) = content_id.map(str::trim).filter(|value| !value.is_empty()) {
        environment.insert("LIME_CONTENT_ID".to_string(), content_id.to_string());
        environment.insert("PROXYCAST_CONTENT_ID".to_string(), content_id.to_string());
    }

    ToolContext::new(Path::new(workspace_root).to_path_buf())
        .with_session_id(session_id.to_string())
        .with_environment(environment)
}

pub(super) fn attach_provider_to_tool_context(
    context: ToolContext,
    provider: Option<Arc<dyn Provider>>,
) -> ToolContext {
    match provider {
        Some(provider) => context.with_provider(provider),
        None => context,
    }
}

pub(super) fn agent_app_required_skill_tool_display_name(skill_name: &str) -> String {
    let skill_name = skill_name.trim();
    if skill_name.is_empty() {
        "Skill".to_string()
    } else {
        format!("Skill({skill_name})")
    }
}

pub(super) fn agent_app_required_skill_tool_id(
    turn_id: &str,
    skill_name: &str,
    index: usize,
) -> String {
    let normalized = skill_name
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let suffix = if normalized.is_empty() {
        format!("skill-{index}")
    } else {
        normalized
    };
    format!("agent-app-required-skill:{turn_id}:{index}:{suffix}")
}

pub(super) fn agent_app_required_skill_agent_tool_result(
    skill_name: &str,
    source: &str,
    tool_result: aster::tools::ToolResult,
) -> lime_agent::AgentToolResult {
    let success = tool_result.success;
    let output = tool_result.output.unwrap_or_default();
    let error = tool_result.error;
    let mut metadata = tool_result.metadata;
    let tool_name = agent_app_required_skill_tool_display_name(skill_name);
    metadata
        .entry("toolName".to_string())
        .or_insert_with(|| serde_json::json!(tool_name));
    metadata
        .entry("tool_family".to_string())
        .or_insert_with(|| serde_json::json!("skill"));
    metadata
        .entry("skill_name".to_string())
        .or_insert_with(|| serde_json::json!(skill_name.trim()));
    metadata
        .entry("command_name".to_string())
        .or_insert_with(|| serde_json::json!(skill_name.trim()));
    metadata.insert(
        "agent_app_required_skill_contract".to_string(),
        serde_json::json!(true),
    );
    metadata.insert(
        "agent_app_required_skill_source".to_string(),
        serde_json::json!(source),
    );

    lime_agent::AgentToolResult {
        success,
        output,
        error,
        images: None,
        metadata: Some(metadata),
    }
}

pub(super) fn agent_app_required_skill_failed_tool_result(
    skill_name: &str,
    source: &str,
    error: &str,
) -> lime_agent::AgentToolResult {
    lime_agent::AgentToolResult {
        success: false,
        output: String::new(),
        error: Some(error.to_string()),
        images: None,
        metadata: Some(HashMap::from([
            (
                "toolName".to_string(),
                serde_json::json!(agent_app_required_skill_tool_display_name(skill_name)),
            ),
            ("tool_family".to_string(), serde_json::json!("skill")),
            (
                "skill_name".to_string(),
                serde_json::json!(skill_name.trim()),
            ),
            (
                "command_name".to_string(),
                serde_json::json!(skill_name.trim()),
            ),
            (
                "agent_app_required_skill_contract".to_string(),
                serde_json::json!(true),
            ),
            (
                "agent_app_required_skill_source".to_string(),
                serde_json::json!(source),
            ),
            (
                "skill".to_string(),
                serde_json::json!({
                    "success": false,
                    "error": error,
                    "stepsCompleted": [],
                }),
            ),
        ])),
    }
}

pub(super) async fn execute_agent_app_required_skill_contract(
    host: RuntimeSkillLaunchHostContext<'_>,
    agent: &Agent,
    request: &AsterChatRequest,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    request_metadata: Option<&serde_json::Value>,
) -> Result<(), String> {
    let Some((skill_contract, required_skill_names)) =
        resolve_agent_app_required_skill_contract(request_metadata)
    else {
        return Ok(());
    };
    let tool = lime_agent::tools::LimeSkillTool::new();
    let context = host.build_tool_context(
        session_id,
        thread_id,
        turn_id,
        request.project_id.as_deref(),
        None,
    );
    let context = attach_provider_to_tool_context(context, agent.provider().await.ok());
    let source = "agent_app_required_skill_contract_preexecution";

    for (index, skill_name) in required_skill_names.iter().enumerate() {
        let tool_id = agent_app_required_skill_tool_id(turn_id, skill_name, index);
        let params = build_agent_app_required_skill_tool_params(
            request_metadata,
            &skill_contract,
            skill_name,
            index,
            session_id,
            thread_id,
            turn_id,
        );
        host.emit_side_event(RuntimeAgentEvent::ToolStart {
            tool_name: agent_app_required_skill_tool_display_name(skill_name),
            tool_id: tool_id.clone(),
            arguments: serde_json::to_string(&params).ok(),
        });

        let result = tool.execute(params, &context).await;
        match result {
            Ok(tool_result) => {
                let agent_result =
                    agent_app_required_skill_agent_tool_result(skill_name, source, tool_result);
                let success = agent_result.success;
                let error = agent_result.error.clone();
                host.emit_side_event(RuntimeAgentEvent::ToolEnd {
                    tool_id,
                    result: agent_result,
                });
                if !success {
                    return Err(format!(
                        "Agent App required Skill({}) 执行失败: {}",
                        skill_name,
                        error.unwrap_or_else(|| "unknown error".to_string())
                    ));
                }
            }
            Err(error) => {
                let message = format!(
                    "Agent App required Skill({}) 执行失败: {}",
                    skill_name, error
                );
                host.emit_side_event(RuntimeAgentEvent::ToolEnd {
                    tool_id,
                    result: agent_app_required_skill_failed_tool_result(
                        skill_name, source, &message,
                    ),
                });
                return Err(message);
            }
        }
    }

    Ok(())
}
