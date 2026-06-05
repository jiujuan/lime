import { describe, expect, it } from "vitest";

import { open, save } from "./plugin-dialog";

describe("desktop-host/plugin-dialog", () => {
  it("浏览器预览不能伪造本机目录路径", async () => {
    await expect(open({ directory: true, multiple: false })).rejects.toThrow(
      "Native directory dialog is unavailable in browser preview.",
    );
  });

  it("普通文件选择仍保留浏览器 mock，避免既有预览用例失效", async () => {
    await expect(open({ multiple: false })).resolves.toBe(
      "/mock/path/to/file.txt",
    );
  });

  it("Skill 安装包导出保存对话应返回 .skills 后缀", async () => {
    await expect(
      save({
        filters: [{ name: "Skill package", extensions: ["skills", "skill"] }],
      }),
    ).resolves.toBe("/mock/path/to/saved/file.skills");
  });
});
