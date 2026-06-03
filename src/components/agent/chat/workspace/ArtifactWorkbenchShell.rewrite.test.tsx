import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createArtifactDocumentArtifact,
  createArtifactTimelineItems,
  renderWorkbench,
  setTextControlValue,
} from "./ArtifactWorkbenchShell.testFixtures";

describe("ArtifactWorkbenchShell AI rewrite", () => {
  it("编辑态应支持触发 AI 改写当前块", async () => {
    const onArtifactBlockRewriteRun = vi.fn().mockResolvedValue({
      rawContent: '{"type":"artifact_rewrite_patch"}',
      suggestion: {
        summary: "压缩冗余表达，保留事实信息",
        block: {
          id: "body-1",
          type: "rich_text",
          contentFormat: "markdown",
          content: "AI 改写后的正文",
        },
        draft: {
          editorKind: "rich_text",
          markdown: "AI 改写后的正文",
        },
      },
    });
    const container = renderWorkbench(createArtifactDocumentArtifact(), {
      onSaveArtifactDocument: vi.fn().mockResolvedValue(undefined),
      threadItems: createArtifactTimelineItems(),
      onArtifactBlockRewriteRun,
    });

    await act(async () => {
      await Promise.resolve();
    });

    const editTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("编辑"),
    );
    expect(editTrigger).not.toBeUndefined();

    await act(async () => {
      editTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const bodyBlockTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("正文块 1"));
    expect(bodyBlockTrigger).not.toBeUndefined();

    await act(async () => {
      bodyBlockTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const rewriteButton = container.querySelector(
      '[data-testid="artifact-edit-ai-rewrite"]',
    ) as HTMLButtonElement | null;
    const rewriteInstructionInput = container.querySelector(
      '[data-testid="artifact-edit-rewrite-instruction"]',
    ) as HTMLTextAreaElement | null;
    expect(rewriteButton).not.toBeNull();
    expect(rewriteInstructionInput).not.toBeNull();

    await act(async () => {
      if (rewriteInstructionInput) {
        setTextControlValue(
          rewriteInstructionInput,
          "请保留事实，只压缩冗余表达，适合董事会 30 秒内扫读。",
        );
      }
      await Promise.resolve();
    });

    await act(async () => {
      rewriteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onArtifactBlockRewriteRun).toHaveBeenCalledTimes(1);
    expect(onArtifactBlockRewriteRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact: expect.objectContaining({ id: "artifact-1" }),
        entry: expect.objectContaining({
          blockId: "body-1",
          editorKind: "rich_text",
        }),
        draft: expect.objectContaining({
          editorKind: "rich_text",
          markdown: "正文内容",
        }),
        instruction: "请保留事实，只压缩冗余表达，适合董事会 30 秒内扫读。",
        timelineLink: expect.objectContaining({
          itemId: "thread-item-body",
          blockId: "body-1",
        }),
      }),
    );
    expect(container.textContent).toContain("本次改写建议");
    expect(container.textContent).toContain("压缩冗余表达，保留事实信息");

    const applyRewriteButton = container.querySelector(
      '[data-testid="artifact-edit-rewrite-apply"]',
    ) as HTMLButtonElement | null;
    expect(applyRewriteButton).not.toBeNull();

    await act(async () => {
      applyRewriteButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const editorInput = container.querySelector(
      '[data-testid="mock-notion-editor-input"]',
    ) as HTMLTextAreaElement | null;
    expect(editorInput?.value).toBe("AI 改写后的正文");
    expect(container.textContent).toContain(
      "已回填到当前草稿，确认无误后点击保存即可写回文稿。",
    );
  });

  it("AI 改写建议应支持直接保存为新版本", async () => {
    const handleSaveArtifactDocument = vi.fn().mockResolvedValue(undefined);
    const onArtifactBlockRewriteRun = vi.fn().mockResolvedValue({
      rawContent: '{"type":"artifact_rewrite_patch"}',
      suggestion: {
        summary: "压缩冗余表达，保留事实信息",
        block: {
          id: "body-1",
          type: "rich_text",
          contentFormat: "markdown",
          content: "AI 改写后的正文",
        },
        draft: {
          editorKind: "rich_text",
          markdown: "AI 改写后的正文",
        },
      },
    });
    const container = renderWorkbench(createArtifactDocumentArtifact(), {
      onSaveArtifactDocument: handleSaveArtifactDocument,
      threadItems: createArtifactTimelineItems(),
      onArtifactBlockRewriteRun,
    });

    await act(async () => {
      await Promise.resolve();
    });

    const editTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("编辑"),
    );
    expect(editTrigger).not.toBeUndefined();

    await act(async () => {
      editTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const bodyBlockTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("正文块 1"));
    expect(bodyBlockTrigger).not.toBeUndefined();

    await act(async () => {
      bodyBlockTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const rewriteButton = container.querySelector(
      '[data-testid="artifact-edit-ai-rewrite"]',
    ) as HTMLButtonElement | null;
    expect(rewriteButton).not.toBeNull();

    await act(async () => {
      rewriteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const saveRewriteButton = container.querySelector(
      '[data-testid="artifact-edit-rewrite-save"]',
    ) as HTMLButtonElement | null;
    expect(saveRewriteButton).not.toBeNull();

    await act(async () => {
      saveRewriteButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenCalledTimes(1);
    expect(handleSaveArtifactDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "artifact-1" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "body-1",
            type: "rich_text",
            contentFormat: "markdown",
            content: "AI 改写后的正文",
            markdown: "AI 改写后的正文",
          }),
        ]),
        metadata: expect.objectContaining({
          currentVersionId: "artifact-document:demo:v3",
          currentVersionNo: 3,
          currentVersionDiff: expect.objectContaining({
            baseVersionId: "artifact-document:demo:v2",
            baseVersionNo: 2,
            targetVersionId: "artifact-document:demo:v3",
            targetVersionNo: 3,
            updatedCount: 1,
            changedBlocks: expect.arrayContaining([
              expect.objectContaining({
                blockId: "body-1",
                changeType: "updated",
                beforeText: "正文内容",
                afterText: "AI 改写后的正文",
              }),
            ]),
          }),
          versionHistory: expect.arrayContaining([
            expect.objectContaining({
              id: "artifact-document:demo:v3",
              versionNo: 3,
              summary: "更新 正文块 1",
              createdBy: "user",
            }),
          ]),
        }),
      }),
    );
    expect(container.textContent).toContain(
      "已把改写建议保存为当前文稿的新版本。",
    );
  });
});
