import { vi } from "vitest";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryPluginCapabilityStore } from "../adapters/InMemoryPluginCapabilityStore";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildLimeRuntimeProfileForPreview } from "../runtime-profile";
import { buildContentFactoryUiRuntimeTestManifest } from "./contentFactoryTestManifest";
import type { CapabilityHost } from "../sdk/CapabilityHost";
import type { PluginRuntimeProcessView, PluginTaskRecord } from "../types";
import { AgentRuntimeCapabilityHost } from "../runtime/agentRuntimeCapabilityHost";
import { createPluginCapabilityDispatcher } from "../runtime/capabilityDispatcher";
import type { PluginHostBridgeCapabilityRequest } from "../runtime/hostBridge";
import { buildWorkflowRuntimeCapabilityProfile } from "./workflowRuntimeCapabilityProfile";
import type { PluginWorkflowReadClient } from "../runtime/workflowReadProjection";

export const FIXED_NOW = "2026-05-15T00:00:00.000Z";

export type CapabilityRequestFixture = Omit<
  PluginHostBridgeCapabilityRequest,
  "invokeRequest"
> &
  Partial<Pick<PluginHostBridgeCapabilityRequest, "invokeRequest">>;

export function buildCapabilityRequest(
  request: CapabilityRequestFixture,
): PluginHostBridgeCapabilityRequest {
  return {
    ...request,
    invokeRequest:
      request.invokeRequest ??
      ({
        capability: request.capability,
        method: request.method,
        args: request.input ?? request.args?.[0],
        requestId: request.requestId,
      } as PluginHostBridgeCapabilityRequest["invokeRequest"]),
  };
}

export function buildDispatcher(
  standardProfile: {
    manifestVersion?: string;
    agentRuntime?: unknown;
    requirements?: unknown;
    boundary?: unknown;
    integrations?: unknown;
    operations?: unknown;
    workflowClient?: PluginWorkflowReadClient;
  } = {},
) {
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile,
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const host = new AdapterCapabilityHost({
    preview,
    store: new InMemoryPluginCapabilityStore(),
    now: () => FIXED_NOW,
  });

  const dispatch = createPluginCapabilityDispatcher({
    host,
    projection: preview.projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
    profile,
    runtimeProfile: buildLimeRuntimeProfileForPreview({
      preview,
      hostProfile: profile,
    }),
    ...standardProfile,
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

export function buildDispatcherWithCloudSessionCapability() {
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile,
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const host = new AdapterCapabilityHost({
    preview,
    store: new InMemoryPluginCapabilityStore(),
    now: () => FIXED_NOW,
  });
  const projection = {
    ...preview.projection,
    requiredCapabilities: [
      ...preview.projection.requiredCapabilities,
      {
        capability: "lime.cloudSession",
        requestedRange: "^0.1.0",
        required: true,
        declaredBy: ["requires" as const],
        entryKey: "dashboard",
      },
    ],
  };

  const dispatch = createPluginCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
    profile,
    runtimeProfile: buildLimeRuntimeProfileForPreview({
      preview,
      hostProfile: profile,
    }),
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

export function buildDispatcherWithoutDeclaredCapability(capability: string) {
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const host = new AdapterCapabilityHost({
    preview,
    store: new InMemoryPluginCapabilityStore(),
    now: () => FIXED_NOW,
  });
  const projection = {
    ...preview.projection,
    entries: preview.projection.entries.map((entry) => ({
      ...entry,
      requiredCapabilities: entry.requiredCapabilities.filter(
        (requirement) => requirement.capability !== capability,
      ),
    })),
    requiredCapabilities: preview.projection.requiredCapabilities.filter(
      (requirement) => requirement.capability !== capability,
    ),
  };

  const dispatch = createPluginCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

export function buildDispatcherWithoutCreativeCapabilityToolRef() {
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const host = new AdapterCapabilityHost({
    preview,
    store: new InMemoryPluginCapabilityStore(),
    now: () => FIXED_NOW,
  });
  const projection = {
    ...preview.projection,
    toolRequirements: preview.projection.toolRequirements.filter(
      (tool) => tool.key !== "creative_capability_search",
    ),
  };

  const dispatch = createPluginCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

export function buildDispatcherWithoutCreativeCapabilityAllowlist() {
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const host = new AdapterCapabilityHost({
    preview,
    store: new InMemoryPluginCapabilityStore(),
    now: () => FIXED_NOW,
  });
  const projection = {
    ...preview.projection,
    toolRequirements: preview.projection.toolRequirements.map((tool) =>
      tool.key === "creative_capability_search"
        ? { ...tool, capabilities: [] }
        : tool,
    ),
  };

  const dispatch = createPluginCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

export function buildRuntimeProjectionDispatcher(
  options: {
    includeConnectorAuthorization?: boolean;
    connectorAuthorizationStatus?: PluginTaskRecord["status"];
  } = {},
) {
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile,
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const runtimeProcess: PluginRuntimeProcessView = {
    timeline: [
      {
        kind: "routing",
        title: "模型路由",
        statusText: "已决策",
        message: "openai/gpt-4.1",
      },
      {
        kind: "metrics",
        title: "消耗统计",
        statusText: "已记录",
        message: "1540 tokens",
      },
      {
        kind: "tool",
        title: "Tool · web_search",
        statusText: "已完成",
        message: "检索竞品资料来源。",
        meta: "web_search:run-1",
      },
      {
        kind: "tool",
        title: "Tool · browser.extract",
        statusText: "已完成",
        message: "读取网页正文。",
        meta: "browser:run-1",
      },
      {
        kind: "tool",
        title: "Tool · document_parser",
        statusText: "已完成",
        message: "解析 PDF brief。",
        meta: "document:run-1",
      },
      {
        kind: "tool",
        title: "Tool · image_generation",
        statusText: "已完成",
        message: "生成配套封面图。",
        meta: "media:run-1",
      },
      {
        kind: "tool",
        title: "Tool · mcp__research__search",
        statusText: "已完成",
        message: "读取 MCP research server 结果。",
        meta: "mcp:run-1",
      },
      {
        kind: "execution",
        title: "Tool · terminal.run",
        statusText: "已完成",
        message: "执行受控命令生成素材清单。",
        meta: "terminal:run-1",
      },
      {
        kind: "tool",
        title: "Tool · connector__notion__createPage",
        statusText: "已完成",
        message: "通过外部连接器写入内容看板。",
        meta: "connector:run-1",
      },
    ],
    streamText: "已生成内容策略。",
    thinkingText: "",
    executionText: "",
    skillNames: ["content-strategist"],
    invokedSkillNames: ["content-strategist"],
    model: { provider: "openai", model: "gpt-4.1", label: "openai/gpt-4.1" },
    usage: {
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
      cachedInputTokens: 100,
      cacheCreationInputTokens: 40,
    },
    cost: {
      estimatedTotalCost: 0.043,
      estimatedCostClass: "low",
      currency: "USD",
    },
    terminal: true,
    collapsedByDefault: true,
    routingCount: 1,
    executionCount: 1,
    artifactCount: 1,
  };
  const task: PluginTaskRecord = {
    taskId: "plugin-task-1",
    traceId: "plugin-trace-1",
    appId: "content-factory-app",
    entryKey: "dashboard",
    title: "生成内容场景",
    prompt: "基于项目知识生成内容场景",
    taskKind: "content.scenario_planning",
    idempotencyKey: "dashboard:scenario",
    input: { projectId: "project-1" },
    expectedOutput: { artifactKind: "content_table" },
    knowledge: [
      {
        key: "project_knowledge",
        mode: "retrieval",
        required: true,
      },
    ],
    tools: ["content-strategist"],
    files: [],
    secrets: [],
    humanReview: true,
    status: "succeeded",
    startedAt: FIXED_NOW,
    finishedAt: "2026-05-15T00:01:00.000Z",
    result: {
      thread_id: "agent-runtime-thread-1",
      status: "completed",
      diagnostics: {
        context_compaction_count: 1,
        pending_request_count: 0,
      },
      model_routing: {
        selectedProvider: "openai",
        selectedModel: "gpt-4.1",
        requestedModel: "gpt-4.1",
        routingMode: "auto",
        decisionSource: "runtime_model_resolution",
        decisionReason: "matched_required_capabilities",
        candidateCount: 3,
        fallbackChain: ["openai/gpt-4.1", "deepseek/deepseek-v4-flash"],
        estimatedCostClass: "low",
      },
      limit_state: {
        status: "normal",
        candidateCount: 3,
        singleCandidateOnly: false,
        providerLocked: false,
        settingsLocked: false,
        oemLocked: false,
        notes: ["当前回合可在 3 个候选模型中路由。"],
      },
      cost_state: {
        status: "estimated",
        estimatedCostClass: "low",
        estimatedTotalCost: 0.043,
        currency: "USD",
        inputPerMillion: 0.8,
        outputPerMillion: 3.2,
        cacheReadPerMillion: 0.08,
        cacheWritePerMillion: 1,
        inputTokens: 1200,
        outputTokens: 340,
        totalTokens: 1540,
      },
      request_metadata: {
        workspace_skill_bindings: {
          source: "p3c_runtime_binding",
          bindings: [
            {
              key: "capability-report",
              directory: "capability-report",
              name: "只读 CLI 报告",
              description: "把只读 CLI 输出整理成 Markdown 报告。",
              binding_status: "ready_for_manual_enable",
              next_gate: "manual_runtime_enable",
              runtime_gate: "manual_session_enable_required",
              query_loop_visible: false,
              tool_runtime_visible: false,
              launch_enabled: false,
              permission_summary: ["Level 0 只读发现"],
            },
          ],
        },
      },
      context_summary: {
        memory_budget: {
          used_tokens: 640,
          max_tokens: 1200,
          status: "ready",
          source: "knowledge_context_resolver",
        },
        retrieval_refs: [
          {
            source_id: "knowledge_pack:brand:compiled/splits/brief.md",
            kind: "knowledge_pack",
            title: "brand:brief",
            path: "compiled/splits/brief.md",
            scope: "workspace",
            status: "ready",
            source: "knowledge_context_resolver",
          },
        ],
        missing_context: [
          {
            id: "knowledge_warning:0",
            kind: "knowledge_warning",
            label: "sources/missing.md",
            status: "unknown",
            reason: "缺少来源",
            source: "knowledge_context_resolver",
          },
        ],
        team_memory_refs: [
          {
            key: "team.selection",
            repo_scope: "/repo/lime",
            updated_at: 1710000000,
            source: "team_memory_shadow",
          },
        ],
      },
      tool_calls: [
        {
          id: "thread-tool-search-1",
          tool_name: "web_search",
          status: "completed",
          started_at: "2026-05-15T00:00:10.000Z",
          finished_at: "2026-05-15T00:00:20.000Z",
          message: "threadRead 记录了真实搜索工具调用。",
          input: { query: "竞品" },
          output: { citationCount: 2 },
        },
      ],
      turns: [
        {
          turn_id: "agent-runtime-turn-1",
          status: "completed",
          tool_calls: [
            {
              id: "thread-connector-notion-1",
              tool_name: "connector__notion__createPage",
              status: "completed",
              started_at: "2026-05-15T00:00:30.000Z",
              finished_at: "2026-05-15T00:00:40.000Z",
              message: "threadRead 记录了连接器写入调用。",
              input: { connectorId: "notion", title: "内容计划" },
              output: { pageId: "notion-page-1" },
            },
          ],
        },
      ],
      telemetry_summary: {
        join_status: "available",
        trace_ids: ["plugin-trace-1"],
      },
      summary: "已生成内容策略。",
    },
    trace: [],
    events: [],
    runtimeProcess,
    process: runtimeProcess,
    provenance: {
      sourceKind: "plugin",
      appId: "content-factory-app",
      appVersion: preview.identity.appVersion,
      packageHash: preview.identity.packageHash,
      manifestHash: preview.identity.manifestHash,
      entryKey: "dashboard",
      taskId: "plugin-task-1",
    },
  };
  const connectorAuthorizationTask: PluginTaskRecord = {
    taskId: "plugin-connector-auth-1",
    traceId: "plugin-connector-auth-trace-1",
    appId: "content-factory-app",
    entryKey: "dashboard",
    title: "Connector authorization · slack",
    prompt: "请由 Lime Host 创建 host-managed Slack 授权绑定。",
    taskKind: "plugin.connector_authorization",
    idempotencyKey: "dashboard:connector:slack:auth",
    input: {
      authorizationRequest: {
        capability: "lime.connectors",
        method: "requestAuth",
        appId: "content-factory-app",
        entryKey: "dashboard",
        connectorId: "slack",
        reason: "同步发布状态",
        policy: {
          owner: "lime_connector_policy",
          scope: "plugin_session",
          approvalRequired: true,
          mutationExposed: false,
          tokenExposed: false,
          secretBinding: "host_managed",
          sessionScoped: true,
          reason: "connector_auth_requires_lime_policy_and_secret_binding",
        },
      },
    },
    expectedOutput: {
      kind: "connector_authorization_request",
      connectorId: "slack",
      secretBinding: "host_managed",
      tokenExposed: false,
    },
    knowledge: [],
    tools: [],
    files: [],
    secrets: [],
    humanReview: true,
    status: options.connectorAuthorizationStatus ?? "running",
    startedAt: "2026-05-15T00:02:00.000Z",
    finishedAt:
      options.connectorAuthorizationStatus === "succeeded"
        ? "2026-05-15T00:02:30.000Z"
        : undefined,
    trace: [],
    events: [],
    provenance: {
      sourceKind: "plugin",
      appId: "content-factory-app",
      appVersion: preview.identity.appVersion,
      packageHash: preview.identity.packageHash,
      manifestHash: preview.identity.manifestHash,
      entryKey: "dashboard",
      taskId: "plugin-connector-auth-1",
    },
  };
  const host: CapabilityHost = {
    createSdkContext: () => {
      throw new Error("runtime projection test should not create SDK context");
    },
    runEntry: async () => {
      throw new Error("runtime projection test should not run entries");
    },
    getArtifacts: () => [],
    getEvidence: () => [],
    getStorageEntries: () => [],
    getTasks: () =>
      options.includeConnectorAuthorization
        ? [task, connectorAuthorizationTask]
        : [task],
    uninstall: async () => ({
      appId: "content-factory-app",
      mode: "keep-data",
      deletedTargets: [],
      retainedTargets: [],
      warnings: [],
    }),
  };
  const projection = {
    ...preview.projection,
    requiredCapabilities: [
      ...preview.projection.requiredCapabilities,
      {
        capability: "lime.models",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.usage",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.skills",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.memory",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.context",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.tasks",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.tools",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.search",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.browser",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.documents",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.media",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.mcp",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.terminal",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.connectors",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
    ],
  };
  const dispatch = createPluginCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    profile,
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

export function buildToolExecutionHandoffDispatcher() {
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile,
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const delegate = new AdapterCapabilityHost({
    preview,
    store: new InMemoryPluginCapabilityStore(),
    now: () => FIXED_NOW,
  });
  const api = {
    startTask: vi.fn(async (request) => ({
      appId: request.appId,
      entryKey: request.entryKey,
      taskId: "plugin-tool-task-1",
      traceId: "plugin-tool-trace-1",
      taskKind: request.taskKind,
      sessionId: request.sessionId ?? "agent-runtime-session-1",
      threadId: "agent-runtime-thread-1",
      turnId: "plugin-tool-turn-1",
      eventName: `plugin_runtime:${request.appId}:plugin-tool-task-1`,
      status: "accepted" as const,
      submittedAt: FIXED_NOW,
    })),
    getTask: vi.fn(),
    cancelTask: vi.fn(async (request) => ({
      appId: request.appId,
      taskId: request.taskId,
      sessionId: "agent-runtime-session-1",
      threadId: request.threadId,
      cancelled: true,
      status: "cancelled" as const,
    })),
    submitHostResponse: vi.fn(),
  };
  const host = new AgentRuntimeCapabilityHost({
    delegate,
    appId: preview.identity.appId,
    appVersion: preview.identity.appVersion,
    packageHash: preview.identity.packageHash,
    manifestHash: preview.identity.manifestHash,
    workspaceIdResolver: async () => "workspace-1",
    api,
    now: () => FIXED_NOW,
  });
  const projection = {
    ...preview.projection,
    requiredCapabilities: [
      ...preview.projection.requiredCapabilities,
      {
        capability: "lime.tools",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.terminal",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
      {
        capability: "lime.connectors",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["requires" as const],
      },
    ],
  };
  const dispatch = createPluginCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    profile,
  });
  return {
    api,
    dispatch: (request: CapabilityRequestFixture) =>
      dispatch(buildCapabilityRequest(request)),
  };
}
