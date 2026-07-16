import { describe, expect, it } from "vitest";
import { hasActiveThreadReadActivity } from "./threadReadActivity";

describe("hasActiveThreadReadActivity", () => {
  it("active turn running 时返回 true", () => {
    expect(
      hasActiveThreadReadActivity({
        status: "running",
        active_turn_id: "turn-active",
        queued_turns: [{ turn_id: "turn-queued", status: "queued" }],
        turns: [
          { turn_id: "turn-active", status: "running" },
          { turn_id: "turn-queued", status: "queued" },
        ],
      }),
    ).toBe(true);
  });

  it("只有 queued turn 时返回 false", () => {
    expect(
      hasActiveThreadReadActivity({
        status: "running",
        active_turn_id: null,
        queued_turns: [{ turn_id: "turn-queued", status: "queued" }],
        turns: [{ turn_id: "turn-queued", status: "running" }],
      }),
    ).toBe(false);
  });

  it("active turn 已完成时返回 false", () => {
    expect(
      hasActiveThreadReadActivity({
        status: "running",
        active_turn_id: "turn-completed",
        queued_turns: [{ turn_id: "turn-queued", status: "queued" }],
        turns: [
          { turn_id: "turn-completed", status: "completed" },
          { turn_id: "turn-queued", status: "running" },
        ],
      }),
    ).toBe(false);
  });
});
