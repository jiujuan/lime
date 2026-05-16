import { describe, expect, it } from "vitest";
import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppKnowledgeSearchResult,
  AgentAppStorageEntry,
  AgentAppTaskHostResponseResult,
  AgentAppTaskRecord,
  AgentAppTaskStreamEvent,
} from "../types";
import {
  buildLimeCapabilityInvokeProvenance,
  createLimeCapabilityInvoker,
  createMockLimeCapabilityTransport,
  type LimeCapabilityInvokeRequest,
} from "./capabilityContract";
import {
  createLimeCoreCapabilityAdapters,
  LimeCapabilityAdapterError,
} from "./capabilityAdapters";

const recordProvenance = {
  sourceKind: "agent_app",
  appId: "content-factory-app",
  appVersion: "1.0.0",
  packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  manifestHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  entryKey: "dashboard",
  workflowRunId: "run-1",
  workspaceId: "workspace-1",
} as const;
const provenance = buildLimeCapabilityInvokeProvenance(recordProvenance);

function buildAgentTaskRecord(
  overrides: Partial<AgentAppTaskRecord> = {},
): AgentAppTaskRecord {
  const taskId = overrides.taskId ?? "agent-task-1";
  return {
    taskId,
    traceId: overrides.traceId ?? "trace-agent-1",
    appId: provenance.appId,
    entryKey: provenance.entryKey,
    title: overrides.title ?? "生成内容场景",
    prompt: overrides.prompt ?? "基于项目知识生成内容场景",
    taskKind: overrides.taskKind ?? "content.scenario_planning",
    idempotencyKey:
      overrides.idempotencyKey ?? "dashboard:content.scenario_planning",
    input: overrides.input,
    expectedOutput: overrides.expectedOutput,
    knowledge: overrides.knowledge ?? [],
    tools: overrides.tools ?? [],
    files: overrides.files ?? [],
    secrets: overrides.secrets ?? [],
    humanReview: overrides.humanReview ?? true,
    status: overrides.status ?? "running",
    startedAt: overrides.startedAt ?? "2026-05-16T00:00:00.000Z",
    finishedAt: overrides.finishedAt,
    cancelledAt: overrides.cancelledAt,
    result: overrides.result,
    trace: overrides.trace ?? [],
    events: overrides.events ?? [],
    provenance: overrides.provenance ?? recordProvenance,
    retryOfTaskId: overrides.retryOfTaskId,
    retryAttempt: overrides.retryAttempt,
  };
}

const agentStreamEvents: AgentAppTaskStreamEvent[] = [
  {
    eventId: "event-queued",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "task:queued",
    at: "2026-05-16T00:00:00.000Z",
    status: "running",
    message: "任务已进入 AgentRuntime 队列。",
  },
  {
    eventId: "event-progress",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "task:progress",
    at: "2026-05-16T00:00:01.000Z",
    status: "running",
    message: "正在检索项目知识。",
  },
  {
    eventId: "event-missing-context",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "task:missingContextRequested",
    at: "2026-05-16T00:00:02.000Z",
    status: "running",
    message: "需要补充项目定位。",
    payload: { requestId: "missing-context-1" },
  },
  {
    eventId: "event-review",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "task:reviewRequested",
    at: "2026-05-16T00:00:03.000Z",
    status: "running",
    message: "需要人工确认输出方向。",
    payload: { requestId: "review-1" },
  },
  {
    eventId: "event-tool-call",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "task:toolCall",
    at: "2026-05-16T00:00:04.000Z",
    status: "running",
    message: "调用内容检索工具。",
    payload: { toolCallId: "tool-call-1", tool: "content.search" },
  },
  {
    eventId: "event-artifact-created",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "artifact:created",
    at: "2026-05-16T00:00:05.000Z",
    status: "running",
    message: "内容批次已创建。",
    refs: ["artifact-1"],
    payload: {
      workspacePatch: { kind: "content_batch", count: 20 },
      contentFactoryWorkspacePatch: { kind: "content_batch", count: 20 },
    },
  },
  {
    eventId: "event-evidence-recorded",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "evidence:recorded",
    at: "2026-05-16T00:00:06.000Z",
    status: "running",
    message: "运行证据已记录。",
    refs: ["evidence-1"],
  },
  {
    eventId: "event-evidence-verified",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "evidence:verified",
    at: "2026-05-16T00:00:07.000Z",
    status: "running",
    message: "运行证据已校验。",
    refs: ["evidence-1"],
  },
  {
    eventId: "event-completed",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "task:completed",
    at: "2026-05-16T00:00:08.000Z",
    status: "succeeded",
    message: "任务已完成。",
  },
  {
    eventId: "event-incident",
    taskId: "agent-task-1",
    traceId: "trace-agent-1",
    type: "task:incident",
    at: "2026-05-16T00:00:09.000Z",
    message: "记录一次可追踪的非阻塞事件。",
    payload: { incidentId: "incident-1" },
  },
];

describe("P18.3 / P18.4 core capability adapters", () => {
  it("应把 ui / storage / artifacts / evidence / knowledge / tools 调用转成 typed request 并附加 provenance", async () => {
    const requests: LimeCapabilityInvokeRequest[] = [];
    const invoker = createLimeCapabilityInvoker(
      createMockLimeCapabilityTransport({
        "lime.ui": {
          toast: (request) => {
            requests.push(request);
            return { accepted: true };
          },
        },
        "lime.storage": {
          set: (request) => {
            requests.push(request);
            const args = request.args as { key: string; value: unknown };
            return {
              appId: provenance.appId,
              key: args.key,
              value: args.value,
              updatedAt: "2026-05-16T00:00:00.000Z",
              provenance: recordProvenance,
            } satisfies AgentAppStorageEntry;
          },
        },
        "lime.artifacts": {
          create: (request) => {
            requests.push(request);
            const args = request.args as {
              kind: string;
              title: string;
              content: unknown;
            };
            return {
              id: "artifact-1",
              appId: provenance.appId,
              entryKey: provenance.entryKey,
              kind: args.kind,
              title: args.title,
              content: args.content,
              createdAt: "2026-05-16T00:00:00.000Z",
              provenance: recordProvenance,
            } satisfies AgentAppArtifactRecord;
          },
        },
        "lime.evidence": {
          record: (request) => {
            requests.push(request);
            const args = request.args as {
              kind: string;
              message: string;
              refs?: string[];
            };
            return {
              id: "evidence-1",
              appId: provenance.appId,
              entryKey: provenance.entryKey,
              kind: args.kind,
              message: args.message,
              refs: args.refs ?? [],
              createdAt: "2026-05-16T00:00:00.000Z",
              provenance: recordProvenance,
            } satisfies AgentAppEvidenceRecord;
          },
        },
        "lime.knowledge": {
          search: (request) => {
            requests.push(request);
            return {
              query: (request.args as { query: string }).query,
              records: [],
              searchedAt: "2026-05-16T00:00:00.000Z",
              provenance: recordProvenance,
            } satisfies AgentAppKnowledgeSearchResult;
          },
        },
        "lime.tools": {
          invoke: (request) => {
            requests.push(request);
            return { invocationId: "tool-run-1", status: "accepted" };
          },
        },
      }),
    );
    const adapters = createLimeCoreCapabilityAdapters({
      invoker,
      provenance,
      storageNamespace: "content_factory_app",
    });

    await adapters.ui.toast(
      { message: "已保存", level: "success" },
      { requestId: "req-ui" },
    );
    const stored = await adapters.storage.set(
      { key: "drafts/scenario", value: { title: "内容场景草稿" } },
      {
        requestId: "req-storage",
        idempotencyKey: "storage:drafts/scenario",
      },
    );
    const artifact = await adapters.artifacts.create(
      {
        kind: "content_table",
        title: "内容表",
        content: { rows: [] },
      },
      { requestId: "req-artifact" },
    );
    const evidence = await adapters.evidence.record(
      {
        kind: "fact_grounding",
        message: "声明过的事实支撑证据。",
        refs: [artifact.id],
      },
      { requestId: "req-evidence" },
    );
    const knowledge = await adapters.knowledge.search(
      { query: "内容场景", limit: 5 },
      { requestId: "req-knowledge" },
    );
    const toolResult = await adapters.tools["invoke"](
      { tool: "content.search", input: { query: "内容场景" } },
      { requestId: "req-tool" },
    );

    expect(adapters.storage.namespace).toBe("content_factory_app");
    expect(stored).toMatchObject({
      key: "drafts/scenario",
      value: { title: "内容场景草稿" },
      provenance: recordProvenance,
    });
    expect(evidence.refs).toEqual(["artifact-1"]);
    expect(knowledge.query).toBe("内容场景");
    expect(toolResult).toEqual({
      invocationId: "tool-run-1",
      status: "accepted",
    });
    expect(requests).toEqual([
      expect.objectContaining({
        capability: "lime.ui",
        method: "toast",
        requestId: "req-ui",
        provenance,
      }),
      expect.objectContaining({
        capability: "lime.storage",
        method: "set",
        args: {
          key: "drafts/scenario",
          value: { title: "内容场景草稿" },
        },
        requestId: "req-storage",
        idempotencyKey: "storage:drafts/scenario",
        provenance,
      }),
      expect.objectContaining({
        capability: "lime.artifacts",
        method: "create",
        requestId: "req-artifact",
        provenance,
      }),
      expect.objectContaining({
        capability: "lime.evidence",
        method: "record",
        requestId: "req-evidence",
        provenance,
      }),
      expect.objectContaining({
        capability: "lime.knowledge",
        method: "search",
        requestId: "req-knowledge",
        provenance,
      }),
      expect.objectContaining({
        capability: "lime.tools",
        method: "invoke",
        requestId: "req-tool",
        provenance,
      }),
    ]);
  });

  it("P18.4 应把 lime.agent task facade 固定为 App-scoped typed adapter", async () => {
    const requests: LimeCapabilityInvokeRequest[] = [];
    const invoker = createLimeCapabilityInvoker(
      createMockLimeCapabilityTransport({
        "lime.agent": {
          startTask: (request) => {
            requests.push(request);
            const args = request.args as {
              title: string;
              prompt?: string;
              taskKind?: string;
              idempotencyKey?: string;
              input?: unknown;
              expectedOutput?: unknown;
              tools?: string[];
              humanReview?: boolean;
            };
            return buildAgentTaskRecord({
              title: args.title,
              prompt: args.prompt ?? args.title,
              taskKind: args.taskKind,
              idempotencyKey: args.idempotencyKey,
              input: args.input,
              expectedOutput: args.expectedOutput,
              tools: args.tools,
              humanReview: args.humanReview,
              events: [agentStreamEvents[0]],
            });
          },
          streamTask: (request) => {
            requests.push(request);
            return agentStreamEvents;
          },
          getTask: (request) => {
            requests.push(request);
            return buildAgentTaskRecord({
              status: "succeeded",
              finishedAt: "2026-05-16T00:00:08.000Z",
              result: { summary: "内容场景已生成" },
              events: agentStreamEvents,
            });
          },
          cancelTask: (request) => {
            requests.push(request);
            return buildAgentTaskRecord({
              status: "cancelled",
              cancelledAt: "2026-05-16T00:00:10.000Z",
            });
          },
          retryTask: (request) => {
            requests.push(request);
            return buildAgentTaskRecord({
              taskId: "agent-task-2",
              traceId: "trace-agent-2",
              retryOfTaskId: "agent-task-1",
              retryAttempt: 1,
            });
          },
          submitHostResponse: (request) => {
            requests.push(request);
            const args = request.args as {
              taskId: string;
              requestId: string;
            };
            return {
              taskId: args.taskId,
              requestId: args.requestId,
              status: "submitted",
              submittedAt: "2026-05-16T00:00:11.000Z",
            } satisfies AgentAppTaskHostResponseResult;
          },
          listTasks: (request) => {
            requests.push(request);
            return [buildAgentTaskRecord({ status: "succeeded" })];
          },
        },
      }),
    );
    const adapters = createLimeCoreCapabilityAdapters({
      invoker,
      provenance,
    });

    const started = await adapters.agent.startTask(
      {
        title: "生成内容场景",
        prompt: "基于项目知识生成内容场景",
        taskKind: "content.scenario_planning",
        idempotencyKey: "dashboard:content.scenario_planning",
        queueIfBusy: true,
        skipPreSubmitResume: true,
        runStartHooks: false,
        input: { projectId: "project-1" },
        expectedOutput: { artifactKind: "content_table" },
        tools: ["content.search"],
        humanReview: true,
      },
      {
        requestId: "req-agent-start",
        idempotencyKey: "agent:scenario",
      },
    );
    const stream = await adapters.agent.streamTask(
      { taskId: started.taskId },
      { requestId: "req-agent-stream" },
    );
    const snapshot = await adapters.agent.getTask(
      { taskId: started.taskId },
      { requestId: "req-agent-get" },
    );
    const hostResponse = await adapters.agent.submitHostResponse(
      {
        taskId: started.taskId,
        requestId: "missing-context-1",
        actionType: "ask_user",
        response: "项目定位：高客单价咨询服务。",
        userData: { segment: "consulting" },
        actionScope: {
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
        },
      },
      { requestId: "req-agent-host-response" },
    );
    const cancelled = await adapters.agent.cancelTask(
      { taskId: started.taskId },
      { requestId: "req-agent-cancel" },
    );
    const retried = await adapters.agent.retryTask(
      { taskId: started.taskId },
      { requestId: "req-agent-retry" },
    );
    const listed = await adapters.agent.listTasks({
      requestId: "req-agent-list",
    });

    expect(started).toMatchObject({
      taskId: "agent-task-1",
      traceId: "trace-agent-1",
      status: "running",
      events: [expect.objectContaining({ type: "task:queued" })],
    });
    expect(stream.map((event) => event.type)).toEqual([
      "task:queued",
      "task:progress",
      "task:missingContextRequested",
      "task:reviewRequested",
      "task:toolCall",
      "artifact:created",
      "evidence:recorded",
      "evidence:verified",
      "task:completed",
      "task:incident",
    ]);
    expect(stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "artifact:created",
          refs: ["artifact-1"],
          payload: expect.objectContaining({
            workspacePatch: expect.objectContaining({
              kind: "content_batch",
            }),
            contentFactoryWorkspacePatch: expect.objectContaining({
              kind: "content_batch",
            }),
          }),
        }),
        expect.objectContaining({
          type: "evidence:verified",
          refs: ["evidence-1"],
        }),
      ]),
    );
    expect(snapshot).toMatchObject({
      taskId: "agent-task-1",
      status: "succeeded",
      result: { summary: "内容场景已生成" },
    });
    expect(hostResponse).toEqual({
      taskId: "agent-task-1",
      requestId: "missing-context-1",
      status: "submitted",
      submittedAt: "2026-05-16T00:00:11.000Z",
    });
    expect(cancelled.status).toBe("cancelled");
    expect(retried).toMatchObject({
      taskId: "agent-task-2",
      retryOfTaskId: "agent-task-1",
      retryAttempt: 1,
    });
    expect(listed).toEqual([
      expect.objectContaining({
        taskId: "agent-task-1",
        status: "succeeded",
      }),
    ]);
    expect(
      requests.map((request) => ({
        capability: request.capability,
        method: request.method,
        requestId: request.requestId,
        provenance: request.provenance,
      })),
    ).toEqual([
      {
        capability: "lime.agent",
        method: "startTask",
        requestId: "req-agent-start",
        provenance,
      },
      {
        capability: "lime.agent",
        method: "streamTask",
        requestId: "req-agent-stream",
        provenance,
      },
      {
        capability: "lime.agent",
        method: "getTask",
        requestId: "req-agent-get",
        provenance,
      },
      {
        capability: "lime.agent",
        method: "submitHostResponse",
        requestId: "req-agent-host-response",
        provenance,
      },
      {
        capability: "lime.agent",
        method: "cancelTask",
        requestId: "req-agent-cancel",
        provenance,
      },
      {
        capability: "lime.agent",
        method: "retryTask",
        requestId: "req-agent-retry",
        provenance,
      },
      {
        capability: "lime.agent",
        method: "listTasks",
        requestId: "req-agent-list",
        provenance,
      },
    ]);
    expect(requests[0]).toMatchObject({
      args: expect.objectContaining({
        queueIfBusy: true,
        skipPreSubmitResume: true,
        runStartHooks: false,
      }),
      idempotencyKey: "agent:scenario",
    });
  });

  it("应把 mock / host 的 stable error 原样暴露给 adapter 调用方", async () => {
    const adapters = createLimeCoreCapabilityAdapters({
      invoker: createLimeCapabilityInvoker(createMockLimeCapabilityTransport()),
      provenance,
    });

    await expect(
      adapters.tools.getProgress(
        { invocationId: "missing-tool-run" },
        { requestId: "req-missing" },
      ),
    ).rejects.toMatchObject({
      name: "LimeCapabilityAdapterError",
      code: "capability_unavailable",
      causeCode: "UNSUPPORTED_CAPABILITY_METHOD",
      capability: "lime.tools",
      method: "getProgress",
      requestId: "req-missing",
      error: {
        code: "capability_unavailable",
        message: "lime.tools.getProgress is not available in the mock host.",
        capability: "lime.tools",
        method: "getProgress",
        requestId: "req-missing",
        causeCode: "UNSUPPORTED_CAPABILITY_METHOD",
      },
    } satisfies Partial<LimeCapabilityAdapterError>);
  });
});
