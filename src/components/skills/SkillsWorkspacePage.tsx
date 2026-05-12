import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FolderOpen, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useSkills } from "@/hooks/useSkills";
import type { Skill } from "@/lib/api/skills";
import type {
  Page,
  PageParams,
  SkillScaffoldDraft,
  SkillsPageParams,
} from "@/types/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CuratedTaskLauncherDialog } from "@/components/agent/chat/components/CuratedTaskLauncherDialog";
import { resolveServiceSkillEntryDescription } from "@/components/agent/chat/service-skills/entryAdapter";
import { buildServiceSkillRecommendationBuckets } from "@/components/agent/chat/service-skills/recommendedServiceSkills";
import {
  buildServiceSkillLaunchPrefillSummary,
  resolveServiceSkillLaunchPrefill,
  type ServiceSkillLaunchPrefillCopy,
} from "@/components/agent/chat/service-skills/serviceSkillLaunchPrefill";
import {
  buildServiceSkillCapabilityDescription,
  getServiceSkillActionLabel,
  getServiceSkillOutputDestination,
  getServiceSkillRunnerLabel,
  getServiceSkillTypeLabel,
  summarizeServiceSkillRequiredInputs,
  type ServiceSkillPresentationCopy,
} from "@/components/agent/chat/service-skills/skillPresentation";
import type {
  ServiceSkillHomeItem,
  ServiceSkillTone,
} from "@/components/agent/chat/service-skills/types";
import { useServiceSkills } from "@/components/agent/chat/service-skills/useServiceSkills";
import { SkillsPage } from "./SkillsPage";
import {
  buildInstalledSkillCapabilityDescription,
  getInstalledSkillOutputHint,
  resolveInstalledSkillPromise,
  summarizeInstalledSkillRequiredInputs,
  type InstalledSkillPresentationCopy,
} from "./installedSkillPresentation";
import { buildHomeAgentParams } from "@/lib/workspace/navigation";
import { buildSkillScaffoldCreationReplayRequestMetadata } from "@/components/agent/chat/utils/creationReplayMetadata";
import {
  buildSkillScaffoldCreationSeed,
  buildSkillScaffoldReplayText,
} from "./skillScaffoldCreationSeed";
import {
  FEATURED_HOME_CURATED_TASK_TEMPLATE_IDS,
  buildCuratedTaskTemplateCopy,
  buildCuratedTaskRecentUsageDescription,
  buildCuratedTaskLaunchPrompt,
  filterCuratedTaskTemplates,
  getCuratedTaskOutputDestination,
  listCuratedTaskTemplates,
  listFeaturedHomeCuratedTaskTemplates,
  recordCuratedTaskTemplateUsage,
  resolveCuratedTaskTemplateLaunchPrefill,
  subscribeCuratedTaskTemplateUsageChanged,
  summarizeCuratedTaskFollowUpActions,
  summarizeCuratedTaskOutputContract,
  summarizeCuratedTaskRequiredInputs,
  type CuratedTaskInputValues,
  type CuratedTaskPresentationCopy,
  type CuratedTaskTemplateItem,
} from "@/components/agent/chat/utils/curatedTaskTemplates";
import {
  buildSceneAppExecutionReviewPrefillHighlights,
  buildSceneAppExecutionReviewPrefillSnapshot,
} from "@/components/agent/chat/utils/sceneAppCuratedTaskReference";
import {
  buildCuratedTaskLaunchRequestMetadata,
  mergeCuratedTaskReferenceEntries,
  normalizeCuratedTaskReferenceMemoryIds,
  type CuratedTaskReferenceEntry,
  normalizeCuratedTaskLaunchInputValues,
  type CuratedTaskReferenceSelection,
} from "@/components/agent/chat/utils/curatedTaskReferenceSelection";
import {
  listCuratedTaskRecommendationSignals,
  subscribeCuratedTaskRecommendationSignalsChanged,
} from "@/components/agent/chat/utils/curatedTaskRecommendationSignals";
import { buildReviewFeedbackProjection } from "@/components/agent/chat/utils/reviewFeedbackProjection";
import { buildWorkspaceSkillRuntimeEnableHarnessMetadata } from "@/components/agent/chat/utils/workspaceSkillBindingsMetadata";
import {
  getSlashEntryUsageMap,
  getSlashEntryUsageRecordKey,
  recordSlashEntryUsage,
  subscribeSlashEntryUsageChanged,
} from "@/components/agent/chat/skill-selection/slashEntryUsage";
import { resolveSceneAppsPageEntryParams } from "@/lib/sceneapp";
import { getProject } from "@/lib/api/project";
import type { AgentRuntimeWorkspaceSkillBinding } from "@/lib/api/agentRuntime";
import {
  CapabilityDraftPanel,
  WorkspaceRegisteredSkillsPanel,
} from "@/features/capability-drafts";
import { createAutomationJob } from "@/lib/api/automation";
import type { Project } from "@/lib/api/project";
import {
  AutomationJobDialog,
  type AutomationJobDialogInitialValues,
  type AutomationJobDialogSubmit,
} from "@/components/settings-v2/system/automation/AutomationJobDialog";
import {
  buildWorkspaceSkillAgentAutomationInitialValues,
  type WorkspaceSkillAgentAutomationDraftOptions,
  type WorkspaceSkillManagedAutomationInitialValuesCopy,
} from "@/features/capability-drafts/workspaceSkillAgentAutomationDraft";
import { formatList, formatNumber } from "@/i18n/format";
import type agentResource from "@/i18n/resources/zh-CN/agent.json";

interface SkillsWorkspacePageProps {
  onNavigate: (page: Page, params?: PageParams) => void;
  pageParams?: SkillsPageParams;
}

type AgentI18nKey = keyof typeof agentResource;
type CuratedTaskWithMoreKey =
  | "skills.workspace.curatedTask.factItems.withMore"
  | "skills.workspace.curatedTask.referenceItems.withMore";

const TONE_BADGE_CLASSNAMES: Record<ServiceSkillTone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
};

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

function matchesText(
  query: string,
  ...values: Array<string | undefined>
): boolean {
  const normalizedQuery = normalizeKeyword(query);
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

function summarizeRecentReplayText(value: string, maxLength = 56): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

interface WorkspaceRuntimeEnablePromptCopy {
  formatIntro: (skillName: string, directory: string) => string;
  needsInput: string;
  readSkill: string;
}

function buildWorkspaceRuntimeEnablePrompt(
  binding: AgentRuntimeWorkspaceSkillBinding,
  copy: WorkspaceRuntimeEnablePromptCopy,
): string {
  const skillName = binding.name?.trim() || binding.directory;
  return [
    copy.formatIntro(skillName, binding.directory),
    copy.readSkill,
    copy.needsInput,
  ].join("\n");
}

function resolveSkillCardTone(skill: ServiceSkillHomeItem): ServiceSkillTone {
  if (skill.automationStatus?.tone) {
    return skill.automationStatus.tone;
  }
  return skill.runnerTone;
}

function resolveSkillCardStatusLabel(
  skill: ServiceSkillHomeItem,
  copy: ServiceSkillPresentationCopy,
): string {
  if (skill.automationStatus?.statusLabel) {
    return skill.automationStatus.statusLabel;
  }
  return getServiceSkillRunnerLabel(skill, { copy });
}

function resolveSkillGroupKey(skill: ServiceSkillHomeItem): string {
  return (
    (skill as ServiceSkillHomeItem & { groupKey?: string }).groupKey ??
    "general"
  );
}

function buildServiceSkillGroupMap(
  skills: ServiceSkillHomeItem[],
  groupKeys: Array<{ key: string }>,
): Map<string, ServiceSkillHomeItem[]> {
  const nextMap = new Map<string, ServiceSkillHomeItem[]>();
  for (const group of groupKeys) {
    nextMap.set(group.key, []);
  }
  for (const skill of skills) {
    const groupKey = resolveSkillGroupKey(skill);
    const current = nextMap.get(groupKey) ?? [];
    current.push(skill);
    nextMap.set(groupKey, current);
  }
  return nextMap;
}

function listPreferredGroupSkills(
  skills: ServiceSkillHomeItem[],
): ServiceSkillHomeItem[] {
  const recommendationBuckets = buildServiceSkillRecommendationBuckets(skills, {
    featuredLimit: 0,
  });
  return recommendationBuckets.remainingSkills.length > 0
    ? recommendationBuckets.remainingSkills
    : recommendationBuckets.recentSkills;
}

export function SkillsWorkspacePage({
  onNavigate,
  pageParams,
}: SkillsWorkspacePageProps) {
  const { t, i18n } = useTranslation("agent");
  const workspaceRuntimeEnablePromptCopy =
    useMemo<WorkspaceRuntimeEnablePromptCopy>(
      () => ({
        formatIntro: (skillName, directory) =>
          t("skills.workspace.runtimeEnable.prompt.intro", {
            directory,
            name: skillName,
          }),
        needsInput: t("skills.workspace.runtimeEnable.prompt.needsInput"),
        readSkill: t("skills.workspace.runtimeEnable.prompt.readSkill"),
      }),
      [t],
    );
  const formatInstalledSkillRecentUsageDescription = useCallback(
    (replayText: string | undefined): string => {
      const normalizedReplayText = replayText?.trim();
      if (!normalizedReplayText) {
        return "";
      }

      return t("skills.workspace.sidebar.local.recentUsage", {
        summary: summarizeRecentReplayText(normalizedReplayText),
      });
    },
    [t],
  );
  const formatSkillGroupStarterSummary = useCallback(
    (skills: ServiceSkillHomeItem[]): string => {
      const starterTitles = skills
        .slice(0, 2)
        .map((skill) => `「${skill.title}」`);

      if (starterTitles.length === 0) {
        return t("skills.workspace.categories.defaultStarter");
      }

      const titles = starterTitles.join(" / ");
      return starterTitles.length < skills.length
        ? t("skills.workspace.categories.starterWithMore", {
            titles,
          })
        : t("skills.workspace.categories.starter", {
            titles,
          });
    },
    [t],
  );
  const formatCompactReviewBaselineSummary = useCallback(
    (params: { sourceTitle?: string | null; highlights: string[] }): string => {
      const sourceTitle =
        params.sourceTitle?.trim() ||
        t("skills.workspace.featured.defaultSourceTitle");
      const [firstHighlight] = params.highlights;

      if (!firstHighlight) {
        return sourceTitle;
      }

      return params.highlights.length > 1
        ? t("skills.workspace.featured.compactBaselineWithCount", {
            sourceTitle,
            highlight: firstHighlight,
            count: params.highlights.length,
          })
        : t("skills.workspace.featured.compactBaseline", {
            sourceTitle,
            highlight: firstHighlight,
          });
    },
    [t],
  );
  const installedSkillPresentationCopy =
    useMemo<InstalledSkillPresentationCopy>(
      () => ({
        defaultPromise: t("skills.workspace.installedSkill.defaultPromise"),
        fallbackRequiredInputs: t(
          "skills.workspace.installedSkill.fallbackRequiredInputs",
        ),
        fallbackOutputHint: t(
          "skills.workspace.installedSkill.fallbackOutputHint",
        ),
        requiredPrefix: t("skills.workspace.installedSkill.requiredPrefix"),
        outputPrefix: t("skills.workspace.installedSkill.outputPrefix"),
      }),
      [t],
    );
  const serviceSkillPresentationCopy = useMemo<ServiceSkillPresentationCopy>(
    () => ({
      runnerLabels: {
        instant: t("skills.workspace.serviceSkill.runner.instant.label"),
        scheduled: t("skills.workspace.serviceSkill.runner.scheduled.label"),
        managed: t("skills.workspace.serviceSkill.runner.managed.label"),
      },
      runnerDescriptions: {
        instant: t("skills.workspace.serviceSkill.runner.instant.description"),
        scheduled: t(
          "skills.workspace.serviceSkill.runner.scheduled.description",
        ),
        managed: t("skills.workspace.serviceSkill.runner.managed.description"),
      },
      actionLabels: {
        instant: t("skills.workspace.serviceSkill.action.instant"),
        scheduled: t("skills.workspace.serviceSkill.action.scheduled"),
        managed: t("skills.workspace.serviceSkill.action.managed"),
      },
      typeLabels: {
        service: t("skills.workspace.serviceSkill.type.service"),
        site: t("skills.workspace.serviceSkill.type.site"),
        prompt: t("skills.workspace.serviceSkill.type.prompt"),
      },
      fallbackRequiredInputs: t(
        "skills.workspace.serviceSkill.requiredInputs.empty",
      ),
      requiredPrefix: t("skills.workspace.serviceSkill.requiredPrefix"),
      outputPrefix: t("skills.workspace.serviceSkill.outputPrefix"),
      siteRunnerLabel: t("skills.workspace.serviceSkill.runner.site.label"),
      siteRunnerDescription: t(
        "skills.workspace.serviceSkill.runner.site.description",
      ),
      requiredSlotActionLabel: t(
        "skills.workspace.serviceSkill.action.requiredSlot",
      ),
      siteActionLabel: t("skills.workspace.serviceSkill.action.site"),
      automationActionLabel: t(
        "skills.workspace.serviceSkill.action.automation",
      ),
      outputProjectResource: t(
        "skills.workspace.serviceSkill.output.projectResource",
      ),
      outputCurrentContent: t(
        "skills.workspace.serviceSkill.output.currentContent",
      ),
      outputScheduled: t("skills.workspace.serviceSkill.output.scheduled"),
      outputManaged: t("skills.workspace.serviceSkill.output.managed"),
      outputDefault: t("skills.workspace.serviceSkill.output.default"),
      dependencyRequiresModel: t(
        "skills.workspace.serviceSkill.dependency.model",
      ),
      dependencyRequiresBrowser: t(
        "skills.workspace.serviceSkill.dependency.browser",
      ),
      dependencyRequiresProject: t(
        "skills.workspace.serviceSkill.dependency.project",
      ),
      formatDependencyRequiresSkillKey: (skillKey) =>
        t("skills.workspace.serviceSkill.dependency.skillKey", {
          skillKey,
        }),
      formatFactItems: (visibleItems, totalCount) => {
        const locale = i18n.language;
        const items = formatList(visibleItems, { locale, style: "short" });
        if (visibleItems.length >= totalCount) {
          return items;
        }

        return t("skills.workspace.serviceSkill.factItems.withMore", {
          items,
          remaining: formatNumber(totalCount - visibleItems.length, {
            locale,
          }),
          total: formatNumber(totalCount, { locale }),
        });
      },
    }),
    [i18n.language, t],
  );
  const serviceSkillLaunchPrefillCopy =
    useMemo<ServiceSkillLaunchPrefillCopy>(() => {
      const itemSeparator = t(
        "skills.workspace.serviceSkill.prefill.itemSeparator",
      );
      return {
        creationReplay: {
          sourceLabels: {
            memoryEntry: t(
              "skills.workspace.serviceSkill.prefill.creationReplay.source.memoryEntry",
            ),
            skillScaffold: t(
              "skills.workspace.serviceSkill.prefill.creationReplay.source.skillScaffold",
            ),
          },
          formatFieldSummary: (visibleLabels, totalCount) => {
            const locale = i18n.language;
            const fields = formatList(visibleLabels, {
              locale,
              style: "short",
            });
            if (visibleLabels.length >= totalCount) {
              return fields;
            }

            return t(
              "skills.workspace.serviceSkill.prefill.creationReplay.fieldSummaryWithMore",
              {
                fields,
                remaining: formatNumber(totalCount - visibleLabels.length, {
                  locale,
                }),
                total: formatNumber(totalCount, { locale }),
              },
            );
          },
          formatHint: (sourceLabel, fieldSummary) =>
            t("skills.workspace.serviceSkill.prefill.creationReplay.hint", {
              fields: fieldSummary,
              source: sourceLabel,
            }),
        },
        filledPrefix: t("skills.workspace.serviceSkill.prefill.filledPrefix"),
        extraPrefix: t("skills.workspace.serviceSkill.prefill.extraPrefix"),
        itemSeparator,
        segmentSeparator: t(
          "skills.workspace.serviceSkill.prefill.segmentSeparator",
        ),
        formatFilledItems: (visibleItems, totalCount) => {
          const items = visibleItems.join(itemSeparator);
          if (visibleItems.length >= totalCount) {
            return items;
          }

          const locale = i18n.language;
          return t("skills.workspace.serviceSkill.prefill.filledWithMore", {
            items,
            remaining: formatNumber(totalCount - visibleItems.length, {
              locale,
            }),
            total: formatNumber(totalCount, { locale }),
          });
        },
        formatRecentServiceHint: (skillTitle) =>
          t("skills.workspace.serviceSkill.prefill.recentServiceHint", {
            title: skillTitle,
          }),
        formatRecentSceneHint: (sceneTitle) =>
          t("skills.workspace.serviceSkill.prefill.recentSceneHint", {
            title: sceneTitle,
          }),
      };
    }, [i18n.language, t]);
  const curatedTaskPresentationCopy =
    useMemo<CuratedTaskPresentationCopy>(() => {
      const itemSeparator = t("skills.workspace.curatedTask.itemSeparator");
      const formatItemsWithMore = (
        key: CuratedTaskWithMoreKey,
        visibleItems: string[],
        totalCount: number,
      ) => {
        const items = visibleItems.join(itemSeparator);
        if (visibleItems.length >= totalCount) {
          return items;
        }

        const locale = i18n.language;
        return t(key, {
          items,
          remaining: formatNumber(totalCount - visibleItems.length, {
            locale,
          }),
          total: formatNumber(totalCount, { locale }),
        });
      };

      return {
        followUpPrefix: t("skills.workspace.curatedTask.followUpPrefix"),
        itemSeparator,
        outputPrefix: t("skills.workspace.curatedTask.outputPrefix"),
        recentFilledPrefix: t(
          "skills.workspace.curatedTask.recentFilledPrefix",
        ),
        recentReferencePrefix: t(
          "skills.workspace.curatedTask.recentReferencePrefix",
        ),
        requiredPrefix: t("skills.workspace.curatedTask.requiredPrefix"),
        resultDestinationPrefix: t(
          "skills.workspace.curatedTask.resultDestinationPrefix",
        ),
        segmentSeparator: t("skills.workspace.curatedTask.segmentSeparator"),
        formatFactItems: (visibleItems, totalCount) =>
          formatItemsWithMore(
            "skills.workspace.curatedTask.factItems.withMore",
            visibleItems,
            totalCount,
          ),
        formatRecentPrefillHint: (taskTitle) =>
          t("skills.workspace.curatedTask.prefillHint", {
            title: taskTitle,
          }),
        formatRecentReferenceFallback: (totalCount) =>
          t("skills.workspace.curatedTask.recentReferenceFallback", {
            count: totalCount,
          }),
        formatRecentReferenceItems: (visibleTitles, totalCount) =>
          formatItemsWithMore(
            "skills.workspace.curatedTask.referenceItems.withMore",
            visibleTitles,
            totalCount,
          ),
      };
    }, [i18n.language, t]);
  const curatedTaskTemplateCopy = useMemo(
    () =>
      buildCuratedTaskTemplateCopy((key, values) =>
        t(key as AgentI18nKey, values ?? {}),
      ),
    [t],
  );
  const recentReviewReasonLabel = t(
    "curatedTask.templates.recommendation.recentReviewReasonLabel",
  );
  const workspaceSkillManagedAutomationInitialValuesCopy =
    useMemo<WorkspaceSkillManagedAutomationInitialValuesCopy>(
      () => ({
        descriptionPausedByDefault: t(
          "skills.workspace.managedJob.initialValues.description.pausedByDefault",
        ),
        descriptionSource: t(
          "skills.workspace.managedJob.initialValues.description.source",
        ),
        formatDescriptionProvenance: (
          sourceDraftId,
          sourceVerificationReportId,
        ) =>
          t(
            "skills.workspace.managedJob.initialValues.description.provenance",
            {
              sourceDraftId,
              sourceVerificationReportId,
            },
          ),
        formatDescriptionSkill: (skillName) =>
          t("skills.workspace.managedJob.initialValues.description.skill", {
            skill: skillName,
          }),
        formatName: (displayName) =>
          t("skills.workspace.managedJob.initialValues.name", {
            name: displayName,
          }),
        formatObjective: (displayName) =>
          t("skills.workspace.managedJob.initialValues.objective", {
            name: displayName,
          }),
        formatPromptIntro: (displayName, skillName) =>
          t("skills.workspace.managedJob.initialValues.prompt.intro", {
            name: displayName,
            skill: skillName,
          }),
        promptNeedsInput: t(
          "skills.workspace.managedJob.initialValues.prompt.needsInput",
        ),
        promptReadRunbook: t(
          "skills.workspace.managedJob.initialValues.prompt.readRunbook",
        ),
        promptResultEvidence: t(
          "skills.workspace.managedJob.initialValues.prompt.resultEvidence",
        ),
        successCriteriaControlledGet: t(
          "skills.workspace.managedJob.initialValues.successCriteria.controlledGet",
        ),
        successCriteriaEvidence: t(
          "skills.workspace.managedJob.initialValues.successCriteria.evidence",
        ),
        successCriteriaRuntimeEnable: t(
          "skills.workspace.managedJob.initialValues.successCriteria.runtimeEnable",
        ),
        successCriteriaSubmitTurn: t(
          "skills.workspace.managedJob.initialValues.successCriteria.submitTurn",
        ),
      }),
      [t],
    );
  const {
    skills: serviceSkills = [],
    groups: skillGroups = [],
    error: serviceSkillsError,
    refresh: refreshServiceSkills,
  } = useServiceSkills();
  const {
    skills: localSkills = [],
    error: localSkillsError,
    refresh: refreshLocalSkills,
  } = useSkills("lime", { includeRepos: false });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [advancedManagerOpen, setAdvancedManagerOpen] = useState(false);
  const [curatedTaskLauncherTask, setCuratedTaskLauncherTask] =
    useState<CuratedTaskTemplateItem | null>(null);
  const [
    curatedTaskLauncherInitialInputValues,
    setCuratedTaskLauncherInitialInputValues,
  ] = useState<CuratedTaskInputValues | null>(null);
  const [
    curatedTaskLauncherInitialReferenceMemoryIds,
    setCuratedTaskLauncherInitialReferenceMemoryIds,
  ] = useState<string[] | null>(null);
  const [
    curatedTaskLauncherInitialReferenceEntries,
    setCuratedTaskLauncherInitialReferenceEntries,
  ] = useState<CuratedTaskReferenceEntry[] | null>(null);
  const [curatedTaskLauncherPrefillHint, setCuratedTaskLauncherPrefillHint] =
    useState<string | null>(null);
  const [
    curatedTaskRecommendationSignalsVersion,
    setCuratedTaskRecommendationSignalsVersion,
  ] = useState(0);
  const [curatedTaskTemplatesVersion, setCuratedTaskTemplatesVersion] =
    useState(0);
  const [slashEntryUsageVersion, setSlashEntryUsageVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [
    highlightedInstalledSkillDirectory,
    setHighlightedInstalledSkillDirectory,
  ] = useState<string | null>(null);
  const [optimisticInstalledSkill, setOptimisticInstalledSkill] =
    useState<Skill | null>(null);
  const [consumedScaffoldRequestKey, setConsumedScaffoldRequestKey] = useState<
    number | null
  >(null);
  const [capabilityDraftWorkspaceRoot, setCapabilityDraftWorkspaceRoot] =
    useState<string | null>(null);
  const [capabilityDraftProject, setCapabilityDraftProject] =
    useState<Project | null>(null);
  const [capabilityDraftProjectLoading, setCapabilityDraftProjectLoading] =
    useState(false);
  const [capabilityDraftProjectError, setCapabilityDraftProjectError] =
    useState<string | null>(null);
  const [registeredSkillsRefreshSignal, setRegisteredSkillsRefreshSignal] =
    useState(0);
  const [
    workspaceSkillAutomationDialogOpen,
    setWorkspaceSkillAutomationDialogOpen,
  ] = useState(false);
  const [
    workspaceSkillAutomationInitialValues,
    setWorkspaceSkillAutomationInitialValues,
  ] = useState<AutomationJobDialogInitialValues | null>(null);
  const [workspaceSkillAutomationSaving, setWorkspaceSkillAutomationSaving] =
    useState(false);
  const lastHandledScaffoldRequestKeyRef = useRef<number | null>(null);

  const installedLocalSkills = useMemo(() => {
    const installedSkills = localSkills.filter((skill) => skill.installed);

    if (!optimisticInstalledSkill) {
      return installedSkills;
    }

    return [
      optimisticInstalledSkill,
      ...installedSkills.filter(
        (skill) => skill.directory !== optimisticInstalledSkill.directory,
      ),
    ];
  }, [localSkills, optimisticInstalledSkill]);
  const serviceSkillRecommendationBuckets = useMemo(
    () =>
      buildServiceSkillRecommendationBuckets(serviceSkills, {
        featuredLimit: 0,
        surface: "workspace",
      }),
    [serviceSkills],
  );
  const recentServiceSkills = serviceSkillRecommendationBuckets.recentSkills;
  const nonRecentServiceSkills =
    serviceSkillRecommendationBuckets.remainingSkills;
  const workspaceServiceSkills = useMemo(
    () => [...recentServiceSkills, ...nonRecentServiceSkills],
    [nonRecentServiceSkills, recentServiceSkills],
  );
  const allSkillGroupMap = useMemo(
    () => buildServiceSkillGroupMap(workspaceServiceSkills, skillGroups),
    [skillGroups, workspaceServiceSkills],
  );
  const recommendedSkillGroupMap = useMemo(
    () => buildServiceSkillGroupMap(nonRecentServiceSkills, skillGroups),
    [nonRecentServiceSkills, skillGroups],
  );
  const selectedGroup = useMemo(
    () => skillGroups.find((group) => group.key === selectedGroupKey) ?? null,
    [selectedGroupKey, skillGroups],
  );
  const creationProjectId = pageParams?.creationProjectId?.trim() || undefined;
  const highlightedCapabilityDraftId =
    pageParams?.highlightCapabilityDraftId?.trim() || undefined;
  const scaffoldCreationReplay = useMemo(() => {
    if (!pageParams?.initialScaffoldDraft) {
      return undefined;
    }

    return buildSkillScaffoldCreationReplayRequestMetadata(
      pageParams.initialScaffoldDraft,
      {
        projectId: creationProjectId,
      },
    ).harness.creation_replay;
  }, [creationProjectId, pageParams?.initialScaffoldDraft]);

  useEffect(() => {
    if (selectedGroupKey && !selectedGroup) {
      setSelectedGroupKey(null);
    }
  }, [selectedGroup, selectedGroupKey]);

  useEffect(() => {
    return subscribeCuratedTaskTemplateUsageChanged(() => {
      setCuratedTaskTemplatesVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    return subscribeCuratedTaskRecommendationSignalsChanged(() => {
      setCuratedTaskRecommendationSignalsVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    return subscribeSlashEntryUsageChanged(() => {
      setSlashEntryUsageVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    const requestKey = pageParams?.initialScaffoldRequestKey ?? null;
    if (
      !pageParams?.initialScaffoldDraft ||
      requestKey === null ||
      lastHandledScaffoldRequestKeyRef.current === requestKey
    ) {
      return;
    }

    lastHandledScaffoldRequestKeyRef.current = requestKey;
    setAdvancedManagerOpen(true);
  }, [pageParams?.initialScaffoldDraft, pageParams?.initialScaffoldRequestKey]);

  useEffect(() => {
    let cancelled = false;

    if (!creationProjectId) {
      setCapabilityDraftWorkspaceRoot(null);
      setCapabilityDraftProject(null);
      setCapabilityDraftProjectError(null);
      setCapabilityDraftProjectLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setCapabilityDraftProjectLoading(true);
    setCapabilityDraftProjectError(null);
    void getProject(creationProjectId)
      .then((project) => {
        if (cancelled) {
          return;
        }
        const rootPath = project?.rootPath?.trim() || null;
        setCapabilityDraftProject(project ?? null);
        setCapabilityDraftWorkspaceRoot(rootPath);
        setCapabilityDraftProjectError(
          rootPath ? null : t("skills.workspace.capabilityDraft.missingRoot"),
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setCapabilityDraftProject(null);
        setCapabilityDraftWorkspaceRoot(null);
        setCapabilityDraftProjectError(String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setCapabilityDraftProjectLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [creationProjectId, t]);

  const handleBringScaffoldToCreation = useCallback(
    (draft: SkillScaffoldDraft) => {
      const seed = buildSkillScaffoldCreationSeed(draft);
      onNavigate(
        "agent",
        buildHomeAgentParams({
          projectId: creationProjectId,
          initialUserPrompt: seed.initialUserPrompt,
          entryBannerMessage: seed.entryBannerMessage,
          initialRequestMetadata:
            buildSkillScaffoldCreationReplayRequestMetadata(draft, {
              projectId: creationProjectId,
            }),
        }),
      );
    },
    [creationProjectId, onNavigate],
  );

  const visibleGroups = useMemo(() => {
    return skillGroups.filter((group) => {
      const groupSkills = allSkillGroupMap.get(group.key) ?? [];
      if (groupSkills.length === 0) {
        return false;
      }
      return matchesText(
        searchQuery,
        group.title,
        group.summary,
        group.entryHint,
        group.themeTarget,
        ...groupSkills.flatMap((skill) => [
          skill.title,
          skill.summary,
          skill.outputHint,
        ]),
      );
    });
  }, [allSkillGroupMap, searchQuery, skillGroups]);

  const visibleGroupSkills = useMemo(() => {
    const scopedSkills = selectedGroup
      ? listPreferredGroupSkills(allSkillGroupMap.get(selectedGroup.key) ?? [])
      : [];

    return scopedSkills.filter((skill) =>
      matchesText(
        searchQuery,
        skill.title,
        skill.summary,
        skill.category,
        skill.outputHint,
        skill.badge,
        skill.skillKey,
        buildServiceSkillCapabilityDescription(skill, {
          copy: serviceSkillPresentationCopy,
        }),
        getServiceSkillOutputDestination(skill, {
          copy: serviceSkillPresentationCopy,
        }),
        getServiceSkillTypeLabel(skill, {
          copy: serviceSkillPresentationCopy,
        }),
      ),
    );
  }, [
    allSkillGroupMap,
    searchQuery,
    selectedGroup,
    serviceSkillPresentationCopy,
  ]);

  const visibleRecentSkills = useMemo(() => {
    return recentServiceSkills.filter((skill) =>
      matchesText(
        searchQuery,
        skill.title,
        skill.summary,
        skill.category,
        skill.outputHint,
        buildServiceSkillCapabilityDescription(skill, {
          copy: serviceSkillPresentationCopy,
        }),
      ),
    );
  }, [recentServiceSkills, searchQuery, serviceSkillPresentationCopy]);

  const visibleInstalledLocalSkills = useMemo(() => {
    const filteredSkills = installedLocalSkills.filter((skill) =>
      matchesText(
        searchQuery,
        skill.name,
        skill.description,
        skill.key,
        skill.repoOwner,
        skill.repoName,
        buildInstalledSkillCapabilityDescription(skill, {
          copy: installedSkillPresentationCopy,
        }),
      ),
    );

    if (!highlightedInstalledSkillDirectory) {
      return filteredSkills;
    }

    return [...filteredSkills].sort((left, right) => {
      const leftHighlighted =
        left.directory === highlightedInstalledSkillDirectory ? 1 : 0;
      const rightHighlighted =
        right.directory === highlightedInstalledSkillDirectory ? 1 : 0;

      if (leftHighlighted !== rightHighlighted) {
        return rightHighlighted - leftHighlighted;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });
  }, [
    highlightedInstalledSkillDirectory,
    installedLocalSkills,
    installedSkillPresentationCopy,
    searchQuery,
  ]);
  const visibleCuratedTaskTemplates = useMemo(() => {
    void curatedTaskTemplatesVersion;
    void curatedTaskRecommendationSignalsVersion;
    return filterCuratedTaskTemplates(
      searchQuery,
      listCuratedTaskTemplates(curatedTaskTemplateCopy),
    );
  }, [
    curatedTaskRecommendationSignalsVersion,
    curatedTaskTemplateCopy,
    curatedTaskTemplatesVersion,
    searchQuery,
  ]);
  const visibleFeaturedCuratedTaskTemplates = useMemo(
    () =>
      listFeaturedHomeCuratedTaskTemplates(visibleCuratedTaskTemplates, {
        copy: curatedTaskTemplateCopy,
        projectId: pageParams?.creationProjectId,
        limit: FEATURED_HOME_CURATED_TASK_TEMPLATE_IDS.length,
      }),
    [
      curatedTaskTemplateCopy,
      pageParams?.creationProjectId,
      visibleCuratedTaskTemplates,
    ],
  );
  const latestReviewRecommendationSignal = useMemo(() => {
    void curatedTaskRecommendationSignalsVersion;
    return (
      listCuratedTaskRecommendationSignals({
        projectId: pageParams?.creationProjectId,
      })
        .filter((signal) => signal.source === "review_feedback")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
    );
  }, [curatedTaskRecommendationSignalsVersion, pageParams?.creationProjectId]);
  const reviewRecommendationBanner = useMemo(() => {
    if (!latestReviewRecommendationSignal) {
      return null;
    }

    const projection = buildReviewFeedbackProjection({
      signal: latestReviewRecommendationSignal,
    });
    const highlightedTemplates = visibleFeaturedCuratedTaskTemplates
      .filter((featured) => featured.reasonLabel === recentReviewReasonLabel)
      .slice(0, 2);
    if (highlightedTemplates.length === 0) {
      return null;
    }
    const primarySuggestedTemplate =
      (projection?.suggestedTasks[0]
        ? highlightedTemplates.find(
            (featured) =>
              featured.template.id === projection.suggestedTasks[0]?.taskId,
          )
        : null) ?? highlightedTemplates[0];

    return {
      title: latestReviewRecommendationSignal.title,
      summary: summarizeRecentReplayText(
        [
          latestReviewRecommendationSignal.summary,
          projection?.suggestionText ?? "",
        ]
          .filter((segment) => segment.trim().length > 0)
          .join(" "),
        132,
      ),
      nextSteps: highlightedTemplates
        .map((featured) => featured.template.title)
        .join(" / "),
      actionLabel: primarySuggestedTemplate
        ? t("skills.workspace.reviewBanner.action", {
            title: primarySuggestedTemplate.template.title,
          })
        : null,
      onAction: primarySuggestedTemplate
        ? () => {
            setCuratedTaskLauncherTask(primarySuggestedTemplate.template);
            setCuratedTaskLauncherInitialInputValues(null);
            setCuratedTaskLauncherInitialReferenceMemoryIds(null);
            setCuratedTaskLauncherInitialReferenceEntries(null);
            setCuratedTaskLauncherPrefillHint(null);
          }
        : null,
    };
  }, [
    latestReviewRecommendationSignal,
    recentReviewReasonLabel,
    t,
    visibleFeaturedCuratedTaskTemplates,
  ]);
  const visibleRecentPreview = useMemo(
    () => visibleRecentSkills.slice(0, 4),
    [visibleRecentSkills],
  );
  const visibleInstalledPreview = useMemo(
    () => visibleInstalledLocalSkills.slice(0, 4),
    [visibleInstalledLocalSkills],
  );
  const hasSidebarSearchResults =
    searchQuery.trim().length > 0 &&
    (visibleRecentPreview.length > 0 || visibleInstalledPreview.length > 0);
  const installedSkillUsageMap = useMemo(() => {
    void slashEntryUsageVersion;
    return getSlashEntryUsageMap();
  }, [slashEntryUsageVersion]);
  const highlightedInstalledSkill = useMemo(
    () =>
      highlightedInstalledSkillDirectory
        ? (installedLocalSkills.find(
            (skill) => skill.directory === highlightedInstalledSkillDirectory,
          ) ?? null)
        : null,
    [highlightedInstalledSkillDirectory, installedLocalSkills],
  );
  const highlightedInstalledSkillUsage = useMemo(
    () =>
      highlightedInstalledSkill
        ? installedSkillUsageMap.get(
            getSlashEntryUsageRecordKey("skill", highlightedInstalledSkill.key),
          )
        : undefined,
    [highlightedInstalledSkill, installedSkillUsageMap],
  );

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([refreshServiceSkills(), refreshLocalSkills()]);
      toast.success(t("skills.workspace.feedback.refreshSuccess"));
    } catch (error) {
      toast.error(
        t("skills.workspace.feedback.refreshError", {
          message: String(error),
        }),
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleServiceSkillSelect = (skill: ServiceSkillHomeItem) => {
    const prefill = resolveServiceSkillLaunchPrefill({
      skill,
      creationReplay: scaffoldCreationReplay,
      copy: serviceSkillLaunchPrefillCopy,
    });
    onNavigate("agent", {
      ...buildHomeAgentParams({
        projectId: creationProjectId,
      }),
      initialPendingServiceSkillLaunch: {
        skillId: skill.id,
        requestKey: Date.now(),
        initialSlotValues: prefill?.slotValues,
        prefillHint: prefill?.hint,
        launchUserInput: prefill?.launchUserInput,
      },
    });
  };

  const handleInstalledSkillSelect = useCallback(
    (skill: Skill, replayText?: string) => {
      const normalizedReplayText = replayText?.trim() || undefined;
      onNavigate("agent", {
        ...buildHomeAgentParams({
          projectId: creationProjectId,
          ...(normalizedReplayText
            ? {
                initialUserPrompt: normalizedReplayText,
              }
            : {}),
          entryBannerMessage: normalizedReplayText
            ? t("skills.workspace.installedSkill.entryBannerWithReplay", {
                name: skill.name,
              })
            : t("skills.workspace.installedSkill.entryBanner", {
                name: skill.name,
              }),
        }),
        initialInputCapability: {
          capabilityRoute: {
            kind: "installed_skill",
            skillKey: skill.key,
            skillName: skill.name,
          },
          requestKey: Date.now(),
        },
      });
    },
    [creationProjectId, onNavigate, t],
  );

  const handleWorkspaceRuntimeEnable = useCallback(
    (binding: AgentRuntimeWorkspaceSkillBinding) => {
      if (!capabilityDraftWorkspaceRoot) {
        toast.error(t("skills.workspace.runtimeEnable.missingRoot"));
        return;
      }

      const runtimeEnableMetadata =
        buildWorkspaceSkillRuntimeEnableHarnessMetadata({
          workspaceRoot: capabilityDraftWorkspaceRoot,
          bindings: [binding],
        });

      if (!runtimeEnableMetadata) {
        toast.error(t("skills.workspace.runtimeEnable.notReady"));
        return;
      }

      const skillName = binding.name?.trim() || binding.directory;
      onNavigate(
        "agent",
        buildHomeAgentParams({
          projectId: creationProjectId,
          initialUserPrompt: buildWorkspaceRuntimeEnablePrompt(
            binding,
            workspaceRuntimeEnablePromptCopy,
          ),
          autoRunInitialPromptOnMount: true,
          initialAutoSendRequestMetadata: {
            harness: runtimeEnableMetadata,
          },
          entryBannerMessage: t("skills.workspace.runtimeEnable.entryBanner", {
            name: skillName,
          }),
        }),
      );
    },
    [
      capabilityDraftWorkspaceRoot,
      creationProjectId,
      onNavigate,
      t,
      workspaceRuntimeEnablePromptCopy,
    ],
  );

  const handleWorkspaceManagedAutomationDraft = useCallback(
    (
      binding: AgentRuntimeWorkspaceSkillBinding,
      options?: WorkspaceSkillAgentAutomationDraftOptions,
    ) => {
      if (!creationProjectId || !capabilityDraftProject) {
        toast.error(t("skills.workspace.managedJob.missingProject"));
        return;
      }
      if (!capabilityDraftWorkspaceRoot) {
        toast.error(t("skills.workspace.managedJob.missingRoot"));
        return;
      }

      const initialValues = buildWorkspaceSkillAgentAutomationInitialValues({
        binding,
        workspaceRoot: capabilityDraftWorkspaceRoot,
        workspaceId: creationProjectId,
        options,
        copy: workspaceSkillManagedAutomationInitialValuesCopy,
      });
      if (!initialValues) {
        toast.error(t("skills.workspace.managedJob.notReady"));
        return;
      }

      setWorkspaceSkillAutomationInitialValues(initialValues);
      setWorkspaceSkillAutomationDialogOpen(true);
    },
    [
      capabilityDraftProject,
      capabilityDraftWorkspaceRoot,
      creationProjectId,
      t,
      workspaceSkillManagedAutomationInitialValuesCopy,
    ],
  );

  const handleWorkspaceSkillAutomationDialogOpenChange = useCallback(
    (open: boolean) => {
      setWorkspaceSkillAutomationDialogOpen(open);
      if (!open) {
        setWorkspaceSkillAutomationInitialValues(null);
      }
    },
    [],
  );

  const handleWorkspaceSkillAutomationSubmit = useCallback(
    async (payload: AutomationJobDialogSubmit) => {
      if (payload.mode !== "create") {
        throw new Error(t("skills.workspace.managedJob.unsupportedMode"));
      }

      setWorkspaceSkillAutomationSaving(true);
      try {
        const createdJob = await createAutomationJob(payload.request);
        toast.success(
          t("skills.workspace.managedJob.created", {
            name: createdJob.name,
          }),
        );
        setWorkspaceSkillAutomationDialogOpen(false);
        setWorkspaceSkillAutomationInitialValues(null);
      } catch (error) {
        toast.error(
          t("skills.workspace.managedJob.createFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        setWorkspaceSkillAutomationSaving(false);
      }
    },
    [t],
  );

  const handleOpenSceneAppsDirectory = useCallback(() => {
    const normalizedSearchQuery = searchQuery.trim();
    onNavigate(
      "sceneapps",
      resolveSceneAppsPageEntryParams(
        {
          view: "catalog",
          ...(normalizedSearchQuery
            ? {
                search: normalizedSearchQuery,
              }
            : {}),
        },
        {
          mode: "browse",
        },
      ),
    );
  }, [onNavigate, searchQuery]);

  const handleScaffoldCreated = useCallback(
    async (skill: Skill) => {
      const scaffoldReplayText = pageParams?.initialScaffoldDraft
        ? buildSkillScaffoldReplayText(pageParams.initialScaffoldDraft)
        : undefined;

      setOptimisticInstalledSkill(skill);
      try {
        await refreshLocalSkills();
      } catch (error) {
        toast.error(
          t("skills.workspace.feedback.refreshError", {
            message: String(error),
          }),
        );
      }

      if (scaffoldReplayText) {
        recordSlashEntryUsage({
          kind: "skill",
          entryId: skill.key,
          replayText: scaffoldReplayText,
        });
      }

      setSearchQuery("");
      setHighlightedInstalledSkillDirectory(skill.directory);
      setAdvancedManagerOpen(false);
      setConsumedScaffoldRequestKey(
        pageParams?.initialScaffoldRequestKey ?? null,
      );
      toast.success(
        t("skills.workspace.scaffold.created", {
          name: skill.name,
        }),
      );
    },
    [
      pageParams?.initialScaffoldDraft,
      pageParams?.initialScaffoldRequestKey,
      refreshLocalSkills,
      t,
    ],
  );

  const activeScaffoldRequestKey =
    pageParams?.initialScaffoldRequestKey === consumedScaffoldRequestKey
      ? null
      : (pageParams?.initialScaffoldRequestKey ?? null);
  const activeScaffoldDraft =
    pageParams?.initialScaffoldRequestKey === consumedScaffoldRequestKey
      ? null
      : (pageParams?.initialScaffoldDraft ?? null);
  const activeScaffoldTitle = useMemo(
    () =>
      activeScaffoldDraft?.name?.trim() ||
      t("skills.workspace.scaffold.defaultTitle"),
    [activeScaffoldDraft, t],
  );
  const activeScaffoldReplayText = useMemo(
    () =>
      activeScaffoldDraft
        ? buildSkillScaffoldReplayText(activeScaffoldDraft)
        : undefined,
    [activeScaffoldDraft],
  );
  const activeScaffoldSummary = useMemo(() => {
    if (!activeScaffoldDraft) {
      return null;
    }

    const candidates = [
      activeScaffoldDraft.description,
      activeScaffoldDraft.sourceExcerpt,
      activeScaffoldDraft.whenToUse?.[0],
    ]
      .map((value) => value?.replace(/\s+/g, " ").trim())
      .filter((value): value is string => Boolean(value));

    return candidates[0] ?? null;
  }, [activeScaffoldDraft]);

  const handleCuratedTaskTemplateLauncherRequest = useCallback(
    (
      template: CuratedTaskTemplateItem,
      initialInputValues?: CuratedTaskInputValues | null,
      initialReferenceMemoryIds?: string[] | null,
      initialReferenceEntries?: CuratedTaskReferenceEntry[] | null,
      prefillHint?: string | null,
    ) => {
      setCuratedTaskLauncherTask(template);
      setCuratedTaskLauncherInitialInputValues(initialInputValues ?? null);
      setCuratedTaskLauncherInitialReferenceMemoryIds(
        normalizeCuratedTaskReferenceMemoryIds(initialReferenceMemoryIds) ??
          null,
      );
      setCuratedTaskLauncherInitialReferenceEntries(
        mergeCuratedTaskReferenceEntries(initialReferenceEntries ?? []),
      );
      setCuratedTaskLauncherPrefillHint(prefillHint ?? null);
    },
    [],
  );

  const handleCuratedTaskLauncherOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCuratedTaskLauncherTask(null);
      setCuratedTaskLauncherInitialInputValues(null);
      setCuratedTaskLauncherInitialReferenceMemoryIds(null);
      setCuratedTaskLauncherInitialReferenceEntries(null);
      setCuratedTaskLauncherPrefillHint(null);
    }
  }, []);
  const handleApplyLauncherReviewSuggestion = useCallback(
    (
      template: CuratedTaskTemplateItem,
      options: {
        inputValues: CuratedTaskInputValues;
        referenceSelection: CuratedTaskReferenceSelection;
      },
    ) => {
      handleCuratedTaskTemplateLauncherRequest(
        template,
        options.inputValues,
        options.referenceSelection.referenceMemoryIds,
        options.referenceSelection.referenceEntries,
        t("skills.workspace.launcher.reviewPrefillHint"),
      );
    },
    [handleCuratedTaskTemplateLauncherRequest, t],
  );

  const handleCuratedTaskTemplateSelect = useCallback(
    (
      template: CuratedTaskTemplateItem,
      inputValues: CuratedTaskInputValues,
      referenceSelection: CuratedTaskReferenceSelection,
    ) => {
      const normalizedLaunchInputValues =
        normalizeCuratedTaskLaunchInputValues(inputValues);
      recordCuratedTaskTemplateUsage({
        templateId: template.id,
        launchInputValues: inputValues,
        referenceMemoryIds: referenceSelection.referenceMemoryIds,
        referenceEntries: referenceSelection.referenceEntries,
      });
      setCuratedTaskLauncherTask(null);
      setCuratedTaskLauncherInitialInputValues(null);
      setCuratedTaskLauncherInitialReferenceMemoryIds(null);
      setCuratedTaskLauncherInitialReferenceEntries(null);
      setCuratedTaskLauncherPrefillHint(null);
      const resolvedTemplate = template;
      const requestMetadata = buildCuratedTaskLaunchRequestMetadata({
        taskId: resolvedTemplate.id,
        taskTitle: resolvedTemplate.title,
        inputValues,
        referenceMemoryIds: referenceSelection.referenceMemoryIds,
        referenceEntries: referenceSelection.referenceEntries,
      });
      onNavigate(
        "agent",
        buildHomeAgentParams({
          projectId: creationProjectId,
          initialRequestMetadata: requestMetadata,
          initialInputCapability: {
            capabilityRoute: {
              kind: "curated_task",
              taskId: resolvedTemplate.id,
              taskTitle: resolvedTemplate.title,
              prompt: buildCuratedTaskLaunchPrompt({
                task: resolvedTemplate,
                inputValues,
                referenceEntries: referenceSelection.referenceEntries,
              }),
              ...(normalizedLaunchInputValues
                ? {
                    launchInputValues: normalizedLaunchInputValues,
                  }
                : {}),
              ...(referenceSelection.referenceMemoryIds.length > 0
                ? {
                    referenceMemoryIds: referenceSelection.referenceMemoryIds,
                  }
                : {}),
              ...(referenceSelection.referenceEntries.length > 0
                ? {
                    referenceEntries: referenceSelection.referenceEntries,
                  }
                : {}),
            },
            requestKey: Date.now(),
          },
          entryBannerMessage: t("skills.workspace.curatedTask.entryBanner", {
            title: resolvedTemplate.title,
          }),
        }),
      );
    },
    [creationProjectId, onNavigate, t],
  );

  const renderSkillCard = (skill: ServiceSkillHomeItem) => {
    const tone = resolveSkillCardTone(skill);
    const statusLabel = resolveSkillCardStatusLabel(
      skill,
      serviceSkillPresentationCopy,
    );
    const promise = resolveServiceSkillEntryDescription(skill);
    const requiredInputs = summarizeServiceSkillRequiredInputs(skill, {
      copy: serviceSkillPresentationCopy,
    });
    const outputDestination = getServiceSkillOutputDestination(skill, {
      copy: serviceSkillPresentationCopy,
    });
    const actionLabel = getServiceSkillActionLabel(skill, {
      copy: serviceSkillPresentationCopy,
    });

    return (
      <article
        key={skill.id}
        className="flex h-full flex-col rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-sm font-medium text-slate-900">
              {skill.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
              {skill.summary || promise}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              TONE_BADGE_CLASSNAMES[tone],
            )}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <div className="min-w-0 text-[11px] leading-5 text-slate-500">
            <span className="line-clamp-1">{skill.outputHint}</span>
            <span className="sr-only">
              {requiredInputs}
              {outputDestination}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => handleServiceSkillSelect(skill)}
          >
            {actionLabel}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </article>
    );
  };

  return (
    <>
      <div className="lime-workbench-theme-scope flex h-full min-h-0 flex-col overflow-hidden bg-[image:var(--lime-stage-surface)]">
        <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-4 overflow-auto px-6 py-6">
          <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {t("skills.workspace.header.title")}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {t("skills.workspace.header.subtitle")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-50"
                  data-testid="skills-workspace-refresh-button"
                  onClick={() => void handleRefreshAll()}
                  disabled={refreshing}
                >
                  <RefreshCw
                    className={cn(
                      "mr-1.5 h-3.5 w-3.5",
                      refreshing && "animate-spin",
                    )}
                  />
                  {t("skills.workspace.header.refresh")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-50"
                  onClick={handleOpenSceneAppsDirectory}
                >
                  {t("skills.workspace.header.viewAll")}
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {activeScaffoldDraft ? (
                <div
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                  data-testid="skills-workspace-active-scaffold-banner"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        {t("skills.workspace.activeScaffold.badge")}
                      </span>
                      <span className="min-w-0 font-medium text-slate-900">
                        {activeScaffoldTitle}
                      </span>
                      {activeScaffoldSummary ? (
                        <span className="max-w-xl truncate text-xs leading-5 text-slate-500">
                          {t("skills.workspace.activeScaffold.summary", {
                            summary: summarizeRecentReplayText(
                              activeScaffoldSummary,
                            ),
                          })}
                        </span>
                      ) : null}
                      {activeScaffoldReplayText ? (
                        <span className="max-w-xl truncate text-xs leading-5 text-slate-500">
                          {t("skills.workspace.activeScaffold.replay", {
                            summary: summarizeRecentReplayText(
                              activeScaffoldReplayText,
                            ),
                          })}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg px-2.5 text-slate-600 hover:bg-white hover:text-slate-900"
                        data-testid="skills-workspace-open-scaffold-manager"
                        onClick={() => setAdvancedManagerOpen(true)}
                      >
                        {t("skills.workspace.activeScaffold.continueEdit")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        data-testid="skills-workspace-bring-scaffold-to-agent"
                        onClick={() =>
                          handleBringScaffoldToCreation(activeScaffoldDraft)
                        }
                      >
                        {t("skills.workspace.activeScaffold.backToCreation")}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("skills.workspace.search.placeholder")}
                  className="h-10 rounded-lg border-slate-200 bg-slate-50 pl-10"
                />
              </div>
            </div>
          </header>

          {(serviceSkillsError || localSkillsError) && (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
              {serviceSkillsError
                ? t("skills.workspace.error.serviceSkills", {
                    message: serviceSkillsError,
                  })
                : null}
              {serviceSkillsError && localSkillsError
                ? t("skills.workspace.error.separator")
                : null}
              {localSkillsError
                ? t("skills.workspace.error.localSkills", {
                    message: localSkillsError,
                  })
                : null}
            </div>
          )}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    {t("skills.workspace.recommendation.title")}
                  </h2>
                  <span className="text-xs text-slate-500">
                    {t("skills.workspace.recommendation.subtitle")}
                  </span>
                </div>

                {reviewRecommendationBanner ? (
                  <div
                    className="mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                    data-testid="skills-workspace-review-feedback-banner"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-sm font-medium text-slate-900">
                        {t("skills.workspace.reviewBanner.title", {
                          title: reviewRecommendationBanner.title,
                        })}
                      </div>
                      <div className="line-clamp-2 text-xs leading-5 text-slate-600">
                        {reviewRecommendationBanner.summary}
                      </div>
                    </div>
                    <div className="sr-only">
                      {t("skills.workspace.reviewBanner.nextSteps", {
                        nextSteps: reviewRecommendationBanner.nextSteps,
                      })}
                    </div>
                    {reviewRecommendationBanner.actionLabel &&
                    reviewRecommendationBanner.onAction ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        data-testid="skills-workspace-review-feedback-banner-action"
                        onClick={() => reviewRecommendationBanner.onAction?.()}
                      >
                        {reviewRecommendationBanner.actionLabel}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {visibleFeaturedCuratedTaskTemplates.length > 0 ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {visibleFeaturedCuratedTaskTemplates.map(
                      (featured, index) => {
                        const template = featured.template;
                        const isPrimaryRecommendation = index === 0;
                        const launchPrefill =
                          resolveCuratedTaskTemplateLaunchPrefill(
                            template,
                            curatedTaskPresentationCopy,
                          );
                        const reviewPrefillSnapshot =
                          buildSceneAppExecutionReviewPrefillSnapshot({
                            referenceEntries: launchPrefill?.referenceEntries,
                            taskId: template.id,
                          });
                        const reviewPrefillHighlights =
                          buildSceneAppExecutionReviewPrefillHighlights(
                            reviewPrefillSnapshot,
                          );
                        const recentUsageDescription =
                          buildCuratedTaskRecentUsageDescription({
                            copy: curatedTaskPresentationCopy,
                            task: template,
                            prefill: launchPrefill,
                          });
                        const compactReasonSummary =
                          featured.reasonSummary || recentUsageDescription;
                        const compactBaselineSummary =
                          formatCompactReviewBaselineSummary({
                            sourceTitle: reviewPrefillSnapshot?.sourceTitle,
                            highlights: reviewPrefillHighlights,
                          });
                        const requiredSummary =
                          summarizeCuratedTaskRequiredInputs(
                            template,
                            2,
                            curatedTaskPresentationCopy,
                          );
                        const outputSummary =
                          summarizeCuratedTaskOutputContract(
                            template,
                            2,
                            curatedTaskPresentationCopy,
                          );
                        const followUpSummary =
                          summarizeCuratedTaskFollowUpActions(
                            template,
                            2,
                            curatedTaskPresentationCopy,
                          );
                        const resultDestination =
                          getCuratedTaskOutputDestination(template);

                        return (
                          <article
                            key={template.id}
                            className={cn(
                              "flex h-full flex-col rounded-xl border px-3 py-2.5 transition hover:border-slate-300 hover:shadow-sm",
                              isPrimaryRecommendation
                                ? "border-emerald-200 bg-emerald-50/60"
                                : "border-slate-200 bg-white",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="line-clamp-1 text-sm font-medium text-slate-950">
                                  {template.title}
                                </h3>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                                  {template.summary}
                                </p>
                              </div>
                              {isPrimaryRecommendation ? (
                                <span className="shrink-0 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                  {t(
                                    "skills.workspace.featured.recommendedBadge",
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 space-y-2">
                              {featured.reasonLabel || compactReasonSummary ? (
                                <div className="line-clamp-1 text-[11px] leading-5 text-slate-500">
                                  {[featured.reasonLabel, compactReasonSummary]
                                    .filter((segment): segment is string =>
                                      Boolean(segment && segment.trim()),
                                    )
                                    .join(" · ")}
                                </div>
                              ) : null}
                              {reviewPrefillHighlights.length > 0 ? (
                                <div className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] leading-5 text-emerald-800">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900">
                                      {t(
                                        "skills.workspace.featured.reuseResult",
                                      )}
                                    </span>
                                    <span className="min-w-0 flex-1 line-clamp-1">
                                      {compactBaselineSummary}
                                    </span>
                                  </div>
                                  <div className="sr-only">
                                    {t(
                                      "skills.workspace.featured.currentBaseline",
                                      {
                                        sourceTitle:
                                          reviewPrefillSnapshot?.sourceTitle ||
                                          t(
                                            "skills.workspace.featured.defaultSourceTitle",
                                          ),
                                      },
                                    )}
                                    {reviewPrefillHighlights.map((item) => (
                                      <div key={`${template.id}-${item}`}>
                                        {item}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                              <div className="min-w-0 text-[11px] leading-5 text-slate-500">
                                <div className="line-clamp-1">
                                  {template.outputHint || outputSummary}
                                </div>
                                <span className="sr-only">
                                  {requiredSummary}
                                  {resultDestination}
                                  {followUpSummary}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                                onClick={() =>
                                  handleCuratedTaskTemplateLauncherRequest(
                                    template,
                                  )
                                }
                              >
                                {t("skills.workspace.featured.launch")}
                                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </article>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    {hasSidebarSearchResults
                      ? t("skills.workspace.empty.resultTemplates.hasSidebar")
                      : t("skills.workspace.empty.resultTemplates.default")}
                  </div>
                )}
              </section>

              {selectedGroup ? (
                <>
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <h2 className="text-base font-semibold text-slate-900">
                          {selectedGroup.title}
                        </h2>
                        <p className="text-xs leading-5 text-slate-600">
                          {t("skills.workspace.group.selectedSubtitle")}
                        </p>
                        <span className="sr-only">
                          {selectedGroup.summary}
                          {selectedGroup.entryHint}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => setSelectedGroupKey(null)}
                      >
                        {t("skills.workspace.group.back")}
                      </Button>
                    </div>
                  </section>

                  {visibleGroupSkills.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {visibleGroupSkills.map(renderSkillCard)}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                      <div className="text-sm font-semibold text-slate-900">
                        {t("skills.workspace.group.emptyTitle")}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {t("skills.workspace.group.emptyDescription")}
                      </p>
                    </div>
                  )}
                </>
              ) : visibleGroups.length > 0 ? (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">
                        {t("skills.workspace.categories.title")}
                      </h2>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={handleOpenSceneAppsDirectory}
                      >
                        {t("skills.workspace.header.viewAll")}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {visibleGroups.map((group) => {
                      const groupSkills =
                        recommendedSkillGroupMap.get(group.key) ?? [];
                      const hasRecommendedGroupSkills = groupSkills.length > 0;
                      const starterSummary = hasRecommendedGroupSkills
                        ? formatSkillGroupStarterSummary(groupSkills)
                        : t("skills.workspace.categories.defaultStarter");

                      return (
                        <article
                          key={group.key}
                          className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0"
                        >
                          <div className="min-w-0">
                            <h3 className="text-sm font-medium text-slate-900">
                              {group.title}
                            </h3>
                            <div className="mt-1 line-clamp-1 text-[12px] leading-5 text-slate-600">
                              {starterSummary}
                            </div>
                            <span className="sr-only">
                              {group.summary}
                              {group.themeTarget}
                              {group.entryHint}
                            </span>
                          </div>

                          <div className="shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                              onClick={() => setSelectedGroupKey(group.key)}
                            >
                              {t("skills.workspace.categories.open")}
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                  <div className="text-sm font-semibold text-slate-900">
                    {hasSidebarSearchResults
                      ? t("skills.workspace.empty.skillGroups.hasSidebarTitle")
                      : t("skills.workspace.empty.skillGroups.defaultTitle")}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {hasSidebarSearchResults
                      ? t(
                          "skills.workspace.empty.skillGroups.hasSidebarDescription",
                        )
                      : t(
                          "skills.workspace.empty.skillGroups.defaultDescription",
                        )}
                  </p>
                </div>
              )}
            </div>

            <aside className="space-y-3">
              <section
                className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm"
                data-testid="skills-workspace-sidebar-section-continuation"
              >
                <h2 className="text-sm font-semibold text-emerald-900">
                  {t("skills.workspace.sidebar.recent.title")}
                </h2>

                {visibleRecentPreview.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {visibleRecentPreview.map((skill) => {
                      const recentPrefill = resolveServiceSkillLaunchPrefill({
                        skill,
                        copy: serviceSkillLaunchPrefillCopy,
                      });
                      const recentPrefillSummary =
                        buildServiceSkillLaunchPrefillSummary({
                          skill,
                          slotValues: recentPrefill?.slotValues,
                          launchUserInput: recentPrefill?.launchUserInput,
                          copy: serviceSkillLaunchPrefillCopy,
                        });

                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => handleServiceSkillSelect(skill)}
                          className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2.5 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
                        >
                          <div className="line-clamp-1 text-sm font-medium text-slate-900">
                            {skill.title}
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-600">
                            {skill.summary}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                            <span className="min-w-0 line-clamp-1">
                              {recentPrefillSummary || skill.outputHint}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                            <span className="sr-only">
                              {summarizeServiceSkillRequiredInputs(skill, {
                                copy: serviceSkillPresentationCopy,
                              })}
                              {getServiceSkillOutputDestination(skill, {
                                copy: serviceSkillPresentationCopy,
                              })}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-emerald-200 bg-white px-4 py-6 text-sm text-emerald-700/80">
                    {t("skills.workspace.sidebar.recent.empty")}
                    <span className="sr-only">
                      {t("skills.workspace.sidebar.recent.emptySr")}
                    </span>
                  </div>
                )}
              </section>

              <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                  {t("skills.workspace.sidebar.drafts.title")}
                </summary>
                <div className="mt-3">
                  <CapabilityDraftPanel
                    workspaceRoot={capabilityDraftWorkspaceRoot}
                    projectPending={capabilityDraftProjectLoading}
                    projectError={capabilityDraftProjectError}
                    highlightedDraftId={highlightedCapabilityDraftId}
                    onRegisteredSkillsChanged={() =>
                      setRegisteredSkillsRefreshSignal(
                        (previous) => previous + 1,
                      )
                    }
                  />
                </div>
              </details>

              <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                  {t("skills.workspace.sidebar.registered.title")}
                </summary>
                <div className="mt-3">
                  <WorkspaceRegisteredSkillsPanel
                    workspaceRoot={capabilityDraftWorkspaceRoot}
                    workspaceId={creationProjectId}
                    projectPending={capabilityDraftProjectLoading}
                    projectError={capabilityDraftProjectError}
                    refreshSignal={registeredSkillsRefreshSignal}
                    onEnableRuntime={handleWorkspaceRuntimeEnable}
                    onCreateManagedAutomationDraft={
                      handleWorkspaceManagedAutomationDraft
                    }
                  />
                </div>
              </details>

              <section
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                data-testid="skills-workspace-sidebar-section-library"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {t("skills.workspace.sidebar.local.title")}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg px-2.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setAdvancedManagerOpen(true)}
                  >
                    <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                    {t("skills.workspace.sidebar.local.manage")}
                  </Button>
                </div>

                {visibleInstalledPreview.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {highlightedInstalledSkill ? (
                      <div
                        className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 shadow-sm"
                        data-testid="skills-workspace-highlighted-skill-banner"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                              {t(
                                "skills.workspace.sidebar.local.highlightedBadge",
                              )}
                            </span>
                            <span className="min-w-0 font-semibold text-slate-900">
                              {highlightedInstalledSkill.name}
                            </span>
                            {highlightedInstalledSkillUsage?.replayText ? (
                              <span className="max-w-xl truncate text-xs leading-5 text-slate-500">
                                {formatInstalledSkillRecentUsageDescription(
                                  highlightedInstalledSkillUsage.replayText,
                                )}
                              </span>
                            ) : null}
                            <span className="text-xs leading-5 text-slate-500">
                              {t(
                                "skills.workspace.sidebar.local.highlightedDescription",
                              )}
                            </span>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              data-testid="skills-workspace-highlighted-skill-continue"
                              onClick={() =>
                                handleInstalledSkillSelect(
                                  highlightedInstalledSkill,
                                  highlightedInstalledSkillUsage?.replayText,
                                )
                              }
                            >
                              {t(
                                "skills.workspace.sidebar.local.backToGeneration",
                              )}
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {visibleInstalledPreview.map((skill) => {
                      const isHighlighted =
                        skill.directory === highlightedInstalledSkillDirectory;
                      const usage = installedSkillUsageMap.get(
                        getSlashEntryUsageRecordKey("skill", skill.key),
                      );
                      const recentUsageDescription =
                        formatInstalledSkillRecentUsageDescription(
                          usage?.replayText,
                        );

                      return (
                        <article
                          key={skill.directory}
                          className={cn(
                            "rounded-lg border bg-white px-3 py-2.5 transition",
                            isHighlighted
                              ? "border-emerald-300 bg-emerald-50/70 shadow-sm"
                              : "border-slate-200 hover:border-slate-300",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="line-clamp-1 text-sm font-medium text-slate-900">
                              {skill.name}
                            </div>
                            {isHighlighted ? (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                                {t(
                                  "skills.workspace.sidebar.local.highlightedBadge",
                                )}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-1 text-[12px] leading-5 text-slate-600">
                            {resolveInstalledSkillPromise(
                              skill,
                              installedSkillPresentationCopy,
                            )}
                          </p>
                          <div className="mt-1.5 text-[11px] leading-5 text-slate-500">
                            <div className="line-clamp-1">
                              {recentUsageDescription ||
                                getInstalledSkillOutputHint(
                                  skill,
                                  installedSkillPresentationCopy,
                                )}
                            </div>
                            <span className="sr-only">
                              {summarizeInstalledSkillRequiredInputs(
                                skill,
                                installedSkillPresentationCopy,
                              )}
                              {getInstalledSkillOutputHint(
                                skill,
                                installedSkillPresentationCopy,
                              )}
                              {t("skills.workspace.sidebar.local.generationSr")}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="line-clamp-1 text-[11px] leading-5 text-slate-500">
                              {t("skills.workspace.sidebar.local.continueHint")}
                              <span className="sr-only">
                                {t(
                                  "skills.workspace.sidebar.local.continueHintSr",
                                )}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 rounded-lg border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                              onClick={() =>
                                handleInstalledSkillSelect(
                                  skill,
                                  usage?.replayText,
                                )
                              }
                            >
                              {t(
                                "skills.workspace.sidebar.local.continueAction",
                              )}
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    {t("skills.workspace.sidebar.local.empty")}
                  </div>
                )}
              </section>
            </aside>
          </section>
        </div>
      </div>

      <Dialog open={advancedManagerOpen} onOpenChange={setAdvancedManagerOpen}>
        <DialogContent className="lime-workbench-theme-scope max-h-[calc(100vh-40px)] w-[min(1240px,calc(100vw-32px))] max-w-none overflow-hidden border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0">
          <div className="flex h-[calc(100vh-88px)] min-h-[680px] flex-col bg-white">
            <DialogHeader className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{t("skills.workspace.manager.title")}</DialogTitle>
                <WorkbenchInfoTip
                  ariaLabel={t("skills.workspace.manager.tipAria")}
                  content={t("skills.workspace.manager.tipContent")}
                  tone="mint"
                />
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
              <SkillsPage
                hideHeader
                initialScaffoldDraft={activeScaffoldDraft}
                initialScaffoldRequestKey={activeScaffoldRequestKey}
                onBringScaffoldToCreation={handleBringScaffoldToCreation}
                onScaffoldCreated={handleScaffoldCreated}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CuratedTaskLauncherDialog
        open={Boolean(curatedTaskLauncherTask)}
        task={curatedTaskLauncherTask}
        projectId={pageParams?.creationProjectId}
        initialInputValues={curatedTaskLauncherInitialInputValues}
        initialReferenceMemoryIds={curatedTaskLauncherInitialReferenceMemoryIds}
        initialReferenceEntries={curatedTaskLauncherInitialReferenceEntries}
        prefillHint={curatedTaskLauncherPrefillHint}
        onOpenChange={handleCuratedTaskLauncherOpenChange}
        onApplyReviewSuggestion={handleApplyLauncherReviewSuggestion}
        onConfirm={handleCuratedTaskTemplateSelect}
      />

      <AutomationJobDialog
        open={workspaceSkillAutomationDialogOpen}
        mode="create"
        workspaces={capabilityDraftProject ? [capabilityDraftProject] : []}
        initialValues={workspaceSkillAutomationInitialValues}
        saving={workspaceSkillAutomationSaving}
        onOpenChange={handleWorkspaceSkillAutomationDialogOpenChange}
        onSubmit={handleWorkspaceSkillAutomationSubmit}
      />
    </>
  );
}
