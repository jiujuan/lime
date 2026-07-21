import { describe, expect, it } from "vitest";
import { resolveInterruptedInputRestorePlan } from "./agentStreamInputRestorePlan";

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

  it("没有当前 submitted draft 时不应恢复输入", () => {
    const plan = resolveInterruptedInputRestorePlan({
      assistantMessage: {
        id: "assistant-empty-without-draft",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
      },
    });

    expect(plan).toEqual({
      shouldRestoreComposer: false,
      reason: "no_submitted_draft",
      draft: null,
    });
  });

  it("final_answer 文本已经出现时不应恢复输入", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "整理今天的新闻",
      },
      assistantMessage: {
        id: "assistant-final-answer",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        contentParts: [
          {
            type: "text",
            text: "这里是已经输出的最终正文",
            metadata: {
              phase: "final_answer",
              source: "agent_text_delta",
            },
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

  it("commentary 过程文本不应阻止 output-free 中断恢复", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "请先分析这个仓库",
      },
      assistantMessage: {
        id: "assistant-commentary",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        contentParts: [
          {
            type: "text",
            text: "我先检查项目结构和关键文件。",
            metadata: {
              phase: "commentary",
              source: "agent_text_delta",
            },
          },
        ],
      },
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: true,
      reason: "output_free_interrupted_turn",
      draft: {
        text: "请先分析这个仓库",
      },
    });
  });

  it("本地停止占位文案不应阻止 output-free 中断恢复", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "请先结合这张图和技能做准备",
        images: [
          {
            data: "image-data",
            mediaType: "image/png",
          },
        ],
        pathReferences: [
          {
            id: "file:/tmp/report.md",
            path: "/tmp/report.md",
            name: "report.md",
            isDir: false,
            source: "file_manager",
          },
        ],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "capability-report",
          skillName: "Capability Report",
        },
      },
      assistantMessage: {
        id: "assistant-stopped-placeholder",
        role: "assistant",
        content: "(已停止)",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
      },
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: true,
      reason: "output_free_interrupted_turn",
      draft: {
        text: "请先结合这张图和技能做准备",
        images: [
          {
            data: "image-data",
            mediaType: "image/png",
          },
        ],
        pathReferences: [
          {
            path: "/tmp/report.md",
          },
        ],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "capability-report",
          skillName: "Capability Report",
        },
      },
    });
  });

  it("runtimeStatus 标题不应被当成 assistant 最终正文阻止恢复", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "请结合截图和文件生成能力报告",
      },
      assistantMessage: {
        id: "assistant-runtime-status",
        role: "assistant",
        content: "正在生成回复",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
        runtimeStatus: {
          phase: "preparing",
          title: "正在生成回复",
          detail: "正在输出",
          checkpoints: [],
        },
      },
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: true,
      reason: "thinking_only_cancelled_turn",
      draft: {
        text: "请结合截图和文件生成能力报告",
      },
    });
  });

  it("有真实 assistant 正文时仍不应恢复输入", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "整理今天的新闻",
      },
      assistantMessage: {
        id: "assistant-visible-with-status",
        role: "assistant",
        content: "这里是已经输出的正文",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        runtimeStatus: {
          phase: "preparing",
          title: "正在生成回复",
          detail: "正在输出",
          checkpoints: [],
        },
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
});
