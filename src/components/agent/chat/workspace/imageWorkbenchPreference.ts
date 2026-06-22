import type { ResolvedMediaGenerationPreference } from "@/lib/mediaGeneration";

interface ImageWorkbenchOptionLabel {
  name?: string | null;
}

export interface ImageWorkbenchPreferenceViewModel {
  sourceLabel: string;
  preferenceSummary: string;
  preferenceWarning: string | null;
  selectionWarning: string | null;
  selectionReady: boolean;
}

export interface ResolveImageWorkbenchPreferenceViewModelParams {
  preference: Pick<
    ResolvedMediaGenerationPreference,
    "allowFallback" | "preferredProviderId" | "source"
  >;
  selectedProvider?: ImageWorkbenchOptionLabel | null;
  selectedProviderId?: string | null;
  selectedModel?: ImageWorkbenchOptionLabel | null;
  selectedModelId?: string | null;
  preferredProviderUnavailable: boolean;
  mediaDefaultsLoading: boolean;
  providersLoading: boolean;
}

export function resolveImageWorkbenchPreferenceSourceLabel(
  source: ResolvedMediaGenerationPreference["source"],
): string {
  switch (source) {
    case "project":
      return "项目图片设置";
    case "global":
      return "全局图片设置";
    case "auto":
    default:
      return "自动选择";
  }
}

export function resolveImageWorkbenchPreferenceViewModel({
  preference,
  selectedProvider,
  selectedProviderId,
  selectedModel,
  selectedModelId,
  preferredProviderUnavailable,
  mediaDefaultsLoading,
  providersLoading,
}: ResolveImageWorkbenchPreferenceViewModelParams): ImageWorkbenchPreferenceViewModel {
  const sourceLabel = resolveImageWorkbenchPreferenceSourceLabel(
    preference.source,
  );
  const providerLabel =
    selectedProvider?.name?.trim() || selectedProviderId || "自动匹配";
  const modelLabel =
    selectedModel?.name?.trim() || selectedModelId || "自动模型";
  const preferenceWarning =
    preferredProviderUnavailable && !preference.allowFallback
      ? `默认图片服务 ${preference.preferredProviderId} 当前不可用，且已关闭自动回退。`
      : null;
  const selectionWarning = resolveImageGenerationSelectionWarning({
    allowFallback: preference.allowFallback,
    mediaDefaultsLoading,
    preferredProviderUnavailable,
    preferenceWarning,
    providersLoading,
    selectedModelId,
    selectedProviderId,
  });

  return {
    sourceLabel,
    preferenceSummary: `来源：${sourceLabel} · ${providerLabel} / ${modelLabel}`,
    preferenceWarning,
    selectionWarning,
    selectionReady: !selectionWarning,
  };
}

function resolveImageGenerationSelectionWarning({
  allowFallback,
  mediaDefaultsLoading,
  preferredProviderUnavailable,
  preferenceWarning,
  providersLoading,
  selectedModelId,
  selectedProviderId,
}: {
  allowFallback: boolean;
  mediaDefaultsLoading: boolean;
  preferredProviderUnavailable: boolean;
  preferenceWarning: string | null;
  providersLoading: boolean;
  selectedModelId?: string | null;
  selectedProviderId?: string | null;
}): string | null {
  if (mediaDefaultsLoading || providersLoading) {
    return "图片服务设置加载中，请稍后生成图层资产。";
  }

  if (preferredProviderUnavailable && !allowFallback) {
    return preferenceWarning;
  }

  if (!selectedProviderId || !selectedModelId) {
    return "图片服务尚未选定 Provider/模型，请先到媒体服务图片设置确认默认渠道。";
  }

  return null;
}
