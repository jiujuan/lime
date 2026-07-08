import { describe, expect, it } from "vitest";
import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";
import {
  removeQueuedTurnSnapshots,
  upsertQueuedTurnSnapshot,
} from "./agentQueuedTurnProjection";

function queuedTurn(
  queuedTurnId: string,
  position: number,
  createdAt: number,
): QueuedTurnSnapshot {
  return {
    queued_turn_id: queuedTurnId,
    message_preview: queuedTurnId,
    message_text: queuedTurnId,
    created_at: createdAt,
    image_count: 0,
    position,
  };
}

describe("agentQueuedTurnProjection", () => {
  it("upsert 按 queued_turn_id 替换，并按 position / created_at 投影顺序", () => {
    const prev = [
      queuedTurn("queued-third", 2, 30),
      queuedTurn("queued-first", 0, 10),
      queuedTurn("queued-second", 1, 20),
    ];

    const next = upsertQueuedTurnSnapshot(
      prev,
      queuedTurn("queued-second", 0, 15),
    );

    expect(next.map((item) => item.queued_turn_id)).toEqual([
      "queued-first",
      "queued-second",
      "queued-third",
    ]);
    expect(next.find((item) => item.queued_turn_id === "queued-second")).toEqual(
      queuedTurn("queued-second", 0, 15),
    );
  });

  it("remove 只按 id 过滤 queued turn，不重排 position", () => {
    const prev = [
      queuedTurn("queued-0", 0, 10),
      queuedTurn("queued-1", 1, 20),
      queuedTurn("queued-2", 2, 30),
    ];

    const next = removeQueuedTurnSnapshots(prev, ["queued-0"]);

    expect(next.map((item) => item.queued_turn_id)).toEqual([
      "queued-1",
      "queued-2",
    ]);
    expect(next.map((item) => item.position)).toEqual([1, 2]);
  });

  it("empty ids 保持原队列语义", () => {
    const prev = [queuedTurn("queued-1", 1, 20)];

    expect(removeQueuedTurnSnapshots(prev, [])).toEqual(prev);
  });
});
