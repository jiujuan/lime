import { describe, expect, it } from "vitest";
import { shouldApplyAgentStreamTerminalEvent } from "./agentStreamTerminalTurnGuard";

describe("shouldApplyAgentStreamTerminalEvent", () => {
  it("没有当前 turn 线索但终态带 turnId 时允许进入首事件完成路径", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        terminalTurnId: "turn-first",
      }),
    ).toBe(true);
  });

  it("终态缺少 turnId 时拒绝应用", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        activeTextSegmentTurnId: "turn-current",
        currentTurnId: "turn-current",
      }),
    ).toBe(false);
  });

  it("只有 queuedTurnId 时终态必须命中 queuedTurnId", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        queuedTurnId: "queued-canceled",
        terminalTurnId: "queued-canceled",
      }),
    ).toBe(true);
  });

  it("只有 queuedTurnId 时拒绝不匹配的终态", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        queuedTurnId: "queued-canceled",
        terminalTurnId: "turn-canceled",
      }),
    ).toBe(false);
  });

  it("终态 turn 命中当前 active text turn 时允许应用", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        activeTextSegmentTurnId: "turn-current",
        currentTurnId: "turn-current",
        terminalTurnId: "turn-current",
      }),
    ).toBe(true);
  });

  it("终态 turn 与当前 turn 不一致时拒绝应用", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        activeTextSegmentTurnId: "turn-current",
        currentTurnId: "turn-current",
        terminalTurnId: "turn-old",
      }),
    ).toBe(false);
  });

  it("存在旧 active text turn 但终态命中 current turn 时仍允许应用", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        activeTextSegmentTurnId: "turn-old-text",
        currentTurnId: "turn-current",
        terminalTurnId: "turn-current",
      }),
    ).toBe(true);
  });

  it("存在当前 turn 时不允许 queuedTurnId 放行旧终态", () => {
    expect(
      shouldApplyAgentStreamTerminalEvent({
        currentTurnId: "turn-current",
        queuedTurnId: "turn-old",
        terminalTurnId: "turn-old",
      }),
    ).toBe(false);
  });
});
