import type { CuratedTaskReferenceEntry } from "../utils/curatedTaskReferenceSelection";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import type { RecommendationTuple } from "../utils/contextualRecommendations";
import type { HomeStarterChip } from "../home/homeSurfaceTypes";
import { normalizeProjectId } from "../utils/topicProjectResolution";

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

export interface EmptyStateProjectConversationTopicInput {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  workspaceId?: string | null;
  messagesCount?: number;
  status?: string;
  statusReason?: string;
  lastPreview?: string;
}

export interface EmptyStateProjectConversationProjectInput {
  id: string;
  name: string;
}

export interface EmptyStateProjectConversationItemModel {
  id: string;
  title: string;
  summary?: string;
  statusReason?: string;
}

export interface EmptyStateProjectConversationGroupModel {
  projectId: string;
  projectName: string;
  conversations: EmptyStateProjectConversationItemModel[];
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

export function buildEmptyStateProjectConversationGroups({
  topics,
  currentProjectId,
  currentSessionId,
  openedProjects,
  maxProjects = 3,
  maxConversationsPerProject = 4,
}: {
  topics: EmptyStateProjectConversationTopicInput[];
  currentProjectId?: string | null;
  currentSessionId?: string | null;
  openedProjects?: EmptyStateProjectConversationProjectInput[];
  maxProjects?: number;
  maxConversationsPerProject?: number;
}): EmptyStateProjectConversationGroupModel[] {
  const normalizedCurrentProjectId = normalizeProjectId(currentProjectId);
  const normalizedCurrentSessionId = currentSessionId?.trim() || null;
  const projectNameById = new Map<string, string>();

  for (const project of openedProjects ?? []) {
    const projectId = normalizeProjectId(project.id);
    const projectName = project.name.trim();
    if (projectId && projectName) {
      projectNameById.set(projectId, projectName);
    }
  }

  const projectGroups = new Map<
    string,
    {
      latestTime: number;
      topics: EmptyStateProjectConversationTopicInput[];
    }
  >();

  for (const topic of topics) {
    const topicId = topic.id.trim();
    if (!topicId || topicId === normalizedCurrentSessionId) {
      continue;
    }

    if (topic.status === "draft" && (topic.messagesCount ?? 0) <= 0) {
      continue;
    }

    const projectId =
      normalizeProjectId(topic.workspaceId) ?? normalizedCurrentProjectId;
    if (!projectId) {
      continue;
    }

    const latestTime = Math.max(
      topic.updatedAt.getTime(),
      topic.createdAt.getTime(),
      0,
    );
    const group = projectGroups.get(projectId) ?? {
      latestTime: 0,
      topics: [],
    };
    group.latestTime = Math.max(group.latestTime, latestTime);
    group.topics.push(topic);
    projectGroups.set(projectId, group);
  }

  return [...projectGroups.entries()]
    .sort(([leftProjectId, left], [rightProjectId, right]) => {
      const leftCurrentRank = leftProjectId === normalizedCurrentProjectId ? 0 : 1;
      const rightCurrentRank =
        rightProjectId === normalizedCurrentProjectId ? 0 : 1;
      if (leftCurrentRank !== rightCurrentRank) {
        return leftCurrentRank - rightCurrentRank;
      }
      return right.latestTime - left.latestTime;
    })
    .slice(0, Math.max(0, maxProjects))
    .map(([projectId, group]) => {
      const conversations = [...group.topics]
        .sort((left, right) => {
          const updatedDiff =
            right.updatedAt.getTime() - left.updatedAt.getTime();
          if (updatedDiff !== 0) {
            return updatedDiff;
          }
          return right.createdAt.getTime() - left.createdAt.getTime();
        })
        .slice(0, Math.max(0, maxConversationsPerProject))
        .map((topic) => ({
          id: topic.id,
          title: truncateEmptyStatePrompt(topic.title, 34),
          summary: topic.lastPreview
            ? truncateEmptyStatePrompt(topic.lastPreview, 72)
            : undefined,
          statusReason: topic.statusReason,
        }));

      return {
        projectId,
        projectName: projectNameById.get(projectId) ?? projectId,
        conversations,
      };
    })
    .filter((group) => group.conversations.length > 0);
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
