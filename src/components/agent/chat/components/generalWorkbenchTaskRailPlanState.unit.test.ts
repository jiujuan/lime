import { describe, expect, it } from "vitest";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import { buildGeneralWorkbenchTaskRailProjection } from "./generalWorkbenchTaskRailViewModel";

type TaskRailTranslate = NonNullable<
  Parameters<typeof buildGeneralWorkbenchTaskRailProjection>[0]["t"]
>;

const t = ((key: string, values?: Record<string, unknown>) => {
  const templates: Record<string, string> = {
    "generalWorkbench.taskRail.planRevision": "计划 {{revision}}",
    "generalWorkbench.taskRail.planRevisionTitle":
      "当前计划版本：{{revision}}",
    "generalWorkbench.taskRail.stepMeta": "步骤 {{index}}",
    "generalWorkbench.taskRail.empty.noSteps":
      "发送任务后，这里会显示进度和输出。",
    "generalWorkbench.taskRail.empty.withSteps":
      "当前还没有执行记录，后续产物会出现在这里。",
  };
  return (templates[key] ?? key).replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_, name: string) => String(values?.[name.trim()] ?? ""),
  );
}) as TaskRailTranslate;

describe("buildGeneralWorkbenchTaskRailProjection plan state", () => {
  it("应从 threadRead.thread_items 恢复 revisioned proposed_plan", () => {
    const threadRead: AgentRuntimeThreadReadModel = {
      thread_id: "thread-1",
      thread_items: [
        {
          id: "plan:proposed_plan:fixture-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 7,
          status: "completed",
          started_at: "2026-07-10T05:35:10.850Z",
          completed_at: "2026-07-10T05:35:10.935Z",
          updated_at: "2026-07-10T05:35:10.935Z",
          type: "plan",
          text:
            "- 确认计划模式请求进入 App Server\n" +
            "- 输出 proposed_plan\n" +
            "- 验证右侧计划轨显示",
          metadata: {
            revisionId: "proposed_plan:fixture-1",
            source: "proposed_plan",
            plan: [
              { step: "确认计划模式请求进入 App Server", status: "completed" },
              { step: "输出 proposed_plan", status: "in_progress" },
              { step: "验证右侧计划轨显示", status: "pending" },
            ],
          },
        },
      ],
    };

    const projection = buildGeneralWorkbenchTaskRailProjection({
      workflowSteps: [],
      completedSteps: 0,
      progressPercent: 0,
      messages: [],
      groupedActivityLogs: [],
      groupedCreationTaskEvents: [],
      threadRead,
      t,
    });

    expect(projection.planItems).toEqual([
      {
        id: "plan:proposed_plan:fixture-1:0:确认计划模式请求进入 App Server",
        title: "确认计划模式请求进入 App Server",
        status: "completed",
        meta: "步骤 1",
      },
      {
        id: "plan:proposed_plan:fixture-1:1:输出 proposed_plan",
        title: "输出 proposed_plan",
        status: "running",
        meta: "步骤 2",
      },
      {
        id: "plan:proposed_plan:fixture-1:2:验证右侧计划轨显示",
        title: "验证右侧计划轨显示",
        status: "pending",
        meta: "步骤 3",
      },
    ]);
    expect(projection.planRevision).toEqual({
      revisionId: "proposed_plan:fixture-1",
      label: "计划 proposed_plan:fixture-1",
      title: "当前计划版本：proposed_plan:fixture-1",
      source: "thread_item",
      turnId: "turn-1",
    });
  });
});
