import { describe, expect, it } from "vitest";
import {
  createRestoredInteractiveMessageSnapshot,
  resolveReadOnlyInteractiveMessageIds,
} from "./workspaceRestoredInteractiveMessages";

function messages(...ids: string[]): Array<{ id: string }> {
  return ids.map((id) => ({ id }));
}

describe("resolveReadOnlyInteractiveMessageIds", () => {
  it("没有 active session 时应重置快照", () => {
    const snapshot = createRestoredInteractiveMessageSnapshot();
    snapshot.sessionId = "session-1";
    snapshot.ids.add("message-1");
    snapshot.capturedInitial = true;
    snapshot.pendingRestoreCapture = true;

    const ids = resolveReadOnlyInteractiveMessageIds({
      snapshot,
      activeSessionKey: null,
      messages: [],
      normalizedInitialSessionId: null,
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      isLoadingFullSessionHistory: false,
    });

    expect(Array.from(ids)).toEqual([]);
    expect(snapshot).toMatchObject({
      sessionId: null,
      capturedInitial: false,
      pendingRestoreCapture: false,
    });
  });

  it("切换 session 时应清空上一会话 id", () => {
    const snapshot = createRestoredInteractiveMessageSnapshot();
    snapshot.sessionId = "session-1";
    snapshot.ids.add("old-message");

    const ids = resolveReadOnlyInteractiveMessageIds({
      snapshot,
      activeSessionKey: "session-2",
      messages: [],
      normalizedInitialSessionId: null,
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      isLoadingFullSessionHistory: false,
    });

    expect(Array.from(ids)).toEqual([]);
    expect(snapshot.sessionId).toBe("session-2");
  });

  it("恢复态有消息时应捕获当前消息 id 并返回新 Set", () => {
    const snapshot = createRestoredInteractiveMessageSnapshot();

    const ids = resolveReadOnlyInteractiveMessageIds({
      snapshot,
      activeSessionKey: "session-1",
      messages: messages("message-1", "message-2"),
      normalizedInitialSessionId: null,
      isAutoRestoringSession: true,
      isSessionHydrating: false,
      isLoadingFullSessionHistory: false,
    });

    expect(Array.from(ids)).toEqual(["message-1", "message-2"]);
    expect(ids).not.toBe(snapshot.ids);
    expect(snapshot.pendingRestoreCapture).toBe(false);
    expect(snapshot.capturedInitial).toBe(true);
  });

  it("恢复态暂无消息时应保留 pending capture", () => {
    const snapshot = createRestoredInteractiveMessageSnapshot();

    const ids = resolveReadOnlyInteractiveMessageIds({
      snapshot,
      activeSessionKey: "session-1",
      messages: [],
      normalizedInitialSessionId: null,
      isAutoRestoringSession: false,
      isSessionHydrating: true,
      isLoadingFullSessionHistory: false,
    });

    expect(Array.from(ids)).toEqual([]);
    expect(snapshot.pendingRestoreCapture).toBe(true);
    expect(snapshot.capturedInitial).toBe(false);
  });

  it("initial session 首次出现消息时应捕获一次", () => {
    const snapshot = createRestoredInteractiveMessageSnapshot();

    const ids = resolveReadOnlyInteractiveMessageIds({
      snapshot,
      activeSessionKey: "initial-session",
      messages: messages("message-1"),
      normalizedInitialSessionId: "initial-session",
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      isLoadingFullSessionHistory: false,
    });

    expect(Array.from(ids)).toEqual(["message-1"]);
    expect(snapshot.capturedInitial).toBe(true);
  });

  it("full history loading 时应捕获当前消息", () => {
    const snapshot = createRestoredInteractiveMessageSnapshot();

    const ids = resolveReadOnlyInteractiveMessageIds({
      snapshot,
      activeSessionKey: "session-1",
      messages: messages("message-1"),
      normalizedInitialSessionId: null,
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      isLoadingFullSessionHistory: true,
    });

    expect(Array.from(ids)).toEqual(["message-1"]);
  });
});
