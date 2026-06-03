import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createArtifactDocumentArtifact,
  renderShell,
  renderWorkbench,
} from "./ArtifactWorkbenchShell.testFixtures";

describe("ArtifactWorkbenchShell", () => {
  it("运行态 shell 默认只保留正文画布，不再直接渲染 inspector 侧栏", async () => {
    const container = renderShell(createArtifactDocumentArtifact());

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="artifact-workbench-shell"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="artifact-workbench-shell"]')
        ?.getAttribute("data-layout-mode"),
    ).toBe("canvas-only");
    expect(
      container.querySelector('[data-testid="artifact-workbench-shell"]')
        ?.className,
    ).not.toContain("mt-5");
    const buttons = Array.from(container.querySelectorAll("button"));
    const tabLabels = ["概览", "来源", "版本", "差异", "编辑"];
    for (const label of tabLabels) {
      expect(
        buttons.find((button) => button.textContent?.includes(label)),
      ).toBeUndefined();
    }
  });

  it("文稿工作台集成 harness 应展示概览、来源、版本 inspector", async () => {
    const container = renderWorkbench(createArtifactDocumentArtifact());

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("概览");
    expect(container.textContent).toContain("来源");
    expect(container.textContent).toContain("版本");
    expect(container.textContent).toContain("差异");
    expect(container.textContent).toContain("更新 block 内容");

    const sourcesTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("来源"));
    expect(sourcesTrigger).not.toBeUndefined();

    await act(async () => {
      sourcesTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("OpenAI Blog");
    expect(container.textContent).toContain("网页");
    expect(container.textContent).toContain("段落 hero-1");
    expect(container.textContent).not.toContain("block hero-1");
  });

  it("恢复为草稿时应展示低压状态说明", async () => {
    const container = renderWorkbench(
      createArtifactDocumentArtifact({
        status: "draft",
        currentVersionStatus: "draft",
        meta: {
          artifactFallbackUsed: true,
          artifactValidationRepaired: true,
          artifactValidationIssues: [
            "模型未返回合法的 ArtifactDocument JSON，已按 Markdown 正文自动恢复为可渲染文档。",
          ],
        },
      }),
      {
        onSaveArtifactDocument: vi.fn().mockResolvedValue(undefined),
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

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

    expect(container.textContent).toContain("已整理为可继续编辑的草稿");
    expect(container.textContent).toContain(
      "系统已先把可用正文整理成恢复稿。你可以直接继续编辑，确认内容顺畅后，再手动标记为可阅读。",
    );
    expect(container.textContent).toContain("恢复稿");
    expect(
      container.querySelector(
        '[data-testid="artifact-recovery-continue-editing"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="artifact-recovery-mark-ready"]'),
    ).not.toBeNull();
  });

  it("恢复稿可从概览直接切到编辑态", async () => {
    const container = renderWorkbench(
      createArtifactDocumentArtifact({
        status: "draft",
        currentVersionStatus: "draft",
        meta: {
          artifactFallbackUsed: true,
          artifactValidationIssues: [
            "模型未返回合法的 ArtifactDocument JSON，已按 Markdown 正文自动恢复为可渲染文档。",
          ],
        },
      }),
      {
        onSaveArtifactDocument: vi.fn().mockResolvedValue(undefined),
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

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

    const continueEditingButton = container.querySelector(
      '[data-testid="artifact-recovery-continue-editing"]',
    ) as HTMLButtonElement | null;
    expect(continueEditingButton).not.toBeNull();

    await act(async () => {
      continueEditingButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("正文块 1");
  });

  it("恢复稿应支持标记为可阅读并沿保存链回写 ready 状态", async () => {
    const handleSaveArtifactDocument = vi.fn().mockResolvedValue(undefined);
    const container = renderWorkbench(
      createArtifactDocumentArtifact({
        status: "draft",
        currentVersionStatus: "draft",
        meta: {
          artifactFallbackUsed: true,
          artifactValidationIssues: [
            "模型未返回合法的 ArtifactDocument JSON，已按 Markdown 正文自动恢复为可渲染文档。",
          ],
        },
      }),
      {
        onSaveArtifactDocument: handleSaveArtifactDocument,
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

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

    const markReadyButton = container.querySelector(
      '[data-testid="artifact-recovery-mark-ready"]',
    ) as HTMLButtonElement | null;
    expect(markReadyButton).not.toBeNull();

    await act(async () => {
      markReadyButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(handleSaveArtifactDocument).toHaveBeenCalledTimes(1);
    expect(handleSaveArtifactDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "artifact-1" }),
      expect.objectContaining({
        status: "ready",
        metadata: expect.objectContaining({
          versionHistory: expect.arrayContaining([
            expect.objectContaining({
              id: "artifact-document:demo:v2",
              status: "ready",
            }),
          ]),
        }),
      }),
    );
  });

  it("应支持从来源项与差异项跳转到对应 block", async () => {
    const container = renderWorkbench(createArtifactDocumentArtifact());

    await act(async () => {
      await Promise.resolve();
    });

    const sourcesTrigger = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("来源"));
    expect(sourcesTrigger).not.toBeUndefined();

    await act(async () => {
      sourcesTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const sourceButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("OpenAI Blog"),
    );
    expect(sourceButton).not.toBeUndefined();

    await act(async () => {
      sourceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const heroBlock = container.querySelector("#artifact-block-hero-1");
    expect(heroBlock?.classList.contains("ring-2")).toBe(true);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

    const diffTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("差异"),
    );
    expect(diffTrigger).not.toBeUndefined();

    await act(async () => {
      diffTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const diffJumpButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("跳到 block"));
    expect(diffJumpButton).not.toBeUndefined();

    await act(async () => {
      diffJumpButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const bodyBlock = container.querySelector("#artifact-block-body-1");
    expect(bodyBlock?.classList.contains("ring-2")).toBe(true);
  });
});
