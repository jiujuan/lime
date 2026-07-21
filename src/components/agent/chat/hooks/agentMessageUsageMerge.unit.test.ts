import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import {
  applyAssistantTurnUsage,
  preserveAssistantMessageUsage,
} from "./agentMessageUsageMerge";

function assistant(overrides: Partial<Message>): Message {
  return {
    id: "assistant",
    role: "assistant",
    content: "",
    timestamp: new Date(0),
    ...overrides,
  };
}

describe("preserveAssistantMessageUsage", () => {
  it("同一 runtime turn 的恢复态消息应保留 live usage", () => {
    const next = preserveAssistantMessageUsage(
      [
        assistant({
          id: "assistant-live",
          runtimeTurnId: "turn-image",
          usage: { input_tokens: 31_000, output_tokens: 0 },
        }),
      ],
      [
        assistant({
          id: "image-workbench:task:assistant",
          runtimeTurnId: "turn-image",
          imageWorkbenchPreview: {
            taskId: "task",
            prompt: "青柠插画",
            mode: "generate",
            status: "complete",
          },
        }),
      ],
    );

    expect(next[0]?.usage).toEqual({
      input_tokens: 31_000,
      output_tokens: 0,
    });
  });

  it("canonical 图片消息缺少 runtime turn 时仍按 task identity 保留 usage", () => {
    const usage = { input_tokens: 31_000, output_tokens: 0 };
    const next = preserveAssistantMessageUsage(
      [
        assistant({
          id: "assistant-live",
          usage,
          imageWorkbenchPreview: {
            taskId: "task-image-identity",
            prompt: "青柠插画",
            mode: "generate",
            status: "running",
          },
        }),
      ],
      [
        assistant({
          id: "image-workbench:task-image-identity:assistant",
          imageWorkbenchPreview: {
            taskId: "task-image-identity",
            prompt: "青柠插画",
            mode: "generate",
            status: "complete",
          },
        }),
      ],
    );

    expect(next[0]?.usage).toEqual(usage);
  });

  it("不同 runtime turn 不应互相继承 usage", () => {
    const nextMessages = [
      assistant({ id: "next", runtimeTurnId: "turn-next" }),
    ];
    expect(
      preserveAssistantMessageUsage(
        [
          assistant({
            id: "previous",
            runtimeTurnId: "turn-previous",
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
        ],
        nextMessages,
      ),
    ).toBe(nextMessages);
  });

  it("当前 session 订阅记住的 turn usage 应补到稍后出现的 canonical 消息", () => {
    const rememberedUsage = new Map([
      ["turn-image-shared", { input_tokens: 31_000, output_tokens: 0 }],
    ]);

    const next = preserveAssistantMessageUsage(
      [],
      [
        assistant({
          id: "image-workbench:shared:assistant",
          runtimeTurnId: "turn-image-shared",
          imageWorkbenchPreview: {
            taskId: "shared",
            prompt: "青柠插画",
            mode: "generate",
            status: "complete",
          },
        }),
      ],
      rememberedUsage,
    );

    expect(next[0]?.usage).toEqual({
      input_tokens: 31_000,
      output_tokens: 0,
    });
  });

  it("turn usage 应更新同 turn 的所有 assistant 投影", () => {
    const usage = { input_tokens: 31_000, output_tokens: 0 };
    const next = applyAssistantTurnUsage(
      [
        assistant({ id: "assistant-live", runtimeTurnId: "turn-image" }),
        assistant({
          id: "image-workbench:task:assistant",
          runtimeTurnId: "turn-image",
        }),
      ],
      "turn-image",
      usage,
    );

    expect(next.map((message) => message.usage)).toEqual([usage, usage]);
  });

  it("恢复态自带 usage 时应以恢复态为准", () => {
    const nextUsage = { input_tokens: 40, output_tokens: 5 };
    const nextMessages = [
      assistant({
        id: "assistant",
        runtimeTurnId: "turn-usage",
        usage: nextUsage,
      }),
    ];
    const result = preserveAssistantMessageUsage(
      [
        assistant({
          id: "assistant",
          runtimeTurnId: "turn-usage",
          usage: { input_tokens: 31, output_tokens: 0 },
        }),
      ],
      nextMessages,
    );

    expect(result).toBe(nextMessages);
    expect(result[0]?.usage).toBe(nextUsage);
  });
});
