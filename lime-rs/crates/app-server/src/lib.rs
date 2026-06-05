#[cfg(feature = "aster-backend")]
mod aster_backend;
mod backend_event;
mod capability;
mod external_backend;
mod local_data_source;
mod processor;
mod runtime;
mod runtime_factory;

pub use app_server_protocol::error_codes;
pub use app_server_protocol::AgentInput;
pub use app_server_protocol::AgentSession;
pub use app_server_protocol::AgentSessionActionRespondParams;
pub use app_server_protocol::AgentSessionActionRespondResponse;
pub use app_server_protocol::AgentSessionActionScope;
pub use app_server_protocol::AgentSessionActionType;
pub use app_server_protocol::AgentSessionStartParams;
pub use app_server_protocol::AgentSessionStatus;
pub use app_server_protocol::AgentSessionTurnStartParams;
pub use app_server_protocol::AgentTurn;
pub use app_server_protocol::AgentTurnStatus;
pub use app_server_protocol::ArtifactContentStatus;
pub use app_server_protocol::ArtifactReadParams;
pub use app_server_protocol::ArtifactReadResponse;
pub use app_server_protocol::ArtifactSummary;
pub use app_server_protocol::CapabilityDescriptor;
pub use app_server_protocol::CapabilityListParams;
pub use app_server_protocol::CapabilityListResponse;
pub use app_server_protocol::EvidenceExportParams;
pub use app_server_protocol::EvidenceExportResponse;
pub use app_server_protocol::EvidencePackArtifact;
pub use app_server_protocol::EvidencePackSummary;
use app_server_protocol::JsonRpcError;
pub use app_server_protocol::JsonRpcMessage;
pub use app_server_protocol::JsonRpcNotification;
pub use app_server_protocol::JsonRpcRequest;
pub use app_server_protocol::RequestId;
pub use app_server_protocol::RuntimeOptions;
pub use app_server_protocol::METHOD_AGENT_SESSION_ACTION_RESPOND;
pub use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
pub use app_server_protocol::METHOD_AGENT_SESSION_READ;
pub use app_server_protocol::METHOD_AGENT_SESSION_START;
pub use app_server_protocol::METHOD_AGENT_SESSION_TURN_CANCEL;
pub use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
pub use app_server_protocol::METHOD_ARTIFACT_READ;
pub use app_server_protocol::METHOD_CAPABILITY_LIST;
pub use app_server_protocol::METHOD_EVIDENCE_EXPORT;
pub use app_server_protocol::METHOD_INITIALIZE;
pub use app_server_protocol::METHOD_INITIALIZED;
use app_server_transport::decode_message;
use app_server_transport::encode_message;
use app_server_transport::start_stdio_connection;
use app_server_transport::ConnectionId;
use app_server_transport::OutgoingMessage;
use app_server_transport::QueuedOutgoingMessage;
use app_server_transport::TransportError;
use app_server_transport::TransportEvent;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackend;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackendActionRespondRequest;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackendActionRespondResult;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackendCancelRequest;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackendCancelResult;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackendHost;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackendSubmitRequest;
#[cfg(feature = "aster-backend")]
pub use aster_backend::AsterBackendSubmitResult;
pub use backend_event::runtime_event_type_from_backend_type;
pub use capability::capability_source_from_app_policy_json;
pub use capability::AppPolicyCapability;
pub use capability::AppPolicyLoadError;
pub use capability::AppPolicyManifest;
pub use capability::AppPolicyManifestError;
pub use capability::CapabilityInventoryRecord;
pub use capability::CapabilityInventorySource;
pub use capability::CapabilityListContext;
pub use capability::CapabilitySource;
pub use external_backend::ExternalBackend;
pub use external_backend::ExternalBackendConfig;
pub use external_backend::DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS;
pub use local_data_source::LocalAppDataSource;
use processor::event_notification_jsonrpc;
use processor::RequestProcessor;
pub use runtime::ActionRespondRequest;
pub use runtime::AppDataSource;
pub use runtime::ArtifactContentProvider;
pub use runtime::ArtifactContentRequest;
pub use runtime::CancelExecutionRequest;
pub use runtime::EvidenceExportProvider;
pub use runtime::EvidencePackRequest;
pub use runtime::ExecutionBackend;
pub use runtime::ExecutionRequest;
pub use runtime::FilesystemArtifactContentProvider;
pub use runtime::InlineArtifactContentProvider;
pub use runtime::MockBackend;
pub use runtime::NoopAppDataSource;
pub use runtime::NoopEvidenceExportProvider;
pub use runtime::RuntimeCore;
pub use runtime::RuntimeCoreError;
pub use runtime::RuntimeCoreEventAppender;
pub use runtime::RuntimeCoreOutput;
pub use runtime::RuntimeEvent;
pub use runtime::RuntimeEventSink;
pub use runtime::RuntimeHostContext;
pub use runtime::UnavailableBackend;
pub use runtime_factory::AppServerBackendMode;
pub use runtime_factory::AppServerRuntimeFactory;
pub use runtime_factory::UnsupportedBackendMode;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use thiserror::Error;
use tokio::io;
use tokio::io::AsyncRead;
use tokio::io::AsyncWrite;
use tokio::sync::broadcast;
use tokio::sync::mpsc;

const OUTBOUND_MESSAGE_CAPACITY: usize = 1024;
type TransportWriter = mpsc::Sender<QueuedOutgoingMessage>;
type TransportWriters = Arc<Mutex<HashMap<ConnectionId, TransportWriter>>>;
type StreamedTransportMessage = Result<(ConnectionId, JsonRpcMessage), AppServerError>;

#[derive(Debug, Error)]
pub enum AppServerError {
    #[error(transparent)]
    Transport(#[from] TransportError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("app-server transport connection {connection_id} is not open")]
    ConnectionUnavailable { connection_id: ConnectionId },
    #[error("app-server transport connection {connection_id} writer is closed")]
    ConnectionWriterClosed { connection_id: ConnectionId },
}

#[derive(Clone)]
pub struct AppServer {
    processor: RequestProcessor,
    outbound_messages: broadcast::Sender<JsonRpcMessage>,
    transport_writers: TransportWriters,
}

#[derive(Clone)]
pub struct AppServerEventBridge {
    runtime_events: RuntimeCoreEventAppender,
    outbound_messages: broadcast::Sender<JsonRpcMessage>,
    transport_writers: TransportWriters,
}

impl AppServer {
    pub fn new() -> Self {
        Self::with_runtime(RuntimeCore::default())
    }

    pub fn with_runtime(runtime: RuntimeCore) -> Self {
        let (outbound_messages, _) = broadcast::channel(OUTBOUND_MESSAGE_CAPACITY);
        Self {
            processor: RequestProcessor::new(runtime),
            outbound_messages,
            transport_writers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn subscribe_outbound_messages(&self) -> broadcast::Receiver<JsonRpcMessage> {
        self.outbound_messages.subscribe()
    }

    pub fn event_bridge(&self) -> AppServerEventBridge {
        AppServerEventBridge {
            runtime_events: self.processor.runtime().event_appender(),
            outbound_messages: self.outbound_messages.clone(),
            transport_writers: self.transport_writers.clone(),
        }
    }

    #[cfg(test)]
    fn runtime(&self) -> &RuntimeCore {
        self.processor.runtime()
    }

    pub async fn handle_json_line(&self, line: &str) -> Result<Vec<String>, AppServerError> {
        let message = decode_message(line)?;
        self.handle_message(message)
            .await?
            .iter()
            .map(|message| encode_message(message).map_err(AppServerError::from))
            .collect()
    }

    pub async fn handle_message(
        &self,
        message: JsonRpcMessage,
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        match message {
            JsonRpcMessage::Request(request) => self.processor.handle_request(request).await,
            JsonRpcMessage::Notification(notification) => {
                self.processor.handle_notification(notification);
                Ok(Vec::new())
            }
            JsonRpcMessage::Response(_) | JsonRpcMessage::Error(_) => Ok(Vec::new()),
        }
    }

    pub async fn handle_message_streaming(
        &self,
        message: JsonRpcMessage,
        event_callback: &mut (dyn FnMut(JsonRpcMessage) + Send),
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        match message {
            JsonRpcMessage::Request(request) => {
                self.processor
                    .handle_request_streaming(request, event_callback)
                    .await
            }
            JsonRpcMessage::Notification(notification) => {
                self.processor.handle_notification(notification);
                Ok(Vec::new())
            }
            JsonRpcMessage::Response(_) | JsonRpcMessage::Error(_) => Ok(Vec::new()),
        }
    }

    pub fn append_external_runtime_events(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<JsonRpcMessage>, JsonRpcError> {
        self.event_bridge()
            .append_external_runtime_events(session_id, turn_id, runtime_events)
    }

    fn register_transport_writer(&self, connection_id: ConnectionId, writer: TransportWriter) {
        self.transport_writers
            .lock()
            .expect("app-server transport writer mutex poisoned")
            .insert(connection_id, writer);
    }

    fn unregister_transport_writer(&self, connection_id: ConnectionId) {
        self.transport_writers
            .lock()
            .expect("app-server transport writer mutex poisoned")
            .remove(&connection_id);
    }

    fn clear_transport_writers(&self) {
        self.transport_writers
            .lock()
            .expect("app-server transport writer mutex poisoned")
            .clear();
    }

    fn transport_writer(&self, connection_id: ConnectionId) -> Option<TransportWriter> {
        self.transport_writers
            .lock()
            .expect("app-server transport writer mutex poisoned")
            .get(&connection_id)
            .cloned()
    }

    async fn send_to_transport_connection(
        &self,
        connection_id: ConnectionId,
        message: JsonRpcMessage,
    ) -> Result<(), AppServerError> {
        let writer = self
            .transport_writer(connection_id)
            .ok_or(AppServerError::ConnectionUnavailable { connection_id })?;
        writer
            .send(QueuedOutgoingMessage::new(OutgoingMessage::from(message)))
            .await
            .map_err(|_| AppServerError::ConnectionWriterClosed { connection_id })
    }
}

impl AppServerEventBridge {
    pub fn append_external_runtime_events(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<JsonRpcMessage>, JsonRpcError> {
        let events = self
            .runtime_events
            .append_external_runtime_events(session_id, turn_id, runtime_events)
            .map_err(RuntimeCoreError::into_jsonrpc_error)?;
        let messages = events
            .into_iter()
            .map(event_notification_jsonrpc)
            .collect::<Result<Vec<_>, _>>()?;
        for message in &messages {
            let _ = self.outbound_messages.send(message.clone());
            enqueue_transport_outbound_message(&self.transport_writers, message.clone());
        }
        Ok(messages)
    }
}

pub async fn run_stdio(server: AppServer) -> Result<(), AppServerError> {
    run_json_lines(server, io::stdin(), io::stdout()).await
}

pub async fn run_json_lines<R, W>(
    server: AppServer,
    reader: R,
    writer: W,
) -> Result<(), AppServerError>
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let (transport_event_tx, mut transport_event_rx) = mpsc::channel(OUTBOUND_MESSAGE_CAPACITY);
    let _stdio_handles = start_stdio_connection(transport_event_tx, reader, writer).await?;
    let (streamed_tx, mut streamed_rx) = mpsc::unbounded_channel::<StreamedTransportMessage>();

    loop {
        tokio::select! {
            event = transport_event_rx.recv() => {
                let Some(event) = event else {
                    break;
                };
                match event {
                    TransportEvent::ConnectionOpened {
                        connection_id,
                        writer,
                        ..
                    } => server.register_transport_writer(connection_id, writer),
                    TransportEvent::StdioClientInitialized { .. } => {}
                    TransportEvent::ConnectionClosed { connection_id } => {
                        server.unregister_transport_writer(connection_id);
                        break;
                    }
                    TransportEvent::IncomingMessage {
                        connection_id,
                        message,
                    } => {
                        if is_streaming_turn_start_request(&message) {
                            let task_server = server.clone();
                            let task_streamed_tx = streamed_tx.clone();
                            tokio::spawn(async move {
                                let mut event_callback = |message: JsonRpcMessage| {
                                    let _ = task_streamed_tx.send(Ok((connection_id, message)));
                                };
                                match task_server
                                    .handle_message_streaming(message, &mut event_callback)
                                    .await
                                {
                                    Ok(messages) => {
                                        for message in messages {
                                            let _ = task_streamed_tx.send(Ok((connection_id, message)));
                                        }
                                    }
                                    Err(error) => {
                                        let _ = task_streamed_tx.send(Err(error));
                                    }
                                }
                            });
                            continue;
                        }
                        for response in server.handle_message(message).await? {
                            server
                                .send_to_transport_connection(connection_id, response)
                                .await?;
                        }
                    }
                }
            }
            streamed = streamed_rx.recv() => {
                let Some(streamed) = streamed else {
                    break;
                };
                let (connection_id, message) = streamed?;
                server
                    .send_to_transport_connection(connection_id, message)
                    .await?;
            }
        }
    }

    server.clear_transport_writers();
    Ok(())
}

fn enqueue_transport_outbound_message(writers: &TransportWriters, message: JsonRpcMessage) {
    let writers = writers
        .lock()
        .expect("app-server transport writer mutex poisoned")
        .values()
        .cloned()
        .collect::<Vec<_>>();
    for writer in writers {
        let message = message.clone();
        tokio::spawn(async move {
            let _ = writer
                .send(QueuedOutgoingMessage::new(OutgoingMessage::from(message)))
                .await;
        });
    }
}

fn is_streaming_turn_start_request(message: &JsonRpcMessage) -> bool {
    matches!(
        message,
        JsonRpcMessage::Request(request)
            if request.method == METHOD_AGENT_SESSION_TURN_START
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentInput;
    #[cfg(feature = "aster-backend")]
    use app_server_protocol::AgentSessionActionRespondParams;
    #[cfg(feature = "aster-backend")]
    use app_server_protocol::AgentSessionActionScope;
    #[cfg(feature = "aster-backend")]
    use app_server_protocol::AgentSessionActionType;
    use app_server_protocol::AgentSessionTurnStartParams;
    #[cfg(feature = "aster-backend")]
    use app_server_protocol::ArtifactReadParams;
    use app_server_protocol::ClientCapabilities;
    use app_server_protocol::ClientInfo;
    use app_server_protocol::InitializeParams;
    use app_server_protocol::RequestId;
    #[cfg(feature = "aster-backend")]
    use async_trait::async_trait;
    use serde_json::json;
    #[cfg(feature = "aster-backend")]
    use std::sync::atomic::AtomicUsize;
    #[cfg(feature = "aster-backend")]
    use std::sync::atomic::Ordering;
    use std::sync::Arc;
    use tokio::io::AsyncBufReadExt;
    use tokio::io::AsyncWriteExt;
    use tokio::io::BufReader;

    #[cfg(feature = "aster-backend")]
    struct JsonRpcAsterBackendHost;

    #[cfg(feature = "aster-backend")]
    #[async_trait]
    impl AsterBackendHost for JsonRpcAsterBackendHost {
        async fn submit_turn(
            &self,
            request: AsterBackendSubmitRequest,
        ) -> Result<AsterBackendSubmitResult, RuntimeCoreError> {
            assert_eq!(request.host.client_name.as_deref(), Some("content-studio"));
            assert_eq!(request.session.session_id, "sess_external");
            assert_eq!(request.session.thread_id, "thread_external");
            assert_eq!(request.session.workspace_id.as_deref(), Some("default"));
            assert_eq!(request.input.text, "draft");
            assert!(request.event_name.starts_with("agentSession/event/"));
            assert!(request.queue_if_busy);
            assert!(request.skip_pre_submit_resume);

            Ok(AsterBackendSubmitResult {
                events: vec![RuntimeEvent::new(
                    "message.delta",
                    json!({ "text": "accepted:draft" }),
                )],
            })
        }

        async fn cancel_turn(
            &self,
            request: AsterBackendCancelRequest,
        ) -> Result<AsterBackendCancelResult, RuntimeCoreError> {
            assert_eq!(request.session.session_id, "sess_external");
            Ok(AsterBackendCancelResult::default())
        }

        async fn respond_action(
            &self,
            request: AsterBackendActionRespondRequest,
        ) -> Result<AsterBackendActionRespondResult, RuntimeCoreError> {
            assert_eq!(request.session.session_id, "sess_external");
            Ok(AsterBackendActionRespondResult::default())
        }
    }

    #[cfg(feature = "aster-backend")]
    #[derive(Default)]
    struct JsonRpcAsterAgentFlowSmokeHost {
        submit_count: AtomicUsize,
        action_count: AtomicUsize,
    }

    #[cfg(feature = "aster-backend")]
    #[async_trait]
    impl AsterBackendHost for JsonRpcAsterAgentFlowSmokeHost {
        async fn submit_turn(
            &self,
            request: AsterBackendSubmitRequest,
        ) -> Result<AsterBackendSubmitResult, RuntimeCoreError> {
            self.submit_count.fetch_add(1, Ordering::SeqCst);
            assert_eq!(request.host.client_name.as_deref(), Some("content-studio"));
            assert_eq!(request.host.client_version.as_deref(), Some("0.1.0"));
            assert_eq!(request.session.session_id, "sess_flow");
            assert_eq!(request.session.thread_id, "thread_flow");
            assert_eq!(request.workspace_id(), Some("default"));
            assert_eq!(request.turn.turn_id, "turn_flow");
            assert_eq!(request.input.text, "draft");
            assert!(request.event_name.starts_with("agentSession/event/"));
            assert!(request.queue_if_busy);
            assert!(request.skip_pre_submit_resume);

            Ok(AsterBackendSubmitResult {
                events: vec![
                    RuntimeEvent::new(
                        "message.delta",
                        json!({
                            "text": "accepted:draft",
                            "evidenceRefs": ["evidence://sess_flow/runtime"]
                        }),
                    ),
                    RuntimeEvent::new(
                        "artifact.snapshot",
                        json!({
                            "artifactId": "artifact-report",
                            "path": ".app-server/artifacts/report.md",
                            "title": "Report",
                            "kind": "markdown_report",
                            "status": "ready",
                            "content": "# Report"
                        }),
                    ),
                ],
            })
        }

        async fn cancel_turn(
            &self,
            request: AsterBackendCancelRequest,
        ) -> Result<AsterBackendCancelResult, RuntimeCoreError> {
            assert_eq!(request.session.session_id, "sess_flow");
            Ok(AsterBackendCancelResult::default())
        }

        async fn respond_action(
            &self,
            request: AsterBackendActionRespondRequest,
        ) -> Result<AsterBackendActionRespondResult, RuntimeCoreError> {
            self.action_count.fetch_add(1, Ordering::SeqCst);
            assert_eq!(request.host.client_name.as_deref(), Some("content-studio"));
            assert_eq!(request.session.session_id, "sess_flow");
            assert_eq!(
                request.turn.as_ref().map(|turn| turn.turn_id.as_str()),
                Some("turn_flow")
            );
            assert_eq!(request.request_id, "req_confirm_1");
            assert_eq!(
                request.action_type,
                AgentSessionActionType::ToolConfirmation
            );
            assert!(request.confirmed);
            assert_eq!(request.response.as_deref(), Some("approved"));
            assert_eq!(request.event_name, "agentSession/event/sess_flow");
            assert_eq!(
                request
                    .action_scope
                    .as_ref()
                    .and_then(|scope| scope.turn_id.as_deref()),
                Some("turn_flow")
            );

            Ok(AsterBackendActionRespondResult {
                events: vec![RuntimeEvent::new(
                    "action.resolved",
                    json!({
                        "requestId": request.request_id,
                        "actionType": request.action_type,
                        "confirmed": request.confirmed
                    }),
                )],
            })
        }
    }

    #[tokio::test]
    async fn business_methods_require_initialized_notification() {
        let server = AppServer::new();
        let response = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_AGENT_SESSION_START,
                Some(json!({ "appId": "content-studio" })),
            )))
            .await
            .expect("handle")
            .remove(0);

        match response {
            JsonRpcMessage::Error(error) => {
                assert_eq!(error.error.code, error_codes::NOT_INITIALIZED);
            }
            other => panic!("expected error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn session_and_turn_flow_runs_on_mock_runtime() {
        let server = AppServer::new();
        initialize(&server).await;

        let session_response = request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({ "appId": "content-studio", "workspaceId": "default" }),
        )
        .await;
        let session_id = session_response["session"]["sessionId"]
            .as_str()
            .expect("session id")
            .to_string();

        let turn_response = request(
            &server,
            3,
            METHOD_AGENT_SESSION_TURN_START,
            serde_json::to_value(AgentSessionTurnStartParams {
                session_id: session_id.clone(),
                turn_id: None,
                input: AgentInput {
                    text: "生成草稿".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            })
            .expect("params"),
        )
        .await;

        assert_eq!(turn_response["turn"]["sessionId"], session_id);
        assert_eq!(turn_response["turn"]["status"], "accepted");

        let events = server
            .runtime()
            .events_for_session(&session_id)
            .expect("stored events");
        assert_eq!(events.len(), 1);
    }

    #[tokio::test]
    async fn session_start_rejects_duplicate_caller_supplied_session_id() {
        let server = AppServer::new();
        initialize(&server).await;
        let params = json!({
            "sessionId": "sess_external",
            "threadId": "thread_external",
            "appId": "content-studio",
            "workspaceId": "default"
        });

        let first = request(&server, 2, METHOD_AGENT_SESSION_START, params.clone()).await;
        assert_eq!(first["session"]["sessionId"], "sess_external");

        let messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_START,
                Some(params),
            )))
            .await
            .expect("handle");

        match messages.first().expect("error response") {
            JsonRpcMessage::Error(error) => {
                assert_eq!(error.error.code, error_codes::SESSION_ALREADY_EXISTS);
                assert_eq!(error.error.message, "session already exists: sess_external");
            }
            other => panic!("expected duplicate session error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn capability_list_flows_through_json_rpc_router_with_scoped_inventory_source() {
        let runtime = AppServerRuntimeFactory::mock_runtime_core_with_capability_source(Arc::new(
            CapabilityInventorySource::new(vec![
                CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "global.agent.session".to_string(),
                    title: "Global Agent Session".to_string(),
                    description: None,
                    methods: vec![METHOD_AGENT_SESSION_START.to_string()],
                }),
                CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "content.draft.generate".to_string(),
                    title: "Generate Draft".to_string(),
                    description: Some("Content Studio draft capability".to_string()),
                    methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
                })
                .for_apps(["content-studio"])
                .for_workspaces(["default"]),
                CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "other.private".to_string(),
                    title: "Other Private".to_string(),
                    description: None,
                    methods: vec!["other/method".to_string()],
                })
                .for_apps(["other-app"]),
            ]),
        ));
        let server = AppServer::with_runtime(runtime);
        initialize(&server).await;

        let response = request(
            &server,
            2,
            METHOD_CAPABILITY_LIST,
            json!({
                "appId": "content-studio",
                "workspaceId": "default",
                "limit": 1
            }),
        )
        .await;

        let capabilities = response["capabilities"].as_array().expect("capabilities");
        let ids: Vec<&str> = capabilities
            .iter()
            .map(|capability| capability["id"].as_str().expect("id"))
            .collect();
        assert_eq!(ids, vec!["global.agent.session"]);
        assert_eq!(response["nextCursor"].as_str().expect("next cursor"), "1");

        let next_response = request(
            &server,
            3,
            METHOD_CAPABILITY_LIST,
            json!({
                "appId": "content-studio",
                "workspaceId": "default",
                "cursor": response["nextCursor"].as_str().expect("next cursor"),
                "limit": 1
            }),
        )
        .await;
        let next_capabilities = next_response["capabilities"]
            .as_array()
            .expect("next capabilities");
        assert_eq!(next_capabilities[0]["id"], "content.draft.generate");
        assert_eq!(
            next_capabilities[0]["methods"][0],
            METHOD_AGENT_SESSION_TURN_START
        );
        assert!(next_response.get("nextCursor").is_none());
    }

    #[tokio::test]
    async fn capability_list_with_session_id_uses_stored_session_scope() {
        let runtime = AppServerRuntimeFactory::mock_runtime_core_with_capability_source(Arc::new(
            CapabilityInventorySource::new(vec![CapabilityInventoryRecord::new(
                CapabilityDescriptor {
                    id: "session.draft.generate".to_string(),
                    title: "Session Draft".to_string(),
                    description: None,
                    methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
                },
            )
            .for_apps(["content-studio"])
            .for_workspaces(["default"])
            .for_sessions(["sess_capability_scope"])]),
        ));
        let server = AppServer::with_runtime(runtime);
        initialize(&server).await;
        request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({
                "sessionId": "sess_capability_scope",
                "appId": "content-studio",
                "workspaceId": "default"
            }),
        )
        .await;

        let response = request(
            &server,
            3,
            METHOD_CAPABILITY_LIST,
            json!({
                "sessionId": "sess_capability_scope",
                "appId": "other-app",
                "workspaceId": "other-workspace"
            }),
        )
        .await;
        let capabilities = response["capabilities"].as_array().expect("capabilities");
        assert_eq!(capabilities[0]["id"], "session.draft.generate");

        let messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(4),
                METHOD_CAPABILITY_LIST,
                Some(json!({ "sessionId": "sess_missing" })),
            )))
            .await
            .expect("missing session capability list");
        match messages.first().expect("error response") {
            JsonRpcMessage::Error(error) => {
                assert_eq!(error.error.code, error_codes::SESSION_NOT_FOUND);
                assert_eq!(error.error.message, "session not found: sess_missing");
            }
            other => panic!("expected session not found error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn turn_start_with_hidden_capability_returns_capability_denied_error() {
        let runtime = AppServerRuntimeFactory::mock_runtime_core_with_capability_source(Arc::new(
            CapabilityInventorySource::new(vec![CapabilityInventoryRecord::new(
                CapabilityDescriptor {
                    id: "content.draft.generate".to_string(),
                    title: "Generate Draft".to_string(),
                    description: None,
                    methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
                },
            )
            .for_apps(["other-app"])]),
        ));
        let server = AppServer::with_runtime(runtime);
        initialize(&server).await;
        request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({
                "sessionId": "sess_denied",
                "appId": "content-studio",
                "workspaceId": "default"
            }),
        )
        .await;

        let messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "sess_denied",
                    "input": {
                        "text": "draft"
                    },
                    "runtimeOptions": {
                        "capabilityId": "content.draft.generate"
                    }
                })),
            )))
            .await
            .expect("turn start");

        match messages.first().expect("error response") {
            JsonRpcMessage::Error(error) => {
                assert_eq!(error.error.code, error_codes::CAPABILITY_DENIED);
                assert_eq!(
                    error.error.message,
                    "capability denied: content.draft.generate"
                );
            }
            other => panic!("expected capability denied error, got {other:?}"),
        }
        let read = request(
            &server,
            4,
            METHOD_AGENT_SESSION_READ,
            json!({ "sessionId": "sess_denied" }),
        )
        .await;
        assert!(read["turns"].as_array().expect("turns").is_empty());
    }

    #[tokio::test]
    async fn turn_start_returns_response_and_event_notification() {
        let server = AppServer::new();
        initialize(&server).await;

        let session_response = request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({ "appId": "content-studio" }),
        )
        .await;
        let session_id = session_response["session"]["sessionId"]
            .as_str()
            .expect("session id")
            .to_string();

        let messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(
                    serde_json::to_value(AgentSessionTurnStartParams {
                        session_id,
                        turn_id: None,
                        input: AgentInput {
                            text: "生成草稿".to_string(),
                            attachments: Vec::new(),
                        },
                        runtime_options: None,
                        queue_if_busy: false,
                        skip_pre_submit_resume: false,
                    })
                    .expect("params"),
                ),
            )))
            .await
            .expect("handle");

        assert_eq!(messages.len(), 2);
        match &messages[1] {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                assert_eq!(
                    notification.params.as_ref().expect("params")["event"]["type"],
                    "turn.accepted"
                );
            }
            other => panic!("expected notification, got {other:?}"),
        }
    }

    #[cfg(feature = "aster-backend")]
    #[tokio::test]
    async fn aster_runtime_factory_flows_through_json_rpc_router() {
        let server = AppServerRuntimeFactory::aster_app_server(Arc::new(JsonRpcAsterBackendHost));

        request(
            &server,
            1,
            METHOD_INITIALIZE,
            serde_json::to_value(InitializeParams {
                client_info: ClientInfo {
                    name: "content-studio".to_string(),
                    title: None,
                    version: Some("0.1.0".to_string()),
                },
                capabilities: ClientCapabilities {
                    event_methods: vec![METHOD_AGENT_SESSION_EVENT.to_string()],
                    experimental: false,
                },
            })
            .expect("params"),
        )
        .await;
        server
            .handle_message(JsonRpcMessage::Notification(JsonRpcNotification::new(
                METHOD_INITIALIZED,
                Some(json!({})),
            )))
            .await
            .expect("initialized");

        let session_response = request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({
                "sessionId": "sess_external",
                "threadId": "thread_external",
                "appId": "content-studio",
                "workspaceId": "default"
            }),
        )
        .await;
        assert_eq!(session_response["session"]["sessionId"], "sess_external");

        let messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "sess_external",
                    "input": {
                        "text": "draft"
                    },
                    "runtimeOptions": {
                        "stream": true
                    },
                    "queueIfBusy": true,
                    "skipPreSubmitResume": true
                })),
            )))
            .await
            .expect("turn start");

        assert_eq!(messages.len(), 2);
        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["turn"]["status"], "accepted");
                assert_eq!(response.result["turn"]["sessionId"], "sess_external");
            }
            other => panic!("expected response, got {other:?}"),
        }
        match &messages[1] {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                assert_eq!(
                    notification.params.as_ref().expect("params")["event"]["type"],
                    "message.delta"
                );
                assert_eq!(
                    notification.params.as_ref().expect("params")["event"]["payload"]["text"],
                    "accepted:draft"
                );
            }
            other => panic!("expected notification, got {other:?}"),
        }
    }

    #[cfg(feature = "aster-backend")]
    #[tokio::test]
    async fn aster_backend_json_rpc_agent_flow_smoke_covers_artifact_read_and_action_response() {
        let host = Arc::new(JsonRpcAsterAgentFlowSmokeHost::default());
        let server = AppServerRuntimeFactory::aster_app_server(host.clone());

        request(
            &server,
            1,
            METHOD_INITIALIZE,
            serde_json::to_value(InitializeParams {
                client_info: ClientInfo {
                    name: "content-studio".to_string(),
                    title: None,
                    version: Some("0.1.0".to_string()),
                },
                capabilities: ClientCapabilities {
                    event_methods: vec![METHOD_AGENT_SESSION_EVENT.to_string()],
                    experimental: false,
                },
            })
            .expect("params"),
        )
        .await;
        server
            .handle_message(JsonRpcMessage::Notification(JsonRpcNotification::new(
                METHOD_INITIALIZED,
                Some(json!({})),
            )))
            .await
            .expect("initialized");

        let session_response = request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({
                "sessionId": "sess_flow",
                "threadId": "thread_flow",
                "appId": "content-studio",
                "workspaceId": "default"
            }),
        )
        .await;
        assert_eq!(session_response["session"]["sessionId"], "sess_flow");

        let turn_messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "sess_flow",
                    "turnId": "turn_flow",
                    "input": {
                        "text": "draft"
                    },
                    "runtimeOptions": {
                        "stream": true
                    },
                    "queueIfBusy": true,
                    "skipPreSubmitResume": true
                })),
            )))
            .await
            .expect("turn start");

        assert_eq!(turn_messages.len(), 3);
        match &turn_messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["turn"]["status"], "accepted");
                assert_eq!(response.result["turn"]["sessionId"], "sess_flow");
                assert_eq!(response.result["turn"]["turnId"], "turn_flow");
            }
            other => panic!("expected turn response, got {other:?}"),
        }
        assert_agent_event_notification(
            &turn_messages[1],
            "message.delta",
            "turn_flow",
            json!({
                "text": "accepted:draft",
                "evidenceRefs": ["evidence://sess_flow/runtime"]
            }),
        );
        assert_agent_event_notification(
            &turn_messages[2],
            "artifact.snapshot",
            "turn_flow",
            json!({
                "artifactId": "artifact-report",
                "path": ".app-server/artifacts/report.md",
                "title": "Report",
                "kind": "markdown_report",
                "status": "ready",
                "content": "# Report"
            }),
        );

        let artifact_response = request(
            &server,
            4,
            METHOD_ARTIFACT_READ,
            serde_json::to_value(ArtifactReadParams {
                session_id: "sess_flow".to_string(),
                turn_id: Some("turn_flow".to_string()),
                artifact_ref: Some("artifact-report".to_string()),
                include_content: Some(true),
                cursor: None,
                limit: None,
            })
            .expect("artifact params"),
        )
        .await;
        let artifacts = artifact_response["artifacts"]
            .as_array()
            .expect("artifacts");
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0]["artifactRef"], "artifact-report");
        assert_eq!(artifacts[0]["path"], ".app-server/artifacts/report.md");
        assert_eq!(artifacts[0]["content"], "# Report");
        assert_eq!(artifacts[0]["contentStatus"], "available");

        let evidence_response = request(
            &server,
            5,
            METHOD_EVIDENCE_EXPORT,
            json!({
                "sessionId": "sess_flow",
                "turnId": "turn_flow",
                "includeEvents": true,
                "includeArtifacts": true
            }),
        )
        .await;
        assert_eq!(evidence_response["session"]["sessionId"], "sess_flow");
        assert_eq!(evidence_response["turns"][0]["turnId"], "turn_flow");
        assert_eq!(evidence_response["events"][0]["type"], "message.delta");
        assert_eq!(
            evidence_response["artifacts"][0]["artifactRef"],
            "artifact-report"
        );
        assert!(!evidence_response["exportedAt"]
            .as_str()
            .expect("exportedAt")
            .is_empty());
        assert!(evidence_response.get("threadStatus").is_none());
        assert!(evidence_response.get("completionAuditSummary").is_none());

        let action_messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(6),
                METHOD_AGENT_SESSION_ACTION_RESPOND,
                Some(
                    serde_json::to_value(AgentSessionActionRespondParams {
                        session_id: "sess_flow".to_string(),
                        request_id: "req_confirm_1".to_string(),
                        action_type: AgentSessionActionType::ToolConfirmation,
                        confirmed: true,
                        response: Some("approved".to_string()),
                        user_data: Some(json!({ "source": "smoke" })),
                        metadata: Some(json!({ "mode": "json-rpc" })),
                        event_name: Some("agentSession/event/sess_flow".to_string()),
                        action_scope: Some(AgentSessionActionScope {
                            session_id: Some("sess_flow".to_string()),
                            thread_id: Some("thread_flow".to_string()),
                            turn_id: Some("turn_flow".to_string()),
                        }),
                    })
                    .expect("action params"),
                ),
            )))
            .await
            .expect("action respond");

        assert_eq!(action_messages.len(), 2);
        match &action_messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result, json!({}));
            }
            other => panic!("expected action response, got {other:?}"),
        }
        assert_agent_event_notification(
            &action_messages[1],
            "action.resolved",
            "turn_flow",
            json!({
                "requestId": "req_confirm_1",
                "actionType": "tool_confirmation",
                "confirmed": true
            }),
        );
        assert_eq!(host.submit_count.load(Ordering::SeqCst), 1);
        assert_eq!(host.action_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn append_external_runtime_events_returns_json_rpc_notifications() {
        let server = AppServer::new();
        initialize(&server).await;
        request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({
                "sessionId": "sess_external",
                "threadId": "thread_external",
                "appId": "content-studio",
                "workspaceId": "default"
            }),
        )
        .await;
        let turn_response = request(
            &server,
            3,
            METHOD_AGENT_SESSION_TURN_START,
            json!({
                "sessionId": "sess_external",
                "input": {
                    "text": "draft"
                }
            }),
        )
        .await;
        let turn_id = turn_response["turn"]["turnId"].as_str().expect("turn id");

        let notifications = server
            .append_external_runtime_events(
                "sess_external",
                Some(turn_id),
                vec![RuntimeEvent::new(
                    "message.delta",
                    json!({ "text": "delta" }),
                )],
            )
            .expect("notifications");

        assert_eq!(notifications.len(), 1);
        match &notifications[0] {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sequence"], 2);
                assert_eq!(event["sessionId"], "sess_external");
                assert_eq!(event["threadId"], "thread_external");
                assert_eq!(event["turnId"], turn_id);
                assert_eq!(event["type"], "message.delta");
                assert_eq!(event["payload"]["text"], "delta");
            }
            other => panic!("expected notification, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn append_external_runtime_events_publishes_outbound_notification() {
        let server = AppServer::new();
        let mut outbound_messages = server.subscribe_outbound_messages();
        initialize(&server).await;
        request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({
                "sessionId": "sess_external",
                "threadId": "thread_external",
                "appId": "content-studio",
                "workspaceId": "default"
            }),
        )
        .await;
        let turn_response = request(
            &server,
            3,
            METHOD_AGENT_SESSION_TURN_START,
            json!({
                "sessionId": "sess_external",
                "input": {
                    "text": "draft"
                }
            }),
        )
        .await;
        let turn_id = turn_response["turn"]["turnId"].as_str().expect("turn id");

        server
            .append_external_runtime_events(
                "sess_external",
                Some(turn_id),
                vec![RuntimeEvent::new(
                    "message.delta",
                    json!({ "text": "async delta" }),
                )],
            )
            .expect("notifications");

        let message =
            tokio::time::timeout(std::time::Duration::from_secs(1), outbound_messages.recv())
                .await
                .expect("outbound message")
                .expect("broadcast message");
        match message {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], "sess_external");
                assert_eq!(event["turnId"], turn_id);
                assert_eq!(event["type"], "message.delta");
                assert_eq!(event["payload"]["text"], "async delta");
            }
            other => panic!("expected outbound notification, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn json_lines_loop_writes_external_outbound_notification() {
        let server = AppServer::new();
        let (mut input_client, input_server) = tokio::io::duplex(4096);
        let (output_server, output_client) = tokio::io::duplex(4096);
        let runner_server = server.clone();
        let runner = tokio::spawn(async move {
            run_json_lines(runner_server, input_server, output_server).await
        });
        let mut output_lines = BufReader::new(output_client).lines();

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "json-lines-test".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            )),
        )
        .await;
        assert_response_id(
            next_json_message(&mut output_lines).await,
            RequestId::Integer(1),
        );

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Notification(JsonRpcNotification::new(
                METHOD_INITIALIZED,
                Some(json!({})),
            )),
        )
        .await;
        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_AGENT_SESSION_START,
                Some(json!({
                    "sessionId": "sess_external",
                    "threadId": "thread_external",
                    "appId": "content-studio",
                    "workspaceId": "default"
                })),
            )),
        )
        .await;
        assert_response_id(
            next_json_message(&mut output_lines).await,
            RequestId::Integer(2),
        );

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "sess_external",
                    "input": {
                        "text": "draft"
                    }
                })),
            )),
        )
        .await;
        let event_turn_id = match next_json_message(&mut output_lines).await {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["type"], "turn.accepted");
                event["turnId"].as_str().expect("event turn id").to_string()
            }
            other => panic!("expected sync turn notification, got {other:?}"),
        };
        let turn_id = match next_json_message(&mut output_lines).await {
            JsonRpcMessage::Response(response) => response.result["turn"]["turnId"]
                .as_str()
                .expect("turn id")
                .to_string(),
            other => panic!("expected turn response, got {other:?}"),
        };
        assert_eq!(turn_id, event_turn_id);

        server
            .append_external_runtime_events(
                "sess_external",
                Some(&turn_id),
                vec![RuntimeEvent::new(
                    "message.delta",
                    json!({ "text": "stdio async delta" }),
                )],
            )
            .expect("append external event");

        match next_json_message(&mut output_lines).await {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], "sess_external");
                assert_eq!(event["turnId"], turn_id);
                assert_eq!(event["type"], "message.delta");
                assert_eq!(event["payload"]["text"], "stdio async delta");
            }
            other => panic!("expected outbound notification, got {other:?}"),
        }

        drop(input_client);
        runner.await.expect("runner join").expect("runner result");
    }

    #[tokio::test]
    async fn json_lines_loop_streams_external_backend_events_before_turn_response() {
        let Some(node) = node_binary() else {
            return;
        };
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let script_path = temp_dir.path().join("external-backend-stream.mjs");
        std::fs::write(
            &script_path,
            r#"
              import { setTimeout as delay } from 'node:timers/promises';
              console.log(JSON.stringify({
                type: 'message.delta',
                payload: { chunk: 1, text: 'hello' }
              }));
              await delay(10);
              console.log(JSON.stringify({
                type: 'message.delta',
                payload: { chunk: 2, text: 'world' }
              }));
            "#,
        )
        .expect("write backend script");

        let server = AppServerRuntimeFactory::external_app_server(
            ExternalBackendConfig::new(node)
                .with_args([script_path.to_string_lossy().to_string()])
                .with_timeout_ms(2_000),
        );
        let (mut input_client, input_server) = tokio::io::duplex(4096);
        let (output_server, output_client) = tokio::io::duplex(4096);
        let runner =
            tokio::spawn(async move { run_json_lines(server, input_server, output_server).await });
        let mut output_lines = BufReader::new(output_client).lines();

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "content-studio".to_string(),
                            title: None,
                            version: Some("0.1.0".to_string()),
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            )),
        )
        .await;
        assert_response_id(
            next_json_message(&mut output_lines).await,
            RequestId::Integer(1),
        );

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Notification(JsonRpcNotification::new(
                METHOD_INITIALIZED,
                Some(json!({})),
            )),
        )
        .await;
        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_AGENT_SESSION_START,
                Some(json!({
                    "sessionId": "sess_external_stream_stdio",
                    "threadId": "thread_external_stream_stdio",
                    "appId": "content-studio",
                    "workspaceId": "default"
                })),
            )),
        )
        .await;
        assert_response_id(
            next_json_message(&mut output_lines).await,
            RequestId::Integer(2),
        );

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "sess_external_stream_stdio",
                    "turnId": "turn_external_stream_stdio",
                    "input": {
                        "text": "draft"
                    }
                })),
            )),
        )
        .await;

        assert_scoped_agent_event_notification(
            &next_json_message(&mut output_lines).await,
            "sess_external_stream_stdio",
            "thread_external_stream_stdio",
            "message.delta",
            "turn_external_stream_stdio",
            json!({ "chunk": 1, "text": "hello" }),
        );
        assert_scoped_agent_event_notification(
            &next_json_message(&mut output_lines).await,
            "sess_external_stream_stdio",
            "thread_external_stream_stdio",
            "message.delta",
            "turn_external_stream_stdio",
            json!({ "chunk": 2, "text": "world" }),
        );
        match next_json_message(&mut output_lines).await {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.id, RequestId::Integer(3));
                assert_eq!(
                    response.result["turn"]["turnId"],
                    "turn_external_stream_stdio"
                );
            }
            other => panic!("expected turn response after streamed events, got {other:?}"),
        }

        drop(input_client);
        runner.await.expect("runner join").expect("runner result");
    }

    #[tokio::test]
    async fn json_lines_loop_streams_turn_failed_after_partial_external_backend_events() {
        let Some(node) = node_binary() else {
            return;
        };
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let script_path = temp_dir.path().join("external-backend-stream-fails.mjs");
        std::fs::write(
            &script_path,
            r#"
              console.log(JSON.stringify({
                type: 'message.delta',
                payload: { chunk: 1, text: 'partial' }
              }));
              console.error('external backend crashed after partial output');
              process.exit(7);
            "#,
        )
        .expect("write backend script");

        let server = AppServerRuntimeFactory::external_app_server(
            ExternalBackendConfig::new(node)
                .with_args([script_path.to_string_lossy().to_string()])
                .with_timeout_ms(2_000),
        );
        let (mut input_client, input_server) = tokio::io::duplex(4096);
        let (output_server, output_client) = tokio::io::duplex(4096);
        let runner =
            tokio::spawn(async move { run_json_lines(server, input_server, output_server).await });
        let mut output_lines = BufReader::new(output_client).lines();

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "content-studio".to_string(),
                            title: None,
                            version: Some("0.1.0".to_string()),
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            )),
        )
        .await;
        assert_response_id(
            next_json_message(&mut output_lines).await,
            RequestId::Integer(1),
        );

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Notification(JsonRpcNotification::new(
                METHOD_INITIALIZED,
                Some(json!({})),
            )),
        )
        .await;
        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_AGENT_SESSION_START,
                Some(json!({
                    "sessionId": "sess_external_stream_fail_stdio",
                    "threadId": "thread_external_stream_fail_stdio",
                    "appId": "content-studio",
                    "workspaceId": "default"
                })),
            )),
        )
        .await;
        assert_response_id(
            next_json_message(&mut output_lines).await,
            RequestId::Integer(2),
        );

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "sess_external_stream_fail_stdio",
                    "turnId": "turn_external_stream_fail_stdio",
                    "input": {
                        "text": "draft"
                    }
                })),
            )),
        )
        .await;

        assert_scoped_agent_event_notification(
            &next_json_message(&mut output_lines).await,
            "sess_external_stream_fail_stdio",
            "thread_external_stream_fail_stdio",
            "message.delta",
            "turn_external_stream_fail_stdio",
            json!({ "chunk": 1, "text": "partial" }),
        );
        match next_json_message(&mut output_lines).await {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], "sess_external_stream_fail_stdio");
                assert_eq!(event["threadId"], "thread_external_stream_fail_stdio");
                assert_eq!(event["turnId"], "turn_external_stream_fail_stdio");
                assert_eq!(event["type"], "turn.failed");
                assert!(event["payload"]["message"]
                    .as_str()
                    .expect("failure message")
                    .contains("external backend crashed after partial output"));
            }
            other => panic!("expected turn.failed notification, got {other:?}"),
        }
        match next_json_message(&mut output_lines).await {
            JsonRpcMessage::Error(error) => {
                assert_eq!(error.id, RequestId::Integer(3));
                assert_eq!(error.error.code, error_codes::RUNTIME_ERROR);
                assert!(error
                    .error
                    .message
                    .contains("external backend crashed after partial output"));
            }
            other => panic!("expected turn error response after turn.failed, got {other:?}"),
        }

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(4),
                METHOD_EVIDENCE_EXPORT,
                Some(json!({
                    "sessionId": "sess_external_stream_fail_stdio",
                    "turnId": "turn_external_stream_fail_stdio",
                    "includeEvents": true,
                    "includeArtifacts": true
                })),
            )),
        )
        .await;
        match next_json_message(&mut output_lines).await {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.id, RequestId::Integer(4));
                assert_eq!(
                    response.result["session"]["sessionId"],
                    "sess_external_stream_fail_stdio"
                );
                assert_eq!(
                    response.result["turns"][0]["turnId"],
                    "turn_external_stream_fail_stdio"
                );
                let events = response.result["events"].as_array().expect("events");
                assert_eq!(events[0]["type"], "message.delta");
                assert_eq!(events[1]["type"], "turn.failed");
                assert!(events[1]["payload"]["message"]
                    .as_str()
                    .expect("evidence failure message")
                    .contains("external backend crashed after partial output"));
                assert!(response.result["artifacts"]
                    .as_array()
                    .expect("artifacts")
                    .is_empty());
            }
            other => panic!("expected evidence export response after failed turn, got {other:?}"),
        }

        drop(input_client);
        runner.await.expect("runner join").expect("runner result");
    }

    async fn initialize(server: &AppServer) {
        request(
            server,
            1,
            METHOD_INITIALIZE,
            serde_json::to_value(InitializeParams {
                client_info: ClientInfo {
                    name: "test".to_string(),
                    title: None,
                    version: None,
                },
                capabilities: ClientCapabilities::default(),
            })
            .expect("params"),
        )
        .await;
        server
            .handle_message(JsonRpcMessage::Notification(JsonRpcNotification::new(
                METHOD_INITIALIZED,
                Some(json!({})),
            )))
            .await
            .expect("initialized");
    }

    async fn request(
        server: &AppServer,
        id: i64,
        method: &str,
        params: serde_json::Value,
    ) -> serde_json::Value {
        match server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(id),
                method,
                Some(params),
            )))
            .await
            .expect("handle")
            .remove(0)
        {
            JsonRpcMessage::Response(response) => response.result,
            JsonRpcMessage::Error(error) => panic!("unexpected error: {error:?}"),
            other => panic!("unexpected message: {other:?}"),
        }
    }

    async fn write_json_message(writer: &mut tokio::io::DuplexStream, message: JsonRpcMessage) {
        let line = encode_message(&message).expect("encode");
        writer.write_all(line.as_bytes()).await.expect("write");
        writer.flush().await.expect("flush");
    }

    async fn next_json_message(
        lines: &mut tokio::io::Lines<BufReader<tokio::io::DuplexStream>>,
    ) -> JsonRpcMessage {
        let line = tokio::time::timeout(std::time::Duration::from_secs(1), lines.next_line())
            .await
            .expect("output line timeout")
            .expect("read line")
            .expect("output line");
        decode_message(&line).expect("decode")
    }

    #[cfg(feature = "aster-backend")]
    fn assert_agent_event_notification(
        message: &JsonRpcMessage,
        expected_type: &str,
        expected_turn_id: &str,
        expected_payload: serde_json::Value,
    ) {
        assert_scoped_agent_event_notification(
            message,
            "sess_flow",
            "thread_flow",
            expected_type,
            expected_turn_id,
            expected_payload,
        );
    }

    fn assert_scoped_agent_event_notification(
        message: &JsonRpcMessage,
        expected_session_id: &str,
        expected_thread_id: &str,
        expected_type: &str,
        expected_turn_id: &str,
        expected_payload: serde_json::Value,
    ) {
        match message {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], expected_session_id);
                assert_eq!(event["threadId"], expected_thread_id);
                assert_eq!(event["turnId"], expected_turn_id);
                assert_eq!(event["type"], expected_type);
                assert_eq!(event["payload"], expected_payload);
            }
            other => panic!("expected agent event notification, got {other:?}"),
        }
    }

    fn node_binary() -> Option<String> {
        let candidates = std::env::var("NODE")
            .ok()
            .into_iter()
            .chain(["node".to_string()]);
        for candidate in candidates {
            if std::process::Command::new(&candidate)
                .arg("--version")
                .output()
                .is_ok_and(|output| output.status.success())
            {
                return Some(candidate);
            }
        }
        None
    }

    fn assert_response_id(message: JsonRpcMessage, expected_id: RequestId) {
        match message {
            JsonRpcMessage::Response(response) => assert_eq!(response.id, expected_id),
            other => panic!("expected response, got {other:?}"),
        }
    }
}
