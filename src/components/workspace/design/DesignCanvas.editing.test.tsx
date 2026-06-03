import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  renderDesignCanvas,
  clickButton,
  changeInputValue,
  dispatchPointerEvent,
} from "./DesignCanvas.testFixtures";

describe("DesignCanvas layer editing", () => {
  it("移动图层应回写 LayeredDesignDocument，并把 preview 标记为 stale", () => {
    const mounted = renderDesignCanvas();

    clickButton("右移");

    const updatedLayer = mounted
      .readState()
      .document.layers.find((layer) => layer.id === "headline");
    expect(updatedLayer?.x).toBe(170);
    expect(mounted.readState().document.preview?.stale).toBe(true);
    expect(mounted.readState().document.editHistory.at(-1)?.type).toBe(
      "transform_updated",
    );
  });

  it("画布内拖拽图层应按画布比例回写 transform", () => {
    const mounted = renderDesignCanvas();
    const stage = document.querySelector(
      '[aria-label="设计画布预览"]',
    ) as HTMLElement | null;
    const layerButton = document.querySelector(
      'button[aria-label="选择图层 标题层"]',
    ) as HTMLButtonElement | null;

    expect(stage).not.toBeNull();
    expect(layerButton).not.toBeNull();
    if (!stage || !layerButton) {
      throw new Error("未找到画布或标题层按钮");
    }
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 540,
        bottom: 720,
        width: 540,
        height: 720,
        toJSON: () => ({}),
      }),
    });

    dispatchPointerEvent(layerButton, "pointerdown", {
      clientX: 100,
      clientY: 100,
    });
    dispatchPointerEvent(layerButton, "pointermove", {
      clientX: 120,
      clientY: 130,
    });
    dispatchPointerEvent(layerButton, "pointerup", {
      clientX: 120,
      clientY: 130,
    });

    const updatedLayer = mounted
      .readState()
      .document.layers.find((layer) => layer.id === "headline");
    expect(updatedLayer).toMatchObject({
      x: 200,
      y: 180,
    });
    expect(mounted.readState().document.preview?.stale).toBe(true);
    expect(mounted.readState().document.editHistory.at(-1)).toMatchObject({
      type: "transform_updated",
      layerId: "headline",
      summary: "画布内拖拽移动图层。",
    });
  });

  it("画布角点缩放手柄应按画布比例回写尺寸", () => {
    const mounted = renderDesignCanvas();
    const stage = document.querySelector(
      '[aria-label="设计画布预览"]',
    ) as HTMLElement | null;
    const resizeHandle = document.querySelector(
      '[aria-label="缩放图层 标题层 se"]',
    ) as HTMLElement | null;

    expect(stage).not.toBeNull();
    expect(resizeHandle).not.toBeNull();
    if (!stage || !resizeHandle) {
      throw new Error("未找到画布或缩放手柄");
    }
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 540,
        bottom: 720,
        width: 540,
        height: 720,
        toJSON: () => ({}),
      }),
    });

    dispatchPointerEvent(resizeHandle, "pointerdown", {
      clientX: 100,
      clientY: 100,
    });
    dispatchPointerEvent(resizeHandle, "pointermove", {
      clientX: 130,
      clientY: 120,
    });
    dispatchPointerEvent(resizeHandle, "pointerup", {
      clientX: 130,
      clientY: 120,
    });

    const updatedLayer = mounted
      .readState()
      .document.layers.find((layer) => layer.id === "headline");
    expect(updatedLayer).toMatchObject({
      x: 160,
      y: 120,
      width: 820,
      height: 180,
    });
    expect(mounted.readState().document.preview?.stale).toBe(true);
    expect(mounted.readState().document.editHistory.at(-1)).toMatchObject({
      type: "transform_updated",
      layerId: "headline",
      summary: "画布内缩放图层。",
    });
  });

  it("画布旋转手柄应围绕图层中心回写 rotation", () => {
    const mounted = renderDesignCanvas();
    const stage = document.querySelector(
      '[aria-label="设计画布预览"]',
    ) as HTMLElement | null;
    const rotateHandle = document.querySelector(
      '[aria-label="旋转图层 标题层"]',
    ) as HTMLElement | null;

    expect(stage).not.toBeNull();
    expect(rotateHandle).not.toBeNull();
    if (!stage || !rotateHandle) {
      throw new Error("未找到画布或旋转手柄");
    }
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 540,
        bottom: 720,
        width: 540,
        height: 720,
        toJSON: () => ({}),
      }),
    });

    dispatchPointerEvent(rotateHandle, "pointerdown", {
      clientX: 270,
      clientY: 30,
    });
    dispatchPointerEvent(rotateHandle, "pointermove", {
      clientX: 335,
      clientY: 95,
    });
    dispatchPointerEvent(rotateHandle, "pointerup", {
      clientX: 335,
      clientY: 95,
    });

    const updatedLayer = mounted
      .readState()
      .document.layers.find((layer) => layer.id === "headline");
    expect(updatedLayer).toMatchObject({
      rotation: 90,
    });
    expect(mounted.readState().document.preview?.stale).toBe(true);
    expect(mounted.readState().document.editHistory.at(-1)).toMatchObject({
      type: "transform_updated",
      layerId: "headline",
      summary: "画布内旋转图层。",
    });
  });

  it("编辑位置尺寸旋转透明度层级应回写 LayeredDesignDocument transform", () => {
    const mounted = renderDesignCanvas();

    changeInputValue("图层 X", "188");
    changeInputValue("图层 Y", "144");
    changeInputValue("图层宽度", "820");
    changeInputValue("图层高度", "180");
    changeInputValue("图层旋转", "-12");
    changeInputValue("图层透明度", "55");
    changeInputValue("图层层级", "12");

    const updatedLayer = mounted
      .readState()
      .document.layers.find((layer) => layer.id === "headline");
    expect(updatedLayer).toMatchObject({
      x: 188,
      y: 144,
      width: 820,
      height: 180,
      rotation: -12,
      opacity: 0.55,
      zIndex: 12,
    });
    expect(mounted.readState().document.preview?.stale).toBe(true);
    expect(mounted.readState().document.editHistory.at(-1)).toMatchObject({
      type: "transform_updated",
      layerId: "headline",
      transformAfter: expect.objectContaining({
        zIndex: 12,
      }),
    });
  });

  it("编辑 TextLayer 文案应回写文档而不是烘焙成图片层", () => {
    const mounted = renderDesignCanvas();
    const textArea = document.querySelector(
      'textarea[aria-label="文字内容"]',
    ) as HTMLTextAreaElement | null;

    expect(textArea).not.toBeNull();
    if (!textArea) {
      throw new Error("未找到 TextLayer 文字内容输入框");
    }
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textArea, "可编辑的新标题");
      textArea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const updatedLayer = mounted
      .readState()
      .document.layers.find((layer) => layer.id === "headline");
    expect(updatedLayer).toMatchObject({
      type: "text",
      text: "可编辑的新标题",
    });
    expect(mounted.readState().document.preview?.stale).toBe(true);
    expect(mounted.readState().document.editHistory.at(-1)).toMatchObject({
      type: "text_updated",
      layerId: "headline",
      previousText: "冥界女巫",
      nextText: "可编辑的新标题",
    });
    expect(document.body.textContent).toContain("可编辑的新标题");
    expect(
      mounted
        .readState()
        .document.layers.find((layer) => layer.id === "subject"),
    ).toMatchObject({
      type: "image",
      assetId: "asset-subject",
    });
  });

  it("隐藏图层应回写文档 visible 状态，而不是只隐藏前端 DOM", () => {
    const mounted = renderDesignCanvas();

    clickButton("隐藏");

    const updatedLayer = mounted
      .readState()
      .document.layers.find((layer) => layer.id === "headline");
    expect(updatedLayer?.visible).toBe(false);
    expect(mounted.readState().document.editHistory.at(-1)).toMatchObject({
      type: "visibility_updated",
      layerId: "headline",
      previousVisible: true,
      nextVisible: false,
    });
  });
});
