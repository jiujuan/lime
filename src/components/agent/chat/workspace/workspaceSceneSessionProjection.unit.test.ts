import { describe, expect, it } from "vitest";
import { resolveWorkspaceSceneSessionProjection } from "./workspaceSceneSessionProjection";

function baseInput(
  overrides: Partial<
    Parameters<typeof resolveWorkspaceSceneSessionProjection>[0]
  > = {},
): Parameters<typeof resolveWorkspaceSceneSessionProjection>[0] {
  return {
    shouldHideCurrentSessionContent: false,
    displayMessages: ["message-1"],
    homePendingPreviewMessages: ["preview-1"],
    turns: ["turn-1"],
    effectiveThreadItems: ["thread-item-1"],
    currentTurnId: "turn-1",
    threadRead: { id: "thread-read-1" },
    executionRuntime: { id: "runtime-1" },
    planComposerPendingActions: ["pending-action-1"],
    submittedActionsInFlight: ["submitted-action-1"],
    queuedTurns: ["queued-turn-1"],
    isPreparingSend: false,
    isTaskCenterDraftSendPending: false,
    isSending: true,
    ...overrides,
  };
}

describe("resolveWorkspaceSceneSessionProjection", () => {
  it("任务中心首页遮罩当前会话时应清空场景投影", () => {
    const projection = resolveWorkspaceSceneSessionProjection(
      baseInput({
        shouldHideCurrentSessionContent: true,
        isPreparingSend: true,
        isTaskCenterDraftSendPending: true,
      }),
    );

    expect(projection).toEqual({
      sceneDisplayMessages: [],
      sceneTurns: [],
      sceneThreadItems: [],
      sceneCurrentTurnId: null,
      sceneThreadRead: null,
      sceneExecutionRuntime: null,
      scenePendingActions: [],
      sceneSubmittedActionsInFlight: [],
      sceneQueuedTurns: [],
      sceneIsPreparingSend: false,
      sceneIsSending: false,
    });
  });

  it("当前会话无消息时应使用首页 pending preview 消息", () => {
    const projection = resolveWorkspaceSceneSessionProjection(
      baseInput({
        displayMessages: [],
        isTaskCenterDraftSendPending: true,
        isSending: false,
      }),
    );

    expect(projection.sceneDisplayMessages).toEqual(["preview-1"]);
    expect(projection.sceneTurns).toEqual(["turn-1"]);
    expect(projection.scenePendingActions).toEqual(["pending-action-1"]);
    expect(projection.sceneIsPreparingSend).toBe(true);
    expect(projection.sceneIsSending).toBe(false);
  });

  it("当前 read model 仍在运行时应保持场景发送态", () => {
    const projection = resolveWorkspaceSceneSessionProjection(
      baseInput({
        isSending: false,
        threadRead: {
          status: "running",
          active_turn_id: "turn-running",
        },
      }),
    );

    expect(projection.sceneIsSending).toBe(true);
  });

  it("当前 read model 的运行中 turn 也应保持场景发送态", () => {
    const projection = resolveWorkspaceSceneSessionProjection(
      baseInput({
        isSending: false,
        threadRead: {
          status: "idle",
          turns: [
            { turn_id: "turn-completed", status: "completed" },
            { turn_id: "turn-running", status: "running" },
          ],
        },
      }),
    );

    expect(projection.sceneIsSending).toBe(true);
  });
});
