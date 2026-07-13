//! 配置 provider 的 current 回合适配器。
//!
//! provider 网络协议由 `model-provider` lower，采样和 tool-result transcript 由
//! `agent-runtime::provider_turn` 维护；本模块只连接 Lime 的动态工具注册表、MCP
//! registry 和 App Server 已消费的事件协议。这里不依赖 Agent。

use crate::credential_bridge::ConfiguredReplyProvider;
use crate::model_request_policy::{
    input_modality_policy_allows_image_input, input_modality_policy_from_turn_context,
    runtime_reply_model_request_policy_from_turn_context,
};
use crate::protocol::{
    canonical_tool_item_event, AgentEvent, AgentTokenUsage, ToolItemLifecycleContext,
};
use crate::request_tool_policy::{
    is_same_tool, merge_system_prompt_with_request_tool_policy, ReplyAttemptError,
    RequestToolPolicy, StreamReplyExecution, WebSearchExecutionTracker,
};
use crate::runtime_state::AgentRuntimeState;
use crate::write_artifact_events::WriteArtifactEventEmitter;
use agent_protocol::{ItemStatus, SessionId, ThreadId, ThreadItemPayload};
use agent_runtime::provider_turn::{
    run_current_provider_turn, CurrentProviderTurnEvent, CurrentProviderTurnInput,
};
use agent_runtime::reply_input::RuntimeReplyInput;
use agent_runtime::session_config::AgentSessionConfig;
#[cfg(test)]
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::mpsc::{self, UnboundedSender};
use tokio_util::sync::CancellationToken;
use tool_runtime::tool_lifecycle::{
    ToolLifecycleEmissionFuture, ToolLifecycleEmitter, ToolLifecycleEvent, ToolLifecyclePhase,
};

mod mcp_step_snapshot;
mod tool_executor;

#[cfg(test)]
use tool_executor::{action_scope, project_call_result};

pub(crate) async fn stream_current_provider_turn<F>(
    state: &AgentRuntimeState,
    provider: ConfiguredReplyProvider,
    input: RuntimeReplyInput,
    mut initial_messages: Vec<model_provider::current_client::CurrentProviderMessage>,
    working_directory: Option<&Path>,
    mut session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    mut on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    if !input.images.is_empty()
        && !input_modality_policy_allows_image_input(
            input_modality_policy_from_turn_context(session_config.turn_context.as_ref()).as_ref(),
        )
    {
        return Err(ReplyAttemptError {
            message: "当前选中模型的 input_modality_policy 不支持图片输入，已拒绝把 image 内容发送到 provider；请切换支持 image 的模型或移除图片。".to_string(),
            emitted_any: false,
        });
    }
    session_config.system_prompt =
        merge_system_prompt_with_request_tool_policy(session_config.system_prompt.take(), policy);
    let session_id = session_config.id.clone();
    let thread_id = session_config
        .thread_id
        .clone()
        .filter(|thread_id| !thread_id.trim().is_empty())
        .ok_or_else(|| ReplyAttemptError {
            message: "Current provider turn requires a canonical thread_id".to_string(),
            emitted_any: false,
        })?;
    let model_request_policy =
        runtime_reply_model_request_policy_from_turn_context(session_config.turn_context.as_ref());
    initial_messages.push(user_message(input));
    let provider_name = provider.runtime_handle().provider_name().to_string();
    let mut artifact_events = WriteArtifactEventEmitter::new(session_config.id.clone());
    let mut usage = None;
    let mut web_search_tracker = WebSearchExecutionTracker::default();
    let (host_event_sender, mut host_event_receiver) = mpsc::unbounded_channel();
    let (agent_event_sender, mut agent_event_receiver) = mpsc::unbounded_channel();
    let tool_step_snapshot_source = mcp_step_snapshot::current_tool_step_snapshot_source(
        state.clone(),
        policy.clone(),
        session_config.turn_context.clone(),
        agent_event_sender,
        ThreadId::new(thread_id.clone()),
    );
    let lifecycle_emitter = Arc::new(CurrentTurnToolLifecycleEmitter::new(
        host_event_sender.clone(),
        session_id,
        thread_id,
    ));

    let turn_future = run_current_provider_turn(
        CurrentProviderTurnInput {
            provider: provider.client(),
            session_config,
            initial_messages,
            tool_step_snapshot_source,
            model_request_policy,
            tool_lifecycle_emitter: lifecycle_emitter,
            working_directory: working_directory
                .map(Path::to_path_buf)
                .unwrap_or_else(default_working_directory),
            cancel_token,
        },
        move |event| {
            let _ = host_event_sender.send(CurrentTurnHostEvent::Provider(event));
        },
    );
    tokio::pin!(turn_future);
    let execution = loop {
        tokio::select! {
            biased;
            Some(event) = host_event_receiver.recv() => {
                handle_ordered_host_event(event, &mut agent_event_receiver, &provider_name, policy, &mut artifact_events, &mut web_search_tracker, &mut usage, &mut on_event);
            }
            result = &mut turn_future => {
                drain_ready_turn_events(&mut host_event_receiver, &mut agent_event_receiver, &provider_name, policy, &mut artifact_events, &mut web_search_tracker, &mut usage, &mut on_event);
                break result;
            }
            Some(event) = agent_event_receiver.recv() => on_event(&event),
        }
    }
    .map_err(|error| ReplyAttemptError {
        message: error.message,
        emitted_any: error.emitted_any,
    })?;

    if !execution.cancelled {
        web_search_tracker
            .validate_web_search_requirement(policy)
            .map_err(|message| ReplyAttemptError {
                message,
                emitted_any: execution.emitted_any,
            })?;
        on_event(&AgentEvent::Done {
            usage: usage.map(project_usage),
        });
    }
    Ok(execution)
}

enum CurrentTurnHostEvent {
    Provider(CurrentProviderTurnEvent),
    ToolLifecycle(AgentEvent),
}

struct CurrentTurnToolLifecycleEmitter {
    event_sender: UnboundedSender<CurrentTurnHostEvent>,
    session_id: SessionId,
    thread_id: ThreadId,
    next_sequence: AtomicU64,
    next_ordinal: AtomicU64,
    items: StdMutex<HashMap<String, ToolItemLifecycleState>>,
}

#[derive(Clone, Copy)]
struct ToolItemLifecycleState {
    ordinal: u64,
    created_at_ms: i64,
}

impl CurrentTurnToolLifecycleEmitter {
    fn new(
        event_sender: UnboundedSender<CurrentTurnHostEvent>,
        session_id: impl Into<String>,
        thread_id: impl Into<String>,
    ) -> Self {
        Self {
            event_sender,
            session_id: SessionId::new(session_id),
            thread_id: ThreadId::new(thread_id),
            next_sequence: AtomicU64::new(0),
            next_ordinal: AtomicU64::new(0),
            items: StdMutex::new(HashMap::new()),
        }
    }

    fn project(&self, event: ToolLifecycleEvent) -> Option<AgentEvent> {
        let terminal = matches!(event.phase, ToolLifecyclePhase::Completed);
        if terminal && event.output.is_none() {
            return None;
        }

        let now = chrono::Utc::now().timestamp_millis();
        let key = format!("{}\0{}", event.turn_id, event.call_id);
        let state = {
            let mut items = self
                .items
                .lock()
                .expect("tool item lifecycle mutex poisoned");
            let state = items.get(&key).copied().unwrap_or_else(|| {
                let state = ToolItemLifecycleState {
                    ordinal: self.next_ordinal.fetch_add(1, Ordering::Relaxed) + 1,
                    created_at_ms: now,
                };
                items.insert(key.clone(), state);
                state
            });
            if terminal {
                items.remove(&key);
            }
            state
        };
        let sequence = self.next_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        canonical_tool_item_event(
            event,
            ToolItemLifecycleContext {
                session_id: self.session_id.clone(),
                thread_id: self.thread_id.clone(),
                sequence,
                ordinal: state.ordinal,
                created_at_ms: state.created_at_ms,
                updated_at_ms: now,
            },
        )
    }
}

impl ToolLifecycleEmitter for CurrentTurnToolLifecycleEmitter {
    fn emit<'a>(&'a self, event: ToolLifecycleEvent) -> ToolLifecycleEmissionFuture<'a> {
        Box::pin(async move {
            if let Some(event) = self.project(event) {
                let _ = self
                    .event_sender
                    .send(CurrentTurnHostEvent::ToolLifecycle(event));
            }
        })
    }
}

fn handle_ordered_host_event<F>(
    event: CurrentTurnHostEvent,
    agent_event_receiver: &mut mpsc::UnboundedReceiver<AgentEvent>,
    provider_name: &str,
    policy: &RequestToolPolicy,
    artifact_events: &mut WriteArtifactEventEmitter,
    web_search_tracker: &mut WebSearchExecutionTracker,
    usage: &mut Option<model_provider::current_client::CurrentProviderUsage>,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    if matches!(
        &event,
        CurrentTurnHostEvent::ToolLifecycle(AgentEvent::ItemCompleted { .. })
    ) {
        drain_ready_agent_events(agent_event_receiver, on_event);
    }
    handle_host_event(
        event,
        provider_name,
        policy,
        artifact_events,
        web_search_tracker,
        usage,
        on_event,
    );
}

fn drain_ready_turn_events<F>(
    host_event_receiver: &mut mpsc::UnboundedReceiver<CurrentTurnHostEvent>,
    agent_event_receiver: &mut mpsc::UnboundedReceiver<AgentEvent>,
    provider_name: &str,
    policy: &RequestToolPolicy,
    artifact_events: &mut WriteArtifactEventEmitter,
    web_search_tracker: &mut WebSearchExecutionTracker,
    usage: &mut Option<model_provider::current_client::CurrentProviderUsage>,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    while let Ok(event) = host_event_receiver.try_recv() {
        handle_ordered_host_event(
            event,
            agent_event_receiver,
            provider_name,
            policy,
            artifact_events,
            web_search_tracker,
            usage,
            on_event,
        );
    }
    drain_ready_agent_events(agent_event_receiver, on_event);
}

fn drain_ready_agent_events<F>(
    agent_event_receiver: &mut mpsc::UnboundedReceiver<AgentEvent>,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    while let Ok(event) = agent_event_receiver.try_recv() {
        on_event(&event);
    }
}

fn handle_host_event<F>(
    event: CurrentTurnHostEvent,
    provider_name: &str,
    policy: &RequestToolPolicy,
    artifact_events: &mut WriteArtifactEventEmitter,
    web_search_tracker: &mut WebSearchExecutionTracker,
    usage: &mut Option<model_provider::current_client::CurrentProviderUsage>,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    match event {
        CurrentTurnHostEvent::Provider(event) => {
            handle_provider_event(event, provider_name, artifact_events, usage, on_event)
        }
        CurrentTurnHostEvent::ToolLifecycle(event) => {
            match &event {
                AgentEvent::ItemStarted { item } => {
                    if let ThreadItemPayload::Tool { call_id, name, .. } = &item.payload {
                        web_search_tracker.record_tool_start(policy, call_id, name);
                    }
                }
                AgentEvent::ItemCompleted { item } => {
                    if let ThreadItemPayload::Tool {
                        call_id, output, ..
                    } = &item.payload
                    {
                        web_search_tracker.record_tool_end(
                            policy,
                            call_id,
                            item.status == ItemStatus::Completed,
                            output.as_ref().and_then(|output| output.error.as_deref()),
                        );
                    }
                }
                _ => {}
            }
            emit_with_artifacts(artifact_events, event, on_event);
        }
    }
}

fn handle_provider_event<F>(
    event: CurrentProviderTurnEvent,
    _provider_name: &str,
    artifact_events: &mut WriteArtifactEventEmitter,
    usage: &mut Option<model_provider::current_client::CurrentProviderUsage>,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    match event {
        CurrentProviderTurnEvent::TextDelta { text } => {
            emit_with_artifacts(artifact_events, AgentEvent::TextDelta { text }, on_event)
        }
        CurrentProviderTurnEvent::ReasoningDelta { text } => emit_with_artifacts(
            artifact_events,
            AgentEvent::ThinkingDelta { text },
            on_event,
        ),
        CurrentProviderTurnEvent::ToolInputDelta {
            tool_id: _,
            tool_name: _,
            delta: _,
            accumulated_arguments: _,
        } => {}
        CurrentProviderTurnEvent::Usage { usage: value } => *usage = Some(value),
    }
}

fn emit_with_artifacts<F>(
    artifact_events: &mut WriteArtifactEventEmitter,
    mut event: AgentEvent,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    for extra in artifact_events.process_event(&mut event) {
        on_event(&extra);
    }
    on_event(&event);
}

fn is_web_tool(name: &str) -> bool {
    is_same_tool(name, "WebSearch") || is_same_tool(name, "WebFetch")
}

fn user_message(
    input: RuntimeReplyInput,
) -> model_provider::current_client::CurrentProviderMessage {
    use model_provider::current_client::{CurrentProviderContent, CurrentProviderMessage};

    let mut content = vec![CurrentProviderContent::Text(input.text)];
    content.extend(
        input
            .images
            .into_iter()
            .map(|image| CurrentProviderContent::Image {
                data: image.data,
                media_type: image.media_type,
            }),
    );
    CurrentProviderMessage::user(content)
}

fn project_usage(usage: model_provider::current_client::CurrentProviderUsage) -> AgentTokenUsage {
    AgentTokenUsage {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cached_input_tokens: usage.cached_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
    }
}

fn default_working_directory() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use rmcp::model::{
        CallToolResult, Content, GetPromptResult, InitializeResult, JsonObject, ListPromptsResult,
        ListResourcesResult, ListToolsResult, ReadResourceResult, ServerNotification,
    };
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::{mpsc, Mutex};
    use tool_runtime::mcp_connection::{McpConnection, McpConnectionError};
    use tool_runtime::tool_call::ToolEnvironment;
    use tool_runtime::tool_executor::{RuntimeToolExecutionRequest, RuntimeToolPolicyErrorKind};
    use tool_runtime::tool_extension::RuntimeExtensionConfig;
    use tool_runtime::tool_io::{
        ToolIoPayloadStats, ToolOutputReference, ToolOutputTruncation, ToolOutputTruncationReason,
    };
    use tool_runtime::tool_result_projection::NormalizedToolOutput;

    struct HangingMcpConnection;

    #[async_trait]
    impl McpConnection for HangingMcpConnection {
        async fn list_resources(
            &self,
            _next_cursor: Option<String>,
            _cancel_token: CancellationToken,
        ) -> Result<ListResourcesResult, McpConnectionError> {
            std::future::pending().await
        }

        async fn read_resource(
            &self,
            _uri: &str,
            _cancel_token: CancellationToken,
        ) -> Result<ReadResourceResult, McpConnectionError> {
            std::future::pending().await
        }

        async fn list_tools(
            &self,
            _next_cursor: Option<String>,
            _cancel_token: CancellationToken,
        ) -> Result<ListToolsResult, McpConnectionError> {
            std::future::pending().await
        }

        async fn call_tool(
            &self,
            _name: &str,
            _arguments: Option<JsonObject>,
            _cancel_token: CancellationToken,
        ) -> Result<CallToolResult, McpConnectionError> {
            std::future::pending().await
        }

        async fn list_prompts(
            &self,
            _next_cursor: Option<String>,
            _cancel_token: CancellationToken,
        ) -> Result<ListPromptsResult, McpConnectionError> {
            std::future::pending().await
        }

        async fn get_prompt(
            &self,
            _name: &str,
            _arguments: Value,
            _cancel_token: CancellationToken,
        ) -> Result<GetPromptResult, McpConnectionError> {
            std::future::pending().await
        }

        async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
            let (_sender, receiver) = mpsc::channel(1);
            receiver
        }

        fn get_info(&self) -> Option<&InitializeResult> {
            None
        }
    }

    #[test]
    fn tool_result_projection_keeps_text_and_structured_content() {
        let result = project_call_result(Ok(CallToolResult {
            content: vec![Content::text("workspace result")],
            structured_content: Some(serde_json::json!({ "path": "README.md" })),
            is_error: Some(false),
            meta: None,
        }))
        .expect("tool result");

        assert!(result.success);
        assert_eq!(result.output, "workspace result");
        assert_eq!(
            result.structured_content,
            Some(serde_json::json!({ "path": "README.md" }))
        );
        assert!(!result.metadata.contains_key("structured_content"));
    }

    #[test]
    fn lifecycle_projection_preserves_normalized_terminal_output() {
        let (sender, _receiver) = mpsc::unbounded_channel();
        let emitter = CurrentTurnToolLifecycleEmitter::new(sender, "session-1", "thread-1");
        let started = emitter
            .project(ToolLifecycleEvent {
                turn_id: "turn-1".to_string(),
                call_id: "call-1".to_string(),
                tool_name: "Read".to_string(),
                arguments: serde_json::json!({ "path": "README.md" }),
                environments: vec![ToolEnvironment::new("local", PathBuf::from("/workspace"))],
                phase: ToolLifecyclePhase::Started,
                output: None,
            })
            .expect("started lifecycle projection");
        let AgentEvent::ItemStarted { item: started } = started else {
            panic!("expected canonical item started event");
        };
        assert_eq!(started.session_id.as_str(), "session-1");
        assert_eq!(started.thread_id.as_str(), "thread-1");
        assert_eq!(started.turn_id.as_str(), "turn-1");
        assert_eq!(started.item_id.as_str(), "item_call-1");
        assert_eq!(started.status, ItemStatus::InProgress);
        let ThreadItemPayload::Tool {
            call_id,
            name,
            arguments,
            output,
        } = &started.payload
        else {
            panic!("expected canonical tool payload");
        };
        assert_eq!(call_id, "call-1");
        assert_eq!(name, "Read");
        assert_eq!(arguments[0].name, "path");
        assert_eq!(arguments[0].value, "README.md");
        assert!(output.is_none());

        let projected = emitter
            .project(ToolLifecycleEvent {
                turn_id: "turn-1".to_string(),
                call_id: "call-1".to_string(),
                tool_name: "Read".to_string(),
                arguments: serde_json::json!({ "path": "README.md" }),
                environments: vec![ToolEnvironment::new("local", PathBuf::from("/workspace"))],
                phase: ToolLifecyclePhase::Completed,
                output: Some(NormalizedToolOutput {
                    success: true,
                    text: "preview".to_string(),
                    structured_content: Some(serde_json::json!({ "rows": 3 })),
                    error: None,
                    duration_ms: 42,
                    truncation: Some(ToolOutputTruncation::new(
                        ToolOutputTruncationReason::PayloadOffloaded,
                        ToolIoPayloadStats {
                            chars: 12_000,
                            bytes: 12_000,
                            tokens: 3_000,
                        },
                    )),
                    sidecar_reference: Some(ToolOutputReference::new(
                        "sidecar://tool-output-1",
                        Some("preview".to_string()),
                    )),
                    metadata: HashMap::from([("source".to_string(), serde_json::json!("mcp"))]),
                }),
            })
            .expect("completed lifecycle projection");

        let AgentEvent::ItemCompleted { item } = projected else {
            panic!("expected canonical item completed event");
        };
        assert_eq!(item.session_id.as_str(), "session-1");
        assert_eq!(item.thread_id.as_str(), "thread-1");
        assert_eq!(item.turn_id.as_str(), "turn-1");
        assert_eq!(item.item_id, started.item_id);
        assert_eq!(item.ordinal, started.ordinal);
        assert_eq!(item.created_at_ms, started.created_at_ms);
        assert_eq!(item.status, ItemStatus::Completed);
        let ThreadItemPayload::Tool {
            call_id,
            name,
            arguments,
            output,
        } = item.payload
        else {
            panic!("expected canonical tool payload");
        };
        assert_eq!(call_id, "call-1");
        assert_eq!(name, "Read");
        assert_eq!(arguments[0].value, "README.md");
        let output = output.expect("canonical terminal output");
        assert_eq!(output.text.as_deref(), Some("preview"));
        assert_eq!(
            output.structured_content,
            Some(serde_json::json!({ "rows": 3 }))
        );
        assert_eq!(output.duration_ms, Some(42));
        assert!(output.truncated);
        assert_eq!(
            output.output_ref.as_deref(),
            Some("sidecar://tool-output-1")
        );
        let metadata = item.metadata.as_object().expect("canonical item metadata");
        assert_eq!(metadata.get("source"), Some(&serde_json::json!("mcp")));
        assert_eq!(metadata.get("duration_ms"), Some(&serde_json::json!(42)));
        assert_eq!(
            metadata
                .get("truncation")
                .and_then(|value| value.get("reason")),
            Some(&serde_json::json!("payload_offloaded"))
        );
        assert_eq!(
            metadata
                .get("sidecar_reference")
                .and_then(|value| value.get("reference")),
            Some(&serde_json::json!("sidecar://tool-output-1"))
        );
        assert_eq!(metadata["environments"][0]["environmentId"], "local");
        assert_eq!(metadata["environments"][0]["cwd"], "/workspace");
    }

    #[test]
    fn lifecycle_projection_maps_failed_output_to_failed_item() {
        let (sender, _receiver) = mpsc::unbounded_channel();
        let emitter = CurrentTurnToolLifecycleEmitter::new(sender, "session-1", "thread-1");
        let projected = emitter
            .project(ToolLifecycleEvent {
                turn_id: "turn-1".to_string(),
                call_id: "call-failed".to_string(),
                tool_name: "Bash".to_string(),
                arguments: serde_json::json!({ "command": "false" }),
                environments: Vec::new(),
                phase: ToolLifecyclePhase::Completed,
                output: Some(NormalizedToolOutput {
                    success: false,
                    text: "failed".to_string(),
                    structured_content: None,
                    error: Some("exit code 1".to_string()),
                    duration_ms: 3,
                    truncation: None,
                    sidecar_reference: None,
                    metadata: HashMap::new(),
                }),
            })
            .expect("failed lifecycle projection");

        let AgentEvent::ItemCompleted { item } = projected else {
            panic!("expected canonical item completed event");
        };
        assert_eq!(item.status, ItemStatus::Failed);
        let ThreadItemPayload::Tool { output, .. } = item.payload else {
            panic!("expected canonical tool payload");
        };
        assert_eq!(
            output.and_then(|output| output.error).as_deref(),
            Some("exit code 1")
        );
    }

    #[tokio::test]
    async fn ready_lifecycle_and_policy_events_keep_start_action_end_order() {
        let (host_sender, mut host_receiver) = mpsc::unbounded_channel();
        let (agent_sender, mut agent_receiver) = mpsc::unbounded_channel();
        let emitter = CurrentTurnToolLifecycleEmitter::new(host_sender, "session-1", "thread-1");
        let environment = vec![ToolEnvironment::new("local", PathBuf::from("/workspace"))];

        emitter
            .emit(ToolLifecycleEvent {
                turn_id: "turn-1".to_string(),
                call_id: "call-1".to_string(),
                tool_name: "Read".to_string(),
                arguments: serde_json::json!({ "path": "README.md" }),
                environments: environment.clone(),
                phase: ToolLifecyclePhase::Started,
                output: None,
            })
            .await;
        agent_sender
            .send(AgentEvent::ActionRequired {
                request_id: "approval-1".to_string(),
                action_type: "tool_confirmation".to_string(),
                data: serde_json::json!({ "toolCallId": "call-1" }),
                scope: None,
            })
            .expect("queue policy event");
        emitter
            .emit(ToolLifecycleEvent {
                turn_id: "turn-1".to_string(),
                call_id: "call-1".to_string(),
                tool_name: "Read".to_string(),
                arguments: serde_json::json!({ "path": "README.md" }),
                environments: environment,
                phase: ToolLifecyclePhase::Completed,
                output: Some(NormalizedToolOutput {
                    success: true,
                    text: "done".to_string(),
                    structured_content: None,
                    error: None,
                    duration_ms: 1,
                    truncation: None,
                    sidecar_reference: None,
                    metadata: HashMap::new(),
                }),
            })
            .await;

        let policy = RequestToolPolicy {
            search_mode: crate::request_tool_policy::RequestToolPolicyMode::Disabled,
            effective_web_search: false,
            required_tools: Vec::new(),
            allowed_tools: Vec::new(),
            disallowed_tools: Vec::new(),
        };
        let mut artifacts = WriteArtifactEventEmitter::new("session-1".to_string());
        let mut tracker = WebSearchExecutionTracker::default();
        let mut usage = None;
        let mut order = Vec::new();
        drain_ready_turn_events(
            &mut host_receiver,
            &mut agent_receiver,
            "provider",
            &policy,
            &mut artifacts,
            &mut tracker,
            &mut usage,
            &mut |event| match event {
                AgentEvent::ItemStarted { .. } => order.push("item.started"),
                AgentEvent::ActionRequired { .. } => order.push("action.required"),
                AgentEvent::ItemCompleted { .. } => order.push("item.completed"),
                _ => {}
            },
        );

        assert_eq!(order, ["item.started", "action.required", "item.completed"]);
    }

    #[test]
    fn request_policy_hides_disallowed_tools() {
        let policy = RequestToolPolicy {
            search_mode: crate::request_tool_policy::RequestToolPolicyMode::Disabled,
            effective_web_search: false,
            required_tools: Vec::new(),
            allowed_tools: Vec::new(),
            disallowed_tools: vec!["WebSearch".to_string()],
        };

        assert!(policy.matches_any_disallowed_tool("web_search"));
    }

    #[test]
    fn action_scope_uses_typed_call_identity_and_canonical_thread() {
        let context = tool_runtime::tool_executor::RuntimeToolExecutionContext::new(
            tool_runtime::tool_executor::RuntimeToolExecutionContextInput {
                working_directory: PathBuf::from("/workspace"),
                session_id: "session-canonical".to_string(),
                cancel_token: None,
                workspace_sandbox: None,
            },
        )
        .with_tool_identity(
            tool_runtime::tool_executor::RuntimeToolExecutionIdentity::new(
                "call-canonical",
                "turn-canonical",
            ),
        );
        let turn_context = tool_runtime::tool_executor::RuntimeToolTurnContext {
            metadata: HashMap::from([
                (
                    "thread_id".to_string(),
                    serde_json::json!("thread-metadata"),
                ),
                ("turn_id".to_string(), serde_json::json!("turn-metadata")),
                (
                    "tool_call_id".to_string(),
                    serde_json::json!("call-metadata"),
                ),
            ]),
            ..tool_runtime::tool_executor::RuntimeToolTurnContext::default()
        };
        let params = serde_json::json!({});

        let (scope, call_id) = action_scope(
            RuntimeToolExecutionRequest {
                tool_name: "Bash",
                params: &params,
                context: &context,
                turn_context: Some(&turn_context),
            },
            &ThreadId::new("thread-canonical"),
        )
        .expect("typed tool identity should form approval scope");

        let scope = scope.expect("canonical action scope");
        assert_eq!(scope.session_id.as_deref(), Some("session-canonical"));
        assert_eq!(scope.thread_id.as_deref(), Some("thread-canonical"));
        assert_ne!(scope.thread_id, scope.session_id);
        assert_eq!(scope.turn_id.as_deref(), Some("turn-canonical"));
        assert_eq!(call_id, "call-canonical");
    }

    #[test]
    fn action_scope_fails_closed_without_typed_call_identity() {
        let context = tool_runtime::tool_executor::RuntimeToolExecutionContext::new(
            tool_runtime::tool_executor::RuntimeToolExecutionContextInput {
                working_directory: PathBuf::from("/workspace"),
                session_id: "session-1".to_string(),
                cancel_token: None,
                workspace_sandbox: None,
            },
        );
        let turn_context = tool_runtime::tool_executor::RuntimeToolTurnContext {
            metadata: HashMap::from([
                (
                    "thread_id".to_string(),
                    serde_json::json!("thread-metadata"),
                ),
                ("turn_id".to_string(), serde_json::json!("turn-metadata")),
                (
                    "tool_call_id".to_string(),
                    serde_json::json!("call-metadata"),
                ),
            ]),
            ..tool_runtime::tool_executor::RuntimeToolTurnContext::default()
        };
        let params = serde_json::json!({});

        let error = action_scope(
            RuntimeToolExecutionRequest {
                tool_name: "Bash",
                params: &params,
                context: &context,
                turn_context: Some(&turn_context),
            },
            &ThreadId::new("thread-1"),
        )
        .expect_err("metadata identity must not revive an unidentified tool request");

        assert_eq!(
            error.message(),
            "tool approval requires canonical tool identity"
        );
        assert!(matches!(
            error.policy_kind(),
            Some(RuntimeToolPolicyErrorKind::ExecutionFailed(reason))
                if reason == "tool_approval_identity_missing"
        ));
    }

    #[tokio::test]
    async fn mcp_tool_discovery_timeout_keeps_main_turn_unblocked() {
        let state = AgentRuntimeState::new();
        state
            .mcp_connections()
            .register(
                "slow".to_string(),
                RuntimeExtensionConfig::new(
                    "slow",
                    "slow MCP fixture",
                    vec!["search".to_string()],
                    false,
                    vec!["search".to_string()],
                    None,
                ),
                Arc::new(Mutex::new(Box::new(HangingMcpConnection))),
                None,
            )
            .await;

        let snapshot = tokio::time::timeout(
            Duration::from_millis(200),
            mcp_step_snapshot::mcp_step_snapshot(
                &state,
                Duration::from_millis(10),
                &mcp_step_snapshot::DeferredToolSelections::default(),
            ),
        )
        .await
        .expect("MCP discovery timeout should return control to the main turn");

        assert!(snapshot.tools().is_empty());
        assert_eq!(state.mcp_connections().names().await, vec!["slow"]);
    }
}
