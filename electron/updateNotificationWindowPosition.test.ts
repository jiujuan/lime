import { describe, expect, it } from "vitest";

import { buildUpdateNotificationWindowBounds } from "./updateNotificationWindowPosition";

describe("buildUpdateNotificationWindowBounds", () => {
  it("应把更新提醒窗口锚定在侧栏更新按钮上方", () => {
    const bounds = buildUpdateNotificationWindowBounds({
      anchorRect: { x: 18, y: 816, width: 30, height: 30 },
      contentBounds: { x: 100, y: 80, width: 1440, height: 920 },
      updateWindowSize: { width: 232, height: 128 },
      workArea: { x: 0, y: 0, width: 1680, height: 1050 },
    });

    expect(bounds).toEqual({
      x: 118,
      y: 758,
      width: 232,
      height: 128,
    });
  });

  it("按钮上方空间不足时应贴近按钮下方且保持在工作区内", () => {
    const bounds = buildUpdateNotificationWindowBounds({
      anchorRect: { x: 18, y: 20, width: 30, height: 30 },
      contentBounds: { x: 100, y: 10, width: 1440, height: 920 },
      updateWindowSize: { width: 232, height: 128 },
      workArea: { x: 0, y: 0, width: 1680, height: 1050 },
    });

    expect(bounds).toMatchObject({
      y: 70,
      width: 232,
      height: 128,
    });
  });

  it("找不到按钮矩形时应回退到主窗口左下侧栏位置", () => {
    const bounds = buildUpdateNotificationWindowBounds({
      anchorRect: null,
      contentBounds: { x: 100, y: 80, width: 1440, height: 920 },
      updateWindowSize: { width: 232, height: 128 },
      workArea: { x: 0, y: 0, width: 1680, height: 1050 },
    });

    expect(bounds).toEqual({
      x: 116,
      y: 786,
      width: 232,
      height: 128,
    });
  });

  it("侧栏按钮靠近屏幕左侧时不应把窗口居中到主窗口外侧", () => {
    const bounds = buildUpdateNotificationWindowBounds({
      anchorRect: { x: 18, y: 816, width: 30, height: 30 },
      contentBounds: { x: 0, y: 80, width: 1280, height: 920 },
      updateWindowSize: { width: 232, height: 128 },
      workArea: { x: 0, y: 0, width: 1680, height: 1050 },
    });

    expect(bounds).toMatchObject({
      x: 18,
      y: 758,
    });
    expect(bounds.x).toBeGreaterThanOrEqual(8);
  });
});
