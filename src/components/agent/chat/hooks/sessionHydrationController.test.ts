import { describe, expect, it } from "vitest";
import {
  SESSION_DETAIL_HISTORY_LIMIT,
  buildSessionDetailHydrationOptions,
  isCurrentSessionHydrationRequest,
  normalizeSessionDetailHistoryLimit,
} from "./sessionHydrationController";

describe("sessionHydrationController", () => {
  it("应把非法 historyLimit 收敛到旧会话详情默认窗口", () => {
    expect(normalizeSessionDetailHistoryLimit(null)).toBe(
      SESSION_DETAIL_HISTORY_LIMIT,
    );
    expect(normalizeSessionDetailHistoryLimit(0)).toBe(
      SESSION_DETAIL_HISTORY_LIMIT,
    );
    expect(normalizeSessionDetailHistoryLimit(-1)).toBe(
      SESSION_DETAIL_HISTORY_LIMIT,
    );
    expect(normalizeSessionDetailHistoryLimit(12.8)).toBe(12);
  });

  it("应统一构造带 historyLimit 的会话详情请求参数", () => {
    expect(buildSessionDetailHydrationOptions()).toEqual({
      historyLimit: SESSION_DETAIL_HISTORY_LIMIT,
    });
    expect(
      buildSessionDetailHydrationOptions({ resumeSessionStartHooks: true }),
    ).toEqual({
      historyLimit: SESSION_DETAIL_HISTORY_LIMIT,
      resumeSessionStartHooks: true,
    });
    expect(
      buildSessionDetailHydrationOptions({
        resumeSessionStartHooks: false,
        historyLimit: 8,
      }),
    ).toEqual({
      historyLimit: 8,
    });
  });

  it("应按 requestVersion 和 targetSessionId 丢弃过期 hydration 结果", () => {
    expect(
      isCurrentSessionHydrationRequest({
        currentRequestVersion: 2,
        requestVersion: 2,
        currentSessionId: "session-a",
        targetSessionId: "session-a",
      }),
    ).toBe(true);
    expect(
      isCurrentSessionHydrationRequest({
        currentRequestVersion: 3,
        requestVersion: 2,
        currentSessionId: "session-a",
        targetSessionId: "session-a",
      }),
    ).toBe(false);
    expect(
      isCurrentSessionHydrationRequest({
        currentRequestVersion: 2,
        requestVersion: 2,
        currentSessionId: "session-b",
        targetSessionId: "session-a",
      }),
    ).toBe(false);
  });
});
