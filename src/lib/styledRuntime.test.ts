import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability: vi.fn(() => false),
  hasDesktopHostRuntimeMarkers: vi.fn(() => false),
}));

import {
  hasDesktopHostInvokeCapability,
  hasDesktopHostRuntimeMarkers,
} from "@/lib/desktop-runtime";
import { shouldDisableStyledCssomInjection } from "./styledRuntime";

describe("shouldDisableStyledCssomInjection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(false);
    vi.mocked(hasDesktopHostRuntimeMarkers).mockReturnValue(false);
  });

  it("浏览器模式下应保持 CSSOM 注入开启", () => {
    expect(shouldDisableStyledCssomInjection()).toBe(false);
  });

  it("检测到 Desktop Host runtime marker 时应关闭 CSSOM 注入", () => {
    vi.mocked(hasDesktopHostRuntimeMarkers).mockReturnValue(true);

    expect(shouldDisableStyledCssomInjection()).toBe(true);
  });

  it("检测到 Desktop Host invoke 能力时应关闭 CSSOM 注入", () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(true);

    expect(shouldDisableStyledCssomInjection()).toBe(true);
  });
});
