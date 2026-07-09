import { resolveImageCapabilityModels } from "@/lib/imageGen/catalog";
import type { ResolvedMediaGenerationPreference } from "@/lib/mediaGeneration";

export interface ImageWorkbenchSendRouteSelection {
  preferredProviderUnavailable: boolean;
  providersLoading: boolean;
  requestModelId: string | undefined;
  requestProviderId: string | undefined;
}

function normalizeRouteValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function resolveDefaultImageModelForProvider(
  providerId: string | null | undefined,
): string | undefined {
  const normalizedProviderId = normalizeRouteValue(providerId);
  if (!normalizedProviderId) {
    return undefined;
  }

  return resolveImageCapabilityModels({
    id: normalizedProviderId,
    type: normalizedProviderId,
  })[0]?.id;
}

export function applyImagePreferenceToSendRouteSelection({
  preference,
  selection,
}: {
  preference: ResolvedMediaGenerationPreference;
  selection: ImageWorkbenchSendRouteSelection;
}): ImageWorkbenchSendRouteSelection {
  const preferredProviderId = normalizeRouteValue(
    preference.preferredProviderId,
  );
  if (!preferredProviderId) {
    return selection;
  }

  const preferredModelId =
    normalizeRouteValue(preference.preferredModelId) ??
    resolveDefaultImageModelForProvider(preferredProviderId);
  if (!preferredModelId) {
    return selection;
  }

  return {
    ...selection,
    preferredProviderUnavailable: false,
    requestModelId: preferredModelId,
    requestProviderId: preferredProviderId,
  };
}
