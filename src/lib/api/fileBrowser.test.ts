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

const {
  appServerCreateDirectoryMock,
  appServerCreateFileMock,
  appServerDeleteFileMock,
  appServerListDirectoryMock,
  appServerReadFilePreviewMock,
  appServerRenameFileMock,
} = vi.hoisted(() => ({
  appServerCreateDirectoryMock: vi.fn(),
  appServerCreateFileMock: vi.fn(),
  appServerDeleteFileMock: vi.fn(),
  appServerListDirectoryMock: vi.fn(),
  appServerReadFilePreviewMock: vi.fn(),
  appServerRenameFileMock: vi.fn(),
}));

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    createDirectory: appServerCreateDirectoryMock,
    createFile: appServerCreateFileMock,
    deleteFile: appServerDeleteFileMock,
    listDirectory: appServerListDirectoryMock,
    readFilePreview: appServerReadFilePreviewMock,
    renameFile: appServerRenameFileMock,
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
    appServerListDirectoryMock.mockResolvedValueOnce({
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
    appServerCreateFileMock.mockResolvedValueOnce({ result: {} });
    appServerCreateDirectoryMock.mockResolvedValueOnce({ result: {} });
    appServerRenameFileMock.mockResolvedValueOnce({ result: {} });
    appServerDeleteFileMock.mockResolvedValueOnce({ result: {} });

    await expect(createFileAtPath("/tmp/demo.txt")).resolves.toBeUndefined();
    await expect(
      createDirectoryAtPath("/tmp/demo-dir"),
    ).resolves.toBeUndefined();
    await expect(
      renamePath("/tmp/demo.txt", "/tmp/demo2.txt"),
    ).resolves.toBeUndefined();
    await expect(deletePath("/tmp/demo2.txt", false)).resolves.toBeUndefined();

    expect(appServerCreateFileMock).toHaveBeenCalledWith({
      path: "/tmp/demo.txt",
    });
    expect(appServerCreateDirectoryMock).toHaveBeenCalledWith({
      path: "/tmp/demo-dir",
    });
    expect(appServerRenameFileMock).toHaveBeenCalledWith({
      oldPath: "/tmp/demo.txt",
      newPath: "/tmp/demo2.txt",
    });
    expect(appServerDeleteFileMock).toHaveBeenCalledWith({
      path: "/tmp/demo2.txt",
      recursive: false,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "create_file",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "create_directory",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "rename_file",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "delete_file",
      expect.anything(),
    );
  });

  it("文件写命令应透传 App Server RPC 错误", async () => {
    const error = new Error("fileSystem/createFile failed");
    appServerCreateFileMock.mockRejectedValueOnce(error);

    await expect(createFileAtPath("/tmp/demo.txt")).rejects.toThrow(error);
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "create_file",
      expect.anything(),
    );
  });

  it("创建目录时应原样传递 Windows 原生路径", async () => {
    appServerCreateDirectoryMock.mockResolvedValueOnce({ result: {} });
    const windowsPath = String.raw`C:\Users\demo\workspace\new-folder`;

    await expect(createDirectoryAtPath(windowsPath)).resolves.toBeUndefined();

    expect(appServerCreateDirectoryMock).toHaveBeenCalledWith({
      path: windowsPath,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "create_directory",
      expect.anything(),
    );
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

  it("文件管理器快捷入口遇到 mock-like payload 或缺字段项时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce([{ id: "downloads" }]);

    await expect(getFileManagerLocations()).rejects.toThrow(
      "get_file_manager_locations did not return file manager locations",
    );
    await expect(getFileManagerLocations()).rejects.toThrow(
      "get_file_manager_locations did not return file manager locations",
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

  it("文件图标异步读取允许 null，但错误 payload 应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ error: "failed" });

    await expect(getFileIconDataUrl("/tmp/missing.txt")).resolves.toBeNull();
    await expect(getFileIconDataUrl("/Applications/Lime.app")).rejects.toThrow(
      "get_file_icon_data_url did not return file icon data URL",
    );
    await expect(getFileIconDataUrl("/Applications/Lime.app")).rejects.toThrow(
      "get_file_icon_data_url did not return file icon data URL",
    );
  });
});
