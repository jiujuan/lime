import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useSkills } from "@/hooks/useSkills";
import {
  skillsApi,
  type CreateSkillScaffoldRequest,
  type Skill,
} from "@/lib/api/skills";
import type {
  Page,
  PageParams,
  SkillScaffoldDraft,
  SkillsPageParams,
} from "@/types/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CuratedTaskLauncherDialog } from "@/components/agent/chat/components/CuratedTaskLauncherDialog";
import { resolveServiceSkillEntryDescription } from "@/components/agent/chat/service-skills/entryAdapter";
import { buildServiceSkillRecommendationBuckets } from "@/components/agent/chat/service-skills/recommendedServiceSkills";
import {
  resolveServiceSkillLaunchPrefill,
  type ServiceSkillLaunchPrefillCopy,
} from "@/components/agent/chat/service-skills/serviceSkillLaunchPrefill";
import {
  buildServiceSkillCapabilityDescription,
  getServiceSkillTypeLabel,
  type ServiceSkillPresentationCopy,
} from "@/components/agent/chat/service-skills/skillPresentation";
import type {
  ServiceSkillHomeItem,
  ServiceSkillTone,
} from "@/components/agent/chat/service-skills/types";
import { useServiceSkills } from "@/components/agent/chat/service-skills/useServiceSkills";
import {
  buildInstalledSkillCapabilityDescription,
  resolveInstalledSkillPromise,
  type InstalledSkillPresentationCopy,
} from "./installedSkillPresentation";
import { SkillScaffoldDialog } from "./SkillScaffoldDialog";
import { buildHomeAgentParams } from "@/lib/workspace/navigation";
import { buildSkillScaffoldCreationReplayRequestMetadata } from "@/components/agent/chat/utils/creationReplayMetadata";
import {
  buildSkillScaffoldCreationSeed,
  buildSkillScaffoldReplayText,
} from "./skillScaffoldCreationSeed";
import {
  FEATURED_HOME_CURATED_TASK_TEMPLATE_IDS,
  buildCuratedTaskTemplateCopy,
  buildCuratedTaskLaunchPrompt,
  filterCuratedTaskTemplates,
  getCuratedTaskOutputDestination,
  listCuratedTaskTemplates,
  listFeaturedHomeCuratedTaskTemplates,
  recordCuratedTaskTemplateUsage,
  subscribeCuratedTaskTemplateUsageChanged,
  type CuratedTaskInputValues,
  type CuratedTaskTemplateItem,
} from "@/components/agent/chat/utils/curatedTaskTemplates";
import {
  buildCuratedTaskLaunchRequestMetadata,
  mergeCuratedTaskReferenceEntries,
  normalizeCuratedTaskReferenceMemoryIds,
  type CuratedTaskReferenceEntry,
  normalizeCuratedTaskLaunchInputValues,
  type CuratedTaskReferenceSelection,
} from "@/components/agent/chat/utils/curatedTaskReferenceSelection";
import { subscribeCuratedTaskRecommendationSignalsChanged } from "@/components/agent/chat/utils/curatedTaskRecommendationSignals";
import { recordSlashEntryUsage } from "@/components/agent/chat/skill-selection/slashEntryUsage";
import { formatList, formatNumber } from "@/i18n/format";
import type agentResource from "@/i18n/resources/zh-CN/agent.json";

interface SkillsWorkspacePageProps {
  onNavigate: (page: Page, params?: PageParams) => void;
  pageParams?: SkillsPageParams;
}

type SkillsWorkspaceView = "store" | "builtin" | "installed";

type AgentI18nKey = keyof typeof agentResource;

function SkillsBannerSvg() {
  return (
    <svg
      viewBox="0 0 260 150"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className="h-full w-full"
    >
      <defs>
        <linearGradient id="skills-banner-green" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <circle cx="158" cy="34" r="52" fill="#bbf7d0" opacity="0.55" />
      <g transform="translate(46 8) rotate(-16)">
        <rect
          width="92"
          height="104"
          rx="4"
          fill="#fff"
          stroke="#e5e7eb"
          strokeWidth="2"
        />
        <rect x="12" y="14" width="56" height="8" rx="4" fill="#d1d5db" />
        <rect x="12" y="30" width="48" height="6" rx="3" fill="#cbd5e1" />
        <circle cx="44" cy="58" r="18" fill="#f59e0b" />
        <path
          d="M38 48h12c7 0 11 4 11 10s-5 10-12 10h-3v13h-8V48Zm10 14c4 0 6-1 6-4s-2-4-6-4h-2v8h2Z"
          fill="#fff"
        />
      </g>
      <g transform="translate(106 2) rotate(12)">
        <rect
          width="98"
          height="110"
          rx="4"
          fill="#fff"
          stroke="#e5e7eb"
          strokeWidth="2"
        />
        <circle cx="34" cy="42" r="18" fill="url(#skills-banner-green)" />
        <path
          d="M25 42c5-8 14-8 19 0-5 8-14 8-19 0Z"
          fill="#064e3b"
          opacity="0.65"
        />
        <rect x="18" y="70" width="58" height="7" rx="3.5" fill="#cbd5e1" />
        <rect x="18" y="85" width="42" height="7" rx="3.5" fill="#e2e8f0" />
      </g>
      <g transform="translate(156 66) rotate(10)">
        <rect
          width="78"
          height="54"
          rx="4"
          fill="#fff"
          stroke="#e5e7eb"
          strokeWidth="2"
        />
        <circle cx="25" cy="27" r="13" fill="#60a5fa" />
        <path d="M19 27c4-6 9-6 13 0-4 6-9 6-13 0Z" fill="#fff" />
        <path
          d="M46 18c12 5 14 19 4 27"
          fill="none"
          stroke="#fb7185"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </g>
    </svg>
  );
}

function SkillTileSvg({ tone = "emerald" }: { tone?: ServiceSkillTone }) {
  const fillByTone: Record<ServiceSkillTone, string> = {
    amber: "#f59e0b",
    emerald: "#10b981",
    sky: "#0ea5e9",
    slate: "#475569",
  };
  const fill = fillByTone[tone];

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-10 w-10">
      <rect x="3" y="3" width="42" height="42" rx="13" fill="#fff" />
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="13"
        fill={fill}
        opacity="0.1"
      />
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="13"
        stroke={fill}
        strokeOpacity="0.22"
        strokeWidth="2"
      />
      <path d="M24 12 34 18v12l-10 6-10-6V18l10-6Z" fill={fill} opacity="0.9" />
      <path
        d="m18 20 6 4 6-4M24 24v8"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

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

const SKILL_AUTO_LOAD_PREFERENCES_STORAGE_KEY =
  "lime.skills.autoLoadPreferences.v1";

type SkillAutoLoadPreferences = Record<string, boolean>;

function getSkillAutoLoadPreferenceKey(
  skill: Pick<Skill, "directory" | "key">,
) {
  return skill.directory || skill.key;
}

function readSkillAutoLoadPreferences(): SkillAutoLoadPreferences {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(
      SKILL_AUTO_LOAD_PREFERENCES_STORAGE_KEY,
    );
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<SkillAutoLoadPreferences>(
      (preferences, [key, value]) => {
        if (typeof key === "string" && typeof value === "boolean") {
          preferences[key] = value;
        }
        return preferences;
      },
      {},
    );
  } catch {
    return {};
  }
}

function writeSkillAutoLoadPreferences(
  preferences: SkillAutoLoadPreferences,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SKILL_AUTO_LOAD_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // 偏好保存失败不应阻断用户继续使用技能。
  }
}

function isSkillAutoLoadEnabled(
  skill: Pick<Skill, "directory" | "key">,
  preferences: SkillAutoLoadPreferences,
): boolean {
  return preferences[getSkillAutoLoadPreferenceKey(skill)] ?? true;
}

function resolveSkillCardTone(skill: ServiceSkillHomeItem): ServiceSkillTone {
  if (skill.automationStatus?.tone) {
    return skill.automationStatus.tone;
  }
  return skill.runnerTone;
}

export function SkillsWorkspacePage({
  onNavigate,
  pageParams,
}: SkillsWorkspacePageProps) {
  const { t, i18n } = useTranslation("agent");
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
  const curatedTaskTemplateCopy = useMemo(
    () =>
      buildCuratedTaskTemplateCopy((key, values) =>
        t(key as AgentI18nKey, values ?? {}),
      ),
    [t],
  );
  const {
    skills: serviceSkills = [],
    error: serviceSkillsError,
    refresh: refreshServiceSkills,
  } = useServiceSkills();
  const {
    skills: localSkills = [],
    error: localSkillsError,
    refresh: refreshLocalSkills,
    uninstall: uninstallLocalSkill,
  } = useSkills("lime", { includeRepos: false });

  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<SkillsWorkspaceView>(
    pageParams?.initialView === "manage" ||
      pageParams?.initialView === "installed"
      ? "installed"
      : "store",
  );
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
  const [refreshing, setRefreshing] = useState(false);
  const [uninstallingSkillDirectory, setUninstallingSkillDirectory] = useState<
    string | null
  >(null);
  const [skillAutoLoadPreferences, setSkillAutoLoadPreferences] =
    useState<SkillAutoLoadPreferences>(() => readSkillAutoLoadPreferences());
  const [scaffoldDialogOpen, setScaffoldDialogOpen] = useState(false);
  const [scaffoldDialogDraft, setScaffoldDialogDraft] =
    useState<SkillScaffoldDraft | null>(null);
  const [scaffoldCreating, setScaffoldCreating] = useState(false);
  const [importingLocalSkill, setImportingLocalSkill] = useState(false);
  const [
    highlightedInstalledSkillDirectory,
    setHighlightedInstalledSkillDirectory,
  ] = useState<string | null>(null);
  const [optimisticInstalledSkill, setOptimisticInstalledSkill] =
    useState<Skill | null>(null);
  const [consumedScaffoldRequestKey, setConsumedScaffoldRequestKey] = useState<
    number | null
  >(null);
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
  const creationProjectId = pageParams?.creationProjectId?.trim() || undefined;
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
    if (
      pageParams?.initialView === "manage" ||
      pageParams?.initialView === "installed"
    ) {
      setActiveView("installed");
      return;
    }
    if (pageParams?.initialView === "builtin") {
      setActiveView("builtin");
      return;
    }
    if (pageParams?.initialView === "store") {
      setActiveView("store");
    }
  }, [pageParams?.initialView]);

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
    setActiveView("installed");
  }, [pageParams?.initialScaffoldDraft, pageParams?.initialScaffoldRequestKey]);

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
    (skill: Skill) => {
      onNavigate("agent", {
        ...buildHomeAgentParams({
          projectId: creationProjectId,
        }),
        initialInputCapability: {
          capabilityRoute: {
            kind: "installed_skill",
            skillKey: skill.key,
            skillName: skill.name,
          },
          requestKey: Date.now(),
        },
        preferHomeForInitialInputCapability: true,
      });
    },
    [creationProjectId, onNavigate],
  );

  const handleUninstallLocalSkill = useCallback(
    async (skill: Skill) => {
      if (skill.sourceKind === "builtin" || skill.catalogSource === "project") {
        return;
      }

      setUninstallingSkillDirectory(skill.directory);
      try {
        await uninstallLocalSkill(skill.directory);
        if (optimisticInstalledSkill?.directory === skill.directory) {
          setOptimisticInstalledSkill(null);
        }
        if (highlightedInstalledSkillDirectory === skill.directory) {
          setHighlightedInstalledSkillDirectory(null);
        }
        const preferenceKey = getSkillAutoLoadPreferenceKey(skill);
        setSkillAutoLoadPreferences((previous) => {
          if (!(preferenceKey in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[preferenceKey];
          writeSkillAutoLoadPreferences(next);
          return next;
        });
        toast.success(
          t("skills.workspace.installedSkill.uninstallSuccess", {
            name: skill.name,
          }),
        );
      } catch (error) {
        toast.error(
          t("skills.workspace.installedSkill.uninstallFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        setUninstallingSkillDirectory(null);
      }
    },
    [
      highlightedInstalledSkillDirectory,
      optimisticInstalledSkill?.directory,
      t,
      uninstallLocalSkill,
    ],
  );

  const handleSkillAutoLoadChange = useCallback(
    (skill: Skill, enabled: boolean) => {
      setSkillAutoLoadPreferences((previous) => {
        const key = getSkillAutoLoadPreferenceKey(skill);
        const next = { ...previous, [key]: enabled };
        writeSkillAutoLoadPreferences(next);
        return next;
      });
      toast.success(
        t(
          enabled
            ? "skills.workspace.autoLoad.enabledToast"
            : "skills.workspace.autoLoad.disabledToast",
          {
            name: skill.name,
          },
        ),
      );
    },
    [t],
  );

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
      setActiveView("installed");
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

  const handleCreateScaffold = useCallback(
    async (request: CreateSkillScaffoldRequest) => {
      setScaffoldCreating(true);
      try {
        const inspection = await skillsApi.createSkillScaffold(request, "lime");
        const createdSkill: Skill = {
          key: `local:${request.directory}`,
          name: request.name,
          description: request.description,
          directory: request.directory,
          installed: true,
          sourceKind: "other",
          catalogSource: request.target,
          license: inspection.license,
          metadata: inspection.metadata,
          allowedTools: inspection.allowedTools,
          resourceSummary: inspection.resourceSummary,
          standardCompliance: inspection.standardCompliance,
        };
        setScaffoldDialogOpen(false);
        setScaffoldDialogDraft(null);
        await handleScaffoldCreated(createdSkill);
      } catch (error) {
        toast.error(
          t("skills.workspace.scaffold.createFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        setScaffoldCreating(false);
      }
    },
    [handleScaffoldCreated, t],
  );

  const handleImportLocalSkill = useCallback(async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("skills.workspace.import.dialogTitle"),
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    setImportingLocalSkill(true);
    try {
      const result = await skillsApi.importLocalSkill(selected, "lime");
      await refreshLocalSkills();
      setActiveView("installed");
      setSearchQuery("");
      setHighlightedInstalledSkillDirectory(result.directory);
      toast.success(t("skills.workspace.import.success"));
    } catch (error) {
      toast.error(
        t("skills.workspace.import.failed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setImportingLocalSkill(false);
    }
  }, [refreshLocalSkills, t]);

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

  const visibleStoreSkills = useMemo(() => {
    return workspaceServiceSkills
      .filter((skill) =>
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
      )
      .slice(0, 12);
  }, [searchQuery, serviceSkillPresentationCopy, workspaceServiceSkills]);

  const visibleBuiltinLocalSkills = useMemo(
    () =>
      localSkills
        .filter((skill) => skill.sourceKind === "builtin")
        .filter((skill) =>
          matchesText(searchQuery, skill.name, skill.description, skill.key),
        ),
    [localSkills, searchQuery],
  );
  const visibleUserInstalledSkills = useMemo(
    () =>
      visibleInstalledLocalSkills.filter(
        (skill) => skill.sourceKind !== "builtin",
      ),
    [visibleInstalledLocalSkills],
  );
  const skillStoreCount =
    visibleCuratedTaskTemplates.length + workspaceServiceSkills.length;
  const builtinSkillCount = visibleBuiltinLocalSkills.length;
  const installedSkillCount = visibleUserInstalledSkills.length;
  const viewTabs: Array<{
    key: SkillsWorkspaceView;
    label: string;
    count?: number;
  }> = [
    {
      key: "store",
      label: t("skills.workspace.view.store", "技能广场"),
      count: skillStoreCount,
    },
    {
      key: "builtin",
      label: t("skills.workspace.view.builtin", "内置"),
      count: builtinSkillCount,
    },
    {
      key: "installed",
      label: t("skills.workspace.view.installed", "用户安装"),
      count: installedSkillCount,
    },
  ];

  const renderAutoLoadControl = (skill: Skill) => {
    const enabled = isSkillAutoLoadEnabled(skill, skillAutoLoadPreferences);

    return (
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="hidden min-w-[86px] sm:block">
          <div className="text-[11px] font-semibold leading-4 text-slate-700">
            {t("skills.workspace.autoLoad.label", "自动加载")}
          </div>
          <div className="text-[10px] leading-3 text-slate-400">
            {enabled
              ? t("skills.workspace.autoLoad.on", "已开启")
              : t("skills.workspace.autoLoad.off", "已关闭")}
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(nextEnabled) =>
            handleSkillAutoLoadChange(skill, nextEnabled)
          }
          aria-label={t("skills.workspace.autoLoad.aria", {
            name: skill.name,
          })}
        />
      </div>
    );
  };

  return (
    <>
      <div className="lime-workbench-theme-scope flex h-full min-h-0 flex-col overflow-hidden bg-white">
        <header className="flex shrink-0 items-center justify-end gap-2 border-b border-slate-100 bg-white px-5 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100"
            data-testid="skills-workspace-refresh-button"
            onClick={() => void handleRefreshAll()}
            disabled={refreshing}
            aria-label={t("skills.workspace.header.refresh")}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
          </Button>
          <label className="relative hidden w-[220px] sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("skills.workspace.search.placeholder", "搜索技能")}
              className="h-8 rounded-full border-slate-200 bg-white pl-8 pr-3 text-xs shadow-none"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-none hover:bg-slate-50"
            onClick={() => {
              setScaffoldDialogDraft(null);
              setScaffoldDialogOpen(true);
            }}
          >
            {t("skills.workspace.header.createWithLime", "通过 Lime 创建")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
            disabled={importingLocalSkill}
            onClick={() => void handleImportLocalSkill()}
          >
            {importingLocalSkill
              ? t("skills.workspace.header.installingSkill", "安装中")
              : t("skills.workspace.header.installSkill", "安装技能")}
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-5 pb-10 pt-8 lg:px-10 xl:px-14">
          <div className="mx-auto w-full max-w-[1180px] space-y-6 2xl:max-w-[1280px]">
            <section className="space-y-3">
              <div>
                <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-950">
                  {t("skills.workspace.header.title", "技能")}
                </h1>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {t(
                    "skills.workspace.header.subtitle",
                    "安装和管理技能，需要时带回首页输入框使用。",
                  )}
                </p>
              </div>
              <div
                className="relative h-[116px] overflow-hidden rounded-lg lg:h-[132px]"
                style={{
                  background:
                    "linear-gradient(135deg, #f3fbff 0%, #e6f7ff 52%, #dcf3ff 100%)",
                }}
              >
                <div className="pointer-events-none absolute -right-4 top-1/2 hidden h-[128px] w-[222px] -translate-y-1/2 sm:block lg:right-8 lg:h-[148px] lg:w-[256px]">
                  <SkillsBannerSvg />
                </div>
                <div className="absolute left-4 top-1/2 max-w-[420px] -translate-y-1/2 pr-5 lg:left-6">
                  <div className="text-sm font-semibold text-slate-950">
                    {t("skills.workspace.hero.title", "为你精选的职场技能")}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {t(
                      "skills.workspace.hero.description",
                      "覆盖写作、效率、设计、数据分析等多种场景，一键安装。",
                    )}
                  </p>
                </div>
              </div>
            </section>

            {activeScaffoldDraft ? (
              <section
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                data-testid="skills-workspace-active-scaffold-banner"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold">
                      {t("skills.workspace.activeScaffold.badge", "新技能")}
                    </span>
                    <span className="ml-2 text-emerald-900">
                      {activeScaffoldTitle}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-emerald-200 bg-white px-3 text-xs text-emerald-800 hover:bg-emerald-50"
                    data-testid="skills-workspace-bring-scaffold-to-agent"
                    onClick={() =>
                      handleBringScaffoldToCreation(activeScaffoldDraft)
                    }
                  >
                    {t(
                      "skills.workspace.activeScaffold.backToCreation",
                      "回去继续完善",
                    )}
                  </Button>
                </div>
              </section>
            ) : null}

            {(serviceSkillsError || localSkillsError) && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
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
              </section>
            )}

            <nav className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="flex items-center gap-2 rounded-full bg-slate-100 p-1"
                role="tablist"
                aria-label={t("skills.workspace.view.tabsLabel", "技能分页")}
              >
                {viewTabs.map((tab) => {
                  const active = activeView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`skills-${tab.key}-view`}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold transition",
                        active
                          ? "bg-white text-slate-950 shadow-sm shadow-slate-950/5"
                          : "text-slate-500 hover:text-slate-800",
                      )}
                      onClick={() => setActiveView(tab.key)}
                    >
                      {tab.label}
                      {tab.key === "installed" &&
                      typeof tab.count === "number" ? (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {formatNumber(tab.count, { locale: i18n.language })}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {activeView === "store" ? (
                <div className="hidden items-center gap-2 sm:flex">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-slate-200 bg-white px-3 text-xs text-slate-600 shadow-none hover:bg-slate-50"
                  >
                    {t("skills.workspace.filter.all", "全部")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-slate-200 bg-white px-3 text-xs text-slate-600 shadow-none hover:bg-slate-50"
                  >
                    {t("skills.workspace.sort.hot", "排序：热门")}
                  </Button>
                </div>
              ) : null}
            </nav>

            {activeView === "store" ? (
              <div
                id="skills-store-view"
                role="tabpanel"
                className="space-y-6"
                data-testid="skills-store-view"
              >
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold text-slate-700">
                    {t("skills.workspace.featured.title", "官方精选")}
                  </h2>
                  {visibleFeaturedCuratedTaskTemplates.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                      {visibleFeaturedCuratedTaskTemplates
                        .slice(0, 9)
                        .map((featured, index) => {
                          const template = featured.template;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              className="group min-h-[120px] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                              onClick={() =>
                                handleCuratedTaskTemplateLauncherRequest(
                                  template,
                                )
                              }
                            >
                              <div className="flex items-start gap-3">
                                <SkillTileSvg
                                  tone={
                                    index % 3 === 0
                                      ? "sky"
                                      : index % 3 === 1
                                        ? "emerald"
                                        : "slate"
                                  }
                                />
                                <div className="min-w-0">
                                  <div className="line-clamp-1 text-sm font-semibold text-slate-900">
                                    {template.title}
                                  </div>
                                  <div className="line-clamp-1 text-xs text-slate-400">
                                    {t(
                                      "skills.workspace.store.officialBadge",
                                      "官方精选",
                                    )}
                                  </div>
                                </div>
                              </div>
                              <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">
                                {template.summary}
                              </p>
                              <div className="mt-3 text-[11px] text-slate-400">
                                {template.outputHint ||
                                  getCuratedTaskOutputDestination(template)}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      {t("skills.workspace.empty.resultTemplates.default")}
                    </div>
                  )}
                </section>

                {visibleStoreSkills.length > 0 ? (
                  <section className="space-y-3">
                    <h2 className="text-xs font-semibold text-slate-700">
                      {t("skills.workspace.store.other" as AgentI18nKey, {
                        count: visibleStoreSkills.length,
                      })}
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                      {visibleStoreSkills.map((skill) => {
                        const tone = resolveSkillCardTone(skill);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            className="group min-h-[120px] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                            onClick={() => handleServiceSkillSelect(skill)}
                          >
                            <div className="flex items-start gap-3">
                              <SkillTileSvg tone={tone} />
                              <div className="min-w-0">
                                <div className="line-clamp-1 text-sm font-semibold text-slate-900">
                                  {skill.title}
                                </div>
                                <div className="line-clamp-1 text-xs text-slate-400">
                                  {getServiceSkillTypeLabel(skill, {
                                    copy: serviceSkillPresentationCopy,
                                  })}
                                </div>
                              </div>
                            </div>
                            <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">
                              {skill.summary ||
                                resolveServiceSkillEntryDescription(skill)}
                            </p>
                            <div className="mt-3 text-[11px] text-slate-400">
                              {skill.outputHint}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            {activeView === "builtin" ? (
              <section
                id="skills-builtin-view"
                role="tabpanel"
                className="space-y-3"
                data-testid="skills-builtin-view"
              >
                <div>
                  <h2 className="text-xs font-semibold text-slate-700">
                    {t("skills.workspace.builtin.title", "内置技能")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t(
                      "skills.workspace.builtin.subtitle",
                      "Lime 自带的技能。开关只控制是否自动匹配，不影响你继续使用 Lime。",
                    )}
                  </p>
                </div>
                {visibleBuiltinLocalSkills.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {visibleBuiltinLocalSkills.map((skill) => (
                      <div
                        key={skill.key}
                        className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                      >
                        <SkillTileSvg tone="slate" />
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-1 text-sm font-semibold text-slate-900">
                            {skill.name}
                          </div>
                          <p className="line-clamp-1 text-xs leading-5 text-slate-500">
                            {skill.description ||
                              resolveInstalledSkillPromise(
                                skill,
                                installedSkillPresentationCopy,
                              )}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-slate-400">
                            {t(
                              "skills.workspace.autoLoad.description",
                              "开启后，Lime 会在相关任务里自动带上；关闭后，不会主动匹配。",
                            )}
                          </p>
                        </div>
                        {renderAutoLoadControl(skill)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {t(
                      "skills.workspace.builtin.empty",
                      "可以尝试刷新，或换个关键词继续找。",
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {activeView === "installed" ? (
              <section
                id="skills-installed-view"
                role="tabpanel"
                className="space-y-3"
                data-testid="skills-installed-view"
              >
                <div>
                  <h2 className="text-xs font-semibold text-slate-700">
                    {t("skills.workspace.installed.title", "用户安装")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t(
                      "skills.workspace.installed.subtitle",
                      "你安装的技能。自动加载、手动使用、卸载是三个独立操作。",
                    )}
                  </p>
                </div>
                {visibleUserInstalledSkills.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {visibleUserInstalledSkills.map((skill) => {
                      const isHighlighted =
                        skill.directory === highlightedInstalledSkillDirectory;
                      return (
                        <div
                          key={skill.key}
                          className={cn(
                            "flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0",
                            isHighlighted && "bg-emerald-50/60",
                          )}
                        >
                          <SkillTileSvg
                            tone={isHighlighted ? "emerald" : "slate"}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-1 text-sm font-semibold text-slate-900">
                              {skill.name}
                            </div>
                            <p className="line-clamp-1 text-xs leading-5 text-slate-500">
                              {skill.description ||
                                resolveInstalledSkillPromise(
                                  skill,
                                  installedSkillPresentationCopy,
                                )}
                            </p>
                            <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-slate-400">
                              {t(
                                "skills.workspace.autoLoad.description",
                                "开启后，Lime 会在相关任务里自动带上；关闭后，不会主动匹配。",
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {renderAutoLoadControl(skill)}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-none hover:bg-slate-50"
                              onClick={() => handleInstalledSkillSelect(skill)}
                            >
                              {t(
                                "skills.workspace.installedSkill.action.use",
                                "使用",
                              )}
                            </Button>
                            {skill.sourceKind !== "builtin" &&
                            skill.catalogSource !== "project" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-full border-rose-200 bg-white px-3 text-xs text-rose-700 shadow-none hover:bg-rose-50"
                                disabled={
                                  uninstallingSkillDirectory === skill.directory
                                }
                                onClick={() =>
                                  void handleUninstallLocalSkill(skill)
                                }
                              >
                                {uninstallingSkillDirectory === skill.directory
                                  ? t(
                                      "skills.workspace.installedSkill.action.uninstalling",
                                      "卸载中",
                                    )
                                  : t(
                                      "skills.workspace.installedSkill.action.uninstall",
                                      "卸载",
                                    )}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {t("skills.workspace.sidebar.local.empty")}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </main>
      </div>

      <SkillScaffoldDialog
        open={scaffoldDialogOpen}
        onOpenChange={(open) => {
          setScaffoldDialogOpen(open);
          if (!open) {
            setScaffoldDialogDraft(null);
          }
        }}
        onCreate={handleCreateScaffold}
        creating={scaffoldCreating}
        allowProjectTarget={Boolean(creationProjectId)}
        initialValues={scaffoldDialogDraft}
        sourceHint={scaffoldDialogDraft?.sourceExcerpt ?? null}
        onBringBackToCreation={handleBringScaffoldToCreation}
      />

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
    </>
  );
}
