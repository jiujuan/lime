/** 解析 /skill-name args 命令 */
export interface ParsedSkillCommand {
  skillName: string;
  userInput: string;
}

/**
 * 解析 slash skill 命令。
 *
 * 格式：`/skill-name` 或 `/skill-name args...`。
 * 这里只保留解析能力；Skill 执行必须走 Agent Runtime turn / SkillTool current 主链。
 */
export function parseSkillSlashCommand(
  content: string,
): ParsedSkillCommand | null {
  const skillMatch = content.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!skillMatch) {
    return null;
  }

  const [, skillName, userInput] = skillMatch;
  return {
    skillName,
    userInput: userInput?.trim() || "",
  };
}
