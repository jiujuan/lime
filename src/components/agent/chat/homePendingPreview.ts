import type { HandleSendOptions } from "./hooks/handleSendTypes";
import type { Message, MessageImage } from "./types";
import { buildDiagnosticsRuntimeStatusMetadata } from "./utils/agentRuntimeStatus";

export interface TaskCenterDraftSendRequest {
  id: string;
  draftTabId: string;
  text: string;
  images: MessageImage[];
  sendExecutionStrategy?: "react" | "code_orchestrated" | "auto";
  sendOptions?: HandleSendOptions;
  webSearch: boolean;
  thinking: boolean;
  submittedAt: number;
  materializeDraft: boolean;
  source: "task-center-empty-state" | "empty-state";
}

export function buildHomePendingPreviewMessages(
  request: TaskCenterDraftSendRequest,
  executionStrategy: "react" | "code_orchestrated" | "auto",
): Message[] {
  const timestamp = new Date(request.submittedAt);
  const effectiveExecutionStrategy =
    request.sendExecutionStrategy || executionStrategy;
  const displayContent =
    request.sendOptions?.displayContent?.trim() || request.text;

  return [
    {
      id: `${request.id}:user`,
      role: "user",
      content: displayContent,
      images: request.images.length > 0 ? request.images : undefined,
      timestamp,
      inputCapabilityRoute: request.sendOptions?.capabilityRoute,
    },
    {
      id: `${request.id}:assistant`,
      role: "assistant",
      content: "",
      timestamp,
      isThinking: true,
      runtimeStatus: {
        phase: "preparing",
        title: "正在进入对话",
        detail: "已收到输入，正在后台准备会话和执行环境。",
        checkpoints: [
          effectiveExecutionStrategy === "code_orchestrated"
            ? "代码编排待命"
            : effectiveExecutionStrategy === "react"
              ? "对话执行待命"
              : "自动路由待命",
          request.webSearch ? "联网搜索候选能力待命" : "直接回答优先",
          request.thinking ? "深度思考待命" : "轻量响应优先",
        ],
        metadata: buildDiagnosticsRuntimeStatusMetadata(),
      },
    },
  ];
}
