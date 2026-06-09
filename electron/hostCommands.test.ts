/* global Buffer, process */
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppServerRequestError } from "app-server-client";
import { ElectronHostCommands } from "./hostCommands";
import type { ElectronAppServerHost } from "./appServerHost";

const execFileAsync = promisify(execFile);

const {
  browserWindowCtorMock,
  browserWindowGetAllWindowsMock,
  getFileIconMock,
  getPathMock,
  loadUrlMock,
  openExternalMock,
  openPathMock,
  showWindowMock,
  focusWindowMock,
  globalShortcutIsRegisteredMock,
  showOpenDialogMock,
  showItemInFolderMock,
} = vi.hoisted(() => {
  const loadUrlMock = vi.fn();
  const showWindowMock = vi.fn();
  const focusWindowMock = vi.fn();
  const browserWindowCtorMock = vi.fn(() => ({
    focus: focusWindowMock,
    loadURL: loadUrlMock,
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
  return {
    browserWindowCtorMock,
    browserWindowGetAllWindowsMock: vi.fn(() => []),
    getFileIconMock: vi.fn(),
    getPathMock: vi.fn((_name: string) => os.tmpdir()),
    globalShortcutIsRegisteredMock: vi.fn((_shortcut: string) => false),
    loadUrlMock,
    openExternalMock: vi.fn(),
    openPathMock: vi.fn(),
    showWindowMock,
    focusWindowMock,
    showOpenDialogMock: vi.fn(),
    showItemInFolderMock: vi.fn(),
  };
});
const tempDirs: string[] = [];
const TEST_REMOTE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwcdVwAAAABJRU5ErkJggg==";
type AppServerRequestMock = (
  method: string,
  params?: unknown,
) => Promise<unknown>;

vi.mock("./electronRuntime", () => ({
  app: {
    getFileIcon: getFileIconMock,
    getName: () => "Lime",
    getPath: getPathMock,
    getVersion: () => "0.0.0-test",
  },
  BrowserWindow: Object.assign(browserWindowCtorMock, {
    getAllWindows: browserWindowGetAllWindowsMock,
  }),
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
  globalShortcut: {
    isRegistered: globalShortcutIsRegisteredMock,
  },
  shell: {
    openExternal: openExternalMock,
    openPath: openPathMock,
    showItemInFolder: showItemInFolderMock,
  },
}));

function createHost(
  userDataDir: string,
  emit: (event: string, payload?: unknown) => void = () => undefined,
  request: AppServerRequestMock = async () => {
    throw new Error("App Server should not be called");
  },
) {
  const appServerHost = {
    request,
  } as unknown as ElectronAppServerHost;
  return new ElectronHostCommands(appServerHost, userDataDir, emit);
}

async function createTempUserDataDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lime-host-commands-"));
  tempDirs.push(dir);
  return dir;
}

async function withRemotePngServer<T>(
  run: (url: string) => Promise<T>,
): Promise<T> {
  const pngBytes = Buffer.from(TEST_REMOTE_PNG_BASE64, "base64");
  const server = createServer((request, response) => {
    if (request.url === "/hero.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(pngBytes);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法启动远程图片测试服务");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}/hero.png`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function withBinaryServer<T>(
  assets: Record<string, Buffer>,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request, response) => {
    const asset = assets[request.url ?? ""];
    if (asset) {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": asset.byteLength,
      });
      response.end(asset);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法启动二进制测试服务");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createVoiceModelArchiveFixture(
  userDataDir: string,
): Promise<Buffer> {
  const sourceDir = path.join(userDataDir, "fixture-voice-model-source");
  const archivePath = path.join(userDataDir, "fixture-voice-model.tar.bz2");
  await mkdir(sourceDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(sourceDir, "model.int8.onnx"), "model"),
    writeFile(path.join(sourceDir, "tokens.txt"), "tokens"),
  ]);
  await execFileAsync("tar", ["-cjf", archivePath, "-C", sourceDir, "."]);
  return await readFile(archivePath);
}

function sessionAlreadyExistsError(sessionId: string) {
  return new AppServerRequestError(
    "agentSession/start",
    {
      id: "test-session-start",
      error: {
        code: -32013,
        message: `session already exists: ${sessionId}`,
      },
    },
    [],
    [],
  );
}

function buildAgentAppShellDescriptor(): Record<string, unknown> {
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

afterEach(async () => {
  vi.clearAllMocks();
  browserWindowGetAllWindowsMock.mockReturnValue([]);
  globalShortcutIsRegisteredMock.mockReturnValue(false);
  getPathMock.mockImplementation(() => os.tmpdir());
  showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("ElectronHostCommands retired file browser facade", () => {
  it.each(["list_dir", "read_file_preview_cmd"])(
    "%s 不再作为 Electron Host compat facade 暴露",
    async (command) => {
      const userDataDir = await createTempUserDataDir();
      const host = createHost(userDataDir);

      await expect(
        host.invoke(command, { path: "/workspace" }),
      ).rejects.toThrow(`Electron host command is not implemented: ${command}`);
    },
  );
});

describe("ElectronHostCommands retired automation facade", () => {
  it.each([
    "get_automation_scheduler_config",
    "get_automation_status",
    "get_automation_health",
    "get_automation_jobs",
  ])("%s 不再作为 Electron Host compat facade 暴露", async (command) => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(host.invoke(command, {})).rejects.toThrow(
      `Electron host command is not implemented: ${command}`,
    );
  });
});

describe("ElectronHostCommands retired API Key Provider facade", () => {
  it.each([
    "get_api_key_providers",
    "get_system_provider_catalog",
    "get_provider_ui_state",
    "set_provider_ui_state",
    "fetch_provider_models_auto",
  ])("%s 不再作为 Electron Host provider facade 暴露", async (command) => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(host.invoke(command, {})).rejects.toThrow(
      `Electron host command is not implemented: ${command}`,
    );
  });
});

describe("ElectronHostCommands local file shell facade", () => {
  it("save_exported_document 通过 Electron Host 写入用户选择的本地路径", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    const targetPath = path.join(userDataDir, "exports", "report.md");

    await expect(
      host.invoke("save_exported_document", {
        filePath: targetPath,
        content: "# Report\n\n正文",
      }),
    ).resolves.toBeNull();

    await expect(readFile(targetPath, "utf8")).resolves.toBe(
      "# Report\n\n正文",
    );
    const directoryStats = await stat(path.dirname(targetPath));
    expect(directoryStats.isDirectory()).toBe(true);
  });

  it("save_exported_document 允许写入空内容但拒绝缺失 content", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    const targetPath = path.join(userDataDir, "exports", "empty.md");

    await expect(
      host.invoke("save_exported_document", {
        filePath: targetPath,
        content: "",
      }),
    ).resolves.toBeNull();
    await expect(readFile(targetPath, "utf8")).resolves.toBe("");

    await expect(
      host.invoke("save_exported_document", {
        filePath: targetPath,
      }),
    ).rejects.toThrow("Missing required string field: content");
  });

  it("save_layered_design_project_export 通过 Electron Host 写入工程目录", async () => {
    const projectRootPath = await createTempUserDataDir();
    const host = createHost(projectRootPath);

    const result = await host.invoke("save_layered_design_project_export", {
      request: {
        projectRootPath,
        documentId: "doc-1",
        title: "Design Test",
        directoryName: "Design Test.layered-design",
        files: [
          {
            relativePath: "design.json",
            mimeType: "application/json",
            encoding: "utf8",
            content: '{"layers":[]}',
          },
          {
            relativePath: "export-manifest.json",
            mimeType: "application/json",
            encoding: "utf8",
            content: '{"assets":[]}',
          },
          {
            relativePath: "psd-like-manifest.json",
            mimeType: "application/json",
            encoding: "utf8",
            content: '{"groups":[]}',
          },
          {
            relativePath: "preview.png",
            mimeType: "image/png",
            encoding: "base64",
            content: Buffer.from("preview").toString("base64"),
          },
          {
            relativePath: "assets/subject.png",
            mimeType: "image/png",
            encoding: "base64",
            content: Buffer.from("asset").toString("base64"),
          },
        ],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        projectRootPath,
        exportDirectoryRelativePath:
          ".lime/layered-designs/design-test.layered-design",
        assetCount: 1,
        fileCount: 5,
        remoteReferenceAssetCount: 0,
        cachedRemoteAssetCount: 0,
        uncachedRemoteAssetCount: 0,
      }),
    );
    const exportResult = result as { designPath: string; manifestPath: string };
    await expect(readFile(exportResult.designPath, "utf8")).resolves.toBe(
      '{"layers":[]}',
    );
    await expect(readFile(exportResult.manifestPath, "utf8")).resolves.toBe(
      '{"assets":[]}',
    );
  });

  it("read_layered_design_project_export 读回已保存的工程文档", async () => {
    const projectRootPath = await createTempUserDataDir();
    const host = createHost(projectRootPath);
    await host.invoke("save_layered_design_project_export", {
      request: {
        projectRootPath,
        documentId: "doc-1",
        title: "Design Test",
        directoryName: "Design Test.layered-design",
        files: [
          {
            relativePath: "design.json",
            mimeType: "application/json",
            encoding: "utf8",
            content: '{"layers":[{"id":"hero"}]}',
          },
          {
            relativePath: "export-manifest.json",
            mimeType: "application/json",
            encoding: "utf8",
            content: '{"assets":[]}',
          },
        ],
      },
    });

    await expect(
      host.invoke("read_layered_design_project_export", {
        request: {
          projectRootPath,
          exportDirectoryRelativePath:
            ".lime/layered-designs/design-test.layered-design",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        projectRootPath,
        exportDirectoryRelativePath:
          ".lime/layered-designs/design-test.layered-design",
        designJson: '{"layers":[{"id":"hero"}]}',
        manifestJson: '{"assets":[]}',
        assetCount: 0,
        fileCount: 2,
      }),
    );
  });

  it("save_layered_design_project_export 缓存远程资产并在读回时水合 design.json", async () => {
    await withRemotePngServer(async (remoteAssetUrl) => {
      const projectRootPath = await createTempUserDataDir();
      const host = createHost(projectRootPath);

      const result = await host.invoke("save_layered_design_project_export", {
        request: {
          projectRootPath,
          documentId: "remote-design",
          title: "Remote Design",
          directoryName: "Remote Design.layered-design",
          files: [
            {
              relativePath: "design.json",
              mimeType: "application/json",
              encoding: "utf8",
              content: JSON.stringify({
                id: "remote-design",
                assets: [
                  {
                    id: "remote-asset",
                    kind: "subject",
                    src: remoteAssetUrl,
                    width: 512,
                    height: 512,
                  },
                ],
              }),
            },
            {
              relativePath: "export-manifest.json",
              mimeType: "application/json",
              encoding: "utf8",
              content: JSON.stringify({
                assets: [
                  {
                    id: "remote-asset",
                    kind: "subject",
                    source: "reference",
                    originalSrc: remoteAssetUrl,
                  },
                ],
              }),
            },
            {
              relativePath: "psd-like-manifest.json",
              mimeType: "application/json",
              encoding: "utf8",
              content: JSON.stringify({
                layers: [
                  {
                    id: "remote-layer",
                    asset: {
                      id: "remote-asset",
                      source: "reference",
                      originalSrc: remoteAssetUrl,
                    },
                  },
                ],
              }),
            },
          ],
        },
      });

      expect(result).toEqual(
        expect.objectContaining({
          remoteReferenceAssetCount: 1,
          cachedRemoteAssetCount: 1,
          uncachedRemoteAssetCount: 0,
          assetCount: 1,
          fileCount: 4,
        }),
      );
      const exportResult = result as {
        exportDirectoryPath: string;
        manifestPath: string;
      };
      const manifest = JSON.parse(
        await readFile(exportResult.manifestPath, "utf8"),
      ) as { assets: Array<Record<string, unknown>> };
      expect(manifest.assets[0]).toMatchObject({
        source: "file",
        filename: "assets/remote-asset.png",
        originalSrc: remoteAssetUrl,
      });
      await expect(
        readFile(
          path.join(
            exportResult.exportDirectoryPath,
            "assets/remote-asset.png",
          ),
        ),
      ).resolves.toEqual(Buffer.from(TEST_REMOTE_PNG_BASE64, "base64"));

      await expect(
        host.invoke("read_layered_design_project_export", {
          request: {
            projectRootPath,
            exportDirectoryRelativePath:
              ".lime/layered-designs/remote-design.layered-design",
          },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          designJson: expect.stringContaining("data:image/png;base64,"),
          psdLikeManifestJson: expect.stringContaining(
            '"filename": "assets/remote-asset.png"',
          ),
        }),
      );
    });
  });

  it("save_layered_design_project_export 拒绝目录穿越", async () => {
    const projectRootPath = await createTempUserDataDir();
    const host = createHost(projectRootPath);

    await expect(
      host.invoke("save_layered_design_project_export", {
        request: {
          projectRootPath,
          documentId: "doc-1",
          title: "Design Test",
          files: [
            {
              relativePath: "../design.json",
              mimeType: "application/json",
              encoding: "utf8",
              content: "{}",
            },
            {
              relativePath: "export-manifest.json",
              mimeType: "application/json",
              encoding: "utf8",
              content: "{}",
            },
          ],
        },
      }),
    ).rejects.toThrow("导出文件路径不能包含目录穿越或根路径");
  });

  it("Layered Design extraction current 命令返回合法 unsupported fallback", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("recognize_layered_design_text", {
        request: {
          imageSrc: "data:image/png;base64,ZmFrZQ==",
          width: 640,
          height: 180,
        },
      }),
    ).resolves.toEqual({
      supported: false,
      engine: "electron_host_unsupported",
      blocks: [],
      message: "Electron Host 尚未接入 native OCR provider",
    });

    await expect(
      host.invoke("analyze_layered_design_flat_image", {
        request: {
          image: {
            src: "data:image/png;base64,ZmFrZQ==",
            width: 900,
            height: 1400,
            mimeType: "image/png",
          },
        },
      }),
    ).resolves.toEqual({
      supported: false,
      engine: "electron_host_unsupported",
      message: "Electron Host 尚未接入 native structured analyzer provider",
    });
  });

  it("agent_app_select_directory 通过 Electron dialog 选择目录", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/agent-app"],
    });

    await expect(
      host.invoke("agent_app_select_directory", {
        request: { title: "选择应用目录" },
      }),
    ).resolves.toEqual({
      path: "/tmp/agent-app",
      cancelled: false,
    });

    expect(showOpenDialogMock).toHaveBeenCalledWith({
      title: "选择应用目录",
      properties: ["openDirectory"],
    });
  });

  it("agent_app_select_directory 取消时返回空路径", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });

    await expect(
      host.invoke("agent_app_select_directory", {}),
    ).resolves.toEqual({
      path: null,
      cancelled: true,
    });
  });

  it("agent_app_launch_shell 应经 App Server prepare 后启动 UI runtime 并打开 Electron 窗口", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "agentAppShell/prepare") {
        expect(params).toEqual({
          descriptor: buildAgentAppShellDescriptor(),
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
      if (method === "agentAppUiRuntime/start") {
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
    const host = createHost(userDataDir, undefined, request);

    await expect(
      host.invoke("agent_app_launch_shell", {
        request: {
          descriptor: buildAgentAppShellDescriptor(),
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
      shellWindow: {
        label: "agent-app-shell-content-factory-app-standalone",
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

    expect(request).toHaveBeenCalledWith("agentAppShell/prepare", {
      descriptor: buildAgentAppShellDescriptor(),
    });
    expect(request).toHaveBeenCalledWith("agentAppUiRuntime/start", {
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

  it("agent_app_launch_shell prepare blocked 时应 fail closed 且不启动 runtime", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentAppShell/prepare") {
        return {
          appId: "content-factory-app",
          status: "blocked",
          devShell: true,
          blockerCodes: ["INSTALLED_STATE_MISSING"],
          message: "Agent App 未安装。",
          preparedAt: "2026-05-15T00:00:00.000Z",
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, undefined, request);

    await expect(
      host.invoke("agent_app_launch_shell", {
        request: {
          descriptor: buildAgentAppShellDescriptor(),
        },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      blockerCodes: ["INSTALLED_STATE_MISSING"],
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(browserWindowCtorMock).not.toHaveBeenCalled();
  });

  it("agent_app_launch_shell descriptor 无效时由 App Server prepare fail closed", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentAppShell/prepare") {
        return {
          status: "blocked",
          devShell: true,
          blockerCodes: ["PACKAGE_IDENTITY_MISSING"],
          message: "Agent App shell descriptor 未通过启动前校验。",
          preparedAt: "2026-05-15T00:00:00.000Z",
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, undefined, request);

    await expect(
      host.invoke("agent_app_launch_shell", {
        request: {
          descriptor: {
            ...buildAgentAppShellDescriptor(),
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

  it("get_local_skills_for_app 应透传 App Server skill/list 的本地目录路径", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "skill/list") {
        return {
          skills: [
            {
              name: "article-typesetting-master",
              display_name: "写作排版",
              description: "测试技能",
              local_directory_path:
                "/Users/demo/.agents/skills/article-typesetting-master",
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, undefined, request);

    await expect(
      host.invoke("get_local_skills_for_app", { app: "lime" }),
    ).resolves.toEqual([
      expect.objectContaining({
        directory: "article-typesetting-master",
        localDirectoryPath:
          "/Users/demo/.agents/skills/article-typesetting-master",
      }),
    ]);
    expect(request).toHaveBeenCalledWith("skill/list", {});
  });

  it("reveal_in_finder 通过 Electron shell 定位本地路径", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("reveal_in_finder", { path: "/tmp/demo.txt" }),
    ).resolves.toEqual({});

    expect(showItemInFolderMock).toHaveBeenCalledWith("/tmp/demo.txt");
  });

  it("open_with_default_app 通过 Electron shell 打开本地路径", async () => {
    openPathMock.mockResolvedValueOnce("");
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("open_with_default_app", { path: "/tmp/demo.txt" }),
    ).resolves.toEqual({});

    expect(openPathMock).toHaveBeenCalledWith("/tmp/demo.txt");
  });

  it("open_with_default_app 应暴露 Electron openPath 失败", async () => {
    openPathMock.mockResolvedValueOnce("Cannot open file");
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("open_with_default_app", { path: "/tmp/missing.txt" }),
    ).rejects.toThrow("Cannot open file");
  });

  it("get_file_icon_data_url 应通过 Electron 读取系统文件图标", async () => {
    getFileIconMock.mockResolvedValueOnce({
      isEmpty: () => false,
      toDataURL: () => "data:image/png;base64,abc",
    });
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("get_file_icon_data_url", { path: "/Applications/Lime.app" }),
    ).resolves.toBe("data:image/png;base64,abc");

    expect(getFileIconMock).toHaveBeenCalledWith("/Applications/Lime.app", {
      size: "normal",
    });
  });

  it("get_file_icon_data_url 在系统图标不可用时返回 null", async () => {
    getFileIconMock.mockResolvedValueOnce({
      isEmpty: () => true,
      toDataURL: () => "data:image/png;base64,unused",
    });
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("get_file_icon_data_url", { path: "/tmp/missing.txt" }),
    ).resolves.toBeNull();
  });

  it("get_file_icon_data_url 应隔离 Electron 图标读取失败", async () => {
    getFileIconMock.mockRejectedValueOnce(new Error("icon unavailable"));
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("get_file_icon_data_url", { path: "/tmp/missing.txt" }),
    ).resolves.toBeNull();
  });

  it("get_home_dir 应返回 Electron 系统主目录", async () => {
    const userDataDir = await createTempUserDataDir();
    const homeDir = path.join(userDataDir, "home");
    getPathMock.mockImplementation((name: string) => {
      return name === "home" ? homeDir : os.tmpdir();
    });
    const host = createHost(userDataDir);

    await expect(host.invoke("get_home_dir")).resolves.toBe(homeDir);
  });

  it("get_home_dir 在系统主目录不可用时应 fail closed", async () => {
    const userDataDir = await createTempUserDataDir();
    getPathMock.mockImplementation((name: string) => {
      return name === "home" ? "" : os.tmpdir();
    });
    const host = createHost(userDataDir);

    await expect(host.invoke("get_home_dir")).rejects.toThrow("无法获取主目录");
  });

  it("get_file_manager_locations 应返回存在的系统快捷入口并去重", async () => {
    const userDataDir = await createTempUserDataDir();
    const homeDir = path.join(userDataDir, "home");
    const missingDesktopDir = path.join(userDataDir, "missing-desktop");
    const documentsDir = path.join(userDataDir, "Documents");
    const downloadsDir = path.join(userDataDir, "Downloads");
    await mkdir(homeDir, { recursive: true });
    await mkdir(documentsDir, { recursive: true });
    await mkdir(downloadsDir, { recursive: true });
    getPathMock.mockImplementation((name: string) => {
      if (name === "home") {
        return homeDir;
      }
      if (name === "desktop") {
        return missingDesktopDir;
      }
      if (name === "documents") {
        return documentsDir;
      }
      if (name === "downloads") {
        return downloadsDir;
      }
      return os.tmpdir();
    });
    const host = createHost(userDataDir);

    const locations = await host.invoke("get_file_manager_locations");

    expect(locations).toEqual(
      expect.arrayContaining([
        {
          id: "home",
          label: "个人",
          path: homeDir,
          kind: "home",
        },
        {
          id: "documents",
          label: "文档",
          path: documentsDir,
          kind: "documents",
        },
        {
          id: "downloads",
          label: "下载",
          path: downloadsDir,
          kind: "downloads",
        },
      ]),
    );
    const returnedPaths = (locations as Array<{ path: string }>).map(
      (location) => location.path,
    );
    expect(
      returnedPaths.filter((nextPath) => nextPath === homeDir),
    ).toHaveLength(1);
    expect(returnedPaths).not.toContain(missingDesktopDir);
  });
});

describe("ElectronHostCommands experimental config", () => {
  it("默认读取关闭的 WebMCP 预留配置", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(host.invoke("get_experimental_config")).resolves.toEqual({
      webmcp: { enabled: false },
    });
  });

  it("保存实验配置时合并完整配置并保留未知实验字段", async () => {
    const userDataDir = await createTempUserDataDir();
    await mkdir(userDataDir, { recursive: true });
    await createHost(userDataDir).invoke("save_config", {
      config: {
        default_provider: "anthropic",
        experimental: {
          webmcp: { enabled: false },
          update_check: { enabled: true },
        },
      },
    });

    const host = createHost(userDataDir);
    await expect(
      host.invoke("save_experimental_config", {
        experimentalConfig: {
          webmcp: { enabled: true },
          update_check: { enabled: true },
        },
      }),
    ).resolves.toBeNull();

    await expect(host.invoke("get_experimental_config")).resolves.toEqual({
      webmcp: { enabled: true },
      update_check: { enabled: true },
    });
    const savedConfig = JSON.parse(
      await readFile(path.join(userDataDir, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(savedConfig.default_provider).toBe("anthropic");
  });
});

describe("ElectronHostCommands retired MCP legacy facade", () => {
  it.each([
    "get_mcp_servers",
    "mcp_list_servers_with_status",
    "mcp_list_tools",
    "mcp_list_prompts",
    "mcp_list_resources",
  ])(
    "%s 已从 Electron Host 退场，生产只能走 App Server MCP current API",
    async (command) => {
      const userDataDir = await createTempUserDataDir();
      const request = vi.fn();
      const host = createHost(userDataDir, () => undefined, request);

      await expect(host.invoke(command)).rejects.toThrow(
        `Electron host command is not implemented: ${command}`,
      );
      expect(request).not.toHaveBeenCalled();
    },
  );
});

describe("ElectronHostCommands retired Knowledge legacy facade", () => {
  it.each([
    "knowledge_list_packs",
    "knowledge_get_pack",
    "knowledge_import_source",
    "knowledge_compile_pack",
    "knowledge_set_default_pack",
    "knowledge_update_pack_status",
    "knowledge_resolve_context",
    "knowledge_validate_context_run",
  ])(
    "%s 已从 Electron Host 退场，生产只能走 App Server JSONL current",
    async (command) => {
      const userDataDir = await createTempUserDataDir();
      const request = vi.fn();
      const host = createHost(userDataDir, () => undefined, request);

      await expect(
        host.invoke(command, {
          request: {
            workingDir: "/workspace/project",
            name: "sample-product",
          },
        }),
      ).rejects.toThrow(`Electron host command is not implemented: ${command}`);
      expect(request).not.toHaveBeenCalled();
    },
  );
});

describe("ElectronHostCommands model provider current source", () => {
  it("get_default_provider 应忽略旧配置值并返回 App Server 当前已配置 Provider", async () => {
    const userDataDir = await createTempUserDataDir();
    await createHost(userDataDir).invoke("save_config", {
      config: { default_provider: "retired-provider" },
    });
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === "modelProvider/list") {
        return {
          providers: [
            {
              id: "retired-provider",
              name: "Retired Provider",
              enabled: true,
              api_key_count: 0,
            },
            {
              id: "lime-hub",
              name: "Lime Hub",
              enabled: true,
              api_key_count: 1,
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(host.invoke("get_default_provider")).resolves.toBe("lime-hub");
    expect(request).toHaveBeenCalledWith("modelProvider/list", {});
  });

  it("aster_agent_init 不应把其他 Provider 的模型拼给当前 Provider", async () => {
    const userDataDir = await createTempUserDataDir();
    await createHost(userDataDir).invoke("save_config", {
      config: { default_provider: "retired-provider" },
    });
    const request = vi.fn(async (method: string) => {
      if (method === "modelProvider/list") {
        return {
          providers: [
            {
              id: "retired-provider",
              name: "Retired Provider",
              enabled: true,
              api_key_count: 0,
            },
            {
              id: "lime-hub",
              name: "Lime Hub",
              enabled: true,
              api_key_count: 1,
            },
          ],
        };
      }
      if (method === "model/list") {
        return {
          models: [
            {
              id: "deepseek-v4-pro",
              provider_id: "deepseek",
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(host.invoke("aster_agent_init")).resolves.toEqual({
      initialized: true,
      provider_configured: true,
      provider_name: "Lime Hub",
      provider_selector: "lime-hub",
      model_name: undefined,
    });
  });
});

describe("ElectronHostCommands Agent runtime legacy facade current bridge", () => {
  it("agent_runtime_get_tool_inventory 将 App Server tool capability 投影为运行时工具名", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "capability/list") {
        return {
          capabilities: [
            {
              id: "agent.session",
              title: "Agent Session",
              description: "Session control.",
              methods: [
                "agentSession/start",
                "agentSession/read",
                "agentSession/turn/start",
              ],
            },
            {
              id: "tool.WebFetch",
              title: "WebFetch",
              description: "Fetch a specific URL.",
              methods: ["agentSession/turn/start"],
            },
            {
              id: "tool.WebSearch",
              title: "WebSearch",
              description: "Search the web.",
              methods: ["agentSession/turn/start"],
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    const inventory = (await host.invoke("agent_runtime_get_tool_inventory", {
      request: {
        caller: "assistant",
        workbench: true,
        browserAssist: true,
        workspaceId: "workspace-1",
        sessionId: "session-1",
      },
    })) as {
      default_allowed_tools: string[];
      runtime_tools: Array<{ name: string; source_label: string }>;
    };

    expect(request).toHaveBeenCalledWith("capability/list", {
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
    expect(inventory.default_allowed_tools).toContain("WebFetch");
    expect(inventory.default_allowed_tools).toContain("WebSearch");
    expect(inventory.runtime_tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "WebFetch",
          source_label: "tool.WebFetch",
        }),
        expect.objectContaining({
          name: "WebSearch",
          source_label: "tool.WebSearch",
        }),
      ]),
    );
    expect(
      inventory.runtime_tools.filter(
        (tool) => tool.name === "agentSession/turn/start",
      ),
    ).toHaveLength(1);
  });

  it("agent_runtime_submit_turn 将 Claw turnConfig 投影到 App Server asterChatRequest", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_runtime_submit_turn", {
        request: {
          message: "整理今天的国际新闻",
          sessionId: "session-1",
          workspaceId: "workspace-1",
          eventName: "agent-runtime-event-1",
          turnId: "turn-1",
          queuedTurnId: "queued-1",
          queueIfBusy: true,
          skipPreSubmitResume: true,
          turnConfig: {
            providerPreference: "fixture-openai",
            modelPreference: "fixture-model",
            providerConfig: {
              providerName: "fixture-openai",
              modelName: "fixture-model",
              apiKey: "fixture-key",
              baseUrl: "http://127.0.0.1:5555/v1",
              toolCallStrategy: "tool-shim",
              toolshimModel: "fixture-toolshim",
            },
            approvalPolicy: "never",
            sandboxPolicy: "danger-full-access",
            webSearch: true,
            searchMode: "allowed",
            metadata: { source: "host-submit-test" },
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith(
      "agentSession/turn/start",
      expect.objectContaining({
        sessionId: "session-1",
        turnId: "turn-1",
        input: {
          text: "整理今天的国际新闻",
          attachments: undefined,
        },
        queueIfBusy: true,
        skipPreSubmitResume: true,
        runtimeOptions: expect.objectContaining({
          stream: true,
          eventName: "agent-runtime-event-1",
          providerPreference: "fixture-openai",
          modelPreference: "fixture-model",
          metadata: { source: "host-submit-test" },
          queuedTurnId: "queued-1",
          hostOptions: {
            asterChatRequest: expect.objectContaining({
              message: "整理今天的国际新闻",
              session_id: "session-1",
              event_name: "agent-runtime-event-1",
              provider_preference: "fixture-openai",
              model_preference: "fixture-model",
              workspace_id: "workspace-1",
              approval_policy: "never",
              sandbox_policy: "danger-full-access",
              web_search: true,
              search_mode: "allowed",
              turn_id: "turn-1",
              queue_if_busy: true,
              queued_turn_id: "queued-1",
              metadata: { source: "host-submit-test" },
              provider_config: {
                providerName: "fixture-openai",
                modelName: "fixture-model",
                apiKey: "fixture-key",
                baseUrl: "http://127.0.0.1:5555/v1",
                toolCallStrategy: "tool-shim",
                toolshimModel: "fixture-toolshim",
              },
              turn_config: expect.objectContaining({
                providerConfig: expect.objectContaining({
                  providerName: "fixture-openai",
                  baseUrl: "http://127.0.0.1:5555/v1",
                }),
              }),
            }),
            agentRuntimeSubmitTurnRequest: expect.objectContaining({
              sessionId: "session-1",
              turnConfig: expect.objectContaining({
                providerPreference: "fixture-openai",
              }),
            }),
          },
        }),
      }),
    );
  });

  it("agent_runtime_get_thread_read 透传 App Server read detail 的工具调用", async () => {
    const userDataDir = await createTempUserDataDir();
    const threadRead = {
      session_id: "session-1",
      thread_id: "thread-1",
      status: "completed",
      execution_strategy: "react",
      turns: [],
      pending_requests: [],
      queued_turns: [],
      tool_calls: [
        {
          id: "tool-call-webfetch",
          tool_name: "WebFetch",
          status: "completed",
          success: true,
          output_preview: "fetched example.com",
        },
        {
          id: "tool-call-websearch",
          toolName: "WebSearch",
          status: "completed",
          outputPreview: "search results",
        },
      ],
    };
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "desktop",
            workspaceId: "workspace-1",
            status: "completed",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:01.000Z",
          },
          turns: [],
          detail: {
            id: "session-1",
            execution_strategy: "react",
            thread_read: threadRead,
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_runtime_get_thread_read", {
        sessionId: "session-1",
      }),
    ).resolves.toEqual(threadRead);
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
  });

  it("agent_runtime_export_evidence_pack 从 App Server events 投影真实工具轨迹", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "evidence/export") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "desktop",
            workspaceId: "workspace-1",
            status: "completed",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:03.000Z",
          },
          turns: [
            {
              turnId: "turn-1",
              sessionId: "session-1",
              threadId: "thread-1",
              status: "completed",
            },
          ],
          events: [
            {
              eventId: "event-fetch-started",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.started",
              timestamp: "2026-06-07T00:00:01.000Z",
              payload: {
                toolCallId: "tool-call-webfetch",
                toolName: "WebFetch",
              },
            },
            {
              eventId: "event-fetch-result",
              sequence: 2,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.result",
              timestamp: "2026-06-07T00:00:02.000Z",
              payload: {
                toolCallId: "tool-call-webfetch",
                toolName: "WebFetch",
                output: "Example Domain",
              },
            },
            {
              eventId: "event-nested-fetch-result",
              sequence: 3,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.result",
              timestamp: "2026-06-07T00:00:02.500Z",
              payload: {
                runtimeEvent: {
                  tool_id: "tool-call-webfetch",
                  type: "tool_end",
                  result: {
                    success: true,
                    output: "Example Domain nested runtime output",
                  },
                },
                tool_id: "tool-call-webfetch",
                type: "tool_end",
                result: {
                  success: true,
                  output: "Example Domain nested runtime output",
                },
              },
            },
            {
              eventId: "event-search-result",
              sequence: 4,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "item.completed",
              timestamp: "2026-06-07T00:00:03.000Z",
              payload: {
                runtimeEvent: {
                  type: "item_completed",
                  item: {
                    id: "tool-call-websearch",
                    type: "tool_call",
                    tool_name: "WebSearch",
                    status: "completed",
                    success: true,
                    output: "Lime runtime tool smoke example domain",
                  },
                },
                item: {
                  id: "tool-call-websearch",
                  type: "tool_call",
                  tool_name: "WebSearch",
                  status: "completed",
                  success: true,
                  output: "Lime runtime tool smoke example domain",
                },
              },
            },
          ],
          artifacts: [],
          exportedAt: "2026-06-07T00:00:04.000Z",
          evidencePack: {
            packRelativeRoot: "",
            exportedAt: "2026-06-07T00:00:04.000Z",
            threadStatus: "completed",
            latestTurnStatus: "completed",
            turnCount: 1,
            itemCount: 3,
            pendingRequestCount: 0,
            queuedTurnCount: 0,
            recentArtifactCount: 0,
            knownGaps: [],
            artifacts: [],
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_runtime_export_evidence_pack", {
        sessionId: "session-1",
      }),
    ).resolves.toMatchObject({
      sessionId: "session-1",
      threadId: "thread-1",
      observabilitySummary: {
        schemaVersion: "runtime-evidence-observability.v1",
        toolCalls: [
          expect.objectContaining({
            id: "tool-call-webfetch",
            toolName: "WebFetch",
            status: "completed",
            success: true,
            output: "Example Domain nested runtime output",
          }),
          expect.objectContaining({
            id: "tool-call-websearch",
            toolName: "WebSearch",
            status: "completed",
            success: true,
            output: "Lime runtime tool smoke example domain",
          }),
        ],
      },
    });
    expect(request).toHaveBeenCalledWith("evidence/export", {
      sessionId: "session-1",
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
  });
});

describe("ElectronHostCommands Agent App runtime current bridge", () => {
  it("agent_app_runtime_start_task 通过 App Server session start 与 turn start 投影", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/start") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "idle",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
        };
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_start_task", {
        request: {
          appId: "content-factory-app",
          entryKey: "writer",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content_factory.write",
          title: "写一组发布文案",
          prompt: "生成 3 条可发布文案",
          input: { topic: "Electron current" },
          expectedOutput: { contentFactoryWorkspacePatch: true },
          eventName: "agent_app_runtime:content-factory-app:task-1",
          turnId: "turn-1",
          providerPreference: "anthropic",
          modelPreference: "claude-sonnet-4",
          queueIfBusy: true,
          skipPreSubmitResume: false,
          metadata: { source: "host-test" },
          turnConfig: {
            provider_config: { provider_name: "anthropic" },
            reasoning_effort: "medium",
            sandbox_policy: "workspace-write",
            metadata: { turn_source: "agent-app" },
          },
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      entryKey: "writer",
      taskId: "task-1",
      taskKind: "content_factory.write",
      sessionId: "session-1",
      turnId: "turn-1",
      eventName: "agent_app_runtime:content-factory-app:task-1",
      status: "accepted",
    });

    expect(request).toHaveBeenNthCalledWith(1, "agentSession/start", {
      sessionId: "session-1",
      appId: "content-factory-app",
      workspaceId: "workspace-1",
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "agentSession/turn/start",
      expect.objectContaining({
        sessionId: "session-1",
        turnId: "turn-1",
        input: {
          text: expect.stringContaining("Business Prompt:"),
          attachments: [],
        },
        queueIfBusy: true,
        skipPreSubmitResume: false,
        runtimeOptions: expect.objectContaining({
          stream: true,
          eventName: "agent_app_runtime:content-factory-app:task-1",
          providerPreference: "anthropic",
          modelPreference: "claude-sonnet-4",
          queuedTurnId: "agent-app-queued-task-1",
          metadata: {
            source: "host-test",
            turn_source: "agent-app",
          },
          hostOptions: {
            asterChatRequest: expect.objectContaining({
              session_id: "session-1",
              turn_id: "turn-1",
              workspace_id: "workspace-1",
              provider_preference: "anthropic",
              model_preference: "claude-sonnet-4",
              provider_config: { provider_name: "anthropic" },
              queued_turn_id: "agent-app-queued-task-1",
              turn_config: expect.objectContaining({
                provider_config: { provider_name: "anthropic" },
              }),
            }),
          },
        }),
      }),
    );
  });

  it("agent_app_runtime_start_task 对已存在 session 做幂等投影并继续提交 turn", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/start") {
        throw sessionAlreadyExistsError("session-1");
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_start_task", {
        request: {
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content_factory.write",
          prompt: "继续同一个 App task",
          turnId: "turn-1",
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      turnId: "turn-1",
      status: "accepted",
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "agentSession/start",
      "agentSession/turn/start",
    ]);
  });

  it("agent_app_runtime_get_task 从 agentSession/read 投影 task snapshot 状态", async () => {
    const userDataDir = await createTempUserDataDir();
    const detail = { thread_id: "thread-1", pending_requests: [] };
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "waitingAction",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
          turns: [],
          detail,
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_get_task", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      status: "thread_read_available",
      taskStatus: "blocked",
      taskEvents: [],
      threadRead: detail,
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
  });

  it("agent_app_runtime_cancel_task 缺少 turnId 时先从 agentSession/read 查找活动 turn", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "running",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
          turns:
            (params as { sessionId?: string }).sessionId ===
            "session-without-active-turn"
              ? [
                  {
                    turnId: "turn-completed",
                    sessionId: "session-without-active-turn",
                    threadId: "thread-1",
                    status: "completed",
                  },
                ]
              : [
                  {
                    turnId: "turn-completed",
                    sessionId: "session-1",
                    threadId: "thread-1",
                    status: "completed",
                  },
                  {
                    turnId: "turn-running",
                    sessionId: "session-1",
                    threadId: "thread-1",
                    status: "running",
                  },
                ],
        };
      }
      if (method === "agentSession/turn/cancel") {
        return {};
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_cancel_task", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-without-active-turn",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-without-active-turn",
      cancelled: false,
      status: "not_running",
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-without-active-turn",
    });

    await expect(
      host.invoke("agent_app_runtime_cancel_task", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      cancelled: true,
      status: "cancelled",
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
    expect(request).toHaveBeenCalledWith("agentSession/turn/cancel", {
      sessionId: "session-1",
      turnId: "turn-running",
    });
  });

  it("agent_app_runtime_submit_host_response 投影 snake_case runtime request 到 action/respond", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/action/respond") {
        return {};
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_submit_host_response", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          runtimeRequest: {
            session_id: "session-1",
            request_id: "request-1",
            action_type: "ask_user",
            confirmed: true,
            response: "继续",
            user_data: { note: "ok" },
            metadata: { source: "host-test" },
            event_name: "agent_app_runtime:host_response",
            action_scope: {
              session_id: "session-1",
              thread_id: "thread-1",
              turn_id: "turn-1",
            },
          },
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      status: "submitted",
    });
    expect(request).toHaveBeenCalledWith("agentSession/action/respond", {
      sessionId: "session-1",
      requestId: "request-1",
      actionType: "ask_user",
      confirmed: true,
      response: "继续",
      userData: { note: "ok" },
      metadata: { source: "host-test" },
      eventName: "agent_app_runtime:host_response",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
  });
});

describe("ElectronHostCommands system utilities", () => {
  it("get_voice_shortcut_runtime_status 读取当前语音快捷键注册状态", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    await host.invoke("save_config", {
      config: {
        experimental: {
          voice_input: {
            shortcut: "Alt+F8",
          },
        },
      },
    });
    globalShortcutIsRegisteredMock.mockImplementation(
      (shortcut: string) => shortcut === "Alt+F8",
    );

    await expect(
      host.invoke("get_voice_shortcut_runtime_status"),
    ).resolves.toEqual({
      shortcut_registered: true,
      registered_shortcut: "Alt+F8",
      fn_supported: process.platform === "darwin",
      fn_registered: false,
      fn_fallback_shortcut: "Alt+F8",
      fn_note: "Fn 按住录音尚未接入；当前使用普通语音快捷键回退。",
    });

    expect(globalShortcutIsRegisteredMock).toHaveBeenCalledWith("Alt+F8");
  });

  it("get_voice_shortcut_runtime_status 对无效配置回退默认快捷键", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    await host.invoke("save_config", {
      config: {
        experimental: {
          voice_input: {
            shortcut: "InvalidKey",
          },
        },
      },
    });
    globalShortcutIsRegisteredMock.mockReturnValue(false);

    await expect(
      host.invoke("get_voice_shortcut_runtime_status"),
    ).resolves.toEqual({
      shortcut_registered: false,
      registered_shortcut: null,
      fn_supported: process.platform === "darwin",
      fn_registered: false,
      fn_fallback_shortcut: "CommandOrControl+Shift+V",
      fn_note:
        "语音快捷键配置不可解析，已使用默认普通语音快捷键回退；Fn 按住录音尚未接入。",
    });

    expect(globalShortcutIsRegisteredMock).toHaveBeenCalledWith(
      "CommandOrControl+Shift+V",
    );
  });

  it("validate_shortcut 在 Electron Host 侧校验常见全局快捷键", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("validate_shortcut", {
        shortcutStr: "CommandOrControl+Shift+V",
      }),
    ).resolves.toBe(true);
    await expect(
      host.invoke("validate_shortcut", {
        request: { shortcut_str: "Alt+F4" },
      }),
    ).resolves.toBe(true);
    await expect(
      host.invoke("validate_shortcut", {
        request: { shortcut: "Ctrl+C" },
      }),
    ).resolves.toBe(true);
  });

  it("validate_shortcut 拒绝空值和无法解析的快捷键", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("validate_shortcut", { shortcutStr: "" }),
    ).rejects.toThrow("快捷键不能为空");
    await expect(
      host.invoke("validate_shortcut", {
        shortcutStr: "InvalidKey",
      }),
    ).rejects.toThrow("无法解析快捷键 'InvalidKey'");
  });

  it("validate_shortcut 拒绝系统输入法保留快捷键", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("validate_shortcut", {
        shortcutStr: "CommandOrControl+Space",
      }),
    ).rejects.toThrow("输入法切换");
  });

  it("voice_models_list_catalog 返回 Electron Host current 目录形态", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(host.invoke("voice_models_list_catalog")).resolves.toEqual([
      expect.objectContaining({
        id: "sensevoice-small-int8-2024-07-17",
        name: "SenseVoice Small INT8",
        provider: "FunAudioLLM / sherpa-onnx",
        download_url: expect.stringContaining(
          "/voice/sensevoice-small-int8-2024-07-17/",
        ),
        vad_download_url: expect.stringContaining(
          "/voice/silero-vad-onnx/silero_vad.onnx",
        ),
        runtime: "sherpa-onnx",
        bundled: false,
      }),
    ]);
  });

  it("voice_models_get_install_state 读取用户数据目录中的本地模型文件", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    const installDir = path.join(
      userDataDir,
      "models",
      "voice",
      "sensevoice-small-int8-2024-07-17",
    );
    await mkdir(installDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(installDir, "model.int8.onnx"), "model"),
      writeFile(path.join(installDir, "tokens.txt"), "tokens"),
      writeFile(path.join(installDir, "silero_vad.onnx"), "vad"),
      writeFile(
        path.join(installDir, "lime-model.json"),
        JSON.stringify({ installed_at: 1_700_000_000 }),
      ),
    ]);

    await expect(
      host.invoke("voice_models_get_install_state", {
        modelId: "sensevoice-small-int8-2024-07-17",
      }),
    ).resolves.toEqual({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: true,
      installing: false,
      install_dir: installDir,
      model_file: path.join(installDir, "model.int8.onnx"),
      tokens_file: path.join(installDir, "tokens.txt"),
      vad_file: path.join(installDir, "silero_vad.onnx"),
      installed_bytes: 41,
      last_verified_at: 1_700_000_000,
      missing_files: [],
      default_credential_id: null,
    });
  });

  it("voice_models_get_install_state 对未安装模型返回缺失文件但不返回 diagnostic facade", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("voice_models_get_install_state", {
        modelId: "sensevoice-small-int8-2024-07-17",
      }),
    ).resolves.toEqual({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: false,
      installing: false,
      install_dir: path.join(
        userDataDir,
        "models",
        "voice",
        "sensevoice-small-int8-2024-07-17",
      ),
      model_file: null,
      tokens_file: null,
      vad_file: null,
      installed_bytes: 0,
      last_verified_at: null,
      missing_files: ["model.int8.onnx", "tokens.txt", "silero_vad.onnx"],
      default_credential_id: null,
    });
  });

  it("voice_models_download 下载并安装本地模型文件", async () => {
    const userDataDir = await createTempUserDataDir();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    const host = createHost(userDataDir, (event, payload) => {
      emitted.push({ event, payload });
    });
    const archive = await createVoiceModelArchiveFixture(userDataDir);
    const vad = Buffer.from("vad");

    await withBinaryServer(
      {
        "/voice-model.tar.bz2": archive,
        "/silero_vad.onnx": vad,
      },
      async (baseUrl) => {
        await expect(
          host.invoke("voice_models_download", {
            modelId: "sensevoice-small-int8-2024-07-17",
            catalogEntry: {
              id: "sensevoice-small-int8-2024-07-17",
              download_url: `${baseUrl}/voice-model.tar.bz2`,
              vad_download_url: `${baseUrl}/silero_vad.onnx`,
              size_bytes: archive.byteLength,
            },
          }),
        ).resolves.toEqual({
          state: expect.objectContaining({
            model_id: "sensevoice-small-int8-2024-07-17",
            installed: true,
            installing: false,
            missing_files: [],
            installed_bytes: expect.any(Number),
            model_file: path.join(
              userDataDir,
              "models",
              "voice",
              "sensevoice-small-int8-2024-07-17",
              "model.int8.onnx",
            ),
            tokens_file: path.join(
              userDataDir,
              "models",
              "voice",
              "sensevoice-small-int8-2024-07-17",
              "tokens.txt",
            ),
            vad_file: path.join(
              userDataDir,
              "models",
              "voice",
              "sensevoice-small-int8-2024-07-17",
              "silero_vad.onnx",
            ),
          }),
        });
      },
    );

    const installDir = path.join(
      userDataDir,
      "models",
      "voice",
      "sensevoice-small-int8-2024-07-17",
    );
    await expect(
      readFile(path.join(installDir, "model.int8.onnx"), "utf8"),
    ).resolves.toBe("model");
    await expect(
      readFile(path.join(installDir, "tokens.txt"), "utf8"),
    ).resolves.toBe("tokens");
    await expect(
      readFile(path.join(installDir, "silero_vad.onnx"), "utf8"),
    ).resolves.toBe("vad");
    const manifest = JSON.parse(
      await readFile(path.join(installDir, "lime-model.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.model_id).toBe("sensevoice-small-int8-2024-07-17");
    expect(manifest.archive_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(emitted.map((entry) => entry.event)).toContain(
      "voice-model-download-progress",
    );
    expect(
      emitted.some(
        (entry) =>
          entry.event === "voice-model-download-progress" &&
          (entry.payload as Record<string, unknown>)?.phase === "done",
      ),
    ).toBe(true);
  });

  it("voice_models_delete 删除本地模型目录并返回未安装状态", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    const installDir = path.join(
      userDataDir,
      "models",
      "voice",
      "sensevoice-small-int8-2024-07-17",
    );
    await mkdir(installDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(installDir, "model.int8.onnx"), "model"),
      writeFile(path.join(installDir, "tokens.txt"), "tokens"),
      writeFile(path.join(installDir, "silero_vad.onnx"), "vad"),
      writeFile(
        path.join(installDir, "lime-model.json"),
        JSON.stringify({ installed_at: 1_700_000_000 }),
      ),
    ]);

    await expect(
      host.invoke("voice_models_delete", {
        modelId: "sensevoice-small-int8-2024-07-17",
      }),
    ).resolves.toEqual({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: false,
      installing: false,
      install_dir: installDir,
      model_file: null,
      tokens_file: null,
      vad_file: null,
      installed_bytes: 0,
      last_verified_at: null,
      missing_files: ["model.int8.onnx", "tokens.txt", "silero_vad.onnx"],
      default_credential_id: null,
    });
    await expect(stat(installDir)).rejects.toThrow();
  });

  it("通过系统浏览器打开 http/https 外部链接", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    openExternalMock.mockResolvedValueOnce(undefined);

    await expect(
      host.invoke("open_external_url", {
        url: " https://user.limeai.run/login ",
      }),
    ).resolves.toEqual({});

    expect(openExternalMock).toHaveBeenCalledWith(
      "https://user.limeai.run/login",
    );
  });

  it("拒绝非 http/https 外部链接", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("open_external_url", { url: "file:///tmp/token" }),
    ).rejects.toThrow("外部链接只支持 http/https 地址");

    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it("打开系统设置 scheme 并拒绝普通外链或本地文件", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    openExternalMock.mockResolvedValue(undefined);

    await expect(
      host.invoke("open_system_settings_url", {
        url: " x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility ",
      }),
    ).resolves.toEqual({});
    await expect(
      host.invoke("open_system_settings_url", {
        url: "ms-settings:clipboard",
      }),
    ).resolves.toEqual({});
    await expect(
      host.invoke("open_system_settings_url", {
        url: "https://example.com/settings",
      }),
    ).rejects.toThrow(
      "系统设置链接只支持 x-apple.systempreferences 或 ms-settings scheme",
    );
    await expect(
      host.invoke("open_system_settings_url", {
        url: "file:///tmp/settings",
      }),
    ).rejects.toThrow(
      "系统设置链接只支持 x-apple.systempreferences 或 ms-settings scheme",
    );

    expect(openExternalMock).toHaveBeenCalledTimes(2);
    expect(openExternalMock).toHaveBeenNthCalledWith(
      1,
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
    expect(openExternalMock).toHaveBeenNthCalledWith(
      2,
      "ms-settings:clipboard",
    );
  });

  it("启动真实 OAuth 本机回调桥并把回调事件广播到 renderer", async () => {
    const userDataDir = await createTempUserDataDir();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    const host = createHost(userDataDir, (event, payload) => {
      emitted.push({ event, payload });
    });

    const response = (await host.invoke(
      "start_oem_cloud_oauth_callback_bridge",
    )) as { callbackUrl: string };
    expect(response.callbackUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/,
    );

    const callbackUrl = new URL(response.callbackUrl);
    callbackUrl.searchParams.set("tenant_id", "tenant-1");
    callbackUrl.searchParams.set("token", "token-1");
    callbackUrl.searchParams.set("next", "/dashboard");
    callbackUrl.searchParams.set("device_code", "device-1");
    callbackUrl.searchParams.set("status", "ok");

    const callbackResponse = await fetch(callbackUrl);
    expect(callbackResponse.status).toBe(200);
    await expect(callbackResponse.text()).resolves.toContain(
      "Lime 登录结果已返回",
    );

    expect(emitted).toEqual([
      {
        event: "oem-cloud-oauth-callback",
        payload: {
          sourcePath: "/oauth/callback",
          tenantId: "tenant-1",
          token: "token-1",
          next: "/dashboard",
          error: null,
          deviceCode: "device-1",
          status: "ok",
        },
      },
    ]);

    await expect(fetch(callbackUrl)).rejects.toThrow();
  });
});
