import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  createDirectoryAtPath,
  createFileAtPath,
  deletePath,
  getFileIconDataUrl,
  getFileManagerLocations,
  listDirectory,
  readFilePreview,
  renamePath,
} from "./fileBrowser";

const { appServerListDirectoryMock, appServerReadFilePreviewMock } = vi.hoisted(
  () => ({
    appServerListDirectoryMock: vi.fn(),
    appServerReadFilePreviewMock: vi.fn(),
  }),
);

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    listDirectory: appServerListDirectoryMock,
    readFilePreview: appServerReadFilePreviewMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("fileBrowser API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 App Server current 主链获取目录列表与文件预览", async () => {
    appServerListDirectoryMock
      .mockResolvedValueOnce({
        result: {
          path: "~",
          parentPath: null,
          entries: [
            {
              name: "Lime.app",
              path: "/Applications/Lime.app",
              isDir: true,
              size: 0,
              modifiedAt: 1,
              iconDataUrl: "data:image/png;base64,abc",
              isHidden: false,
              isSymlink: false,
            },
          ],
          error: null,
        },
      });
    appServerReadFilePreviewMock.mockResolvedValueOnce({
      result: {
        path: "/tmp/demo.txt",
        content: "hello",
        isBinary: false,
        size: 5,
        error: null,
      },
    });

    await expect(listDirectory("~")).resolves.toEqual(
      expect.objectContaining({
        path: "~",
        entries: [
          expect.objectContaining({
            name: "Lime.app",
            iconDataUrl: "data:image/png;base64,abc",
          }),
        ],
      }),
    );
    await expect(readFilePreview("/tmp/demo.txt", 1024)).resolves.toEqual(
      expect.objectContaining({ path: "/tmp/demo.txt", content: "hello" }),
    );
    expect(appServerListDirectoryMock).toHaveBeenCalledWith({ path: "~" });
    expect(appServerReadFilePreviewMock).toHaveBeenCalledWith({
      path: "/tmp/demo.txt",
      maxSize: 1024,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("list_dir", expect.anything());
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "read_file_preview_cmd",
      expect.anything(),
    );
  });

  it("应代理文件增删改命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(createFileAtPath("/tmp/demo.txt")).resolves.toBeUndefined();
    await expect(
      createDirectoryAtPath("/tmp/demo-dir"),
    ).resolves.toBeUndefined();
    await expect(
      renamePath("/tmp/demo.txt", "/tmp/demo2.txt"),
    ).resolves.toBeUndefined();
    await expect(deletePath("/tmp/demo2.txt", false)).resolves.toBeUndefined();
  });

  it("文件写命令遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "create_file",
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(createFileAtPath("/tmp/demo.txt")).rejects.toThrow(
      "create_file 尚未接入真实文件管理 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("创建目录时应原样传递 Windows 原生路径", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);
    const windowsPath = String.raw`C:\Users\demo\workspace\new-folder`;

    await expect(createDirectoryAtPath(windowsPath)).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenCalledWith("create_directory", {
      path: windowsPath,
    });
  });

  it("应代理文件管理器快捷入口命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      {
        id: "downloads",
        label: "下载",
        path: "/Users/demo/Downloads",
        kind: "downloads",
      },
    ]);

    await expect(getFileManagerLocations()).resolves.toEqual([
      expect.objectContaining({ id: "downloads", label: "下载" }),
    ]);
    expect(safeInvoke).toHaveBeenCalledWith("get_file_manager_locations");
  });

  it("文件管理器快捷入口遇到 Electron empty diagnostic list 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        command: "get_file_manager_locations",
        source: "electron-empty-diagnostic",
        status: "degraded",
      },
      enumerable: false,
    });

    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(getFileManagerLocations()).rejects.toThrow(
      "get_file_manager_locations 尚未接入真实文件管理 current 通道，收到 electron-empty-diagnostic 诊断返回。",
    );
  });

  it("应代理文件图标异步读取命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce("data:image/png;base64,abc");

    await expect(getFileIconDataUrl("/Applications/Lime.app")).resolves.toBe(
      "data:image/png;base64,abc",
    );
    expect(safeInvoke).toHaveBeenCalledWith("get_file_icon_data_url", {
      path: "/Applications/Lime.app",
    });
  });
});
