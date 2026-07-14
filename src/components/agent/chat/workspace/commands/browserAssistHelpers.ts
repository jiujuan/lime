/**
 * 浏览器辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于浏览器辅助决策。
 *
 * @module browserAssistHelpers
 */

import type { HandleSendOptions } from "../../hooks/handleSendTypes";
import type { GeneralWorkbenchSendBoundaryState } from "../workspaceSendHelpers";

export function shouldSkipBrowserAssistPrimeForPlainFirstTurn(params: {
  activeTheme: string;
  browserRequirementMatch: GeneralWorkbenchSendBoundaryState["browserRequirementMatch"];
  hasBoundSkillLaunch: boolean;
  imagesCount: number;
  messagesCount: number;
  sendOptions?: HandleSendOptions;
  sourceText: string;
}): boolean {
  if (
    params.activeTheme !== "general" ||
    params.browserRequirementMatch ||
    params.hasBoundSkillLaunch ||
    params.messagesCount > 0 ||
    params.imagesCount > 0 ||
    params.sendOptions?.purpose ||
    params.sendOptions?.skillRequest
  ) {
    return false;
  }

  const text = params.sourceText.trim();
  return Boolean(text && !text.startsWith("/") && !text.startsWith("@"));
}
