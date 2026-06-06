use crate::capability::capability_descriptor_allows_agent_turn_start;
use crate::CapabilityInventorySource;
use crate::CapabilityListContext;
use crate::CapabilitySource;
use app_server_protocol::error_codes;
use app_server_protocol::AgentAppInstalledListResponse;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionActionRespondParams;
use app_server_protocol::AgentSessionActionRespondResponse;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionActionType;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionListResponse;
use app_server_protocol::AgentSessionOverview;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentSessionStartParams;
use app_server_protocol::AgentSessionStartResponse;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentSessionTurnCancelParams;
use app_server_protocol::AgentSessionTurnCancelResponse;
use app_server_protocol::AgentSessionTurnStartParams;
use app_server_protocol::AgentSessionTurnStartResponse;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::ArtifactReadResponse;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::AutomationJobListResponse;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::CapabilityListResponse;
use app_server_protocol::ClientInfo;
use app_server_protocol::EvidenceExportParams;
use app_server_protocol::EvidenceExportResponse;
use app_server_protocol::EvidencePackSummary;
use app_server_protocol::JsonRpcError;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::KnowledgeListPacksResponse;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelListResponse;
use app_server_protocol::ModelPreferencesListResponse;
use app_server_protocol::ModelProviderAliasListResponse;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::ModelProviderAliasReadResponse;
use app_server_protocol::ModelProviderCatalogListResponse;
use app_server_protocol::ModelProviderListResponse;
use app_server_protocol::ModelSyncStateReadResponse;
use app_server_protocol::ProjectMemoryReadParams;
use app_server_protocol::ProjectMemoryReadResponse;
use app_server_protocol::SkillListResponse;
use app_server_protocol::SkillReadParams;
use app_server_protocol::SkillReadResponse;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspaceEnsureReadyResponse;
use app_server_protocol::WorkspaceListResponse;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceProjectPathResolveResponse;
use app_server_protocol::WorkspaceProjectsRootReadResponse;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceReadResponse;
use app_server_protocol::WorkspaceSkillBindingsListParams;
use app_server_protocol::WorkspaceSkillBindingsListResponse;
use async_trait::async_trait;
use chrono::SecondsFormat;
use chrono::Utc;
use serde_json::json;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use thiserror::Error;
use uuid::Uuid;

pub const DEFAULT_ARTIFACT_CONTENT_MAX_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Error)]
pub enum RuntimeCoreError {
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("turn not active: {0}")]
    TurnNotActive(String),
    #[error("session already exists: {0}")]
    SessionAlreadyExists(String),
    #[error("capability denied: {0}")]
    CapabilityDenied(String),
    #[error("execution backend error: {0}")]
    Backend(String),
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
            Self::CapabilityDenied(capability_id) => JsonRpcError::new(
                error_codes::CAPABILITY_DENIED,
                format!("capability denied: {capability_id}"),
            ),
            Self::Backend(message) => JsonRpcError::new(error_codes::RUNTIME_ERROR, message),
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
}

#[async_trait]
pub trait EvidenceExportProvider: Send + Sync {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError>;
}

#[async_trait]
pub trait AppDataSource: Send + Sync {
    async fn list_current_timeline_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError>;

    async fn read_current_timeline_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError>;

    async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError>;

    async fn read_workspace(
        &self,
        params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError>;

    async fn read_workspace_by_path(
        &self,
        params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError>;

    async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError>;

    async fn ensure_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError>;

    async fn ensure_workspace_ready(
        &self,
        params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError>;

    async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError>;

    async fn resolve_workspace_project_path(
        &self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError>;

    async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError>;

    async fn read_skill(
        &self,
        params: SkillReadParams,
    ) -> Result<SkillReadResponse, RuntimeCoreError>;

    async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError>;

    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError>;

    async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError>;

    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError>;

    async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError>;

    async fn list_models(
        &self,
        params: ModelListParams,
    ) -> Result<ModelListResponse, RuntimeCoreError>;

    async fn list_model_preferences(
        &self,
    ) -> Result<ModelPreferencesListResponse, RuntimeCoreError>;

    async fn read_model_sync_state(&self) -> Result<ModelSyncStateReadResponse, RuntimeCoreError>;

    async fn list_model_providers(&self) -> Result<ModelProviderListResponse, RuntimeCoreError>;

    async fn list_model_provider_catalog(
        &self,
    ) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError>;

    async fn read_model_provider_alias(
        &self,
        params: ModelProviderAliasReadParams,
    ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError>;

    async fn list_model_provider_aliases(
        &self,
    ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError>;
}

#[derive(Debug, Default)]
pub struct InlineArtifactContentProvider;

impl ArtifactContentProvider for InlineArtifactContentProvider {
    fn read_content(&self, request: &ArtifactContentRequest) -> Option<String> {
        request.artifact.content.clone()
    }
}

#[derive(Debug, Clone)]
pub struct FilesystemArtifactContentProvider {
    root: PathBuf,
    max_bytes: u64,
}

impl FilesystemArtifactContentProvider {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            max_bytes: DEFAULT_ARTIFACT_CONTENT_MAX_BYTES,
        }
    }

    pub fn with_max_bytes(mut self, max_bytes: u64) -> Self {
        self.max_bytes = max_bytes;
        self
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn max_bytes(&self) -> u64 {
        self.max_bytes
    }
}

impl ArtifactContentProvider for FilesystemArtifactContentProvider {
    fn read_content(&self, request: &ArtifactContentRequest) -> Option<String> {
        request
            .artifact
            .path
            .as_deref()
            .and_then(|path| read_limited_relative_utf8_file(&self.root, path, self.max_bytes))
            .or_else(|| request.artifact.content.clone())
    }
}

#[derive(Debug, Default)]
pub struct NoopEvidenceExportProvider;

#[async_trait]
impl EvidenceExportProvider for NoopEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        _request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        Ok(None)
    }
}

#[derive(Debug, Default)]
pub struct NoopAppDataSource;

#[async_trait]
impl AppDataSource for NoopAppDataSource {
    async fn list_current_timeline_sessions(
        &self,
        _params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        Ok(AgentSessionListResponse::default())
    }

    async fn read_current_timeline_session(
        &self,
        _params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        Ok(None)
    }

    async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        Ok(WorkspaceListResponse::default())
    }

    async fn read_workspace(
        &self,
        _params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn read_workspace_by_path(
        &self,
        _params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn ensure_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn ensure_workspace_ready(
        &self,
        _params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        Ok(WorkspaceEnsureReadyResponse {
            result: json!(null),
        })
    }

    async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        Ok(WorkspaceProjectsRootReadResponse {
            root_path: String::new(),
        })
    }

    async fn resolve_workspace_project_path(
        &self,
        _params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        Ok(WorkspaceProjectPathResolveResponse {
            root_path: String::new(),
        })
    }

    async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError> {
        Ok(SkillListResponse::default())
    }

    async fn read_skill(
        &self,
        _params: SkillReadParams,
    ) -> Result<SkillReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend("skill not found".to_string()))
    }

    async fn list_workspace_skill_bindings(
        &self,
        _params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        Ok(WorkspaceSkillBindingsListResponse {
            bindings: json!({
                "request": {
                    "workspace_root": "",
                    "caller": "assistant",
                    "surface": {
                        "workbench": false,
                        "browser_assist": false
                    }
                },
                "warnings": [],
                "counts": {
                    "registered_total": 0,
                    "ready_for_manual_enable_total": 0,
                    "blocked_total": 0,
                    "query_loop_visible_total": 0,
                    "tool_runtime_visible_total": 0,
                    "launch_enabled_total": 0
                },
                "bindings": []
            }),
        })
    }

    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        Ok(AgentAppInstalledListResponse::default())
    }

    async fn list_knowledge_packs(
        &self,
        _params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        Ok(KnowledgeListPacksResponse::default())
    }

    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        Ok(AutomationJobListResponse::default())
    }

    async fn read_project_memory(
        &self,
        _params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        Ok(ProjectMemoryReadResponse::default())
    }

    async fn list_models(
        &self,
        _params: ModelListParams,
    ) -> Result<ModelListResponse, RuntimeCoreError> {
        Ok(ModelListResponse::default())
    }

    async fn list_model_preferences(
        &self,
    ) -> Result<ModelPreferencesListResponse, RuntimeCoreError> {
        Ok(ModelPreferencesListResponse::default())
    }

    async fn read_model_sync_state(&self) -> Result<ModelSyncStateReadResponse, RuntimeCoreError> {
        Ok(ModelSyncStateReadResponse {
            sync_state: json!({
                "last_sync_at": null,
                "model_count": 0,
                "is_syncing": false,
                "last_error": null,
            }),
        })
    }

    async fn list_model_providers(&self) -> Result<ModelProviderListResponse, RuntimeCoreError> {
        Ok(ModelProviderListResponse::default())
    }

    async fn list_model_provider_catalog(
        &self,
    ) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError> {
        Ok(ModelProviderCatalogListResponse::default())
    }

    async fn read_model_provider_alias(
        &self,
        _params: ModelProviderAliasReadParams,
    ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError> {
        Ok(ModelProviderAliasReadResponse::default())
    }

    async fn list_model_provider_aliases(
        &self,
    ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError> {
        Ok(ModelProviderAliasListResponse::default())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeCoreOutput<T> {
    pub response: T,
    pub events: Vec<AgentEvent>,
}

#[derive(Debug, Clone)]
pub struct ExecutionRequest {
    pub host: RuntimeHostContext,
    pub session: AgentSession,
    pub turn: AgentTurn,
    pub input: app_server_protocol::AgentInput,
    pub runtime_options: Option<app_server_protocol::RuntimeOptions>,
    pub event_name: Option<String>,
    pub provider_preference: Option<String>,
    pub model_preference: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub queued_turn_id: Option<String>,
    pub queue_if_busy: bool,
    pub skip_pre_submit_resume: bool,
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
    pub confirmed: bool,
    pub response: Option<String>,
    pub user_data: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub event_name: Option<String>,
    pub action_scope: Option<AgentSessionActionScope>,
}

#[async_trait]
pub trait ExecutionBackend: Send + Sync {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError>;

    async fn cancel_turn(
        &self,
        request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError>;

    async fn respond_action(
        &self,
        request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError>;
}

#[derive(Debug, Default)]
pub struct MockBackend;

#[async_trait]
impl ExecutionBackend for MockBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new(
            "turn.accepted",
            json!({
                "inputTextLength": request.input.text.len(),
                "backend": "mock",
                "clientName": request.host.client_name,
            }),
        ))
    }

    async fn cancel_turn(
        &self,
        request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new(
            "turn.canceled",
            json!({
                "backend": "mock",
                "clientName": request.host.client_name,
            }),
        ))
    }

    async fn respond_action(
        &self,
        request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new(
            "action.resolved",
            json!({
                "backend": "mock",
                "clientName": request.host.client_name,
                "requestId": request.request_id,
                "actionType": request.action_type,
                "confirmed": request.confirmed,
                "response": request.response,
            }),
        ))
    }
}

#[derive(Debug, Default)]
pub struct UnavailableBackend;

#[async_trait]
impl ExecutionBackend for UnavailableBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "standalone app-server backend is not configured".to_string(),
        ))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "standalone app-server backend is not configured".to_string(),
        ))
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "standalone app-server backend is not configured".to_string(),
        ))
    }
}

#[derive(Clone)]
pub struct RuntimeCore {
    state: Arc<Mutex<RuntimeCoreState>>,
    backend: Arc<dyn ExecutionBackend>,
    capability_source: Arc<dyn CapabilitySource>,
    artifact_content_provider: Arc<dyn ArtifactContentProvider>,
    evidence_export_provider: Arc<dyn EvidenceExportProvider>,
    app_data_source: Arc<dyn AppDataSource>,
}

#[derive(Clone)]
pub struct RuntimeCoreEventAppender {
    state: Arc<Mutex<RuntimeCoreState>>,
}

#[derive(Debug, Default)]
struct RuntimeCoreState {
    sessions: HashMap<String, StoredSession>,
}

#[derive(Debug, Clone)]
struct StoredSession {
    session: AgentSession,
    turns: Vec<AgentTurn>,
    events: Vec<AgentEvent>,
}

fn stored_session_to_overview(stored: &StoredSession) -> AgentSessionOverview {
    let session = &stored.session;
    AgentSessionOverview {
        session_id: session.session_id.clone(),
        thread_id: Some(session.thread_id.clone()),
        title: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| reference.title.clone())
            .or_else(|| {
                session
                    .business_object_ref
                    .as_ref()
                    .and_then(|reference| metadata_string(reference.metadata.as_ref(), "title"))
            }),
        model: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| metadata_string(reference.metadata.as_ref(), "model"))
            .or_else(|| {
                session
                    .business_object_ref
                    .as_ref()
                    .and_then(|reference| metadata_string(reference.metadata.as_ref(), "modelName"))
            })
            .unwrap_or_default(),
        created_at: session.created_at.clone(),
        updated_at: session.updated_at.clone(),
        archived_at: None,
        workspace_id: session.workspace_id.clone(),
        working_dir: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| metadata_string(reference.metadata.as_ref(), "workingDir"))
            .or_else(|| {
                session.business_object_ref.as_ref().and_then(|reference| {
                    metadata_string(reference.metadata.as_ref(), "working_dir")
                })
            }),
        execution_strategy: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| metadata_string(reference.metadata.as_ref(), "executionStrategy"))
            .or_else(|| {
                session.business_object_ref.as_ref().and_then(|reference| {
                    metadata_string(reference.metadata.as_ref(), "execution_strategy")
                })
            }),
        messages_count: stored.turns.len(),
    }
}

fn stored_session_hidden_from_user_recents(stored: &StoredSession) -> bool {
    stored
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .is_some_and(metadata_hidden_from_user_recents)
}

fn metadata_hidden_from_user_recents(metadata: &serde_json::Value) -> bool {
    metadata_bool(metadata, "hiddenFromUserRecents")
        .or_else(|| metadata_bool(metadata, "hidden_from_user_recents"))
        .or_else(|| metadata_nested_bool(metadata, "harness", "hiddenFromUserRecents"))
        .or_else(|| metadata_nested_bool(metadata, "harness", "hidden_from_user_recents"))
        .unwrap_or(false)
}

fn metadata_bool(metadata: &serde_json::Value, key: &str) -> Option<bool> {
    metadata.get(key).and_then(serde_json::Value::as_bool)
}

fn metadata_nested_bool(metadata: &serde_json::Value, parent: &str, key: &str) -> Option<bool> {
    metadata
        .get(parent)
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_bool)
}

fn metadata_string(metadata: Option<&serde_json::Value>, key: &str) -> Option<String> {
    metadata?
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
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
            Arc::new(NoopEvidenceExportProvider),
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
            evidence_export_provider,
            app_data_source: Arc::new(NoopAppDataSource),
        }
    }

    pub fn with_app_data_source(mut self, app_data_source: Arc<dyn AppDataSource>) -> Self {
        self.app_data_source = app_data_source;
        self
    }

    pub fn event_appender(&self) -> RuntimeCoreEventAppender {
        RuntimeCoreEventAppender {
            state: self.state.clone(),
        }
    }

    pub fn list_capabilities(
        &self,
        params: CapabilityListParams,
    ) -> Result<CapabilityListResponse, RuntimeCoreError> {
        let cursor = params.cursor.clone();
        let limit = params.limit;
        let context = self.capability_list_context(params)?;
        let capabilities = self.capability_source.list_capabilities(&context);
        let (capabilities, next_cursor) = paginate_capabilities(capabilities, cursor, limit);
        Ok(CapabilityListResponse {
            capabilities,
            next_cursor,
        })
    }

    fn list_runtime_core_session_overviews(
        &self,
        params: &AgentSessionListParams,
    ) -> Vec<AgentSessionOverview> {
        if params.archived_only.unwrap_or(false) {
            return Vec::new();
        }

        let workspace_id = params
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state
            .sessions
            .values()
            .filter(|stored| !stored_session_hidden_from_user_recents(stored))
            .filter(|stored| {
                workspace_id
                    .map(|workspace_id| {
                        stored.session.workspace_id.as_deref() == Some(workspace_id)
                    })
                    .unwrap_or(true)
            })
            .map(stored_session_to_overview)
            .collect()
    }

    pub async fn list_agent_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        let mut sessions = self
            .app_data_source
            .list_current_timeline_sessions(params.clone())
            .await?
            .sessions;
        let persisted_session_ids: HashSet<String> = sessions
            .iter()
            .map(|session| session.session_id.clone())
            .collect();
        sessions.extend(
            self.list_runtime_core_session_overviews(&params)
                .into_iter()
                .filter(|session| !persisted_session_ids.contains(&session.session_id)),
        );
        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        if let Some(limit) = params.limit.map(|value| value as usize) {
            sessions.truncate(limit);
        }
        Ok(AgentSessionListResponse { sessions })
    }

    pub fn start_session(
        &self,
        params: AgentSessionStartParams,
    ) -> Result<AgentSessionStartResponse, RuntimeCoreError> {
        let now = timestamp();
        let session_id = optional_id_or_new(params.session_id, "sess");
        let thread_id = optional_id_or_new(params.thread_id, "thread");
        let session = AgentSession {
            session_id: session_id.clone(),
            thread_id,
            app_id: params.app_id,
            workspace_id: params.workspace_id,
            business_object_ref: params.business_object_ref,
            status: AgentSessionStatus::Idle,
            created_at: now.clone(),
            updated_at: now,
        };

        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        if state.sessions.contains_key(&session_id) {
            return Err(RuntimeCoreError::SessionAlreadyExists(session_id));
        }
        state.sessions.insert(
            session_id,
            StoredSession {
                session: session.clone(),
                turns: Vec::new(),
                events: Vec::new(),
            },
        );

        Ok(AgentSessionStartResponse { session })
    }

    pub fn read_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<AgentSessionReadResponse, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(&params.session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;

        Ok(AgentSessionReadResponse {
            session: stored.session.clone(),
            turns: stored.turns.clone(),
            detail: None,
        })
    }

    pub async fn read_session_current(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<AgentSessionReadResponse, RuntimeCoreError> {
        match self.read_session(params.clone()) {
            Ok(response) => Ok(response),
            Err(RuntimeCoreError::SessionNotFound(_)) => self
                .app_data_source
                .read_current_timeline_session(params.clone())
                .await?
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id)),
            Err(error) => Err(error),
        }
    }

    pub async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        self.app_data_source.list_workspaces().await
    }

    pub async fn read_workspace(
        &self,
        params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.read_workspace(params).await
    }

    pub async fn read_workspace_by_path(
        &self,
        params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.read_workspace_by_path(params).await
    }

    pub async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.read_default_workspace().await
    }

    pub async fn ensure_default_workspace(
        &self,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.ensure_default_workspace().await
    }

    pub async fn ensure_workspace_ready(
        &self,
        params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        self.app_data_source.ensure_workspace_ready(params).await
    }

    pub async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        self.app_data_source.read_workspace_projects_root().await
    }

    pub async fn resolve_workspace_project_path(
        &self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        self.app_data_source
            .resolve_workspace_project_path(params)
            .await
    }

    pub async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError> {
        self.app_data_source.list_skills().await
    }

    pub async fn read_skill(
        &self,
        params: SkillReadParams,
    ) -> Result<SkillReadResponse, RuntimeCoreError> {
        self.app_data_source.read_skill(params).await
    }

    pub async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_workspace_skill_bindings(params)
            .await
    }

    pub async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        self.app_data_source.list_agent_app_installed().await
    }

    pub async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        self.app_data_source.list_knowledge_packs(params).await
    }

    pub async fn list_automation_jobs(
        &self,
    ) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        self.app_data_source.list_automation_jobs().await
    }

    pub async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        self.app_data_source.read_project_memory(params).await
    }

    pub async fn list_models(
        &self,
        params: ModelListParams,
    ) -> Result<ModelListResponse, RuntimeCoreError> {
        self.app_data_source.list_models(params).await
    }

    pub async fn list_model_preferences(
        &self,
    ) -> Result<ModelPreferencesListResponse, RuntimeCoreError> {
        self.app_data_source.list_model_preferences().await
    }

    pub async fn read_model_sync_state(
        &self,
    ) -> Result<ModelSyncStateReadResponse, RuntimeCoreError> {
        self.app_data_source.read_model_sync_state().await
    }

    pub async fn list_model_providers(
        &self,
    ) -> Result<ModelProviderListResponse, RuntimeCoreError> {
        self.app_data_source.list_model_providers().await
    }

    pub async fn list_model_provider_catalog(
        &self,
    ) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError> {
        self.app_data_source.list_model_provider_catalog().await
    }

    pub async fn read_model_provider_alias(
        &self,
        params: ModelProviderAliasReadParams,
    ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError> {
        self.app_data_source.read_model_provider_alias(params).await
    }

    pub async fn list_model_provider_aliases(
        &self,
    ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError> {
        self.app_data_source.list_model_provider_aliases().await
    }

    pub fn read_artifacts(
        &self,
        params: ArtifactReadParams,
    ) -> Result<ArtifactReadResponse, RuntimeCoreError> {
        let (session, summaries) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;

            let mut seen = HashSet::new();
            let mut summaries = Vec::new();
            for event in stored.events.iter().rev() {
                if let Some(turn_id) = params.turn_id.as_deref() {
                    if event.turn_id.as_deref() != Some(turn_id) {
                        continue;
                    }
                }
                let Some(summary) = artifact_summary_from_event(event) else {
                    continue;
                };
                if let Some(artifact_ref) = params.artifact_ref.as_deref() {
                    if summary.artifact_ref != artifact_ref {
                        continue;
                    }
                }
                if seen.insert(summary.artifact_ref.clone()) {
                    summaries.push(summary);
                }
            }
            (stored.session.clone(), summaries)
        };

        let (mut artifacts, next_cursor) =
            paginate_artifact_summaries(summaries, params.cursor, params.limit);
        if params.include_content.unwrap_or(false) {
            for artifact in &mut artifacts {
                let request = ArtifactContentRequest {
                    session: session.clone(),
                    artifact: artifact.clone(),
                };
                artifact.content = self.artifact_content_provider.read_content(&request);
                artifact.content_status = if artifact.content.is_some() {
                    ArtifactContentStatus::Available
                } else {
                    ArtifactContentStatus::Unavailable
                };
            }
        } else {
            for artifact in &mut artifacts {
                artifact.content = None;
                artifact.content_status = ArtifactContentStatus::NotRequested;
            }
        }
        Ok(ArtifactReadResponse {
            artifacts,
            next_cursor,
        })
    }

    pub async fn export_evidence(
        &self,
        params: EvidenceExportParams,
    ) -> Result<EvidenceExportResponse, RuntimeCoreError> {
        let (session, turns, events, artifacts) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;

            let turns = match params.turn_id.as_deref() {
                Some(turn_id) => stored
                    .turns
                    .iter()
                    .filter(|turn| turn.turn_id == turn_id)
                    .cloned()
                    .collect(),
                None => stored.turns.clone(),
            };
            let events = if params.include_events.unwrap_or(true) {
                events_for_turn(&stored.events, params.turn_id.as_deref())
            } else {
                Vec::new()
            };
            let artifacts = if params.include_artifacts.unwrap_or(true) {
                artifact_summaries_for_turn(&stored.events, params.turn_id.as_deref())
            } else {
                Vec::new()
            };
            (stored.session.clone(), turns, events, artifacts)
        };

        if let Some(turn_id) = params.turn_id.as_deref() {
            if turns.is_empty() {
                return Err(RuntimeCoreError::TurnNotActive(turn_id.to_string()));
            }
        }
        let evidence_pack = if params.include_evidence_pack.unwrap_or(true) {
            self.evidence_export_provider
                .export_evidence_pack(&EvidencePackRequest {
                    session: session.clone(),
                    turns: turns.clone(),
                    events: events.clone(),
                    artifacts: artifacts.clone(),
                })
                .await?
        } else {
            None
        };

        Ok(EvidenceExportResponse {
            session,
            turns,
            events,
            artifacts,
            exported_at: timestamp(),
            evidence_pack,
        })
    }

    pub async fn start_turn(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.start_turn_inner(params, host, None).await
    }

    pub(crate) async fn start_turn_with_event_callback(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
        event_callback: &mut RuntimeEventCallback<'_>,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.start_turn_inner(params, host, Some(event_callback))
            .await
    }

    async fn start_turn_inner(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
        event_callback: Option<&mut RuntimeEventCallback<'_>>,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        if let Some(capability_id) = params
            .runtime_options
            .as_ref()
            .and_then(|options| options.capability_id.as_deref())
        {
            let capability_context = self.capability_list_context(CapabilityListParams {
                session_id: Some(params.session_id.clone()),
                ..CapabilityListParams::default()
            })?;
            self.capability_source
                .prepare_turn_capabilities(&capability_context, params.runtime_options.as_ref());
            self.ensure_capability_allowed_with_context(&capability_context, capability_id)?;
        }

        let (session, previous_session, turn) = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn_id = optional_id_or_new(params.turn_id.clone(), "turn");
            let previous_session = stored.session.clone();

            let turn = AgentTurn {
                turn_id,
                session_id: stored.session.session_id.clone(),
                thread_id: stored.session.thread_id.clone(),
                status: AgentTurnStatus::Accepted,
                started_at: Some(timestamp()),
                completed_at: None,
            };

            stored.session.status = AgentSessionStatus::Running;
            stored.session.updated_at = timestamp();
            stored.turns.push(turn.clone());

            (stored.session.clone(), previous_session, turn)
        };

        let request = ExecutionRequest {
            host,
            session: session.clone(),
            turn: turn.clone(),
            input: params.input,
            event_name: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.event_name.clone()),
            provider_preference: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.provider_preference.clone()),
            model_preference: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.model_preference.clone()),
            metadata: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.metadata.clone()),
            queued_turn_id: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.queued_turn_id.clone()),
            runtime_options: params.runtime_options,
            queue_if_busy: params.queue_if_busy,
            skip_pre_submit_resume: params.skip_pre_submit_resume,
        };

        let events = if let Some(event_callback) = event_callback {
            let mut sink = AppendingRuntimeEventSink::new(
                self.state.clone(),
                session.session_id.clone(),
                session.thread_id.clone(),
                turn.turn_id.clone(),
                event_callback,
            );
            let backend_result = self.backend.start_turn(request, &mut sink).await;
            let emitted = sink.emitted_count();
            if let Err(error) = backend_result {
                if emitted == 0 {
                    self.rollback_started_turn(
                        &session.session_id,
                        &turn.turn_id,
                        previous_session,
                    );
                } else {
                    sink.emit_failure(&error)?;
                }
                return Err(error);
            }
            let events = sink.into_events();
            events
        } else {
            let mut sink = CollectingRuntimeEventSink::default();
            let backend_result = self.backend.start_turn(request, &mut sink).await;
            if let Err(error) = backend_result {
                self.rollback_started_turn(&session.session_id, &turn.turn_id, previous_session);
                return Err(error);
            }
            self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                Some(&turn.turn_id),
                sink.into_events(),
            )?
        };
        let response_turn = self
            .stored_turn(&session.session_id, &turn.turn_id)?
            .unwrap_or(turn);

        Ok(RuntimeCoreOutput {
            response: AgentSessionTurnStartResponse {
                turn: response_turn,
            },
            events,
        })
    }

    fn stored_turn(
        &self,
        session_id: &str,
        turn_id: &str,
    ) -> Result<Option<AgentTurn>, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        Ok(stored
            .turns
            .iter()
            .find(|turn| turn.turn_id == turn_id)
            .cloned())
    }

    fn rollback_started_turn(
        &self,
        session_id: &str,
        turn_id: &str,
        previous_session: AgentSession,
    ) {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        if let Some(stored) = state.sessions.get_mut(session_id) {
            stored.turns.retain(|turn| turn.turn_id != turn_id);
            stored.session = previous_session;
        }
    }

    pub async fn cancel_turn(
        &self,
        params: AgentSessionTurnCancelParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnCancelResponse>, RuntimeCoreError> {
        let (session, turn_snapshot) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn = stored
                .turns
                .iter()
                .find(|turn| turn.turn_id == params.turn_id)
                .ok_or_else(|| RuntimeCoreError::TurnNotActive(params.turn_id.clone()))?;

            (stored.session.clone(), turn.clone())
        };

        let mut sink = CollectingRuntimeEventSink::default();
        self.backend
            .cancel_turn(
                CancelExecutionRequest {
                    host,
                    session: session.clone(),
                    turn: turn_snapshot.clone(),
                },
                &mut sink,
            )
            .await?;
        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            Some(&turn_snapshot.turn_id),
            sink.into_events(),
        )?;

        {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn = stored
                .turns
                .iter_mut()
                .find(|turn| turn.turn_id == params.turn_id)
                .ok_or_else(|| RuntimeCoreError::TurnNotActive(params.turn_id.clone()))?;
            turn.status = AgentTurnStatus::Canceled;
            turn.completed_at = Some(timestamp());
            stored.session.status = AgentSessionStatus::Canceled;
            stored.session.updated_at = timestamp();
        }

        Ok(RuntimeCoreOutput {
            response: AgentSessionTurnCancelResponse {},
            events,
        })
    }

    pub async fn respond_action(
        &self,
        params: AgentSessionActionRespondParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionActionRespondResponse>, RuntimeCoreError> {
        let action_turn_id = params
            .action_scope
            .as_ref()
            .and_then(|scope| scope.turn_id.clone());
        let (session, turn_snapshot) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn = match action_turn_id.as_deref() {
                Some(turn_id) => Some(
                    stored
                        .turns
                        .iter()
                        .find(|turn| turn.turn_id == turn_id)
                        .ok_or_else(|| RuntimeCoreError::TurnNotActive(turn_id.to_string()))?
                        .clone(),
                ),
                None => None,
            };
            (stored.session.clone(), turn)
        };

        let mut sink = CollectingRuntimeEventSink::default();
        self.backend
            .respond_action(
                ActionRespondRequest {
                    host,
                    session: session.clone(),
                    turn: turn_snapshot.clone(),
                    request_id: params.request_id,
                    action_type: params.action_type,
                    confirmed: params.confirmed,
                    response: params.response,
                    user_data: params.user_data,
                    metadata: params.metadata,
                    event_name: params.event_name,
                    action_scope: params.action_scope,
                },
                &mut sink,
            )
            .await?;
        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            turn_snapshot.as_ref().map(|turn| turn.turn_id.as_str()),
            sink.into_events(),
        )?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionActionRespondResponse {},
            events,
        })
    }

    pub fn events_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        Ok(stored.events.clone())
    }

    pub fn append_external_runtime_events(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        self.event_appender()
            .append_external_runtime_events(session_id, turn_id, runtime_events)
    }

    fn append_runtime_events(
        &self,
        session_id: &str,
        thread_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        append_runtime_events_to_state(&self.state, session_id, thread_id, turn_id, runtime_events)
    }

    #[allow(dead_code)]
    fn ensure_capability_allowed(
        &self,
        session_id: &str,
        capability_id: &str,
    ) -> Result<(), RuntimeCoreError> {
        let context = self.capability_list_context(CapabilityListParams {
            session_id: Some(session_id.to_string()),
            ..CapabilityListParams::default()
        })?;
        self.ensure_capability_allowed_with_context(&context, capability_id)
    }

    fn ensure_capability_allowed_with_context(
        &self,
        context: &CapabilityListContext,
        capability_id: &str,
    ) -> Result<(), RuntimeCoreError> {
        let allowed = self
            .capability_source
            .list_capabilities(&context)
            .iter()
            .any(|capability| {
                capability.id == capability_id
                    && capability_descriptor_allows_agent_turn_start(capability)
            });
        if allowed {
            Ok(())
        } else {
            Err(RuntimeCoreError::CapabilityDenied(
                capability_id.to_string(),
            ))
        }
    }

    fn capability_list_context(
        &self,
        params: CapabilityListParams,
    ) -> Result<CapabilityListContext, RuntimeCoreError> {
        let CapabilityListParams {
            app_id,
            workspace_id,
            session_id,
            cursor: _,
            limit: _,
        } = params;

        let Some(session_id) = session_id else {
            return Ok(CapabilityListContext {
                app_id,
                workspace_id,
                session_id: None,
            });
        };

        let (session_app_id, session_workspace_id) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.clone()))?;
            (
                stored.session.app_id.clone(),
                stored.session.workspace_id.clone(),
            )
        };

        Ok(CapabilityListContext {
            app_id: Some(session_app_id),
            workspace_id: session_workspace_id,
            session_id: Some(session_id),
        })
    }
}

impl RuntimeCoreEventAppender {
    pub fn append_external_runtime_events(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        let thread_id = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
            if let Some(turn_id) = turn_id {
                if !stored.turns.iter().any(|turn| turn.turn_id == turn_id) {
                    return Err(RuntimeCoreError::TurnNotActive(turn_id.to_string()));
                }
            }
            stored.session.thread_id.clone()
        };

        append_runtime_events_to_state(&self.state, session_id, &thread_id, turn_id, runtime_events)
    }
}

fn append_runtime_events_to_state(
    state: &Arc<Mutex<RuntimeCoreState>>,
    session_id: &str,
    thread_id: &str,
    turn_id: Option<&str>,
    runtime_events: Vec<RuntimeEvent>,
) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
    let mut state = state.lock().expect("runtime core state mutex poisoned");
    let stored = state
        .sessions
        .get_mut(session_id)
        .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
    let mut events = Vec::with_capacity(runtime_events.len());
    for runtime_event in runtime_events {
        apply_runtime_event_state_transition(stored, turn_id, &runtime_event);
        let event = AgentEvent {
            event_id: new_id("evt"),
            sequence: stored.events.len() as u64 + 1,
            session_id: session_id.to_string(),
            thread_id: Some(thread_id.to_string()),
            turn_id: turn_id.map(str::to_string),
            event_type: runtime_event.event_type,
            timestamp: timestamp(),
            payload: runtime_event.payload,
        };
        stored.events.push(event.clone());
        events.push(event);
    }
    Ok(events)
}

fn apply_runtime_event_state_transition(
    stored: &mut StoredSession,
    turn_id: Option<&str>,
    runtime_event: &RuntimeEvent,
) {
    let Some(turn_id) = turn_id else {
        return;
    };
    let Some(next_status) = turn_status_from_runtime_event(runtime_event.event_type.as_str())
    else {
        return;
    };
    let completed_at = matches!(
        next_status,
        AgentTurnStatus::Completed | AgentTurnStatus::Failed | AgentTurnStatus::Canceled
    )
    .then(timestamp);

    if let Some(turn) = stored.turns.iter_mut().find(|turn| turn.turn_id == turn_id) {
        turn.status = next_status;
        if let Some(completed_at) = completed_at.clone() {
            turn.completed_at = Some(completed_at);
        }
    }

    stored.session.status = session_status_from_turn_status(next_status);
    stored.session.updated_at = completed_at.unwrap_or_else(timestamp);
}

fn turn_status_from_runtime_event(event_type: &str) -> Option<AgentTurnStatus> {
    match event_type {
        "turn.started" => Some(AgentTurnStatus::Running),
        "turn.done" | "turn.final_done" | "turn.completed" => Some(AgentTurnStatus::Completed),
        "turn.failed" | "runtime.error" => Some(AgentTurnStatus::Failed),
        "turn.canceled" | "turn.cancelled" => Some(AgentTurnStatus::Canceled),
        "action.required" => Some(AgentTurnStatus::WaitingAction),
        "action.resolved" => Some(AgentTurnStatus::Running),
        _ => None,
    }
}

fn session_status_from_turn_status(turn_status: AgentTurnStatus) -> AgentSessionStatus {
    match turn_status {
        AgentTurnStatus::Accepted | AgentTurnStatus::Queued => AgentSessionStatus::Running,
        AgentTurnStatus::Running => AgentSessionStatus::Running,
        AgentTurnStatus::WaitingAction => AgentSessionStatus::WaitingAction,
        AgentTurnStatus::Completed => AgentSessionStatus::Completed,
        AgentTurnStatus::Failed => AgentSessionStatus::Failed,
        AgentTurnStatus::Canceled => AgentSessionStatus::Canceled,
    }
}

#[derive(Default)]
struct CollectingRuntimeEventSink {
    events: Vec<RuntimeEvent>,
}

impl CollectingRuntimeEventSink {
    fn into_events(self) -> Vec<RuntimeEvent> {
        self.events
    }
}

impl RuntimeEventSink for CollectingRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        self.events.push(event);
        Ok(())
    }
}

struct AppendingRuntimeEventSink<'a> {
    state: Arc<Mutex<RuntimeCoreState>>,
    session_id: String,
    thread_id: String,
    turn_id: String,
    callback: &'a mut RuntimeEventCallback<'a>,
    events: Vec<AgentEvent>,
}

impl<'a> AppendingRuntimeEventSink<'a> {
    fn new(
        state: Arc<Mutex<RuntimeCoreState>>,
        session_id: String,
        thread_id: String,
        turn_id: String,
        callback: &'a mut RuntimeEventCallback<'a>,
    ) -> Self {
        Self {
            state,
            session_id,
            thread_id,
            turn_id,
            callback,
            events: Vec::new(),
        }
    }

    fn emitted_count(&self) -> usize {
        self.events.len()
    }

    fn into_events(self) -> Vec<AgentEvent> {
        self.events
    }

    fn emit_failure(&mut self, error: &RuntimeCoreError) -> Result<(), RuntimeCoreError> {
        self.emit(RuntimeEvent::new(
            "turn.failed",
            json!({
                "message": error.to_string(),
            }),
        ))
    }
}

impl RuntimeEventSink for AppendingRuntimeEventSink<'_> {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        let mut events = append_runtime_events_to_state(
            &self.state,
            &self.session_id,
            &self.thread_id,
            Some(&self.turn_id),
            vec![event],
        )?;
        for event in events.drain(..) {
            (self.callback)(event.clone())?;
            self.events.push(event);
        }
        Ok(())
    }
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::new_v4().simple())
}

fn optional_id_or_new(value: Option<String>, prefix: &str) -> String {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| new_id(prefix))
}

fn paginate_capabilities(
    capabilities: Vec<app_server_protocol::CapabilityDescriptor>,
    cursor: Option<String>,
    limit: Option<u32>,
) -> (
    Vec<app_server_protocol::CapabilityDescriptor>,
    Option<String>,
) {
    let start = cursor
        .as_deref()
        .and_then(|cursor| cursor.parse::<usize>().ok())
        .unwrap_or(0)
        .min(capabilities.len());
    let Some(limit) = limit
        .filter(|limit| *limit > 0)
        .and_then(|limit| usize::try_from(limit).ok())
    else {
        return (capabilities.into_iter().skip(start).collect(), None);
    };

    let end = start.saturating_add(limit).min(capabilities.len());
    let next_cursor = (end < capabilities.len()).then(|| end.to_string());
    (
        capabilities
            .into_iter()
            .skip(start)
            .take(end.saturating_sub(start))
            .collect(),
        next_cursor,
    )
}

fn paginate_artifact_summaries(
    artifacts: Vec<ArtifactSummary>,
    cursor: Option<String>,
    limit: Option<u32>,
) -> (Vec<ArtifactSummary>, Option<String>) {
    let start = cursor
        .as_deref()
        .and_then(|cursor| cursor.parse::<usize>().ok())
        .unwrap_or(0)
        .min(artifacts.len());
    let Some(limit) = limit
        .filter(|limit| *limit > 0)
        .and_then(|limit| usize::try_from(limit).ok())
    else {
        return (artifacts.into_iter().skip(start).collect(), None);
    };

    let end = start.saturating_add(limit).min(artifacts.len());
    let next_cursor = (end < artifacts.len()).then(|| end.to_string());
    (
        artifacts
            .into_iter()
            .skip(start)
            .take(end.saturating_sub(start))
            .collect(),
        next_cursor,
    )
}

fn events_for_turn(events: &[AgentEvent], turn_id: Option<&str>) -> Vec<AgentEvent> {
    events
        .iter()
        .filter(|event| match turn_id {
            Some(turn_id) => event.turn_id.as_deref() == Some(turn_id),
            None => true,
        })
        .cloned()
        .collect()
}

fn artifact_summaries_for_turn(
    events: &[AgentEvent],
    turn_id: Option<&str>,
) -> Vec<ArtifactSummary> {
    let mut seen = HashSet::new();
    let mut summaries = Vec::new();
    for event in events.iter().rev() {
        if let Some(turn_id) = turn_id {
            if event.turn_id.as_deref() != Some(turn_id) {
                continue;
            }
        }
        let Some(mut summary) = artifact_summary_from_event(event) else {
            continue;
        };
        summary.content = None;
        summary.content_status = ArtifactContentStatus::NotRequested;
        if seen.insert(summary.artifact_ref.clone()) {
            summaries.push(summary);
        }
    }
    summaries
}

fn artifact_summary_from_event(event: &AgentEvent) -> Option<ArtifactSummary> {
    let payload = &event.payload;
    let artifact = payload.get("artifact").unwrap_or(payload);
    let is_artifact_event = event.event_type.contains("artifact")
        || payload.get("artifact").is_some()
        || string_field(payload, &["artifactRef"]).is_some();
    if !is_artifact_event {
        return None;
    }

    let artifact_id = string_field(artifact, &["artifactId", "artifact_id", "id"])
        .or_else(|| string_field(payload, &["artifactId", "artifact_id"]));
    let path = string_field(artifact, &["filePath", "file_path", "path", "artifactRef"])
        .or_else(|| string_field(payload, &["filePath", "file_path", "path", "artifactRef"]));
    let artifact_ref = artifact_id
        .clone()
        .or_else(|| path.clone())
        .unwrap_or_else(|| event.event_id.clone());
    let metadata = artifact
        .get("metadata")
        .cloned()
        .or_else(|| payload.get("metadata").cloned())
        .or_else(|| {
            if payload.get("artifact").is_some() && artifact.is_object() {
                Some(artifact.clone())
            } else {
                None
            }
        });

    Some(ArtifactSummary {
        artifact_ref,
        event_id: event.event_id.clone(),
        sequence: event.sequence,
        turn_id: event.turn_id.clone(),
        artifact_id,
        path,
        title: string_field(artifact, &["title", "artifactTitle"])
            .or_else(|| string_field(payload, &["title", "artifactTitle"])),
        kind: string_field(artifact, &["kind", "artifactKind"])
            .or_else(|| string_field(payload, &["kind", "artifactKind"])),
        status: string_field(artifact, &["status", "artifactStatus"])
            .or_else(|| string_field(payload, &["status", "artifactStatus"])),
        content: string_field(artifact, &["content"])
            .or_else(|| string_field(payload, &["content"])),
        content_status: ArtifactContentStatus::NotRequested,
        metadata,
    })
}

fn string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn read_limited_relative_utf8_file(
    root: &Path,
    relative_path: &str,
    max_bytes: u64,
) -> Option<String> {
    if max_bytes == 0 {
        return None;
    }
    let relative = Path::new(relative_path);
    if relative.is_absolute() || !is_safe_relative_path(relative) {
        return None;
    }

    let root = root.canonicalize().ok()?;
    let path = root.join(relative);
    let canonical_path = path.canonicalize().ok()?;
    if !canonical_path.starts_with(&root) {
        return None;
    }

    let metadata = fs::metadata(&canonical_path).ok()?;
    if !metadata.is_file() || metadata.len() > max_bytes {
        return None;
    }

    let mut file = fs::File::open(canonical_path).ok()?;
    let capacity = usize::try_from(metadata.len()).ok()?;
    let mut buffer = Vec::with_capacity(capacity);
    file.by_ref()
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut buffer)
        .ok()?;
    if u64::try_from(buffer.len()).ok()? > max_bytes {
        return None;
    }

    String::from_utf8(buffer).ok()
}

fn is_safe_relative_path(path: &Path) -> bool {
    path.components()
        .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentInput;
    use app_server_protocol::CapabilityDescriptor;
    use app_server_protocol::EvidencePackArtifact;
    use app_server_protocol::RuntimeOptions;
    use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
    use std::sync::atomic::AtomicUsize;
    use std::sync::atomic::Ordering;

    struct FinalDoneBackend;

    #[async_trait]
    impl ExecutionBackend for FinalDoneBackend {
        async fn start_turn(
            &self,
            _request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
            sink.emit(RuntimeEvent::new(
                "message.delta",
                json!({ "text": "你好！有什么可以帮你的吗？" }),
            ))?;
            sink.emit(RuntimeEvent::new("turn.final_done", json!({})))
        }

        async fn cancel_turn(
            &self,
            _request: CancelExecutionRequest,
            _sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            Ok(())
        }

        async fn respond_action(
            &self,
            _request: ActionRespondRequest,
            _sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            Ok(())
        }
    }

    struct TestCapabilitySource;

    impl CapabilitySource for TestCapabilitySource {
        fn list_capabilities(&self, context: &CapabilityListContext) -> Vec<CapabilityDescriptor> {
            let app_id = context.app_id.as_deref().unwrap_or("unknown-app");
            let workspace_id = context
                .workspace_id
                .as_deref()
                .unwrap_or("unknown-workspace");
            vec![CapabilityDescriptor {
                id: format!("test.capability.{app_id}.{workspace_id}"),
                title: format!("Test Capability for {app_id}"),
                description: None,
                methods: vec!["test/method".to_string()],
            }]
        }
    }

    #[derive(Default)]
    struct TestEvidenceExportProvider {
        call_count: AtomicUsize,
        requests: Mutex<Vec<EvidencePackRequest>>,
    }

    #[async_trait]
    impl EvidenceExportProvider for TestEvidenceExportProvider {
        async fn export_evidence_pack(
            &self,
            request: &EvidencePackRequest,
        ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
            self.call_count.fetch_add(1, Ordering::SeqCst);
            self.requests
                .lock()
                .expect("test evidence requests mutex poisoned")
                .push(request.clone());
            Ok(Some(EvidencePackSummary {
                pack_relative_root: ".lime/harness/sessions/sess_evidence/evidence".to_string(),
                pack_absolute_root: Some(
                    "/workspace/.lime/harness/sessions/sess_evidence/evidence".to_string(),
                ),
                exported_at: "2026-06-05T00:00:03.000Z".to_string(),
                thread_status: "running".to_string(),
                latest_turn_status: Some("accepted".to_string()),
                turn_count: request.turns.len(),
                item_count: request.events.len(),
                pending_request_count: 0,
                queued_turn_count: 0,
                recent_artifact_count: request.artifacts.len(),
                known_gaps: vec!["gui_smoke_not_run".to_string()],
                observability_summary: Some(json!({
                    "schema_version": "runtime-evidence-pack.v1"
                })),
                completion_audit_summary: Some(json!({
                    "decision": "in_progress"
                })),
                artifacts: vec![EvidencePackArtifact {
                    kind: "summary".to_string(),
                    title: "Evidence Summary".to_string(),
                    relative_path: ".lime/harness/sessions/sess_evidence/evidence/summary.md"
                        .to_string(),
                    absolute_path: None,
                    bytes: 128,
                }],
            }))
        }
    }

    #[tokio::test]
    async fn list_agent_sessions_projects_runtime_core_sessions_only() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_old".to_string()),
            thread_id: Some("thread_old".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-old".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "project".to_string(),
                id: "old".to_string(),
                title: Some("Old Workspace Session".to_string()),
                uri: None,
                metadata: Some(json!({
                    "model": "gpt-test",
                    "workingDir": "/tmp/old",
                    "executionStrategy": "runtime-core"
                })),
            }),
            locale: None,
        })
        .expect("old workspace session");
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_current".to_string()),
            thread_id: Some("thread_current".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-current".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "project".to_string(),
                id: "current".to_string(),
                title: Some("Current Workspace Session".to_string()),
                uri: None,
                metadata: Some(json!({
                    "modelName": "claude-test",
                    "working_dir": "/tmp/current",
                    "execution_strategy": "runtime-core"
                })),
            }),
            locale: None,
        })
        .expect("current workspace session");

        let response = core
            .list_agent_sessions(AgentSessionListParams {
                workspace_id: Some("workspace-current".to_string()),
                limit: Some(1),
                ..AgentSessionListParams::default()
            })
            .await
            .expect("list sessions");

        assert_eq!(response.sessions.len(), 1);
        assert_eq!(response.sessions[0].session_id, "sess_current");
        assert_eq!(
            response.sessions[0].thread_id.as_deref(),
            Some("thread_current")
        );
        assert_eq!(
            response.sessions[0].title.as_deref(),
            Some("Current Workspace Session")
        );
        assert_eq!(response.sessions[0].model, "claude-test");
        assert_eq!(
            response.sessions[0].working_dir.as_deref(),
            Some("/tmp/current")
        );
        assert_eq!(
            response.sessions[0].execution_strategy.as_deref(),
            Some("runtime-core")
        );
    }

    #[tokio::test]
    async fn list_agent_sessions_excludes_hidden_runtime_core_sessions() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_hidden".to_string()),
            thread_id: Some("thread_hidden".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-current".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "hidden".to_string(),
                title: Some("Internal Smoke Session".to_string()),
                uri: None,
                metadata: Some(json!({
                    "harness": {
                        "hiddenFromUserRecents": true,
                        "source": "unit"
                    },
                    "model": "gpt-test"
                })),
            }),
            locale: None,
        })
        .expect("hidden session");
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_visible".to_string()),
            thread_id: Some("thread_visible".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-current".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "visible".to_string(),
                title: Some("Visible Session".to_string()),
                uri: None,
                metadata: Some(json!({
                    "model": "gpt-test"
                })),
            }),
            locale: None,
        })
        .expect("visible session");

        let response = core
            .list_agent_sessions(AgentSessionListParams {
                workspace_id: Some("workspace-current".to_string()),
                limit: Some(20),
                ..AgentSessionListParams::default()
            })
            .await
            .expect("list sessions");

        let ids = response
            .sessions
            .iter()
            .map(|session| session.session_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["sess_visible"]);

        let hidden = core
            .read_session_current(AgentSessionReadParams {
                session_id: "sess_hidden".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await
            .expect("hidden session remains readable by id");
        assert_eq!(hidden.session.session_id, "sess_hidden");
    }

    #[tokio::test]
    async fn read_session_current_does_not_fallback_to_persistent_history() {
        let core = RuntimeCore::default();
        let error = core
            .read_session_current(AgentSessionReadParams {
                session_id: "missing_legacy_session".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await
            .expect_err("missing session should fail closed");

        assert_eq!(
            error.into_jsonrpc_error().code,
            error_codes::SESSION_NOT_FOUND
        );
    }

    #[test]
    fn runtime_core_uses_injected_capability_source() {
        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(TestCapabilitySource),
        );

        let response = core
            .list_capabilities(CapabilityListParams {
                app_id: Some("content-studio".to_string()),
                workspace_id: Some("workspace-main".to_string()),
                session_id: None,
                cursor: None,
                limit: None,
            })
            .expect("capability list");

        assert_eq!(response.capabilities.len(), 1);
        assert_eq!(
            response.capabilities[0].id,
            "test.capability.content-studio.workspace-main"
        );
        assert_eq!(
            response.capabilities[0].title,
            "Test Capability for content-studio"
        );
        assert_eq!(response.capabilities[0].methods, vec!["test/method"]);
        assert_eq!(response.next_cursor, None);
    }

    #[test]
    fn runtime_core_paginates_capability_list_after_scope_filtering() {
        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(crate::CapabilityInventorySource::new(vec![
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "cap.1".to_string(),
                    title: "Capability 1".to_string(),
                    description: None,
                    methods: vec!["method/one".to_string()],
                }),
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "cap.2".to_string(),
                    title: "Capability 2".to_string(),
                    description: None,
                    methods: vec!["method/two".to_string()],
                })
                .for_apps(["content-studio"]),
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "cap.3".to_string(),
                    title: "Capability 3".to_string(),
                    description: None,
                    methods: vec!["method/three".to_string()],
                }),
            ])),
        );

        let first_page = core
            .list_capabilities(CapabilityListParams {
                app_id: Some("content-studio".to_string()),
                workspace_id: None,
                session_id: None,
                cursor: None,
                limit: Some(2),
            })
            .expect("first page");
        let first_ids: Vec<&str> = first_page
            .capabilities
            .iter()
            .map(|capability| capability.id.as_str())
            .collect();
        assert_eq!(first_ids, vec!["cap.1", "cap.2"]);
        assert_eq!(first_page.next_cursor.as_deref(), Some("2"));

        let second_page = core
            .list_capabilities(CapabilityListParams {
                app_id: Some("content-studio".to_string()),
                workspace_id: None,
                session_id: None,
                cursor: first_page.next_cursor,
                limit: Some(2),
            })
            .expect("second page");
        let second_ids: Vec<&str> = second_page
            .capabilities
            .iter()
            .map(|capability| capability.id.as_str())
            .collect();
        assert_eq!(second_ids, vec!["cap.3"]);
        assert_eq!(second_page.next_cursor, None);
    }

    #[test]
    fn capability_list_with_session_id_uses_stored_session_scope() {
        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(crate::CapabilityInventorySource::new(vec![
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "session.draft.write".to_string(),
                    title: "Session Draft Write".to_string(),
                    description: None,
                    methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
                })
                .for_apps(["content-studio"])
                .for_workspaces(["workspace-main"])
                .for_sessions(["sess_allowed"]),
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "workspace.readiness".to_string(),
                    title: "Workspace Readiness".to_string(),
                    description: None,
                    methods: vec!["capability/list".to_string()],
                })
                .for_workspaces(["workspace-main"]),
            ])),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_allowed".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let listed = core
            .list_capabilities(CapabilityListParams {
                app_id: Some("other-app".to_string()),
                workspace_id: Some("other-workspace".to_string()),
                session_id: Some("sess_allowed".to_string()),
                cursor: None,
                limit: None,
            })
            .expect("capability list");
        let ids: Vec<&str> = listed
            .capabilities
            .iter()
            .map(|capability| capability.id.as_str())
            .collect();

        assert_eq!(ids, vec!["session.draft.write", "workspace.readiness"]);
    }

    #[tokio::test]
    async fn read_artifacts_indexes_latest_artifact_events_for_session() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_artifacts".to_string()),
            thread_id: Some("thread_artifacts".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        let turn = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_artifacts".to_string(),
                    turn_id: Some("turn_artifacts".to_string()),
                    input: AgentInput {
                        text: "生成产物".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn")
            .response
            .turn;
        core.append_external_runtime_events(
            "sess_artifacts",
            Some(&turn.turn_id),
            vec![
                RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-report",
                        "filePath": ".lime/artifacts/report-v1.md",
                        "title": "Report",
                        "kind": "markdown_report",
                        "status": "ready",
                        "metadata": {
                            "version": 1
                        }
                    }),
                ),
                RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-report",
                        "filePath": ".lime/artifacts/report-v2.md",
                        "title": "Report",
                        "kind": "markdown_report",
                        "status": "ready",
                        "metadata": {
                            "version": 2
                        }
                    }),
                ),
                RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifact": {
                            "id": "artifact-outline",
                            "path": ".lime/artifacts/outline.md",
                            "content": "# Outline"
                        }
                    }),
                ),
            ],
        )
        .expect("append artifact events");

        let response = core
            .read_artifacts(ArtifactReadParams {
                session_id: "sess_artifacts".to_string(),
                turn_id: Some("turn_artifacts".to_string()),
                artifact_ref: None,
                include_content: None,
                cursor: None,
                limit: Some(1),
            })
            .expect("read artifacts");

        assert_eq!(response.artifacts.len(), 1);
        assert_eq!(response.next_cursor.as_deref(), Some("1"));
        assert_eq!(response.artifacts[0].artifact_ref, "artifact-outline");
        assert_eq!(
            response.artifacts[0].path.as_deref(),
            Some(".lime/artifacts/outline.md")
        );
        assert_eq!(response.artifacts[0].content, None);
        assert_eq!(
            response.artifacts[0].content_status,
            ArtifactContentStatus::NotRequested
        );

        let filtered = core
            .read_artifacts(ArtifactReadParams {
                session_id: "sess_artifacts".to_string(),
                turn_id: None,
                artifact_ref: Some("artifact-report".to_string()),
                include_content: Some(true),
                cursor: None,
                limit: None,
            })
            .expect("filtered artifacts");
        assert_eq!(filtered.artifacts.len(), 1);
        assert_eq!(
            filtered.artifacts[0].path.as_deref(),
            Some(".lime/artifacts/report-v2.md")
        );
        assert_eq!(
            filtered.artifacts[0]
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("version")),
            Some(&json!(2))
        );
        assert_eq!(
            filtered.artifacts[0].content_status,
            ArtifactContentStatus::Unavailable
        );
    }

    #[test]
    fn read_artifacts_uses_injected_content_provider_for_current_page() {
        #[derive(Debug)]
        struct TestArtifactContentProvider;

        impl ArtifactContentProvider for TestArtifactContentProvider {
            fn read_content(&self, request: &ArtifactContentRequest) -> Option<String> {
                Some(format!(
                    "{}:{}",
                    request.session.app_id, request.artifact.artifact_ref
                ))
            }
        }

        let core = RuntimeCore::with_backend_capability_source_and_artifact_content_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(TestArtifactContentProvider),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_content".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.append_external_runtime_events(
            "sess_content",
            None,
            vec![RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-provider",
                    "path": ".app-server/artifacts/provider.md",
                    "content": "inline content"
                }),
            )],
        )
        .expect("append artifact event");

        let without_content = core
            .read_artifacts(ArtifactReadParams {
                session_id: "sess_content".to_string(),
                turn_id: None,
                artifact_ref: Some("artifact-provider".to_string()),
                include_content: None,
                cursor: None,
                limit: None,
            })
            .expect("read summary");
        assert_eq!(without_content.artifacts[0].content, None);
        assert_eq!(
            without_content.artifacts[0].content_status,
            ArtifactContentStatus::NotRequested
        );

        let with_content = core
            .read_artifacts(ArtifactReadParams {
                session_id: "sess_content".to_string(),
                turn_id: None,
                artifact_ref: Some("artifact-provider".to_string()),
                include_content: Some(true),
                cursor: None,
                limit: None,
            })
            .expect("read content");
        assert_eq!(
            with_content.artifacts[0].content.as_deref(),
            Some("content-studio:artifact-provider")
        );
        assert_eq!(
            with_content.artifacts[0].content_status,
            ArtifactContentStatus::Available
        );
    }

    #[test]
    fn filesystem_artifact_content_provider_reads_allowed_relative_path() {
        let temp = tempfile::tempdir().expect("temp dir");
        let artifact_dir = temp.path().join(".app-server").join("artifacts");
        fs::create_dir_all(&artifact_dir).expect("artifact dir");
        fs::write(artifact_dir.join("provider.md"), "# Provider").expect("artifact file");

        let core = RuntimeCore::with_backend_capability_source_and_artifact_content_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(FilesystemArtifactContentProvider::new(temp.path())),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_file_content".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.append_external_runtime_events(
            "sess_file_content",
            None,
            vec![RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-file",
                    "path": ".app-server/artifacts/provider.md"
                }),
            )],
        )
        .expect("append artifact event");

        let response = core
            .read_artifacts(ArtifactReadParams {
                session_id: "sess_file_content".to_string(),
                turn_id: None,
                artifact_ref: Some("artifact-file".to_string()),
                include_content: Some(true),
                cursor: None,
                limit: None,
            })
            .expect("read file content");

        assert_eq!(response.artifacts.len(), 1);
        assert_eq!(response.artifacts[0].content.as_deref(), Some("# Provider"));
        assert_eq!(
            response.artifacts[0].content_status,
            ArtifactContentStatus::Available
        );
    }

    #[test]
    fn filesystem_artifact_content_provider_rejects_escape_and_oversized_files() {
        let temp = tempfile::tempdir().expect("temp dir");
        let artifact_dir = temp.path().join("artifacts");
        fs::create_dir_all(&artifact_dir).expect("artifact dir");
        fs::write(artifact_dir.join("small.md"), "ok").expect("small file");
        fs::write(artifact_dir.join("large.md"), "too-large").expect("large file");
        let outside = tempfile::tempdir().expect("outside dir");
        fs::write(outside.path().join("outside.md"), "outside").expect("outside file");

        let provider = FilesystemArtifactContentProvider::new(temp.path()).with_max_bytes(2);
        let session = AgentSession {
            session_id: "sess_fs".to_string(),
            thread_id: "thread_fs".to_string(),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            status: AgentSessionStatus::Idle,
            created_at: timestamp(),
            updated_at: timestamp(),
        };

        let small = provider.read_content(&ArtifactContentRequest {
            session: session.clone(),
            artifact: ArtifactSummary {
                artifact_ref: "small".to_string(),
                event_id: "evt-small".to_string(),
                sequence: 1,
                turn_id: None,
                artifact_id: Some("small".to_string()),
                path: Some("artifacts/small.md".to_string()),
                title: None,
                kind: None,
                status: None,
                content: None,
                content_status: ArtifactContentStatus::NotRequested,
                metadata: None,
            },
        });
        assert_eq!(small.as_deref(), Some("ok"));

        let oversized = provider.read_content(&ArtifactContentRequest {
            session: session.clone(),
            artifact: ArtifactSummary {
                artifact_ref: "large".to_string(),
                event_id: "evt-large".to_string(),
                sequence: 2,
                turn_id: None,
                artifact_id: Some("large".to_string()),
                path: Some("artifacts/large.md".to_string()),
                title: None,
                kind: None,
                status: None,
                content: Some("inline fallback".to_string()),
                content_status: ArtifactContentStatus::NotRequested,
                metadata: None,
            },
        });
        assert_eq!(oversized.as_deref(), Some("inline fallback"));

        let escaped = provider.read_content(&ArtifactContentRequest {
            session,
            artifact: ArtifactSummary {
                artifact_ref: "escape".to_string(),
                event_id: "evt-escape".to_string(),
                sequence: 3,
                turn_id: None,
                artifact_id: Some("escape".to_string()),
                path: Some(format!(
                    "../{}/outside.md",
                    outside
                        .path()
                        .file_name()
                        .expect("outside file name")
                        .to_string_lossy()
                )),
                title: None,
                kind: None,
                status: None,
                content: Some("inline fallback".to_string()),
                content_status: ArtifactContentStatus::NotRequested,
                metadata: None,
            },
        });
        assert_eq!(escaped.as_deref(), Some("inline fallback"));
    }

    #[tokio::test]
    async fn export_evidence_reads_session_turn_events_and_artifact_summaries() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_evidence".to_string()),
            thread_id: Some("thread_evidence".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_evidence".to_string(),
                turn_id: Some("turn_evidence".to_string()),
                input: AgentInput {
                    text: "生成 evidence".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");
        core.append_external_runtime_events(
            "sess_evidence",
            Some("turn_evidence"),
            vec![
                RuntimeEvent::new(
                    "message.delta",
                    json!({
                        "text": "draft",
                        "evidenceRefs": ["evidence://sess_evidence/runtime"]
                    }),
                ),
                RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-report",
                        "path": ".app-server/artifacts/report.md",
                        "content": "# Report"
                    }),
                ),
            ],
        )
        .expect("append evidence events");

        let response = core
            .export_evidence(EvidenceExportParams {
                session_id: "sess_evidence".to_string(),
                turn_id: Some("turn_evidence".to_string()),
                include_events: Some(true),
                include_artifacts: Some(true),
                include_evidence_pack: None,
            })
            .await
            .expect("export evidence");

        assert_eq!(response.session.session_id, "sess_evidence");
        assert_eq!(response.turns.len(), 1);
        assert_eq!(response.turns[0].turn_id, "turn_evidence");
        assert_eq!(response.events.len(), 3);
        assert_eq!(response.events[1].event_type, "message.delta");
        assert_eq!(response.artifacts.len(), 1);
        assert_eq!(response.artifacts[0].artifact_ref, "artifact-report");
        assert_eq!(response.artifacts[0].content, None);
        assert_eq!(
            response.artifacts[0].content_status,
            ArtifactContentStatus::NotRequested
        );
        assert!(!response.exported_at.is_empty());
        assert_eq!(response.evidence_pack, None);

        let summary_only = core
            .export_evidence(EvidenceExportParams {
                session_id: "sess_evidence".to_string(),
                turn_id: Some("turn_evidence".to_string()),
                include_events: Some(false),
                include_artifacts: Some(false),
                include_evidence_pack: Some(false),
            })
            .await
            .expect("export summary-only evidence");
        assert_eq!(summary_only.events.len(), 0);
        assert_eq!(summary_only.artifacts.len(), 0);
        assert_eq!(summary_only.turns.len(), 1);
        assert_eq!(summary_only.evidence_pack, None);
    }

    #[tokio::test]
    async fn export_evidence_uses_injected_evidence_pack_provider() {
        let provider = Arc::new(TestEvidenceExportProvider::default());
        let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_evidence".to_string()),
            thread_id: Some("thread_evidence".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_evidence".to_string(),
                turn_id: Some("turn_evidence".to_string()),
                input: AgentInput {
                    text: "生成 evidence".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");
        core.append_external_runtime_events(
            "sess_evidence",
            Some("turn_evidence"),
            vec![RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-report",
                    "path": ".app-server/artifacts/report.md"
                }),
            )],
        )
        .expect("append evidence events");

        let response = core
            .export_evidence(EvidenceExportParams {
                session_id: "sess_evidence".to_string(),
                turn_id: Some("turn_evidence".to_string()),
                include_events: Some(true),
                include_artifacts: Some(true),
                include_evidence_pack: None,
            })
            .await
            .expect("export evidence");

        assert_eq!(provider.call_count.load(Ordering::SeqCst), 1);
        let requests = provider
            .requests
            .lock()
            .expect("test evidence requests mutex poisoned");
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].session.session_id, "sess_evidence");
        assert_eq!(requests[0].turns[0].turn_id, "turn_evidence");
        assert_eq!(requests[0].events.len(), 2);
        assert_eq!(requests[0].artifacts[0].artifact_ref, "artifact-report");

        let evidence_pack = response.evidence_pack.expect("evidence pack");
        assert_eq!(evidence_pack.thread_status, "running");
        assert_eq!(
            evidence_pack.latest_turn_status.as_deref(),
            Some("accepted")
        );
        assert_eq!(evidence_pack.turn_count, 1);
        assert_eq!(evidence_pack.recent_artifact_count, 1);
        assert_eq!(
            evidence_pack
                .completion_audit_summary
                .as_ref()
                .and_then(|summary| summary.get("decision"))
                .and_then(|decision| decision.as_str()),
            Some("in_progress")
        );
    }

    #[tokio::test]
    async fn export_evidence_can_skip_injected_evidence_pack_provider() {
        let provider = Arc::new(TestEvidenceExportProvider::default());
        let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_evidence".to_string()),
            thread_id: Some("thread_evidence".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let response = core
            .export_evidence(EvidenceExportParams {
                session_id: "sess_evidence".to_string(),
                turn_id: None,
                include_events: Some(true),
                include_artifacts: Some(true),
                include_evidence_pack: Some(false),
            })
            .await
            .expect("export evidence");

        assert_eq!(provider.call_count.load(Ordering::SeqCst), 0);
        assert_eq!(response.evidence_pack, None);
    }

    #[test]
    fn capability_list_with_unknown_session_id_returns_session_not_found() {
        let core = RuntimeCore::default();

        let error = core
            .list_capabilities(CapabilityListParams {
                app_id: None,
                workspace_id: None,
                session_id: Some("sess_missing".to_string()),
                cursor: None,
                limit: None,
            })
            .expect_err("missing session");

        match error {
            RuntimeCoreError::SessionNotFound(session_id) => {
                assert_eq!(session_id, "sess_missing");
            }
            other => panic!("expected session not found, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn mock_backend_emits_public_runtime_event() {
        let core = RuntimeCore::default();
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
                        text: "hello".to_string(),
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

        let events = core
            .events_for_session(&session.session_id)
            .expect("runtime events");
        assert_eq!(events.len(), 1);
        assert_eq!(output.events.len(), 1);
        assert_eq!(events[0].event_type, "turn.accepted");
        assert_eq!(events[0].payload["backend"], "mock");
        assert_eq!(events[0].payload["clientName"], "test-client");
    }

    #[tokio::test]
    async fn final_done_runtime_event_marks_turn_completed() {
        let core = RuntimeCore::with_backend(Arc::new(FinalDoneBackend));
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_final_done".to_string()),
                thread_id: Some("thread_final_done".to_string()),
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
                    turn_id: Some("turn_final_done".to_string()),
                    input: AgentInput {
                        text: "hello".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn");

        assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
        assert!(output.response.turn.completed_at.is_some());

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: session.session_id,
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        assert_eq!(read.session.status, AgentSessionStatus::Completed);
        assert_eq!(read.turns.len(), 1);
        assert_eq!(read.turns[0].status, AgentTurnStatus::Completed);
        assert!(read.turns[0].completed_at.is_some());
    }

    #[tokio::test]
    async fn unavailable_backend_rejects_turn_without_persisting_fake_turn() {
        let core = RuntimeCore::with_backend(Arc::new(UnavailableBackend));
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_unavailable".to_string()),
                thread_id: None,
                app_id: "content-studio".to_string(),
                workspace_id: Some("default".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session")
            .session;

        let error = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session.session_id.clone(),
                    turn_id: Some("turn_unavailable".to_string()),
                    input: AgentInput {
                        text: "hello".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("unavailable backend");

        match error {
            RuntimeCoreError::Backend(message) => {
                assert!(message.contains("standalone app-server backend is not configured"));
            }
            other => panic!("expected backend error, got {other:?}"),
        }

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: session.session_id,
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        assert_eq!(read.session.status, AgentSessionStatus::Idle);
        assert!(read.turns.is_empty());
        assert!(core
            .events_for_session("sess_unavailable")
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn start_turn_allows_visible_capability_id() {
        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(crate::CapabilityInventorySource::new(vec![
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "content.draft.generate".to_string(),
                    title: "Generate Draft".to_string(),
                    description: None,
                    methods: vec!["agentSession/turn/start".to_string()],
                })
                .for_apps(["content-studio"]),
            ])),
        );
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_capability".to_string()),
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
                    turn_id: Some("turn_capability".to_string()),
                    input: AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("content.draft.generate".to_string()),
                        stream: false,
                        event_name: None,
                        provider_preference: None,
                        model_preference: None,
                        metadata: None,
                        queued_turn_id: None,
                        host_options: None,
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn");

        assert_eq!(output.response.turn.turn_id, "turn_capability");
    }

    #[tokio::test]
    async fn start_turn_allows_session_scoped_capability_id() {
        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(crate::CapabilityInventorySource::new(vec![
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "session.draft.write".to_string(),
                    title: "Session Draft Write".to_string(),
                    description: None,
                    methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
                })
                .for_apps(["content-studio"])
                .for_workspaces(["workspace-main"])
                .for_sessions(["sess_runtime_allowed"]),
            ])),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_runtime_allowed".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let output = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_runtime_allowed".to_string(),
                    turn_id: Some("turn_session_capability".to_string()),
                    input: AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("session.draft.write".to_string()),
                        stream: false,
                        event_name: None,
                        provider_preference: None,
                        model_preference: None,
                        metadata: None,
                        queued_turn_id: None,
                        host_options: None,
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn");

        assert_eq!(output.response.turn.turn_id, "turn_session_capability");
    }

    #[tokio::test]
    async fn start_turn_rejects_hidden_capability_id_without_persisting_turn() {
        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(crate::CapabilityInventorySource::new(vec![
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "content.draft.generate".to_string(),
                    title: "Generate Draft".to_string(),
                    description: None,
                    methods: vec!["agentSession/turn/start".to_string()],
                })
                .for_apps(["other-app"]),
            ])),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_capability_denied".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let error = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_capability_denied".to_string(),
                    turn_id: Some("turn_denied".to_string()),
                    input: AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("content.draft.generate".to_string()),
                        stream: false,
                        event_name: None,
                        provider_preference: None,
                        model_preference: None,
                        metadata: None,
                        queued_turn_id: None,
                        host_options: None,
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("capability denied");

        match error {
            RuntimeCoreError::CapabilityDenied(capability_id) => {
                assert_eq!(capability_id, "content.draft.generate");
            }
            other => panic!("expected capability denied, got {other:?}"),
        }
        let read = core
            .read_session(AgentSessionReadParams {
                session_id: "sess_capability_denied".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        assert!(read.turns.is_empty());
    }

    #[tokio::test]
    async fn start_turn_rejects_readiness_only_capability_id_without_persisting_turn() {
        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(crate::CapabilityInventorySource::new(vec![
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "content.readiness.check".to_string(),
                    title: "Readiness Check".to_string(),
                    description: None,
                    methods: vec!["capability/list".to_string()],
                })
                .for_apps(["content-studio"]),
            ])),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_readiness_only".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let listed = core
            .list_capabilities(CapabilityListParams {
                app_id: Some("content-studio".to_string()),
                workspace_id: Some("default".to_string()),
                session_id: None,
                cursor: None,
                limit: None,
            })
            .expect("capability list");
        assert_eq!(listed.capabilities.len(), 1);
        assert_eq!(listed.capabilities[0].id, "content.readiness.check");

        let error = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_readiness_only".to_string(),
                    turn_id: Some("turn_readiness_denied".to_string()),
                    input: AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("content.readiness.check".to_string()),
                        stream: false,
                        event_name: None,
                        provider_preference: None,
                        model_preference: None,
                        metadata: None,
                        queued_turn_id: None,
                        host_options: None,
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("capability denied");

        match error {
            RuntimeCoreError::CapabilityDenied(capability_id) => {
                assert_eq!(capability_id, "content.readiness.check");
            }
            other => panic!("expected capability denied, got {other:?}"),
        }
        let read = core
            .read_session(AgentSessionReadParams {
                session_id: "sess_readiness_only".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        assert!(read.turns.is_empty());
    }

    #[test]
    fn start_session_can_bind_caller_supplied_ids() {
        let core = RuntimeCore::default();

        let response = core
            .start_session(AgentSessionStartParams {
                session_id: Some(" sess_external ".to_string()),
                thread_id: Some(" thread_external ".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("default".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");

        assert_eq!(response.session.session_id, "sess_external");
        assert_eq!(response.session.thread_id, "thread_external");
    }

    #[test]
    fn start_session_rejects_duplicate_session_id() {
        let core = RuntimeCore::default();
        let params = AgentSessionStartParams {
            session_id: Some("sess_external".to_string()),
            thread_id: Some("thread_external".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        };

        core.start_session(params.clone()).expect("first session");
        let error = core
            .start_session(params)
            .expect_err("duplicate session should fail");

        match error {
            RuntimeCoreError::SessionAlreadyExists(session_id) => {
                assert_eq!(session_id, "sess_external");
            }
            other => panic!("expected duplicate session error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn append_external_runtime_events_keeps_sequence_and_turn_scope() {
        let core = RuntimeCore::default();
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_external".to_string()),
                thread_id: Some("thread_external".to_string()),
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
                        text: "hello".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn");
        let turn_id = output.response.turn.turn_id;

        let appended = core
            .append_external_runtime_events(
                &session.session_id,
                Some(&turn_id),
                vec![RuntimeEvent::new(
                    "message.delta",
                    json!({ "text": "delta" }),
                )],
            )
            .expect("append");

        assert_eq!(appended.len(), 1);
        assert_eq!(appended[0].sequence, 2);
        assert_eq!(appended[0].session_id, "sess_external");
        assert_eq!(appended[0].thread_id.as_deref(), Some("thread_external"));
        assert_eq!(appended[0].turn_id.as_deref(), Some(turn_id.as_str()));
        assert_eq!(appended[0].event_type, "message.delta");
        assert_eq!(appended[0].payload["text"], "delta");
    }
}
