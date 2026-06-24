// @generated types re-export — 从 Rust JSON Schema 自动生成的类型定义
// 新代码优先从这里导入类型；手写类型逐步迁移后将删除
import type {
  ConversationImportSourceClient as GeneratedConversationImportSourceClient,
  ConversationImportSourceStatus as GeneratedConversationImportSourceStatus,
  ConversationImportThreadStatus as GeneratedConversationImportThreadStatus,
  WorkspaceRightSurfacePendingChangedParams as GeneratedWorkspaceRightSurfacePendingChangedParams,
} from "./generated/protocol-types.js";
export * from "./generated/protocol-types.js";
export type {
  ExecutionProcessDrainOutputParams,
  ExecutionProcessDrainOutputResponse,
  ExecutionProcessEmptyResponse,
  ExecutionProcessIdParams,
  ExecutionProcessStartParams,
  ExecutionProcessStartResponse,
  ExecutionProcessStatusResponse,
  ExecutionProcessWriteStdinParams,
} from "./generated/protocol-types.js";

export const JSONRPC_VERSION = "2.0";
export const PROTOCOL_VERSION = "appserver.v0";
export const SERVER_NAME = "app-server";

export const METHOD_INITIALIZE = "initialize";
export const METHOD_INITIALIZED = "initialized";
export const METHOD_CAPABILITY_LIST = "capability/list";
export const METHOD_ARTIFACT_READ = "artifact/read";
export const METHOD_FILE_SYSTEM_LIST_DIRECTORY = "fileSystem/listDirectory";
export const METHOD_FILE_SYSTEM_READ_FILE_PREVIEW =
  "fileSystem/readFilePreview";
export const METHOD_FILE_SYSTEM_CREATE_FILE = "fileSystem/createFile";
export const METHOD_FILE_SYSTEM_CREATE_DIRECTORY = "fileSystem/createDirectory";
export const METHOD_FILE_SYSTEM_RENAME_FILE = "fileSystem/renameFile";
export const METHOD_FILE_SYSTEM_DELETE_FILE = "fileSystem/deleteFile";
export const METHOD_PROJECT_GIT_STATUS = "projectGit/status";
export const METHOD_PROJECT_GIT_DIFF = "projectGit/diff";
export const METHOD_PROJECT_GIT_COMMITS_LIST = "projectGit/commits/list";
export const METHOD_PROJECT_GIT_BRANCH_CHECKOUT = "projectGit/branch/checkout";
export const METHOD_PROJECT_GIT_BRANCH_CREATE = "projectGit/branch/create";
export const METHOD_PROJECT_GIT_WORKTREE_CREATE = "projectGit/worktree/create";
export const METHOD_PROJECT_SHELL_SESSION_START = "projectShell/session/start";
export const METHOD_PROJECT_SHELL_SESSION_WRITE = "projectShell/session/write";
export const METHOD_PROJECT_SHELL_SESSION_RESIZE =
  "projectShell/session/resize";
export const METHOD_PROJECT_SHELL_SESSION_KILL = "projectShell/session/kill";
export const METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS =
  "projectShell/session/drainEvents";
export const METHOD_EXECUTION_PROCESS_START = "executionProcess/start";
export const METHOD_EXECUTION_PROCESS_WRITE_STDIN =
  "executionProcess/writeStdin";
export const METHOD_EXECUTION_PROCESS_INTERRUPT = "executionProcess/interrupt";
export const METHOD_EXECUTION_PROCESS_TERMINATE = "executionProcess/terminate";
export const METHOD_EXECUTION_PROCESS_STATUS = "executionProcess/status";
export const METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT =
  "executionProcess/drainOutput";
export const METHOD_EVIDENCE_EXPORT = "evidence/export";
export const METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT =
  "agentSession/handoffBundle/export";
export const METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT =
  "agentSession/replayCase/export";
export const METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT =
  "agentSession/analysisHandoff/export";
export const METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT =
  "agentSession/reviewDecisionTemplate/export";
export const METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE =
  "agentSession/reviewDecision/save";
export const METHOD_AGENT_SESSION_LIST = "agentSession/list";
export const METHOD_AGENT_SESSION_UPDATE = "agentSession/update";
export const METHOD_AGENT_SESSION_ARCHIVE_MANY = "agentSession/archiveMany";
export const METHOD_AGENT_SESSION_DELETE = "agentSession/delete";
export const METHOD_AGENT_SESSION_OBJECTIVE_READ =
  "agentSession/objective/read";
export const METHOD_AGENT_SESSION_OBJECTIVE_SET = "agentSession/objective/set";
export const METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE =
  "agentSession/objective/status/update";
export const METHOD_AGENT_SESSION_OBJECTIVE_CLEAR =
  "agentSession/objective/clear";
export const METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE =
  "agentSession/objective/continue";
export const METHOD_AGENT_SESSION_OBJECTIVE_AUDIT =
  "agentSession/objective/audit";
export const METHOD_AGENT_SESSION_COMPACT = "agentSession/compact";
export const METHOD_AGENT_SESSION_THREAD_RESUME = "agentSession/thread/resume";
export const METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE =
  "agentSession/queuedTurn/remove";
export const METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE =
  "agentSession/queuedTurn/promote";
export const METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST =
  "agentSession/fileCheckpoint/list";
export const METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET =
  "agentSession/fileCheckpoint/get";
export const METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF =
  "agentSession/fileCheckpoint/diff";
export const METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE =
  "agentSession/fileCheckpoint/restore";
export const METHOD_SESSION_FILE_GET_OR_CREATE = "sessionFile/getOrCreate";
export const METHOD_SESSION_FILE_UPDATE_META = "sessionFile/updateMeta";
export const METHOD_SESSION_FILE_SAVE = "sessionFile/save";
export const METHOD_SESSION_FILE_READ = "sessionFile/read";
export const METHOD_SESSION_FILE_RESOLVE_PATH = "sessionFile/resolvePath";
export const METHOD_SESSION_FILE_DELETE = "sessionFile/delete";
export const METHOD_SESSION_FILE_LIST = "sessionFile/list";
export const METHOD_WORKSPACE_LIST = "workspace/list";
export const METHOD_WORKSPACE_READ = "workspace/read";
export const METHOD_WORKSPACE_UPDATE = "workspace/update";
export const METHOD_WORKSPACE_DELETE = "workspace/delete";
export const METHOD_WORKSPACE_ENSURE = "workspace/ensure";
export const METHOD_WORKSPACE_BY_PATH_READ = "workspace/byPath/read";
export const METHOD_WORKSPACE_DEFAULT_READ = "workspace/default/read";
export const METHOD_WORKSPACE_DEFAULT_ENSURE = "workspace/default/ensure";
export const METHOD_WORKSPACE_PROJECTS_ROOT_READ =
  "workspace/projectsRoot/read";
export const METHOD_WORKSPACE_PROJECT_PATH_RESOLVE =
  "workspace/projectPath/resolve";
export const METHOD_WORKSPACE_ENSURE_READY = "workspace/ensureReady";
export const METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST =
  "workspaceRightSurface/request";
export const METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST =
  "workspaceRightSurface/pending/list";
export const METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME =
  "workspaceRightSurface/pending/consume";
export const METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS =
  "workspaceRightSurface/pending/dismiss";
export const METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED =
  "workspaceRightSurface/pendingChanged";
export const METHOD_BROWSER_SESSION_TARGET_LIST =
  "browserSession/target/list";
export const METHOD_BROWSER_SESSION_OPEN = "browserSession/open";
export const METHOD_BROWSER_SESSION_READ = "browserSession/read";
export const METHOD_BROWSER_SESSION_CLOSE = "browserSession/close";
export const METHOD_BROWSER_SESSION_EVENT_LIST =
  "browserSession/event/list";
export const METHOD_BROWSER_SESSION_ACTION_EXECUTE =
  "browserSession/action/execute";
export const METHOD_SKILL_LIST = "skill/list";
export const METHOD_SKILL_READ = "skill/read";
export const METHOD_SKILL_MANAGEMENT_LIST = "skillManagement/list";
export const METHOD_SKILL_MANAGEMENT_INSTALL = "skillManagement/install";
export const METHOD_SKILL_MANAGEMENT_UNINSTALL = "skillManagement/uninstall";
export const METHOD_SKILL_REPOSITORY_LIST = "skillRepository/list";
export const METHOD_SKILL_REPOSITORY_SAVE = "skillRepository/save";
export const METHOD_SKILL_REPOSITORY_DELETE = "skillRepository/delete";
export const METHOD_SKILL_CACHE_REFRESH = "skillCache/refresh";
export const METHOD_SKILL_INSTALLED_DIRECTORIES_LIST =
  "skillInstalledDirectories/list";
export const METHOD_SKILL_LOCAL_INSPECT = "skillLocal/inspect";
export const METHOD_SKILL_LOCAL_DETAIL_INSPECT = "skillLocal/detail/inspect";
export const METHOD_SKILL_LOCAL_SCAFFOLD_CREATE = "skillLocal/scaffold/create";
export const METHOD_SKILL_LOCAL_IMPORT = "skillLocal/import";
export const METHOD_SKILL_LOCAL_RENAME = "skillLocal/rename";
export const METHOD_SKILL_REMOTE_INSPECT = "skillRemote/inspect";
export const METHOD_SKILL_PACKAGE_LOCAL_INSPECT = "skillPackage/local/inspect";
export const METHOD_SKILL_PACKAGE_LOCAL_INSTALL = "skillPackage/local/install";
export const METHOD_SKILL_PACKAGE_LOCAL_REPLACE = "skillPackage/local/replace";
export const METHOD_SKILL_PACKAGE_EXPORT = "skillPackage/export";
export const METHOD_SKILL_MARKETPLACE_INSTALL = "skillMarketplace/install";
export const METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL =
  "skillPackage/download/install";
export const METHOD_WORKSPACE_SKILL_BINDINGS_LIST =
  "workspaceSkillBindings/list";
export const METHOD_WORKSPACE_REGISTERED_SKILLS_LIST =
  "workspaceRegisteredSkills/list";
export const METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT =
  "agentAppLocalPackage/inspect";
export const METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD =
  "agentAppPackage/fetchCloud";
export const METHOD_AGENT_APP_INSTALLED_SAVE = "agentAppInstalled/save";
export const METHOD_AGENT_APP_INSTALLED_LIST = "agentAppInstalled/list";
export const METHOD_AGENT_APP_INSTALLED_DISABLED_SET =
  "agentAppInstalled/disabled/set";
export const METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL =
  "agentAppInstalled/uninstall/rehearsal";
export const METHOD_AGENT_APP_INSTALLED_UNINSTALL =
  "agentAppInstalled/uninstall";
export const METHOD_AGENT_APP_HOST_LIFECYCLE_LIST =
  "agentAppHostLifecycle/list";
export const METHOD_AGENT_APP_SHELL_PREPARE = "agentAppShell/prepare";
export const METHOD_AGENT_APP_UI_RUNTIME_START = "agentAppUiRuntime/start";
export const METHOD_AGENT_APP_UI_RUNTIME_STATUS = "agentAppUiRuntime/status";
export const METHOD_AGENT_APP_UI_RUNTIME_STOP = "agentAppUiRuntime/stop";
export const METHOD_KNOWLEDGE_PACK_LIST = "knowledgePack/list";
export const METHOD_KNOWLEDGE_PACK_READ = "knowledgePack/read";
export const METHOD_KNOWLEDGE_SOURCE_IMPORT = "knowledgePack/source/import";
export const METHOD_KNOWLEDGE_PACK_COMPILE = "knowledgePack/compile";
export const METHOD_KNOWLEDGE_PACK_DEFAULT_SET = "knowledgePack/default/set";
export const METHOD_KNOWLEDGE_PACK_STATUS_UPDATE =
  "knowledgePack/status/update";
export const METHOD_KNOWLEDGE_CONTEXT_RESOLVE = "knowledgeContext/resolve";
export const METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE =
  "knowledgeContextRun/validate";
export const METHOD_AUTOMATION_SCHEDULER_CONFIG_READ =
  "automationScheduler/config/read";
export const METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE =
  "automationScheduler/config/update";
export const METHOD_AUTOMATION_SCHEDULER_STATUS = "automationScheduler/status";
export const METHOD_AUTOMATION_JOB_LIST = "automationJob/list";
export const METHOD_AUTOMATION_JOB_READ = "automationJob/read";
export const METHOD_AUTOMATION_JOB_CREATE = "automationJob/create";
export const METHOD_AUTOMATION_JOB_UPDATE = "automationJob/update";
export const METHOD_AUTOMATION_JOB_DELETE = "automationJob/delete";
export const METHOD_AUTOMATION_JOB_RUN_NOW = "automationJob/runNow";
export const METHOD_AUTOMATION_JOB_HEALTH = "automationJob/health";
export const METHOD_AUTOMATION_JOB_RUN_HISTORY = "automationJob/runHistory";
export const METHOD_AUTOMATION_SCHEDULE_PREVIEW = "automationSchedule/preview";
export const METHOD_AUTOMATION_SCHEDULE_VALIDATE =
  "automationSchedule/validate";
export const METHOD_MCP_SERVER_LIST = "mcpServer/list";
export const METHOD_MCP_SERVER_STATUS_LIST = "mcpServerStatus/list";
export const METHOD_MCP_SERVER_CREATE = "mcpServer/create";
export const METHOD_MCP_SERVER_UPDATE = "mcpServer/update";
export const METHOD_MCP_SERVER_DELETE = "mcpServer/delete";
export const METHOD_MCP_SERVER_ENABLED_SET = "mcpServer/enabled/set";
export const METHOD_MCP_SERVER_IMPORT_FROM_APP = "mcpServer/importFromApp";
export const METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE = "mcpServer/syncAllToLive";
export const METHOD_MCP_SERVER_OAUTH_LOGIN = "mcpServer/oauth/login";
export const METHOD_MCP_SERVER_START = "mcpServer/start";
export const METHOD_MCP_SERVER_STOP = "mcpServer/stop";
export const METHOD_MCP_TOOL_LIST = "mcpTool/list";
export const METHOD_MCP_TOOL_LIST_FOR_CONTEXT = "mcpTool/listForContext";
export const METHOD_MCP_TOOL_SEARCH = "mcpTool/search";
export const METHOD_MCP_TOOL_CALL = "mcpTool/call";
export const METHOD_MCP_TOOL_CALL_WITH_CALLER = "mcpTool/callWithCaller";
export const METHOD_MCP_PROMPT_LIST = "mcpPrompt/list";
export const METHOD_MCP_PROMPT_GET = "mcpPrompt/get";
export const METHOD_MCP_RESOURCE_LIST = "mcpResource/list";
export const METHOD_MCP_RESOURCE_READ = "mcpResource/read";
export const METHOD_MCP_RESOURCE_SUBSCRIBE = "mcpResource/subscribe";
export const METHOD_MCP_RESOURCE_UNSUBSCRIBE = "mcpResource/unsubscribe";
export const METHOD_PROJECT_MEMORY_READ = "projectMemory/read";
export const METHOD_MEMORY_STORE_LIST = "memoryStore/list";
export const METHOD_MEMORY_STORE_READ = "memoryStore/read";
export const METHOD_MEMORY_STORE_SEARCH = "memoryStore/search";
export const METHOD_MEMORY_STORE_ADD_NOTE = "memoryStore/addNote";
export const METHOD_MEMORY_STORE_CONSOLIDATE = "memoryStore/consolidate";
export const METHOD_MEMORY_STORE_REVIEW_LIST = "memoryStore/review/list";
export const METHOD_MEMORY_STORE_REVIEW_RESOLVE = "memoryStore/review/resolve";
export const METHOD_MEMORY_STORE_HEALTH = "memoryStore/health";
export const METHOD_MEMORY_STORE_RESET = "memoryStore/reset";
export const METHOD_MEMORY_STORE_INDEX_REBUILD = "memoryStore/index/rebuild";
export const METHOD_LOG_LIST = "log/list";
export const METHOD_LOG_PERSISTED_TAIL = "log/persistedTail";
export const METHOD_LOG_CLEAR = "log/clear";
export const METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR =
  "log/diagnosticHistory/clear";
export const METHOD_DIAGNOSTICS_LOG_STORAGE_READ =
  "diagnostics/logStorage/read";
export const METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT =
  "diagnostics/supportBundle/export";
export const METHOD_DIAGNOSTICS_SERVER_READ = "diagnostics/server/read";
export const METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ =
  "diagnostics/windowsStartup/read";
export const METHOD_GATEWAY_CHANNEL_START = "gatewayChannel/start";
export const METHOD_GATEWAY_CHANNEL_STOP = "gatewayChannel/stop";
export const METHOD_GATEWAY_CHANNEL_STATUS = "gatewayChannel/status";
export const METHOD_TELEGRAM_CHANNEL_PROBE = "telegramChannel/probe";
export const METHOD_FEISHU_CHANNEL_PROBE = "feishuChannel/probe";
export const METHOD_DISCORD_CHANNEL_PROBE = "discordChannel/probe";
export const METHOD_WECHAT_CHANNEL_PROBE = "wechatChannel/probe";
export const METHOD_WECHAT_CHANNEL_LOGIN_START = "wechatChannel/login/start";
export const METHOD_WECHAT_CHANNEL_LOGIN_WAIT = "wechatChannel/login/wait";
export const METHOD_WECHAT_CHANNEL_ACCOUNT_LIST = "wechatChannel/accounts/list";
export const METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE =
  "wechatChannel/account/remove";
export const METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET =
  "wechatChannel/runtimeModel/set";
export const METHOD_GATEWAY_TUNNEL_PROBE = "gatewayTunnel/probe";
export const METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT =
  "gatewayTunnel/cloudflared/detect";
export const METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL =
  "gatewayTunnel/cloudflared/install";
export const METHOD_GATEWAY_TUNNEL_CREATE = "gatewayTunnel/create";
export const METHOD_GATEWAY_TUNNEL_START = "gatewayTunnel/start";
export const METHOD_GATEWAY_TUNNEL_STOP = "gatewayTunnel/stop";
export const METHOD_GATEWAY_TUNNEL_RESTART = "gatewayTunnel/restart";
export const METHOD_GATEWAY_TUNNEL_STATUS = "gatewayTunnel/status";
export const METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL =
  "gatewayTunnel/syncWebhookUrl";
export const METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE =
  "mediaTaskArtifact/image/create";
export const METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE =
  "mediaTaskArtifact/audio/create";
export const METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE =
  "mediaTaskArtifact/video/create";
export const METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE =
  "mediaTaskArtifact/audio/complete";
export const METHOD_MEDIA_TASK_ARTIFACT_GET = "mediaTaskArtifact/get";
export const METHOD_MEDIA_TASK_ARTIFACT_LIST = "mediaTaskArtifact/list";
export const METHOD_MEDIA_TASK_ARTIFACT_CANCEL = "mediaTaskArtifact/cancel";
export const METHOD_GALLERY_MATERIAL_GET = "galleryMaterial/get";
export const METHOD_GALLERY_MATERIAL_METADATA_CREATE =
  "galleryMaterialMetadata/create";
export const METHOD_GALLERY_MATERIAL_METADATA_GET =
  "galleryMaterialMetadata/get";
export const METHOD_GALLERY_MATERIAL_METADATA_UPDATE =
  "galleryMaterialMetadata/update";
export const METHOD_GALLERY_MATERIAL_METADATA_DELETE =
  "galleryMaterialMetadata/delete";
export const METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY =
  "galleryMaterial/listByImageCategory";
export const METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY =
  "galleryMaterial/listByLayoutCategory";
export const METHOD_GALLERY_MATERIAL_LIST_BY_MOOD =
  "galleryMaterial/listByMood";
export const METHOD_PROJECT_MATERIAL_LIST = "projectMaterial/list";
export const METHOD_PROJECT_MATERIAL_GET = "projectMaterial/get";
export const METHOD_PROJECT_MATERIAL_COUNT = "projectMaterial/count";
export const METHOD_PROJECT_MATERIAL_UPLOAD = "projectMaterial/upload";
export const METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL =
  "projectMaterial/importFromUrl";
export const METHOD_PROJECT_MATERIAL_UPDATE = "projectMaterial/update";
export const METHOD_PROJECT_MATERIAL_DELETE = "projectMaterial/delete";
export const METHOD_PROJECT_MATERIAL_CONTENT = "projectMaterial/content";
export const METHOD_VOICE_ASR_CREDENTIAL_LIST = "voiceAsrCredential/list";
export const METHOD_VOICE_ASR_CREDENTIAL_CREATE = "voiceAsrCredential/create";
export const METHOD_VOICE_ASR_CREDENTIAL_UPDATE = "voiceAsrCredential/update";
export const METHOD_VOICE_ASR_CREDENTIAL_DELETE = "voiceAsrCredential/delete";
export const METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET =
  "voiceAsrCredential/default/set";
export const METHOD_VOICE_ASR_CREDENTIAL_TEST = "voiceAsrCredential/test";
export const METHOD_VOICE_INSTRUCTION_LIST = "voiceInstruction/list";
export const METHOD_VOICE_INSTRUCTION_SAVE = "voiceInstruction/save";
export const METHOD_VOICE_INSTRUCTION_DELETE = "voiceInstruction/delete";
export const METHOD_VOICE_MODEL_DEFAULT_SET = "voiceModel/default/set";
export const METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE =
  "voiceModel/testTranscribeFile";
export const METHOD_USAGE_STATS_READ = "usageStats/read";
export const METHOD_USAGE_STATS_MODEL_RANKING_LIST =
  "usageStats/modelRanking/list";
export const METHOD_USAGE_STATS_DAILY_TRENDS_LIST =
  "usageStats/dailyTrends/list";
export const METHOD_AGENT_SESSION_START = "agentSession/start";
export const METHOD_AGENT_SESSION_READ = "agentSession/read";
export const METHOD_AGENT_SESSION_TOOL_INVENTORY_READ =
  "agentSession/toolInventory/read";
export const METHOD_AGENT_SESSION_TURN_START = "agentSession/turn/start";
export const METHOD_AGENT_SESSION_TURN_CANCEL = "agentSession/turn/cancel";
export const METHOD_AGENT_SESSION_ACTION_REPLAY = "agentSession/action/replay";
export const METHOD_AGENT_SESSION_ACTION_RESPOND =
  "agentSession/action/respond";
export const METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND =
  "agentSession/runtimeEvents/append";
export const METHOD_AGENT_SESSION_EVENT = "agentSession/event";
export const METHOD_MODEL_LIST = "model/list";
export const METHOD_MODEL_PREFERENCES_LIST = "modelPreferences/list";
export const METHOD_MODEL_SYNC_STATE_READ = "modelSyncState/read";
export const METHOD_MODEL_PROVIDER_LIST = "modelProvider/list";
export const METHOD_MODEL_PROVIDER_CATALOG_LIST = "modelProvider/catalog/list";
export const METHOD_MODEL_PROVIDER_READ = "modelProvider/read";
export const METHOD_MODEL_PROVIDER_CREATE = "modelProvider/create";
export const METHOD_MODEL_PROVIDER_UPDATE = "modelProvider/update";
export const METHOD_MODEL_PROVIDER_DELETE = "modelProvider/delete";
export const METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE =
  "modelProvider/sortOrders/update";
export const METHOD_MODEL_PROVIDER_CONFIG_EXPORT = "modelProviderConfig/export";
export const METHOD_MODEL_PROVIDER_CONFIG_IMPORT = "modelProviderConfig/import";
export const METHOD_MODEL_PROVIDER_TEST_CONNECTION =
  "modelProvider/testConnection";
export const METHOD_MODEL_PROVIDER_TEST_CHAT = "modelProvider/testChat";
export const METHOD_MODEL_PROVIDER_FETCH_MODELS = "modelProvider/fetchModels";
export const METHOD_MODEL_PROVIDER_KEY_CREATE = "modelProviderKey/create";
export const METHOD_MODEL_PROVIDER_KEY_UPDATE = "modelProviderKey/update";
export const METHOD_MODEL_PROVIDER_KEY_DELETE = "modelProviderKey/delete";
export const METHOD_MODEL_PROVIDER_KEY_NEXT = "modelProviderKey/next";
export const METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD =
  "modelProviderKey/usage/record";
export const METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD =
  "modelProviderKey/error/record";
export const METHOD_MODEL_PROVIDER_UI_STATE_READ = "modelProviderUiState/read";
export const METHOD_MODEL_PROVIDER_UI_STATE_WRITE =
  "modelProviderUiState/write";
export const METHOD_MODEL_PROVIDER_ALIAS_READ = "modelProviderAlias/read";
export const METHOD_MODEL_PROVIDER_ALIAS_LIST = "modelProviderAlias/list";
export const METHOD_CONNECT_DEEP_LINK_RESOLVE = "connectDeepLink/resolve";
export const METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE =
  "connectOpenDeepLink/resolve";
export const METHOD_CONNECT_RELAY_API_KEY_SAVE = "connectRelayApiKey/save";
export const METHOD_CONNECT_CALLBACK_SEND = "connectCallback/send";
export const METHOD_CONVERSATION_IMPORT_SOURCE_SCAN =
  "conversationImport/source/scan";
export const METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW =
  "conversationImport/thread/preview";
export const METHOD_CONVERSATION_IMPORT_THREAD_COMMIT =
  "conversationImport/thread/commit";
export const METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ =
  "conversationImport/thread/runtimeEvents/read";
export const CONVERSATION_IMPORT_SOURCE_CLIENTS = [
  "codex",
  "claude_code",
] as const satisfies readonly GeneratedConversationImportSourceClient[];
export const CONVERSATION_IMPORT_SOURCE_STATUSES = [
  "ready",
  "missing",
  "unsupported",
  "error",
] as const satisfies readonly GeneratedConversationImportSourceStatus[];
export const CONVERSATION_IMPORT_THREAD_STATUSES = [
  "not_imported",
  "imported",
  "conflict",
] as const satisfies readonly GeneratedConversationImportThreadStatus[];

export type AppServerMethodKind = "request" | "notification";

export type AppServerMethodSpec = {
  method: string;
  kind: AppServerMethodKind;
};

export const APP_SERVER_METHODS = [
  { method: METHOD_INITIALIZE, kind: "request" },
  { method: METHOD_INITIALIZED, kind: "notification" },
  { method: METHOD_CAPABILITY_LIST, kind: "request" },
  { method: METHOD_ARTIFACT_READ, kind: "request" },
  { method: METHOD_FILE_SYSTEM_LIST_DIRECTORY, kind: "request" },
  { method: METHOD_FILE_SYSTEM_READ_FILE_PREVIEW, kind: "request" },
  { method: METHOD_FILE_SYSTEM_CREATE_FILE, kind: "request" },
  { method: METHOD_FILE_SYSTEM_CREATE_DIRECTORY, kind: "request" },
  { method: METHOD_FILE_SYSTEM_RENAME_FILE, kind: "request" },
  { method: METHOD_FILE_SYSTEM_DELETE_FILE, kind: "request" },
  { method: METHOD_PROJECT_GIT_STATUS, kind: "request" },
  { method: METHOD_PROJECT_GIT_DIFF, kind: "request" },
  { method: METHOD_PROJECT_GIT_COMMITS_LIST, kind: "request" },
  { method: METHOD_PROJECT_GIT_BRANCH_CHECKOUT, kind: "request" },
  { method: METHOD_PROJECT_GIT_BRANCH_CREATE, kind: "request" },
  { method: METHOD_PROJECT_GIT_WORKTREE_CREATE, kind: "request" },
  { method: METHOD_PROJECT_SHELL_SESSION_START, kind: "request" },
  { method: METHOD_PROJECT_SHELL_SESSION_WRITE, kind: "request" },
  { method: METHOD_PROJECT_SHELL_SESSION_RESIZE, kind: "request" },
  { method: METHOD_PROJECT_SHELL_SESSION_KILL, kind: "request" },
  { method: METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS, kind: "request" },
  { method: METHOD_EXECUTION_PROCESS_START, kind: "request" },
  { method: METHOD_EXECUTION_PROCESS_WRITE_STDIN, kind: "request" },
  { method: METHOD_EXECUTION_PROCESS_INTERRUPT, kind: "request" },
  { method: METHOD_EXECUTION_PROCESS_TERMINATE, kind: "request" },
  { method: METHOD_EXECUTION_PROCESS_STATUS, kind: "request" },
  { method: METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT, kind: "request" },
  { method: METHOD_EVIDENCE_EXPORT, kind: "request" },
  { method: METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT, kind: "request" },
  { method: METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT, kind: "request" },
  { method: METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT, kind: "request" },
  {
    method: METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
    kind: "request",
  },
  { method: METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE, kind: "request" },
  { method: METHOD_AGENT_SESSION_LIST, kind: "request" },
  { method: METHOD_AGENT_SESSION_UPDATE, kind: "request" },
  { method: METHOD_AGENT_SESSION_ARCHIVE_MANY, kind: "request" },
  { method: METHOD_AGENT_SESSION_DELETE, kind: "request" },
  { method: METHOD_AGENT_SESSION_OBJECTIVE_READ, kind: "request" },
  { method: METHOD_AGENT_SESSION_OBJECTIVE_SET, kind: "request" },
  {
    method: METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
    kind: "request",
  },
  { method: METHOD_AGENT_SESSION_OBJECTIVE_CLEAR, kind: "request" },
  { method: METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE, kind: "request" },
  { method: METHOD_AGENT_SESSION_OBJECTIVE_AUDIT, kind: "request" },
  { method: METHOD_AGENT_SESSION_COMPACT, kind: "request" },
  { method: METHOD_AGENT_SESSION_THREAD_RESUME, kind: "request" },
  { method: METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE, kind: "request" },
  { method: METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE, kind: "request" },
  { method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST, kind: "request" },
  { method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET, kind: "request" },
  { method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF, kind: "request" },
  { method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE, kind: "request" },
  { method: METHOD_SESSION_FILE_GET_OR_CREATE, kind: "request" },
  { method: METHOD_SESSION_FILE_UPDATE_META, kind: "request" },
  { method: METHOD_SESSION_FILE_SAVE, kind: "request" },
  { method: METHOD_SESSION_FILE_READ, kind: "request" },
  { method: METHOD_SESSION_FILE_RESOLVE_PATH, kind: "request" },
  { method: METHOD_SESSION_FILE_DELETE, kind: "request" },
  { method: METHOD_SESSION_FILE_LIST, kind: "request" },
  { method: METHOD_WORKSPACE_LIST, kind: "request" },
  { method: METHOD_WORKSPACE_READ, kind: "request" },
  { method: METHOD_WORKSPACE_UPDATE, kind: "request" },
  { method: METHOD_WORKSPACE_DELETE, kind: "request" },
  { method: METHOD_WORKSPACE_ENSURE, kind: "request" },
  { method: METHOD_WORKSPACE_BY_PATH_READ, kind: "request" },
  { method: METHOD_WORKSPACE_DEFAULT_READ, kind: "request" },
  { method: METHOD_WORKSPACE_DEFAULT_ENSURE, kind: "request" },
  { method: METHOD_WORKSPACE_PROJECTS_ROOT_READ, kind: "request" },
  { method: METHOD_WORKSPACE_PROJECT_PATH_RESOLVE, kind: "request" },
  { method: METHOD_WORKSPACE_ENSURE_READY, kind: "request" },
  { method: METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST, kind: "request" },
  { method: METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST, kind: "request" },
  { method: METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME, kind: "request" },
  { method: METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS, kind: "request" },
  {
    method: METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED,
    kind: "notification",
  },
  { method: METHOD_BROWSER_SESSION_TARGET_LIST, kind: "request" },
  { method: METHOD_BROWSER_SESSION_OPEN, kind: "request" },
  { method: METHOD_BROWSER_SESSION_READ, kind: "request" },
  { method: METHOD_BROWSER_SESSION_CLOSE, kind: "request" },
  { method: METHOD_BROWSER_SESSION_EVENT_LIST, kind: "request" },
  { method: METHOD_BROWSER_SESSION_ACTION_EXECUTE, kind: "request" },
  { method: METHOD_SKILL_LIST, kind: "request" },
  { method: METHOD_SKILL_READ, kind: "request" },
  { method: METHOD_SKILL_MANAGEMENT_LIST, kind: "request" },
  { method: METHOD_SKILL_MANAGEMENT_INSTALL, kind: "request" },
  { method: METHOD_SKILL_MANAGEMENT_UNINSTALL, kind: "request" },
  { method: METHOD_SKILL_REPOSITORY_LIST, kind: "request" },
  { method: METHOD_SKILL_REPOSITORY_SAVE, kind: "request" },
  { method: METHOD_SKILL_REPOSITORY_DELETE, kind: "request" },
  { method: METHOD_SKILL_CACHE_REFRESH, kind: "request" },
  { method: METHOD_SKILL_INSTALLED_DIRECTORIES_LIST, kind: "request" },
  { method: METHOD_SKILL_LOCAL_INSPECT, kind: "request" },
  { method: METHOD_SKILL_LOCAL_DETAIL_INSPECT, kind: "request" },
  { method: METHOD_SKILL_LOCAL_SCAFFOLD_CREATE, kind: "request" },
  { method: METHOD_SKILL_LOCAL_IMPORT, kind: "request" },
  { method: METHOD_SKILL_LOCAL_RENAME, kind: "request" },
  { method: METHOD_SKILL_REMOTE_INSPECT, kind: "request" },
  { method: METHOD_SKILL_PACKAGE_LOCAL_INSPECT, kind: "request" },
  { method: METHOD_SKILL_PACKAGE_LOCAL_INSTALL, kind: "request" },
  { method: METHOD_SKILL_PACKAGE_LOCAL_REPLACE, kind: "request" },
  { method: METHOD_SKILL_PACKAGE_EXPORT, kind: "request" },
  { method: METHOD_SKILL_MARKETPLACE_INSTALL, kind: "request" },
  { method: METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL, kind: "request" },
  { method: METHOD_GATEWAY_CHANNEL_START, kind: "request" },
  { method: METHOD_GATEWAY_CHANNEL_STOP, kind: "request" },
  { method: METHOD_GATEWAY_CHANNEL_STATUS, kind: "request" },
  { method: METHOD_TELEGRAM_CHANNEL_PROBE, kind: "request" },
  { method: METHOD_FEISHU_CHANNEL_PROBE, kind: "request" },
  { method: METHOD_DISCORD_CHANNEL_PROBE, kind: "request" },
  { method: METHOD_WECHAT_CHANNEL_PROBE, kind: "request" },
  { method: METHOD_WECHAT_CHANNEL_LOGIN_START, kind: "request" },
  { method: METHOD_WECHAT_CHANNEL_LOGIN_WAIT, kind: "request" },
  { method: METHOD_WECHAT_CHANNEL_ACCOUNT_LIST, kind: "request" },
  { method: METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE, kind: "request" },
  { method: METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_PROBE, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_CREATE, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_START, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_STOP, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_RESTART, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_STATUS, kind: "request" },
  { method: METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL, kind: "request" },
  { method: METHOD_WORKSPACE_SKILL_BINDINGS_LIST, kind: "request" },
  { method: METHOD_WORKSPACE_REGISTERED_SKILLS_LIST, kind: "request" },
  { method: METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT, kind: "request" },
  { method: METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD, kind: "request" },
  { method: METHOD_AGENT_APP_INSTALLED_SAVE, kind: "request" },
  { method: METHOD_AGENT_APP_INSTALLED_LIST, kind: "request" },
  { method: METHOD_AGENT_APP_INSTALLED_DISABLED_SET, kind: "request" },
  {
    method: METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
    kind: "request",
  },
  { method: METHOD_AGENT_APP_INSTALLED_UNINSTALL, kind: "request" },
  { method: METHOD_AGENT_APP_HOST_LIFECYCLE_LIST, kind: "request" },
  { method: METHOD_AGENT_APP_SHELL_PREPARE, kind: "request" },
  { method: METHOD_AGENT_APP_UI_RUNTIME_START, kind: "request" },
  { method: METHOD_AGENT_APP_UI_RUNTIME_STATUS, kind: "request" },
  { method: METHOD_AGENT_APP_UI_RUNTIME_STOP, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_LIST, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_READ, kind: "request" },
  { method: METHOD_KNOWLEDGE_SOURCE_IMPORT, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_COMPILE, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_DEFAULT_SET, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_STATUS_UPDATE, kind: "request" },
  { method: METHOD_KNOWLEDGE_CONTEXT_RESOLVE, kind: "request" },
  { method: METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULER_CONFIG_READ, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULER_STATUS, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_LIST, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_READ, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_CREATE, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_UPDATE, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_DELETE, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_RUN_NOW, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_HEALTH, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_RUN_HISTORY, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULE_PREVIEW, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULE_VALIDATE, kind: "request" },
  { method: METHOD_MCP_SERVER_LIST, kind: "request" },
  { method: METHOD_MCP_SERVER_STATUS_LIST, kind: "request" },
  { method: METHOD_MCP_SERVER_CREATE, kind: "request" },
  { method: METHOD_MCP_SERVER_UPDATE, kind: "request" },
  { method: METHOD_MCP_SERVER_DELETE, kind: "request" },
  { method: METHOD_MCP_SERVER_ENABLED_SET, kind: "request" },
  { method: METHOD_MCP_SERVER_IMPORT_FROM_APP, kind: "request" },
  { method: METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE, kind: "request" },
  { method: METHOD_MCP_SERVER_OAUTH_LOGIN, kind: "request" },
  { method: METHOD_MCP_SERVER_START, kind: "request" },
  { method: METHOD_MCP_SERVER_STOP, kind: "request" },
  { method: METHOD_MCP_TOOL_LIST, kind: "request" },
  { method: METHOD_MCP_TOOL_LIST_FOR_CONTEXT, kind: "request" },
  { method: METHOD_MCP_TOOL_SEARCH, kind: "request" },
  { method: METHOD_MCP_TOOL_CALL, kind: "request" },
  { method: METHOD_MCP_TOOL_CALL_WITH_CALLER, kind: "request" },
  { method: METHOD_MCP_PROMPT_LIST, kind: "request" },
  { method: METHOD_MCP_PROMPT_GET, kind: "request" },
  { method: METHOD_MCP_RESOURCE_LIST, kind: "request" },
  { method: METHOD_MCP_RESOURCE_READ, kind: "request" },
  { method: METHOD_MCP_RESOURCE_SUBSCRIBE, kind: "request" },
  { method: METHOD_MCP_RESOURCE_UNSUBSCRIBE, kind: "request" },
  { method: METHOD_PROJECT_MEMORY_READ, kind: "request" },
  { method: METHOD_MEMORY_STORE_LIST, kind: "request" },
  { method: METHOD_MEMORY_STORE_READ, kind: "request" },
  { method: METHOD_MEMORY_STORE_SEARCH, kind: "request" },
  { method: METHOD_MEMORY_STORE_ADD_NOTE, kind: "request" },
  { method: METHOD_MEMORY_STORE_CONSOLIDATE, kind: "request" },
  { method: METHOD_MEMORY_STORE_REVIEW_LIST, kind: "request" },
  { method: METHOD_MEMORY_STORE_REVIEW_RESOLVE, kind: "request" },
  { method: METHOD_MEMORY_STORE_HEALTH, kind: "request" },
  { method: METHOD_MEMORY_STORE_RESET, kind: "request" },
  { method: METHOD_MEMORY_STORE_INDEX_REBUILD, kind: "request" },
  { method: METHOD_LOG_LIST, kind: "request" },
  { method: METHOD_LOG_PERSISTED_TAIL, kind: "request" },
  { method: METHOD_LOG_CLEAR, kind: "request" },
  { method: METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR, kind: "request" },
  { method: METHOD_DIAGNOSTICS_LOG_STORAGE_READ, kind: "request" },
  { method: METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT, kind: "request" },
  { method: METHOD_DIAGNOSTICS_SERVER_READ, kind: "request" },
  { method: METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ, kind: "request" },
  { method: METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE, kind: "request" },
  { method: METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE, kind: "request" },
  { method: METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE, kind: "request" },
  { method: METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE, kind: "request" },
  { method: METHOD_MEDIA_TASK_ARTIFACT_GET, kind: "request" },
  { method: METHOD_MEDIA_TASK_ARTIFACT_LIST, kind: "request" },
  { method: METHOD_MEDIA_TASK_ARTIFACT_CANCEL, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_GET, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_METADATA_CREATE, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_METADATA_GET, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_METADATA_UPDATE, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_METADATA_DELETE, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY, kind: "request" },
  { method: METHOD_GALLERY_MATERIAL_LIST_BY_MOOD, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_LIST, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_GET, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_COUNT, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_UPLOAD, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_UPDATE, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_DELETE, kind: "request" },
  { method: METHOD_PROJECT_MATERIAL_CONTENT, kind: "request" },
  { method: METHOD_VOICE_ASR_CREDENTIAL_LIST, kind: "request" },
  { method: METHOD_VOICE_ASR_CREDENTIAL_CREATE, kind: "request" },
  { method: METHOD_VOICE_ASR_CREDENTIAL_UPDATE, kind: "request" },
  { method: METHOD_VOICE_ASR_CREDENTIAL_DELETE, kind: "request" },
  { method: METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET, kind: "request" },
  { method: METHOD_VOICE_ASR_CREDENTIAL_TEST, kind: "request" },
  { method: METHOD_VOICE_INSTRUCTION_LIST, kind: "request" },
  { method: METHOD_VOICE_INSTRUCTION_SAVE, kind: "request" },
  { method: METHOD_VOICE_INSTRUCTION_DELETE, kind: "request" },
  { method: METHOD_VOICE_MODEL_DEFAULT_SET, kind: "request" },
  { method: METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE, kind: "request" },
  { method: METHOD_USAGE_STATS_READ, kind: "request" },
  { method: METHOD_USAGE_STATS_MODEL_RANKING_LIST, kind: "request" },
  { method: METHOD_USAGE_STATS_DAILY_TRENDS_LIST, kind: "request" },
  { method: METHOD_MODEL_LIST, kind: "request" },
  { method: METHOD_MODEL_PREFERENCES_LIST, kind: "request" },
  { method: METHOD_MODEL_SYNC_STATE_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_LIST, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CATALOG_LIST, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CREATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_UPDATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_DELETE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CONFIG_EXPORT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CONFIG_IMPORT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_TEST_CONNECTION, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_TEST_CHAT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_FETCH_MODELS, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_CREATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_UPDATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_DELETE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_NEXT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_UI_STATE_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_UI_STATE_WRITE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_ALIAS_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_ALIAS_LIST, kind: "request" },
  { method: METHOD_CONNECT_DEEP_LINK_RESOLVE, kind: "request" },
  { method: METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE, kind: "request" },
  { method: METHOD_CONNECT_RELAY_API_KEY_SAVE, kind: "request" },
  { method: METHOD_CONNECT_CALLBACK_SEND, kind: "request" },
  { method: METHOD_CONVERSATION_IMPORT_SOURCE_SCAN, kind: "request" },
  { method: METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW, kind: "request" },
  { method: METHOD_CONVERSATION_IMPORT_THREAD_COMMIT, kind: "request" },
  {
    method: METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
    kind: "request",
  },
  { method: METHOD_AGENT_SESSION_START, kind: "request" },
  { method: METHOD_AGENT_SESSION_READ, kind: "request" },
  { method: METHOD_AGENT_SESSION_TURN_START, kind: "request" },
  { method: METHOD_AGENT_SESSION_TOOL_INVENTORY_READ, kind: "request" },
  { method: METHOD_AGENT_SESSION_TURN_CANCEL, kind: "request" },
  { method: METHOD_AGENT_SESSION_ACTION_REPLAY, kind: "request" },
  { method: METHOD_AGENT_SESSION_ACTION_RESPOND, kind: "request" },
  { method: METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND, kind: "request" },
  { method: METHOD_AGENT_SESSION_EVENT, kind: "notification" },
] as const satisfies readonly AppServerMethodSpec[];

export const ERROR_CODES = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  runtimeError: -32000,
  notInitialized: -32002,
  alreadyInitialized: -32003,
  sessionNotFound: -32010,
  turnNotActive: -32011,
  sessionAlreadyExists: -32013,
  capabilityDenied: -32020,
} as const;

export type RequestId = number | string;
export type RpcResult = unknown;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRpcRequest = {
  id: RequestId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type JsonRpcResponse<T = RpcResult> = {
  id: RequestId;
  result: T;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcErrorResponse = {
  id: RequestId;
  error: JsonRpcError;
};

export type JsonRpcMessage<T = RpcResult> =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse<T>
  | JsonRpcErrorResponse;

export type ClientInfo = {
  name: string;
  title?: string;
  version?: string;
};

export type ClientCapabilities = {
  eventMethods?: string[];
  experimental?: boolean;
};

export type InitializeParams = {
  clientInfo: ClientInfo;
  capabilities?: ClientCapabilities;
};

export type InitializeResponse = {
  serverInfo: ServerInfo;
  platform: PlatformInfo;
  capabilities: ServerCapabilities;
};

export type ServerInfo = {
  name: string;
  version: string;
  protocolVersion: string;
};

export type PlatformInfo = {
  family: string;
  os: string;
};

export type ServerCapabilities = {
  agentSession: boolean;
  capabilityDiscovery: boolean;
  artifact: boolean;
  evidence: boolean;
  workspace: boolean;
};

export type CapabilityListParams = {
  appId?: string;
  workspaceId?: string;
  sessionId?: string;
  cursor?: string;
  limit?: number;
};

export type CapabilityDescriptor = {
  id: string;
  title: string;
  description?: string;
  methods: string[];
};

export type CapabilityListResponse = {
  capabilities: CapabilityDescriptor[];
  runtimeCapabilityManifest?: RuntimeCapabilityManifest;
  nextCursor?: string;
};

export type RuntimeCapabilityManifest = {
  schemaVersion: string;
  runtimeId: string;
  providerId?: string;
  sessionId?: string;
  generatedAt: string;
  capabilities: RuntimeCapabilityEntry[];
};

export type RuntimeCapabilityEntry = {
  id: string;
  status: string;
  scope: string;
  title: string;
  detail?: string;
  version?: string;
  metadata?: Record<string, unknown>;
};

export type ArtifactReadParams = {
  sessionId: string;
  turnId?: string;
  artifactRef?: string;
  includeContent?: boolean;
  cursor?: string;
  limit?: number;
};

export type ArtifactContentStatus =
  | "notRequested"
  | "available"
  | "unavailable";

export type ArtifactSummary = {
  artifactRef: string;
  eventId: string;
  sequence: number;
  turnId?: string;
  artifactId?: string;
  path?: string;
  title?: string;
  kind?: string;
  status?: string;
  content?: string;
  contentStatus: ArtifactContentStatus;
  metadata?: unknown;
};

export type ArtifactReadResponse = {
  artifacts: ArtifactSummary[];
  nextCursor?: string;
};

export type FileSystemListDirectoryParams = {
  path: string;
};

export type FileSystemReadFilePreviewParams = {
  path: string;
  maxSize?: number;
};

export type FileSystemCreateFileParams = {
  path: string;
};

export type FileSystemCreateDirectoryParams = {
  path: string;
};

export type FileSystemRenameFileParams = {
  oldPath: string;
  newPath: string;
};

export type FileSystemDeleteFileParams = {
  path: string;
  recursive?: boolean;
};

export type FileSystemMutationResponse = Record<string, never>;

export type FileSystemDirectoryListing = {
  path: string;
  parentPath: string | null;
  entries: FileSystemFileEntry[];
  error: string | null;
};

export type FileSystemFileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  fileType?: string;
  isHidden: boolean;
  modeStr?: string;
  mode?: number;
  mimeType?: string;
  isSymlink: boolean;
  iconDataUrl?: string;
};

export type FileSystemFilePreview = {
  path: string;
  content: string | null;
  isBinary: boolean;
  size: number;
  error: string | null;
};

export type ProjectGitStatusParams = {
  rootPath: string;
};

export type ProjectGitDiffParams = {
  rootPath: string;
  contextLines?: number;
  base?: ProjectGitDiffBase;
  commitSha?: string;
};

export type ProjectGitDiffBase =
  | "unstaged"
  | "staged"
  | "commit"
  | "branch"
  | "previousConversation";

export type ProjectGitCommitListParams = {
  rootPath: string;
  limit?: number;
};

export type ProjectGitBranchCheckoutParams = {
  rootPath: string;
  branch: string;
};

export type ProjectGitBranchCreateParams = {
  rootPath: string;
  branch: string;
};

export type ProjectGitWorktreeCreateParams = {
  rootPath: string;
  name?: string;
  baseBranch?: string;
};

export type ProjectGitStatusResponse = {
  rootPath: string;
  repositoryRoot?: string;
  hasGitRepository: boolean;
  currentBranch?: string;
  branches: string[];
  uncommittedFileCount: number;
};

export type ProjectGitBranchCheckoutResponse = ProjectGitStatusResponse;
export type ProjectGitBranchCreateResponse = ProjectGitStatusResponse;

export type ProjectGitDiffResponse = {
  rootPath: string;
  repositoryRoot?: string;
  hasGitRepository: boolean;
  currentRef?: string | null;
  comparisonBaseRef?: string | null;
  patch: string;
  uncommittedFileCount: number;
};

export type ProjectGitCommitListResponse = {
  rootPath: string;
  repositoryRoot?: string;
  hasGitRepository: boolean;
  commits: ProjectGitCommit[];
};

export type ProjectGitCommit = {
  sha: string;
  shortSha: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
};

export type ProjectGitWorktreeCreateResponse = {
  worktreePath: string;
  branch: string;
  status: ProjectGitStatusResponse;
};

export type EvidenceExportParams = {
  sessionId: string;
  turnId?: string;
  includeEvents?: boolean;
  includeArtifacts?: boolean;
  includeEvidencePack?: boolean;
};

export type EvidenceExportResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  events: AgentEvent[];
  artifacts: ArtifactSummary[];
  exportedAt: string;
  evidencePack?: EvidencePackSummary;
};

export type EvidencePackSummary = {
  packRelativeRoot: string;
  packAbsoluteRoot?: string;
  exportedAt: string;
  threadStatus: string;
  latestTurnStatus?: string;
  turnCount: number;
  itemCount: number;
  pendingRequestCount: number;
  queuedTurnCount: number;
  recentArtifactCount: number;
  knownGaps: string[];
  observabilitySummary?: unknown;
  completionAuditSummary?: unknown;
  artifacts: EvidencePackArtifact[];
};

export type EvidencePackArtifact = {
  kind: string;
  title: string;
  relativePath: string;
  absolutePath?: string;
  bytes: number;
};

export type AgentSessionHandoffBundleExportParams = {
  sessionId: string;
  locale?: string;
};

export type AgentSessionHandoffBundleExportResponse = {
  sessionId: string;
  threadId: string;
  workspaceId?: string;
  workspaceRoot: string;
  bundleRelativeRoot: string;
  bundleAbsoluteRoot: string;
  exportedAt: string;
  threadStatus: string;
  latestTurnStatus?: string;
  pendingRequestCount: number;
  queuedTurnCount: number;
  activeSubagentCount: number;
  todoTotal: number;
  todoPending: number;
  todoInProgress: number;
  todoCompleted: number;
  artifacts: AgentSessionHandoffArtifact[];
};

export type AgentSessionHandoffArtifact = {
  kind: string;
  title: string;
  relativePath: string;
  absolutePath: string;
  bytes: number;
};

export type AgentSessionReplayCaseExportParams = {
  sessionId: string;
  locale?: string;
};

export type AgentSessionReplayCaseExportResponse = {
  sessionId: string;
  threadId: string;
  workspaceId?: string;
  workspaceRoot: string;
  replayRelativeRoot: string;
  replayAbsoluteRoot: string;
  handoffBundleRelativeRoot: string;
  evidencePackRelativeRoot: string;
  exportedAt: string;
  threadStatus: string;
  latestTurnStatus?: string;
  pendingRequestCount: number;
  queuedTurnCount: number;
  linkedHandoffArtifactCount: number;
  linkedEvidenceArtifactCount: number;
  recentArtifactCount: number;
  artifacts: AgentSessionHandoffArtifact[];
};

export type AgentSessionAnalysisHandoffExportParams = {
  sessionId: string;
  locale?: string;
};

export type AgentSessionAnalysisHandoffExportResponse = {
  sessionId: string;
  threadId: string;
  workspaceId?: string;
  workspaceRoot: string;
  sanitizedWorkspaceRoot: string;
  analysisRelativeRoot: string;
  analysisAbsoluteRoot: string;
  handoffBundleRelativeRoot: string;
  evidencePackRelativeRoot: string;
  replayCaseRelativeRoot: string;
  exportedAt: string;
  threadStatus: string;
  latestTurnStatus?: string;
  pendingRequestCount: number;
  queuedTurnCount: number;
  title: string;
  copyPrompt: string;
  artifacts: AgentSessionHandoffArtifact[];
};

export type AgentSessionReviewDecisionTemplateExportParams = {
  sessionId: string;
  locale?: string;
};

export type AgentSessionReviewDecisionSaveParams = {
  sessionId: string;
  decisionStatus: string;
  decisionSummary?: string;
  chosenFixStrategy?: string;
  riskLevel: string;
  riskTags?: string[];
  humanReviewer?: string;
  followupActions?: string[];
  regressionRequirements?: string[];
  notes?: string;
  locale?: string;
};

export type AgentSessionReviewDecision = {
  decisionStatus: string;
  decisionSummary?: string;
  chosenFixStrategy?: string;
  riskLevel: string;
  riskTags: string[];
  humanReviewer?: string;
  followupActions: string[];
  regressionRequirements: string[];
  notes?: string;
};

export type AgentSessionReviewDecisionTemplateExportResponse = {
  sessionId: string;
  threadId: string;
  workspaceId?: string;
  workspaceRoot: string;
  reviewRelativeRoot: string;
  reviewAbsoluteRoot: string;
  analysisRelativeRoot: string;
  analysisAbsoluteRoot: string;
  handoffBundleRelativeRoot: string;
  evidencePackRelativeRoot: string;
  replayCaseRelativeRoot: string;
  exportedAt: string;
  threadStatus: string;
  latestTurnStatus?: string;
  pendingRequestCount: number;
  queuedTurnCount: number;
  title: string;
  defaultDecisionStatus: string;
  decision: AgentSessionReviewDecision;
  decisionStatusOptions: string[];
  riskLevelOptions: string[];
  reviewChecklist: string[];
  analysisArtifacts: AgentSessionHandoffArtifact[];
  artifacts: AgentSessionHandoffArtifact[];
};

export type BusinessObjectRef = {
  kind: string;
  id: string;
  title?: string;
  uri?: string;
  metadata?: unknown;
};

export type AgentSessionStartParams = {
  sessionId?: string;
  threadId?: string;
  appId: string;
  workspaceId?: string;
  businessObjectRef?: BusinessObjectRef;
  locale?: string;
};

export type AgentSessionReadParams = {
  sessionId: string;
  historyLimit?: number;
  historyOffset?: number;
  historyBeforeMessageId?: number;
};

export type AgentSessionListParams = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
  cwd?: string | string[];
  workspaceId?: string;
  limit?: number;
};

export type AgentInput = {
  text: string;
  attachments?: AgentAttachment[];
};

export type AgentAttachment = {
  kind: string;
  uri?: string;
  metadata?: unknown;
};

export type RuntimeOptions = {
  capabilityId?: string;
  stream?: boolean;
  eventName?: string;
  providerPreference?: string;
  modelPreference?: string;
  metadata?: unknown;
  queuedTurnId?: string;
  hostOptions?: unknown;
  expectedOutput?: unknown;
  structuredOutput?: StructuredOutputContract;
  outputSchema?: unknown;
};

export type StructuredOutputContract = {
  type?: string;
  schemaRef?: string;
  schema?: unknown;
  maxValidationRetries?: number;
  failureSubtype?: string;
  materializer?: unknown;
  metadata?: unknown;
};

export type AgentSessionTurnStartParams = {
  sessionId: string;
  turnId?: string;
  input: AgentInput;
  runtimeOptions?: RuntimeOptions;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
};

export type AgentSessionTurnCancelParams = {
  sessionId: string;
  turnId: string;
};

export type AgentSessionActionType =
  | "tool_confirmation"
  | "ask_user"
  | "elicitation";

export type AgentSessionActionScope = {
  sessionId?: string;
  threadId?: string;
  turnId?: string;
};

export type AgentSessionActionReplayParams = {
  sessionId: string;
  requestId: string;
};

export type AgentSessionReplayedActionRequired = {
  type: "action_required";
  requestId: string;
  actionType: AgentSessionActionType;
  toolName?: string;
  arguments?: unknown;
  prompt?: string;
  questions?: unknown;
  requestedSchema?: unknown;
  scope?: AgentSessionActionScope;
};

export type AgentSessionActionReplayResponse = {
  action?: AgentSessionReplayedActionRequired;
};

export type AgentSessionActionRespondParams = {
  sessionId: string;
  requestId: string;
  actionType: AgentSessionActionType;
  confirmed: boolean;
  response?: string;
  userData?: unknown;
  metadata?: unknown;
  eventName?: string;
  actionScope?: AgentSessionActionScope;
};

export type AgentSessionStatus =
  | "idle"
  | "running"
  | "waitingAction"
  | "completed"
  | "failed"
  | "canceled";

export type AgentSession = {
  sessionId: string;
  threadId: string;
  appId: string;
  workspaceId?: string;
  businessObjectRef?: BusinessObjectRef;
  status: AgentSessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgentTurnStatus =
  | "accepted"
  | "queued"
  | "running"
  | "waitingAction"
  | "completed"
  | "failed"
  | "canceled";

export type AgentTurn = {
  turnId: string;
  sessionId: string;
  threadId: string;
  status: AgentTurnStatus;
  startedAt?: string;
  completedAt?: string;
};

export type AgentEvent = {
  eventId: string;
  sequence: number;
  sessionId: string;
  threadId?: string;
  turnId?: string;
  type: string;
  timestamp: string;
  payload: unknown;
};

export type AgentSessionStartResponse = {
  session: AgentSession;
};

export type AgentSessionOverview = {
  sessionId: string;
  threadId?: string;
  title?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  workspaceId?: string;
  workingDir?: string;
  executionStrategy?: string;
  messagesCount: number;
};

export type AgentSessionListResponse = {
  sessions: AgentSessionOverview[];
};

export type AgentSessionUpdateParams = {
  sessionId: string;
  title?: string;
  archived?: boolean;
  providerSelector?: string;
  providerName?: string;
  modelName?: string;
  executionStrategy?: string;
  recentAccessMode?: string;
  recentPreferences?: unknown;
  recentTeamSelection?: unknown;
  productWorkspaceSelectedObjectRef?: unknown;
};

export type AgentSessionUpdateResponse = {
  session: AgentSessionOverview;
};

export type AgentSessionArchiveManyParams = {
  sessionIds?: string[];
};

export type AgentSessionArchiveManyResponse = {
  sessions: AgentSessionOverview[];
};

export type AgentSessionDeleteParams = {
  sessionId: string;
};

export type AgentSessionDeleteResponse = {
  sessionId: string;
  deleted: boolean;
};

export type ManagedObjectiveStatus =
  | "active"
  | "verifying"
  | "needs_input"
  | "blocked"
  | "budget_limited"
  | "paused"
  | "completed"
  | "failed";

export type ManagedObjective = {
  objectiveId: string;
  workspaceId?: string;
  ownerKind: string;
  ownerId: string;
  objectiveText: string;
  successCriteria: string[];
  status: ManagedObjectiveStatus;
  budgetPolicy?: unknown;
  riskPolicy?: unknown;
  approvalPolicy?: unknown;
  continuationPolicy?: unknown;
  lastAuditSummary?: string;
  lastEvidencePackRef?: string;
  lastArtifactRefs: string[];
  blockerReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentSessionObjectiveReadParams = {
  sessionId: string;
};

export type AgentSessionObjectiveReadResponse = {
  objective?: ManagedObjective;
};

export type AgentSessionObjectiveSetParams = {
  sessionId: string;
  workspaceId?: string;
  objectiveText: string;
  successCriteria?: string[];
  budgetPolicy?: unknown;
  riskPolicy?: unknown;
  approvalPolicy?: unknown;
  continuationPolicy?: unknown;
};

export type AgentSessionObjectiveSetResponse = {
  objective: ManagedObjective;
};

export type AgentSessionObjectiveStatusUpdateParams = {
  sessionId: string;
  status: ManagedObjectiveStatus;
  blockerReason?: string;
};

export type AgentSessionObjectiveStatusUpdateResponse = {
  objective?: ManagedObjective;
};

export type AgentSessionObjectiveClearParams = {
  sessionId: string;
};

export type AgentSessionObjectiveClearResponse = {
  cleared: boolean;
};

export type AgentSessionObjectiveContinueParams = {
  sessionId: string;
  ownerKind?: string;
  ownerId?: string;
};

export type AgentSessionObjectiveContinueResponse = {
  submitted: boolean;
  queuedTurnId: string;
  objective: ManagedObjective;
  turn: AgentTurn;
};

export type AgentSessionObjectiveAuditParams = {
  sessionId: string;
  ownerKind?: string;
  ownerId?: string;
};

export type AgentSessionObjectiveAuditResponse = {
  objective: ManagedObjective;
};

export type AgentSessionCompactParams = {
  sessionId: string;
  eventName?: string;
};

export type AgentSessionCompactResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  compacted: boolean;
};

export type AgentSessionThreadResumeParams = {
  sessionId: string;
  resumeContract?: RuntimeResumeContract;
};

export type RuntimeResumeContract = {
  schemaVersion: string;
  runtimeId: string;
  sessionId: string;
  turnId: string;
  resumeMode: string;
  openActionIds: string[];
  decisions: RuntimeResumeActionDecision[];
  expiresAt?: string;
  createdAt: string;
};

export type RuntimeResumeActionDecision = {
  actionId: string;
  decision: string;
  response?: unknown;
  metadata?: Record<string, unknown>;
};

export type AgentSessionThreadResumeResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  resumed: boolean;
};

export type AgentSessionQueuedTurnRemoveParams = {
  sessionId: string;
  queuedTurnId: string;
};

export type AgentSessionQueuedTurnRemoveResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  queuedTurnId: string;
  removed: boolean;
};

export type AgentSessionQueuedTurnPromoteParams = {
  sessionId: string;
  queuedTurnId: string;
};

export type AgentSessionQueuedTurnPromoteResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  queuedTurnId: string;
  promoted: boolean;
};

export type AgentSessionFileCheckpointListParams = {
  sessionId: string;
};

export type AgentSessionFileCheckpointGetParams = {
  sessionId: string;
  checkpointId: string;
};

export type AgentSessionFileCheckpointDiffParams = {
  sessionId: string;
  checkpointId: string;
};

export type AgentSessionFileCheckpointRestoreParams = {
  sessionId: string;
  checkpointId: string;
  confirmRestore: boolean;
  createBackup?: boolean;
};

export type AgentSessionFileCheckpointSummary = {
  checkpointId: string;
  turnId: string;
  path: string;
  source: string;
  updatedAt: string;
  versionNo?: number;
  versionId?: string;
  requestId?: string;
  title?: string;
  kind?: string;
  status?: string;
  previewText?: string;
  snapshotPath?: string;
  validationIssueCount: number;
};

export type AgentSessionFileCheckpointThreadSummary = {
  count: number;
  latestCheckpoint?: AgentSessionFileCheckpointSummary;
};

export type AgentSessionFileCheckpointListResponse = {
  sessionId: string;
  threadId: string;
  checkpointCount: number;
  checkpoints: AgentSessionFileCheckpointSummary[];
};

export type AgentSessionFileCheckpointDetail = {
  sessionId: string;
  threadId: string;
  checkpoint: AgentSessionFileCheckpointSummary;
  livePath: string;
  snapshotPath: string;
  checkpointDocument?: unknown;
  liveDocument?: unknown;
  versionHistory: unknown[];
  validationIssues: string[];
  metadata?: unknown;
  content?: string;
};

export type AgentSessionFileCheckpointDiffResponse = {
  sessionId: string;
  threadId: string;
  checkpoint: AgentSessionFileCheckpointSummary;
  currentVersionId?: string;
  previousVersionId?: string;
  diff?: unknown;
};

export type AgentSessionFileCheckpointRestoreResponse = {
  sessionId: string;
  threadId: string;
  checkpoint: AgentSessionFileCheckpointSummary;
  livePath: string;
  snapshotPath: string;
  backupPath?: string | null;
  restoredAt: string;
};

export type SessionFileIdParams = {
  sessionId: string;
  fileName: string;
};

export type SessionFileGetOrCreateParams = {
  sessionId: string;
};

export type SessionFileUpdateMetaParams = {
  sessionId: string;
  title?: string;
  theme?: string;
  creationMode?: string;
};

export type SessionFileSaveParams = {
  sessionId: string;
  fileName: string;
  content: string;
  metadata?: Record<string, unknown> | unknown;
};

export type SessionFileMeta = {
  sessionId: string;
  title?: string;
  theme?: string;
  creationMode?: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
  totalSize: number;
};

export type SessionFileEntry = {
  name: string;
  fileType: string;
  metadata?: Record<string, unknown> | unknown;
  size: number;
  createdAt: number;
  updatedAt: number;
};

export type SessionFileMetaResponse = {
  meta: SessionFileMeta;
};

export type SessionFileEntryResponse = {
  file: SessionFileEntry;
};

export type SessionFileReadResponse = {
  content: string;
};

export type SessionFileResolvePathResponse = {
  path: string;
};

export type SessionFileListResponse = {
  files: SessionFileEntry[];
};

export type SessionFileMutationResponse = Record<string, never>;

export type WorkspaceReadParams = {
  id: string;
};

export type WorkspaceUpdateParams = {
  id: string;
  name?: string;
  rootPath?: string;
  settings?: unknown;
  icon?: string;
  color?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  tags?: string[];
  defaultPersonaId?: string;
};

export type WorkspaceDeleteParams = {
  id: string;
  deleteDirectory?: boolean;
};

export type WorkspacePathReadParams = {
  rootPath: string;
};

export type WorkspaceEnsureProjectParams = {
  name: string;
  rootPath: string;
  workspaceType?: string;
};

export type WorkspaceProjectPathResolveParams = {
  name: string;
  parentRootPath?: string;
};

export type WorkspaceEnsureParams = {
  id: string;
};

export type WorkspaceListResponse = {
  workspaces: unknown[];
};

export type WorkspaceReadResponse = {
  workspace?: unknown;
};

export type WorkspaceUpdateResponse = {
  workspace: unknown;
};

export type WorkspaceDeleteResponse = {
  deleted: boolean;
};

export type WorkspaceEnsureProjectResponse = {
  workspace: unknown;
  created: boolean;
  rootCreated: boolean;
};

export type WorkspaceProjectsRootReadResponse = {
  rootPath: string;
};

export type WorkspaceProjectPathResolveResponse = {
  rootPath: string;
};

export type WorkspaceEnsureReadyResponse = {
  result: unknown;
};

export type SkillReadParams = {
  skillName: string;
};

export type SkillListResponse = {
  skills: unknown[];
};

export type SkillReadResponse = {
  skill: unknown;
};

export type SkillManagementListParams = {
  app: string;
  refreshRemote?: boolean;
  scope?: "all" | "local" | "user";
};

export type SkillManagementInstallParams = {
  app: string;
  directory: string;
};

export type SkillManagementUninstallParams = {
  app: string;
  directory: string;
};

export type SkillRepositoryEntry = {
  owner: string;
  name: string;
  branch: string;
  enabled: boolean;
};

export type SkillRepositorySaveParams = {
  repo: SkillRepositoryEntry;
};

export type SkillRepositoryDeleteParams = {
  owner: string;
  name: string;
};

export type SkillLocalInspectParams = {
  app: string;
  directory: string;
};

export type SkillScaffoldCreateParams = {
  app: string;
  request: unknown;
};

export type SkillLocalImportParams = {
  app: string;
  sourcePath: string;
};

export type SkillRemoteInspectParams = {
  owner: string;
  name: string;
  branch: string;
  directory: string;
};

export type SkillManagementWriteResponse = {
  success: boolean;
};

export type SkillRepositoryListResponse = {
  repos: SkillRepositoryEntry[];
};

export type SkillInstalledDirectoriesListResponse = {
  directories: string[];
};

export type SkillLocalInspectResponse = {
  inspection: unknown;
};

export type SkillScaffoldCreateResponse = {
  inspection: unknown;
};

export type SkillLocalImportResponse = {
  directory: string;
};

export type SkillRemoteInspectResponse = {
  inspection: unknown;
};

export type SkillLocalDetailInspectParams = {
  app: string;
  directory: string;
};

export type SkillLocalRenameParams = {
  app: string;
  directory: string;
  newDirectory: string;
};

export type SkillPackageLocalReplaceParams = {
  app: string;
  directory: string;
  sourcePath: string;
};

export type SkillPackageLocalInspectParams = {
  app: string;
  sourcePath: string;
};

export type SkillPackageLocalInstallParams = {
  app: string;
  sourcePath: string;
  skillName?: string;
};

export type SkillPackageExportParams = {
  app: string;
  directory: string;
  targetPath: string;
};

export type SkillMarketplaceBundleFile = {
  path: string;
  content: string;
  encoding?: string;
  sha256?: string;
};

export type SkillMarketplaceInstallParams = {
  app: string;
  manifestVersion: string;
  name: string;
  aliases?: string[];
  version: string;
  contentHash?: string;
  fileCount?: number;
  files: SkillMarketplaceBundleFile[];
};

export type SkillDownloadInstallParams = {
  app: string;
  skillName: string;
  downloadUrl: string;
};

export type SkillPackageLocalInspectResponse = {
  directory: string;
  inspection: unknown;
  files: unknown[];
};

export type SkillLocalDetailInspectResponse = SkillPackageLocalInspectResponse;

export type SkillLocalRenameResponse = {
  directory: string;
};

export type SkillPackageLocalInstallResponse = {
  directory: string;
  inspection: unknown;
};

export type SkillPackageLocalReplaceResponse = SkillPackageLocalInstallResponse;

export type SkillMarketplaceInstallResponse = SkillPackageLocalInstallResponse;

export type SkillDownloadInstallResponse = SkillPackageLocalInstallResponse;

export type SkillPackageExportResponse = {
  directory: string;
  outputPath: string;
  fileCount: number;
  bytesWritten: number;
};

export type WorkspaceSkillBindingsListParams = {
  workspaceRoot: string;
  caller?: string;
  workbench?: boolean;
  browserAssist?: boolean;
};

export type WorkspaceSkillBindingsListResponse = {
  bindings: unknown;
};

export type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
};

export type LogListResponse = {
  entries: LogEntry[];
};

export type LogPersistedTailParams = {
  lines?: number;
};

export type LogPersistedTailResponse = {
  entries: LogEntry[];
};

export type LogClearResponse = {
  cleared: boolean;
};

export type LogArtifactEntry = {
  fileName: string;
  path: string;
  sizeBytes: number;
  modifiedAt?: string;
  compressed: boolean;
};

export type LogStorageDiagnosticsResponse = {
  logDirectory?: string;
  currentLogPath?: string;
  currentLogExists: boolean;
  currentLogSizeBytes?: number;
  inMemoryLogCount: number;
  relatedLogFiles: LogArtifactEntry[];
  rawResponseFiles: LogArtifactEntry[];
};

export type SupportBundleExportResponse = {
  bundlePath: string;
  outputDirectory: string;
  generatedAt: string;
  platform: string;
  includedSections: string[];
  omittedSections: string[];
};

export type DiagnosticsMetricConfig = {
  enabled: boolean;
  ttlSecs: number;
  maxEntries?: number;
  maxBodyBytes?: number;
  cacheableStatusCodes: number[];
  waitTimeoutMs?: number;
  headerName?: string;
};

export type DiagnosticsTelemetrySummary = {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutRequests: number;
  successRate: number;
  avgLatencyMs: number;
  minLatencyMs?: number | null;
  maxLatencyMs?: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
};

export type DiagnosticsCapabilityRoutingMetricsSnapshot = {
  filterEvalTotal: number;
  filterExcludedTotal: number;
  filterExcludedToolsTotal: number;
  filterExcludedVisionTotal: number;
  filterExcludedContextTotal: number;
  providerFallbackTotal: number;
  modelFallbackTotal: number;
  allCandidatesExcludedTotal: number;
};

export type DiagnosticsResponseCacheDiagnostics = {
  config: DiagnosticsMetricConfig;
  stats: unknown;
  hitRatePercent: number;
};

export type DiagnosticsRequestDedupDiagnostics = {
  config: DiagnosticsMetricConfig;
  stats: unknown;
  replayRatePercent: number;
};

export type DiagnosticsIdempotencyDiagnostics = {
  config: DiagnosticsMetricConfig;
  stats: unknown;
  replayRatePercent: number;
};

export type ServerDiagnosticsResponse = {
  generatedAt: string;
  running: boolean;
  host: string;
  port: number;
  telemetrySummary: DiagnosticsTelemetrySummary;
  capabilityRouting: DiagnosticsCapabilityRoutingMetricsSnapshot;
  responseCache: DiagnosticsResponseCacheDiagnostics;
  requestDedup: DiagnosticsRequestDedupDiagnostics;
  idempotency: DiagnosticsIdempotencyDiagnostics;
};

export type WindowsStartupCheck = {
  key: string;
  status: "ok" | "warning" | "error" | string;
  message: string;
  detail?: string;
};

export type WindowsStartupDiagnosticsResponse = {
  platform: string;
  appDataDir?: string;
  legacyLimeDir?: string;
  dbPath?: string;
  webview2Version?: string;
  currentExe?: string;
  currentDir?: string;
  resourceDir?: string;
  homeDir?: string;
  shellEnv?: string;
  comspecEnv?: string;
  resolvedTerminalShell?: string;
  installationKindGuess?: string;
  checks: WindowsStartupCheck[];
  hasBlockingIssues: boolean;
  hasWarnings: boolean;
  summaryMessage?: string;
};

export type GatewayChannelStatusParams = {
  channel: string;
};

export type GatewayChannelStartParams = {
  channel: string;
  accountId?: string;
  pollTimeoutSecs?: number;
};

export type GatewayChannelStopParams = {
  channel: string;
  accountId?: string;
};

export type GatewayChannelStatusResponse = {
  channel: string;
  status: unknown;
};

export type ChannelProbeParams = {
  accountId?: string;
};

export type ChannelProbeResponse = {
  accountId?: string;
  ok: boolean;
  message: string;
  [key: string]: unknown;
};

export type WechatLoginStartParams = {
  baseUrl?: string;
  botType?: string;
  sessionKey?: string;
};

export type WechatLoginStartResponse = {
  sessionKey: string;
  qrcodeUrl: string;
  message: string;
};

export type WechatLoginWaitParams = {
  sessionKey: string;
  baseUrl?: string;
  botType?: string;
  timeoutMs?: number;
  accountName?: string;
};

export type WechatLoginWaitResponse = {
  connected: boolean;
  message: string;
  botToken?: string;
  accountId?: string;
  userId?: string;
  baseUrl?: string;
};

export type WechatConfiguredAccount = {
  account_id: string;
  enabled: boolean;
  name?: string;
  base_url?: string;
  cdn_base_url?: string;
  has_token: boolean;
  scanner_user_id?: string;
};

export type WechatChannelAccountListResponse = {
  accounts: WechatConfiguredAccount[];
};

export type WechatChannelAccountRemoveParams = {
  accountId: string;
  purgeData?: boolean;
};

export type WechatChannelAccountRemoveResponse = Record<string, never>;

export type WechatRuntimeModelSetParams = {
  providerId: string;
  modelId: string;
};

export type WechatRuntimeModelSetResponse = {
  runtimeModel: string;
};

export type GatewayTunnelCreateParams = {
  tunnelName?: string;
  dnsName?: string;
  persist?: boolean;
};

export type GatewayTunnelCreateResult = {
  ok: boolean;
  tunnelName: string;
  tunnelId?: string;
  credentialsFile?: string;
  dnsName?: string;
  publicBaseUrl?: string;
  message: string;
};

export type GatewayTunnelStatusResponse = {
  running: boolean;
  provider: string;
  mode: string;
  binary: string;
  localUrl: string;
  publicBaseUrl?: string;
  pid?: number;
  startedAt?: string;
  lastError?: string;
  lastExit?: string;
  commandPreview?: string;
  connectorActive?: boolean;
  connectorMessage?: string;
};

export type GatewayTunnelProbeResponse = {
  ok: boolean;
  provider: string;
  mode: string;
  binary: string;
  version?: string;
  configReady: boolean;
  message: string;
};

export type GatewayTunnelCloudflaredDetectResponse = {
  installed: boolean;
  binary: string;
  version?: string;
  platform: string;
  packageManager?: string;
  installSupported: boolean;
  installCommand?: string;
  requiresPrivilege: boolean;
  message: string;
};

export type GatewayTunnelCloudflaredInstallParams = {
  confirm?: boolean;
};

export type GatewayTunnelCloudflaredInstallResponse = {
  ok: boolean;
  attempted: boolean;
  platform: string;
  packageManager?: string;
  command?: string;
  exitCode?: number;
  installed: boolean;
  version?: string;
  stdout: string;
  stderr: string;
  message: string;
};

export type GatewayTunnelCreateResponse = {
  result: GatewayTunnelCreateResult;
  status: GatewayTunnelStatusResponse;
};

export type GatewayTunnelSyncWebhookUrlParams = {
  channel: string;
  accountId?: string;
  webhookPath?: string;
  persist?: boolean;
};

export type GatewayTunnelSyncWebhookUrlResponse = {
  channel: string;
  accountId?: string;
  webhookPath: string;
  publicBaseUrl: string;
  webhookUrl: string;
  persisted: boolean;
};

export type ImageStoryboardSlotInput = {
  prompt: string;
  slotId?: string;
  label?: string;
  shotType?: string;
};

export type MediaTaskArtifactImageCreateParams = {
  projectRootPath: string;
  prompt: string;
  title?: string;
  titleGenerationResult?: unknown;
  personaContext?: unknown;
  presentation?: unknown;
  tasteContext?: unknown;
  mode?: string;
  rawText?: string;
  layoutHint?: string;
  size?: string;
  aspectRatio?: string;
  count?: number;
  usage?: string;
  style?: string;
  providerId?: string;
  model?: string;
  executorMode?: string;
  outerModel?: string;
  sessionId?: string;
  threadId?: string;
  turnId?: string;
  projectId?: string;
  contentId?: string;
  entrySource?: string;
  modalityContractKey?: string;
  modality?: string;
  requiredCapabilities?: string[];
  routingSlot?: string;
  runtimeContract?: unknown;
  requestedTarget?: string;
  slotId?: string;
  anchorHint?: string;
  anchorSectionTitle?: string;
  anchorText?: string;
  targetOutputId?: string;
  targetOutputRefId?: string;
  referenceImages?: string[];
  storyboardSlots?: ImageStoryboardSlotInput[];
};

export type MediaTaskArtifactAudioCreateParams = {
  projectRootPath: string;
  sourceText: string;
  title?: string;
  rawText?: string;
  voice?: string;
  voiceStyle?: string;
  targetLanguage?: string;
  mimeType?: string;
  audioPath?: string;
  durationMs?: number;
  providerId?: string;
  model?: string;
  sessionId?: string;
  threadId?: string;
  turnId?: string;
  projectId?: string;
  contentId?: string;
  entrySource?: string;
  modalityContractKey?: string;
  modality?: string;
  requiredCapabilities?: string[];
  routingSlot?: string;
  runtimeContract?: unknown;
  requestedTarget?: string;
  outputPath?: string;
};

export type MediaTaskArtifactVideoCreateParams = {
  projectRootPath: string;
  prompt: string;
  title?: string;
  rawText?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  imageUrl?: string;
  endImageUrl?: string;
  seed?: number;
  generateAudio?: boolean;
  cameraFixed?: boolean;
  providerId?: string;
  model?: string;
  sessionId?: string;
  threadId?: string;
  turnId?: string;
  projectId?: string;
  contentId?: string;
  entrySource?: string;
  modalityContractKey?: string;
  modality?: string;
  requiredCapabilities?: string[];
  routingSlot?: string;
  runtimeContract?: unknown;
  requestedTarget?: string;
  outputPath?: string;
};

export type MediaTaskArtifactAudioCompleteParams = {
  projectRootPath: string;
  taskRef: string;
  audioPath: string;
  mimeType?: string;
  durationMs?: number;
  providerId?: string;
  model?: string;
};

export type MediaTaskArtifactLookupParams = {
  projectRootPath: string;
  taskRef: string;
};

export type MediaTaskArtifactListParams = {
  projectRootPath: string;
  status?: string;
  taskFamily?: string;
  taskType?: string;
  modalityContractKey?: string;
  routingOutcome?: string;
  limit?: number;
};

export type MediaTaskArtifactListFilters = {
  status?: string;
  task_family?: string;
  task_type?: string;
  modality_contract_key?: string;
  routing_outcome?: string;
  limit?: number;
};

export type MediaTaskArtifactResponse = {
  success: boolean;
  task_id: string;
  task_type: string;
  task_family: string;
  status: string;
  normalized_status: string;
  current_attempt_id?: string;
  path: string;
  absolute_path: string;
  artifact_path: string;
  absolute_artifact_path: string;
  reused_existing: boolean;
  idempotency_key?: string;
  record: unknown;
};

export type MediaTaskArtifactListResponse = {
  success: boolean;
  workspace_root: string;
  artifact_root: string;
  filters: MediaTaskArtifactListFilters;
  total: number;
  modality_runtime_contracts: unknown;
  tasks: MediaTaskArtifactResponse[];
};

export type GalleryMaterialMetadata = {
  materialId: string;
  imageCategory?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  colors: string[];
  iconStyle?: string;
  iconCategory?: string;
  colorSchemeJson?: string;
  mood?: string;
  layoutCategory?: string;
  elementCount?: number;
  preview?: string;
  fabricJson?: string;
  createdAt: number;
  updatedAt: number;
};

export type GalleryMaterial = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  content?: string;
  tags: string[];
  description?: string;
  createdAt: number;
  metadata?: GalleryMaterialMetadata;
};

export type GalleryMaterialMetadataCreateParams = {
  materialId: string;
  imageCategory?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  colors?: string[];
  iconStyle?: string;
  iconCategory?: string;
  colorSchemeJson?: string;
  mood?: string;
  layoutCategory?: string;
  elementCount?: number;
  preview?: string;
  fabricJson?: string;
};

export type GalleryMaterialLookupParams = {
  materialId: string;
};

export type GalleryMaterialMetadataUpdateParams = {
  materialId: string;
  metadata: GalleryMaterialMetadataCreateParams;
};

export type GalleryMaterialFilterParams = {
  projectId: string;
  category?: string | null;
  mood?: string | null;
};

export type GalleryMaterialResponse = {
  material?: GalleryMaterial | null;
};

export type GalleryMaterialMetadataResponse = {
  metadata?: GalleryMaterialMetadata | null;
};

export type GalleryMaterialListResponse = {
  materials: GalleryMaterial[];
};

export type GalleryMaterialDeleteResponse = Record<string, never>;

export type ProjectMaterial = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  content?: string;
  tags: string[];
  description?: string;
  createdAt: number;
};

export type ProjectMaterialFilter = {
  type?: string;
  tags?: string[];
  searchQuery?: string;
};

export type ProjectMaterialListParams = {
  projectId: string;
  filter?: ProjectMaterialFilter | null;
};

export type ProjectMaterialLookupParams = {
  id: string;
};

export type ProjectMaterialUploadParams = {
  projectId: string;
  name: string;
  type: string;
  filePath?: string;
  content?: string;
  tags?: string[];
  description?: string;
};

export type ProjectMaterialImportFromUrlParams = {
  projectId: string;
  name: string;
  type: string;
  url: string;
  tags?: string[];
  description?: string;
};

export type ProjectMaterialUpdate = {
  name?: string;
  tags?: string[];
  description?: string;
};

export type ProjectMaterialUpdateParams = {
  id: string;
  update: ProjectMaterialUpdate;
};

export type ProjectMaterialListResponse = {
  materials: ProjectMaterial[];
};

export type ProjectMaterialResponse = {
  material?: ProjectMaterial | null;
};

export type ProjectMaterialCountResponse = {
  count: number;
};

export type ProjectMaterialContentResponse = {
  content: string;
};

export type ProjectMaterialDeleteResponse = Record<string, never>;

export type VoiceAsrProviderType =
  | "whisper_local"
  | "sense_voice_local"
  | "xunfei"
  | "baidu"
  | "openai";

export type VoiceAsrWhisperModelSize = "tiny" | "base" | "small" | "medium";

export type VoiceAsrWhisperLocalConfig = {
  model: VoiceAsrWhisperModelSize;
  model_path?: string;
};

export type VoiceAsrSenseVoiceLocalConfig = {
  model_id: string;
  model_dir?: string;
  use_itn: boolean;
  num_threads: number;
  vad_model_id?: string;
};

export type VoiceAsrXunfeiConfig = {
  app_id: string;
  api_key: string;
  api_secret: string;
};

export type VoiceAsrBaiduConfig = {
  api_key: string;
  secret_key: string;
};

export type VoiceAsrOpenAiConfig = {
  api_key: string;
  base_url?: string;
  proxy_url?: string;
};

export type VoiceAsrCredential = {
  id: string;
  provider: VoiceAsrProviderType;
  name?: string;
  is_default: boolean;
  disabled: boolean;
  language: string;
  whisper_config?: VoiceAsrWhisperLocalConfig;
  sensevoice_config?: VoiceAsrSenseVoiceLocalConfig;
  xunfei_config?: VoiceAsrXunfeiConfig;
  baidu_config?: VoiceAsrBaiduConfig;
  openai_config?: VoiceAsrOpenAiConfig;
};

export type VoiceAsrCredentialCreateParams = Omit<VoiceAsrCredential, "id">;

export type VoiceAsrCredentialUpdateParams = {
  credential: VoiceAsrCredential;
};

export type VoiceAsrCredentialIdParams = {
  id: string;
};

export type VoiceAsrCredentialListResponse = {
  credentials: VoiceAsrCredential[];
};

export type VoiceAsrCredentialWriteResponse = {
  credential: VoiceAsrCredential;
};

export type VoiceAsrCredentialMutationResponse = Record<string, never>;

export type VoiceAsrCredentialTestResponse = {
  success: boolean;
  message: string;
};

export type VoiceInstruction = {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  shortcut?: string;
  is_preset: boolean;
  icon?: string;
};

export type VoiceInstructionSaveParams = {
  instruction: VoiceInstruction;
};

export type VoiceInstructionIdParams = {
  id: string;
};

export type VoiceInstructionListResponse = {
  instructions: VoiceInstruction[];
};

export type VoiceInstructionMutationResponse = Record<string, never>;

export type VoiceModelDefaultSetParams = {
  model_id: string;
  install_dir: string;
};

export type VoiceModelDefaultSetResponse = {
  credential: VoiceAsrCredential;
};

export type VoiceModelTestTranscribeFileParams = {
  model_id: string;
  file_path: string;
};

export type VoiceModelTestTranscribeFileResponse = {
  text: string;
  duration_secs: number;
  sample_rate: number;
  language?: string;
};

export type WorkspaceRegisteredSkillsListParams = {
  workspaceRoot: string;
};

export type WorkspaceRegisteredSkillsListResponse = {
  skills: unknown[];
};

export type AgentAppLocalPackageInspectParams = {
  appDir: string;
};

export type AgentAppLocalPackageInspectResponse = {
  sourceKind: "local_folder" | string;
  sourceUri: string;
  appDir: string;
  appMarkdown: string;
  manifest: unknown;
  manifestHash: string;
  packageHash: string;
  inspectedAt: string;
};

export type AgentAppCloudReleaseDescriptor = {
  sourceUri: string;
  appId: string;
  version: string;
  releaseId?: string;
  tenantId?: string;
  tenantEnablementRef?: string;
  channel?: string;
  packageUrl: string;
  packageHash: string;
  manifestHash: string;
  signatureRef?: string;
  loadedAt: string;
};

export type AgentAppFetchCloudPackageParams = {
  descriptor: AgentAppCloudReleaseDescriptor;
};

export type AgentAppPackageIdentity = {
  sourceKind: string;
  sourceUri: string;
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  loadedAt: string;
  releaseId?: string;
  tenantId?: string;
  tenantEnablementRef?: string;
  channel?: string;
  signatureRef?: string;
};

export type AgentAppPackageCacheEntry = {
  appId: string;
  identity: AgentAppPackageIdentity;
  manifestSnapshot: unknown;
  packageHash: string;
  manifestHash: string;
  cachePath: string;
  cachedAt: string;
};

export type AgentAppInstalledSaveParams = {
  state: unknown;
};

export type AgentAppInstalledDisabledSetParams = {
  appId: string;
  disabled: boolean;
  updatedAt?: string;
};

export type AgentAppInstalledListResponse = {
  states: unknown[];
  issues: unknown[];
};

export type AgentAppUninstallRehearsalParams = {
  appId: string;
  mode: "keep-data" | "delete-data" | string;
};

export type AgentAppUninstallRehearsalTarget = {
  kind: string;
  value: string;
  safeToDelete: boolean;
  action: "delete" | "retain" | "blocked" | string;
  reason: string;
};

export type AgentAppUninstallRehearsalResponse = {
  appId: string;
  packageHash?: string;
  mode: "keep-data" | "delete-data" | string;
  generatedAt: string;
  deletedTargetCount: number;
  retainedTargetCount: number;
  targets: AgentAppUninstallRehearsalTarget[];
  warnings: string[];
};

export type AgentAppUninstallParams = {
  appId: string;
  mode: "keep-data" | "delete-data" | string;
  confirmationPhrase?: string;
};

export type AgentAppDeleteDataTargetEvidence = {
  kind: string;
  value: string;
  action: string;
  reason: string;
  status: string;
  blockerCodes: string[];
  error?: string | null;
};

export type AgentAppDeleteDataExecutionEvidence = {
  status: string;
  generatedAt: string;
  dataRoot: string;
  removedTargets: AgentAppDeleteDataTargetEvidence[];
  missingTargets: AgentAppDeleteDataTargetEvidence[];
  retainedTargets: AgentAppDeleteDataTargetEvidence[];
  blockedTargets: AgentAppDeleteDataTargetEvidence[];
  failedTarget?: AgentAppDeleteDataTargetEvidence | null;
  blockerCodes: string[];
  postDeleteResidualAudit?: {
    status: string;
    checkedAt: string;
    checkedTargetCount: number;
    remainingTargetCount: number;
    remainingTargets: AgentAppDeleteDataTargetEvidence[];
    failedTarget?: AgentAppDeleteDataTargetEvidence | null;
  };
};

export type AgentAppUninstallResponse = {
  status: string;
  rehearsal: AgentAppUninstallRehearsalResponse;
  list: AgentAppInstalledListResponse;
  removedTargetCount: number;
  missingTargetCount: number;
  blockerCodes: string[];
  deleteEvidence?: AgentAppDeleteDataExecutionEvidence | null;
};

export type AgentAppShellPrepareParams = {
  descriptor: unknown;
};

export type AgentAppShellPackageMount = {
  kind: string;
  path: string;
  readOnly: boolean;
  packageHash: string;
  manifestHash: string;
};

export type AgentAppShellPrepareResponse = {
  appId?: string;
  status: string;
  installMode?: string;
  shellKind?: string;
  descriptorVersion?: number;
  devShell: boolean;
  blockerCodes: string[];
  message?: string;
  packageMount?: AgentAppShellPackageMount;
  entryKey?: string;
  windowTitle?: string;
  preparedAt: string;
};

export type AgentAppUiRuntimeStartParams = {
  appId: string;
  entryKey?: string;
};

export type AgentAppUiRuntimeStatusParams = {
  appId: string;
};

export type AgentAppUiRuntimeStopParams = {
  appId: string;
};

export type AgentAppTaskRuntimeContract = {
  enabled: boolean;
  packageRootPath?: string | null;
  workerEntrypoint?: string | null;
  taskKinds?: string[];
  outputArtifactKind?: string | null;
  contractPath?: string | null;
  sampleRequestPath?: string | null;
  blockers?: string[];
  followUps?: string[];
  directProviderAccess: boolean;
  directFilesystemAccess: boolean;
};

export type AgentAppUiRuntimeStatusResponse = {
  appId: string;
  status: "starting" | "running" | "stopped" | "failed" | string;
  baseUrl?: string;
  entryUrl?: string;
  port?: number;
  pid?: number;
  message?: string;
  entryKey?: string;
  route?: string;
  taskRuntime?: AgentAppTaskRuntimeContract | null;
};

export type KnowledgeListPacksParams = {
  workingDir: string;
  includeArchived?: boolean;
};

export type KnowledgeListPacksResponse = {
  workingDir: string;
  rootPath: string;
  packs: unknown[];
};

export type KnowledgeReadPackParams = {
  workingDir: string;
  name: string;
};

export type KnowledgeReadPackResponse = {
  pack: unknown;
};

export type KnowledgeImportSourceParams = {
  workingDir: string;
  packName: string;
  description?: string;
  packType?: string;
  language?: string;
  sourceFileName?: string;
  sourceText?: string;
};

export type KnowledgeImportSourceResponse = {
  pack: unknown;
  source: unknown;
};

export type KnowledgeCompilePackParams = {
  workingDir: string;
  name: string;
  builderRuntime?: unknown;
};

export type KnowledgeCompilePackResponse = {
  pack: unknown;
  selectedSourceCount: number;
  compiledView: unknown;
  run: unknown;
  warnings: string[];
};

export type KnowledgeSetDefaultPackParams = {
  workingDir: string;
  name: string;
};

export type KnowledgeSetDefaultPackResponse = {
  defaultPackName: string;
  defaultMarkerPath: string;
};

export type KnowledgeUpdatePackStatusParams = {
  workingDir: string;
  name: string;
  status: string;
};

export type KnowledgeUpdatePackStatusResponse = {
  pack: unknown;
  previousStatus: string;
  clearedDefault: boolean;
};

export type KnowledgeResolveContextPackParams = {
  name: string;
  activation?: string;
};

export type KnowledgeResolveContextParams = {
  workingDir: string;
  name: string;
  packs?: KnowledgeResolveContextPackParams[];
  task?: string;
  maxChars?: number;
  activation?: string;
  writeRun?: boolean;
  runReason?: string;
};

export type KnowledgeContextResolutionResponse = {
  packName: string;
  status: string;
  grounding?: string;
  selectedViews: unknown[];
  selectedFiles: string[];
  sourceAnchors: string[];
  warnings: unknown[];
  missing: string[];
  tokenEstimate: number;
  fencedContext: string;
  runId?: string;
  runPath?: string;
};

export type KnowledgeValidateContextRunParams = {
  workingDir: string;
  name: string;
  runPath: string;
};

export type KnowledgeValidateContextRunResponse = {
  valid: boolean;
  runId?: string;
  status?: string;
  errors: string[];
  warnings: string[];
};

export type AutomationJobListResponse = {
  jobs: unknown[];
};

export type AutomationSchedulerConfigReadResponse = {
  config: unknown;
};

export type AutomationSchedulerConfigUpdateParams = {
  config: unknown;
};

export type AutomationSchedulerConfigUpdateResponse = {
  config: unknown;
};

export type AutomationSchedulerStatusResponse = {
  status: unknown;
};

export type AutomationJobIdParams = {
  id: string;
};

export type AutomationJobReadResponse = {
  job?: unknown;
};

export type AutomationJobCreateParams = {
  request: unknown;
};

export type AutomationJobWriteResponse = {
  job: unknown;
};

export type AutomationJobUpdateParams = {
  id: string;
  request: unknown;
};

export type AutomationJobDeleteResponse = {
  deleted: boolean;
};

export type AutomationJobRunNowResponse = {
  result: unknown;
};

export type AutomationJobHealthParams = {
  query?: unknown;
};

export type AutomationJobHealthResponse = {
  health: unknown;
};

export type AutomationJobRunHistoryParams = {
  id: string;
  limit?: number;
};

export type AutomationJobRunHistoryResponse = {
  runs: unknown[];
};

export type AutomationScheduleParams = {
  schedule: unknown;
};

export type AutomationSchedulePreviewResponse = {
  nextRunAt?: string;
};

export type AutomationScheduleValidateResponse = {
  valid: boolean;
  error?: string;
};

export type McpServerListResponse = {
  servers: unknown[];
};

export type McpServerStatusListResponse = {
  servers: unknown[];
};

export type McpServerCreateParams = {
  server: unknown;
};

export type McpServerUpdateParams = {
  server: unknown;
};

export type McpServerDeleteParams = {
  id: string;
};

export type McpServerEnabledSetParams = {
  id: string;
  appType: string;
  enabled: boolean;
};

export type McpServerImportFromAppParams = {
  appType: string;
};

export type McpServerImportFromAppResponse = {
  importedCount: number;
  servers: unknown[];
};

export type McpServerOauthLoginParams = {
  name: string;
  scopes?: string[];
  timeoutSecs?: number;
};

export type McpServerOauthLoginResponse = {
  authorizationUrl: string;
  state: string;
};

export type McpServerStartParams = {
  name: string;
};

export type McpServerStopParams = {
  name: string;
};

export type McpServerLifecycleResponse = Record<string, never>;

export type McpToolListResponse = {
  tools: unknown[];
};

export type McpToolListForContextParams = {
  caller?: string;
  includeDeferred?: boolean;
};

export type McpToolSearchParams = {
  query: string;
  caller?: string;
  limit?: number;
};

export type McpToolCallParams = {
  toolName: string;
  arguments: unknown;
};

export type McpToolCallWithCallerParams = McpToolCallParams & {
  caller?: string;
};

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "resource"; uri: string; text?: string; blob?: string };

export type McpToolCallResponse = {
  content: McpContent[];
  structuredContent?: unknown;
  is_error: boolean;
};

export type McpPromptListResponse = {
  prompts: unknown[];
};

export type McpPromptGetParams = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type McpPromptMessage = {
  role: string;
  content: McpContent;
};

export type McpPromptGetResponse = {
  description?: string;
  messages: McpPromptMessage[];
};

export type McpResourceListResponse = {
  resources: unknown[];
  resourceTemplates?: unknown[];
};

export type McpResourceReadParams = {
  uri: string;
};

export type McpResourceSubscribeParams = {
  uri: string;
};

export type McpResourceUnsubscribeParams = {
  uri: string;
};

export type McpResourceSubscriptionResponse = Record<string, never>;

export type McpResourceReadResponse = {
  uri: string;
  mime_type?: string;
  text?: string;
  blob?: string;
};

export type ProjectMemoryReadParams = {
  projectId: string;
};

export type ProjectMemoryReadResponse = {
  memory: unknown;
};

export type UsageStatsRangeParams = {
  timeRange: string;
};

export type UsageStatsSummary = {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  totalTimeMinutes: number;
  monthlyConversations: number;
  monthlyMessages: number;
  monthlyTokens: number;
  todayConversations: number;
  todayMessages: number;
  todayTokens: number;
};

export type UsageStatsReadResponse = {
  stats: UsageStatsSummary;
};

export type UsageStatsModelUsage = {
  model: string;
  conversations: number;
  tokens: number;
  percentage: number;
};

export type UsageStatsModelRankingListResponse = {
  ranking: UsageStatsModelUsage[];
};

export type UsageStatsDailyUsage = {
  date: string;
  conversations: number;
  tokens: number;
};

export type UsageStatsDailyTrendsListResponse = {
  trends: UsageStatsDailyUsage[];
};

export type AgentSessionReadResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  detail?: unknown;
};

export type AgentSessionTurnStartResponse = {
  turn: AgentTurn;
};

export type AgentSessionTurnCancelResponse = Record<string, never>;
export type AgentSessionActionRespondResponse = Record<string, never>;

export type AgentSessionEventParams = {
  event: AgentEvent;
};

export type AgentSessionEventNotification = JsonRpcNotification & {
  method: typeof METHOD_AGENT_SESSION_EVENT;
  params: AgentSessionEventParams;
};

export type WorkspaceRightSurfacePendingChangedParams =
  GeneratedWorkspaceRightSurfacePendingChangedParams;

export type WorkspaceRightSurfacePendingChangedNotification =
  JsonRpcNotification & {
    method: typeof METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED;
    params: WorkspaceRightSurfacePendingChangedParams;
  };

export type ConnectDeepLinkResolveParams = {
  url: string;
};

export type ConnectPayload = {
  relay: string;
  key: string;
  name?: string;
  refCode?: string;
};

export type ConnectDeepLinkResolveResponse = {
  payload: ConnectPayload;
  relayInfo?: unknown;
  isVerified: boolean;
};

export type ConnectOpenDeepLinkResolveParams = {
  url: string;
};

export type OpenDeepLinkPayload = {
  kind: string;
  slug: string;
  source?: string;
  version?: string;
  action?: string;
};

export type ConnectOpenDeepLinkResolveResponse = {
  payload: OpenDeepLinkPayload;
};

export type ConnectRelayApiKeySaveParams = {
  relayId: string;
  apiKey: string;
  name?: string;
};

export type ConnectRelayApiKeySaveResponse = {
  providerId: string;
  keyId: string;
  providerName: string;
  isNewProvider: boolean;
};

export type ConnectCallbackStatus = "success" | "cancelled" | "error";

export type ConnectCallbackSendParams = {
  relayId: string;
  apiKey: string;
  status: ConnectCallbackStatus;
  refCode?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type ConnectCallbackSendResponse = {
  delivered: boolean;
};

export type ConversationImportSourceClient = "codex" | "claude_code";

export type ConversationImportSourceStatus =
  | "ready"
  | "missing"
  | "unsupported"
  | "error";

export type ConversationImportThreadStatus =
  | "not_imported"
  | "imported"
  | "conflict";

export type ConversationImportSourceScanParams = {
  sourceClient?: ConversationImportSourceClient;
  sourceRoot?: string;
  projectPath?: string;
  query?: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
};

export type ConversationImportThreadPreviewParams = {
  sourceClient?: ConversationImportSourceClient;
  sourceRoot?: string;
  sourceThreadId?: string;
  sourcePath?: string;
  limit?: number;
};

export type ConversationImportThreadCommitParams = {
  sourceClient?: ConversationImportSourceClient;
  sourceRoot?: string;
  sourceThreadId?: string;
  sourcePath?: string;
  workspaceId?: string;
  appId?: string;
  confirmed: boolean;
  replaceExisting?: boolean;
};

export type ConversationImportSourceSummary = {
  sourceClient: ConversationImportSourceClient;
  status: ConversationImportSourceStatus;
  sourceRoot?: string;
  readable: boolean;
  threadCount: number;
  sourceHomeExists: boolean;
  stateDbReadable: boolean;
  rolloutFileCount: number;
  indexedAt?: string;
  statePath?: string;
  message?: string;
};

export type ImportedThreadSummary = {
  sourceClient: ConversationImportSourceClient;
  sourceThreadId: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  cwd?: string;
  source?: string;
  modelProvider?: string;
  archived: boolean;
  sourcePath?: string;
  importStatus: ConversationImportThreadStatus;
  metadata?: unknown;
};

export type ConversationImportSourceScanResponse = {
  source: ConversationImportSourceSummary;
  threads: ImportedThreadSummary[];
  nextCursor?: string;
};

export type ConversationImportSourceProvenance = {
  sourceClient: ConversationImportSourceClient;
  sourceThreadId?: string;
  sourcePath?: string;
  sourceEventType?: string;
  sourceEventSeq?: number;
  sourcePayloadType?: string;
  sourceCallId?: string;
  sourceRole?: string;
  sourceChannel?: string;
};

export type ConversationImportFidelitySummary = {
  messages: number;
  reasoning: number;
  tools: number;
  commands: number;
  patches: number;
  approvals: number;
  mcp: number;
  webSearch: number;
  attachments: number;
  unsupported: number;
  provenanceOnly: number;
  budgetDropped: number;
};

export type ConversationImportPreviewMessage = {
  role: string;
  text: string;
  attachments: AgentAttachment[];
  truncated: boolean;
  omittedBytes: number;
  timestamp?: string;
  sourceType?: string;
  provenance?: ConversationImportSourceProvenance;
};

export type ConversationImportPreviewEvent = {
  kind: string;
  timestamp?: string;
  label?: string;
  provenance?: ConversationImportSourceProvenance;
};

export type ConversationImportPreviewDryRun = {
  willCreateSession: boolean;
  willAppendToExistingSession: boolean;
  willImportMessages: number;
  willImportTurns: number;
  willImportTimelineItems: number;
  willImportAttachments: number;
  unsupportedItems: number;
};

export type ConversationImportPreviewSummary = {
  lineCount: number;
  messageCount: number;
  rolloutEventItems: number;
  unsupportedCount: number;
  dryRun: ConversationImportPreviewDryRun;
  fidelity: ConversationImportFidelitySummary;
  truncated: boolean;
  warnings: string[];
};

export type ConversationImportThreadPreviewResponse = {
  source: ConversationImportSourceSummary;
  thread: ImportedThreadSummary;
  summary: ConversationImportPreviewSummary;
  messages: ConversationImportPreviewMessage[];
  events: ConversationImportPreviewEvent[];
};

export type ConversationImportThreadCommitResponse = {
  session: AgentSession;
  thread: ImportedThreadSummary;
  summary: ConversationImportPreviewSummary;
  importedMessages: number;
  importedTurns: number;
  canContinue: boolean;
  warnings: string[];
};

export type ConversationImportThreadRuntimeEventsReadParams = {
  sessionId: string;
  offset?: number;
  limit?: number;
  turnIndex?: number;
  eventType?: string;
};

export type ConversationImportRuntimeEventDetail = {
  sourceEventIndex: number;
  turnIndex: number;
  eventIndex: number;
  eventType: string;
  payload: unknown;
};

export type ConversationImportThreadRuntimeEventsReadResponse = {
  sessionId: string;
  offset: number;
  limit: number;
  totalEvents: number;
  nextOffset?: number;
  sourceRuntimeEvents: number;
  materializedRuntimeEvents: number;
  sidecarRuntimeEvents: number;
  projection?: unknown;
  events: ConversationImportRuntimeEventDetail[];
};

export type ProtocolSchemaGroup = "jsonrpc" | "v0";

export type AppServerProtocolSchemaManifest = {
  protocolVersion: string;
  methods: AppServerMethodSpec[];
  jsonRpc: {
    version: string;
    sendsJsonRpcVersionField: boolean;
    envelopes: string[];
  };
  schemas: Record<ProtocolSchemaGroup, string[]>;
};

export type ProtocolSchemaFile = {
  group: ProtocolSchemaGroup;
  typeName: string;
  path: string;
};

export function request(
  id: RequestId,
  method: string,
  params?: unknown,
): JsonRpcRequest {
  return compactParams({ id, method, params });
}

export function notification(
  method: string,
  params?: unknown,
): JsonRpcNotification {
  return compactParams({ method, params });
}

export function isAppServerRequestMethod(method: string): boolean {
  return APP_SERVER_METHODS.some(
    (spec) => spec.kind === "request" && spec.method === method,
  );
}

export function isAppServerNotificationMethod(method: string): boolean {
  return APP_SERVER_METHODS.some(
    (spec) => spec.kind === "notification" && spec.method === method,
  );
}

export function encodeMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function decodeMessage(line: string): JsonRpcMessage {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new Error("empty JSON-RPC line");
  }
  return JSON.parse(trimmed) as JsonRpcMessage;
}

export function decodeMessages(lines: string[]): JsonRpcMessage[] {
  return lines.map(decodeMessage);
}

export function isJsonRpcNotification(
  message: JsonRpcMessage,
): message is JsonRpcNotification {
  return "method" in message && !("id" in message);
}

export function isAgentSessionEventNotification(
  message: JsonRpcMessage,
): message is AgentSessionEventNotification {
  return Boolean(agentSessionEventNotification(message));
}

export function agentSessionEventNotification(
  message: JsonRpcMessage,
): AgentSessionEventNotification | undefined {
  if (
    !isJsonRpcNotification(message) ||
    message.method !== METHOD_AGENT_SESSION_EVENT
  ) {
    return undefined;
  }
  const params = message.params as Partial<AgentSessionEventParams> | undefined;
  if (!params || !params.event) {
    return undefined;
  }
  return message as AgentSessionEventNotification;
}

export function isWorkspaceRightSurfacePendingChangedNotification(
  message: JsonRpcMessage,
): message is WorkspaceRightSurfacePendingChangedNotification {
  return Boolean(workspaceRightSurfacePendingChangedNotification(message));
}

export function workspaceRightSurfacePendingChangedNotification(
  message: JsonRpcMessage,
): WorkspaceRightSurfacePendingChangedNotification | undefined {
  if (
    !isJsonRpcNotification(message) ||
    message.method !== METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED
  ) {
    return undefined;
  }
  const params = message.params as
    | Partial<WorkspaceRightSurfacePendingChangedParams>
    | undefined;
  if (!params || typeof params.changeType !== "string") {
    return undefined;
  }
  return message as WorkspaceRightSurfacePendingChangedNotification;
}

export function isJsonRpcResponse<T = RpcResult>(
  message: JsonRpcMessage,
): message is JsonRpcResponse<T> {
  return "id" in message && "result" in message;
}

export function isJsonRpcErrorResponse(
  message: JsonRpcMessage,
): message is JsonRpcErrorResponse {
  return "id" in message && "error" in message;
}

function compactParams<T extends { params?: unknown }>(value: T): T {
  if (value.params === undefined) {
    const { params: _params, ...rest } = value;
    return rest as T;
  }
  return value;
}
