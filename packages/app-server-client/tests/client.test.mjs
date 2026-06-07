import assert from "node:assert/strict";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  APP_SERVER_METHODS,
  AppServerAgentEventRouter,
  AppServerSidecarLifecycle,
  DEFAULT_LISTEN_URL,
  DEFAULT_PROTOCOL_SCHEMA_MANIFEST_NAME,
  DEFAULT_RELEASE_MANIFEST_NAME,
  ERROR_CODES,
  AppServerConnection,
  AppServerClient,
  AppServerRequestError,
  DEFAULT_STANDALONE_BACKEND_MODE,
  METHOD_AGENT_APP_INSTALLED_LIST,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_EVENT,
  METHOD_AGENT_SESSION_LIST,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AGENT_SESSION_UPDATE,
  METHOD_ARTIFACT_READ,
  METHOD_AUTOMATION_JOB_LIST,
  METHOD_CAPABILITY_LIST,
  METHOD_CONNECT_CALLBACK_SEND,
  METHOD_CONNECT_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_RELAY_API_KEY_SAVE,
  METHOD_EVIDENCE_EXPORT,
  METHOD_FILE_SYSTEM_LIST_DIRECTORY,
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
  METHOD_INITIALIZED,
  METHOD_INITIALIZE,
  METHOD_KNOWLEDGE_PACK_LIST,
  METHOD_MODEL_LIST,
  METHOD_MODEL_PREFERENCES_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_PROVIDER_CATALOG_LIST,
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_MODEL_SYNC_STATE_READ,
  METHOD_PROJECT_MEMORY_READ,
  PROTOCOL_VERSION,
  METHOD_SKILL_LIST,
  METHOD_SKILL_READ,
  METHOD_WORKSPACE_BY_PATH_READ,
  METHOD_WORKSPACE_DEFAULT_ENSURE,
  METHOD_WORKSPACE_DEFAULT_READ,
  METHOD_WORKSPACE_ENSURE_READY,
  METHOD_WORKSPACE_LIST,
  METHOD_WORKSPACE_PROJECTS_ROOT_READ,
  METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
  METHOD_WORKSPACE_READ,
  METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
  METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
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
} from "../dist/index.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

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
  const workspaces = client.listWorkspaces();
  const workspace = client.readWorkspace({ id: "workspace-main" });
  const workspaceByPath = client.readWorkspaceByPath({
    rootPath: "/workspace/project",
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
  assert.equal(workspaces.method, METHOD_WORKSPACE_LIST);
  assert.deepEqual(workspaces.params, {});
  assert.equal(workspace.method, METHOD_WORKSPACE_READ);
  assert.deepEqual(workspace.params, { id: "workspace-main" });
  assert.equal(workspaceByPath.method, METHOD_WORKSPACE_BY_PATH_READ);
  assert.deepEqual(workspaceByPath.params, {
    rootPath: "/workspace/project",
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
  const knowledge = client.listKnowledgePacks({
    workingDir: "/workspace/project",
    includeArchived: true,
  });
  const jobs = client.listAutomationJobs();
  const memory = client.readProjectMemory({
    projectId: "workspace-main",
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
  assert.equal(knowledge.method, METHOD_KNOWLEDGE_PACK_LIST);
  assert.deepEqual(knowledge.params, {
    workingDir: "/workspace/project",
    includeArchived: true,
  });
  assert.equal(jobs.method, METHOD_AUTOMATION_JOB_LIST);
  assert.deepEqual(jobs.params, {});
  assert.equal(memory.method, METHOD_PROJECT_MEMORY_READ);
  assert.deepEqual(memory.params, {
    projectId: "workspace-main",
  });
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

test("builds file system read requests with current methods", () => {
  const client = new AppServerClient();

  const listing = client.listDirectory({
    path: "/workspace",
  });
  const preview = client.readFilePreview({
    path: "/workspace/README.md",
    maxSize: 1024,
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
});

test("builds connect deep link requests with current methods", () => {
  const client = new AppServerClient();

  const connect = client.resolveConnectDeepLink({
    url: "lime://connect?relay=relay-one&key=sk-relay-key",
  });
  const open = client.resolveConnectOpenDeepLink({
    url: "lime://open?kind=skill&slug=viral-content-breakdown&action=install",
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
  assert.equal(save.id, 3);
  assert.equal(save.method, METHOD_CONNECT_RELAY_API_KEY_SAVE);
  assert.deepEqual(save.params, {
    relayId: "relay-one",
    apiKey: "sk-relay-key",
    name: "Relay Key",
  });
  assert.equal(callback.id, 4);
  assert.equal(callback.method, METHOD_CONNECT_CALLBACK_SEND);
  assert.deepEqual(callback.params, {
    relayId: "relay-one",
    apiKey: "sk-relay-key",
    status: "success",
    refCode: "ref-001",
  });
});

test("builds evidence export requests with optional scope flags", () => {
  const client = new AppServerClient();

  const evidence = client.exportEvidence({
    sessionId: "sess_1",
    turnId: "turn_1",
    includeEvents: true,
    includeArtifacts: false,
    includeEvidencePack: false,
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
});

test("exports app-server method catalog with request and notification kinds", () => {
  assert.deepEqual(APP_SERVER_METHODS, [
    { method: METHOD_INITIALIZE, kind: "request" },
    { method: METHOD_INITIALIZED, kind: "notification" },
    { method: METHOD_CAPABILITY_LIST, kind: "request" },
    { method: METHOD_ARTIFACT_READ, kind: "request" },
    { method: METHOD_FILE_SYSTEM_LIST_DIRECTORY, kind: "request" },
    { method: METHOD_FILE_SYSTEM_READ_FILE_PREVIEW, kind: "request" },
    { method: METHOD_EVIDENCE_EXPORT, kind: "request" },
    { method: METHOD_AGENT_SESSION_LIST, kind: "request" },
    { method: METHOD_AGENT_SESSION_UPDATE, kind: "request" },
    { method: METHOD_WORKSPACE_LIST, kind: "request" },
    { method: METHOD_WORKSPACE_READ, kind: "request" },
    { method: METHOD_WORKSPACE_BY_PATH_READ, kind: "request" },
    { method: METHOD_WORKSPACE_DEFAULT_READ, kind: "request" },
    { method: METHOD_WORKSPACE_DEFAULT_ENSURE, kind: "request" },
    { method: METHOD_WORKSPACE_PROJECTS_ROOT_READ, kind: "request" },
    { method: METHOD_WORKSPACE_PROJECT_PATH_RESOLVE, kind: "request" },
    { method: METHOD_WORKSPACE_ENSURE_READY, kind: "request" },
    { method: METHOD_SKILL_LIST, kind: "request" },
    { method: METHOD_SKILL_READ, kind: "request" },
    { method: METHOD_WORKSPACE_SKILL_BINDINGS_LIST, kind: "request" },
    { method: METHOD_WORKSPACE_REGISTERED_SKILLS_LIST, kind: "request" },
    { method: METHOD_AGENT_APP_INSTALLED_LIST, kind: "request" },
    { method: METHOD_AGENT_APP_UI_RUNTIME_START, kind: "request" },
    { method: METHOD_AGENT_APP_UI_RUNTIME_STATUS, kind: "request" },
    { method: METHOD_AGENT_APP_UI_RUNTIME_STOP, kind: "request" },
    { method: METHOD_KNOWLEDGE_PACK_LIST, kind: "request" },
    { method: METHOD_AUTOMATION_JOB_LIST, kind: "request" },
    { method: METHOD_PROJECT_MEMORY_READ, kind: "request" },
    { method: METHOD_MODEL_LIST, kind: "request" },
    { method: METHOD_MODEL_PREFERENCES_LIST, kind: "request" },
    { method: METHOD_MODEL_SYNC_STATE_READ, kind: "request" },
    { method: METHOD_MODEL_PROVIDER_LIST, kind: "request" },
    { method: METHOD_MODEL_PROVIDER_CATALOG_LIST, kind: "request" },
    { method: METHOD_MODEL_PROVIDER_ALIAS_READ, kind: "request" },
    { method: METHOD_MODEL_PROVIDER_ALIAS_LIST, kind: "request" },
    { method: METHOD_CONNECT_DEEP_LINK_RESOLVE, kind: "request" },
    { method: METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE, kind: "request" },
    { method: METHOD_CONNECT_RELAY_API_KEY_SAVE, kind: "request" },
    { method: METHOD_CONNECT_CALLBACK_SEND, kind: "request" },
    { method: METHOD_AGENT_SESSION_START, kind: "request" },
    { method: METHOD_AGENT_SESSION_READ, kind: "request" },
    { method: METHOD_AGENT_SESSION_TURN_START, kind: "request" },
    { method: METHOD_AGENT_SESSION_TURN_CANCEL, kind: "request" },
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
  assert.equal(isAppServerRequestMethod(METHOD_EVIDENCE_EXPORT), true);
  assert.equal(isAppServerRequestMethod(METHOD_AGENT_SESSION_UPDATE), true);
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
  assert.equal(isAppServerRequestMethod(METHOD_AUTOMATION_JOB_LIST), true);
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
    "agentSession/update archived is only supported for persisted current timeline sessions";
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

test("connection wraps file system read responses", async () => {
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

  assert.equal(sent[0].method, METHOD_FILE_SYSTEM_LIST_DIRECTORY);
  assert.deepEqual(sent[0].params, {
    path: "/workspace",
  });
  assert.equal(sent[1].method, METHOD_FILE_SYSTEM_READ_FILE_PREVIEW);
  assert.deepEqual(sent[1].params, {
    path: "/workspace/README.md",
    maxSize: 1024,
  });
  assert.equal(result.result.entries[0].name, "README.md");
  assert.equal(previewResult.result.content, "# Lime");
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

test("uses codex style stdio sidecar launch args", () => {
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
    }),
    ["--stdio", "--backend", "unavailable"],
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
});

test("verifies release artifact sha256 before sidecar launch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-client-"));
  const binaryPath = join(dir, sidecarBinaryName("darwin"));

  try {
    await writeFile(binaryPath, "sidecar-binary");
    const sha256 = sha256Hex("sidecar-binary");
    const config = sidecarFromReleaseArtifact(binaryPath, {
      platform: "darwin-arm64",
      url: "https://example/app-server-darwin-arm64.tar.gz",
      sha256,
    });

    assert.equal(config.expectedSha256, sha256);
    assert.equal(config.backendMode, DEFAULT_STANDALONE_BACKEND_MODE);
    assert.deepEqual(sidecarArgs(config), [
      "--stdio",
      "--backend",
      "unavailable",
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
      v0: ["AgentSessionTurnStartParams", "RuntimeOptions"],
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

      const response = await sidecar.nextMessage(1_000);
      assert.equal(response.id, 1);
      assert.deepEqual(response.result, {
        method: "initialize",
        ok: true,
      });
      await waitFor(() => sidecar.stderrLines.includes("fake-sidecar-ready"));
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
        initializeTimeoutMs: 1_000,
      },
    );

    try {
      assert.equal(
        connected.initializeResponse.serverInfo.protocolVersion,
        PROTOCOL_VERSION,
      );
      await waitFor(() =>
        connected.sidecar.stderrLines.includes("initialized-received"),
      );

      connected.sidecar.send(
        connected.client.startSession({
          appId: "content-studio",
        }),
      );
      const response = await connected.sidecar.nextMessage(1_000);
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
        initializeTimeoutMs: 1_000,
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
      2_000,
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
        initializeTimeoutMs: 1_000,
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
