import type { HandleSendOptions } from "./hooks/handleSendTypes";
import type { Message, MessageImage } from "./types";
import { buildDiagnosticsRuntimeStatusMetadata } from "./utils/agentRuntimeStatus";

export interface TaskCenterDraftSendRequest {
  id: string;
  draftTabId: string;
  text: string;
  images: MessageImage[];
  sendExecutionStrategy?: "react";
  sendOptions?: HandleSendOptions;
  submittedAt: number;
  materializeDraft: boolean;
  source: "task-center-empty-state" | "empty-state";
}

export function buildHomePendingPreviewMessages(
  request: TaskCenterDraftSendRequest,
  executionStrategy: "react",
): Message[] {
  const timestamp = new Date(request.submittedAt);
  void request.sendExecutionStrategy;
  void executionStrategy;
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
          "对话执行待命",
          "工具面由模型按需判断",
          "推理强度由模型按任务复杂度判断",
        ],
        metadata: buildDiagnosticsRuntimeStatusMetadata(),
      },
    },
  ];
}
