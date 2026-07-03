use crate::ActionRespondRequest;
use crate::CancelExecutionRequest;
use crate::ExecutionBackend;
use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use crate::RuntimeEventSink;
use crate::RuntimeHostContext;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionActionType;
use app_server_protocol::AgentTurn;
use app_server_protocol::RuntimeOptions;
use async_trait::async_trait;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct AsterBackendSubmitRequest {
    pub host: RuntimeHostContext,
    pub session: AgentSession,
    pub turn: AgentTurn,
    pub input: AgentInput,
    pub runtime_options: Option<RuntimeOptions>,
    pub provider_preference: Option<String>,
    pub model_preference: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub event_name: String,
    pub queued_turn_id: Option<String>,
    pub queue_if_busy: bool,
    pub skip_pre_submit_resume: bool,
    pub process_control: AsterBackendProcessControlCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AsterBackendProcessControlCapabilities {
    pub shared_registry: bool,
    pub status: bool,
    pub drain_output: bool,
    pub interrupt: bool,
    pub terminate: bool,
    pub write_stdin: bool,
}

impl AsterBackendProcessControlCapabilities {
    pub const fn none() -> Self {
        Self {
            shared_registry: false,
            status: false,
            drain_output: false,
            interrupt: false,
            terminate: false,
            write_stdin: false,
        }
    }

    pub const fn shared_execution_process_server() -> Self {
        Self {
            shared_registry: true,
            status: true,
            drain_output: true,
            interrupt: true,
            terminate: true,
            write_stdin: true,
        }
    }
}

impl Default for AsterBackendProcessControlCapabilities {
    fn default() -> Self {
        Self::none()
    }
}

#[derive(Debug, Clone)]
pub struct AsterBackendCancelRequest {
    pub host: RuntimeHostContext,
    pub session: AgentSession,
    pub turn: AgentTurn,
    pub event_name: String,
}

#[derive(Debug, Clone)]
pub struct AsterBackendActionRespondRequest {
    pub host: RuntimeHostContext,
    pub session: AgentSession,
    pub turn: Option<AgentTurn>,
    pub request_id: String,
    pub action_type: AgentSessionActionType,
    pub confirmed: bool,
    pub response: Option<String>,
    pub user_data: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub event_name: String,
    pub action_scope: Option<AgentSessionActionScope>,
}

#[derive(Debug, Clone, Default)]
pub struct AsterBackendSubmitResult {
    pub events: Vec<RuntimeEvent>,
}

#[derive(Debug, Clone, Default)]
pub struct AsterBackendCancelResult {
    pub events: Vec<RuntimeEvent>,
}

#[derive(Debug, Clone, Default)]
pub struct AsterBackendActionRespondResult {
    pub events: Vec<RuntimeEvent>,
}

#[async_trait]
pub trait AsterBackendHost: Send + Sync {
    async fn submit_turn(
        &self,
        request: AsterBackendSubmitRequest,
    ) -> Result<AsterBackendSubmitResult, RuntimeCoreError>;

    async fn cancel_turn(
        &self,
        request: AsterBackendCancelRequest,
    ) -> Result<AsterBackendCancelResult, RuntimeCoreError>;

    async fn respond_action(
        &self,
        request: AsterBackendActionRespondRequest,
    ) -> Result<AsterBackendActionRespondResult, RuntimeCoreError>;
}

#[derive(Clone)]
pub struct AsterBackend {
    host: Arc<dyn AsterBackendHost>,
    process_control: AsterBackendProcessControlCapabilities,
}

impl AsterBackend {
    pub fn new(host: Arc<dyn AsterBackendHost>) -> Self {
        Self::new_with_process_control(host, AsterBackendProcessControlCapabilities::none())
    }

    pub fn new_with_process_control(
        host: Arc<dyn AsterBackendHost>,
        process_control: AsterBackendProcessControlCapabilities,
    ) -> Self {
        Self {
            host,
            process_control,
        }
    }
}

#[async_trait]
impl ExecutionBackend for AsterBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let result = self
            .host
            .submit_turn(AsterBackendSubmitRequest {
                host: request.host,
                event_name: request
                    .event_name
                    .clone()
                    .unwrap_or_else(|| event_name_for_session(&request.session)),
                session: request.session,
                turn: request.turn,
                input: request.input,
                runtime_options: request.runtime_options,
                provider_preference: request.provider_preference,
                model_preference: request.model_preference,
                metadata: request.metadata,
                queued_turn_id: request.queued_turn_id,
                queue_if_busy: request.queue_if_busy,
                skip_pre_submit_resume: request.skip_pre_submit_resume,
                process_control: self.process_control.clone(),
            })
            .await?;

        for event in result.events {
            sink.emit(event)?;
        }

        Ok(())
    }

    async fn cancel_turn(
        &self,
        request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let result = self
            .host
            .cancel_turn(AsterBackendCancelRequest {
                host: request.host,
                event_name: event_name_for_session(&request.session),
                session: request.session,
                turn: request.turn,
            })
            .await?;

        for event in result.events {
            sink.emit(event)?;
        }

        Ok(())
    }

    async fn respond_action(
        &self,
        request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let result = self
            .host
            .respond_action(AsterBackendActionRespondRequest {
                host: request.host,
                event_name: request
                    .event_name
                    .clone()
                    .unwrap_or_else(|| event_name_for_session(&request.session)),
                session: request.session,
                turn: request.turn,
                request_id: request.request_id,
                action_type: request.action_type,
                confirmed: request.confirmed,
                response: request.response,
                user_data: request.user_data,
                metadata: request.metadata,
                action_scope: request.action_scope,
            })
            .await?;

        for event in result.events {
            sink.emit(event)?;
        }

        Ok(())
    }
}

fn event_name_for_session(session: &AgentSession) -> String {
    format!("agentSession/event/{}", session.session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RuntimeCore;
    use crate::RuntimeHostContext;
    use app_server_protocol::AgentSessionActionRespondParams;
    use app_server_protocol::AgentSessionActionScope;
    use app_server_protocol::AgentSessionActionType;
    use app_server_protocol::AgentSessionStartParams;
    use app_server_protocol::AgentSessionTurnStartParams;

    struct MockAsterBackendHost;

    #[async_trait]
    impl AsterBackendHost for MockAsterBackendHost {
        async fn submit_turn(
            &self,
            request: AsterBackendSubmitRequest,
        ) -> Result<AsterBackendSubmitResult, RuntimeCoreError> {
            assert_eq!(request.host.client_name.as_deref(), Some("test-client"));
            assert_eq!(request.workspace_id(), Some("default"));
            assert_eq!(request.event_name, "plugin_runtime:app:task");
            assert_eq!(request.provider_preference.as_deref(), Some("deepseek"));
            assert_eq!(
                request.model_preference.as_deref(),
                Some("deepseek-v4-flash")
            );
            assert_eq!(
                request.metadata.as_ref().and_then(|metadata| {
                    metadata
                        .pointer("/plugin_runtime/task_id")
                        .and_then(serde_json::Value::as_str)
                }),
                Some("task-1")
            );
            assert_eq!(
                request.queued_turn_id.as_deref(),
                Some("plugin-queued-task-1")
            );
            assert!(request.queue_if_busy);
            assert!(request.skip_pre_submit_resume);
            assert_eq!(
                request.process_control,
                AsterBackendProcessControlCapabilities::none()
            );
            Ok(AsterBackendSubmitResult {
                events: vec![
                    RuntimeEvent::new(
                        "message.delta",
                        serde_json::json!({
                            "text": format!("accepted:{}", request.input.text),
                        }),
                    ),
                    RuntimeEvent::new(
                        "action.required",
                        serde_json::json!({
                            "requestId": "req_confirm_1",
                            "actionType": "tool_confirmation",
                            "data": {
                                "toolName": "PublishTool"
                            }
                        }),
                    ),
                ],
            })
        }

        async fn cancel_turn(
            &self,
            request: AsterBackendCancelRequest,
        ) -> Result<AsterBackendCancelResult, RuntimeCoreError> {
            assert!(request.event_name.starts_with("agentSession/event/"));
            Ok(AsterBackendCancelResult {
                events: vec![RuntimeEvent::new(
                    "runtime.warning",
                    serde_json::json!({
                        "code": "turn_canceled",
                        "message": format!("canceled:{}", request.turn.turn_id),
                    }),
                )],
            })
        }

        async fn respond_action(
            &self,
            request: AsterBackendActionRespondRequest,
        ) -> Result<AsterBackendActionRespondResult, RuntimeCoreError> {
            assert_eq!(request.host.client_name.as_deref(), Some("test-client"));
            assert_eq!(request.event_name, "plugin_runtime:app:task");
            assert_eq!(request.request_id, "req_confirm_1");
            assert_eq!(
                request.action_type,
                AgentSessionActionType::ToolConfirmation
            );
            assert!(request.confirmed);
            Ok(AsterBackendActionRespondResult {
                events: vec![RuntimeEvent::new(
                    "action.resolved",
                    serde_json::json!({
                        "requestId": request.request_id,
                        "actionType": request.action_type,
                    }),
                )],
            })
        }
    }

    #[tokio::test]
    async fn aster_backend_host_events_are_mapped_into_runtime_core_events() {
        let backend = AsterBackend::new(Arc::new(MockAsterBackendHost));
        let core = RuntimeCore::with_backend(Arc::new(backend));
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: None,
                thread_id: None,
                app_id: "content-studio".to_string(),
                workspace_id: Some("default".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session")
            .session;

        let output = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session.session_id.clone(),
                    turn_id: None,
                    input: AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: None,
                        stream: true,
                        event_name: Some("plugin_runtime:app:task".to_string()),
                        provider_preference: Some("deepseek".to_string()),
                        model_preference: Some("deepseek-v4-flash".to_string()),
                        metadata: Some(serde_json::json!({
                            "plugin_runtime": {
                                "task_id": "task-1"
                            }
                        })),
                        queued_turn_id: Some("plugin-queued-task-1".to_string()),
                        host_options: None,
                        ..RuntimeOptions::default()
                    }),
                    queue_if_busy: true,
                    skip_pre_submit_resume: true,
                },
                RuntimeHostContext {
                    client_name: Some("test-client".to_string()),
                    client_version: None,
                },
            )
            .await
            .expect("turn");

        let message_delta = output
            .events
            .iter()
            .find(|event| event.event_type == "message.delta")
            .expect("message delta event");
        assert_eq!(message_delta.payload["text"], "accepted:draft");
    }

    struct ProcessControlAwareAsterBackendHost;

    #[async_trait]
    impl AsterBackendHost for ProcessControlAwareAsterBackendHost {
        async fn submit_turn(
            &self,
            request: AsterBackendSubmitRequest,
        ) -> Result<AsterBackendSubmitResult, RuntimeCoreError> {
            assert_eq!(
                request.process_control,
                AsterBackendProcessControlCapabilities::shared_execution_process_server()
            );
            Ok(AsterBackendSubmitResult::default())
        }

        async fn cancel_turn(
            &self,
            _request: AsterBackendCancelRequest,
        ) -> Result<AsterBackendCancelResult, RuntimeCoreError> {
            Ok(AsterBackendCancelResult::default())
        }

        async fn respond_action(
            &self,
            _request: AsterBackendActionRespondRequest,
        ) -> Result<AsterBackendActionRespondResult, RuntimeCoreError> {
            Ok(AsterBackendActionRespondResult::default())
        }
    }

    #[tokio::test]
    async fn aster_backend_submit_request_exposes_injected_process_control_contract() {
        let backend = AsterBackend::new_with_process_control(
            Arc::new(ProcessControlAwareAsterBackendHost),
            AsterBackendProcessControlCapabilities::shared_execution_process_server(),
        );
        let core = RuntimeCore::with_backend(Arc::new(backend));
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: None,
                thread_id: None,
                app_id: "content-studio".to_string(),
                workspace_id: Some("default".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session")
            .session;

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: None,
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext {
                client_name: Some("test-client".to_string()),
                client_version: None,
            },
        )
        .await
        .expect("turn");
    }

    #[tokio::test]
    async fn aster_backend_action_responses_are_mapped_into_runtime_core_events() {
        let backend = AsterBackend::new(Arc::new(MockAsterBackendHost));
        let core = RuntimeCore::with_backend(Arc::new(backend));
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_action".to_string()),
                thread_id: None,
                app_id: "content-studio".to_string(),
                workspace_id: Some("default".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session")
            .session;
        let turn = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session.session_id.clone(),
                    turn_id: Some("turn_action".to_string()),
                    input: AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: None,
                        stream: true,
                        event_name: Some("plugin_runtime:app:task".to_string()),
                        provider_preference: Some("deepseek".to_string()),
                        model_preference: Some("deepseek-v4-flash".to_string()),
                        metadata: Some(serde_json::json!({
                            "plugin_runtime": {
                                "task_id": "task-1"
                            }
                        })),
                        queued_turn_id: Some("plugin-queued-task-1".to_string()),
                        host_options: None,
                        ..RuntimeOptions::default()
                    }),
                    queue_if_busy: true,
                    skip_pre_submit_resume: true,
                },
                RuntimeHostContext {
                    client_name: Some("test-client".to_string()),
                    client_version: None,
                },
            )
            .await
            .expect("turn")
            .response
            .turn;

        let output = core
            .respond_action(
                AgentSessionActionRespondParams {
                    session_id: session.session_id.clone(),
                    request_id: "req_confirm_1".to_string(),
                    action_type: AgentSessionActionType::ToolConfirmation,
                    confirmed: true,
                    response: Some("allow".to_string()),
                    user_data: None,
                    metadata: None,
                    event_name: Some("plugin_runtime:app:task".to_string()),
                    action_scope: Some(AgentSessionActionScope {
                        session_id: Some(session.session_id.clone()),
                        thread_id: Some(session.thread_id.clone()),
                        turn_id: Some(turn.turn_id),
                    }),
                },
                RuntimeHostContext {
                    client_name: Some("test-client".to_string()),
                    client_version: None,
                },
            )
            .await
            .expect("action response");

        let action_resolved = output
            .events
            .iter()
            .find(|event| event.event_type == "action.resolved")
            .expect("action resolved event");
        assert_eq!(action_resolved.payload["requestId"], "req_confirm_1");
    }
}

impl AsterBackendSubmitRequest {
    pub fn workspace_id(&self) -> Option<&str> {
        self.session.workspace_id.as_deref()
    }
}
