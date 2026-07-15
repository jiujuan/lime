mod agent_control;
mod agent_control_gateway;
mod agent_control_gateway_support;
mod agent_mailbox_delivery;
mod agent_terminal_activity;
mod app_data;
pub(crate) mod approval_cache;
mod approval_decision_contract;
mod article_workspace_action_projection;
mod article_workspace_artifact_document_projection;
mod article_workspace_edited_draft;
mod article_workspace_projection;
mod artifact_content;
mod artifact_document_versions;
mod artifact_projection;
mod artifact_reader;
mod artifact_sidecar;
mod automation;
mod backend;
mod browser_session;
mod canonical_thread_store;
#[cfg(test)]
mod canonical_thread_store_tests;
mod capabilities;
mod coding_activity_projection;
mod connect;
mod context_auto_compaction;
mod context_compaction;
mod context_media;
mod context_packet;
mod conversation_import;
mod diagnostics;
mod event_log;
mod event_store;
mod evidence_provider;
mod execution_request;
mod expert_role_switch;
mod exports;
mod file_checkpoint_projection;
mod file_system;
mod gateway;
mod gateway_runner;
mod imported_session_runtime;
mod knowledge;
mod load_context;
mod mcp;
mod media_task_read_model;
mod media_tasks;
mod memory;
pub(crate) mod memory_prompt;
mod model_providers;
mod objectives;
mod output_refs;
pub(crate) mod pending_action_descriptor;
mod permission_state_projection;
mod plugin_host_lifecycle;
mod plugin_task_runtime;
mod plugin_worker_orchestration;
mod plugin_worker_output_contract;
mod plugin_worker_runtime;
mod plugin_worker_streaming;
mod plugin_worker_turn;
mod plugin_worker_workflow;
mod plugin_worker_workflow_cancel;
mod plugin_worker_workflow_hooks;
mod plugin_worker_workflow_retry;
mod plugins;
mod project_git;
mod projection_item_events;
mod projection_payload_summary;
mod projection_protocol;
mod projection_repair;
#[cfg(test)]
mod projection_repair_tests;
mod projection_schema;
mod projection_status;
mod projection_store;
#[cfg(test)]
mod projection_store_tests;
pub(crate) mod provider_history;
mod read_model;
mod read_model_turn_usage;
mod right_surface;
mod service_projection;
mod session_control;
mod session_files;
mod session_lifecycle;
pub(crate) mod session_list_scope;
mod session_media_reader;
mod session_media_refs;
pub(crate) mod session_title;
pub(crate) mod sidecar_store;
mod skills;
mod soul;
mod status;
mod storage_roots;
mod thread_item_projection;
mod thread_read;
mod tool_item_projection;
mod tool_lifecycle;
mod trace;
mod trace_store;
mod turn_execution;
mod turn_input_events;
mod usage_stats;
mod value_fields;
mod voice;
pub(crate) mod workflow;
mod workspaces;

use crate::execution_process::ExecutionProcessServer;
pub use crate::file_checkpoint_snapshot::FileCheckpointSnapshotReadRequest;
pub use crate::file_checkpoint_snapshot::FileCheckpointSnapshotRecord;
pub use crate::file_checkpoint_snapshot::FileCheckpointSnapshotSaveRequest;
pub use crate::file_checkpoint_snapshot::FileCheckpointSnapshotStore;
pub use crate::file_checkpoint_snapshot::FilesystemFileCheckpointSnapshotStore;
pub use crate::file_checkpoint_snapshot::NoopFileCheckpointSnapshotStore;
pub use app_data::AppDataSource;
pub use app_data::AutomationManagementAppDataSource;
pub use app_data::AutomationOverviewAppDataSource;
pub use app_data::ConnectAppDataSource;
pub use app_data::DiagnosticsAppDataSource;
pub use app_data::GatewayAppDataSource;
pub use app_data::KnowledgeAppDataSource;
pub use app_data::McpAppDataSource;
pub use app_data::MediaAppDataSource;
pub use app_data::MemoryAppDataSource;
pub use app_data::ModelProviderAppDataSource;
pub use app_data::NoopAppDataSource;
pub use app_data::PluginDataSource;
pub use app_data::RightSurfaceAppDataSource;
pub use app_data::SessionAppDataSource;
pub use app_data::SkillAppDataSource;
pub use app_data::UsageStatsAppDataSource;
pub use app_data::VoiceAppDataSource;
pub use app_data::WorkspaceAppDataSource;
pub use app_data::WorkspaceObjectCanvasSnapshot;
pub use app_data::WorkspaceObjectCanvasSnapshotListParams;
pub use app_data::WorkspaceSkillBindingAppDataSource;
pub use artifact_content::FilesystemArtifactContentProvider;
pub use artifact_content::InlineArtifactContentProvider;
pub use backend::MockBackend;
pub use backend::UnavailableBackend;
pub use event_log::EventLogRecord;
pub use event_log::EventLogWriter;
pub use evidence_provider::BasicEvidenceExportProvider;
pub use evidence_provider::NoopEvidenceExportProvider;
pub use execution_request::ExecutionRequest;
pub use output_refs::FilesystemOutputSnapshotStore;
pub use output_refs::NoopOutputSnapshotStore;
pub use output_refs::OutputSnapshotReadRequest;
pub use output_refs::OutputSnapshotRecord;
pub use output_refs::OutputSnapshotSaveRequest;
pub use output_refs::OutputSnapshotStore;
pub(crate) use plugin_worker_streaming::ensure_workspace_patch_artifact_paths;
pub use projection_repair::ProjectionRepair;
pub use projection_store::ProjectionStore;
pub use right_surface::WorkspaceObjectCanvasReplayReadiness;
pub use right_surface::WorkspaceObjectCanvasReplayReadinessListParams;
pub use sidecar_store::SidecarRef;
pub use sidecar_store::SidecarStore;
pub use sidecar_store::SidecarWriteRequest;
pub use storage_roots::StorageRoots;
pub(crate) use trace_store::export_trace_events_from_store_to_path;
pub(crate) use trace_store::summarize_trace_event_store;
pub use trace_store::TraceEventWriter;
pub(crate) use trace_store::TRACE_EVENT_MAX_FILES_PER_SESSION;
pub(super) use value_fields::event_request_id;

use crate::CapabilityInventorySource;
use crate::CapabilitySource;
use crate::KnowledgeBuilderRuntimeExecutor;
use crate::NativeKnowledgeBuilderRuntimeExecutor;
use app_server_protocol::error_codes;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionActionType;
use app_server_protocol::AgentSessionApprovalDecision;
use app_server_protocol::AgentTurn;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::ClientInfo;
use app_server_protocol::EvidencePackSummary;
use app_server_protocol::JsonRpcError;
use app_server_protocol::ManagedObjectiveStatus;
use async_trait::async_trait;
use lime_browser_runtime::{BrowserProfileScope, BrowserRuntimeManager};
use lime_infra::telemetry::RequestLog;
use lime_infra::telemetry::TelemetryStore;
use model_provider::current_client::CurrentProviderMessage;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use thiserror::Error;
use value_fields::{
    json_string, metadata_string, new_id, optional_id_or_new, raw_string_field, string_array_field,
    string_field, timestamp, timestamp_seconds,
};

#[derive(Debug, Error)]
pub enum RuntimeCoreError {
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("turn not active: {0}")]
    TurnNotActive(String),
    #[error("session already exists: {0}")]
    SessionAlreadyExists(String),
    #[error("turn already active: {0}")]
    TurnAlreadyActive(String),
    #[error("capability denied: {0}")]
    CapabilityDenied(String),
    #[error("request canceled")]
    RequestCanceled,
    #[error("execution backend error: {0}")]
    Backend(String),
    #[error("action response error ({code}): {request_id}")]
    ActionResponse { code: String, request_id: String },
}

impl RuntimeCoreError {
    pub fn into_jsonrpc_error(self) -> JsonRpcError {
        match self {
            Self::SessionNotFound(session_id) => JsonRpcError::new(
                error_codes::SESSION_NOT_FOUND,
                format!("session not found: {session_id}"),
            ),
            Self::TurnNotActive(turn_id) => JsonRpcError::new(
                error_codes::TURN_NOT_ACTIVE,
                format!("turn not active: {turn_id}"),
            ),
            Self::SessionAlreadyExists(session_id) => JsonRpcError::new(
                error_codes::SESSION_ALREADY_EXISTS,
                format!("session already exists: {session_id}"),
            ),
            Self::TurnAlreadyActive(turn_id) => JsonRpcError::new(
                error_codes::TURN_ALREADY_ACTIVE,
                format!("turn already active: {turn_id}"),
            ),
            Self::CapabilityDenied(capability_id) => JsonRpcError::new(
                error_codes::CAPABILITY_DENIED,
                format!("capability denied: {capability_id}"),
            ),
            Self::RequestCanceled => {
                JsonRpcError::new(error_codes::REQUEST_CANCELLED, "request canceled")
            }
            Self::Backend(message) => JsonRpcError::new(error_codes::RUNTIME_ERROR, message),
            Self::ActionResponse { code, request_id } => JsonRpcError {
                code: error_codes::RUNTIME_ERROR,
                message: format!("action response failed: {code}"),
                data: Some(serde_json::json!({
                    "code": code,
                    "requestId": request_id,
                })),
            },
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RuntimeHostContext {
    pub client_name: Option<String>,
    pub client_version: Option<String>,
}

impl From<Option<ClientInfo>> for RuntimeHostContext {
    fn from(client_info: Option<ClientInfo>) -> Self {
        match client_info {
            Some(client_info) => Self {
                client_name: Some(client_info.name),
                client_version: client_info.version,
            },
            None => Self::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeEvent {
    pub event_type: String,
    pub payload: serde_json::Value,
}

impl RuntimeEvent {
    pub fn new(event_type: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            event_type: event_type.into(),
            payload,
        }
    }
}

pub trait RuntimeEventSink: Send {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError>;
}

type RuntimeEventCallback<'a> = dyn FnMut(AgentEvent) -> Result<(), RuntimeCoreError> + Send + 'a;

#[derive(Debug, Clone, PartialEq)]
pub struct ArtifactContentRequest {
    pub session: AgentSession,
    pub artifact: ArtifactSummary,
}

pub trait ArtifactContentProvider: Send + Sync {
    fn read_content(&self, request: &ArtifactContentRequest) -> Option<String>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct EvidencePackRequest {
    pub session: AgentSession,
    pub turns: Vec<AgentTurn>,
    pub events: Vec<AgentEvent>,
    pub artifacts: Vec<ArtifactSummary>,
    pub turn_runtime_metadata: BTreeMap<String, serde_json::Value>,
    pub request_logs: Vec<RequestLog>,
    pub workflow_audit_events: Vec<AgentEvent>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ManagedObjectiveAuditUpdate {
    pub status: ManagedObjectiveStatus,
    pub last_audit_summary: Option<String>,
    pub last_evidence_pack_ref: Option<String>,
    pub last_artifact_refs: Vec<String>,
    pub blocker_reason: Option<String>,
}

#[async_trait]
pub trait EvidenceExportProvider: Send + Sync {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeCoreOutput<T> {
    pub response: T,
    pub events: Vec<AgentEvent>,
}

#[derive(Debug, Clone)]
pub struct CancelExecutionRequest {
    pub host: RuntimeHostContext,
    pub session: AgentSession,
    pub turn: AgentTurn,
}

#[derive(Debug, Clone)]
pub struct ActionRespondRequest {
    pub host: RuntimeHostContext,
    pub session: AgentSession,
    pub turn: Option<AgentTurn>,
    pub request_id: String,
    pub action_type: AgentSessionActionType,
    pub decision: Option<AgentSessionApprovalDecision>,
    pub confirmed: bool,
    pub response: Option<String>,
    pub user_data: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub event_name: Option<String>,
    pub action_scope: Option<AgentSessionActionScope>,
    pub pending_action_descriptor: Option<agent_runtime::action_required::PendingActionDescriptor>,
}

impl ActionRespondRequest {
    pub fn runtime_metadata(&self) -> Option<&serde_json::Value> {
        self.metadata.as_ref()
    }
}

#[derive(Debug, Clone)]
pub struct ToolInventoryReadRequest {
    pub caller: Option<String>,
    pub workbench: bool,
    pub browser_assist: bool,
    pub metadata: Option<serde_json::Value>,
}

#[async_trait]
pub trait ExecutionBackend: Send + Sync {
    fn set_app_data_source(
        &self,
        _app_data_source: Arc<dyn AppDataSource>,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    fn effective_turn_runtime_options(
        &self,
        request: &ExecutionRequest,
        _first_sampling_turn: bool,
    ) -> Option<app_server_protocol::RuntimeOptions> {
        request.runtime_options.clone()
    }

    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError>;

    async fn start_turn_with_provider_history(
        &self,
        request: ExecutionRequest,
        _provider_history: Vec<CurrentProviderMessage>,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.start_turn(request, sink).await
    }

    async fn cancel_turn(
        &self,
        request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError>;

    async fn close_session(
        &self,
        _session_id: &str,
        _thread_id: &str,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError>;

    async fn read_tool_inventory(
        &self,
        _request: ToolInventoryReadRequest,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "runtime backend does not expose tool inventory".to_string(),
        ))
    }

    async fn prepare_runtime_worker_artifact_events(
        &self,
        _request: &ExecutionRequest,
        _events: &mut Vec<RuntimeEvent>,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn prepare_plugin_worker_request(
        &self,
        _request: &ExecutionRequest,
        _worker_request: &mut serde_json::Value,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

#[derive(Clone)]
pub struct RuntimeCore {
    pub(in crate::runtime) state: Arc<Mutex<RuntimeCoreState>>,
    backend: Arc<dyn ExecutionBackend>,
    capability_source: Arc<dyn CapabilitySource>,
    pub(in crate::runtime) artifact_content_provider: Arc<dyn ArtifactContentProvider>,
    pub(in crate::runtime) file_checkpoint_snapshot_store: Arc<dyn FileCheckpointSnapshotStore>,
    pub(in crate::runtime) output_snapshot_store: Arc<dyn OutputSnapshotStore>,
    pub(in crate::runtime) sidecar_store: Option<Arc<SidecarStore>>,
    pub(in crate::runtime) event_log_writer: Option<Arc<EventLogWriter>>,
    pub(in crate::runtime) trace_event_writer: Option<Arc<TraceEventWriter>>,
    pub(in crate::runtime) projection_store: Option<Arc<ProjectionStore>>,
    pub(in crate::runtime) telemetry_store: Option<Arc<TelemetryStore>>,
    pub(in crate::runtime) browser_runtime: Arc<BrowserRuntimeManager>,
    evidence_export_provider: Arc<dyn EvidenceExportProvider>,
    knowledge_builder_runtime_executor: Arc<dyn KnowledgeBuilderRuntimeExecutor>,
    app_data_source: Arc<dyn AppDataSource>,
    pub(crate) execution_process_server: Option<ExecutionProcessServer>,
}

#[derive(Clone)]
pub struct RuntimeCoreEventAppender {
    state: Arc<Mutex<RuntimeCoreState>>,
    file_checkpoint_snapshot_store: Arc<dyn FileCheckpointSnapshotStore>,
    output_snapshot_store: Arc<dyn OutputSnapshotStore>,
    sidecar_store: Option<Arc<SidecarStore>>,
    event_log_writer: Option<Arc<EventLogWriter>>,
    trace_event_writer: Option<Arc<TraceEventWriter>>,
    projection_store: Option<Arc<ProjectionStore>>,
}

#[derive(Debug, Default)]
pub(in crate::runtime) struct RuntimeCoreState {
    pub(in crate::runtime) sessions: HashMap<String, StoredSession>,
    pub(in crate::runtime) session_approval_cache: approval_cache::SessionApprovalCache,
    pub(in crate::runtime) right_surface_pending:
        Vec<app_server_protocol::WorkspaceRightSurfacePendingRequest>,
    pub(in crate::runtime) browser_profile_scopes: Vec<BrowserProfileScope>,
    plugin_ui_runtimes: HashMap<String, plugins::PluginUiRuntimeProcess>,
}

#[derive(Debug, Clone)]
pub(in crate::runtime) struct StoredSession {
    pub(in crate::runtime) session: AgentSession,
    pub(in crate::runtime) turns: Vec<AgentTurn>,
    pub(in crate::runtime) turn_inputs: HashMap<String, AgentInput>,
    pub(in crate::runtime) turn_runtime_options:
        HashMap<String, app_server_protocol::RuntimeOptions>,
    pub(in crate::runtime) events: Vec<AgentEvent>,
    pub(in crate::runtime) output_blobs: HashMap<String, output_refs::OutputBlobRecord>,
}

impl Default for RuntimeCore {
    fn default() -> Self {
        Self::with_backend(Arc::new(MockBackend))
    }
}

impl RuntimeCore {
    pub fn with_backend(backend: Arc<dyn ExecutionBackend>) -> Self {
        Self::with_backend_and_capability_source(
            backend,
            Arc::new(CapabilityInventorySource::default()),
        )
    }

    pub fn with_backend_and_capability_source(
        backend: Arc<dyn ExecutionBackend>,
        capability_source: Arc<dyn CapabilitySource>,
    ) -> Self {
        Self::with_backend_capability_source_and_artifact_content_provider(
            backend,
            capability_source,
            Arc::new(InlineArtifactContentProvider),
        )
    }

    pub fn with_backend_capability_source_and_artifact_content_provider(
        backend: Arc<dyn ExecutionBackend>,
        capability_source: Arc<dyn CapabilitySource>,
        artifact_content_provider: Arc<dyn ArtifactContentProvider>,
    ) -> Self {
        Self::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            backend,
            capability_source,
            artifact_content_provider,
            Arc::new(BasicEvidenceExportProvider),
        )
    }

    pub fn with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
        backend: Arc<dyn ExecutionBackend>,
        capability_source: Arc<dyn CapabilitySource>,
        artifact_content_provider: Arc<dyn ArtifactContentProvider>,
        evidence_export_provider: Arc<dyn EvidenceExportProvider>,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(RuntimeCoreState::default())),
            backend,
            capability_source,
            artifact_content_provider,
            file_checkpoint_snapshot_store: Arc::new(NoopFileCheckpointSnapshotStore),
            output_snapshot_store: Arc::new(NoopOutputSnapshotStore),
            sidecar_store: None,
            event_log_writer: None,
            trace_event_writer: None,
            projection_store: None,
            telemetry_store: None,
            browser_runtime: Arc::new(BrowserRuntimeManager::new()),
            evidence_export_provider,
            knowledge_builder_runtime_executor: Arc::new(
                NativeKnowledgeBuilderRuntimeExecutor::new(),
            ),
            app_data_source: Arc::new(NoopAppDataSource),
            execution_process_server: None,
        }
    }

    pub(crate) fn with_execution_process_server(
        mut self,
        execution_process_server: ExecutionProcessServer,
    ) -> Self {
        self.execution_process_server = Some(execution_process_server);
        self
    }

    pub(crate) fn execution_process_server(&self) -> Option<ExecutionProcessServer> {
        self.execution_process_server.clone()
    }

    pub fn with_app_data_source(mut self, app_data_source: Arc<dyn AppDataSource>) -> Self {
        if let Err(error) = self.backend.set_app_data_source(app_data_source.clone()) {
            tracing::warn!(
                "runtime backend rejected app data source injection; app data source remains available to RuntimeCore: {error}"
            );
        }
        self.app_data_source = app_data_source;
        self
    }

    pub fn with_output_snapshot_store(
        mut self,
        output_snapshot_store: Arc<dyn OutputSnapshotStore>,
    ) -> Self {
        self.output_snapshot_store = output_snapshot_store;
        self
    }

    pub fn with_file_checkpoint_snapshot_store(
        mut self,
        file_checkpoint_snapshot_store: Arc<dyn FileCheckpointSnapshotStore>,
    ) -> Self {
        self.file_checkpoint_snapshot_store = file_checkpoint_snapshot_store;
        self
    }

    pub fn with_sidecar_store(mut self, sidecar_store: Arc<SidecarStore>) -> Self {
        self.sidecar_store = Some(sidecar_store);
        self
    }

    pub fn with_event_log_writer(mut self, event_log_writer: Arc<EventLogWriter>) -> Self {
        self.event_log_writer = Some(event_log_writer);
        self
    }

    pub fn with_trace_event_writer(mut self, trace_event_writer: Arc<TraceEventWriter>) -> Self {
        self.trace_event_writer = Some(trace_event_writer);
        self
    }

    pub fn with_projection_store(mut self, projection_store: Arc<ProjectionStore>) -> Self {
        self.projection_store = Some(projection_store);
        self
    }

    pub fn with_telemetry_store(mut self, telemetry_store: Arc<TelemetryStore>) -> Self {
        self.telemetry_store = Some(telemetry_store);
        self
    }

    pub fn with_knowledge_builder_runtime_executor(
        mut self,
        executor: Arc<dyn KnowledgeBuilderRuntimeExecutor>,
    ) -> Self {
        self.knowledge_builder_runtime_executor = executor;
        self
    }

    pub fn event_appender(&self) -> RuntimeCoreEventAppender {
        RuntimeCoreEventAppender {
            state: self.state.clone(),
            file_checkpoint_snapshot_store: self.file_checkpoint_snapshot_store.clone(),
            output_snapshot_store: self.output_snapshot_store.clone(),
            sidecar_store: self.sidecar_store.clone(),
            event_log_writer: self.event_log_writer.clone(),
            trace_event_writer: self.trace_event_writer.clone(),
            projection_store: self.projection_store.clone(),
        }
    }
}

#[cfg(test)]
mod tests;
