import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  useWorkflowInputState,
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

describe("useWorkflowInputState", () => {
  it("非内容主题工作台场景不应返回生成态与快捷动作", () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    let state: ReturnType<typeof useWorkflowInputState> | null = null;
    const container = document.createElement("div");
    const root = createRoot(container);

    function TestComponent() {
      state = useWorkflowInputState({
        isWorkspaceVariant: false,
        isSending: true,
        copy: testWorkflowCopy,
      });
      return null;
    }

    act(() => {
      root.render(React.createElement(TestComponent));
    });

    expect(state).not.toBeNull();
    expect(state!.workflowQuickActions).toEqual([]);
    expect(state!.workflowQueueItems).toEqual([]);
    expect(state!.renderWorkflowGeneratingPanel).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
