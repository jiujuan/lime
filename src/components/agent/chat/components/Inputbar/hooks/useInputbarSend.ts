import { useCallback } from "react";
import type { MessageImage, MessagePathReference } from "../../../types";
import type { InputbarKnowledgePackSelection } from "../types";
import type { InputbarSendHandler } from "../inputbarSendPayload";
import {
  resolveInputbarPluginSubmissionText,
  type InputbarPluginSelection,
} from "../pluginInputCapability";
import { buildKnowledgeRequestMetadata } from "@/features/knowledge/agent/knowledgeMetadata";
import { recordCuratedTaskTemplateUsage } from "../../../utils/curatedTaskTemplates";
import { buildPathReferenceRequestMetadata } from "../../../utils/pathReferences";
import {
  resolveInputCapabilityDispatch,
  type InputCapabilitySelection,
} from "../../../skill-selection/inputCapabilitySelection";
import {
  buildInputbarModeRequestMetadata,
  buildInputbarToolPreferencesOverride,
} from "../utils/inputbarModeRequestMetadata";
import { setAgentRuntimeObjective } from "@/lib/api/agentRuntime";

interface UseInputbarSendParams {
  input: string;
  pendingImages: MessageImage[];
  pathReferences: MessagePathReference[];
  activeCapability: InputCapabilitySelection | null;
  activePluginSelection?: InputbarPluginSelection | null;
  knowledgePackSelection?: InputbarKnowledgePackSelection | null;
  activeTools?: Record<string, boolean>;
  projectId?: string | null;
  sessionId?: string | null;
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
  activePluginSelection = null,
  knowledgePackSelection,
  activeTools = {},
  projectId,
  sessionId,
  onSend,
  clearPendingImages,
  clearPathReferences,
  clearActiveCapability,
}: UseInputbarSendParams) {
  return useCallback(async () => {
    const submittedInput = resolveInputbarPluginSubmissionText({
      input,
      selection: activePluginSelection,
    });
    if (
      !submittedInput.trim() &&
      pendingImages.length === 0 &&
      pathReferences.length === 0
    ) {
      return;
    }

    const capabilityDispatch = resolveInputCapabilityDispatch(
      activeCapability,
      submittedInput,
    );
    const baseRequestMetadata = buildPathReferenceRequestMetadata(
      capabilityDispatch.requestMetadata,
      pathReferences,
    );
    const knowledgeRequestMetadata =
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
    const inputbarModeState = {
      goalEnabled: Boolean(activeTools["objective_mode"]),
      objectiveText: submittedInput,
      planEnabled: Boolean(activeTools["task_mode"]),
      source: "inputbar",
      subagentEnabled: Boolean(activeTools["subagent_mode"]),
      threadId: sessionId,
    };
    const requestMetadata = buildInputbarModeRequestMetadata(
      knowledgeRequestMetadata,
      inputbarModeState,
    );
    const toolPreferencesOverride =
      buildInputbarToolPreferencesOverride(inputbarModeState);
    const hasPathReferences = pathReferences.length > 0;
    const textOverride = submittedInput.trim()
      ? submittedInput
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
            ...(capabilityDispatch.displayContent || submittedInput.trim()
              ? {
                  displayContent:
                    capabilityDispatch.displayContent ||
                    (submittedInput.trim() ? submittedInput : undefined),
                }
              : {}),
            ...(requestMetadata ? { requestMetadata } : {}),
            ...(toolPreferencesOverride ? { toolPreferencesOverride } : {}),
          }
        : undefined;

    try {
      if (
        inputbarModeState.goalEnabled &&
        sessionId?.trim() &&
        submittedInput.trim()
      ) {
        await setAgentRuntimeObjective({
          sessionId: sessionId.trim(),
          workspaceId: projectId ?? undefined,
          objectiveText: submittedInput.trim(),
          successCriteria: [],
        });
      }
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
    activePluginSelection,
    activeTools,
    clearActiveCapability,
    clearPendingImages,
    clearPathReferences,
    input,
    knowledgePackSelection,
    projectId,
    sessionId,
    onSend,
    pendingImages,
    pathReferences,
  ]);
}
