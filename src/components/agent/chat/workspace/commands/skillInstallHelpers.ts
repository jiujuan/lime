/**
 * 技能安装辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 用于处理技能安装提示确认。
 *
 * @module skillInstallHelpers
 */

import {
  installSkillFromPromptInstruction,
  type SkillInstallPromptInstruction,
} from "@/lib/skills/skillInstallPrompt";

type AgentWorkspaceTranslator = (key: string, params?: Record<string, unknown>) => string;

export async function resolveSkillInstallPromptConfirmation(
  instruction: SkillInstallPromptInstruction,
  translate: AgentWorkspaceTranslator,
): Promise<string> {
  try {
    const result = await installSkillFromPromptInstruction(instruction, "lime");
    return translate("agentChat.skillInstallPrompt.installedConfirmation", {
      skill: result.directory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|已存在/i.test(message)) {
      return translate(
        "agentChat.skillInstallPrompt.alreadyInstalledConfirmation",
        {
          skill: instruction.skillName,
        },
      );
    }
    return translate("agentChat.skillInstallPrompt.failedConfirmation", {
      skill: instruction.skillName,
      error: message,
    });
  }
}
