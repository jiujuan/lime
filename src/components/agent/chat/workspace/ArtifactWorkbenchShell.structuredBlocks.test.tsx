import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createAdvancedEditableArtifact,
  createStructuredEditableArtifact,
  renderWorkbench,
  setTextControlValue,
} from "./ArtifactWorkbenchShell.testFixtures";

describe("ArtifactWorkbenchShell structured blocks", () => {
  it("应支持在 workbench 中编辑提示块并回写 tone 与正文", async () => {
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

    const calloutTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("风险提示"));
    expect(calloutTrigger).not.toBeUndefined();

    await act(async () => {
      calloutTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const toneInput = container.querySelector(
      '[data-testid="artifact-structured-edit-tone"]',
    ) as HTMLInputElement | null;
    const bodyInput = container.querySelector(
      '[data-testid="artifact-structured-edit-body"]',
    ) as HTMLTextAreaElement | null;

    expect(toneInput).not.toBeNull();
    expect(bodyInput).not.toBeNull();

    await act(async () => {
      if (toneInput) {
        setTextControlValue(toneInput, "critical");
      }
      if (bodyInput) {
        setTextControlValue(bodyInput, "交付周期偏长，需要立即治理。");
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
            id: "callout-1",
            type: "callout",
            tone: "danger",
            variant: "critical",
            body: "交付周期偏长，需要立即治理。",
            content: "交付周期偏长，需要立即治理。",
            text: "交付周期偏长，需要立即治理。",
          }),
        ]),
      }),
    );
  });

  it("应支持在 workbench 中编辑 key points 与表格块", async () => {
    const handleSaveArtifactDocument = vi.fn().mockResolvedValue(undefined);
    const container = renderWorkbench(createAdvancedEditableArtifact(), {
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

    const keyPointsTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("关键结论"));
    expect(keyPointsTrigger).not.toBeUndefined();

    await act(async () => {
      keyPointsTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const keyPointsInput = container.querySelector(
      '[data-testid="artifact-structured-edit-items"]',
    ) as HTMLTextAreaElement | null;
    expect(keyPointsInput).not.toBeNull();

    await act(async () => {
      if (keyPointsInput) {
        setTextControlValue(
          keyPointsInput,
          "聚焦高质量增长\n优先治理交付瓶颈\n补齐来源引用",
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

    expect(handleSaveArtifactDocument).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "artifact-advanced-structured" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "keypoints-1",
            type: "key_points",
            items: ["聚焦高质量增长", "优先治理交付瓶颈", "补齐来源引用"],
          }),
        ]),
      }),
    );

    const tableTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("经营对比表"),
    );
    expect(tableTrigger).not.toBeUndefined();

    await act(async () => {
      tableTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const columnsInput = container.querySelector(
      '[data-testid="artifact-structured-edit-columns"]',
    ) as HTMLTextAreaElement | null;
    const rowsInput = container.querySelector(
      '[data-testid="artifact-structured-edit-rows"]',
    ) as HTMLTextAreaElement | null;
    expect(columnsInput).not.toBeNull();
    expect(rowsInput).not.toBeNull();

    await act(async () => {
      if (columnsInput) {
        setTextControlValue(columnsInput, "维度 | 当前 | 下一步");
      }
      if (rowsInput) {
        setTextControlValue(
          rowsInput,
          "收入 | 稳定增长 | 继续看增量\n交付 | 偏慢 | 压缩周期",
        );
      }
      await Promise.resolve();
    });

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "artifact-advanced-structured" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "table-1",
            type: "table",
            columns: ["维度", "当前", "下一步"],
            rows: [
              ["收入", "稳定增长", "继续看增量"],
              ["交付", "偏慢", "压缩周期"],
            ],
          }),
        ]),
      }),
    );
  });

  it("应支持在 workbench 中编辑 checklist、metric、quote 与 code block", async () => {
    const handleSaveArtifactDocument = vi.fn().mockResolvedValue(undefined);
    const container = renderWorkbench(createAdvancedEditableArtifact(), {
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

    const checklistTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("推进清单"));
    expect(checklistTrigger).not.toBeUndefined();

    await act(async () => {
      checklistTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const checklistInput = container.querySelector(
      '[data-testid="artifact-structured-edit-checklist"]',
    ) as HTMLTextAreaElement | null;
    expect(checklistInput).not.toBeNull();

    await act(async () => {
      if (checklistInput) {
        setTextControlValue(
          checklistInput,
          "doing | 梳理重点客户\n done | 压缩交付周期",
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

    expect(handleSaveArtifactDocument).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "artifact-advanced-structured" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "checklist-1",
            type: "checklist",
            items: [
              expect.objectContaining({ text: "梳理重点客户", state: "doing" }),
              expect.objectContaining({ text: "压缩交付周期", state: "done" }),
            ],
          }),
        ]),
      }),
    );

    const metricsTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("经营指标"));
    expect(metricsTrigger).not.toBeUndefined();

    await act(async () => {
      metricsTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const metricsInput = container.querySelector(
      '[data-testid="artifact-structured-edit-metrics"]',
    ) as HTMLTextAreaElement | null;
    expect(metricsInput).not.toBeNull();

    await act(async () => {
      if (metricsInput) {
        setTextControlValue(
          metricsInput,
          "ARR | 21% | 保持健康增长 | success\n交付时延 | 9 天 | 已接近目标 | warning",
        );
      }
      await Promise.resolve();
    });

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "artifact-advanced-structured" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "metric-1",
            type: "metric_grid",
            metrics: [
              expect.objectContaining({
                label: "ARR",
                value: "21%",
                note: "保持健康增长",
                tone: "success",
              }),
              expect.objectContaining({
                label: "交付时延",
                value: "9 天",
                note: "已接近目标",
                tone: "warning",
              }),
            ],
          }),
        ]),
      }),
    );

    const quoteTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("COO 周会"),
    );
    expect(quoteTrigger).not.toBeUndefined();

    await act(async () => {
      quoteTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const quoteInput = container.querySelector(
      '[data-testid="artifact-structured-edit-quote"]',
    ) as HTMLTextAreaElement | null;
    const attributionInput = container.querySelector(
      '[data-testid="artifact-structured-edit-attribution"]',
    ) as HTMLInputElement | null;
    expect(quoteInput).not.toBeNull();
    expect(attributionInput).not.toBeNull();

    await act(async () => {
      if (quoteInput) {
        setTextControlValue(quoteInput, "季度交付效率必须进入经营复盘主线。");
      }
      if (attributionInput) {
        setTextControlValue(attributionInput, "CEO 周报");
      }
      await Promise.resolve();
    });

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ id: "artifact-advanced-structured" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "quote-1",
            type: "quote",
            text: "季度交付效率必须进入经营复盘主线。",
            quote: "季度交付效率必须进入经营复盘主线。",
            attribution: "CEO 周报",
          }),
        ]),
      }),
    );

    const codeTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("执行脚本"),
    );
    expect(codeTrigger).not.toBeUndefined();

    await act(async () => {
      codeTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const languageInput = container.querySelector(
      '[data-testid="artifact-structured-edit-language"]',
    ) as HTMLInputElement | null;
    const codeInput = container.querySelector(
      '[data-testid="artifact-structured-edit-code"]',
    ) as HTMLTextAreaElement | null;
    expect(languageInput).not.toBeNull();
    expect(codeInput).not.toBeNull();

    await act(async () => {
      if (languageInput) {
        setTextControlValue(languageInput, "ts");
      }
      if (codeInput) {
        setTextControlValue(codeInput, "await runArtifactWorkflow();");
      }
      await Promise.resolve();
    });

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ id: "artifact-advanced-structured" }),
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "code-1",
            type: "code_block",
            language: "ts",
            code: "await runArtifactWorkflow();",
          }),
        ]),
      }),
    );
  });
});
