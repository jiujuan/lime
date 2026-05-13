import { describe, expect, it } from "vitest";
import { parseSkillInstallPromptInstruction } from "./skillInstallPrompt";

describe("skill install prompt", () => {
  it("解析官网复制的 Agent Skill 安装 Prompt", () => {
    const instruction = parseSkillInstallPromptInstruction(`Download and install a skill. Follow these steps EXACTLY. If any step fails, STOP and report the error.
SKILL_NAME="viral-content-breakdown"
DOWNLOAD_URL="https://limeai.run/skill-packages/viral-content-breakdown/latest/viral-content-breakdown.zip"
1. Download the Skill package.
2. Extract it into the Agent Skills directory.
3. Restart or reload the Agent so the Skill becomes available.`);

    expect(instruction).toEqual({
      skillName: "viral-content-breakdown",
      downloadUrl:
        "https://limeai.run/skill-packages/viral-content-breakdown/latest/viral-content-breakdown.zip",
      source: "assignment_prompt",
    });
  });

  it("支持从旧详情页 URL 推断 skill name", () => {
    const instruction = parseSkillInstallPromptInstruction(`Download and install a skill.
DOWNLOAD_URL="https://limeai.run/skills/viral-content-breakdown/"
Extract it into the Agent Skills directory.`);

    expect(instruction?.skillName).toBe("viral-content-breakdown");
    expect(instruction?.downloadUrl).toBe(
      "https://limeai.run/skill-packages/viral-content-breakdown/latest/viral-content-breakdown.zip",
    );
  });

  it("兼容用户从旧详情页复制的完整安装 Prompt", () => {
    const instruction = parseSkillInstallPromptInstruction(`Download and install a skill. Follow these steps EXACTLY. If any step fails, STOP and report the error.
SKILL_NAME="viral-content-breakdown"
DOWNLOAD_URL="https://limeai.run/skills/viral-content-breakdown/"
1. Download the Skill package.
2. Extract it into the Agent Skills directory.
3. Restart or reload the Agent so the Skill becomes available.`);

    expect(instruction).toEqual({
      skillName: "viral-content-breakdown",
      downloadUrl:
        "https://limeai.run/skill-packages/viral-content-breakdown/latest/viral-content-breakdown.zip",
      source: "assignment_prompt",
    });
  });

  it("缺少安装语义时不误拦普通消息", () => {
    expect(
      parseSkillInstallPromptInstruction(
        'SKILL_NAME="demo"\nDOWNLOAD_URL="https://example.com/demo.zip"',
      ),
    ).toBeNull();
  });
});
