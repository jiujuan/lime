import { describe, expect, it } from "vitest";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryAgentAppCapabilityStore } from "../adapters/InMemoryAgentAppCapabilityStore";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import type { CapabilityHost } from "../sdk/CapabilityHost";
import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppRuntimeProcessView,
  AgentAppStorageEntry,
  AgentAppTaskRecord,
  AgentAppTaskStreamEvent,
} from "../types";
import { buildWorkflowRuntimeCapabilityProfile } from "./workflowRuntimeCapabilityProfile";
import {
  AgentAppCapabilityDispatcherError,
  createAgentAppCapabilityDispatcher,
} from "./capabilityDispatcher";
import type { AgentAppHostBridgeCapabilityRequest } from "./hostBridge";

const FIXED_NOW = "2026-05-15T00:00:00.000Z";

type CapabilityRequestFixture = Omit<
  AgentAppHostBridgeCapabilityRequest,
  "invokeRequest"
> &
  Partial<Pick<AgentAppHostBridgeCapabilityRequest, "invokeRequest">>;

function buildCapabilityRequest(
  request: CapabilityRequestFixture,
): AgentAppHostBridgeCapabilityRequest {
  return {
    ...request,
    invokeRequest:
      request.invokeRequest ??
      ({
        capability: request.capability,
        method: request.method,
        args: request.input ?? request.args?.[0],
        requestId: request.requestId,
      } as AgentAppHostBridgeCapabilityRequest["invokeRequest"]),
  };
}

function buildDispatcher(
  standardProfile: {
    manifestVersion?: string;
    agentRuntime?: unknown;
    requirements?: unknown;
    boundary?: unknown;
    integrations?: unknown;
    operations?: unknown;
  } = {},
) {
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const preview = buildInstalledAppPreview({
    profile,
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const host = new AdapterCapabilityHost({
    preview,
    store: new InMemoryAgentAppCapabilityStore(),
    now: () => FIXED_NOW,
  });

  const dispatch = createAgentAppCapabilityDispatcher({
    host,
    projection: preview.projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
    profile,
    ...standardProfile,
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

function buildDispatcherWithoutDeclaredCapability(capability: string) {
  const preview = buildInstalledAppPreview({
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
    store: new InMemoryAgentAppCapabilityStore(),
    now: () => FIXED_NOW,
  });
  const projection = {
    ...preview.projection,
    requiredCapabilities: preview.projection.requiredCapabilities.filter(
      (requirement) => requirement.capability !== capability,
    ),
  };

  const dispatch = createAgentAppCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

function buildDispatcherWithoutCreativeCapabilityToolRef() {
  const preview = buildInstalledAppPreview({
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
    store: new InMemoryAgentAppCapabilityStore(),
    now: () => FIXED_NOW,
  });
  const projection = {
    ...preview.projection,
    toolRequirements: preview.projection.toolRequirements.filter(
      (tool) => tool.key !== "creative_capability_search",
    ),
  };

  const dispatch = createAgentAppCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

function buildDispatcherWithoutCreativeCapabilityAllowlist() {
  const preview = buildInstalledAppPreview({
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
    store: new InMemoryAgentAppCapabilityStore(),
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

  const dispatch = createAgentAppCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

function buildRuntimeProjectionDispatcher() {
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const preview = buildInstalledAppPreview({
    profile,
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const runtimeProcess: AgentAppRuntimeProcessView = {
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
  const task: AgentAppTaskRecord = {
    taskId: "agent-app-task-1",
    traceId: "agent-app-trace-1",
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
      turns: [
        {
          turn_id: "agent-runtime-turn-1",
          status: "completed",
        },
      ],
      telemetry_summary: {
        join_status: "available",
        trace_ids: ["agent-app-trace-1"],
      },
      summary: "已生成内容策略。",
    },
    trace: [],
    events: [],
    runtimeProcess,
    process: runtimeProcess,
    provenance: {
      sourceKind: "agent_app",
      appId: "content-factory-app",
      appVersion: preview.identity.appVersion,
      packageHash: preview.identity.packageHash,
      manifestHash: preview.identity.manifestHash,
      entryKey: "dashboard",
      taskId: "agent-app-task-1",
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
    getTasks: () => [task],
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
  const dispatch = createAgentAppCapabilityDispatcher({
    host,
    projection,
    entryKey: "dashboard",
    profile,
  });
  return (request: CapabilityRequestFixture) =>
    dispatch(buildCapabilityRequest(request));
}

describe("createAgentAppCapabilityDispatcher", () => {
  it("应通过 lime.capabilities 暴露 Host discovery profile，且不泄露内部路径", async () => {
    const dispatch = buildDispatcher();

    const list = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.capabilities",
      method: "list",
      rawPayload: {
        capability: "lime.capabilities",
        method: "list",
      },
    })) as Array<Record<string, unknown>>;

    const agent = list.find((item) => item.name === "lime.agent");
    const discovery = list.find((item) => item.name === "lime.capabilities");
    expect(agent).toMatchObject({
      name: "lime.agent",
      version: "0.3.0",
      stage: "current",
      owner: "agent_runtime",
      enabled: true,
      implementation: "adapter",
    });
    expect(discovery).toMatchObject({
      name: "lime.capabilities",
      stage: "preview",
      owner: "desktop_host",
      enabled: true,
      implementation: "native",
    });
    expect(discovery).not.toHaveProperty("unavailableReason");
    expect(Object.keys(discovery ?? {})).not.toEqual(
      expect.arrayContaining(["path", "sourceFile", "internal"]),
    );

    const single = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.capabilities",
      method: "get",
      input: { capability: "lime.agent" },
      rawPayload: {
        capability: "lime.capabilities",
        method: "get",
      },
    });
    expect(single).toMatchObject({
      name: "lime.agent",
      methods: expect.arrayContaining(["startTask", "streamTask", "getTask"]),
      enabled: true,
    });

    const profile = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.capabilities",
      method: "getProfile",
      rawPayload: {
        capability: "lime.capabilities",
        method: "getProfile",
      },
    })) as Record<string, unknown>;
    expect(profile).toMatchObject({
      appRuntimeVersion: "0.7.0",
      standardVersions: {
        current: "0.7",
        compatible: ["0.5", "0.6", "0.7"],
      },
      standards: expect.objectContaining({
        layeredManifest: expect.objectContaining({
          version: "0.5",
          enabled: true,
          layerFiles: expect.arrayContaining(["app.capabilities.yaml"]),
        }),
        agentRuntime: expect.objectContaining({
          version: "0.6",
          enabled: false,
          layerFiles: ["app.runtime.yaml"],
        }),
        requirementBoundary: expect.objectContaining({
          version: "0.7",
          enabled: false,
          layerFiles: expect.arrayContaining([
            "app.requirements.yaml",
            "app.boundary.yaml",
            "app.integrations.yaml",
            "app.operations.yaml",
          ]),
          hostCloudManagedExecution: true,
          externalSideEffectsRequireApproval: true,
        }),
      }),
      runtimeTargets: ["local"],
      capabilities: expect.objectContaining({
        "lime.capabilities": expect.objectContaining({
          enabled: true,
          implementation: "native",
        }),
        "lime.models": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.usage": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.skills": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.memory": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.context": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.search": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.browser": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.documents": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.media": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.mcp": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.terminal": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
        "lime.connectors": expect.objectContaining({
          enabled: true,
          implementation: "adapter",
        }),
      }),
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.capabilities",
        method: "get",
        input: { capability: "lime.unknown" },
        rawPayload: {
          capability: "lime.capabilities",
          method: "get",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_FOUND",
    });
  });

  it("应通过 lime.capabilities.getProfile 暴露 v0.7 需求边界与能力交接合同", async () => {
    const requirements = {
      requirements: [
        {
          id: "CF-R001",
          text: "生成可审核内容草稿",
          priority: "mvp",
        },
      ],
      nonGoals: ["不在 App 包内保存外部凭证"],
    };
    const boundary = {
      boundaries: [
        {
          requirementId: "CF-R001",
          planes: {
            app: { owns: ["workflow_state"] },
            host: { requires: ["lime.agent", "lime.evidence"] },
          },
        },
      ],
    };
    const integrations = [
      {
        key: "planning_table",
        provider: "cloud.table",
        executionPlane: "hybrid",
        hostCapability: "lime.connectors",
      },
    ];
    const operations = [
      {
        key: "write_external_draft",
        type: "external_write",
        sideEffect: "external_write",
        approvalRequired: true,
        dryRunRequired: true,
        evidenceRequired: true,
        autoExecute: false,
      },
    ];
    const dispatch = buildDispatcher({
      manifestVersion: "0.7",
      requirements,
      boundary,
      integrations,
      operations,
    });

    const profile = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.capabilities",
      method: "getProfile",
      rawPayload: {
        capability: "lime.capabilities",
        method: "getProfile",
      },
    })) as Record<string, unknown>;

    expect(profile).toMatchObject({
      appRuntimeVersion: "0.7.0",
      standardVersions: {
        current: "0.7",
        compatible: ["0.5", "0.6", "0.7"],
      },
      requirements,
      boundary,
      integrations,
      operations,
      standards: expect.objectContaining({
        requirementBoundary: expect.objectContaining({
          version: "0.7",
          enabled: true,
          manifestVersion: "0.7",
          requirementCount: 1,
          boundaryCount: 1,
          integrationCount: 1,
          operationCount: 1,
          appCredentialsBoundary: "host_or_cloud_managed",
        }),
      }),
    });
  });

  it("应通过 lime.models / lime.usage 投影 AgentRuntime 模型与用量事实", async () => {
    const dispatch = buildRuntimeProjectionDispatcher();

    const models = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.models",
      method: "list",
      rawPayload: {
        capability: "lime.models",
        method: "list",
      },
    });
    expect(models).toMatchObject({
      appId: "content-factory-app",
      source: "agent_runtime_projection",
      taskCount: 1,
      models: [
        expect.objectContaining({
          provider: "openai",
          model: "gpt-4.1",
          label: "openai/gpt-4.1",
          taskCount: 1,
          taskKinds: ["content.scenario_planning"],
        }),
      ],
    });

    const routing = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.models",
      method: "getRouting",
      input: { taskId: "agent-app-task-1" },
      rawPayload: {
        capability: "lime.models",
        method: "getRouting",
      },
    });
    expect(routing).toMatchObject({
      source: "agent_runtime_projection",
      routes: [
        expect.objectContaining({
          taskId: "agent-app-task-1",
          model: {
            provider: "openai",
            model: "gpt-4.1",
            label: "openai/gpt-4.1",
          },
        }),
      ],
    });

    const tokenUsage = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.usage",
      method: "getTokenUsage",
      input: { taskId: "agent-app-task-1" },
      rawPayload: {
        capability: "lime.usage",
        method: "getTokenUsage",
      },
    });
    expect(tokenUsage).toMatchObject({
      appId: "content-factory-app",
      source: "agent_runtime_projection",
      taskCount: 1,
      totals: {
        inputTokens: 1200,
        outputTokens: 340,
        totalTokens: 1540,
        cachedInputTokens: 100,
        cacheCreationInputTokens: 40,
      },
      tasks: [
        expect.objectContaining({
          taskId: "agent-app-task-1",
          usage: expect.objectContaining({ totalTokens: 1540 }),
        }),
      ],
    });

    const costSummary = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.usage",
      method: "getCostSummary",
      input: { taskId: "agent-app-task-1" },
      rawPayload: {
        capability: "lime.usage",
        method: "getCostSummary",
      },
    });
    expect(costSummary).toMatchObject({
      source: "agent_runtime_projection",
      cost: {
        estimatedTotalCost: 0.043,
        currency: "USD",
      },
    });
  });

  it("应通过 lime.skills 投影 AgentRuntime Skill 声明与调用事实", async () => {
    const dispatch = buildRuntimeProjectionDispatcher();

    const listed = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.skills",
      method: "list",
      rawPayload: {
        capability: "lime.skills",
        method: "list",
      },
    });
    expect(listed).toMatchObject({
      appId: "content-factory-app",
      source: "agent_runtime_process",
      taskCount: 1,
      skills: [
        expect.objectContaining({
          skillId: "content-strategist",
          name: "content-strategist",
          status: "invoked",
          taskCount: 1,
          invocationCount: 1,
          taskIds: ["agent-app-task-1"],
          taskKinds: ["content.scenario_planning"],
          source: "agent_runtime_process",
        }),
      ],
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.skills",
        method: "resolve",
        input: { skillId: "content-strategist" },
        rawPayload: {
          capability: "lime.skills",
          method: "resolve",
        },
      }),
    ).resolves.toMatchObject({
      skillId: "content-strategist",
      status: "invoked",
      invocationCount: 1,
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.skills",
        method: "getInvocation",
        input: { invocationId: "agent-app-task-1:content-strategist" },
        rawPayload: {
          capability: "lime.skills",
          method: "getInvocation",
        },
      }),
    ).resolves.toMatchObject({
      invocationId: "agent-app-task-1:content-strategist",
      skillId: "content-strategist",
      taskId: "agent-app-task-1",
      status: "succeeded",
      source: "agent_runtime_process",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.skills",
        method: "bind",
        input: { skillId: "content-strategist" },
        rawPayload: {
          capability: "lime.skills",
          method: "bind",
        },
      }),
    ).resolves.toEqual({
      status: "not_available",
      reason: "skill_runtime_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_process",
    });
  });

  it("应通过 lime.memory / lime.context 投影只读记忆与上下文状态", async () => {
    const dispatch = buildRuntimeProjectionDispatcher();

    const memoryStatus = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.memory",
      method: "getStatus",
      rawPayload: {
        capability: "lime.memory",
        method: "getStatus",
      },
    });
    expect(memoryStatus).toMatchObject({
      appId: "content-factory-app",
      status: "read_only_projection",
      source: "agent_runtime_projection",
      writable: false,
      compactable: false,
      totals: {
        knowledgeBindingCount: 1,
        contextCompactionCount: 1,
        pendingRequestCount: 0,
      },
      observations: [
        expect.objectContaining({
          taskId: "agent-app-task-1",
          knowledgeBindingKeys: ["project_knowledge"],
          contextCompactionCount: 1,
        }),
      ],
    });

    const memoryQuery = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.memory",
      method: "query",
      input: { query: "project_knowledge" },
      rawPayload: {
        capability: "lime.memory",
        method: "query",
      },
    });
    expect(memoryQuery).toMatchObject({
      status: "limited_projection",
      source: "agent_runtime_projection",
      records: [
        expect.objectContaining({
          taskId: "agent-app-task-1",
          knowledgeBindingKeys: ["project_knowledge"],
        }),
      ],
    });

    const contextSnapshot = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.context",
      method: "getSnapshot",
      rawPayload: {
        capability: "lime.context",
        method: "getSnapshot",
      },
    });
    expect(contextSnapshot).toMatchObject({
      appId: "content-factory-app",
      source: "agent_runtime_projection",
      taskCount: 1,
      contexts: [
        expect.objectContaining({
          taskId: "agent-app-task-1",
          traceId: "agent-app-trace-1",
          threadId: "agent-runtime-thread-1",
          turnIds: ["agent-runtime-turn-1"],
          knowledgeBindingKeys: ["project_knowledge"],
          toolKeys: ["content-strategist"],
          inputAttached: true,
          expectedOutputAttached: true,
        }),
      ],
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.memory",
        method: "write",
        input: { scope: "task", value: { note: "不要直接写入" } },
        rawPayload: {
          capability: "lime.memory",
          method: "write",
        },
      }),
    ).resolves.toEqual({
      status: "not_available",
      reason: "memory_runtime_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_projection",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.memory",
        method: "compact",
        input: { scope: "task" },
        rawPayload: {
          capability: "lime.memory",
          method: "compact",
        },
      }),
    ).resolves.toEqual({
      status: "not_available",
      reason: "memory_runtime_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_projection",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.context",
        method: "attach",
        input: { ref: "artifact-1" },
        rawPayload: {
          capability: "lime.context",
          method: "attach",
        },
      }),
    ).resolves.toEqual({
      status: "not_available",
      reason: "context_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_projection",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.context",
        method: "detach",
        input: { ref: "artifact-1" },
        rawPayload: {
          capability: "lime.context",
          method: "detach",
        },
      }),
    ).resolves.toEqual({
      status: "not_available",
      reason: "context_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_projection",
    });
  });

  it("应通过 ToolRuntime preview capabilities 暴露受控工具意图和运行投影", async () => {
    const dispatch = buildRuntimeProjectionDispatcher();

    const searchIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.search",
      method: "query",
      input: { query: "竞品资料", limit: 3 },
      rawPayload: {
        capability: "lime.search",
        method: "query",
      },
    });
    expect(searchIntent).toMatchObject({
      appId: "content-factory-app",
      capability: "lime.search",
      method: "query",
      status: "requires_agent_task",
      reason: "search_execution_requires_lime_agent_task",
      source: "tool_runtime_policy",
      intent: { query: "竞品资料", limit: 3 },
      toolHints: ["lime.capability.research.search", "web_search"],
      next: {
        capability: "lime.agent",
        method: "startTask",
      },
      matchingRuns: [
        expect.objectContaining({
          runId: "web_search:run-1",
          capability: "lime.search",
          toolName: "web_search",
          taskId: "agent-app-task-1",
          source: "agent_runtime_process",
        }),
      ],
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.search",
        method: "getRun",
        input: { runId: "web_search:run-1" },
        rawPayload: {
          capability: "lime.search",
          method: "getRun",
        },
      }),
    ).resolves.toMatchObject({
      runId: "web_search:run-1",
      capability: "lime.search",
      status: "succeeded",
      title: "Tool · web_search",
    });

    const browserIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.browser",
      method: "open",
      input: { url: "https://example.com/brief" },
      rawPayload: {
        capability: "lime.browser",
        method: "open",
      },
    });
    expect(browserIntent).toMatchObject({
      capability: "lime.browser",
      method: "open",
      status: "requires_agent_task",
      reason: "browser_runtime_execution_requires_lime_tool_runtime_policy",
      source: "tool_runtime_policy",
      intent: { url: "https://example.com/brief" },
      matchingRuns: [
        expect.objectContaining({
          runId: "browser:run-1",
          capability: "lime.browser",
          toolName: "browser.extract",
        }),
      ],
    });

    const documentIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.documents",
      method: "parse",
      input: { ref: "file:brief.pdf" },
      rawPayload: {
        capability: "lime.documents",
        method: "parse",
      },
    });
    expect(documentIntent).toMatchObject({
      capability: "lime.documents",
      method: "parse",
      status: "requires_agent_task",
      reason: "document_runtime_execution_requires_lime_tool_runtime_policy",
      source: "tool_runtime_policy",
      intent: { ref: "file:brief.pdf" },
      matchingRuns: [
        expect.objectContaining({
          runId: "document:run-1",
          capability: "lime.documents",
          toolName: "document_parser",
        }),
      ],
    });

    const mediaIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.media",
      method: "generateImage",
      input: { prompt: "生成一张内容活动封面", size: "1024x1024" },
      rawPayload: {
        capability: "lime.media",
        method: "generateImage",
      },
    });
    expect(mediaIntent).toMatchObject({
      capability: "lime.media",
      method: "generateImage",
      status: "requires_agent_task",
      reason: "media_runtime_execution_requires_lime_tool_runtime_policy",
      source: "tool_runtime_policy",
      intent: { prompt: "生成一张内容活动封面", size: "1024x1024" },
      matchingRuns: [
        expect.objectContaining({
          runId: "media:run-1",
          capability: "lime.media",
          toolName: "image_generation",
        }),
      ],
    });

    const mcpServers = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.mcp",
      method: "listServers",
      rawPayload: {
        capability: "lime.mcp",
        method: "listServers",
      },
    });
    expect(mcpServers).toMatchObject({
      appId: "content-factory-app",
      status: "read_only_projection",
      source: "agent_runtime_process",
      servers: [
        expect.objectContaining({
          serverId: "research",
          toolCount: 1,
          runIds: ["mcp:run-1"],
        }),
      ],
    });

    const mcpIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.mcp",
      method: "invoke",
      input: { tool: "mcp__research__search", input: { query: "竞品" } },
      rawPayload: {
        capability: "lime.mcp",
        method: "invoke",
      },
    });
    expect(mcpIntent).toMatchObject({
      capability: "lime.mcp",
      method: "invoke",
      status: "requires_agent_task",
      reason: "mcp_execution_requires_lime_tool_runtime_policy",
      source: "tool_runtime_policy",
      intent: { tool: "mcp__research__search", input: { query: "竞品" } },
      matchingRuns: [
        expect.objectContaining({
          runId: "mcp:run-1",
          capability: "lime.mcp",
          toolName: "mcp__research__search",
        }),
      ],
    });

    const terminalIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.terminal",
      method: "run",
      input: { command: "npm run build:assets", reason: "生成素材清单" },
      rawPayload: {
        capability: "lime.terminal",
        method: "run",
      },
    });
    expect(terminalIntent).toMatchObject({
      capability: "lime.terminal",
      method: "run",
      status: "requires_agent_task",
      reason: "terminal_execution_requires_lime_sandbox_policy",
      source: "tool_runtime_policy",
      intent: {
        command: "npm run build:assets",
        reason: "生成素材清单",
      },
      matchingRuns: [
        expect.objectContaining({
          runId: "terminal:run-1",
          capability: "lime.terminal",
          toolName: "terminal.run",
        }),
      ],
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.terminal",
        method: "getRun",
        input: { runId: "terminal:run-1" },
        rawPayload: {
          capability: "lime.terminal",
          method: "getRun",
        },
      }),
    ).resolves.toMatchObject({
      runId: "terminal:run-1",
      capability: "lime.terminal",
      status: "succeeded",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.terminal",
        method: "cancel",
        input: { runId: "terminal:run-1" },
        rawPayload: {
          capability: "lime.terminal",
          method: "cancel",
        },
      }),
    ).resolves.toEqual({
      status: "not_available",
      reason: "terminal_runtime_cancellation_not_exposed_to_agent_apps",
      source: "tool_runtime_policy",
    });

    const connectors = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.connectors",
      method: "list",
      rawPayload: {
        capability: "lime.connectors",
        method: "list",
      },
    });
    expect(connectors).toMatchObject({
      appId: "content-factory-app",
      status: "read_only_projection",
      source: "agent_runtime_process",
      connectors: [
        expect.objectContaining({
          connectorId: "notion",
          actionIds: ["createPage"],
          runIds: ["connector:run-1"],
        }),
      ],
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.connectors",
        method: "getStatus",
        input: { connectorId: "notion" },
        rawPayload: {
          capability: "lime.connectors",
          method: "getStatus",
        },
      }),
    ).resolves.toMatchObject({
      connectorId: "notion",
      status: "observed",
      source: "agent_runtime_process",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.connectors",
        method: "requestAuth",
        input: { connectorId: "notion", reason: "同步内容看板" },
        rawPayload: {
          capability: "lime.connectors",
          method: "requestAuth",
        },
      }),
    ).resolves.toMatchObject({
      capability: "lime.connectors",
      method: "requestAuth",
      status: "requires_host_authorization",
      reason: "connector_auth_requires_lime_policy_and_secret_binding",
      intent: { connectorId: "notion", reason: "同步内容看板" },
    });

    const connectorIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.connectors",
      method: "invoke",
      input: {
        connectorId: "notion",
        action: "createPage",
        input: { title: "内容计划" },
      },
      rawPayload: {
        capability: "lime.connectors",
        method: "invoke",
      },
    });
    expect(connectorIntent).toMatchObject({
      capability: "lime.connectors",
      method: "invoke",
      status: "requires_agent_task",
      reason: "connector_execution_requires_lime_policy_and_secret_binding",
      source: "tool_runtime_policy",
      intent: {
        connectorId: "notion",
        action: "createPage",
        input: { title: "内容计划" },
      },
      matchingRuns: [
        expect.objectContaining({
          runId: "connector:run-1",
          capability: "lime.connectors",
          toolName: "connector__notion__createPage",
        }),
      ],
    });
  });

  it("应拒绝未声明的 runtime projection capability，避免 App 绕过 manifest", async () => {
    const dispatch = buildDispatcher();

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.usage",
        method: "getTokenUsage",
        rawPayload: {
          capability: "lime.usage",
          method: "getTokenUsage",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.skills",
        method: "list",
        rawPayload: {
          capability: "lime.skills",
          method: "list",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.memory",
        method: "getStatus",
        rawPayload: {
          capability: "lime.memory",
          method: "getStatus",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.context",
        method: "getSnapshot",
        rawPayload: {
          capability: "lime.context",
          method: "getSnapshot",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.search",
        method: "query",
        input: { query: "竞品资料" },
        rawPayload: {
          capability: "lime.search",
          method: "query",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.media",
        method: "generateImage",
        input: { prompt: "生成配图" },
        rawPayload: {
          capability: "lime.media",
          method: "generateImage",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.terminal",
        method: "run",
        input: { command: "npm run build" },
        rawPayload: {
          capability: "lime.terminal",
          method: "run",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.connectors",
        method: "invoke",
        input: { connectorId: "notion", action: "createPage" },
        rawPayload: {
          capability: "lime.connectors",
          method: "invoke",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
  });

  it("应把 App capability 请求收敛到 Lime Agent task，并保留 stream/cancel 事件", async () => {
    const dispatch = buildDispatcher();

    const task = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      requestId: "req-task",
      capability: "lime.agent",
      method: "startTask",
      input: {
        title: "生成内容场景",
        prompt: "基于项目知识生成内容规划",
        taskKind: "content.scenario_planning",
        idempotencyKey: "dashboard:scenario",
        input: { projectId: "project-1" },
        expectedOutput: { artifactKind: "content_table" },
        humanReview: true,
      },
      rawPayload: {
        capability: "lime.agent",
        method: "startTask",
      },
    })) as AgentAppTaskRecord;

    expect(task).toMatchObject({
      taskId: "adapter-task-1",
      traceId: "adapter-trace-1",
      entryKey: "dashboard",
      taskKind: "content.scenario_planning",
      idempotencyKey: "dashboard:scenario",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_table" },
      humanReview: true,
      provenance: expect.objectContaining({
        workflowRunId: "bridge-run-1",
      }),
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
      ],
    });

    const runningEvents = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "streamTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "streamTask",
      },
    })) as AgentAppTaskStreamEvent[];
    expect(runningEvents).toEqual([
      expect.objectContaining({ type: "task:status", status: "running" }),
    ]);

    const hostResponse = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "submitHostResponse",
      input: {
        taskId: task.taskId,
        requestId: "runtime-request-1",
        actionType: "ask_user",
        response: "补充项目定位。",
      },
      rawPayload: {
        capability: "lime.agent",
        method: "submitHostResponse",
      },
    });
    expect(hostResponse).toEqual({
      taskId: "adapter-task-1",
      requestId: "runtime-request-1",
      status: "submitted",
      submittedAt: FIXED_NOW,
    });

    const cancelled = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "cancelTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "cancelTask",
      },
    })) as AgentAppTaskRecord;
    expect(cancelled).toMatchObject({
      taskId: "adapter-task-1",
      status: "cancelled",
      cancelledAt: FIXED_NOW,
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
        expect.objectContaining({
          type: "task:progress",
          message: "Agent App host response 已提交。",
        }),
        expect.objectContaining({
          type: "task:cancelled",
          status: "cancelled",
        }),
      ],
    });

    const fetched = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "getTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "getTask",
      },
    })) as AgentAppTaskRecord;
    expect(fetched).toMatchObject({
      taskId: "adapter-task-1",
      status: "cancelled",
    });

    const retried = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "retryTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "retryTask",
      },
    })) as AgentAppTaskRecord;
    expect(retried).toMatchObject({
      taskId: "adapter-task-2",
      traceId: "adapter-trace-2",
      retryOfTaskId: "adapter-task-1",
      retryAttempt: 1,
      status: "running",
      idempotencyKey: "dashboard:scenario:retry:1",
      provenance: expect.objectContaining({
        workflowRunId: "bridge-run-1",
      }),
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
      ],
    });
  });

  it("应支持 storage 能力，同时拒绝未登记的方法", async () => {
    const dispatch = buildDispatcher();

    const stored = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.storage",
      method: "set",
      input: {
        key: "drafts/scenario",
        value: { title: "内容场景草稿" },
      },
      rawPayload: {
        capability: "lime.storage",
        method: "set",
      },
    })) as AgentAppStorageEntry;

    expect(stored).toMatchObject({
      key: "drafts/scenario",
      value: { title: "内容场景草稿" },
      provenance: expect.objectContaining({
        workflowRunId: "bridge-run-1",
      }),
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.storage",
        method: "dropDatabase",
        rawPayload: {
          capability: "lime.storage",
          method: "dropDatabase",
        },
      }),
    ).rejects.toBeInstanceOf(AgentAppCapabilityDispatcherError);
  });

  it("应拒绝 manifest 未声明的 Host capability，避免绕过声明边界", async () => {
    const dispatch = buildDispatcherWithoutDeclaredCapability("lime.agent");

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        requestId: "req-task",
        capability: "lime.agent",
        method: "startTask",
        input: {
          title: "生成内容场景",
          prompt: "基于项目知识生成内容规划",
          taskKind: "content.scenario_planning",
        },
        rawPayload: {
          capability: "lime.agent",
          method: "startTask",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
  });

  it("应拒绝 manifest 未声明的 Claw capability hint，保留 catalog 授权边界", async () => {
    const dispatch = buildDispatcherWithoutCreativeCapabilityToolRef();

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        requestId: "req-task",
        capability: "lime.agent",
        method: "startTask",
        input: {
          title: "生成内容场景",
          prompt: "基于项目知识生成内容规划",
          taskKind: "content.scenario_planning",
          tools: ["research.search"],
        },
        rawPayload: {
          capability: "lime.agent",
          method: "startTask",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });

    const allowedDispatch = buildDispatcher();
    const task = (await allowedDispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      requestId: "req-task-allowed",
      capability: "lime.agent",
      method: "startTask",
      input: {
        title: "生成内容场景",
        prompt: "基于项目知识生成内容规划",
        taskKind: "content.scenario_planning",
        tools: ["research.search"],
      },
      rawPayload: {
        capability: "lime.agent",
        method: "startTask",
      },
    })) as AgentAppTaskRecord;
    expect(task).toMatchObject({
      taskKind: "content.scenario_planning",
      tools: ["research.search"],
    });
  });

  it("应拒绝未列入 catalog allowlist 的 Claw capability hint", async () => {
    const dispatch = buildDispatcherWithoutCreativeCapabilityAllowlist();

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        requestId: "req-task",
        capability: "lime.agent",
        method: "startTask",
        input: {
          title: "生成内容场景",
          prompt: "基于项目知识生成内容规划",
          taskKind: "content.scenario_planning",
          capabilityHints: ["image_generation"],
        },
        rawPayload: {
          capability: "lime.agent",
          method: "startTask",
        },
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
  });

  it("应只允许声明过的 artifact / evidence 写回", async () => {
    const dispatch = buildDispatcher();

    const artifact = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.artifacts",
      method: "create",
      input: {
        kind: "content_table",
        title: "内容表",
        content: { rows: [] },
      },
      rawPayload: {
        capability: "lime.artifacts",
        method: "create",
      },
    })) as AgentAppArtifactRecord;
    expect(artifact).toMatchObject({
      kind: "content_table",
      title: "内容表",
      provenance: expect.objectContaining({
        appId: "content-factory-app",
        workflowRunId: "bridge-run-1",
      }),
    });

    const evidence = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.evidence",
      method: "record",
      input: {
        kind: "fact_grounding",
        message: "声明过的事实支撑证据。",
        refs: [artifact.id],
      },
      rawPayload: {
        capability: "lime.evidence",
        method: "record",
      },
    })) as AgentAppEvidenceRecord;
    expect(evidence).toMatchObject({
      kind: "fact_grounding",
      refs: [artifact.id],
      provenance: expect.objectContaining({
        appId: "content-factory-app",
        workflowRunId: "bridge-run-1",
      }),
    });

    const contentBatchArtifact = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.artifacts",
      method: "create",
      input: {
        kind: "content_batch",
        title: "内容批次",
        content: { count: 20 },
      },
      rawPayload: {
        capability: "lime.artifacts",
        method: "create",
      },
    })) as AgentAppArtifactRecord;
    expect(contentBatchArtifact).toMatchObject({
      kind: "content_batch",
      title: "内容批次",
      provenance: expect.objectContaining({
        appId: "content-factory-app",
        workflowRunId: "bridge-run-1",
      }),
    });

    const publishReadiness = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.evidence",
      method: "record",
      input: {
        kind: "publish_readiness",
        message: "内容批次已可继续审核。",
        refs: [contentBatchArtifact.id],
      },
      rawPayload: {
        capability: "lime.evidence",
        method: "record",
      },
    })) as AgentAppEvidenceRecord;
    expect(publishReadiness).toMatchObject({
      kind: "publish_readiness",
      refs: [contentBatchArtifact.id],
      provenance: expect.objectContaining({
        appId: "content-factory-app",
        workflowRunId: "bridge-run-1",
      }),
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.artifacts",
        method: "create",
        input: {
          kind: "undeclared_asset_pack",
          title: "未声明资产包",
          content: {},
        },
        rawPayload: {
          capability: "lime.artifacts",
          method: "create",
        },
      }),
    ).rejects.toMatchObject({
      code: "WRITEBACK_NOT_DECLARED",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.evidence",
        method: "record",
        input: {
          kind: "undeclared_evidence_subject",
          message: "未声明证据。",
        },
        rawPayload: {
          capability: "lime.evidence",
          method: "record",
        },
      }),
    ).rejects.toMatchObject({
      code: "WRITEBACK_NOT_DECLARED",
    });
  });
});
