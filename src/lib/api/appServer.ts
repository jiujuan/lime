import { safeInvoke } from "@/lib/dev-bridge";
import {
  JSONRPC_VERSION,
  METHOD_AGENT_SESSION_ACTION_REPLAY,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
  METHOD_AGENT_SESSION_COMPACT,
  METHOD_AGENT_SESSION_EVENT,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
  METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
  METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
  METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
  METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
  METHOD_AGENT_SESSION_OBJECTIVE_READ,
  METHOD_AGENT_SESSION_OBJECTIVE_SET,
  METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
  METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
  METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
  METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
  METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_THREAD_RESUME,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AGENT_SESSION_UPDATE,
  METHOD_ARTIFACT_READ,
  METHOD_CAPABILITY_LIST,
  METHOD_EVIDENCE_EXPORT,
  METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
  METHOD_FILE_SYSTEM_CREATE_FILE,
  METHOD_FILE_SYSTEM_DELETE_FILE,
  METHOD_FILE_SYSTEM_LIST_DIRECTORY,
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
  METHOD_FILE_SYSTEM_RENAME_FILE,
  METHOD_GATEWAY_CHANNEL_START,
  METHOD_GATEWAY_CHANNEL_STOP,
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
  METHOD_GATEWAY_TUNNEL_CREATE,
  METHOD_GATEWAY_TUNNEL_PROBE,
  METHOD_GATEWAY_TUNNEL_RESTART,
  METHOD_GATEWAY_TUNNEL_START,
  METHOD_GATEWAY_TUNNEL_STATUS,
  METHOD_GATEWAY_TUNNEL_STOP,
  METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
  METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
  METHOD_DIAGNOSTICS_SERVER_READ,
  METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
  METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
  METHOD_INITIALIZE,
  METHOD_INITIALIZED,
  METHOD_GATEWAY_CHANNEL_STATUS,
  METHOD_DISCORD_CHANNEL_PROBE,
  METHOD_FEISHU_CHANNEL_PROBE,
  METHOD_TELEGRAM_CHANNEL_PROBE,
  METHOD_LOG_CLEAR,
  METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
  METHOD_LOG_LIST,
  METHOD_LOG_PERSISTED_TAIL,
  METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
  METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
  METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
  METHOD_MEDIA_TASK_ARTIFACT_GET,
  METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
  METHOD_MEDIA_TASK_ARTIFACT_LIST,
  METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
  METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
  METHOD_WECHAT_CHANNEL_LOGIN_START,
  METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
  METHOD_WECHAT_CHANNEL_PROBE,
  METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
  METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
  METHOD_USAGE_STATS_MODEL_RANKING_LIST,
  METHOD_USAGE_STATS_READ,
  PROTOCOL_VERSION,
  SERVER_NAME,
  decodeMessage,
  decodeMessages,
  encodeMessage,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcResponse,
  request as createProtocolRequest,
  notification as createProtocolNotification,
  type AgentAttachment,
  type AgentEvent,
  type AgentInput,
  type AgentSession,
  type AgentSessionAnalysisHandoffExportParams,
  type AgentSessionAnalysisHandoffExportResponse,
  type AgentSessionActionReplayParams,
  type AgentSessionActionReplayResponse,
  type AgentSessionActionRespondParams,
  type AgentSessionActionRespondResponse,
  type AgentSessionActionScope,
  type AgentSessionActionType,
  type AgentSessionCompactParams,
  type AgentSessionCompactResponse,
  type AgentSessionFileCheckpointDetail,
  type AgentSessionFileCheckpointDiffParams,
  type AgentSessionFileCheckpointDiffResponse,
  type AgentSessionFileCheckpointGetParams,
  type AgentSessionFileCheckpointListParams,
  type AgentSessionFileCheckpointListResponse,
  type AgentSessionFileCheckpointRestoreParams,
  type AgentSessionFileCheckpointRestoreResponse,
  type AgentSessionFileCheckpointSummary,
  type AgentSessionFileCheckpointThreadSummary,
  type AgentSessionHandoffArtifact,
  type AgentSessionHandoffBundleExportParams,
  type AgentSessionHandoffBundleExportResponse,
  type AgentSessionObjectiveClearParams,
  type AgentSessionObjectiveClearResponse,
  type AgentSessionObjectiveAuditParams,
  type AgentSessionObjectiveAuditResponse,
  type AgentSessionObjectiveContinueParams,
  type AgentSessionObjectiveContinueResponse,
  type AgentSessionObjectiveReadParams,
  type AgentSessionObjectiveReadResponse,
  type AgentSessionObjectiveSetParams,
  type AgentSessionObjectiveSetResponse,
  type AgentSessionObjectiveStatusUpdateParams,
  type AgentSessionObjectiveStatusUpdateResponse,
  type AgentSessionQueuedTurnPromoteParams,
  type AgentSessionQueuedTurnPromoteResponse,
  type AgentSessionQueuedTurnRemoveParams,
  type AgentSessionQueuedTurnRemoveResponse,
  type AgentSessionReadParams,
  type AgentSessionReadResponse,
  type AgentSessionReplayCaseExportParams,
  type AgentSessionReplayCaseExportResponse,
  type AgentSessionReviewDecision,
  type AgentSessionReviewDecisionSaveParams,
  type AgentSessionReviewDecisionTemplateExportParams,
  type AgentSessionReviewDecisionTemplateExportResponse,
  type AgentSessionStartParams,
  type AgentSessionStartResponse,
  type AgentSessionStatus,
  type AgentSessionThreadResumeParams,
  type AgentSessionThreadResumeResponse,
  type AgentSessionTurnCancelParams,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartParams,
  type AgentSessionTurnStartResponse,
  type AgentSessionUpdateParams,
  type AgentSessionUpdateResponse,
  type AgentTurn,
  type AgentTurnStatus,
  type ArtifactContentStatus,
  type ArtifactReadParams,
  type ArtifactReadResponse,
  type ArtifactSummary,
  type BusinessObjectRef,
  type CapabilityDescriptor,
  type CapabilityListParams,
  type CapabilityListResponse,
  type ClientCapabilities,
  type ClientInfo,
  type EvidenceExportParams,
  type EvidenceExportResponse,
  type EvidencePackArtifact,
  type EvidencePackSummary,
  type FileSystemCreateDirectoryParams,
  type FileSystemCreateFileParams,
  type FileSystemDeleteFileParams,
  type FileSystemDirectoryListing,
  type FileSystemFileEntry,
  type FileSystemFilePreview,
  type FileSystemListDirectoryParams,
  type FileSystemMutationResponse,
  type FileSystemReadFilePreviewParams,
  type FileSystemRenameFileParams,
  type GatewayChannelStartParams,
  type GatewayChannelStopParams,
  type GatewayChannelStatusParams,
  type GatewayChannelStatusResponse,
  type GatewayTunnelCloudflaredDetectResponse,
  type GatewayTunnelCloudflaredInstallParams,
  type GatewayTunnelCloudflaredInstallResponse,
  type GatewayTunnelCreateParams,
  type GatewayTunnelCreateResponse,
  type GatewayTunnelProbeResponse,
  type GatewayTunnelStatusResponse,
  type GatewayTunnelSyncWebhookUrlParams,
  type GatewayTunnelSyncWebhookUrlResponse,
  type ChannelProbeParams,
  type ChannelProbeResponse,
  type InitializeParams,
  type InitializeResponse,
  type JsonRpcError,
  type JsonRpcErrorResponse,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonValue,
  type LogClearResponse,
  type LogEntry,
  type LogStorageDiagnosticsResponse,
  type LogListResponse,
  type LogPersistedTailParams,
  type LogPersistedTailResponse,
  type ServerDiagnosticsResponse,
  type SupportBundleExportResponse,
  type WindowsStartupDiagnosticsResponse,
  type MediaTaskArtifactAudioCompleteParams,
  type MediaTaskArtifactAudioCreateParams,
  type MediaTaskArtifactImageCreateParams,
  type MediaTaskArtifactListParams,
  type MediaTaskArtifactListResponse,
  type MediaTaskArtifactLookupParams,
  type MediaTaskArtifactResponse,
  type ManagedObjective,
  type ManagedObjectiveStatus,
  type RequestId,
  type RuntimeOptions,
  type UsageStatsDailyTrendsListResponse,
  type UsageStatsModelRankingListResponse,
  type UsageStatsRangeParams,
  type UsageStatsReadResponse,
  type WechatChannelAccountRemoveParams,
  type WechatChannelAccountRemoveResponse,
  type WechatChannelAccountListResponse,
  type WechatConfiguredAccount,
  type WechatLoginStartParams,
  type WechatLoginStartResponse,
  type WechatLoginWaitParams,
  type WechatLoginWaitResponse,
  type WechatRuntimeModelSetParams,
  type WechatRuntimeModelSetResponse,
} from "../../../packages/app-server-client/src/protocol";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export const APP_SERVER_JSONRPC_VERSION = JSONRPC_VERSION;
export const APP_SERVER_PROTOCOL_VERSION = PROTOCOL_VERSION;
export const APP_SERVER_NAME = SERVER_NAME;

export const APP_SERVER_METHOD_INITIALIZE = METHOD_INITIALIZE;
export const APP_SERVER_METHOD_INITIALIZED = METHOD_INITIALIZED;
export const APP_SERVER_METHOD_CAPABILITY_LIST = METHOD_CAPABILITY_LIST;
export const APP_SERVER_METHOD_ARTIFACT_READ = METHOD_ARTIFACT_READ;
export const APP_SERVER_METHOD_FILE_SYSTEM_LIST_DIRECTORY =
  METHOD_FILE_SYSTEM_LIST_DIRECTORY;
export const APP_SERVER_METHOD_FILE_SYSTEM_READ_FILE_PREVIEW =
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW;
export const APP_SERVER_METHOD_FILE_SYSTEM_CREATE_FILE =
  METHOD_FILE_SYSTEM_CREATE_FILE;
export const APP_SERVER_METHOD_FILE_SYSTEM_CREATE_DIRECTORY =
  METHOD_FILE_SYSTEM_CREATE_DIRECTORY;
export const APP_SERVER_METHOD_FILE_SYSTEM_RENAME_FILE =
  METHOD_FILE_SYSTEM_RENAME_FILE;
export const APP_SERVER_METHOD_FILE_SYSTEM_DELETE_FILE =
  METHOD_FILE_SYSTEM_DELETE_FILE;
export const APP_SERVER_METHOD_EVIDENCE_EXPORT = METHOD_EVIDENCE_EXPORT;
export const APP_SERVER_METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT =
  METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT;
export const APP_SERVER_METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT =
  METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT;
export const APP_SERVER_METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT =
  METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT;
export const APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT =
  METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT;
export const APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE =
  METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE;
export const APP_SERVER_METHOD_AGENT_SESSION_START = METHOD_AGENT_SESSION_START;
export const APP_SERVER_METHOD_AGENT_SESSION_READ = METHOD_AGENT_SESSION_READ;
export const APP_SERVER_METHOD_AGENT_SESSION_UPDATE =
  METHOD_AGENT_SESSION_UPDATE;
export const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ =
  METHOD_AGENT_SESSION_OBJECTIVE_READ;
export const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET =
  METHOD_AGENT_SESSION_OBJECTIVE_SET;
export const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE =
  METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE;
export const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CLEAR =
  METHOD_AGENT_SESSION_OBJECTIVE_CLEAR;
export const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE =
  METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE;
export const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT =
  METHOD_AGENT_SESSION_OBJECTIVE_AUDIT;
export const APP_SERVER_METHOD_AGENT_SESSION_COMPACT =
  METHOD_AGENT_SESSION_COMPACT;
export const APP_SERVER_METHOD_AGENT_SESSION_THREAD_RESUME =
  METHOD_AGENT_SESSION_THREAD_RESUME;
export const APP_SERVER_METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE =
  METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE;
export const APP_SERVER_METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE =
  METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE;
export const APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST =
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST;
export const APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET =
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET;
export const APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF =
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF;
export const APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE =
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE;
export const APP_SERVER_METHOD_AGENT_SESSION_TURN_START =
  METHOD_AGENT_SESSION_TURN_START;
export const APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL =
  METHOD_AGENT_SESSION_TURN_CANCEL;
export const APP_SERVER_METHOD_AGENT_SESSION_ACTION_REPLAY =
  METHOD_AGENT_SESSION_ACTION_REPLAY;
export const APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND =
  METHOD_AGENT_SESSION_ACTION_RESPOND;
export const APP_SERVER_METHOD_AGENT_SESSION_EVENT = METHOD_AGENT_SESSION_EVENT;
export const APP_SERVER_METHOD_LOG_LIST = METHOD_LOG_LIST;
export const APP_SERVER_METHOD_LOG_PERSISTED_TAIL = METHOD_LOG_PERSISTED_TAIL;
export const APP_SERVER_METHOD_LOG_CLEAR = METHOD_LOG_CLEAR;
export const APP_SERVER_METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR =
  METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR;
export const APP_SERVER_METHOD_DIAGNOSTICS_LOG_STORAGE_READ =
  METHOD_DIAGNOSTICS_LOG_STORAGE_READ;
export const APP_SERVER_METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT =
  METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT;
export const APP_SERVER_METHOD_DIAGNOSTICS_SERVER_READ =
  METHOD_DIAGNOSTICS_SERVER_READ;
export const APP_SERVER_METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ =
  METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ;
export const APP_SERVER_METHOD_GATEWAY_CHANNEL_STATUS =
  METHOD_GATEWAY_CHANNEL_STATUS;
export const APP_SERVER_METHOD_GATEWAY_CHANNEL_START =
  METHOD_GATEWAY_CHANNEL_START;
export const APP_SERVER_METHOD_GATEWAY_CHANNEL_STOP =
  METHOD_GATEWAY_CHANNEL_STOP;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_PROBE =
  METHOD_GATEWAY_TUNNEL_PROBE;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT =
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL =
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_CREATE =
  METHOD_GATEWAY_TUNNEL_CREATE;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_START =
  METHOD_GATEWAY_TUNNEL_START;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_STOP =
  METHOD_GATEWAY_TUNNEL_STOP;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_RESTART =
  METHOD_GATEWAY_TUNNEL_RESTART;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_STATUS =
  METHOD_GATEWAY_TUNNEL_STATUS;
export const APP_SERVER_METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL =
  METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL;
export const APP_SERVER_METHOD_TELEGRAM_CHANNEL_PROBE =
  METHOD_TELEGRAM_CHANNEL_PROBE;
export const APP_SERVER_METHOD_FEISHU_CHANNEL_PROBE =
  METHOD_FEISHU_CHANNEL_PROBE;
export const APP_SERVER_METHOD_DISCORD_CHANNEL_PROBE =
  METHOD_DISCORD_CHANNEL_PROBE;
export const APP_SERVER_METHOD_WECHAT_CHANNEL_PROBE =
  METHOD_WECHAT_CHANNEL_PROBE;
export const APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_START =
  METHOD_WECHAT_CHANNEL_LOGIN_START;
export const APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_WAIT =
  METHOD_WECHAT_CHANNEL_LOGIN_WAIT;
export const APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_LIST =
  METHOD_WECHAT_CHANNEL_ACCOUNT_LIST;
export const APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE =
  METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE;
export const APP_SERVER_METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET =
  METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET;
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE =
  METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE;
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE =
  METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE;
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE =
  METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE;
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET =
  METHOD_MEDIA_TASK_ARTIFACT_GET;
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST =
  METHOD_MEDIA_TASK_ARTIFACT_LIST;
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_CANCEL =
  METHOD_MEDIA_TASK_ARTIFACT_CANCEL;
export const APP_SERVER_METHOD_USAGE_STATS_READ = METHOD_USAGE_STATS_READ;
export const APP_SERVER_METHOD_USAGE_STATS_MODEL_RANKING_LIST =
  METHOD_USAGE_STATS_MODEL_RANKING_LIST;
export const APP_SERVER_METHOD_USAGE_STATS_DAILY_TRENDS_LIST =
  METHOD_USAGE_STATS_DAILY_TRENDS_LIST;

export type AppServerHandleJsonLinesRequest = {
  lines: string[];
};

export type AppServerHandleJsonLinesResult = {
  lines: string[];
};

export type AppServerDrainEventsRequest = {
  limit?: number;
};

export type AppServerDrainEventsResult = {
  lines: string[];
};

type AppServerSafeInvokeEnvelope<T> = T | { result?: T };

export type AppServerRequestId = RequestId;
export type AppServerJsonValue = JsonValue;
export type AppServerJsonRpcRequest = JsonRpcRequest;
export type AppServerJsonRpcNotification = JsonRpcNotification;
export type AppServerJsonRpcResponse<T = unknown> = JsonRpcResponse<T>;
export type AppServerJsonRpcError = JsonRpcError;
export type AppServerJsonRpcErrorResponse = JsonRpcErrorResponse;
export type AppServerJsonRpcMessage<T = unknown> = JsonRpcMessage<T>;
export type AppServerClientInfo = ClientInfo;
export type AppServerClientCapabilities = ClientCapabilities;
export type AppServerInitializeParams = InitializeParams;
export type AppServerInitializeResponse = InitializeResponse;
export type AppServerBusinessObjectRef = BusinessObjectRef;
export type AppServerCapabilityListParams = CapabilityListParams;
export type AppServerCapabilityDescriptor = CapabilityDescriptor;
export type AppServerCapabilityListResponse = CapabilityListResponse;
export type AppServerArtifactReadParams = ArtifactReadParams;
export type AppServerArtifactContentStatus = ArtifactContentStatus;
export type AppServerArtifactSummary = ArtifactSummary;
export type AppServerArtifactReadResponse = ArtifactReadResponse;
export type AppServerFileSystemListDirectoryParams =
  FileSystemListDirectoryParams;
export type AppServerFileSystemReadFilePreviewParams =
  FileSystemReadFilePreviewParams;
export type AppServerFileSystemCreateFileParams = FileSystemCreateFileParams;
export type AppServerFileSystemCreateDirectoryParams =
  FileSystemCreateDirectoryParams;
export type AppServerFileSystemRenameFileParams = FileSystemRenameFileParams;
export type AppServerFileSystemDeleteFileParams = FileSystemDeleteFileParams;
export type AppServerFileSystemMutationResponse = FileSystemMutationResponse;
export type AppServerFileSystemDirectoryListing = FileSystemDirectoryListing;
export type AppServerFileSystemFileEntry = FileSystemFileEntry;
export type AppServerFileSystemFilePreview = FileSystemFilePreview;
export type AppServerEvidenceExportParams = EvidenceExportParams;
export type AppServerEvidenceExportResponse = EvidenceExportResponse;
export type AppServerEvidencePackSummary = EvidencePackSummary;
export type AppServerEvidencePackArtifact = EvidencePackArtifact;
export type AppServerAgentSessionHandoffBundleExportParams =
  AgentSessionHandoffBundleExportParams;
export type AppServerAgentSessionHandoffBundleExportResponse =
  AgentSessionHandoffBundleExportResponse;
export type AppServerAgentSessionHandoffArtifact = AgentSessionHandoffArtifact;
export type AppServerAgentSessionReplayCaseExportParams =
  AgentSessionReplayCaseExportParams;
export type AppServerAgentSessionReplayCaseExportResponse =
  AgentSessionReplayCaseExportResponse;
export type AppServerAgentSessionAnalysisHandoffExportParams =
  AgentSessionAnalysisHandoffExportParams;
export type AppServerAgentSessionAnalysisHandoffExportResponse =
  AgentSessionAnalysisHandoffExportResponse;
export type AppServerAgentSessionReviewDecisionTemplateExportParams =
  AgentSessionReviewDecisionTemplateExportParams;
export type AppServerAgentSessionReviewDecisionTemplateExportResponse =
  AgentSessionReviewDecisionTemplateExportResponse;
export type AppServerAgentSessionReviewDecisionSaveParams =
  AgentSessionReviewDecisionSaveParams;
export type AppServerAgentSessionReviewDecision = AgentSessionReviewDecision;
export type AppServerAgentSessionStartParams = AgentSessionStartParams;
export type AppServerAgentSessionReadParams = AgentSessionReadParams;
export type AppServerAgentInput = AgentInput;
export type AppServerAgentAttachment = AgentAttachment;
export type AppServerRuntimeOptions = RuntimeOptions;
export type AppServerAgentSessionTurnStartParams = AgentSessionTurnStartParams;
export type AppServerAgentSessionTurnCancelParams =
  AgentSessionTurnCancelParams;
export type AppServerAgentSessionActionType = AgentSessionActionType;
export type AppServerAgentSessionActionScope = AgentSessionActionScope;
export type AppServerAgentSessionActionRespondParams =
  AgentSessionActionRespondParams;
export type AppServerAgentSessionStatus = AgentSessionStatus;
export type AppServerAgentSession = AgentSession;
export type AppServerAgentTurnStatus = AgentTurnStatus;
export type AppServerAgentTurn = AgentTurn;
export type AppServerAgentEvent = AgentEvent;
export type AppServerAgentSessionStartResponse = AgentSessionStartResponse;
export type AppServerAgentSessionReadResponse = AgentSessionReadResponse;
export type AppServerAgentSessionUpdateParams = AgentSessionUpdateParams;
export type AppServerAgentSessionUpdateResponse = AgentSessionUpdateResponse;
export type AppServerManagedObjectiveStatus = ManagedObjectiveStatus;
export type AppServerManagedObjective = ManagedObjective;
export type AppServerAgentSessionObjectiveReadParams =
  AgentSessionObjectiveReadParams;
export type AppServerAgentSessionObjectiveReadResponse =
  AgentSessionObjectiveReadResponse;
export type AppServerAgentSessionObjectiveSetParams =
  AgentSessionObjectiveSetParams;
export type AppServerAgentSessionObjectiveSetResponse =
  AgentSessionObjectiveSetResponse;
export type AppServerAgentSessionObjectiveStatusUpdateParams =
  AgentSessionObjectiveStatusUpdateParams;
export type AppServerAgentSessionObjectiveStatusUpdateResponse =
  AgentSessionObjectiveStatusUpdateResponse;
export type AppServerAgentSessionObjectiveClearParams =
  AgentSessionObjectiveClearParams;
export type AppServerAgentSessionObjectiveClearResponse =
  AgentSessionObjectiveClearResponse;
export type AppServerAgentSessionObjectiveContinueParams =
  AgentSessionObjectiveContinueParams;
export type AppServerAgentSessionObjectiveContinueResponse =
  AgentSessionObjectiveContinueResponse;
export type AppServerAgentSessionObjectiveAuditParams =
  AgentSessionObjectiveAuditParams;
export type AppServerAgentSessionObjectiveAuditResponse =
  AgentSessionObjectiveAuditResponse;
export type AppServerAgentSessionCompactParams = AgentSessionCompactParams;
export type AppServerAgentSessionCompactResponse = AgentSessionCompactResponse;
export type AppServerAgentSessionThreadResumeParams =
  AgentSessionThreadResumeParams;
export type AppServerAgentSessionThreadResumeResponse =
  AgentSessionThreadResumeResponse;
export type AppServerAgentSessionQueuedTurnRemoveParams =
  AgentSessionQueuedTurnRemoveParams;
export type AppServerAgentSessionQueuedTurnRemoveResponse =
  AgentSessionQueuedTurnRemoveResponse;
export type AppServerAgentSessionQueuedTurnPromoteParams =
  AgentSessionQueuedTurnPromoteParams;
export type AppServerAgentSessionQueuedTurnPromoteResponse =
  AgentSessionQueuedTurnPromoteResponse;
export type AppServerAgentSessionFileCheckpointListParams =
  AgentSessionFileCheckpointListParams;
export type AppServerAgentSessionFileCheckpointGetParams =
  AgentSessionFileCheckpointGetParams;
export type AppServerAgentSessionFileCheckpointDiffParams =
  AgentSessionFileCheckpointDiffParams;
export type AppServerAgentSessionFileCheckpointRestoreParams =
  AgentSessionFileCheckpointRestoreParams;
export type AppServerAgentSessionFileCheckpointSummary =
  AgentSessionFileCheckpointSummary;
export type AppServerAgentSessionFileCheckpointThreadSummary =
  AgentSessionFileCheckpointThreadSummary;
export type AppServerAgentSessionFileCheckpointListResponse =
  AgentSessionFileCheckpointListResponse;
export type AppServerAgentSessionFileCheckpointDetail =
  AgentSessionFileCheckpointDetail;
export type AppServerAgentSessionFileCheckpointDiffResponse =
  AgentSessionFileCheckpointDiffResponse;
export type AppServerAgentSessionFileCheckpointRestoreResponse =
  AgentSessionFileCheckpointRestoreResponse;
export type AppServerAgentSessionTurnStartResponse =
  AgentSessionTurnStartResponse;
export type AppServerAgentSessionTurnCancelResponse =
  AgentSessionTurnCancelResponse;
export type AppServerAgentSessionActionReplayParams =
  AgentSessionActionReplayParams;
export type AppServerAgentSessionActionReplayResponse =
  AgentSessionActionReplayResponse;
export type AppServerAgentSessionActionRespondResponse =
  AgentSessionActionRespondResponse;
export type AppServerGatewayChannelStatusParams = GatewayChannelStatusParams;
export type AppServerGatewayChannelStartParams = GatewayChannelStartParams;
export type AppServerGatewayChannelStopParams = GatewayChannelStopParams;
export type AppServerGatewayChannelStatusResponse =
  GatewayChannelStatusResponse;
export type AppServerGatewayTunnelCloudflaredDetectResponse =
  GatewayTunnelCloudflaredDetectResponse;
export type AppServerGatewayTunnelCloudflaredInstallParams =
  GatewayTunnelCloudflaredInstallParams;
export type AppServerGatewayTunnelCloudflaredInstallResponse =
  GatewayTunnelCloudflaredInstallResponse;
export type AppServerGatewayTunnelCreateParams = GatewayTunnelCreateParams;
export type AppServerGatewayTunnelCreateResponse = GatewayTunnelCreateResponse;
export type AppServerGatewayTunnelProbeResponse = GatewayTunnelProbeResponse;
export type AppServerGatewayTunnelStatusResponse = GatewayTunnelStatusResponse;
export type AppServerGatewayTunnelSyncWebhookUrlParams =
  GatewayTunnelSyncWebhookUrlParams;
export type AppServerGatewayTunnelSyncWebhookUrlResponse =
  GatewayTunnelSyncWebhookUrlResponse;
export type AppServerChannelProbeParams = ChannelProbeParams;
export type AppServerChannelProbeResponse = ChannelProbeResponse;
export type AppServerWechatConfiguredAccount = WechatConfiguredAccount;
export type AppServerWechatChannelAccountListResponse =
  WechatChannelAccountListResponse;
export type AppServerWechatLoginStartParams = WechatLoginStartParams;
export type AppServerWechatLoginStartResponse = WechatLoginStartResponse;
export type AppServerWechatLoginWaitParams = WechatLoginWaitParams;
export type AppServerWechatLoginWaitResponse = WechatLoginWaitResponse;
export type AppServerWechatChannelAccountRemoveParams =
  WechatChannelAccountRemoveParams;
export type AppServerWechatChannelAccountRemoveResponse =
  WechatChannelAccountRemoveResponse;
export type AppServerWechatRuntimeModelSetParams = WechatRuntimeModelSetParams;
export type AppServerWechatRuntimeModelSetResponse =
  WechatRuntimeModelSetResponse;
export type AppServerLogEntry = LogEntry;
export type AppServerLogListResponse = LogListResponse;
export type AppServerLogPersistedTailParams = LogPersistedTailParams;
export type AppServerLogPersistedTailResponse = LogPersistedTailResponse;
export type AppServerLogClearResponse = LogClearResponse;
export type AppServerLogStorageDiagnosticsResponse =
  LogStorageDiagnosticsResponse;
export type AppServerSupportBundleExportResponse =
  SupportBundleExportResponse;
export type AppServerServerDiagnosticsResponse = ServerDiagnosticsResponse;
export type AppServerWindowsStartupDiagnosticsResponse =
  WindowsStartupDiagnosticsResponse;
export type AppServerMediaTaskArtifactImageCreateParams =
  MediaTaskArtifactImageCreateParams;
export type AppServerMediaTaskArtifactAudioCreateParams =
  MediaTaskArtifactAudioCreateParams;
export type AppServerMediaTaskArtifactAudioCompleteParams =
  MediaTaskArtifactAudioCompleteParams;
export type AppServerMediaTaskArtifactLookupParams =
  MediaTaskArtifactLookupParams;
export type AppServerMediaTaskArtifactListParams =
  MediaTaskArtifactListParams;
export type AppServerMediaTaskArtifactResponse = MediaTaskArtifactResponse;
export type AppServerMediaTaskArtifactListResponse =
  MediaTaskArtifactListResponse;
export type AppServerUsageStatsRangeParams = UsageStatsRangeParams;
export type AppServerUsageStatsReadResponse = UsageStatsReadResponse;
export type AppServerUsageStatsModelRankingListResponse =
  UsageStatsModelRankingListResponse;
export type AppServerUsageStatsDailyTrendsListResponse =
  UsageStatsDailyTrendsListResponse;

export type AppServerRequestResult<T> = {
  id: AppServerRequestId;
  result: T;
  response: AppServerJsonRpcResponse<T>;
  notifications: AppServerJsonRpcNotification[];
  messages: AppServerJsonRpcMessage[];
};

export class AppServerRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  readonly response: AppServerJsonRpcErrorResponse;
  readonly notifications: AppServerJsonRpcNotification[];
  readonly messages: AppServerJsonRpcMessage[];

  constructor(
    response: AppServerJsonRpcErrorResponse,
    notifications: AppServerJsonRpcNotification[] = [],
    messages: AppServerJsonRpcMessage[] = [],
  ) {
    super(response.error.message);
    this.name = "AppServerRpcError";
    this.code = response.error.code;
    this.data = response.error.data;
    this.response = response;
    this.notifications = notifications;
    this.messages = messages;
  }
}

export async function handleAppServerJsonLines(
  request: AppServerHandleJsonLinesRequest,
): Promise<AppServerHandleJsonLinesResult> {
  return unwrapAppServerSafeInvokeResult(
    "app_server_handle_json_lines",
    await safeInvoke<
      AppServerSafeInvokeEnvelope<AppServerHandleJsonLinesResult>
    >("app_server_handle_json_lines", { request }),
  );
}

export async function drainAppServerEvents(
  request: AppServerDrainEventsRequest = {},
): Promise<AppServerDrainEventsResult> {
  return unwrapAppServerSafeInvokeResult(
    "app_server_drain_events",
    await safeInvoke<AppServerSafeInvokeEnvelope<AppServerDrainEventsResult>>(
      "app_server_drain_events",
      { request },
    ),
  );
}

function unwrapAppServerSafeInvokeResult<T>(
  command: string,
  payload: AppServerSafeInvokeEnvelope<T>,
): T {
  assertNotDiagnosticFacade(command, payload, "真实 App Server bridge");
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "result" in payload
  ) {
    const result = (payload as { result?: T }).result as T;
    assertNotDiagnosticFacade(command, result, "真实 App Server bridge");
    return result;
  }
  return payload as T;
}

export function createAppServerRequest(
  id: AppServerRequestId,
  method: string,
  params?: unknown,
): AppServerJsonRpcRequest {
  return createProtocolRequest(id, method, params);
}

export function createAppServerNotification(
  method: string,
  params?: unknown,
): AppServerJsonRpcNotification {
  return createProtocolNotification(method, params);
}

export function encodeAppServerMessage(
  message: AppServerJsonRpcMessage,
): string {
  return encodeMessage(message);
}

export function decodeAppServerMessage(line: string): AppServerJsonRpcMessage {
  return decodeMessage(line);
}

export function decodeAppServerMessages(
  lines: string[],
): AppServerJsonRpcMessage[] {
  return decodeMessages(lines);
}

export class AppServerClient {
  #nextRequestId: number;

  constructor(options: { initialRequestId?: number } = {}) {
    this.#nextRequestId = options.initialRequestId ?? 1;
  }

  nextId(): AppServerRequestId {
    const id = this.#nextRequestId;
    this.#nextRequestId += 1;
    return id;
  }

  async initialize(
    params: AppServerInitializeParams,
  ): Promise<AppServerRequestResult<AppServerInitializeResponse>> {
    const result = await this.request<AppServerInitializeResponse>(
      APP_SERVER_METHOD_INITIALIZE,
      params,
    );
    assertAppServerProtocol(result.result);
    await this.notify(APP_SERVER_METHOD_INITIALIZED, {});
    return result;
  }

  async startSession(
    params: AppServerAgentSessionStartParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionStartResponse>> {
    return await this.request<AppServerAgentSessionStartResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_START,
      params,
    );
  }

  async listCapabilities(
    params: AppServerCapabilityListParams = {},
  ): Promise<AppServerRequestResult<AppServerCapabilityListResponse>> {
    return await this.request<AppServerCapabilityListResponse>(
      APP_SERVER_METHOD_CAPABILITY_LIST,
      params,
    );
  }

  async readArtifacts(
    params: AppServerArtifactReadParams,
  ): Promise<AppServerRequestResult<AppServerArtifactReadResponse>> {
    return await this.request<AppServerArtifactReadResponse>(
      APP_SERVER_METHOD_ARTIFACT_READ,
      params,
    );
  }

  async listDirectory(
    params: AppServerFileSystemListDirectoryParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemDirectoryListing>> {
    return await this.request<AppServerFileSystemDirectoryListing>(
      APP_SERVER_METHOD_FILE_SYSTEM_LIST_DIRECTORY,
      params,
    );
  }

  async readFilePreview(
    params: AppServerFileSystemReadFilePreviewParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemFilePreview>> {
    return await this.request<AppServerFileSystemFilePreview>(
      APP_SERVER_METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
      params,
    );
  }

  async createFile(
    params: AppServerFileSystemCreateFileParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemMutationResponse>> {
    return await this.request<AppServerFileSystemMutationResponse>(
      APP_SERVER_METHOD_FILE_SYSTEM_CREATE_FILE,
      params,
    );
  }

  async createDirectory(
    params: AppServerFileSystemCreateDirectoryParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemMutationResponse>> {
    return await this.request<AppServerFileSystemMutationResponse>(
      APP_SERVER_METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
      params,
    );
  }

  async renameFile(
    params: AppServerFileSystemRenameFileParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemMutationResponse>> {
    return await this.request<AppServerFileSystemMutationResponse>(
      APP_SERVER_METHOD_FILE_SYSTEM_RENAME_FILE,
      params,
    );
  }

  async deleteFile(
    params: AppServerFileSystemDeleteFileParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemMutationResponse>> {
    return await this.request<AppServerFileSystemMutationResponse>(
      APP_SERVER_METHOD_FILE_SYSTEM_DELETE_FILE,
      params,
    );
  }

  async exportEvidence(
    params: AppServerEvidenceExportParams,
  ): Promise<AppServerRequestResult<AppServerEvidenceExportResponse>> {
    return await this.request<AppServerEvidenceExportResponse>(
      APP_SERVER_METHOD_EVIDENCE_EXPORT,
      params,
    );
  }

  async exportHandoffBundle(
    params: AppServerAgentSessionHandoffBundleExportParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionHandoffBundleExportResponse>
  > {
    return await this.request<AppServerAgentSessionHandoffBundleExportResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
      params,
    );
  }

  async exportReplayCase(
    params: AppServerAgentSessionReplayCaseExportParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionReplayCaseExportResponse>
  > {
    return await this.request<AppServerAgentSessionReplayCaseExportResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
      params,
    );
  }

  async exportAnalysisHandoff(
    params: AppServerAgentSessionAnalysisHandoffExportParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionAnalysisHandoffExportResponse>
  > {
    return await this.request<AppServerAgentSessionAnalysisHandoffExportResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
      params,
    );
  }

  async exportReviewDecisionTemplate(
    params: AppServerAgentSessionReviewDecisionTemplateExportParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionReviewDecisionTemplateExportResponse>
  > {
    return await this.request<AppServerAgentSessionReviewDecisionTemplateExportResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
      params,
    );
  }

  async saveReviewDecision(
    params: AppServerAgentSessionReviewDecisionSaveParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionReviewDecisionTemplateExportResponse>
  > {
    return await this.request<AppServerAgentSessionReviewDecisionTemplateExportResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
      params,
    );
  }

  async readSession(
    params: AppServerAgentSessionReadParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionReadResponse>> {
    return await this.request<AppServerAgentSessionReadResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_READ,
      params,
    );
  }

  async updateSession(
    params: AppServerAgentSessionUpdateParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionUpdateResponse>> {
    return await this.request<AppServerAgentSessionUpdateResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_UPDATE,
      params,
    );
  }

  async readAgentSessionObjective(
    params: AppServerAgentSessionObjectiveReadParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionObjectiveReadResponse>
  > {
    return await this.request<AppServerAgentSessionObjectiveReadResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ,
      params,
    );
  }

  async setAgentSessionObjective(
    params: AppServerAgentSessionObjectiveSetParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionObjectiveSetResponse>> {
    return await this.request<AppServerAgentSessionObjectiveSetResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET,
      params,
    );
  }

  async updateAgentSessionObjectiveStatus(
    params: AppServerAgentSessionObjectiveStatusUpdateParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionObjectiveStatusUpdateResponse>
  > {
    return await this.request<AppServerAgentSessionObjectiveStatusUpdateResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
      params,
    );
  }

  async clearAgentSessionObjective(
    params: AppServerAgentSessionObjectiveClearParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionObjectiveClearResponse>
  > {
    return await this.request<AppServerAgentSessionObjectiveClearResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
      params,
    );
  }

  async continueAgentSessionObjective(
    params: AppServerAgentSessionObjectiveContinueParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionObjectiveContinueResponse>
  > {
    return await this.request<AppServerAgentSessionObjectiveContinueResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
      params,
    );
  }

  async auditAgentSessionObjective(
    params: AppServerAgentSessionObjectiveAuditParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionObjectiveAuditResponse>> {
    return await this.request<AppServerAgentSessionObjectiveAuditResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
      params,
    );
  }

  async compactAgentSession(
    params: AppServerAgentSessionCompactParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionCompactResponse>> {
    return await this.request<AppServerAgentSessionCompactResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_COMPACT,
      params,
    );
  }

  async resumeAgentSessionThread(
    params: AppServerAgentSessionThreadResumeParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionThreadResumeResponse>> {
    return await this.request<AppServerAgentSessionThreadResumeResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_THREAD_RESUME,
      params,
    );
  }

  async removeAgentSessionQueuedTurn(
    params: AppServerAgentSessionQueuedTurnRemoveParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionQueuedTurnRemoveResponse>
  > {
    return await this.request<AppServerAgentSessionQueuedTurnRemoveResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
      params,
    );
  }

  async promoteAgentSessionQueuedTurn(
    params: AppServerAgentSessionQueuedTurnPromoteParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionQueuedTurnPromoteResponse>
  > {
    return await this.request<AppServerAgentSessionQueuedTurnPromoteResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
      params,
    );
  }

  async listAgentSessionFileCheckpoints(
    params: AppServerAgentSessionFileCheckpointListParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionFileCheckpointListResponse>
  > {
    return await this.request<AppServerAgentSessionFileCheckpointListResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
      params,
    );
  }

  async getAgentSessionFileCheckpoint(
    params: AppServerAgentSessionFileCheckpointGetParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionFileCheckpointDetail>
  > {
    return await this.request<AppServerAgentSessionFileCheckpointDetail>(
      APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
      params,
    );
  }

  async diffAgentSessionFileCheckpoint(
    params: AppServerAgentSessionFileCheckpointDiffParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionFileCheckpointDiffResponse>
  > {
    return await this.request<AppServerAgentSessionFileCheckpointDiffResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
      params,
    );
  }

  async restoreAgentSessionFileCheckpoint(
    params: AppServerAgentSessionFileCheckpointRestoreParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionFileCheckpointRestoreResponse>
  > {
    return await this.request<AppServerAgentSessionFileCheckpointRestoreResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
      params,
    );
  }

  async startTurn(
    params: AppServerAgentSessionTurnStartParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionTurnStartResponse>> {
    return await this.request<AppServerAgentSessionTurnStartResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_TURN_START,
      params,
    );
  }

  async cancelTurn(
    params: AppServerAgentSessionTurnCancelParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionTurnCancelResponse>> {
    return await this.request<AppServerAgentSessionTurnCancelResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL,
      params,
    );
  }

  async respondAction(
    params: AppServerAgentSessionActionRespondParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionActionRespondResponse>
  > {
    return await this.request<AppServerAgentSessionActionRespondResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
      params,
    );
  }

  async replayAction(
    params: AppServerAgentSessionActionReplayParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionActionReplayResponse>> {
    return await this.request<AppServerAgentSessionActionReplayResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_ACTION_REPLAY,
      params,
    );
  }

  async listLogs(): Promise<AppServerRequestResult<AppServerLogListResponse>> {
    return await this.request<AppServerLogListResponse>(
      APP_SERVER_METHOD_LOG_LIST,
      {},
    );
  }

  async readPersistedLogTail(
    params: AppServerLogPersistedTailParams,
  ): Promise<AppServerRequestResult<AppServerLogPersistedTailResponse>> {
    return await this.request<AppServerLogPersistedTailResponse>(
      APP_SERVER_METHOD_LOG_PERSISTED_TAIL,
      params,
    );
  }

  async clearLogs(): Promise<AppServerRequestResult<AppServerLogClearResponse>> {
    return await this.request<AppServerLogClearResponse>(
      APP_SERVER_METHOD_LOG_CLEAR,
      {},
    );
  }

  async clearDiagnosticLogHistory(): Promise<
    AppServerRequestResult<AppServerLogClearResponse>
  > {
    return await this.request<AppServerLogClearResponse>(
      APP_SERVER_METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
      {},
    );
  }

  async readLogStorageDiagnostics(): Promise<
    AppServerRequestResult<AppServerLogStorageDiagnosticsResponse>
  > {
    return await this.request<AppServerLogStorageDiagnosticsResponse>(
      APP_SERVER_METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
      {},
    );
  }

  async exportSupportBundle(): Promise<
    AppServerRequestResult<AppServerSupportBundleExportResponse>
  > {
    return await this.request<AppServerSupportBundleExportResponse>(
      APP_SERVER_METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
      {},
    );
  }

  async readServerDiagnostics(): Promise<
    AppServerRequestResult<AppServerServerDiagnosticsResponse>
  > {
    return await this.request<AppServerServerDiagnosticsResponse>(
      APP_SERVER_METHOD_DIAGNOSTICS_SERVER_READ,
      {},
    );
  }

  async readWindowsStartupDiagnostics(): Promise<
    AppServerRequestResult<AppServerWindowsStartupDiagnosticsResponse>
  > {
    return await this.request<AppServerWindowsStartupDiagnosticsResponse>(
      APP_SERVER_METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
      {},
    );
  }

  async readGatewayChannelStatus(
    params: AppServerGatewayChannelStatusParams,
  ): Promise<AppServerRequestResult<AppServerGatewayChannelStatusResponse>> {
    return await this.request<AppServerGatewayChannelStatusResponse>(
      APP_SERVER_METHOD_GATEWAY_CHANNEL_STATUS,
      params,
    );
  }

  async startGatewayChannel(
    params: AppServerGatewayChannelStartParams,
  ): Promise<AppServerRequestResult<AppServerGatewayChannelStatusResponse>> {
    return await this.request<AppServerGatewayChannelStatusResponse>(
      APP_SERVER_METHOD_GATEWAY_CHANNEL_START,
      params,
    );
  }

  async stopGatewayChannel(
    params: AppServerGatewayChannelStopParams,
  ): Promise<AppServerRequestResult<AppServerGatewayChannelStatusResponse>> {
    return await this.request<AppServerGatewayChannelStatusResponse>(
      APP_SERVER_METHOD_GATEWAY_CHANNEL_STOP,
      params,
    );
  }

  async probeTelegramChannel(
    params: AppServerChannelProbeParams = {},
  ): Promise<AppServerRequestResult<AppServerChannelProbeResponse>> {
    return await this.request<AppServerChannelProbeResponse>(
      APP_SERVER_METHOD_TELEGRAM_CHANNEL_PROBE,
      params,
    );
  }

  async probeFeishuChannel(
    params: AppServerChannelProbeParams = {},
  ): Promise<AppServerRequestResult<AppServerChannelProbeResponse>> {
    return await this.request<AppServerChannelProbeResponse>(
      APP_SERVER_METHOD_FEISHU_CHANNEL_PROBE,
      params,
    );
  }

  async probeDiscordChannel(
    params: AppServerChannelProbeParams = {},
  ): Promise<AppServerRequestResult<AppServerChannelProbeResponse>> {
    return await this.request<AppServerChannelProbeResponse>(
      APP_SERVER_METHOD_DISCORD_CHANNEL_PROBE,
      params,
    );
  }

  async probeWechatChannel(
    params: AppServerChannelProbeParams = {},
  ): Promise<AppServerRequestResult<AppServerChannelProbeResponse>> {
    return await this.request<AppServerChannelProbeResponse>(
      APP_SERVER_METHOD_WECHAT_CHANNEL_PROBE,
      params,
    );
  }

  async startWechatChannelLogin(
    params: AppServerWechatLoginStartParams = {},
  ): Promise<AppServerRequestResult<AppServerWechatLoginStartResponse>> {
    return await this.request<AppServerWechatLoginStartResponse>(
      APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_START,
      params,
    );
  }

  async waitWechatChannelLogin(
    params: AppServerWechatLoginWaitParams,
  ): Promise<AppServerRequestResult<AppServerWechatLoginWaitResponse>> {
    return await this.request<AppServerWechatLoginWaitResponse>(
      APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
      params,
    );
  }

  async listWechatChannelAccounts(): Promise<
    AppServerRequestResult<AppServerWechatChannelAccountListResponse>
  > {
    return await this.request<AppServerWechatChannelAccountListResponse>(
      APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
      {},
    );
  }

  async removeWechatChannelAccount(
    params: AppServerWechatChannelAccountRemoveParams,
  ): Promise<
    AppServerRequestResult<AppServerWechatChannelAccountRemoveResponse>
  > {
    return await this.request<AppServerWechatChannelAccountRemoveResponse>(
      APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
      params,
    );
  }

  async setWechatChannelRuntimeModel(
    params: AppServerWechatRuntimeModelSetParams,
  ): Promise<AppServerRequestResult<AppServerWechatRuntimeModelSetResponse>> {
    return await this.request<AppServerWechatRuntimeModelSetResponse>(
      APP_SERVER_METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
      params,
    );
  }

  async probeGatewayTunnel(): Promise<
    AppServerRequestResult<AppServerGatewayTunnelProbeResponse>
  > {
    return await this.request<AppServerGatewayTunnelProbeResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_PROBE,
      {},
    );
  }

  async detectGatewayTunnelCloudflared(): Promise<
    AppServerRequestResult<AppServerGatewayTunnelCloudflaredDetectResponse>
  > {
    return await this.request<AppServerGatewayTunnelCloudflaredDetectResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
      {},
    );
  }

  async installGatewayTunnelCloudflared(
    params: AppServerGatewayTunnelCloudflaredInstallParams,
  ): Promise<
    AppServerRequestResult<AppServerGatewayTunnelCloudflaredInstallResponse>
  > {
    return await this.request<AppServerGatewayTunnelCloudflaredInstallResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
      params,
    );
  }

  async createGatewayTunnel(
    params: AppServerGatewayTunnelCreateParams,
  ): Promise<AppServerRequestResult<AppServerGatewayTunnelCreateResponse>> {
    return await this.request<AppServerGatewayTunnelCreateResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_CREATE,
      params,
    );
  }

  async startGatewayTunnel(): Promise<
    AppServerRequestResult<AppServerGatewayTunnelStatusResponse>
  > {
    return await this.request<AppServerGatewayTunnelStatusResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_START,
      {},
    );
  }

  async stopGatewayTunnel(): Promise<
    AppServerRequestResult<AppServerGatewayTunnelStatusResponse>
  > {
    return await this.request<AppServerGatewayTunnelStatusResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_STOP,
      {},
    );
  }

  async restartGatewayTunnel(): Promise<
    AppServerRequestResult<AppServerGatewayTunnelStatusResponse>
  > {
    return await this.request<AppServerGatewayTunnelStatusResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_RESTART,
      {},
    );
  }

  async readGatewayTunnelStatus(): Promise<
    AppServerRequestResult<AppServerGatewayTunnelStatusResponse>
  > {
    return await this.request<AppServerGatewayTunnelStatusResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_STATUS,
      {},
    );
  }

  async syncGatewayTunnelWebhookUrl(
    params: AppServerGatewayTunnelSyncWebhookUrlParams,
  ): Promise<
    AppServerRequestResult<AppServerGatewayTunnelSyncWebhookUrlResponse>
  > {
    return await this.request<AppServerGatewayTunnelSyncWebhookUrlResponse>(
      APP_SERVER_METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
      params,
    );
  }

  async createImageMediaTaskArtifact(
    params: AppServerMediaTaskArtifactImageCreateParams,
  ): Promise<AppServerRequestResult<AppServerMediaTaskArtifactResponse>> {
    return await this.request<AppServerMediaTaskArtifactResponse>(
      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
      params,
    );
  }

  async createAudioMediaTaskArtifact(
    params: AppServerMediaTaskArtifactAudioCreateParams,
  ): Promise<AppServerRequestResult<AppServerMediaTaskArtifactResponse>> {
    return await this.request<AppServerMediaTaskArtifactResponse>(
      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
      params,
    );
  }

  async completeAudioMediaTaskArtifact(
    params: AppServerMediaTaskArtifactAudioCompleteParams,
  ): Promise<AppServerRequestResult<AppServerMediaTaskArtifactResponse>> {
    return await this.request<AppServerMediaTaskArtifactResponse>(
      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
      params,
    );
  }

  async getMediaTaskArtifact(
    params: AppServerMediaTaskArtifactLookupParams,
  ): Promise<AppServerRequestResult<AppServerMediaTaskArtifactResponse>> {
    return await this.request<AppServerMediaTaskArtifactResponse>(
      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
      params,
    );
  }

  async listMediaTaskArtifacts(
    params: AppServerMediaTaskArtifactListParams,
  ): Promise<AppServerRequestResult<AppServerMediaTaskArtifactListResponse>> {
    return await this.request<AppServerMediaTaskArtifactListResponse>(
      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
      params,
    );
  }

  async cancelMediaTaskArtifact(
    params: AppServerMediaTaskArtifactLookupParams,
  ): Promise<AppServerRequestResult<AppServerMediaTaskArtifactResponse>> {
    return await this.request<AppServerMediaTaskArtifactResponse>(
      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
      params,
    );
  }

  async readUsageStats(
    params: AppServerUsageStatsRangeParams,
  ): Promise<AppServerRequestResult<AppServerUsageStatsReadResponse>> {
    return await this.request<AppServerUsageStatsReadResponse>(
      APP_SERVER_METHOD_USAGE_STATS_READ,
      params,
    );
  }

  async listUsageStatsModelRanking(
    params: AppServerUsageStatsRangeParams,
  ): Promise<
    AppServerRequestResult<AppServerUsageStatsModelRankingListResponse>
  > {
    return await this.request<AppServerUsageStatsModelRankingListResponse>(
      APP_SERVER_METHOD_USAGE_STATS_MODEL_RANKING_LIST,
      params,
    );
  }

  async listUsageStatsDailyTrends(
    params: AppServerUsageStatsRangeParams,
  ): Promise<
    AppServerRequestResult<AppServerUsageStatsDailyTrendsListResponse>
  > {
    return await this.request<AppServerUsageStatsDailyTrendsListResponse>(
      APP_SERVER_METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
      params,
    );
  }

  async request<T>(
    method: string,
    params?: unknown,
  ): Promise<AppServerRequestResult<T>> {
    const request = createAppServerRequest(this.nextId(), method, params);
    const messages = await this.exchange([request]);
    return expectAppServerResponse<T>(messages, request.id, method);
  }

  async notify(
    method: string,
    params?: unknown,
  ): Promise<AppServerJsonRpcMessage[]> {
    return await this.exchange([createAppServerNotification(method, params)]);
  }

  async exchange(
    messages: AppServerJsonRpcMessage[],
  ): Promise<AppServerJsonRpcMessage[]> {
    const response = await handleAppServerJsonLines({
      lines: messages.map(encodeAppServerMessage),
    });
    return decodeAppServerMessages(response.lines);
  }

  async drainEvents(limit?: number): Promise<AppServerJsonRpcMessage[]> {
    const response = await drainAppServerEvents({ limit });
    return decodeAppServerMessages(response.lines);
  }
}

export function createAppServerClient(options?: {
  initialRequestId?: number;
}): AppServerClient {
  return new AppServerClient(options);
}

export function expectAppServerResponse<T>(
  messages: AppServerJsonRpcMessage[],
  id: AppServerRequestId,
  method: string,
): AppServerRequestResult<T> {
  const response = messages.find(
    (message): message is AppServerJsonRpcResponse<T> => {
      return isAppServerJsonRpcResponse(message) && message.id === id;
    },
  );
  if (response) {
    return {
      id,
      result: response.result,
      response,
      notifications: messages.filter(isAppServerJsonRpcNotification),
      messages,
    };
  }

  const error = messages.find(
    (message): message is AppServerJsonRpcErrorResponse => {
      return isAppServerJsonRpcErrorResponse(message) && message.id === id;
    },
  );
  if (error) {
    throw new AppServerRpcError(
      error,
      messages.filter(isAppServerJsonRpcNotification),
      messages,
    );
  }

  throw new Error(
    `expected ${method} response for App Server request ${String(id)}`,
  );
}

export function isAppServerJsonRpcNotification(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcNotification {
  return isJsonRpcNotification(message);
}

export function isAppServerJsonRpcResponse<T = unknown>(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcResponse<T> {
  return isJsonRpcResponse<T>(message);
}

export function isAppServerJsonRpcErrorResponse(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcErrorResponse {
  return isJsonRpcErrorResponse(message);
}

function assertAppServerProtocol(response: AppServerInitializeResponse): void {
  if (response.serverInfo.protocolVersion !== APP_SERVER_PROTOCOL_VERSION) {
    throw new Error(
      `unsupported app-server protocol: expected ${APP_SERVER_PROTOCOL_VERSION}, got ${response.serverInfo.protocolVersion}`,
    );
  }
}
