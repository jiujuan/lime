import { describe, expect, it } from "vitest";

import { buildUpdateNotificationWindowBounds } from "./updateNotificationWindowPosition";

describe("buildUpdateNotificationWindowBounds", () => {
  it("应把更新提醒窗口锚定在侧栏更新按钮上方", () => {
    const bounds = buildUpdateNotificationWindowBounds({
      anchorRect: { x: 18, y: 816, width: 30, height: 30 },
      contentBounds: { x: 100, y: 80, width: 1440, height: 920 },
      updateWindowSize: { width: 232, height: 182 },
      workArea: { x: 0, y: 0, width: 1680, height: 1050 },
    });

    expect(bounds).toEqual({
      x: 17,
      y: 704,
      width: 232,
      height: 182,
    });
  });

  it("按钮上方空间不足时应贴近按钮下方且保持在工作区内", () => {
    const bounds = buildUpdateNotificationWindowBounds({
      anchorRect: { x: 18, y: 20, width: 30, height: 30 },
      contentBounds: { x: 100, y: 10, width: 1440, height: 920 },
      updateWindowSize: { width: 232, height: 182 },
      workArea: { x: 0, y: 0, width: 1680, height: 1050 },
    });

    expect(bounds).toMatchObject({
      y: 70,
      width: 232,
      height: 182,
    });
  });

  it("找不到按钮矩形时应回退到主窗口左下侧栏位置", () => {
    const bounds = buildUpdateNotificationWindowBounds({
      anchorRect: null,
      contentBounds: { x: 100, y: 80, width: 1440, height: 920 },
      updateWindowSize: { width: 232, height: 182 },
      workArea: { x: 0, y: 0, width: 1680, height: 1050 },
    });

    expect(bounds).toEqual({
      x: 15,
      y: 732,
      width: 232,
      height: 182,
    });
  });
});
