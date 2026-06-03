import { describe, expect, it, vi } from "vitest";
import type { AnalyzeLayeredDesignFlatImage } from "./DesignCanvas.testFixtures";
import {
  CREATED_AT,
  renderDesignCanvas,
  clickButton,
  clickButtonAsync,
  createFlatImageDraftDocument,
  createFlatImageDraftDocumentWithCleanPlate,
  createFlatImageDraftDocumentWithMaskAndTextCandidate,
  createFlatImageDraftDocumentWithQualityMetadataRisk,
  createFlatImageDraftDocumentWithProductionModelSlotReady,
} from "./DesignCanvas.testFixtures";

describe("DesignCanvas extraction review", () => {
  it("拆层候选切换应只把选中候选 materialize 到正式图层", () => {
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocument(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );

    expect(document.body.textContent).toContain("候选图层");
    expect(document.body.textContent).toContain("边角碎片");
    expect(
      mounted
        .readState()
        .document.layers.some((layer) => layer.id === "fragment-layer"),
    ).toBe(false);

    clickButton("边角碎片");

    expect(
      mounted
        .readState()
        .document.layers.some((layer) => layer.id === "fragment-layer"),
    ).toBe(true);
    expect(
      mounted
        .readState()
        .document.extraction?.candidates.find(
          (candidate) => candidate.id === "fragment-candidate",
        ),
    ).toMatchObject({
      selected: true,
      issues: ["low_confidence"],
    });
    expect(mounted.readState().document.editHistory.at(-1)?.type).toBe(
      "candidate_selection_updated",
    );
  });

  it("拆层确认态应在进入图层编辑后标记 confirmed，并退出确认面板", () => {
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocumentWithCleanPlate(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );

    expect(document.body.textContent).toContain("确认候选图层后进入编辑");
    expect(mounted.readState().document.extraction?.review.status).toBe(
      "pending",
    );

    clickButton("进入图层编辑");

    expect(mounted.readState().document.extraction?.review.status).toBe(
      "confirmed",
    );
    expect(mounted.readState().document.editHistory.at(-1)?.type).toBe(
      "candidate_selection_confirmed",
    );
    expect(document.body.textContent).not.toContain("仅保留原图");
  });

  it("生产级 model slot 完整质量元数据应允许直接进入编辑", () => {
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocumentWithProductionModelSlotReady(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );
    const enterButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("进入图层编辑"),
    ) as HTMLButtonElement | undefined;

    expect(document.body.textContent).toContain("生产 model slot analyzer");
    expect(document.body.textContent).toContain("拆层质量：可进入编辑");
    expect(document.body.textContent).toContain("100 分");
    expect(document.body.textContent).not.toContain(
      "model slot 缺少质量元数据",
    );
    expect(document.body.textContent).not.toContain(
      "高风险拆层已阻止直接进入编辑",
    );
    expect(enterButton?.disabled).toBe(false);

    clickButton("进入图层编辑");

    expect(mounted.readState().document.extraction?.review.status).toBe(
      "confirmed",
    );
    expect(mounted.readState().document.editHistory.at(-1)?.type).toBe(
      "candidate_selection_confirmed",
    );
  });

  it("高风险拆层应阻止直接进入编辑，并保留安全出口", () => {
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocument(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );

    const enterButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("进入图层编辑"),
    ) as HTMLButtonElement | undefined;
    const sourceOnlyButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("仅保留原图")) as
      | HTMLButtonElement
      | undefined;

    expect(document.body.textContent).toContain("拆层质量：高风险");
    expect(document.body.textContent).toContain("高风险拆层已阻止直接进入编辑");
    expect(enterButton?.disabled).toBe(true);
    expect(enterButton?.title).toContain("当前拆层质量为高风险");
    expect(sourceOnlyButton?.disabled).toBe(false);

    clickButton("进入图层编辑");

    expect(mounted.readState().document.extraction?.review.status).toBe(
      "pending",
    );
    expect(mounted.readState().document.editHistory.at(-1)?.type).not.toBe(
      "candidate_selection_confirmed",
    );
  });

  it("拆层确认态应消费 mask 与 clean plate 质量元数据并阻止假成功", () => {
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocumentWithQualityMetadataRisk(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );
    const enterButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("进入图层编辑"),
    ) as HTMLButtonElement | undefined;

    expect(document.body.textContent).toContain("拆层质量：高风险");
    expect(document.body.textContent).toContain("主体 mask 覆盖异常");
    expect(document.body.textContent).toContain("前景覆盖约 0%");
    expect(document.body.textContent).toContain("主体 mask 使用兜底椭圆");
    expect(document.body.textContent).toContain("检测前景覆盖约 0%");
    expect(document.body.textContent).toContain("clean plate 修补覆盖不足");
    expect(document.body.textContent).toContain("0/9200 个目标像素");
    expect(document.body.textContent).toContain("clean plate 未使用主体 mask");
    expect(document.body.textContent).toContain("高风险拆层已阻止直接进入编辑");
    expect(enterButton?.disabled).toBe(true);

    clickButton("进入图层编辑");

    expect(mounted.readState().document.extraction?.review.status).toBe(
      "pending",
    );
    expect(mounted.readState().document.editHistory.at(-1)?.type).not.toBe(
      "candidate_selection_confirmed",
    );
  });

  it("拆层确认态应提示 clean plate 失败时移动主体有露洞风险", () => {
    renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocument(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );

    expect(document.body.textContent).toContain(
      "背景修补失败，移动主体有露洞风险",
    );
    expect(document.body.textContent).toContain("拆层质量：高风险");
    expect(document.body.textContent).toContain("主体 mask 缺失");
    expect(document.body.textContent).toContain("clean plate 失败");
    expect(document.body.textContent).toContain("OCR TextLayer 未提供");
    expect(document.body.textContent).toContain("修补失败，保留原图背景。");
    expect(document.body.textContent).toContain("背景修补来源");
    expect(document.body.textContent).toContain("未记录");
  });

  it("拆层确认态应支持原图、当前候选和 clean plate 对照预览", () => {
    renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocumentWithCleanPlate(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );

    const sourcePreview = document.querySelector(
      'img[alt="拆层确认预览：原图"]',
    ) as HTMLImageElement | null;
    expect(sourcePreview?.src).toContain(
      "data:image/png;base64,ZmxhdC1jbGVhbg==",
    );

    clickButton("查看当前候选");

    const candidatePreview = document.querySelector(
      'img[alt="拆层确认预览：人物主体"]',
    ) as HTMLImageElement | null;
    expect(candidatePreview?.src).toContain(
      "data:image/png;base64,c3ViamVjdC1jbGVhbg==",
    );

    clickButton("查看修补背景");

    const cleanPlatePreview = document.querySelector(
      'img[alt="拆层确认预览：修补背景"]',
    ) as HTMLImageElement | null;
    expect(cleanPlatePreview?.src).toContain(
      "data:image/png;base64,Y2xlYW4tcGxhdGU=",
    );
    expect(document.body.textContent).toContain("背景修补可用。");
    expect(document.body.textContent).toContain("拆层质量：需要人工复核");
    expect(document.body.textContent).toContain("能力来源需人工复核");
    expect(document.body.textContent).toContain("主体 alpha 孔洞已修复");
    expect(document.body.textContent).toContain("clean plate 边缘残影已修补");
    expect(document.body.textContent).toContain("背景修补可用于进入编辑");
    expect(document.body.textContent).toContain(
      "背景修补来源：测试 clean plate provider / fixture-inpaint",
    );
    expect(document.body.textContent).toContain("能力矩阵");
    expect(document.body.textContent).toContain("1 项 / 1 项需人工复核");
    expect(document.body.textContent).toContain(
      "Simple browser clean plate provider",
    );
    expect(document.body.textContent).toContain("实验/占位，需人工复核");
    expect(document.body.textContent).toContain("移动主体后仍建议核对边缘");
    expect(document.body.textContent).toContain("测试 clean plate analyzer");
    expect(document.body.textContent).toContain("mask");
    expect(document.body.textContent).toContain("未提供");
    expect(document.body.textContent).toContain("模型执行");
    expect(document.body.textContent).toContain("2 条 / 均直接成功");
    expect(document.body.textContent).toContain(
      "主体抠图：runtime-matting-v1 / attempt 1/1 / succeeded",
    );
    expect(document.body.textContent).toContain(
      "背景修补：runtime-inpaint-v1 / attempt 2/2 / succeeded",
    );
    expect(document.body.textContent).toContain("来源：人物主体");
    expect(document.body.textContent).toContain("来源：clean plate");
  });

  it("拆层确认态应支持查看当前候选的 mask 预览", () => {
    renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocumentWithMaskAndTextCandidate(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );

    clickButton("查看 mask");

    const maskPreview = document.querySelector(
      'img[alt="拆层确认预览：人物主体 mask"]',
    ) as HTMLImageElement | null;
    expect(maskPreview?.src).toContain("data:image/png;base64,bWFzay1vY3I=");
    expect(document.body.textContent).toContain("裁切范围");
  });

  it("拆层确认态应对 OCR TextLayer 候选使用真实图层预览", () => {
    renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocumentWithMaskAndTextCandidate(),
        selectedLayerId: "headline-layer",
        zoom: 0.72,
      },
      {},
    );

    clickButton("查看当前候选");

    const textPreview = document.querySelector(
      '[aria-label="拆层确认预览：标题文案"]',
    );
    expect(textPreview?.textContent).toContain("霓虹开幕");
    expect(document.body.textContent).toContain(
      "图片候选显示裁片，文字候选直接渲染 TextLayer",
    );
    expect(document.body.textContent).toContain("模型执行");
    expect(document.body.textContent).toContain("1 条 / 1 条 fallback");
    expect(document.body.textContent).toContain(
      "OCR TextLayer：runtime-ocr-v1 / attempt 1/1 / fallback_succeeded",
    );
    expect(document.body.textContent).toContain(
      "来源：标题文案 / 已走 fallback",
    );
  });

  it("仅保留原图进入图层编辑时应清空候选层并保留背景层", () => {
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocument(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {},
    );

    clickButton("仅保留原图");

    expect(mounted.readState().document.extraction?.review.status).toBe(
      "confirmed",
    );
    expect(
      mounted
        .readState()
        .document.extraction?.candidates.every(
          (candidate) => !candidate.selected,
        ),
    ).toBe(true);
    expect(
      mounted.readState().document.layers.map((layer) => layer.id),
    ).toEqual(["extraction-background-image"]);
    expect(mounted.readState().selectedLayerId).toBe(
      "extraction-background-image",
    );
    expect(mounted.readState().document.editHistory.at(-1)?.type).toBe(
      "candidate_selection_confirmed",
    );
  });

  it("重新拆层应通过 current analyzer seam 刷新候选层，并保持待确认状态", async () => {
    const analyzeFlatImage: AnalyzeLayeredDesignFlatImage = vi
      .fn()
      .mockResolvedValue({
        analysis: {
          analyzer: {
            kind: "local_heuristic",
            label: "测试 analyzer",
          },
          outputs: {
            candidateRaster: true,
            candidateMask: true,
            cleanPlate: false,
            ocrText: false,
          },
          generatedAt: CREATED_AT,
        },
        cleanPlate: {
          status: "not_requested",
          message: "重新拆层尚未生成 clean plate。",
        },
        candidates: [
          {
            id: "logo-candidate",
            role: "logo",
            confidence: 0.82,
            layer: {
              id: "logo-layer",
              name: "新 Logo",
              type: "image",
              assetId: "logo-asset-v2",
              x: 88,
              y: 96,
              width: 320,
              height: 160,
              zIndex: 36,
              alphaMode: "embedded",
            },
            assets: [
              {
                id: "logo-asset-v2",
                kind: "logo",
                src: "data:image/png;base64,bG9nby12Mg==",
                width: 320,
                height: 160,
                hasAlpha: true,
                createdAt: CREATED_AT,
              },
            ],
          },
        ],
      });

    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createFlatImageDraftDocument(),
        selectedLayerId: "subject-layer",
        zoom: 0.72,
      },
      {
        analyzeFlatImage,
      },
    );

    await clickButtonAsync("重新拆层");

    expect(analyzeFlatImage).toHaveBeenCalledWith({
      image: expect.objectContaining({
        src: "data:image/png;base64,ZmxhdA==",
        width: 1080,
        height: 1440,
        mimeType: "image/png",
        hasAlpha: false,
      }),
      createdAt: expect.any(String),
    });
    expect(mounted.readState().document.extraction?.review.status).toBe(
      "pending",
    );
    expect(mounted.readState().document.extraction?.analysis).toMatchObject({
      analyzer: {
        label: "测试 analyzer",
      },
      outputs: {
        candidateMask: true,
      },
    });
    expect(mounted.readState().document.extraction?.candidates).toHaveLength(1);
    expect(
      mounted.readState().document.layers.map((layer) => layer.id),
    ).toEqual(["extraction-background-image", "logo-layer"]);
    expect(mounted.readState().document.editHistory.at(-1)?.type).toBe(
      "extraction_reanalyzed",
    );
    expect(document.body.textContent).toContain("测试 analyzer");
  });
});
