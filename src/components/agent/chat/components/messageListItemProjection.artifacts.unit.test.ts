import { describe, expect, it } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { buildProjection, type Message } from "./messageListItemProjection.testHarness";

describe("messageListItemProjection artifacts and failures", () => {
  it("provider 失败正文已有错误卡承载时不应重复作为 assistant 正文", async () => {
    await changeLimeLocale("zh-CN");

    const message: Message = {
      id: "assistant-provider-failed",
      role: "assistant",
      content:
        "执行失败：Agent provider execution failed: Server error: Server error (503 Service Unavailable): Service temporarily unavailable",
      timestamp: new Date("2026-06-02T10:01:00.000Z"),
      isThinking: false,
      runtimeStatus: {
        phase: "failed",
        title: "当前处理失败",
        detail:
          "当前模型通道暂时不可用，请稍后重试；如果持续失败，请检查 Provider 状态或切换到其他可用模型。",
      },
      contentParts: [
        {
          type: "text",
          text: "执行失败：Agent provider execution failed: Server error: Server error (503 Service Unavailable): Service temporarily unavailable",
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "turn-error",
        type: "error",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        message:
          "Agent provider execution failed: Server error: Server error (503 Service Unavailable): Service temporarily unavailable",
        status: "failed",
        started_at: "2026-06-02T10:01:01.000Z",
        completed_at: "2026-06-02T10:01:02.000Z",
        updated_at: "2026-06-02T10:01:02.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(projection.hasAssistantBodyContent).toBe(true);
  });

  it("文件变更汇总已展示同一路径时不应再渲染普通 artifact 卡片", () => {
    const message: Message = {
      id: "assistant-file-change-dedup",
      role: "assistant",
      content: "CODE_RUNTIME_DONE",
      timestamp: new Date("2026-06-02T10:01:00.000Z"),
      contentParts: [
        { type: "text", text: "CODE_RUNTIME_DONE" },
        {
          type: "file_changes_batch",
          aggregate: {
            files: [
              {
                path: "src/greeting.ts",
                kind: "update",
                linesAdded: 1,
                linesRemoved: 1,
                diff: [],
                truncated: false,
                source: "backend",
                status: "completed",
              },
            ],
            totalAdded: 1,
            totalRemoved: 1,
            fileCount: 1,
          },
        },
      ],
      artifacts: [
        {
          id: "artifact-greeting",
          type: "code",
          title: "greeting.ts",
          content:
            "export function greeting() { return 'Hello Lime Runtime'; }",
          status: "complete",
          meta: {
            filePath:
              "/Users/coso/Library/Application Support/lime/projects/demo/src/greeting.ts",
            filename: "greeting.ts",
          },
          position: { start: 0, end: 64 },
          createdAt: Date.parse("2026-06-02T10:01:00.000Z"),
          updatedAt: Date.parse("2026-06-02T10:01:00.000Z"),
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.visibleAssistantArtifacts).toHaveLength(0);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "file_changes_batch",
    ]);
  });

  it("文件变更汇总已覆盖同一路径时不应再渲染尾部 file_artifact 时间线卡片", () => {
    const message: Message = {
      id: "assistant-file-change-timeline-dedup",
      role: "assistant",
      content: "CODE_RUNTIME_DONE",
      timestamp: new Date("2026-06-02T10:01:00.000Z"),
      contentParts: [
        { type: "text", text: "CODE_RUNTIME_DONE" },
        {
          type: "file_changes_batch",
          aggregate: {
            files: [
              {
                path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
                kind: "update",
                linesAdded: 3,
                linesRemoved: 1,
                diff: [],
                truncated: false,
                source: "backend",
                status: "completed",
              },
            ],
            totalAdded: 3,
            totalRemoved: 1,
            fileCount: 1,
          },
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "artifact-document-card",
        type: "file_artifact",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
        source: "artifact_snapshot",
        content:
          "export function greeting() { return 'Hello Lime Runtime'; }\nexport const runtimeVerified = true;",
        status: "completed",
        started_at: "2026-06-02T10:01:01.000Z",
        completed_at: "2026-06-02T10:01:02.000Z",
        updated_at: "2026-06-02T10:01:02.000Z",
      },
      {
        id: "artifact-absolute-card",
        type: "file_artifact",
        turn_id: "turn-legacy-unphased-final",
        sequence: 4,
        path: "/Users/coso/Library/Application Support/lime/projects/code-runtime-fixture/src/greeting.ts",
        source: "tool_result",
        content: "点击在画布中打开完整内容。",
        status: "completed",
        started_at: "2026-06-02T10:01:03.000Z",
        completed_at: "2026-06-02T10:01:04.000Z",
        updated_at: "2026-06-02T10:01:04.000Z",
      },
    ] as never);

    expect(projection.trailingTimeline).toBeNull();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "file_changes_batch",
    ]);
  });
});
