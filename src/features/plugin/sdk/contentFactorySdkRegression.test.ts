import { describe, expect, it } from "vitest";
import type {
  PluginArtifactRecord,
  PluginEvidenceRecord,
  PluginStorageEntry,
  PluginTaskHostResponseResult,
  PluginTaskRecord,
  PluginTaskStreamEvent,
  LimeCapabilityInvokeRequest,
} from "./index";
import {
  buildLimeCapabilityInvokeProvenance,
  createLimeCapabilityInvoker,
  createLimeCoreCapabilityAdapters,
} from "./index";
import { createMockLimeCapabilityTransport } from "./__tests__/testFixtures";

const recordProvenance = {
  sourceKind: "plugin",
  appId: "content-factory-app",
  appVersion: "1.0.0",
  packageHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  manifestHash:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  entryKey: "content_factory",
  workflowRunId: "content-factory-run-1",
  workspaceId: "workspace-1",
} as const;
const provenance = buildLimeCapabilityInvokeProvenance(recordProvenance);

function buildTaskRecord(
  overrides: Partial<PluginTaskRecord> = {},
): PluginTaskRecord {
  return {
    taskId: overrides.taskId ?? "content-factory-task-1",
    traceId: overrides.traceId ?? "content-factory-trace-1",
    appId: recordProvenance.appId,
    entryKey: recordProvenance.entryKey,
    title: overrides.title ?? "生成内容批次",
    prompt: overrides.prompt ?? "基于项目知识生成内容批次",
    taskKind: overrides.taskKind ?? "content.copy.generate",
    idempotencyKey:
      overrides.idempotencyKey ?? "content-factory:batch:project-1",
    input: overrides.input,
    expectedOutput: overrides.expectedOutput,
    knowledge: overrides.knowledge ?? [
      { key: "project_knowledge", required: true },
    ],
    tools: overrides.tools ?? ["lime.capability.research.search"],
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

const taskEvents: PluginTaskStreamEvent[] = [
  {
    eventId: "content-factory-event-queued",
    taskId: "content-factory-task-1",
    traceId: "content-factory-trace-1",
    type: "task:queued",
    at: "2026-05-16T00:00:00.000Z",
    status: "running",
  },
  {
    eventId: "content-factory-event-missing-context",
    taskId: "content-factory-task-1",
    traceId: "content-factory-trace-1",
    type: "task:missingContextRequested",
    at: "2026-05-16T00:00:01.000Z",
    status: "running",
    message: "需要补充目标用户画像。",
    payload: { requestId: "runtime-request-1" },
  },
  {
    eventId: "content-factory-event-artifact",
    taskId: "content-factory-task-1",
    traceId: "content-factory-trace-1",
    type: "artifact:created",
    at: "2026-05-16T00:00:02.000Z",
    status: "running",
    refs: ["artifact-content-batch-1"],
    payload: {
      contentFactoryWorkspacePatch: {
        kind: "content_batch",
        projectId: "project-1",
        contentBatchId: "batch-1",
      },
    },
  },
  {
    eventId: "content-factory-event-evidence",
    taskId: "content-factory-task-1",
    traceId: "content-factory-trace-1",
    type: "evidence:recorded",
    at: "2026-05-16T00:00:03.000Z",
    status: "succeeded",
    refs: ["evidence-fact-grounding-1"],
  },
];

describe("P18.5 content factory SDK regression", () => {
  it("应通过通用 SDK facade 完成内容工厂 task、写回和证据闭环", async () => {
    const requests: LimeCapabilityInvokeRequest[] = [];
    const invoker = createLimeCapabilityInvoker(
      createMockLimeCapabilityTransport({
        "lime.agent": {
          startTask: (request) => {
            requests.push(request);
            const args = request.args as {
              title: string;
              taskKind?: string;
              input?: unknown;
              expectedOutput?: unknown;
            };
            return buildTaskRecord({
              title: args.title,
              taskKind: args.taskKind,
              input: args.input,
              expectedOutput: args.expectedOutput,
              events: [taskEvents[0]],
            });
          },
          streamTask: (request) => {
            requests.push(request);
            return taskEvents;
          },
          getTask: (request) => {
            requests.push(request);
            return buildTaskRecord({
              status: "succeeded",
              finishedAt: "2026-05-16T00:00:04.000Z",
              result: { contentBatchId: "batch-1" },
              events: taskEvents,
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
              submittedAt: "2026-05-16T00:00:01.500Z",
            } satisfies PluginTaskHostResponseResult;
          },
        },
        "lime.storage": {
          set: (request) => {
            requests.push(request);
            const args = request.args as { key: string; value: unknown };
            return {
              appId: recordProvenance.appId,
              key: args.key,
              value: args.value,
              updatedAt: "2026-05-16T00:00:05.000Z",
              provenance: recordProvenance,
            } satisfies PluginStorageEntry;
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
              id: "artifact-content-batch-1",
              appId: recordProvenance.appId,
              entryKey: recordProvenance.entryKey,
              kind: args.kind,
              title: args.title,
              content: args.content,
              createdAt: "2026-05-16T00:00:06.000Z",
              provenance: recordProvenance,
            } satisfies PluginArtifactRecord;
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
              id: "evidence-fact-grounding-1",
              appId: recordProvenance.appId,
              entryKey: recordProvenance.entryKey,
              kind: args.kind,
              message: args.message,
              refs: args.refs ?? [],
              createdAt: "2026-05-16T00:00:07.000Z",
              provenance: recordProvenance,
            } satisfies PluginEvidenceRecord;
          },
        },
      }),
    );
    const lime = createLimeCoreCapabilityAdapters({
      invoker,
      provenance,
      storageNamespace: "content-factory-app",
    });

    const task = await lime.agent.startTask(
      {
        title: "生成内容批次",
        taskKind: "content.copy.generate",
        idempotencyKey: "content-factory:batch:project-1",
        queueIfBusy: true,
        input: { projectId: "project-1", sceneTableId: "scene-table-1" },
        expectedOutput: {
          artifactKind: "content_batch",
          workspacePatch: "contentFactoryWorkspacePatch",
        },
        knowledge: [{ key: "project_knowledge", required: true }],
        tools: ["lime.capability.research.search"],
        humanReview: true,
      },
      {
        requestId: "req-content-task",
        idempotencyKey: "content-factory:batch:project-1",
      },
    );
    const stream = await lime.agent.streamTask(
      { taskId: task.taskId },
      { requestId: "req-content-stream" },
    );
    const missingContext = stream.find(
      (event) => event.type === "task:missingContextRequested",
    );
    const hostResponse = await lime.agent.submitHostResponse(
      {
        taskId: task.taskId,
        requestId: String(
          (missingContext?.payload as { requestId?: string } | undefined)
            ?.requestId ?? "runtime-request-1",
        ),
        actionType: "ask_user",
        response: "目标用户：内容运营负责人。",
        workflowRunId: recordProvenance.workflowRunId,
        workflowKey: "content_article_workflow",
        stepId: "draft",
      },
      { requestId: "req-content-host-response" },
    );
    const snapshot = await lime.agent.getTask(
      { taskId: task.taskId },
      { requestId: "req-content-get" },
    );
    const storageEntry = await lime.storage.set(
      {
        key: "content_batches/project-1/batch-1",
        value: { projectId: "project-1", contentBatchId: "batch-1" },
      },
      { requestId: "req-content-storage" },
    );
    const artifact = await lime.artifacts.create(
      {
        kind: "content_batch",
        title: "内容批次 batch-1",
        content: storageEntry.value,
      },
      { requestId: "req-content-artifact" },
    );
    const evidence = await lime.evidence.record(
      {
        kind: "fact_grounding",
        message: "内容批次已绑定项目知识和运行任务。",
        refs: [artifact.id, task.taskId, hostResponse.requestId],
      },
      { requestId: "req-content-evidence" },
    );

    expect(lime.storage.namespace).toBe("content-factory-app");
    expect(snapshot).toMatchObject({
      status: "succeeded",
      result: { contentBatchId: "batch-1" },
    });
    expect(stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "artifact:created",
          payload: expect.objectContaining({
            contentFactoryWorkspacePatch: expect.objectContaining({
              kind: "content_batch",
              projectId: "project-1",
            }),
          }),
        }),
        expect.objectContaining({ type: "evidence:recorded" }),
      ]),
    );
    expect(artifact.kind).toBe("content_batch");
    expect(evidence).toMatchObject({
      kind: "fact_grounding",
      refs: [
        "artifact-content-batch-1",
        "content-factory-task-1",
        "runtime-request-1",
      ],
    });
    expect(
      requests.map((request) => `${request.capability}.${request.method}`),
    ).toEqual([
      "lime.agent.startTask",
      "lime.agent.streamTask",
      "lime.agent.submitHostResponse",
      "lime.agent.getTask",
      "lime.storage.set",
      "lime.artifacts.create",
      "lime.evidence.record",
    ]);
    expect(requests.every((request) => request.provenance === provenance)).toBe(
      true,
    );
    expect(
      requests.find(
        (request) =>
          request.capability === "lime.agent" &&
          request.method === "submitHostResponse",
      ),
    ).toMatchObject({
      args: {
        workflowRunId: "content-factory-run-1",
        workflowKey: "content_article_workflow",
        stepId: "draft",
      },
    });
  });
});
