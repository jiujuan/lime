import { describe, expect, it } from "vitest";
import {
  hasActiveThreadReadActivity,
  hasRunningThreadReadActivity,
} from "./threadReadActivity";

describe("hasActiveThreadReadActivity", () => {
  it("active turn running 时返回 true", () => {
    expect(
      hasActiveThreadReadActivity({
        status: "running",
        active_turn_id: "turn-active",
        turns: [{ turn_id: "turn-active", status: "running" }],
      }),
    ).toBe(true);
  });

  it("没有 active turn 时返回 false", () => {
    expect(
      hasActiveThreadReadActivity({
        status: "running",
        active_turn_id: null,
        turns: [{ turn_id: "turn-running", status: "running" }],
      }),
    ).toBe(false);
  });

  it("active turn 已完成时返回 false", () => {
    expect(
      hasActiveThreadReadActivity({
        status: "running",
        active_turn_id: "turn-completed",
        turns: [{ turn_id: "turn-completed", status: "completed" }],
      }),
    ).toBe(false);
  });

  it("canonical queued status 仍作为运行活动", () => {
    expect(
      hasRunningThreadReadActivity(
        {
          status: "queued",
          updated_at: "2026-07-19T12:00:00.000Z",
        },
        { nowMs: Date.parse("2026-07-19T12:00:01.000Z") },
      ),
    ).toBe(true);
  });

  it("pending request 可维持 active turn 的运行活动", () => {
    expect(
      hasRunningThreadReadActivity(
        {
          status: "running",
          active_turn_id: "turn-active",
          pending_requests: [{ id: "request-1" }],
          turns: [
            {
              turn_id: "turn-active",
              status: "running",
              updated_at: "2026-07-19T11:00:00.000Z",
            },
          ],
        },
        {
          nowMs: Date.parse("2026-07-19T12:00:00.000Z"),
          staleRunningMs: 1_000,
        },
      ),
    ).toBe(true);
  });
});
