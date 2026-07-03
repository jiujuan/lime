import { describe, expect, it } from "vitest";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import {
  buildInstalledPluginState,
  InMemoryPluginPersistenceDriver,
  LocalInstalledPluginStateRepository,
} from "../install/installedAppState";
import { uninstallApp } from "../install/uninstallApp";
import {
  buildContentFactoryUiRuntimeResolvedSetup,
  buildContentFactoryUiRuntimeTestManifest,
} from "../testing/contentFactoryTestManifest";
import { buildMockCapabilityProfile } from "./mockCapabilityProfile";
import { MockCapabilityHost } from "./MockCapabilityHost";

function buildMockPreview() {
  return buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    setup: buildContentFactoryUiRuntimeResolvedSetup(),
    profile: buildMockCapabilityProfile(),
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
}

describe("MockCapabilityHost", () => {
  it("应通过 SDK facade 运行 entry 并生成带 plugin provenance 的产物和证据", async () => {
    const preview = buildMockPreview();
    const host = new MockCapabilityHost({
      preview,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const result = await host.runEntry("content_scenario_planning");

    expect(result.run.status).toBe("succeeded");
    expect(result.artifacts).toHaveLength(1);
    expect(result.evidence).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      appId: "content-factory-app",
      entryKey: "content_scenario_planning",
      provenance: {
        sourceKind: "plugin",
        appId: "content-factory-app",
        entryKey: "content_scenario_planning",
        workflowRunId: result.run.runId,
      },
    });
    expect(result.evidence[0]).toMatchObject({
      refs: [result.artifacts[0].id],
      provenance: {
        sourceKind: "plugin",
        appId: "content-factory-app",
        entryKey: "content_scenario_planning",
        workflowRunId: result.run.runId,
      },
    });
    expect(host.getStorageEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `runs/${result.run.runId}`,
          provenance: expect.objectContaining({
            sourceKind: "plugin",
          }),
        }),
      ]),
    );
  });

  it("关闭 mock SDK 时不允许运行 entry", async () => {
    const host = new MockCapabilityHost({
      preview: buildMockPreview(),
      mockSdkEnabled: false,
    });

    await expect(host.runEntry("dashboard")).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      stableCode: "capability_unavailable",
    });
  });

  it("agent task 应保留 App 作用域、结构化输入和流式事件", async () => {
    const host = new MockCapabilityHost({
      preview: buildMockPreview(),
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const sdk = host.createSdkContext(
      "content_scenario_planning",
      "manual-run",
    );

    const task = await sdk.agent.startTask({
      title: "内容场景规划",
      prompt: "生成结构化场景",
      taskKind: "content.scenario_planning",
      idempotencyKey: "manual-run:scenario",
      input: { projectId: "project-1" },
      expectedOutput: { table: "content_scenarios" },
      knowledge: [
        { key: "project_knowledge", mode: "retrieval", required: true },
      ],
      tools: ["document_parser"],
      humanReview: true,
    });
    const events = await sdk.agent.streamTask(task.taskId);

    expect(task).toMatchObject({
      taskId: "mock-task-1",
      traceId: "mock-trace-1",
      appId: "content-factory-app",
      entryKey: "content_scenario_planning",
      taskKind: "content.scenario_planning",
      idempotencyKey: "manual-run:scenario",
      input: { projectId: "project-1" },
      expectedOutput: { table: "content_scenarios" },
      knowledge: [
        { key: "project_knowledge", mode: "retrieval", required: true },
      ],
      tools: ["document_parser"],
      humanReview: true,
      provenance: expect.objectContaining({
        workflowRunId: "manual-run",
      }),
    });
    expect(events).toEqual([
      expect.objectContaining({
        eventId: "mock-task-1:event-1",
        taskId: "mock-task-1",
        traceId: "mock-trace-1",
        type: "task:status",
        status: "running",
      }),
    ]);
  });

  it("cancelTask 应追加 cancelled 事件，供 App 内任务面板展示", async () => {
    const host = new MockCapabilityHost({
      preview: buildMockPreview(),
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const sdk = host.createSdkContext(
      "content_scenario_planning",
      "manual-run",
    );
    const task = await sdk.agent.startTask({
      title: "可取消任务",
      prompt: "验证取消事件",
    });

    await sdk.agent.cancelTask(task.taskId);

    expect(await sdk.agent.streamTask(task.taskId)).toEqual([
      expect.objectContaining({ type: "task:status", status: "running" }),
      expect.objectContaining({ type: "task:cancelled", status: "cancelled" }),
    ]);

    const retried = await sdk.agent.retryTask(task.taskId);
    expect(retried).toMatchObject({
      taskId: "mock-task-2",
      traceId: "mock-trace-2",
      retryOfTaskId: "mock-task-1",
      retryAttempt: 1,
      status: "running",
      idempotencyKey: `${task.idempotencyKey}:retry:1`,
      events: [
        expect.objectContaining({
          type: "task:status",
          status: "running",
          message: "Mock task retried.",
        }),
      ],
    });
  });

  it("delete-data 卸载应清理 package、projection、readiness、storage、artifact 和 evidence", async () => {
    const preview = buildMockPreview();
    const host = new MockCapabilityHost({ preview });
    const result = await host.runEntry("dashboard");

    const uninstall = await uninstallApp({
      host,
      cleanupPlan: preview.cleanupPlan,
      deleteData: true,
    });

    expect(uninstall.mode).toBe("delete-data");
    const deletedValues = uninstall.deletedTargets.map(
      (target) => target.value,
    );
    expect(
      deletedValues.some((value) => value.includes("/packages/package-fnv1a-")),
    ).toBe(true);
    expect(deletedValues).toEqual(
      expect.arrayContaining([
        "<LimeAppData>/plugins/projections/content-factory-app.json",
        "<LimeAppData>/plugins/readiness/content-factory-app.json",
        "<LimeAppData>/plugins/package-index/content-factory-app.json",
        "<LimeAppData>/plugins/staging/content-factory-app",
        "<LimeAppData>/plugins/storage/content-factory-app",
        `artifact:${result.artifacts[0].id}`,
        `evidence:${result.evidence[0].id}`,
      ]),
    );
    expect(host.getArtifacts()).toHaveLength(0);
    expect(host.getEvidence()).toHaveLength(0);
    expect(host.getStorageEntries()).toHaveLength(0);
  });

  it("卸载时应清理本地 installed/setup persistence 状态", async () => {
    const preview = buildMockPreview();
    const host = new MockCapabilityHost({ preview });
    const driver = new InMemoryPluginPersistenceDriver();
    const repository = new LocalInstalledPluginStateRepository({ driver });
    await repository.save(
      buildInstalledPluginState({
        preview,
        installedAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      }),
      "2026-05-15T00:00:00.000Z",
    );

    await uninstallApp({
      host,
      cleanupPlan: preview.cleanupPlan,
      deleteData: false,
      installedStateRepository: repository,
    });

    expect(driver.snapshot()).toEqual({});
  });
});
