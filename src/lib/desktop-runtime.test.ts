import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasDesktopHostEventCapability,
  hasDesktopHostEventListenerCapability,
  hasDesktopHostInvokeCapability,
  hasDesktopHostRuntimeMarkers,
} from "./desktop-runtime";

const LEGACY_HOST_INTERNALS_KEY = ["__TA", "URI_INTERNALS__"].join("");
const LEGACY_HOST_GLOBAL_KEY = ["__TA", "URI__"].join("");

function clearHostGlobals(): void {
  delete (window as any).electronAPI;
  delete (window as any).__LIME_ELECTRON__;
  delete (window as any)[LEGACY_HOST_INTERNALS_KEY];
  delete (window as any)[LEGACY_HOST_GLOBAL_KEY];
}

describe("desktop-runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHostGlobals();
  });

  it("识别 Electron Desktop Host bridge", () => {
    (window as any).electronAPI = {
      invoke: vi.fn(),
      listen: vi.fn(),
      emit: vi.fn(),
    };

    expect(hasDesktopHostRuntimeMarkers()).toBe(true);
    expect(hasDesktopHostInvokeCapability()).toBe(true);
    expect(hasDesktopHostEventCapability()).toBe(true);
    expect(hasDesktopHostEventListenerCapability()).toBe(true);
  });

  it("__LIME_ELECTRON__ 只作为运行时标记，不伪造 invoke 能力", () => {
    (window as any).__LIME_ELECTRON__ = true;

    expect(hasDesktopHostRuntimeMarkers()).toBe(true);
    expect(hasDesktopHostInvokeCapability()).toBe(false);
    expect(hasDesktopHostEventCapability()).toBe(false);
  });

  it("忽略 legacy host 全局对象，避免误判 Electron current 运行态", () => {
    (window as any)[LEGACY_HOST_GLOBAL_KEY] = {
      core: {
        invoke: vi.fn(),
      },
      invoke: vi.fn(),
      event: {
        listen: vi.fn(),
      },
    };
    (window as any)[LEGACY_HOST_INTERNALS_KEY] = {
      invoke: vi.fn(),
      transformCallback: vi.fn(),
    };

    expect(hasDesktopHostRuntimeMarkers()).toBe(false);
    expect(hasDesktopHostInvokeCapability()).toBe(false);
    expect(hasDesktopHostEventCapability()).toBe(false);
    expect(hasDesktopHostEventListenerCapability()).toBe(false);
  });
});
