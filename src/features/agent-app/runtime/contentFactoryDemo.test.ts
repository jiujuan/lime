import { describe, expect, it } from "vitest";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryAgentAppCapabilityStore } from "../adapters/InMemoryAgentAppCapabilityStore";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { uninstallApp } from "../install/uninstallApp";
import { runContentFactoryDemo } from "./contentFactoryDemo";
import { buildWorkflowRuntimeCapabilityProfile } from "./workflowRuntimeCapabilityProfile";
import { WorkflowRuntimeHost } from "./workflowRuntimeHost";

function buildPreview(
  profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    workerRuntimeEnabled: true,
  }),
) {
  return buildInstalledAppPreview({
    profile,
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
}

describe("runContentFactoryDemo", () => {
  it("应通过 CapabilityHost 跑通项目、知识绑定、内容场景、内容表、Evidence 闭环", async () => {
    const store = new InMemoryAgentAppCapabilityStore();
    const host = new AdapterCapabilityHost({
      preview: buildPreview(),
      store,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const result = await runContentFactoryDemo({
      host,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    expect(result.project).toMatchObject({
      projectId: "内容工厂样板项目",
      status: "ready",
      targetPlatforms: ["公众号", "小红书"],
    });
    expect(result.knowledge.records).toEqual([]);
    expect(result.tasks[0]).toMatchObject({
      taskId: "adapter-task-1",
      status: "succeeded",
    });
    expect(result.scenarios).toHaveLength(1);
    expect(result.contentAssets).toHaveLength(2);
    expect(result.storageEntries.map((entry) => entry.key)).toEqual([
      `projects/${result.project.projectId}`,
      `knowledge-bindings/${result.project.projectId}`,
      `content_scenarios/${result.project.projectId}`,
      `content-assets/${result.project.projectId}`,
    ]);
    expect(result.artifact).toMatchObject({
      id: "adapter-artifact-2",
      kind: "content_table",
      provenance: expect.objectContaining({
        sourceKind: "agent_app",
        entryKey: "content_factory",
        workflowRunId: result.run.run.runId,
      }),
    });
    expect(result.artifact.content).toMatchObject({
      sourceArtifactIds: ["adapter-artifact-1"],
      sourceTaskIds: ["adapter-task-1"],
    });
    expect(result.evidence).toMatchObject({
      id: "adapter-evidence-2",
      kind: "content_factory_demo",
      refs: [
        "adapter-artifact-2",
        "adapter-artifact-1",
        "adapter-evidence-1",
        "adapter-task-1",
      ],
    });
    expect(host.getStorageEntries({ workflowRunId: result.run.run.runId })).toHaveLength(5);
    expect(host.getArtifacts({ appId: "content-factory-app" })).toHaveLength(2);
    expect(host.getEvidence({ appId: "content-factory-app" })).toHaveLength(2);
  });

  it("开启 workflow runtime 后应通过受控 DSL 执行 P4.2 内容工厂闭环", async () => {
    const store = new InMemoryAgentAppCapabilityStore();
    const host = new AdapterCapabilityHost({
      preview: buildPreview(
        buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          workerRuntimeEnabled: true,
        }),
      ),
      store,
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const workflowRuntime = new WorkflowRuntimeHost({
      host,
      flags: {
        realAdapterEnabled: true,
        workerRuntimeEnabled: true,
      },
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const result = await runContentFactoryDemo({
      host,
      workflowRuntime,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    expect(result.workflowRun).toMatchObject({
      status: "succeeded",
      workflowKey: "content_factory_demo",
      runId: result.run.run.runId,
    });
    expect(result.workflowRun?.trace.map((event) => event.stepId)).toEqual(
      expect.arrayContaining([
        "store-project",
        "search-knowledge",
        "store-content-scenarios",
        "create-content-table",
        "record-content-evidence",
      ]),
    );
    expect(result.artifact).toMatchObject({
      id: "adapter-artifact-2",
      kind: "content_table",
    });
    expect(result.evidence).toMatchObject({
      id: "adapter-evidence-2",
      refs: [
        "adapter-artifact-2",
        "adapter-artifact-1",
        "adapter-evidence-1",
        "adapter-task-1",
      ],
    });
    expect(result.storageEntries.map((entry) => entry.key)).toEqual([
      `projects/${result.project.projectId}`,
      `knowledge-bindings/${result.project.projectId}`,
      `content_scenarios/${result.project.projectId}`,
      `content-assets/${result.project.projectId}`,
    ]);
    expect(host.getStorageEntries({ workflowRunId: result.run.run.runId })).toHaveLength(5);
  });

  it("delete-data 卸载应清理 P4 demo 写入的 namespace 数据和产物", async () => {
    const preview = buildPreview();
    const host = new AdapterCapabilityHost({ preview });
    await runContentFactoryDemo({ host });

    const uninstall = await uninstallApp({
      host,
      cleanupPlan: preview.cleanupPlan,
      deleteData: true,
    });

    expect(uninstall.deletedTargets.map((target) => target.value)).toEqual(
      expect.arrayContaining([
        "artifact:adapter-artifact-2",
        "evidence:adapter-evidence-2",
        "task:adapter-task-1",
      ]),
    );
    expect(host.getStorageEntries({ appId: "content-factory-app" })).toHaveLength(0);
    expect(host.getArtifacts({ appId: "content-factory-app" })).toHaveLength(0);
    expect(host.getEvidence({ appId: "content-factory-app" })).toHaveLength(0);
    expect(host.getTasks({ appId: "content-factory-app" })).toHaveLength(0);
  });
});
