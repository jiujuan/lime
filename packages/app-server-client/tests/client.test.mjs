import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PassThrough, Writable } from "node:stream";
import { test } from "vitest";
const require = createRequire(import.meta.url);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

execFileSync(
  process.execPath,
  [
    require.resolve("typescript/bin/tsc"),
    "--project",
    join(packageRoot, "tsconfig.json"),
  ],
  { cwd: packageRoot, stdio: "inherit" },
);

const {
  APP_SERVER_METHODS,
  AppServerAgentEventRouter,
  AppServerAgentRuntimeClient,
  AppServerSidecarLifecycle,
  AppServerSidecar,
  DEFAULT_LISTEN_URL,
  DEFAULT_PROTOCOL_SCHEMA_MANIFEST_NAME,
  DEFAULT_RELEASE_MANIFEST_NAME,
  ERROR_CODES,
  AppServerConnection,
  AppServerClient,
  AppServerRequestError,
  DEFAULT_STANDALONE_BACKEND_MODE,
  createAgentRuntimeClient,
  METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
  METHOD_AGENT_APP_INSTALLED_LIST,
  METHOD_AGENT_APP_INSTALLED_SAVE,
  METHOD_AGENT_APP_INSTALLED_UNINSTALL,
  METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
  METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
  METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
  METHOD_AGENT_APP_SHELL_PREPARE,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  METHOD_AGENT_SESSION_ACTION_REPLAY,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_ARCHIVE_MANY,
  METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
  METHOD_AGENT_SESSION_COMPACT,
  METHOD_AGENT_SESSION_DELETE,
  METHOD_AGENT_SESSION_EVENT,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
  METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
  METHOD_AGENT_SESSION_LIST,
  METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
  METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
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
  METHOD_AGENT_SESSION_TOOL_INVENTORY_READ,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AGENT_SESSION_UPDATE,
  METHOD_ARTIFACT_READ,
  METHOD_AUTOMATION_JOB_CREATE,
  METHOD_AUTOMATION_JOB_DELETE,
  METHOD_AUTOMATION_JOB_HEALTH,
  METHOD_AUTOMATION_JOB_LIST,
  METHOD_AUTOMATION_JOB_READ,
  METHOD_AUTOMATION_JOB_RUN_HISTORY,
  METHOD_AUTOMATION_JOB_RUN_NOW,
  METHOD_AUTOMATION_JOB_UPDATE,
  METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
  METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
  METHOD_AUTOMATION_SCHEDULER_STATUS,
  METHOD_AUTOMATION_SCHEDULE_PREVIEW,
  METHOD_AUTOMATION_SCHEDULE_VALIDATE,
  METHOD_CAPABILITY_LIST,
  METHOD_CONNECT_CALLBACK_SEND,
  METHOD_CONNECT_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_RELAY_API_KEY_SAVE,
  METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
  METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
  METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW,
  METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
  METHOD_EVIDENCE_EXPORT,
  METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT,
  METHOD_EXECUTION_PROCESS_INTERRUPT,
  METHOD_EXECUTION_PROCESS_START,
  METHOD_EXECUTION_PROCESS_STATUS,
  METHOD_EXECUTION_PROCESS_TERMINATE,
  METHOD_EXECUTION_PROCESS_WRITE_STDIN,
  METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
  METHOD_FILE_SYSTEM_CREATE_FILE,
  METHOD_FILE_SYSTEM_DELETE_FILE,
  METHOD_FILE_SYSTEM_LIST_DIRECTORY,
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
  METHOD_FILE_SYSTEM_RENAME_FILE,
  METHOD_PROJECT_GIT_BRANCH_CHECKOUT,
  METHOD_PROJECT_GIT_BRANCH_CREATE,
  METHOD_PROJECT_GIT_COMMITS_LIST,
  METHOD_PROJECT_GIT_DIFF,
  METHOD_PROJECT_GIT_STATUS,
  METHOD_PROJECT_GIT_WORKTREE_CREATE,
  METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
  METHOD_PROJECT_SHELL_SESSION_KILL,
  METHOD_PROJECT_SHELL_SESSION_RESIZE,
  METHOD_PROJECT_SHELL_SESSION_START,
  METHOD_PROJECT_SHELL_SESSION_WRITE,
  METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
  METHOD_DIAGNOSTICS_SERVER_READ,
  METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
  METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
  METHOD_DISCORD_CHANNEL_PROBE,
  METHOD_FEISHU_CHANNEL_PROBE,
  METHOD_GATEWAY_CHANNEL_START,
  METHOD_GATEWAY_CHANNEL_STOP,
  METHOD_GATEWAY_CHANNEL_STATUS,
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
  METHOD_GATEWAY_TUNNEL_CREATE,
  METHOD_GATEWAY_TUNNEL_PROBE,
  METHOD_GATEWAY_TUNNEL_RESTART,
  METHOD_GATEWAY_TUNNEL_START,
  METHOD_GATEWAY_TUNNEL_STATUS,
  METHOD_GATEWAY_TUNNEL_STOP,
  METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
  METHOD_GALLERY_MATERIAL_GET,
  METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY,
  METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
  METHOD_GALLERY_MATERIAL_LIST_BY_MOOD,
  METHOD_GALLERY_MATERIAL_METADATA_CREATE,
  METHOD_GALLERY_MATERIAL_METADATA_DELETE,
  METHOD_GALLERY_MATERIAL_METADATA_GET,
  METHOD_GALLERY_MATERIAL_METADATA_UPDATE,
  METHOD_PROJECT_MATERIAL_CONTENT,
  METHOD_PROJECT_MATERIAL_COUNT,
  METHOD_PROJECT_MATERIAL_DELETE,
  METHOD_PROJECT_MATERIAL_GET,
  METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL,
  METHOD_PROJECT_MATERIAL_LIST,
  METHOD_PROJECT_MATERIAL_UPDATE,
  METHOD_PROJECT_MATERIAL_UPLOAD,
  METHOD_TELEGRAM_CHANNEL_PROBE,
  METHOD_INITIALIZED,
  METHOD_INITIALIZE,
  METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
  METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
  METHOD_KNOWLEDGE_PACK_COMPILE,
  METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
  METHOD_KNOWLEDGE_PACK_LIST,
  METHOD_KNOWLEDGE_PACK_READ,
  METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
  METHOD_KNOWLEDGE_SOURCE_IMPORT,
  METHOD_MODEL_LIST,
  METHOD_MODEL_PREFERENCES_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_PROVIDER_CATALOG_LIST,
  METHOD_MODEL_PROVIDER_CONFIG_EXPORT,
  METHOD_MODEL_PROVIDER_CONFIG_IMPORT,
  METHOD_MODEL_PROVIDER_CREATE,
  METHOD_MODEL_PROVIDER_DELETE,
  METHOD_MODEL_PROVIDER_FETCH_MODELS,
  METHOD_MODEL_PROVIDER_KEY_CREATE,
  METHOD_MODEL_PROVIDER_KEY_DELETE,
  METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD,
  METHOD_MODEL_PROVIDER_KEY_NEXT,
  METHOD_MODEL_PROVIDER_KEY_UPDATE,
  METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD,
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_MODEL_PROVIDER_READ,
  METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE,
  METHOD_MODEL_PROVIDER_TEST_CHAT,
  METHOD_MODEL_PROVIDER_TEST_CONNECTION,
  METHOD_MODEL_PROVIDER_UI_STATE_READ,
  METHOD_MODEL_PROVIDER_UI_STATE_WRITE,
  METHOD_MODEL_PROVIDER_UPDATE,
  METHOD_MODEL_SYNC_STATE_READ,
  METHOD_MCP_PROMPT_GET,
  METHOD_MCP_PROMPT_LIST,
  METHOD_MCP_RESOURCE_LIST,
  METHOD_MCP_RESOURCE_READ,
  METHOD_MCP_SERVER_CREATE,
  METHOD_MCP_SERVER_DELETE,
  METHOD_MCP_SERVER_ENABLED_SET,
  METHOD_MCP_SERVER_IMPORT_FROM_APP,
  METHOD_MCP_SERVER_LIST,
  METHOD_MCP_SERVER_OAUTH_LOGIN,
  METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
  METHOD_MCP_SERVER_START,
  METHOD_MCP_SERVER_STATUS_LIST,
  METHOD_MCP_SERVER_STOP,
  METHOD_MCP_SERVER_UPDATE,
  METHOD_MCP_TOOL_CALL,
  METHOD_MCP_TOOL_CALL_WITH_CALLER,
  METHOD_MCP_TOOL_LIST,
  METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
  METHOD_MCP_TOOL_SEARCH,
  METHOD_MEMORY_STORE_ADD_NOTE,
  METHOD_MEMORY_STORE_CONSOLIDATE,
  METHOD_MEMORY_STORE_HEALTH,
  METHOD_MEMORY_STORE_INDEX_REBUILD,
  METHOD_MEMORY_STORE_LIST,
  METHOD_MEMORY_STORE_READ,
  METHOD_MEMORY_STORE_REVIEW_LIST,
  METHOD_MEMORY_STORE_REVIEW_RESOLVE,
  METHOD_MEMORY_STORE_RESET,
  METHOD_MEMORY_STORE_SEARCH,
  METHOD_PROJECT_MEMORY_READ,
  METHOD_SESSION_FILE_DELETE,
  METHOD_SESSION_FILE_GET_OR_CREATE,
  METHOD_SESSION_FILE_LIST,
  METHOD_SESSION_FILE_READ,
  METHOD_SESSION_FILE_RESOLVE_PATH,
  METHOD_SESSION_FILE_SAVE,
  METHOD_SESSION_FILE_UPDATE_META,
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
  METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE,
  PROTOCOL_VERSION,
  METHOD_SKILL_CACHE_REFRESH,
  METHOD_SKILL_INSTALLED_DIRECTORIES_LIST,
  METHOD_SKILL_LOCAL_IMPORT,
  METHOD_SKILL_LOCAL_INSPECT,
  METHOD_SKILL_LOCAL_DETAIL_INSPECT,
  METHOD_SKILL_LOCAL_RENAME,
  METHOD_SKILL_LOCAL_SCAFFOLD_CREATE,
  METHOD_SKILL_MANAGEMENT_INSTALL,
  METHOD_SKILL_MANAGEMENT_LIST,
  METHOD_SKILL_MANAGEMENT_UNINSTALL,
  METHOD_SKILL_MARKETPLACE_INSTALL,
  METHOD_SKILL_LIST,
  METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL,
  METHOD_SKILL_PACKAGE_EXPORT,
  METHOD_SKILL_PACKAGE_LOCAL_INSPECT,
  METHOD_SKILL_PACKAGE_LOCAL_INSTALL,
  METHOD_SKILL_PACKAGE_LOCAL_REPLACE,
  METHOD_SKILL_REMOTE_INSPECT,
  METHOD_SKILL_REPOSITORY_DELETE,
  METHOD_SKILL_REPOSITORY_LIST,
  METHOD_SKILL_REPOSITORY_SAVE,
  METHOD_SKILL_READ,
  METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
  METHOD_USAGE_STATS_MODEL_RANKING_LIST,
  METHOD_USAGE_STATS_READ,
  METHOD_VOICE_ASR_CREDENTIAL_CREATE,
  METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET,
  METHOD_VOICE_ASR_CREDENTIAL_DELETE,
  METHOD_VOICE_ASR_CREDENTIAL_LIST,
  METHOD_VOICE_ASR_CREDENTIAL_TEST,
  METHOD_VOICE_ASR_CREDENTIAL_UPDATE,
  METHOD_VOICE_INSTRUCTION_DELETE,
  METHOD_VOICE_INSTRUCTION_LIST,
  METHOD_VOICE_INSTRUCTION_SAVE,
  METHOD_VOICE_MODEL_DEFAULT_SET,
  METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE,
  METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
  METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
  METHOD_WECHAT_CHANNEL_LOGIN_START,
  METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
  METHOD_WECHAT_CHANNEL_PROBE,
  METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
  METHOD_WORKSPACE_BY_PATH_READ,
  METHOD_WORKSPACE_DEFAULT_ENSURE,
  METHOD_WORKSPACE_DEFAULT_READ,
  METHOD_WORKSPACE_DELETE,
  METHOD_WORKSPACE_ENSURE,
  METHOD_WORKSPACE_ENSURE_READY,
  METHOD_WORKSPACE_LIST,
  METHOD_WORKSPACE_PROJECTS_ROOT_READ,
  METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
  METHOD_WORKSPACE_READ,
  METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
  METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
  METHOD_WORKSPACE_UPDATE,
  assertCompatibleManifest,
  assertCompatibleProtocolSchemaManifest,
  assertSha256,
  assertSidecarFileSha256,
  agentSessionEventNotification,
  connectAppServerSidecar,
  decodeMessage,
  defaultReleaseManifestPath,
  defaultProtocolSchemaManifestPath,
  encodeMessage,
  findReleaseArtifact,
  defaultPackagedSidecarRelativePath,
  platformKey,
  isAppServerNotificationMethod,
  isAppServerRequestMethod,
  isAgentSessionEventNotification,
  readReleaseManifest,
  readProtocolSchemaManifest,
  listProtocolSchemaFiles,
  resolveSidecarBinaryPath,
  resolveSidecarFromReleaseManifest,
  resolveSidecarFromReleaseManifestFile,
  protocolSchemaFilePath,
  sha256Hex,
  sha256File,
  sidecarArgs,
  sidecarBinaryName,
  sidecarFromReleaseArtifact,
  shouldRestartSidecar,
  spawnAppServerSidecar,
  startPackagedAppServerSidecar,
  stdioSidecar,
  sidecarRestartDelayMs,
} = await import(
  /* @vite-ignore */ pathToFileURL(join(packageRoot, "dist/index.js")).href
);

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const SIDECAR_TEST_TIMEOUT_MS = 5_000;

test("builds initialize and caller supplied session start requests", () => {
  const client = new AppServerClient();

  const initialize = client.initialize({
    clientInfo: {
      name: "content_studio",
      version: "0.1.0",
    },
  });
  const start = client.startSession({
    sessionId: "sess_external",
    threadId: "thread_external",
    appId: "content-studio",
    workspaceId: "default",
  });

  assert.equal(initialize.id, 1);
  assert.equal(initialize.method, METHOD_INITIALIZE);
  assert.equal(start.id, 2);
  assert.equal(start.method, METHOD_AGENT_SESSION_START);
  assert.equal(start.params.sessionId, "sess_external");
  assert.equal(ERROR_CODES.sessionAlreadyExists, -32013);
  assert.equal(ERROR_CODES.capabilityDenied, -32020);
});

test("builds capability list requests with empty params", () => {
  const client = new AppServerClient();

  const capabilities = client.listCapabilities();
  const scopedCapabilities = client.listCapabilities({
    appId: "content-studio",
    workspaceId: "default",
    sessionId: "sess_external",
    cursor: "2",
    limit: 25,
  });

  assert.equal(capabilities.id, 1);
  assert.equal(capabilities.method, METHOD_CAPABILITY_LIST);
  assert.deepEqual(capabilities.params, {});
  assert.equal(scopedCapabilities.id, 2);
  assert.equal(scopedCapabilities.method, METHOD_CAPABILITY_LIST);
  assert.deepEqual(scopedCapabilities.params, {
    appId: "content-studio",
    workspaceId: "default",
    sessionId: "sess_external",
    cursor: "2",
    limit: 25,
  });
});

test("builds workspace and skill read requests with current methods", () => {
  const client = new AppServerClient();

  const sessions = client.listSessions({
    includeArchived: true,
    workspaceId: "workspace-main",
    limit: 20,
  });
  const updateSession = client.updateSession({
    sessionId: "session-main",
    title: "重命名后的会话",
    archived: true,
    providerSelector: "custom-provider",
    providerName: "OpenAI Compatible",
    modelName: "gpt-5.4",
    executionStrategy: "react",
    recentAccessMode: "full-access",
    recentPreferences: { task: true, subagent: false },
    recentTeamSelection: { disabled: true },
  });
  const archiveManySessions = client.archiveManySessions({
    sessionIds: ["session-main", "session-second"],
  });
  const deleteSession = client.deleteSession({
    sessionId: "session-main",
  });
  const readObjective = client.readAgentSessionObjective({
    sessionId: "session-main",
  });
  const setObjective = client.setAgentSessionObjective({
    sessionId: "session-main",
    workspaceId: "workspace-main",
    objectiveText: "完成生产命令 current 迁移",
    successCriteria: ["CRUD 走 App Server current"],
    budgetPolicy: { maxTurns: 8 },
    riskPolicy: { level: "medium" },
    approvalPolicy: { required: false },
    continuationPolicy: { mode: "manual" },
  });
  const updateObjectiveStatus = client.updateAgentSessionObjectiveStatus({
    sessionId: "session-main",
    status: "blocked",
    blockerReason: "等待共享写集释放",
  });
  const clearObjective = client.clearAgentSessionObjective({
    sessionId: "session-main",
  });
  const workspaces = client.listWorkspaces();
  const workspace = client.readWorkspace({ id: "workspace-main" });
  const workspaceByPath = client.readWorkspaceByPath({
    rootPath: "/workspace/project",
  });
  const ensuredWorkspace = client.ensureWorkspace({
    name: "content-studio",
    rootPath: "/workspace/content-studio",
    workspaceType: "general",
  });
  const defaultWorkspace = client.readDefaultWorkspace();
  const ensuredDefault = client.ensureDefaultWorkspace();
  const projectsRoot = client.readWorkspaceProjectsRoot();
  const projectPath = client.resolveWorkspaceProjectPath({
    name: "content-studio",
    parentRootPath: "/workspace",
  });
  const ready = client.ensureWorkspaceReady({ id: "workspace-main" });
  const skills = client.listSkills();
  const skill = client.readSkill({ skillName: "article-writer" });
  const bindings = client.listWorkspaceSkillBindings({
    workspaceRoot: "/workspace/project",
    caller: "agent-chat",
    workbench: true,
    browserAssist: false,
  });
  const registeredSkills = client.listWorkspaceRegisteredSkills({
    workspaceRoot: "/workspace/project",
  });

  assert.equal(sessions.method, METHOD_AGENT_SESSION_LIST);
  assert.deepEqual(sessions.params, {
    includeArchived: true,
    workspaceId: "workspace-main",
    limit: 20,
  });
  assert.equal(updateSession.method, METHOD_AGENT_SESSION_UPDATE);
  assert.deepEqual(updateSession.params, {
    sessionId: "session-main",
    title: "重命名后的会话",
    archived: true,
    providerSelector: "custom-provider",
    providerName: "OpenAI Compatible",
    modelName: "gpt-5.4",
    executionStrategy: "react",
    recentAccessMode: "full-access",
    recentPreferences: { task: true, subagent: false },
    recentTeamSelection: { disabled: true },
  });
  assert.equal(archiveManySessions.method, METHOD_AGENT_SESSION_ARCHIVE_MANY);
  assert.deepEqual(archiveManySessions.params, {
    sessionIds: ["session-main", "session-second"],
  });
  assert.equal(deleteSession.method, METHOD_AGENT_SESSION_DELETE);
  assert.deepEqual(deleteSession.params, {
    sessionId: "session-main",
  });
  assert.equal(readObjective.method, METHOD_AGENT_SESSION_OBJECTIVE_READ);
  assert.deepEqual(readObjective.params, {
    sessionId: "session-main",
  });
  assert.equal(setObjective.method, METHOD_AGENT_SESSION_OBJECTIVE_SET);
  assert.deepEqual(setObjective.params, {
    sessionId: "session-main",
    workspaceId: "workspace-main",
    objectiveText: "完成生产命令 current 迁移",
    successCriteria: ["CRUD 走 App Server current"],
    budgetPolicy: { maxTurns: 8 },
    riskPolicy: { level: "medium" },
    approvalPolicy: { required: false },
    continuationPolicy: { mode: "manual" },
  });
  assert.equal(
    updateObjectiveStatus.method,
    METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
  );
  assert.deepEqual(updateObjectiveStatus.params, {
    sessionId: "session-main",
    status: "blocked",
    blockerReason: "等待共享写集释放",
  });
  assert.equal(clearObjective.method, METHOD_AGENT_SESSION_OBJECTIVE_CLEAR);
  assert.deepEqual(clearObjective.params, {
    sessionId: "session-main",
  });
  assert.equal(workspaces.method, METHOD_WORKSPACE_LIST);
  assert.deepEqual(workspaces.params, {});
  assert.equal(workspace.method, METHOD_WORKSPACE_READ);
  assert.deepEqual(workspace.params, { id: "workspace-main" });
  assert.equal(workspaceByPath.method, METHOD_WORKSPACE_BY_PATH_READ);
  assert.deepEqual(workspaceByPath.params, {
    rootPath: "/workspace/project",
  });
  assert.equal(ensuredWorkspace.method, METHOD_WORKSPACE_ENSURE);
  assert.deepEqual(ensuredWorkspace.params, {
    name: "content-studio",
    rootPath: "/workspace/content-studio",
    workspaceType: "general",
  });
  assert.equal(defaultWorkspace.method, METHOD_WORKSPACE_DEFAULT_READ);
  assert.deepEqual(defaultWorkspace.params, {});
  assert.equal(ensuredDefault.method, METHOD_WORKSPACE_DEFAULT_ENSURE);
  assert.equal(projectsRoot.method, METHOD_WORKSPACE_PROJECTS_ROOT_READ);
  assert.equal(projectPath.method, METHOD_WORKSPACE_PROJECT_PATH_RESOLVE);
  assert.deepEqual(projectPath.params, {
    name: "content-studio",
    parentRootPath: "/workspace",
  });
  assert.equal(ready.method, METHOD_WORKSPACE_ENSURE_READY);
  assert.deepEqual(ready.params, { id: "workspace-main" });
  assert.equal(skills.method, METHOD_SKILL_LIST);
  assert.deepEqual(skills.params, {});
  assert.equal(skill.method, METHOD_SKILL_READ);
  assert.deepEqual(skill.params, { skillName: "article-writer" });
  assert.equal(bindings.method, METHOD_WORKSPACE_SKILL_BINDINGS_LIST);
  assert.deepEqual(bindings.params, {
    workspaceRoot: "/workspace/project",
    caller: "agent-chat",
    workbench: true,
    browserAssist: false,
  });
  assert.equal(
    registeredSkills.method,
    METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
  );
  assert.deepEqual(registeredSkills.params, {
    workspaceRoot: "/workspace/project",
  });
});

test("builds session archive and unarchive requests with current App Server methods", () => {
  const client = new AppServerClient();

  const archivedSessions = client.listSessions({
    archivedOnly: true,
    limit: 9,
  });
  const unarchiveSession = client.updateSession({
    sessionId: "session-main",
    archived: false,
  });

  assert.equal(archivedSessions.method, METHOD_AGENT_SESSION_LIST);
  assert.deepEqual(archivedSessions.params, {
    archivedOnly: true,
    limit: 9,
  });
  assert.equal(unarchiveSession.method, METHOD_AGENT_SESSION_UPDATE);
  assert.deepEqual(unarchiveSession.params, {
    sessionId: "session-main",
    archived: false,
  });
  assert.equal(
    APP_SERVER_METHODS.some(
      ({ method }) => method === "agent_runtime_delete_session",
    ),
    false,
  );
});

test("builds agent session file checkpoint requests with current App Server methods", () => {
  const client = new AppServerClient();

  const compact = client.compactAgentSession({
    sessionId: "sess_1",
    eventName: "agentSession/event/sess_1",
  });
  const resume = client.resumeAgentSessionThread({
    sessionId: "sess_1",
    resumeContract: {
      schemaVersion: "lime-runtime-resume-contract/v0.1",
      runtimeId: "app-server",
      sessionId: "sess_1",
      turnId: "thread",
      resumeMode: "all-open-actions",
      openActionIds: [],
      decisions: [],
      createdAt: "2026-06-12T00:00:00.000Z",
    },
  });
  const remove = client.removeAgentSessionQueuedTurn({
    sessionId: "sess_1",
    queuedTurnId: "queued-1",
  });
  const promote = client.promoteAgentSessionQueuedTurn({
    sessionId: "sess_1",
    queuedTurnId: "queued-2",
  });

  assert.equal(compact.id, 1);
  assert.equal(compact.method, METHOD_AGENT_SESSION_COMPACT);
  assert.deepEqual(compact.params, {
    sessionId: "sess_1",
    eventName: "agentSession/event/sess_1",
  });
  assert.equal(resume.id, 2);
  assert.equal(resume.method, METHOD_AGENT_SESSION_THREAD_RESUME);
  assert.deepEqual(resume.params, {
    sessionId: "sess_1",
    resumeContract: {
      schemaVersion: "lime-runtime-resume-contract/v0.1",
      runtimeId: "app-server",
      sessionId: "sess_1",
      turnId: "thread",
      resumeMode: "all-open-actions",
      openActionIds: [],
      decisions: [],
      createdAt: "2026-06-12T00:00:00.000Z",
    },
  });
  assert.equal(remove.id, 3);
  assert.equal(remove.method, METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE);
  assert.deepEqual(remove.params, {
    sessionId: "sess_1",
    queuedTurnId: "queued-1",
  });
  assert.equal(promote.id, 4);
  assert.equal(promote.method, METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE);
  assert.deepEqual(promote.params, {
    sessionId: "sess_1",
    queuedTurnId: "queued-2",
  });

  const checkpointClient = new AppServerClient();
  const list = checkpointClient.listAgentSessionFileCheckpoints({
    sessionId: "sess_1",
  });
  const get = checkpointClient.getAgentSessionFileCheckpoint({
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
  });
  const diff = checkpointClient.diffAgentSessionFileCheckpoint({
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
  });
  const restore = checkpointClient.restoreAgentSessionFileCheckpoint({
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
    confirmRestore: true,
    createBackup: false,
  });

  assert.equal(list.id, 1);
  assert.equal(list.method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST);
  assert.deepEqual(list.params, {
    sessionId: "sess_1",
  });
  assert.equal(get.id, 2);
  assert.equal(get.method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET);
  assert.deepEqual(get.params, {
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
  });
  assert.equal(diff.id, 3);
  assert.equal(diff.method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF);
  assert.deepEqual(diff.params, {
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
  });
  assert.equal(restore.id, 4);
  assert.equal(restore.method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE);
  assert.deepEqual(restore.params, {
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
    confirmRestore: true,
    createBackup: false,
  });
});

test("builds session file requests with current App Server methods", () => {
  const client = new AppServerClient();

  const getOrCreate = client.getOrCreateSessionFile({
    sessionId: "sess_1",
  });
  const updateMeta = client.updateSessionFileMeta({
    sessionId: "sess_1",
    title: "文章草稿",
    theme: "article",
    creationMode: "fast",
  });
  const save = client.saveSessionFile({
    sessionId: "sess_1",
    fileName: "draft/article.md",
    content: "# title",
    metadata: { kind: "draft" },
  });
  const read = client.readSessionFile({
    sessionId: "sess_1",
    fileName: "draft/article.md",
  });
  const resolvePath = client.resolveSessionFilePath({
    sessionId: "sess_1",
    fileName: "draft/article.md",
  });
  const deleteFile = client.deleteSessionFile({
    sessionId: "sess_1",
    fileName: "draft/article.md",
  });
  const list = client.listSessionFiles({
    sessionId: "sess_1",
  });

  assert.equal(getOrCreate.id, 1);
  assert.equal(getOrCreate.method, METHOD_SESSION_FILE_GET_OR_CREATE);
  assert.deepEqual(getOrCreate.params, { sessionId: "sess_1" });
  assert.equal(updateMeta.id, 2);
  assert.equal(updateMeta.method, METHOD_SESSION_FILE_UPDATE_META);
  assert.deepEqual(updateMeta.params, {
    sessionId: "sess_1",
    title: "文章草稿",
    theme: "article",
    creationMode: "fast",
  });
  assert.equal(save.id, 3);
  assert.equal(save.method, METHOD_SESSION_FILE_SAVE);
  assert.deepEqual(save.params, {
    sessionId: "sess_1",
    fileName: "draft/article.md",
    content: "# title",
    metadata: { kind: "draft" },
  });
  assert.equal(read.id, 4);
  assert.equal(read.method, METHOD_SESSION_FILE_READ);
  assert.deepEqual(read.params, {
    sessionId: "sess_1",
    fileName: "draft/article.md",
  });
  assert.equal(resolvePath.id, 5);
  assert.equal(resolvePath.method, METHOD_SESSION_FILE_RESOLVE_PATH);
  assert.deepEqual(resolvePath.params, {
    sessionId: "sess_1",
    fileName: "draft/article.md",
  });
  assert.equal(deleteFile.id, 6);
  assert.equal(deleteFile.method, METHOD_SESSION_FILE_DELETE);
  assert.deepEqual(deleteFile.params, {
    sessionId: "sess_1",
    fileName: "draft/article.md",
  });
  assert.equal(list.id, 7);
  assert.equal(list.method, METHOD_SESSION_FILE_LIST);
  assert.deepEqual(list.params, { sessionId: "sess_1" });
  for (const method of [
    METHOD_SESSION_FILE_GET_OR_CREATE,
    METHOD_SESSION_FILE_UPDATE_META,
    METHOD_SESSION_FILE_SAVE,
    METHOD_SESSION_FILE_READ,
    METHOD_SESSION_FILE_RESOLVE_PATH,
    METHOD_SESSION_FILE_DELETE,
    METHOD_SESSION_FILE_LIST,
  ]) {
    assert.equal(isAppServerRequestMethod(method), true);
  }
});

test("builds app data surface requests with current methods", () => {
  const client = new AppServerClient();

  const installed = client.listAgentAppInstalled();
  const runtimeStart = client.startAgentAppUiRuntime({
    appId: "content-factory-app",
    entryKey: "dashboard",
  });
  const runtimeStatus = client.getAgentAppUiRuntimeStatus({
    appId: "content-factory-app",
  });
  const runtimeStop = client.stopAgentAppUiRuntime({
    appId: "content-factory-app",
  });
  const shellPrepare = client.prepareAgentAppShell({
    descriptor: {
      appId: "content-factory-app",
    },
  });
  const knowledge = client.listKnowledgePacks({
    workingDir: "/workspace/project",
    includeArchived: true,
  });
  const knowledgeDetail = client.readKnowledgePack({
    workingDir: "/workspace/project",
    name: "sample-product",
  });
  const importedKnowledgeSource = client.importKnowledgeSource({
    workingDir: "/workspace/project",
    packName: "sample-product",
    sourceText: "示例产品事实",
  });
  const compiledKnowledgePack = client.compileKnowledgePack({
    workingDir: "/workspace/project",
    name: "sample-product",
    builderRuntime: { enabled: true },
  });
  const defaultKnowledgePack = client.setDefaultKnowledgePack({
    workingDir: "/workspace/project",
    name: "sample-product",
  });
  const updatedKnowledgePackStatus = client.updateKnowledgePackStatus({
    workingDir: "/workspace/project",
    name: "sample-product",
    status: "ready",
  });
  const knowledgeContext = client.resolveKnowledgeContext({
    workingDir: "/workspace/project",
    name: "sample-product",
    task: "写产品介绍",
    writeRun: true,
  });
  const knowledgeContextValidation = client.validateKnowledgeContextRun({
    workingDir: "/workspace/project",
    name: "sample-product",
    runPath: "runs/context.json",
  });
  const schedulerConfig = client.readAutomationSchedulerConfig();
  const schedulerConfigUpdate = client.updateAutomationSchedulerConfig({
    config: {
      enabled: true,
      poll_interval_secs: 60,
      enable_history: true,
    },
  });
  const schedulerStatus = client.readAutomationSchedulerStatus();
  const jobs = client.listAutomationJobs();
  const job = client.readAutomationJob({ id: "job-1" });
  const createdJob = client.createAutomationJob({
    request: {
      name: "每日简报",
      workspace_id: "workspace-main",
      schedule: { kind: "every", every_secs: 3600 },
      payload: {
        kind: "agent_turn",
        prompt: "总结今天重点",
        web_search: false,
      },
    },
  });
  const updatedJob = client.updateAutomationJob({
    id: "job-1",
    request: { enabled: false },
  });
  const deletedJob = client.deleteAutomationJob({ id: "job-1" });
  const runNow = client.runAutomationJobNow({ id: "job-1" });
  const health = client.readAutomationHealth({
    query: { top_limit: 3 },
  });
  const history = client.readAutomationRunHistory({
    id: "job-1",
    limit: 10,
  });
  const preview = client.previewAutomationSchedule({
    schedule: { kind: "every", every_secs: 3600 },
  });
  const validate = client.validateAutomationSchedule({
    schedule: { kind: "every", every_secs: 3600 },
  });
  const mcpServers = client.listMcpServers();
  const mcpServerStatus = client.listMcpServersWithStatus();
  const mcpServer = {
    id: "server-1",
    name: "filesystem",
    server_config: { command: "node", args: ["server.js"] },
    enabled_lime: true,
    enabled_claude: false,
    enabled_codex: true,
    enabled_gemini: false,
  };
  const mcpServerCreate = client.createMcpServer({
    server: mcpServer,
  });
  const mcpServerUpdate = client.updateMcpServer({
    server: mcpServer,
  });
  const mcpServerDelete = client.deleteMcpServer({
    id: "server-1",
  });
  const mcpServerEnabled = client.setMcpServerEnabled({
    id: "server-1",
    appType: "codex",
    enabled: true,
  });
  const mcpServerImport = client.importMcpServersFromApp({
    appType: "codex",
  });
  const mcpServerSync = client.syncAllMcpServersToLive();
  const mcpServerOAuthLogin = client.loginMcpServerOauth({
    name: "filesystem",
    scopes: ["files.read"],
    timeoutSecs: 120,
  });
  const mcpServerStart = client.startMcpServer({
    name: "filesystem",
  });
  const mcpServerStop = client.stopMcpServer({
    name: "filesystem",
  });
  const mcpTools = client.listMcpTools();
  const mcpToolsForContext = client.listMcpToolsForContext({
    caller: "agent-chat",
    includeDeferred: true,
  });
  const mcpToolSearch = client.searchMcpTools({
    query: "file",
    caller: "agent-chat",
    limit: 5,
  });
  const mcpToolCall = client.callMcpTool({
    toolName: "filesystem.read",
    arguments: { path: "/workspace/README.md" },
  });
  const mcpToolCallWithCaller = client.callMcpToolWithCaller({
    toolName: "filesystem.read",
    arguments: { path: "/workspace/README.md" },
    caller: "agent-chat",
  });
  const mcpPrompts = client.listMcpPrompts();
  const mcpPrompt = client.getMcpPrompt({
    name: "summarize",
    arguments: { topic: "release notes" },
  });
  const mcpResources = client.listMcpResources();
  const mcpResource = client.readMcpResource({
    uri: "file:///workspace/README.md",
  });
  const memory = client.readProjectMemory({
    projectId: "workspace-main",
  });
  const memoryStoreList = client.listMemoryStore({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    path: "skills",
    maxResults: 20,
  });
  const memoryStoreRead = client.readMemoryStore({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    path: "MEMORY.md",
    maxLines: 40,
  });
  const memoryStoreSearch = client.searchMemoryStore({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    queries: ["voice", "preference"],
    matchMode: "allWithinLines",
    withinLines: 4,
  });
  const memoryStoreAddNote = client.addMemoryStoreNote({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    title: "Tone note",
    content: "Prefer concise answers.",
  });
  const memoryStoreConsolidate = client.consolidateMemoryStore({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    maxNotes: 10,
  });
  const memoryStoreReviewList = client.listMemoryStoreReviewNotes({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    maxResults: 10,
  });
  const memoryStoreReviewResolve = client.resolveMemoryStoreReviewNote({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    path: "extensions/ad_hoc/review/secret.md",
    action: "reject",
  });
  const memoryStoreHealth = client.healthMemoryStore({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
  });
  const memoryStoreReset = client.resetMemoryStore({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
  });
  const memoryStoreIndexRebuild = client.rebuildMemoryStoreIndex({
    scope: "workspace",
    workspaceRoot: "/workspace/project",
  });
  const logs = client.listLogs();
  const persistedTail = client.readPersistedLogTail({ lines: 250 });
  const clearedLogs = client.clearLogs();
  const clearedDiagnosticHistory = client.clearDiagnosticLogHistory();
  const logStorageDiagnostics = client.readLogStorageDiagnostics();
  const supportBundle = client.exportSupportBundle();
  const serverDiagnostics = client.readServerDiagnostics();
  const windowsStartupDiagnostics = client.readWindowsStartupDiagnostics();
  const gatewayChannelStatus = client.readGatewayChannelStatus({
    channel: "wechat",
  });
  const gatewayChannelStart = client.startGatewayChannel({
    channel: "telegram",
    accountId: "default",
    pollTimeoutSecs: 25,
  });
  const gatewayChannelStop = client.stopGatewayChannel({
    channel: "telegram",
    accountId: "default",
  });
  const telegramChannelProbe = client.probeTelegramChannel({
    accountId: "default",
  });
  const wechatChannelLoginStart = client.startWechatChannelLogin({
    baseUrl: "http://127.0.0.1:8080",
    botType: "ilink",
  });
  const wechatChannelLoginWait = client.waitWechatChannelLogin({
    sessionKey: "login-session-1",
    timeoutMs: 60000,
  });
  const wechatChannelAccounts = client.listWechatChannelAccounts();
  const wechatChannelAccountRemove = client.removeWechatChannelAccount({
    accountId: "wechat-default",
    purgeData: false,
  });
  const wechatRuntimeModelSet = client.setWechatChannelRuntimeModel({
    providerId: "openai",
    modelId: "gpt-5.4",
  });
  const gatewayTunnelProbe = client.probeGatewayTunnel();
  const gatewayTunnelDetectCloudflared =
    client.detectGatewayTunnelCloudflared();
  const gatewayTunnelInstallCloudflared =
    client.installGatewayTunnelCloudflared({
      confirm: true,
    });
  const gatewayTunnelCreate = client.createGatewayTunnel({
    tunnelName: "lime",
    dnsName: "bot.example.com",
    persist: true,
  });
  const gatewayTunnelStart = client.startGatewayTunnel();
  const gatewayTunnelStop = client.stopGatewayTunnel();
  const gatewayTunnelRestart = client.restartGatewayTunnel();
  const gatewayTunnelStatus = client.readGatewayTunnelStatus();
  const gatewayTunnelSyncWebhookUrl = client.syncGatewayTunnelWebhookUrl({
    channel: "feishu",
    accountId: "default",
    webhookPath: "/feishu/default",
    persist: true,
  });
  const imageMediaTask = client.createImageMediaTaskArtifact({
    projectRootPath: "/workspace",
    prompt: "未来感青柠实验室",
    mode: "generate",
  });
  const audioMediaTask = client.createAudioMediaTaskArtifact({
    projectRootPath: "/workspace",
    sourceText: "请生成温暖旁白",
  });
  const completedAudioMediaTask = client.completeAudioMediaTaskArtifact({
    projectRootPath: "/workspace",
    taskRef: "task-audio-1",
    audioPath: ".lime/runtime/audio/task-audio-1.mp3",
  });
  const mediaTask = client.getMediaTaskArtifact({
    projectRootPath: "/workspace",
    taskRef: "task-image-1",
  });
  const mediaTaskList = client.listMediaTaskArtifacts({
    projectRootPath: "/workspace",
    taskType: "image_generate",
    modalityContractKey: "image_generation",
    limit: 10,
  });
  const cancelledMediaTask = client.cancelMediaTaskArtifact({
    projectRootPath: "/workspace",
    taskRef: "task-image-1",
  });
  const voiceAsrCredentials = client.listVoiceAsrCredentials();
  const createdVoiceAsrCredential = client.createVoiceAsrCredential({
    provider: "sense_voice_local",
    is_default: true,
    disabled: false,
    language: "auto",
    sensevoice_config: {
      model_id: "sensevoice-small-int8-2024-07-17",
      use_itn: true,
      num_threads: 4,
    },
  });
  const updatedVoiceAsrCredential = client.updateVoiceAsrCredential({
    credential: {
      id: "cred-1",
      provider: "openai",
      is_default: false,
      disabled: false,
      language: "zh-CN",
      openai_config: {
        api_key: "sk-test",
      },
    },
  });
  const deletedVoiceAsrCredential = client.deleteVoiceAsrCredential({
    id: "cred-1",
  });
  const defaultVoiceAsrCredential = client.setDefaultVoiceAsrCredential({
    id: "cred-1",
  });
  const testedVoiceAsrCredential = client.testVoiceAsrCredential({
    id: "cred-1",
  });
  const voiceInstructions = client.listVoiceInstructions();
  const savedVoiceInstruction = client.saveVoiceInstruction({
    instruction: {
      id: "instruction-1",
      name: "会议纪要",
      prompt: "请整理讲话内容",
      is_preset: false,
    },
  });
  const deletedVoiceInstruction = client.deleteVoiceInstruction({
    id: "instruction-1",
  });
  const defaultVoiceModel = client.setDefaultVoiceModel({
    model_id: "sensevoice-small-int8-2024-07-17",
    install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
  });
  const testedVoiceModelFile = client.testTranscribeVoiceModelFile({
    model_id: "sensevoice-small-int8-2024-07-17",
    file_path: "/tmp/interview.wav",
  });

  assert.equal(installed.method, METHOD_AGENT_APP_INSTALLED_LIST);
  assert.deepEqual(installed.params, {});
  assert.equal(runtimeStart.method, METHOD_AGENT_APP_UI_RUNTIME_START);
  assert.deepEqual(runtimeStart.params, {
    appId: "content-factory-app",
    entryKey: "dashboard",
  });
  assert.equal(runtimeStatus.method, METHOD_AGENT_APP_UI_RUNTIME_STATUS);
  assert.deepEqual(runtimeStatus.params, {
    appId: "content-factory-app",
  });
  assert.equal(runtimeStop.method, METHOD_AGENT_APP_UI_RUNTIME_STOP);
  assert.deepEqual(runtimeStop.params, {
    appId: "content-factory-app",
  });
  assert.equal(shellPrepare.method, METHOD_AGENT_APP_SHELL_PREPARE);
  assert.deepEqual(shellPrepare.params, {
    descriptor: {
      appId: "content-factory-app",
    },
  });
  assert.equal(knowledge.method, METHOD_KNOWLEDGE_PACK_LIST);
  assert.deepEqual(knowledge.params, {
    workingDir: "/workspace/project",
    includeArchived: true,
  });
  assert.equal(knowledgeDetail.method, METHOD_KNOWLEDGE_PACK_READ);
  assert.deepEqual(knowledgeDetail.params, {
    workingDir: "/workspace/project",
    name: "sample-product",
  });
  assert.equal(importedKnowledgeSource.method, METHOD_KNOWLEDGE_SOURCE_IMPORT);
  assert.deepEqual(importedKnowledgeSource.params, {
    workingDir: "/workspace/project",
    packName: "sample-product",
    sourceText: "示例产品事实",
  });
  assert.equal(compiledKnowledgePack.method, METHOD_KNOWLEDGE_PACK_COMPILE);
  assert.deepEqual(compiledKnowledgePack.params, {
    workingDir: "/workspace/project",
    name: "sample-product",
    builderRuntime: { enabled: true },
  });
  assert.equal(defaultKnowledgePack.method, METHOD_KNOWLEDGE_PACK_DEFAULT_SET);
  assert.deepEqual(defaultKnowledgePack.params, {
    workingDir: "/workspace/project",
    name: "sample-product",
  });
  assert.equal(
    updatedKnowledgePackStatus.method,
    METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
  );
  assert.deepEqual(updatedKnowledgePackStatus.params, {
    workingDir: "/workspace/project",
    name: "sample-product",
    status: "ready",
  });
  assert.equal(knowledgeContext.method, METHOD_KNOWLEDGE_CONTEXT_RESOLVE);
  assert.deepEqual(knowledgeContext.params, {
    workingDir: "/workspace/project",
    name: "sample-product",
    task: "写产品介绍",
    writeRun: true,
  });
  assert.equal(
    knowledgeContextValidation.method,
    METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
  );
  assert.deepEqual(knowledgeContextValidation.params, {
    workingDir: "/workspace/project",
    name: "sample-product",
    runPath: "runs/context.json",
  });
  assert.equal(schedulerConfig.method, METHOD_AUTOMATION_SCHEDULER_CONFIG_READ);
  assert.deepEqual(schedulerConfig.params, {});
  assert.equal(
    schedulerConfigUpdate.method,
    METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
  );
  assert.deepEqual(schedulerConfigUpdate.params, {
    config: {
      enabled: true,
      poll_interval_secs: 60,
      enable_history: true,
    },
  });
  assert.equal(schedulerStatus.method, METHOD_AUTOMATION_SCHEDULER_STATUS);
  assert.deepEqual(schedulerStatus.params, {});
  assert.equal(jobs.method, METHOD_AUTOMATION_JOB_LIST);
  assert.deepEqual(jobs.params, {});
  assert.equal(job.method, METHOD_AUTOMATION_JOB_READ);
  assert.deepEqual(job.params, { id: "job-1" });
  assert.equal(createdJob.method, METHOD_AUTOMATION_JOB_CREATE);
  assert.deepEqual(createdJob.params, {
    request: {
      name: "每日简报",
      workspace_id: "workspace-main",
      schedule: { kind: "every", every_secs: 3600 },
      payload: {
        kind: "agent_turn",
        prompt: "总结今天重点",
        web_search: false,
      },
    },
  });
  assert.equal(updatedJob.method, METHOD_AUTOMATION_JOB_UPDATE);
  assert.deepEqual(updatedJob.params, {
    id: "job-1",
    request: { enabled: false },
  });
  assert.equal(deletedJob.method, METHOD_AUTOMATION_JOB_DELETE);
  assert.deepEqual(deletedJob.params, { id: "job-1" });
  assert.equal(runNow.method, METHOD_AUTOMATION_JOB_RUN_NOW);
  assert.equal(health.method, METHOD_AUTOMATION_JOB_HEALTH);
  assert.deepEqual(health.params, {
    query: { top_limit: 3 },
  });
  assert.equal(history.method, METHOD_AUTOMATION_JOB_RUN_HISTORY);
  assert.deepEqual(history.params, {
    id: "job-1",
    limit: 10,
  });
  assert.equal(preview.method, METHOD_AUTOMATION_SCHEDULE_PREVIEW);
  assert.deepEqual(preview.params, {
    schedule: { kind: "every", every_secs: 3600 },
  });
  assert.equal(validate.method, METHOD_AUTOMATION_SCHEDULE_VALIDATE);
  assert.equal(mcpServers.method, METHOD_MCP_SERVER_LIST);
  assert.deepEqual(mcpServers.params, {});
  assert.equal(mcpServerStatus.method, METHOD_MCP_SERVER_STATUS_LIST);
  assert.deepEqual(mcpServerStatus.params, {});
  assert.equal(mcpServerCreate.method, METHOD_MCP_SERVER_CREATE);
  assert.deepEqual(mcpServerCreate.params, {
    server: mcpServer,
  });
  assert.equal(mcpServerUpdate.method, METHOD_MCP_SERVER_UPDATE);
  assert.deepEqual(mcpServerUpdate.params, {
    server: mcpServer,
  });
  assert.equal(mcpServerDelete.method, METHOD_MCP_SERVER_DELETE);
  assert.deepEqual(mcpServerDelete.params, {
    id: "server-1",
  });
  assert.equal(mcpServerEnabled.method, METHOD_MCP_SERVER_ENABLED_SET);
  assert.deepEqual(mcpServerEnabled.params, {
    id: "server-1",
    appType: "codex",
    enabled: true,
  });
  assert.equal(mcpServerImport.method, METHOD_MCP_SERVER_IMPORT_FROM_APP);
  assert.deepEqual(mcpServerImport.params, {
    appType: "codex",
  });
  assert.equal(mcpServerSync.method, METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE);
  assert.deepEqual(mcpServerSync.params, {});
  assert.equal(mcpServerOAuthLogin.method, METHOD_MCP_SERVER_OAUTH_LOGIN);
  assert.deepEqual(mcpServerOAuthLogin.params, {
    name: "filesystem",
    scopes: ["files.read"],
    timeoutSecs: 120,
  });
  assert.equal(mcpServerStart.method, METHOD_MCP_SERVER_START);
  assert.deepEqual(mcpServerStart.params, {
    name: "filesystem",
  });
  assert.equal(mcpServerStop.method, METHOD_MCP_SERVER_STOP);
  assert.deepEqual(mcpServerStop.params, {
    name: "filesystem",
  });
  assert.equal(mcpTools.method, METHOD_MCP_TOOL_LIST);
  assert.deepEqual(mcpTools.params, {});
  assert.equal(mcpToolsForContext.method, METHOD_MCP_TOOL_LIST_FOR_CONTEXT);
  assert.deepEqual(mcpToolsForContext.params, {
    caller: "agent-chat",
    includeDeferred: true,
  });
  assert.equal(mcpToolSearch.method, METHOD_MCP_TOOL_SEARCH);
  assert.deepEqual(mcpToolSearch.params, {
    query: "file",
    caller: "agent-chat",
    limit: 5,
  });
  assert.equal(mcpToolCall.method, METHOD_MCP_TOOL_CALL);
  assert.deepEqual(mcpToolCall.params, {
    toolName: "filesystem.read",
    arguments: { path: "/workspace/README.md" },
  });
  assert.equal(mcpToolCallWithCaller.method, METHOD_MCP_TOOL_CALL_WITH_CALLER);
  assert.deepEqual(mcpToolCallWithCaller.params, {
    toolName: "filesystem.read",
    arguments: { path: "/workspace/README.md" },
    caller: "agent-chat",
  });
  assert.equal(mcpPrompts.method, METHOD_MCP_PROMPT_LIST);
  assert.deepEqual(mcpPrompts.params, {});
  assert.equal(mcpPrompt.method, METHOD_MCP_PROMPT_GET);
  assert.deepEqual(mcpPrompt.params, {
    name: "summarize",
    arguments: { topic: "release notes" },
  });
  assert.equal(mcpResources.method, METHOD_MCP_RESOURCE_LIST);
  assert.deepEqual(mcpResources.params, {});
  assert.equal(mcpResource.method, METHOD_MCP_RESOURCE_READ);
  assert.deepEqual(mcpResource.params, {
    uri: "file:///workspace/README.md",
  });
  assert.equal(memory.method, METHOD_PROJECT_MEMORY_READ);
  assert.deepEqual(memory.params, {
    projectId: "workspace-main",
  });
  assert.equal(memoryStoreList.method, METHOD_MEMORY_STORE_LIST);
  assert.deepEqual(memoryStoreList.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    path: "skills",
    maxResults: 20,
  });
  assert.equal(memoryStoreRead.method, METHOD_MEMORY_STORE_READ);
  assert.deepEqual(memoryStoreRead.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    path: "MEMORY.md",
    maxLines: 40,
  });
  assert.equal(memoryStoreSearch.method, METHOD_MEMORY_STORE_SEARCH);
  assert.deepEqual(memoryStoreSearch.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    queries: ["voice", "preference"],
    matchMode: "allWithinLines",
    withinLines: 4,
  });
  assert.equal(memoryStoreAddNote.method, METHOD_MEMORY_STORE_ADD_NOTE);
  assert.deepEqual(memoryStoreAddNote.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    title: "Tone note",
    content: "Prefer concise answers.",
  });
  assert.equal(memoryStoreConsolidate.method, METHOD_MEMORY_STORE_CONSOLIDATE);
  assert.deepEqual(memoryStoreConsolidate.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    maxNotes: 10,
  });
  assert.equal(memoryStoreReviewList.method, METHOD_MEMORY_STORE_REVIEW_LIST);
  assert.deepEqual(memoryStoreReviewList.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    maxResults: 10,
  });
  assert.equal(
    memoryStoreReviewResolve.method,
    METHOD_MEMORY_STORE_REVIEW_RESOLVE,
  );
  assert.deepEqual(memoryStoreReviewResolve.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
    path: "extensions/ad_hoc/review/secret.md",
    action: "reject",
  });
  assert.equal(memoryStoreHealth.method, METHOD_MEMORY_STORE_HEALTH);
  assert.deepEqual(memoryStoreHealth.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
  });
  assert.equal(memoryStoreReset.method, METHOD_MEMORY_STORE_RESET);
  assert.deepEqual(memoryStoreReset.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
  });
  assert.equal(
    memoryStoreIndexRebuild.method,
    METHOD_MEMORY_STORE_INDEX_REBUILD,
  );
  assert.deepEqual(memoryStoreIndexRebuild.params, {
    scope: "workspace",
    workspaceRoot: "/workspace/project",
  });
  assert.equal(logs.method, METHOD_LOG_LIST);
  assert.deepEqual(logs.params, {});
  assert.equal(persistedTail.method, METHOD_LOG_PERSISTED_TAIL);
  assert.deepEqual(persistedTail.params, { lines: 250 });
  assert.equal(clearedLogs.method, METHOD_LOG_CLEAR);
  assert.deepEqual(clearedLogs.params, {});
  assert.equal(
    clearedDiagnosticHistory.method,
    METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
  );
  assert.deepEqual(clearedDiagnosticHistory.params, {});
  assert.equal(
    logStorageDiagnostics.method,
    METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
  );
  assert.deepEqual(logStorageDiagnostics.params, {});
  assert.equal(supportBundle.method, METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT);
  assert.deepEqual(supportBundle.params, {});
  assert.equal(serverDiagnostics.method, METHOD_DIAGNOSTICS_SERVER_READ);
  assert.deepEqual(serverDiagnostics.params, {});
  assert.equal(
    windowsStartupDiagnostics.method,
    METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
  );
  assert.deepEqual(windowsStartupDiagnostics.params, {});
  assert.equal(gatewayChannelStatus.method, METHOD_GATEWAY_CHANNEL_STATUS);
  assert.deepEqual(gatewayChannelStatus.params, { channel: "wechat" });
  assert.equal(gatewayChannelStart.method, METHOD_GATEWAY_CHANNEL_START);
  assert.deepEqual(gatewayChannelStart.params, {
    channel: "telegram",
    accountId: "default",
    pollTimeoutSecs: 25,
  });
  assert.equal(gatewayChannelStop.method, METHOD_GATEWAY_CHANNEL_STOP);
  assert.deepEqual(gatewayChannelStop.params, {
    channel: "telegram",
    accountId: "default",
  });
  assert.equal(telegramChannelProbe.method, METHOD_TELEGRAM_CHANNEL_PROBE);
  assert.deepEqual(telegramChannelProbe.params, { accountId: "default" });
  assert.equal(
    wechatChannelLoginStart.method,
    METHOD_WECHAT_CHANNEL_LOGIN_START,
  );
  assert.deepEqual(wechatChannelLoginStart.params, {
    baseUrl: "http://127.0.0.1:8080",
    botType: "ilink",
  });
  assert.equal(wechatChannelLoginWait.method, METHOD_WECHAT_CHANNEL_LOGIN_WAIT);
  assert.deepEqual(wechatChannelLoginWait.params, {
    sessionKey: "login-session-1",
    timeoutMs: 60000,
  });
  assert.equal(
    wechatChannelAccounts.method,
    METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
  );
  assert.deepEqual(wechatChannelAccounts.params, {});
  assert.equal(
    wechatChannelAccountRemove.method,
    METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
  );
  assert.deepEqual(wechatChannelAccountRemove.params, {
    accountId: "wechat-default",
    purgeData: false,
  });
  assert.equal(
    wechatRuntimeModelSet.method,
    METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
  );
  assert.deepEqual(wechatRuntimeModelSet.params, {
    providerId: "openai",
    modelId: "gpt-5.4",
  });
  assert.equal(gatewayTunnelProbe.method, METHOD_GATEWAY_TUNNEL_PROBE);
  assert.deepEqual(gatewayTunnelProbe.params, {});
  assert.equal(
    gatewayTunnelDetectCloudflared.method,
    METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
  );
  assert.deepEqual(gatewayTunnelDetectCloudflared.params, {});
  assert.equal(
    gatewayTunnelInstallCloudflared.method,
    METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
  );
  assert.deepEqual(gatewayTunnelInstallCloudflared.params, {
    confirm: true,
  });
  assert.equal(gatewayTunnelCreate.method, METHOD_GATEWAY_TUNNEL_CREATE);
  assert.deepEqual(gatewayTunnelCreate.params, {
    tunnelName: "lime",
    dnsName: "bot.example.com",
    persist: true,
  });
  assert.equal(gatewayTunnelStart.method, METHOD_GATEWAY_TUNNEL_START);
  assert.deepEqual(gatewayTunnelStart.params, {});
  assert.equal(gatewayTunnelStop.method, METHOD_GATEWAY_TUNNEL_STOP);
  assert.deepEqual(gatewayTunnelStop.params, {});
  assert.equal(gatewayTunnelRestart.method, METHOD_GATEWAY_TUNNEL_RESTART);
  assert.deepEqual(gatewayTunnelRestart.params, {});
  assert.equal(gatewayTunnelStatus.method, METHOD_GATEWAY_TUNNEL_STATUS);
  assert.deepEqual(gatewayTunnelStatus.params, {});
  assert.equal(
    gatewayTunnelSyncWebhookUrl.method,
    METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
  );
  assert.deepEqual(gatewayTunnelSyncWebhookUrl.params, {
    channel: "feishu",
    accountId: "default",
    webhookPath: "/feishu/default",
    persist: true,
  });
  assert.equal(imageMediaTask.method, METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE);
  assert.deepEqual(imageMediaTask.params, {
    projectRootPath: "/workspace",
    prompt: "未来感青柠实验室",
    mode: "generate",
  });
  assert.equal(audioMediaTask.method, METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE);
  assert.deepEqual(audioMediaTask.params, {
    projectRootPath: "/workspace",
    sourceText: "请生成温暖旁白",
  });
  assert.equal(
    completedAudioMediaTask.method,
    METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
  );
  assert.deepEqual(completedAudioMediaTask.params, {
    projectRootPath: "/workspace",
    taskRef: "task-audio-1",
    audioPath: ".lime/runtime/audio/task-audio-1.mp3",
  });
  assert.equal(mediaTask.method, METHOD_MEDIA_TASK_ARTIFACT_GET);
  assert.deepEqual(mediaTask.params, {
    projectRootPath: "/workspace",
    taskRef: "task-image-1",
  });
  assert.equal(mediaTaskList.method, METHOD_MEDIA_TASK_ARTIFACT_LIST);
  assert.deepEqual(mediaTaskList.params, {
    projectRootPath: "/workspace",
    taskType: "image_generate",
    modalityContractKey: "image_generation",
    limit: 10,
  });
  assert.equal(cancelledMediaTask.method, METHOD_MEDIA_TASK_ARTIFACT_CANCEL);
  assert.deepEqual(cancelledMediaTask.params, {
    projectRootPath: "/workspace",
    taskRef: "task-image-1",
  });
  assert.equal(voiceAsrCredentials.method, METHOD_VOICE_ASR_CREDENTIAL_LIST);
  assert.deepEqual(voiceAsrCredentials.params, {});
  assert.equal(
    createdVoiceAsrCredential.method,
    METHOD_VOICE_ASR_CREDENTIAL_CREATE,
  );
  assert.deepEqual(createdVoiceAsrCredential.params, {
    provider: "sense_voice_local",
    is_default: true,
    disabled: false,
    language: "auto",
    sensevoice_config: {
      model_id: "sensevoice-small-int8-2024-07-17",
      use_itn: true,
      num_threads: 4,
    },
  });
  assert.equal(
    updatedVoiceAsrCredential.method,
    METHOD_VOICE_ASR_CREDENTIAL_UPDATE,
  );
  assert.deepEqual(updatedVoiceAsrCredential.params, {
    credential: {
      id: "cred-1",
      provider: "openai",
      is_default: false,
      disabled: false,
      language: "zh-CN",
      openai_config: {
        api_key: "sk-test",
      },
    },
  });
  assert.equal(
    deletedVoiceAsrCredential.method,
    METHOD_VOICE_ASR_CREDENTIAL_DELETE,
  );
  assert.deepEqual(deletedVoiceAsrCredential.params, { id: "cred-1" });
  assert.equal(
    defaultVoiceAsrCredential.method,
    METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET,
  );
  assert.deepEqual(defaultVoiceAsrCredential.params, { id: "cred-1" });
  assert.equal(
    testedVoiceAsrCredential.method,
    METHOD_VOICE_ASR_CREDENTIAL_TEST,
  );
  assert.deepEqual(testedVoiceAsrCredential.params, { id: "cred-1" });
  assert.equal(voiceInstructions.method, METHOD_VOICE_INSTRUCTION_LIST);
  assert.deepEqual(voiceInstructions.params, {});
  assert.equal(savedVoiceInstruction.method, METHOD_VOICE_INSTRUCTION_SAVE);
  assert.deepEqual(savedVoiceInstruction.params, {
    instruction: {
      id: "instruction-1",
      name: "会议纪要",
      prompt: "请整理讲话内容",
      is_preset: false,
    },
  });
  assert.equal(deletedVoiceInstruction.method, METHOD_VOICE_INSTRUCTION_DELETE);
  assert.deepEqual(deletedVoiceInstruction.params, { id: "instruction-1" });
  assert.equal(defaultVoiceModel.method, METHOD_VOICE_MODEL_DEFAULT_SET);
  assert.deepEqual(defaultVoiceModel.params, {
    model_id: "sensevoice-small-int8-2024-07-17",
    install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
  });
  assert.equal(
    testedVoiceModelFile.method,
    METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE,
  );
  assert.deepEqual(testedVoiceModelFile.params, {
    model_id: "sensevoice-small-int8-2024-07-17",
    file_path: "/tmp/interview.wav",
  });
  for (const legacyMethod of [
    "get_automation_scheduler_config",
    "get_automation_status",
    "get_automation_job",
    "create_automation_job",
    "update_automation_job",
    "delete_automation_job",
    "run_automation_job_now",
    "get_automation_health",
    "get_automation_run_history",
    "preview_automation_schedule",
    "validate_automation_schedule",
    "gateway_tunnel_probe",
    "gateway_tunnel_detect_cloudflared",
    "gateway_tunnel_install_cloudflared",
    "gateway_tunnel_create",
    "gateway_tunnel_start",
    "gateway_tunnel_stop",
    "gateway_tunnel_restart",
    "gateway_tunnel_status",
    "gateway_tunnel_sync_webhook_url",
  ]) {
    assert.equal(
      APP_SERVER_METHODS.some(({ method }) => method === legacyMethod),
      false,
    );
  }
});

test("builds artifact read requests with optional content lookup", () => {
  const client = new AppServerClient();

  const artifacts = client.readArtifacts({
    sessionId: "sess_1",
    turnId: "turn_1",
    artifactRef: "artifact-document:req-1",
    includeContent: true,
    cursor: "2",
    limit: 10,
  });

  assert.equal(artifacts.id, 1);
  assert.equal(artifacts.method, METHOD_ARTIFACT_READ);
  assert.deepEqual(artifacts.params, {
    sessionId: "sess_1",
    turnId: "turn_1",
    artifactRef: "artifact-document:req-1",
    includeContent: true,
    cursor: "2",
    limit: 10,
  });
});

test("builds file system requests with current methods", () => {
  const client = new AppServerClient();

  const listing = client.listDirectory({
    path: "/workspace",
  });
  const preview = client.readFilePreview({
    path: "/workspace/README.md",
    maxSize: 1024,
  });
  const createFile = client.createFile({
    path: "/workspace/new.md",
  });
  const createDirectory = client.createDirectory({
    path: "/workspace/new-dir",
  });
  const renameFile = client.renameFile({
    oldPath: "/workspace/new.md",
    newPath: "/workspace/renamed.md",
  });
  const deleteFile = client.deleteFile({
    path: "/workspace/renamed.md",
    recursive: false,
  });
  const gitStatus = client.readProjectGitStatus({
    rootPath: "/workspace",
  });
  const gitDiff = client.readProjectGitDiff({
    rootPath: "/workspace",
    contextLines: 5,
    base: "staged",
    commitSha: "abc123",
  });
  const gitCommits = client.listProjectGitCommits({
    rootPath: "/workspace",
    limit: 12,
  });
  const gitCheckout = client.checkoutProjectGitBranch({
    rootPath: "/workspace",
    branch: "feature/demo",
  });
  const gitCreateBranch = client.createProjectGitBranch({
    rootPath: "/workspace",
    branch: "feature/new",
  });
  const gitCreateWorktree = client.createProjectGitWorktree({
    rootPath: "/workspace",
    name: "agent-demo",
    baseBranch: "main",
  });
  const shellStart = client.startProjectShellSession({
    rootPath: "/workspace",
    cols: 120,
    rows: 16,
  });
  const shellWrite = client.writeProjectShellSession({
    sessionId: "project-shell-1",
    data: "pwd\r",
  });
  const shellResize = client.resizeProjectShellSession({
    sessionId: "project-shell-1",
    cols: 100,
    rows: 24,
  });
  const shellKill = client.killProjectShellSession({
    sessionId: "project-shell-1",
  });
  const shellDrain = client.drainProjectShellSessionEvents({
    sessionId: "project-shell-1",
    limit: 20,
  });
  const executionStart = client.startExecutionProcess({
    processId: "execution-process-1",
    toolId: "tool-1",
    toolName: "shell",
    command: ["sh", "-c", "printf ok"],
    workingDirectory: "/workspace",
    approvalPolicy: "never",
    sandboxPolicy: "danger-full-access",
  });
  const executionWrite = client.writeExecutionProcessStdin({
    processId: "execution-process-1",
    data: "input\n",
  });
  const executionInterrupt = client.interruptExecutionProcess({
    processId: "execution-process-1",
  });
  const executionTerminate = client.terminateExecutionProcess({
    processId: "execution-process-1",
  });
  const executionStatus = client.readExecutionProcessStatus({
    processId: "execution-process-1",
  });
  const executionDrain = client.drainExecutionProcessOutput({
    processId: "execution-process-1",
    limit: 20,
  });

  assert.equal(listing.id, 1);
  assert.equal(listing.method, METHOD_FILE_SYSTEM_LIST_DIRECTORY);
  assert.deepEqual(listing.params, {
    path: "/workspace",
  });
  assert.equal(preview.id, 2);
  assert.equal(preview.method, METHOD_FILE_SYSTEM_READ_FILE_PREVIEW);
  assert.deepEqual(preview.params, {
    path: "/workspace/README.md",
    maxSize: 1024,
  });
  assert.equal(createFile.id, 3);
  assert.equal(createFile.method, METHOD_FILE_SYSTEM_CREATE_FILE);
  assert.deepEqual(createFile.params, {
    path: "/workspace/new.md",
  });
  assert.equal(createDirectory.id, 4);
  assert.equal(createDirectory.method, METHOD_FILE_SYSTEM_CREATE_DIRECTORY);
  assert.deepEqual(createDirectory.params, {
    path: "/workspace/new-dir",
  });
  assert.equal(renameFile.id, 5);
  assert.equal(renameFile.method, METHOD_FILE_SYSTEM_RENAME_FILE);
  assert.deepEqual(renameFile.params, {
    oldPath: "/workspace/new.md",
    newPath: "/workspace/renamed.md",
  });
  assert.equal(deleteFile.id, 6);
  assert.equal(deleteFile.method, METHOD_FILE_SYSTEM_DELETE_FILE);
  assert.deepEqual(deleteFile.params, {
    path: "/workspace/renamed.md",
    recursive: false,
  });
  assert.equal(gitStatus.id, 7);
  assert.equal(gitStatus.method, METHOD_PROJECT_GIT_STATUS);
  assert.deepEqual(gitStatus.params, {
    rootPath: "/workspace",
  });
  assert.equal(gitDiff.id, 8);
  assert.equal(gitDiff.method, METHOD_PROJECT_GIT_DIFF);
  assert.deepEqual(gitDiff.params, {
    rootPath: "/workspace",
    contextLines: 5,
    base: "staged",
    commitSha: "abc123",
  });
  assert.equal(gitCommits.id, 9);
  assert.equal(gitCommits.method, METHOD_PROJECT_GIT_COMMITS_LIST);
  assert.deepEqual(gitCommits.params, {
    rootPath: "/workspace",
    limit: 12,
  });
  assert.equal(gitCheckout.id, 10);
  assert.equal(gitCheckout.method, METHOD_PROJECT_GIT_BRANCH_CHECKOUT);
  assert.deepEqual(gitCheckout.params, {
    rootPath: "/workspace",
    branch: "feature/demo",
  });
  assert.equal(gitCreateBranch.id, 11);
  assert.equal(gitCreateBranch.method, METHOD_PROJECT_GIT_BRANCH_CREATE);
  assert.deepEqual(gitCreateBranch.params, {
    rootPath: "/workspace",
    branch: "feature/new",
  });
  assert.equal(gitCreateWorktree.id, 12);
  assert.equal(gitCreateWorktree.method, METHOD_PROJECT_GIT_WORKTREE_CREATE);
  assert.deepEqual(gitCreateWorktree.params, {
    rootPath: "/workspace",
    name: "agent-demo",
    baseBranch: "main",
  });
  assert.equal(shellStart.id, 13);
  assert.equal(shellStart.method, METHOD_PROJECT_SHELL_SESSION_START);
  assert.deepEqual(shellStart.params, {
    rootPath: "/workspace",
    cols: 120,
    rows: 16,
  });
  assert.equal(shellWrite.id, 14);
  assert.equal(shellWrite.method, METHOD_PROJECT_SHELL_SESSION_WRITE);
  assert.deepEqual(shellWrite.params, {
    sessionId: "project-shell-1",
    data: "pwd\r",
  });
  assert.equal(shellResize.id, 15);
  assert.equal(shellResize.method, METHOD_PROJECT_SHELL_SESSION_RESIZE);
  assert.deepEqual(shellResize.params, {
    sessionId: "project-shell-1",
    cols: 100,
    rows: 24,
  });
  assert.equal(shellKill.id, 16);
  assert.equal(shellKill.method, METHOD_PROJECT_SHELL_SESSION_KILL);
  assert.deepEqual(shellKill.params, {
    sessionId: "project-shell-1",
  });
  assert.equal(shellDrain.id, 17);
  assert.equal(shellDrain.method, METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS);
  assert.deepEqual(shellDrain.params, {
    sessionId: "project-shell-1",
    limit: 20,
  });
  assert.equal(executionStart.id, 18);
  assert.equal(executionStart.method, METHOD_EXECUTION_PROCESS_START);
  assert.deepEqual(executionStart.params, {
    processId: "execution-process-1",
    toolId: "tool-1",
    toolName: "shell",
    command: ["sh", "-c", "printf ok"],
    workingDirectory: "/workspace",
    approvalPolicy: "never",
    sandboxPolicy: "danger-full-access",
  });
  assert.equal(executionWrite.id, 19);
  assert.equal(executionWrite.method, METHOD_EXECUTION_PROCESS_WRITE_STDIN);
  assert.deepEqual(executionWrite.params, {
    processId: "execution-process-1",
    data: "input\n",
  });
  assert.equal(executionInterrupt.id, 20);
  assert.equal(executionInterrupt.method, METHOD_EXECUTION_PROCESS_INTERRUPT);
  assert.deepEqual(executionInterrupt.params, {
    processId: "execution-process-1",
  });
  assert.equal(executionTerminate.id, 21);
  assert.equal(executionTerminate.method, METHOD_EXECUTION_PROCESS_TERMINATE);
  assert.deepEqual(executionTerminate.params, {
    processId: "execution-process-1",
  });
  assert.equal(executionStatus.id, 22);
  assert.equal(executionStatus.method, METHOD_EXECUTION_PROCESS_STATUS);
  assert.deepEqual(executionStatus.params, {
    processId: "execution-process-1",
  });
  assert.equal(executionDrain.id, 23);
  assert.equal(executionDrain.method, METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT);
  assert.deepEqual(executionDrain.params, {
    processId: "execution-process-1",
    limit: 20,
  });
});

test("builds connect deep link requests with current methods", () => {
  const client = new AppServerClient();

  const connect = client.resolveConnectDeepLink({
    url: "lime://connect?relay=relay-one&key=sk-relay-key",
  });
  const open = client.resolveConnectOpenDeepLink({
    url: "lime://open?kind=skill&slug=viral-content-breakdown&action=install",
  });
  const replay = client.replayAction({
    sessionId: "sess_action",
    requestId: "req_confirm_1",
  });
  const save = client.saveConnectRelayApiKey({
    relayId: "relay-one",
    apiKey: "sk-relay-key",
    name: "Relay Key",
  });
  const callback = client.sendConnectCallback({
    relayId: "relay-one",
    apiKey: "sk-relay-key",
    status: "success",
    refCode: "ref-001",
  });
  const importScan = client.scanConversationImportSource({
    sourceClient: "codex",
    sourceRoot: "/Users/example/.codex",
    projectPath: "/workspace/lime",
    query: "runtime",
    includeArchived: true,
    limit: 20,
  });
  const importPreview = client.previewConversationImportThread({
    sourceClient: "codex",
    sourceRoot: "/Users/example/.codex",
    sourceThreadId: "thread-1",
    limit: 10,
  });

  assert.equal(connect.id, 1);
  assert.equal(connect.method, METHOD_CONNECT_DEEP_LINK_RESOLVE);
  assert.deepEqual(connect.params, {
    url: "lime://connect?relay=relay-one&key=sk-relay-key",
  });
  assert.equal(open.id, 2);
  assert.equal(open.method, METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE);
  assert.deepEqual(open.params, {
    url: "lime://open?kind=skill&slug=viral-content-breakdown&action=install",
  });
  assert.equal(replay.id, 3);
  assert.equal(replay.method, METHOD_AGENT_SESSION_ACTION_REPLAY);
  assert.deepEqual(replay.params, {
    sessionId: "sess_action",
    requestId: "req_confirm_1",
  });
  assert.equal(save.id, 4);
  assert.equal(save.method, METHOD_CONNECT_RELAY_API_KEY_SAVE);
  assert.deepEqual(save.params, {
    relayId: "relay-one",
    apiKey: "sk-relay-key",
    name: "Relay Key",
  });
  assert.equal(callback.id, 5);
  assert.equal(callback.method, METHOD_CONNECT_CALLBACK_SEND);
  assert.deepEqual(callback.params, {
    relayId: "relay-one",
    apiKey: "sk-relay-key",
    status: "success",
    refCode: "ref-001",
  });
  assert.equal(importScan.id, 6);
  assert.equal(importScan.method, METHOD_CONVERSATION_IMPORT_SOURCE_SCAN);
  assert.deepEqual(importScan.params, {
    sourceClient: "codex",
    sourceRoot: "/Users/example/.codex",
    projectPath: "/workspace/lime",
    query: "runtime",
    includeArchived: true,
    limit: 20,
  });
  assert.equal(importPreview.id, 7);
  assert.equal(importPreview.method, METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW);
  assert.deepEqual(importPreview.params, {
    sourceClient: "codex",
    sourceRoot: "/Users/example/.codex",
    sourceThreadId: "thread-1",
    limit: 10,
  });
  const importCommit = client.commitConversationImportThread({
    sourceClient: "codex",
    sourceRoot: "/Users/example/.codex",
    sourceThreadId: "thread-1",
    workspaceId: "workspace-1",
    confirmed: true,
  });
  assert.equal(importCommit.id, 8);
  assert.equal(importCommit.method, METHOD_CONVERSATION_IMPORT_THREAD_COMMIT);
  assert.deepEqual(importCommit.params, {
    sourceClient: "codex",
    sourceRoot: "/Users/example/.codex",
    sourceThreadId: "thread-1",
    workspaceId: "workspace-1",
    confirmed: true,
  });
  const importRuntimeEvents = client.readConversationImportRuntimeEvents({
    sessionId: "sess-imported",
    offset: 80,
    limit: 20,
    turnIndex: 0,
    eventType: "command.started",
  });
  assert.equal(importRuntimeEvents.id, 9);
  assert.equal(
    importRuntimeEvents.method,
    METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
  );
  assert.deepEqual(importRuntimeEvents.params, {
    sessionId: "sess-imported",
    offset: 80,
    limit: 20,
    turnIndex: 0,
    eventType: "command.started",
  });
});

test("builds evidence export requests with optional scope flags and runtime export requests", () => {
  const client = new AppServerClient();

  const evidence = client.exportEvidence({
    sessionId: "sess_1",
    turnId: "turn_1",
    includeEvents: true,
    includeArtifacts: false,
    includeEvidencePack: false,
  });
  const handoff = client.exportHandoffBundle({
    sessionId: "sess_1",
    locale: "zh-CN",
  });
  const replay = client.exportReplayCase({
    sessionId: "sess_1",
    locale: "en-US",
  });
  const analysis = client.exportAnalysisHandoff({
    sessionId: "sess_1",
  });
  const review = client.exportReviewDecisionTemplate({
    sessionId: "sess_1",
  });
  const save = client.saveReviewDecision({
    sessionId: "sess_1",
    decisionStatus: "accepted",
    decisionSummary: "ok",
    chosenFixStrategy: "current path",
    riskLevel: "low",
    riskTags: ["runtime"],
    humanReviewer: "reviewer",
    followupActions: ["follow up"],
    regressionRequirements: ["npm run test:contracts"],
    notes: "",
  });

  assert.equal(evidence.id, 1);
  assert.equal(evidence.method, METHOD_EVIDENCE_EXPORT);
  assert.deepEqual(evidence.params, {
    sessionId: "sess_1",
    turnId: "turn_1",
    includeEvents: true,
    includeArtifacts: false,
    includeEvidencePack: false,
  });
  assert.equal(handoff.id, 2);
  assert.equal(handoff.method, METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT);
  assert.deepEqual(handoff.params, {
    sessionId: "sess_1",
    locale: "zh-CN",
  });
  assert.equal(replay.id, 3);
  assert.equal(replay.method, METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT);
  assert.deepEqual(replay.params, {
    sessionId: "sess_1",
    locale: "en-US",
  });
  assert.equal(analysis.id, 4);
  assert.equal(analysis.method, METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT);
  assert.deepEqual(analysis.params, {
    sessionId: "sess_1",
  });
  assert.equal(review.id, 5);
  assert.equal(
    review.method,
    METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
  );
  assert.deepEqual(review.params, {
    sessionId: "sess_1",
  });
  assert.equal(save.id, 6);
  assert.equal(save.method, METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE);
  assert.deepEqual(save.params, {
    sessionId: "sess_1",
    decisionStatus: "accepted",
    decisionSummary: "ok",
    chosenFixStrategy: "current path",
    riskLevel: "low",
    riskTags: ["runtime"],
    humanReviewer: "reviewer",
    followupActions: ["follow up"],
    regressionRequirements: ["npm run test:contracts"],
    notes: "",
  });
});

test("exports app-server method catalog with request and notification kinds", () => {
  assert.deepEqual(APP_SERVER_METHODS, [
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
    { method: METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL, kind: "request" },
    { method: METHOD_AGENT_APP_INSTALLED_UNINSTALL, kind: "request" },
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
    {
      method: METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY,
      kind: "request",
    },
    {
      method: METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
      kind: "request",
    },
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
    { method: METHOD_AGENT_SESSION_EVENT, kind: "notification" },
  ]);
  assert.equal(isAppServerRequestMethod(METHOD_INITIALIZE), true);
  assert.equal(isAppServerRequestMethod(METHOD_ARTIFACT_READ), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_FILE_SYSTEM_LIST_DIRECTORY),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_FILE_SYSTEM_READ_FILE_PREVIEW),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_FILE_SYSTEM_CREATE_FILE), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_FILE_SYSTEM_CREATE_DIRECTORY),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_FILE_SYSTEM_RENAME_FILE), true);
  assert.equal(isAppServerRequestMethod(METHOD_FILE_SYSTEM_DELETE_FILE), true);
  assert.equal(isAppServerRequestMethod(METHOD_PROJECT_GIT_STATUS), true);
  assert.equal(isAppServerRequestMethod(METHOD_PROJECT_GIT_DIFF), true);
  assert.equal(isAppServerRequestMethod(METHOD_PROJECT_GIT_COMMITS_LIST), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_GIT_BRANCH_CHECKOUT),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_GIT_BRANCH_CREATE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_GIT_WORKTREE_CREATE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_SHELL_SESSION_START),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_SHELL_SESSION_WRITE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_SHELL_SESSION_RESIZE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_SHELL_SESSION_KILL),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_EXECUTION_PROCESS_START), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_EXECUTION_PROCESS_WRITE_STDIN),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_EXECUTION_PROCESS_INTERRUPT),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_EXECUTION_PROCESS_TERMINATE),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_EXECUTION_PROCESS_STATUS), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_EVIDENCE_EXPORT), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(
      METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
    ),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_AGENT_SESSION_UPDATE), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_ARCHIVE_MANY),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_OBJECTIVE_READ),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_OBJECTIVE_SET),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_OBJECTIVE_CLEAR),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_WORKSPACE_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_SKILL_LIST), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_WORKSPACE_SKILL_BINDINGS_LIST),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_WORKSPACE_REGISTERED_SKILLS_LIST),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_AGENT_APP_INSTALLED_LIST), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_AGENT_APP_INSTALLED_SAVE), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_INSTALLED_DISABLED_SET),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_INSTALLED_UNINSTALL),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_AGENT_APP_SHELL_PREPARE), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_UI_RUNTIME_START),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_UI_RUNTIME_STATUS),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_APP_UI_RUNTIME_STOP),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_KNOWLEDGE_PACK_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_KNOWLEDGE_PACK_READ), true);
  assert.equal(isAppServerRequestMethod(METHOD_KNOWLEDGE_SOURCE_IMPORT), true);
  assert.equal(isAppServerRequestMethod(METHOD_KNOWLEDGE_PACK_COMPILE), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_KNOWLEDGE_PACK_DEFAULT_SET),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_KNOWLEDGE_PACK_STATUS_UPDATE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_KNOWLEDGE_CONTEXT_RESOLVE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AUTOMATION_SCHEDULER_CONFIG_READ),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AUTOMATION_SCHEDULER_STATUS),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_READ), true);
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_CREATE), true);
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_UPDATE), true);
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_DELETE), true);
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_RUN_NOW), true);
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_HEALTH), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_AUTOMATION_JOB_RUN_HISTORY),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AUTOMATION_SCHEDULE_PREVIEW),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_AUTOMATION_SCHEDULE_VALIDATE),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_STATUS_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_CREATE), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_UPDATE), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_DELETE), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_ENABLED_SET), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_MCP_SERVER_IMPORT_FROM_APP),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_OAUTH_LOGIN), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_START), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_SERVER_STOP), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_TOOL_LIST), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_MCP_TOOL_LIST_FOR_CONTEXT),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_MCP_TOOL_SEARCH), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_TOOL_CALL), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_MCP_TOOL_CALL_WITH_CALLER),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_MCP_PROMPT_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_PROMPT_GET), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_RESOURCE_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_MCP_RESOURCE_READ), true);
  assert.equal(isAppServerRequestMethod(METHOD_PROJECT_MEMORY_READ), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_CONNECT_DEEP_LINK_RESOLVE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_CONNECT_RELAY_API_KEY_SAVE),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_CONNECT_CALLBACK_SEND), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_CONVERSATION_IMPORT_SOURCE_SCAN),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW),
    true,
  );
  assert.equal(
    isAppServerRequestMethod(METHOD_CONVERSATION_IMPORT_THREAD_COMMIT),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_VOICE_INSTRUCTION_LIST), true);
  assert.equal(isAppServerRequestMethod(METHOD_VOICE_INSTRUCTION_SAVE), true);
  assert.equal(isAppServerRequestMethod(METHOD_VOICE_INSTRUCTION_DELETE), true);
  assert.equal(isAppServerRequestMethod(METHOD_VOICE_MODEL_DEFAULT_SET), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_AGENT_SESSION_TURN_START), true);
  assert.equal(
    isAppServerRequestMethod(METHOD_AGENT_SESSION_ACTION_RESPOND),
    true,
  );
  assert.equal(isAppServerRequestMethod(METHOD_INITIALIZED), false);
  assert.equal(isAppServerNotificationMethod(METHOD_INITIALIZED), true);
  assert.equal(isAppServerNotificationMethod(METHOD_AGENT_SESSION_EVENT), true);
  assert.equal(
    isAppServerNotificationMethod(METHOD_AGENT_SESSION_START),
    false,
  );
});

test("builds action respond requests for host action resolution", () => {
  const client = new AppServerClient();

  const response = client.respondAction({
    sessionId: "sess_external",
    requestId: "req_confirm_1",
    actionType: "tool_confirmation",
    confirmed: true,
    response: "allow",
    userData: {
      reason: "approved",
    },
    metadata: {
      source: "content-studio",
    },
    eventName: "agentSession/event/sess_external",
    actionScope: {
      sessionId: "sess_external",
      threadId: "thread_external",
      turnId: "turn_external",
    },
  });

  assert.equal(response.id, 1);
  assert.equal(response.method, METHOD_AGENT_SESSION_ACTION_RESPOND);
  assert.deepEqual(response.params, {
    sessionId: "sess_external",
    requestId: "req_confirm_1",
    actionType: "tool_confirmation",
    confirmed: true,
    response: "allow",
    userData: {
      reason: "approved",
    },
    metadata: {
      source: "content-studio",
    },
    eventName: "agentSession/event/sess_external",
    actionScope: {
      sessionId: "sess_external",
      threadId: "thread_external",
      turnId: "turn_external",
    },
  });
});

test("builds turn start requests with runtime queue flags", () => {
  const client = new AppServerClient();

  const turn = client.startTurn({
    sessionId: "sess_external",
    turnId: "turn_external",
    input: {
      text: "draft",
    },
    runtimeOptions: {
      capabilityId: "draft.write",
      stream: true,
      hostOptions: {
        adapter: "desktop",
      },
    },
    queueIfBusy: true,
    skipPreSubmitResume: true,
  });

  assert.equal(turn.id, 1);
  assert.equal(turn.method, METHOD_AGENT_SESSION_TURN_START);
  assert.equal(turn.params.turnId, "turn_external");
  assert.equal(turn.params.queueIfBusy, true);
  assert.equal(turn.params.skipPreSubmitResume, true);
  assert.equal(turn.params.runtimeOptions.capabilityId, "draft.write");
  assert.equal(turn.params.runtimeOptions.hostOptions.adapter, "desktop");
});

test("connection wraps request response flow and keeps async notifications", async () => {
  const sent = [];
  const inbound = [
    {
      method: METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-1",
          sequence: 1,
          sessionId: "sess_external",
          type: "message.delta",
          timestamp: "2026-06-04T00:00:00Z",
          payload: {
            text: "delta",
          },
        },
      },
    },
    {
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "sess_external",
          threadId: "thread_external",
          status: "accepted",
        },
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.startTurn({
    sessionId: "sess_external",
    input: {
      text: "draft",
    },
    queueIfBusy: true,
  });

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_TURN_START);
  assert.equal(sent[0].params.queueIfBusy, true);
  assert.equal(result.result.turn.turnId, "turn-1");
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].method, METHOD_AGENT_SESSION_EVENT);
  assert.equal(result.notifications[0].params.event.payload.text, "delta");
});

test("connection yields transport reads while one request is still pending", async () => {
  const sent = [];
  const inbound = [
    {
      id: 2,
      result: {
        sessions: [
          {
            sessionId: "sess_external",
            threadId: "thread_external",
            appId: "content-studio",
            status: "running",
            createdAt: "2026-06-04T00:00:00Z",
            updatedAt: "2026-06-04T00:00:01Z",
          },
        ],
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    nextMessage(timeoutMs = 30_000) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const message = inbound.shift();
          if (message) {
            resolve(message);
            return;
          }
          reject(
            new Error(
              `timed out waiting for app-server message after ${timeoutMs}ms`,
            ),
          );
        }, 1);
      });
    },
  });

  void connection
    .startTurn(
      {
        sessionId: "sess_external",
        input: {
          text: "draft",
        },
        queueIfBusy: true,
      },
      { timeoutMs: 1_000 },
    )
    .catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 5));

  const result = await connection.listSessions({}, { timeoutMs: 100 });

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_TURN_START);
  assert.equal(sent[1].method, METHOD_AGENT_SESSION_LIST);
  assert.equal(result.id, 2);
  assert.equal(result.result.sessions[0].sessionId, "sess_external");
});

test("connection detaches streaming request after first notification and drops its late final response", async () => {
  const sent = [];
  const inbound = [
    {
      method: METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-turn-started",
          sequence: 1,
          sessionId: "sess_external",
          turnId: "turn_external",
          type: "turn.started",
          timestamp: "2026-06-04T00:00:00Z",
          payload: {},
        },
      },
    },
    {
      id: 1,
      result: {
        turn: {
          turnId: "turn_external",
          sessionId: "sess_external",
          threadId: "thread_external",
          status: "accepted",
        },
      },
    },
    {
      id: 2,
      result: {
        sessions: [
          {
            sessionId: "sess_external",
            threadId: "thread_external",
            appId: "content-studio",
            status: "running",
            createdAt: "2026-06-04T00:00:00Z",
            updatedAt: "2026-06-04T00:00:01Z",
          },
        ],
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const turnRequest = connection.client.startTurn({
    sessionId: "sess_external",
    turnId: "turn_external",
    input: {
      text: "draft",
    },
    queueIfBusy: true,
  });
  const start = await connection.requestUntilFirstNotificationOrResponse(
    turnRequest,
    METHOD_AGENT_SESSION_TURN_START,
    { timeoutMs: 100 },
  );
  const list = await connection.listSessions({}, { timeoutMs: 100 });

  assert.equal(start.completed, false);
  assert.equal(start.notifications.length, 1);
  assert.equal(sent[0].method, METHOD_AGENT_SESSION_TURN_START);
  assert.equal(sent[1].method, METHOD_AGENT_SESSION_LIST);
  assert.equal(list.id, 2);
  assert.equal(list.result.sessions[0].sessionId, "sess_external");
});

test("ordinary request timeout is not extended forever by streaming notifications", async () => {
  const sent = [];
  let sequence = 0;
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      await new Promise((resolve) => setTimeout(resolve, 1));
      sequence += 1;
      return {
        method: METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: `evt-${sequence}`,
            sequence,
            sessionId: "sess_external",
            turnId: "turn_external",
            type: "message.delta",
            timestamp: "2026-06-04T00:00:01Z",
            payload: { text: "still streaming" },
          },
        },
      };
    },
  });

  await assert.rejects(
    () => connection.listSessions({}, { timeoutMs: 100 }),
    /timed out waiting for app-server message after 100ms/,
  );

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_LIST);
  assert.ok(sequence > 0);
});

test("stdio sidecar stdin EPIPE rejects pending request instead of escaping as uncaught exception", async () => {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    },
  });
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    signalCode: null,
    kill() {
      return true;
    },
  });
  const sidecar = new AppServerSidecar(child);
  const connection = new AppServerConnection(sidecar);

  await assert.rejects(
    () => connection.listSessions({ limit: 1 }, { timeoutMs: 1_000 }),
    /app-server sidecar stdin is closed/,
  );
});

test("agent runtime client facade delegates to current App Server session methods", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "sess_external",
          threadId: "thread_external",
          status: "accepted",
        },
      },
    },
    {
      id: 2,
      result: {
        session: {
          sessionId: "sess_external",
          threadId: "thread_external",
          appId: "content-studio",
          status: "running",
          createdAt: "2026-06-04T00:00:00Z",
          updatedAt: "2026-06-04T00:00:01Z",
        },
        turns: [],
      },
    },
    {
      id: 3,
      result: {},
    },
    {
      id: 4,
      result: {},
    },
    {
      id: 5,
      result: {
        session: {
          sessionId: "sess_external",
          threadId: "thread_external",
          appId: "content-studio",
          status: "completed",
          createdAt: "2026-06-04T00:00:00Z",
          updatedAt: "2026-06-04T00:00:02Z",
        },
        turns: [],
        events: [],
        artifacts: [],
        exportedAt: "2026-06-04T00:00:03Z",
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });
  const runtime = createAgentRuntimeClient(connection);

  const start = await runtime.startTurn({
    sessionId: "sess_external",
    input: { text: "写草稿" },
  });
  const read = await runtime.readThread({
    sessionId: "sess_external",
  });
  await runtime.respondAction({
    sessionId: "sess_external",
    requestId: "action-1",
    actionType: "ask_user",
    confirmed: true,
    response: "继续",
  });
  await runtime.cancelTurn({
    sessionId: "sess_external",
    turnId: "turn-1",
  });
  const evidence = await runtime.exportEvidence({
    sessionId: "sess_external",
    includeEvents: true,
  });

  assert.deepEqual(
    sent.map((message) => message.method),
    [
      METHOD_AGENT_SESSION_TURN_START,
      METHOD_AGENT_SESSION_READ,
      METHOD_AGENT_SESSION_ACTION_RESPOND,
      METHOD_AGENT_SESSION_TURN_CANCEL,
      METHOD_EVIDENCE_EXPORT,
    ],
  );
  assert.equal(start.result.turn.turnId, "turn-1");
  assert.equal(read.result.session.sessionId, "sess_external");
  assert.equal(evidence.result.exportedAt, "2026-06-04T00:00:03Z");
});

test("agent runtime client facade subscribes to agent session event notifications", async () => {
  const notification = {
    method: METHOD_AGENT_SESSION_EVENT,
    params: {
      event: {
        eventId: "evt-1",
        sequence: 1,
        sessionId: "sess_external",
        turnId: "turn-1",
        type: "message.delta",
        timestamp: "2026-06-04T00:00:00Z",
        payload: { text: "delta" },
      },
    },
  };
  const runtime = new AppServerAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        return notification;
      },
    }),
  );
  const received = [];
  const subscription = runtime.subscribeEvents((event, message) => {
    received.push({ event, message });
  });

  const dispatched = await runtime.dispatchEvent(notification);
  const next = await runtime.nextEvent();
  subscription.unsubscribe();
  await runtime.dispatchEvent(notification);

  assert.equal(dispatched, true);
  assert.equal(next.params.event.payload.text, "delta");
  assert.equal(received.length, 2);
  assert.equal(received[0].event.eventId, "evt-1");
  assert.equal(received[0].message.method, METHOD_AGENT_SESSION_EVENT);
});

test("connection request errors preserve streamed notifications and response context", async () => {
  const sent = [];
  const inbound = [
    {
      method: METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-1",
          sequence: 1,
          sessionId: "sess_external",
          turnId: "turn_external",
          type: "message.delta",
          timestamp: "2026-06-04T00:00:00Z",
          payload: {
            text: "partial",
          },
        },
      },
    },
    {
      method: METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-2",
          sequence: 2,
          sessionId: "sess_external",
          turnId: "turn_external",
          type: "turn.failed",
          timestamp: "2026-06-04T00:00:01Z",
          payload: {
            message: "external backend crashed after partial output",
          },
        },
      },
    },
    {
      id: 1,
      error: {
        code: ERROR_CODES.runtimeError,
        message: "external backend crashed after partial output",
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  await assert.rejects(
    connection.startTurn({
      sessionId: "sess_external",
      turnId: "turn_external",
      input: {
        text: "draft",
      },
    }),
    (error) => {
      assert.equal(error instanceof AppServerRequestError, true);
      assert.equal(error.method, METHOD_AGENT_SESSION_TURN_START);
      assert.equal(error.response.error.code, ERROR_CODES.runtimeError);
      assert.equal(error.notifications.length, 2);
      assert.equal(error.notifications[0].params.event.type, "message.delta");
      assert.equal(error.notifications[1].params.event.type, "turn.failed");
      assert.match(
        error.notifications[1].params.event.payload.message,
        /partial output/,
      );
      assert.equal(error.messages.length, 3);
      assert.equal(
        error.messages[2].error.message,
        "external backend crashed after partial output",
      );
      return true;
    },
  );

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_TURN_START);
});

test("connection keeps session archive failures fail-closed", async () => {
  const sent = [];
  const archiveFailure =
    "agentSession/update archived is only supported for persisted sessions";
  const inbound = [
    {
      id: 1,
      error: {
        code: ERROR_CODES.runtimeError,
        message: archiveFailure,
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  await assert.rejects(
    connection.updateSession({
      sessionId: "sess_memory",
      archived: true,
    }),
    (error) => {
      assert.equal(error instanceof AppServerRequestError, true);
      assert.equal(error.method, METHOD_AGENT_SESSION_UPDATE);
      assert.equal(error.response.id, 1);
      assert.equal(error.response.error.code, ERROR_CODES.runtimeError);
      assert.equal(error.response.error.message, archiveFailure);
      assert.equal(error.notifications.length, 0);
      assert.equal(error.messages.length, 1);
      return true;
    },
  );

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_UPDATE);
  assert.deepEqual(sent[0].params, {
    sessionId: "sess_memory",
    archived: true,
  });
});

test("connection wraps capability list response", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        capabilities: [
          {
            id: "agent.session",
            title: "Agent Session",
            methods: [
              METHOD_AGENT_SESSION_START,
              METHOD_AGENT_SESSION_TURN_START,
            ],
          },
        ],
        runtimeCapabilityManifest: {
          schemaVersion: "lime-runtime-capability-manifest/v0.1",
          runtimeId: "app-server",
          sessionId: "sess_external",
          generatedAt: "2026-06-12T00:00:00.000Z",
          capabilities: [
            {
              id: "transport.jsonrpc",
              status: "supported",
              scope: "runtime",
              title: "Agent Session",
            },
          ],
        },
        nextCursor: "1",
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.listCapabilities({
    appId: "content-studio",
    workspaceId: "default",
    sessionId: "sess_external",
    limit: 1,
  });

  assert.equal(sent[0].method, METHOD_CAPABILITY_LIST);
  assert.deepEqual(sent[0].params, {
    appId: "content-studio",
    workspaceId: "default",
    sessionId: "sess_external",
    limit: 1,
  });
  assert.equal(result.result.capabilities[0].id, "agent.session");
  assert.equal(
    result.result.runtimeCapabilityManifest.capabilities[0].id,
    "transport.jsonrpc",
  );
  assert.equal(
    result.result.capabilities[0].methods[0],
    METHOD_AGENT_SESSION_START,
  );
  assert.equal(result.result.nextCursor, "1");
});

test("connection wraps artifact read response", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        artifacts: [
          {
            artifactRef: "artifact-document:req-1",
            eventId: "evt-1",
            sequence: 7,
            turnId: "turn_1",
            artifactId: "req-1",
            path: ".lime/artifacts/report.md",
            title: "Report",
            kind: "document",
            status: "ready",
            content: "# Report",
            contentStatus: "available",
            metadata: {
              version: 2,
            },
          },
        ],
        nextCursor: "1",
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.readArtifacts({
    sessionId: "sess_1",
    artifactRef: "artifact-document:req-1",
    includeContent: true,
    limit: 1,
  });

  assert.equal(sent[0].method, METHOD_ARTIFACT_READ);
  assert.deepEqual(sent[0].params, {
    sessionId: "sess_1",
    artifactRef: "artifact-document:req-1",
    includeContent: true,
    limit: 1,
  });
  assert.equal(
    result.result.artifacts[0].artifactRef,
    "artifact-document:req-1",
  );
  assert.equal(result.result.artifacts[0].content, "# Report");
  assert.equal(result.result.artifacts[0].contentStatus, "available");
  assert.equal(result.result.artifacts[0].metadata.version, 2);
  assert.equal(result.result.nextCursor, "1");
});

test("connection wraps file system responses", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        path: "/workspace",
        parentPath: "/",
        entries: [
          {
            name: "README.md",
            path: "/workspace/README.md",
            isDir: false,
            size: 6,
            modifiedAt: 1,
            isHidden: false,
            isSymlink: false,
          },
        ],
        error: null,
      },
    },
    {
      id: 2,
      result: {
        path: "/workspace/README.md",
        content: "# Lime",
        isBinary: false,
        size: 6,
        error: null,
      },
    },
    {
      id: 3,
      result: {},
    },
    {
      id: 4,
      result: {},
    },
    {
      id: 5,
      result: {},
    },
    {
      id: 6,
      result: {},
    },
    {
      id: 7,
      result: {
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        currentBranch: "main",
        branches: ["main"],
        uncommittedFileCount: 0,
      },
    },
    {
      id: 8,
      result: {
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        patch: "diff --git a/README.md b/README.md\n+hello",
        uncommittedFileCount: 1,
      },
    },
    {
      id: 9,
      result: {
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        commits: [
          {
            sha: "abc123456789",
            shortSha: "abc1234",
            subject: "demo commit",
            authorName: "Test User",
            authorEmail: "test@example.com",
            committedAt: "2026-06-14T10:00:00Z",
          },
        ],
      },
    },
    {
      id: 10,
      result: {
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        currentBranch: "feature/demo",
        branches: ["feature/demo", "main"],
        uncommittedFileCount: 0,
      },
    },
    {
      id: 11,
      result: {
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        currentBranch: "feature/new",
        branches: ["feature/new", "main"],
        uncommittedFileCount: 0,
      },
    },
    {
      id: 12,
      result: {
        worktreePath: "/workspace-worktree",
        branch: "main",
        status: {
          rootPath: "/workspace-worktree",
          repositoryRoot: "/workspace",
          hasGitRepository: true,
          currentBranch: "abcdef0",
          branches: ["main"],
          uncommittedFileCount: 0,
        },
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.listDirectory({
    path: "/workspace",
  });
  const previewResult = await connection.readFilePreview({
    path: "/workspace/README.md",
    maxSize: 1024,
  });
  const createFileResult = await connection.createFile({
    path: "/workspace/new.md",
  });
  const createDirectoryResult = await connection.createDirectory({
    path: "/workspace/new-dir",
  });
  const renameFileResult = await connection.renameFile({
    oldPath: "/workspace/new.md",
    newPath: "/workspace/renamed.md",
  });
  const deleteFileResult = await connection.deleteFile({
    path: "/workspace/renamed.md",
    recursive: false,
  });
  const gitStatusResult = await connection.readProjectGitStatus({
    rootPath: "/workspace",
  });
  const gitDiffResult = await connection.readProjectGitDiff({
    rootPath: "/workspace",
    contextLines: 5,
    base: "branch",
  });
  const gitCommitsResult = await connection.listProjectGitCommits({
    rootPath: "/workspace",
    limit: 20,
  });
  const gitCheckoutResult = await connection.checkoutProjectGitBranch({
    rootPath: "/workspace",
    branch: "feature/demo",
  });
  const gitCreateBranchResult = await connection.createProjectGitBranch({
    rootPath: "/workspace",
    branch: "feature/new",
  });
  const gitCreateWorktreeResult = await connection.createProjectGitWorktree({
    rootPath: "/workspace",
    name: "agent-demo",
    baseBranch: "main",
  });

  assert.equal(sent[0].method, METHOD_FILE_SYSTEM_LIST_DIRECTORY);
  assert.deepEqual(sent[0].params, {
    path: "/workspace",
  });
  assert.equal(sent[1].method, METHOD_FILE_SYSTEM_READ_FILE_PREVIEW);
  assert.deepEqual(sent[1].params, {
    path: "/workspace/README.md",
    maxSize: 1024,
  });
  assert.equal(sent[2].method, METHOD_FILE_SYSTEM_CREATE_FILE);
  assert.deepEqual(sent[2].params, {
    path: "/workspace/new.md",
  });
  assert.equal(sent[3].method, METHOD_FILE_SYSTEM_CREATE_DIRECTORY);
  assert.deepEqual(sent[3].params, {
    path: "/workspace/new-dir",
  });
  assert.equal(sent[4].method, METHOD_FILE_SYSTEM_RENAME_FILE);
  assert.deepEqual(sent[4].params, {
    oldPath: "/workspace/new.md",
    newPath: "/workspace/renamed.md",
  });
  assert.equal(sent[5].method, METHOD_FILE_SYSTEM_DELETE_FILE);
  assert.deepEqual(sent[5].params, {
    path: "/workspace/renamed.md",
    recursive: false,
  });
  assert.equal(sent[6].method, METHOD_PROJECT_GIT_STATUS);
  assert.deepEqual(sent[6].params, {
    rootPath: "/workspace",
  });
  assert.equal(sent[7].method, METHOD_PROJECT_GIT_DIFF);
  assert.deepEqual(sent[7].params, {
    rootPath: "/workspace",
    contextLines: 5,
    base: "branch",
  });
  assert.equal(sent[8].method, METHOD_PROJECT_GIT_COMMITS_LIST);
  assert.deepEqual(sent[8].params, {
    rootPath: "/workspace",
    limit: 20,
  });
  assert.equal(sent[9].method, METHOD_PROJECT_GIT_BRANCH_CHECKOUT);
  assert.deepEqual(sent[9].params, {
    rootPath: "/workspace",
    branch: "feature/demo",
  });
  assert.equal(sent[10].method, METHOD_PROJECT_GIT_BRANCH_CREATE);
  assert.deepEqual(sent[10].params, {
    rootPath: "/workspace",
    branch: "feature/new",
  });
  assert.equal(sent[11].method, METHOD_PROJECT_GIT_WORKTREE_CREATE);
  assert.deepEqual(sent[11].params, {
    rootPath: "/workspace",
    name: "agent-demo",
    baseBranch: "main",
  });
  assert.equal(result.result.entries[0].name, "README.md");
  assert.equal(previewResult.result.content, "# Lime");
  assert.deepEqual(createFileResult.result, {});
  assert.deepEqual(createDirectoryResult.result, {});
  assert.deepEqual(renameFileResult.result, {});
  assert.deepEqual(deleteFileResult.result, {});
  assert.equal(gitStatusResult.result.currentBranch, "main");
  assert.equal(gitDiffResult.result.patch.includes("diff --git"), true);
  assert.equal(gitCommitsResult.result.commits[0].shortSha, "abc1234");
  assert.equal(gitCheckoutResult.result.currentBranch, "feature/demo");
  assert.equal(gitCreateBranchResult.result.currentBranch, "feature/new");
  assert.equal(
    gitCreateWorktreeResult.result.worktreePath,
    "/workspace-worktree",
  );
});

test("connection wraps evidence export response", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        session: {
          sessionId: "sess_1",
          threadId: "thread_1",
          appId: "content-studio",
          status: "running",
          createdAt: "2026-06-05T00:00:00.000Z",
          updatedAt: "2026-06-05T00:00:01.000Z",
        },
        turns: [
          {
            turnId: "turn_1",
            sessionId: "sess_1",
            threadId: "thread_1",
            status: "accepted",
          },
        ],
        events: [
          {
            eventId: "evt-1",
            sequence: 1,
            sessionId: "sess_1",
            threadId: "thread_1",
            turnId: "turn_1",
            type: "message.delta",
            timestamp: "2026-06-05T00:00:01.000Z",
            payload: {
              text: "draft",
            },
          },
        ],
        artifacts: [
          {
            artifactRef: "artifact-document:req-1",
            eventId: "evt-2",
            sequence: 2,
            turnId: "turn_1",
            artifactId: "req-1",
            path: ".lime/artifacts/report.md",
            contentStatus: "notRequested",
          },
        ],
        exportedAt: "2026-06-05T00:00:02.000Z",
        evidencePack: {
          packRelativeRoot: ".lime/harness/sessions/sess_1/evidence",
          packAbsoluteRoot: "/workspace/.lime/harness/sessions/sess_1/evidence",
          exportedAt: "2026-06-05T00:00:03.000Z",
          threadStatus: "running",
          latestTurnStatus: "accepted",
          turnCount: 1,
          itemCount: 3,
          pendingRequestCount: 0,
          queuedTurnCount: 0,
          recentArtifactCount: 1,
          knownGaps: ["gui_smoke_not_run"],
          observabilitySummary: {
            schema_version: "runtime-evidence-pack.v1",
          },
          completionAuditSummary: {
            decision: "in_progress",
          },
          artifacts: [
            {
              kind: "summary",
              title: "Evidence Summary",
              relativePath: ".lime/harness/sessions/sess_1/evidence/summary.md",
              bytes: 128,
            },
          ],
        },
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.exportEvidence({
    sessionId: "sess_1",
    turnId: "turn_1",
    includeEvents: true,
    includeArtifacts: true,
    includeEvidencePack: true,
  });

  assert.equal(sent[0].method, METHOD_EVIDENCE_EXPORT);
  assert.deepEqual(sent[0].params, {
    sessionId: "sess_1",
    turnId: "turn_1",
    includeEvents: true,
    includeArtifacts: true,
    includeEvidencePack: true,
  });
  assert.equal(result.result.session.sessionId, "sess_1");
  assert.equal(result.result.turns[0].turnId, "turn_1");
  assert.equal(result.result.events[0].type, "message.delta");
  assert.equal(
    result.result.artifacts[0].artifactRef,
    "artifact-document:req-1",
  );
  assert.equal(result.result.artifacts[0].contentStatus, "notRequested");
  assert.equal(result.result.exportedAt, "2026-06-05T00:00:02.000Z");
  assert.equal(result.result.threadStatus, undefined);
  assert.equal(result.result.evidencePack.threadStatus, "running");
  assert.equal(result.result.evidencePack.latestTurnStatus, "accepted");
  assert.equal(
    result.result.evidencePack.completionAuditSummary.decision,
    "in_progress",
  );
  assert.equal(result.result.evidencePack.artifacts[0].bytes, 128);
});

test("connection wraps handoff bundle export response", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        workspaceId: "workspace-main",
        workspaceRoot: "/workspace",
        bundleRelativeRoot: ".lime/harness/sessions/sess_1",
        bundleAbsoluteRoot: "/workspace/.lime/harness/sessions/sess_1",
        exportedAt: "2026-06-05T00:00:04.000Z",
        threadStatus: "running",
        latestTurnStatus: "accepted",
        pendingRequestCount: 0,
        queuedTurnCount: 0,
        activeSubagentCount: 1,
        todoTotal: 3,
        todoPending: 1,
        todoInProgress: 1,
        todoCompleted: 1,
        artifacts: [
          {
            kind: "handoff",
            title: "Handoff",
            relativePath: ".lime/harness/sessions/sess_1/handoff.md",
            absolutePath: "/workspace/.lime/harness/sessions/sess_1/handoff.md",
            bytes: 256,
          },
        ],
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.exportHandoffBundle({
    sessionId: "sess_1",
    locale: "zh-CN",
  });

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT);
  assert.deepEqual(sent[0].params, {
    sessionId: "sess_1",
    locale: "zh-CN",
  });
  assert.equal(result.result.sessionId, "sess_1");
  assert.equal(result.result.threadId, "thread_1");
  assert.equal(result.result.threadStatus, "running");
  assert.equal(result.result.latestTurnStatus, "accepted");
  assert.equal(result.result.todoTotal, 3);
  assert.equal(result.result.artifacts[0].kind, "handoff");
  assert.equal(
    result.result.artifacts[0].absolutePath,
    "/workspace/.lime/harness/sessions/sess_1/handoff.md",
  );
});

test("connection wraps derived agent session export responses", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        workspaceRoot: "/workspace",
        replayRelativeRoot: ".lime/harness/sessions/sess_1/replay",
        replayAbsoluteRoot: "/workspace/.lime/harness/sessions/sess_1/replay",
        handoffBundleRelativeRoot: ".lime/harness/sessions/sess_1",
        evidencePackRelativeRoot: ".lime/harness/sessions/sess_1/evidence",
        exportedAt: "2026-06-05T00:00:05.000Z",
        threadStatus: "running",
        pendingRequestCount: 0,
        queuedTurnCount: 0,
        linkedHandoffArtifactCount: 1,
        linkedEvidenceArtifactCount: 2,
        recentArtifactCount: 2,
        artifacts: [],
      },
    },
    {
      id: 2,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        workspaceRoot: "/workspace",
        sanitizedWorkspaceRoot: "/workspace",
        analysisRelativeRoot: ".lime/harness/sessions/sess_1/analysis",
        analysisAbsoluteRoot:
          "/workspace/.lime/harness/sessions/sess_1/analysis",
        handoffBundleRelativeRoot: ".lime/harness/sessions/sess_1",
        evidencePackRelativeRoot: ".lime/harness/sessions/sess_1/evidence",
        replayCaseRelativeRoot: ".lime/harness/sessions/sess_1/replay",
        exportedAt: "2026-06-05T00:00:06.000Z",
        threadStatus: "running",
        pendingRequestCount: 0,
        queuedTurnCount: 0,
        title: "Analysis",
        copyPrompt: "Review current evidence.",
        artifacts: [],
      },
    },
    {
      id: 3,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        workspaceRoot: "/workspace",
        reviewRelativeRoot: ".lime/harness/sessions/sess_1/review",
        reviewAbsoluteRoot: "/workspace/.lime/harness/sessions/sess_1/review",
        analysisRelativeRoot: ".lime/harness/sessions/sess_1/analysis",
        analysisAbsoluteRoot:
          "/workspace/.lime/harness/sessions/sess_1/analysis",
        handoffBundleRelativeRoot: ".lime/harness/sessions/sess_1",
        evidencePackRelativeRoot: ".lime/harness/sessions/sess_1/evidence",
        replayCaseRelativeRoot: ".lime/harness/sessions/sess_1/replay",
        exportedAt: "2026-06-05T00:00:07.000Z",
        threadStatus: "running",
        pendingRequestCount: 0,
        queuedTurnCount: 0,
        title: "Review Decision",
        defaultDecisionStatus: "pending_review",
        decision: {
          decisionStatus: "pending_review",
          decisionSummary: "",
          chosenFixStrategy: "",
          riskLevel: "unknown",
          riskTags: [],
          humanReviewer: "",
          followupActions: [],
          regressionRequirements: [],
          notes: "",
        },
        decisionStatusOptions: ["pending_review", "accepted"],
        riskLevelOptions: ["unknown", "low"],
        reviewChecklist: [],
        analysisArtifacts: [],
        artifacts: [],
      },
    },
    {
      id: 4,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        workspaceRoot: "/workspace",
        reviewRelativeRoot: ".lime/harness/sessions/sess_1/review",
        reviewAbsoluteRoot: "/workspace/.lime/harness/sessions/sess_1/review",
        analysisRelativeRoot: ".lime/harness/sessions/sess_1/analysis",
        analysisAbsoluteRoot:
          "/workspace/.lime/harness/sessions/sess_1/analysis",
        handoffBundleRelativeRoot: ".lime/harness/sessions/sess_1",
        evidencePackRelativeRoot: ".lime/harness/sessions/sess_1/evidence",
        replayCaseRelativeRoot: ".lime/harness/sessions/sess_1/replay",
        exportedAt: "2026-06-05T00:00:08.000Z",
        threadStatus: "running",
        pendingRequestCount: 0,
        queuedTurnCount: 0,
        title: "Review Decision",
        defaultDecisionStatus: "pending_review",
        decision: {
          decisionStatus: "accepted",
          decisionSummary: "ok",
          chosenFixStrategy: "current path",
          riskLevel: "low",
          riskTags: ["runtime"],
          humanReviewer: "reviewer",
          followupActions: [],
          regressionRequirements: [],
          notes: "",
        },
        decisionStatusOptions: ["pending_review", "accepted"],
        riskLevelOptions: ["unknown", "low"],
        reviewChecklist: [],
        analysisArtifacts: [],
        artifacts: [],
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const replay = await connection.exportReplayCase({ sessionId: "sess_1" });
  const analysis = await connection.exportAnalysisHandoff({
    sessionId: "sess_1",
  });
  const review = await connection.exportReviewDecisionTemplate({
    sessionId: "sess_1",
  });
  const saved = await connection.saveReviewDecision({
    sessionId: "sess_1",
    decisionStatus: "accepted",
    decisionSummary: "ok",
    chosenFixStrategy: "current path",
    riskLevel: "low",
  });

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT);
  assert.equal(sent[1].method, METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT);
  assert.equal(
    sent[2].method,
    METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
  );
  assert.equal(sent[3].method, METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE);
  assert.equal(
    replay.result.replayRelativeRoot,
    ".lime/harness/sessions/sess_1/replay",
  );
  assert.equal(analysis.result.copyPrompt, "Review current evidence.");
  assert.equal(review.result.decision.decisionStatus, "pending_review");
  assert.equal(saved.result.decision.decisionStatus, "accepted");
});

test("connection wraps agent session file checkpoint responses", async () => {
  const sent = [];
  const checkpoint = {
    checkpointId: "artifact-document:req-1",
    turnId: "turn-1",
    path: "docs/brief.md",
    source: "artifact",
    updatedAt: "2026-06-08T10:00:00Z",
    versionNo: 2,
    validationIssueCount: 0,
  };
  const inbound = [
    {
      id: 1,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        checkpointCount: 1,
        checkpoints: [checkpoint],
      },
    },
    {
      id: 2,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        checkpoint,
        livePath: "/workspace/docs/brief.md",
        snapshotPath: "/workspace/.lime/checkpoints/brief.md",
        versionHistory: [],
        validationIssues: [],
        content: "draft",
      },
    },
    {
      id: 3,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        checkpoint,
        currentVersionId: "v2",
        previousVersionId: "v1",
        diff: { changed: true },
      },
    },
    {
      id: 4,
      result: {
        sessionId: "sess_1",
        threadId: "thread_1",
        checkpoint,
        livePath: "/workspace/docs/brief.md",
        snapshotPath: "/workspace/.lime/checkpoints/brief.md",
        backupPath: null,
        restoredAt: "2026-06-08T10:05:00Z",
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const list = await connection.listAgentSessionFileCheckpoints({
    sessionId: "sess_1",
  });
  const detail = await connection.getAgentSessionFileCheckpoint({
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
  });
  const diff = await connection.diffAgentSessionFileCheckpoint({
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
  });
  const restore = await connection.restoreAgentSessionFileCheckpoint({
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
    confirmRestore: true,
  });

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST);
  assert.equal(sent[1].method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET);
  assert.equal(sent[2].method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF);
  assert.equal(sent[3].method, METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE);
  assert.deepEqual(sent[3].params, {
    sessionId: "sess_1",
    checkpointId: "artifact-document:req-1",
    confirmRestore: true,
  });
  assert.equal(list.result.checkpointCount, 1);
  assert.equal(detail.result.livePath, "/workspace/docs/brief.md");
  assert.deepEqual(diff.result.diff, { changed: true });
  assert.equal(restore.result.restoredAt, "2026-06-08T10:05:00Z");
});

test("connection wraps action respond response", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {},
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.respondAction({
    sessionId: "sess_external",
    requestId: "req_confirm_1",
    actionType: "tool_confirmation",
    confirmed: true,
    response: "allow",
    actionScope: {
      sessionId: "sess_external",
      threadId: "thread_external",
      turnId: "turn_external",
    },
  });

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_ACTION_RESPOND);
  assert.equal(sent[0].params.requestId, "req_confirm_1");
  assert.equal(sent[0].params.actionType, "tool_confirmation");
  assert.equal(sent[0].params.confirmed, true);
  assert.equal(sent[0].params.actionScope.turnId, "turn_external");
  assert.deepEqual(result.result, {});
});

test("connection wraps action replay response", async () => {
  const sent = [];
  const inbound = [
    {
      id: 1,
      result: {
        action: {
          type: "action_required",
          requestId: "req_confirm_1",
          actionType: "ask_user",
          prompt: "请选择执行模式",
        },
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = inbound.shift();
      if (!message) {
        throw new Error("empty transport");
      }
      return message;
    },
  });

  const result = await connection.replayAction({
    sessionId: "sess_external",
    requestId: "req_confirm_1",
  });

  assert.equal(sent[0].method, METHOD_AGENT_SESSION_ACTION_REPLAY);
  assert.deepEqual(sent[0].params, {
    sessionId: "sess_external",
    requestId: "req_confirm_1",
  });
  assert.equal(result.result.action.requestId, "req_confirm_1");
  assert.equal(result.result.action.actionType, "ask_user");
});

test("routes agent session event notifications for renderer projection", async () => {
  const event = {
    eventId: "evt-1",
    sequence: 1,
    sessionId: "sess_external",
    threadId: "thread_external",
    turnId: "turn_external",
    type: "message.delta",
    timestamp: "2026-06-04T00:00:00Z",
    payload: {
      text: "delta",
    },
  };
  const notification = {
    method: METHOD_AGENT_SESSION_EVENT,
    params: {
      event,
    },
  };
  const routed = [];
  const router = new AppServerAgentEventRouter();
  const unsubscribe = router.subscribe((agentEvent, source) => {
    routed.push({
      event: agentEvent,
      method: source.method,
    });
  });

  assert.equal(isAgentSessionEventNotification(notification), true);
  assert.equal(
    agentSessionEventNotification(notification)?.params.event.payload.text,
    "delta",
  );
  assert.equal(await router.dispatch(notification), true);
  unsubscribe();
  assert.equal(await router.dispatch(notification), true);
  assert.equal(
    await router.dispatch({
      method: "other/event",
      params: {},
    }),
    false,
  );
  assert.deepEqual(routed, [
    {
      event,
      method: METHOD_AGENT_SESSION_EVENT,
    },
  ]);
});

test("connection buffers request responses read by idle notification loop", async () => {
  const sent = [];
  const waiters = [];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    nextMessage() {
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
  });

  const notificationPromise = connection.nextNotification(1_000);
  await waitFor(() => waiters.length === 1);

  const resultPromise = connection.startTurn({
    sessionId: "sess_external",
    input: {
      text: "draft",
    },
  });
  waiters.shift()({
    id: 1,
    result: {
      turn: {
        turnId: "turn-1",
        sessionId: "sess_external",
        threadId: "thread_external",
        status: "accepted",
      },
    },
  });

  await waitFor(() => sent.length === 1 && waiters.length === 1);
  waiters.shift()({
    method: METHOD_AGENT_SESSION_EVENT,
    params: {
      event: {
        eventId: "evt-1",
        sequence: 1,
        sessionId: "sess_external",
        type: "message.delta",
        timestamp: "2026-06-04T00:00:00Z",
        payload: {
          text: "delta",
        },
      },
    },
  });

  const [result, notification] = await Promise.all([
    resultPromise,
    notificationPromise,
  ]);
  assert.equal(result.result.turn.turnId, "turn-1");
  assert.equal(notification.method, METHOD_AGENT_SESSION_EVENT);
});

test("connection mirrors long request notifications for event drain", async () => {
  const sent = [];
  const waiters = [];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    nextMessage() {
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
  });

  const turnPromise = connection.startTurn(
    {
      sessionId: "sess_external",
      turnId: "turn-1",
      input: {
        text: "draft",
      },
    },
    { timeoutMs: 1_000 },
  );
  await waitFor(() => sent.length === 1 && waiters.length === 1);

  waiters.shift()({
    method: METHOD_AGENT_SESSION_EVENT,
    params: {
      event: {
        eventId: "evt-early",
        sequence: 1,
        sessionId: "sess_external",
        turnId: "turn-1",
        type: "message.delta",
        timestamp: "2026-06-04T00:00:00Z",
        payload: {
          text: "early",
        },
      },
    },
  });

  await waitFor(() => waiters.length === 1);
  const notification = await connection.nextNotification(1_000);
  assert.equal(notification.method, METHOD_AGENT_SESSION_EVENT);
  assert.equal(notification.params.event.eventId, "evt-early");

  waiters.shift()({
    id: 1,
    result: {
      turn: {
        turnId: "turn-1",
        sessionId: "sess_external",
        threadId: "thread_external",
        status: "accepted",
      },
    },
  });

  const result = await turnPromise;
  assert.equal(result.result.turn.turnId, "turn-1");
  assert.equal(result.notifications[0].params.event.eventId, "evt-early");
});

test("connection resolves short concurrent request before long turn response", async () => {
  const sent = [];
  const inbound = [];
  const waiters = [];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    nextMessage() {
      const message = inbound.shift();
      if (message) {
        return Promise.resolve(message);
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
  });

  const turnPromise = connection.startTurn(
    {
      sessionId: "sess_external",
      input: {
        text: "draft",
      },
    },
    { timeoutMs: 1_000 },
  );
  await waitFor(() => sent.length === 1 && waiters.length === 1);

  const workspacePromise = connection.readWorkspace(
    { id: "workspace-1" },
    { timeoutMs: 1_000 },
  );
  await waitFor(() => sent.length === 2);

  waiters.shift()({
    id: 2,
    result: {
      workspace: {
        id: "workspace-1",
        kind: "project",
        name: "Workspace",
        rootPath: "/tmp/workspace",
        isDefault: true,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
    },
  });

  const workspace = await workspacePromise;
  assert.equal(workspace.id, 2);
  assert.equal(workspace.result.workspace.id, "workspace-1");

  await waitFor(() => waiters.length === 1);
  waiters.shift()({
    id: 1,
    result: {
      turn: {
        turnId: "turn-1",
        sessionId: "sess_external",
        threadId: "thread_external",
        status: "accepted",
      },
    },
  });

  const turn = await turnPromise;
  assert.equal(turn.id, 1);
  assert.equal(turn.result.turn.turnId, "turn-1");
});

test("encodes one JSON-RPC message per line", () => {
  const client = new AppServerClient();
  const line = encodeMessage(client.initialized());

  assert.match(line, /\n$/);
  assert.deepEqual(decodeMessage(line), {
    method: "initialized",
    params: {},
  });
  assert.throws(() => decodeMessage("  "), /empty JSON-RPC line/);
});

test("uses agent-style stdio sidecar launch args", () => {
  const config = stdioSidecar("/tmp/app-server");

  assert.equal(config.listenUrl, DEFAULT_LISTEN_URL);
  assert.equal(config.backendMode, DEFAULT_STANDALONE_BACKEND_MODE);
  assert.deepEqual(sidecarArgs(config), [
    "--stdio",
    "--backend",
    "unavailable",
  ]);
  assert.equal(config.expectedSha256, undefined);
  const policyConfig = stdioSidecar(
    "/tmp/app-server",
    "/tmp/content-studio.policy.json",
  );
  assert.equal(policyConfig.appPolicyPath, "/tmp/content-studio.policy.json");
  assert.deepEqual(sidecarArgs(policyConfig), [
    "--stdio",
    "--backend",
    "unavailable",
    "--app-policy",
    "/tmp/content-studio.policy.json",
  ]);
  const dataDirConfig = stdioSidecar(
    "/tmp/app-server",
    "/tmp/content-studio.policy.json",
    "/tmp/content-studio-app-server-data",
  );
  assert.equal(dataDirConfig.dataDir, "/tmp/content-studio-app-server-data");
  assert.deepEqual(sidecarArgs(dataDirConfig), [
    "--stdio",
    "--backend",
    "unavailable",
    "--app-policy",
    "/tmp/content-studio.policy.json",
    "--data-dir",
    "/tmp/content-studio-app-server-data",
  ]);
  const cleanupConfig = stdioSidecar(
    "/tmp/app-server",
    undefined,
    "/tmp/content-studio-app-server-data",
    "delete-file",
  );
  assert.equal(cleanupConfig.productDbMigrationCleanup, "delete-file");
  assert.deepEqual(sidecarArgs(cleanupConfig), [
    "--stdio",
    "--backend",
    "unavailable",
    "--data-dir",
    "/tmp/content-studio-app-server-data",
    "--product-db-migration-cleanup",
    "delete-file",
  ]);
  assert.deepEqual(
    sidecarArgs({ binaryPath: "app-server", listenUrl: "stdio://" }),
    ["--stdio", "--backend", "unavailable"],
  );
  assert.deepEqual(
    sidecarArgs({ binaryPath: "app-server", listenUrl: "local://lime" }),
    ["--listen", "local://lime", "--backend", "unavailable"],
  );
  assert.deepEqual(
    sidecarArgs({
      binaryPath: "app-server",
      listenUrl: "stdio://",
      backendMode: "unavailable",
      productDbMigrationCleanup: "drop-tables",
    }),
    [
      "--stdio",
      "--backend",
      "unavailable",
      "--product-db-migration-cleanup",
      "drop-tables",
    ],
  );
  assert.deepEqual(
    sidecarArgs({
      binaryPath: "app-server",
      listenUrl: "stdio://",
      backendMode: "runtime",
    }),
    ["--stdio", "--backend", "runtime"],
  );
  assert.deepEqual(
    sidecarArgs({
      binaryPath: "app-server",
      listenUrl: "stdio://",
      backendMode: "mock",
    }),
    ["--stdio", "--backend", "mock"],
  );
  assert.deepEqual(
    sidecarArgs({
      binaryPath: "app-server",
      listenUrl: "stdio://",
      backendMode: "mock",
      appPolicyPath: "/tmp/content-studio.policy.json",
    }),
    [
      "--stdio",
      "--backend",
      "mock",
      "--app-policy",
      "/tmp/content-studio.policy.json",
    ],
  );
  assert.deepEqual(
    sidecarArgs({
      binaryPath: "app-server",
      listenUrl: "stdio://",
      backendMode: "external",
      backendCommand: "/usr/local/bin/content-backend",
      backendArgs: ["--workspace", "/tmp/content-studio", "--json"],
      backendTimeoutMs: 30_000,
      appPolicyPath: "/tmp/content-studio.policy.json",
    }),
    [
      "--stdio",
      "--backend",
      "external",
      "--backend-command",
      "/usr/local/bin/content-backend",
      "--backend-arg",
      "--workspace",
      "--backend-arg",
      "/tmp/content-studio",
      "--backend-arg",
      "--json",
      "--backend-timeout-ms",
      "30000",
      "--app-policy",
      "/tmp/content-studio.policy.json",
    ],
  );
  assert.equal(sidecarBinaryName("darwin"), "app-server");
  assert.equal(sidecarBinaryName("win32"), "app-server.exe");
});

test("resolves sidecar binary path for env resources and dev fallback", () => {
  assert.equal(
    defaultPackagedSidecarRelativePath("darwin", "arm64"),
    join("app-server", "darwin-arm64", "app-server"),
  );
  assert.equal(
    defaultPackagedSidecarRelativePath("win32", "x64"),
    join("app-server", "win32-x64", "app-server.exe"),
  );

  assert.deepEqual(
    resolveSidecarBinaryPath({
      env: {
        APP_SERVER_BIN: "/custom/app-server",
      },
      resourcesPath: "/app/resources",
      devBinaryPath: "/dev/app-server",
      platform: "darwin",
      arch: "arm64",
    }),
    {
      binaryPath: "/custom/app-server",
      source: "env",
    },
  );
  assert.deepEqual(
    resolveSidecarBinaryPath({
      env: {
        APP_SERVER_BIN: "/custom/app-server",
      },
      allowEnvOverride: false,
      resourcesPath: "/app/resources",
      platform: "darwin",
      arch: "arm64",
    }),
    {
      binaryPath: join(
        "/app/resources",
        "app-server",
        "darwin-arm64",
        "app-server",
      ),
      source: "resources",
    },
  );
  assert.deepEqual(
    resolveSidecarBinaryPath({
      env: {},
      resourcesPath: "/app/resources",
      platform: "darwin",
      arch: "arm64",
    }),
    {
      binaryPath: join(
        "/app/resources",
        "app-server",
        "darwin-arm64",
        "app-server",
      ),
      source: "resources",
    },
  );
  assert.deepEqual(
    resolveSidecarBinaryPath({
      env: {},
      devBinaryPath: "/dev/app-server",
    }),
    {
      binaryPath: "/dev/app-server",
      source: "dev",
    },
  );
  assert.equal(resolveSidecarBinaryPath({ env: {} }), undefined);
});

test("selects release manifest artifact by platform and protocol", () => {
  const manifest = {
    version: "1.58.0",
    protocolVersion: PROTOCOL_VERSION,
    artifacts: [
      {
        platform: "darwin-arm64",
        url: "https://example/app-server-darwin-arm64.tar.gz",
        sha256: "abc",
      },
      {
        platform: "win32-x64",
        url: "https://example/app-server-win32-x64.zip",
        sha256: "def",
      },
    ],
  };

  assert.equal(platformKey("darwin", "arm64"), "darwin-arm64");
  assert.equal(platformKey("win32", "x64"), "win32-x64");
  assert.equal(findReleaseArtifact(manifest, "darwin-arm64").sha256, "abc");
  assert.equal(findReleaseArtifact(manifest, "linux-x64"), undefined);
  assert.doesNotThrow(() => assertCompatibleManifest(manifest));
  assert.throws(
    () =>
      assertCompatibleManifest({
        ...manifest,
        protocolVersion: "appserver.v9",
      }),
    /unsupported app-server protocol/,
  );
});

test("resolves sidecar config from manifest and packaged resources", () => {
  const manifest = {
    version: "1.58.0",
    protocolVersion: PROTOCOL_VERSION,
    artifacts: [
      {
        platform: "darwin-arm64",
        url: "https://example/app-server-darwin-arm64.tar.gz",
        sha256: "abc",
      },
    ],
  };

  assert.deepEqual(
    resolveSidecarFromReleaseManifest(manifest, {
      env: {},
      resourcesPath: "/app/resources",
      appPolicyPath: "/app/content-studio.policy.json",
      platform: "darwin",
      arch: "arm64",
    }),
    {
      artifact: manifest.artifacts[0],
      binaryPathSource: "resources",
      config: {
        binaryPath: join(
          "/app/resources",
          "app-server",
          "darwin-arm64",
          "app-server",
        ),
        listenUrl: DEFAULT_LISTEN_URL,
        backendMode: DEFAULT_STANDALONE_BACKEND_MODE,
        appPolicyPath: "/app/content-studio.policy.json",
        expectedSha256: "abc",
        artifact: manifest.artifacts[0],
      },
    },
  );

  assert.deepEqual(
    resolveSidecarFromReleaseManifest(manifest, {
      env: {
        APP_SERVER_BIN: "/dev/app-server",
      },
      resourcesPath: "/app/resources",
      platform: "darwin",
      arch: "arm64",
    }),
    {
      artifact: manifest.artifacts[0],
      binaryPathSource: "env",
      config: {
        binaryPath: "/dev/app-server",
        listenUrl: DEFAULT_LISTEN_URL,
        backendMode: DEFAULT_STANDALONE_BACKEND_MODE,
        expectedSha256: undefined,
        artifact: manifest.artifacts[0],
      },
    },
  );
  assert.deepEqual(
    resolveSidecarFromReleaseManifest(manifest, {
      env: {
        APP_SERVER_BIN: "/dev/app-server",
      },
      allowEnvOverride: false,
      resourcesPath: "/app/resources",
      platform: "darwin",
      arch: "arm64",
    }),
    {
      artifact: manifest.artifacts[0],
      binaryPathSource: "resources",
      config: {
        binaryPath: join(
          "/app/resources",
          "app-server",
          "darwin-arm64",
          "app-server",
        ),
        listenUrl: DEFAULT_LISTEN_URL,
        backendMode: DEFAULT_STANDALONE_BACKEND_MODE,
        expectedSha256: "abc",
        artifact: manifest.artifacts[0],
      },
    },
  );
  assert.deepEqual(
    resolveSidecarFromReleaseManifest(manifest, {
      env: {},
      resourcesPath: "/app/resources",
      backendMode: "external",
      backendCommand: "/usr/local/bin/content-backend",
      backendArgs: ["--workspace", "/app/workspace"],
      backendTimeoutMs: 45_000,
      appPolicyPath: "/app/content-studio.policy.json",
      dataDir: "/app/user-data/app-server",
      platform: "darwin",
      arch: "arm64",
    }),
    {
      artifact: manifest.artifacts[0],
      binaryPathSource: "resources",
      config: {
        binaryPath: join(
          "/app/resources",
          "app-server",
          "darwin-arm64",
          "app-server",
        ),
        listenUrl: DEFAULT_LISTEN_URL,
        backendMode: "external",
        backendCommand: "/usr/local/bin/content-backend",
        backendArgs: ["--workspace", "/app/workspace"],
        backendTimeoutMs: 45_000,
        appPolicyPath: "/app/content-studio.policy.json",
        dataDir: "/app/user-data/app-server",
        expectedSha256: "abc",
        artifact: manifest.artifacts[0],
      },
    },
  );

  assert.equal(
    resolveSidecarFromReleaseManifest(manifest, {
      env: {},
      platform: "linux",
      arch: "x64",
    }),
    undefined,
  );
  assert.throws(
    () =>
      resolveSidecarFromReleaseManifest(
        { ...manifest, protocolVersion: "appserver.v9" },
        {
          env: {},
          resourcesPath: "/app/resources",
          platform: "darwin",
          arch: "arm64",
        },
      ),
    /unsupported app-server protocol/,
  );
});

test("resolves sidecar config from release manifest file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-manifest-"));
  const manifestPath = join(dir, "app-server.release.json");
  const manifest = {
    version: "1.58.0",
    protocolVersion: PROTOCOL_VERSION,
    artifacts: [
      {
        platform: "darwin-arm64",
        url: "https://example/app-server-darwin-arm64.tar.gz",
        sha256: "abc",
      },
    ],
  };

  try {
    await writeFile(manifestPath, JSON.stringify(manifest));

    assert.deepEqual(await readReleaseManifest(manifestPath), manifest);
    assert.deepEqual(
      await resolveSidecarFromReleaseManifestFile(manifestPath, {
        env: {},
        resourcesPath: "/app/resources",
        platform: "darwin",
        arch: "arm64",
      }),
      {
        artifact: manifest.artifacts[0],
        binaryPathSource: "resources",
        config: {
          binaryPath: join(
            "/app/resources",
            "app-server",
            "darwin-arm64",
            "app-server",
          ),
          listenUrl: DEFAULT_LISTEN_URL,
          backendMode: DEFAULT_STANDALONE_BACKEND_MODE,
          expectedSha256: "abc",
          artifact: manifest.artifacts[0],
        },
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("starts packaged sidecar lifecycle from resources manifest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-packaged-"));
  const resourcesPath = join(dir, "resources");
  const platform = platformKey();
  const packagedDir = join(resourcesPath, "app-server", platform);
  const packagedBinaryPath = join(packagedDir, sidecarBinaryName());
  const fakeSidecar = join(dir, "fake-packaged-sidecar.mjs");
  const manifestPath = defaultReleaseManifestPath(resourcesPath);
  let lifecycle;

  try {
    await mkdir(packagedDir, { recursive: true });
    await copyFile(process.execPath, packagedBinaryPath);
    await chmod(packagedBinaryPath, 0o755).catch(() => undefined);
    await writeFile(
      fakeSidecar,
      `
        import { createInterface } from 'node:readline';

        const lines = createInterface({ input: process.stdin });
        lines.on('line', (line) => {
          const message = JSON.parse(line);
          if (message.method === 'initialize') {
            console.log(JSON.stringify({
              id: message.id,
              result: {
                serverInfo: {
                  name: 'app-server',
                  version: '1.58.0',
                  protocolVersion: 'appserver.v0'
                },
                platform: {
                  family: 'desktop',
                  os: 'test'
                },
                capabilities: {
                  agentSession: true,
                  capabilityDiscovery: true,
                  artifact: false,
                  evidence: false,
                  workspace: false
                }
              }
            }));
            return;
          }
          if (message.method === 'initialized') {
            console.error('initialized-packaged');
            return;
          }
          if (message.id !== undefined) {
            console.log(JSON.stringify({
              id: message.id,
              result: { method: message.method }
            }));
          }
        });
      `,
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: "1.58.0",
        protocolVersion: PROTOCOL_VERSION,
        artifacts: [
          {
            platform,
            url: `file://${packagedBinaryPath}`,
            sha256: await sha256File(packagedBinaryPath),
          },
        ],
      }),
    );

    assert.equal(
      defaultReleaseManifestPath(resourcesPath),
      join(resourcesPath, DEFAULT_RELEASE_MANIFEST_NAME),
    );
    const started = await startPackagedAppServerSidecar(
      {
        clientInfo: {
          name: "content_studio",
          version: "0.1.0",
        },
      },
      {
        resourcesPath,
        args: [fakeSidecar],
        initializeTimeoutMs: 1_000,
      },
    );
    lifecycle = started.lifecycle;

    assert.equal(started.resolved.binaryPathSource, "resources");
    assert.equal(started.resolved.config.binaryPath, packagedBinaryPath);
    assert.equal(
      started.resolved.config.backendMode,
      DEFAULT_STANDALONE_BACKEND_MODE,
    );
    assert.equal(
      started.connected.initializeResponse.serverInfo.protocolVersion,
      PROTOCOL_VERSION,
    );
    await waitFor(() =>
      started.connected.sidecar.stderrLines.includes("initialized-packaged"),
    );
  } finally {
    await lifecycle?.stop().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

test("verifies release artifact sha256 before sidecar launch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-"));
  const binaryPath = join(dir, sidecarBinaryName("darwin"));

  try {
    await writeFile(binaryPath, "sidecar-binary");
    const sha256 = sha256Hex("sidecar-binary");
    const config = sidecarFromReleaseArtifact(
      binaryPath,
      {
        platform: "darwin-arm64",
        url: "https://example/app-server-darwin-arm64.tar.gz",
        sha256,
      },
      undefined,
      undefined,
      undefined,
      undefined,
      "drop-tables",
    );

    assert.equal(config.expectedSha256, sha256);
    assert.equal(config.backendMode, DEFAULT_STANDALONE_BACKEND_MODE);
    assert.deepEqual(sidecarArgs(config), [
      "--stdio",
      "--backend",
      "unavailable",
      "--product-db-migration-cleanup",
      "drop-tables",
    ]);
    assert.doesNotThrow(() => assertSha256(sha256.toUpperCase(), sha256));
    await assert.doesNotReject(() => assertSidecarFileSha256(config));
    assert.throws(() => assertSha256("bad", sha256), /sha256 mismatch/);
    await assert.rejects(
      () => assertSidecarFileSha256({ binaryPath, listenUrl: "stdio://" }),
      /expectedSha256 is required/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reads and validates protocol schema manifest metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-schema-"));
  const schemaRoot = join(dir, "schema", "json");
  const manifestPath = defaultProtocolSchemaManifestPath(schemaRoot);
  const manifest = {
    protocolVersion: PROTOCOL_VERSION,
    jsonRpc: {
      version: "2.0",
      sendsJsonRpcVersionField: false,
      envelopes: ["request", "notification", "response", "error"],
    },
    methods: [...APP_SERVER_METHODS].reverse(),
    schemas: {
      jsonrpc: ["JsonRpcRequest"],
      v0: [
        "AgentSessionTurnStartParams",
        "AgentSessionHandoffBundleExportResponse",
        "RuntimeOptions",
      ],
    },
  };

  try {
    await mkdir(schemaRoot, { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest));

    assert.equal(DEFAULT_PROTOCOL_SCHEMA_MANIFEST_NAME, "manifest.json");
    assert.equal(
      defaultProtocolSchemaManifestPath(schemaRoot),
      join(schemaRoot, "manifest.json"),
    );
    assert.equal(
      protocolSchemaFilePath(schemaRoot, "v0", "AgentSessionTurnStartParams"),
      join(schemaRoot, "v0", "AgentSessionTurnStartParams.json"),
    );

    const loaded = await readProtocolSchemaManifest(manifestPath);
    assert.doesNotThrow(() => assertCompatibleProtocolSchemaManifest(loaded));
    assert.deepEqual(listProtocolSchemaFiles(loaded, schemaRoot), [
      {
        group: "jsonrpc",
        typeName: "JsonRpcRequest",
        path: join(schemaRoot, "jsonrpc", "JsonRpcRequest.json"),
      },
      {
        group: "v0",
        typeName: "AgentSessionTurnStartParams",
        path: join(schemaRoot, "v0", "AgentSessionTurnStartParams.json"),
      },
      {
        group: "v0",
        typeName: "AgentSessionHandoffBundleExportResponse",
        path: join(
          schemaRoot,
          "v0",
          "AgentSessionHandoffBundleExportResponse.json",
        ),
      },
      {
        group: "v0",
        typeName: "RuntimeOptions",
        path: join(schemaRoot, "v0", "RuntimeOptions.json"),
      },
    ]);

    assert.throws(
      () =>
        assertCompatibleProtocolSchemaManifest({
          ...loaded,
          protocolVersion: "appserver.v9",
        }),
      /unsupported app-server schema protocol/,
    );
    assert.throws(
      () =>
        assertCompatibleProtocolSchemaManifest({
          ...loaded,
          methods: loaded.methods.filter(
            (spec) => spec.method !== METHOD_CAPABILITY_LIST,
          ),
        }),
      /schema method catalog mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("consumes checked-in Rust protocol schema manifest", async () => {
  const schemaRoot = join(
    repoRoot,
    "lime-rs",
    "crates",
    "app-server-protocol",
    "schema",
    "json",
  );
  const manifest = await readProtocolSchemaManifest(
    defaultProtocolSchemaManifestPath(schemaRoot),
  );

  assert.doesNotThrow(() => assertCompatibleProtocolSchemaManifest(manifest));
  assert.ok(manifest.schemas.v0.includes("AgentSessionTurnStartParams"));
  assert.ok(manifest.schemas.v0.includes("EvidenceExportResponse"));
  assert.ok(
    manifest.schemas.v0.includes("AgentSessionHandoffBundleExportParams"),
  );
  assert.ok(
    manifest.schemas.v0.includes("AgentSessionHandoffBundleExportResponse"),
  );
  assert.ok(manifest.schemas.v0.includes("AgentSessionHandoffArtifact"));
  assert.ok(manifest.schemas.jsonrpc.includes("JsonRpcRequest"));
  assert.ok(
    listProtocolSchemaFiles(manifest, schemaRoot).some(
      (entry) =>
        entry.group === "v0" &&
        entry.typeName === "AgentSessionTurnStartParams" &&
        entry.path.endsWith(join("v0", "AgentSessionTurnStartParams.json")),
    ),
  );
});

test("spawns stdio sidecar and exchanges JSON-RPC lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-sidecar-"));
  const fakeSidecar = join(dir, "fake-sidecar.mjs");

  try {
    await writeFile(
      fakeSidecar,
      `
        import { createInterface } from 'node:readline';

        console.error('fake-sidecar-ready');
        const lines = createInterface({ input: process.stdin });
        lines.on('line', (line) => {
          const message = JSON.parse(line);
          if (message.id !== undefined) {
            console.log(JSON.stringify({
              id: message.id,
              result: {
                method: message.method,
                ok: true
              }
            }));
          }
        });
      `,
    );

    const client = new AppServerClient();
    const sidecar = await spawnAppServerSidecar(
      stdioSidecar(process.execPath),
      {
        args: [fakeSidecar],
      },
    );

    try {
      sidecar.send(
        client.initialize({
          clientInfo: {
            name: "content_studio",
          },
        }),
      );

      const response = await sidecar.nextMessage(SIDECAR_TEST_TIMEOUT_MS);
      assert.equal(response.id, 1);
      assert.deepEqual(response.result, {
        method: "initialize",
        ok: true,
      });
      await waitFor(
        () => sidecar.stderrLines.includes("fake-sidecar-ready"),
        SIDECAR_TEST_TIMEOUT_MS,
      );
    } finally {
      await sidecar.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("connects sidecar with initialize and initialized handshake", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-connect-"));
  const fakeSidecar = join(dir, "fake-connect-sidecar.mjs");

  try {
    await writeFile(
      fakeSidecar,
      `
        import { createInterface } from 'node:readline';

        const lines = createInterface({ input: process.stdin });
        lines.on('line', (line) => {
          const message = JSON.parse(line);
          if (message.method === 'initialize') {
            console.log(JSON.stringify({
              id: message.id,
              result: {
                serverInfo: {
                  name: 'app-server',
                  version: '1.58.0',
                  protocolVersion: 'appserver.v0'
                },
                platform: {
                  family: 'desktop',
                  os: 'test'
                },
                capabilities: {
                  agentSession: true,
                  capabilityDiscovery: false,
                  artifact: false,
                  evidence: false,
                  workspace: false
                }
              }
            }));
            return;
          }
          if (message.method === 'initialized') {
            console.error('initialized-received');
            return;
          }
          if (message.id !== undefined) {
            console.log(JSON.stringify({
              id: message.id,
              result: { method: message.method }
            }));
          }
        });
      `,
    );

    const connected = await connectAppServerSidecar(
      stdioSidecar(process.execPath),
      {
        clientInfo: {
          name: "content_studio",
          version: "0.1.0",
        },
      },
      {
        args: [fakeSidecar],
        initializeTimeoutMs: SIDECAR_TEST_TIMEOUT_MS,
      },
    );

    try {
      assert.equal(
        connected.initializeResponse.serverInfo.protocolVersion,
        PROTOCOL_VERSION,
      );
      await waitFor(
        () => connected.sidecar.stderrLines.includes("initialized-received"),
        SIDECAR_TEST_TIMEOUT_MS,
      );

      connected.sidecar.send(
        connected.client.startSession({
          appId: "content-studio",
        }),
      );
      const response = await connected.sidecar.nextMessage(
        SIDECAR_TEST_TIMEOUT_MS,
      );
      assert.equal(response.id, 2);
      assert.deepEqual(response.result, {
        method: "agentSession/start",
      });
    } finally {
      await connected.sidecar.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("includes sidecar stderr when initialize exits before response", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-connect-fail-"));
  const fakeSidecar = join(dir, "fake-connect-fail-sidecar.mjs");

  try {
    await writeFile(
      fakeSidecar,
      `
        console.error('fixture initialize failed: schema mismatch');
        process.exit(1);
      `,
    );

    await assert.rejects(
      () =>
        connectAppServerSidecar(
          stdioSidecar(process.execPath),
          {
            clientInfo: {
              name: "content_studio",
              version: "0.1.0",
            },
          },
          {
            args: [fakeSidecar],
            initializeTimeoutMs: SIDECAR_TEST_TIMEOUT_MS,
          },
        ),
      (error) => {
        assert.match(
          error.message,
          /app-server exited before next message: code=1/,
        );
        assert.match(
          error.message,
          /fixture initialize failed: schema mismatch/,
        );
        assert.deepEqual(error.stderrLines, [
          "fixture initialize failed: schema mismatch",
        ]);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("calculates sidecar restart backoff policy", () => {
  assert.equal(
    sidecarRestartDelayMs(1, { initialDelayMs: 100, factor: 2 }),
    100,
  );
  assert.equal(
    sidecarRestartDelayMs(3, { initialDelayMs: 100, factor: 2 }),
    400,
  );
  assert.equal(
    sidecarRestartDelayMs(5, {
      initialDelayMs: 100,
      maxDelayMs: 500,
      factor: 2,
    }),
    500,
  );
  assert.equal(shouldRestartSidecar(1, { maxAttempts: 1 }), true);
  assert.equal(shouldRestartSidecar(2, { maxAttempts: 1 }), false);
});

test("sidecar lifecycle restarts once after crash", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-lifecycle-"));
  const fakeSidecar = join(dir, "fake-lifecycle-sidecar.mjs");
  const scheduled = [];
  const restarted = [];
  const exited = [];
  let lifecycle;

  try {
    await writeFile(
      fakeSidecar,
      `
        import { createInterface } from 'node:readline';

        const lines = createInterface({ input: process.stdin });
        lines.on('line', (line) => {
          const message = JSON.parse(line);
          if (message.method === 'initialize') {
            console.log(JSON.stringify({
              id: message.id,
              result: {
                serverInfo: {
                  name: 'app-server',
                  version: '1.58.0',
                  protocolVersion: 'appserver.v0'
                },
                platform: {
                  family: 'desktop',
                  os: 'test'
                },
                capabilities: {
                  agentSession: true,
                  capabilityDiscovery: false,
                  artifact: false,
                  evidence: false,
                  workspace: false
                }
              }
            }));
            return;
          }
          if (message.method === 'initialized') {
            console.error('initialized-' + process.pid);
            setTimeout(() => process.exit(42), 20);
          }
        });
      `,
    );

    lifecycle = new AppServerSidecarLifecycle(
      stdioSidecar(process.execPath),
      {
        clientInfo: {
          name: "content_studio",
          version: "0.1.0",
        },
      },
      {
        args: [fakeSidecar],
        initializeTimeoutMs: SIDECAR_TEST_TIMEOUT_MS,
        restartPolicy: {
          maxAttempts: 1,
          initialDelayMs: 0,
        },
        sleep: async () => undefined,
        onExit(event) {
          exited.push(event);
        },
        onRestartScheduled(event) {
          scheduled.push(event);
        },
        onRestarted(connected, attempt) {
          restarted.push({ connected, attempt });
        },
      },
    );

    await lifecycle.start();
    await waitFor(
      () => scheduled.length === 1 && restarted.length === 1,
      SIDECAR_TEST_TIMEOUT_MS,
    );

    assert.equal(exited[0].code, 42);
    assert.equal(scheduled[0].attempt, 1);
    assert.equal(scheduled[0].delayMs, 0);
    assert.equal(restarted[0].attempt, 1);
  } finally {
    await lifecycle?.stop().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

test("sidecar lifecycle retries initial handshake failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-start-retry-"));
  const fakeSidecar = join(dir, "fake-start-retry-sidecar.mjs");
  const counterPath = join(dir, "attempt-count.txt");
  const scheduled = [];
  const failures = [];
  let lifecycle;

  try {
    await writeFile(counterPath, "0");
    await writeFile(
      fakeSidecar,
      `
        import { createInterface } from 'node:readline';
        import { readFileSync, writeFileSync } from 'node:fs';

        const counterPath = process.argv[2];
        const lines = createInterface({ input: process.stdin });
        lines.on('line', (line) => {
          const message = JSON.parse(line);
          if (message.method !== 'initialize') {
            return;
          }

          const attempt = Number(readFileSync(counterPath, 'utf8')) + 1;
          writeFileSync(counterPath, String(attempt));
          if (attempt === 1) {
            process.exit(43);
          }

          console.log(JSON.stringify({
            id: message.id,
            result: {
              serverInfo: {
                name: 'app-server',
                version: '1.58.0',
                protocolVersion: 'appserver.v0'
              },
              platform: {
                family: 'desktop',
                os: 'test'
              },
              capabilities: {
                agentSession: true,
                capabilityDiscovery: false,
                artifact: false,
                evidence: false,
                workspace: false
              }
            }
          }));
        });
      `,
    );

    lifecycle = new AppServerSidecarLifecycle(
      stdioSidecar(process.execPath),
      {
        clientInfo: {
          name: "content_studio",
          version: "0.1.0",
        },
      },
      {
        args: [fakeSidecar, counterPath],
        initializeTimeoutMs: SIDECAR_TEST_TIMEOUT_MS,
        restartPolicy: {
          maxAttempts: 1,
          initialDelayMs: 0,
        },
        sleep: async () => undefined,
        onRestartFailed(event) {
          failures.push(event);
        },
        onRestartScheduled(event) {
          scheduled.push(event);
        },
      },
    );

    const connected = await lifecycle.start();

    assert.equal(
      connected.initializeResponse.serverInfo.protocolVersion,
      PROTOCOL_VERSION,
    );
    assert.equal(failures.length, 1);
    assert.equal(failures[0].attempt, 1);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].attempt, 1);
    assert.equal(scheduled[0].delayMs, 0);
  } finally {
    await lifecycle?.stop().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

async function waitFor(predicate, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for predicate");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
