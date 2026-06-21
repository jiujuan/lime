import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  listAgentRuntimeFileCheckpointsMock,
  restoreAgentRuntimeFileCheckpointMock,
} from "./StreamingRenderer.testMocks";
import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer file changes", () => {
  it("文件变更批次应渲染为可展开的文件审查卡", () => {
    const onFileClick = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: 1,
            totalAdded: 18,
            totalRemoved: 7,
            files: [
              {
                path: "src/components/CreationFlow.tsx",
                kind: "update",
                linesAdded: 18,
                linesRemoved: 7,
                truncated: false,
                source: "backend",
                status: "completed",
                diff: [
                  {
                    kind: "add",
                    value:
                      "主图里面的编辑，比如文字拖拽、放大、缩小、选择字号、选择字体这些都还不能用",
                  },
                  {
                    kind: "add",
                    value: "这个底部这个图片滚动有实际意义吗，感觉很碍手碍脚。",
                  },
                  {
                    kind: "add",
                    value:
                      "样板中心的厂家这里直接多个厂家标签切换，显示出他的最新样板款式的列表",
                  },
                  {
                    kind: "add",
                    value: "设置好了，点击生成图片，不能直接生成图片",
                  },
                  {
                    kind: "remove",
                    value: "旧的主图入口说明",
                  },
                ],
              },
            ],
          },
        },
      ],
      onFileClick,
    });

    const card = container.querySelector(
      '[data-testid="file-changes-summary-card"]',
    );
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("已编辑 1 个文件");
    expect(card?.textContent).toContain("+18");
    expect(card?.textContent).toContain("-7");
    expect(card?.textContent).toContain("审核");
    expect(card?.textContent).toContain("撤销");
    expect(
      container.querySelectorAll(
        '[data-testid="file-changes-summary-file-row"]',
      ),
    ).toHaveLength(1);
    expect(card?.textContent).toContain("src/components/CreationFlow.tsx");
    expect(card?.textContent).not.toContain("主图里面的编辑");
    expect(card?.textContent).not.toContain("旧的主图入口说明");

    const reviewButton = Array.from(
      card?.querySelectorAll("button") || [],
    ).find((button) => button.textContent?.includes("审核"));
    act(() => {
      reviewButton?.click();
    });
    expect(onFileClick).toHaveBeenCalledTimes(1);
    expect(onFileClick.mock.calls[0]?.[0]).toBe(
      "src/components/CreationFlow.tsx",
    );
    expect(onFileClick.mock.calls[0]?.[1]).toContain(
      "# src/components/CreationFlow.tsx 的变更审阅",
    );
    expect(onFileClick.mock.calls[0]?.[1]).toContain("- 状态：修改");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("+主图里面的编辑");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("-旧的主图入口说明");
    expect(card?.textContent).not.toContain("主图里面的编辑");

    const fileRow = container.querySelector(
      '[data-testid="file-changes-summary-file-row"]',
    ) as HTMLButtonElement | null;
    act(() => {
      fileRow?.click();
    });
    expect(onFileClick).toHaveBeenCalledTimes(2);
    expect(fileRow?.getAttribute("aria-expanded")).toBe("true");
  });

  it("文件变更审查卡应支持折叠长文件列表；缺少 session 时撤销不可用", () => {
    const files = Array.from({ length: 8 }, (_, index) => ({
      path: `src/generated/file-${index + 1}.ts`,
      kind: "update" as const,
      linesAdded: index + 1,
      linesRemoved: index,
      truncated: false,
      source: "backend" as const,
      status: "completed" as const,
      diff: [{ kind: "add" as const, value: `新增第 ${index + 1} 行` }],
    }));
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: files.length,
            totalAdded: 36,
            totalRemoved: 28,
            files,
          },
        },
      ],
    });

    const card = container.querySelector(
      '[data-testid="file-changes-summary-card"]',
    );
    expect(card?.textContent).toContain("已编辑 8 个文件");
    expect(card?.textContent).toContain("收起文件");
    expect(
      container.querySelectorAll(
        '[data-testid="file-changes-summary-file-row"]',
      ),
    ).toHaveLength(8);

    const undoButton = Array.from(card?.querySelectorAll("button") || []).find(
      (button) => button.textContent?.includes("撤销"),
    ) as HTMLButtonElement | undefined;
    expect(undoButton?.disabled).toBe(true);
    expect(undoButton?.title).toBe("没有可用的文件快照");

    const toggle = container.querySelector(
      '[data-testid="file-changes-summary-toggle"]',
    ) as HTMLButtonElement | null;
    act(() => {
      toggle?.click();
    });

    expect(card?.textContent).toContain("展开其余 2 个文件");
    expect(
      container.querySelectorAll(
        '[data-testid="file-changes-summary-file-row"]',
      ),
    ).toHaveLength(6);
  });

  it("文件变更审查卡撤销应通过 session checkpoint 调用真实恢复命令", async () => {
    listAgentRuntimeFileCheckpointsMock.mockResolvedValue({
      session_id: "session-code-runtime",
      thread_id: "thread-code-runtime",
      checkpoint_count: 1,
      checkpoints: [
        {
          checkpoint_id: "checkpoint-greeting",
          turn_id: "turn-code-runtime",
          path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
          snapshot_path: ".lime/file-checkpoints/checkpoint-greeting.ts",
          source: "artifact_snapshot",
          updated_at: "2026-06-02T10:01:00.000Z",
          validation_issue_count: 0,
        },
      ],
    });
    restoreAgentRuntimeFileCheckpointMock.mockResolvedValue({
      session_id: "session-code-runtime",
      thread_id: "thread-code-runtime",
      checkpoint: { checkpoint_id: "checkpoint-greeting" },
      live_path: "src/greeting.ts",
      snapshot_path: ".lime/checkpoints/greeting.ts",
      backup_path: ".lime/file-checkpoint-backups/greeting.ts",
      restored_at: "2026-06-02T10:02:00.000Z",
    });

    const { container } = renderHarness({
      content: "",
      fileChangesUndoSessionId: "session-code-runtime",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: 1,
            totalAdded: 3,
            totalRemoved: 1,
            files: [
              {
                path: "src/greeting.ts",
                kind: "update",
                linesAdded: 3,
                linesRemoved: 1,
                truncated: false,
                source: "backend",
                status: "completed",
                diff: [],
              },
            ],
          },
        },
      ],
    });

    const card = container.querySelector(
      '[data-testid="file-changes-summary-card"]',
    );
    const undoButton = Array.from(card?.querySelectorAll("button") || []).find(
      (button) => button.textContent?.includes("撤销"),
    ) as HTMLButtonElement | undefined;
    expect(undoButton?.disabled).toBe(false);

    act(() => {
      undoButton?.click();
    });

    const confirmButton = container.querySelector(
      '[data-testid="file-changes-summary-undo-confirm"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      confirmButton?.click();
    });

    expect(listAgentRuntimeFileCheckpointsMock).toHaveBeenCalledWith({
      session_id: "session-code-runtime",
    });
    expect(restoreAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-code-runtime",
      checkpoint_id: "checkpoint-greeting",
      confirm_restore: true,
      create_backup: true,
    });
    expect(container.textContent).toContain("已撤销 1 个文件改动");
  });

  it("文件变更审查卡应隐藏绝对路径前缀并向工作台传入完整 diff", () => {
    const onFileClick = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: 1,
            totalAdded: 1,
            totalRemoved: 1,
            files: [
              {
                path: "/Users/coso/Library/Application Support/lime/projects/Demo/.lime/qc/code-runtime-fixture/src/greeting.ts",
                kind: "update",
                linesAdded: 1,
                linesRemoved: 1,
                truncated: false,
                source: "backend",
                status: "completed",
                diff: [
                  { kind: "context", value: "const a = 1;" },
                  { kind: "context", value: "const b = 2;" },
                  { kind: "context", value: "const c = 3;" },
                  { kind: "remove", value: "旧 runtime 入口" },
                  { kind: "add", value: "新 runtime 入口" },
                ],
              },
            ],
          },
        },
      ],
      onFileClick,
    });

    const fileRow = container.querySelector(
      '[data-testid="file-changes-summary-file-row"]',
    ) as HTMLButtonElement | null;
    expect(container.textContent).toContain(
      ".lime/qc/code-runtime-fixture/src/greeting.ts",
    );
    expect(container.textContent).not.toContain(
      "/Users/coso/Library/Application Support/lime/projects/Demo",
    );

    act(() => {
      fileRow?.click();
    });

    expect(onFileClick.mock.calls[0]?.[0]).toBe(
      "/Users/coso/Library/Application Support/lime/projects/Demo/.lime/qc/code-runtime-fixture/src/greeting.ts",
    );
    expect(onFileClick.mock.calls[0]?.[1]).toContain(" const a = 1;");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("-旧 runtime 入口");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("+新 runtime 入口");
  });
});
