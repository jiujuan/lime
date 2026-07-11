import { useMemo, useState } from "react";
import { useGlobalMediaGenerationDefaults } from "@/hooks/useGlobalMediaGenerationDefaults";
import { useImageGen } from "@/components/image-gen/useImageGen";
import {
  resolveMediaGenerationPreference,
  type MediaGenerationDefaults,
} from "@/lib/mediaGeneration";
import type { WorkspaceMediaGenerationSettings } from "@/types/workspace";
import { resolveImageWorkbenchPreferenceViewModel } from "./imageWorkbenchPreference";

interface UseWorkspaceImageWorkbenchProviderRuntimeParams {
  contentId?: string | null;
  deferredWorkspaceAuxiliaryLoadMs?: number;
  initialSessionId?: string | null;
  projectImageGenerationPreference?: WorkspaceMediaGenerationSettings | null;
  selectionProjectId?: string | null;
  shouldDeferWorkspaceAuxiliaryLoads: boolean;
}

export function useWorkspaceImageWorkbenchProviderRuntime({
  contentId,
  deferredWorkspaceAuxiliaryLoadMs,
  initialSessionId,
  projectImageGenerationPreference,
  selectionProjectId,
  shouldDeferWorkspaceAuxiliaryLoads,
}: UseWorkspaceImageWorkbenchProviderRuntimeParams) {
  const { mediaDefaults, loading: mediaDefaultsLoading } =
    useGlobalMediaGenerationDefaults({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
    });
  const [onDemandMediaDefaults, setOnDemandMediaDefaults] =
    useState<MediaGenerationDefaults>({});

  const effectiveGlobalImagePreference = shouldDeferWorkspaceAuxiliaryLoads
    ? (onDemandMediaDefaults.image ?? mediaDefaults.image)
    : (mediaDefaults.image ?? onDemandMediaDefaults.image);
  const effectiveImageWorkbenchPreference = useMemo(
    () =>
      resolveMediaGenerationPreference(
        projectImageGenerationPreference,
        effectiveGlobalImagePreference,
      ),
    [effectiveGlobalImagePreference, projectImageGenerationPreference],
  );

  const imageWorkbenchGenerationRuntime = useImageGen({
    preferredProviderId: effectiveImageWorkbenchPreference.preferredProviderId,
    preferredModelId: effectiveImageWorkbenchPreference.preferredModelId,
    allowFallback: effectiveImageWorkbenchPreference.allowFallback,
    providerLoadEnabled: !shouldDeferWorkspaceAuxiliaryLoads,
    providerLoadMode: shouldDeferWorkspaceAuxiliaryLoads
      ? "deferred"
      : "immediate",
    providerDeferredDelayMs: deferredWorkspaceAuxiliaryLoadMs,
    selectionScopeKey: `${selectionProjectId ?? "no-project"}:${initialSessionId ?? "no-session"}:${contentId ?? "no-content"}`,
  });

  const imageWorkbenchPreferenceViewModel = useMemo(
    () =>
      resolveImageWorkbenchPreferenceViewModel({
        preference: effectiveImageWorkbenchPreference,
        selectedProvider: imageWorkbenchGenerationRuntime.selectedProvider,
        selectedProviderId: imageWorkbenchGenerationRuntime.selectedProviderId,
        selectedModel: imageWorkbenchGenerationRuntime.selectedModel,
        selectedModelId: imageWorkbenchGenerationRuntime.selectedModelId,
        preferredProviderUnavailable:
          imageWorkbenchGenerationRuntime.preferredProviderUnavailable,
        mediaDefaultsLoading,
        providersLoading: imageWorkbenchGenerationRuntime.providersLoading,
      }),
    [
      effectiveImageWorkbenchPreference,
      imageWorkbenchGenerationRuntime.preferredProviderUnavailable,
      imageWorkbenchGenerationRuntime.providersLoading,
      imageWorkbenchGenerationRuntime.selectedModel,
      imageWorkbenchGenerationRuntime.selectedModelId,
      imageWorkbenchGenerationRuntime.selectedProvider,
      imageWorkbenchGenerationRuntime.selectedProviderId,
      mediaDefaultsLoading,
    ],
  );

  return {
    effectiveImageWorkbenchPreference,
    imageGenerationSelectionReady:
      imageWorkbenchPreferenceViewModel.selectionReady,
    imageGenerationSelectionWarning:
      imageWorkbenchPreferenceViewModel.selectionWarning,
    imageWorkbenchGenerationRuntime,
    imageWorkbenchPreferenceSummary:
      imageWorkbenchPreferenceViewModel.preferenceSummary,
    imageWorkbenchPreferenceWarning:
      imageWorkbenchPreferenceViewModel.preferenceWarning,
    setOnDemandMediaDefaults,
  };
}
