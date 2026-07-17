mod agent_identity_store;
mod agent_mailbox_store;
mod agent_runtime_registry;
mod agent_ui_event_schema;
mod agent_ui_sequence_verifier;
mod automation_execution;
mod capability;
mod execution_process;
mod external_backend;
mod file_checkpoint;
mod file_checkpoint_snapshot;
mod gateway_tunnel;
mod knowledge_builder_runtime;
mod local_data_source;
mod mcp_elicitation;
mod media_runtime_contract;
mod media_task;
mod media_task_payload;
mod media_task_worker;
mod memory_store;
mod model_route_assembly;
mod model_route_execution;
mod model_task_contract;
mod objective;
mod otel_trace;
mod plugin_packages;
mod processor;
mod project_shell;
mod runtime;
mod runtime_backend;
mod runtime_factory;
mod server_request;
mod skill_registry;
mod trace_context;

pub use app_server_protocol::error_codes;
pub use app_server_protocol::AgentInput;
pub use app_server_protocol::AgentSession;
pub use app_server_protocol::AgentSessionActionReplayParams;
pub use app_server_protocol::AgentSessionActionReplayResponse;
pub use app_server_protocol::AgentSessionActionRespondParams;
pub use app_server_protocol::AgentSessionActionRespondResponse;
pub use app_server_protocol::AgentSessionActionScope;
pub use app_server_protocol::AgentSessionActionType;
pub use app_server_protocol::AgentSessionAnalysisHandoffExportParams;
pub use app_server_protocol::AgentSessionAnalysisHandoffExportResponse;
pub use app_server_protocol::AgentSessionApprovalDecision;
pub use app_server_protocol::AgentSessionHandoffArtifact;
pub use app_server_protocol::AgentSessionHandoffBundleExportParams;
pub use app_server_protocol::AgentSessionHandoffBundleExportResponse;
pub use app_server_protocol::AgentSessionMediaReadParams;
pub use app_server_protocol::AgentSessionMediaReadResponse;
pub use app_server_protocol::AgentSessionReplayCaseExportParams;
pub use app_server_protocol::AgentSessionReplayCaseExportResponse;
pub use app_server_protocol::AgentSessionReviewDecision;
pub use app_server_protocol::AgentSessionReviewDecisionSaveParams;
pub use app_server_protocol::AgentSessionReviewDecisionTemplateExportParams;
pub use app_server_protocol::AgentSessionReviewDecisionTemplateExportResponse;
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
pub use app_server_protocol::WorkflowReadParams;
pub use app_server_protocol::WorkflowReadResponse;
pub use app_server_protocol::METHOD_AGENT_SESSION_ACTION_REPLAY;
pub use app_server_protocol::METHOD_AGENT_SESSION_ACTION_RESPOND;
pub use app_server_protocol::METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT;
pub use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
pub use app_server_protocol::METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT;
pub use app_server_protocol::METHOD_AGENT_SESSION_MEDIA_READ;
pub use app_server_protocol::METHOD_AGENT_SESSION_READ;
pub use app_server_protocol::METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT;
pub use app_server_protocol::METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE;
pub use app_server_protocol::METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT;
pub use app_server_protocol::METHOD_AGENT_SESSION_START;
pub use app_server_protocol::METHOD_AGENT_SESSION_TURN_CANCEL;
pub use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
pub use app_server_protocol::METHOD_ARTIFACT_READ;
pub use app_server_protocol::METHOD_CAPABILITY_LIST;
pub use app_server_protocol::METHOD_EVIDENCE_EXPORT;
pub use app_server_protocol::METHOD_INITIALIZE;
pub use app_server_protocol::METHOD_INITIALIZED;
pub use app_server_protocol::METHOD_WORKFLOW_READ;
use app_server_transport::decode_message;
use app_server_transport::encode_message;
use app_server_transport::start_stdio_connection;
use app_server_transport::ConnectionId;
use app_server_transport::OutgoingMessage;
use app_server_transport::QueuedOutgoingMessage;
use app_server_transport::TransportError;
use app_server_transport::TransportEvent;
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
pub use knowledge_builder_runtime::KnowledgeBuilderRuntimeExecutor;
pub use knowledge_builder_runtime::NativeKnowledgeBuilderRuntimeExecutor;
pub use local_data_source::LocalAppDataSource;
pub use memory_store::LocalMemoryBackend;
pub use memory_store::MemoryBackend;
pub use memory_store::RolloutSummaryWriteParams;
pub use otel_trace::init_app_server_otel_from_env;
pub use otel_trace::AppServerOtelGuard;
use processor::event_notification_jsonrpc;
use processor::RequestProcessor;
pub(crate) use runtime::export_trace_events_from_store_to_path;
pub(crate) use runtime::summarize_trace_event_store;
pub use runtime::ActionRespondRequest;
pub use runtime::AppDataSource;
pub use runtime::ArtifactContentProvider;
pub use runtime::ArtifactContentRequest;
pub use runtime::AutomationManagementAppDataSource;
pub use runtime::AutomationOverviewAppDataSource;
pub use runtime::BasicEvidenceExportProvider;
pub use runtime::CancelExecutionRequest;
pub use runtime::ConnectAppDataSource;
pub use runtime::DiagnosticsAppDataSource;
pub use runtime::EventLogRecord;
pub use runtime::EventLogWriter;
pub use runtime::EvidenceExportProvider;
pub use runtime::EvidencePackRequest;
pub use runtime::ExecutionBackend;
pub use runtime::ExecutionRequest;
pub use runtime::FileCheckpointSnapshotReadRequest;
pub use runtime::FileCheckpointSnapshotRecord;
pub use runtime::FileCheckpointSnapshotSaveRequest;
pub use runtime::FileCheckpointSnapshotStore;
pub use runtime::FilesystemArtifactContentProvider;
pub use runtime::FilesystemFileCheckpointSnapshotStore;
pub use runtime::FilesystemOutputSnapshotStore;
pub use runtime::GatewayAppDataSource;
pub use runtime::InlineArtifactContentProvider;
pub use runtime::KnowledgeAppDataSource;
pub use runtime::ManagedObjectiveAuditUpdate;
pub use runtime::McpAppDataSource;
pub use runtime::MediaAppDataSource;
pub use runtime::MemoryAppDataSource;
pub use runtime::MockBackend;
pub use runtime::ModelProviderAppDataSource;
pub use runtime::NoopAppDataSource;
pub use runtime::NoopEvidenceExportProvider;
pub use runtime::NoopFileCheckpointSnapshotStore;
pub use runtime::NoopOutputSnapshotStore;
pub use runtime::OutputSnapshotReadRequest;
pub use runtime::OutputSnapshotRecord;
pub use runtime::OutputSnapshotSaveRequest;
pub use runtime::OutputSnapshotStore;
pub use runtime::PluginDataSource;
pub use runtime::ProjectionRepair;
pub use runtime::ProjectionStore;
pub use runtime::RightSurfaceAppDataSource;
pub use runtime::RuntimeCore;
pub use runtime::RuntimeCoreError;
pub use runtime::RuntimeCoreEventAppender;
pub use runtime::RuntimeCoreOutput;
pub use runtime::RuntimeEvent;
pub use runtime::RuntimeEventSink;
pub use runtime::RuntimeHostContext;
pub use runtime::SessionAppDataSource;
pub use runtime::SidecarRef;
pub use runtime::SidecarStore;
pub use runtime::SidecarWriteRequest;
pub use runtime::SkillAppDataSource;
pub use runtime::StorageRoots;
pub use runtime::ToolInventoryReadRequest;
pub use runtime::TraceEventWriter;
pub use runtime::UnavailableBackend;
pub use runtime::UsageStatsAppDataSource;
pub use runtime::VoiceAppDataSource;
pub use runtime::WorkspaceAppDataSource;
pub use runtime::WorkspaceObjectCanvasReplayReadiness;
pub use runtime::WorkspaceObjectCanvasReplayReadinessListParams;
pub use runtime::WorkspaceObjectCanvasSnapshot;
pub use runtime::WorkspaceObjectCanvasSnapshotListParams;
pub use runtime::WorkspaceSkillBindingAppDataSource;
pub(crate) use runtime::TRACE_EVENT_MAX_FILES_PER_SESSION;
pub use runtime_backend::RuntimeBackend;
pub use runtime_factory::AppServerBackendMode;
pub use runtime_factory::AppServerRuntimeFactory;
pub use runtime_factory::UnsupportedBackendMode;
pub use server_request::ServerRequestError;
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

struct ServerRequestClient {
    connection_id: ConnectionId,
    writer: TransportWriter,
}

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
    #[error(transparent)]
    ServerRequest(#[from] ServerRequestError),
}

#[derive(Clone)]
pub struct AppServer {
    processor: RequestProcessor,
    outbound_messages: broadcast::Sender<JsonRpcMessage>,
    transport_writers: TransportWriters,
    server_requests: server_request::ServerRequestRouter,
    mcp_elicitation_requests: mcp_elicitation::ElicitationRequestSource,
}

#[derive(Clone)]
pub struct AppServerEventBridge {
    runtime_events: RuntimeCoreEventAppender,
    outbound_messages: broadcast::Sender<JsonRpcMessage>,
    transport_writers: TransportWriters,
}

impl AppServer {
    #[cfg(test)]
    pub fn new() -> Self {
        Self::with_runtime(RuntimeCore::default())
    }

    pub fn with_runtime(runtime: RuntimeCore) -> Self {
        let (outbound_messages, _) = broadcast::channel(OUTBOUND_MESSAGE_CAPACITY);
        Self {
            processor: RequestProcessor::new(runtime),
            outbound_messages,
            transport_writers: Arc::new(Mutex::new(HashMap::new())),
            server_requests: server_request::ServerRequestRouter::default(),
            mcp_elicitation_requests: mcp_elicitation::ElicitationRequestSource::default(),
        }
    }

    pub fn with_mcp_elicitation_router(
        mut self,
        router: lime_mcp::ElicitationRequestRouter,
    ) -> Result<Self, lime_mcp::ElicitationRouterError> {
        self.mcp_elicitation_requests =
            mcp_elicitation::ElicitationRequestSource::subscribe(router)?;
        Ok(self)
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
            JsonRpcMessage::Response(_response) => {
                #[cfg(test)]
                self.resolve_test_server_request_response(_response.id, _response.result);
                Ok(Vec::new())
            }
            JsonRpcMessage::Error(_response) => {
                #[cfg(test)]
                self.resolve_test_server_request_error(_response.id, _response.error);
                Ok(Vec::new())
            }
        }
    }

    async fn handle_transport_message(
        &self,
        connection_id: ConnectionId,
        message: JsonRpcMessage,
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        match message {
            JsonRpcMessage::Response(response) => {
                self.resolve_transport_server_request_response(
                    connection_id,
                    response.id,
                    response.result,
                );
                Ok(Vec::new())
            }
            JsonRpcMessage::Error(response) => {
                self.resolve_transport_server_request_error(
                    connection_id,
                    response.id,
                    response.error,
                );
                Ok(Vec::new())
            }
            message => self.handle_message(message).await,
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
            JsonRpcMessage::Response(_response) => {
                #[cfg(test)]
                self.resolve_test_server_request_response(_response.id, _response.result);
                Ok(Vec::new())
            }
            JsonRpcMessage::Error(_response) => {
                #[cfg(test)]
                self.resolve_test_server_request_error(_response.id, _response.error);
                Ok(Vec::new())
            }
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

    pub async fn send_server_request(
        &self,
        method: impl Into<String>,
        params: impl serde::Serialize,
    ) -> Result<serde_json::Value, AppServerError> {
        self.begin_server_request(method, params)
            .await?
            .wait()
            .await
            .map_err(AppServerError::from)
    }

    fn server_request_client(&self) -> Result<ServerRequestClient, AppServerError> {
        let writers = self
            .transport_writers
            .lock()
            .expect("app-server transport writer mutex poisoned")
            .iter()
            .map(|(connection_id, writer)| (*connection_id, writer.clone()))
            .collect::<Vec<_>>();
        let client_count = writers.len();
        if client_count == 0 {
            return Err(ServerRequestError::ClientUnavailable.into());
        }
        if client_count != 1 {
            return Err(ServerRequestError::ClientAmbiguous { client_count }.into());
        }

        let (connection_id, writer) = writers
            .into_iter()
            .next()
            .expect("one transport writer was counted");
        Ok(ServerRequestClient {
            connection_id,
            writer,
        })
    }

    async fn send_to_server_request_client(
        &self,
        client: ServerRequestClient,
        message: JsonRpcMessage,
    ) -> Result<(), AppServerError> {
        client
            .writer
            .send(QueuedOutgoingMessage::new(OutgoingMessage::from(message)))
            .await
            .map_err(|_| AppServerError::ConnectionWriterClosed {
                connection_id: client.connection_id,
            })
    }

    fn cancel_pending_server_requests(&self, reason: &str) {
        self.server_requests.cancel_all(reason);
    }

    #[cfg(test)]
    fn resolve_test_server_request_response(&self, id: RequestId, result: serde_json::Value) {
        let request_id = id.clone();
        if let Err(error) = self.server_requests.resolve_response(id, result) {
            tracing::warn!(%request_id, %error, "dropping unmatched App Server test response");
        }
    }

    #[cfg(test)]
    fn resolve_test_server_request_error(&self, id: RequestId, response: JsonRpcError) {
        let request_id = id.clone();
        if let Err(error) = self.server_requests.resolve_error(id, response) {
            tracing::warn!(%request_id, %error, "dropping unmatched App Server test error");
        }
    }

    fn resolve_transport_server_request_response(
        &self,
        connection_id: ConnectionId,
        id: RequestId,
        result: serde_json::Value,
    ) {
        let request_id = id.clone();
        if let Err(error) =
            self.server_requests
                .resolve_transport_response(connection_id, id, result)
        {
            tracing::warn!(%request_id, %connection_id, %error, "dropping unmatched App Server transport response");
        }
    }

    fn resolve_transport_server_request_error(
        &self,
        connection_id: ConnectionId,
        id: RequestId,
        response: JsonRpcError,
    ) {
        let request_id = id.clone();
        if let Err(error) =
            self.server_requests
                .resolve_transport_error(connection_id, id, response)
        {
            tracing::warn!(%request_id, %connection_id, %error, "dropping unmatched App Server transport error");
        }
    }
}

pub fn spawn_image_task_worker_scheduler(
    db: lime_core::database::DbConnection,
    sidecar_store: Option<Arc<SidecarStore>>,
) -> tokio::task::JoinHandle<()> {
    media_task_worker::spawn_image_task_worker_scheduler(
        media_task_worker::ImageTaskWorkerContext::new(db).with_sidecar_store(sidecar_store),
    )
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
        self.publish_events(&messages);
        Ok(messages)
    }

    fn publish_events(&self, messages: &[JsonRpcMessage]) {
        for message in messages {
            let _ = self.outbound_messages.send(message.clone());
            enqueue_transport_outbound_message(&self.transport_writers, message.clone());
        }
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
    let mcp_elicitation_shutdown = tokio_util::sync::CancellationToken::new();
    let mcp_elicitation_pump = tokio::spawn(mcp_elicitation::run_request_pump(
        server.clone(),
        server.mcp_elicitation_requests.clone(),
        mcp_elicitation_shutdown.clone(),
    ));

    let transport_result = async {
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
                            server.server_requests.cancel_owner(
                                server_request::ServerRequestOwner::Transport(connection_id),
                                "App Server transport disconnected",
                            );
                            break;
                        }
                        TransportEvent::IncomingMessage {
                            connection_id,
                            message,
                        } => {
                            if should_spawn_transport_request(&message) {
                                spawn_transport_request(
                                    server.clone(),
                                    connection_id,
                                    message,
                                    streamed_tx.clone(),
                                );
                                continue;
                            }
                            for response in server
                                .handle_transport_message(connection_id, message)
                                .await?
                            {
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
        Ok(())
    }
    .await;

    finish_json_lines(
        &server,
        mcp_elicitation_shutdown,
        mcp_elicitation_pump,
        transport_result,
    )
    .await
}

async fn finish_json_lines(
    server: &AppServer,
    mcp_elicitation_shutdown: tokio_util::sync::CancellationToken,
    mcp_elicitation_pump: tokio::task::JoinHandle<()>,
    transport_result: Result<(), AppServerError>,
) -> Result<(), AppServerError> {
    server.cancel_pending_server_requests("App Server transport stopped");
    mcp_elicitation_shutdown.cancel();
    let _ = mcp_elicitation_pump.await;
    server.clear_transport_writers();
    transport_result
}

fn spawn_transport_request(
    server: AppServer,
    connection_id: ConnectionId,
    message: JsonRpcMessage,
    streamed_tx: mpsc::UnboundedSender<StreamedTransportMessage>,
) {
    tokio::spawn(async move {
        if should_stream_transport_request(&message) {
            let mut event_callback = |message: JsonRpcMessage| {
                let _ = streamed_tx.send(Ok((connection_id, message)));
            };
            match server
                .handle_message_streaming(message, &mut event_callback)
                .await
            {
                Ok(messages) => {
                    for message in messages {
                        let _ = streamed_tx.send(Ok((connection_id, message)));
                    }
                }
                Err(error) => {
                    let _ = streamed_tx.send(Err(error));
                }
            }
            return;
        }

        match server.handle_message(message).await {
            Ok(messages) => {
                for message in messages {
                    let _ = streamed_tx.send(Ok((connection_id, message)));
                }
            }
            Err(error) => {
                let _ = streamed_tx.send(Err(error));
            }
        }
    });
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

fn should_stream_transport_request(message: &JsonRpcMessage) -> bool {
    matches!(
        message,
        JsonRpcMessage::Request(request)
            if request.method == METHOD_AGENT_SESSION_TURN_START
                || request.method == METHOD_AGENT_SESSION_MEDIA_READ
                    && request
                        .params
                        .as_ref()
                        .and_then(|params| params.get("stream"))
                        .and_then(serde_json::Value::as_bool)
                        .unwrap_or(false)
    )
}

fn should_spawn_transport_request(message: &JsonRpcMessage) -> bool {
    matches!(
        message,
        JsonRpcMessage::Request(request)
            if request.method != METHOD_INITIALIZE
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentSessionTurnStartParams;
    use app_server_protocol::ClientCapabilities;
    use app_server_protocol::ClientInfo;
    use app_server_protocol::InitializeParams;
    use app_server_protocol::RequestId;
    use app_server_protocol::METHOD_AGENT_SESSION_LIST;
    use serde_json::json;
    use std::sync::Arc;
    use tokio::io::AsyncBufReadExt;
    use tokio::io::AsyncWriteExt;
    use tokio::io::BufReader;
    #[tokio::test]
    async fn business_methods_require_initialized_notification() {
        let server = AppServer::new();

        let blocked_cases = [
            (
                1,
                METHOD_AGENT_SESSION_START,
                json!({ "appId": "content-studio" }),
            ),
            (
                2,
                app_server_protocol::METHOD_WORKSPACE_UPDATE,
                json!({ "id": "workspace-main", "name": "Main" }),
            ),
            (
                3,
                app_server_protocol::METHOD_WORKSPACE_DELETE,
                json!({ "id": "workspace-main", "deleteDirectory": false }),
            ),
        ];

        for (id, method, params) in blocked_cases {
            let response = server
                .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                    RequestId::Integer(id),
                    method,
                    Some(params),
                )))
                .await
                .expect("handle")
                .remove(0);

            match response {
                JsonRpcMessage::Error(error) => {
                    assert_eq!(error.error.code, error_codes::NOT_INITIALIZED);
                }
                other => panic!("expected error for {method}, got {other:?}"),
            }
        }

        initialize(&server).await;

        let workspace_cases = [
            (
                4,
                app_server_protocol::METHOD_WORKSPACE_UPDATE,
                json!({ "id": "workspace-main", "name": "Main" }),
                "workspace/update is not available without an app data source",
            ),
            (
                5,
                app_server_protocol::METHOD_WORKSPACE_DELETE,
                json!({ "id": "workspace-main", "deleteDirectory": false }),
                "workspace/delete is not available without an app data source",
            ),
        ];

        for (id, method, params, message) in workspace_cases {
            let response = server
                .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                    RequestId::Integer(id),
                    method,
                    Some(params),
                )))
                .await
                .expect("handle")
                .remove(0);

            match response {
                JsonRpcMessage::Error(error) => {
                    assert_eq!(error.error.code, error_codes::RUNTIME_ERROR);
                    assert_eq!(error.error.message, message);
                }
                other => panic!("expected runtime error for {method}, got {other:?}"),
            }
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
        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "item.started",
                "message.created",
                "item.completed",
                "turn.accepted"
            ]
        );
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
    async fn turn_start_rejects_parallel_active_turn_without_queue_flag() {
        let server = AppServer::new();
        initialize(&server).await;
        request(
            &server,
            2,
            METHOD_AGENT_SESSION_START,
            json!({
                "sessionId": "sess_single_active_jsonrpc",
                "threadId": "thread_single_active_jsonrpc",
                "appId": "agent-chat",
                "workspaceId": "default"
            }),
        )
        .await;
        request(
            &server,
            3,
            METHOD_AGENT_SESSION_TURN_START,
            json!({
                "sessionId": "sess_single_active_jsonrpc",
                "turnId": "turn_active",
                "input": {
                    "text": "running"
                }
            }),
        )
        .await;

        let messages = server
            .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(4),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "sess_single_active_jsonrpc",
                    "turnId": "turn_parallel",
                    "input": {
                        "text": "parallel"
                    }
                })),
            )))
            .await
            .expect("parallel turn start");

        match messages.first().expect("error response") {
            JsonRpcMessage::Error(error) => {
                assert_eq!(error.error.code, error_codes::TURN_ALREADY_ACTIVE);
                assert_eq!(error.error.message, "turn already active: turn_active");
            }
            other => panic!("expected active turn error, got {other:?}"),
        }

        let read = request(
            &server,
            5,
            METHOD_AGENT_SESSION_READ,
            json!({ "sessionId": "sess_single_active_jsonrpc" }),
        )
        .await;
        let turns = read["turns"].as_array().expect("turns");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0]["turnId"], "turn_active");
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

        assert_eq!(messages.len(), 5);
        let event_types = messages
            .iter()
            .skip(1)
            .map(|message| match message {
                JsonRpcMessage::Notification(notification) => {
                    assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                    notification.params.as_ref().expect("params")["event"]["type"]
                        .as_str()
                        .expect("event type")
                }
                other => panic!("expected notification, got {other:?}"),
            })
            .collect::<Vec<_>>();
        assert_eq!(
            event_types,
            vec![
                "item.started",
                "message.created",
                "item.completed",
                "turn.accepted"
            ]
        );
        let user_message = messages
            .iter()
            .find_map(|message| match message {
                JsonRpcMessage::Notification(notification)
                    if notification.params.as_ref().expect("params")["event"]["type"]
                        == "message.created" =>
                {
                    notification.params.as_ref()
                }
                _ => None,
            })
            .expect("user message notification");
        assert_eq!(
            user_message["event"]["payload"]["input"]["text"],
            "生成草稿"
        );
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

        assert_eq!(notifications.len(), 2);
        match &notifications[0] {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sequence"], 5);
                assert_eq!(event["type"], "item.started");
                assert_eq!(event["payload"]["item"]["kind"], "agentMessage");
            }
            other => panic!("expected notification, got {other:?}"),
        }
        match &notifications[1] {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sequence"], 6);
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

        let lifecycle_message =
            tokio::time::timeout(std::time::Duration::from_secs(1), outbound_messages.recv())
                .await
                .expect("outbound lifecycle message")
                .expect("broadcast lifecycle message");
        match lifecycle_message {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], "sess_external");
                assert_eq!(event["turnId"], turn_id);
                assert_eq!(event["type"], "item.started");
                assert_eq!(event["payload"]["item"]["kind"], "agentMessage");
            }
            other => panic!("expected outbound lifecycle notification, got {other:?}"),
        }
        let delta_message =
            tokio::time::timeout(std::time::Duration::from_secs(1), outbound_messages.recv())
                .await
                .expect("outbound delta message")
                .expect("broadcast delta message");
        match delta_message {
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
        let mut event_turn_id = None;
        for expected_type in [
            "item.started",
            "message.created",
            "item.completed",
            "turn.accepted",
        ] {
            match next_json_message(&mut output_lines).await {
                JsonRpcMessage::Notification(notification) => {
                    assert_eq!(notification.method, METHOD_AGENT_SESSION_EVENT);
                    let event = &notification.params.as_ref().expect("params")["event"];
                    assert_eq!(event["type"], expected_type);
                    if expected_type == "message.created" {
                        assert_eq!(event["payload"]["input"]["text"], "draft");
                    }
                    let current_turn_id =
                        event["turnId"].as_str().expect("event turn id").to_string();
                    if let Some(event_turn_id) = event_turn_id.as_ref() {
                        assert_eq!(&current_turn_id, event_turn_id);
                    } else {
                        event_turn_id = Some(current_turn_id);
                    }
                }
                other => panic!("expected sync turn notification, got {other:?}"),
            }
        }
        let event_turn_id = event_turn_id.expect("turn event identity");
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

        assert_next_scoped_agent_event_notification(
            &mut output_lines,
            "sess_external",
            "thread_external",
            "message.delta",
            &turn_id,
            json!({ "text": "stdio async delta" }),
        )
        .await;

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
                .with_timeout_ms(10_000),
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

        assert_next_scoped_agent_event_notification(
            &mut output_lines,
            "sess_external_stream_stdio",
            "thread_external_stream_stdio",
            "message.created",
            "turn_external_stream_stdio",
            json!({
                "attachments": [],
                "content": {
                    "kind": "inline_text",
                    "text": "draft",
                },
                "input": {
                    "attachments": [],
                    "text": "draft",
                },
                "role": "user",
                "visibility": "user_visible",
            }),
        )
        .await;
        assert_next_scoped_agent_event_notification(
            &mut output_lines,
            "sess_external_stream_stdio",
            "thread_external_stream_stdio",
            "message.delta",
            "turn_external_stream_stdio",
            json!({ "chunk": 1, "text": "hello" }),
        )
        .await;
        assert_next_scoped_agent_event_notification(
            &mut output_lines,
            "sess_external_stream_stdio",
            "thread_external_stream_stdio",
            "message.delta",
            "turn_external_stream_stdio",
            json!({ "chunk": 2, "text": "world" }),
        )
        .await;
        match next_json_message_with_timeout(&mut output_lines, std::time::Duration::from_secs(10))
            .await
        {
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
    async fn json_lines_loop_lists_sessions_while_external_turn_is_waiting_for_first_output() {
        let Some(node) = node_binary() else {
            return;
        };
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let script_path = temp_dir
            .path()
            .join("external-backend-waits-before-output.mjs");
        let trigger_path = temp_dir.path().join("release-backend-output");
        std::fs::write(
            &script_path,
            r#"
              import { access } from 'node:fs/promises';
              import { setTimeout as delay } from 'node:timers/promises';
              const triggerPath = process.argv[2];
              for (;;) {
                try {
                  await access(triggerPath);
                  break;
                } catch {
                  await delay(10);
                }
              }
              console.log(JSON.stringify({
                type: 'message.delta',
                payload: { text: 'late first output' }
              }));
            "#,
        )
        .expect("write backend script");

        let server = AppServerRuntimeFactory::external_app_server(
            ExternalBackendConfig::new(node)
                .with_args([
                    script_path.to_string_lossy().to_string(),
                    trigger_path.to_string_lossy().to_string(),
                ])
                .with_timeout_ms(10_000),
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
                    "sessionId": "sess_external_wait_stdio",
                    "threadId": "thread_external_wait_stdio",
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
                    "sessionId": "sess_external_wait_stdio",
                    "turnId": "turn_external_wait_stdio",
                    "input": {
                        "text": "draft"
                    }
                })),
            )),
        )
        .await;

        write_json_message(
            &mut input_client,
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(4),
                METHOD_AGENT_SESSION_LIST,
                Some(json!({ "limit": 10 })),
            )),
        )
        .await;
        let mut interleaved_messages = Vec::new();
        let list_response = loop {
            let message = next_json_message_with_timeout(
                &mut output_lines,
                std::time::Duration::from_millis(500),
            )
            .await;
            match message {
                JsonRpcMessage::Response(response) if response.id == RequestId::Integer(4) => {
                    break response;
                }
                message => interleaved_messages.push(message),
            }
        };
        let sessions = list_response.result["sessions"]
            .as_array()
            .expect("sessions array");
        assert!(
            sessions
                .iter()
                .any(|session| session["sessionId"] == "sess_external_wait_stdio"),
            "running session should be listed while backend waits"
        );

        std::fs::write(&trigger_path, b"continue").expect("release backend output");

        let expected_user_payload = json!({
            "attachments": [],
            "content": {
                "kind": "inline_text",
                "text": "draft",
            },
            "input": {
                "attachments": [],
                "text": "draft",
            },
            "role": "user",
            "visibility": "user_visible",
        });
        if let Some(message) = interleaved_messages.iter().find(|message| {
            let JsonRpcMessage::Notification(notification) = message else {
                return false;
            };
            notification
                .params
                .as_ref()
                .and_then(|params| params.pointer("/event/type"))
                .and_then(serde_json::Value::as_str)
                == Some("message.created")
        }) {
            assert_scoped_agent_event_notification(
                message,
                "sess_external_wait_stdio",
                "thread_external_wait_stdio",
                "message.created",
                "turn_external_wait_stdio",
                expected_user_payload,
            );
        } else {
            assert_next_scoped_agent_event_notification(
                &mut output_lines,
                "sess_external_wait_stdio",
                "thread_external_wait_stdio",
                "message.created",
                "turn_external_wait_stdio",
                expected_user_payload,
            )
            .await;
        }
        assert_next_scoped_agent_event_notification(
            &mut output_lines,
            "sess_external_wait_stdio",
            "thread_external_wait_stdio",
            "message.delta",
            "turn_external_wait_stdio",
            json!({ "text": "late first output" }),
        )
        .await;
        match next_json_message_with_timeout(&mut output_lines, std::time::Duration::from_secs(10))
            .await
        {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.id, RequestId::Integer(3));
                assert_eq!(
                    response.result["turn"]["turnId"],
                    "turn_external_wait_stdio"
                );
            }
            other => panic!("expected delayed turn response, got {other:?}"),
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
                .with_timeout_ms(10_000),
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

        assert_next_scoped_agent_event_notification(
            &mut output_lines,
            "sess_external_stream_fail_stdio",
            "thread_external_stream_fail_stdio",
            "message.created",
            "turn_external_stream_fail_stdio",
            json!({
                "attachments": [],
                "content": {
                    "kind": "inline_text",
                    "text": "draft",
                },
                "input": {
                    "attachments": [],
                    "text": "draft",
                },
                "role": "user",
                "visibility": "user_visible",
            }),
        )
        .await;
        assert_next_scoped_agent_event_notification(
            &mut output_lines,
            "sess_external_stream_fail_stdio",
            "thread_external_stream_fail_stdio",
            "message.delta",
            "turn_external_stream_fail_stdio",
            json!({ "chunk": 1, "text": "partial" }),
        )
        .await;
        match next_json_message_with_timeout(&mut output_lines, std::time::Duration::from_secs(10))
            .await
        {
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
        match next_json_message_with_timeout(&mut output_lines, std::time::Duration::from_secs(10))
            .await
        {
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
                let message_created_index = events
                    .iter()
                    .position(|event| event["type"] == "message.created")
                    .expect("message.created event");
                let message_delta_index = events
                    .iter()
                    .position(|event| event["type"] == "message.delta")
                    .expect("message.delta event");
                let turn_failed_index = events
                    .iter()
                    .position(|event| event["type"] == "turn.failed")
                    .expect("turn.failed event");
                assert!(
                    message_created_index < message_delta_index
                        && message_delta_index < turn_failed_index,
                    "stored event order should preserve created -> delta -> failed: {events:?}"
                );
                assert!(events[turn_failed_index]["payload"]["message"]
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
        next_json_message_with_timeout(lines, std::time::Duration::from_secs(1)).await
    }

    async fn next_json_message_with_timeout(
        lines: &mut tokio::io::Lines<BufReader<tokio::io::DuplexStream>>,
        timeout: std::time::Duration,
    ) -> JsonRpcMessage {
        let line = tokio::time::timeout(timeout, lines.next_line())
            .await
            .expect("output line timeout")
            .expect("read line")
            .expect("output line");
        decode_message(&line).expect("decode")
    }
    async fn assert_next_scoped_agent_event_notification(
        lines: &mut tokio::io::Lines<BufReader<tokio::io::DuplexStream>>,
        expected_session_id: &str,
        expected_thread_id: &str,
        expected_type: &str,
        expected_turn_id: &str,
        expected_payload: serde_json::Value,
    ) {
        for _ in 0..8 {
            let message =
                next_json_message_with_timeout(lines, std::time::Duration::from_secs(10)).await;
            let JsonRpcMessage::Notification(notification) = &message else {
                panic!("expected agent event notification {expected_type}, got {message:?}");
            };
            if notification.method != METHOD_AGENT_SESSION_EVENT {
                panic!("expected agentSession/event notification {expected_type}, got {message:?}");
            }
            let event_type = notification
                .params
                .as_ref()
                .and_then(|params| params.pointer("/event/type"))
                .and_then(serde_json::Value::as_str);
            if event_type != Some(expected_type) {
                continue;
            }
            assert_scoped_agent_event_notification(
                &message,
                expected_session_id,
                expected_thread_id,
                expected_type,
                expected_turn_id,
                expected_payload,
            );
            return;
        }
        panic!("expected agent event notification {expected_type}");
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
                assert_payload_matches_with_session_projection(
                    &event["payload"],
                    expected_payload,
                    expected_session_id,
                    expected_thread_id,
                    expected_turn_id,
                    "content-studio",
                    "default",
                );
            }
            other => panic!("expected agent event notification, got {other:?}"),
        }
    }

    fn assert_payload_matches_with_session_projection(
        actual_payload: &serde_json::Value,
        expected_payload: serde_json::Value,
        expected_session_id: &str,
        expected_thread_id: &str,
        expected_turn_id: &str,
        expected_app_id: &str,
        expected_workspace_id: &str,
    ) {
        let mut actual_payload_without_session = actual_payload.clone();
        let Some(actual_payload_object) = actual_payload_without_session.as_object_mut() else {
            assert_eq!(actual_payload_without_session, expected_payload);
            return;
        };
        let session = actual_payload_object
            .remove("session")
            .expect("event payload session projection");
        if let Some(item) = actual_payload_object.remove("item") {
            assert_eq!(item["sessionId"], expected_session_id);
            assert_eq!(item["threadId"], expected_thread_id);
            assert_eq!(item["turnId"], expected_turn_id);
            assert!(
                item["itemId"]
                    .as_str()
                    .is_some_and(|value| !value.is_empty()),
                "canonical itemId should be non-empty: {item:?}"
            );
            assert!(
                item["payload"].is_object(),
                "canonical item payload: {item:?}"
            );
        }
        assert_eq!(actual_payload_without_session, expected_payload);

        assert_eq!(session["appId"], expected_app_id);
        assert_eq!(session["workspaceId"], expected_workspace_id);
        assert!(
            session["createdAt"]
                .as_str()
                .is_some_and(|value| !value.is_empty()),
            "session.createdAt should be a non-empty string: {session:?}"
        );
        assert!(
            session["updatedAt"]
                .as_str()
                .is_some_and(|value| !value.is_empty()),
            "session.updatedAt should be a non-empty string: {session:?}"
        );
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

    #[test]
    fn initialized_requests_spawn_transport_tasks_without_racing_initialize() {
        assert!(should_spawn_transport_request(&JsonRpcMessage::Request(
            JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_AGENT_SESSION_MEDIA_READ,
                Some(json!({})),
            ),
        )));
        assert!(should_spawn_transport_request(&JsonRpcMessage::Request(
            JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({})),
            ),
        )));
        assert!(should_spawn_transport_request(&JsonRpcMessage::Request(
            JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_START,
                Some(json!({}))
            ),
        )));
        assert!(!should_spawn_transport_request(&JsonRpcMessage::Request(
            JsonRpcRequest::new(RequestId::Integer(4), METHOD_INITIALIZE, Some(json!({}))),
        )));
        assert!(!should_spawn_transport_request(
            &JsonRpcMessage::Notification(JsonRpcNotification::new(
                METHOD_INITIALIZED,
                Some(json!({})),
            )),
        ));
    }

    #[test]
    fn media_read_streaming_transport_requires_stream_flag() {
        assert!(should_stream_transport_request(&JsonRpcMessage::Request(
            JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_AGENT_SESSION_MEDIA_READ,
                Some(json!({ "stream": true })),
            ),
        )));
        assert!(!should_stream_transport_request(&JsonRpcMessage::Request(
            JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_AGENT_SESSION_MEDIA_READ,
                Some(json!({})),
            ),
        )));
        assert!(should_stream_transport_request(&JsonRpcMessage::Request(
            JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({})),
            ),
        )));
    }
}
