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

  it("visible output cancel 有 queued rich input 时应恢复 queued draft 而不是 active prompt", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "active prompt",
      },
      assistantMessage: {
        id: "assistant-visible",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        contentParts: [
          {
            type: "text",
            text: "active output should stay visible",
          },
        ],
      },
      queuedTurns: [
        {
          queued_turn_id: "queued-rich",
          message_preview: "/capability-report queued",
          message_text: "/capability-report queued",
          created_at: 1,
          image_count: 1,
          position: 1,
          input_attachments: [
            {
              kind: "image",
              uri: "data:image/png;base64,aW1hZ2U=",
              metadata: {
                mediaType: "image/png",
                sourcePath: "/tmp/queued.png",
              },
            },
          ],
          path_references: [
            {
              id: "file:/project/report.md",
              path: "/project/report.md",
              name: "report.md",
              isDir: false,
              source: "file_manager",
            },
          ],
          text_elements: [
            {
              type: "text",
              text: "queued rich prompt",
            },
          ],
          input_capability_route: {
            kind: "installed_skill",
            skillKey: "capability-report",
            skillName: "Capability Report",
          },
        },
      ],
    });

    expect(plan).toMatchObject({
      shouldRestoreComposer: true,
      reason: "queued_turn_restored_after_interrupt",
      queuedTurnHandling: "restore_first",
      draft: {
        text: "queued rich prompt",
        images: [
          {
            data: "aW1hZ2U=",
            mediaType: "image/png",
            sourceUri: "data:image/png;base64,aW1hZ2U=",
            sourcePath: "/tmp/queued.png",
          },
        ],
        pathReferences: [
          {
            path: "/project/report.md",
            name: "report.md",
          },
        ],
        textElements: [
          {
            type: "text",
            text: "queued rich prompt",
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

  it("queued rich input 的 file image attachment 不应被降级丢弃", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "active prompt",
      },
      assistantMessage: {
        id: "assistant-visible",
        role: "assistant",
        content: "active output",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
      },
      queuedTurns: [
        {
          queued_turn_id: "queued-file-image",
          message_preview: "queued",
          message_text: "queued",
          created_at: 1,
          image_count: 1,
          position: 1,
          input_attachments: [
            {
              kind: "image",
              uri: "file://queued.png",
              metadata: {
                mediaType: "image/png",
                sourcePath: "/project/queued.png",
              },
            },
          ],
        },
      ],
    });

    expect(plan.draft?.images).toEqual([
      {
        data: "",
        mediaType: "image/png",
        sourceUri: "file://queued.png",
        sourcePath: "/project/queued.png",
        previewUrl: "file://queued.png",
        metadata: {
          mediaType: "image/png",
          sourcePath: "/project/queued.png",
        },
      },
    ]);
  });

  it("queued rich input 的裸 base64 image uri 应恢复为 data image 预览", () => {
    const plan = resolveInterruptedInputRestorePlan({
      submittedDraft: {
        text: "active prompt",
      },
      assistantMessage: {
        id: "assistant-visible",
        role: "assistant",
        content: "active output",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
      },
      queuedTurns: [
        {
          queued_turn_id: "queued-base64-image",
          message_preview: "queued",
          message_text: "queued",
          created_at: 1,
          image_count: 1,
          position: 1,
          input_attachments: [
            {
              kind: "image",
              uri: "aW1hZ2U=",
              metadata: {
                mediaType: "image/png",
                sourcePath: "/project/queued.png",
              },
            },
          ],
        },
      ],
    });

    expect(plan.draft?.images).toEqual([
      {
        data: "aW1hZ2U=",
        mediaType: "image/png",
        sourceUri: "aW1hZ2U=",
        sourcePath: "/project/queued.png",
        previewUrl: undefined,
        metadata: {
          mediaType: "image/png",
          sourcePath: "/project/queued.png",
        },
      },
    ]);
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
          attachments: [
            {
              kind: "image",
              uri: "file://queued-1.png",
            },
          ],
          path_references: [
            {
              path: "/project/queued-1.md",
              name: "queued-1.md",
              isDir: false,
              source: "file_manager",
            },
          ],
          text_elements: [{ type: "text", text: "第一条排队输入" }],
          input_capability_route: {
            kind: "installed_skill",
            skillKey: "code-review",
            skillName: "Code Review",
          },
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
      attachments: [
        {
          uri: "file://queued-1.png",
        },
      ],
      path_references: [
        {
          path: "/project/queued-1.md",
        },
      ],
      text_elements: [{ type: "text", text: "第一条排队输入" }],
      input_capability_route: {
        kind: "installed_skill",
        skillKey: "code-review",
      },
    });
  });
});
