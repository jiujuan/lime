import { describe, expect, it } from "vitest";
import { parseSkillSlashCommand } from "./skillCommand";

describe("parseSkillSlashCommand", () => {
  it("解析英文 slash skill 与参数", () => {
    expect(
      parseSkillSlashCommand("/content_post_with_cover 写一版主稿"),
    ).toEqual({
      skillName: "content_post_with_cover",
      userInput: "写一版主稿",
    });
  });

  it("无参数时返回空输入", () => {
    expect(parseSkillSlashCommand("/image_generate")).toEqual({
      skillName: "image_generate",
      userInput: "",
    });
  });

  it("会裁剪参数首尾空白", () => {
    expect(parseSkillSlashCommand("/writer   写一段介绍  ")).toEqual({
      skillName: "writer",
      userInput: "写一段介绍",
    });
  });

  it("中文 scene slash 不应被旧 slash skill 解析器误判", () => {
    expect(
      parseSkillSlashCommand(
        "/x文章转存 https://x.com/GoogleCloudTech/article/2033953579824758855",
      ),
    ).toBeNull();
  });

  it("非 slash 输入不应解析", () => {
    expect(
      parseSkillSlashCommand("content_post_with_cover 写一版主稿"),
    ).toBeNull();
  });
});
