import { describe, expect, it } from "vitest";

import { open } from "./plugin-dialog";

describe("tauri-mock/plugin-dialog", () => {
  it("浏览器预览不能伪造本机目录路径", async () => {
    await expect(open({ directory: true, multiple: false })).rejects.toThrow(
      "Tauri native directory dialog is unavailable in browser preview.",
    );
  });

  it("普通文件选择仍保留浏览器 mock，避免既有预览用例失效", async () => {
    await expect(open({ multiple: false })).resolves.toBe(
      "/mock/path/to/file.txt",
    );
  });
});
