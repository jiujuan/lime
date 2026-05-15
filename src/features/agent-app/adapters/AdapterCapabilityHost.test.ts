import { describe, expect, it } from "vitest";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { uninstallApp } from "../install/uninstallApp";
import { AdapterCapabilityHost } from "./AdapterCapabilityHost";
import { buildAdapterCapabilityProfile } from "./adapterCapabilityProfile";
import { InMemoryAgentAppCapabilityStore } from "./InMemoryAgentAppCapabilityStore";

function buildAdapterPreview() {
  return buildInstalledAppPreview({
    profile: buildAdapterCapabilityProfile(),
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
}

describe("AdapterCapabilityHost", () => {
  it("应通过本地 adapter store 运行 entry 并支持按 provenance 查询产物和证据", async () => {
    const preview = buildAdapterPreview();
    const store = new InMemoryAgentAppCapabilityStore();
    const host = new AdapterCapabilityHost({
      preview,
      store,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const result = await host.runEntry("dashboard");

    expect(result.run.status).toBe("succeeded");
    expect(result.artifacts[0]).toMatchObject({
      id: "adapter-artifact-1",
      kind: "adapter_agent_app_artifact",
      provenance: {
        sourceKind: "agent_app",
        appId: "content-factory-app",
        entryKey: "dashboard",
        workflowRunId: result.run.runId,
      },
    });
    expect(result.evidence[0]).toMatchObject({
      id: "adapter-evidence-1",
      refs: [result.artifacts[0].id],
      provenance: {
        sourceKind: "agent_app",
        appId: "content-factory-app",
        entryKey: "dashboard",
        workflowRunId: result.run.runId,
      },
    });
    expect(host.getArtifacts({ appId: "content-factory-app" })).toHaveLength(1);
    expect(host.getEvidence({ entryKey: "dashboard" })).toHaveLength(1);
    expect(host.getStorageEntries({ workflowRunId: result.run.runId })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appId: "content-factory-app",
          key: `runs/${result.run.runId}`,
        }),
      ]),
    );
  });

  it("workflow entry 应通过 knowledge 与 agent adapter 生成任务 trace", async () => {
    const preview = buildAdapterPreview();
    const host = new AdapterCapabilityHost({
      preview,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const result = await host.runEntry("content_scenario_planning");

    expect(result.knowledge[0]).toMatchObject({
      query: "内容场景规划",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: "knowledge:content-factory-app:project_knowledge",
        }),
      ]),
      provenance: expect.objectContaining({
        workflowRunId: result.run.runId,
      }),
    });
    expect(result.tasks[0]).toMatchObject({
      taskId: "adapter-task-1",
      traceId: "adapter-trace-1",
      status: "succeeded",
      taskKind: "entry.workflow",
      idempotencyKey: `${result.run.runId}:content_scenario_planning`,
      input: expect.objectContaining({
        entryKey: "content_scenario_planning",
        knowledgeRecordIds: [
          "knowledge:content-factory-app:ip_knowledge",
          "knowledge:content-factory-app:project_knowledge",
          "knowledge:content-factory-app:material_library",
        ],
      }),
      expectedOutput: {
        artifactKind: "adapter_agent_app_artifact",
        storageKey: `runs/${result.run.runId}`,
      },
      humanReview: true,
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
        expect.objectContaining({
          type: "task:completed",
          status: "succeeded",
        }),
      ],
      provenance: expect.objectContaining({
        entryKey: "content_scenario_planning",
        workflowRunId: result.run.runId,
      }),
    });
    expect(result.run.taskIds).toEqual(["adapter-task-1"]);
    expect(result.artifacts[0].content).toMatchObject({
      knowledgeRecordIds: [
        "knowledge:content-factory-app:ip_knowledge",
        "knowledge:content-factory-app:project_knowledge",
        "knowledge:content-factory-app:material_library",
      ],
      taskIds: ["adapter-task-1"],
    });
    expect(result.evidence[0].refs).toEqual([
      result.artifacts[0].id,
      "adapter-task-1",
    ]);
    expect(
      host.getTasks({ entryKey: "content_scenario_planning" }),
    ).toHaveLength(1);
  });

  it("agent adapter 应支持取消仍在运行的本地任务", async () => {
    const preview = buildAdapterPreview();
    const host = new AdapterCapabilityHost({ preview });
    const sdk = host.createSdkContext(
      "content_scenario_planning",
      "manual-run",
    );

    const task = await sdk.agent.startTask({
      title: "手动任务",
      prompt: "验证 cancel adapter",
      taskKind: "manual.cancel",
      idempotencyKey: "manual-run:cancel",
      input: { reason: "test" },
    });
    const cancelled = await sdk.agent.cancelTask(task.taskId);

    expect(cancelled).toMatchObject({
      taskId: "adapter-task-1",
      status: "cancelled",
      taskKind: "manual.cancel",
      idempotencyKey: "manual-run:cancel",
      input: { reason: "test" },
      provenance: expect.objectContaining({
        workflowRunId: "manual-run",
      }),
    });
    expect(await sdk.agent.getTask(task.taskId)).toMatchObject({
      status: "cancelled",
    });
    expect(await sdk.agent.streamTask(task.taskId)).toEqual([
      expect.objectContaining({ type: "task:status", status: "running" }),
      expect.objectContaining({ type: "task:cancelled", status: "cancelled" }),
    ]);

    const retried = await sdk.agent.retryTask(task.taskId);
    expect(retried).toMatchObject({
      taskId: "adapter-task-2",
      traceId: "adapter-trace-2",
      retryOfTaskId: "adapter-task-1",
      retryAttempt: 1,
      status: "running",
      taskKind: "manual.cancel",
      idempotencyKey: "manual-run:cancel:retry:1",
      input: { reason: "test" },
      provenance: expect.objectContaining({
        workflowRunId: "manual-run",
      }),
      events: [
        expect.objectContaining({
          type: "task:status",
          status: "running",
          message: "Adapter task retried.",
        }),
      ],
    });
  });

  it("关闭 real adapter 时不允许运行 entry", async () => {
    const host = new AdapterCapabilityHost({
      preview: buildAdapterPreview(),
      realAdapterEnabled: false,
    });

    await expect(host.runEntry("dashboard")).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });

  it("delete-data 卸载应清理 adapter storage、artifact、evidence 和 task", async () => {
    const preview = buildAdapterPreview();
    const host = new AdapterCapabilityHost({ preview });
    const result = await host.runEntry("content_scenario_planning");

    const uninstall = await uninstallApp({
      host,
      cleanupPlan: preview.cleanupPlan,
      deleteData: true,
    });

    expect(uninstall.mode).toBe("delete-data");
    expect(uninstall.deletedTargets.map((target) => target.value)).toEqual(
      expect.arrayContaining([
        "<LimeAppData>/agent-apps/package-index/content-factory-app.json",
        "<LimeAppData>/agent-apps/staging/content-factory-app",
        "<LimeAppData>/agent-apps/storage/content-factory-app",
        `storage:content-factory-app:runs/${result.run.runId}`,
        `artifact:${result.artifacts[0].id}`,
        `evidence:${result.evidence[0].id}`,
        `task:${result.tasks[0].taskId}`,
      ]),
    );
    expect(host.getArtifacts({ appId: "content-factory-app" })).toHaveLength(0);
    expect(host.getEvidence({ appId: "content-factory-app" })).toHaveLength(0);
    expect(
      host.getStorageEntries({ appId: "content-factory-app" }),
    ).toHaveLength(0);
    expect(host.getTasks({ appId: "content-factory-app" })).toHaveLength(0);
  });
});
