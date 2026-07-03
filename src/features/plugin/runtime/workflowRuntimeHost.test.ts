import { describe, expect, it } from "vitest";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryPluginCapabilityStore } from "../adapters/InMemoryPluginCapabilityStore";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildContentFactoryUiRuntimeTestManifest } from "../testing/contentFactoryTestManifest";
import { buildWorkflowRuntimeCapabilityProfile } from "./workflowRuntimeCapabilityProfile";
import {
  WorkflowRuntimeHost,
  type PluginWorkflowExecutionContext,
  type PluginWorkflowStep,
} from "./workflowRuntimeHost";

const FIXED_NOW = "2026-05-15T00:00:00.000Z";

function buildAdapterHost() {
  const preview = buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      workerRuntimeEnabled: true,
    }),
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  return new AdapterCapabilityHost({
    preview,
    store: new InMemoryPluginCapabilityStore(),
    now: () => FIXED_NOW,
  });
}

function buildWorkflowRuntime(host: AdapterCapabilityHost) {
  return new WorkflowRuntimeHost({
    host,
    flags: {
      realAdapterEnabled: true,
      workerRuntimeEnabled: true,
    },
    now: () => FIXED_NOW,
  });
}

describe("WorkflowRuntimeHost", () => {
  it("应按受控 DSL 执行 storage、knowledge、artifact、evidence 并记录 trace", async () => {
    const host = buildAdapterHost();
    const runtime = buildWorkflowRuntime(host);

    const result = await runtime.runWorkflow({
      workflowKey: "test_workflow",
      entryKey: "content_scenario_planning",
      title: "测试工作流",
      steps: [
        {
          id: "store-input",
          kind: "storage.set",
          key: "workflow/input",
          value: { topic: "Plugin" },
          assignTo: "inputStorage",
        },
        {
          id: "search-knowledge",
          kind: "knowledge.search",
          query: "project_knowledge",
          limit: 1,
          assignTo: "knowledge",
        },
        {
          id: "create-artifact",
          kind: "artifacts.create",
          artifactKind: "workflow_table",
          title: "Workflow Artifact",
          content: (context: PluginWorkflowExecutionContext) => ({
            storageKey: context.storageKeys[0],
            knowledgeCount: (context.values.knowledge as { records: unknown[] }).records
              .length,
          }),
          assignTo: "artifact",
        },
        {
          id: "record-evidence",
          kind: "evidence.record",
          evidenceKind: "workflow_runtime_test",
          message: "Workflow runtime test completed.",
          refs: (context: PluginWorkflowExecutionContext) => [context.artifactIds[0]],
          assignTo: "evidence",
        },
      ],
    });

    expect(result.run).toMatchObject({
      status: "succeeded",
      workflowKey: "test_workflow",
      entryKey: "content_scenario_planning",
      policy: expect.objectContaining({ allowRawWorker: false }),
    });
    expect(result.storageEntries.map((entry) => entry.key)).toEqual([
      "workflow/input",
    ]);
    expect(result.knowledge[0].records[0]).toMatchObject({
      bindingKey: "project_knowledge",
    });
    expect(result.artifacts[0]).toMatchObject({
      id: "adapter-artifact-1",
      kind: "workflow_table",
    });
    expect(result.evidence[0]).toMatchObject({
      id: "adapter-evidence-1",
      refs: ["adapter-artifact-1"],
    });
    expect(result.run.trace.map((event) => event.status)).toContain("succeeded");
    expect(result.run.trace.some((event) => event.stepId === "create-artifact")).toBe(
      true,
    );
  });

  it("关闭 workerRuntimeEnabled 时应拒绝执行 workflow", async () => {
    const host = buildAdapterHost();
    const runtime = new WorkflowRuntimeHost({
      host,
      flags: { realAdapterEnabled: true, workerRuntimeEnabled: false },
    });

    await expect(
      runtime.runWorkflow({
        workflowKey: "disabled_workflow",
        entryKey: "content_scenario_planning",
        title: "Disabled workflow",
        steps: [],
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_RUNTIME_DISABLED",
    });
  });

  it("policy 应阻断未允许的 step kind", async () => {
    const host = buildAdapterHost();
    const runtime = new WorkflowRuntimeHost({
      host,
      flags: { realAdapterEnabled: true, workerRuntimeEnabled: true },
      policy: { allowedStepKinds: ["storage.set"] },
    });

    await expect(
      runtime.runWorkflow({
        workflowKey: "blocked_workflow",
        entryKey: "content_scenario_planning",
        title: "Blocked workflow",
        steps: [
          {
            id: "create-artifact",
            kind: "artifacts.create",
            artifactKind: "blocked",
            title: "Blocked",
            content: {},
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_POLICY_VIOLATION",
    });
  });

  it("agent.startTask step 应把结构化输入、期望输出和人工确认绑定到 App 作用域任务", async () => {
    const host = buildAdapterHost();
    const runtime = buildWorkflowRuntime(host);

    const result = await runtime.runWorkflow({
      workflowKey: "scenario_workflow",
      entryKey: "content_scenario_planning",
      title: "内容场景规划",
      initialValues: {
        projectId: "project-1",
      },
      steps: [
        {
          id: "agent-task",
          kind: "agent.startTask",
          taskTitle: "生成内容场景",
          prompt: "根据项目知识生成结构化场景",
          taskKind: "content.scenario_planning",
          idempotencyKey: (context: PluginWorkflowExecutionContext) =>
            `${context.runId}:scenario`,
          input: (context: PluginWorkflowExecutionContext) => ({
            projectId: context.values.projectId,
          }),
          expectedOutput: { table: "content_scenarios" },
          tools: ["gateway_model_call"],
          humanReview: true,
          assignTo: "scenarioTask",
        },
        {
          id: "write-back",
          kind: "storage.set",
          key: "workflow/scenario-task",
          value: (context: PluginWorkflowExecutionContext) => ({
            taskId: context.taskIds[0],
            status: "needs-human-review",
          }),
        },
      ],
    });

    expect(result.tasks[0]).toMatchObject({
      taskId: "adapter-task-1",
      taskKind: "content.scenario_planning",
      idempotencyKey: `${result.run.runId}:scenario`,
      input: { projectId: "project-1" },
      expectedOutput: { table: "content_scenarios" },
      tools: ["gateway_model_call"],
      humanReview: true,
      events: [expect.objectContaining({ type: "task:status", status: "running" })],
    });
    expect(result.storageEntries.at(-1)).toMatchObject({
      key: "workflow/scenario-task",
      value: {
        taskId: "adapter-task-1",
        status: "needs-human-review",
      },
    });
  });

  it("应支持在 step 间取消 workflow，且不继续写后续 Artifact", async () => {
    const host = buildAdapterHost();
    const runtime = buildWorkflowRuntime(host);

    const result = await runtime.runWorkflow(
      {
        workflowKey: "cancel_workflow",
        entryKey: "content_scenario_planning",
        title: "Cancel workflow",
        steps: [
          {
            id: "store-input",
            kind: "storage.set",
            key: "workflow/cancelled",
            value: { status: "stored" },
          },
          {
            id: "create-artifact",
            kind: "artifacts.create",
            artifactKind: "should_not_run",
            title: "Should not run",
            content: {},
          },
        ],
      },
      {
        onTrace: (event, control) => {
          if (event.stepId === "store-input" && event.status === "succeeded") {
            control.cancel();
          }
        },
      },
    );

    expect(result.run.status).toBe("cancelled");
    expect(result.storageEntries).toHaveLength(1);
    expect(result.artifacts).toHaveLength(0);
    expect(result.run.trace.at(-1)).toMatchObject({ status: "cancelled" });
    expect(host.getArtifacts({ appId: "content-factory-app" })).toHaveLength(0);
  });

  it("应拒绝未注册的 raw worker / network 类 step", async () => {
    const host = buildAdapterHost();
    const runtime = buildWorkflowRuntime(host);
    const rawStep = {
      id: "network-fetch",
      kind: "network.fetch",
      url: "https://example.com",
    } as unknown as PluginWorkflowStep;

    await expect(
      runtime.runWorkflow({
        workflowKey: "raw_step_workflow",
        entryKey: "content_scenario_planning",
        title: "Raw step workflow",
        steps: [rawStep],
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_POLICY_VIOLATION",
    });
  });
});
