import { describe, expect, it } from "vitest";

import { buildCodeFixPromptFromHarnessSignal } from "./codeFixPrompt";

describe("codeFixPrompt", () => {
  it("应把失败输出和相关文件整理成可直接复制的提示词", () => {
    const prompt = buildCodeFixPromptFromHarnessSignal({
      signal: {
        toolName: "bash",
        title: "回归测试失败",
        summary: "vitest failed",
        preview: "ImageCard.test.tsx failed",
      },
      fileChanges: [
        {
          path: "/tmp/workspace/src/ImageCard.tsx",
          displayName: "ImageCard.tsx",
        },
      ],
      fileCheckpointSummary: {
        count: 1,
        latest_checkpoint: {
          checkpoint_id: "checkpoint-1",
          turn_id: "turn-1",
          path: "src/ImageCard.tsx",
          source: "tool_result",
          updated_at: "2026-05-27T01:00:00.000Z",
          validation_issue_count: 0,
        },
      },
      copy: {
        intro: "请继续修复本轮编程任务中的失败输出。",
        requirements:
          "请先定位根因，只修改必要文件，运行相关验证，并在完成后说明改动与验证结果。",
        failedTool: "失败工具",
        failedTitle: "失败标题",
        failedSummary: "失败摘要",
        failedPreview: "失败片段",
        relatedFiles: "相关文件",
        latestCheckpoint: "最近文件快照",
      },
    });

    expect(prompt).toContain("请继续修复本轮编程任务中的失败输出。");
    expect(prompt).toContain("- 失败工具: bash");
    expect(prompt).toContain("- 失败标题: 回归测试失败");
    expect(prompt).toContain("ImageCard.test.tsx failed");
    expect(prompt).toContain(
      "相关文件: ImageCard.tsx (/tmp/workspace/src/ImageCard.tsx)",
    );
    expect(prompt).toContain("最近文件快照: src/ImageCard.tsx");
  });
});
