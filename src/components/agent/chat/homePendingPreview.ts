import type { HandleSendOptions } from "./hooks/handleSendTypes";
import type { Message, MessageImage } from "./types";
import { buildDiagnosticsRuntimeStatusMetadata } from "./utils/agentRuntimeStatus";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import { resolveSoulInteractionCopy } from "@/lib/soul/interactionCopy";

export interface TaskCenterDraftSendRequest {
  id: string;
  draftTabId: string;
  text: string;
  images: MessageImage[];
  sendExecutionStrategy?: "react";
  sendOptions?: HandleSendOptions;
  submittedAt: number;
  materializeDraft: boolean;
  dispatchState?: "queued" | "dispatched";
  sessionReady?: boolean;
  source: "task-center-empty-state" | "empty-state";
}

export function buildHomePendingPreviewMessages(
  request: TaskCenterDraftSendRequest,
  executionStrategy: "react",
  soulCopy: SoulInteractionCopy = resolveSoulInteractionCopy(),
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
        title: soulCopy.preparingTitle,
        detail: soulCopy.preparingDetail,
        checkpoints: soulCopy.preparingCheckpoints,
        metadata: buildDiagnosticsRuntimeStatusMetadata(),
      },
    },
  ];
}
