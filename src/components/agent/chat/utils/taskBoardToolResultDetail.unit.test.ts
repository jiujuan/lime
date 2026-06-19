import { describe, expect, it } from "vitest";

import { resolveTaskBoardResultDetailText } from "./taskBoardToolResultDetail";

describe("taskBoardToolResultDetail", () => {
  const copy = {
    taskNotFound: () => "Task not found",
    moreTasks: (count: number) => `${count} more tasks`,
    emptyTaskList: () => "Task list is empty",
  };

  it("uses injected copy for task fallback rows", () => {
    expect(
      resolveTaskBoardResultDetailText({
        toolName: "TaskGetTool",
        outputText: "{}",
        metadata: null,
        fallbackSummary: null,
        copy,
      }),
    ).toBe("Task not found");

    expect(
      resolveTaskBoardResultDetailText({
        toolName: "TaskListTool",
        outputText: JSON.stringify({ tasks: [] }),
        metadata: null,
        fallbackSummary: null,
        copy,
      }),
    ).toBe("Task list is empty");
  });

  it("summarizes long task lists with injected count copy", () => {
    const tasks = Array.from({ length: 7 }, (_, index) => ({
      id: `task-${index + 1}`,
      title: `Task ${index + 1}`,
      status: "running",
    }));

    const detail = resolveTaskBoardResultDetailText({
      toolName: "TaskListTool",
      outputText: JSON.stringify({ tasks }),
      metadata: null,
      fallbackSummary: "Task list reviewed",
      copy,
    });

    expect(detail).toContain("Task list reviewed");
    expect(detail).toContain("#task-1 Task 1 · running");
    expect(detail).toContain("2 more tasks");
    expect(detail).not.toContain("还有");
    expect(detail).not.toContain("任务列表为空");
  });
});
