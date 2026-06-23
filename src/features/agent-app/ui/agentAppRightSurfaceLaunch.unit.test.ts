import { describe, expect, it, vi } from "vitest";
import {
  buildAgentAppRightSurfaceRequestParams,
  requestAgentAppRightSurfaceLaunch,
} from "./agentAppRightSurfaceLaunch";
import type { AgentAppShellLaunchResult } from "@/lib/api/agentApps";

const launchedShell: AgentAppShellLaunchResult = {
  appId: "content-factory-app",
  status: "launched",
  installMode: "standalone",
  shellKind: "app_shell",
  descriptorVersion: 1,
  devShell: true,
  blockerCodes: [],
  runtimeStatus: {
    appId: "content-factory-app",
    status: "running",
    baseUrl: "http://127.0.0.1:4199",
    entryUrl: "http://127.0.0.1:4199/dashboard",
    entryKey: "dashboard",
    route: "/dashboard",
  },
  surface: {
    activeStrategy: "controlledBrowserWindow",
    supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
    entryUrl: "http://127.0.0.1:4199/dashboard",
    containerId: "agent-app-shell-content-factory-app-standalone",
    embedding: {
      standaloneWindow: true,
      rightSurfaceDock: true,
      iframe: false,
      browserView: false,
    },
    isolation: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  },
  shellWindow: {
    label: "agent-app-shell-content-factory-app-standalone",
    title: "内容工厂",
    url: "http://127.0.0.1:4199/dashboard",
    reused: false,
  },
  launchedAt: "2026-05-15T00:00:00.000Z",
};

const baseInput = {
  appId: "content-factory-app",
  title: "内容工厂",
  entry: {
    key: "dashboard",
    kind: "page" as const,
    title: "项目首页",
    route: "/dashboard",
  },
  shellLaunch: launchedShell,
};

describe("agentAppRightSurfaceLaunch", () => {
  it("应把 standalone shell surface 投递成 appSurface pending request", () => {
    expect(
      buildAgentAppRightSurfaceRequestParams({
        ...baseInput,
        target: {
          workspaceId: "workspace-main",
          sessionId: "session-main",
        },
      }),
    ).toMatchObject({
      workspaceId: "workspace-main",
      surfaceKind: "appSurface",
      origin: "agent_app_center",
      reason: "agent_app_shell_surface_ready",
      priority: "foreground",
      candidateId: "content-factory-app",
      metadata: {
        appId: "content-factory-app",
        title: "内容工厂",
        entry: {
          key: "dashboard",
          kind: "page",
          title: "项目首页",
          route: "/dashboard",
        },
        surface: {
          entryUrl: "http://127.0.0.1:4199/dashboard",
          containerId: "agent-app-shell-content-factory-app-standalone",
          supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
          embedding: {
            rightSurfaceDock: true,
            iframe: false,
            browserView: false,
          },
        },
      },
    });
  });

  it("缺少 Claw target 时应跳过 Right Surface 投递", async () => {
    await expect(
      requestAgentAppRightSurfaceLaunch(baseInput, {
        appServerClient: {
          request: vi.fn(),
        },
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "missing-target",
    });
  });

  it("不接受 iframe / BrowserView / 非 WebContentsView surface", () => {
    expect(
      buildAgentAppRightSurfaceRequestParams({
        ...baseInput,
        shellLaunch: {
          ...launchedShell,
          surface: launchedShell.surface
            ? {
                ...launchedShell.surface,
                supportedStrategies: ["controlledBrowserWindow"],
              }
            : undefined,
        },
        target: { sessionId: "session-main" },
      }),
    ).toBeNull();

    expect(
      buildAgentAppRightSurfaceRequestParams({
        ...baseInput,
        shellLaunch: {
          ...launchedShell,
          surface: launchedShell.surface
            ? {
                ...launchedShell.surface,
                embedding: {
                  ...launchedShell.surface.embedding,
                  iframe: true as false,
                },
              }
            : undefined,
        },
        target: { sessionId: "session-main" },
      }),
    ).toBeNull();
  });
});
