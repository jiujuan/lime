import { describe, expect, it } from "vitest";

import {
  isMainWindowRendererLoadInterruption,
  isNavigationAbortError,
  isWindowLifecycleLoadAbort,
} from "./mainWindowLoadErrors";

describe("main window load error classification", () => {
  it("把普通导航取消归类为可忽略中断", () => {
    expect(isNavigationAbortError(new Error("ERR_ABORTED (-3)"))).toBe(true);
    expect(
      isMainWindowRendererLoadInterruption(new Error("ERR_FAILED (-3)"), {}),
    ).toBe(true);
  });

  it("只在窗口生命周期结束时忽略 ERR_FAILED -2", () => {
    const error = new Error(
      "ERR_FAILED (-2) loading 'http://127.0.0.1:1420/?nativeStartup=1'",
    );

    expect(isWindowLifecycleLoadAbort(error, {})).toBe(false);
    expect(isWindowLifecycleLoadAbort(error, { appQuitting: true })).toBe(true);
    expect(isWindowLifecycleLoadAbort(error, { windowDestroyed: true })).toBe(
      true,
    );
    expect(
      isWindowLifecycleLoadAbort(error, { webContentsDestroyed: true }),
    ).toBe(true);
  });

  it("保留真实 renderer 加载失败", () => {
    expect(
      isMainWindowRendererLoadInterruption(
        new Error("ERR_CONNECTION_REFUSED (-102)"),
        { appQuitting: true },
      ),
    ).toBe(false);
  });
});
