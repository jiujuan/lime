import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  convertLocalFileSrc,
  openPathWithDefaultApp,
  revealPathInFinder,
} from "./fileSystem";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(),
}));

describe("fileSystem API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
