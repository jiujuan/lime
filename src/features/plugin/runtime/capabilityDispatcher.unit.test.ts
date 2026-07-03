import { describe, expect, it } from "vitest";
import {
  compatiblePluginStandardVersions,
  currentPluginHostRuntimeVersion,
  currentPluginStandardVersion,
} from "../readiness/hostCapabilityProfile";
import type {
  PluginArtifactRecord,
  PluginEvidenceRecord,
  PluginStorageEntry,
  PluginTaskRecord,
  PluginTaskStreamEvent,
} from "../types";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcher";
import {
  buildDispatcher,
  buildDispatcherWithoutCreativeCapabilityAllowlist,
  buildDispatcherWithoutCreativeCapabilityToolRef,
  buildDispatcherWithoutDeclaredCapability,
  buildRuntimeProjectionDispatcher,
  buildToolExecutionHandoffDispatcher,
  FIXED_NOW,
} from "./capabilityDispatcherTestFixtures";

describe("createPluginCapabilityDispatcher unit boundary", () => {
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
      appRuntimeVersion: currentPluginHostRuntimeVersion,
      standardVersions: {
        current: currentPluginStandardVersion,
        compatible: compatiblePluginStandardVersions,
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
      runtimeProfile: expect.objectContaining({
        runtimeId: `content-factory-app:in_lime:${currentPluginHostRuntimeVersion}`,
        runtimeVersion: currentPluginHostRuntimeVersion,
        shellKind: "desktop",
        installMode: "in_lime",
      }),
      runtimeCapabilities: expect.objectContaining({
        "lime.agent": expect.objectContaining({
          available: true,
          implementation: "adapter",
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
      appRuntimeVersion: currentPluginHostRuntimeVersion,
      standardVersions: {
        current: currentPluginStandardVersion,
        compatible: compatiblePluginStandardVersions,
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
      source: "app_server_runtime_projection",
      taskCount: 1,
      models: [
        expect.objectContaining({
          provider: "openai",
          model: "gpt-4.1",
          label: "openai/gpt-4.1",
          taskCount: 1,
          taskKinds: ["content.scenario_planning"],
          constraints: expect.objectContaining({
            selectedProvider: "openai",
            selectedModel: "gpt-4.1",
            routingMode: "auto",
            decisionSource: "runtime_model_resolution",
            candidateCount: 3,
            fallbackChain: ["openai/gpt-4.1", "deepseek/deepseek-v4-flash"],
            estimatedCostClass: "low",
            limitStatus: "normal",
            costStatus: "estimated",
            inputPerMillion: 0.8,
            outputPerMillion: 3.2,
            source: "app_server_runtime_model_constraints",
          }),
        }),
      ],
    });

    const routing = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.models",
      method: "getRouting",
      input: { taskId: "plugin-task-1" },
      rawPayload: {
        capability: "lime.models",
        method: "getRouting",
      },
    });
    expect(routing).toMatchObject({
      source: "app_server_runtime_projection",
      routes: [
        expect.objectContaining({
          taskId: "plugin-task-1",
          model: {
            provider: "openai",
            model: "gpt-4.1",
            label: "openai/gpt-4.1",
          },
          constraints: expect.objectContaining({
            requestedModel: "gpt-4.1",
            decisionReason: "matched_required_capabilities",
            singleCandidateOnly: false,
            providerLocked: false,
            settingsLocked: false,
            oemLocked: false,
          }),
        }),
      ],
    });

    const tokenUsage = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.usage",
      method: "getTokenUsage",
      input: { taskId: "plugin-task-1" },
      rawPayload: {
        capability: "lime.usage",
        method: "getTokenUsage",
      },
    });
    expect(tokenUsage).toMatchObject({
      appId: "content-factory-app",
      source: "app_server_runtime_projection",
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
          taskId: "plugin-task-1",
          usage: expect.objectContaining({ totalTokens: 1540 }),
        }),
      ],
    });

    const costSummary = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.usage",
      method: "getCostSummary",
      input: { taskId: "plugin-task-1" },
      rawPayload: {
        capability: "lime.usage",
        method: "getCostSummary",
      },
    });
    expect(costSummary).toMatchObject({
      source: "app_server_runtime_projection",
      cost: {
        estimatedTotalCost: 0.043,
        currency: "USD",
      },
    });

    const budget = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.usage",
      method: "getBudget",
      input: { scope: "task" },
      rawPayload: {
        capability: "lime.usage",
        method: "getBudget",
      },
    });
    expect(budget).toMatchObject({
      appId: "content-factory-app",
      scope: "task",
      status: "observed",
      source: "app_server_runtime_projection",
      taskCount: 1,
      budgetCount: 1,
      observedCost: {
        estimatedTotalCost: 0.043,
        currency: "USD",
      },
      latest: expect.objectContaining({
        taskId: "plugin-task-1",
        limitStatus: "normal",
        costStatus: "estimated",
        estimatedCostClass: "low",
        estimatedTotalCost: 0.043,
        currency: "USD",
        candidateCount: 3,
        singleCandidateOnly: false,
        notes: ["当前回合可在 3 个候选模型中路由。"],
      }),
    });
    expect((budget as Record<string, unknown>).reason).toBeUndefined();
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
      source: "app_server_runtime_process",
      taskCount: 1,
      skills: [
        expect.objectContaining({
          skillId: "content-strategist",
          name: "content-strategist",
          status: "invoked",
          taskCount: 1,
          invocationCount: 1,
          taskIds: ["plugin-task-1"],
          taskKinds: ["content.scenario_planning"],
          source: "app_server_runtime_process",
        }),
        expect.objectContaining({
          skillId: "capability-report",
          name: "只读 CLI 报告",
          status: "ready_for_manual_enable",
          source: "workspace_skill_binding",
          bindingStatus: "ready_for_manual_enable",
          nextGate: "manual_runtime_enable",
          runtimeGate: "manual_session_enable_required",
          queryLoopVisible: false,
          toolRuntimeVisible: false,
          launchEnabled: false,
          permissionSummary: ["Level 0 只读发现"],
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
        method: "resolve",
        input: { skillId: "capability-report" },
        rawPayload: {
          capability: "lime.skills",
          method: "resolve",
        },
      }),
    ).resolves.toMatchObject({
      skillId: "capability-report",
      source: "workspace_skill_binding",
      status: "ready_for_manual_enable",
      directory: "capability-report",
      launchEnabled: false,
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.skills",
        method: "getInvocation",
        input: { invocationId: "plugin-task-1:content-strategist" },
        rawPayload: {
          capability: "lime.skills",
          method: "getInvocation",
        },
      }),
    ).resolves.toMatchObject({
      invocationId: "plugin-task-1:content-strategist",
      skillId: "content-strategist",
      taskId: "plugin-task-1",
      status: "succeeded",
      source: "app_server_runtime_process",
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
      reason: "skill_runtime_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_process",
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
      source: "app_server_runtime_projection",
      writable: false,
      compactable: false,
      totals: {
        knowledgeBindingCount: 1,
        contextCompactionCount: 1,
        pendingRequestCount: 0,
        retrievalRefCount: 1,
        missingContextCount: 1,
        teamMemoryRefCount: 1,
      },
      observations: [
        expect.objectContaining({
          taskId: "plugin-task-1",
          knowledgeBindingKeys: ["project_knowledge"],
          contextCompactionCount: 1,
          contextGateStatus: "needs_context",
          memoryBudget: {
            usedTokens: 640,
            maxTokens: 1200,
            status: "ready",
            source: "knowledge_context_resolver",
          },
          contextRefLabels: expect.arrayContaining([
            "knowledge_pack:brand:compiled/splits/brief.md",
            "sources/missing.md",
            "team.selection",
          ]),
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
      source: "app_server_runtime_projection",
      records: [
        expect.objectContaining({
          taskId: "plugin-task-1",
          knowledgeBindingKeys: ["project_knowledge"],
        }),
      ],
    });

    const contextQuery = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.memory",
      method: "query",
      input: { query: "brand:brief" },
      rawPayload: {
        capability: "lime.memory",
        method: "query",
      },
    });
    expect(contextQuery).toMatchObject({
      status: "limited_projection",
      records: [
        expect.objectContaining({
          taskId: "plugin-task-1",
          retrievalRefCount: 1,
          missingContextCount: 1,
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
      source: "app_server_runtime_projection",
      taskCount: 1,
      contexts: [
        expect.objectContaining({
          taskId: "plugin-task-1",
          traceId: "plugin-trace-1",
          threadId: "agent-runtime-thread-1",
          turnIds: ["agent-runtime-turn-1"],
          knowledgeBindingKeys: ["project_knowledge"],
          toolKeys: ["content-strategist"],
          inputAttached: true,
          expectedOutputAttached: true,
          contextGateStatus: "needs_context",
          memoryBudget: expect.objectContaining({
            usedTokens: 640,
            maxTokens: 1200,
            status: "ready",
          }),
          retrievalRefCount: 1,
          missingContextCount: 1,
          teamMemoryRefCount: 1,
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
      reason: "memory_store_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_projection",
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
      reason: "memory_store_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_projection",
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
      reason: "context_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_projection",
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
      reason: "context_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_projection",
    });
  });

  it("应通过 lime.tasks 投影 App-scoped runtime task，且不打开第二套队列", async () => {
    const dispatch = buildRuntimeProjectionDispatcher();

    const taskList = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.tasks",
      method: "list",
      input: { status: "succeeded", limit: 1 },
      rawPayload: {
        capability: "lime.tasks",
        method: "list",
      },
    });
    expect(taskList).toMatchObject({
      appId: "content-factory-app",
      entryKey: "dashboard",
      status: "read_only_projection",
      source: "app_server_runtime_projection",
      taskCount: 1,
      tasks: [
        expect.objectContaining({
          taskId: "plugin-task-1",
          traceId: "plugin-trace-1",
          taskKind: "content.scenario_planning",
          status: "succeeded",
          runtimeStatus: "completed",
          hasResult: true,
          toolCount: 1,
          source: "app_server_runtime_projection",
        }),
      ],
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.tasks",
        method: "get",
        input: { taskId: "plugin-task-1" },
        rawPayload: {
          capability: "lime.tasks",
          method: "get",
        },
      }),
    ).resolves.toMatchObject({
      taskId: "plugin-task-1",
      appId: "content-factory-app",
      status: "succeeded",
      runtimeStatus: "completed",
      source: "app_server_runtime_projection",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.tasks",
        method: "cancel",
        input: { taskId: "plugin-task-1" },
        rawPayload: {
          capability: "lime.tasks",
          method: "cancel",
        },
      }),
    ).resolves.toMatchObject({
      status: "not_available",
      reason: "task_cancellation_must_use_lime_agent_cancel_task",
      source: "app_server_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "cancelTask",
      },
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.tasks",
        method: "subscribe",
        input: { taskId: "plugin-task-1" },
        rawPayload: {
          capability: "lime.tasks",
          method: "subscribe",
        },
      }),
    ).resolves.toMatchObject({
      status: "not_available",
      reason: "task_subscription_must_use_lime_agent_stream_task",
      source: "app_server_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "streamTask",
      },
    });
  });

  it("应把工具 execution envelope 交给 lime.agent.startTask 主链，而不是在 Host Bridge 直跑工具", async () => {
    const { api, dispatch } = buildToolExecutionHandoffDispatcher();

    const response = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.tools",
      method: "invoke",
      idempotencyKey: "tool:web-search:handoff",
      input: {
        tool: "web_search",
        input: {
          query: "竞品",
          accessToken: "raw-oauth-token",
          filePath: "/Users/coso/private/brief.md",
        },
      },
      rawPayload: {
        capability: "lime.tools",
        method: "invoke",
      },
    });

    expect(response).toMatchObject({
      capability: "lime.tools",
      method: "invoke",
      status: "requires_agent_task",
      executionGate: {
        status: "requires_agent_task",
        owner: "lime_agent_runtime",
        handoff: {
          status: "accepted",
          owner: "lime_agent_runtime",
          source: "lime.agent.startTask",
          taskId: "plugin-tool-task-1",
          traceId: "plugin-tool-trace-1",
          taskKind: "plugin.tool_execution",
          taskStatus: "running",
        },
      },
    });
    expect(api.startTask).toHaveBeenCalledTimes(1);
    expect(api.startTask).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        workspaceId: "workspace-1",
        taskKind: "plugin.tool_execution",
        idempotencyKey: "tool:web-search:handoff",
        humanReview: true,
        requiredCapabilities: ["lime.tools"],
        capabilityHints: expect.arrayContaining(["web_search", "lime.tools"]),
        input: {
          executionRequest: expect.objectContaining({
            capability: "lime.tools",
            method: "invoke",
            appId: "content-factory-app",
            entryKey: "dashboard",
            toolName: "web_search",
            input: {
              tool: "web_search",
              input: {
                query: "竞品",
                accessToken: "[redacted:host_managed_secret]",
                filePath: "[redacted:absolute_local_path]",
              },
            },
            policy: expect.objectContaining({
              owner: "lime_agent_runtime",
              approvalRequired: true,
              mutationExposed: false,
              tokenExposed: false,
            }),
          }),
        },
        metadata: {
          plugin_tool_execution: expect.objectContaining({
            version: "p18.7-e2",
            source: "host_bridge_execution_gate",
            request: expect.objectContaining({
              capability: "lime.tools",
              toolName: "web_search",
            }),
          }),
          plugin_host_bridge: expect.objectContaining({
            source: "plugin_runtime_page",
          }),
        },
      }),
    );
    expect(JSON.stringify(api.startTask.mock.calls[0]?.[0])).not.toMatch(
      /raw-oauth-token|\/Users\/coso/,
    );

    const cancellation = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.terminal",
      method: "cancel",
      input: { taskId: "plugin-tool-task-1" },
      rawPayload: {
        capability: "lime.terminal",
        method: "cancel",
      },
    });
    expect(cancellation).toMatchObject({
      appId: "content-factory-app",
      capability: "lime.terminal",
      method: "cancel",
      status: "cancel_requested",
      source: "lime.agent.cancelTask",
      taskId: "plugin-tool-task-1",
      taskStatus: "cancelled",
      task: expect.objectContaining({
        taskId: "plugin-tool-task-1",
        status: "cancelled",
      }),
    });
    expect(api.cancelTask).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "content-factory-app",
        taskId: "plugin-tool-task-1",
        sessionId: "agent-runtime-session-1",
        turnId: "plugin-tool-turn-1",
      }),
    );
  });

  it("应把连接器授权请求交给 Host-managed authorization task，且不暴露 token", async () => {
    const { api, dispatch } = buildToolExecutionHandoffDispatcher();

    const response = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.connectors",
      method: "requestAuth",
      idempotencyKey: "connector:notion:auth:1",
      input: {
        connectorId: "notion",
        reason: "同步内容看板",
        rawOauthToken: "notion-refresh-token",
        sessionId: "agent-runtime-session-1",
      },
      rawPayload: {
        capability: "lime.connectors",
        method: "requestAuth",
      },
    });

    expect(response).toMatchObject({
      capability: "lime.connectors",
      method: "requestAuth",
      status: "requires_host_authorization",
      reason: "connector_auth_requires_lime_policy_and_secret_binding",
      authorizationGate: {
        status: "requires_host_authorization",
        owner: "lime_connector_policy",
        connectorId: "notion",
        secretBinding: "host_managed",
        tokenExposed: false,
        sessionScoped: true,
        request: {
          capability: "lime.connectors",
          method: "requestAuth",
          appId: "content-factory-app",
          entryKey: "dashboard",
          connectorId: "notion",
          sessionId: "agent-runtime-session-1",
          input: {
            connectorId: "notion",
            reason: "同步内容看板",
            rawOauthToken: "[redacted:host_managed_secret]",
            sessionId: "agent-runtime-session-1",
          },
          policy: {
            owner: "lime_connector_policy",
            scope: "plugin_session",
            approvalRequired: true,
            mutationExposed: false,
            tokenExposed: false,
            secretBinding: "host_managed",
            sessionScoped: true,
          },
          idempotencyKey: "connector:notion:auth:1",
        },
        handoff: {
          status: "accepted",
          owner: "lime_connector_policy",
          source: "lime.agent.startTask",
          taskId: "plugin-tool-task-1",
          traceId: "plugin-tool-trace-1",
          taskKind: "plugin.connector_authorization",
        },
      },
    });
    expect(api.startTask).toHaveBeenCalledTimes(1);
    expect(api.startTask).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        workspaceId: "workspace-1",
        taskKind: "plugin.connector_authorization",
        idempotencyKey: "connector:notion:auth:1",
        humanReview: true,
        requiredCapabilities: ["lime.connectors"],
        capabilityHints: expect.arrayContaining([
          "lime.connectors",
          "connector:notion",
        ]),
        input: {
          authorizationRequest: expect.objectContaining({
            capability: "lime.connectors",
            method: "requestAuth",
            connectorId: "notion",
            input: expect.objectContaining({
              rawOauthToken: "[redacted:host_managed_secret]",
            }),
            policy: expect.objectContaining({
              owner: "lime_connector_policy",
              tokenExposed: false,
              secretBinding: "host_managed",
            }),
          }),
        },
        metadata: {
          plugin_connector_authorization: expect.objectContaining({
            version: "p18.7-e4",
            source: "host_bridge_authorization_gate",
            request: expect.objectContaining({
              capability: "lime.connectors",
              connectorId: "notion",
            }),
          }),
          plugin_host_bridge: expect.objectContaining({
            source: "plugin_runtime_page",
          }),
        },
      }),
    );
    expect(JSON.stringify(api.startTask.mock.calls[0]?.[0])).not.toMatch(
      /notion-refresh-token/,
    );
  });

  it("应把 Host fixture connector intent 交给 ToolRuntime mutation proof 主链", async () => {
    const { api, dispatch } = buildToolExecutionHandoffDispatcher();

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.connectors",
        method: "getStatus",
        input: { connectorId: "lime_fixture" },
        rawPayload: {
          capability: "lime.connectors",
          method: "getStatus",
        },
      }),
    ).resolves.toMatchObject({
      connectorId: "lime_fixture",
      status: "authorized",
      source: "host_fixture_connector",
      connectorRuntimeFacts: {
        connectorId: "lime_fixture",
        status: "authorized",
        authorizationStatus: "authorized",
        source: "host_fixture_connector",
        actionIds: ["recordMutation"],
        secretBinding: "host_managed",
        tokenExposed: false,
      },
    });

    const response = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.connectors",
      method: "invoke",
      idempotencyKey: "connector:lime_fixture:recordMutation:1",
      input: {
        connectorId: "lime_fixture",
        action: "recordMutation",
        input: {
          title: "P18.7 mutation proof",
          refreshToken: "fixture-refresh-token",
          workspaceRoot: "/Users/coso/private/content",
        },
        evidenceRef: "app-made-fixture-evidence",
      },
      rawPayload: {
        capability: "lime.connectors",
        method: "invoke",
      },
    });

    expect(response).toMatchObject({
      capability: "lime.connectors",
      method: "invoke",
      status: "requires_agent_task",
      reason: "connector_execution_requires_lime_policy_and_secret_binding",
      executionGate: {
        status: "requires_agent_task",
        owner: "lime_agent_runtime",
        handoff: {
          status: "accepted",
          source: "lime.agent.startTask",
          taskKind: "plugin.tool_execution",
        },
        request: {
          capability: "lime.connectors",
          method: "invoke",
          toolName: "connector__lime_fixture__recordMutation",
          action: "recordMutation",
          input: {
            connectorId: "lime_fixture",
            action: "recordMutation",
            input: {
              title: "P18.7 mutation proof",
              refreshToken: "[redacted:host_managed_secret]",
              workspaceRoot: "[redacted:absolute_local_path]",
            },
            evidenceRef: "[redacted:host_owned_evidence]",
            connectorRuntimeFacts: {
              connectorId: "lime_fixture",
              status: "authorized",
              authorizationStatus: "authorized",
              source: "host_fixture_connector",
              actionIds: ["recordMutation"],
              secretBinding: "host_managed",
              tokenExposed: false,
            },
          },
          policy: expect.objectContaining({
            owner: "lime_agent_runtime",
            approvalRequired: true,
            mutationExposed: false,
            tokenExposed: false,
            secretBinding: "host_managed",
          }),
        },
      },
    });
    expect(api.startTask).toHaveBeenCalledTimes(1);
    expect(api.startTask).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        workspaceId: "workspace-1",
        taskKind: "plugin.tool_execution",
        idempotencyKey: "connector:lime_fixture:recordMutation:1",
        requiredCapabilities: ["lime.connectors"],
        capabilityHints: expect.arrayContaining([
          "connector__lime_fixture__recordMutation",
          "lime.connectors",
        ]),
        input: {
          executionRequest: expect.objectContaining({
            capability: "lime.connectors",
            toolName: "connector__lime_fixture__recordMutation",
            input: expect.objectContaining({
              connectorRuntimeFacts: expect.objectContaining({
                source: "host_fixture_connector",
                secretBinding: "host_managed",
                tokenExposed: false,
              }),
            }),
          }),
        },
        metadata: {
          plugin_tool_execution: expect.objectContaining({
            request: expect.objectContaining({
              capability: "lime.connectors",
              toolName: "connector__lime_fixture__recordMutation",
            }),
          }),
          plugin_host_bridge: expect.objectContaining({
            source: "plugin_runtime_page",
          }),
        },
      }),
    );
    expect(JSON.stringify(api.startTask.mock.calls[0]?.[0])).not.toMatch(
      /fixture-refresh-token|\/Users\/coso|app-made-fixture-evidence/,
    );
  });

  it("应通过 ToolRuntime preview capabilities 暴露受控工具意图和运行投影", async () => {
    const dispatch = buildRuntimeProjectionDispatcher({
      includeConnectorAuthorization: true,
    });

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
      executionGate: {
        status: "requires_agent_task",
        owner: "lime_agent_runtime",
        mutationExposed: false,
        evidenceSource: "app_server_runtime_projection",
        reason: "search_execution_requires_lime_agent_task",
        request: {
          capability: "lime.search",
          method: "query",
          appId: "content-factory-app",
          entryKey: "dashboard",
          toolName: "lime.capability.research.search",
          action: "query",
          input: { query: "竞品资料", limit: 3 },
          reason: "search_execution_requires_lime_agent_task",
          policy: {
            owner: "lime_agent_runtime",
            scope: "plugin_session",
            approvalRequired: false,
            sandboxRequired: false,
            mutationExposed: false,
            tokenExposed: false,
            reason: "search_execution_requires_lime_agent_task",
          },
        },
      },
      next: {
        capability: "lime.agent",
        method: "startTask",
      },
    });
    expect((searchIntent as { matchingRuns: unknown[] }).matchingRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: "web_search:run-1",
          capability: "lime.search",
          toolName: "web_search",
          taskId: "plugin-task-1",
          source: "app_server_runtime_process",
        }),
        expect.objectContaining({
          runId: "thread-tool-search-1",
          capability: "lime.search",
          toolName: "web_search",
          status: "completed",
          source: "app_server_runtime_thread_read",
          input: { query: "竞品" },
          output: { citationCount: 2 },
        }),
      ]),
    );

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

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.search",
        method: "getRun",
        input: { runId: "thread-tool-search-1" },
        rawPayload: {
          capability: "lime.search",
          method: "getRun",
        },
      }),
    ).resolves.toMatchObject({
      runId: "thread-tool-search-1",
      capability: "lime.search",
      status: "completed",
      source: "app_server_runtime_thread_read",
      input: { query: "竞品" },
      output: { citationCount: 2 },
    });

    const genericToolIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.tools",
      method: "invoke",
      idempotencyKey: "tool:web-search:1",
      input: {
        tool: "web_search",
        taskId: "plugin-task-1",
        sessionId: "agent-runtime-session-1",
        input: {
          query: "竞品",
          accessToken: "oauth-token-raw",
          filePath: "/Users/coso/private/brief.md",
          evidenceId: "app-made-evidence",
        },
      },
      rawPayload: {
        capability: "lime.tools",
        method: "invoke",
      },
    });
    expect(genericToolIntent).toMatchObject({
      appId: "content-factory-app",
      capability: "lime.tools",
      method: "invoke",
      status: "requires_agent_task",
      reason: "tool_execution_requires_lime_tool_runtime_policy",
      source: "tool_runtime_policy",
      intent: { tool: "web_search", input: { query: "竞品" } },
      toolHints: ["web_search"],
      executionGate: {
        status: "requires_agent_task",
        owner: "lime_agent_runtime",
        mutationExposed: false,
        evidenceSource: "app_server_runtime_projection",
        request: {
          capability: "lime.tools",
          method: "invoke",
          appId: "content-factory-app",
          entryKey: "dashboard",
          taskId: "plugin-task-1",
          sessionId: "agent-runtime-session-1",
          toolName: "web_search",
          action: "invoke",
          input: {
            tool: "web_search",
            taskId: "plugin-task-1",
            sessionId: "agent-runtime-session-1",
            input: {
              query: "竞品",
              accessToken: "[redacted:host_managed_secret]",
              filePath: "[redacted:absolute_local_path]",
              evidenceId: "[redacted:host_owned_evidence]",
            },
          },
          reason: "tool_execution_requires_lime_tool_runtime_policy",
          policy: {
            owner: "lime_agent_runtime",
            scope: "plugin_session",
            approvalRequired: true,
            sandboxRequired: false,
            mutationExposed: false,
            tokenExposed: false,
            reason: "tool_execution_requires_lime_tool_runtime_policy",
          },
          idempotencyKey: "tool:web-search:1",
        },
      },
      next: {
        capability: "lime.agent",
        method: "startTask",
      },
    });
    expect(
      JSON.stringify(
        (genericToolIntent as { executionGate: { request: unknown } })
          .executionGate.request,
      ),
    ).not.toMatch(/oauth-token-raw|\/Users\/coso|app-made-evidence/);
    expect(
      (genericToolIntent as { matchingRuns: unknown[] }).matchingRuns,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: "web_search:run-1",
          capability: "lime.search",
          source: "app_server_runtime_process",
        }),
        expect.objectContaining({
          runId: "thread-tool-search-1",
          capability: "lime.search",
          source: "app_server_runtime_thread_read",
        }),
      ]),
    );

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.tools",
        method: "getProgress",
        input: { invocationId: "thread-tool-search-1" },
        rawPayload: {
          capability: "lime.tools",
          method: "getProgress",
        },
      }),
    ).resolves.toMatchObject({
      invocationId: "thread-tool-search-1",
      runId: "thread-tool-search-1",
      capability: "lime.search",
      status: "completed",
      source: "app_server_runtime_thread_read",
      input: { query: "竞品" },
      output: { citationCount: 2 },
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
      source: "app_server_runtime_process",
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
      status: "requires_agent_task_cancellation",
      reason: "tool_run_cancellation_must_use_agent_task_id",
      source: "app_server_runtime_projection",
      runId: "terminal:run-1",
      taskId: "plugin-task-1",
      next: {
        capability: "lime.agent",
        method: "cancelTask",
        taskId: "plugin-task-1",
      },
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
      source: "app_server_runtime_process",
      connectors: [
        expect.objectContaining({
          connectorId: "notion",
          actionIds: ["createPage"],
          source: "mixed",
        }),
      ],
      authorizationRequests: [
        expect.objectContaining({
          connectorId: "slack",
          taskId: "plugin-connector-auth-1",
          taskStatus: "running",
          secretBinding: "host_managed",
          tokenExposed: false,
          sessionScoped: true,
          source: "plugin_connector_authorization_task",
        }),
      ],
    });
    expect(
      (
        connectors as {
          connectors: Array<{ connectorId: string; runIds: string[] }>;
        }
      ).connectors.find((item) => item.connectorId === "notion")?.runIds,
    ).toEqual(
      expect.arrayContaining(["connector:run-1", "thread-connector-notion-1"]),
    );

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
      source: "app_server_runtime_process",
      connector: expect.objectContaining({
        source: "mixed",
        runIds: expect.arrayContaining([
          "connector:run-1",
          "thread-connector-notion-1",
        ]),
      }),
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.connectors",
        method: "getStatus",
        input: { connectorId: "slack" },
        rawPayload: {
          capability: "lime.connectors",
          method: "getStatus",
        },
      }),
    ).resolves.toMatchObject({
      connectorId: "slack",
      status: "requires_host_authorization",
      source: "plugin_connector_authorization_task",
      authorizationRequest: {
        connectorId: "slack",
        taskId: "plugin-connector-auth-1",
        taskStatus: "running",
        reason: "同步发布状态",
        secretBinding: "host_managed",
        tokenExposed: false,
        sessionScoped: true,
      },
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.connectors",
        method: "invoke",
        input: {
          connectorId: "slack",
          action: "postMessage",
          input: { channel: "#content", text: "发布完成" },
        },
        rawPayload: {
          capability: "lime.connectors",
          method: "invoke",
        },
      }),
    ).resolves.toMatchObject({
      capability: "lime.connectors",
      method: "invoke",
      status: "requires_host_authorization",
      reason: "connector_authorization_task_not_completed",
      source: "plugin_connector_authorization_task",
      authorizationGate: {
        status: "requires_host_authorization",
        owner: "lime_connector_policy",
        connectorId: "slack",
        secretBinding: "host_managed",
        tokenExposed: false,
        sessionScoped: true,
        authorizationRequest: {
          connectorId: "slack",
          taskId: "plugin-connector-auth-1",
          taskStatus: "running",
        },
      },
      next: {
        capability: "lime.connectors",
        method: "requestAuth",
        reason: "wait_for_host_managed_authorization_task",
      },
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
      authorizationGate: {
        status: "requires_host_authorization",
        owner: "lime_connector_policy",
        connectorId: "notion",
        secretBinding: "host_managed",
        tokenExposed: false,
        sessionScoped: true,
      },
      next: {
        capability: "lime.connectors",
        method: "invoke",
      },
    });

    const connectorIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.connectors",
      method: "invoke",
      idempotencyKey: "connector:notion:createPage:1",
      input: {
        connectorId: "notion",
        action: "createPage",
        input: {
          title: "内容计划",
          refreshToken: "notion-refresh-token",
          workspaceRoot: "/Users/coso/private/content",
        },
        evidenceRef: "app-made-connector-evidence",
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
      executionGate: {
        status: "requires_agent_task",
        owner: "lime_agent_runtime",
        mutationExposed: false,
        evidenceSource: "app_server_runtime_projection",
        request: {
          capability: "lime.connectors",
          method: "invoke",
          appId: "content-factory-app",
          entryKey: "dashboard",
          toolName: "connector__notion__createPage",
          action: "createPage",
          input: {
            connectorId: "notion",
            action: "createPage",
            input: {
              title: "内容计划",
              refreshToken: "[redacted:host_managed_secret]",
              workspaceRoot: "[redacted:absolute_local_path]",
            },
            evidenceRef: "[redacted:host_owned_evidence]",
            connectorRuntimeFacts: {
              connectorId: "notion",
              status: "observed",
              authorizationStatus: "observed",
              source: "mixed",
              actionIds: ["createPage"],
              runIds: expect.arrayContaining([
                "connector:run-1",
                "thread-connector-notion-1",
              ]),
              taskIds: ["plugin-task-1"],
              secretBinding: "host_managed",
              tokenExposed: false,
            },
          },
          reason: "connector_execution_requires_lime_policy_and_secret_binding",
          policy: {
            owner: "lime_agent_runtime",
            scope: "plugin_session",
            approvalRequired: true,
            sandboxRequired: false,
            mutationExposed: false,
            tokenExposed: false,
            secretBinding: "host_managed",
            reason:
              "connector_execution_requires_lime_policy_and_secret_binding",
          },
          idempotencyKey: "connector:notion:createPage:1",
        },
      },
    });
    expect(
      JSON.stringify(
        (connectorIntent as { executionGate: { request: unknown } })
          .executionGate.request,
      ),
    ).not.toMatch(
      /notion-refresh-token|\/Users\/coso|app-made-connector-evidence/,
    );
    expect(
      (connectorIntent as { matchingRuns: unknown[] }).matchingRuns,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: "connector:run-1",
          capability: "lime.connectors",
          toolName: "connector__notion__createPage",
          source: "app_server_runtime_process",
        }),
        expect.objectContaining({
          runId: "thread-connector-notion-1",
          capability: "lime.connectors",
          toolName: "connector__notion__createPage",
          status: "completed",
          source: "app_server_runtime_thread_read",
          input: { connectorId: "notion", title: "内容计划" },
          output: { pageId: "notion-page-1" },
        }),
      ]),
    );
  });

  it("应把已完成的 Host-managed connector 授权投影为 Cloud Overlay runtime facts", async () => {
    const dispatch = buildRuntimeProjectionDispatcher({
      includeConnectorAuthorization: true,
      connectorAuthorizationStatus: "succeeded",
    });

    const connectorIntent = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.connectors",
      method: "invoke",
      input: {
        connectorId: "slack",
        action: "postMessage",
        input: {
          channel: "#content",
          text: "发布完成",
          refreshToken: "slack-refresh-token",
        },
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
      executionGate: {
        request: {
          toolName: "connector__slack__postMessage",
          input: {
            connectorId: "slack",
            action: "postMessage",
            input: {
              channel: "#content",
              text: "发布完成",
              refreshToken: "[redacted:host_managed_secret]",
            },
            connectorRuntimeFacts: {
              connectorId: "slack",
              status: "authorized",
              authorizationStatus: "authorized",
              source: "plugin_connector_authorization_task",
              taskIds: ["plugin-connector-auth-1"],
              secretBinding: "host_managed",
              tokenExposed: false,
              secretDelivery: {
                status: "ready",
                binding: "host_managed",
                source: "host_managed_secret_delivery_fact",
                target: "cloud_overlay_worker",
                leaseObserved: true,
                leaseRefExposed: false,
                leaseHandleStatus: "host_managed",
                credentialMaterialExposed: false,
                tokenExposed: false,
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(connectorIntent)).not.toMatch(
      /slack-refresh-token|secret-lease:\/\/connector/,
    );

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.connectors",
        method: "getStatus",
        input: { connectorId: "slack" },
        rawPayload: {
          capability: "lime.connectors",
          method: "getStatus",
        },
      }),
    ).resolves.toMatchObject({
      connectorId: "slack",
      status: "authorized",
      source: "plugin_connector_authorization_task",
      authorizationRequest: {
        connectorId: "slack",
        taskId: "plugin-connector-auth-1",
        taskStatus: "succeeded",
        secretDelivery: {
          status: "ready",
          binding: "host_managed",
          source: "host_managed_secret_delivery_fact",
          target: "cloud_overlay_worker",
          leaseObserved: true,
          leaseRefExposed: false,
          leaseHandleStatus: "host_managed",
          credentialMaterialExposed: false,
          tokenExposed: false,
        },
      },
      connectorRuntimeFacts: {
        connectorId: "slack",
        status: "authorized",
        authorizationStatus: "authorized",
        source: "plugin_connector_authorization_task",
        secretDelivery: {
          leaseObserved: true,
          leaseRefExposed: false,
          leaseHandleStatus: "host_managed",
        },
      },
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
    })) as PluginTaskRecord;

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
    })) as PluginTaskStreamEvent[];
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
    })) as PluginTaskRecord;
    expect(cancelled).toMatchObject({
      taskId: "adapter-task-1",
      status: "cancelled",
      cancelledAt: FIXED_NOW,
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
        expect.objectContaining({
          type: "task:progress",
          message: "Plugin host response 已提交。",
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
    })) as PluginTaskRecord;
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
    })) as PluginTaskRecord;
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
    })) as PluginStorageEntry;

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
    ).rejects.toBeInstanceOf(PluginCapabilityDispatcherError);
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
    })) as PluginTaskRecord;
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
    })) as PluginArtifactRecord;
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
    })) as PluginEvidenceRecord;
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
    })) as PluginArtifactRecord;
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
    })) as PluginEvidenceRecord;
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
