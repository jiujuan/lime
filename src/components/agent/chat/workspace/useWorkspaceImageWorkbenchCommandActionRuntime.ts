import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { generateAgentRuntimeTitleResult } from "@/lib/api/agentRuntime/agentClient";
import type { MessageImage } from "../types";
import type { ParsedImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import type {
  ImageWorkbenchCommandActionParams,
  SubmitImageWorkbenchAgentCommandParams,
} from "./imageWorkbenchAgentCommand";
import {
  buildImageWorkbenchSessionTitle,
  isLocalImageWorkbenchSessionKey,
  resolveImageWorkbenchCommandRequest,
  type ImageWorkbenchCommandRequest,
} from "./imageCommandIntent";
import { ensureImageWorkbenchProviderSelectionCommitted } from "./imageWorkbenchProviderReadiness";
import type {
  ImageWorkbenchApplyTarget,
  SessionImageWorkbenchState,
} from "./imageWorkbenchHelpers";

interface UseWorkspaceImageWorkbenchCommandActionRuntimeParams {
  contentId?: string | null;
  currentImageWorkbenchState: SessionImageWorkbenchState;
  ensureImageWorkbenchProvidersLoaded?: () => void | Promise<void>;
  imageWorkbenchPreferredModelId?: string;
  imageWorkbenchPreferredProviderId?: string;
  imageWorkbenchPreferredProviderUnavailable?: boolean;
  imageWorkbenchSelectedModelId?: string;
  imageWorkbenchSelectedProviderId?: string;
  imageWorkbenchSelectedSize: string;
  imageWorkbenchSessionKey: string;
  imageWorkbenchProvidersLoading?: boolean;
  projectId?: string | null;
  projectRootPath?: string | null;
  submitImageWorkbenchAgentCommand: (
    params: SubmitImageWorkbenchAgentCommandParams,
  ) => Promise<boolean>;
}

interface ResolveImageWorkbenchCommandActionRequestParams {
  rawText: string;
  parsedCommand: ParsedImageWorkbenchCommand;
  images: MessageImage[];
  sessionIdOverride?: string | null;
  applyTarget?: ImageWorkbenchApplyTarget | null;
  entrySource?: string;
  projectId?: string | null;
  projectRootPath?: string | null;
}

export function useWorkspaceImageWorkbenchCommandActionRuntime({
  contentId,
  currentImageWorkbenchState,
  ensureImageWorkbenchProvidersLoaded,
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
  submitImageWorkbenchAgentCommand,
}: UseWorkspaceImageWorkbenchCommandActionRuntimeParams) {
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

  const resolveImageWorkbenchCommandActionRequest = useCallback(
    ({
      applyTarget,
      images,
      parsedCommand,
      projectId: requestProjectId,
      projectRootPath: requestProjectRootPath,
      rawText,
      sessionIdOverride,
      entrySource,
    }: ResolveImageWorkbenchCommandActionRequestParams): ImageWorkbenchCommandRequest | null =>
      resolveImageWorkbenchCommandRequest({
        rawText,
        parsedCommand,
        images,
        currentImageWorkbenchState,
        imageWorkbenchSelectedModelId:
          imageWorkbenchSelectionRef.current.requestModelId,
        imageWorkbenchSelectedProviderId:
          imageWorkbenchSelectionRef.current.requestProviderId,
        imageWorkbenchSelectedSize,
        imageWorkbenchSessionKey,
        sessionIdOverride,
        projectId: requestProjectId ?? projectId,
        projectRootPath: requestProjectRootPath ?? projectRootPath,
        contentId,
        applyTarget,
        entrySource,
        requireProjectContext: applyTarget != null,
      }),
    [
      contentId,
      currentImageWorkbenchState,
      imageWorkbenchSelectedSize,
      imageWorkbenchSessionKey,
      projectId,
      projectRootPath,
    ],
  );

  const handleImageWorkbenchCommand = useCallback(
    async (params: ImageWorkbenchCommandActionParams): Promise<boolean> => {
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

      const skillRequest = resolveImageWorkbenchCommandRequest({
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
      resolveImageGenerationSelectionError,
      resolveImageWorkbenchSessionKey,
      submitImageWorkbenchAgentCommand,
      t,
    ],
  );

  return {
    handleImageWorkbenchCommand,
    resolveImageWorkbenchCommandRequest:
      resolveImageWorkbenchCommandActionRequest,
  };
}
