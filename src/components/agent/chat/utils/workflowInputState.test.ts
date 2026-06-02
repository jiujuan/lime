import { describe, expect, it } from "vitest";
import {
  buildWorkflowInputState,
  type WorkflowInputStateCopy,
} from "./workflowInputState";

const testWorkflowCopy: WorkflowInputStateCopy = {
  quickActions: {
    topicOptionsLabel: "Topic options",
    topicOptionsPrompt: "List topic options.",
    topicChooseBLabel: "Choose B",
    topicChooseBPrompt: "Continue with direction B.",
    writeFastLabel: "Fast draft",
    writeFastPrompt: "Draft quickly.",
    writeCoachLabel: "Coach mode",
    writeCoachPrompt: "Coach me first.",
    publishChecklistLabel: "Publish checklist",
    publishChecklistPrompt: "Build a publish checklist.",
    publishNowLabel: "Prepare publishing",
    publishNowPrompt: "Prepare final publishing assets.",
    nextStepLabel: "Continue",
    nextStepPrompt: "Continue the orchestration.",
  },
  summary: {
    completed: "Workflow complete",
    waitingDecision: "Waiting for decision",
    running: "Arranging next step",
    arranging: "Organizing tasks",
    errorWithTrailing: (count) => `Issue with ${count} remaining`,
    errorLast: "Issue in current step",
    pendingWithTrailing: (count) => `Pending with ${count} remaining`,
    pendingLast: "Pending",
    activeWithTrailing: (count) => `Active with ${count} remaining`,
    activeLast: "Active final step",
  },
  progress: {
    waitingStart: "Waiting to start",
    completed: (completed, total) => `Completed ${completed}/${total}`,
  },
};

describe("buildWorkflowInputState", () => {
  it("非内容主题工作台场景不应返回生成态与快捷动作", () => {
    const state = buildWorkflowInputState({
      isWorkspaceVariant: false,
      isSending: true,
      copy: testWorkflowCopy,
    });

    expect(state.workflowQuickActions).toEqual([]);
    expect(state.workflowQueueItems).toEqual([]);
    expect(state.workflowQueueTotalCount).toBe(0);
    expect(state.renderWorkflowGeneratingPanel).toBe(false);
  });

  it("等待决策 gate 应生成对应快捷动作和队列占位", () => {
    const state = buildWorkflowInputState({
      isWorkspaceVariant: true,
      workflowGate: {
        key: "topic_select",
        title: "Choose topic",
        status: "waiting",
        description: "Pick the next topic.",
      },
      workflowRunState: "await_user_decision",
      isSending: true,
      copy: testWorkflowCopy,
    });

    expect(state.workflowQuickActions).toEqual([
      {
        id: "topic-options",
        label: "Topic options",
        prompt: "List topic options.",
      },
      {
        id: "topic-choose-b",
        label: "Choose B",
        prompt: "Continue with direction B.",
      },
    ]);
    expect(state.workflowQueueItems).toEqual([
      {
        id: "gate-topic_select",
        title: "Choose topic",
        status: "pending",
      },
    ]);
    expect(state.workflowSummaryLabel).toBe("Waiting for decision");
    expect(state.workflowProgressLabel).toBe("Waiting to start");
    expect(state.renderWorkflowGeneratingPanel).toBe(false);
  });

  it("存在开放步骤时应优先展示步骤队列并计算进度", () => {
    const state = buildWorkflowInputState({
      isWorkspaceVariant: true,
      workflowGate: {
        key: "write_mode",
        title: "Write mode",
        status: "running",
        description: "Choose write mode.",
      },
      workflowSteps: [
        { id: "done", title: "Done", status: "completed" },
        { id: "draft", title: "Draft", status: "active" },
        { id: "review", title: "Review", status: "pending" },
        { id: "publish", title: "Publish", status: "pending" },
        { id: "archive", title: "Archive", status: "skipped" },
      ],
      workflowRunState: "auto_running",
      isSending: false,
      copy: testWorkflowCopy,
    });

    expect(state.workflowQuickActions).toEqual([
      {
        id: "write-fast",
        label: "Fast draft",
        prompt: "Draft quickly.",
      },
      {
        id: "write-coach",
        label: "Coach mode",
        prompt: "Coach me first.",
      },
    ]);
    expect(state.workflowQueueItems.map((item) => item.id)).toEqual([
      "draft",
      "review",
      "publish",
    ]);
    expect(state.workflowActiveItem?.id).toBe("draft");
    expect(state.workflowQueueTotalCount).toBe(3);
    expect(state.workflowCompletedCount).toBe(1);
    expect(state.workflowTotalCount).toBe(5);
    expect(state.workflowSummaryLabel).toBe("Active with 2 remaining");
    expect(state.workflowProgressLabel).toBe("Completed 1/5");
    expect(state.renderWorkflowGeneratingPanel).toBe(true);
  });

  it("无显式运行态时应使用发送态控制生成面板", () => {
    const state = buildWorkflowInputState({
      isWorkspaceVariant: true,
      workflowGate: {
        key: "unknown",
        title: "Next",
        status: "running",
        description: "Continue.",
      },
      isSending: true,
      copy: testWorkflowCopy,
    });

    expect(state.workflowQuickActions).toEqual([
      {
        id: "next-step",
        label: "Continue",
        prompt: "Continue the orchestration.",
      },
    ]);
    expect(state.workflowSummaryLabel).toBe("Arranging next step");
    expect(state.renderWorkflowGeneratingPanel).toBe(true);
  });
});
