import type { CuratedTaskReferenceEntry } from "../utils/curatedTaskReferenceSelection";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import type { RecommendationTuple } from "../utils/contextualRecommendations";
import type { HomeStarterChip } from "../home/homeSurfaceTypes";

export interface EmptyStateQuickActionItem {
  key: string;
  title: string;
  description: string;
  badge: string;
  prompt: string;
}

export interface EmptyStateRecentSessionActionModel {
  id: "recent-session";
  label: string;
  title?: string;
  testId: "entry-recent-session-resume";
}

export const EMPTY_STATE_THEME_ICONS: Record<string, string> = {
  general: "✨",
};

export function truncateEmptyStatePrompt(value: string, maxLength = 92): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}…`;
}

export function resolveEffectiveCuratedTaskReferences({
  defaultCuratedTaskReferenceMemoryIds,
  defaultCuratedTaskReferenceEntries,
  creationReplaySurface,
}: {
  defaultCuratedTaskReferenceMemoryIds?: string[];
  defaultCuratedTaskReferenceEntries?: CuratedTaskReferenceEntry[];
  creationReplaySurface?: CreationReplaySurfaceModel | null;
}): {
  effectiveDefaultCuratedTaskReferenceMemoryIds: string[];
  effectiveDefaultCuratedTaskReferenceEntries: CuratedTaskReferenceEntry[];
} {
  return {
    effectiveDefaultCuratedTaskReferenceMemoryIds:
      defaultCuratedTaskReferenceMemoryIds ??
      creationReplaySurface?.defaultReferenceMemoryIds ??
      [],
    effectiveDefaultCuratedTaskReferenceEntries:
      defaultCuratedTaskReferenceEntries ??
      creationReplaySurface?.defaultReferenceEntries ??
      [],
  };
}

export function buildEmptyStateQuickActionItems({
  activeTheme,
  recommendations,
  resolveBadge,
}: {
  activeTheme: string;
  recommendations: RecommendationTuple[];
  resolveBadge: (icon: string) => string;
}): EmptyStateQuickActionItem[] {
  return recommendations.slice(0, 4).map(([shortLabel, fullPrompt]) => ({
    key: `${activeTheme}-${shortLabel}`,
    title: shortLabel,
    description: truncateEmptyStatePrompt(fullPrompt),
    badge: resolveBadge(EMPTY_STATE_THEME_ICONS[activeTheme] || "✨"),
    prompt: fullPrompt,
  }));
}

export function resolveGuideHelpLabel({
  starterChips,
  contextLabel,
  contextLabelWithStarter,
}: {
  starterChips: HomeStarterChip[];
  contextLabel: string;
  contextLabelWithStarter: (label: string) => string;
}): string {
  const guideHelpStarterLabel = starterChips.find(
    (chip) => chip.launchKind === "toggle_guide",
  )?.label;

  return guideHelpStarterLabel
    ? contextLabelWithStarter(guideHelpStarterLabel)
    : contextLabel;
}

export function resolveRecentSessionLinkModel({
  recentSessionTitle,
  recentSessionSummary,
  recentSessionActionLabel,
  defaultActionLabel,
}: {
  recentSessionTitle?: string | null;
  recentSessionSummary?: string | null;
  recentSessionActionLabel?: string;
  defaultActionLabel: string;
}): {
  recentSessionLinkLabel: string;
  recentSessionLinkTitle: string;
} {
  const normalizedTitle = truncateEmptyStatePrompt(recentSessionTitle || "", 18);
  const effectiveActionLabel = recentSessionActionLabel ?? defaultActionLabel;

  return {
    recentSessionLinkLabel: normalizedTitle
      ? `${effectiveActionLabel} · ${normalizedTitle}`
      : effectiveActionLabel,
    recentSessionLinkTitle: [recentSessionTitle, recentSessionSummary]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" · "),
  };
}

export function buildRecentSessionSupplementalAction({
  recentSessionTitle,
  recentSessionLinkLabel,
  recentSessionLinkTitle,
  hasResumeHandler,
}: {
  recentSessionTitle?: string | null;
  recentSessionLinkLabel: string;
  recentSessionLinkTitle: string;
  hasResumeHandler: boolean;
}): EmptyStateRecentSessionActionModel | null {
  if (!recentSessionTitle || !hasResumeHandler) {
    return null;
  }

  return {
    id: "recent-session",
    label: recentSessionLinkLabel,
    title: recentSessionLinkTitle || undefined,
    testId: "entry-recent-session-resume",
  };
}

export function shouldExposeHomeInputSuggestions({
  hasAutoLaunchSiteSkill,
  guideHelpActive,
}: {
  hasAutoLaunchSiteSkill: boolean;
  guideHelpActive: boolean;
}): boolean {
  return !hasAutoLaunchSiteSkill && !guideHelpActive;
}
