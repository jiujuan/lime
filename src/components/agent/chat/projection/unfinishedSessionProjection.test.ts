import { describe, expect, it } from "vitest";
import type { AgentSessionInfo } from "@/lib/api/agentRuntime";
import {
  resolveUnfinishedSessionProjection,
  selectMostRecentUnfinishedSessionProjection,
} from "./unfinishedSessionProjection";

const BASE_NOW_MS = 1780847600 * 1000;

function session(
  id: string,
  overrides: Partial<AgentSessionInfo> = {},
): AgentSessionInfo {
  return {
    id,
    name: id,
    created_at: 1780847000,
    updated_at: 1780847000,
    messages_count: 1,
    ...overrides,
  };
}

describe("unfinishedSessionProjection", () => {
  it("running / queued / waitingAction 应识别为未完成会话", () => {
    expect(
      resolveUnfinishedSessionProjection(
        session("running", {
          thread_status: "RUNNING",
          latest_turn_status: "ACCEPTED",
          active_turn_id: "turn-running",
        }),
        { nowMs: BASE_NOW_MS },
      ),
    ).toEqual(
      expect.objectContaining({
        sessionId: "running",
        status: "running",
        activeTurnId: "turn-running",
      }),
    );

    expect(
      resolveUnfinishedSessionProjection(
        session("queued", {
          thread_status: "running",
          latest_turn_status: "queued",
          queued_turn_count: 2,
        }),
        { nowMs: BASE_NOW_MS },
      ),
    ).toEqual(
      expect.objectContaining({
        sessionId: "queued",
        status: "queued",
        queuedTurnCount: 2,
      }),
    );

    expect(
      resolveUnfinishedSessionProjection(
        session("waiting", {
          thread_status: "waiting_request",
          latest_turn_status: "needs_input",
          active_turn_id: "turn-waiting",
        }),
        { nowMs: BASE_NOW_MS },
      ),
    ).toEqual(
      expect.objectContaining({
        sessionId: "waiting",
        status: "waitingAction",
        preview: "等待你确认后继续。",
        actionLabel: "继续确认",
      }),
    );
  });

  it("陈旧 running 或仅残留 active_turn_id 不应让侧栏继续转圈", () => {
    expect(
      resolveUnfinishedSessionProjection(
        session("stale-running", {
          thread_status: "running",
          latest_turn_status: "running",
          active_turn_id: "turn-stale",
          created_at: 1780847600 - 31 * 60,
          updated_at: 1780847600 - 31 * 60,
        }),
        { nowMs: BASE_NOW_MS },
      ),
    ).toBeNull();

    expect(
      resolveUnfinishedSessionProjection(
        session("active-only", {
          active_turn_id: "turn-stale",
        }),
        { nowMs: BASE_NOW_MS },
      ),
    ).toBeNull();

    expect(
      resolveUnfinishedSessionProjection(
        session("idle-with-stale-latest", {
          thread_status: "idle",
          latest_turn_status: "running",
          active_turn_id: "turn-stale",
        }),
        { nowMs: BASE_NOW_MS },
      ),
    ).toBeNull();
  });

  it("终态必须 fail closed，不能被 stale activeTurnId 或 queued count 误恢复", () => {
    expect(
      resolveUnfinishedSessionProjection(
        session("completed-stale", {
          thread_status: "completed",
          latest_turn_status: "running",
          active_turn_id: "turn-stale",
          queued_turn_count: 1,
        }),
      ),
    ).toBeNull();

    expect(
      resolveUnfinishedSessionProjection(
        session("failed-stale", {
          thread_status: "failed",
          active_turn_id: "turn-stale",
        }),
      ),
    ).toBeNull();

    expect(
      resolveUnfinishedSessionProjection(
        session("completed-latest-stale", {
          latest_turn_status: "completed",
          active_turn_id: "turn-stale",
        }),
      ),
    ).toBeNull();

    expect(
      resolveUnfinishedSessionProjection(
        session("completed-latest-queued-stale", {
          latest_turn_status: "completed",
          queued_turn_count: 2,
        }),
      ),
    ).toBeNull();
  });

  it("多个候选只选择更新时间最近的一个", () => {
    expect(
      selectMostRecentUnfinishedSessionProjection([
        session("older", {
          thread_status: "running",
          active_turn_id: "turn-older",
          updated_at: 1780847000,
        }),
        session("newer", {
          thread_status: "waitingAction",
          active_turn_id: "turn-newer",
          updated_at: 1780847600,
        }),
        session("done", {
          thread_status: "completed",
          active_turn_id: "turn-done",
          updated_at: 1780849000,
        }),
      ], { nowMs: BASE_NOW_MS })?.sessionId,
    ).toBe("newer");
  });

  it("缺少稳定时间时不自动恢复", () => {
    expect(
      resolveUnfinishedSessionProjection(
        session("missing-time", {
          thread_status: "running",
          active_turn_id: "turn-running",
          created_at: undefined as unknown as number,
          updated_at: undefined as unknown as number,
        }),
        { nowMs: BASE_NOW_MS },
      ),
    ).toBeNull();
  });
});
