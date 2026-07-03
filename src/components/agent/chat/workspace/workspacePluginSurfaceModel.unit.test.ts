import { describe, expect, it } from "vitest";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import {
  buildWorkspacePluginSurfaceFromPendingRequest,
  buildWorkspacePluginSurfaceFromPendingRequests,
  buildWorkspacePluginSurfacesFromPendingRequests,
  closeWorkspacePluginSurfaceDescriptor,
  mergeWorkspacePluginSurfaceDescriptors,
  resolveWorkspacePluginSurfaceActiveContainerId,
  selectWorkspacePluginSurfaceDescriptor,
} from "./workspacePluginSurfaceModel";

const basePending: WorkspaceRightSurfacePendingRequest = {
  requestId: "right_surface_app_1",
  workspaceId: "workspace-main",
  workspaceRoot: "/workspace/project",
  sessionId: "session-main",
  surfaceKind: "appSurface",
  origin: "runtime",
  priority: "foreground",
  status: "pending",
  reason: "plugin_surface_ready",
  requestedAt: "2026-06-24T00:00:00.000Z",
};

describe("workspacePluginSurfaceModel", () => {
  it("应从 Right Surface pending metadata 水合 Plugin Surface descriptor", () => {
    expect(
      buildWorkspacePluginSurfaceFromPendingRequests([
        {
          ...basePending,
          candidateId: "content-factory-app",
          metadata: {
            appId: "content-factory-app",
            title: "内容工厂",
            surface: {
              activeStrategy: "controlledBrowserWindow",
              supportedStrategies: [
                "controlledBrowserWindow",
                "webContentsView",
              ],
              entryUrl: "http://127.0.0.1:4199/dashboard",
              containerId: "plugin-shell-content-factory-app-standalone",
              embedding: {
                standaloneWindow: true,
                rightSurfaceDock: true,
                iframe: false,
                browserView: false,
              },
            },
          },
        },
      ]),
    ).toEqual({
      appId: "content-factory-app",
      title: "内容工厂",
      entryUrl: "http://127.0.0.1:4199/dashboard",
      containerId: "plugin-shell-content-factory-app-standalone",
      activeStrategy: "controlledBrowserWindow",
      supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
      sourceRequestId: "right_surface_app_1",
    });
  });

  it("应从多个 pending 水合多个 Plugin Surface，并按 containerId 去重", () => {
    expect(
      buildWorkspacePluginSurfacesFromPendingRequests([
        {
          ...basePending,
          requestId: "right_surface_app_1",
          candidateId: "content-factory-app",
          metadata: {
            appId: "content-factory-app",
            title: "内容工厂",
            entryUrl: "http://127.0.0.1:4199/dashboard",
            containerId: "plugin-shell-content-factory-app",
            supportedStrategies: ["webContentsView"],
          },
        },
        {
          ...basePending,
          requestId: "right_surface_app_2",
          candidateId: "prompt-lab-app",
          metadata: {
            appId: "prompt-lab-app",
            title: "提示词实验室",
            entryUrl: "http://127.0.0.1:4201/",
            containerId: "plugin-shell-prompt-lab-app",
            supportedStrategies: ["webContentsView"],
          },
        },
        {
          ...basePending,
          requestId: "right_surface_app_3",
          candidateId: "content-factory-app",
          metadata: {
            appId: "content-factory-app",
            title: "内容工厂新窗口",
            entryUrl: "http://127.0.0.1:4199/profile",
            containerId: "plugin-shell-content-factory-app",
            supportedStrategies: ["webContentsView"],
          },
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        appId: "content-factory-app",
        title: "内容工厂新窗口",
        entryUrl: "http://127.0.0.1:4199/profile",
        containerId: "plugin-shell-content-factory-app",
        sourceRequestId: "right_surface_app_3",
      }),
      expect.objectContaining({
        appId: "prompt-lab-app",
        title: "提示词实验室",
        entryUrl: "http://127.0.0.1:4201/",
        containerId: "plugin-shell-prompt-lab-app",
        sourceRequestId: "right_surface_app_2",
      }),
    ]);
  });

  it("应合并、聚焦和关闭 Plugin Surface 实例", () => {
    const contentFactory = {
      appId: "content-factory-app",
      title: "内容工厂",
      entryUrl: "http://127.0.0.1:4199/dashboard",
      containerId: "plugin-shell-content-factory-app",
      activeStrategy: "webContentsView" as const,
      supportedStrategies: ["webContentsView" as const],
    };
    const promptLab = {
      appId: "prompt-lab-app",
      title: "提示词实验室",
      entryUrl: "http://127.0.0.1:4201/",
      containerId: "plugin-shell-prompt-lab-app",
      activeStrategy: "webContentsView" as const,
      supportedStrategies: ["webContentsView" as const],
    };
    const merged = mergeWorkspacePluginSurfaceDescriptors(
      [contentFactory],
      [promptLab],
    );

    expect(merged).toEqual([contentFactory, promptLab]);
    expect(
      resolveWorkspacePluginSurfaceActiveContainerId({
        activeContainerId: contentFactory.containerId,
        preferredContainerId: promptLab.containerId,
        surfaces: merged,
      }),
    ).toBe(promptLab.containerId);
    expect(
      selectWorkspacePluginSurfaceDescriptor(merged, promptLab.containerId),
    ).toBe(promptLab);
    expect(
      closeWorkspacePluginSurfaceDescriptor({
        activeContainerId: promptLab.containerId,
        containerId: promptLab.containerId,
        surfaces: merged,
      }),
    ).toEqual({
      activeContainerId: contentFactory.containerId,
      surfaces: [contentFactory],
    });
  });

  it("应拒绝 iframe / BrowserView 合同回流到 appSurface", () => {
    expect(
      buildWorkspacePluginSurfaceFromPendingRequest({
        ...basePending,
        metadata: {
          appId: "legacy-content-factory",
          entryUrl: "http://127.0.0.1:4199/dashboard",
          supportedStrategies: ["webContentsView"],
          embedding: {
            rightSurfaceDock: true,
            iframe: true,
            browserView: false,
          },
        },
      }),
    ).toBeNull();

    expect(
      buildWorkspacePluginSurfaceFromPendingRequest({
        ...basePending,
        metadata: {
          appId: "legacy-content-factory",
          entryUrl: "http://127.0.0.1:4199/dashboard",
          supportedStrategies: ["controlledBrowserWindow"],
          embedding: {
            rightSurfaceDock: true,
            iframe: false,
            browserView: false,
          },
        },
      }),
    ).toBeNull();
  });
});
