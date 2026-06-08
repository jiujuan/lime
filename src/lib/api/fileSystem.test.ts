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

const { mockWebviewWindow, mockGetByLabel } = vi.hoisted(() => {
  const ctor = vi.fn().mockImplementation(function (
    this: {
      label: string;
      options: Record<string, unknown>;
      once: (event: string, handler: () => void) => Promise<() => void>;
    },
    label: string,
    options: Record<string, unknown>,
  ) {
    this.label = label;
    this.options = options;
    this.once = vi.fn((_event: string, handler: () => void) => {
      handler();
      return Promise.resolve(() => undefined);
    });
  });

  return {
    mockWebviewWindow: ctor,
    mockGetByLabel: vi.fn(),
  };
});

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("@/lib/desktop-host/core", () => ({
  convertFileSrc: vi.fn(),
}));

vi.mock("@/lib/desktop-host/webviewWindow", () => ({
  WebviewWindow: Object.assign(mockWebviewWindow, {
    getByLabel: mockGetByLabel,
  }),
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
    mockGetByLabel.mockResolvedValue(null);
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

  it("应代理 convertFileSrc", () => {
    vi.mocked(convertFileSrc).mockReturnValueOnce("asset://demo.txt");

    expect(convertLocalFileSrc("/tmp/demo.txt")).toBe("asset://demo.txt");
    expect(convertFileSrc).toHaveBeenCalledWith("/tmp/demo.txt");
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

  it("Desktop Host 环境应使用 WebviewWindow 打开 HTML 预览", async () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(true);

    await expect(
      openHtmlPreviewWindow("/tmp/lime/prototype.html"),
    ).resolves.toBe(true);

    expect(mockWebviewWindow).toHaveBeenCalledWith(
      expect.stringMatching(/^html-preview-/),
      expect.objectContaining({
        url: "asset:///tmp/lime/prototype.html",
        title: "prototype.html",
        width: 1280,
      }),
    );
  });

  it("已有 HTML 预览窗口时应复用并聚焦", async () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(true);
    const existingWindow = {
      show: vi.fn().mockResolvedValue(undefined),
      setFocus: vi.fn().mockResolvedValue(undefined),
    };
    mockGetByLabel.mockResolvedValue(existingWindow);

    await expect(
      openHtmlPreviewWindow("/tmp/lime/prototype.html"),
    ).resolves.toBe(true);

    expect(existingWindow.show).toHaveBeenCalledTimes(1);
    expect(existingWindow.setFocus).toHaveBeenCalledTimes(1);
    expect(mockWebviewWindow).not.toHaveBeenCalled();
  });

  it("非 Desktop Host 环境不应创建 HTML 预览窗口", async () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(false);

    await expect(
      openHtmlPreviewWindow("/tmp/lime/prototype.html"),
    ).resolves.toBe(false);

    expect(mockWebviewWindow).not.toHaveBeenCalled();
  });
});
