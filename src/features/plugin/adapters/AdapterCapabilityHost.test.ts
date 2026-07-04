import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { uninstallApp } from "../install/uninstallApp";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import { AdapterCapabilityHost } from "./AdapterCapabilityHost";
import { InMemoryPluginCapabilityStore } from "./InMemoryPluginCapabilityStore";

const CONTENT_FACTORY_ENTRY_KEY = "content_factory";

function contentFactoryFixtureWithEntryKind(kind: "page" | "workflow") {
  return {
    ...contentFactoryFixture,
    entries: contentFactoryFixture.entries.map((entry) =>
      entry.key === CONTENT_FACTORY_ENTRY_KEY
        ? {
            ...entry,
            kind,
            ...(kind === "page" ? { route: "/content-factory" } : {}),
          }
        : entry,
    ),
  };
}

function buildAdapterPreview(kind: "page" | "workflow" = "page") {
  return buildInstalledAppPreview({
    fixture: contentFactoryFixtureWithEntryKind(kind),
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
    }),
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
}

describe("AdapterCapabilityHost", () => {
  it("应通过本地 adapter store 运行 entry 并支持按 provenance 查询产物和证据", async () => {
    const preview = buildAdapterPreview();
    const store = new InMemoryPluginCapabilityStore();
    const host = new AdapterCapabilityHost({
      preview,
      store,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const result = await host.runEntry(CONTENT_FACTORY_ENTRY_KEY);

    expect(result.run.status).toBe("succeeded");
    expect(result.artifacts[0]).toMatchObject({
      id: "adapter-artifact-1",
      kind: "adapter_plugin_artifact",
      provenance: {
        sourceKind: "plugin",
        appId: "content-factory-app",
        entryKey: CONTENT_FACTORY_ENTRY_KEY,
        workflowRunId: result.run.runId,
      },
    });
    expect(result.evidence[0]).toMatchObject({
      id: "adapter-evidence-1",
      refs: [result.artifacts[0].id, "adapter-task-1"],
      provenance: {
        sourceKind: "plugin",
        appId: "content-factory-app",
        entryKey: CONTENT_FACTORY_ENTRY_KEY,
        workflowRunId: result.run.runId,
      },
    });
    expect(host.getArtifacts({ appId: "content-factory-app" })).toHaveLength(1);
    expect(host.getEvidence({ entryKey: CONTENT_FACTORY_ENTRY_KEY })).toHaveLength(1);
    expect(host.getStorageEntries({ workflowRunId: result.run.runId })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appId: "content-factory-app",
          key: `runs/${result.run.runId}`,
        }),
      ]),
    );
  });

  it("workflow entry 应 fail closed 并要求 App Server Workflow API", async () => {
    const preview = buildAdapterPreview("workflow");
    const host = new AdapterCapabilityHost({
      preview,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    await expect(host.runEntry(CONTENT_FACTORY_ENTRY_KEY)).rejects.toMatchObject(
      {
        code: "WORKFLOW_RUNTIME_DISABLED",
        capability: "lime.workflow",
      },
    );
    expect(host.getTasks({ entryKey: CONTENT_FACTORY_ENTRY_KEY })).toHaveLength(
      0,
    );
  });

  it("普通 entry 仍可通过 knowledge 与 agent adapter 生成任务 trace", async () => {
    const preview = buildAdapterPreview("page");
    const host = new AdapterCapabilityHost({
      preview,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const result = await host.runEntry(CONTENT_FACTORY_ENTRY_KEY);

    expect(result.tasks[0]).toMatchObject({
      taskId: "adapter-task-1",
      taskKind: "entry.page",
      idempotencyKey: `${result.run.runId}:${CONTENT_FACTORY_ENTRY_KEY}`,
      humanReview: false,
    });
    expect(
      host.getTasks({ entryKey: CONTENT_FACTORY_ENTRY_KEY }),
    ).toHaveLength(1);
  });

  it("agent adapter 应支持取消仍在运行的本地任务", async () => {
    const preview = buildAdapterPreview();
    const host = new AdapterCapabilityHost({ preview });
    const sdk = host.createSdkContext(
      CONTENT_FACTORY_ENTRY_KEY,
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

  it("创建 SDK context 不应提前校验未调用的 adapter capability", async () => {
    const preview = buildInstalledAppPreview({
      fixture: {
        manifestVersion: "0.3.0",
        name: "agent-only-app",
        displayName: "Agent Only",
        version: "0.3.0",
        runtimeTargets: ["local"],
        requires: {
          capabilities: {
            "lime.agent": "^0.3.0",
          },
        },
        entries: [
          {
            key: "dashboard",
            kind: "page",
            title: "Agent Only",
            route: "/dashboard",
            requiredCapabilities: ["lime.agent"],
          },
        ],
      },
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
      }),
      loadedAt: "2026-05-15T00:00:00.000Z",
      checkedAt: "2026-05-15T00:00:00.000Z",
      generatedAt: "2026-05-15T00:00:00.000Z",
    });
    const host = new AdapterCapabilityHost({
      preview,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const sdk = host.createSdkContext("dashboard", "agent-only-run");
    const task = await sdk.agent.startTask({
      title: "Agent only task",
      prompt: "验证未调用的 storage 不会阻断 agent capability。",
      taskKind: "agent.only",
    });

    expect(task).toMatchObject({
      taskId: "adapter-task-1",
      appId: "agent-only-app",
      entryKey: "dashboard",
      taskKind: "agent.only",
      provenance: expect.objectContaining({
        workflowRunId: "agent-only-run",
      }),
    });
    await expect(sdk.storage.list()).rejects.toMatchObject({
      code: "CAPABILITY_NOT_DECLARED",
    });
  });

  it("关闭 real adapter 时不允许运行 entry", async () => {
    const host = new AdapterCapabilityHost({
      preview: buildAdapterPreview(),
      realAdapterEnabled: false,
    });

    await expect(host.runEntry(CONTENT_FACTORY_ENTRY_KEY)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });

  it("delete-data 卸载应清理 adapter storage、artifact、evidence 和 task", async () => {
    const preview = buildAdapterPreview();
    const host = new AdapterCapabilityHost({ preview });
    const result = await host.runEntry(CONTENT_FACTORY_ENTRY_KEY);

    const uninstall = await uninstallApp({
      host,
      cleanupPlan: preview.cleanupPlan,
      deleteData: true,
    });

    expect(uninstall.mode).toBe("delete-data");
    expect(uninstall.deletedTargets.map((target) => target.value)).toEqual(
      expect.arrayContaining([
        "<LimeAppData>/plugins/package-index/content-factory-app.json",
        "<LimeAppData>/plugins/staging/content-factory-app",
        "<LimeAppData>/plugins/storage/content-factory-app",
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
