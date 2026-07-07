import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { convertFileSrc } from "@/lib/desktop-host/core";
import { hasDesktopHostInvokeCapability } from "@/lib/desktop-runtime";
import {
  convertLocalFileSrc,
  isAbsoluteLocalFilePath,
  openHtmlPreviewWindow,
  openPathWithDefaultApp,
  getHomeDirectory,
  revealPathInFinder,
  resolveLocalFilePreviewUrl,
} from "./fileSystem";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("@/lib/desktop-host/core", () => ({
  convertFileSrc: vi.fn(),
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability: vi.fn(),
}));

describe("fileSystem API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(false);
    vi.mocked(convertFileSrc).mockImplementation((path: string) => {
      return `asset://${path}`;
    });
  });

  it("应代理 reveal_in_finder", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(revealPathInFinder("/tmp/demo.txt")).resolves.toBeUndefined();
    expect(safeInvoke).toHaveBeenCalledWith("reveal_in_finder", {
      path: "/tmp/demo.txt",
    });
  });

  it("应代理 open_with_default_app", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(
      openPathWithDefaultApp("/tmp/demo.txt"),
    ).resolves.toBeUndefined();
    expect(safeInvoke).toHaveBeenCalledWith("open_with_default_app", {
      path: "/tmp/demo.txt",
    });
  });

  it("应代理 get_home_dir", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce("/Users/demo");

    await expect(getHomeDirectory()).resolves.toBe("/Users/demo");
    expect(safeInvoke).toHaveBeenCalledWith("get_home_dir");
  });

  it("文件壳命令遇到 Electron diagnostic facade 时应 fail closed", async () => {
    const diagnosticResult = {
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "reveal_in_finder",
        status: "degraded",
      },
    };

    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticResult);
    await expect(revealPathInFinder("/tmp/demo.txt")).rejects.toThrow(
      "reveal_in_finder 尚未接入真实文件壳 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );

    vi.mocked(safeInvoke).mockResolvedValueOnce({
      ...diagnosticResult,
      diagnostic: {
        ...diagnosticResult.diagnostic,
        command: "open_with_default_app",
      },
    });
    await expect(openPathWithDefaultApp("/tmp/demo.txt")).rejects.toThrow(
      "open_with_default_app 尚未接入真实文件壳 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );

    vi.mocked(safeInvoke).mockResolvedValueOnce({
      ...diagnosticResult,
      diagnostic: {
        ...diagnosticResult.diagnostic,
        command: "get_home_dir",
      },
    });
    await expect(getHomeDirectory()).rejects.toThrow(
      "get_home_dir 尚未接入真实文件壳 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("文件壳 side-effect 命令只接受真实空返回", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      });

    await expect(revealPathInFinder("/tmp/demo.txt")).resolves.toBeUndefined();
    await expect(revealPathInFinder("/tmp/demo.txt")).rejects.toThrow(
      "reveal_in_finder did not return empty Electron host result",
    );
    await expect(
      openPathWithDefaultApp("/tmp/demo.txt"),
    ).resolves.toBeUndefined();
    await expect(openPathWithDefaultApp("/tmp/demo.txt")).rejects.toThrow(
      "open_with_default_app did not return empty Electron host result",
    );
  });

  it("get_home_dir 返回非空字符串以外的形态时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ home: "/Users/demo" });

    await expect(getHomeDirectory()).rejects.toThrow(
      "get_home_dir did not return a home directory",
    );

    vi.mocked(safeInvoke).mockResolvedValueOnce("   ");

    await expect(getHomeDirectory()).rejects.toThrow(
      "get_home_dir did not return a home directory",
    );
  });

  it("应代理 convertFileSrc", () => {
    vi.mocked(convertFileSrc).mockReturnValueOnce("asset://demo.txt");

    expect(convertLocalFileSrc("/tmp/demo.txt")).toBe("asset://demo.txt");
    expect(convertFileSrc).toHaveBeenCalledWith("/tmp/demo.txt", "asset");
  });

  it("convertFileSrc 在浏览器环境不可用时应回退原始路径", () => {
    vi.mocked(convertFileSrc).mockImplementationOnce(() => {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'convertFileSrc')",
      );
    });

    expect(convertLocalFileSrc("/tmp/demo.txt")).toBe("/tmp/demo.txt");
  });

  it("应只为绝对本地路径生成可嵌入预览 URL", () => {
    vi.mocked(convertFileSrc).mockReturnValueOnce("asset:///tmp/demo.html");

    expect(isAbsoluteLocalFilePath("/tmp/demo.html")).toBe(true);
    expect(isAbsoluteLocalFilePath("D:\\demo\\index.html")).toBe(true);
    expect(isAbsoluteLocalFilePath("relative/demo.html")).toBe(false);
    expect(resolveLocalFilePreviewUrl("/tmp/demo.html")).toBe(
      "asset:///tmp/demo.html",
    );
    expect(resolveLocalFilePreviewUrl("relative/demo.html")).toBeNull();
  });

  it("文件 URL 转换不可用时不应误把原始路径当成 iframe URL", () => {
    vi.mocked(convertFileSrc).mockReturnValueOnce("/tmp/demo.html");

    expect(resolveLocalFilePreviewUrl("/tmp/demo.html")).toBeNull();
  });

  it("Desktop Host 环境应通过 Electron Host 打开 HTML 预览窗口", async () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      opened: true,
      reused: false,
      url: "file:///tmp/lime/prototype.html",
      title: "prototype.html",
    });

    await expect(
      openHtmlPreviewWindow("/tmp/lime/prototype.html"),
    ).resolves.toBe(true);

    expect(safeInvoke).toHaveBeenCalledWith("open_file_preview_window", {
      path: "/tmp/lime/prototype.html",
      title: "prototype.html",
    });
  });

  it("已有 HTML 预览窗口时接受 Electron Host 复用结果", async () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      opened: true,
      reused: true,
      url: "file:///tmp/lime/prototype.html",
      title: "prototype.html",
    });

    await expect(
      openHtmlPreviewWindow("/tmp/lime/prototype.html"),
    ).resolves.toBe(true);

    expect(safeInvoke).toHaveBeenCalledWith("open_file_preview_window", {
      path: "/tmp/lime/prototype.html",
      title: "prototype.html",
    });
  });

  it("非 Desktop Host 环境不应创建 HTML 预览窗口", async () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(false);

    await expect(
      openHtmlPreviewWindow("/tmp/lime/prototype.html"),
    ).resolves.toBe(false);

    expect(safeInvoke).not.toHaveBeenCalledWith(
      "open_file_preview_window",
      expect.anything(),
    );
  });

  it("HTML 预览窗口命令收到诊断 facade 时应 fail closed", async () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "open_file_preview_window",
        status: "degraded",
      },
    });

    await expect(
      openHtmlPreviewWindow("/tmp/lime/prototype.html"),
    ).resolves.toBe(false);
  });
});
