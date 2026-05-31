import { describe, expect, it } from "vitest";

import {
  buildAutoTitleConversationText,
  hasUserTextMessage,
  isAutoTitlePlaceholder,
  isPreviewDerivedTitle,
  shouldGenerateAutoTitle,
} from "./agentChatAutoTitleViewModel";

describe("agentChatAutoTitleViewModel", () => {
  it("应识别自动标题占位标题", () => {
    expect(isAutoTitlePlaceholder(null)).toBe(true);
    expect(isAutoTitlePlaceholder(undefined)).toBe(true);
    expect(isAutoTitlePlaceholder("")).toBe(true);
    expect(isAutoTitlePlaceholder(" 新任务 ")).toBe(true);
    expect(isAutoTitlePlaceholder("新话题")).toBe(true);
    expect(isAutoTitlePlaceholder("新对话")).toBe(true);
    expect(isAutoTitlePlaceholder("支付页错误定位")).toBe(false);
  });

  it("应识别由 assistant 预览派生出的临时标题", () => {
    expect(
      isPreviewDerivedTitle("我会先检查支付页", [
        {
          role: "assistant",
          content: "我会先检查支付页请求链路，并定位 500 错误。",
        },
      ]),
    ).toBe(true);

    expect(
      isPreviewDerivedTitle("我会先检查支付页请求链路，并定位", [
        {
          role: "assistant",
          content: "我会先检查支付页请求链路，并定位 500 错误。",
        },
      ]),
    ).toBe(true);

    expect(
      isPreviewDerivedTitle("支付页错误定位", [
        {
          role: "assistant",
          content: "我会先检查支付页请求链路。",
        },
      ]),
    ).toBe(false);
  });

  it("缺少有效 assistant 文本时不应把标题判为预览派生", () => {
    expect(isPreviewDerivedTitle("任意标题", [])).toBe(false);
    expect(
      isPreviewDerivedTitle("任意标题", [
        {
          role: "user",
          content: "请帮我定位问题",
        },
        {
          role: "assistant",
          content: "   ",
        },
      ]),
    ).toBe(false);
    expect(isPreviewDerivedTitle("   ", [])).toBe(false);
  });

  it("应根据占位或预览派生标题判断是否生成自动标题", () => {
    expect(
      shouldGenerateAutoTitle({
        activeSessionTitle: "新对话",
        messages: [],
      }),
    ).toBe(true);

    expect(
      shouldGenerateAutoTitle({
        activeSessionTitle: "我会先检查支付页",
        messages: [
          {
            role: "assistant",
            content: "我会先检查支付页请求链路。",
          },
        ],
      }),
    ).toBe(true);

    expect(
      shouldGenerateAutoTitle({
        activeSessionTitle: "支付页错误定位",
        messages: [
          {
            role: "assistant",
            content: "我会先检查支付页请求链路。",
          },
        ],
      }),
    ).toBe(false);
  });

  it("应识别是否存在可用于生成标题的用户文本", () => {
    expect(hasUserTextMessage([])).toBe(false);
    expect(
      hasUserTextMessage([
        {
          role: "assistant",
          content: "我会先分析。",
        },
      ]),
    ).toBe(false);
    expect(
      hasUserTextMessage([
        {
          role: "user",
          content: "   ",
        },
      ]),
    ).toBe(false);
    expect(
      hasUserTextMessage([
        {
          role: "user",
          content: "帮我定位支付页 500",
        },
      ]),
    ).toBe(true);
  });

  it("应构造发送给自动标题生成器的对话文本并裁剪到末尾 1000 字符", () => {
    const longUserText = "x".repeat(1200);
    const conversationText = buildAutoTitleConversationText([
      {
        role: "user",
        content: "   ",
      },
      {
        role: "user",
        content: longUserText,
      },
      {
        role: "assistant",
        content: "我会继续处理。",
      },
    ]);

    expect(conversationText).toHaveLength(1000);
    expect(conversationText).toContain("assistant：我会继续处理。");
    expect(conversationText).not.toContain("user：   ");
  });
});
