import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createArtifactDocumentArtifact,
  createArtifactTimelineItems,
  createStructuredEditableArtifact,
  createTranscriptionDocumentArtifact,
  renderWorkbench,
  setTextControlValue,
} from "./ArtifactWorkbenchShell.testFixtures";

describe("ArtifactWorkbenchShell editing", () => {
  it("提供保存回调时应展示编辑页签，并把更新后的文档回传主链", async () => {
    const handleSaveArtifactDocument = vi.fn().mockResolvedValue(undefined);
    const container = renderWorkbench(createArtifactDocumentArtifact(), {
      onSaveArtifactDocument: handleSaveArtifactDocument,
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

    const editorInput = container.querySelector(
      '[data-testid="mock-notion-editor-input"]',
    ) as HTMLTextAreaElement | null;
    expect(editorInput).not.toBeNull();

    await act(async () => {
      if (editorInput) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        setter?.call(editorInput, "更新后的正文");
        editorInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await Promise.resolve();
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("保存编辑器"),
    );
    expect(saveButton).not.toBeUndefined();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenCalledTimes(1);
    expect(handleSaveArtifactDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "artifact-1" }),
      expect.objectContaining({
        schemaVersion: "artifact_document.v1",
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "body-1",
            type: "rich_text",
            contentFormat: "markdown",
            content: "更新后的正文",
            markdown: "更新后的正文",
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
                afterText: "更新后的正文",
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
  });

  it("已归档文档不应继续展示编辑页签", async () => {
    const container = renderWorkbench(
      createArtifactDocumentArtifact({
        status: "archived",
        currentVersionStatus: "archived",
      }),
      {
        onSaveArtifactDocument: vi.fn().mockResolvedValue(undefined),
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("编辑"),
    );
    expect(editTrigger).toBeUndefined();

    const overviewTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("概览"));
    expect(overviewTrigger).not.toBeUndefined();

    await act(async () => {
      overviewTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("已归档");
  });

  it("应支持在 workbench 中编辑结构化摘要块并回写 highlights", async () => {
    const handleSaveArtifactDocument = vi.fn().mockResolvedValue(undefined);
    const container = renderWorkbench(createStructuredEditableArtifact(), {
      onSaveArtifactDocument: handleSaveArtifactDocument,
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

    const heroTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("季度经营摘要"),
    );
    expect(heroTrigger).not.toBeUndefined();

    await act(async () => {
      heroTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const summaryInput = container.querySelector(
      '[data-testid="artifact-structured-edit-summary"]',
    ) as HTMLTextAreaElement | null;
    const highlightsInput = container.querySelector(
      '[data-testid="artifact-structured-edit-highlights"]',
    ) as HTMLTextAreaElement | null;

    expect(summaryInput).not.toBeNull();
    expect(highlightsInput).not.toBeNull();

    await act(async () => {
      if (summaryInput) {
        setTextControlValue(summaryInput, "更新后的摘要正文");
      }
      if (highlightsInput) {
        setTextControlValue(highlightsInput, "保留现金流优势\n压缩交付周期");
      }
      await Promise.resolve();
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "保存",
    );
    expect(saveButton).not.toBeUndefined();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenCalledTimes(1);
    expect(handleSaveArtifactDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "artifact-structured" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "hero-structured",
            type: "hero_summary",
            summary: "更新后的摘要正文",
            highlights: ["保留现金流优势", "压缩交付周期"],
          }),
        ]),
      }),
    );
  });

  it("转写运行时文档保存时应记录校对稿 metadata", async () => {
    const handleSaveArtifactDocument = vi.fn().mockResolvedValue(undefined);
    const container = renderWorkbench(createTranscriptionDocumentArtifact(), {
      onSaveArtifactDocument: handleSaveArtifactDocument,
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

    const transcriptTextTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("转写文本"));
    expect(transcriptTextTrigger).not.toBeUndefined();

    await act(async () => {
      transcriptTextTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const codeInput = container.querySelector(
      '[data-testid="artifact-structured-edit-code"]',
    ) as HTMLTextAreaElement | null;
    expect(codeInput).not.toBeNull();

    await act(async () => {
      if (codeInput) {
        setTextControlValue(
          codeInput,
          "欢迎来到 Lime 访谈节目。\n这里是人工校对后的补充。",
        );
      }
      await Promise.resolve();
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "保存",
    );
    expect(saveButton).not.toBeUndefined();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenCalledTimes(1);
    expect(handleSaveArtifactDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "artifact-transcription" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "transcript-text",
            type: "code_block",
            code: "欢迎来到 Lime 访谈节目。\n这里是人工校对后的补充。",
          }),
          expect.objectContaining({
            id: "transcript-correction-status",
            type: "callout",
            tone: "success",
            title: "校对稿已保存",
            body: expect.stringContaining("原始 ASR 输出文件保持不变"),
          }),
        ]),
        metadata: expect.objectContaining({
          modalityContractKey: "audio_transcription",
          transcriptCorrectionStatus: "saved",
          transcriptCorrectionSource: "artifact_document_version",
          transcriptCorrectionPatchKind: "artifact_document_version",
          transcriptCorrectionOriginalImmutable: true,
          transcriptCorrectionEditedBlockId: "transcript-text",
          transcriptCorrectionTextBlockId: "transcript-text",
          transcriptCorrectionSegmentBlockId: "transcript-segments",
          transcriptCorrectionSegmentCount: 1,
          transcriptCorrectionSpeakerCount: 1,
          transcriptCorrectionSourceTranscriptPath:
            ".lime/runtime/transcripts/task-transcription-1.txt",
          transcriptCorrectionDiffSummary: expect.objectContaining({
            textChanged: true,
            originalSegmentCount: 1,
            correctedSegmentCount: 1,
            changedSegmentCount: 0,
            originalSpeakerCount: 1,
            correctedSpeakerCount: 1,
          }),
          transcriptSegmentsCorrected: [
            expect.objectContaining({
              id: "corrected-segment-1",
              startMs: 1000,
              endMs: 3000,
              speaker: "主持人",
              text: "欢迎来到 Lime 访谈节目。",
            }),
          ],
        }),
      }),
    );
    expect(
      (
        handleSaveArtifactDocument.mock.calls[0]?.[1].metadata as Record<
          string,
          unknown
        >
      ).transcriptCorrectionSavedAt,
    ).toEqual(expect.any(String));
  });

  it("编辑态命中关联 timeline 时应支持跳回执行过程", async () => {
    const onJumpToTimelineItem = vi.fn();
    const container = renderWorkbench(createArtifactDocumentArtifact(), {
      onSaveArtifactDocument: vi.fn().mockResolvedValue(undefined),
      threadItems: createArtifactTimelineItems(),
      onJumpToTimelineItem,
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

    const jumpButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("跳到过程"),
    );
    expect(jumpButton).not.toBeUndefined();

    await act(async () => {
      jumpButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onJumpToTimelineItem).toHaveBeenCalledWith("thread-item-body");
  });
});
