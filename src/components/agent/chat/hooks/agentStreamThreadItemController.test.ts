import { describe, expect, it } from "vitest";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import { upsertThreadItemState } from "./agentThreadState";
import {
  buildAgentStreamTurnStartedPendingItemUpdate,
  shouldDeferAgentStreamThreadItemUpdate,
} from "./agentStreamThreadItemController";
import { projectAgentStreamTimelineItem } from "./agentStreamTimelineItemProjector";

function threadItem(overrides: Partial<AgentThreadItem> = {}): AgentThreadItem {
  return {
    id: "item-a",
    thread_id: "thread-old",
    turn_id: "turn-old",
    sequence: 1,
    status: "in_progress",
    started_at: "2026-05-05T00:00:00.000Z",
    updated_at: "2026-05-05T00:00:01.000Z",
    type: "reasoning",
    text: "thinking",
    ...overrides,
  } as AgentThreadItem;
}

const turn: AgentThreadTurn = {
  id: "turn-new",
  thread_id: "thread-new",
  prompt_text: "hello",
  status: "running",
  started_at: "2026-05-05T00:00:02.000Z",
  created_at: "2026-05-05T00:00:02.000Z",
  updated_at: "2026-05-05T00:00:03.000Z",
};

describe("agentStreamThreadItemController", () => {
  it("应保留运行中 reasoning 更新，避免思考区只停在首个片段", () => {
    expect(shouldDeferAgentStreamThreadItemUpdate(threadItem())).toBe(false);
  });

  it("仍应延后 in-progress agent_message 高频正文快照", () => {
    expect(
      shouldDeferAgentStreamThreadItemUpdate(
        threadItem({ type: "agent_message", text: "hello" }),
      ),
    ).toBe(true);
  });

  it("非 in-progress 或非文本类 item 不应延后", () => {
    expect(
      shouldDeferAgentStreamThreadItemUpdate(
        threadItem({ status: "completed" }),
      ),
    ).toBe(false);
    expect(
      shouldDeferAgentStreamThreadItemUpdate(
        threadItem({
          type: "tool_call",
          tool_name: "Read",
          status: "in_progress",
        }),
      ),
    ).toBe(false);
  });

  it("应把 pending item 绑定到真实 turn，并优先使用 turn.updated_at", () => {
    expect(
      buildAgentStreamTurnStartedPendingItemUpdate({
        pendingItem: threadItem(),
        turn,
      }),
    ).toMatchObject({
      id: "item-a",
      thread_id: "thread-new",
      turn_id: "turn-new",
      updated_at: "2026-05-05T00:00:03.000Z",
    });
  });

  it("无 pending item 时不应构造更新", () => {
    expect(
      buildAgentStreamTurnStartedPendingItemUpdate({
        pendingItem: null,
        turn,
      }),
    ).toBeNull();
  });

  it("命令输出增量更新不应覆盖 command/cwd 等已知细节", () => {
    const started = threadItem({
      id: "command-1",
      type: "command_execution",
      command: "npm test",
      cwd: "/repo",
      aggregated_output: "",
      sequence: 10,
    });
    const updated = threadItem({
      id: "command-1",
      type: "command_execution",
      command: "",
      cwd: "",
      aggregated_output: "PASS",
      sequence: 11,
      updated_at: "2026-05-05T00:00:05.000Z",
    });

    expect(upsertThreadItemState([started], updated)[0]).toMatchObject({
      id: "command-1",
      type: "command_execution",
      command: "npm test",
      cwd: "/repo",
      aggregated_output: "PASS",
      sequence: 10,
      updated_at: "2026-05-05T00:00:05.000Z",
    });
  });

  it("应把工具增量实时投影为通用 tool_call item，保留多模态 metadata", () => {
    const started = projectAgentStreamTimelineItem(
      {
        type: "tool_start",
        tool_id: "tool-image-1",
        tool_name: "image_generate",
        arguments: JSON.stringify({ prompt: "海报" }),
        sequence: 20,
        timestamp: "2026-05-05T00:01:00.000Z",
      },
      {
        activeSessionId: "thread-1",
        fallbackTurnId: "turn-1",
        now: "2026-05-05T00:01:00.000Z",
      },
    );
    const updated = projectAgentStreamTimelineItem(
      {
        type: "tool_output_delta",
        tool_id: "tool-image-1",
        delta: "生成中",
        output_kind: "preview",
        metadata: {
          modality: "image",
          assetRef: "artifact://image-1",
        },
        sequence: 21,
        timestamp: "2026-05-05T00:01:01.000Z",
      },
      {
        activeSessionId: "thread-1",
        fallbackTurnId: "turn-1",
        now: "2026-05-05T00:01:01.000Z",
      },
      started ?? undefined,
    );

    expect(updated).toMatchObject({
      id: "tool-image-1",
      type: "tool_call",
      thread_id: "thread-1",
      turn_id: "turn-1",
      tool_name: "image_generate",
      output: "生成中",
      metadata: {
        modality: "image",
        assetRef: "artifact://image-1",
        output_kind: "preview",
        streaming: true,
      },
    });
  });

  it("应把 ask_user / action_resolved 投影为 request_user_input lifecycle item", () => {
    const required = projectAgentStreamTimelineItem(
      {
        type: "action_required",
        request_id: "ask-1",
        action_type: "ask_user",
        prompt: "请选择方向",
        questions: [
          {
            question: "风格？",
            options: [{ label: "极简" }],
            multiSelect: false,
          },
        ],
        scope: {
          turn_id: "turn-1",
        },
        sequence: 30,
        timestamp: "2026-05-05T00:02:00.000Z",
      },
      {
        activeSessionId: "thread-1",
        fallbackTurnId: "turn-fallback",
        now: "2026-05-05T00:02:00.000Z",
      },
    );
    const resolved = projectAgentStreamTimelineItem(
      {
        type: "action_resolved",
        request_id: "ask-1",
        action_type: "ask_user",
        data: {
          answer: "极简",
        },
        sequence: 31,
        timestamp: "2026-05-05T00:02:10.000Z",
      },
      {
        activeSessionId: "thread-1",
        fallbackTurnId: "turn-1",
        now: "2026-05-05T00:02:10.000Z",
      },
      required ?? undefined,
    );

    expect(required).toMatchObject({
      type: "request_user_input",
      status: "in_progress",
      turn_id: "turn-1",
      prompt: "请选择方向",
      questions: [
        {
          question: "风格？",
          options: [{ label: "极简" }],
          multi_select: false,
        },
      ],
    });
    expect(resolved).toMatchObject({
      type: "request_user_input",
      status: "completed",
      prompt: "请选择方向",
      response: {
        answer: "极简",
      },
    });
  });
});
