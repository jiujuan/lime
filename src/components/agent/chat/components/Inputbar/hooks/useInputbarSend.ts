import { useCallback } from "react";
import type { MessageImage, MessagePathReference } from "../../../types";
import type { InputbarKnowledgePackSelection } from "../types";
import type { InputbarSendHandler } from "../inputbarSendPayload";
import { buildKnowledgeRequestMetadata } from "@/features/knowledge/agent/knowledgeMetadata";
import { recordCuratedTaskTemplateUsage } from "../../../utils/curatedTaskTemplates";
import { buildPathReferenceRequestMetadata } from "../../../utils/pathReferences";
import {
  resolveInputCapabilityDispatch,
  type InputCapabilitySelection,
} from "../../../skill-selection/inputCapabilitySelection";

interface UseInputbarSendParams {
  input: string;
  pendingImages: MessageImage[];
  pathReferences: MessagePathReference[];
  activeCapability: InputCapabilitySelection | null;
  knowledgePackSelection?: InputbarKnowledgePackSelection | null;
  onSend: InputbarSendHandler;
  clearPendingImages: () => void;
  clearPathReferences?: () => void;
  clearActiveCapability: () => void;
}

export function useInputbarSend({
  input,
  pendingImages,
  pathReferences,
  activeCapability,
  knowledgePackSelection,
  onSend,
  clearPendingImages,
  clearPathReferences,
  clearActiveCapability,
}: UseInputbarSendParams) {
  return useCallback(async () => {
    if (
      !input.trim() &&
      pendingImages.length === 0 &&
      pathReferences.length === 0
    ) {
      return;
    }

    const capabilityDispatch = resolveInputCapabilityDispatch(
      activeCapability,
      input,
    );
    const baseRequestMetadata = buildPathReferenceRequestMetadata(
      capabilityDispatch.requestMetadata,
      pathReferences,
    );
    const requestMetadata =
      knowledgePackSelection?.enabled &&
      knowledgePackSelection.packName.trim() &&
      knowledgePackSelection.workingDir.trim()
        ? {
            ...(baseRequestMetadata || {}),
            ...buildKnowledgeRequestMetadata({
              workingDir: knowledgePackSelection.workingDir.trim(),
              packName: knowledgePackSelection.packName.trim(),
              packs: knowledgePackSelection.companionPacks,
              source: "inputbar",
            }),
          }
        : baseRequestMetadata;
    const hasPathReferences = pathReferences.length > 0;
    const textOverride = input.trim()
      ? undefined
      : hasPathReferences
        ? "请查看这些文件或文件夹。"
        : undefined;
    const sendOptions =
      capabilityDispatch.capabilityRoute ||
      capabilityDispatch.displayContent ||
      requestMetadata
        ? {
            ...(capabilityDispatch.capabilityRoute
              ? { capabilityRoute: capabilityDispatch.capabilityRoute }
              : {}),
            ...(capabilityDispatch.displayContent || input.trim()
              ? {
                  displayContent:
                    capabilityDispatch.displayContent ||
                    (input.trim() ? input : undefined),
                }
              : {}),
            ...(requestMetadata ? { requestMetadata } : {}),
          }
        : undefined;

    try {
      const result = await onSend({
        images: pendingImages.length > 0 ? pendingImages : undefined,
        textOverride,
        sendOptions,
      });
      if (result === false) {
        return;
      }
      if (activeCapability?.kind === "curated_task") {
        recordCuratedTaskTemplateUsage({
          templateId: activeCapability.task.id,
          launchInputValues: activeCapability.launchInputValues,
          referenceMemoryIds: activeCapability.referenceMemoryIds,
          referenceEntries: activeCapability.referenceEntries,
        });
      }
      clearPendingImages();
      clearPathReferences?.();
      clearActiveCapability();
    } catch {
      // 发送失败时保留图片与技能，交由上层 toast / 恢复逻辑处理。
    }
  }, [
    activeCapability,
    clearActiveCapability,
    clearPendingImages,
    clearPathReferences,
    input,
    knowledgePackSelection,
    onSend,
    pendingImages,
    pathReferences,
  ]);
}
