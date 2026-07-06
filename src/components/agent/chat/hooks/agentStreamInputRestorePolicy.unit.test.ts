import { describe, expect, it } from "vitest";
import { resolveInterruptedInputRestorePlan } from "./agentStreamFlowControl";

describe("agentStream input restore policy", () => {
  it("output-free interrupt 应恢复原始输入与富输入引用", () => {
    const image = {
      data: "image-data",
      mediaType: "image/png",
      sourcePath: "/tmp/a.png",
    };
    const pathReference = {
      id: "file:a",
      path: "/project/a.md",
      name: "a.md",
      isDir: false,
      source: "file_manager" as const,
    };
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "继续生成提纲",
        images: [image],
        pathReferences: [pathReference],
        textElements: [{ type: "text", text: "继续生成提纲" }],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "draft",
          skillName: "起草",
        },
      },
      assistantMessage: {
        id: "assistant-empty",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
      },
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: true,
      reason: "output_free_interrupted_turn",
      queuedTurnHandling: "none",
      draft: {
        text: "继续生成提纲",
        images: [image],
        pathReferences: [pathReference],
        textElements: [{ type: "text", text: "继续生成提纲" }],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "draft",
          skillName: "起草",
        },
      },
    });
  });

  it("visible output cancel 不应把旧 prompt 塞回输入框", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "整理今天的新闻",
      },
      assistantMessage: {
        id: "assistant-visible",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        contentParts: [
          {
            type: "text",
            text: "这里是已经输出的正文",
          },
        ],
      },
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: false,
      reason: "visible_output_present",
      draft: null,
    });
  });

  it("thinking-only cancel 仍应允许恢复输入", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "继续分析材料",
      },
      assistantMessage: {
        id: "assistant-thinking",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        thinkingContent: "我需要先梳理上下文",
        contentParts: [
          {
            type: "thinking",
            text: "我需要先梳理上下文",
          },
        ],
      },
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: true,
      reason: "thinking_only_cancelled_turn",
      draft: {
        text: "继续分析材料",
      },
    });
  });

  it("patch-active cancel 不应恢复 composer 草稿", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "修改代码",
      },
      assistantMessage: {
        id: "assistant-patch",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        contentParts: [
          {
            type: "file_changes_batch",
            aggregate: {
              fileCount: 1,
              changes: [],
            } as never,
          },
        ],
      },
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: false,
      reason: "side_effect_activity_present",
      draft: null,
    });
  });

  it("queued steer / manual interrupt 应保留队列顺序且不降级为普通字符串", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "当前草稿",
        images: [
          {
            data: "image-data",
            mediaType: "image/png",
          },
        ],
      },
      assistantMessage: {
        id: "assistant-empty",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
      },
      queuedTurns: [
        {
          queued_turn_id: "queued-2",
          message_preview: "第二条",
          message_text: "第二条排队输入",
          created_at: 2,
          image_count: 1,
          position: 2,
        },
        {
          queued_turn_id: "queued-1",
          message_preview: "第一条",
          message_text: "第一条排队输入",
          created_at: 1,
          image_count: 2,
          position: 1,
        },
      ],
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: true,
      reason: "output_free_interrupted_turn",
      queuedTurnHandling: "preserve",
      draft: {
        text: "当前草稿",
        images: [
          {
            data: "image-data",
            mediaType: "image/png",
          },
        ],
      },
    });
    expect(plan.queuedTurns.map((item) => item.queued_turn_id)).toEqual([
      "queued-1",
      "queued-2",
    ]);
    expect(plan.queuedTurns[0]).toMatchObject({
      message_text: "第一条排队输入",
      image_count: 2,
    });
  });
});
