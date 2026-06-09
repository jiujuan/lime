use crate::capability::capability_descriptor_allows_agent_turn_start;
use crate::CapabilityInventorySource;
use crate::CapabilityListContext;
use crate::CapabilitySource;
use crate::KnowledgeBuilderRuntimeExecutor;
use crate::NativeKnowledgeBuilderRuntimeExecutor;
use app_server_protocol::error_codes;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppInstalledDisabledSetParams;
use app_server_protocol::AgentAppInstalledListResponse;
use app_server_protocol::AgentAppInstalledSaveParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppLocalPackageInspectResponse;
use app_server_protocol::AgentAppPackageCacheEntry;
use app_server_protocol::AgentAppShellPackageMount;
use app_server_protocol::AgentAppShellPrepareParams;
use app_server_protocol::AgentAppShellPrepareResponse;
use app_server_protocol::AgentAppUiRuntimeStartParams;
use app_server_protocol::AgentAppUiRuntimeStatusParams;
use app_server_protocol::AgentAppUiRuntimeStatusResponse;
use app_server_protocol::AgentAppUiRuntimeStopParams;
use app_server_protocol::AgentAppUninstallParams;
use app_server_protocol::AgentAppUninstallRehearsalParams;
use app_server_protocol::AgentAppUninstallRehearsalResponse;
use app_server_protocol::AgentAppUninstallResponse;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionActionReplayParams;
use app_server_protocol::AgentSessionActionReplayResponse;
use app_server_protocol::AgentSessionActionRespondParams;
use app_server_protocol::AgentSessionActionRespondResponse;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionActionType;
use app_server_protocol::AgentSessionAnalysisHandoffExportParams;
use app_server_protocol::AgentSessionAnalysisHandoffExportResponse;
use app_server_protocol::AgentSessionCompactParams;
use app_server_protocol::AgentSessionCompactResponse;
use app_server_protocol::AgentSessionFileCheckpointDetail;
use app_server_protocol::AgentSessionFileCheckpointDiffParams;
use app_server_protocol::AgentSessionFileCheckpointDiffResponse;
use app_server_protocol::AgentSessionFileCheckpointGetParams;
use app_server_protocol::AgentSessionFileCheckpointListParams;
use app_server_protocol::AgentSessionFileCheckpointListResponse;
use app_server_protocol::AgentSessionFileCheckpointRestoreParams;
use app_server_protocol::AgentSessionFileCheckpointRestoreResponse;
use app_server_protocol::AgentSessionHandoffArtifact;
use app_server_protocol::AgentSessionHandoffBundleExportParams;
use app_server_protocol::AgentSessionHandoffBundleExportResponse;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionListResponse;
use app_server_protocol::AgentSessionObjectiveAuditParams;
use app_server_protocol::AgentSessionObjectiveAuditResponse;
use app_server_protocol::AgentSessionObjectiveClearParams;
use app_server_protocol::AgentSessionObjectiveClearResponse;
use app_server_protocol::AgentSessionObjectiveContinueParams;
use app_server_protocol::AgentSessionObjectiveContinueResponse;
use app_server_protocol::AgentSessionObjectiveReadParams;
use app_server_protocol::AgentSessionObjectiveReadResponse;
use app_server_protocol::AgentSessionObjectiveSetParams;
use app_server_protocol::AgentSessionObjectiveSetResponse;
use app_server_protocol::AgentSessionObjectiveStatusUpdateParams;
use app_server_protocol::AgentSessionObjectiveStatusUpdateResponse;
use app_server_protocol::AgentSessionOverview;
use app_server_protocol::AgentSessionQueuedTurnPromoteParams;
use app_server_protocol::AgentSessionQueuedTurnPromoteResponse;
use app_server_protocol::AgentSessionQueuedTurnRemoveParams;
use app_server_protocol::AgentSessionQueuedTurnRemoveResponse;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentSessionReplayCaseExportParams;
use app_server_protocol::AgentSessionReplayCaseExportResponse;
use app_server_protocol::AgentSessionReplayedActionRequired;
use app_server_protocol::AgentSessionReviewDecision;
use app_server_protocol::AgentSessionReviewDecisionSaveParams;
use app_server_protocol::AgentSessionReviewDecisionTemplateExportParams;
use app_server_protocol::AgentSessionReviewDecisionTemplateExportResponse;
use app_server_protocol::AgentSessionStartParams;
use app_server_protocol::AgentSessionStartResponse;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentSessionThreadResumeParams;
use app_server_protocol::AgentSessionThreadResumeResponse;
use app_server_protocol::AgentSessionTurnCancelParams;
use app_server_protocol::AgentSessionTurnCancelResponse;
use app_server_protocol::AgentSessionTurnStartParams;
use app_server_protocol::AgentSessionTurnStartResponse;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::AgentSessionUpdateResponse;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::ArtifactReadResponse;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::AutomationJobCreateParams;
use app_server_protocol::AutomationJobDeleteResponse;
use app_server_protocol::AutomationJobHealthParams;
use app_server_protocol::AutomationJobHealthResponse;
use app_server_protocol::AutomationJobIdParams;
use app_server_protocol::AutomationJobListResponse;
use app_server_protocol::AutomationJobReadResponse;
use app_server_protocol::AutomationJobRunHistoryParams;
use app_server_protocol::AutomationJobRunHistoryResponse;
use app_server_protocol::AutomationJobRunNowResponse;
use app_server_protocol::AutomationJobUpdateParams;
use app_server_protocol::AutomationJobWriteResponse;
use app_server_protocol::AutomationScheduleParams;
use app_server_protocol::AutomationSchedulePreviewResponse;
use app_server_protocol::AutomationScheduleValidateResponse;
use app_server_protocol::AutomationSchedulerConfigReadResponse;
use app_server_protocol::AutomationSchedulerConfigUpdateParams;
use app_server_protocol::AutomationSchedulerConfigUpdateResponse;
use app_server_protocol::AutomationSchedulerStatusResponse;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::CapabilityListResponse;
use app_server_protocol::ChannelProbeParams;
use app_server_protocol::ChannelProbeResponse;
use app_server_protocol::ClientInfo;
use app_server_protocol::ConnectCallbackSendParams;
use app_server_protocol::ConnectCallbackSendResponse;
use app_server_protocol::ConnectDeepLinkResolveParams;
use app_server_protocol::ConnectDeepLinkResolveResponse;
use app_server_protocol::ConnectOpenDeepLinkResolveParams;
use app_server_protocol::ConnectOpenDeepLinkResolveResponse;
use app_server_protocol::ConnectRelayApiKeySaveParams;
use app_server_protocol::ConnectRelayApiKeySaveResponse;
use app_server_protocol::DiagnosticsCapabilityRoutingMetricsSnapshot;
use app_server_protocol::DiagnosticsIdempotencyDiagnostics;
use app_server_protocol::DiagnosticsMetricConfig;
use app_server_protocol::DiagnosticsRequestDedupDiagnostics;
use app_server_protocol::DiagnosticsResponseCacheDiagnostics;
use app_server_protocol::DiagnosticsTelemetrySummary;
use app_server_protocol::EvidenceExportParams;
use app_server_protocol::EvidenceExportResponse;
use app_server_protocol::EvidencePackArtifact;
use app_server_protocol::EvidencePackSummary;
use app_server_protocol::FileSystemCreateDirectoryParams;
use app_server_protocol::FileSystemCreateFileParams;
use app_server_protocol::FileSystemDeleteFileParams;
use app_server_protocol::FileSystemDirectoryListing;
use app_server_protocol::FileSystemFileEntry;
use app_server_protocol::FileSystemFilePreview;
use app_server_protocol::FileSystemListDirectoryParams;
use app_server_protocol::FileSystemMutationResponse;
use app_server_protocol::FileSystemReadFilePreviewParams;
use app_server_protocol::FileSystemRenameFileParams;
use app_server_protocol::GalleryMaterialDeleteResponse;
use app_server_protocol::GalleryMaterialFilterParams;
use app_server_protocol::GalleryMaterialListResponse;
use app_server_protocol::GalleryMaterialLookupParams;
use app_server_protocol::GalleryMaterialMetadataCreateParams;
use app_server_protocol::GalleryMaterialMetadataResponse;
use app_server_protocol::GalleryMaterialMetadataUpdateParams;
use app_server_protocol::GalleryMaterialResponse;
use app_server_protocol::GatewayChannelStartParams;
use app_server_protocol::GatewayChannelStatusParams;
use app_server_protocol::GatewayChannelStatusResponse;
use app_server_protocol::GatewayChannelStopParams;
use app_server_protocol::GatewayTunnelCloudflaredDetectResponse;
use app_server_protocol::GatewayTunnelCloudflaredInstallParams;
use app_server_protocol::GatewayTunnelCloudflaredInstallResponse;
use app_server_protocol::GatewayTunnelCreateParams;
use app_server_protocol::GatewayTunnelCreateResponse;
use app_server_protocol::GatewayTunnelProbeResponse;
use app_server_protocol::GatewayTunnelStatusResponse;
use app_server_protocol::GatewayTunnelSyncWebhookUrlParams;
use app_server_protocol::GatewayTunnelSyncWebhookUrlResponse;
use app_server_protocol::JsonRpcError;
use app_server_protocol::KnowledgeCompilePackParams;
use app_server_protocol::KnowledgeCompilePackResponse;
use app_server_protocol::KnowledgeContextResolutionResponse;
use app_server_protocol::KnowledgeImportSourceParams;
use app_server_protocol::KnowledgeImportSourceResponse;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::KnowledgeListPacksResponse;
use app_server_protocol::KnowledgeReadPackParams;
use app_server_protocol::KnowledgeReadPackResponse;
use app_server_protocol::KnowledgeResolveContextParams;
use app_server_protocol::KnowledgeSetDefaultPackParams;
use app_server_protocol::KnowledgeSetDefaultPackResponse;
use app_server_protocol::KnowledgeUpdatePackStatusParams;
use app_server_protocol::KnowledgeUpdatePackStatusResponse;
use app_server_protocol::KnowledgeValidateContextRunParams;
use app_server_protocol::KnowledgeValidateContextRunResponse;
use app_server_protocol::LogClearResponse;
use app_server_protocol::LogListResponse;
use app_server_protocol::LogPersistedTailParams;
use app_server_protocol::LogPersistedTailResponse;
use app_server_protocol::LogStorageDiagnosticsResponse;
use app_server_protocol::ManagedObjective;
use app_server_protocol::ManagedObjectiveStatus;
use app_server_protocol::McpPromptGetParams;
use app_server_protocol::McpPromptGetResponse;
use app_server_protocol::McpPromptListResponse;
use app_server_protocol::McpResourceListResponse;
use app_server_protocol::McpResourceReadParams;
use app_server_protocol::McpResourceReadResponse;
use app_server_protocol::McpServerCreateParams;
use app_server_protocol::McpServerDeleteParams;
use app_server_protocol::McpServerEnabledSetParams;
use app_server_protocol::McpServerImportFromAppParams;
use app_server_protocol::McpServerImportFromAppResponse;
use app_server_protocol::McpServerLifecycleResponse;
use app_server_protocol::McpServerListResponse;
use app_server_protocol::McpServerStartParams;
use app_server_protocol::McpServerStatusListResponse;
use app_server_protocol::McpServerStopParams;
use app_server_protocol::McpServerUpdateParams;
use app_server_protocol::McpToolCallParams;
use app_server_protocol::McpToolCallResponse;
use app_server_protocol::McpToolCallWithCallerParams;
use app_server_protocol::McpToolListForContextParams;
use app_server_protocol::McpToolListResponse;
use app_server_protocol::McpToolSearchParams;
use app_server_protocol::MediaTaskArtifactAudioCompleteParams;
use app_server_protocol::MediaTaskArtifactAudioCreateParams;
use app_server_protocol::MediaTaskArtifactImageCreateParams;
use app_server_protocol::MediaTaskArtifactListParams;
use app_server_protocol::MediaTaskArtifactListResponse;
use app_server_protocol::MediaTaskArtifactLookupParams;
use app_server_protocol::MediaTaskArtifactResponse;
use app_server_protocol::MediaTaskArtifactVideoCreateParams;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelListResponse;
use app_server_protocol::ModelPreferencesListResponse;
use app_server_protocol::ModelProviderAliasListResponse;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::ModelProviderAliasReadResponse;
use app_server_protocol::ModelProviderCatalogListResponse;
use app_server_protocol::ModelProviderConfigExportParams;
use app_server_protocol::ModelProviderConfigExportResponse;
use app_server_protocol::ModelProviderConfigImportParams;
use app_server_protocol::ModelProviderConfigImportResponse;
use app_server_protocol::ModelProviderCreateParams;
use app_server_protocol::ModelProviderDeleteParams;
use app_server_protocol::ModelProviderDeleteResponse;
use app_server_protocol::ModelProviderFetchModelsParams;
use app_server_protocol::ModelProviderFetchModelsResponse;
use app_server_protocol::ModelProviderKeyCreateParams;
use app_server_protocol::ModelProviderKeyDeleteParams;
use app_server_protocol::ModelProviderKeyDeleteResponse;
use app_server_protocol::ModelProviderKeyEventParams;
use app_server_protocol::ModelProviderKeyNextParams;
use app_server_protocol::ModelProviderKeyNextResponse;
use app_server_protocol::ModelProviderKeyUpdateParams;
use app_server_protocol::ModelProviderKeyWriteResponse;
use app_server_protocol::ModelProviderListResponse;
use app_server_protocol::ModelProviderMutationResponse;
use app_server_protocol::ModelProviderReadParams;
use app_server_protocol::ModelProviderReadResponse;
use app_server_protocol::ModelProviderSortOrdersUpdateParams;
use app_server_protocol::ModelProviderTestChatParams;
use app_server_protocol::ModelProviderTestChatResponse;
use app_server_protocol::ModelProviderTestConnectionParams;
use app_server_protocol::ModelProviderTestConnectionResponse;
use app_server_protocol::ModelProviderUiStateReadParams;
use app_server_protocol::ModelProviderUiStateReadResponse;
use app_server_protocol::ModelProviderUiStateWriteParams;
use app_server_protocol::ModelProviderUpdateParams;
use app_server_protocol::ModelProviderWriteResponse;
use app_server_protocol::ModelSyncStateReadResponse;
use app_server_protocol::ProjectMaterialContentResponse;
use app_server_protocol::ProjectMaterialCountResponse;
use app_server_protocol::ProjectMaterialDeleteResponse;
use app_server_protocol::ProjectMaterialImportFromUrlParams;
use app_server_protocol::ProjectMaterialListParams;
use app_server_protocol::ProjectMaterialListResponse;
use app_server_protocol::ProjectMaterialLookupParams;
use app_server_protocol::ProjectMaterialResponse;
use app_server_protocol::ProjectMaterialUpdateParams;
use app_server_protocol::ProjectMaterialUploadParams;
use app_server_protocol::ProjectMemoryReadParams;
use app_server_protocol::ProjectMemoryReadResponse;
use app_server_protocol::ServerDiagnosticsResponse;
use app_server_protocol::SessionFileEntryResponse;
use app_server_protocol::SessionFileGetOrCreateParams;
use app_server_protocol::SessionFileIdParams;
use app_server_protocol::SessionFileListResponse;
use app_server_protocol::SessionFileMetaResponse;
use app_server_protocol::SessionFileMutationResponse;
use app_server_protocol::SessionFileReadResponse;
use app_server_protocol::SessionFileResolvePathResponse;
use app_server_protocol::SessionFileSaveParams;
use app_server_protocol::SessionFileUpdateMetaParams;
use app_server_protocol::SkillDownloadInstallParams;
use app_server_protocol::SkillDownloadInstallResponse;
use app_server_protocol::SkillInstalledDirectoriesListResponse;
use app_server_protocol::SkillListResponse;
use app_server_protocol::SkillLocalDetailInspectParams;
use app_server_protocol::SkillLocalDetailInspectResponse;
use app_server_protocol::SkillLocalImportParams;
use app_server_protocol::SkillLocalImportResponse;
use app_server_protocol::SkillLocalInspectParams;
use app_server_protocol::SkillLocalInspectResponse;
use app_server_protocol::SkillLocalRenameParams;
use app_server_protocol::SkillLocalRenameResponse;
use app_server_protocol::SkillManagementInstallParams;
use app_server_protocol::SkillManagementListParams;
use app_server_protocol::SkillManagementUninstallParams;
use app_server_protocol::SkillManagementWriteResponse;
use app_server_protocol::SkillMarketplaceInstallParams;
use app_server_protocol::SkillMarketplaceInstallResponse;
use app_server_protocol::SkillPackageExportParams;
use app_server_protocol::SkillPackageExportResponse;
use app_server_protocol::SkillPackageLocalInspectParams;
use app_server_protocol::SkillPackageLocalInspectResponse;
use app_server_protocol::SkillPackageLocalInstallParams;
use app_server_protocol::SkillPackageLocalInstallResponse;
use app_server_protocol::SkillPackageLocalReplaceParams;
use app_server_protocol::SkillPackageLocalReplaceResponse;
use app_server_protocol::SkillReadParams;
use app_server_protocol::SkillReadResponse;
use app_server_protocol::SkillRemoteInspectParams;
use app_server_protocol::SkillRemoteInspectResponse;
use app_server_protocol::SkillRepositoryDeleteParams;
use app_server_protocol::SkillRepositoryListResponse;
use app_server_protocol::SkillRepositorySaveParams;
use app_server_protocol::SkillScaffoldCreateParams;
use app_server_protocol::SkillScaffoldCreateResponse;
use app_server_protocol::SupportBundleExportResponse;
use app_server_protocol::UnifiedMemoryAnalysisResponse;
use app_server_protocol::UnifiedMemoryAnalyzeParams;
use app_server_protocol::UnifiedMemoryCreateParams;
use app_server_protocol::UnifiedMemoryDeleteParams;
use app_server_protocol::UnifiedMemoryDeleteResponse;
use app_server_protocol::UnifiedMemoryGetParams;
use app_server_protocol::UnifiedMemoryGetResponse;
use app_server_protocol::UnifiedMemoryHybridSearchParams;
use app_server_protocol::UnifiedMemoryListParams;
use app_server_protocol::UnifiedMemoryListResponse;
use app_server_protocol::UnifiedMemorySearchParams;
use app_server_protocol::UnifiedMemorySemanticSearchParams;
use app_server_protocol::UnifiedMemoryStatsResponse;
use app_server_protocol::UnifiedMemoryUpdateParams;
use app_server_protocol::UnifiedMemoryWriteResponse;
use app_server_protocol::UsageStatsDailyTrendsListResponse;
use app_server_protocol::UsageStatsModelRankingListResponse;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::UsageStatsReadResponse;
use app_server_protocol::VoiceAsrCredentialCreateParams;
use app_server_protocol::VoiceAsrCredentialIdParams;
use app_server_protocol::VoiceAsrCredentialListResponse;
use app_server_protocol::VoiceAsrCredentialMutationResponse;
use app_server_protocol::VoiceAsrCredentialTestResponse;
use app_server_protocol::VoiceAsrCredentialUpdateParams;
use app_server_protocol::VoiceAsrCredentialWriteResponse;
use app_server_protocol::VoiceInstructionIdParams;
use app_server_protocol::VoiceInstructionListResponse;
use app_server_protocol::VoiceInstructionMutationResponse;
use app_server_protocol::VoiceInstructionSaveParams;
use app_server_protocol::VoiceModelDefaultSetParams;
use app_server_protocol::VoiceModelDefaultSetResponse;
use app_server_protocol::VoiceModelTestTranscribeFileParams;
use app_server_protocol::VoiceModelTestTranscribeFileResponse;
use app_server_protocol::WechatChannelAccountListResponse;
use app_server_protocol::WechatChannelAccountRemoveParams;
use app_server_protocol::WechatChannelAccountRemoveResponse;
use app_server_protocol::WechatLoginStartParams;
use app_server_protocol::WechatLoginStartResponse;
use app_server_protocol::WechatLoginWaitParams;
use app_server_protocol::WechatLoginWaitResponse;
use app_server_protocol::WechatRuntimeModelSetParams;
use app_server_protocol::WechatRuntimeModelSetResponse;
use app_server_protocol::WindowsStartupDiagnosticsResponse;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspaceEnsureReadyResponse;
use app_server_protocol::WorkspaceListResponse;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceProjectPathResolveResponse;
use app_server_protocol::WorkspaceProjectsRootReadResponse;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceReadResponse;
use app_server_protocol::WorkspaceRegisteredSkillsListParams;
use app_server_protocol::WorkspaceRegisteredSkillsListResponse;
use app_server_protocol::WorkspaceSkillBindingsListParams;
use app_server_protocol::WorkspaceSkillBindingsListResponse;
use async_trait::async_trait;
use chrono::SecondsFormat;
use chrono::Utc;
use serde_json::json;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fmt::Write as _;
use std::fs;
use std::io::Read;
use std::net::TcpListener;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;
use thiserror::Error;
use tokio::process::Child;
use tokio::process::Command;
use tokio::time::sleep;
use uuid::Uuid;

pub const DEFAULT_ARTIFACT_CONTENT_MAX_BYTES: u64 = 1024 * 1024;
const AGENT_APP_DATA_DIR: &str = "agent-apps";
const AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS: u64 = 45;
const HANDOFF_BUNDLE_RELATIVE_ROOT: &str = ".lime/harness/sessions";
const HANDOFF_PLAN_FILE_NAME: &str = "plan.md";
const HANDOFF_PROGRESS_FILE_NAME: &str = "progress.json";
const HANDOFF_FILE_NAME: &str = "handoff.md";
const HANDOFF_REVIEW_SUMMARY_FILE_NAME: &str = "review-summary.md";
const HANDOFF_RECENT_ARTIFACT_LIMIT: usize = 8;
const REPLAY_CASE_INPUT_FILE_NAME: &str = "input.json";
const REPLAY_CASE_EXPECTED_FILE_NAME: &str = "expected.json";
const REPLAY_CASE_GRADER_FILE_NAME: &str = "grader.md";
const REPLAY_CASE_EVIDENCE_LINKS_FILE_NAME: &str = "evidence-links.json";
const ANALYSIS_BRIEF_FILE_NAME: &str = "analysis-brief.md";
const ANALYSIS_CONTEXT_FILE_NAME: &str = "analysis-context.json";
const REVIEW_DECISION_MARKDOWN_FILE_NAME: &str = "review-decision.md";
const REVIEW_DECISION_JSON_FILE_NAME: &str = "review-decision.json";

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

    async fn update_current_timeline_session(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError>;

    async fn read_agent_session_objective(
        &self,
        _params: AgentSessionObjectiveReadParams,
    ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentSession/objective/read is not available without an app data source".to_string(),
        ))
    }

    async fn set_agent_session_objective(
        &self,
        _params: AgentSessionObjectiveSetParams,
    ) -> Result<AgentSessionObjectiveSetResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentSession/objective/set is not available without an app data source".to_string(),
        ))
    }

    async fn update_agent_session_objective_status(
        &self,
        _params: AgentSessionObjectiveStatusUpdateParams,
    ) -> Result<AgentSessionObjectiveStatusUpdateResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentSession/objective/status/update is not available without an app data source"
                .to_string(),
        ))
    }

    async fn clear_agent_session_objective(
        &self,
        _params: AgentSessionObjectiveClearParams,
    ) -> Result<AgentSessionObjectiveClearResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentSession/objective/clear is not available without an app data source".to_string(),
        ))
    }

    async fn read_managed_objective_by_owner(
        &self,
        _owner_kind: String,
        _owner_id: String,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "managed objective owner read is not available without an app data source".to_string(),
        ))
    }

    async fn audit_agent_session_objective(
        &self,
        _owner_kind: String,
        _owner_id: String,
        _update: ManagedObjectiveAuditUpdate,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentSession/objective/audit is not available without an app data source".to_string(),
        ))
    }

    async fn get_or_create_session_file(
        &self,
        _params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "sessionFile/getOrCreate is not available without an app data source".to_string(),
        ))
    }

    async fn update_session_file_meta(
        &self,
        _params: SessionFileUpdateMetaParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "sessionFile/updateMeta is not available without an app data source".to_string(),
        ))
    }

    async fn save_session_file(
        &self,
        _params: SessionFileSaveParams,
    ) -> Result<SessionFileEntryResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "sessionFile/save is not available without an app data source".to_string(),
        ))
    }

    async fn read_session_file(
        &self,
        _params: SessionFileIdParams,
    ) -> Result<SessionFileReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "sessionFile/read is not available without an app data source".to_string(),
        ))
    }

    async fn resolve_session_file_path(
        &self,
        _params: SessionFileIdParams,
    ) -> Result<SessionFileResolvePathResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "sessionFile/resolvePath is not available without an app data source".to_string(),
        ))
    }

    async fn delete_session_file(
        &self,
        _params: SessionFileIdParams,
    ) -> Result<SessionFileMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "sessionFile/delete is not available without an app data source".to_string(),
        ))
    }

    async fn list_session_files(
        &self,
        _params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "sessionFile/list is not available without an app data source".to_string(),
        ))
    }

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

    async fn list_management_skills(
        &self,
        _params: SkillManagementListParams,
    ) -> Result<SkillListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillManagement/list is not available without an app data source".to_string(),
        ))
    }

    async fn install_management_skill(
        &self,
        _params: SkillManagementInstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillManagement/install is not available without an app data source".to_string(),
        ))
    }

    async fn uninstall_management_skill(
        &self,
        _params: SkillManagementUninstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillManagement/uninstall is not available without an app data source".to_string(),
        ))
    }

    async fn list_skill_repositories(
        &self,
    ) -> Result<SkillRepositoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRepository/list is not available without an app data source".to_string(),
        ))
    }

    async fn save_skill_repository(
        &self,
        _params: SkillRepositorySaveParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRepository/save is not available without an app data source".to_string(),
        ))
    }

    async fn delete_skill_repository(
        &self,
        _params: SkillRepositoryDeleteParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRepository/delete is not available without an app data source".to_string(),
        ))
    }

    async fn refresh_skill_cache(&self) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillCache/refresh is not available without an app data source".to_string(),
        ))
    }

    async fn list_installed_skill_directories(
        &self,
    ) -> Result<SkillInstalledDirectoriesListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillInstalledDirectories/list is not available without an app data source"
                .to_string(),
        ))
    }

    async fn inspect_local_skill(
        &self,
        _params: SkillLocalInspectParams,
    ) -> Result<SkillLocalInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn inspect_local_skill_detail(
        &self,
        _params: SkillLocalDetailInspectParams,
    ) -> Result<SkillLocalDetailInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/detail/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn create_skill_scaffold(
        &self,
        _params: SkillScaffoldCreateParams,
    ) -> Result<SkillScaffoldCreateResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/scaffold/create is not available without an app data source".to_string(),
        ))
    }

    async fn import_local_skill(
        &self,
        _params: SkillLocalImportParams,
    ) -> Result<SkillLocalImportResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/import is not available without an app data source".to_string(),
        ))
    }

    async fn rename_local_skill(
        &self,
        _params: SkillLocalRenameParams,
    ) -> Result<SkillLocalRenameResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/rename is not available without an app data source".to_string(),
        ))
    }

    async fn inspect_remote_skill(
        &self,
        _params: SkillRemoteInspectParams,
    ) -> Result<SkillRemoteInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRemote/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn inspect_local_skill_package(
        &self,
        _params: SkillPackageLocalInspectParams,
    ) -> Result<SkillPackageLocalInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/local/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn install_local_skill_package(
        &self,
        _params: SkillPackageLocalInstallParams,
    ) -> Result<SkillPackageLocalInstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/local/install is not available without an app data source".to_string(),
        ))
    }

    async fn replace_local_skill_package(
        &self,
        _params: SkillPackageLocalReplaceParams,
    ) -> Result<SkillPackageLocalReplaceResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/local/replace is not available without an app data source".to_string(),
        ))
    }

    async fn export_local_skill_package(
        &self,
        _params: SkillPackageExportParams,
    ) -> Result<SkillPackageExportResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/export is not available without an app data source".to_string(),
        ))
    }

    async fn install_marketplace_skill(
        &self,
        _params: SkillMarketplaceInstallParams,
    ) -> Result<SkillMarketplaceInstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillMarketplace/install is not available without an app data source".to_string(),
        ))
    }

    async fn install_skill_from_download_url(
        &self,
        _params: SkillDownloadInstallParams,
    ) -> Result<SkillDownloadInstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/download/install is not available without an app data source".to_string(),
        ))
    }

    async fn start_gateway_channel(
        &self,
        _params: GatewayChannelStartParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayChannel/start is not available without an app data source".to_string(),
        ))
    }

    async fn stop_gateway_channel(
        &self,
        _params: GatewayChannelStopParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayChannel/stop is not available without an app data source".to_string(),
        ))
    }

    async fn read_gateway_channel_status(
        &self,
        _params: GatewayChannelStatusParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayChannel/status is not available without an app data source".to_string(),
        ))
    }

    async fn probe_gateway_tunnel(&self) -> Result<GatewayTunnelProbeResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/probe is not available without an app data source".to_string(),
        ))
    }

    async fn detect_gateway_tunnel_cloudflared(
        &self,
    ) -> Result<GatewayTunnelCloudflaredDetectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/cloudflared/detect is not available without an app data source"
                .to_string(),
        ))
    }

    async fn install_gateway_tunnel_cloudflared(
        &self,
        _params: GatewayTunnelCloudflaredInstallParams,
    ) -> Result<GatewayTunnelCloudflaredInstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/cloudflared/install is not available without an app data source"
                .to_string(),
        ))
    }

    async fn create_gateway_tunnel(
        &self,
        _params: GatewayTunnelCreateParams,
    ) -> Result<GatewayTunnelCreateResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/create is not available without an app data source".to_string(),
        ))
    }

    async fn start_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/start is not available without an app data source".to_string(),
        ))
    }

    async fn stop_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/stop is not available without an app data source".to_string(),
        ))
    }

    async fn restart_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/restart is not available without an app data source".to_string(),
        ))
    }

    async fn read_gateway_tunnel_status(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/status is not available without an app data source".to_string(),
        ))
    }

    async fn sync_gateway_tunnel_webhook_url(
        &self,
        _params: GatewayTunnelSyncWebhookUrlParams,
    ) -> Result<GatewayTunnelSyncWebhookUrlResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "gatewayTunnel/syncWebhookUrl is not available without an app data source".to_string(),
        ))
    }

    async fn probe_telegram_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "telegramChannel/probe is not available without an app data source".to_string(),
        ))
    }

    async fn probe_feishu_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "feishuChannel/probe is not available without an app data source".to_string(),
        ))
    }

    async fn probe_discord_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "discordChannel/probe is not available without an app data source".to_string(),
        ))
    }

    async fn probe_wechat_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "wechatChannel/probe is not available without an app data source".to_string(),
        ))
    }

    async fn start_wechat_channel_login(
        &self,
        _params: WechatLoginStartParams,
    ) -> Result<WechatLoginStartResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "wechatChannel/login/start is not available without an app data source".to_string(),
        ))
    }

    async fn wait_wechat_channel_login(
        &self,
        _params: WechatLoginWaitParams,
    ) -> Result<WechatLoginWaitResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "wechatChannel/login/wait is not available without an app data source".to_string(),
        ))
    }

    async fn list_wechat_channel_accounts(
        &self,
    ) -> Result<WechatChannelAccountListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "wechatChannel/accounts/list is not available without an app data source".to_string(),
        ))
    }

    async fn remove_wechat_channel_account(
        &self,
        _params: WechatChannelAccountRemoveParams,
    ) -> Result<WechatChannelAccountRemoveResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "wechatChannel/account/remove is not available without an app data source".to_string(),
        ))
    }

    async fn set_wechat_channel_runtime_model(
        &self,
        _params: WechatRuntimeModelSetParams,
    ) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "wechatChannel/runtimeModel/set is not available without an app data source"
                .to_string(),
        ))
    }

    async fn create_image_media_task_artifact(
        &self,
        _params: MediaTaskArtifactImageCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mediaTaskArtifact/image/create is not available without an app data source"
                .to_string(),
        ))
    }

    async fn create_audio_media_task_artifact(
        &self,
        _params: MediaTaskArtifactAudioCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mediaTaskArtifact/audio/create is not available without an app data source"
                .to_string(),
        ))
    }

    async fn create_video_media_task_artifact(
        &self,
        _params: MediaTaskArtifactVideoCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mediaTaskArtifact/video/create is not available without an app data source"
                .to_string(),
        ))
    }

    async fn complete_audio_media_task_artifact(
        &self,
        _params: MediaTaskArtifactAudioCompleteParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mediaTaskArtifact/audio/complete is not available without an app data source"
                .to_string(),
        ))
    }

    async fn get_media_task_artifact(
        &self,
        _params: MediaTaskArtifactLookupParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mediaTaskArtifact/get is not available without an app data source".to_string(),
        ))
    }

    async fn list_media_task_artifacts(
        &self,
        _params: MediaTaskArtifactListParams,
    ) -> Result<MediaTaskArtifactListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mediaTaskArtifact/list is not available without an app data source".to_string(),
        ))
    }

    async fn cancel_media_task_artifact(
        &self,
        _params: MediaTaskArtifactLookupParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mediaTaskArtifact/cancel is not available without an app data source".to_string(),
        ))
    }

    async fn get_gallery_material(
        &self,
        _params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterial/get is not available without an app data source".to_string(),
        ))
    }

    async fn create_gallery_material_metadata(
        &self,
        _params: GalleryMaterialMetadataCreateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterialMetadata/create is not available without an app data source"
                .to_string(),
        ))
    }

    async fn get_gallery_material_metadata(
        &self,
        _params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterialMetadata/get is not available without an app data source".to_string(),
        ))
    }

    async fn update_gallery_material_metadata(
        &self,
        _params: GalleryMaterialMetadataUpdateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterialMetadata/update is not available without an app data source"
                .to_string(),
        ))
    }

    async fn delete_gallery_material_metadata(
        &self,
        _params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialDeleteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterialMetadata/delete is not available without an app data source"
                .to_string(),
        ))
    }

    async fn list_gallery_materials_by_image_category(
        &self,
        _params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterial/listByImageCategory is not available without an app data source"
                .to_string(),
        ))
    }

    async fn list_gallery_materials_by_layout_category(
        &self,
        _params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterial/listByLayoutCategory is not available without an app data source"
                .to_string(),
        ))
    }

    async fn list_gallery_materials_by_mood(
        &self,
        _params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "galleryMaterial/listByMood is not available without an app data source".to_string(),
        ))
    }

    async fn list_project_materials(
        &self,
        _params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/list is not available without an app data source".to_string(),
        ))
    }

    async fn get_project_material(
        &self,
        _params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/get is not available without an app data source".to_string(),
        ))
    }

    async fn count_project_materials(
        &self,
        _params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialCountResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/count is not available without an app data source".to_string(),
        ))
    }

    async fn upload_project_material(
        &self,
        _params: ProjectMaterialUploadParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/upload is not available without an app data source".to_string(),
        ))
    }

    async fn import_project_material_from_url(
        &self,
        _params: ProjectMaterialImportFromUrlParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/importFromUrl is not available without an app data source".to_string(),
        ))
    }

    async fn update_project_material(
        &self,
        _params: ProjectMaterialUpdateParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/update is not available without an app data source".to_string(),
        ))
    }

    async fn delete_project_material(
        &self,
        _params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialDeleteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/delete is not available without an app data source".to_string(),
        ))
    }

    async fn read_project_material_content(
        &self,
        _params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialContentResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "projectMaterial/content is not available without an app data source".to_string(),
        ))
    }

    async fn list_voice_asr_credentials(
        &self,
    ) -> Result<VoiceAsrCredentialListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceAsrCredential/list is not available without an app data source".to_string(),
        ))
    }

    async fn create_voice_asr_credential(
        &self,
        _params: VoiceAsrCredentialCreateParams,
    ) -> Result<VoiceAsrCredentialWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceAsrCredential/create is not available without an app data source".to_string(),
        ))
    }

    async fn update_voice_asr_credential(
        &self,
        _params: VoiceAsrCredentialUpdateParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceAsrCredential/update is not available without an app data source".to_string(),
        ))
    }

    async fn delete_voice_asr_credential(
        &self,
        _params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceAsrCredential/delete is not available without an app data source".to_string(),
        ))
    }

    async fn set_default_voice_asr_credential(
        &self,
        _params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceAsrCredential/default/set is not available without an app data source"
                .to_string(),
        ))
    }

    async fn test_voice_asr_credential(
        &self,
        _params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialTestResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceAsrCredential/test is not available without an app data source".to_string(),
        ))
    }

    async fn test_transcribe_voice_model_file(
        &self,
        _params: VoiceModelTestTranscribeFileParams,
    ) -> Result<VoiceModelTestTranscribeFileResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceModel/testTranscribeFile is not available without an app data source".to_string(),
        ))
    }

    async fn list_voice_instructions(
        &self,
    ) -> Result<VoiceInstructionListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceInstruction/list is not available without an app data source".to_string(),
        ))
    }

    async fn save_voice_instruction(
        &self,
        _params: VoiceInstructionSaveParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceInstruction/save is not available without an app data source".to_string(),
        ))
    }

    async fn delete_voice_instruction(
        &self,
        _params: VoiceInstructionIdParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceInstruction/delete is not available without an app data source".to_string(),
        ))
    }

    async fn set_default_voice_model(
        &self,
        _params: VoiceModelDefaultSetParams,
    ) -> Result<VoiceModelDefaultSetResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "voiceModel/default/set is not available without an app data source".to_string(),
        ))
    }

    async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError>;

    async fn list_workspace_registered_skills(
        &self,
        params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError>;

    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError>;

    async fn inspect_agent_app_local_package(
        &self,
        _params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppLocalPackage/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn fetch_agent_app_cloud_package(
        &self,
        _params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppPackage/fetchCloud is not available without an app data source".to_string(),
        ))
    }

    async fn save_agent_app_installed(
        &self,
        _params: AgentAppInstalledSaveParams,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/save is not available without an app data source".to_string(),
        ))
    }

    async fn set_agent_app_installed_disabled(
        &self,
        _params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/disabled/set is not available without an app data source"
                .to_string(),
        ))
    }

    async fn preview_agent_app_uninstall(
        &self,
        _params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/uninstall/rehearsal is not available without an app data source"
                .to_string(),
        ))
    }

    async fn uninstall_agent_app(
        &self,
        _params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/uninstall is not available without an app data source".to_string(),
        ))
    }

    async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError>;

    async fn read_knowledge_pack(
        &self,
        params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError>;

    async fn import_knowledge_source(
        &self,
        params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError>;

    async fn compile_knowledge_pack(
        &self,
        request: lime_knowledge::KnowledgeCompilePackRequest,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError>;

    async fn set_default_knowledge_pack(
        &self,
        params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError>;

    async fn update_knowledge_pack_status(
        &self,
        params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError>;

    async fn resolve_knowledge_context(
        &self,
        params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError>;

    async fn validate_knowledge_context_run(
        &self,
        params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError>;

    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError>;

    async fn list_mcp_servers(&self) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/list is not available without an app data source".to_string(),
        ))
    }

    async fn list_mcp_servers_with_status(
        &self,
    ) -> Result<McpServerStatusListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServerStatus/list is not available without an app data source".to_string(),
        ))
    }

    async fn create_mcp_server(
        &self,
        _params: McpServerCreateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/create is not available without an app data source".to_string(),
        ))
    }

    async fn update_mcp_server(
        &self,
        _params: McpServerUpdateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/update is not available without an app data source".to_string(),
        ))
    }

    async fn delete_mcp_server(
        &self,
        _params: McpServerDeleteParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/delete is not available without an app data source".to_string(),
        ))
    }

    async fn set_mcp_server_enabled(
        &self,
        _params: McpServerEnabledSetParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/enabled/set is not available without an app data source".to_string(),
        ))
    }

    async fn import_mcp_servers_from_app(
        &self,
        _params: McpServerImportFromAppParams,
    ) -> Result<McpServerImportFromAppResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/importFromApp is not available without an app data source".to_string(),
        ))
    }

    async fn sync_all_mcp_servers_to_live(
        &self,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/syncAllToLive is not available without an app data source".to_string(),
        ))
    }

    async fn start_mcp_server(
        &self,
        _params: McpServerStartParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/start is not available without an app data source".to_string(),
        ))
    }

    async fn stop_mcp_server(
        &self,
        _params: McpServerStopParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/stop is not available without an app data source".to_string(),
        ))
    }

    async fn list_mcp_tools(&self) -> Result<McpToolListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpTool/list is not available without an app data source".to_string(),
        ))
    }

    async fn list_mcp_tools_for_context(
        &self,
        _params: McpToolListForContextParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpTool/listForContext is not available without an app data source".to_string(),
        ))
    }

    async fn search_mcp_tools(
        &self,
        _params: McpToolSearchParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpTool/search is not available without an app data source".to_string(),
        ))
    }

    async fn call_mcp_tool(
        &self,
        _params: McpToolCallParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpTool/call is not available without an app data source".to_string(),
        ))
    }

    async fn call_mcp_tool_with_caller(
        &self,
        _params: McpToolCallWithCallerParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpTool/callWithCaller is not available without an app data source".to_string(),
        ))
    }

    async fn list_mcp_prompts(&self) -> Result<McpPromptListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpPrompt/list is not available without an app data source".to_string(),
        ))
    }

    async fn get_mcp_prompt(
        &self,
        _params: McpPromptGetParams,
    ) -> Result<McpPromptGetResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpPrompt/get is not available without an app data source".to_string(),
        ))
    }

    async fn list_mcp_resources(&self) -> Result<McpResourceListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpResource/list is not available without an app data source".to_string(),
        ))
    }

    async fn read_mcp_resource(
        &self,
        _params: McpResourceReadParams,
    ) -> Result<McpResourceReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpResource/read is not available without an app data source".to_string(),
        ))
    }

    async fn read_automation_scheduler_config(
        &self,
    ) -> Result<AutomationSchedulerConfigReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationScheduler/config/read is not available without an app data source"
                .to_string(),
        ))
    }

    async fn update_automation_scheduler_config(
        &self,
        _params: AutomationSchedulerConfigUpdateParams,
    ) -> Result<AutomationSchedulerConfigUpdateResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationScheduler/config/update is not available without an app data source"
                .to_string(),
        ))
    }

    async fn read_automation_scheduler_status(
        &self,
    ) -> Result<AutomationSchedulerStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationScheduler/status is not available without an app data source".to_string(),
        ))
    }

    async fn read_automation_job(
        &self,
        _params: AutomationJobIdParams,
    ) -> Result<AutomationJobReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/read is not available without an app data source".to_string(),
        ))
    }

    async fn create_automation_job(
        &self,
        _params: AutomationJobCreateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/create is not available without an app data source".to_string(),
        ))
    }

    async fn update_automation_job(
        &self,
        _params: AutomationJobUpdateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/update is not available without an app data source".to_string(),
        ))
    }

    async fn delete_automation_job(
        &self,
        _params: AutomationJobIdParams,
    ) -> Result<AutomationJobDeleteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/delete is not available without an app data source".to_string(),
        ))
    }

    async fn run_automation_job_now(
        &self,
        _params: AutomationJobIdParams,
    ) -> Result<AutomationJobRunNowResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/runNow requires the App Server automation executor".to_string(),
        ))
    }

    async fn read_automation_health(
        &self,
        _params: AutomationJobHealthParams,
    ) -> Result<AutomationJobHealthResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/health is not available without an app data source".to_string(),
        ))
    }

    async fn read_automation_run_history(
        &self,
        _params: AutomationJobRunHistoryParams,
    ) -> Result<AutomationJobRunHistoryResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/runHistory is not available without an app data source".to_string(),
        ))
    }

    async fn preview_automation_schedule(
        &self,
        _params: AutomationScheduleParams,
    ) -> Result<AutomationSchedulePreviewResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationSchedule/preview is not available without an app data source".to_string(),
        ))
    }

    async fn validate_automation_schedule(
        &self,
        _params: AutomationScheduleParams,
    ) -> Result<AutomationScheduleValidateResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationSchedule/validate is not available without an app data source".to_string(),
        ))
    }

    async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError>;

    async fn list_unified_memories(
        &self,
        _params: UnifiedMemoryListParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/list is not available without an app data source".to_string(),
        ))
    }

    async fn get_unified_memory(
        &self,
        _params: UnifiedMemoryGetParams,
    ) -> Result<UnifiedMemoryGetResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/get is not available without an app data source".to_string(),
        ))
    }

    async fn create_unified_memory(
        &self,
        _params: UnifiedMemoryCreateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/create is not available without an app data source".to_string(),
        ))
    }

    async fn update_unified_memory(
        &self,
        _params: UnifiedMemoryUpdateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/update is not available without an app data source".to_string(),
        ))
    }

    async fn delete_unified_memory(
        &self,
        _params: UnifiedMemoryDeleteParams,
    ) -> Result<UnifiedMemoryDeleteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/delete is not available without an app data source".to_string(),
        ))
    }

    async fn search_unified_memories(
        &self,
        _params: UnifiedMemorySearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/search is not available without an app data source".to_string(),
        ))
    }

    async fn read_unified_memory_stats(
        &self,
    ) -> Result<UnifiedMemoryStatsResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/stats is not available without an app data source".to_string(),
        ))
    }

    async fn analyze_unified_memories(
        &self,
        _params: UnifiedMemoryAnalyzeParams,
    ) -> Result<UnifiedMemoryAnalysisResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/analyze requires RuntimeCore memory extraction current implementation"
                .to_string(),
        ))
    }

    async fn semantic_search_unified_memories(
        &self,
        _params: UnifiedMemorySemanticSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/semanticSearch requires current embedding provider integration"
                .to_string(),
        ))
    }

    async fn hybrid_search_unified_memories(
        &self,
        _params: UnifiedMemoryHybridSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/hybridSearch requires current embedding provider integration"
                .to_string(),
        ))
    }

    async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "log/list is not available without an app data source".to_string(),
        ))
    }

    async fn read_persisted_log_tail(
        &self,
        _params: LogPersistedTailParams,
    ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "log/persistedTail is not available without an app data source".to_string(),
        ))
    }

    async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "log/clear is not available without an app data source".to_string(),
        ))
    }

    async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "log/diagnosticHistory/clear is not available without an app data source".to_string(),
        ))
    }

    async fn read_log_storage_diagnostics(
        &self,
    ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "diagnostics/logStorage/read is not available without an app data source".to_string(),
        ))
    }

    async fn export_support_bundle(&self) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "diagnostics/supportBundle/export is not available without an app data source"
                .to_string(),
        ))
    }

    async fn read_windows_startup_diagnostics(
        &self,
    ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "diagnostics/windowsStartup/read is not available without an app data source"
                .to_string(),
        ))
    }

    async fn read_usage_stats(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError>;

    async fn list_usage_stats_model_ranking(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError>;

    async fn list_usage_stats_daily_trends(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError>;

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

    async fn read_model_provider(
        &self,
        _params: ModelProviderReadParams,
    ) -> Result<ModelProviderReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/read is not available without an app data source".to_string(),
        ))
    }

    async fn create_model_provider(
        &self,
        _params: ModelProviderCreateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/create is not available without an app data source".to_string(),
        ))
    }

    async fn update_model_provider(
        &self,
        _params: ModelProviderUpdateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/update is not available without an app data source".to_string(),
        ))
    }

    async fn delete_model_provider(
        &self,
        _params: ModelProviderDeleteParams,
    ) -> Result<ModelProviderDeleteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/delete is not available without an app data source".to_string(),
        ))
    }

    async fn update_model_provider_sort_orders(
        &self,
        _params: ModelProviderSortOrdersUpdateParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/sortOrders/update is not available without an app data source"
                .to_string(),
        ))
    }

    async fn export_model_provider_config(
        &self,
        _params: ModelProviderConfigExportParams,
    ) -> Result<ModelProviderConfigExportResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderConfig/export is not available without an app data source".to_string(),
        ))
    }

    async fn import_model_provider_config(
        &self,
        _params: ModelProviderConfigImportParams,
    ) -> Result<ModelProviderConfigImportResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderConfig/import is not available without an app data source".to_string(),
        ))
    }

    async fn test_model_provider_connection(
        &self,
        _params: ModelProviderTestConnectionParams,
    ) -> Result<ModelProviderTestConnectionResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/testConnection is not available without an app data source".to_string(),
        ))
    }

    async fn test_model_provider_chat(
        &self,
        _params: ModelProviderTestChatParams,
    ) -> Result<ModelProviderTestChatResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/testChat is not available without an app data source".to_string(),
        ))
    }

    async fn fetch_model_provider_models(
        &self,
        _params: ModelProviderFetchModelsParams,
    ) -> Result<ModelProviderFetchModelsResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProvider/fetchModels is not available without an app data source".to_string(),
        ))
    }

    async fn create_model_provider_key(
        &self,
        _params: ModelProviderKeyCreateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderKey/create is not available without an app data source".to_string(),
        ))
    }

    async fn update_model_provider_key(
        &self,
        _params: ModelProviderKeyUpdateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderKey/update is not available without an app data source".to_string(),
        ))
    }

    async fn delete_model_provider_key(
        &self,
        _params: ModelProviderKeyDeleteParams,
    ) -> Result<ModelProviderKeyDeleteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderKey/delete is not available without an app data source".to_string(),
        ))
    }

    async fn read_next_model_provider_key(
        &self,
        _params: ModelProviderKeyNextParams,
    ) -> Result<ModelProviderKeyNextResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderKey/next is not available without an app data source".to_string(),
        ))
    }

    async fn record_model_provider_key_usage(
        &self,
        _params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderKey/usage/record is not available without an app data source".to_string(),
        ))
    }

    async fn record_model_provider_key_error(
        &self,
        _params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderKey/error/record is not available without an app data source".to_string(),
        ))
    }

    async fn read_model_provider_ui_state(
        &self,
        _params: ModelProviderUiStateReadParams,
    ) -> Result<ModelProviderUiStateReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderUiState/read is not available without an app data source".to_string(),
        ))
    }

    async fn write_model_provider_ui_state(
        &self,
        _params: ModelProviderUiStateWriteParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "modelProviderUiState/write is not available without an app data source".to_string(),
        ))
    }

    async fn read_model_provider_alias(
        &self,
        params: ModelProviderAliasReadParams,
    ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError>;

    async fn list_model_provider_aliases(
        &self,
    ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError>;

    async fn resolve_connect_deep_link(
        &self,
        _params: ConnectDeepLinkResolveParams,
    ) -> Result<ConnectDeepLinkResolveResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "connectDeepLink/resolve is not available without an app data source".to_string(),
        ))
    }

    async fn resolve_connect_open_deep_link(
        &self,
        _params: ConnectOpenDeepLinkResolveParams,
    ) -> Result<ConnectOpenDeepLinkResolveResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "connectOpenDeepLink/resolve is not available without an app data source".to_string(),
        ))
    }

    async fn save_connect_relay_api_key(
        &self,
        _params: ConnectRelayApiKeySaveParams,
    ) -> Result<ConnectRelayApiKeySaveResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "connectRelayApiKey/save is not available without an app data source".to_string(),
        ))
    }

    async fn deliver_connect_callback(
        &self,
        _params: ConnectCallbackSendParams,
    ) -> Result<ConnectCallbackSendResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "connectCallback/send is not available without an app data source".to_string(),
        ))
    }
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
pub struct BasicEvidenceExportProvider;

#[async_trait]
impl EvidenceExportProvider for BasicEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        Ok(Some(basic_evidence_pack_summary(request)))
    }
}

fn basic_evidence_pack_summary(request: &EvidencePackRequest) -> EvidencePackSummary {
    let latest_turn_status = request
        .turns
        .last()
        .map(|turn| agent_turn_status_label(turn.status).to_string());
    let pending_request_count = request
        .events
        .iter()
        .filter(|event| event.event_type == "action.required")
        .count();
    let queued_turn_count = request
        .turns
        .iter()
        .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
        .count();
    let running_turn_count = request
        .turns
        .iter()
        .filter(|turn| agent_turn_is_active(turn.status))
        .count();
    let completion_decision = if pending_request_count > 0 {
        "needs_input"
    } else if running_turn_count > 0 || queued_turn_count > 0 {
        "in_progress"
    } else if matches!(
        request.session.status,
        AgentSessionStatus::Failed | AgentSessionStatus::Canceled
    ) {
        "failed"
    } else {
        "verifying"
    };
    let known_gaps = if request.artifacts.is_empty() {
        vec!["no_recent_artifacts".to_string()]
    } else {
        Vec::new()
    };

    EvidencePackSummary {
        pack_relative_root: format!(
            ".lime/harness/sessions/{}/evidence",
            request.session.session_id
        ),
        pack_absolute_root: None,
        exported_at: timestamp(),
        thread_status: agent_session_status_label(request.session.status).to_string(),
        latest_turn_status,
        turn_count: request.turns.len(),
        item_count: request.events.len(),
        pending_request_count,
        queued_turn_count,
        recent_artifact_count: request.artifacts.len(),
        known_gaps,
        observability_summary: Some(json!({
            "schema_version": "runtime-evidence-pack.v1",
            "source": "app-server-basic",
            "event_count": request.events.len(),
            "artifact_count": request.artifacts.len(),
        })),
        completion_audit_summary: Some(json!({
            "decision": completion_decision,
            "pendingRequestCount": pending_request_count,
            "queuedTurnCount": queued_turn_count,
            "runningTurnCount": running_turn_count,
            "artifactCount": request.artifacts.len(),
            "turnCount": request.turns.len(),
            "notes": [
                "App Server current evidence/export generated a basic audit summary without Desktop legacy evidence writer."
            ],
        })),
        artifacts: request
            .artifacts
            .iter()
            .map(|artifact| EvidencePackArtifact {
                kind: "artifact".to_string(),
                title: artifact
                    .title
                    .clone()
                    .unwrap_or_else(|| artifact.artifact_ref.clone()),
                relative_path: artifact
                    .path
                    .clone()
                    .unwrap_or_else(|| artifact.artifact_ref.clone()),
                absolute_path: None,
                bytes: 0,
            })
            .collect(),
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

    async fn update_current_timeline_session(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::SessionNotFound(params.session_id))
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

    async fn list_management_skills(
        &self,
        _params: SkillManagementListParams,
    ) -> Result<SkillListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillManagement/list is not available without an app data source".to_string(),
        ))
    }

    async fn install_management_skill(
        &self,
        _params: SkillManagementInstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillManagement/install is not available without an app data source".to_string(),
        ))
    }

    async fn uninstall_management_skill(
        &self,
        _params: SkillManagementUninstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillManagement/uninstall is not available without an app data source".to_string(),
        ))
    }

    async fn list_skill_repositories(
        &self,
    ) -> Result<SkillRepositoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRepository/list is not available without an app data source".to_string(),
        ))
    }

    async fn save_skill_repository(
        &self,
        _params: SkillRepositorySaveParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRepository/save is not available without an app data source".to_string(),
        ))
    }

    async fn delete_skill_repository(
        &self,
        _params: SkillRepositoryDeleteParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRepository/delete is not available without an app data source".to_string(),
        ))
    }

    async fn refresh_skill_cache(&self) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillCache/refresh is not available without an app data source".to_string(),
        ))
    }

    async fn list_installed_skill_directories(
        &self,
    ) -> Result<SkillInstalledDirectoriesListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillInstalledDirectories/list is not available without an app data source"
                .to_string(),
        ))
    }

    async fn inspect_local_skill(
        &self,
        _params: SkillLocalInspectParams,
    ) -> Result<SkillLocalInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn inspect_local_skill_detail(
        &self,
        _params: SkillLocalDetailInspectParams,
    ) -> Result<SkillLocalDetailInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/detail/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn create_skill_scaffold(
        &self,
        _params: SkillScaffoldCreateParams,
    ) -> Result<SkillScaffoldCreateResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/scaffold/create is not available without an app data source".to_string(),
        ))
    }

    async fn import_local_skill(
        &self,
        _params: SkillLocalImportParams,
    ) -> Result<SkillLocalImportResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/import is not available without an app data source".to_string(),
        ))
    }

    async fn rename_local_skill(
        &self,
        _params: SkillLocalRenameParams,
    ) -> Result<SkillLocalRenameResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillLocal/rename is not available without an app data source".to_string(),
        ))
    }

    async fn inspect_remote_skill(
        &self,
        _params: SkillRemoteInspectParams,
    ) -> Result<SkillRemoteInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillRemote/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn inspect_local_skill_package(
        &self,
        _params: SkillPackageLocalInspectParams,
    ) -> Result<SkillPackageLocalInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/local/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn install_local_skill_package(
        &self,
        _params: SkillPackageLocalInstallParams,
    ) -> Result<SkillPackageLocalInstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/local/install is not available without an app data source".to_string(),
        ))
    }

    async fn replace_local_skill_package(
        &self,
        _params: SkillPackageLocalReplaceParams,
    ) -> Result<SkillPackageLocalReplaceResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/local/replace is not available without an app data source".to_string(),
        ))
    }

    async fn export_local_skill_package(
        &self,
        _params: SkillPackageExportParams,
    ) -> Result<SkillPackageExportResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/export is not available without an app data source".to_string(),
        ))
    }

    async fn install_marketplace_skill(
        &self,
        _params: SkillMarketplaceInstallParams,
    ) -> Result<SkillMarketplaceInstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillMarketplace/install is not available without an app data source".to_string(),
        ))
    }

    async fn install_skill_from_download_url(
        &self,
        _params: SkillDownloadInstallParams,
    ) -> Result<SkillDownloadInstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "skillPackage/download/install is not available without an app data source".to_string(),
        ))
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

    async fn list_workspace_registered_skills(
        &self,
        _params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
        Ok(WorkspaceRegisteredSkillsListResponse::default())
    }

    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        Ok(AgentAppInstalledListResponse::default())
    }

    async fn inspect_agent_app_local_package(
        &self,
        _params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppLocalPackage/inspect is not available without an app data source".to_string(),
        ))
    }

    async fn fetch_agent_app_cloud_package(
        &self,
        _params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppPackage/fetchCloud is not available without an app data source".to_string(),
        ))
    }

    async fn save_agent_app_installed(
        &self,
        _params: AgentAppInstalledSaveParams,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/save is not available without an app data source".to_string(),
        ))
    }

    async fn set_agent_app_installed_disabled(
        &self,
        _params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/disabled/set is not available without an app data source"
                .to_string(),
        ))
    }

    async fn preview_agent_app_uninstall(
        &self,
        _params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/uninstall/rehearsal is not available without an app data source"
                .to_string(),
        ))
    }

    async fn uninstall_agent_app(
        &self,
        _params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "agentAppInstalled/uninstall is not available without an app data source".to_string(),
        ))
    }

    async fn list_knowledge_packs(
        &self,
        _params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        Ok(KnowledgeListPacksResponse::default())
    }

    async fn read_knowledge_pack(
        &self,
        _params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "knowledgePack/read is not available without an app data source".to_string(),
        ))
    }

    async fn import_knowledge_source(
        &self,
        _params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "knowledgePack/source/import is not available without an app data source".to_string(),
        ))
    }

    async fn compile_knowledge_pack(
        &self,
        _request: lime_knowledge::KnowledgeCompilePackRequest,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "knowledgePack/compile is not available without an app data source".to_string(),
        ))
    }

    async fn set_default_knowledge_pack(
        &self,
        _params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "knowledgePack/default/set is not available without an app data source".to_string(),
        ))
    }

    async fn update_knowledge_pack_status(
        &self,
        _params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "knowledgePack/status/update is not available without an app data source".to_string(),
        ))
    }

    async fn resolve_knowledge_context(
        &self,
        _params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "knowledgeContext/resolve is not available without an app data source".to_string(),
        ))
    }

    async fn validate_knowledge_context_run(
        &self,
        _params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "knowledgeContextRun/validate is not available without an app data source".to_string(),
        ))
    }

    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        Ok(AutomationJobListResponse::default())
    }

    async fn list_mcp_servers(&self) -> Result<McpServerListResponse, RuntimeCoreError> {
        Ok(McpServerListResponse::default())
    }

    async fn list_mcp_servers_with_status(
        &self,
    ) -> Result<McpServerStatusListResponse, RuntimeCoreError> {
        Ok(McpServerStatusListResponse::default())
    }

    async fn create_mcp_server(
        &self,
        _params: McpServerCreateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/create requires a current app data source".to_string(),
        ))
    }

    async fn update_mcp_server(
        &self,
        _params: McpServerUpdateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/update requires a current app data source".to_string(),
        ))
    }

    async fn delete_mcp_server(
        &self,
        _params: McpServerDeleteParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/delete requires a current app data source".to_string(),
        ))
    }

    async fn set_mcp_server_enabled(
        &self,
        _params: McpServerEnabledSetParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/enabled/set requires a current app data source".to_string(),
        ))
    }

    async fn import_mcp_servers_from_app(
        &self,
        _params: McpServerImportFromAppParams,
    ) -> Result<McpServerImportFromAppResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/importFromApp requires a current app data source".to_string(),
        ))
    }

    async fn sync_all_mcp_servers_to_live(
        &self,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/syncAllToLive requires a current app data source".to_string(),
        ))
    }

    async fn start_mcp_server(
        &self,
        _params: McpServerStartParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/start requires a current app data source".to_string(),
        ))
    }

    async fn stop_mcp_server(
        &self,
        _params: McpServerStopParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpServer/stop requires a current app data source".to_string(),
        ))
    }

    async fn list_mcp_tools(&self) -> Result<McpToolListResponse, RuntimeCoreError> {
        Ok(McpToolListResponse::default())
    }

    async fn list_mcp_tools_for_context(
        &self,
        _params: McpToolListForContextParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        Ok(McpToolListResponse::default())
    }

    async fn search_mcp_tools(
        &self,
        _params: McpToolSearchParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        Ok(McpToolListResponse::default())
    }

    async fn call_mcp_tool(
        &self,
        _params: McpToolCallParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpTool/call requires a current MCP manager".to_string(),
        ))
    }

    async fn call_mcp_tool_with_caller(
        &self,
        _params: McpToolCallWithCallerParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpTool/callWithCaller requires a current MCP manager".to_string(),
        ))
    }

    async fn list_mcp_prompts(&self) -> Result<McpPromptListResponse, RuntimeCoreError> {
        Ok(McpPromptListResponse::default())
    }

    async fn get_mcp_prompt(
        &self,
        _params: McpPromptGetParams,
    ) -> Result<McpPromptGetResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpPrompt/get requires a current MCP manager".to_string(),
        ))
    }

    async fn list_mcp_resources(&self) -> Result<McpResourceListResponse, RuntimeCoreError> {
        Ok(McpResourceListResponse::default())
    }

    async fn read_mcp_resource(
        &self,
        _params: McpResourceReadParams,
    ) -> Result<McpResourceReadResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "mcpResource/read requires a current MCP manager".to_string(),
        ))
    }

    async fn read_project_memory(
        &self,
        _params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        Ok(ProjectMemoryReadResponse::default())
    }

    async fn read_usage_stats(
        &self,
        _params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
        Ok(UsageStatsReadResponse::default())
    }

    async fn list_usage_stats_model_ranking(
        &self,
        _params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
        Ok(UsageStatsModelRankingListResponse::default())
    }

    async fn list_usage_stats_daily_trends(
        &self,
        _params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
        Ok(UsageStatsDailyTrendsListResponse::default())
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
    knowledge_builder_runtime_executor: Arc<dyn KnowledgeBuilderRuntimeExecutor>,
    app_data_source: Arc<dyn AppDataSource>,
}

#[derive(Clone)]
pub struct RuntimeCoreEventAppender {
    state: Arc<Mutex<RuntimeCoreState>>,
}

#[derive(Debug, Default)]
struct RuntimeCoreState {
    sessions: HashMap<String, StoredSession>,
    agent_app_ui_runtimes: HashMap<String, AgentAppUiRuntimeProcess>,
}

#[derive(Debug, Clone)]
struct StoredSession {
    session: AgentSession,
    turns: Vec<AgentTurn>,
    turn_inputs: HashMap<String, AgentInput>,
    turn_runtime_options: HashMap<String, app_server_protocol::RuntimeOptions>,
    events: Vec<AgentEvent>,
}

#[derive(Debug)]
struct AgentAppUiRuntimeProcess {
    child: Child,
    app_dir: PathBuf,
    port: u16,
    base_url: String,
    entry_key: String,
    route: String,
    started_at: String,
}

#[derive(Debug, Clone)]
struct AgentAppUiRuntimeEntry {
    entry_key: String,
    route: String,
}

#[derive(Debug, Clone)]
struct AgentAppShellDescriptorFields {
    descriptor_version: u64,
    app_id: String,
    install_mode: String,
    shell_kind: String,
    package_hash: String,
    manifest_hash: String,
    entry_key: String,
    window_title: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
struct RuntimeContinuationPreferences {
    provider_preference: Option<String>,
    model_preference: Option<String>,
    provider_config: Option<serde_json::Value>,
    approval_policy: Option<String>,
    sandbox_policy: Option<String>,
    execution_strategy: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct HandoffMetrics {
    latest_turn_status: Option<String>,
    pending_request_count: usize,
    queued_turn_count: usize,
    active_subagent_count: usize,
    todo_total: usize,
    todo_pending: usize,
    todo_in_progress: usize,
    todo_completed: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HandoffRecentArtifact {
    title: String,
    kind: String,
    path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct HandoffCopy {
    plan_title: &'static str,
    progress_title: &'static str,
    handoff_title: &'static str,
    review_summary_title: &'static str,
    session_label: &'static str,
    thread_label: &'static str,
    status_label: &'static str,
    exported_at_label: &'static str,
    todo_summary_title: &'static str,
    recent_artifacts_title: &'static str,
    no_recent_artifacts: &'static str,
    next_step_title: &'static str,
    next_step_body: &'static str,
    review_note: &'static str,
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
        messages_count: runtime_session_messages(stored).len(),
    }
}

fn file_system_directory_listing_from_service(
    listing: lime_services::file_browser_service::DirectoryListing,
) -> FileSystemDirectoryListing {
    FileSystemDirectoryListing {
        path: listing.path,
        parent_path: listing.parent_path,
        entries: listing
            .entries
            .into_iter()
            .map(file_system_file_entry_from_service)
            .collect(),
        error: listing.error,
    }
}

fn file_system_file_entry_from_service(
    entry: lime_services::file_browser_service::FileEntry,
) -> FileSystemFileEntry {
    FileSystemFileEntry {
        name: entry.name,
        path: entry.path,
        is_dir: entry.is_dir,
        size: entry.size,
        modified_at: entry.modified_at,
        file_type: entry.file_type,
        is_hidden: entry.is_hidden,
        mode_str: entry.mode_str,
        mode: entry.mode,
        mime_type: entry.mime_type,
        is_symlink: entry.is_symlink,
        icon_data_url: entry.icon_data_url,
    }
}

fn file_system_file_preview_from_service(
    preview: lime_services::file_browser_service::FilePreview,
) -> FileSystemFilePreview {
    FileSystemFilePreview {
        path: preview.path,
        content: preview.content,
        is_binary: preview.is_binary,
        size: preview.size,
        error: preview.error,
    }
}

fn file_system_required_path(
    path: String,
    method: &'static str,
) -> Result<String, RuntimeCoreError> {
    let path = path.trim();
    if path.is_empty() {
        return Err(RuntimeCoreError::Backend(format!(
            "path is required for {method}"
        )));
    }
    Ok(path.to_string())
}

fn stored_session_hidden_from_user_recents(stored: &StoredSession) -> bool {
    stored
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .is_some_and(metadata_hidden_from_user_recents)
}

fn update_session_business_object_title(session: &mut AgentSession, title: &str) {
    let title = title.trim();
    if title.is_empty() {
        return;
    }
    match session.business_object_ref.as_mut() {
        Some(reference) => {
            reference.title = Some(title.to_string());
            match reference.metadata.take() {
                Some(serde_json::Value::Object(mut metadata)) => {
                    metadata.insert(
                        "title".to_string(),
                        serde_json::Value::String(title.to_string()),
                    );
                    reference.metadata = Some(serde_json::Value::Object(metadata));
                }
                Some(metadata) => {
                    reference.metadata = Some(json!({
                        "title": title,
                        "previousMetadata": metadata,
                    }));
                }
                None => {
                    reference.metadata = Some(json!({ "title": title }));
                }
            }
        }
        None => {
            session.business_object_ref = Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: session.session_id.clone(),
                title: Some(title.to_string()),
                uri: None,
                metadata: Some(json!({ "title": title })),
            });
        }
    }
}

fn update_session_business_object_metadata(
    session: &mut AgentSession,
    params: &AgentSessionUpdateParams,
) {
    let mut updates = serde_json::Map::new();
    insert_trimmed_metadata_string(
        &mut updates,
        "providerSelector",
        params.provider_selector.as_deref(),
    );
    insert_trimmed_metadata_string(
        &mut updates,
        "providerName",
        params.provider_name.as_deref(),
    );
    insert_trimmed_metadata_string(&mut updates, "modelName", params.model_name.as_deref());
    insert_trimmed_metadata_string(
        &mut updates,
        "executionStrategy",
        params.execution_strategy.as_deref(),
    );
    insert_trimmed_metadata_string(
        &mut updates,
        "recentAccessMode",
        params.recent_access_mode.as_deref(),
    );
    if let Some(value) = params.recent_preferences.as_ref() {
        updates.insert("recentPreferences".to_string(), value.clone());
    }
    if let Some(value) = params.recent_team_selection.as_ref() {
        updates.insert("recentTeamSelection".to_string(), value.clone());
    }
    if updates.is_empty() {
        return;
    }

    let session_id = session.session_id.clone();
    let reference =
        session
            .business_object_ref
            .get_or_insert_with(|| app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: session_id,
                title: None,
                uri: None,
                metadata: None,
            });
    match reference.metadata.take() {
        Some(serde_json::Value::Object(mut metadata)) => {
            metadata.extend(updates);
            reference.metadata = Some(serde_json::Value::Object(metadata));
        }
        Some(metadata) => {
            updates.insert("previousMetadata".to_string(), metadata);
            reference.metadata = Some(serde_json::Value::Object(updates));
        }
        None => {
            reference.metadata = Some(serde_json::Value::Object(updates));
        }
    }
}

fn insert_trimmed_metadata_string(
    metadata: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: Option<&str>,
) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    metadata.insert(
        key.to_string(),
        serde_json::Value::String(value.to_string()),
    );
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

fn normalized_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn runtime_provider_config_from_host_options(
    host_options: &serde_json::Value,
) -> Option<serde_json::Value> {
    let aster_request = host_options.get("asterChatRequest")?;
    aster_request
        .pointer("/turn_config/provider_config")
        .or_else(|| aster_request.pointer("/turn_config/providerConfig"))
        .or_else(|| aster_request.pointer("/turnConfig/provider_config"))
        .or_else(|| aster_request.pointer("/turnConfig/providerConfig"))
        .or_else(|| aster_request.get("provider_config"))
        .or_else(|| aster_request.get("providerConfig"))
        .filter(|value| value.is_object())
        .cloned()
}

impl RuntimeContinuationPreferences {
    fn has_any_context(&self) -> bool {
        self.provider_preference.is_some()
            || self.model_preference.is_some()
            || self.provider_config.is_some()
            || self.approval_policy.is_some()
            || self.sandbox_policy.is_some()
            || self.execution_strategy.is_some()
    }

    fn with_fallback(mut self, fallback: RuntimeContinuationPreferences) -> Self {
        if self.provider_preference.is_none() {
            self.provider_preference = fallback.provider_preference;
        }
        if self.model_preference.is_none() {
            self.model_preference = fallback.model_preference;
        }
        if self.provider_config.is_none() {
            self.provider_config = fallback.provider_config;
        }
        if self.approval_policy.is_none() {
            self.approval_policy = fallback.approval_policy;
        }
        if self.sandbox_policy.is_none() {
            self.sandbox_policy = fallback.sandbox_policy;
        }
        if self.execution_strategy.is_none() {
            self.execution_strategy = fallback.execution_strategy;
        }
        self
    }

    fn provider_preference_for_runtime_options(&self) -> Option<String> {
        if self.provider_config.is_some() {
            None
        } else {
            self.provider_preference.clone()
        }
    }

    fn model_preference_for_runtime_options(&self) -> Option<String> {
        if self.provider_config.is_some() {
            None
        } else {
            self.model_preference.clone()
        }
    }
}

fn build_runtime_evidence_pack_summary(
    session: &AgentSession,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
    known_gap: &str,
) -> EvidencePackSummary {
    EvidencePackSummary {
        pack_relative_root: format!(".lime/harness/sessions/{}/evidence", session.session_id),
        pack_absolute_root: None,
        exported_at: timestamp(),
        thread_status: agent_session_status_label(session.status).to_string(),
        latest_turn_status: turns
            .last()
            .map(|turn| agent_turn_status_label(turn.status).to_string()),
        turn_count: turns.len(),
        item_count: events.len(),
        pending_request_count: pending_request_count_from_events(events),
        queued_turn_count: turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .count(),
        recent_artifact_count: artifacts.len(),
        known_gaps: vec![known_gap.to_string()],
        observability_summary: Some(json!({
            "schemaVersion": "runtime-evidence-pack.v1",
            "source": "app-server-current",
            "sessionId": session.session_id,
            "threadId": session.thread_id,
        })),
        completion_audit_summary: None,
        artifacts: artifacts
            .iter()
            .map(evidence_pack_artifact_from_summary)
            .collect(),
    }
}

fn evidence_pack_artifact_from_summary(artifact: &ArtifactSummary) -> EvidencePackArtifact {
    let title = artifact
        .title
        .clone()
        .or_else(|| artifact.artifact_id.clone())
        .unwrap_or_else(|| artifact.artifact_ref.clone());
    let relative_path = artifact
        .path
        .clone()
        .unwrap_or_else(|| format!("{}/artifact.json", artifact.artifact_ref));
    EvidencePackArtifact {
        kind: artifact
            .kind
            .clone()
            .unwrap_or_else(|| "artifact".to_string()),
        title,
        relative_path,
        absolute_path: None,
        bytes: artifact
            .content
            .as_ref()
            .map(String::len)
            .unwrap_or_default(),
    }
}

fn pending_request_count_from_events(events: &[AgentEvent]) -> usize {
    let mut pending = HashSet::new();
    let mut resolved = HashSet::new();
    for event in events {
        match event.event_type.as_str() {
            "action.required" => {
                if let Some(request_id) = event_request_id(&event.payload) {
                    pending.insert(request_id);
                }
            }
            "action.resolved" | "action.cancelled" | "action.canceled" => {
                if let Some(request_id) = event_request_id(&event.payload) {
                    resolved.insert(request_id);
                }
            }
            _ => {}
        }
    }
    pending.difference(&resolved).count()
}

fn current_objective_completion_audit_summary(
    objective: &ManagedObjective,
) -> Option<serde_json::Value> {
    let decision = managed_objective_completion_audit_decision(objective)?;
    let mut summary = serde_json::Map::new();
    summary.insert("decision".to_string(), json!(decision));
    summary.insert(
        "status".to_string(),
        json!(managed_objective_status_value(objective.status)),
    );
    if let Some(blocker_reason) = objective.blocker_reason.as_deref() {
        summary.insert("blockingReasons".to_string(), json!([blocker_reason]));
    }
    if let Some(last_audit_summary) = objective.last_audit_summary.as_deref() {
        summary.insert("summary".to_string(), json!(last_audit_summary));
        summary.insert("notes".to_string(), json!([last_audit_summary]));
    }
    summary.insert(
        "artifactCount".to_string(),
        json!(objective.last_artifact_refs.len()),
    );
    if !objective.last_artifact_refs.is_empty() {
        summary.insert(
            "artifactRefs".to_string(),
            json!(objective.last_artifact_refs),
        );
    }
    if let Some(evidence_ref) = objective.last_evidence_pack_ref.as_deref() {
        summary.insert("evidencePackRef".to_string(), json!(evidence_ref));
    }
    Some(serde_json::Value::Object(summary))
}

fn managed_objective_completion_audit_decision(
    objective: &ManagedObjective,
) -> Option<&'static str> {
    match objective.status {
        ManagedObjectiveStatus::BudgetLimited => Some("budget_limited"),
        ManagedObjectiveStatus::NeedsInput => Some("needs_input"),
        ManagedObjectiveStatus::Blocked => Some("blocked"),
        ManagedObjectiveStatus::Failed => Some("failed"),
        ManagedObjectiveStatus::Paused => Some("paused"),
        ManagedObjectiveStatus::Completed => objective
            .last_audit_summary
            .as_deref()
            .is_some_and(|summary| summary.contains("decision=completed"))
            .then_some("completed"),
        ManagedObjectiveStatus::Verifying => Some("verifying"),
        ManagedObjectiveStatus::Active => objective
            .last_audit_summary
            .as_deref()
            .and_then(completion_audit_decision_from_summary),
    }
}

fn completion_audit_decision_from_summary(summary: &str) -> Option<&'static str> {
    if summary.contains("decision=budget_limited") {
        Some("budget_limited")
    } else if summary.contains("decision=needs_input") {
        Some("needs_input")
    } else if summary.contains("decision=blocked") {
        Some("blocked")
    } else if summary.contains("decision=failed") {
        Some("failed")
    } else if summary.contains("decision=paused") {
        Some("paused")
    } else if summary.contains("decision=verifying") {
        Some("verifying")
    } else {
        None
    }
}

fn managed_objective_status_value(status: ManagedObjectiveStatus) -> &'static str {
    match status {
        ManagedObjectiveStatus::Active => "active",
        ManagedObjectiveStatus::Verifying => "verifying",
        ManagedObjectiveStatus::NeedsInput => "needs_input",
        ManagedObjectiveStatus::Blocked => "blocked",
        ManagedObjectiveStatus::BudgetLimited => "budget_limited",
        ManagedObjectiveStatus::Paused => "paused",
        ManagedObjectiveStatus::Completed => "completed",
        ManagedObjectiveStatus::Failed => "failed",
    }
}

fn continuation_runtime_preferences_from_read(
    read: &AgentSessionReadResponse,
) -> RuntimeContinuationPreferences {
    let execution_runtime = read
        .detail
        .as_ref()
        .and_then(|detail| detail.get("execution_runtime"))
        .filter(|value| value.is_object());
    RuntimeContinuationPreferences {
        provider_preference: string_field_from_optional_value(
            execution_runtime,
            &[
                "provider_selector",
                "providerSelector",
                "provider_name",
                "providerName",
            ],
        ),
        model_preference: string_field_from_optional_value(
            execution_runtime,
            &["model_name", "modelName"],
        ),
        provider_config: None,
        approval_policy: None,
        sandbox_policy: None,
        execution_strategy: string_field_from_optional_value(
            read.session
                .business_object_ref
                .as_ref()
                .and_then(|reference| reference.metadata.as_ref()),
            &["executionStrategy", "execution_strategy"],
        ),
    }
}

fn runtime_string_from_host_options(
    host_options: &serde_json::Value,
    turn_config_keys: &[&str],
    flat_keys: &[&str],
) -> Option<String> {
    let aster_request = host_options.get("asterChatRequest")?;
    aster_request
        .get("turn_config")
        .or_else(|| aster_request.get("turnConfig"))
        .and_then(|turn_config| string_field_from_value(turn_config, turn_config_keys))
        .or_else(|| string_field_from_value(aster_request, flat_keys))
}

fn build_objective_continuation_host_options(
    message: &str,
    session_id: &str,
    event_name: &str,
    workspace_id: &str,
    turn_id: &str,
    queued_turn_id: &str,
    metadata: &serde_json::Value,
    runtime_preferences: &RuntimeContinuationPreferences,
) -> serde_json::Value {
    let turn_config = json!({
        "provider_config": runtime_preferences.provider_config.clone(),
        "provider_preference": runtime_preferences.provider_preference.clone(),
        "model_preference": runtime_preferences.model_preference.clone(),
        "reasoning_effort": null,
        "approval_policy": runtime_preferences.approval_policy.clone(),
        "sandbox_policy": runtime_preferences.sandbox_policy.clone(),
        "metadata": metadata.clone(),
        "execution_strategy": runtime_preferences.execution_strategy.clone(),
    });
    json!({
        "asterChatRequest": {
            "message": message,
            "session_id": session_id,
            "event_name": event_name,
            "images": null,
            "provider_config": runtime_preferences.provider_config.clone(),
            "provider_preference": runtime_preferences.provider_preference.clone(),
            "model_preference": runtime_preferences.model_preference.clone(),
            "reasoning_effort": null,
            "thinking_enabled": null,
            "approval_policy": runtime_preferences.approval_policy.clone(),
            "sandbox_policy": runtime_preferences.sandbox_policy.clone(),
            "project_id": null,
            "workspace_id": workspace_id,
            "web_search": null,
            "search_mode": null,
            "execution_strategy": runtime_preferences.execution_strategy.clone(),
            "auto_continue": null,
            "system_prompt": null,
            "metadata": metadata,
            "turn_id": turn_id,
            "queue_if_busy": false,
            "queued_turn_id": queued_turn_id,
            "turn_config": turn_config,
        }
    })
}

fn validate_handoff_session_id(session_id: &str) -> Result<(), RuntimeCoreError> {
    let mut components = Path::new(session_id).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(RuntimeCoreError::Backend(format!(
            "sessionId must be a single path segment for agentSession/handoffBundle/export: {session_id}"
        ))),
    }
}

fn validate_runtime_export_session_id(
    session_id: &str,
    method: &str,
) -> Result<(), RuntimeCoreError> {
    let mut components = Path::new(session_id).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(RuntimeCoreError::Backend(format!(
            "sessionId must be a single path segment for {method}: {session_id}"
        ))),
    }
}

fn required_runtime_export_session_id(
    session_id: &str,
    method: &str,
) -> Result<String, RuntimeCoreError> {
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        return Err(RuntimeCoreError::Backend(format!(
            "sessionId is required for {method}"
        )));
    }
    validate_runtime_export_session_id(&session_id, method)?;
    Ok(session_id)
}

fn resolve_handoff_workspace_root(
    read: &AgentSessionReadResponse,
) -> Result<PathBuf, RuntimeCoreError> {
    let mut candidates = Vec::new();
    if let Some(metadata) = read
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
    {
        for key in [
            "workspaceRoot",
            "workspace_root",
            "workingDir",
            "working_dir",
        ] {
            if let Some(value) = metadata_string(Some(metadata), key) {
                candidates.push(value);
            }
        }
    }
    if let Some(detail) = read.detail.as_ref() {
        for key in [
            "workspaceRoot",
            "workspace_root",
            "workingDir",
            "working_dir",
            "workspace_root_path",
        ] {
            if let Some(value) = string_field(detail, &[key]) {
                candidates.push(value);
            }
        }
    }

    let first_candidate = candidates.first().cloned();
    for candidate in candidates {
        let path = PathBuf::from(candidate.trim());
        if path.is_absolute() {
            return Ok(path);
        }
    }

    Err(RuntimeCoreError::Backend(match first_candidate {
        Some(candidate) => format!(
            "workspaceRoot must be absolute for agentSession/handoffBundle/export: {candidate}"
        ),
        None => "workspaceRoot is required for agentSession/handoffBundle/export".to_string(),
    }))
}

fn resolve_runtime_export_workspace_root(
    read: &AgentSessionReadResponse,
    method: &str,
) -> Result<PathBuf, RuntimeCoreError> {
    resolve_handoff_workspace_root(read).map_err(|error| {
        RuntimeCoreError::Backend(
            error
                .to_string()
                .replace("agentSession/handoffBundle/export", method),
        )
    })
}

fn canonical_runtime_export_workspace_root(
    read: &AgentSessionReadResponse,
    method: &str,
) -> Result<PathBuf, RuntimeCoreError> {
    let workspace_root = resolve_runtime_export_workspace_root(read, method)?;
    let workspace_root = workspace_root.canonicalize().map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "workspaceRoot must be an existing directory for {method}: {} ({error})",
            workspace_root.display()
        ))
    })?;
    if !workspace_root.is_dir() {
        return Err(RuntimeCoreError::Backend(format!(
            "workspaceRoot must be a directory for {method}: {}",
            workspace_root.display()
        )));
    }
    Ok(workspace_root)
}

fn handoff_metrics(read: &AgentSessionReadResponse) -> HandoffMetrics {
    let mut metrics = HandoffMetrics {
        latest_turn_status: read
            .turns
            .last()
            .map(|turn| agent_turn_status_label(turn.status).to_string()),
        queued_turn_count: read
            .turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .count(),
        ..HandoffMetrics::default()
    };

    let Some(detail) = read.detail.as_ref() else {
        return metrics;
    };
    let thread_read = detail.get("thread_read").filter(|value| value.is_object());
    if let Some(latest_turn_status) = thread_read
        .and_then(|value| value.get("diagnostics"))
        .and_then(|value| string_field(value, &["latest_turn_status", "latestTurnStatus"]))
    {
        metrics.latest_turn_status = Some(latest_turn_status);
    }
    if let Some(pending_requests) = thread_read
        .and_then(|value| value.get("pending_requests"))
        .or_else(|| detail.get("pending_requests"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.pending_request_count = pending_requests.len();
    }
    if let Some(queued_turns) = thread_read
        .and_then(|value| value.get("queued_turns"))
        .or_else(|| detail.get("queued_turns"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.queued_turn_count = queued_turns.len();
    }
    if let Some(subagents) = detail
        .get("child_subagent_sessions")
        .or_else(|| detail.get("subagents"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.active_subagent_count = subagents
            .iter()
            .filter(|item| {
                string_field(item, &["status", "runtime_status", "runtimeStatus"])
                    .map(|status| handoff_status_is_active(status.as_str()))
                    .unwrap_or(true)
            })
            .count();
    }
    if let Some(todo_items) = detail
        .get("todo_items")
        .or_else(|| detail.get("todoItems"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.todo_total = todo_items.len();
        for item in todo_items {
            match string_field(item, &["status"])
                .unwrap_or_else(|| "pending".to_string())
                .as_str()
            {
                "completed" | "complete" | "done" => metrics.todo_completed += 1,
                "in_progress" | "inProgress" | "running" | "active" => {
                    metrics.todo_in_progress += 1
                }
                _ => metrics.todo_pending += 1,
            }
        }
    }
    metrics
}

fn handoff_status_is_active(status: &str) -> bool {
    matches!(
        status,
        "accepted" | "queued" | "running" | "waitingAction" | "waiting_action" | "in_progress"
    )
}

fn handoff_recent_artifacts(read: &AgentSessionReadResponse) -> Vec<HandoffRecentArtifact> {
    let Some(detail) = read.detail.as_ref() else {
        return Vec::new();
    };
    let artifacts = detail
        .pointer("/thread_read/artifacts")
        .or_else(|| detail.get("artifacts"))
        .and_then(serde_json::Value::as_array);
    let Some(artifacts) = artifacts else {
        return Vec::new();
    };

    let mut recent = Vec::new();
    let mut seen = HashSet::new();
    for artifact in artifacts.iter().rev() {
        let path = string_field(artifact, &["path", "relativePath", "relative_path"])
            .or_else(|| string_field(artifact, &["artifactRef", "artifact_ref"]));
        let Some(path) = path else {
            continue;
        };
        if !seen.insert(path.clone()) {
            continue;
        }
        let title = string_field(artifact, &["title"])
            .unwrap_or_else(|| path.rsplit('/').next().unwrap_or(path.as_str()).to_string());
        let kind = string_field(artifact, &["kind"]).unwrap_or_else(|| "artifact".to_string());
        recent.push(HandoffRecentArtifact { title, kind, path });
        if recent.len() >= HANDOFF_RECENT_ARTIFACT_LIMIT {
            break;
        }
    }
    recent.reverse();
    recent
}

fn write_handoff_bundle_file(
    bundle_root: &Path,
    bundle_relative_root: &str,
    file_name: &str,
    kind: &str,
    title: &str,
    content: String,
) -> Result<AgentSessionHandoffArtifact, RuntimeCoreError> {
    let absolute_path = bundle_root.join(file_name);
    fs::write(&absolute_path, content.as_bytes()).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to write handoff bundle file {}: {error}",
            absolute_path.display()
        ))
    })?;
    Ok(AgentSessionHandoffArtifact {
        kind: kind.to_string(),
        title: title.to_string(),
        relative_path: format!("{bundle_relative_root}/{file_name}"),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        bytes: content.len(),
    })
}

fn write_runtime_export_file(
    root: &Path,
    relative_root: &str,
    file_name: &str,
    kind: &str,
    title: &str,
    content: String,
) -> Result<AgentSessionHandoffArtifact, RuntimeCoreError> {
    let absolute_path = root.join(file_name);
    fs::write(&absolute_path, content.as_bytes()).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to write runtime export file {}: {error}",
            absolute_path.display()
        ))
    })?;
    Ok(AgentSessionHandoffArtifact {
        kind: kind.to_string(),
        title: title.to_string(),
        relative_path: format!("{relative_root}/{file_name}"),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        bytes: content.len(),
    })
}

fn runtime_export_root(workspace_root: &Path, session_id: &str, child: &str) -> (String, PathBuf) {
    let relative_root = format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}/{child}");
    let absolute_root = workspace_root
        .join(".lime")
        .join("harness")
        .join("sessions")
        .join(session_id)
        .join(child);
    (relative_root, absolute_root)
}

fn ensure_runtime_export_root(root: &Path) -> Result<(), RuntimeCoreError> {
    fs::create_dir_all(root).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to create runtime export directory {}: {error}",
            root.display()
        ))
    })
}

fn runtime_export_base_roots(session_id: &str) -> (String, String, String) {
    (
        format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}"),
        format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}/evidence"),
        format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}/replay"),
    )
}

fn sanitized_workspace_root(workspace_root: &Path) -> String {
    let mut components = workspace_root
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => value.to_str().map(ToString::to_string),
            _ => None,
        })
        .collect::<Vec<_>>();
    if components.is_empty() {
        return workspace_root.to_string_lossy().to_string();
    }
    if components.len() > 3 {
        components = components.split_off(components.len() - 3);
    }
    components.join("/")
}

fn json_pretty(value: serde_json::Value, label: &str) -> Result<String, RuntimeCoreError> {
    serde_json::to_string_pretty(&value)
        .map_err(|error| RuntimeCoreError::Backend(format!("failed to serialize {label}: {error}")))
}

fn build_replay_input_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-replay-case.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "exportedAt": exported_at,
            "threadStatus": agent_session_status_label(read.session.status),
            "latestTurnStatus": metrics.latest_turn_status,
            "turns": read.turns.iter().map(|turn| {
                json!({
                    "turnId": turn.turn_id,
                    "status": agent_turn_status_label(turn.status),
                    "startedAt": turn.started_at,
                    "completedAt": turn.completed_at,
                })
            }).collect::<Vec<_>>(),
            "detail": read.detail,
            "recentArtifacts": recent_artifacts.iter().map(|artifact| {
                json!({
                    "title": artifact.title,
                    "kind": artifact.kind,
                    "path": artifact.path,
                })
            }).collect::<Vec<_>>(),
        }),
        "replay input",
    )
}

fn build_replay_expected_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-replay-expected.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "exportedAt": exported_at,
            "expected": {
                "terminalThreadStatus": agent_session_status_label(read.session.status),
                "latestTurnStatus": metrics.latest_turn_status,
                "pendingRequestCount": metrics.pending_request_count,
                "queuedTurnCount": metrics.queued_turn_count,
            }
        }),
        "replay expected",
    )
}

fn build_replay_grader_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    exported_at: &str,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# Replay Grader");
    let _ = writeln!(content);
    let _ = writeln!(content, "- sessionId: `{}`", read.session.session_id);
    let _ = writeln!(content, "- threadId: `{}`", read.session.thread_id);
    let _ = writeln!(content, "- exportedAt: `{exported_at}`");
    let _ = writeln!(
        content,
        "- threadStatus: `{}`",
        agent_session_status_label(read.session.status)
    );
    let _ = writeln!(content);
    let _ = writeln!(content, "## Checks");
    let _ = writeln!(
        content,
        "- pendingRequestCount should remain {} unless intentionally changed.",
        metrics.pending_request_count
    );
    let _ = writeln!(
        content,
        "- queuedTurnCount should remain {} unless intentionally changed.",
        metrics.queued_turn_count
    );
    let _ = writeln!(
        content,
        "- replay should preserve App Server current read model shape."
    );
    content
}

fn build_replay_evidence_links_json(
    session_id: &str,
    handoff_relative_root: &str,
    evidence_relative_root: &str,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-replay-evidence-links.v1",
            "sessionId": session_id,
            "exportedAt": exported_at,
            "handoffBundleRelativeRoot": handoff_relative_root,
            "evidencePackRelativeRoot": evidence_relative_root,
            "recentArtifacts": recent_artifacts.iter().map(|artifact| {
                json!({
                    "title": artifact.title,
                    "kind": artifact.kind,
                    "path": artifact.path,
                })
            }).collect::<Vec<_>>(),
        }),
        "replay evidence links",
    )
}

fn build_analysis_brief_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# Analysis Handoff");
    let _ = writeln!(content);
    let _ = writeln!(content, "- sessionId: `{}`", read.session.session_id);
    let _ = writeln!(content, "- threadId: `{}`", read.session.thread_id);
    let _ = writeln!(
        content,
        "- threadStatus: `{}`",
        agent_session_status_label(read.session.status)
    );
    if let Some(latest_turn_status) = metrics.latest_turn_status.as_deref() {
        let _ = writeln!(content, "- latestTurnStatus: `{latest_turn_status}`");
    }
    let _ = writeln!(content, "- exportedAt: `{exported_at}`");
    let _ = writeln!(content);
    let _ = writeln!(content, "## Focus");
    let _ = writeln!(
        content,
        "- Review the current App Server read model and decide the next implementation slice."
    );
    let _ = writeln!(
        content,
        "- Do not use legacy `agent_runtime_*` command output as production evidence."
    );
    let _ = writeln!(content);
    write_handoff_todo_summary(&mut content, metrics, handoff_copy(Some("en-US")));
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, handoff_copy(Some("en-US")));
    content
}

fn build_analysis_context_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    workspace_root: &Path,
    replay_relative_root: &str,
    handoff_relative_root: &str,
    evidence_relative_root: &str,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-analysis-handoff.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "workspaceId": read.session.workspace_id,
            "workspaceRoot": workspace_root.to_string_lossy(),
            "sanitizedWorkspaceRoot": sanitized_workspace_root(workspace_root),
            "exportedAt": exported_at,
            "threadStatus": agent_session_status_label(read.session.status),
            "latestTurnStatus": metrics.latest_turn_status,
            "pendingRequestCount": metrics.pending_request_count,
            "queuedTurnCount": metrics.queued_turn_count,
            "handoffBundleRelativeRoot": handoff_relative_root,
            "evidencePackRelativeRoot": evidence_relative_root,
            "replayCaseRelativeRoot": replay_relative_root,
            "detail": read.detail,
        }),
        "analysis context",
    )
}

fn build_analysis_copy_prompt(
    read: &AgentSessionReadResponse,
    analysis_relative_root: &str,
    replay_relative_root: &str,
) -> String {
    format!(
        "请基于 App Server current 导出的 `{}` 和 `{}` 分析会话 `{}` 的下一步风险、缺口和回归验证；不要依赖 legacy agent_runtime_* 输出。",
        analysis_relative_root, replay_relative_root, read.session.session_id
    )
}

fn default_review_decision() -> AgentSessionReviewDecision {
    AgentSessionReviewDecision {
        decision_status: "pending_review".to_string(),
        decision_summary: String::new(),
        chosen_fix_strategy: String::new(),
        risk_level: "unknown".to_string(),
        risk_tags: Vec::new(),
        human_reviewer: String::new(),
        followup_actions: Vec::new(),
        regression_requirements: vec![
            "Run targeted current-path regression before marking accepted.".to_string(),
        ],
        notes: String::new(),
    }
}

fn review_decision_from_save_params(
    params: &AgentSessionReviewDecisionSaveParams,
) -> AgentSessionReviewDecision {
    AgentSessionReviewDecision {
        decision_status: normalize_review_decision_status(params.decision_status.as_str()),
        decision_summary: params.decision_summary.trim().to_string(),
        chosen_fix_strategy: params.chosen_fix_strategy.trim().to_string(),
        risk_level: normalize_review_risk_level(params.risk_level.as_str()),
        risk_tags: trim_string_vec(&params.risk_tags),
        human_reviewer: params.human_reviewer.trim().to_string(),
        followup_actions: trim_string_vec(&params.followup_actions),
        regression_requirements: trim_string_vec(&params.regression_requirements),
        notes: params.notes.trim().to_string(),
    }
}

fn normalize_review_decision_status(value: &str) -> String {
    match value.trim() {
        "accepted" | "deferred" | "rejected" | "needs_more_evidence" | "pending_review" => {
            value.trim().to_string()
        }
        _ => "pending_review".to_string(),
    }
}

fn normalize_review_risk_level(value: &str) -> String {
    match value.trim() {
        "low" | "medium" | "high" | "unknown" => value.trim().to_string(),
        _ => "unknown".to_string(),
    }
}

fn trim_string_vec(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn build_review_decision_markdown(
    read: &AgentSessionReadResponse,
    decision: &AgentSessionReviewDecision,
    analysis_relative_root: &str,
    replay_relative_root: &str,
    exported_at: &str,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# Review Decision");
    let _ = writeln!(content);
    let _ = writeln!(content, "- sessionId: `{}`", read.session.session_id);
    let _ = writeln!(content, "- threadId: `{}`", read.session.thread_id);
    let _ = writeln!(content, "- exportedAt: `{exported_at}`");
    let _ = writeln!(content, "- decisionStatus: `{}`", decision.decision_status);
    let _ = writeln!(content, "- riskLevel: `{}`", decision.risk_level);
    let _ = writeln!(content, "- analysis: `{analysis_relative_root}`");
    let _ = writeln!(content, "- replay: `{replay_relative_root}`");
    let _ = writeln!(content);
    let _ = writeln!(content, "## Summary");
    let _ = writeln!(
        content,
        "{}",
        if decision.decision_summary.is_empty() {
            "Pending human review."
        } else {
            decision.decision_summary.as_str()
        }
    );
    let _ = writeln!(content);
    let _ = writeln!(content, "## Follow-up Actions");
    if decision.followup_actions.is_empty() {
        let _ = writeln!(content, "- None recorded.");
    } else {
        for action in &decision.followup_actions {
            let _ = writeln!(content, "- {action}");
        }
    }
    let _ = writeln!(content);
    let _ = writeln!(content, "## Regression Requirements");
    if decision.regression_requirements.is_empty() {
        let _ = writeln!(content, "- Run current-path targeted regression.");
    } else {
        for item in &decision.regression_requirements {
            let _ = writeln!(content, "- {item}");
        }
    }
    if !decision.notes.is_empty() {
        let _ = writeln!(content);
        let _ = writeln!(content, "## Notes");
        let _ = writeln!(content, "{}", decision.notes);
    }
    content
}

fn build_review_decision_json(
    read: &AgentSessionReadResponse,
    decision: &AgentSessionReviewDecision,
    analysis_relative_root: &str,
    replay_relative_root: &str,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-review-decision.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "exportedAt": exported_at,
            "analysisRelativeRoot": analysis_relative_root,
            "replayCaseRelativeRoot": replay_relative_root,
            "decision": decision,
        }),
        "review decision",
    )
}

fn build_handoff_plan_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
    copy: HandoffCopy,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# {}", copy.plan_title);
    let _ = writeln!(content);
    write_handoff_header(&mut content, read, metrics, exported_at, copy);
    let _ = writeln!(content);
    write_handoff_todo_summary(&mut content, metrics, copy);
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, copy);
    let _ = writeln!(content);
    let _ = writeln!(content, "## {}", copy.next_step_title);
    let _ = writeln!(content);
    let _ = writeln!(content, "- {}", copy.next_step_body);
    content
}

fn build_handoff_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
    copy: HandoffCopy,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# {}", copy.handoff_title);
    let _ = writeln!(content);
    write_handoff_header(&mut content, read, metrics, exported_at, copy);
    let _ = writeln!(content);
    let _ = writeln!(content, "## {}", copy.next_step_title);
    let _ = writeln!(content);
    let _ = writeln!(content, "- {}", copy.next_step_body);
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, copy);
    content
}

fn build_handoff_review_summary_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
    copy: HandoffCopy,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# {}", copy.review_summary_title);
    let _ = writeln!(content);
    write_handoff_header(&mut content, read, metrics, exported_at, copy);
    let _ = writeln!(content);
    let _ = writeln!(content, "{}", copy.review_note);
    let _ = writeln!(content);
    write_handoff_todo_summary(&mut content, metrics, copy);
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, copy);
    content
}

fn build_handoff_progress_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    workspace_root: &Path,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    let recent_artifacts = recent_artifacts
        .iter()
        .map(|artifact| {
            json!({
                "title": artifact.title,
                "kind": artifact.kind,
                "path": artifact.path,
            })
        })
        .collect::<Vec<_>>();
    let turns = read
        .turns
        .iter()
        .map(|turn| {
            json!({
                "turnId": turn.turn_id,
                "status": agent_turn_status_label(turn.status),
                "startedAt": turn.started_at,
                "completedAt": turn.completed_at,
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string_pretty(&json!({
        "schemaVersion": "agent-session-handoff-bundle.v1",
        "sessionId": read.session.session_id,
        "threadId": read.session.thread_id,
        "workspaceId": read.session.workspace_id,
        "workspaceRoot": workspace_root.to_string_lossy(),
        "exportedAt": exported_at,
        "status": {
            "thread": agent_session_status_label(read.session.status),
            "latestTurn": metrics.latest_turn_status,
        },
        "counts": {
            "pendingRequest": metrics.pending_request_count,
            "queuedTurn": metrics.queued_turn_count,
            "activeSubagent": metrics.active_subagent_count,
        },
        "todos": {
            "total": metrics.todo_total,
            "pending": metrics.todo_pending,
            "inProgress": metrics.todo_in_progress,
            "completed": metrics.todo_completed,
        },
        "turns": turns,
        "recentArtifacts": recent_artifacts,
    }))
    .map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to serialize handoff progress: {error}"))
    })
}

fn write_handoff_header(
    content: &mut String,
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    exported_at: &str,
    copy: HandoffCopy,
) {
    let _ = writeln!(
        content,
        "- {}: `{}`",
        copy.session_label, read.session.session_id
    );
    let _ = writeln!(
        content,
        "- {}: `{}`",
        copy.thread_label, read.session.thread_id
    );
    let _ = writeln!(
        content,
        "- {}: `{}`",
        copy.status_label,
        agent_session_status_label(read.session.status)
    );
    if let Some(latest_turn_status) = metrics.latest_turn_status.as_deref() {
        let _ = writeln!(content, "- latestTurnStatus: `{latest_turn_status}`");
    }
    let _ = writeln!(content, "- {}: `{}`", copy.exported_at_label, exported_at);
}

fn write_handoff_todo_summary(content: &mut String, metrics: &HandoffMetrics, copy: HandoffCopy) {
    let _ = writeln!(content, "## {}", copy.todo_summary_title);
    let _ = writeln!(content);
    let _ = writeln!(content, "- total: {}", metrics.todo_total);
    let _ = writeln!(content, "- pending: {}", metrics.todo_pending);
    let _ = writeln!(content, "- inProgress: {}", metrics.todo_in_progress);
    let _ = writeln!(content, "- completed: {}", metrics.todo_completed);
    let _ = writeln!(
        content,
        "- pendingRequests: {}",
        metrics.pending_request_count
    );
    let _ = writeln!(content, "- queuedTurns: {}", metrics.queued_turn_count);
    let _ = writeln!(
        content,
        "- activeSubagents: {}",
        metrics.active_subagent_count
    );
}

fn write_handoff_recent_artifacts(
    content: &mut String,
    recent_artifacts: &[HandoffRecentArtifact],
    copy: HandoffCopy,
) {
    let _ = writeln!(content, "## {}", copy.recent_artifacts_title);
    let _ = writeln!(content);
    if recent_artifacts.is_empty() {
        let _ = writeln!(content, "- {}", copy.no_recent_artifacts);
        return;
    }
    for artifact in recent_artifacts {
        let _ = writeln!(
            content,
            "- `{}` {} ({})",
            artifact.path, artifact.title, artifact.kind
        );
    }
}

fn handoff_copy(locale: Option<&str>) -> HandoffCopy {
    match locale.unwrap_or("zh-CN") {
        value if value.eq_ignore_ascii_case("zh-TW") || value.eq_ignore_ascii_case("zh-HK") => {
            HandoffCopy {
                plan_title: "計畫摘要",
                progress_title: "結構化進度",
                handoff_title: "交接摘要",
                review_summary_title: "審查摘要",
                session_label: "會話",
                thread_label: "執行緒",
                status_label: "狀態",
                exported_at_label: "匯出時間",
                todo_summary_title: "待辦摘要",
                recent_artifacts_title: "最近產物",
                no_recent_artifacts: "目前沒有可引用的最近產物。",
                next_step_title: "建議接手順序",
                next_step_body: "先讀 progress.json 確認結構化狀態，再讀 handoff.md 決定下一刀。",
                review_note: "此摘要來自 App Server current read model；不要把 legacy command 輸出當成交付證據。",
            }
        }
        value if value.eq_ignore_ascii_case("ja-JP") || value.eq_ignore_ascii_case("ja") => {
            HandoffCopy {
                plan_title: "計画サマリー",
                progress_title: "構造化された進捗",
                handoff_title: "引き継ぎサマリー",
                review_summary_title: "レビューサマリー",
                session_label: "セッション",
                thread_label: "スレッド",
                status_label: "状態",
                exported_at_label: "エクスポート時刻",
                todo_summary_title: "Todo サマリー",
                recent_artifacts_title: "最近の成果物",
                no_recent_artifacts: "参照できる最近の成果物はありません。",
                next_step_title: "推奨される引き継ぎ順序",
                next_step_body: "まず progress.json で構造化された状態を確認し、次に handoff.md で次の作業を決めてください。",
                review_note: "このサマリーは App Server current read model から生成されています。legacy command の出力を納品証跡として扱わないでください。",
            }
        }
        value if value.eq_ignore_ascii_case("ko-KR") || value.eq_ignore_ascii_case("ko") => {
            HandoffCopy {
                plan_title: "계획 요약",
                progress_title: "구조화된 진행 상황",
                handoff_title: "인수인계 요약",
                review_summary_title: "리뷰 요약",
                session_label: "세션",
                thread_label: "스레드",
                status_label: "상태",
                exported_at_label: "내보낸 시간",
                todo_summary_title: "Todo 요약",
                recent_artifacts_title: "최근 산출물",
                no_recent_artifacts: "참조할 최근 산출물이 없습니다.",
                next_step_title: "권장 인수인계 순서",
                next_step_body: "먼저 progress.json에서 구조화된 상태를 확인한 뒤 handoff.md에서 다음 작업을 결정하세요.",
                review_note: "이 요약은 App Server current read model에서 생성되었습니다. legacy command 출력을 납품 증거로 사용하지 마세요.",
            }
        }
        value if value.eq_ignore_ascii_case("en-US") || value.eq_ignore_ascii_case("en") => {
            HandoffCopy {
                plan_title: "Plan Summary",
                progress_title: "Structured Progress",
                handoff_title: "Handoff Summary",
                review_summary_title: "Review Summary",
                session_label: "Session",
                thread_label: "Thread",
                status_label: "Status",
                exported_at_label: "Exported At",
                todo_summary_title: "Todo Summary",
                recent_artifacts_title: "Recent Artifacts",
                no_recent_artifacts: "No recent artifacts are available.",
                next_step_title: "Recommended Handoff Order",
                next_step_body: "Read progress.json for structured state first, then use handoff.md to choose the next implementation slice.",
                review_note: "This summary is generated from the App Server current read model; do not treat legacy command output as delivery evidence.",
            }
        }
        _ => HandoffCopy {
            plan_title: "计划摘要",
            progress_title: "结构化进度",
            handoff_title: "交接摘要",
            review_summary_title: "审查摘要",
            session_label: "会话",
            thread_label: "线程",
            status_label: "状态",
            exported_at_label: "导出时间",
            todo_summary_title: "Todo 摘要",
            recent_artifacts_title: "最近产物",
            no_recent_artifacts: "当前没有可引用的最近产物。",
            next_step_title: "推荐接手顺序",
            next_step_body: "先读 progress.json 确认结构化状态，再读 handoff.md 决定下一刀。",
            review_note: "此摘要来自 App Server current read model；不要把 legacy command 输出当成交付证据。",
        },
    }
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
            evidence_export_provider,
            knowledge_builder_runtime_executor: Arc::new(
                NativeKnowledgeBuilderRuntimeExecutor::new(),
            ),
            app_data_source: Arc::new(NoopAppDataSource),
        }
    }

    pub fn with_app_data_source(mut self, app_data_source: Arc<dyn AppDataSource>) -> Self {
        self.app_data_source = app_data_source;
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
                turn_inputs: HashMap::new(),
                turn_runtime_options: HashMap::new(),
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
        let detail = runtime_session_read_detail(stored);

        Ok(AgentSessionReadResponse {
            session: stored.session.clone(),
            turns: stored.turns.clone(),
            detail: Some(detail),
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

    pub async fn update_session_current(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        let normalized_session_id = params.session_id.trim().to_string();
        if normalized_session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/update".to_string(),
            ));
        }
        if let Some(session) =
            self.update_runtime_core_session_overview(params.clone(), &normalized_session_id)?
        {
            return Ok(AgentSessionUpdateResponse { session });
        }
        self.app_data_source
            .update_current_timeline_session(AgentSessionUpdateParams {
                session_id: normalized_session_id,
                title: params.title,
                archived: params.archived,
                provider_selector: params.provider_selector,
                provider_name: params.provider_name,
                model_name: params.model_name,
                execution_strategy: params.execution_strategy,
                recent_access_mode: params.recent_access_mode,
                recent_preferences: params.recent_preferences,
                recent_team_selection: params.recent_team_selection,
            })
            .await
    }

    pub async fn read_agent_session_objective(
        &self,
        params: AgentSessionObjectiveReadParams,
    ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
        self.app_data_source
            .read_agent_session_objective(params)
            .await
    }

    pub async fn set_agent_session_objective(
        &self,
        params: AgentSessionObjectiveSetParams,
    ) -> Result<AgentSessionObjectiveSetResponse, RuntimeCoreError> {
        self.app_data_source
            .set_agent_session_objective(params)
            .await
    }

    pub async fn update_agent_session_objective_status(
        &self,
        params: AgentSessionObjectiveStatusUpdateParams,
    ) -> Result<AgentSessionObjectiveStatusUpdateResponse, RuntimeCoreError> {
        self.app_data_source
            .update_agent_session_objective_status(params)
            .await
    }

    pub async fn clear_agent_session_objective(
        &self,
        params: AgentSessionObjectiveClearParams,
    ) -> Result<AgentSessionObjectiveClearResponse, RuntimeCoreError> {
        self.app_data_source
            .clear_agent_session_objective(params)
            .await
    }

    pub async fn continue_agent_session_objective(
        &self,
        params: AgentSessionObjectiveContinueParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionObjectiveContinueResponse>, RuntimeCoreError> {
        let session_id = crate::objective::normalize_required_id(
            &params.session_id,
            "sessionId is required for agentSession/objective/continue",
        )?;
        let owner = crate::objective::resolve_managed_objective_owner(
            &session_id,
            params.owner_kind.as_deref(),
            params.owner_id.as_deref(),
        )?;
        crate::objective::ensure_agent_session_objective_owner(&owner, &session_id)?;

        let objective = self
            .read_agent_session_objective(AgentSessionObjectiveReadParams {
                session_id: session_id.clone(),
            })
            .await?
            .objective
            .ok_or_else(|| RuntimeCoreError::Backend("当前会话还没有目标".to_string()))?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        crate::objective::ensure_objective_can_continue(&objective, &read)?;
        let turn_id = new_id("turn");
        let queued_turn_id = new_id("queued");
        let workspace_id = self
            .resolve_objective_workspace_id(&session_id, &objective)
            .await?;
        let message = crate::objective::managed_objective_continuation_message(&objective);
        let event_name = crate::objective::managed_objective_event_name(&objective);
        let metadata = crate::objective::managed_objective_continuation_metadata(&objective);
        let runtime_preferences = self.resolve_continuation_runtime_preferences(&read);
        let runtime_provider_preference =
            runtime_preferences.provider_preference_for_runtime_options();
        let runtime_model_preference = runtime_preferences.model_preference_for_runtime_options();
        let host_options = build_objective_continuation_host_options(
            &message,
            &session_id,
            &event_name,
            &workspace_id,
            &turn_id,
            &queued_turn_id,
            &metadata,
            &runtime_preferences,
        );

        let output = self
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session_id.clone(),
                    turn_id: Some(turn_id),
                    input: AgentInput {
                        text: message,
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(app_server_protocol::RuntimeOptions {
                        capability_id: None,
                        stream: true,
                        event_name: Some(event_name),
                        provider_preference: runtime_provider_preference,
                        model_preference: runtime_model_preference,
                        metadata: Some(metadata),
                        queued_turn_id: Some(queued_turn_id.clone()),
                        host_options: Some(host_options),
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                host,
            )
            .await?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionObjectiveContinueResponse {
                submitted: true,
                queued_turn_id,
                objective,
                turn: output.response.turn,
            },
            events: output.events,
        })
    }

    pub async fn audit_agent_session_objective(
        &self,
        params: AgentSessionObjectiveAuditParams,
    ) -> Result<AgentSessionObjectiveAuditResponse, RuntimeCoreError> {
        let session_id = crate::objective::normalize_required_id(
            &params.session_id,
            "sessionId is required for agentSession/objective/audit",
        )?;
        let owner = crate::objective::resolve_managed_objective_owner(
            &session_id,
            params.owner_kind.as_deref(),
            params.owner_id.as_deref(),
        )?;
        let objective = self
            .app_data_source
            .read_managed_objective_by_owner(owner.owner_kind.clone(), owner.owner_id.clone())
            .await?
            .ok_or_else(|| {
                if owner.owner_kind == crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION {
                    RuntimeCoreError::Backend("当前会话还没有目标".to_string())
                } else {
                    RuntimeCoreError::Backend("当前目标 owner 还没有目标".to_string())
                }
            })?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let evidence = self
            .export_evidence(EvidenceExportParams {
                session_id,
                turn_id: None,
                include_events: Some(true),
                include_artifacts: Some(true),
                include_evidence_pack: Some(true),
            })
            .await
            .ok();
        let audit_update = crate::objective::build_managed_objective_audit_update(
            &objective,
            &read,
            evidence
                .as_ref()
                .and_then(|response| response.evidence_pack.as_ref()),
        );
        let objective = self
            .app_data_source
            .audit_agent_session_objective(owner.owner_kind, owner.owner_id, audit_update)
            .await?
            .ok_or_else(|| RuntimeCoreError::Backend("保存目标审计结果后读取失败".to_string()))?;
        Ok(AgentSessionObjectiveAuditResponse { objective })
    }

    async fn resolve_objective_workspace_id(
        &self,
        session_id: &str,
        objective: &ManagedObjective,
    ) -> Result<String, RuntimeCoreError> {
        if let Some(workspace_id) = objective
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Ok(workspace_id.to_string());
        }

        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        read.session
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "agentSession/objective/continue requires a workspaceId".to_string(),
                )
            })
    }

    pub async fn compact_agent_session(
        &self,
        params: AgentSessionCompactParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionCompactResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/compact",
        )?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let (session, turns) = self.session_snapshot(&session_id)?;
        let event_name = params
            .event_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("agentSession/compact");
        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            None,
            vec![
                RuntimeEvent::new(
                    "context.compaction.started",
                    json!({
                        "source": "agentSession/compact",
                        "eventName": event_name,
                        "turnCount": turns.len(),
                        "trigger": "manual",
                    }),
                ),
                RuntimeEvent::new(
                    "context.compaction.completed",
                    json!({
                        "source": "agentSession/compact",
                        "eventName": event_name,
                        "turnCount": turns.len(),
                        "trigger": "manual",
                        "summary": "App Server current compaction checkpoint recorded.",
                    }),
                ),
            ],
        )?;
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionCompactResponse {
                session,
                turns,
                compacted: true,
            },
            events,
        })
    }

    pub async fn resume_agent_session_thread(
        &self,
        params: AgentSessionThreadResumeParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionThreadResumeResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/thread/resume",
        )?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let queued = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.clone()))?;
            if stored
                .turns
                .iter()
                .any(|turn| agent_turn_blocks_queue_resume(turn.status))
            {
                let session = stored.session.clone();
                let turns = stored.turns.clone();
                return Ok(RuntimeCoreOutput {
                    response: AgentSessionThreadResumeResponse {
                        session,
                        turns,
                        resumed: false,
                    },
                    events: Vec::new(),
                });
            }
            let Some(index) = stored
                .turns
                .iter()
                .position(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            else {
                let session = stored.session.clone();
                let turns = stored.turns.clone();
                return Ok(RuntimeCoreOutput {
                    response: AgentSessionThreadResumeResponse {
                        session,
                        turns,
                        resumed: false,
                    },
                    events: Vec::new(),
                });
            };
            let turn = stored.turns.remove(index);
            let input = stored
                .turn_inputs
                .remove(&turn.turn_id)
                .unwrap_or_else(|| AgentInput {
                    text: String::new(),
                    attachments: Vec::new(),
                });
            (index, turn, input)
        };
        let output = match self
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session_id.clone(),
                    turn_id: Some(queued.1.turn_id.clone()),
                    input: queued.2.clone(),
                    runtime_options: Some(app_server_protocol::RuntimeOptions {
                        queued_turn_id: Some(queued.1.turn_id.clone()),
                        ..app_server_protocol::RuntimeOptions::default()
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: true,
                },
                host,
            )
            .await
        {
            Ok(output) => output,
            Err(error) => {
                self.restore_queued_turn_if_missing(&session_id, queued.0, queued.1, queued.2);
                return Err(error);
            }
        };
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionThreadResumeResponse {
                session,
                turns,
                resumed: true,
            },
            events: output.events,
        })
    }

    pub async fn remove_agent_session_queued_turn(
        &self,
        params: AgentSessionQueuedTurnRemoveParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionQueuedTurnRemoveResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/queuedTurn/remove",
        )?;
        let queued_turn_id = normalize_session_control_id(
            &params.queued_turn_id,
            "queuedTurnId is required for agentSession/queuedTurn/remove",
        )?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let (session, removed) = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.clone()))?;
            let before = stored.turns.len();
            stored.turns.retain(|turn| {
                !(turn.turn_id == queued_turn_id && matches!(turn.status, AgentTurnStatus::Queued))
            });
            let removed = stored.turns.len() != before;
            if removed {
                stored.turn_inputs.remove(&queued_turn_id);
                stored.turn_runtime_options.remove(&queued_turn_id);
                stored.session.updated_at = timestamp();
                if !stored
                    .turns
                    .iter()
                    .any(|turn| agent_turn_is_active(turn.status))
                {
                    stored.session.status = AgentSessionStatus::Idle;
                }
            }
            (stored.session.clone(), removed)
        };
        let events = if removed {
            self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                None,
                vec![RuntimeEvent::new(
                    "queue.removed",
                    json!({
                        "source": "agentSession/queuedTurn/remove",
                        "queuedTurnId": queued_turn_id,
                    }),
                )],
            )?
        } else {
            Vec::new()
        };
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionQueuedTurnRemoveResponse {
                session,
                turns,
                queued_turn_id,
                removed,
            },
            events,
        })
    }

    pub async fn promote_agent_session_queued_turn(
        &self,
        params: AgentSessionQueuedTurnPromoteParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionQueuedTurnPromoteResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/queuedTurn/promote",
        )?;
        let queued_turn_id = normalize_session_control_id(
            &params.queued_turn_id,
            "queuedTurnId is required for agentSession/queuedTurn/promote",
        )?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let (session, promoted) = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.clone()))?;
            let Some(index) = stored.turns.iter().position(|turn| {
                turn.turn_id == queued_turn_id && matches!(turn.status, AgentTurnStatus::Queued)
            }) else {
                return Ok(RuntimeCoreOutput {
                    response: AgentSessionQueuedTurnPromoteResponse {
                        session: stored.session.clone(),
                        turns: stored.turns.clone(),
                        queued_turn_id,
                        promoted: false,
                    },
                    events: Vec::new(),
                });
            };
            let turn = stored.turns.remove(index);
            let insert_at = stored
                .turns
                .iter()
                .position(|turn| matches!(turn.status, AgentTurnStatus::Queued))
                .unwrap_or(stored.turns.len());
            stored.turns.insert(insert_at, turn);
            stored.session.updated_at = timestamp();
            (stored.session.clone(), true)
        };
        let events = if promoted {
            self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                None,
                vec![RuntimeEvent::new(
                    "queue.promoted",
                    json!({
                        "source": "agentSession/queuedTurn/promote",
                        "queuedTurnId": queued_turn_id,
                    }),
                )],
            )?
        } else {
            Vec::new()
        };
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionQueuedTurnPromoteResponse {
                session,
                turns,
                queued_turn_id,
                promoted,
            },
            events,
        })
    }

    pub async fn list_agent_session_file_checkpoints(
        &self,
        params: AgentSessionFileCheckpointListParams,
    ) -> Result<AgentSessionFileCheckpointListResponse, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        crate::file_checkpoint::list_file_checkpoints(&detail).map_err(RuntimeCoreError::Backend)
    }

    pub async fn get_agent_session_file_checkpoint(
        &self,
        params: AgentSessionFileCheckpointGetParams,
    ) -> Result<AgentSessionFileCheckpointDetail, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        let workspace_root = crate::file_checkpoint::resolve_workspace_root(&detail)
            .map_err(RuntimeCoreError::Backend)?;
        crate::file_checkpoint::get_file_checkpoint(
            &detail,
            workspace_root.as_path(),
            &params.checkpoint_id,
        )
        .map_err(RuntimeCoreError::Backend)
    }

    pub async fn diff_agent_session_file_checkpoint(
        &self,
        params: AgentSessionFileCheckpointDiffParams,
    ) -> Result<AgentSessionFileCheckpointDiffResponse, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        crate::file_checkpoint::diff_file_checkpoint(&detail, &params.checkpoint_id)
            .map_err(RuntimeCoreError::Backend)
    }

    pub async fn restore_agent_session_file_checkpoint(
        &self,
        params: AgentSessionFileCheckpointRestoreParams,
    ) -> Result<AgentSessionFileCheckpointRestoreResponse, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        let workspace_root = crate::file_checkpoint::resolve_workspace_root(&detail)
            .map_err(RuntimeCoreError::Backend)?;
        crate::file_checkpoint::restore_file_checkpoint(
            &detail,
            workspace_root.as_path(),
            &params.checkpoint_id,
            params.confirm_restore,
            params.create_backup,
        )
        .map_err(RuntimeCoreError::Backend)
    }

    async fn read_current_detail_for_file_checkpoint(
        &self,
        session_id: &str,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        let normalized_session_id = session_id.trim();
        if normalized_session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/fileCheckpoint".to_string(),
            ));
        }
        let response = self
            .read_session_current(AgentSessionReadParams {
                session_id: normalized_session_id.to_string(),
                history_limit: Some(1_000),
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        response.detail.ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agentSession/fileCheckpoint requires current session detail".to_string(),
            )
        })
    }

    pub async fn get_or_create_session_file(
        &self,
        params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        self.app_data_source
            .get_or_create_session_file(params)
            .await
    }

    pub async fn update_session_file_meta(
        &self,
        params: SessionFileUpdateMetaParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        self.app_data_source.update_session_file_meta(params).await
    }

    pub async fn save_session_file(
        &self,
        params: SessionFileSaveParams,
    ) -> Result<SessionFileEntryResponse, RuntimeCoreError> {
        self.app_data_source.save_session_file(params).await
    }

    pub async fn read_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileReadResponse, RuntimeCoreError> {
        self.app_data_source.read_session_file(params).await
    }

    pub async fn resolve_session_file_path(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileResolvePathResponse, RuntimeCoreError> {
        self.app_data_source.resolve_session_file_path(params).await
    }

    pub async fn delete_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileMutationResponse, RuntimeCoreError> {
        self.app_data_source.delete_session_file(params).await
    }

    pub async fn list_session_files(
        &self,
        params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileListResponse, RuntimeCoreError> {
        self.app_data_source.list_session_files(params).await
    }

    fn update_runtime_core_session_overview(
        &self,
        params: AgentSessionUpdateParams,
        session_id: &str,
    ) -> Result<Option<AgentSessionOverview>, RuntimeCoreError> {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let Some(stored) = state.sessions.get_mut(session_id) else {
            return Ok(None);
        };
        if let Some(title) = params.title.as_deref().map(str::trim) {
            if !title.is_empty() {
                update_session_business_object_title(&mut stored.session, title);
            }
        }
        update_session_business_object_metadata(&mut stored.session, &params);
        stored.session.updated_at = timestamp();
        if params.archived.unwrap_or(false) {
            return Err(RuntimeCoreError::Backend(
                "agentSession/update archived is only supported for persisted current timeline sessions"
                    .to_string(),
            ));
        }
        Ok(Some(stored_session_to_overview(stored)))
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

    pub async fn list_management_skills(
        &self,
        params: SkillManagementListParams,
    ) -> Result<SkillListResponse, RuntimeCoreError> {
        self.app_data_source.list_management_skills(params).await
    }

    pub async fn install_management_skill(
        &self,
        params: SkillManagementInstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.install_management_skill(params).await
    }

    pub async fn uninstall_management_skill(
        &self,
        params: SkillManagementUninstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source
            .uninstall_management_skill(params)
            .await
    }

    pub async fn list_skill_repositories(
        &self,
    ) -> Result<SkillRepositoryListResponse, RuntimeCoreError> {
        self.app_data_source.list_skill_repositories().await
    }

    pub async fn save_skill_repository(
        &self,
        params: SkillRepositorySaveParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.save_skill_repository(params).await
    }

    pub async fn delete_skill_repository(
        &self,
        params: SkillRepositoryDeleteParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.delete_skill_repository(params).await
    }

    pub async fn refresh_skill_cache(
        &self,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.refresh_skill_cache().await
    }

    pub async fn list_installed_skill_directories(
        &self,
    ) -> Result<SkillInstalledDirectoriesListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_installed_skill_directories()
            .await
    }

    pub async fn inspect_local_skill(
        &self,
        params: SkillLocalInspectParams,
    ) -> Result<SkillLocalInspectResponse, RuntimeCoreError> {
        self.app_data_source.inspect_local_skill(params).await
    }

    pub async fn inspect_local_skill_detail(
        &self,
        params: SkillLocalDetailInspectParams,
    ) -> Result<SkillLocalDetailInspectResponse, RuntimeCoreError> {
        self.app_data_source
            .inspect_local_skill_detail(params)
            .await
    }

    pub async fn create_skill_scaffold(
        &self,
        params: SkillScaffoldCreateParams,
    ) -> Result<SkillScaffoldCreateResponse, RuntimeCoreError> {
        self.app_data_source.create_skill_scaffold(params).await
    }

    pub async fn import_local_skill(
        &self,
        params: SkillLocalImportParams,
    ) -> Result<SkillLocalImportResponse, RuntimeCoreError> {
        self.app_data_source.import_local_skill(params).await
    }

    pub async fn rename_local_skill(
        &self,
        params: SkillLocalRenameParams,
    ) -> Result<SkillLocalRenameResponse, RuntimeCoreError> {
        self.app_data_source.rename_local_skill(params).await
    }

    pub async fn inspect_remote_skill(
        &self,
        params: SkillRemoteInspectParams,
    ) -> Result<SkillRemoteInspectResponse, RuntimeCoreError> {
        self.app_data_source.inspect_remote_skill(params).await
    }

    pub async fn inspect_local_skill_package(
        &self,
        params: SkillPackageLocalInspectParams,
    ) -> Result<SkillPackageLocalInspectResponse, RuntimeCoreError> {
        self.app_data_source
            .inspect_local_skill_package(params)
            .await
    }

    pub async fn install_local_skill_package(
        &self,
        params: SkillPackageLocalInstallParams,
    ) -> Result<SkillPackageLocalInstallResponse, RuntimeCoreError> {
        self.app_data_source
            .install_local_skill_package(params)
            .await
    }

    pub async fn replace_local_skill_package(
        &self,
        params: SkillPackageLocalReplaceParams,
    ) -> Result<SkillPackageLocalReplaceResponse, RuntimeCoreError> {
        self.app_data_source
            .replace_local_skill_package(params)
            .await
    }

    pub async fn export_local_skill_package(
        &self,
        params: SkillPackageExportParams,
    ) -> Result<SkillPackageExportResponse, RuntimeCoreError> {
        self.app_data_source
            .export_local_skill_package(params)
            .await
    }

    pub async fn install_marketplace_skill(
        &self,
        params: SkillMarketplaceInstallParams,
    ) -> Result<SkillMarketplaceInstallResponse, RuntimeCoreError> {
        self.app_data_source.install_marketplace_skill(params).await
    }

    pub async fn install_skill_from_download_url(
        &self,
        params: SkillDownloadInstallParams,
    ) -> Result<SkillDownloadInstallResponse, RuntimeCoreError> {
        self.app_data_source
            .install_skill_from_download_url(params)
            .await
    }

    pub async fn list_directory(
        &self,
        params: FileSystemListDirectoryParams,
    ) -> Result<FileSystemDirectoryListing, RuntimeCoreError> {
        let path = params.path.trim();
        if path.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "path is required for fileSystem/listDirectory".to_string(),
            ));
        }
        let path = path.to_string();
        let listing = tokio::task::spawn_blocking(move || {
            lime_services::file_browser_service::list_directory(&path)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("目录读取任务失败: {error}")))?;
        Ok(file_system_directory_listing_from_service(listing))
    }

    pub async fn read_file_preview(
        &self,
        params: FileSystemReadFilePreviewParams,
    ) -> Result<FileSystemFilePreview, RuntimeCoreError> {
        let path = params.path.trim();
        if path.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "path is required for fileSystem/readFilePreview".to_string(),
            ));
        }
        let path = path.to_string();
        let max_size = params.max_size;
        let preview = tokio::task::spawn_blocking(move || {
            lime_services::file_browser_service::read_file_preview(&path, max_size)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件预览任务失败: {error}")))?;
        Ok(file_system_file_preview_from_service(preview))
    }

    pub async fn create_file(
        &self,
        params: FileSystemCreateFileParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let path = file_system_required_path(params.path, "fileSystem/createFile")?;
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::create_file(path))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件创建任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }

    pub async fn create_directory(
        &self,
        params: FileSystemCreateDirectoryParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let path = file_system_required_path(params.path, "fileSystem/createDirectory")?;
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::create_directory(path))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("目录创建任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }

    pub async fn rename_file(
        &self,
        params: FileSystemRenameFileParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let old_path = file_system_required_path(params.old_path, "fileSystem/renameFile.oldPath")?;
        let new_path = file_system_required_path(params.new_path, "fileSystem/renameFile.newPath")?;
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::rename_file(
                old_path, new_path,
            ))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件重命名任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }

    pub async fn delete_file(
        &self,
        params: FileSystemDeleteFileParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let path = file_system_required_path(params.path, "fileSystem/deleteFile")?;
        let recursive = params.recursive.unwrap_or(false);
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::delete_file(
                path, recursive,
            ))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件删除任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }

    pub async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_workspace_skill_bindings(params)
            .await
    }

    pub async fn list_workspace_registered_skills(
        &self,
        params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_workspace_registered_skills(params)
            .await
    }

    pub async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        self.app_data_source.list_agent_app_installed().await
    }

    pub async fn inspect_agent_app_local_package(
        &self,
        params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        self.app_data_source
            .inspect_agent_app_local_package(params)
            .await
    }

    pub async fn fetch_agent_app_cloud_package(
        &self,
        params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        self.app_data_source
            .fetch_agent_app_cloud_package(params)
            .await
    }

    pub async fn save_agent_app_installed(
        &self,
        params: AgentAppInstalledSaveParams,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        self.app_data_source.save_agent_app_installed(params).await
    }

    pub async fn set_agent_app_installed_disabled(
        &self,
        params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        self.app_data_source
            .set_agent_app_installed_disabled(params)
            .await
    }

    pub async fn preview_agent_app_uninstall(
        &self,
        params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        self.app_data_source
            .preview_agent_app_uninstall(params)
            .await
    }

    pub async fn uninstall_agent_app(
        &self,
        params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        self.app_data_source.uninstall_agent_app(params).await
    }

    pub async fn prepare_agent_app_shell(
        &self,
        params: AgentAppShellPrepareParams,
    ) -> Result<AgentAppShellPrepareResponse, RuntimeCoreError> {
        let prepared_at = timestamp();
        let fields = match parse_agent_app_shell_descriptor(&params.descriptor) {
            Ok(fields) => fields,
            Err(blocker_codes) => {
                return Ok(build_agent_app_shell_prepare_response(
                    None,
                    "blocked",
                    blocker_codes,
                    Some("Agent App shell descriptor 未通过启动前校验。".to_string()),
                    None,
                    prepared_at,
                ));
            }
        };

        let installed_state = match self.find_agent_app_installed_state(&fields.app_id).await {
            Ok(state) => state,
            Err(error) => {
                return Ok(build_agent_app_shell_prepare_response(
                    Some(&fields),
                    "blocked",
                    vec!["INSTALLED_STATE_MISSING".to_string()],
                    Some(error.to_string()),
                    None,
                    prepared_at,
                ));
            }
        };

        let state_blockers =
            validate_agent_app_shell_against_installed_state(&fields, &installed_state);
        if !state_blockers.is_empty() {
            return Ok(build_agent_app_shell_prepare_response(
                Some(&fields),
                "blocked",
                state_blockers,
                Some("Agent App shell descriptor 与 installed state 不一致。".to_string()),
                None,
                prepared_at,
            ));
        }

        let app_dir = match resolve_agent_app_runtime_dir(&installed_state) {
            Ok(app_dir) => app_dir,
            Err(error) => {
                return Ok(build_agent_app_shell_prepare_response(
                    Some(&fields),
                    "blocked",
                    vec!["PACKAGE_MOUNT_UNAVAILABLE".to_string()],
                    Some(error.to_string()),
                    None,
                    prepared_at,
                ));
            }
        };

        let package_mount = AgentAppShellPackageMount {
            kind: "local_dir".to_string(),
            path: app_dir.to_string_lossy().to_string(),
            read_only: true,
            package_hash: fields.package_hash.clone(),
            manifest_hash: fields.manifest_hash.clone(),
        };

        Ok(build_agent_app_shell_prepare_response(
            Some(&fields),
            "ready",
            Vec::new(),
            Some("Agent App shell 已通过 App Server current 启动前校验。".to_string()),
            Some(package_mount),
            prepared_at,
        ))
    }

    pub async fn start_agent_app_ui_runtime(
        &self,
        params: AgentAppUiRuntimeStartParams,
    ) -> Result<AgentAppUiRuntimeStatusResponse, RuntimeCoreError> {
        validate_agent_app_id(&params.app_id)?;
        let state = self.find_agent_app_installed_state(&params.app_id).await?;
        let entry = resolve_agent_app_ui_entry(&state, params.entry_key.as_deref())?;
        if let Some(status) = self
            .running_agent_app_ui_runtime(&params.app_id, Some(&entry))
            .await?
        {
            return Ok(status);
        }

        let app_dir = resolve_agent_app_runtime_dir(&state)?;
        ensure_agent_app_runtime_folder(&app_dir)?;
        let port = reserve_local_port()?;
        let base_url = format!("http://127.0.0.1:{port}");
        let mut child = spawn_agent_app_ui_process(&app_dir, port)?;
        wait_for_agent_app_ui_runtime_ready(&mut child, &base_url).await?;
        let pid = child.id();
        let process = AgentAppUiRuntimeProcess {
            child,
            app_dir,
            port,
            base_url: base_url.clone(),
            entry_key: entry.entry_key.clone(),
            route: entry.route.clone(),
            started_at: timestamp(),
        };
        self.state
            .lock()
            .expect("runtime core state mutex poisoned")
            .agent_app_ui_runtimes
            .insert(params.app_id.clone(), process);

        Ok(AgentAppUiRuntimeStatusResponse {
            app_id: params.app_id,
            status: "running".to_string(),
            base_url: Some(base_url.clone()),
            entry_url: Some(join_agent_app_runtime_url(&base_url, &entry.route)),
            port: Some(port),
            pid,
            message: None,
            entry_key: Some(entry.entry_key),
            route: Some(entry.route),
        })
    }

    pub async fn agent_app_ui_runtime_status(
        &self,
        params: AgentAppUiRuntimeStatusParams,
    ) -> Result<AgentAppUiRuntimeStatusResponse, RuntimeCoreError> {
        validate_agent_app_id(&params.app_id)?;
        if let Some(status) = self
            .running_agent_app_ui_runtime(&params.app_id, None)
            .await?
        {
            return Ok(status);
        }
        Ok(stopped_agent_app_ui_runtime_status(
            params.app_id,
            "Agent App UI runtime 未启动。",
        ))
    }

    pub async fn stop_agent_app_ui_runtime(
        &self,
        params: AgentAppUiRuntimeStopParams,
    ) -> Result<AgentAppUiRuntimeStatusResponse, RuntimeCoreError> {
        validate_agent_app_id(&params.app_id)?;
        let process = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned")
            .agent_app_ui_runtimes
            .remove(&params.app_id);
        let Some(mut process) = process else {
            return Ok(stopped_agent_app_ui_runtime_status(
                params.app_id,
                "Agent App UI runtime 未启动。",
            ));
        };
        let pid = process.child.id();
        terminate_agent_app_ui_process(&mut process.child).await;

        Ok(AgentAppUiRuntimeStatusResponse {
            app_id: params.app_id,
            status: "stopped".to_string(),
            base_url: Some(process.base_url),
            entry_url: None,
            port: Some(process.port),
            pid,
            message: Some("Agent App UI runtime 已停止。".to_string()),
            entry_key: Some(process.entry_key),
            route: Some(process.route),
        })
    }

    pub async fn start_gateway_channel(
        &self,
        params: GatewayChannelStartParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        self.app_data_source.start_gateway_channel(params).await
    }

    pub async fn stop_gateway_channel(
        &self,
        params: GatewayChannelStopParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        self.app_data_source.stop_gateway_channel(params).await
    }

    pub async fn read_gateway_channel_status(
        &self,
        params: GatewayChannelStatusParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        self.app_data_source
            .read_gateway_channel_status(params)
            .await
    }

    pub async fn probe_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_gateway_tunnel().await
    }

    pub async fn detect_gateway_tunnel_cloudflared(
        &self,
    ) -> Result<GatewayTunnelCloudflaredDetectResponse, RuntimeCoreError> {
        self.app_data_source
            .detect_gateway_tunnel_cloudflared()
            .await
    }

    pub async fn install_gateway_tunnel_cloudflared(
        &self,
        params: GatewayTunnelCloudflaredInstallParams,
    ) -> Result<GatewayTunnelCloudflaredInstallResponse, RuntimeCoreError> {
        self.app_data_source
            .install_gateway_tunnel_cloudflared(params)
            .await
    }

    pub async fn create_gateway_tunnel(
        &self,
        params: GatewayTunnelCreateParams,
    ) -> Result<GatewayTunnelCreateResponse, RuntimeCoreError> {
        self.app_data_source.create_gateway_tunnel(params).await
    }

    pub async fn start_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.start_gateway_tunnel().await
    }

    pub async fn stop_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.stop_gateway_tunnel().await
    }

    pub async fn restart_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.restart_gateway_tunnel().await
    }

    pub async fn read_gateway_tunnel_status(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.read_gateway_tunnel_status().await
    }

    pub async fn sync_gateway_tunnel_webhook_url(
        &self,
        params: GatewayTunnelSyncWebhookUrlParams,
    ) -> Result<GatewayTunnelSyncWebhookUrlResponse, RuntimeCoreError> {
        self.app_data_source
            .sync_gateway_tunnel_webhook_url(params)
            .await
    }

    pub async fn probe_telegram_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_telegram_channel(params).await
    }

    pub async fn probe_feishu_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_feishu_channel(params).await
    }

    pub async fn probe_discord_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_discord_channel(params).await
    }

    pub async fn probe_wechat_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_wechat_channel(params).await
    }

    pub async fn start_wechat_channel_login(
        &self,
        params: WechatLoginStartParams,
    ) -> Result<WechatLoginStartResponse, RuntimeCoreError> {
        self.app_data_source
            .start_wechat_channel_login(params)
            .await
    }

    pub async fn wait_wechat_channel_login(
        &self,
        params: WechatLoginWaitParams,
    ) -> Result<WechatLoginWaitResponse, RuntimeCoreError> {
        self.app_data_source.wait_wechat_channel_login(params).await
    }

    pub async fn list_wechat_channel_accounts(
        &self,
    ) -> Result<WechatChannelAccountListResponse, RuntimeCoreError> {
        self.app_data_source.list_wechat_channel_accounts().await
    }

    pub async fn remove_wechat_channel_account(
        &self,
        params: WechatChannelAccountRemoveParams,
    ) -> Result<WechatChannelAccountRemoveResponse, RuntimeCoreError> {
        self.app_data_source
            .remove_wechat_channel_account(params)
            .await
    }

    pub async fn set_wechat_channel_runtime_model(
        &self,
        params: WechatRuntimeModelSetParams,
    ) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
        self.app_data_source
            .set_wechat_channel_runtime_model(params)
            .await
    }

    pub async fn create_image_media_task_artifact(
        &self,
        params: MediaTaskArtifactImageCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        self.app_data_source
            .create_image_media_task_artifact(params)
            .await
    }

    pub async fn create_audio_media_task_artifact(
        &self,
        params: MediaTaskArtifactAudioCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        self.app_data_source
            .create_audio_media_task_artifact(params)
            .await
    }

    pub async fn create_video_media_task_artifact(
        &self,
        params: MediaTaskArtifactVideoCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        self.app_data_source
            .create_video_media_task_artifact(params)
            .await
    }

    pub async fn complete_audio_media_task_artifact(
        &self,
        params: MediaTaskArtifactAudioCompleteParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        self.app_data_source
            .complete_audio_media_task_artifact(params)
            .await
    }

    pub async fn get_media_task_artifact(
        &self,
        params: MediaTaskArtifactLookupParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        self.app_data_source.get_media_task_artifact(params).await
    }

    pub async fn list_media_task_artifacts(
        &self,
        params: MediaTaskArtifactListParams,
    ) -> Result<MediaTaskArtifactListResponse, RuntimeCoreError> {
        self.app_data_source.list_media_task_artifacts(params).await
    }

    pub async fn cancel_media_task_artifact(
        &self,
        params: MediaTaskArtifactLookupParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        self.app_data_source
            .cancel_media_task_artifact(params)
            .await
    }

    pub async fn get_gallery_material(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialResponse, RuntimeCoreError> {
        self.app_data_source.get_gallery_material(params).await
    }

    pub async fn create_gallery_material_metadata(
        &self,
        params: GalleryMaterialMetadataCreateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        self.app_data_source
            .create_gallery_material_metadata(params)
            .await
    }

    pub async fn get_gallery_material_metadata(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        self.app_data_source
            .get_gallery_material_metadata(params)
            .await
    }

    pub async fn update_gallery_material_metadata(
        &self,
        params: GalleryMaterialMetadataUpdateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        self.app_data_source
            .update_gallery_material_metadata(params)
            .await
    }

    pub async fn delete_gallery_material_metadata(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialDeleteResponse, RuntimeCoreError> {
        self.app_data_source
            .delete_gallery_material_metadata(params)
            .await
    }

    pub async fn list_gallery_materials_by_image_category(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_gallery_materials_by_image_category(params)
            .await
    }

    pub async fn list_gallery_materials_by_layout_category(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_gallery_materials_by_layout_category(params)
            .await
    }

    pub async fn list_gallery_materials_by_mood(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_gallery_materials_by_mood(params)
            .await
    }

    pub async fn list_project_materials(
        &self,
        params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialListResponse, RuntimeCoreError> {
        self.app_data_source.list_project_materials(params).await
    }

    pub async fn get_project_material(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        self.app_data_source.get_project_material(params).await
    }

    pub async fn count_project_materials(
        &self,
        params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialCountResponse, RuntimeCoreError> {
        self.app_data_source.count_project_materials(params).await
    }

    pub async fn upload_project_material(
        &self,
        params: ProjectMaterialUploadParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        self.app_data_source.upload_project_material(params).await
    }

    pub async fn import_project_material_from_url(
        &self,
        params: ProjectMaterialImportFromUrlParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        self.app_data_source
            .import_project_material_from_url(params)
            .await
    }

    pub async fn update_project_material(
        &self,
        params: ProjectMaterialUpdateParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        self.app_data_source.update_project_material(params).await
    }

    pub async fn delete_project_material(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_project_material(params).await
    }

    pub async fn read_project_material_content(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialContentResponse, RuntimeCoreError> {
        self.app_data_source
            .read_project_material_content(params)
            .await
    }

    pub async fn list_voice_asr_credentials(
        &self,
    ) -> Result<VoiceAsrCredentialListResponse, RuntimeCoreError> {
        self.app_data_source.list_voice_asr_credentials().await
    }

    pub async fn create_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialCreateParams,
    ) -> Result<VoiceAsrCredentialWriteResponse, RuntimeCoreError> {
        self.app_data_source
            .create_voice_asr_credential(params)
            .await
    }

    pub async fn update_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialUpdateParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        self.app_data_source
            .update_voice_asr_credential(params)
            .await
    }

    pub async fn delete_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        self.app_data_source
            .delete_voice_asr_credential(params)
            .await
    }

    pub async fn set_default_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        self.app_data_source
            .set_default_voice_asr_credential(params)
            .await
    }

    pub async fn test_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialTestResponse, RuntimeCoreError> {
        self.app_data_source.test_voice_asr_credential(params).await
    }

    pub async fn test_transcribe_voice_model_file(
        &self,
        params: VoiceModelTestTranscribeFileParams,
    ) -> Result<VoiceModelTestTranscribeFileResponse, RuntimeCoreError> {
        self.app_data_source
            .test_transcribe_voice_model_file(params)
            .await
    }

    pub async fn list_voice_instructions(
        &self,
    ) -> Result<VoiceInstructionListResponse, RuntimeCoreError> {
        self.app_data_source.list_voice_instructions().await
    }

    pub async fn save_voice_instruction(
        &self,
        params: VoiceInstructionSaveParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        self.app_data_source.save_voice_instruction(params).await
    }

    pub async fn delete_voice_instruction(
        &self,
        params: VoiceInstructionIdParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        self.app_data_source.delete_voice_instruction(params).await
    }

    pub async fn set_default_voice_model(
        &self,
        params: VoiceModelDefaultSetParams,
    ) -> Result<VoiceModelDefaultSetResponse, RuntimeCoreError> {
        self.app_data_source.set_default_voice_model(params).await
    }

    pub async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        self.app_data_source.list_knowledge_packs(params).await
    }

    pub async fn read_knowledge_pack(
        &self,
        params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
        self.app_data_source.read_knowledge_pack(params).await
    }

    pub async fn import_knowledge_source(
        &self,
        params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
        self.app_data_source.import_knowledge_source(params).await
    }

    pub async fn compile_knowledge_pack(
        &self,
        params: KnowledgeCompilePackParams,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
        let mut request = Self::to_lime_knowledge_compile_pack_request(params)?;
        if let Some(plan) = lime_knowledge::plan_knowledge_builder_runtime(&request)
            .map_err(RuntimeCoreError::Backend)?
        {
            request.builder_execution = Some(
                self.knowledge_builder_runtime_executor
                    .execute(plan)
                    .await?,
            );
        }
        self.app_data_source.compile_knowledge_pack(request).await
    }

    fn to_lime_knowledge_compile_pack_request(
        params: KnowledgeCompilePackParams,
    ) -> Result<lime_knowledge::KnowledgeCompilePackRequest, RuntimeCoreError> {
        Ok(lime_knowledge::KnowledgeCompilePackRequest {
            working_dir: params.working_dir,
            name: params.name,
            builder_runtime: params
                .builder_runtime
                .map(serde_json::from_value)
                .transpose()
                .map_err(|error| {
                    RuntimeCoreError::Backend(format!(
                        "knowledgePack/compile builderRuntime 参数无效: {error}"
                    ))
                })?,
            builder_execution: None,
        })
    }

    pub async fn set_default_knowledge_pack(
        &self,
        params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
        self.app_data_source
            .set_default_knowledge_pack(params)
            .await
    }

    pub async fn update_knowledge_pack_status(
        &self,
        params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
        self.app_data_source
            .update_knowledge_pack_status(params)
            .await
    }

    pub async fn resolve_knowledge_context(
        &self,
        params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
        self.app_data_source.resolve_knowledge_context(params).await
    }

    pub async fn validate_knowledge_context_run(
        &self,
        params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
        self.app_data_source
            .validate_knowledge_context_run(params)
            .await
    }

    pub async fn list_automation_jobs(
        &self,
    ) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        self.app_data_source.list_automation_jobs().await
    }

    pub async fn list_mcp_servers(&self) -> Result<McpServerListResponse, RuntimeCoreError> {
        self.app_data_source.list_mcp_servers().await
    }

    pub async fn list_mcp_servers_with_status(
        &self,
    ) -> Result<McpServerStatusListResponse, RuntimeCoreError> {
        self.app_data_source.list_mcp_servers_with_status().await
    }

    pub async fn create_mcp_server(
        &self,
        params: McpServerCreateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        self.app_data_source.create_mcp_server(params).await
    }

    pub async fn update_mcp_server(
        &self,
        params: McpServerUpdateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        self.app_data_source.update_mcp_server(params).await
    }

    pub async fn delete_mcp_server(
        &self,
        params: McpServerDeleteParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        self.app_data_source.delete_mcp_server(params).await
    }

    pub async fn set_mcp_server_enabled(
        &self,
        params: McpServerEnabledSetParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        self.app_data_source.set_mcp_server_enabled(params).await
    }

    pub async fn import_mcp_servers_from_app(
        &self,
        params: McpServerImportFromAppParams,
    ) -> Result<McpServerImportFromAppResponse, RuntimeCoreError> {
        self.app_data_source
            .import_mcp_servers_from_app(params)
            .await
    }

    pub async fn sync_all_mcp_servers_to_live(
        &self,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        self.app_data_source.sync_all_mcp_servers_to_live().await
    }

    pub async fn start_mcp_server(
        &self,
        params: McpServerStartParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        self.app_data_source.start_mcp_server(params).await
    }

    pub async fn stop_mcp_server(
        &self,
        params: McpServerStopParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        self.app_data_source.stop_mcp_server(params).await
    }

    pub async fn list_mcp_tools(&self) -> Result<McpToolListResponse, RuntimeCoreError> {
        self.app_data_source.list_mcp_tools().await
    }

    pub async fn list_mcp_tools_for_context(
        &self,
        params: McpToolListForContextParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_mcp_tools_for_context(params)
            .await
    }

    pub async fn search_mcp_tools(
        &self,
        params: McpToolSearchParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        self.app_data_source.search_mcp_tools(params).await
    }

    pub async fn call_mcp_tool(
        &self,
        params: McpToolCallParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        self.app_data_source.call_mcp_tool(params).await
    }

    pub async fn call_mcp_tool_with_caller(
        &self,
        params: McpToolCallWithCallerParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        self.app_data_source.call_mcp_tool_with_caller(params).await
    }

    pub async fn list_mcp_prompts(&self) -> Result<McpPromptListResponse, RuntimeCoreError> {
        self.app_data_source.list_mcp_prompts().await
    }

    pub async fn get_mcp_prompt(
        &self,
        params: McpPromptGetParams,
    ) -> Result<McpPromptGetResponse, RuntimeCoreError> {
        self.app_data_source.get_mcp_prompt(params).await
    }

    pub async fn list_mcp_resources(&self) -> Result<McpResourceListResponse, RuntimeCoreError> {
        self.app_data_source.list_mcp_resources().await
    }

    pub async fn read_mcp_resource(
        &self,
        params: McpResourceReadParams,
    ) -> Result<McpResourceReadResponse, RuntimeCoreError> {
        self.app_data_source.read_mcp_resource(params).await
    }

    pub async fn read_automation_scheduler_config(
        &self,
    ) -> Result<AutomationSchedulerConfigReadResponse, RuntimeCoreError> {
        self.app_data_source
            .read_automation_scheduler_config()
            .await
    }

    pub async fn update_automation_scheduler_config(
        &self,
        params: AutomationSchedulerConfigUpdateParams,
    ) -> Result<AutomationSchedulerConfigUpdateResponse, RuntimeCoreError> {
        self.app_data_source
            .update_automation_scheduler_config(params)
            .await
    }

    pub async fn read_automation_scheduler_status(
        &self,
    ) -> Result<AutomationSchedulerStatusResponse, RuntimeCoreError> {
        self.app_data_source
            .read_automation_scheduler_status()
            .await
    }

    pub async fn read_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobReadResponse, RuntimeCoreError> {
        self.app_data_source.read_automation_job(params).await
    }

    pub async fn create_automation_job(
        &self,
        params: AutomationJobCreateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        self.app_data_source.create_automation_job(params).await
    }

    pub async fn update_automation_job(
        &self,
        params: AutomationJobUpdateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        self.app_data_source.update_automation_job(params).await
    }

    pub async fn delete_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_automation_job(params).await
    }

    pub async fn run_automation_job_now(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobRunNowResponse, RuntimeCoreError> {
        self.app_data_source.run_automation_job_now(params).await
    }

    pub async fn read_automation_health(
        &self,
        params: AutomationJobHealthParams,
    ) -> Result<AutomationJobHealthResponse, RuntimeCoreError> {
        self.app_data_source.read_automation_health(params).await
    }

    pub async fn read_automation_run_history(
        &self,
        params: AutomationJobRunHistoryParams,
    ) -> Result<AutomationJobRunHistoryResponse, RuntimeCoreError> {
        self.app_data_source
            .read_automation_run_history(params)
            .await
    }

    pub async fn preview_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationSchedulePreviewResponse, RuntimeCoreError> {
        self.app_data_source
            .preview_automation_schedule(params)
            .await
    }

    pub async fn validate_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationScheduleValidateResponse, RuntimeCoreError> {
        self.app_data_source
            .validate_automation_schedule(params)
            .await
    }

    pub async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        self.app_data_source.read_project_memory(params).await
    }

    pub async fn list_unified_memories(
        &self,
        params: UnifiedMemoryListParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source.list_unified_memories(params).await
    }

    pub async fn get_unified_memory(
        &self,
        params: UnifiedMemoryGetParams,
    ) -> Result<UnifiedMemoryGetResponse, RuntimeCoreError> {
        self.app_data_source.get_unified_memory(params).await
    }

    pub async fn create_unified_memory(
        &self,
        params: UnifiedMemoryCreateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        self.app_data_source.create_unified_memory(params).await
    }

    pub async fn update_unified_memory(
        &self,
        params: UnifiedMemoryUpdateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        self.app_data_source.update_unified_memory(params).await
    }

    pub async fn delete_unified_memory(
        &self,
        params: UnifiedMemoryDeleteParams,
    ) -> Result<UnifiedMemoryDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_unified_memory(params).await
    }

    pub async fn search_unified_memories(
        &self,
        params: UnifiedMemorySearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source.search_unified_memories(params).await
    }

    pub async fn read_unified_memory_stats(
        &self,
    ) -> Result<UnifiedMemoryStatsResponse, RuntimeCoreError> {
        self.app_data_source.read_unified_memory_stats().await
    }

    pub async fn analyze_unified_memories(
        &self,
        params: UnifiedMemoryAnalyzeParams,
    ) -> Result<UnifiedMemoryAnalysisResponse, RuntimeCoreError> {
        self.app_data_source.analyze_unified_memories(params).await
    }

    pub async fn semantic_search_unified_memories(
        &self,
        params: UnifiedMemorySemanticSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source
            .semantic_search_unified_memories(params)
            .await
    }

    pub async fn hybrid_search_unified_memories(
        &self,
        params: UnifiedMemoryHybridSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source
            .hybrid_search_unified_memories(params)
            .await
    }

    pub async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
        self.app_data_source.list_logs().await
    }

    pub async fn read_persisted_log_tail(
        &self,
        params: LogPersistedTailParams,
    ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
        self.app_data_source.read_persisted_log_tail(params).await
    }

    pub async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        self.app_data_source.clear_logs().await
    }

    pub async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        self.app_data_source.clear_diagnostic_log_history().await
    }

    pub async fn read_log_storage_diagnostics(
        &self,
    ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
        self.app_data_source.read_log_storage_diagnostics().await
    }

    pub async fn export_support_bundle(
        &self,
    ) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
        self.app_data_source.export_support_bundle().await
    }

    pub async fn read_server_diagnostics(
        &self,
    ) -> Result<ServerDiagnosticsResponse, RuntimeCoreError> {
        Ok(ServerDiagnosticsResponse {
            generated_at: timestamp(),
            running: true,
            host: "127.0.0.1".to_string(),
            port: 0,
            telemetry_summary: DiagnosticsTelemetrySummary::default(),
            capability_routing: DiagnosticsCapabilityRoutingMetricsSnapshot::default(),
            response_cache: DiagnosticsResponseCacheDiagnostics {
                config: DiagnosticsMetricConfig {
                    enabled: false,
                    ttl_secs: 0,
                    max_entries: Some(0),
                    max_body_bytes: Some(0),
                    cacheable_status_codes: Vec::new(),
                    wait_timeout_ms: None,
                    header_name: None,
                },
                stats: json!({
                    "size": 0,
                    "hits": 0,
                    "misses": 0,
                    "evictions": 0,
                }),
                hit_rate_percent: 0.0,
            },
            request_dedup: DiagnosticsRequestDedupDiagnostics {
                config: DiagnosticsMetricConfig {
                    enabled: false,
                    ttl_secs: 0,
                    max_entries: None,
                    max_body_bytes: None,
                    cacheable_status_codes: Vec::new(),
                    wait_timeout_ms: Some(0),
                    header_name: None,
                },
                stats: json!({
                    "inflight_size": 0,
                    "completed_size": 0,
                    "check_new_total": 0,
                    "check_in_progress_total": 0,
                    "check_completed_total": 0,
                    "wait_success_total": 0,
                    "wait_timeout_total": 0,
                    "wait_no_result_total": 0,
                    "complete_total": 0,
                    "remove_total": 0,
                }),
                replay_rate_percent: 0.0,
            },
            idempotency: DiagnosticsIdempotencyDiagnostics {
                config: DiagnosticsMetricConfig {
                    enabled: false,
                    ttl_secs: 0,
                    max_entries: None,
                    max_body_bytes: None,
                    cacheable_status_codes: Vec::new(),
                    wait_timeout_ms: None,
                    header_name: Some("idempotency-key".to_string()),
                },
                stats: json!({
                    "entries_size": 0,
                    "in_progress_size": 0,
                    "completed_size": 0,
                    "check_new_total": 0,
                    "check_in_progress_total": 0,
                    "check_completed_total": 0,
                    "complete_total": 0,
                    "remove_total": 0,
                }),
                replay_rate_percent: 0.0,
            },
        })
    }

    pub async fn read_windows_startup_diagnostics(
        &self,
    ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
        self.app_data_source
            .read_windows_startup_diagnostics()
            .await
    }

    pub async fn read_usage_stats(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
        self.app_data_source.read_usage_stats(params).await
    }

    pub async fn list_usage_stats_model_ranking(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_usage_stats_model_ranking(params)
            .await
    }

    pub async fn list_usage_stats_daily_trends(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_usage_stats_daily_trends(params)
            .await
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

    pub async fn read_model_provider(
        &self,
        params: ModelProviderReadParams,
    ) -> Result<ModelProviderReadResponse, RuntimeCoreError> {
        self.app_data_source.read_model_provider(params).await
    }

    pub async fn create_model_provider(
        &self,
        params: ModelProviderCreateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        self.app_data_source.create_model_provider(params).await
    }

    pub async fn update_model_provider(
        &self,
        params: ModelProviderUpdateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        self.app_data_source.update_model_provider(params).await
    }

    pub async fn delete_model_provider(
        &self,
        params: ModelProviderDeleteParams,
    ) -> Result<ModelProviderDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_model_provider(params).await
    }

    pub async fn update_model_provider_sort_orders(
        &self,
        params: ModelProviderSortOrdersUpdateParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        self.app_data_source
            .update_model_provider_sort_orders(params)
            .await
    }

    pub async fn export_model_provider_config(
        &self,
        params: ModelProviderConfigExportParams,
    ) -> Result<ModelProviderConfigExportResponse, RuntimeCoreError> {
        self.app_data_source
            .export_model_provider_config(params)
            .await
    }

    pub async fn import_model_provider_config(
        &self,
        params: ModelProviderConfigImportParams,
    ) -> Result<ModelProviderConfigImportResponse, RuntimeCoreError> {
        self.app_data_source
            .import_model_provider_config(params)
            .await
    }

    pub async fn test_model_provider_connection(
        &self,
        params: ModelProviderTestConnectionParams,
    ) -> Result<ModelProviderTestConnectionResponse, RuntimeCoreError> {
        self.app_data_source
            .test_model_provider_connection(params)
            .await
    }

    pub async fn test_model_provider_chat(
        &self,
        params: ModelProviderTestChatParams,
    ) -> Result<ModelProviderTestChatResponse, RuntimeCoreError> {
        self.app_data_source.test_model_provider_chat(params).await
    }

    pub async fn fetch_model_provider_models(
        &self,
        params: ModelProviderFetchModelsParams,
    ) -> Result<ModelProviderFetchModelsResponse, RuntimeCoreError> {
        self.app_data_source
            .fetch_model_provider_models(params)
            .await
    }

    pub async fn create_model_provider_key(
        &self,
        params: ModelProviderKeyCreateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        self.app_data_source.create_model_provider_key(params).await
    }

    pub async fn update_model_provider_key(
        &self,
        params: ModelProviderKeyUpdateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        self.app_data_source.update_model_provider_key(params).await
    }

    pub async fn delete_model_provider_key(
        &self,
        params: ModelProviderKeyDeleteParams,
    ) -> Result<ModelProviderKeyDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_model_provider_key(params).await
    }

    pub async fn read_next_model_provider_key(
        &self,
        params: ModelProviderKeyNextParams,
    ) -> Result<ModelProviderKeyNextResponse, RuntimeCoreError> {
        self.app_data_source
            .read_next_model_provider_key(params)
            .await
    }

    pub async fn record_model_provider_key_usage(
        &self,
        params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        self.app_data_source
            .record_model_provider_key_usage(params)
            .await
    }

    pub async fn record_model_provider_key_error(
        &self,
        params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        self.app_data_source
            .record_model_provider_key_error(params)
            .await
    }

    pub async fn read_model_provider_ui_state(
        &self,
        params: ModelProviderUiStateReadParams,
    ) -> Result<ModelProviderUiStateReadResponse, RuntimeCoreError> {
        self.app_data_source
            .read_model_provider_ui_state(params)
            .await
    }

    pub async fn write_model_provider_ui_state(
        &self,
        params: ModelProviderUiStateWriteParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        self.app_data_source
            .write_model_provider_ui_state(params)
            .await
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

    pub async fn resolve_connect_deep_link(
        &self,
        params: ConnectDeepLinkResolveParams,
    ) -> Result<ConnectDeepLinkResolveResponse, RuntimeCoreError> {
        self.app_data_source.resolve_connect_deep_link(params).await
    }

    pub async fn resolve_connect_open_deep_link(
        &self,
        params: ConnectOpenDeepLinkResolveParams,
    ) -> Result<ConnectOpenDeepLinkResolveResponse, RuntimeCoreError> {
        self.app_data_source
            .resolve_connect_open_deep_link(params)
            .await
    }

    pub async fn save_connect_relay_api_key(
        &self,
        params: ConnectRelayApiKeySaveParams,
    ) -> Result<ConnectRelayApiKeySaveResponse, RuntimeCoreError> {
        self.app_data_source
            .save_connect_relay_api_key(params)
            .await
    }

    pub async fn deliver_connect_callback(
        &self,
        params: ConnectCallbackSendParams,
    ) -> Result<ConnectCallbackSendResponse, RuntimeCoreError> {
        self.app_data_source.deliver_connect_callback(params).await
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
            let evidence_pack = self
                .evidence_export_provider
                .export_evidence_pack(&EvidencePackRequest {
                    session: session.clone(),
                    turns: turns.clone(),
                    events: events.clone(),
                    artifacts: artifacts.clone(),
                })
                .await?;
            self.with_current_objective_completion_audit_summary(
                evidence_pack,
                &session,
                &turns,
                &events,
                &artifacts,
            )
            .await
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

    async fn with_current_objective_completion_audit_summary(
        &self,
        evidence_pack: Option<EvidencePackSummary>,
        session: &AgentSession,
        turns: &[AgentTurn],
        events: &[AgentEvent],
        artifacts: &[ArtifactSummary],
    ) -> Option<EvidencePackSummary> {
        let Some(objective) = self
            .app_data_source
            .read_managed_objective_by_owner(
                crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                session.session_id.clone(),
            )
            .await
            .ok()
            .flatten()
        else {
            return evidence_pack;
        };
        let Some(completion_audit_summary) = current_objective_completion_audit_summary(&objective)
        else {
            return evidence_pack;
        };
        let mut pack = evidence_pack.unwrap_or_else(|| {
            build_runtime_evidence_pack_summary(
                session,
                turns,
                events,
                artifacts,
                "current_objective_projection",
            )
        });
        pack.completion_audit_summary = Some(completion_audit_summary);
        Some(pack)
    }

    pub async fn export_handoff_bundle(
        &self,
        params: AgentSessionHandoffBundleExportParams,
    ) -> Result<AgentSessionHandoffBundleExportResponse, RuntimeCoreError> {
        let session_id = params.session_id.trim().to_string();
        if session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/handoffBundle/export".to_string(),
            ));
        }
        validate_handoff_session_id(&session_id)?;

        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = resolve_handoff_workspace_root(&read)?;
        let workspace_root = workspace_root
            .canonicalize()
            .map_err(|error| RuntimeCoreError::Backend(format!(
                "workspaceRoot must be an existing directory for agentSession/handoffBundle/export: {} ({error})",
                workspace_root.display()
            )))?;
        if !workspace_root.is_dir() {
            return Err(RuntimeCoreError::Backend(format!(
                "workspaceRoot must be a directory for agentSession/handoffBundle/export: {}",
                workspace_root.display()
            )));
        }

        let copy = handoff_copy(params.locale.as_deref());
        let exported_at = timestamp();
        let bundle_relative_root = format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}");
        let bundle_absolute_root = workspace_root
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join(&session_id);
        fs::create_dir_all(&bundle_absolute_root).map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "failed to create handoff bundle directory {}: {error}",
                bundle_absolute_root.display()
            ))
        })?;

        let metrics = handoff_metrics(&read);
        let recent_artifacts = handoff_recent_artifacts(&read);
        let artifacts = vec![
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_PLAN_FILE_NAME,
                "plan",
                copy.plan_title,
                build_handoff_plan_markdown(&read, &metrics, &recent_artifacts, &exported_at, copy),
            )?,
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_PROGRESS_FILE_NAME,
                "progress",
                copy.progress_title,
                build_handoff_progress_json(
                    &read,
                    &metrics,
                    &recent_artifacts,
                    &workspace_root,
                    &exported_at,
                )?,
            )?,
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_FILE_NAME,
                "handoff",
                copy.handoff_title,
                build_handoff_markdown(&read, &metrics, &recent_artifacts, &exported_at, copy),
            )?,
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_REVIEW_SUMMARY_FILE_NAME,
                "review_summary",
                copy.review_summary_title,
                build_handoff_review_summary_markdown(
                    &read,
                    &metrics,
                    &recent_artifacts,
                    &exported_at,
                    copy,
                ),
            )?,
        ];

        Ok(AgentSessionHandoffBundleExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            bundle_relative_root,
            bundle_absolute_root: bundle_absolute_root.to_string_lossy().to_string(),
            exported_at,
            thread_status: agent_session_status_label(read.session.status).to_string(),
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            active_subagent_count: metrics.active_subagent_count,
            todo_total: metrics.todo_total,
            todo_pending: metrics.todo_pending,
            todo_in_progress: metrics.todo_in_progress,
            todo_completed: metrics.todo_completed,
            artifacts,
        })
    }

    pub async fn export_replay_case(
        &self,
        params: AgentSessionReplayCaseExportParams,
    ) -> Result<AgentSessionReplayCaseExportResponse, RuntimeCoreError> {
        const METHOD: &str = "agentSession/replayCase/export";
        let session_id = required_runtime_export_session_id(&params.session_id, METHOD)?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = canonical_runtime_export_workspace_root(&read, METHOD)?;
        let exported_at = timestamp();
        let metrics = handoff_metrics(&read);
        let recent_artifacts = handoff_recent_artifacts(&read);
        let (handoff_relative_root, evidence_relative_root, _) =
            runtime_export_base_roots(&session_id);
        let (replay_relative_root, replay_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "replay");
        ensure_runtime_export_root(&replay_absolute_root)?;

        let artifacts = vec![
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_INPUT_FILE_NAME,
                "input",
                "Replay input",
                build_replay_input_json(&read, &metrics, &recent_artifacts, &exported_at)?,
            )?,
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_EXPECTED_FILE_NAME,
                "expected",
                "Replay expected result",
                build_replay_expected_json(&read, &metrics, &exported_at)?,
            )?,
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_GRADER_FILE_NAME,
                "grader",
                "Replay grader",
                build_replay_grader_markdown(&read, &metrics, &exported_at),
            )?,
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_EVIDENCE_LINKS_FILE_NAME,
                "evidence_links",
                "Replay evidence links",
                build_replay_evidence_links_json(
                    &session_id,
                    &handoff_relative_root,
                    &evidence_relative_root,
                    &recent_artifacts,
                    &exported_at,
                )?,
            )?,
        ];

        Ok(AgentSessionReplayCaseExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            replay_relative_root,
            replay_absolute_root: replay_absolute_root.to_string_lossy().to_string(),
            handoff_bundle_relative_root: handoff_relative_root,
            evidence_pack_relative_root: evidence_relative_root,
            exported_at,
            thread_status: agent_session_status_label(read.session.status).to_string(),
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            linked_handoff_artifact_count: 0,
            linked_evidence_artifact_count: recent_artifacts.len(),
            recent_artifact_count: recent_artifacts.len(),
            artifacts,
        })
    }

    pub async fn export_analysis_handoff(
        &self,
        params: AgentSessionAnalysisHandoffExportParams,
    ) -> Result<AgentSessionAnalysisHandoffExportResponse, RuntimeCoreError> {
        const METHOD: &str = "agentSession/analysisHandoff/export";
        let session_id = required_runtime_export_session_id(&params.session_id, METHOD)?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = canonical_runtime_export_workspace_root(&read, METHOD)?;
        let exported_at = timestamp();
        let metrics = handoff_metrics(&read);
        let recent_artifacts = handoff_recent_artifacts(&read);
        let (handoff_relative_root, evidence_relative_root, replay_relative_root) =
            runtime_export_base_roots(&session_id);
        let (analysis_relative_root, analysis_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "analysis");
        ensure_runtime_export_root(&analysis_absolute_root)?;

        let title = "External Analysis Handoff".to_string();
        let copy_prompt =
            build_analysis_copy_prompt(&read, &analysis_relative_root, &replay_relative_root);
        let artifacts = vec![
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_BRIEF_FILE_NAME,
                "analysis_brief",
                "Analysis brief",
                build_analysis_brief_markdown(&read, &metrics, &recent_artifacts, &exported_at),
            )?,
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_CONTEXT_FILE_NAME,
                "analysis_context",
                "Analysis context",
                build_analysis_context_json(
                    &read,
                    &metrics,
                    &workspace_root,
                    &replay_relative_root,
                    &handoff_relative_root,
                    &evidence_relative_root,
                    &exported_at,
                )?,
            )?,
        ];

        Ok(AgentSessionAnalysisHandoffExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            sanitized_workspace_root: sanitized_workspace_root(&workspace_root),
            analysis_relative_root,
            analysis_absolute_root: analysis_absolute_root.to_string_lossy().to_string(),
            handoff_bundle_relative_root: handoff_relative_root,
            evidence_pack_relative_root: evidence_relative_root,
            replay_case_relative_root: replay_relative_root,
            exported_at,
            thread_status: agent_session_status_label(read.session.status).to_string(),
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            title,
            copy_prompt,
            artifacts,
        })
    }

    pub async fn export_review_decision_template(
        &self,
        params: AgentSessionReviewDecisionTemplateExportParams,
    ) -> Result<AgentSessionReviewDecisionTemplateExportResponse, RuntimeCoreError> {
        self.sync_review_decision(
            params.session_id,
            params.locale,
            default_review_decision(),
            false,
        )
        .await
    }

    pub async fn save_review_decision(
        &self,
        params: AgentSessionReviewDecisionSaveParams,
    ) -> Result<AgentSessionReviewDecisionTemplateExportResponse, RuntimeCoreError> {
        let decision = review_decision_from_save_params(&params);
        self.sync_review_decision(params.session_id, params.locale, decision, true)
            .await
    }

    async fn sync_review_decision(
        &self,
        session_id: String,
        _locale: Option<String>,
        decision: AgentSessionReviewDecision,
        saving: bool,
    ) -> Result<AgentSessionReviewDecisionTemplateExportResponse, RuntimeCoreError> {
        let method = if saving {
            "agentSession/reviewDecision/save"
        } else {
            "agentSession/reviewDecisionTemplate/export"
        };
        let session_id = required_runtime_export_session_id(&session_id, method)?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = canonical_runtime_export_workspace_root(&read, method)?;
        let exported_at = timestamp();
        let metrics = handoff_metrics(&read);
        let (handoff_relative_root, evidence_relative_root, replay_relative_root) =
            runtime_export_base_roots(&session_id);
        let (analysis_relative_root, analysis_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "analysis");
        ensure_runtime_export_root(&analysis_absolute_root)?;
        let (review_relative_root, review_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "review");
        ensure_runtime_export_root(&review_absolute_root)?;

        let analysis_artifacts = vec![
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_CONTEXT_FILE_NAME,
                "analysis_context",
                "Analysis context",
                build_analysis_context_json(
                    &read,
                    &metrics,
                    &workspace_root,
                    &replay_relative_root,
                    &handoff_relative_root,
                    &evidence_relative_root,
                    &exported_at,
                )?,
            )?,
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_BRIEF_FILE_NAME,
                "analysis_brief",
                "Analysis brief",
                build_analysis_brief_markdown(
                    &read,
                    &metrics,
                    &handoff_recent_artifacts(&read),
                    &exported_at,
                ),
            )?,
        ];
        let artifacts = vec![
            write_runtime_export_file(
                &review_absolute_root,
                &review_relative_root,
                REVIEW_DECISION_MARKDOWN_FILE_NAME,
                "review_decision_markdown",
                "Review decision",
                build_review_decision_markdown(
                    &read,
                    &decision,
                    &analysis_relative_root,
                    &replay_relative_root,
                    &exported_at,
                ),
            )?,
            write_runtime_export_file(
                &review_absolute_root,
                &review_relative_root,
                REVIEW_DECISION_JSON_FILE_NAME,
                "review_decision_json",
                "Review decision JSON",
                build_review_decision_json(
                    &read,
                    &decision,
                    &analysis_relative_root,
                    &replay_relative_root,
                    &exported_at,
                )?,
            )?,
        ];

        Ok(AgentSessionReviewDecisionTemplateExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            review_relative_root,
            review_absolute_root: review_absolute_root.to_string_lossy().to_string(),
            analysis_relative_root,
            analysis_absolute_root: analysis_absolute_root.to_string_lossy().to_string(),
            handoff_bundle_relative_root: handoff_relative_root,
            evidence_pack_relative_root: evidence_relative_root,
            replay_case_relative_root: replay_relative_root,
            exported_at,
            thread_status: agent_session_status_label(read.session.status).to_string(),
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            title: "Review Decision".to_string(),
            default_decision_status: "pending_review".to_string(),
            decision,
            decision_status_options: vec![
                "pending_review".to_string(),
                "accepted".to_string(),
                "deferred".to_string(),
                "rejected".to_string(),
                "needs_more_evidence".to_string(),
            ],
            risk_level_options: vec![
                "unknown".to_string(),
                "low".to_string(),
                "medium".to_string(),
                "high".to_string(),
            ],
            review_checklist: vec![
                "Confirm current App Server path evidence.".to_string(),
                "Confirm no legacy agent_runtime_* production fallback is required.".to_string(),
                "Run targeted regression before accepting.".to_string(),
            ],
            analysis_artifacts,
            artifacts,
        })
    }

    pub async fn start_turn(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.start_turn_inner(params, host, None, true).await
    }

    pub(crate) async fn start_turn_with_event_callback(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
        event_callback: &mut RuntimeEventCallback<'_>,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.start_turn_inner(params, host, Some(event_callback), true)
            .await
    }

    async fn start_turn_inner(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
        event_callback: Option<&mut RuntimeEventCallback<'_>>,
        enable_auto_continuation: bool,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.ensure_current_timeline_session_hydrated(&params.session_id)
            .await?;

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

        let queued_turn = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn_id = optional_id_or_new(params.turn_id.clone(), "turn");
            if params.queue_if_busy
                && stored
                    .turns
                    .iter()
                    .any(|turn| agent_turn_is_active(turn.status))
            {
                let turn = AgentTurn {
                    turn_id,
                    session_id: stored.session.session_id.clone(),
                    thread_id: stored.session.thread_id.clone(),
                    status: AgentTurnStatus::Queued,
                    started_at: Some(timestamp()),
                    completed_at: None,
                };
                stored.session.status = AgentSessionStatus::Running;
                stored.session.updated_at = timestamp();
                stored
                    .turn_inputs
                    .insert(turn.turn_id.clone(), params.input.clone());
                if let Some(runtime_options) = params.runtime_options.clone() {
                    stored
                        .turn_runtime_options
                        .insert(turn.turn_id.clone(), runtime_options);
                }
                stored.turns.push(turn.clone());
                Some((stored.session.clone(), turn))
            } else {
                None
            }
        };
        if let Some((session, turn)) = queued_turn {
            let events = self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                Some(&turn.turn_id),
                vec![RuntimeEvent::new(
                    "queue.added",
                    json!({
                        "source": "agentSession/turn/start",
                        "queuedTurnId": params
                            .runtime_options
                            .as_ref()
                            .and_then(|options| options.queued_turn_id.clone())
                            .unwrap_or_else(|| turn.turn_id.clone()),
                    }),
                )],
            )?;
            return Ok(RuntimeCoreOutput {
                response: AgentSessionTurnStartResponse { turn },
                events,
            });
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
            stored
                .turn_inputs
                .insert(turn.turn_id.clone(), params.input.clone());
            if let Some(runtime_options) = params.runtime_options.clone() {
                stored
                    .turn_runtime_options
                    .insert(turn.turn_id.clone(), runtime_options);
            }
            stored.turns.push(turn.clone());

            (stored.session.clone(), previous_session, turn)
        };

        let request_host = host.clone();
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
                if sink.emitted_count() == 0 {
                    self.rollback_started_turn(
                        &session.session_id,
                        &turn.turn_id,
                        previous_session,
                    );
                } else {
                    sink.emit_failure(&error)?;
                    self.append_runtime_events(
                        &session.session_id,
                        &session.thread_id,
                        Some(&turn.turn_id),
                        sink.into_events(),
                    )?;
                }
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
        if enable_auto_continuation && agent_turn_is_terminal(response_turn.status) {
            self.maybe_submit_managed_objective_auto_continuation(
                &session.session_id,
                request_host,
            )
            .await;
        }

        Ok(RuntimeCoreOutput {
            response: AgentSessionTurnStartResponse {
                turn: response_turn,
            },
            events,
        })
    }

    async fn ensure_current_timeline_session_hydrated(
        &self,
        session_id: &str,
    ) -> Result<(), RuntimeCoreError> {
        if self.has_runtime_core_session(session_id) {
            return Ok(());
        }

        let response = self
            .app_data_source
            .read_current_timeline_session(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        self.insert_hydrated_session(response);
        Ok(())
    }

    fn has_runtime_core_session(&self, session_id: &str) -> bool {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state.sessions.contains_key(session_id)
    }

    fn insert_hydrated_session(&self, response: AgentSessionReadResponse) {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let session_id = response.session.session_id.clone();
        state.sessions.entry(session_id).or_insert(StoredSession {
            session: response.session,
            turns: response.turns,
            turn_inputs: HashMap::new(),
            turn_runtime_options: HashMap::new(),
            events: Vec::new(),
        });
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

    fn session_snapshot(
        &self,
        session_id: &str,
    ) -> Result<(AgentSession, Vec<AgentTurn>), RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        Ok((stored.session.clone(), stored.turns.clone()))
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
            stored.turn_inputs.remove(turn_id);
            stored.turn_runtime_options.remove(turn_id);
            stored.session = previous_session;
        }
    }

    fn restore_queued_turn_if_missing(
        &self,
        session_id: &str,
        index: usize,
        turn: AgentTurn,
        input: AgentInput,
    ) {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        if let Some(stored) = state.sessions.get_mut(session_id) {
            if stored.turns.iter().any(|stored_turn| {
                stored_turn.turn_id == turn.turn_id
                    && !matches!(stored_turn.status, AgentTurnStatus::Queued)
            }) {
                return;
            }
            if !stored.turns.iter().any(|stored_turn| {
                stored_turn.turn_id == turn.turn_id
                    && matches!(stored_turn.status, AgentTurnStatus::Queued)
            }) {
                let insert_at = index.min(stored.turns.len());
                stored.turns.insert(insert_at, turn.clone());
            }
            stored.turn_inputs.insert(turn.turn_id, input);
        }
    }

    fn resolve_continuation_runtime_preferences(
        &self,
        read: &AgentSessionReadResponse,
    ) -> RuntimeContinuationPreferences {
        self.latest_turn_runtime_preferences(&read.session.session_id)
            .unwrap_or_else(|| continuation_runtime_preferences_from_read(read))
    }

    fn latest_turn_runtime_preferences(
        &self,
        session_id: &str,
    ) -> Option<RuntimeContinuationPreferences> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state.sessions.get(session_id)?;
        stored.turns.iter().rev().find_map(|turn| {
            let runtime_options = stored.turn_runtime_options.get(&turn.turn_id)?;
            let host_preferences = runtime_options
                .host_options
                .as_ref()
                .map(|host_options| RuntimeContinuationPreferences {
                    provider_preference: runtime_string_from_host_options(
                        host_options,
                        &["provider_preference", "providerPreference"],
                        &["provider_preference", "providerPreference"],
                    ),
                    model_preference: runtime_string_from_host_options(
                        host_options,
                        &["model_preference", "modelPreference"],
                        &["model_preference", "modelPreference"],
                    ),
                    provider_config: runtime_provider_config_from_host_options(host_options),
                    approval_policy: runtime_string_from_host_options(
                        host_options,
                        &["approval_policy", "approvalPolicy"],
                        &["approval_policy", "approvalPolicy"],
                    ),
                    sandbox_policy: runtime_string_from_host_options(
                        host_options,
                        &["sandbox_policy", "sandboxPolicy"],
                        &["sandbox_policy", "sandboxPolicy"],
                    ),
                    execution_strategy: runtime_string_from_host_options(
                        host_options,
                        &["execution_strategy", "executionStrategy"],
                        &["execution_strategy", "executionStrategy"],
                    ),
                })
                .unwrap_or_default();
            let runtime_preferences = RuntimeContinuationPreferences {
                provider_preference: normalized_optional_string(
                    runtime_options.provider_preference.as_deref(),
                ),
                model_preference: normalized_optional_string(
                    runtime_options.model_preference.as_deref(),
                ),
                provider_config: runtime_options
                    .host_options
                    .as_ref()
                    .and_then(runtime_provider_config_from_host_options),
                approval_policy: None,
                sandbox_policy: None,
                execution_strategy: None,
            };
            let preferences = host_preferences.with_fallback(runtime_preferences);
            preferences.has_any_context().then_some(preferences)
        })
    }

    async fn maybe_submit_managed_objective_auto_continuation(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
    ) {
        if let Err(error) = self
            .submit_managed_objective_auto_continuation_until_stopped(session_id, host)
            .await
        {
            tracing::warn!(
                "[AppServer][Objective] managed objective auto-continuation skipped: session_id={}, error={}",
                session_id,
                error
            );
        }
    }

    async fn submit_managed_objective_auto_continuation_until_stopped(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
    ) -> Result<(), RuntimeCoreError> {
        const MAX_AUTO_CONTINUATION_ITERATIONS: usize = 8;
        for _ in 0..MAX_AUTO_CONTINUATION_ITERATIONS {
            let Some(turn) = self
                .submit_managed_objective_auto_continuation_once(session_id, host.clone())
                .await?
            else {
                return Ok(());
            };
            if !agent_turn_is_terminal(turn.status) {
                return Ok(());
            }
        }
        Err(RuntimeCoreError::Backend(
            "managed objective auto-continuation exceeded safety iteration limit".to_string(),
        ))
    }

    async fn submit_managed_objective_auto_continuation_once(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
    ) -> Result<Option<AgentTurn>, RuntimeCoreError> {
        let objective = self
            .app_data_source
            .read_managed_objective_by_owner(
                crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                session_id.to_string(),
            )
            .await?;
        let Some(objective) = objective else {
            return Ok(None);
        };
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let run_summary =
            self.auto_continuation_run_summary(session_id, &objective.objective_id)?;
        let (decision, policy) = crate::objective::resolve_auto_continuation_guard(
            crate::objective::AutoContinuationGuardInput {
                objective: &objective,
                read: &read,
                run_summary: run_summary.clone(),
                now: Utc::now(),
            },
        );

        match decision {
            crate::objective::AutoContinuationGuardDecision::Allow => {
                let queued_turn_id = new_id("queued");
                let turn_id = new_id("turn");
                let workspace_id = self
                    .resolve_objective_workspace_id(session_id, &objective)
                    .await?;
                let message = crate::objective::managed_objective_continuation_message(&objective);
                let event_name = crate::objective::managed_objective_auto_event_name(&objective);
                let metadata = crate::objective::managed_objective_auto_metadata(
                    &objective,
                    &run_summary,
                    &policy,
                );
                let runtime_preferences = self.resolve_continuation_runtime_preferences(&read);
                let runtime_provider_preference =
                    runtime_preferences.provider_preference_for_runtime_options();
                let runtime_model_preference =
                    runtime_preferences.model_preference_for_runtime_options();
                let host_options = build_objective_continuation_host_options(
                    &message,
                    session_id,
                    &event_name,
                    &workspace_id,
                    &turn_id,
                    &queued_turn_id,
                    &metadata,
                    &runtime_preferences,
                );
                self.persist_auto_continuation_guard_audit(
                    session_id,
                    &objective,
                    &crate::objective::AutoContinuationGuardDecision::Allow,
                    &run_summary,
                    &policy,
                    Some(queued_turn_id.as_str()),
                )
                .await?;
                let output = Box::pin(self.start_turn_inner(
                    AgentSessionTurnStartParams {
                        session_id: session_id.to_string(),
                        turn_id: Some(turn_id),
                        input: AgentInput {
                            text: message,
                            attachments: Vec::new(),
                        },
                        runtime_options: Some(app_server_protocol::RuntimeOptions {
                            capability_id: None,
                            stream: true,
                            event_name: Some(event_name),
                            provider_preference: runtime_provider_preference,
                            model_preference: runtime_model_preference,
                            metadata: Some(metadata),
                            queued_turn_id: Some(queued_turn_id.clone()),
                            host_options: Some(host_options),
                        }),
                        queue_if_busy: false,
                        skip_pre_submit_resume: true,
                    },
                    host,
                    None,
                    false,
                ))
                .await?;
                Ok(Some(output.response.turn))
            }
            crate::objective::AutoContinuationGuardDecision::BudgetLimited(_) => {
                self.persist_auto_continuation_guard_audit(
                    session_id,
                    &objective,
                    &decision,
                    &run_summary,
                    &policy,
                    None,
                )
                .await?;
                Ok(None)
            }
            crate::objective::AutoContinuationGuardDecision::Skip(_) => {
                self.persist_auto_continuation_guard_audit(
                    session_id,
                    &objective,
                    &decision,
                    &run_summary,
                    &policy,
                    None,
                )
                .await?;
                Ok(None)
            }
        }
    }

    async fn persist_auto_continuation_guard_audit(
        &self,
        session_id: &str,
        objective: &ManagedObjective,
        decision: &crate::objective::AutoContinuationGuardDecision,
        run_summary: &crate::objective::AutoContinuationRunSummary,
        policy: &crate::objective::AutoContinuationPolicy,
        queued_turn_id: Option<&str>,
    ) -> Result<(), RuntimeCoreError> {
        let Some(update) = crate::objective::build_auto_continuation_guard_audit_update(
            objective,
            decision,
            run_summary,
            policy,
            queued_turn_id,
        ) else {
            return Ok(());
        };
        self.app_data_source
            .audit_agent_session_objective(
                crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                session_id.to_string(),
                update,
            )
            .await?;
        Ok(())
    }

    fn auto_continuation_run_summary(
        &self,
        session_id: &str,
        objective_id: &str,
    ) -> Result<crate::objective::AutoContinuationRunSummary, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        let mut summary = crate::objective::AutoContinuationRunSummary::default();
        for turn in stored.turns.iter().filter(|turn| {
            matches!(
                turn.status,
                AgentTurnStatus::Completed | AgentTurnStatus::Failed | AgentTurnStatus::Canceled
            )
        }) {
            let Some(metadata) = stored
                .turn_runtime_options
                .get(&turn.turn_id)
                .and_then(|options| options.metadata.as_ref())
            else {
                continue;
            };
            let Some(managed_objective) = managed_objective_metadata_from_turn(metadata) else {
                continue;
            };
            if string_field_from_value(managed_objective, &["objective_id", "objectiveId"])
                .as_deref()
                != Some(objective_id)
            {
                continue;
            }
            if string_field_from_value(
                managed_objective,
                &["continuation_source", "continuationSource"],
            )
            .as_deref()
                == Some("auto_idle")
            {
                summary.auto_turn_count += 1;
            }
            if let Some(cost) = estimated_total_cost_from_metadata(metadata) {
                summary.estimated_total_cost += cost;
            }
        }
        Ok(summary)
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

        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            Some(&turn_snapshot.turn_id),
            vec![RuntimeEvent::new(
                "turn.canceled",
                json!({
                    "source": "agentSession/turn/cancel",
                    "backend": "runtime_core",
                }),
            )],
        )?;

        if agent_turn_is_active(turn_snapshot.status) {
            let backend = self.backend.clone();
            tokio::spawn(async move {
                let mut sink = CollectingRuntimeEventSink::default();
                let _ = backend
                    .cancel_turn(
                        CancelExecutionRequest {
                            host,
                            session,
                            turn: turn_snapshot,
                        },
                        &mut sink,
                    )
                    .await;
            });
        }

        Ok(RuntimeCoreOutput {
            response: AgentSessionTurnCancelResponse {},
            events,
        })
    }

    pub async fn replay_action(
        &self,
        params: AgentSessionActionReplayParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionActionReplayResponse>, RuntimeCoreError> {
        self.ensure_current_timeline_session_hydrated(&params.session_id)
            .await?;
        let action = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            replayed_action_required_from_stored_session(stored, &params.request_id)
        };

        Ok(RuntimeCoreOutput {
            response: AgentSessionActionReplayResponse { action },
            events: Vec::new(),
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
        if should_ignore_runtime_event_for_terminal_turn(stored, turn_id) {
            continue;
        }
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

fn managed_objective_metadata_from_turn(
    metadata: &serde_json::Value,
) -> Option<&serde_json::Value> {
    metadata
        .pointer("/request_metadata/harness/managed_objective")
        .or_else(|| metadata.pointer("/request_metadata/managed_objective"))
        .or_else(|| metadata.pointer("/harness/managed_objective"))
        .or_else(|| metadata.get("managed_objective"))
}

fn estimated_total_cost_from_metadata(metadata: &serde_json::Value) -> Option<f64> {
    metadata
        .pointer("/cost_state/estimatedTotalCost")
        .or_else(|| metadata.pointer("/cost_state/estimated_total_cost"))
        .or_else(|| {
            metadata.pointer("/request_metadata/lime_runtime/cost_state/estimatedTotalCost")
        })
        .or_else(|| {
            metadata.pointer("/request_metadata/lime_runtime/cost_state/estimated_total_cost")
        })
        .and_then(serde_json::Value::as_f64)
}

fn string_field_from_value(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn string_field_from_optional_value(
    value: Option<&serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    value.and_then(|value| string_field_from_value(value, keys))
}

fn should_ignore_runtime_event_for_terminal_turn(
    stored: &StoredSession,
    turn_id: Option<&str>,
) -> bool {
    let Some(turn_id) = turn_id else {
        return false;
    };
    stored
        .turns
        .iter()
        .find(|turn| turn.turn_id == turn_id)
        .is_some_and(|turn| agent_turn_is_terminal(turn.status))
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
    fn emitted_count(&self) -> usize {
        self.events.len()
    }

    fn into_events(self) -> Vec<RuntimeEvent> {
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

fn runtime_session_read_detail(stored: &StoredSession) -> serde_json::Value {
    let thread_read = runtime_thread_read_from_stored_session(stored);
    let messages = runtime_session_messages(stored);
    let items = runtime_error_items_from_events(stored);
    let messages_count = messages.len();
    json!({
        "id": stored.session.session_id,
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "workspace_id": stored.session.workspace_id,
        "status": agent_session_status_label(stored.session.status),
        "execution_strategy": session_execution_strategy(&stored.session),
        "messages_count": messages_count,
        "history_limit": messages_count,
        "history_offset": 0,
        "history_cursor": {
            "oldest_message_id": null,
            "start_index": 0,
            "loaded_count": messages_count,
        },
        "history_truncated": false,
        "messages": messages,
        "turns": stored.turns,
        "items": items,
        "queued_turns": [],
        "artifacts": artifact_summaries_for_turn(&stored.events, None),
        "thread_read": thread_read,
    })
}

fn runtime_session_messages(stored: &StoredSession) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    for turn in &stored.turns {
        if let Some(input) = stored.turn_inputs.get(&turn.turn_id) {
            if let Some(message) = runtime_user_message_from_turn(turn, input) {
                messages.push(message);
            }
        }
        if let Some(message) = runtime_assistant_message_from_events(turn, &stored.events) {
            messages.push(message);
        }
    }
    messages
}

fn runtime_user_message_from_turn(
    turn: &AgentTurn,
    input: &AgentInput,
) -> Option<serde_json::Value> {
    let text = input.text.trim();
    if text.is_empty() {
        return None;
    }

    Some(json!({
        "id": format!("{}:user", turn.turn_id),
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": text,
            }
        ],
        "timestamp": timestamp_seconds(turn.started_at.as_deref()),
    }))
}

fn runtime_assistant_message_from_events(
    turn: &AgentTurn,
    events: &[AgentEvent],
) -> Option<serde_json::Value> {
    let mut text = String::new();
    let mut timestamp_value: Option<&str> = None;
    for event in events.iter().filter(|event| {
        event.turn_id.as_deref() == Some(turn.turn_id.as_str())
            && event.event_type == "message.delta"
    }) {
        if let Some(delta) = raw_string_field(
            &event.payload,
            &[
                "text",
                "delta",
                "content",
                "message",
                "outputText",
                "output_text",
            ],
        ) {
            text.push_str(&delta);
            timestamp_value = Some(event.timestamp.as_str());
        }
    }
    let text = text.trim();
    if text.is_empty() {
        return None;
    }

    Some(json!({
        "id": format!("{}:assistant", turn.turn_id),
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": text,
            }
        ],
        "timestamp": timestamp_seconds(timestamp_value.or(turn.completed_at.as_deref())),
    }))
}

fn runtime_error_items_from_events(stored: &StoredSession) -> Vec<serde_json::Value> {
    stored
        .events
        .iter()
        .filter(|event| matches!(event.event_type.as_str(), "turn.failed" | "runtime.error"))
        .filter_map(|event| {
            let message = runtime_error_message_from_event(event)?;
            let turn_id = event
                .turn_id
                .clone()
                .or_else(|| stored.turns.last().map(|turn| turn.turn_id.clone()))?;
            Some(json!({
                "id": format!("{}:error:{}", turn_id, event.event_id),
                "thread_id": event.thread_id.clone().unwrap_or_else(|| stored.session.thread_id.clone()),
                "turn_id": turn_id,
                "sequence": event.sequence,
                "type": "error",
                "status": "failed",
                "message": message,
                "started_at": event.timestamp,
                "completed_at": event.timestamp,
                "updated_at": event.timestamp,
            }))
        })
        .collect()
}

fn runtime_error_message_from_event(event: &AgentEvent) -> Option<String> {
    if !matches!(event.event_type.as_str(), "turn.failed" | "runtime.error") {
        return None;
    }
    raw_string_field(
        &event.payload,
        &[
            "message",
            "error",
            "reason",
            "detail",
            "details",
            "error_message",
            "errorMessage",
        ],
    )
    .map(|message| message.trim().to_string())
    .filter(|message| !message.is_empty())
}

fn latest_turn_error_message(stored: &StoredSession, turn_id: Option<&str>) -> Option<String> {
    stored
        .events
        .iter()
        .rev()
        .filter(|event| match turn_id {
            Some(turn_id) => event.turn_id.as_deref() == Some(turn_id),
            None => true,
        })
        .find_map(runtime_error_message_from_event)
}

fn runtime_thread_read_from_stored_session(stored: &StoredSession) -> serde_json::Value {
    let latest_turn_status = stored
        .turns
        .last()
        .map(|turn| agent_turn_status_label(turn.status));
    let latest_turn_id = stored.turns.last().map(|turn| turn.turn_id.as_str());
    let latest_turn_error_message = latest_turn_error_message(stored, latest_turn_id);
    let active_turn_id = stored
        .turns
        .iter()
        .rev()
        .find(|turn| agent_turn_is_active(turn.status))
        .map(|turn| turn.turn_id.clone());
    json!({
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "status": agent_session_status_label(stored.session.status),
        "execution_strategy": session_execution_strategy(&stored.session),
        "turns": stored.turns,
        "pending_requests": [],
        "queued_turns": stored.turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .collect::<Vec<_>>(),
        "active_turn_id": active_turn_id,
        "tool_calls": tool_calls_from_events(&stored.events),
        "artifacts": artifact_summaries_for_turn(&stored.events, None),
        "diagnostics": {
            "latest_turn_status": latest_turn_status,
            "latest_turn_error_message": latest_turn_error_message,
        },
        "runtime_summary": {
            "latestTurnStatus": latest_turn_status,
            "latestTurnErrorMessage": latest_turn_error_message,
        },
    })
}

fn replayed_action_required_from_stored_session(
    stored: &StoredSession,
    request_id: &str,
) -> Option<AgentSessionReplayedActionRequired> {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return None;
    }

    let mut resolved = false;
    for event in stored.events.iter().rev() {
        if event_request_id(&event.payload).as_deref() != Some(request_id) {
            continue;
        }
        match event.event_type.as_str() {
            "action.resolved" => {
                resolved = true;
            }
            "action.required" if !resolved => {
                return replayed_action_required_from_event(stored, event, request_id);
            }
            _ => {}
        }
    }
    None
}

fn replayed_action_required_from_event(
    stored: &StoredSession,
    event: &AgentEvent,
    request_id: &str,
) -> Option<AgentSessionReplayedActionRequired> {
    let action_type = event_action_type(&event.payload)?;
    let data = event.payload.get("data").unwrap_or(&event.payload);
    let prompt = string_field(data, &["prompt", "message"])
        .or_else(|| string_field(&event.payload, &["prompt", "message"]));
    Some(AgentSessionReplayedActionRequired {
        event_type: "action_required".to_string(),
        request_id: request_id.to_string(),
        action_type,
        tool_name: string_field(data, &["toolName", "tool_name"])
            .or_else(|| string_field(&event.payload, &["toolName", "tool_name"])),
        arguments: data
            .get("arguments")
            .cloned()
            .or_else(|| event.payload.get("arguments").cloned()),
        prompt,
        questions: data
            .get("questions")
            .cloned()
            .or_else(|| event.payload.get("questions").cloned()),
        requested_schema: data
            .get("requestedSchema")
            .cloned()
            .or_else(|| data.get("requested_schema").cloned())
            .or_else(|| event.payload.get("requestedSchema").cloned())
            .or_else(|| event.payload.get("requested_schema").cloned()),
        scope: replayed_action_scope(stored, event),
    })
}

fn replayed_action_scope(
    stored: &StoredSession,
    event: &AgentEvent,
) -> Option<AgentSessionActionScope> {
    let scope = event.payload.get("scope");
    let session_id = scope
        .and_then(|value| string_field(value, &["sessionId", "session_id"]))
        .or_else(|| Some(stored.session.session_id.clone()));
    let thread_id = scope
        .and_then(|value| string_field(value, &["threadId", "thread_id"]))
        .or_else(|| event.thread_id.clone())
        .or_else(|| Some(stored.session.thread_id.clone()));
    let turn_id = scope
        .and_then(|value| string_field(value, &["turnId", "turn_id"]))
        .or_else(|| event.turn_id.clone());
    if session_id.is_none() && thread_id.is_none() && turn_id.is_none() {
        return None;
    }
    Some(AgentSessionActionScope {
        session_id,
        thread_id,
        turn_id,
    })
}

fn event_request_id(payload: &serde_json::Value) -> Option<String> {
    string_field(payload, &["requestId", "request_id"])
}

fn event_action_type(payload: &serde_json::Value) -> Option<AgentSessionActionType> {
    match string_field(payload, &["actionType", "action_type"])?.as_str() {
        "tool_confirmation" => Some(AgentSessionActionType::ToolConfirmation),
        "ask_user" => Some(AgentSessionActionType::AskUser),
        "elicitation" => Some(AgentSessionActionType::Elicitation),
        _ => None,
    }
}

fn tool_calls_from_events(events: &[AgentEvent]) -> Vec<serde_json::Value> {
    let mut calls: Vec<serde_json::Value> = Vec::new();
    for event in events {
        let Some(tool_call) = tool_call_from_event(event) else {
            continue;
        };
        let call_id = tool_call_id_from_event_payload(&event.payload);
        let tool_name = string_field(&tool_call, &["tool_name", "toolName", "name"]);
        if let Some(existing) = calls.iter_mut().find(|existing| {
            if let Some(call_id) = call_id.as_deref() {
                string_field(existing, &["id", "tool_call_id", "toolCallId"]).as_deref()
                    == Some(call_id)
            } else if let Some(tool_name) = tool_name.as_deref() {
                string_field(existing, &["tool_name", "toolName", "name"]).as_deref()
                    == Some(tool_name)
                    && string_field(existing, &["turn_id", "turnId"]).as_deref()
                        == event.turn_id.as_deref()
            } else {
                false
            }
        }) {
            merge_tool_call(existing, tool_call);
        } else {
            calls.push(tool_call);
        }
    }
    calls
}

fn tool_call_id_from_event_payload(payload: &serde_json::Value) -> Option<String> {
    string_field(
        payload,
        &["id", "tool_call_id", "toolCallId", "toolId", "tool_id"],
    )
}

fn tool_call_from_event(event: &AgentEvent) -> Option<serde_json::Value> {
    let status = match event.event_type.as_str() {
        "tool.started" => "running",
        "tool.result" => "completed",
        "tool.failed" => "failed",
        _ => return None,
    };
    let payload = &event.payload;
    let mut record = serde_json::Map::new();
    let id = tool_call_id_from_event_payload(payload).unwrap_or_else(|| event.event_id.clone());
    record.insert("id".to_string(), json!(id));
    if let Some(tool_name) = string_field(payload, &["tool_name", "toolName", "name"]) {
        record.insert("tool_name".to_string(), json!(tool_name));
    }
    record.insert("status".to_string(), json!(status));
    record.insert(
        "success".to_string(),
        json!(event.event_type.as_str() != "tool.failed"),
    );
    if let Some(output) = tool_output_from_event_payload(payload) {
        record.insert("output_preview".to_string(), json!(output));
        record.insert("output".to_string(), json!(output));
    }
    if let Some(error) = payload.get("error").cloned() {
        record.insert("error".to_string(), error);
    }
    record.insert("event_id".to_string(), json!(event.event_id));
    record.insert("turn_id".to_string(), json!(event.turn_id));
    record.insert("timestamp".to_string(), json!(event.timestamp));
    Some(serde_json::Value::Object(record))
}

fn merge_tool_call(existing: &mut serde_json::Value, next: serde_json::Value) {
    let (Some(existing), Some(next)) = (existing.as_object_mut(), next.as_object()) else {
        return;
    };
    for (key, value) in next {
        if value.is_null() {
            continue;
        }
        existing.insert(key.clone(), value.clone());
    }
}

fn tool_output_from_event_payload(payload: &serde_json::Value) -> Option<String> {
    string_field(
        payload,
        &[
            "output",
            "output_preview",
            "outputPreview",
            "text",
            "content",
            "result",
        ],
    )
    .or_else(|| {
        payload
            .get("result")
            .filter(|value| !value.is_string() && !value.is_null())
            .map(|value| value.to_string())
    })
}

fn agent_turn_is_active(status: AgentTurnStatus) -> bool {
    matches!(
        status,
        AgentTurnStatus::Accepted
            | AgentTurnStatus::Queued
            | AgentTurnStatus::Running
            | AgentTurnStatus::WaitingAction
    )
}

fn agent_turn_is_terminal(status: AgentTurnStatus) -> bool {
    matches!(
        status,
        AgentTurnStatus::Completed | AgentTurnStatus::Failed | AgentTurnStatus::Canceled
    )
}

fn agent_turn_blocks_queue_resume(status: AgentTurnStatus) -> bool {
    matches!(
        status,
        AgentTurnStatus::Accepted | AgentTurnStatus::Running | AgentTurnStatus::WaitingAction
    )
}

fn normalize_session_control_id(value: &str, message: &str) -> Result<String, RuntimeCoreError> {
    let normalized = value.trim();
    if normalized.is_empty() {
        Err(RuntimeCoreError::Backend(message.to_string()))
    } else {
        Ok(normalized.to_string())
    }
}

fn agent_session_status_label(status: AgentSessionStatus) -> &'static str {
    match status {
        AgentSessionStatus::Idle => "idle",
        AgentSessionStatus::Running => "running",
        AgentSessionStatus::WaitingAction => "waitingAction",
        AgentSessionStatus::Completed => "completed",
        AgentSessionStatus::Failed => "failed",
        AgentSessionStatus::Canceled => "canceled",
    }
}

fn agent_turn_status_label(status: AgentTurnStatus) -> &'static str {
    match status {
        AgentTurnStatus::Accepted => "accepted",
        AgentTurnStatus::Queued => "queued",
        AgentTurnStatus::Running => "running",
        AgentTurnStatus::WaitingAction => "waitingAction",
        AgentTurnStatus::Completed => "completed",
        AgentTurnStatus::Failed => "failed",
        AgentTurnStatus::Canceled => "canceled",
    }
}

fn session_execution_strategy(session: &AgentSession) -> Option<String> {
    session.business_object_ref.as_ref().and_then(|reference| {
        metadata_string(reference.metadata.as_ref(), "executionStrategy")
            .or_else(|| metadata_string(reference.metadata.as_ref(), "execution_strategy"))
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

fn raw_string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| value.as_str())
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

fn timestamp_seconds(value: Option<&str>) -> i64 {
    value
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.timestamp())
        .unwrap_or_else(|| Utc::now().timestamp())
}

impl RuntimeCore {
    async fn find_agent_app_installed_state(
        &self,
        app_id: &str,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        let list = self.list_agent_app_installed().await?;
        list.states
            .into_iter()
            .find(|state| json_string(state, &["appId"]).as_deref() == Some(app_id))
            .ok_or_else(|| RuntimeCoreError::Backend(format!("Agent App 未安装: {app_id}")))
    }

    async fn running_agent_app_ui_runtime(
        &self,
        app_id: &str,
        entry: Option<&AgentAppUiRuntimeEntry>,
    ) -> Result<Option<AgentAppUiRuntimeStatusResponse>, RuntimeCoreError> {
        let status = self.agent_app_ui_runtime_status_by_process(app_id, entry)?;
        let Some(status) = status else {
            return Ok(None);
        };
        if status.status != "running" {
            return Ok(Some(status));
        }
        let Some(base_url) = status.base_url.as_deref() else {
            return Ok(Some(status));
        };
        if probe_agent_app_ui_runtime_ready(base_url).await {
            return Ok(Some(status));
        }
        self.remove_unready_agent_app_ui_runtime(app_id, status.pid)
            .await;
        Ok(None)
    }

    fn agent_app_ui_runtime_status_by_process(
        &self,
        app_id: &str,
        entry: Option<&AgentAppUiRuntimeEntry>,
    ) -> Result<Option<AgentAppUiRuntimeStatusResponse>, RuntimeCoreError> {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let Some(process) = state.agent_app_ui_runtimes.get_mut(app_id) else {
            return Ok(None);
        };
        let pid = process.child.id();
        let mut remove_runtime = false;
        let status = match process.child.try_wait() {
            Ok(None) => {
                if let Some(entry) = entry {
                    process.entry_key = entry.entry_key.clone();
                    process.route = entry.route.clone();
                }
                let route = process.route.clone();
                let base_url = process.base_url.clone();
                AgentAppUiRuntimeStatusResponse {
                    app_id: app_id.to_string(),
                    status: "running".to_string(),
                    base_url: Some(base_url.clone()),
                    entry_url: Some(join_agent_app_runtime_url(&base_url, &route)),
                    port: Some(process.port),
                    pid,
                    message: Some(format!(
                        "Agent App UI runtime 已运行，启动时间 {}，目录 {}。",
                        process.started_at,
                        process.app_dir.display()
                    )),
                    entry_key: Some(process.entry_key.clone()),
                    route: Some(route),
                }
            }
            Ok(Some(status)) => {
                remove_runtime = true;
                AgentAppUiRuntimeStatusResponse {
                    app_id: app_id.to_string(),
                    status: "failed".to_string(),
                    base_url: None,
                    entry_url: None,
                    port: None,
                    pid,
                    message: Some(format!("Agent App UI runtime 已退出: {status}")),
                    entry_key: None,
                    route: None,
                }
            }
            Err(error) => {
                remove_runtime = true;
                AgentAppUiRuntimeStatusResponse {
                    app_id: app_id.to_string(),
                    status: "failed".to_string(),
                    base_url: None,
                    entry_url: None,
                    port: None,
                    pid,
                    message: Some(format!("读取 Agent App UI runtime 状态失败: {error}")),
                    entry_key: None,
                    route: None,
                }
            }
        };
        if remove_runtime {
            state.agent_app_ui_runtimes.remove(app_id);
        }
        Ok(Some(status))
    }

    async fn remove_unready_agent_app_ui_runtime(&self, app_id: &str, expected_pid: Option<u32>) {
        let process = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let Some(process) = state.agent_app_ui_runtimes.get(app_id) else {
                return;
            };
            if expected_pid.is_some_and(|pid| Some(pid) != process.child.id()) {
                return;
            }
            state.agent_app_ui_runtimes.remove(app_id)
        };
        if let Some(mut process) = process {
            terminate_agent_app_ui_process(&mut process.child).await;
        }
    }
}

fn validate_agent_app_id(app_id: &str) -> Result<(), RuntimeCoreError> {
    if app_id.is_empty()
        || app_id.len() > 96
        || !app_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App appId 不合法: {app_id}"
        )));
    }
    Ok(())
}

fn resolve_agent_app_ui_entry(
    state: &serde_json::Value,
    entry_key: Option<&str>,
) -> Result<AgentAppUiRuntimeEntry, RuntimeCoreError> {
    let entries = state
        .pointer("/projection/entries")
        .and_then(serde_json::Value::as_array)
        .or_else(|| {
            state
                .pointer("/manifest/entries")
                .and_then(serde_json::Value::as_array)
        })
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Agent App installed state 缺少 entries。".to_string())
        })?;
    let entry = entry_key
        .and_then(|key| {
            entries
                .iter()
                .find(|entry| json_string(entry, &["key"]).as_deref() == Some(key))
        })
        .or_else(|| {
            entries.iter().find(|entry| {
                json_string(entry, &["key"]).as_deref() == Some("dashboard")
                    && is_agent_app_ui_entry(entry)
            })
        })
        .or_else(|| entries.iter().find(|entry| is_agent_app_ui_entry(entry)))
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Agent App 未声明可打开的 UI entry。".to_string())
        })?;
    if !is_agent_app_ui_entry(entry) {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App entry {} 不是 UI entry。",
            json_string(entry, &["key"]).unwrap_or_else(|| "<unknown>".to_string())
        )));
    }
    let entry_key = json_string(entry, &["key"])
        .ok_or_else(|| RuntimeCoreError::Backend("Agent App UI entry 缺少 key。".to_string()))?;
    let route = normalize_agent_app_runtime_route(
        json_string(entry, &["route"]).as_deref().unwrap_or("/"),
    )?;
    Ok(AgentAppUiRuntimeEntry { entry_key, route })
}

fn is_agent_app_ui_entry(entry: &serde_json::Value) -> bool {
    matches!(
        json_string(entry, &["kind"]).as_deref(),
        Some("page" | "panel" | "settings")
    )
}

fn parse_agent_app_shell_descriptor(
    descriptor: &serde_json::Value,
) -> Result<AgentAppShellDescriptorFields, Vec<String>> {
    let mut blocker_codes = Vec::new();
    let descriptor_version = descriptor
        .get("descriptorVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    if descriptor_version != 1 {
        blocker_codes.push("SHELL_DESCRIPTOR_VERSION_UNSUPPORTED".to_string());
    }

    let app_id = json_string(descriptor, &["appId"]).unwrap_or_default();
    if validate_agent_app_id(&app_id).is_err() {
        blocker_codes.push("APP_ID_INVALID".to_string());
    }

    let install_mode = json_string(descriptor, &["installMode"]).unwrap_or_default();
    if install_mode != "standalone" && install_mode != "runtime_backed" {
        blocker_codes.push("SHELL_INSTALL_MODE_UNSUPPORTED".to_string());
    }

    let shell_kind = json_string(descriptor, &["runtimeProfile", "shellKind"]).unwrap_or_default();
    if !agent_app_shell_kind_matches_install_mode(&shell_kind, &install_mode) {
        blocker_codes.push("SHELL_KIND_MISMATCH".to_string());
    }
    if json_string(descriptor, &["runtimeProfile", "installMode"]).as_deref()
        != Some(install_mode.as_str())
    {
        blocker_codes.push("RUNTIME_PROFILE_MISMATCH".to_string());
    }

    let package_hash = json_string(descriptor, &["packageHash"]).unwrap_or_default();
    let manifest_hash = json_string(descriptor, &["manifestHash"]).unwrap_or_default();
    if package_hash.is_empty() || manifest_hash.is_empty() {
        blocker_codes.push("PACKAGE_IDENTITY_MISSING".to_string());
    }

    if json_string(descriptor, &["isolation", "packageMount"]).as_deref() != Some("read-only")
        || json_string(descriptor, &["isolation", "secrets"]).as_deref() != Some("refs-only")
        || json_string(descriptor, &["isolation", "sideEffects"]).as_deref()
            != Some("runtime-broker")
        || json_string(descriptor, &["isolation", "evidence"]).as_deref()
            != Some("runtime-provenance")
    {
        blocker_codes.push("ISOLATION_POLICY_INVALID".to_string());
    }

    let entry_key = json_string(descriptor, &["entry", "entryKey"]).unwrap_or_default();
    if entry_key.is_empty() {
        blocker_codes.push("ENTRY_KEY_MISSING".to_string());
    }

    if !blocker_codes.is_empty() {
        blocker_codes.sort();
        blocker_codes.dedup();
        return Err(blocker_codes);
    }

    let window_title = json_string(descriptor, &["branding", "windowTitle"])
        .or_else(|| json_string(descriptor, &["branding", "name"]))
        .unwrap_or_else(|| app_id.clone());

    Ok(AgentAppShellDescriptorFields {
        descriptor_version,
        app_id,
        install_mode,
        shell_kind,
        package_hash,
        manifest_hash,
        entry_key,
        window_title,
    })
}

fn agent_app_shell_kind_matches_install_mode(shell_kind: &str, install_mode: &str) -> bool {
    (install_mode == "standalone" && shell_kind == "app_shell")
        || (install_mode == "runtime_backed" && shell_kind == "runtime_backed")
}

fn validate_agent_app_shell_against_installed_state(
    fields: &AgentAppShellDescriptorFields,
    state: &serde_json::Value,
) -> Vec<String> {
    let mut blockers = Vec::new();
    if json_string(state, &["installMode"]).as_deref() != Some(fields.install_mode.as_str()) {
        blockers.push("INSTALL_MODE_MISMATCH".to_string());
    }
    if json_string(state, &["runtimeProfileSummary", "shellKind"]).as_deref()
        != Some(fields.shell_kind.as_str())
    {
        blockers.push("RUNTIME_PROFILE_MISMATCH".to_string());
    }
    if json_string(state, &["identity", "packageHash"]).as_deref()
        != Some(fields.package_hash.as_str())
    {
        blockers.push("PACKAGE_HASH_MISMATCH".to_string());
    }
    if json_string(state, &["identity", "manifestHash"]).as_deref()
        != Some(fields.manifest_hash.as_str())
    {
        blockers.push("MANIFEST_HASH_MISMATCH".to_string());
    }
    if state
        .get("disabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        blockers.push("APP_DISABLED".to_string());
    }
    blockers
}

fn build_agent_app_shell_prepare_response(
    fields: Option<&AgentAppShellDescriptorFields>,
    status: &str,
    blocker_codes: Vec<String>,
    message: Option<String>,
    package_mount: Option<AgentAppShellPackageMount>,
    prepared_at: String,
) -> AgentAppShellPrepareResponse {
    AgentAppShellPrepareResponse {
        app_id: fields.map(|fields| fields.app_id.clone()),
        status: status.to_string(),
        install_mode: fields.map(|fields| fields.install_mode.clone()),
        shell_kind: fields.map(|fields| fields.shell_kind.clone()),
        descriptor_version: fields.map(|fields| fields.descriptor_version),
        dev_shell: true,
        blocker_codes,
        message,
        package_mount,
        entry_key: fields.map(|fields| fields.entry_key.clone()),
        window_title: fields.map(|fields| fields.window_title.clone()),
        prepared_at,
    }
}

fn resolve_agent_app_runtime_dir(state: &serde_json::Value) -> Result<PathBuf, RuntimeCoreError> {
    let source_kind = json_string(state, &["identity", "sourceKind"]).unwrap_or_default();
    let source_uri = json_string(state, &["identity", "sourceUri"]).unwrap_or_default();
    if source_kind == "local_folder" {
        return canonicalize_existing_agent_app_dir(&source_uri);
    }

    let package_hash = json_string(state, &["identity", "packageHash"]).ok_or_else(|| {
        RuntimeCoreError::Backend("Agent App installed state 缺少 packageHash。".to_string())
    })?;
    let package_dir_name = package_hash.replace(':', "_");
    let app_dir = lime_core::app_paths::preferred_data_dir()
        .map_err(RuntimeCoreError::Backend)?
        .join(AGENT_APP_DATA_DIR)
        .join("packages")
        .join(package_dir_name);
    canonicalize_existing_agent_app_dir(&app_dir.to_string_lossy())
}

fn canonicalize_existing_agent_app_dir(value: &str) -> Result<PathBuf, RuntimeCoreError> {
    let path = PathBuf::from(value);
    let canonical = fs::canonicalize(&path).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "无法解析 Agent App runtime 目录 {}: {error}",
            path.display()
        ))
    })?;
    if !canonical.is_dir() {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App runtime 路径不是目录: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

fn ensure_agent_app_runtime_folder(app_dir: &Path) -> Result<(), RuntimeCoreError> {
    if !app_dir.join("package.json").is_file() {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App runtime 目录缺少 package.json: {}",
            app_dir.display()
        )));
    }
    Ok(())
}

fn reserve_local_port() -> Result<u16, RuntimeCoreError> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| {
        RuntimeCoreError::Backend(format!("分配 Agent App UI runtime 端口失败: {error}"))
    })?;
    listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|error| {
            RuntimeCoreError::Backend(format!("读取 Agent App UI runtime 端口失败: {error}"))
        })
}

fn spawn_agent_app_ui_process(app_dir: &Path, port: u16) -> Result<Child, RuntimeCoreError> {
    let mut last_error = None;
    for candidate in agent_app_npm_launch_candidates() {
        let mut command = Command::new(&candidate.binary);
        command
            .args(["run", "dev", "--silent"])
            .current_dir(app_dir)
            .env("PORT", port.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(path_env) = candidate.path_env.as_deref() {
            command.env("PATH", path_env);
        }
        for key in inherited_agent_app_secret_env_keys() {
            command.env_remove(key);
        }
        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(error) => last_error = Some(format!("{}: {error}", candidate.binary)),
        }
    }
    Err(RuntimeCoreError::Backend(format!(
        "启动 Agent App UI runtime 失败，请确认已安装 Node.js/npm: {}",
        last_error.unwrap_or_else(|| "npm 不可用".to_string())
    )))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AgentAppNpmLaunchCandidate {
    binary: String,
    path_env: Option<String>,
}

fn agent_app_npm_launch_candidates() -> Vec<AgentAppNpmLaunchCandidate> {
    let mut candidates = Vec::new();
    if let Some(path_env) = std::env::var("PATH").ok() {
        if !path_env.trim().is_empty() {
            #[cfg(windows)]
            {
                push_agent_app_npm_candidate(
                    &mut candidates,
                    AgentAppNpmLaunchCandidate {
                        binary: "npm.cmd".to_string(),
                        path_env: Some(path_env.clone()),
                    },
                );
            }
            push_agent_app_npm_candidate(
                &mut candidates,
                AgentAppNpmLaunchCandidate {
                    binary: "npm".to_string(),
                    path_env: Some(path_env),
                },
            );
        }
    }
    push_agent_app_npm_candidate(
        &mut candidates,
        AgentAppNpmLaunchCandidate {
            binary: "npm".to_string(),
            path_env: None,
        },
    );
    candidates
}

fn push_agent_app_npm_candidate(
    candidates: &mut Vec<AgentAppNpmLaunchCandidate>,
    candidate: AgentAppNpmLaunchCandidate,
) {
    if candidate.binary.trim().is_empty() {
        return;
    }
    if candidates
        .iter()
        .any(|current| current.binary == candidate.binary && current.path_env == candidate.path_env)
    {
        return;
    }
    candidates.push(candidate);
}

fn inherited_agent_app_secret_env_keys() -> &'static [&'static str] {
    &[
        "LIME_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "DEEPSEEK_API_KEY",
        "OPENROUTER_API_KEY",
        "MISTRAL_API_KEY",
        "XAI_API_KEY",
        "DASHSCOPE_API_KEY",
        "MOONSHOT_API_KEY",
        "ZHIPUAI_API_KEY",
        "GROQ_API_KEY",
        "FAL_KEY",
    ]
}

async fn wait_for_agent_app_ui_runtime_ready(
    child: &mut Child,
    base_url: &str,
) -> Result<(), RuntimeCoreError> {
    let deadline = Instant::now() + Duration::from_secs(AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "Agent App UI runtime 启动后退出: {status}"
                )));
            }
            Ok(None) => {}
            Err(error) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "检查 Agent App UI runtime 进程状态失败: {error}"
                )));
            }
        }

        if probe_agent_app_ui_runtime_ready(base_url).await {
            return Ok(());
        }

        if Instant::now() >= deadline {
            terminate_agent_app_ui_process(child).await;
            return Err(RuntimeCoreError::Backend(format!(
                "Agent App UI runtime 未在 {} 秒内就绪: {}",
                AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS,
                agent_app_ui_runtime_health_url(base_url)
            )));
        }
        sleep(Duration::from_millis(250)).await;
    }
}

async fn probe_agent_app_ui_runtime_ready(base_url: &str) -> bool {
    let client = match reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_millis(800))
        .build()
    {
        Ok(client) => client,
        Err(_) => reqwest::Client::new(),
    };
    match client
        .get(agent_app_ui_runtime_health_url(base_url))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

fn agent_app_ui_runtime_health_url(base_url: &str) -> String {
    format!("{base_url}/api/bootstrap")
}

async fn terminate_agent_app_ui_process(child: &mut Child) {
    let _ = child.start_kill();
    let _ = child.wait().await;
}

fn stopped_agent_app_ui_runtime_status(
    app_id: String,
    message: &str,
) -> AgentAppUiRuntimeStatusResponse {
    AgentAppUiRuntimeStatusResponse {
        app_id,
        status: "stopped".to_string(),
        base_url: None,
        entry_url: None,
        port: None,
        pid: None,
        message: Some(message.to_string()),
        entry_key: None,
        route: None,
    }
}

fn normalize_agent_app_runtime_route(route: &str) -> Result<String, RuntimeCoreError> {
    let trimmed = route.trim();
    if trimmed.is_empty() {
        return Ok("/".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Err(RuntimeCoreError::Backend(
            "Agent App UI entry route 必须是本地 runtime 相对路径。".to_string(),
        ));
    }
    if trimmed.starts_with('/') {
        return Ok(trimmed.to_string());
    }
    Ok(format!("/{trimmed}"))
}

fn join_agent_app_runtime_url(base_url: &str, route: &str) -> String {
    if route == "/" {
        return format!("{base_url}/");
    }
    format!("{base_url}{route}")
}

fn json_string(value: &serde_json::Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
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
    use tokio::time::timeout;

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

    struct ToolReadModelBackend;

    #[async_trait]
    impl ExecutionBackend for ToolReadModelBackend {
        async fn start_turn(
            &self,
            _request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
            sink.emit(RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolName": "WebFetch",
                }),
            ))?;
            sink.emit(RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolName": "WebFetch",
                    "output": "fetched https://example.com",
                }),
            ))?;
            sink.emit(RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "search-call-1",
                    "toolName": "WebSearch",
                }),
            ))?;
            sink.emit(RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "search-call-1",
                    "toolName": "WebSearch",
                    "outputPreview": "search results",
                }),
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

    struct PartialFailureBackend;

    #[async_trait]
    impl ExecutionBackend for PartialFailureBackend {
        async fn start_turn(
            &self,
            _request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
            Err(RuntimeCoreError::Backend(
                "provider stream timed out after 60s".to_string(),
            ))
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

    struct FailBeforeEmitBackend {
        start_count: AtomicUsize,
    }

    #[async_trait]
    impl ExecutionBackend for FailBeforeEmitBackend {
        async fn start_turn(
            &self,
            _request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            if self.start_count.fetch_add(1, Ordering::SeqCst) == 0 {
                return sink.emit(RuntimeEvent::new("turn.accepted", json!({})));
            }
            Err(RuntimeCoreError::Backend(
                "backend unavailable before turn start".to_string(),
            ))
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

    struct HangingCancelBackend {
        cancel_count: AtomicUsize,
    }

    #[async_trait]
    impl ExecutionBackend for HangingCancelBackend {
        async fn start_turn(
            &self,
            _request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            sink.emit(RuntimeEvent::new("turn.started", json!({})))
        }

        async fn cancel_turn(
            &self,
            _request: CancelExecutionRequest,
            _sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            self.cancel_count.fetch_add(1, Ordering::SeqCst);
            std::future::pending::<()>().await;
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

    struct FinalDoneRecordingBackend {
        requests: Mutex<Vec<ExecutionRequest>>,
    }

    #[async_trait]
    impl ExecutionBackend for FinalDoneRecordingBackend {
        async fn start_turn(
            &self,
            request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            self.requests
                .lock()
                .expect("test backend requests mutex poisoned")
                .push(request);
            sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
            sink.emit(RuntimeEvent::new("turn.completed", json!({})))
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
    struct RecordingBackend {
        requests: Mutex<Vec<ExecutionRequest>>,
    }

    #[async_trait]
    impl ExecutionBackend for RecordingBackend {
        async fn start_turn(
            &self,
            request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            self.requests
                .lock()
                .expect("test backend requests mutex poisoned")
                .push(request);
            sink.emit(RuntimeEvent::new("turn.accepted", json!({})))
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

    struct TestCurrentTimelineDataSource {
        persisted: Option<AgentSessionReadResponse>,
        objective: Mutex<Option<ManagedObjective>>,
        audit_updates: Mutex<Vec<ManagedObjectiveAuditUpdate>>,
        read_requests: Mutex<Vec<AgentSessionReadParams>>,
        knowledge_compile_requests: Mutex<Vec<lime_knowledge::KnowledgeCompilePackRequest>>,
    }

    impl TestCurrentTimelineDataSource {
        fn new(persisted: AgentSessionReadResponse) -> Self {
            Self {
                persisted: Some(persisted),
                objective: Mutex::new(None),
                audit_updates: Mutex::new(Vec::new()),
                read_requests: Mutex::new(Vec::new()),
                knowledge_compile_requests: Mutex::new(Vec::new()),
            }
        }

        fn with_objective(self, objective: ManagedObjective) -> Self {
            *self
                .objective
                .lock()
                .expect("test objective mutex poisoned") = Some(objective);
            self
        }

        fn read_requests(&self) -> Vec<AgentSessionReadParams> {
            self.read_requests
                .lock()
                .expect("test current timeline read requests mutex poisoned")
                .clone()
        }

        fn objective(&self) -> Option<ManagedObjective> {
            self.objective
                .lock()
                .expect("test objective mutex poisoned")
                .clone()
        }

        fn audit_updates(&self) -> Vec<ManagedObjectiveAuditUpdate> {
            self.audit_updates
                .lock()
                .expect("test audit updates mutex poisoned")
                .clone()
        }

        fn knowledge_compile_requests(&self) -> Vec<lime_knowledge::KnowledgeCompilePackRequest> {
            self.knowledge_compile_requests
                .lock()
                .expect("test knowledge compile requests mutex poisoned")
                .clone()
        }
    }

    fn empty_agent_session_read_response(session_id: &str) -> AgentSessionReadResponse {
        AgentSessionReadResponse {
            session: AgentSession {
                session_id: session_id.to_string(),
                thread_id: session_id.to_string(),
                app_id: "agent-runtime".to_string(),
                workspace_id: None,
                business_object_ref: None,
                status: AgentSessionStatus::Idle,
                created_at: timestamp(),
                updated_at: timestamp(),
            },
            turns: Vec::new(),
            detail: None,
        }
    }

    fn managed_objective(session_id: &str) -> ManagedObjective {
        ManagedObjective {
            objective_id: "objective-1".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            owner_kind: crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
            owner_id: session_id.to_string(),
            objective_text: "完成生产命令 current 迁移".to_string(),
            success_criteria: vec!["契约通过".to_string()],
            status: ManagedObjectiveStatus::Active,
            budget_policy: None,
            risk_policy: None,
            approval_policy: None,
            continuation_policy: None,
            last_audit_summary: None,
            last_evidence_pack_ref: None,
            last_artifact_refs: Vec::new(),
            blocker_reason: None,
            created_at: timestamp(),
            updated_at: timestamp(),
        }
    }

    struct TestKnowledgeBuilderRuntimeExecutor {
        calls: Mutex<Vec<lime_knowledge::KnowledgeBuilderRuntimePlan>>,
    }

    impl TestKnowledgeBuilderRuntimeExecutor {
        fn new() -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
            }
        }

        fn calls(&self) -> Vec<lime_knowledge::KnowledgeBuilderRuntimePlan> {
            self.calls
                .lock()
                .expect("test knowledge builder calls mutex poisoned")
                .clone()
        }
    }

    #[async_trait]
    impl KnowledgeBuilderRuntimeExecutor for TestKnowledgeBuilderRuntimeExecutor {
        async fn execute(
            &self,
            plan: lime_knowledge::KnowledgeBuilderRuntimePlan,
        ) -> Result<lime_knowledge::KnowledgeBuilderRuntimeExecution, RuntimeCoreError> {
            self.calls
                .lock()
                .expect("test knowledge builder calls mutex poisoned")
                .push(plan.clone());
            Ok(lime_knowledge::KnowledgeBuilderRuntimeExecution {
                skill_name: plan.skill_name,
                execution_id: plan.execution_id,
                session_id: Some(plan.session_id),
                status: "succeeded".to_string(),
                provider: plan.provider_override,
                model: plan.model_override,
                output: Some(
                    json!({
                        "primaryDocument": {
                            "path": "documents/runtime-founder.md",
                            "content": "# Runtime 创始人\n\n## 智能体应用指南\n\n- 只引用长期主义与不夸大收入。"
                        },
                        "status": "needs-review",
                        "missingFacts": ["代表案例待补充"],
                        "warnings": ["收入数据未确认"],
                        "provenance": {
                            "kind": "agent-skill",
                            "name": "personal-ip-knowledge-builder",
                            "version": "1.0.0"
                        }
                    })
                    .to_string(),
                ),
                error: None,
            })
        }
    }

    #[async_trait]
    impl AppDataSource for TestCurrentTimelineDataSource {
        async fn list_current_timeline_sessions(
            &self,
            params: AgentSessionListParams,
        ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_current_timeline_sessions(params)
                .await
        }

        async fn read_current_timeline_session(
            &self,
            params: AgentSessionReadParams,
        ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
            self.read_requests
                .lock()
                .expect("test current timeline read requests mutex poisoned")
                .push(params.clone());
            Ok(self
                .persisted
                .as_ref()
                .filter(|response| response.session.session_id == params.session_id)
                .cloned())
        }

        async fn update_current_timeline_session(
            &self,
            params: AgentSessionUpdateParams,
        ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
            NoopAppDataSource
                .update_current_timeline_session(params)
                .await
        }

        async fn read_agent_session_objective(
            &self,
            _params: AgentSessionObjectiveReadParams,
        ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
            Ok(AgentSessionObjectiveReadResponse {
                objective: self.objective(),
            })
        }

        async fn read_managed_objective_by_owner(
            &self,
            owner_kind: String,
            owner_id: String,
        ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
            Ok(self.objective().filter(|objective| {
                objective.owner_kind == owner_kind && objective.owner_id == owner_id
            }))
        }

        async fn audit_agent_session_objective(
            &self,
            _owner_kind: String,
            _owner_id: String,
            update: ManagedObjectiveAuditUpdate,
        ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
            self.audit_updates
                .lock()
                .expect("test audit updates mutex poisoned")
                .push(update.clone());
            let mut objective = self
                .objective
                .lock()
                .expect("test objective mutex poisoned");
            if let Some(objective) = objective.as_mut() {
                objective.status = update.status;
                objective.last_audit_summary = update.last_audit_summary;
                objective.last_evidence_pack_ref = update.last_evidence_pack_ref;
                objective.last_artifact_refs = update.last_artifact_refs;
                objective.blocker_reason = update.blocker_reason;
            }
            Ok(objective.clone())
        }

        async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_workspaces().await
        }

        async fn read_workspace(
            &self,
            params: WorkspaceReadParams,
        ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_workspace(params).await
        }

        async fn read_workspace_by_path(
            &self,
            params: WorkspacePathReadParams,
        ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_workspace_by_path(params).await
        }

        async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_default_workspace().await
        }

        async fn ensure_default_workspace(
            &self,
        ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
            NoopAppDataSource.ensure_default_workspace().await
        }

        async fn ensure_workspace_ready(
            &self,
            params: WorkspaceEnsureParams,
        ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
            NoopAppDataSource.ensure_workspace_ready(params).await
        }

        async fn read_workspace_projects_root(
            &self,
        ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_workspace_projects_root().await
        }

        async fn resolve_workspace_project_path(
            &self,
            params: WorkspaceProjectPathResolveParams,
        ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
            NoopAppDataSource
                .resolve_workspace_project_path(params)
                .await
        }

        async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_skills().await
        }

        async fn read_skill(
            &self,
            params: SkillReadParams,
        ) -> Result<SkillReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_skill(params).await
        }

        async fn inspect_local_skill_detail(
            &self,
            params: SkillLocalDetailInspectParams,
        ) -> Result<SkillLocalDetailInspectResponse, RuntimeCoreError> {
            NoopAppDataSource.inspect_local_skill_detail(params).await
        }

        async fn rename_local_skill(
            &self,
            params: SkillLocalRenameParams,
        ) -> Result<SkillLocalRenameResponse, RuntimeCoreError> {
            NoopAppDataSource.rename_local_skill(params).await
        }

        async fn inspect_local_skill_package(
            &self,
            params: SkillPackageLocalInspectParams,
        ) -> Result<SkillPackageLocalInspectResponse, RuntimeCoreError> {
            NoopAppDataSource.inspect_local_skill_package(params).await
        }

        async fn install_local_skill_package(
            &self,
            params: SkillPackageLocalInstallParams,
        ) -> Result<SkillPackageLocalInstallResponse, RuntimeCoreError> {
            NoopAppDataSource.install_local_skill_package(params).await
        }

        async fn replace_local_skill_package(
            &self,
            params: SkillPackageLocalReplaceParams,
        ) -> Result<SkillPackageLocalReplaceResponse, RuntimeCoreError> {
            NoopAppDataSource.replace_local_skill_package(params).await
        }

        async fn export_local_skill_package(
            &self,
            params: SkillPackageExportParams,
        ) -> Result<SkillPackageExportResponse, RuntimeCoreError> {
            NoopAppDataSource.export_local_skill_package(params).await
        }

        async fn install_marketplace_skill(
            &self,
            params: SkillMarketplaceInstallParams,
        ) -> Result<SkillMarketplaceInstallResponse, RuntimeCoreError> {
            NoopAppDataSource.install_marketplace_skill(params).await
        }

        async fn install_skill_from_download_url(
            &self,
            params: SkillDownloadInstallParams,
        ) -> Result<SkillDownloadInstallResponse, RuntimeCoreError> {
            NoopAppDataSource
                .install_skill_from_download_url(params)
                .await
        }

        async fn list_workspace_skill_bindings(
            &self,
            params: WorkspaceSkillBindingsListParams,
        ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_workspace_skill_bindings(params)
                .await
        }

        async fn list_workspace_registered_skills(
            &self,
            params: WorkspaceRegisteredSkillsListParams,
        ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_workspace_registered_skills(params)
                .await
        }

        async fn list_agent_app_installed(
            &self,
        ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_agent_app_installed().await
        }

        async fn inspect_agent_app_local_package(
            &self,
            params: AgentAppLocalPackageInspectParams,
        ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
            NoopAppDataSource
                .inspect_agent_app_local_package(params)
                .await
        }

        async fn fetch_agent_app_cloud_package(
            &self,
            params: AgentAppFetchCloudPackageParams,
        ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
            NoopAppDataSource
                .fetch_agent_app_cloud_package(params)
                .await
        }

        async fn save_agent_app_installed(
            &self,
            params: AgentAppInstalledSaveParams,
        ) -> Result<serde_json::Value, RuntimeCoreError> {
            NoopAppDataSource.save_agent_app_installed(params).await
        }

        async fn set_agent_app_installed_disabled(
            &self,
            params: AgentAppInstalledDisabledSetParams,
        ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .set_agent_app_installed_disabled(params)
                .await
        }

        async fn preview_agent_app_uninstall(
            &self,
            params: AgentAppUninstallRehearsalParams,
        ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
            NoopAppDataSource.preview_agent_app_uninstall(params).await
        }

        async fn uninstall_agent_app(
            &self,
            params: AgentAppUninstallParams,
        ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
            NoopAppDataSource.uninstall_agent_app(params).await
        }

        async fn list_knowledge_packs(
            &self,
            params: KnowledgeListPacksParams,
        ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
            NoopAppDataSource.list_knowledge_packs(params).await
        }

        async fn read_knowledge_pack(
            &self,
            params: KnowledgeReadPackParams,
        ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
            NoopAppDataSource.read_knowledge_pack(params).await
        }

        async fn import_knowledge_source(
            &self,
            params: KnowledgeImportSourceParams,
        ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
            NoopAppDataSource.import_knowledge_source(params).await
        }

        async fn compile_knowledge_pack(
            &self,
            request: lime_knowledge::KnowledgeCompilePackRequest,
        ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
            self.knowledge_compile_requests
                .lock()
                .expect("test knowledge compile requests mutex poisoned")
                .push(request.clone());
            let response = lime_knowledge::compile_knowledge_pack(request)
                .map_err(RuntimeCoreError::Backend)?;
            Ok(KnowledgeCompilePackResponse {
                pack: serde_json::to_value(response.pack)
                    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?,
                selected_source_count: response.selected_source_count,
                compiled_view: serde_json::to_value(response.compiled_view)
                    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?,
                run: serde_json::to_value(response.run)
                    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?,
                warnings: response.warnings,
            })
        }

        async fn set_default_knowledge_pack(
            &self,
            params: KnowledgeSetDefaultPackParams,
        ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
            NoopAppDataSource.set_default_knowledge_pack(params).await
        }

        async fn update_knowledge_pack_status(
            &self,
            params: KnowledgeUpdatePackStatusParams,
        ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
            NoopAppDataSource.update_knowledge_pack_status(params).await
        }

        async fn resolve_knowledge_context(
            &self,
            params: KnowledgeResolveContextParams,
        ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
            NoopAppDataSource.resolve_knowledge_context(params).await
        }

        async fn validate_knowledge_context_run(
            &self,
            params: KnowledgeValidateContextRunParams,
        ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
            NoopAppDataSource
                .validate_knowledge_context_run(params)
                .await
        }

        async fn list_automation_jobs(
            &self,
        ) -> Result<AutomationJobListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_automation_jobs().await
        }

        async fn read_project_memory(
            &self,
            params: ProjectMemoryReadParams,
        ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_project_memory(params).await
        }

        async fn get_gallery_material(
            &self,
            params: GalleryMaterialLookupParams,
        ) -> Result<GalleryMaterialResponse, RuntimeCoreError> {
            NoopAppDataSource.get_gallery_material(params).await
        }

        async fn create_gallery_material_metadata(
            &self,
            params: GalleryMaterialMetadataCreateParams,
        ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
            NoopAppDataSource
                .create_gallery_material_metadata(params)
                .await
        }

        async fn get_gallery_material_metadata(
            &self,
            params: GalleryMaterialLookupParams,
        ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
            NoopAppDataSource
                .get_gallery_material_metadata(params)
                .await
        }

        async fn update_gallery_material_metadata(
            &self,
            params: GalleryMaterialMetadataUpdateParams,
        ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
            NoopAppDataSource
                .update_gallery_material_metadata(params)
                .await
        }

        async fn delete_gallery_material_metadata(
            &self,
            params: GalleryMaterialLookupParams,
        ) -> Result<GalleryMaterialDeleteResponse, RuntimeCoreError> {
            NoopAppDataSource
                .delete_gallery_material_metadata(params)
                .await
        }

        async fn list_gallery_materials_by_image_category(
            &self,
            params: GalleryMaterialFilterParams,
        ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_gallery_materials_by_image_category(params)
                .await
        }

        async fn list_gallery_materials_by_layout_category(
            &self,
            params: GalleryMaterialFilterParams,
        ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_gallery_materials_by_layout_category(params)
                .await
        }

        async fn list_gallery_materials_by_mood(
            &self,
            params: GalleryMaterialFilterParams,
        ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_gallery_materials_by_mood(params)
                .await
        }

        async fn list_project_materials(
            &self,
            params: ProjectMaterialListParams,
        ) -> Result<ProjectMaterialListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_project_materials(params).await
        }

        async fn get_project_material(
            &self,
            params: ProjectMaterialLookupParams,
        ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
            NoopAppDataSource.get_project_material(params).await
        }

        async fn count_project_materials(
            &self,
            params: ProjectMaterialListParams,
        ) -> Result<ProjectMaterialCountResponse, RuntimeCoreError> {
            NoopAppDataSource.count_project_materials(params).await
        }

        async fn upload_project_material(
            &self,
            params: ProjectMaterialUploadParams,
        ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
            NoopAppDataSource.upload_project_material(params).await
        }

        async fn import_project_material_from_url(
            &self,
            params: ProjectMaterialImportFromUrlParams,
        ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
            NoopAppDataSource
                .import_project_material_from_url(params)
                .await
        }

        async fn update_project_material(
            &self,
            params: ProjectMaterialUpdateParams,
        ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
            NoopAppDataSource.update_project_material(params).await
        }

        async fn delete_project_material(
            &self,
            params: ProjectMaterialLookupParams,
        ) -> Result<ProjectMaterialDeleteResponse, RuntimeCoreError> {
            NoopAppDataSource.delete_project_material(params).await
        }

        async fn read_project_material_content(
            &self,
            params: ProjectMaterialLookupParams,
        ) -> Result<ProjectMaterialContentResponse, RuntimeCoreError> {
            NoopAppDataSource
                .read_project_material_content(params)
                .await
        }

        async fn list_voice_asr_credentials(
            &self,
        ) -> Result<VoiceAsrCredentialListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_voice_asr_credentials().await
        }

        async fn create_voice_asr_credential(
            &self,
            params: VoiceAsrCredentialCreateParams,
        ) -> Result<VoiceAsrCredentialWriteResponse, RuntimeCoreError> {
            NoopAppDataSource.create_voice_asr_credential(params).await
        }

        async fn update_voice_asr_credential(
            &self,
            params: VoiceAsrCredentialUpdateParams,
        ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
            NoopAppDataSource.update_voice_asr_credential(params).await
        }

        async fn delete_voice_asr_credential(
            &self,
            params: VoiceAsrCredentialIdParams,
        ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
            NoopAppDataSource.delete_voice_asr_credential(params).await
        }

        async fn set_default_voice_asr_credential(
            &self,
            params: VoiceAsrCredentialIdParams,
        ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
            NoopAppDataSource
                .set_default_voice_asr_credential(params)
                .await
        }

        async fn test_voice_asr_credential(
            &self,
            params: VoiceAsrCredentialIdParams,
        ) -> Result<VoiceAsrCredentialTestResponse, RuntimeCoreError> {
            NoopAppDataSource.test_voice_asr_credential(params).await
        }

        async fn test_transcribe_voice_model_file(
            &self,
            params: VoiceModelTestTranscribeFileParams,
        ) -> Result<VoiceModelTestTranscribeFileResponse, RuntimeCoreError> {
            NoopAppDataSource
                .test_transcribe_voice_model_file(params)
                .await
        }

        async fn list_voice_instructions(
            &self,
        ) -> Result<VoiceInstructionListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_voice_instructions().await
        }

        async fn save_voice_instruction(
            &self,
            params: VoiceInstructionSaveParams,
        ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
            NoopAppDataSource.save_voice_instruction(params).await
        }

        async fn delete_voice_instruction(
            &self,
            params: VoiceInstructionIdParams,
        ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
            NoopAppDataSource.delete_voice_instruction(params).await
        }

        async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_logs().await
        }

        async fn read_persisted_log_tail(
            &self,
            params: LogPersistedTailParams,
        ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
            NoopAppDataSource.read_persisted_log_tail(params).await
        }

        async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
            NoopAppDataSource.clear_logs().await
        }

        async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
            NoopAppDataSource.clear_diagnostic_log_history().await
        }

        async fn read_log_storage_diagnostics(
            &self,
        ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
            NoopAppDataSource.read_log_storage_diagnostics().await
        }

        async fn export_support_bundle(
            &self,
        ) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
            NoopAppDataSource.export_support_bundle().await
        }

        async fn read_windows_startup_diagnostics(
            &self,
        ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
            NoopAppDataSource.read_windows_startup_diagnostics().await
        }

        async fn read_usage_stats(
            &self,
            params: UsageStatsRangeParams,
        ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_usage_stats(params).await
        }

        async fn list_usage_stats_model_ranking(
            &self,
            params: UsageStatsRangeParams,
        ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_usage_stats_model_ranking(params)
                .await
        }

        async fn list_usage_stats_daily_trends(
            &self,
            params: UsageStatsRangeParams,
        ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
            NoopAppDataSource
                .list_usage_stats_daily_trends(params)
                .await
        }

        async fn list_models(
            &self,
            params: ModelListParams,
        ) -> Result<ModelListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_models(params).await
        }

        async fn list_model_preferences(
            &self,
        ) -> Result<ModelPreferencesListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_model_preferences().await
        }

        async fn read_model_sync_state(
            &self,
        ) -> Result<ModelSyncStateReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_model_sync_state().await
        }

        async fn list_model_providers(
            &self,
        ) -> Result<ModelProviderListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_model_providers().await
        }

        async fn list_model_provider_catalog(
            &self,
        ) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_model_provider_catalog().await
        }

        async fn read_model_provider_alias(
            &self,
            params: ModelProviderAliasReadParams,
        ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError> {
            NoopAppDataSource.read_model_provider_alias(params).await
        }

        async fn list_model_provider_aliases(
            &self,
        ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError> {
            NoopAppDataSource.list_model_provider_aliases().await
        }
    }

    #[tokio::test]
    async fn knowledge_compile_pack_runs_builder_runtime_executor_on_current_path() {
        let temp = tempfile::tempdir().expect("create temp dir");
        let working_dir = temp.path().to_string_lossy().to_string();
        lime_knowledge::import_knowledge_source(lime_knowledge::KnowledgeImportSourceRequest {
            working_dir: working_dir.clone(),
            pack_name: "runtime-founder".to_string(),
            description: Some("Runtime 创始人".to_string()),
            pack_type: Some("personal-ip".to_string()),
            language: Some("zh-CN".to_string()),
            source_file_name: Some("interview.md".to_string()),
            source_text: Some("她强调长期主义，也提醒不要夸大收入。".to_string()),
        })
        .expect("import source");

        let app_data_source = Arc::new(TestCurrentTimelineDataSource::new(
            empty_agent_session_read_response("knowledge-builder-session"),
        ));
        let executor = Arc::new(TestKnowledgeBuilderRuntimeExecutor::new());
        let core = RuntimeCore::with_backend(Arc::new(MockBackend))
            .with_app_data_source(app_data_source.clone())
            .with_knowledge_builder_runtime_executor(executor.clone());

        let response = core
            .compile_knowledge_pack(KnowledgeCompilePackParams {
                working_dir: working_dir.clone(),
                name: "runtime-founder".to_string(),
                builder_runtime: Some(json!({
                    "enabled": true,
                    "providerOverride": "openai",
                    "modelOverride": "gpt-4o",
                    "sessionId": "builder-session-1"
                })),
            })
            .await
            .expect("compile knowledge pack");

        let calls = executor.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_name, "personal-ip-knowledge-builder");
        assert_eq!(calls[0].session_id, "builder-session-1");
        assert_eq!(calls[0].provider_override.as_deref(), Some("openai"));
        assert_eq!(calls[0].model_override.as_deref(), Some("gpt-4o"));

        let requests = app_data_source.knowledge_compile_requests();
        assert_eq!(requests.len(), 1);
        assert!(requests[0].builder_execution.is_some());
        assert!(response
            .warnings
            .iter()
            .any(|warning| warning.contains("代表案例待补充")));
        let produced_by = response
            .pack
            .pointer("/metadata/metadata/producedBy")
            .expect("producedBy metadata");
        assert_eq!(
            produced_by
                .pointer("/runtimeBinding/executed")
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert_eq!(
            produced_by
                .pointer("/runtimeBinding/executionId")
                .and_then(serde_json::Value::as_str),
            requests[0]
                .builder_execution
                .as_ref()
                .map(|execution| execution.execution_id.as_str())
        );
    }

    #[derive(Default)]
    struct TestEvidenceExportProvider {
        call_count: AtomicUsize,
        requests: Mutex<Vec<EvidencePackRequest>>,
        completion_audit_summary: Option<serde_json::Value>,
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
                completion_audit_summary: Some(
                    self.completion_audit_summary.clone().unwrap_or_else(|| {
                        json!({
                            "decision": "in_progress"
                        })
                    }),
                ),
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
    async fn queue_session_controls_use_current_runtime_core_read_model() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_queue".to_string()),
            thread_id: Some("thread_queue".to_string()),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("workspace-current".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_queue".to_string(),
                turn_id: Some("turn_running".to_string()),
                input: AgentInput {
                    text: "running".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    provider_preference: Some("fixture-provider".to_string()),
                    model_preference: Some("fixture-model".to_string()),
                    host_options: Some(json!({
                        "asterChatRequest": {
                            "provider_config": {
                                "provider_id": "fixture-provider",
                                "provider_name": "openai",
                                "model_name": "fixture-model",
                                "api_key": "fixture-key",
                                "base_url": "http://127.0.0.1:65535"
                            }
                        }
                    })),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("running turn");
        let queued = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_queue".to_string(),
                    turn_id: Some("turn_queued".to_string()),
                    input: AgentInput {
                        text: "queued".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: true,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("queued turn");
        assert_eq!(queued.response.turn.status, AgentTurnStatus::Queued);
        assert!(queued
            .events
            .iter()
            .any(|event| event.event_type == "queue.added"));

        let promoted = core
            .promote_agent_session_queued_turn(AgentSessionQueuedTurnPromoteParams {
                session_id: "sess_queue".to_string(),
                queued_turn_id: "turn_queued".to_string(),
            })
            .await
            .expect("promote");
        assert!(promoted.response.promoted);
        assert_eq!(
            promoted.response.turns[1].turn_id, "turn_queued",
            "only one queued turn keeps its position after active turn"
        );

        let blocked_resume = core
            .resume_agent_session_thread(
                AgentSessionThreadResumeParams {
                    session_id: "sess_queue".to_string(),
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("blocked resume");
        assert!(!blocked_resume.response.resumed);

        core.append_external_runtime_events(
            "sess_queue",
            Some("turn_running"),
            vec![RuntimeEvent::new("turn.completed", json!({}))],
        )
        .expect("complete running");
        let resumed = core
            .resume_agent_session_thread(
                AgentSessionThreadResumeParams {
                    session_id: "sess_queue".to_string(),
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("resume queued");
        assert!(resumed.response.resumed);
        assert!(resumed
            .response
            .turns
            .iter()
            .any(|turn| turn.turn_id == "turn_queued" && turn.status == AgentTurnStatus::Accepted));

        let second_queued = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_queue".to_string(),
                    turn_id: Some("turn_remove".to_string()),
                    input: AgentInput {
                        text: "remove".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: true,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("second queued");
        assert_eq!(second_queued.response.turn.status, AgentTurnStatus::Queued);
        let removed = core
            .remove_agent_session_queued_turn(AgentSessionQueuedTurnRemoveParams {
                session_id: "sess_queue".to_string(),
                queued_turn_id: "turn_remove".to_string(),
            })
            .await
            .expect("remove queued");
        assert!(removed.response.removed);
        assert!(!removed
            .response
            .turns
            .iter()
            .any(|turn| turn.turn_id == "turn_remove"));
    }

    #[tokio::test]
    async fn resume_queued_turn_restores_queue_when_backend_fails_before_emit() {
        let core = RuntimeCore::with_backend(Arc::new(FailBeforeEmitBackend {
            start_count: AtomicUsize::new(0),
        }));
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_queue_rollback".to_string()),
            thread_id: Some("thread_queue_rollback".to_string()),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("workspace-current".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_queue_rollback".to_string(),
                turn_id: Some("turn_running".to_string()),
                input: AgentInput {
                    text: "running".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    provider_preference: Some("fixture-provider".to_string()),
                    model_preference: Some("fixture-model".to_string()),
                    host_options: Some(json!({
                        "asterChatRequest": {
                            "provider_config": {
                                "provider_id": "fixture-provider",
                                "provider_name": "openai",
                                "model_name": "fixture-model",
                                "api_key": "fixture-key",
                                "base_url": "http://127.0.0.1:65535"
                            }
                        }
                    })),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("running turn");
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_queue_rollback".to_string(),
                turn_id: Some("turn_queued".to_string()),
                input: AgentInput {
                    text: "queued".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    provider_preference: Some("fixture-provider".to_string()),
                    model_preference: Some("fixture-model".to_string()),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: true,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("queued turn");
        core.append_external_runtime_events(
            "sess_queue_rollback",
            Some("turn_running"),
            vec![RuntimeEvent::new("turn.completed", json!({}))],
        )
        .expect("complete running");

        let error = core
            .resume_agent_session_thread(
                AgentSessionThreadResumeParams {
                    session_id: "sess_queue_rollback".to_string(),
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("resume should fail before backend emits");
        assert!(matches!(error, RuntimeCoreError::Backend(_)));

        let read = core
            .read_session_current(AgentSessionReadParams {
                session_id: "sess_queue_rollback".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await
            .expect("read session");
        assert!(read
            .turns
            .iter()
            .any(|turn| turn.turn_id == "turn_queued" && turn.status == AgentTurnStatus::Queued));
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

    #[tokio::test]
    async fn objective_continue_fails_closed_when_pending_requests_exist() {
        let mut persisted = empty_agent_session_read_response("sess_objective_continue");
        persisted.session.workspace_id = Some("workspace-main".to_string());
        persisted.detail = Some(json!({
            "thread_read": {
                "pending_requests": [
                    {
                        "id": "request-1",
                        "type": "ask_user"
                    }
                ],
                "queued_turns": []
            }
        }));
        let app_data_source = Arc::new(
            TestCurrentTimelineDataSource::new(persisted)
                .with_objective(managed_objective("sess_objective_continue")),
        );
        let backend = Arc::new(RecordingBackend::default());
        let core = RuntimeCore::with_backend(backend.clone())
            .with_app_data_source(app_data_source.clone());

        let error = core
            .continue_agent_session_objective(
                AgentSessionObjectiveContinueParams {
                    session_id: "sess_objective_continue".to_string(),
                    owner_kind: None,
                    owner_id: None,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("pending request should block objective continuation");

        assert!(error
            .to_string()
            .contains("当前会话还有 1 个待处理请求，不能继续推进目标"));
        assert!(backend
            .requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .is_empty());
    }

    #[tokio::test]
    async fn objective_continue_uses_host_provider_config_without_runtime_explicit_preferences() {
        let session_id = "sess_objective_continue_provider_config";
        let mut persisted = empty_agent_session_read_response(session_id);
        persisted.session.workspace_id = Some("workspace-main".to_string());
        let app_data_source = Arc::new(
            TestCurrentTimelineDataSource::new(persisted)
                .with_objective(managed_objective(session_id)),
        );
        let backend = Arc::new(FinalDoneRecordingBackend {
            requests: Mutex::new(Vec::new()),
        });
        let core = RuntimeCore::with_backend(backend.clone())
            .with_app_data_source(app_data_source.clone());
        core.start_session(AgentSessionStartParams {
            session_id: Some(session_id.to_string()),
            thread_id: Some("thread_objective_continue_provider_config".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: session_id.to_string(),
                turn_id: Some("turn_initial".to_string()),
                input: AgentInput {
                    text: "首轮".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    provider_preference: Some("fixture-provider".to_string()),
                    model_preference: Some("fixture-model".to_string()),
                    host_options: Some(json!({
                        "asterChatRequest": {
                            "turnConfig": {
                                "providerConfig": {
                                    "provider_id": "fixture-provider",
                                    "provider_name": "openai",
                                    "model_name": "fixture-model",
                                    "api_key": "fixture-key",
                                    "base_url": "http://127.0.0.1:65535"
                                },
                                "providerPreference": "fixture-provider",
                                "modelPreference": "fixture-model",
                                "approvalPolicy": "never",
                                "sandboxPolicy": "read-only"
                            }
                        }
                    })),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("initial turn");

        core.continue_agent_session_objective(
            AgentSessionObjectiveContinueParams {
                session_id: session_id.to_string(),
                owner_kind: None,
                owner_id: None,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("continue objective");

        let requests = backend
            .requests
            .lock()
            .expect("test backend requests mutex poisoned");
        assert_eq!(requests.len(), 2);
        let continuation_request = &requests[1];
        assert_eq!(continuation_request.provider_preference, None);
        assert_eq!(continuation_request.model_preference, None);
        let runtime_options = continuation_request
            .runtime_options
            .as_ref()
            .expect("runtime options");
        assert_eq!(runtime_options.provider_preference, None);
        assert_eq!(runtime_options.model_preference, None);
        let host_options = runtime_options.host_options.as_ref().expect("host options");
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/provider_config/base_url")
                .and_then(serde_json::Value::as_str),
            Some("http://127.0.0.1:65535")
        );
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/turn_config/provider_config/base_url")
                .and_then(serde_json::Value::as_str),
            Some("http://127.0.0.1:65535")
        );
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/turn_config/provider_preference")
                .and_then(serde_json::Value::as_str),
            Some("fixture-provider")
        );
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/turn_config/approval_policy")
                .and_then(serde_json::Value::as_str),
            Some("never")
        );
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/turn_config/sandbox_policy")
                .and_then(serde_json::Value::as_str),
            Some("read-only")
        );
    }

    #[tokio::test]
    async fn managed_objective_auto_continuation_submits_current_turn_after_terminal_turn() {
        let mut persisted = empty_agent_session_read_response("sess_objective_auto_allow");
        persisted.session.workspace_id = Some("workspace-main".to_string());
        let mut objective = managed_objective("sess_objective_auto_allow");
        objective.risk_policy = Some(json!({ "allowAutoContinuation": true }));
        objective.continuation_policy = Some(json!({
            "autoIdle": true,
            "maxAutoTurns": 1,
            "maxElapsedMs": 180000
        }));
        objective.budget_policy = Some(json!({ "maxTurns": 1 }));
        let app_data_source =
            Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
        let backend = Arc::new(RecordingBackend::default());
        let core = RuntimeCore::with_backend(backend.clone())
            .with_app_data_source(app_data_source.clone());
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_objective_auto_allow".to_string()),
            thread_id: Some("thread_objective_auto_allow".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_objective_auto_allow".to_string(),
                turn_id: Some("turn_initial".to_string()),
                input: AgentInput {
                    text: "首轮".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    provider_preference: Some("fixture-provider".to_string()),
                    model_preference: Some("fixture-model".to_string()),
                    host_options: Some(json!({
                        "asterChatRequest": {
                            "turnConfig": {
                                "providerConfig": {
                                    "provider_id": "fixture-provider",
                                    "provider_name": "openai",
                                    "model_name": "fixture-model",
                                    "api_key": "fixture-key",
                                    "base_url": "http://127.0.0.1:65535"
                                },
                                "providerPreference": "fixture-provider",
                                "modelPreference": "fixture-model",
                                "approvalPolicy": "never",
                                "sandboxPolicy": "read-only"
                            }
                        }
                    })),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("initial turn");
        core.append_external_runtime_events(
            "sess_objective_auto_allow",
            Some("turn_initial"),
            vec![RuntimeEvent::new("turn.completed", json!({}))],
        )
        .expect("complete initial turn");
        core.maybe_submit_managed_objective_auto_continuation(
            "sess_objective_auto_allow",
            RuntimeHostContext::default(),
        )
        .await;

        let audit_updates = app_data_source.audit_updates();
        assert_eq!(audit_updates.len(), 1);
        let summary = audit_updates[0]
            .last_audit_summary
            .as_deref()
            .unwrap_or_default();
        assert!(summary.contains("auto_continuation_guard decision=allow"));
        assert!(summary.contains("queued_turn_id="));

        let requests = backend
            .requests
            .lock()
            .expect("test backend requests mutex poisoned");
        assert_eq!(requests.len(), 2);
        let auto_request = &requests[1];
        assert_eq!(auto_request.session.session_id, "sess_objective_auto_allow");
        assert_eq!(auto_request.queue_if_busy, false);
        assert_eq!(auto_request.provider_preference, None);
        assert_eq!(auto_request.model_preference, None);
        let runtime_options = auto_request
            .runtime_options
            .as_ref()
            .expect("runtime options");
        assert_eq!(runtime_options.provider_preference, None);
        assert_eq!(runtime_options.model_preference, None);
        let host_options = runtime_options.host_options.as_ref().expect("host options");
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/provider_config/base_url")
                .and_then(serde_json::Value::as_str),
            Some("http://127.0.0.1:65535")
        );
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/turn_config/provider_config/base_url")
                .and_then(serde_json::Value::as_str),
            Some("http://127.0.0.1:65535")
        );
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/turn_config/provider_preference")
                .and_then(serde_json::Value::as_str),
            Some("fixture-provider")
        );
        assert_eq!(
            host_options
                .pointer("/asterChatRequest/turn_config/approval_policy")
                .and_then(serde_json::Value::as_str),
            Some("never")
        );
        let managed_objective = auto_request
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.pointer("/harness/managed_objective"))
            .expect("managed objective metadata");
        assert_eq!(
            managed_objective
                .get("continuation_source")
                .and_then(serde_json::Value::as_str),
            Some("auto_idle")
        );
        assert!(managed_objective.get("auto_continuation_guard").is_some());
    }

    #[tokio::test]
    async fn managed_objective_auto_continuation_stops_at_budget_after_auto_turn() {
        let mut persisted = empty_agent_session_read_response("sess_objective_auto_budget");
        persisted.session.workspace_id = Some("workspace-main".to_string());
        let mut objective = managed_objective("sess_objective_auto_budget");
        objective.risk_policy = Some(json!({ "allowAutoContinuation": true }));
        objective.continuation_policy = Some(json!({
            "autoIdle": true,
            "maxAutoTurns": 1,
            "maxElapsedMs": 180000
        }));
        objective.budget_policy = Some(json!({ "maxTurns": 1 }));
        let app_data_source =
            Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
        let backend = Arc::new(FinalDoneRecordingBackend {
            requests: Mutex::new(Vec::new()),
        });
        let core = RuntimeCore::with_backend(backend.clone())
            .with_app_data_source(app_data_source.clone());
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_objective_auto_budget".to_string()),
            thread_id: Some("thread_objective_auto_budget".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_objective_auto_budget".to_string(),
                turn_id: Some("turn_initial".to_string()),
                input: AgentInput {
                    text: "首轮".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("initial turn with auto continuation");

        let objective = app_data_source.objective().expect("objective");
        assert_eq!(objective.status, ManagedObjectiveStatus::BudgetLimited);
        let summary = objective.last_audit_summary.as_deref().unwrap_or_default();
        assert!(summary.contains("auto_continuation_guard decision=budget_limited"));
        assert!(summary.contains("decision=allow"));
        assert!(summary.contains("auto_turns=1/1"));

        let requests = backend
            .requests
            .lock()
            .expect("test backend requests mutex poisoned");
        assert_eq!(requests.len(), 2);
        assert!(requests[1]
            .metadata
            .as_ref()
            .and_then(
                |metadata| metadata.pointer("/harness/managed_objective/auto_continuation_guard")
            )
            .is_some());
    }

    #[tokio::test]
    async fn action_replay_rebuilds_current_pending_action_from_runtime_events() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_action_replay".to_string()),
            thread_id: Some("thread_action_replay".to_string()),
            app_id: "agent-runtime".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.append_external_runtime_events(
            "sess_action_replay",
            None,
            vec![RuntimeEvent::new(
                "action.required",
                json!({
                    "requestId": "req-replay",
                    "actionType": "elicitation",
                    "data": {
                        "message": "请补充发布渠道",
                        "requestedSchema": {
                            "type": "object",
                            "properties": {
                                "channel": { "type": "string" }
                            }
                        }
                    },
                    "scope": {
                        "sessionId": "sess_action_replay",
                        "threadId": "thread_action_replay",
                        "turnId": "turn_action_replay"
                    }
                }),
            )],
        )
        .expect("append action event");

        let response = core
            .replay_action(AgentSessionActionReplayParams {
                session_id: "sess_action_replay".to_string(),
                request_id: "req-replay".to_string(),
            })
            .await
            .expect("replay action");
        let action = response
            .response
            .action
            .expect("pending action should be replayed");

        assert_eq!(action.event_type, "action_required");
        assert_eq!(action.request_id, "req-replay");
        assert_eq!(action.action_type, AgentSessionActionType::Elicitation);
        assert_eq!(action.prompt.as_deref(), Some("请补充发布渠道"));
        assert!(action.requested_schema.is_some());
        assert_eq!(
            action.scope.and_then(|scope| scope.turn_id),
            Some("turn_action_replay".to_string())
        );

        core.append_external_runtime_events(
            "sess_action_replay",
            None,
            vec![RuntimeEvent::new(
                "action.resolved",
                json!({
                    "requestId": "req-replay",
                    "actionType": "elicitation",
                    "confirmed": true
                }),
            )],
        )
        .expect("append resolved event");

        let resolved = core
            .replay_action(AgentSessionActionReplayParams {
                session_id: "sess_action_replay".to_string(),
                request_id: "req-replay".to_string(),
            })
            .await
            .expect("replay resolved action");
        assert!(resolved.response.action.is_none());
    }

    #[tokio::test]
    async fn managed_objective_auto_continuation_submits_and_budget_limits_on_current_path() {
        let session_id = "sess_auto_objective";
        let mut objective = managed_objective(session_id);
        objective.continuation_policy = Some(json!({
            "autoIdle": true,
            "maxAutoTurns": 1,
            "maxElapsedMs": 180000,
            "maxEstimatedTotalCost": 1.0
        }));
        objective.budget_policy = Some(json!({
            "maxTurns": 1
        }));
        objective.risk_policy = Some(json!({
            "allowAutoContinuation": true
        }));
        let mut persisted = empty_agent_session_read_response(session_id);
        persisted.session.workspace_id = Some("workspace-main".to_string());
        let app_data_source =
            Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
        let backend = Arc::new(FinalDoneBackend);
        let core = RuntimeCore::with_backend(backend).with_app_data_source(app_data_source.clone());
        core.start_session(AgentSessionStartParams {
            session_id: Some(session_id.to_string()),
            thread_id: Some("thread_auto_objective".to_string()),
            app_id: "agent-runtime".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: session_id.to_string(),
                turn_id: Some("turn_initial".to_string()),
                input: AgentInput {
                    text: "initial".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    provider_preference: Some("fixture-provider".to_string()),
                    model_preference: Some("fixture-model".to_string()),
                    metadata: Some(json!({
                        "harness": {
                            "managed_objective_smoke": {
                                "source": "unit"
                            }
                        }
                    })),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: true,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("initial turn");

        let read_after_initial = core
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await
            .expect("read after initial");
        assert_eq!(read_after_initial.turns.len(), 2);
        assert!(read_after_initial
            .turns
            .iter()
            .all(|turn| { matches!(turn.status, AgentTurnStatus::Completed) }));

        let final_objective = app_data_source.objective().expect("final objective");
        assert_eq!(
            final_objective.status,
            ManagedObjectiveStatus::BudgetLimited
        );
        assert!(final_objective
            .last_audit_summary
            .as_deref()
            .unwrap_or_default()
            .contains("auto_continuation_guard decision=budget_limited"));
        assert!(final_objective
            .last_audit_summary
            .as_deref()
            .unwrap_or_default()
            .contains("decision=allow"));
        assert!(final_objective
            .last_audit_summary
            .as_deref()
            .unwrap_or_default()
            .contains("auto_turns=1/1"));
        assert!(final_objective
            .blocker_reason
            .as_deref()
            .unwrap_or_default()
            .contains("最大轮数"));

        let final_read = core
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await
            .expect("final read");
        assert_eq!(final_read.turns.len(), 2);
        assert!(final_read.turns.iter().any(|turn| {
            turn.turn_id != "turn_initial" && matches!(turn.status, AgentTurnStatus::Completed)
        }));

        let evidence = core
            .export_evidence(EvidenceExportParams {
                session_id: session_id.to_string(),
                turn_id: None,
                include_events: Some(true),
                include_artifacts: Some(true),
                include_evidence_pack: Some(true),
            })
            .await
            .expect("export evidence");
        let evidence_pack = evidence.evidence_pack.expect("objective evidence pack");
        assert_eq!(
            evidence_pack
                .completion_audit_summary
                .as_ref()
                .and_then(|summary| summary.get("decision"))
                .and_then(serde_json::Value::as_str),
            Some("budget_limited")
        );
        assert_eq!(evidence_pack.turn_count, 2);
    }

    #[tokio::test]
    async fn objective_audit_writes_current_evidence_pack_decision() {
        let provider = Arc::new(TestEvidenceExportProvider {
            completion_audit_summary: Some(json!({
                "decision": "completed",
                "artifactCount": 1,
                "checkedCriteria": [
                    {
                        "criterion": "契约通过",
                        "satisfied": true
                    }
                ]
            })),
            ..TestEvidenceExportProvider::default()
        });
        let mut persisted = empty_agent_session_read_response("sess_objective_audit");
        persisted.session.workspace_id = Some("workspace-main".to_string());
        let app_data_source = Arc::new(
            TestCurrentTimelineDataSource::new(persisted)
                .with_objective(managed_objective("sess_objective_audit")),
        );
        let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        )
        .with_app_data_source(app_data_source.clone());
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_objective_audit".to_string()),
            thread_id: Some("thread_objective_audit".to_string()),
            app_id: "agent-runtime".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.append_external_runtime_events(
            "sess_objective_audit",
            None,
            vec![RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-report",
                    "path": ".lime/artifacts/report.md"
                }),
            )],
        )
        .expect("append evidence event");

        let response = core
            .audit_agent_session_objective(AgentSessionObjectiveAuditParams {
                session_id: "sess_objective_audit".to_string(),
                owner_kind: None,
                owner_id: None,
            })
            .await
            .expect("audit objective");

        assert_eq!(provider.call_count.load(Ordering::SeqCst), 1);
        assert_eq!(response.objective.status, ManagedObjectiveStatus::Completed);
        assert!(response
            .objective
            .last_audit_summary
            .as_deref()
            .unwrap_or_default()
            .contains("decision=completed"));
        assert_eq!(
            response.objective.last_evidence_pack_ref.as_deref(),
            Some("/workspace/.lime/harness/sessions/sess_evidence/evidence")
        );
        assert_eq!(app_data_source.audit_updates().len(), 1);
    }

    #[tokio::test]
    async fn read_session_projects_runtime_turns_into_gui_messages() {
        let core = RuntimeCore::with_backend(Arc::new(FinalDoneBackend));
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_messages".to_string()),
            thread_id: Some("thread_messages".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "sess_messages".to_string(),
                title: Some("Messages Read".to_string()),
                uri: None,
                metadata: None,
            }),
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_messages".to_string(),
                turn_id: Some("turn_messages".to_string()),
                input: AgentInput {
                    text: "你好，帮我整理今天的计划".to_string(),
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

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: "sess_messages".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        let detail = read.detail.expect("session detail");
        let messages = detail["messages"].as_array().expect("messages");

        assert_eq!(detail["messages_count"], 2);
        assert_eq!(detail["history_cursor"]["loaded_count"], 2);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["id"], "turn_messages:user");
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(
            messages[0]["content"][0]["text"],
            "你好，帮我整理今天的计划"
        );
        assert_eq!(messages[1]["id"], "turn_messages:assistant");
        assert_eq!(messages[1]["role"], "assistant");
        assert_eq!(
            messages[1]["content"][0]["text"],
            "你好！有什么可以帮你的吗？"
        );
    }

    #[tokio::test]
    async fn read_session_projects_failed_runtime_event_into_diagnostics_and_error_item() {
        let core = RuntimeCore::with_backend(Arc::new(PartialFailureBackend));
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_failed_read".to_string()),
            thread_id: Some("thread_failed_read".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "sess_failed_read".to_string(),
                title: Some("Failed Read".to_string()),
                uri: None,
                metadata: None,
            }),
            locale: None,
        })
        .expect("session");

        let error = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_failed_read".to_string(),
                    turn_id: Some("turn_failed_read".to_string()),
                    input: AgentInput {
                        text: "整理今天的国际新闻".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("backend failure should propagate");
        let expected_error_message = error.to_string();
        assert!(expected_error_message.contains("provider stream timed out"));

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: "sess_failed_read".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read failed session");
        let detail = read.detail.expect("session detail");

        assert_eq!(
            detail["thread_read"]["diagnostics"]["latest_turn_status"],
            "failed"
        );
        assert_eq!(
            detail["thread_read"]["diagnostics"]["latest_turn_error_message"].as_str(),
            Some(expected_error_message.as_str())
        );
        assert_eq!(
            detail["thread_read"]["runtime_summary"]["latestTurnErrorMessage"].as_str(),
            Some(expected_error_message.as_str())
        );

        let messages = detail["messages"].as_array().expect("messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages[0]["content"][0]["text"], "整理今天的国际新闻");

        let items = detail["items"].as_array().expect("items");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["type"], "error");
        assert_eq!(items[0]["status"], "failed");
        assert_eq!(
            items[0]["message"].as_str(),
            Some(expected_error_message.as_str())
        );
    }

    #[tokio::test]
    async fn start_turn_hydrates_current_timeline_session_before_backend_submit() {
        let persisted_session = AgentSession {
            session_id: "sess_persisted".to_string(),
            thread_id: "thread_persisted".to_string(),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "sess_persisted".to_string(),
                title: Some("Persisted Session".to_string()),
                uri: None,
                metadata: Some(json!({
                    "model": "gpt-test",
                    "workingDir": "/workspace/current"
                })),
            }),
            status: AgentSessionStatus::Completed,
            created_at: "2026-06-06T00:00:00.000Z".to_string(),
            updated_at: "2026-06-06T00:00:10.000Z".to_string(),
        };
        let persisted_turn = AgentTurn {
            turn_id: "turn_existing".to_string(),
            session_id: persisted_session.session_id.clone(),
            thread_id: persisted_session.thread_id.clone(),
            status: AgentTurnStatus::Completed,
            started_at: Some("2026-06-06T00:00:01.000Z".to_string()),
            completed_at: Some("2026-06-06T00:00:09.000Z".to_string()),
        };
        let app_data_source = Arc::new(TestCurrentTimelineDataSource::new(
            AgentSessionReadResponse {
                session: persisted_session.clone(),
                turns: vec![persisted_turn],
                detail: None,
            },
        ));
        let backend = Arc::new(RecordingBackend::default());
        let core = RuntimeCore::with_backend_and_capability_source(
            backend.clone(),
            Arc::new(crate::CapabilityInventorySource::new(vec![
                crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: "session.resume".to_string(),
                    title: "Resume Session".to_string(),
                    description: None,
                    methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
                })
                .for_apps(["content-studio"])
                .for_workspaces(["workspace-main"])
                .for_sessions(["sess_persisted"]),
            ])),
        )
        .with_app_data_source(app_data_source.clone());

        let output = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_persisted".to_string(),
                    turn_id: Some("turn_resumed".to_string()),
                    input: AgentInput {
                        text: "继续".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("session.resume".to_string()),
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
            .expect("resumed turn");

        assert_eq!(output.response.turn.turn_id, "turn_resumed");
        let requests = backend
            .requests
            .lock()
            .expect("test backend requests mutex poisoned");
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].session.session_id, "sess_persisted");
        assert_eq!(requests[0].session.thread_id, "thread_persisted");
        assert_eq!(requests[0].turn.turn_id, "turn_resumed");
        drop(requests);

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: "sess_persisted".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("hydrated session remains readable");
        let turn_ids = read
            .turns
            .iter()
            .map(|turn| turn.turn_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(turn_ids, vec!["turn_existing", "turn_resumed"]);

        let read_requests = app_data_source.read_requests();
        assert_eq!(read_requests.len(), 1);
        assert_eq!(read_requests[0].session_id, "sess_persisted");
    }

    #[tokio::test]
    async fn read_session_projects_runtime_events_into_thread_read_tool_calls() {
        let core = RuntimeCore::with_backend(Arc::new(ToolReadModelBackend));
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_tool_read".to_string()),
            thread_id: Some("thread_tool_read".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "sess_tool_read".to_string(),
                title: Some("Tool Read".to_string()),
                uri: None,
                metadata: Some(json!({
                    "executionStrategy": "react"
                })),
            }),
            locale: None,
        })
        .expect("session");

        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_tool_read".to_string(),
                turn_id: Some("turn_tool_read".to_string()),
                input: AgentInput {
                    text: "整理今天的国际新闻".to_string(),
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

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: "sess_tool_read".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        let detail = read.detail.expect("session detail");
        assert_eq!(detail["execution_strategy"], "react");
        assert_eq!(detail["thread_read"]["status"], "completed");
        assert_eq!(detail["thread_read"]["execution_strategy"], "react");
        let tool_calls = detail["thread_read"]["tool_calls"]
            .as_array()
            .expect("tool calls");
        assert_eq!(tool_calls.len(), 2);
        let web_fetch = tool_calls
            .iter()
            .find(|call| call["tool_name"] == "WebFetch")
            .expect("WebFetch call");
        assert_eq!(web_fetch["status"], "completed");
        assert_eq!(web_fetch["success"], true);
        assert_eq!(web_fetch["output_preview"], "fetched https://example.com");

        let web_search = tool_calls
            .iter()
            .find(|call| call["tool_name"] == "WebSearch")
            .expect("WebSearch call");
        assert_eq!(web_search["id"], "search-call-1");
        assert_eq!(web_search["status"], "completed");
        assert_eq!(web_search["success"], true);
        assert_eq!(web_search["output_preview"], "search results");
    }

    #[tokio::test]
    async fn read_session_projects_runtime_events_into_thread_read_artifacts() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_thread_read_artifacts".to_string()),
            thread_id: Some("thread_read_artifacts".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let turn = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_thread_read_artifacts".to_string(),
                    turn_id: Some("turn_thread_read_artifacts".to_string()),
                    input: AgentInput {
                        text: "生成内容工厂产物".to_string(),
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
            "sess_thread_read_artifacts",
            Some(&turn.turn_id),
            vec![RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                        "artifactId": "artifact-content-batch",
                        "path": ".lime/artifacts/content-batch.json",
                        "title": "Content Batch",
                        "kind": "content_factory.workspace_patch",
                        "status": "ready",
                        "metadata": {
                            "contentFactoryWorkspacePatch": {
                                "kind": "content_batch",
                                "contentBatch": {
                                    "count": 1
                                }
                            }
                        }
                    }
                }),
            )],
        )
        .expect("append artifact event");

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: "sess_thread_read_artifacts".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        let detail = read.detail.expect("session detail");
        let artifacts = detail["thread_read"]["artifacts"]
            .as_array()
            .expect("thread read artifacts");

        assert_eq!(artifacts.len(), 1);
        assert_eq!(detail["artifacts"], detail["thread_read"]["artifacts"]);
        assert_eq!(artifacts[0]["artifactRef"], "artifact-content-batch");
        assert_eq!(artifacts[0]["path"], ".lime/artifacts/content-batch.json");
        assert_eq!(artifacts[0]["kind"], "content_factory.workspace_patch");
        assert_eq!(artifacts[0]["status"], "ready");
        assert_eq!(
            artifacts[0]["metadata"]["contentFactoryWorkspacePatch"]["kind"],
            "content_batch"
        );
        assert!(artifacts[0]["content"].is_null());
        assert_eq!(artifacts[0]["contentStatus"], "notRequested");
    }

    #[tokio::test]
    async fn start_turn_missing_current_timeline_session_still_fails_closed() {
        let app_data_source = Arc::new(TestCurrentTimelineDataSource {
            persisted: None,
            objective: Mutex::new(None),
            audit_updates: Mutex::new(Vec::new()),
            read_requests: Mutex::new(Vec::new()),
            knowledge_compile_requests: Mutex::new(Vec::new()),
        });
        let backend = Arc::new(RecordingBackend::default());
        let core = RuntimeCore::with_backend(backend.clone())
            .with_app_data_source(app_data_source.clone());

        let error = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_missing".to_string(),
                    turn_id: Some("turn_missing".to_string()),
                    input: AgentInput {
                        text: "继续".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("missing session should fail closed");

        assert_eq!(
            error.into_jsonrpc_error().code,
            error_codes::SESSION_NOT_FOUND
        );
        assert!(backend
            .requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .is_empty());
        let read_requests = app_data_source.read_requests();
        assert_eq!(read_requests.len(), 1);
        assert_eq!(read_requests[0].session_id, "sess_missing");
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
        let evidence_pack = response.evidence_pack.expect("basic evidence pack");
        assert_eq!(evidence_pack.thread_status, "running");
        assert_eq!(
            evidence_pack.latest_turn_status.as_deref(),
            Some("accepted")
        );
        assert_eq!(evidence_pack.turn_count, 1);
        assert_eq!(evidence_pack.item_count, 3);
        assert_eq!(evidence_pack.recent_artifact_count, 1);
        assert_eq!(
            evidence_pack
                .completion_audit_summary
                .as_ref()
                .and_then(|summary| summary.get("decision"))
                .and_then(serde_json::Value::as_str),
            Some("in_progress")
        );

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
    async fn export_handoff_bundle_writes_current_session_bundle_to_workspace() {
        let temp = tempfile::tempdir().expect("workspace");
        let workspace_root = temp.path().to_string_lossy().to_string();
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_handoff".to_string()),
            thread_id: Some("thread_handoff".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "sess_handoff".to_string(),
                title: Some("Current Handoff".to_string()),
                uri: None,
                metadata: Some(json!({
                    "workspaceRoot": workspace_root,
                    "model": "gpt-test",
                    "executionStrategy": "runtime-core"
                })),
            }),
            locale: None,
        })
        .expect("session");
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_handoff".to_string(),
                turn_id: Some("turn_handoff".to_string()),
                input: AgentInput {
                    text: "生成 handoff".to_string(),
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
            "sess_handoff",
            Some("turn_handoff"),
            vec![
                RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-handoff",
                        "path": ".app-server/artifacts/handoff.md",
                        "title": "Handoff Draft",
                        "kind": "markdown"
                    }),
                ),
                RuntimeEvent::new("turn.final_done", json!({})),
            ],
        )
        .expect("append events");

        let response = core
            .export_handoff_bundle(AgentSessionHandoffBundleExportParams {
                session_id: " sess_handoff ".to_string(),
                locale: Some("en-US".to_string()),
            })
            .await
            .expect("export handoff bundle");

        assert_eq!(response.session_id, "sess_handoff");
        assert_eq!(response.thread_id, "thread_handoff");
        assert_eq!(
            response.bundle_relative_root,
            ".lime/harness/sessions/sess_handoff"
        );
        assert_eq!(response.thread_status, "completed");
        assert_eq!(response.latest_turn_status.as_deref(), Some("completed"));
        assert_eq!(response.artifacts.len(), 4);
        let kinds = response
            .artifacts
            .iter()
            .map(|artifact| artifact.kind.as_str())
            .collect::<Vec<_>>();
        assert_eq!(kinds, vec!["plan", "progress", "handoff", "review_summary"]);
        for artifact in &response.artifacts {
            assert!(Path::new(&artifact.absolute_path).is_file());
            assert!(artifact
                .relative_path
                .starts_with(".lime/harness/sessions/sess_handoff/"));
            assert!(artifact.bytes > 0);
        }
        let progress_path = temp
            .path()
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join("sess_handoff")
            .join("progress.json");
        let progress = fs::read_to_string(progress_path).expect("progress.json");
        assert!(progress.contains("\"schemaVersion\": \"agent-session-handoff-bundle.v1\""));
        assert!(progress.contains(".app-server/artifacts/handoff.md"));
    }

    #[tokio::test]
    async fn export_runtime_review_residuals_write_current_session_artifacts() {
        let temp = tempfile::tempdir().expect("workspace");
        let workspace_root = temp.path().to_string_lossy().to_string();
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_review_export".to_string()),
            thread_id: Some("thread_review_export".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "sess_review_export".to_string(),
                title: Some("Review Export".to_string()),
                uri: None,
                metadata: Some(json!({
                    "workspaceRoot": workspace_root,
                })),
            }),
            locale: None,
        })
        .expect("session");
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_review_export".to_string(),
                turn_id: Some("turn_review_export".to_string()),
                input: AgentInput {
                    text: "生成 review export".to_string(),
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
            "sess_review_export",
            Some("turn_review_export"),
            vec![
                RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-review",
                        "path": ".app-server/artifacts/review.md",
                        "title": "Review Draft",
                        "kind": "markdown"
                    }),
                ),
                RuntimeEvent::new("turn.final_done", json!({})),
            ],
        )
        .expect("append events");

        let replay = core
            .export_replay_case(AgentSessionReplayCaseExportParams {
                session_id: "sess_review_export".to_string(),
                locale: None,
            })
            .await
            .expect("replay");
        assert_eq!(replay.artifacts.len(), 4);
        assert_eq!(replay.artifacts[0].kind, "input");
        assert!(Path::new(&replay.artifacts[0].absolute_path).is_file());

        let analysis = core
            .export_analysis_handoff(AgentSessionAnalysisHandoffExportParams {
                session_id: "sess_review_export".to_string(),
                locale: None,
            })
            .await
            .expect("analysis");
        assert_eq!(analysis.artifacts.len(), 2);
        assert_eq!(analysis.artifacts[0].kind, "analysis_brief");
        assert!(analysis.copy_prompt.contains("sess_review_export"));

        let review = core
            .export_review_decision_template(AgentSessionReviewDecisionTemplateExportParams {
                session_id: "sess_review_export".to_string(),
                locale: None,
            })
            .await
            .expect("review template");
        assert_eq!(review.artifacts.len(), 2);
        assert_eq!(review.decision.decision_status, "pending_review");

        let saved = core
            .save_review_decision(AgentSessionReviewDecisionSaveParams {
                session_id: "sess_review_export".to_string(),
                decision_status: "accepted".to_string(),
                decision_summary: "current path accepted".to_string(),
                chosen_fix_strategy: "keep app server path".to_string(),
                risk_level: "low".to_string(),
                risk_tags: vec!["runtime".to_string()],
                human_reviewer: "reviewer".to_string(),
                followup_actions: vec!["run contracts".to_string()],
                regression_requirements: vec!["npm run test:contracts".to_string()],
                notes: "done".to_string(),
                locale: None,
            })
            .await
            .expect("save review");
        assert_eq!(saved.decision.decision_status, "accepted");
        let review_json = fs::read_to_string(
            temp.path()
                .join(".lime")
                .join("harness")
                .join("sessions")
                .join("sess_review_export")
                .join("review")
                .join("review-decision.json"),
        )
        .expect("review decision json");
        assert!(review_json.contains("current path accepted"));
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

    #[tokio::test]
    async fn default_runtime_exports_basic_evidence_pack_without_desktop_provider() {
        let core = RuntimeCore::default();
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_basic_evidence".to_string()),
            thread_id: Some("thread_basic_evidence".to_string()),
            app_id: "agent-runtime".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_basic_evidence".to_string(),
                turn_id: Some("turn_basic_evidence".to_string()),
                input: AgentInput {
                    text: "生成基础 evidence".to_string(),
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

        let response = core
            .export_evidence(EvidenceExportParams {
                session_id: "sess_basic_evidence".to_string(),
                turn_id: None,
                include_events: Some(true),
                include_artifacts: Some(true),
                include_evidence_pack: Some(true),
            })
            .await
            .expect("export evidence");

        let evidence_pack = response.evidence_pack.expect("basic evidence pack");
        assert_eq!(
            evidence_pack.pack_relative_root,
            ".lime/harness/sessions/sess_basic_evidence/evidence"
        );
        assert_eq!(evidence_pack.thread_status, "running");
        assert_eq!(
            evidence_pack
                .completion_audit_summary
                .as_ref()
                .and_then(|summary| summary.get("decision"))
                .and_then(serde_json::Value::as_str),
            Some("in_progress")
        );
        assert_eq!(
            evidence_pack
                .observability_summary
                .as_ref()
                .and_then(|summary| summary.get("source"))
                .and_then(serde_json::Value::as_str),
            Some("app-server-basic")
        );
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
    async fn cancel_turn_returns_canceled_without_waiting_for_backend_cancel() {
        let backend = Arc::new(HangingCancelBackend {
            cancel_count: AtomicUsize::new(0),
        });
        let core = RuntimeCore::with_backend(backend.clone());
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_cancel_fast".to_string()),
                thread_id: Some("thread_cancel_fast".to_string()),
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
                    turn_id: Some("turn_cancel_fast".to_string()),
                    input: AgentInput {
                        text: "please keep running".to_string(),
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
        assert_eq!(turn.status, AgentTurnStatus::Running);

        let output = timeout(
            Duration::from_millis(100),
            core.cancel_turn(
                AgentSessionTurnCancelParams {
                    session_id: session.session_id.clone(),
                    turn_id: turn.turn_id.clone(),
                },
                RuntimeHostContext::default(),
            ),
        )
        .await
        .expect("cancel should not wait for backend")
        .expect("cancel");

        assert_eq!(output.events.len(), 1);
        assert_eq!(output.events[0].event_type, "turn.canceled");

        let read = core
            .read_session(AgentSessionReadParams {
                session_id: session.session_id,
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        assert_eq!(read.session.status, AgentSessionStatus::Canceled);
        assert_eq!(read.turns[0].status, AgentTurnStatus::Canceled);
        assert!(read.turns[0].completed_at.is_some());
    }

    #[tokio::test]
    async fn canceled_turn_ignores_late_runtime_events() {
        let core = RuntimeCore::with_backend(Arc::new(HangingCancelBackend {
            cancel_count: AtomicUsize::new(0),
        }));
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_cancel_late".to_string()),
                thread_id: Some("thread_cancel_late".to_string()),
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
                    turn_id: Some("turn_cancel_late".to_string()),
                    input: AgentInput {
                        text: "please keep running".to_string(),
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
        core.cancel_turn(
            AgentSessionTurnCancelParams {
                session_id: session.session_id.clone(),
                turn_id: turn.turn_id.clone(),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("cancel");

        let late_events = core
            .append_external_runtime_events(
                &session.session_id,
                Some(&turn.turn_id),
                vec![
                    RuntimeEvent::new("message.delta", json!({ "text": "late reply" })),
                    RuntimeEvent::new("turn.final_done", json!({})),
                ],
            )
            .expect("append late events");

        assert!(late_events.is_empty());
        let read = core
            .read_session(AgentSessionReadParams {
                session_id: session.session_id,
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read session");
        assert_eq!(read.session.status, AgentSessionStatus::Canceled);
        assert_eq!(read.turns[0].status, AgentTurnStatus::Canceled);
        assert_eq!(
            read.detail.unwrap()["messages"].as_array().unwrap().len(),
            1
        );
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
