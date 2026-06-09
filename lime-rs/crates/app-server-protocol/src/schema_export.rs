use crate::AgentAppCloudReleaseDescriptor;
use crate::AgentAppDeleteDataExecutionEvidence;
use crate::AgentAppDeleteDataPostDeleteResidualAudit;
use crate::AgentAppDeleteDataTargetEvidence;
use crate::AgentAppFetchCloudPackageParams;
use crate::AgentAppInstalledDisabledSetParams;
use crate::AgentAppInstalledListResponse;
use crate::AgentAppInstalledSaveParams;
use crate::AgentAppLocalPackageInspectParams;
use crate::AgentAppLocalPackageInspectResponse;
use crate::AgentAppPackageCacheEntry;
use crate::AgentAppPackageIdentity;
use crate::AgentAppShellPackageMount;
use crate::AgentAppShellPrepareParams;
use crate::AgentAppShellPrepareResponse;
use crate::AgentAppUiRuntimeStartParams;
use crate::AgentAppUiRuntimeStatusParams;
use crate::AgentAppUiRuntimeStatusResponse;
use crate::AgentAppUiRuntimeStopParams;
use crate::AgentAppUninstallParams;
use crate::AgentAppUninstallRehearsalParams;
use crate::AgentAppUninstallRehearsalResponse;
use crate::AgentAppUninstallRehearsalTarget;
use crate::AgentAppUninstallResponse;
use crate::AgentAttachment;
use crate::AgentEvent;
use crate::AgentInput;
use crate::AgentSession;
use crate::AgentSessionActionReplayParams;
use crate::AgentSessionActionReplayResponse;
use crate::AgentSessionActionRespondParams;
use crate::AgentSessionActionRespondResponse;
use crate::AgentSessionActionScope;
use crate::AgentSessionActionType;
use crate::AgentSessionAnalysisHandoffExportParams;
use crate::AgentSessionAnalysisHandoffExportResponse;
use crate::AgentSessionCompactParams;
use crate::AgentSessionCompactResponse;
use crate::AgentSessionEventParams;
use crate::AgentSessionFileCheckpointDetail;
use crate::AgentSessionFileCheckpointDiffParams;
use crate::AgentSessionFileCheckpointDiffResponse;
use crate::AgentSessionFileCheckpointGetParams;
use crate::AgentSessionFileCheckpointListParams;
use crate::AgentSessionFileCheckpointListResponse;
use crate::AgentSessionFileCheckpointRestoreParams;
use crate::AgentSessionFileCheckpointRestoreResponse;
use crate::AgentSessionFileCheckpointSummary;
use crate::AgentSessionFileCheckpointThreadSummary;
use crate::AgentSessionHandoffArtifact;
use crate::AgentSessionHandoffBundleExportParams;
use crate::AgentSessionHandoffBundleExportResponse;
use crate::AgentSessionListParams;
use crate::AgentSessionListResponse;
use crate::AgentSessionObjectiveAuditParams;
use crate::AgentSessionObjectiveAuditResponse;
use crate::AgentSessionObjectiveClearParams;
use crate::AgentSessionObjectiveClearResponse;
use crate::AgentSessionObjectiveContinueParams;
use crate::AgentSessionObjectiveContinueResponse;
use crate::AgentSessionObjectiveReadParams;
use crate::AgentSessionObjectiveReadResponse;
use crate::AgentSessionObjectiveSetParams;
use crate::AgentSessionObjectiveSetResponse;
use crate::AgentSessionObjectiveStatusUpdateParams;
use crate::AgentSessionObjectiveStatusUpdateResponse;
use crate::AgentSessionOverview;
use crate::AgentSessionQueuedTurnPromoteParams;
use crate::AgentSessionQueuedTurnPromoteResponse;
use crate::AgentSessionQueuedTurnRemoveParams;
use crate::AgentSessionQueuedTurnRemoveResponse;
use crate::AgentSessionReadParams;
use crate::AgentSessionReadResponse;
use crate::AgentSessionReplayCaseExportParams;
use crate::AgentSessionReplayCaseExportResponse;
use crate::AgentSessionReplayedActionRequired;
use crate::AgentSessionReviewDecision;
use crate::AgentSessionReviewDecisionSaveParams;
use crate::AgentSessionReviewDecisionTemplateExportParams;
use crate::AgentSessionReviewDecisionTemplateExportResponse;
use crate::AgentSessionStartParams;
use crate::AgentSessionStartResponse;
use crate::AgentSessionStatus;
use crate::AgentSessionThreadResumeParams;
use crate::AgentSessionThreadResumeResponse;
use crate::AgentSessionTurnCancelParams;
use crate::AgentSessionTurnCancelResponse;
use crate::AgentSessionTurnStartParams;
use crate::AgentSessionTurnStartResponse;
use crate::AgentSessionUpdateParams;
use crate::AgentSessionUpdateResponse;
use crate::AgentTurn;
use crate::AgentTurnStatus;
use crate::AppServerMethodKind;
use crate::ArtifactContentStatus;
use crate::ArtifactReadParams;
use crate::ArtifactReadResponse;
use crate::ArtifactSummary;
use crate::AutomationJobCreateParams;
use crate::AutomationJobDeleteResponse;
use crate::AutomationJobHealthParams;
use crate::AutomationJobHealthResponse;
use crate::AutomationJobIdParams;
use crate::AutomationJobListResponse;
use crate::AutomationJobReadResponse;
use crate::AutomationJobRunHistoryParams;
use crate::AutomationJobRunHistoryResponse;
use crate::AutomationJobRunNowResponse;
use crate::AutomationJobUpdateParams;
use crate::AutomationJobWriteResponse;
use crate::AutomationScheduleParams;
use crate::AutomationSchedulePreviewResponse;
use crate::AutomationScheduleValidateResponse;
use crate::AutomationSchedulerConfigReadResponse;
use crate::AutomationSchedulerConfigUpdateParams;
use crate::AutomationSchedulerConfigUpdateResponse;
use crate::AutomationSchedulerStatusResponse;
use crate::BusinessObjectRef;
use crate::CapabilityDescriptor;
use crate::CapabilityListParams;
use crate::CapabilityListResponse;
use crate::ChannelProbeParams;
use crate::ChannelProbeResponse;
use crate::ClientCapabilities;
use crate::ClientInfo;
use crate::ConnectCallbackSendParams;
use crate::ConnectCallbackSendResponse;
use crate::ConnectCallbackStatus;
use crate::ConnectDeepLinkResolveParams;
use crate::ConnectDeepLinkResolveResponse;
use crate::ConnectOpenDeepLinkResolveParams;
use crate::ConnectOpenDeepLinkResolveResponse;
use crate::ConnectPayload;
use crate::ConnectRelayApiKeySaveParams;
use crate::ConnectRelayApiKeySaveResponse;
use crate::DiagnosticsCapabilityRoutingMetricsSnapshot;
use crate::DiagnosticsIdempotencyDiagnostics;
use crate::DiagnosticsMetricConfig;
use crate::DiagnosticsRequestDedupDiagnostics;
use crate::DiagnosticsResponseCacheDiagnostics;
use crate::DiagnosticsTelemetrySummary;
use crate::EvidenceExportParams;
use crate::EvidenceExportResponse;
use crate::EvidencePackArtifact;
use crate::EvidencePackSummary;
use crate::FileSystemCreateDirectoryParams;
use crate::FileSystemCreateFileParams;
use crate::FileSystemDeleteFileParams;
use crate::FileSystemDirectoryListing;
use crate::FileSystemFileEntry;
use crate::FileSystemFilePreview;
use crate::FileSystemListDirectoryParams;
use crate::FileSystemMutationResponse;
use crate::FileSystemReadFilePreviewParams;
use crate::FileSystemRenameFileParams;
use crate::GatewayChannelStartParams;
use crate::GatewayChannelStatusParams;
use crate::GatewayChannelStatusResponse;
use crate::GatewayChannelStopParams;
use crate::GatewayTunnelCloudflaredDetectResponse;
use crate::GatewayTunnelCloudflaredInstallParams;
use crate::GatewayTunnelCloudflaredInstallResponse;
use crate::GatewayTunnelCreateParams;
use crate::GatewayTunnelCreateResponse;
use crate::GatewayTunnelCreateResult;
use crate::GatewayTunnelProbeResponse;
use crate::GatewayTunnelStatusResponse;
use crate::GatewayTunnelSyncWebhookUrlParams;
use crate::GatewayTunnelSyncWebhookUrlResponse;
use crate::ImageStoryboardSlotInput;
use crate::InitializeParams;
use crate::InitializeResponse;
use crate::JsonRpcError;
use crate::JsonRpcErrorResponse;
use crate::JsonRpcMessage;
use crate::JsonRpcNotification;
use crate::JsonRpcRequest;
use crate::JsonRpcResponse;
use crate::KnowledgeCompilePackParams;
use crate::KnowledgeCompilePackResponse;
use crate::KnowledgeContextResolutionResponse;
use crate::KnowledgeImportSourceParams;
use crate::KnowledgeImportSourceResponse;
use crate::KnowledgeListPacksParams;
use crate::KnowledgeListPacksResponse;
use crate::KnowledgeReadPackParams;
use crate::KnowledgeReadPackResponse;
use crate::KnowledgeResolveContextPackParams;
use crate::KnowledgeResolveContextParams;
use crate::KnowledgeSetDefaultPackParams;
use crate::KnowledgeSetDefaultPackResponse;
use crate::KnowledgeUpdatePackStatusParams;
use crate::KnowledgeUpdatePackStatusResponse;
use crate::KnowledgeValidateContextRunParams;
use crate::KnowledgeValidateContextRunResponse;
use crate::LogArtifactEntry;
use crate::LogClearResponse;
use crate::LogEntry;
use crate::LogListResponse;
use crate::LogPersistedTailParams;
use crate::LogPersistedTailResponse;
use crate::LogStorageDiagnosticsResponse;
use crate::ManagedObjective;
use crate::ManagedObjectiveStatus;
use crate::McpContent;
use crate::McpPromptGetParams;
use crate::McpPromptGetResponse;
use crate::McpPromptListResponse;
use crate::McpPromptMessage;
use crate::McpResourceListResponse;
use crate::McpResourceReadParams;
use crate::McpResourceReadResponse;
use crate::McpServerCreateParams;
use crate::McpServerDeleteParams;
use crate::McpServerEnabledSetParams;
use crate::McpServerImportFromAppParams;
use crate::McpServerImportFromAppResponse;
use crate::McpServerLifecycleResponse;
use crate::McpServerListResponse;
use crate::McpServerStartParams;
use crate::McpServerStatusListResponse;
use crate::McpServerStopParams;
use crate::McpServerUpdateParams;
use crate::McpToolCallParams;
use crate::McpToolCallResponse;
use crate::McpToolCallWithCallerParams;
use crate::McpToolListForContextParams;
use crate::McpToolListResponse;
use crate::McpToolSearchParams;
use crate::MediaTaskArtifactAudioCompleteParams;
use crate::MediaTaskArtifactAudioCreateParams;
use crate::MediaTaskArtifactImageCreateParams;
use crate::MediaTaskArtifactListFilters;
use crate::MediaTaskArtifactListParams;
use crate::MediaTaskArtifactListResponse;
use crate::MediaTaskArtifactLookupParams;
use crate::MediaTaskArtifactResponse;
use crate::ModelListParams;
use crate::ModelListResponse;
use crate::ModelPreferencesListResponse;
use crate::ModelProviderAliasListResponse;
use crate::ModelProviderAliasReadParams;
use crate::ModelProviderAliasReadResponse;
use crate::ModelProviderCatalogListResponse;
use crate::ModelProviderConfigExportParams;
use crate::ModelProviderConfigExportResponse;
use crate::ModelProviderConfigImportParams;
use crate::ModelProviderConfigImportResponse;
use crate::ModelProviderCreateParams;
use crate::ModelProviderDeleteParams;
use crate::ModelProviderDeleteResponse;
use crate::ModelProviderFetchModelsParams;
use crate::ModelProviderFetchModelsResponse;
use crate::ModelProviderKeyCreateParams;
use crate::ModelProviderKeyDeleteParams;
use crate::ModelProviderKeyDeleteResponse;
use crate::ModelProviderKeyEventParams;
use crate::ModelProviderKeyNextParams;
use crate::ModelProviderKeyNextResponse;
use crate::ModelProviderKeyUpdateParams;
use crate::ModelProviderKeyWriteResponse;
use crate::ModelProviderListResponse;
use crate::ModelProviderMutationResponse;
use crate::ModelProviderReadParams;
use crate::ModelProviderReadResponse;
use crate::ModelProviderSortOrderItem;
use crate::ModelProviderSortOrdersUpdateParams;
use crate::ModelProviderTestChatParams;
use crate::ModelProviderTestChatResponse;
use crate::ModelProviderTestConnectionParams;
use crate::ModelProviderTestConnectionResponse;
use crate::ModelProviderUiStateReadParams;
use crate::ModelProviderUiStateReadResponse;
use crate::ModelProviderUiStateWriteParams;
use crate::ModelProviderUpdateParams;
use crate::ModelProviderWriteResponse;
use crate::ModelSyncStateReadResponse;
use crate::OpenDeepLinkPayload;
use crate::PlatformInfo;
use crate::ProjectMemoryReadParams;
use crate::ProjectMemoryReadResponse;
use crate::RequestId;
use crate::RuntimeOptions;
use crate::ServerCapabilities;
use crate::ServerDiagnosticsResponse;
use crate::ServerInfo;
use crate::SkillDownloadInstallParams;
use crate::SkillDownloadInstallResponse;
use crate::SkillInstalledDirectoriesListResponse;
use crate::SkillListResponse;
use crate::SkillLocalDetailInspectParams;
use crate::SkillLocalDetailInspectResponse;
use crate::SkillLocalImportParams;
use crate::SkillLocalImportResponse;
use crate::SkillLocalInspectParams;
use crate::SkillLocalInspectResponse;
use crate::SkillLocalRenameParams;
use crate::SkillLocalRenameResponse;
use crate::SkillManagementInstallParams;
use crate::SkillManagementListParams;
use crate::SkillManagementUninstallParams;
use crate::SkillManagementWriteResponse;
use crate::SkillMarketplaceBundleFile;
use crate::SkillMarketplaceInstallParams;
use crate::SkillMarketplaceInstallResponse;
use crate::SkillPackageExportParams;
use crate::SkillPackageExportResponse;
use crate::SkillPackageLocalInspectParams;
use crate::SkillPackageLocalInspectResponse;
use crate::SkillPackageLocalInstallParams;
use crate::SkillPackageLocalInstallResponse;
use crate::SkillPackageLocalReplaceParams;
use crate::SkillPackageLocalReplaceResponse;
use crate::SkillReadParams;
use crate::SkillReadResponse;
use crate::SkillRemoteInspectParams;
use crate::SkillRemoteInspectResponse;
use crate::SkillRepositoryDeleteParams;
use crate::SkillRepositoryEntry;
use crate::SkillRepositoryListResponse;
use crate::SkillRepositorySaveParams;
use crate::SkillScaffoldCreateParams;
use crate::SkillScaffoldCreateResponse;
use crate::SupportBundleExportResponse;
use crate::UsageStatsDailyTrendsListResponse;
use crate::UsageStatsDailyUsage;
use crate::UsageStatsModelRankingListResponse;
use crate::UsageStatsModelUsage;
use crate::UsageStatsRangeParams;
use crate::UsageStatsReadResponse;
use crate::UsageStatsSummary;
use crate::WechatChannelAccountListResponse;
use crate::WechatChannelAccountRemoveParams;
use crate::WechatChannelAccountRemoveResponse;
use crate::WechatConfiguredAccount;
use crate::WechatLoginStartParams;
use crate::WechatLoginStartResponse;
use crate::WechatLoginWaitParams;
use crate::WechatLoginWaitResponse;
use crate::WechatRuntimeModelSetParams;
use crate::WechatRuntimeModelSetResponse;
use crate::WindowsStartupCheck;
use crate::WindowsStartupDiagnosticsResponse;
use crate::WorkspaceEnsureParams;
use crate::WorkspaceEnsureReadyResponse;
use crate::WorkspaceListResponse;
use crate::WorkspacePathReadParams;
use crate::WorkspaceProjectPathResolveParams;
use crate::WorkspaceProjectPathResolveResponse;
use crate::WorkspaceProjectsRootReadResponse;
use crate::WorkspaceReadParams;
use crate::WorkspaceReadResponse;
use crate::WorkspaceRegisteredSkillsListParams;
use crate::WorkspaceRegisteredSkillsListResponse;
use crate::WorkspaceSkillBindingsListParams;
use crate::WorkspaceSkillBindingsListResponse;
use crate::APP_SERVER_METHODS;
use crate::JSONRPC_VERSION;
use crate::PROTOCOL_VERSION;
use schemars::JsonSchema;
use serde_json::json;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::PathBuf;

pub const GENERATED_SCHEMA_HEADER: &str = "Generated by app-server-protocol. Do not edit by hand.";
pub const SCHEMA_BUNDLE_FILE_NAME: &str = "app_server_protocol.schemas.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SchemaExportOptions {
    pub include_envelopes: bool,
    pub include_method_catalog: bool,
    pub include_protocol_types: bool,
}

impl Default for SchemaExportOptions {
    fn default() -> Self {
        Self {
            include_envelopes: true,
            include_method_catalog: true,
            include_protocol_types: true,
        }
    }
}

pub fn generate_json_schema_bundle(options: SchemaExportOptions) -> Value {
    let mut properties = serde_json::Map::new();
    if options.include_envelopes {
        properties.insert("requestId".to_string(), request_id_schema());
        properties.insert("jsonRpcRequest".to_string(), json_rpc_request_schema());
        properties.insert(
            "jsonRpcNotification".to_string(),
            json_rpc_notification_schema(),
        );
        properties.insert("jsonRpcResponse".to_string(), json_rpc_response_schema());
        properties.insert("jsonRpcError".to_string(), json_rpc_error_schema());
    }
    if options.include_method_catalog {
        properties.insert("methods".to_string(), method_catalog_schema());
    }
    if options.include_envelopes {
        for schema in jsonrpc_schemas() {
            properties.insert(schema.name.to_string(), schema.value.clone());
        }
    }
    if options.include_protocol_types {
        for schema in v0_schemas() {
            properties.insert(schema.name.to_string(), schema.value.clone());
        }
    }

    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "app-server-protocol",
        "title": "App Server Protocol",
        "description": GENERATED_SCHEMA_HEADER,
        "protocolVersion": PROTOCOL_VERSION,
        "jsonRpcVersion": JSONRPC_VERSION,
        "type": "object",
        "$defs": properties,
    })
}

pub fn generated_schema_tree() -> BTreeMap<PathBuf, Vec<u8>> {
    generated_schema_tree_with_options(SchemaExportOptions::default())
}

pub fn generated_schema_tree_with_options(
    options: SchemaExportOptions,
) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    files.insert(
        PathBuf::from("json").join(SCHEMA_BUNDLE_FILE_NAME),
        pretty_json_bytes(&generate_json_schema_bundle(options)),
    );
    if options.include_envelopes {
        for schema in jsonrpc_schemas() {
            files.insert(
                PathBuf::from("json")
                    .join("jsonrpc")
                    .join(format!("{}.json", schema.name)),
                pretty_json_bytes(&schema.value),
            );
        }
    }
    if options.include_protocol_types {
        for schema in v0_schemas() {
            files.insert(
                PathBuf::from("json")
                    .join("v0")
                    .join(format!("{}.json", schema.name)),
                pretty_json_bytes(&schema.value),
            );
        }
    }
    files
}

#[derive(Debug, Clone)]
struct GeneratedJsonSchema {
    name: &'static str,
    value: Value,
}

fn typed_schema<T: JsonSchema>(name: &'static str) -> GeneratedJsonSchema {
    GeneratedJsonSchema {
        name,
        value: serde_json::to_value(schemars::schema_for!(T)).expect("serialize JSON schema"),
    }
}

fn jsonrpc_schemas() -> Vec<GeneratedJsonSchema> {
    vec![
        typed_schema::<RequestId>("RequestId"),
        typed_schema::<JsonRpcMessage>("JsonRpcMessage"),
        typed_schema::<JsonRpcRequest>("JsonRpcRequest"),
        typed_schema::<JsonRpcNotification>("JsonRpcNotification"),
        typed_schema::<JsonRpcResponse>("JsonRpcResponse"),
        typed_schema::<JsonRpcErrorResponse>("JsonRpcErrorResponse"),
        typed_schema::<JsonRpcError>("JsonRpcError"),
    ]
}

fn v0_schemas() -> Vec<GeneratedJsonSchema> {
    vec![
        typed_schema::<ClientInfo>("ClientInfo"),
        typed_schema::<ClientCapabilities>("ClientCapabilities"),
        typed_schema::<InitializeParams>("InitializeParams"),
        typed_schema::<InitializeResponse>("InitializeResponse"),
        typed_schema::<ServerInfo>("ServerInfo"),
        typed_schema::<PlatformInfo>("PlatformInfo"),
        typed_schema::<ServerCapabilities>("ServerCapabilities"),
        typed_schema::<CapabilityListParams>("CapabilityListParams"),
        typed_schema::<CapabilityListResponse>("CapabilityListResponse"),
        typed_schema::<CapabilityDescriptor>("CapabilityDescriptor"),
        typed_schema::<ArtifactReadParams>("ArtifactReadParams"),
        typed_schema::<ArtifactContentStatus>("ArtifactContentStatus"),
        typed_schema::<ArtifactSummary>("ArtifactSummary"),
        typed_schema::<ArtifactReadResponse>("ArtifactReadResponse"),
        typed_schema::<FileSystemListDirectoryParams>("FileSystemListDirectoryParams"),
        typed_schema::<FileSystemReadFilePreviewParams>("FileSystemReadFilePreviewParams"),
        typed_schema::<FileSystemCreateFileParams>("FileSystemCreateFileParams"),
        typed_schema::<FileSystemCreateDirectoryParams>("FileSystemCreateDirectoryParams"),
        typed_schema::<FileSystemRenameFileParams>("FileSystemRenameFileParams"),
        typed_schema::<FileSystemDeleteFileParams>("FileSystemDeleteFileParams"),
        typed_schema::<FileSystemMutationResponse>("FileSystemMutationResponse"),
        typed_schema::<FileSystemDirectoryListing>("FileSystemDirectoryListing"),
        typed_schema::<FileSystemFileEntry>("FileSystemFileEntry"),
        typed_schema::<FileSystemFilePreview>("FileSystemFilePreview"),
        typed_schema::<EvidenceExportParams>("EvidenceExportParams"),
        typed_schema::<EvidenceExportResponse>("EvidenceExportResponse"),
        typed_schema::<EvidencePackSummary>("EvidencePackSummary"),
        typed_schema::<EvidencePackArtifact>("EvidencePackArtifact"),
        typed_schema::<AgentSessionHandoffBundleExportParams>(
            "AgentSessionHandoffBundleExportParams",
        ),
        typed_schema::<AgentSessionHandoffBundleExportResponse>(
            "AgentSessionHandoffBundleExportResponse",
        ),
        typed_schema::<AgentSessionHandoffArtifact>("AgentSessionHandoffArtifact"),
        typed_schema::<AgentSessionReplayCaseExportParams>("AgentSessionReplayCaseExportParams"),
        typed_schema::<AgentSessionReplayCaseExportResponse>(
            "AgentSessionReplayCaseExportResponse",
        ),
        typed_schema::<AgentSessionAnalysisHandoffExportParams>(
            "AgentSessionAnalysisHandoffExportParams",
        ),
        typed_schema::<AgentSessionAnalysisHandoffExportResponse>(
            "AgentSessionAnalysisHandoffExportResponse",
        ),
        typed_schema::<AgentSessionReviewDecisionTemplateExportParams>(
            "AgentSessionReviewDecisionTemplateExportParams",
        ),
        typed_schema::<AgentSessionReviewDecisionTemplateExportResponse>(
            "AgentSessionReviewDecisionTemplateExportResponse",
        ),
        typed_schema::<AgentSessionReviewDecisionSaveParams>(
            "AgentSessionReviewDecisionSaveParams",
        ),
        typed_schema::<AgentSessionReviewDecision>("AgentSessionReviewDecision"),
        typed_schema::<AgentSessionListParams>("AgentSessionListParams"),
        typed_schema::<AgentSessionOverview>("AgentSessionOverview"),
        typed_schema::<AgentSessionListResponse>("AgentSessionListResponse"),
        typed_schema::<AgentSessionUpdateParams>("AgentSessionUpdateParams"),
        typed_schema::<AgentSessionUpdateResponse>("AgentSessionUpdateResponse"),
        typed_schema::<ManagedObjectiveStatus>("ManagedObjectiveStatus"),
        typed_schema::<ManagedObjective>("ManagedObjective"),
        typed_schema::<AgentSessionObjectiveReadParams>("AgentSessionObjectiveReadParams"),
        typed_schema::<AgentSessionObjectiveReadResponse>("AgentSessionObjectiveReadResponse"),
        typed_schema::<AgentSessionObjectiveSetParams>("AgentSessionObjectiveSetParams"),
        typed_schema::<AgentSessionObjectiveSetResponse>("AgentSessionObjectiveSetResponse"),
        typed_schema::<AgentSessionObjectiveStatusUpdateParams>(
            "AgentSessionObjectiveStatusUpdateParams",
        ),
        typed_schema::<AgentSessionObjectiveStatusUpdateResponse>(
            "AgentSessionObjectiveStatusUpdateResponse",
        ),
        typed_schema::<AgentSessionObjectiveClearParams>("AgentSessionObjectiveClearParams"),
        typed_schema::<AgentSessionObjectiveClearResponse>("AgentSessionObjectiveClearResponse"),
        typed_schema::<AgentSessionObjectiveContinueParams>("AgentSessionObjectiveContinueParams"),
        typed_schema::<AgentSessionObjectiveContinueResponse>(
            "AgentSessionObjectiveContinueResponse",
        ),
        typed_schema::<AgentSessionObjectiveAuditParams>("AgentSessionObjectiveAuditParams"),
        typed_schema::<AgentSessionObjectiveAuditResponse>("AgentSessionObjectiveAuditResponse"),
        typed_schema::<AgentSessionCompactParams>("AgentSessionCompactParams"),
        typed_schema::<AgentSessionCompactResponse>("AgentSessionCompactResponse"),
        typed_schema::<AgentSessionThreadResumeParams>("AgentSessionThreadResumeParams"),
        typed_schema::<AgentSessionThreadResumeResponse>("AgentSessionThreadResumeResponse"),
        typed_schema::<AgentSessionQueuedTurnRemoveParams>("AgentSessionQueuedTurnRemoveParams"),
        typed_schema::<AgentSessionQueuedTurnRemoveResponse>(
            "AgentSessionQueuedTurnRemoveResponse",
        ),
        typed_schema::<AgentSessionQueuedTurnPromoteParams>("AgentSessionQueuedTurnPromoteParams"),
        typed_schema::<AgentSessionQueuedTurnPromoteResponse>(
            "AgentSessionQueuedTurnPromoteResponse",
        ),
        typed_schema::<AgentSessionFileCheckpointListParams>(
            "AgentSessionFileCheckpointListParams",
        ),
        typed_schema::<AgentSessionFileCheckpointGetParams>("AgentSessionFileCheckpointGetParams"),
        typed_schema::<AgentSessionFileCheckpointDiffParams>(
            "AgentSessionFileCheckpointDiffParams",
        ),
        typed_schema::<AgentSessionFileCheckpointRestoreParams>(
            "AgentSessionFileCheckpointRestoreParams",
        ),
        typed_schema::<AgentSessionFileCheckpointSummary>("AgentSessionFileCheckpointSummary"),
        typed_schema::<AgentSessionFileCheckpointThreadSummary>(
            "AgentSessionFileCheckpointThreadSummary",
        ),
        typed_schema::<AgentSessionFileCheckpointListResponse>(
            "AgentSessionFileCheckpointListResponse",
        ),
        typed_schema::<AgentSessionFileCheckpointDetail>("AgentSessionFileCheckpointDetail"),
        typed_schema::<AgentSessionFileCheckpointDiffResponse>(
            "AgentSessionFileCheckpointDiffResponse",
        ),
        typed_schema::<AgentSessionFileCheckpointRestoreResponse>(
            "AgentSessionFileCheckpointRestoreResponse",
        ),
        typed_schema::<WorkspaceReadParams>("WorkspaceReadParams"),
        typed_schema::<WorkspacePathReadParams>("WorkspacePathReadParams"),
        typed_schema::<WorkspaceProjectPathResolveParams>("WorkspaceProjectPathResolveParams"),
        typed_schema::<WorkspaceEnsureParams>("WorkspaceEnsureParams"),
        typed_schema::<WorkspaceListResponse>("WorkspaceListResponse"),
        typed_schema::<WorkspaceReadResponse>("WorkspaceReadResponse"),
        typed_schema::<WorkspaceProjectsRootReadResponse>("WorkspaceProjectsRootReadResponse"),
        typed_schema::<WorkspaceProjectPathResolveResponse>("WorkspaceProjectPathResolveResponse"),
        typed_schema::<WorkspaceEnsureReadyResponse>("WorkspaceEnsureReadyResponse"),
        typed_schema::<SkillReadParams>("SkillReadParams"),
        typed_schema::<SkillListResponse>("SkillListResponse"),
        typed_schema::<SkillReadResponse>("SkillReadResponse"),
        typed_schema::<SkillManagementListParams>("SkillManagementListParams"),
        typed_schema::<SkillManagementInstallParams>("SkillManagementInstallParams"),
        typed_schema::<SkillManagementUninstallParams>("SkillManagementUninstallParams"),
        typed_schema::<SkillRepositoryEntry>("SkillRepositoryEntry"),
        typed_schema::<SkillRepositorySaveParams>("SkillRepositorySaveParams"),
        typed_schema::<SkillRepositoryDeleteParams>("SkillRepositoryDeleteParams"),
        typed_schema::<SkillLocalInspectParams>("SkillLocalInspectParams"),
        typed_schema::<SkillScaffoldCreateParams>("SkillScaffoldCreateParams"),
        typed_schema::<SkillLocalImportParams>("SkillLocalImportParams"),
        typed_schema::<SkillRemoteInspectParams>("SkillRemoteInspectParams"),
        typed_schema::<SkillManagementWriteResponse>("SkillManagementWriteResponse"),
        typed_schema::<SkillRepositoryListResponse>("SkillRepositoryListResponse"),
        typed_schema::<SkillInstalledDirectoriesListResponse>(
            "SkillInstalledDirectoriesListResponse",
        ),
        typed_schema::<SkillLocalInspectResponse>("SkillLocalInspectResponse"),
        typed_schema::<SkillScaffoldCreateResponse>("SkillScaffoldCreateResponse"),
        typed_schema::<SkillLocalImportResponse>("SkillLocalImportResponse"),
        typed_schema::<SkillRemoteInspectResponse>("SkillRemoteInspectResponse"),
        typed_schema::<SkillLocalDetailInspectParams>("SkillLocalDetailInspectParams"),
        typed_schema::<SkillLocalRenameParams>("SkillLocalRenameParams"),
        typed_schema::<SkillPackageLocalReplaceParams>("SkillPackageLocalReplaceParams"),
        typed_schema::<SkillLocalDetailInspectResponse>("SkillLocalDetailInspectResponse"),
        typed_schema::<SkillLocalRenameResponse>("SkillLocalRenameResponse"),
        typed_schema::<SkillPackageLocalReplaceResponse>("SkillPackageLocalReplaceResponse"),
        typed_schema::<SkillPackageLocalInspectParams>("SkillPackageLocalInspectParams"),
        typed_schema::<SkillPackageLocalInstallParams>("SkillPackageLocalInstallParams"),
        typed_schema::<SkillPackageExportParams>("SkillPackageExportParams"),
        typed_schema::<SkillMarketplaceBundleFile>("SkillMarketplaceBundleFile"),
        typed_schema::<SkillMarketplaceInstallParams>("SkillMarketplaceInstallParams"),
        typed_schema::<SkillDownloadInstallParams>("SkillDownloadInstallParams"),
        typed_schema::<SkillPackageLocalInspectResponse>("SkillPackageLocalInspectResponse"),
        typed_schema::<SkillPackageLocalInstallResponse>("SkillPackageLocalInstallResponse"),
        typed_schema::<SkillMarketplaceInstallResponse>("SkillMarketplaceInstallResponse"),
        typed_schema::<SkillDownloadInstallResponse>("SkillDownloadInstallResponse"),
        typed_schema::<SkillPackageExportResponse>("SkillPackageExportResponse"),
        typed_schema::<GatewayChannelStartParams>("GatewayChannelStartParams"),
        typed_schema::<GatewayChannelStopParams>("GatewayChannelStopParams"),
        typed_schema::<GatewayChannelStatusParams>("GatewayChannelStatusParams"),
        typed_schema::<GatewayChannelStatusResponse>("GatewayChannelStatusResponse"),
        typed_schema::<ChannelProbeParams>("ChannelProbeParams"),
        typed_schema::<ChannelProbeResponse>("ChannelProbeResponse"),
        typed_schema::<WechatLoginStartParams>("WechatLoginStartParams"),
        typed_schema::<WechatLoginStartResponse>("WechatLoginStartResponse"),
        typed_schema::<WechatLoginWaitParams>("WechatLoginWaitParams"),
        typed_schema::<WechatLoginWaitResponse>("WechatLoginWaitResponse"),
        typed_schema::<WechatConfiguredAccount>("WechatConfiguredAccount"),
        typed_schema::<WechatChannelAccountListResponse>("WechatChannelAccountListResponse"),
        typed_schema::<WechatChannelAccountRemoveParams>("WechatChannelAccountRemoveParams"),
        typed_schema::<WechatChannelAccountRemoveResponse>("WechatChannelAccountRemoveResponse"),
        typed_schema::<WechatRuntimeModelSetParams>("WechatRuntimeModelSetParams"),
        typed_schema::<WechatRuntimeModelSetResponse>("WechatRuntimeModelSetResponse"),
        typed_schema::<GatewayTunnelCreateParams>("GatewayTunnelCreateParams"),
        typed_schema::<GatewayTunnelCreateResult>("GatewayTunnelCreateResult"),
        typed_schema::<GatewayTunnelCreateResponse>("GatewayTunnelCreateResponse"),
        typed_schema::<GatewayTunnelProbeResponse>("GatewayTunnelProbeResponse"),
        typed_schema::<GatewayTunnelStatusResponse>("GatewayTunnelStatusResponse"),
        typed_schema::<GatewayTunnelCloudflaredDetectResponse>(
            "GatewayTunnelCloudflaredDetectResponse",
        ),
        typed_schema::<GatewayTunnelCloudflaredInstallParams>(
            "GatewayTunnelCloudflaredInstallParams",
        ),
        typed_schema::<GatewayTunnelCloudflaredInstallResponse>(
            "GatewayTunnelCloudflaredInstallResponse",
        ),
        typed_schema::<GatewayTunnelSyncWebhookUrlParams>("GatewayTunnelSyncWebhookUrlParams"),
        typed_schema::<GatewayTunnelSyncWebhookUrlResponse>("GatewayTunnelSyncWebhookUrlResponse"),
        typed_schema::<ImageStoryboardSlotInput>("ImageStoryboardSlotInput"),
        typed_schema::<MediaTaskArtifactImageCreateParams>("MediaTaskArtifactImageCreateParams"),
        typed_schema::<MediaTaskArtifactAudioCreateParams>("MediaTaskArtifactAudioCreateParams"),
        typed_schema::<MediaTaskArtifactAudioCompleteParams>(
            "MediaTaskArtifactAudioCompleteParams",
        ),
        typed_schema::<MediaTaskArtifactLookupParams>("MediaTaskArtifactLookupParams"),
        typed_schema::<MediaTaskArtifactListParams>("MediaTaskArtifactListParams"),
        typed_schema::<MediaTaskArtifactListFilters>("MediaTaskArtifactListFilters"),
        typed_schema::<MediaTaskArtifactResponse>("MediaTaskArtifactResponse"),
        typed_schema::<MediaTaskArtifactListResponse>("MediaTaskArtifactListResponse"),
        typed_schema::<WorkspaceSkillBindingsListParams>("WorkspaceSkillBindingsListParams"),
        typed_schema::<WorkspaceSkillBindingsListResponse>("WorkspaceSkillBindingsListResponse"),
        typed_schema::<WorkspaceRegisteredSkillsListParams>("WorkspaceRegisteredSkillsListParams"),
        typed_schema::<WorkspaceRegisteredSkillsListResponse>(
            "WorkspaceRegisteredSkillsListResponse",
        ),
        typed_schema::<AgentAppLocalPackageInspectParams>("AgentAppLocalPackageInspectParams"),
        typed_schema::<AgentAppLocalPackageInspectResponse>("AgentAppLocalPackageInspectResponse"),
        typed_schema::<AgentAppFetchCloudPackageParams>("AgentAppFetchCloudPackageParams"),
        typed_schema::<AgentAppCloudReleaseDescriptor>("AgentAppCloudReleaseDescriptor"),
        typed_schema::<AgentAppPackageCacheEntry>("AgentAppPackageCacheEntry"),
        typed_schema::<AgentAppPackageIdentity>("AgentAppPackageIdentity"),
        typed_schema::<AgentAppInstalledSaveParams>("AgentAppInstalledSaveParams"),
        typed_schema::<AgentAppInstalledDisabledSetParams>("AgentAppInstalledDisabledSetParams"),
        typed_schema::<AgentAppInstalledListResponse>("AgentAppInstalledListResponse"),
        typed_schema::<AgentAppUninstallRehearsalParams>("AgentAppUninstallRehearsalParams"),
        typed_schema::<AgentAppUninstallRehearsalResponse>("AgentAppUninstallRehearsalResponse"),
        typed_schema::<AgentAppUninstallRehearsalTarget>("AgentAppUninstallRehearsalTarget"),
        typed_schema::<AgentAppUninstallParams>("AgentAppUninstallParams"),
        typed_schema::<AgentAppUninstallResponse>("AgentAppUninstallResponse"),
        typed_schema::<AgentAppDeleteDataExecutionEvidence>("AgentAppDeleteDataExecutionEvidence"),
        typed_schema::<AgentAppDeleteDataTargetEvidence>("AgentAppDeleteDataTargetEvidence"),
        typed_schema::<AgentAppDeleteDataPostDeleteResidualAudit>(
            "AgentAppDeleteDataPostDeleteResidualAudit",
        ),
        typed_schema::<AgentAppShellPrepareParams>("AgentAppShellPrepareParams"),
        typed_schema::<AgentAppShellPrepareResponse>("AgentAppShellPrepareResponse"),
        typed_schema::<AgentAppShellPackageMount>("AgentAppShellPackageMount"),
        typed_schema::<AgentAppUiRuntimeStartParams>("AgentAppUiRuntimeStartParams"),
        typed_schema::<AgentAppUiRuntimeStatusParams>("AgentAppUiRuntimeStatusParams"),
        typed_schema::<AgentAppUiRuntimeStopParams>("AgentAppUiRuntimeStopParams"),
        typed_schema::<AgentAppUiRuntimeStatusResponse>("AgentAppUiRuntimeStatusResponse"),
        typed_schema::<KnowledgeListPacksParams>("KnowledgeListPacksParams"),
        typed_schema::<KnowledgeListPacksResponse>("KnowledgeListPacksResponse"),
        typed_schema::<KnowledgeReadPackParams>("KnowledgeReadPackParams"),
        typed_schema::<KnowledgeReadPackResponse>("KnowledgeReadPackResponse"),
        typed_schema::<KnowledgeImportSourceParams>("KnowledgeImportSourceParams"),
        typed_schema::<KnowledgeImportSourceResponse>("KnowledgeImportSourceResponse"),
        typed_schema::<KnowledgeCompilePackParams>("KnowledgeCompilePackParams"),
        typed_schema::<KnowledgeCompilePackResponse>("KnowledgeCompilePackResponse"),
        typed_schema::<KnowledgeSetDefaultPackParams>("KnowledgeSetDefaultPackParams"),
        typed_schema::<KnowledgeSetDefaultPackResponse>("KnowledgeSetDefaultPackResponse"),
        typed_schema::<KnowledgeUpdatePackStatusParams>("KnowledgeUpdatePackStatusParams"),
        typed_schema::<KnowledgeUpdatePackStatusResponse>("KnowledgeUpdatePackStatusResponse"),
        typed_schema::<KnowledgeResolveContextPackParams>("KnowledgeResolveContextPackParams"),
        typed_schema::<KnowledgeResolveContextParams>("KnowledgeResolveContextParams"),
        typed_schema::<KnowledgeContextResolutionResponse>("KnowledgeContextResolutionResponse"),
        typed_schema::<KnowledgeValidateContextRunParams>("KnowledgeValidateContextRunParams"),
        typed_schema::<KnowledgeValidateContextRunResponse>("KnowledgeValidateContextRunResponse"),
        typed_schema::<AutomationSchedulerConfigReadResponse>(
            "AutomationSchedulerConfigReadResponse",
        ),
        typed_schema::<AutomationSchedulerConfigUpdateParams>(
            "AutomationSchedulerConfigUpdateParams",
        ),
        typed_schema::<AutomationSchedulerConfigUpdateResponse>(
            "AutomationSchedulerConfigUpdateResponse",
        ),
        typed_schema::<AutomationSchedulerStatusResponse>("AutomationSchedulerStatusResponse"),
        typed_schema::<AutomationJobListResponse>("AutomationJobListResponse"),
        typed_schema::<AutomationJobIdParams>("AutomationJobIdParams"),
        typed_schema::<AutomationJobReadResponse>("AutomationJobReadResponse"),
        typed_schema::<AutomationJobCreateParams>("AutomationJobCreateParams"),
        typed_schema::<AutomationJobWriteResponse>("AutomationJobWriteResponse"),
        typed_schema::<AutomationJobUpdateParams>("AutomationJobUpdateParams"),
        typed_schema::<AutomationJobDeleteResponse>("AutomationJobDeleteResponse"),
        typed_schema::<AutomationJobRunNowResponse>("AutomationJobRunNowResponse"),
        typed_schema::<AutomationJobHealthParams>("AutomationJobHealthParams"),
        typed_schema::<AutomationJobHealthResponse>("AutomationJobHealthResponse"),
        typed_schema::<AutomationJobRunHistoryParams>("AutomationJobRunHistoryParams"),
        typed_schema::<AutomationJobRunHistoryResponse>("AutomationJobRunHistoryResponse"),
        typed_schema::<AutomationScheduleParams>("AutomationScheduleParams"),
        typed_schema::<AutomationSchedulePreviewResponse>("AutomationSchedulePreviewResponse"),
        typed_schema::<AutomationScheduleValidateResponse>("AutomationScheduleValidateResponse"),
        typed_schema::<McpServerListResponse>("McpServerListResponse"),
        typed_schema::<McpServerStatusListResponse>("McpServerStatusListResponse"),
        typed_schema::<McpServerCreateParams>("McpServerCreateParams"),
        typed_schema::<McpServerUpdateParams>("McpServerUpdateParams"),
        typed_schema::<McpServerDeleteParams>("McpServerDeleteParams"),
        typed_schema::<McpServerEnabledSetParams>("McpServerEnabledSetParams"),
        typed_schema::<McpServerImportFromAppParams>("McpServerImportFromAppParams"),
        typed_schema::<McpServerImportFromAppResponse>("McpServerImportFromAppResponse"),
        typed_schema::<McpServerStartParams>("McpServerStartParams"),
        typed_schema::<McpServerStopParams>("McpServerStopParams"),
        typed_schema::<McpServerLifecycleResponse>("McpServerLifecycleResponse"),
        typed_schema::<McpToolListForContextParams>("McpToolListForContextParams"),
        typed_schema::<McpToolSearchParams>("McpToolSearchParams"),
        typed_schema::<McpToolCallParams>("McpToolCallParams"),
        typed_schema::<McpToolCallWithCallerParams>("McpToolCallWithCallerParams"),
        typed_schema::<McpToolCallResponse>("McpToolCallResponse"),
        typed_schema::<McpPromptGetParams>("McpPromptGetParams"),
        typed_schema::<McpPromptGetResponse>("McpPromptGetResponse"),
        typed_schema::<McpResourceReadParams>("McpResourceReadParams"),
        typed_schema::<McpResourceReadResponse>("McpResourceReadResponse"),
        typed_schema::<McpContent>("McpContent"),
        typed_schema::<McpPromptMessage>("McpPromptMessage"),
        typed_schema::<McpToolListResponse>("McpToolListResponse"),
        typed_schema::<McpPromptListResponse>("McpPromptListResponse"),
        typed_schema::<McpResourceListResponse>("McpResourceListResponse"),
        typed_schema::<ProjectMemoryReadParams>("ProjectMemoryReadParams"),
        typed_schema::<ProjectMemoryReadResponse>("ProjectMemoryReadResponse"),
        typed_schema::<LogEntry>("LogEntry"),
        typed_schema::<LogListResponse>("LogListResponse"),
        typed_schema::<LogPersistedTailParams>("LogPersistedTailParams"),
        typed_schema::<LogPersistedTailResponse>("LogPersistedTailResponse"),
        typed_schema::<LogClearResponse>("LogClearResponse"),
        typed_schema::<LogArtifactEntry>("LogArtifactEntry"),
        typed_schema::<LogStorageDiagnosticsResponse>("LogStorageDiagnosticsResponse"),
        typed_schema::<SupportBundleExportResponse>("SupportBundleExportResponse"),
        typed_schema::<DiagnosticsMetricConfig>("DiagnosticsMetricConfig"),
        typed_schema::<DiagnosticsTelemetrySummary>("DiagnosticsTelemetrySummary"),
        typed_schema::<DiagnosticsCapabilityRoutingMetricsSnapshot>(
            "DiagnosticsCapabilityRoutingMetricsSnapshot",
        ),
        typed_schema::<DiagnosticsResponseCacheDiagnostics>("DiagnosticsResponseCacheDiagnostics"),
        typed_schema::<DiagnosticsRequestDedupDiagnostics>("DiagnosticsRequestDedupDiagnostics"),
        typed_schema::<DiagnosticsIdempotencyDiagnostics>("DiagnosticsIdempotencyDiagnostics"),
        typed_schema::<ServerDiagnosticsResponse>("ServerDiagnosticsResponse"),
        typed_schema::<WindowsStartupCheck>("WindowsStartupCheck"),
        typed_schema::<WindowsStartupDiagnosticsResponse>("WindowsStartupDiagnosticsResponse"),
        typed_schema::<UsageStatsRangeParams>("UsageStatsRangeParams"),
        typed_schema::<UsageStatsSummary>("UsageStatsSummary"),
        typed_schema::<UsageStatsReadResponse>("UsageStatsReadResponse"),
        typed_schema::<UsageStatsModelUsage>("UsageStatsModelUsage"),
        typed_schema::<UsageStatsModelRankingListResponse>("UsageStatsModelRankingListResponse"),
        typed_schema::<UsageStatsDailyUsage>("UsageStatsDailyUsage"),
        typed_schema::<UsageStatsDailyTrendsListResponse>("UsageStatsDailyTrendsListResponse"),
        typed_schema::<ModelListParams>("ModelListParams"),
        typed_schema::<ModelListResponse>("ModelListResponse"),
        typed_schema::<ModelPreferencesListResponse>("ModelPreferencesListResponse"),
        typed_schema::<ModelSyncStateReadResponse>("ModelSyncStateReadResponse"),
        typed_schema::<ModelProviderListResponse>("ModelProviderListResponse"),
        typed_schema::<ModelProviderCatalogListResponse>("ModelProviderCatalogListResponse"),
        typed_schema::<ModelProviderReadParams>("ModelProviderReadParams"),
        typed_schema::<ModelProviderReadResponse>("ModelProviderReadResponse"),
        typed_schema::<ModelProviderCreateParams>("ModelProviderCreateParams"),
        typed_schema::<ModelProviderWriteResponse>("ModelProviderWriteResponse"),
        typed_schema::<ModelProviderUpdateParams>("ModelProviderUpdateParams"),
        typed_schema::<ModelProviderDeleteParams>("ModelProviderDeleteParams"),
        typed_schema::<ModelProviderDeleteResponse>("ModelProviderDeleteResponse"),
        typed_schema::<ModelProviderSortOrderItem>("ModelProviderSortOrderItem"),
        typed_schema::<ModelProviderSortOrdersUpdateParams>("ModelProviderSortOrdersUpdateParams"),
        typed_schema::<ModelProviderMutationResponse>("ModelProviderMutationResponse"),
        typed_schema::<ModelProviderConfigExportParams>("ModelProviderConfigExportParams"),
        typed_schema::<ModelProviderConfigExportResponse>("ModelProviderConfigExportResponse"),
        typed_schema::<ModelProviderConfigImportParams>("ModelProviderConfigImportParams"),
        typed_schema::<ModelProviderConfigImportResponse>("ModelProviderConfigImportResponse"),
        typed_schema::<ModelProviderTestConnectionParams>("ModelProviderTestConnectionParams"),
        typed_schema::<ModelProviderTestConnectionResponse>("ModelProviderTestConnectionResponse"),
        typed_schema::<ModelProviderTestChatParams>("ModelProviderTestChatParams"),
        typed_schema::<ModelProviderTestChatResponse>("ModelProviderTestChatResponse"),
        typed_schema::<ModelProviderFetchModelsParams>("ModelProviderFetchModelsParams"),
        typed_schema::<ModelProviderFetchModelsResponse>("ModelProviderFetchModelsResponse"),
        typed_schema::<ModelProviderKeyCreateParams>("ModelProviderKeyCreateParams"),
        typed_schema::<ModelProviderKeyWriteResponse>("ModelProviderKeyWriteResponse"),
        typed_schema::<ModelProviderKeyUpdateParams>("ModelProviderKeyUpdateParams"),
        typed_schema::<ModelProviderKeyDeleteParams>("ModelProviderKeyDeleteParams"),
        typed_schema::<ModelProviderKeyDeleteResponse>("ModelProviderKeyDeleteResponse"),
        typed_schema::<ModelProviderKeyNextParams>("ModelProviderKeyNextParams"),
        typed_schema::<ModelProviderKeyNextResponse>("ModelProviderKeyNextResponse"),
        typed_schema::<ModelProviderKeyEventParams>("ModelProviderKeyEventParams"),
        typed_schema::<ModelProviderUiStateReadParams>("ModelProviderUiStateReadParams"),
        typed_schema::<ModelProviderUiStateReadResponse>("ModelProviderUiStateReadResponse"),
        typed_schema::<ModelProviderUiStateWriteParams>("ModelProviderUiStateWriteParams"),
        typed_schema::<ModelProviderAliasReadParams>("ModelProviderAliasReadParams"),
        typed_schema::<ModelProviderAliasReadResponse>("ModelProviderAliasReadResponse"),
        typed_schema::<ModelProviderAliasListResponse>("ModelProviderAliasListResponse"),
        typed_schema::<ConnectDeepLinkResolveParams>("ConnectDeepLinkResolveParams"),
        typed_schema::<ConnectPayload>("ConnectPayload"),
        typed_schema::<ConnectDeepLinkResolveResponse>("ConnectDeepLinkResolveResponse"),
        typed_schema::<ConnectOpenDeepLinkResolveParams>("ConnectOpenDeepLinkResolveParams"),
        typed_schema::<OpenDeepLinkPayload>("OpenDeepLinkPayload"),
        typed_schema::<ConnectOpenDeepLinkResolveResponse>("ConnectOpenDeepLinkResolveResponse"),
        typed_schema::<ConnectRelayApiKeySaveParams>("ConnectRelayApiKeySaveParams"),
        typed_schema::<ConnectRelayApiKeySaveResponse>("ConnectRelayApiKeySaveResponse"),
        typed_schema::<ConnectCallbackStatus>("ConnectCallbackStatus"),
        typed_schema::<ConnectCallbackSendParams>("ConnectCallbackSendParams"),
        typed_schema::<ConnectCallbackSendResponse>("ConnectCallbackSendResponse"),
        typed_schema::<AgentSessionStartParams>("AgentSessionStartParams"),
        typed_schema::<AgentSessionStartResponse>("AgentSessionStartResponse"),
        typed_schema::<AgentSessionReadParams>("AgentSessionReadParams"),
        typed_schema::<AgentSessionReadResponse>("AgentSessionReadResponse"),
        typed_schema::<AgentSessionTurnStartParams>("AgentSessionTurnStartParams"),
        typed_schema::<AgentSessionTurnStartResponse>("AgentSessionTurnStartResponse"),
        typed_schema::<AgentSessionTurnCancelParams>("AgentSessionTurnCancelParams"),
        typed_schema::<AgentSessionTurnCancelResponse>("AgentSessionTurnCancelResponse"),
        typed_schema::<AgentSessionActionType>("AgentSessionActionType"),
        typed_schema::<AgentSessionActionScope>("AgentSessionActionScope"),
        typed_schema::<AgentSessionActionReplayParams>("AgentSessionActionReplayParams"),
        typed_schema::<AgentSessionActionReplayResponse>("AgentSessionActionReplayResponse"),
        typed_schema::<AgentSessionReplayedActionRequired>("AgentSessionReplayedActionRequired"),
        typed_schema::<AgentSessionActionRespondParams>("AgentSessionActionRespondParams"),
        typed_schema::<AgentSessionActionRespondResponse>("AgentSessionActionRespondResponse"),
        typed_schema::<AgentSessionEventParams>("AgentSessionEventParams"),
        typed_schema::<BusinessObjectRef>("BusinessObjectRef"),
        typed_schema::<AgentSessionStatus>("AgentSessionStatus"),
        typed_schema::<AgentSession>("AgentSession"),
        typed_schema::<AgentTurnStatus>("AgentTurnStatus"),
        typed_schema::<AgentTurn>("AgentTurn"),
        typed_schema::<AgentInput>("AgentInput"),
        typed_schema::<AgentAttachment>("AgentAttachment"),
        typed_schema::<RuntimeOptions>("RuntimeOptions"),
        typed_schema::<AgentEvent>("AgentEvent"),
    ]
}

fn request_id_schema() -> Value {
    json!({
        "oneOf": [
            { "type": "integer" },
            { "type": "string" }
        ]
    })
}

fn json_rpc_request_schema() -> Value {
    json!({
        "type": "object",
        "required": ["id", "method"],
        "additionalProperties": false,
        "properties": {
            "id": { "$ref": "#/$defs/requestId" },
            "method": { "type": "string" },
            "params": true
        }
    })
}

fn json_rpc_notification_schema() -> Value {
    json!({
        "type": "object",
        "required": ["method"],
        "additionalProperties": false,
        "properties": {
            "method": { "type": "string" },
            "params": true
        }
    })
}

fn json_rpc_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["id", "result"],
        "additionalProperties": false,
        "properties": {
            "id": { "$ref": "#/$defs/requestId" },
            "result": true
        }
    })
}

fn json_rpc_error_schema() -> Value {
    json!({
        "type": "object",
        "required": ["id", "error"],
        "additionalProperties": false,
        "properties": {
            "id": { "$ref": "#/$defs/requestId" },
            "error": {
                "type": "object",
                "required": ["code", "message"],
                "additionalProperties": false,
                "properties": {
                    "code": { "type": "integer" },
                    "message": { "type": "string" },
                    "data": true
                }
            }
        }
    })
}

fn method_catalog_schema() -> Value {
    let requests = APP_SERVER_METHODS
        .iter()
        .filter(|method| method.kind == AppServerMethodKind::Request)
        .map(|method| method.method)
        .collect::<Vec<_>>();
    let notifications = APP_SERVER_METHODS
        .iter()
        .filter(|method| method.kind == AppServerMethodKind::Notification)
        .map(|method| method.method)
        .collect::<Vec<_>>();

    json!({
        "type": "object",
        "required": ["requests", "notifications"],
        "additionalProperties": false,
        "properties": {
            "requests": {
                "type": "array",
                "items": { "enum": requests }
            },
            "notifications": {
                "type": "array",
                "items": { "enum": notifications }
            }
        }
    })
}

fn pretty_json_bytes(value: &Value) -> Vec<u8> {
    let mut bytes = serde_json::to_vec_pretty(value).expect("serialize schema JSON");
    bytes.push(b'\n');
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_bundle_exports_json_rpc_envelopes_and_method_catalog() {
        let bundle = generate_json_schema_bundle(SchemaExportOptions::default());

        assert_eq!(bundle["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(bundle["$defs"]["jsonRpcRequest"]["required"][0], "id");
        assert_eq!(
            bundle["$defs"]["methods"]["properties"]["requests"]["items"]["enum"]
                .as_array()
                .expect("requests")
                .len(),
            APP_SERVER_METHODS
                .iter()
                .filter(|method| method.kind == AppServerMethodKind::Request)
                .count()
        );
    }

    #[test]
    fn schema_tree_uses_stable_bundle_path() {
        let tree = generated_schema_tree();

        assert!(tree.contains_key(&PathBuf::from("json").join(SCHEMA_BUNDLE_FILE_NAME)));
        assert!(tree.contains_key(&PathBuf::from("json/v0/AgentSessionTurnStartParams.json")));
        assert!(tree.contains_key(&PathBuf::from("json/jsonrpc/JsonRpcRequest.json")));
        assert_eq!(
            tree.len(),
            1 + crate::JSONRPC_SCHEMA_TYPE_NAMES.len() + crate::V0_SCHEMA_TYPE_NAMES.len()
        );
    }

    #[test]
    fn schema_registry_matches_declared_type_names() {
        let jsonrpc_schema_names = jsonrpc_schemas()
            .iter()
            .map(|schema| schema.name)
            .collect::<Vec<_>>();
        let v0_schema_names = v0_schemas()
            .iter()
            .map(|schema| schema.name)
            .collect::<Vec<_>>();

        assert_eq!(jsonrpc_schema_names, crate::JSONRPC_SCHEMA_TYPE_NAMES);
        assert_eq!(v0_schema_names, crate::V0_SCHEMA_TYPE_NAMES);
    }
}
