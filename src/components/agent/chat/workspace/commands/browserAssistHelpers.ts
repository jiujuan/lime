/**
 * 浏览器辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于浏览器辅助决策。
 *
 * @module browserAssistHelpers
 */

import type { HandleSendOptions } from "../../hooks/handleSendTypes";
import type { GeneralWorkbenchSendBoundaryState } from "../workspaceSendHelpers";
import type { AgentFastResponseRoutingDecision } from "../../utils/fastResponseRouting";

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

export function buildFastResponseAssistantDraft(
  decision: AgentFastResponseRoutingDecision,
): HandleSendOptions["assistantDraft"] {
  if (!decision.enabled) {
    return undefined;
  }

  const checkpoints = [
    "已启用短提示词快速响应",
    "仅当前轻量首轮请求生效",
    "复杂任务仍保留原模型与工具策略",
  ];

  return {
    initialRuntimeStatus: {
      phase: "routing",
      title: "快速响应已启用",
      detail: "这轮使用更短的系统提示降低首字等待。",
      checkpoints,
    },
    waitingRuntimeStatus: {
      phase: "routing",
      title: "快速响应处理中",
      detail: "已提交请求，正在等待首个模型事件。",
      checkpoints,
    },
  };
}
