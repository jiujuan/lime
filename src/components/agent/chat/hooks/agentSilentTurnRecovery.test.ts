import { describe, expect, it } from "vitest";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import {
  hasRecoverableSilentTurnActivity,
  hasRecoverableTerminalTurnActivity,
} from "./agentSilentTurnRecovery";

function createDetail(
  overrides: Partial<AsterSessionDetail> = {},
): AsterSessionDetail {
  return {
    id: "session-1",
    created_at: 1_710_000_000,
    updated_at: 1_710_000_001,
    messages: [],
    turns: [],
    items: [],
    queued_turns: [],
    ...overrides,
  };
}

describe("agentSilentTurnRecovery", () => {
  it("应识别同 prompt 的近期 turn 活动", () => {
    const requestStartedAt = Date.parse("2026-04-23T10:00:12.000Z");
    const detail = createDetail({
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "@配图 三国人物群像",
          status: "running",
          started_at: "2026-04-23T10:00:10.000Z",
          created_at: "2026-04-23T10:00:10.000Z",
          updated_at: "2026-04-23T10:00:13.000Z",
        },
      ],
    });

    expect(
      hasRecoverableSilentTurnActivity(
        detail,
        requestStartedAt,
        "@配图 三国人物群像",
      ),
    ).toBe(true);
  });

  it("App Server turn 缺少旧 prompt_text 字段时仍应按近期活动恢复", () => {
    const requestStartedAt = Date.parse("2026-04-23T10:00:12.000Z");
    const detail = createDetail({
      turns: [
        {
          id: "turn-app-server-current",
          thread_id: "thread-1",
          status: "running",
          started_at: "2026-04-23T10:00:10.000Z",
          created_at: "2026-04-23T10:00:10.000Z",
          updated_at: "2026-04-23T10:00:13.000Z",
        } as never,
      ],
    });

    expect(() =>
      hasRecoverableSilentTurnActivity(
        detail,
        requestStartedAt,
        "整理今天的国际新闻",
      ),
    ).not.toThrow();
    expect(
      hasRecoverableSilentTurnActivity(
        detail,
        requestStartedAt,
        "整理今天的国际新闻",
      ),
    ).toBe(true);
  });

  it("应识别无精确 prompt 命中但已入队的 queued turn", () => {
    const requestStartedAt = Date.parse("2026-04-23T10:00:12.000Z");
    const detail = createDetail({
      queued_turns: [
        {
          queued_turn_id: "queued-1",
          message_preview: "@配图 三国人物群像",
          message_text: "@配图 三国人物群像",
          created_at: 1_777_025_212,
          image_count: 0,
          position: 0,
        },
      ],
    });

    expect(
      hasRecoverableSilentTurnActivity(
        detail,
        requestStartedAt,
        "@配图 三国人物群像",
      ),
    ).toBe(true);
  });

  it("queued turn 缺少旧 message_text 字段时不应中断恢复判断", () => {
    const requestStartedAt = Date.parse("2026-04-23T10:00:12.000Z");
    const detail = createDetail({
      queued_turns: [
        {
          queued_turn_id: "queued-current",
          created_at: 1_777_025_212,
          image_count: 0,
          position: 0,
        } as never,
      ],
    });

    expect(() =>
      hasRecoverableSilentTurnActivity(
        detail,
        requestStartedAt,
        "整理今天的国际新闻",
      ),
    ).not.toThrow();
  });

  it("不应把请求开始前的陈旧活动误判为可恢复", () => {
    const requestStartedAt = Date.parse("2026-04-23T10:00:12.000Z");
    const detail = createDetail({
      turns: [
        {
          id: "turn-old",
          thread_id: "thread-1",
          prompt_text: "上一轮消息",
          status: "completed",
          started_at: "2026-04-23T10:00:00.000Z",
          completed_at: "2026-04-23T10:00:01.000Z",
          created_at: "2026-04-23T10:00:00.000Z",
          updated_at: "2026-04-23T10:00:01.000Z",
        },
      ],
      items: [
        {
          id: "item-old",
          thread_id: "thread-1",
          turn_id: "turn-old",
          sequence: 0,
          type: "agent_message",
          text: "上一轮完成结果",
          status: "completed",
          started_at: "2026-04-23T10:00:00.000Z",
          completed_at: "2026-04-23T10:00:01.000Z",
          updated_at: "2026-04-23T10:00:01.000Z",
        },
      ],
    });

    expect(
      hasRecoverableSilentTurnActivity(
        detail,
        requestStartedAt,
        "@配图 三国人物群像",
      ),
    ).toBe(false);
  });

  it("终态恢复不应把 running turn 当作可释放发送态", () => {
    const requestStartedAt = Date.parse("2026-04-23T10:00:12.000Z");
    const detail = createDetail({
      turns: [
        {
          id: "turn-running",
          thread_id: "thread-1",
          prompt_text: "联网搜索并总结最新信息",
          status: "running",
          started_at: "2026-04-23T10:00:10.000Z",
          created_at: "2026-04-23T10:00:10.000Z",
          updated_at: "2026-04-23T10:00:13.000Z",
        },
      ],
    });

    expect(
      hasRecoverableTerminalTurnActivity(
        detail,
        requestStartedAt,
        "联网搜索并总结最新信息",
        "turn-running",
      ),
    ).toBe(false);
    expect(
      hasRecoverableSilentTurnActivity(
        detail,
        requestStartedAt,
        "联网搜索并总结最新信息",
      ),
    ).toBe(true);
  });

  it("终态恢复应按 turn id 识别近期 completed turn", () => {
    const requestStartedAt = Date.parse("2026-04-23T10:00:12.000Z");
    const detail = createDetail({
      turns: [
        {
          id: "turn-completed",
          thread_id: "thread-1",
          prompt_text: "联网搜索并总结最新信息",
          status: "completed",
          started_at: "2026-04-23T10:00:10.000Z",
          completed_at: "2026-04-23T10:00:14.000Z",
          created_at: "2026-04-23T10:00:10.000Z",
          updated_at: "2026-04-23T10:00:14.000Z",
        },
      ],
    });

    expect(
      hasRecoverableTerminalTurnActivity(
        detail,
        requestStartedAt,
        "不同 prompt",
        "turn-completed",
      ),
    ).toBe(true);
  });
});
