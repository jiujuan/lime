import { describe, expect, it } from "vitest";
import { shouldSwitchToReadyTaskCenterSession } from "./useWorkspaceTaskCenterSendRuntime";

describe("shouldSwitchToReadyTaskCenterSession", () => {
  it("实时 active session 已接管首页首发时不应再次切换话题", () => {
    expect(
      shouldSwitchToReadyTaskCenterSession({
        readySessionId: "session-ready",
        currentSessionId: null,
        activeSessionId: "session-ready",
      }),
    ).toBe(false);
  });

  it("当前 render 已指向目标 session 时不应重复切换", () => {
    expect(
      shouldSwitchToReadyTaskCenterSession({
        readySessionId: "session-ready",
        currentSessionId: "session-ready",
        activeSessionId: null,
      }),
    ).toBe(false);
  });

  it("目标 session 尚未接管时应执行真实切换", () => {
    expect(
      shouldSwitchToReadyTaskCenterSession({
        readySessionId: "session-ready",
        currentSessionId: "session-old",
        activeSessionId: "session-old",
      }),
    ).toBe(true);
  });

  it("空目标 session 不应触发切换", () => {
    expect(
      shouldSwitchToReadyTaskCenterSession({
        readySessionId: "  ",
        currentSessionId: null,
        activeSessionId: null,
      }),
    ).toBe(false);
  });
});
