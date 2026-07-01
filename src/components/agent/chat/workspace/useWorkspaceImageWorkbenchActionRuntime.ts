import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import type {
  CreateImageGenerationTaskArtifactRequest,
  MediaTaskArtifactOutput,
  MediaTaskLookupRequest,
} from "@/lib/api/mediaTasks";
import { generateAgentRuntimeTitleResult } from "@/lib/api/agentRuntime";
import { emitCanvasImageInsertRequest } from "@/lib/canvasImageInsertBus";
import { onImageWorkbenchTaskAction } from "@/lib/imageWorkbenchEvents";
import type { MessageImage } from "../types";
import { parseImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import {
  buildImageWorkbenchSessionTitle,
  isLocalImageWorkbenchSessionKey,
  resolveImageWorkbenchSkillRequest,
} from "./imageSkillLaunch";
import { ensureImageWorkbenchProviderSelectionCommitted } from "./imageWorkbenchProviderReadiness";
import { buildImageTaskLookupRequest } from "./imageTaskLocator";
import {
  collapseWhitespace,
  resolveImageWorkbenchApplyDispatchLabel,
  resolveImageWorkbenchActionLabel,
  resolveImageWorkbenchCoverSuccessLabel,
  type ImageWorkbenchApplyTarget,
  type SessionImageWorkbenchState,
} from "./imageWorkbenchHelpers";
import {
  matchesTaskActionContext,
  readTaskPayloadPositiveNumber,
  readTaskPayloadString,
  readTaskPayloadStringArray,
  readTaskPayloadTitleGenerationResult,
  resolvePendingImageTaskId,
  resolveReplayMode,
  resolveReplayTarget,
  resolveTaskRecordAnchorHint,
  resolveTaskRecordAnchorSectionTitle,
  resolveTaskRecordAnchorText,
  resolveTaskRecordSlotId,
  resolveTrackedTaskReplayTarget,
  resolveTrackedTaskReplayUsage,
} from "./imageWorkbenchTaskActions";

interface SaveImagesToResourceResult {
  saved: number;
  skipped: number;
  errors: string[];
}

export interface SubmitImageWorkbenchAgentCommandParams {
  rawText: string;
  displayContent?: string;
  images: MessageImage[];
  requestContext: Record<string, unknown>;
}

interface UseWorkspaceImageWorkbenchActionRuntimeParams {
  contentId?: string | null;
  createImageGenerationTask: (
    request: CreateImageGenerationTaskArtifactRequest,
  ) => Promise<MediaTaskArtifactOutput>;
  getImageTask: (
    request: MediaTaskLookupRequest,
  ) => Promise<MediaTaskArtifactOutput>;
  cancelImageTask: (request: MediaTaskLookupRequest) => Promise<unknown>;
  currentImageWorkbenchState: SessionImageWorkbenchState;
  imageWorkbenchPreferredModelId?: string;
  imageWorkbenchPreferredProviderId?: string;
  imageWorkbenchPreferredProviderUnavailable?: boolean;
  imageWorkbenchSelectedModelId?: string;
  imageWorkbenchSelectedProviderId?: string;
  imageWorkbenchSelectedSize: string;
  imageWorkbenchSessionKey: string;
  ensureImageWorkbenchProvidersLoaded?: () => void | Promise<void>;
  imageWorkbenchProvidersLoading?: boolean;
  projectId?: string | null;
  projectRootPath?: string | null;
  saveImageWorkbenchImagesToResource: (
    imageIds: string[],
    targetProjectId: string,
  ) => Promise<SaveImagesToResourceResult>;
  submitImageWorkbenchAgentCommand: (
    params: SubmitImageWorkbenchAgentCommandParams,
  ) => Promise<boolean>;
  setCanvasState: Dispatch<SetStateAction<CanvasStateUnion | null>>;
  setInput: Dispatch<SetStateAction<string>>;
  updateCurrentImageWorkbenchState: (
    updater: (
      current: SessionImageWorkbenchState,
    ) => SessionImageWorkbenchState,
  ) => void;
}

export function useWorkspaceImageWorkbenchActionRuntime({
  cancelImageTask,
  contentId,
  createImageGenerationTask,
  ensureImageWorkbenchProvidersLoaded,
  getImageTask,
  currentImageWorkbenchState,
  imageWorkbenchPreferredModelId,
  imageWorkbenchPreferredProviderId,
  imageWorkbenchPreferredProviderUnavailable,
  imageWorkbenchProvidersLoading,
  imageWorkbenchSelectedModelId,
  imageWorkbenchSelectedProviderId,
  imageWorkbenchSelectedSize,
  imageWorkbenchSessionKey,
  projectId,
  projectRootPath,
  saveImageWorkbenchImagesToResource,
  submitImageWorkbenchAgentCommand,
  setCanvasState,
  setInput,
  updateCurrentImageWorkbenchState,
}: UseWorkspaceImageWorkbenchActionRuntimeParams) {
  const { t } = useTranslation("agent");
  const imageWorkbenchRequestProviderId = useMemo(() => {
    const selectedProviderId = imageWorkbenchSelectedProviderId?.trim();
    if (selectedProviderId) {
      return selectedProviderId;
    }

    if (imageWorkbenchPreferredProviderUnavailable) {
      return undefined;
    }

    const preferredProviderId = imageWorkbenchPreferredProviderId?.trim();
    return preferredProviderId || undefined;
  }, [
    imageWorkbenchPreferredProviderId,
    imageWorkbenchPreferredProviderUnavailable,
    imageWorkbenchSelectedProviderId,
  ]);

  const imageWorkbenchRequestModelId = useMemo(() => {
    const selectedModelId = imageWorkbenchSelectedModelId?.trim();
    if (selectedModelId) {
      return selectedModelId;
    }

    const preferredModelId = imageWorkbenchPreferredModelId?.trim();
    if (!preferredModelId) {
      return undefined;
    }

    const preferredProviderId = imageWorkbenchPreferredProviderId?.trim();
    if (
      !preferredProviderId ||
      preferredProviderId === imageWorkbenchRequestProviderId
    ) {
      return preferredModelId;
    }

    return undefined;
  }, [
    imageWorkbenchPreferredModelId,
    imageWorkbenchPreferredProviderId,
    imageWorkbenchRequestProviderId,
    imageWorkbenchSelectedModelId,
  ]);
  const imageWorkbenchSelectionRef = useRef({
    preferredProviderUnavailable: Boolean(
      imageWorkbenchPreferredProviderUnavailable,
    ),
    providersLoading: Boolean(imageWorkbenchProvidersLoading),
    requestModelId: imageWorkbenchRequestModelId,
    requestProviderId: imageWorkbenchRequestProviderId,
  });
  useEffect(() => {
    imageWorkbenchSelectionRef.current = {
      preferredProviderUnavailable: Boolean(
        imageWorkbenchPreferredProviderUnavailable,
      ),
      providersLoading: Boolean(imageWorkbenchProvidersLoading),
      requestModelId: imageWorkbenchRequestModelId,
      requestProviderId: imageWorkbenchRequestProviderId,
    };
  }, [
    imageWorkbenchPreferredProviderUnavailable,
    imageWorkbenchProvidersLoading,
    imageWorkbenchRequestModelId,
    imageWorkbenchRequestProviderId,
  ]);

  const resolveImageGenerationSelectionError = useCallback(() => {
    const selection = imageWorkbenchSelectionRef.current;
    if (selection.providersLoading) {
      return t("agentChat.imageWorkbench.selection.loading");
    }

    if (selection.preferredProviderUnavailable) {
      return t("agentChat.imageWorkbench.selection.preferredUnavailable");
    }

    if (!selection.requestProviderId || !selection.requestModelId) {
      return t("agentChat.imageWorkbench.selection.missing");
    }

    return null;
  }, [t]);

  const resolveImageWorkbenchSessionKey = useCallback(
    async (params: { preferredSessionKey?: string | null }) => {
      const normalizedPreferredSessionKey =
        params.preferredSessionKey?.trim() || null;
      if (normalizedPreferredSessionKey) {
        return normalizedPreferredSessionKey;
      }

      return imageWorkbenchSessionKey.trim() || null;
    },
    [imageWorkbenchSessionKey],
  );

  const handleImageWorkbenchViewportChange = useCallback(
    (viewport: SessionImageWorkbenchState["viewport"]) => {
      updateCurrentImageWorkbenchState((current) => ({
        ...current,
        active: true,
        viewport,
      }));
    },
    [updateCurrentImageWorkbenchState],
  );

  const handleSelectImageWorkbenchOutput = useCallback(
    (outputId: string) => {
      updateCurrentImageWorkbenchState((current) => {
        const selectedOutput =
          current.outputs.find((output) => output.id === outputId) ?? null;
        return {
          ...current,
          active: true,
          selectedTaskId:
            selectedOutput?.taskId ?? current.selectedTaskId ?? null,
          selectedOutputId: outputId,
        };
      });
    },
    [updateCurrentImageWorkbenchState],
  );

  const handleSeedImageWorkbenchFollowUp = useCallback(
    (command: string) => {
      setInput(command);
      toast.info(t("agentChat.imageWorkbenchAction.toast.seedCommand"));
    },
    [setInput, t],
  );

  const handleRetryImageWorkbenchTask = useCallback(
    async (taskId: string) => {
      const normalizedTaskId = taskId.trim();
      const normalizedProjectRootPath = projectRootPath?.trim();
      const trackedTask = currentImageWorkbenchState.tasks.find(
        (task) => task.id === normalizedTaskId,
      );
      const replayTrackedTaskDirectly = async () => {
        const prompt =
          trackedTask?.prompt.trim() || trackedTask?.rawText.trim() || "";
        if (!prompt) {
          toast.error(
            t("agentChat.imageWorkbenchAction.toast.retry.missingPrompt"),
          );
          return false;
        }

        await createImageGenerationTask({
          projectRootPath: normalizedProjectRootPath!,
          prompt,
          title: prompt,
          titleGenerationResult: undefined,
          mode: resolveReplayMode(trackedTask?.mode),
          rawText: trackedTask?.rawText.trim() || prompt,
          layoutHint: trackedTask?.layoutHint || undefined,
          size: imageWorkbenchSelectedSize,
          aspectRatio: undefined,
          count: trackedTask?.expectedCount || 1,
          usage: resolveTrackedTaskReplayUsage(trackedTask),
          slotId:
            trackedTask?.applyTarget?.kind === "canvas-insert"
              ? trackedTask.applyTarget.slotId || undefined
              : undefined,
          anchorHint:
            trackedTask?.applyTarget?.kind === "canvas-insert"
              ? trackedTask.applyTarget.anchorHint
              : undefined,
          anchorSectionTitle:
            trackedTask?.applyTarget?.kind === "canvas-insert"
              ? trackedTask.applyTarget.sectionTitle || undefined
              : undefined,
          anchorText:
            trackedTask?.applyTarget?.kind === "canvas-insert"
              ? trackedTask.applyTarget.anchorText || undefined
              : undefined,
          style: undefined,
          providerId: imageWorkbenchSelectedProviderId || undefined,
          model: imageWorkbenchSelectedModelId || undefined,
          sessionId: imageWorkbenchSessionKey,
          projectId: projectId || undefined,
          contentId: contentId || undefined,
          entrySource: "image_workbench_retry",
          requestedTarget: resolveTrackedTaskReplayTarget(trackedTask),
          targetOutputId: trackedTask?.targetOutputId || undefined,
          targetOutputRefId: trackedTask?.targetOutputRefId || undefined,
          referenceImages: [],
        });
        toast.success(t("agentChat.imageWorkbenchAction.toast.retry.success"));
        return true;
      };
      if (!normalizedTaskId) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.retry.missingTaskId"),
        );
        return false;
      }
      if (!normalizedProjectRootPath) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.retry.projectNotReady"),
        );
        return false;
      }

      try {
        const originalTaskLookup = buildImageTaskLookupRequest({
          taskId: normalizedTaskId,
          taskFilePath: trackedTask?.taskFilePath,
          artifactPath: trackedTask?.artifactPath,
          projectRootPath: normalizedProjectRootPath,
        });
        if (!originalTaskLookup) {
          toast.error(
            t("agentChat.imageWorkbenchAction.toast.retry.missingTaskFile"),
          );
          return false;
        }

        let originalTask: Awaited<ReturnType<typeof getImageTask>>;
        try {
          originalTask = await getImageTask(originalTaskLookup);
        } catch (error) {
          if (!trackedTask?.taskFilePath && !trackedTask?.artifactPath) {
            return await replayTrackedTaskDirectly();
          }
          throw error;
        }
        const payload =
          originalTask.record?.payload &&
          typeof originalTask.record.payload === "object" &&
          !Array.isArray(originalTask.record.payload)
            ? (originalTask.record.payload as Record<string, unknown>)
            : null;
        if (!payload) {
          toast.error(
            t("agentChat.imageWorkbenchAction.toast.retry.missingTaskContext"),
          );
          return false;
        }
        const prompt =
          readTaskPayloadString(payload, ["prompt"]) || trackedTask?.prompt;
        if (!prompt?.trim()) {
          toast.error(
            t("agentChat.imageWorkbenchAction.toast.retry.missingPrompt"),
          );
          return false;
        }

        const requestedTarget = resolveReplayTarget(
          payload.requested_target ?? payload.requestedTarget,
        );
        const slotId = resolveTaskRecordSlotId(originalTask.record);
        const anchorHint = resolveTaskRecordAnchorHint(originalTask.record);
        const anchorSectionTitle = resolveTaskRecordAnchorSectionTitle(
          originalTask.record,
        );
        const anchorText = resolveTaskRecordAnchorText(originalTask.record);
        const titleGenerationResult =
          readTaskPayloadTitleGenerationResult(payload);

        await createImageGenerationTask({
          projectRootPath: originalTaskLookup.projectRootPath,
          prompt,
          title:
            readTaskPayloadString(payload, ["title"]) ||
            originalTask.record.title?.trim() ||
            titleGenerationResult?.title ||
            prompt,
          titleGenerationResult,
          mode: resolveReplayMode(payload.mode ?? payload.task_mode),
          rawText:
            readTaskPayloadString(payload, ["raw_text", "rawText"]) || prompt,
          layoutHint: readTaskPayloadString(payload, [
            "layout_hint",
            "layoutHint",
          ]),
          size:
            readTaskPayloadString(payload, ["size"]) ||
            imageWorkbenchSelectedSize,
          aspectRatio: readTaskPayloadString(payload, [
            "aspect_ratio",
            "aspectRatio",
          ]),
          count:
            readTaskPayloadPositiveNumber(payload, ["count", "image_count"]) ||
            trackedTask?.expectedCount ||
            1,
          usage:
            readTaskPayloadString(payload, ["usage"]) ||
            (requestedTarget === "cover" ? "cover" : "claw-image-workbench"),
          slotId,
          anchorHint,
          anchorSectionTitle,
          anchorText,
          style: readTaskPayloadString(payload, ["style"]),
          providerId:
            readTaskPayloadString(payload, ["provider_id", "providerId"]) ||
            imageWorkbenchSelectedProviderId,
          model:
            readTaskPayloadString(payload, ["model"]) ||
            imageWorkbenchSelectedModelId,
          sessionId:
            readTaskPayloadString(payload, ["session_id", "sessionId"]) ||
            imageWorkbenchSessionKey,
          projectId:
            readTaskPayloadString(payload, ["project_id", "projectId"]) ||
            projectId ||
            undefined,
          contentId:
            readTaskPayloadString(payload, ["content_id", "contentId"]) ||
            contentId ||
            undefined,
          entrySource:
            readTaskPayloadString(payload, ["entry_source", "entrySource"]) ||
            "image_workbench_retry",
          requestedTarget,
          targetOutputId: readTaskPayloadString(payload, [
            "target_output_id",
            "targetOutputId",
          ]),
          targetOutputRefId: readTaskPayloadString(payload, [
            "target_output_ref_id",
            "targetOutputRefId",
          ]),
          referenceImages: readTaskPayloadStringArray(payload, [
            "reference_images",
            "referenceImages",
          ]),
        });
        toast.success(t("agentChat.imageWorkbenchAction.toast.retry.success"));
        return true;
      } catch {
        toast.error(t("agentChat.imageWorkbenchAction.toast.retry.failed"));
        return false;
      }
    },
    [
      contentId,
      createImageGenerationTask,
      currentImageWorkbenchState.tasks,
      getImageTask,
      imageWorkbenchSelectedModelId,
      imageWorkbenchSelectedProviderId,
      imageWorkbenchSelectedSize,
      imageWorkbenchSessionKey,
      projectId,
      projectRootPath,
      t,
    ],
  );

  const handleCancelImageWorkbenchTask = useCallback(
    async (taskId: string) => {
      const normalizedTaskId = taskId.trim();
      const normalizedProjectRootPath = projectRootPath?.trim();
      if (!normalizedTaskId) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.cancel.missingTaskId"),
        );
        return false;
      }
      if (!normalizedProjectRootPath) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.cancel.projectNotReady"),
        );
        return false;
      }

      try {
        const trackedTask = currentImageWorkbenchState.tasks.find(
          (task) => task.id === normalizedTaskId,
        );
        const cancelRequest = buildImageTaskLookupRequest({
          taskId: normalizedTaskId,
          taskFilePath: trackedTask?.taskFilePath,
          artifactPath: trackedTask?.artifactPath,
          projectRootPath: normalizedProjectRootPath,
        });
        if (!cancelRequest) {
          toast.error(
            t("agentChat.imageWorkbenchAction.toast.cancel.missingTaskFile"),
          );
          return false;
        }

        await cancelImageTask(cancelRequest);
        toast.success(t("agentChat.imageWorkbenchAction.toast.cancel.success"));
        return true;
      } catch {
        toast.error(t("agentChat.imageWorkbenchAction.toast.cancel.failed"));
        return false;
      }
    },
    [cancelImageTask, currentImageWorkbenchState.tasks, projectRootPath, t],
  );

  const handleStopImageWorkbenchGeneration = useCallback(async () => {
    const pendingTaskId = resolvePendingImageTaskId(
      currentImageWorkbenchState.tasks,
    );
    if (!pendingTaskId) {
      toast.info(t("agentChat.imageWorkbenchAction.toast.cancel.none"));
      return false;
    }

    return handleCancelImageWorkbenchTask(pendingTaskId);
  }, [currentImageWorkbenchState.tasks, handleCancelImageWorkbenchTask, t]);

  useEffect(() => {
    return onImageWorkbenchTaskAction((detail) => {
      if (
        !matchesTaskActionContext({
          detailProjectId: detail.projectId,
          detailContentId: detail.contentId,
          projectId,
          contentId,
        })
      ) {
        return;
      }

      if (detail.action === "retry") {
        void handleRetryImageWorkbenchTask(detail.taskId);
        return;
      }

      void handleCancelImageWorkbenchTask(detail.taskId);
    });
  }, [
    contentId,
    handleCancelImageWorkbenchTask,
    handleRetryImageWorkbenchTask,
    projectId,
  ]);

  const handleSaveSelectedImageWorkbenchOutput = useCallback(async () => {
    const selectedOutput = currentImageWorkbenchState.outputs.find(
      (item) => item.id === currentImageWorkbenchState.selectedOutputId,
    );
    if (!selectedOutput) {
      toast.info(t("agentChat.imageWorkbenchAction.toast.output.selectImage"));
      return;
    }
    if (!projectId) {
      toast.error(
        t("agentChat.imageWorkbenchAction.toast.resource.missingProject"),
      );
      return;
    }

    const result = await saveImageWorkbenchImagesToResource(
      [selectedOutput.hookImageId],
      projectId,
    );
    if (result.saved > 0) {
      updateCurrentImageWorkbenchState((current) => ({
        ...current,
        outputs: current.outputs.map((item) =>
          item.id === selectedOutput.id
            ? { ...item, resourceSaved: true }
            : item,
        ),
      }));
      toast.success(t("agentChat.imageWorkbenchAction.toast.resource.success"));
      return;
    }

    if (result.skipped > 0) {
      toast.info(t("agentChat.imageWorkbenchAction.toast.resource.duplicate"));
      return;
    }

    toast.error(t("agentChat.imageWorkbenchAction.toast.resource.failed"));
  }, [
    currentImageWorkbenchState.outputs,
    currentImageWorkbenchState.selectedOutputId,
    projectId,
    saveImageWorkbenchImagesToResource,
    t,
    updateCurrentImageWorkbenchState,
  ]);

  const handleApplySelectedImageWorkbenchOutput = useCallback(() => {
    const selectedOutput = currentImageWorkbenchState.outputs.find(
      (item) => item.id === currentImageWorkbenchState.selectedOutputId,
    );
    if (!selectedOutput) {
      toast.info(t("agentChat.imageWorkbenchAction.toast.output.selectImage"));
      return;
    }

    const applyTarget = selectedOutput.applyTarget;
    if (!applyTarget) {
      toast.info(t("agentChat.imageWorkbenchAction.toast.apply.missingTarget"));
      return;
    }

    if (applyTarget.kind === "document-cover") {
      let replaced = false;
      setCanvasState((previous) => {
        if (!previous || previous.type !== "document") {
          return previous;
        }

        const updatedContent = previous.content
          .split(applyTarget.placeholder)
          .join(selectedOutput.url);
        if (updatedContent === previous.content) {
          return previous;
        }

        replaced = true;
        return {
          ...previous,
          content: updatedContent,
        };
      });

      if (!replaced) {
        toast.error(
          t(
            "agentChat.imageWorkbenchAction.toast.apply.coverPlaceholderMissing",
          ),
        );
        return;
      }

      updateCurrentImageWorkbenchState((current) => ({
        ...current,
        active: false,
      }));
      toast.success(resolveImageWorkbenchCoverSuccessLabel(applyTarget));
      return;
    }

    emitCanvasImageInsertRequest({
      projectId: applyTarget.projectId ?? projectId ?? null,
      contentId: applyTarget.contentId ?? contentId ?? null,
      canvasType: applyTarget.canvasType,
      anchorHint: applyTarget.anchorHint,
      taskId: selectedOutput.taskId,
      slotId: applyTarget.slotId ?? selectedOutput.slotId ?? null,
      sectionTitle: applyTarget.sectionTitle ?? null,
      anchorText: applyTarget.anchorText ?? null,
      source: "manual",
      image: {
        id: selectedOutput.id,
        previewUrl: selectedOutput.url,
        contentUrl: selectedOutput.url,
        title:
          collapseWhitespace(selectedOutput.prompt) || selectedOutput.refId,
        provider: selectedOutput.providerName,
      },
    });

    updateCurrentImageWorkbenchState((current) => ({
      ...current,
      active: false,
    }));
    toast.info(resolveImageWorkbenchApplyDispatchLabel(applyTarget));
  }, [
    contentId,
    currentImageWorkbenchState.outputs,
    currentImageWorkbenchState.selectedOutputId,
    projectId,
    setCanvasState,
    t,
    updateCurrentImageWorkbenchState,
  ]);

  const imageWorkbenchPrimaryActionLabel = useMemo(() => {
    const selectedOutput = currentImageWorkbenchState.outputs.find(
      (item) => item.id === currentImageWorkbenchState.selectedOutputId,
    );
    return resolveImageWorkbenchActionLabel(selectedOutput?.applyTarget);
  }, [
    currentImageWorkbenchState.outputs,
    currentImageWorkbenchState.selectedOutputId,
  ]);

  const handleImageWorkbenchCommand = useCallback(
    async (params: {
      rawText: string;
      parsedCommand: NonNullable<ReturnType<typeof parseImageWorkbenchCommand>>;
      images: MessageImage[];
      applyTarget?: ImageWorkbenchApplyTarget | null;
    }): Promise<boolean> => {
      if (!projectId) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.command.missingProject"),
        );
        return false;
      }
      if (!projectRootPath?.trim()) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.command.projectNotReady"),
        );
        return false;
      }

      const effectivePrompt =
        params.parsedCommand.prompt.trim() ||
        (params.parsedCommand.mode === "generate"
          ? ""
          : t("agentChat.imageWorkbenchAction.prompt.referenceRefinement"));
      if (!effectivePrompt) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.command.missingPrompt"),
        );
        return false;
      }

      await ensureImageWorkbenchProviderSelectionCommitted(
        ensureImageWorkbenchProvidersLoaded,
        () => {
          const selection = imageWorkbenchSelectionRef.current;
          return Boolean(
            selection.requestProviderId && selection.requestModelId,
          );
        },
      );
      const imageGenerationSelectionError =
        resolveImageGenerationSelectionError();
      if (imageGenerationSelectionError) {
        toast.error(imageGenerationSelectionError);
        return false;
      }

      const resolvedSessionKey = await resolveImageWorkbenchSessionKey({});
      const titlePreviewText =
        params.parsedCommand.mode === "generate"
          ? effectivePrompt
          : t("agentChat.imageWorkbenchAction.title.modePrefix", {
              mode:
                params.parsedCommand.mode === "edit"
                  ? t("agentChat.imageWorkbenchAction.title.edit")
                  : t("agentChat.imageWorkbenchAction.title.variation"),
              prompt: effectivePrompt,
            });
      const titleGenerationResult = await generateAgentRuntimeTitleResult({
        sessionId:
          resolvedSessionKey &&
          !isLocalImageWorkbenchSessionKey(resolvedSessionKey)
            ? resolvedSessionKey
            : undefined,
        previewText: titlePreviewText,
        titleKind: "image_task",
      }).catch(() => null);
      const resolvedTaskTitle =
        titleGenerationResult?.title ||
        buildImageWorkbenchSessionTitle(
          params.parsedCommand.mode,
          effectivePrompt,
        );

      const skillRequest = resolveImageWorkbenchSkillRequest({
        rawText: params.rawText,
        parsedCommand: params.parsedCommand,
        images: params.images,
        title: resolvedTaskTitle,
        titleGenerationResult,
        currentImageWorkbenchState,
        imageWorkbenchSelectedModelId:
          imageWorkbenchSelectionRef.current.requestModelId,
        imageWorkbenchSelectedProviderId:
          imageWorkbenchSelectionRef.current.requestProviderId,
        imageWorkbenchSelectedSize,
        imageWorkbenchSessionKey,
        sessionIdOverride: resolvedSessionKey,
        projectId,
        projectRootPath,
        contentId,
        applyTarget: params.applyTarget,
        requireProjectContext: true,
        entrySource: params.applyTarget
          ? "image_workbench_action"
          : "at_image_command",
      });
      if (!skillRequest) {
        return false;
      }

      return submitImageWorkbenchAgentCommand({
        rawText: params.rawText,
        displayContent: params.rawText,
        images: skillRequest.images,
        requestContext: skillRequest.requestContext,
      });
    },
    [
      contentId,
      currentImageWorkbenchState,
      ensureImageWorkbenchProvidersLoaded,
      imageWorkbenchSelectedSize,
      imageWorkbenchSessionKey,
      projectId,
      projectRootPath,
      resolveImageWorkbenchSessionKey,
      resolveImageGenerationSelectionError,
      submitImageWorkbenchAgentCommand,
      t,
    ],
  );

  return {
    handleApplySelectedImageWorkbenchOutput,
    handleCancelImageWorkbenchTask,
    handleImageWorkbenchCommand,
    handleImageWorkbenchViewportChange,
    handleRetryImageWorkbenchTask,
    handleSaveSelectedImageWorkbenchOutput,
    handleSeedImageWorkbenchFollowUp,
    handleSelectImageWorkbenchOutput,
    handleStopImageWorkbenchGeneration,
    imageWorkbenchPrimaryActionLabel,
    resolveImageWorkbenchSkillRequest: (params: {
      rawText: string;
      parsedCommand: NonNullable<ReturnType<typeof parseImageWorkbenchCommand>>;
      images: MessageImage[];
      sessionIdOverride?: string | null;
      applyTarget?: ImageWorkbenchApplyTarget | null;
      entrySource?: string;
    }) =>
      resolveImageWorkbenchSkillRequest({
        ...params,
        currentImageWorkbenchState,
        imageWorkbenchSelectedModelId:
          imageWorkbenchSelectionRef.current.requestModelId,
        imageWorkbenchSelectedProviderId:
          imageWorkbenchSelectionRef.current.requestProviderId,
        imageWorkbenchSelectedSize,
        imageWorkbenchSessionKey,
        projectId,
        projectRootPath,
        contentId,
        requireProjectContext: params.applyTarget != null,
      }),
  };
}
