import { afterEach, describe, expect, it, vi } from "vitest";

const {
  browserWindowCtorMock,
  browserWindowGetAllWindowsMock,
  focusWindowMock,
  loadUrlMock,
  showOpenDialogMock,
  showWindowMock,
} = vi.hoisted(() => {
  const loadUrlMock = vi.fn();
  const showWindowMock = vi.fn();
  const focusWindowMock = vi.fn();
  const browserWindowCtorMock = vi.fn(() => ({
    focus: focusWindowMock,
    isDestroyed: () => false,
    loadURL: loadUrlMock,
    off: vi.fn(),
    on: vi.fn(),
    once: vi.fn((event: string, callback: () => void) => {
      if (event === "ready-to-show") {
        callback();
      }
    }),
    show: showWindowMock,
    webContents: {
      getURL: () => "",
    },
  }));
  const browserWindowGetAllWindowsMock = vi.fn((): MockBrowserWindow[] => []);
  return {
    browserWindowCtorMock,
    browserWindowGetAllWindowsMock,
    focusWindowMock,
    loadUrlMock,
    showOpenDialogMock: vi.fn(),
    showWindowMock,
  };
});

vi.mock("./electronRuntime", () => ({
  BrowserWindow: Object.assign(browserWindowCtorMock, {
    getAllWindows: browserWindowGetAllWindowsMock,
  }),
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
}));

import { PluginShellHost } from "./pluginShellHost";

type MockBrowserWindow = {
  focus: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  webContents: {
    getURL: () => string;
  };
};

type AppServerRequestMock = (
  method: string,
  params?: unknown,
) => Promise<unknown>;

function createHost(request: AppServerRequestMock): PluginShellHost {
  return new PluginShellHost(
    request as ConstructorParameters<typeof PluginShellHost>[0],
  );
}

function buildPluginShellDescriptor(): Record<string, unknown> {
  return {
    descriptorVersion: 1,
    appId: "content-factory-app",
    packageHash: "package-fnv1a-current",
    manifestHash: "manifest-fnv1a-current",
    installMode: "standalone",
    runtimeProfile: {
      shellKind: "app_shell",
      installMode: "standalone",
    },
    isolation: {
      packageMount: "read-only",
      secrets: "refs-only",
      sideEffects: "runtime-broker",
      evidence: "runtime-provenance",
    },
    entry: {
      entryKey: "dashboard",
    },
    branding: {
      name: "Content Factory",
      windowTitle: "Content Factory",
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  browserWindowGetAllWindowsMock.mockReturnValue([]);
  showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
});

describe("PluginShellHost", () => {
  it("selectDirectory 通过 Electron dialog 选择目录", async () => {
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/plugin"],
    });
    const host = createHost(async () => {
      throw new Error("App Server should not be called");
    });

    await expect(
      host.selectDirectory({
        request: { title: "选择应用目录" },
      }),
    ).resolves.toEqual({
      path: "/tmp/plugin",
      cancelled: false,
    });

    expect(showOpenDialogMock).toHaveBeenCalledWith({
      title: "选择应用目录",
      properties: ["openDirectory"],
    });
  });

  it("selectDirectory 取消时返回空路径", async () => {
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    const host = createHost(async () => {
      throw new Error("App Server should not be called");
    });

    await expect(host.selectDirectory({})).resolves.toEqual({
      path: null,
      cancelled: true,
    });
  });

  it("launchShell 经 App Server prepare 后启动 UI runtime 并打开 Electron 窗口", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "pluginShell/prepare") {
        expect(params).toEqual({
          descriptor: buildPluginShellDescriptor(),
        });
        return {
          appId: "content-factory-app",
          status: "ready",
          installMode: "standalone",
          shellKind: "app_shell",
          descriptorVersion: 1,
          devShell: true,
          blockerCodes: [],
          preparedAt: "2026-05-15T00:00:00.000Z",
          entryKey: "dashboard",
          windowTitle: "Content Factory",
          packageMount: {
            kind: "local_dir",
            path: "/tmp/content-factory-app",
            readOnly: true,
            packageHash: "package-fnv1a-current",
            manifestHash: "manifest-fnv1a-current",
          },
        };
      }
      if (method === "pluginUiRuntime/start") {
        expect(params).toEqual({
          appId: "content-factory-app",
          entryKey: "dashboard",
        });
        return {
          appId: "content-factory-app",
          status: "running",
          entryUrl: "http://127.0.0.1:4199/dashboard",
          baseUrl: "http://127.0.0.1:4199",
          port: 4199,
          pid: 41990,
          entryKey: "dashboard",
          route: "/dashboard",
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.launchShell({
        request: {
          descriptor: buildPluginShellDescriptor(),
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      status: "launched",
      devShell: true,
      blockerCodes: [],
      packageMount: {
        kind: "local_dir",
        path: "/tmp/content-factory-app",
        readOnly: true,
        packageHash: "package-fnv1a-current",
        manifestHash: "manifest-fnv1a-current",
      },
      runtimeStatus: {
        status: "running",
        entryUrl: "http://127.0.0.1:4199/dashboard",
      },
      surface: {
        activeStrategy: "controlledBrowserWindow",
        supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
        entryUrl: "http://127.0.0.1:4199/dashboard",
        containerId: "plugin-shell-content-factory-app-standalone",
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
        label: "plugin-shell-content-factory-app-standalone",
        url: "http://127.0.0.1:4199/dashboard",
        reused: false,
        chrome: {
          deepLinkScheme: "lime-agent-content-factory-app",
          openEntryKey: "dashboard",
          trayEnabled: true,
          closePolicy: "hide_to_tray",
          multiAppManagement: false,
          runtimeBypass: false,
        },
      },
    });

    expect(request).toHaveBeenCalledWith("pluginShell/prepare", {
      descriptor: buildPluginShellDescriptor(),
    });
    expect(request).toHaveBeenCalledWith("pluginUiRuntime/start", {
      appId: "content-factory-app",
      entryKey: "dashboard",
    });
    expect(browserWindowCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Content Factory",
        width: 1280,
        height: 860,
      }),
    );
    expect(loadUrlMock).toHaveBeenCalledWith("http://127.0.0.1:4199/dashboard");
    expect(showWindowMock).toHaveBeenCalled();
    expect(focusWindowMock).toHaveBeenCalled();
  });

  it("launchShell 已存在同 URL 窗口时复用并聚焦", async () => {
    const existingWindow = {
      focus: focusWindowMock,
      show: showWindowMock,
      webContents: {
        getURL: () => "http://127.0.0.1:4199/dashboard",
      },
    };
    browserWindowGetAllWindowsMock.mockReturnValueOnce([existingWindow]);
    const request = vi.fn(async (method: string) => {
      if (method === "pluginShell/prepare") {
        return {
          appId: "content-factory-app",
          status: "ready",
          installMode: "standalone",
          shellKind: "app_shell",
          entryKey: "dashboard",
          windowTitle: "Content Factory",
        };
      }
      if (method === "pluginUiRuntime/start") {
        return {
          appId: "content-factory-app",
          status: "running",
          entryUrl: "http://127.0.0.1:4199/dashboard",
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.launchShell({
        request: {
          descriptor: buildPluginShellDescriptor(),
        },
      }),
    ).resolves.toMatchObject({
      status: "launched",
      shellWindow: {
        reused: true,
      },
    });

    expect(browserWindowCtorMock).not.toHaveBeenCalled();
    expect(loadUrlMock).not.toHaveBeenCalled();
    expect(showWindowMock).toHaveBeenCalledOnce();
    expect(focusWindowMock).toHaveBeenCalledOnce();
  });

  it("launchShell prepare blocked 时 fail closed 且不启动 runtime", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "pluginShell/prepare") {
        return {
          appId: "content-factory-app",
          status: "blocked",
          devShell: true,
          blockerCodes: ["INSTALLED_STATE_MISSING"],
          message: "Plugin 未安装。",
          preparedAt: "2026-05-15T00:00:00.000Z",
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.launchShell({
        request: {
          descriptor: buildPluginShellDescriptor(),
        },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      blockerCodes: ["INSTALLED_STATE_MISSING"],
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(browserWindowCtorMock).not.toHaveBeenCalled();
  });

  it("launchShell descriptor 无效时由 App Server prepare fail closed", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "pluginShell/prepare") {
        return {
          status: "blocked",
          devShell: true,
          blockerCodes: ["PACKAGE_IDENTITY_MISSING"],
          message: "Plugin shell descriptor 未通过启动前校验。",
          preparedAt: "2026-05-15T00:00:00.000Z",
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.launchShell({
        request: {
          descriptor: {
            ...buildPluginShellDescriptor(),
            packageHash: "",
          },
        },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      blockerCodes: ["PACKAGE_IDENTITY_MISSING"],
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(browserWindowCtorMock).not.toHaveBeenCalled();
  });

  it("UI runtime lifecycle 命令透传 App Server current methods", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => ({
      method,
      params,
      appId: "content-factory-app",
      status: "running",
    }));
    const host = createHost(request);

    await expect(
      host.startUiRuntime({
        request: {
          appId: "content-factory-app",
          entryKey: "dashboard",
        },
      }),
    ).resolves.toMatchObject({
      method: "pluginUiRuntime/start",
      params: {
        appId: "content-factory-app",
        entryKey: "dashboard",
      },
    });
    await expect(
      host.getUiRuntimeStatus({
        request: {
          appId: "content-factory-app",
        },
      }),
    ).resolves.toMatchObject({
      method: "pluginUiRuntime/status",
      params: {
        appId: "content-factory-app",
      },
    });
    await expect(
      host.stopUiRuntime({
        request: {
          appId: "content-factory-app",
        },
      }),
    ).resolves.toMatchObject({
      method: "pluginUiRuntime/stop",
      params: {
        appId: "content-factory-app",
      },
    });
  });
});
