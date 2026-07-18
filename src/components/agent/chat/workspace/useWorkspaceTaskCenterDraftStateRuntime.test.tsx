import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceTaskCenterDraftStateRuntime } from "./useWorkspaceTaskCenterDraftStateRuntime";

type Runtime = ReturnType<typeof useWorkspaceTaskCenterDraftStateRuntime>;

let container: HTMLDivElement;
let root: Root;
let runtime: Runtime | null = null;

function Harness({
  agentEntry = "claw",
  messagesLength = 0,
  effectiveThreadItemCount = 0,
}: {
  agentEntry?: "new-task" | "claw";
  messagesLength?: number;
  effectiveThreadItemCount?: number;
}) {
  runtime = useWorkspaceTaskCenterDraftStateRuntime({
    agentEntry,
    deferSessionRecentMetadataSyncForNavigation: () => undefined,
    effectiveThreadItemCount,
    hasInitialSessionTopic: true,
    initialSessionMessagesCount: 2,
    messagesLength,
    normalizedInitialSessionId: "session-history",
    sessionId: "session-history",
  });
  return null;
}

function renderHarness(props: Parameters<typeof Harness>[0] = {}): Runtime {
  act(() => {
    root.render(<Harness {...props} />);
  });
  if (!runtime) {
    throw new Error("hook 尚未初始化");
  }
  return runtime;
}

describe("useWorkspaceTaskCenterDraftStateRuntime", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runtime = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    runtime = null;
  });

  it("已有 Turn 元数据但可见历史为空时仍应 hydrate 当前会话", () => {
    expect(renderHarness().shouldHydrateEmptyMatchedInitialSession).toBe(true);
  });

  it("已有 Message 或 Item 内容时不应重复 hydrate 当前会话", () => {
    expect(
      renderHarness({ messagesLength: 1 })
        .shouldHydrateEmptyMatchedInitialSession,
    ).toBe(false);
    expect(
      renderHarness({ effectiveThreadItemCount: 1 })
        .shouldHydrateEmptyMatchedInitialSession,
    ).toBe(false);
  });

  it("从 new-task 进入 Claw 时应在绘制前清理旧草稿激活状态", () => {
    const newTaskRuntime = renderHarness({ agentEntry: "new-task" });
    newTaskRuntime.taskCenterDraftSurfaceActiveRef.current = true;
    act(() => {
      newTaskRuntime.setActiveTaskCenterDraftTabId("draft-1");
      newTaskRuntime.setTaskCenterDraftTabs([
        {
          id: "draft-1",
          title: "新任务",
          createdAt: new Date("2026-06-22T00:00:00.000Z"),
          updatedAt: new Date("2026-06-22T00:00:00.000Z"),
          status: "draft",
        },
      ]);
    });

    const clawRuntime = renderHarness({ agentEntry: "claw" });

    expect(clawRuntime.taskCenterDraftSurfaceActiveRef.current).toBe(false);
    expect(clawRuntime.activeTaskCenterDraftTabId).toBeNull();
    expect(clawRuntime.taskCenterDraftTabs).toEqual([]);
  });
});
