import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const serverRuntimeMocks = vi.hoisted(() => ({
  getWindowsStartupDiagnostics: vi.fn(),
}));

const projectMocks = vi.hoisted(() => ({
  ensureDefaultWorkspaceReady: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
}));

const desktopRuntimeMocks = vi.hoisted(() => ({
  hasDesktopHostInvokeCapability: vi.fn(),
}));

vi.mock("@/lib/api/serverRuntime", () => ({
  getWindowsStartupDiagnostics: serverRuntimeMocks.getWindowsStartupDiagnostics,
}));

vi.mock("@/lib/api/project", () => ({
  ensureDefaultWorkspaceReady: projectMocks.ensureDefaultWorkspaceReady,
}));

vi.mock("@/lib/workspaceHealthTelemetry", () => ({
  recordWorkspaceRepair: vi.fn(),
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability: desktopRuntimeMocks.hasDesktopHostInvokeCapability,
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

import { useAppStartupEffects } from "./useAppStartupEffects";

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

let mountedHarness: MountedHarness | null = null;

function HookHarness() {
  useAppStartupEffects({
    currentPage: "agent",
  });
  return <main data-testid="main" />;
}

function setWindowsNavigator() {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: "Win32",
  });
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  });
}

async function mountHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedHarness = { container, root };

  await act(async () => {
    root.render(<HookHarness />);
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useAppStartupEffects", () => {
  beforeEach(async () => {
    await changeLimeLocale("en-US");
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    setWindowsNavigator();
    desktopRuntimeMocks.hasDesktopHostInvokeCapability.mockReturnValue(true);
    projectMocks.ensureDefaultWorkspaceReady.mockResolvedValue(null);
    serverRuntimeMocks.getWindowsStartupDiagnostics.mockResolvedValue({
      summary_message: "Driver policy is missing.",
      has_blocking_issues: true,
      has_warnings: true,
    });
  });

  afterEach(async () => {
    if (mountedHarness) {
      act(() => {
        mountedHarness?.root.unmount();
      });
      mountedHarness.container.remove();
      mountedHarness = null;
    }

    vi.clearAllMocks();
    await changeLimeLocale("zh-CN");
  });

  it("Windows 启动阻塞提示应使用真实 common 资源标题", async () => {
    await mountHook();

    expect(toastMocks.error).toHaveBeenCalledWith(
      "Windows startup self-check found blocking issues",
      {
        description: "Driver policy is missing.",
        duration: 12000,
      },
    );
    expect(toastMocks.warning).not.toHaveBeenCalled();
  });

  it("Windows 启动警告提示应使用真实 common 资源标题", async () => {
    serverRuntimeMocks.getWindowsStartupDiagnostics.mockResolvedValue({
      summary_message: "PowerShell execution policy needs attention.",
      has_blocking_issues: false,
      has_warnings: true,
    });

    await mountHook();

    expect(toastMocks.warning).toHaveBeenCalledWith(
      "Windows environment check notice",
      {
        description: "PowerShell execution policy needs attention.",
        duration: 8000,
      },
    );
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
