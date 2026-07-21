import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  publishAppServerConfigWarnings,
  resetAppServerConfigWarningSubscribersForTests,
} from "@/lib/api/appServer";
import { AppServerConfigWarningToastBridge } from "./AppServerConfigWarningToastBridge";

const toastMock = vi.hoisted(() => ({
  warning: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

type MountedBridge = {
  container: HTMLDivElement;
  root: Root;
};

const mountedBridges: MountedBridge[] = [];

function renderBridge(): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<AppServerConfigWarningToastBridge />);
  });

  mountedBridges.push({ container, root });
}

describe("AppServerConfigWarningToastBridge", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    toastMock.warning.mockReset();
    resetAppServerConfigWarningSubscribersForTests();
    await changeLimeLocale("zh-CN");
  });

  afterEach(async () => {
    for (const mounted of mountedBridges.splice(0)) {
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    resetAppServerConfigWarningSubscribersForTests();
    document.body.replaceChildren();
    await changeLimeLocale("zh-CN");
    vi.unstubAllGlobals();
  });

  it("把 typed config warning 展示为中文 warning toast", () => {
    renderBridge();

    act(() => {
      publishAppServerConfigWarnings(
        [
          {
            summary: "App Server config warning during initialize",
            path: "/workspace/config.yaml",
            details: "invalid yaml",
          },
        ],
        {
          method: "initialize",
          phase: "response",
          requestId: 1,
        },
      );
    });

    expect(toastMock.warning).toHaveBeenCalledWith("本地配置需要检查", {
      description:
        "检测到本地配置文件异常，已继续启动。请检查 /workspace/config.yaml。详情：invalid yaml",
      duration: 12_000,
    });
  });

  it("跟随当前语言展示英文 warning toast", async () => {
    await changeLimeLocale("en-US");
    renderBridge();

    act(() => {
      publishAppServerConfigWarnings(
        [
          {
            summary: "App Server config warning during turn start",
            path: "/workspace/config.yaml",
          },
        ],
        {
          method: "turn/start",
          phase: "response",
          requestId: 2,
        },
      );
    });

    expect(toastMock.warning).toHaveBeenCalledWith(
      "Local configuration needs attention",
      {
        description:
          "A local configuration file issue was detected. Startup continued. Check /workspace/config.yaml.",
        duration: 12_000,
      },
    );
  });

  it("同一条 warning 在同一个主窗口中只展示一次", () => {
    renderBridge();
    const warning = {
      summary: "App Server config warning during turn start",
      path: "/workspace/config.yaml",
      details: "invalid yaml",
    };

    act(() => {
      publishAppServerConfigWarnings([warning], {
        method: "initialize",
        phase: "response",
        requestId: 3,
      });
      publishAppServerConfigWarnings([warning], {
        method: "turn/start",
        phase: "response",
        requestId: 4,
      });
    });

    expect(toastMock.warning).toHaveBeenCalledTimes(1);
  });
});
