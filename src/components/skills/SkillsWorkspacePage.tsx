import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { Download, RefreshCw, Search } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { resolveServiceSkillEntryDescription } from "@/components/agent/chat/service-skills/entryAdapter";
import { buildServiceSkillRecommendationBuckets } from "@/components/agent/chat/service-skills/recommendedServiceSkills";
import {
  resolveServiceSkillLaunchPrefill,
  type ServiceSkillLaunchPrefillCopy,
} from "@/components/agent/chat/service-skills/serviceSkillLaunchPrefill";
import {
  buildServiceSkillCapabilityDescription,
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
import { SkillPackageInstallDialog } from "./SkillPackageInstallDialog";
import {
  renderSkillMarkdown,
  stripSkillFrontmatter,
} from "./skillMarkdownPreview";
import { buildHomeAgentParams } from "@/lib/workspace/navigation";
import { buildSkillScaffoldCreationReplayRequestMetadata } from "@/components/agent/chat/utils/creationReplayMetadata";
import {
  buildSkillScaffoldCreationSeed,
  buildSkillScaffoldReplayText,
} from "./skillScaffoldCreationSeed";
import {
  getOfficialSkillMarketplaceBundle,
  installOfficialMarketplaceSkill,
  type SkillMarketplaceBundle,
  type SkillMarketplaceItem,
  type SkillMarketplaceVisualAsset,
} from "@/lib/api/officialSkillMarketplace";
import { useOfficialSkillMarketplace } from "@/hooks/useOfficialSkillMarketplace";
import { recordSlashEntryUsage } from "@/components/agent/chat/skill-selection/slashEntryUsage";
import { formatList, formatNumber } from "@/i18n/format";

interface SkillsWorkspacePageProps {
  onNavigate: (page: Page, params?: PageParams) => void;
  pageParams?: SkillsPageParams;
}

type SkillsWorkspaceView = "store" | "builtin" | "installed";

type SkillStoreItem =
  | {
      source: "official";
      skill: SkillMarketplaceItem;
      serviceSkill?: never;
    }
  | {
      source: "local_fallback";
      skill: SkillMarketplaceItem;
      serviceSkill: ServiceSkillHomeItem;
    };

type MarketplaceSkillActionState =
  | "not_installed"
  | "installing"
  | "installed"
  | "builtin"
  | "uninstalling"
  | "local_fallback";

type MarketplaceSkillDetailContentState =
  | {
      skillName: string;
      status: "loading";
    }
  | {
      skillName: string;
      status: "ready";
      content: string;
    }
  | {
      skillName: string;
      status: "error";
      message: string;
    };

type InstalledSkillDetailContentState =
  | {
      directory: string;
      status: "loading";
    }
  | {
      directory: string;
      status: "ready";
      content: string;
    }
  | {
      directory: string;
      status: "error";
      message: string;
    };

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMarketplaceCoverPlaceholder(
  title: string,
  category?: string,
): SkillMarketplaceVisualAsset {
  const safeTitle = escapeSvgText(title || "Lime Skill");
  const safeCategory = escapeSvgText(category || "Official");
  return {
    kind: "svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img" aria-label="${safeTitle}"><rect width="320" height="180" rx="22" fill="#f7f7f5"/><rect x="1" y="1" width="318" height="178" rx="21" fill="none" stroke="#deded8"/><circle cx="264" cy="48" r="28" fill="#ededeb"/><path d="M48 70h118M48 92h186M48 114h142" stroke="#8d8d86" stroke-width="8" stroke-linecap="round"/><text x="48" y="145" font-family="ui-sans-serif,system-ui" font-size="18" font-weight="700" fill="#262626">${safeTitle}</text><text x="48" y="165" font-family="ui-sans-serif,system-ui" font-size="12" fill="#8c8c8c">${safeCategory}</text></svg>`,
  };
}

function buildMarketplaceIconPlaceholder(
  title: string,
): SkillMarketplaceVisualAsset {
  const safeTitle = escapeSvgText(title || "Lime");
  const initial = escapeSvgText([...safeTitle][0] || "L");
  return {
    kind: "svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${safeTitle}"><rect width="96" height="96" rx="20" fill="#f5f5f5"/><rect x="1" y="1" width="94" height="94" rx="19" fill="none" stroke="#d9d9d9"/><path d="M28 36h40M28 48h32M28 60h24" stroke="#8c8c8c" stroke-width="5" stroke-linecap="round"/><text x="48" y="82" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="18" font-weight="700" fill="#595959">${initial}</text></svg>`,
  };
}

function svgToDataUri(svg?: string): string | null {
  const normalized = svg?.trim();
  if (!normalized || !normalized.startsWith("<svg")) {
    return null;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized)}`;
}

function resolveVisualAssetSource(
  asset?: SkillMarketplaceVisualAsset,
): string | null {
  const url = asset?.url?.trim();
  if (url) {
    return url;
  }
  return svgToDataUri(asset?.svg);
}

function buildFallbackMarketplaceItem(
  skill: ServiceSkillHomeItem,
): SkillMarketplaceItem {
  return {
    id: `local-fallback:${skill.id}`,
    name: skill.skillKey || skill.id,
    aliases: skill.aliases ?? [],
    title: skill.title,
    summary: skill.summary || resolveServiceSkillEntryDescription(skill),
    category: skill.category,
    outputHint: skill.outputHint,
    version: skill.version,
    sort: 0,
    icon: buildMarketplaceIconPlaceholder(skill.title),
    cover: buildMarketplaceCoverPlaceholder(skill.title, skill.category),
    bundle: skill.skillBundle
      ? {
          ...skill.skillBundle,
          resourceSummary: skill.skillBundle.resourceSummary,
          standardCompliance: skill.skillBundle.standardCompliance,
        }
      : undefined,
  };
}

function SkillsHeroBannerSvg() {
  return (
    <svg
      viewBox="0 0 320 150"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className="h-full w-full"
    >
      <circle cx="225" cy="36" r="42" fill="#dff3ff" />
      <g transform="translate(178 12) rotate(-15)">
        <rect
          x="0"
          y="0"
          width="92"
          height="118"
          rx="5"
          fill="#fff"
          stroke="#e8eef2"
          strokeWidth="2"
        />
        <circle cx="30" cy="38" r="15" fill="#4ade80" />
        <circle cx="50" cy="44" r="15" fill="#fb7185" />
        <rect x="18" y="72" width="54" height="7" rx="3.5" fill="#cbd5e1" />
        <rect x="18" y="88" width="42" height="6" rx="3" fill="#e2e8f0" />
      </g>
      <g transform="translate(226 2) rotate(13)">
        <rect
          x="0"
          y="0"
          width="90"
          height="124"
          rx="5"
          fill="#fff"
          stroke="#e8eef2"
          strokeWidth="2"
        />
        <circle cx="32" cy="38" r="16" fill="#fb923c" />
        <path
          d="M51 28c13 4 18 20 9 31"
          fill="none"
          stroke="#22c55e"
          strokeLinecap="round"
          strokeWidth="9"
        />
        <rect x="16" y="78" width="54" height="7" rx="3.5" fill="#cbd5e1" />
        <rect x="16" y="94" width="38" height="6" rx="3" fill="#e2e8f0" />
      </g>
      <g transform="translate(262 75) rotate(15)">
        <rect
          x="0"
          y="0"
          width="74"
          height="54"
          rx="5"
          fill="#fff"
          stroke="#e8eef2"
          strokeWidth="2"
        />
        <circle cx="24" cy="27" r="13" fill="#38bdf8" />
        <path
          d="M45 18c9 5 12 14 6 24"
          fill="none"
          stroke="#f43f5e"
          strokeLinecap="round"
          strokeWidth="5"
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

function MarketplaceSkillVisual({
  asset,
  title,
  tone = "emerald",
  variant = "icon",
}: {
  asset?: SkillMarketplaceVisualAsset;
  title: string;
  tone?: ServiceSkillTone;
  variant?: "icon" | "cover";
}) {
  const source = resolveVisualAssetSource(asset);
  if (!source) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden bg-white",
          variant === "cover" ? "h-full w-full" : "h-10 w-10 rounded-xl",
        )}
      >
        <SkillTileSvg tone={tone} />
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={title}
      className={cn(
        "shrink-0 object-cover",
        variant === "cover"
          ? "h-full w-full"
          : "h-10 w-10 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]",
      )}
    />
  );
}

function extractSkillMarkdown(bundle: SkillMarketplaceBundle): string {
  const skillFile =
    bundle.files.find((file) => file.path === "SKILL.md") ??
    bundle.files.find((file) => file.path.endsWith("/SKILL.md"));
  return stripSkillFrontmatter(skillFile?.content ?? "");
}

function buildFallbackSkillMarkdown(item: SkillStoreItem): string {
  return [
    `# ${item.skill.title}`,
    item.skill.summary || item.skill.bundle?.description,
    item.skill.outputHint ? `## Output\n${item.skill.outputHint}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildInstalledSkillFallbackMarkdown(
  skill: Skill,
  copy: InstalledSkillPresentationCopy,
): string {
  return [
    `# ${skill.name}`,
    skill.description || resolveInstalledSkillPromise(skill, copy),
  ]
    .filter(Boolean)
    .join("\n\n");
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

function ensureSkillPackageExtension(filePath: string): string {
  if (/\.(?:skill|skills)$/i.test(filePath)) {
    return filePath;
  }
  const normalizedBase = filePath.replace(/\.[^./\\]+$/, "");
  return `${normalizedBase}.skills`;
}

function isSkillAutoLoadEnabled(
  skill: Pick<Skill, "directory" | "key">,
  preferences: SkillAutoLoadPreferences,
): boolean {
  return preferences[getSkillAutoLoadPreferenceKey(skill)] ?? true;
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
  const {
    skills: serviceSkills = [],
    error: serviceSkillsError,
    refresh: refreshServiceSkills,
  } = useServiceSkills();
  const {
    skills: officialMarketplaceSkills = [],
    isLoading: officialMarketplaceLoading,
    error: officialMarketplaceError,
    refresh: refreshOfficialMarketplace,
  } = useOfficialSkillMarketplace();
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
  const [refreshing, setRefreshing] = useState(false);
  const [installingMarketplaceSkillName, setInstallingMarketplaceSkillName] =
    useState<string | null>(null);
  const [selectedMarketplaceSkillName, setSelectedMarketplaceSkillName] =
    useState<string | null>(null);
  const [detailMarketplaceSkillName, setDetailMarketplaceSkillName] = useState<
    string | null
  >(null);
  const [detailContentState, setDetailContentState] =
    useState<MarketplaceSkillDetailContentState | null>(null);
  const [detailInstalledSkillDirectory, setDetailInstalledSkillDirectory] =
    useState<string | null>(null);
  const [installedDetailContentState, setInstalledDetailContentState] =
    useState<InstalledSkillDetailContentState | null>(null);
  const [uninstallingSkillDirectory, setUninstallingSkillDirectory] = useState<
    string | null
  >(null);
  const [exportingSkillDirectory, setExportingSkillDirectory] = useState<
    string | null
  >(null);
  const [skillAutoLoadPreferences, setSkillAutoLoadPreferences] =
    useState<SkillAutoLoadPreferences>(() => readSkillAutoLoadPreferences());
  const [scaffoldDialogOpen, setScaffoldDialogOpen] = useState(false);
  const [scaffoldDialogDraft, setScaffoldDialogDraft] =
    useState<SkillScaffoldDraft | null>(null);
  const [scaffoldCreating, setScaffoldCreating] = useState(false);
  const [localPackageDialogOpen, setLocalPackageDialogOpen] = useState(false);
  const [localPackageSourcePath, setLocalPackageSourcePath] = useState<
    string | null
  >(null);
  const [localPackageSourceName, setLocalPackageSourceName] = useState<
    string | null
  >(null);
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
  const lastHandledSkillPackageRequestKeyRef = useRef<number | string | null>(
    null,
  );

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
  const localSkillByDirectory = useMemo(() => {
    const result = new Map<string, Skill>();
    for (const skill of installedLocalSkills) {
      if (skill.directory) {
        result.set(skill.directory, skill);
      }
    }
    return result;
  }, [installedLocalSkills]);
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

  useEffect(() => {
    const sourcePath = pageParams?.initialSkillPackagePath?.trim();
    if (!sourcePath) {
      return;
    }

    const requestKey = pageParams?.initialSkillPackageRequestKey ?? sourcePath;
    if (lastHandledSkillPackageRequestKeyRef.current === requestKey) {
      return;
    }

    lastHandledSkillPackageRequestKeyRef.current = requestKey;
    setLocalPackageSourcePath(sourcePath);
    setLocalPackageSourceName(
      pageParams?.initialSkillPackageName?.trim() || null,
    );
    setLocalPackageDialogOpen(true);
    setActiveView("installed");
    setSearchQuery("");
  }, [
    pageParams?.initialSkillPackageName,
    pageParams?.initialSkillPackagePath,
    pageParams?.initialSkillPackageRequestKey,
  ]);

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
  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        refreshOfficialMarketplace(),
        refreshServiceSkills(),
        refreshLocalSkills(),
      ]);
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

  const handleServiceSkillSelect = useCallback(
    (skill: ServiceSkillHomeItem) => {
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
    },
    [
      creationProjectId,
      onNavigate,
      scaffoldCreationReplay,
      serviceSkillLaunchPrefillCopy,
    ],
  );

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

  const handleExportLocalSkillPackage = useCallback(
    async (skill: Skill) => {
      if (!skill.directory) {
        return;
      }

      let selectedPath: string | null;
      try {
        selectedPath = await saveDialog({
          title: t("skills.workspace.export.dialogTitle"),
          defaultPath: `${skill.directory}.skills`,
          filters: [
            {
              name: t("skills.workspace.export.filterName"),
              extensions: ["skills", "skill"],
            },
          ],
        });
      } catch (error) {
        toast.error(
          t("skills.workspace.export.failed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return;
      }

      if (!selectedPath) {
        return;
      }

      setExportingSkillDirectory(skill.directory);
      try {
        await skillsApi.exportLocalSkillPackage(
          skill.directory,
          ensureSkillPackageExtension(selectedPath),
          "lime",
        );
        toast.success(
          t("skills.workspace.export.success", {
            name: skill.name,
          }),
        );
      } catch (error) {
        toast.error(
          t("skills.workspace.export.failed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        setExportingSkillDirectory(null);
      }
    },
    [t],
  );

  const resolveMarketplaceSkillActionState = useCallback(
    (item: SkillStoreItem): MarketplaceSkillActionState => {
      if (item.source === "local_fallback") {
        return "local_fallback";
      }
      if (installingMarketplaceSkillName === item.skill.name) {
        return "installing";
      }

      const localSkill = localSkillByDirectory.get(item.skill.name);
      if (!localSkill) {
        return "not_installed";
      }
      if (uninstallingSkillDirectory === localSkill.directory) {
        return "uninstalling";
      }
      if (localSkill.sourceKind === "builtin") {
        return "builtin";
      }
      return "installed";
    },
    [
      installingMarketplaceSkillName,
      localSkillByDirectory,
      uninstallingSkillDirectory,
    ],
  );

  const getMarketplaceSkillActionLabel = useCallback(
    (state: MarketplaceSkillActionState) => {
      switch (state) {
        case "installing":
          return t("skills.workspace.marketplace.action.installing");
        case "installed":
          return t("skills.workspace.marketplace.action.useInstalled");
        case "builtin":
          return t("skills.workspace.marketplace.action.useBuiltin");
        case "uninstalling":
          return t("skills.workspace.marketplace.action.uninstalling");
        case "local_fallback":
          return t("skills.workspace.marketplace.action.useLocal");
        default:
          return t("skills.workspace.marketplace.action.install");
      }
    },
    [t],
  );

  const handleMarketplaceSkillInstall = useCallback(
    async (item: SkillStoreItem) => {
      if (item.source !== "official") {
        return;
      }
      setInstallingMarketplaceSkillName(item.skill.name);
      try {
        const result = await installOfficialMarketplaceSkill(
          item.skill.name,
          "lime",
        );
        await refreshLocalSkills();
        setHighlightedInstalledSkillDirectory(result.directory);
        toast.success(
          t("skills.workspace.marketplace.installSuccess", {
            title: item.skill.title,
          }),
        );
      } catch (error) {
        toast.error(
          t("skills.workspace.marketplace.installFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        setInstallingMarketplaceSkillName(null);
      }
    },
    [refreshLocalSkills, t],
  );

  const handleMarketplaceSkillPrimaryAction = useCallback(
    (item: SkillStoreItem) => {
      const state = resolveMarketplaceSkillActionState(item);
      if (item.source === "local_fallback") {
        handleServiceSkillSelect(item.serviceSkill);
        return;
      }

      const localSkill = localSkillByDirectory.get(item.skill.name);
      if (localSkill && (state === "installed" || state === "builtin")) {
        handleInstalledSkillSelect(localSkill);
        return;
      }

      if (state === "not_installed") {
        void handleMarketplaceSkillInstall(item);
      }
    },
    [
      handleInstalledSkillSelect,
      handleMarketplaceSkillInstall,
      handleServiceSkillSelect,
      localSkillByDirectory,
      resolveMarketplaceSkillActionState,
    ],
  );

  const handleMarketplaceSkillUninstall = useCallback(
    (item: SkillStoreItem) => {
      if (item.source !== "official") {
        return;
      }
      const localSkill = localSkillByDirectory.get(item.skill.name);
      if (!localSkill || localSkill.sourceKind === "builtin") {
        return;
      }
      void handleUninstallLocalSkill(localSkill);
    },
    [handleUninstallLocalSkill, localSkillByDirectory],
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

  const handleLocalSkillPackageInstalled = useCallback(
    async (directory: string) => {
      try {
        await refreshLocalSkills();
      } catch (error) {
        toast.error(
          t("skills.workspace.feedback.refreshError", {
            message: String(error),
          }),
        );
      }

      setOptimisticInstalledSkill(null);
      setActiveView("installed");
      setSearchQuery("");
      setHighlightedInstalledSkillDirectory(directory);
    },
    [refreshLocalSkills, t],
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
  const skillStoreItems = useMemo<SkillStoreItem[]>(() => {
    if (officialMarketplaceSkills.length > 0) {
      return officialMarketplaceSkills.map((skill) => ({
        source: "official",
        skill,
      }));
    }

    return workspaceServiceSkills.slice(0, 12).map((serviceSkill) => ({
      source: "local_fallback",
      skill: buildFallbackMarketplaceItem(serviceSkill),
      serviceSkill,
    }));
  }, [officialMarketplaceSkills, workspaceServiceSkills]);

  const visibleStoreItems = useMemo(() => {
    return skillStoreItems.filter(({ skill, serviceSkill }) =>
      matchesText(
        searchQuery,
        skill.title,
        skill.summary,
        skill.category,
        skill.outputHint,
        skill.bundle?.description,
        ...(skill.aliases ?? []),
        serviceSkill
          ? buildServiceSkillCapabilityDescription(serviceSkill, {
              copy: serviceSkillPresentationCopy,
            })
          : undefined,
      ),
    );
  }, [searchQuery, serviceSkillPresentationCopy, skillStoreItems]);
  const featuredStoreItems = useMemo(
    () => visibleStoreItems.slice(0, 9),
    [visibleStoreItems],
  );
  const otherStoreItems = useMemo(
    () => visibleStoreItems.slice(9),
    [visibleStoreItems],
  );

  const selectedStoreItem = useMemo(() => {
    if (!selectedMarketplaceSkillName) {
      return null;
    }
    return (
      visibleStoreItems.find(
        (item) => item.skill.name === selectedMarketplaceSkillName,
      ) ?? null
    );
  }, [selectedMarketplaceSkillName, visibleStoreItems]);
  const detailStoreItem = useMemo(() => {
    if (!detailMarketplaceSkillName) {
      return null;
    }
    return (
      skillStoreItems.find(
        (item) => item.skill.name === detailMarketplaceSkillName,
      ) ?? null
    );
  }, [detailMarketplaceSkillName, skillStoreItems]);
  const detailInstalledSkill = useMemo(() => {
    if (!detailInstalledSkillDirectory) {
      return null;
    }
    return (
      installedLocalSkills.find(
        (skill) => skill.directory === detailInstalledSkillDirectory,
      ) ?? null
    );
  }, [detailInstalledSkillDirectory, installedLocalSkills]);

  useEffect(() => {
    if (!detailStoreItem) {
      setDetailContentState(null);
      return;
    }

    let cancelled = false;
    const skillName = detailStoreItem.skill.name;

    if (detailStoreItem.source !== "official") {
      setDetailContentState({
        skillName,
        status: "ready",
        content: buildFallbackSkillMarkdown(detailStoreItem),
      });
      return;
    }

    setDetailContentState({ skillName, status: "loading" });
    void getOfficialSkillMarketplaceBundle(skillName)
      .then((bundle) => {
        if (cancelled) return;
        const content = extractSkillMarkdown(bundle);
        setDetailContentState({
          skillName,
          status: "ready",
          content: content || buildFallbackSkillMarkdown(detailStoreItem),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setDetailContentState({
          skillName,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [detailStoreItem]);

  useEffect(() => {
    if (!detailInstalledSkill) {
      setInstalledDetailContentState(null);
      return;
    }

    let cancelled = false;
    const { directory } = detailInstalledSkill;
    setInstalledDetailContentState({ directory, status: "loading" });

    void skillsApi
      .inspectLocalSkill(directory, "lime")
      .then((inspection) => {
        if (cancelled) return;
        setInstalledDetailContentState({
          directory,
          status: "ready",
          content: inspection.content,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setInstalledDetailContentState({
          directory,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [detailInstalledSkill]);

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
  const skillStoreCount = skillStoreItems.length;
  const builtinSkillCount = visibleBuiltinLocalSkills.length;
  const installedSkillCount = visibleUserInstalledSkills.length;
  const viewTabs: Array<{
    key: SkillsWorkspaceView;
    label: string;
    count?: number;
  }> = [
    {
      key: "store",
      label: t("skills.workspace.view.store"),
      count: skillStoreCount,
    },
    {
      key: "builtin",
      label: t("skills.workspace.view.builtin"),
      count: builtinSkillCount,
    },
    {
      key: "installed",
      label: t("skills.workspace.view.installed"),
      count: installedSkillCount,
    },
  ];

  const renderAutoLoadControl = (skill: Skill) => {
    const enabled = isSkillAutoLoadEnabled(skill, skillAutoLoadPreferences);

    return (
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="hidden min-w-[86px] sm:block">
          <div className="text-[11px] font-semibold leading-4 text-slate-700">
            {t("skills.workspace.autoLoad.label")}
          </div>
          <div className="text-[10px] leading-3 text-slate-400">
            {enabled
              ? t("skills.workspace.autoLoad.on")
              : t("skills.workspace.autoLoad.off")}
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

  const renderMarketplaceSkillCard = (item: SkillStoreItem, index: number) => {
    const skill = item.skill;
    const tone: ServiceSkillTone =
      index % 4 === 0
        ? "emerald"
        : index % 4 === 1
          ? "sky"
          : index % 4 === 2
            ? "amber"
            : "slate";
    const actionState = resolveMarketplaceSkillActionState(item);
    const iconAsset =
      skill.icon ?? buildMarketplaceIconPlaceholder(skill.title);
    const isSelected = selectedStoreItem?.skill.name === skill.name;
    const summary =
      skill.summary ||
      skill.bundle?.description ||
      t("skills.workspace.marketplace.defaultOutputHint");
    const secondaryText =
      skill.version ||
      skill.category ||
      t("skills.workspace.marketplace.defaultCategory");

    const openDetail = () => {
      setSelectedMarketplaceSkillName(skill.name);
      setDetailMarketplaceSkillName(skill.name);
    };
    const localSkill =
      item.source === "official" ? localSkillByDirectory.get(skill.name) : null;
    const canUninstall =
      item.source === "official" &&
      Boolean(localSkill) &&
      localSkill?.sourceKind !== "builtin";
    const actionDisabled =
      actionState === "installing" || actionState === "uninstalling";

    return (
      <article
        key={`${item.source}:${skill.name}`}
        className={cn(
          "group flex min-h-[132px] flex-col rounded-[10px] border bg-[color:var(--lime-surface)] p-4 text-left shadow-sm shadow-[color:var(--lime-shadow-color)] transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] hover:shadow-md",
          isSelected
            ? "border-[color:var(--lime-surface-border-strong)] ring-1 ring-[color:var(--lime-surface-border-strong)]"
            : "border-[color:var(--lime-surface-border)]",
        )}
        data-testid="skills-marketplace-card"
      >
        <div className="flex items-start gap-3">
          <MarketplaceSkillVisual
            asset={iconAsset}
            title={skill.title}
            tone={tone}
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-[15px] font-semibold leading-5 text-[color:var(--lime-text-strong)]">
              {skill.title}
            </h3>
            <p className="mt-0.5 line-clamp-1 text-[12px] leading-4 text-[color:var(--lime-text-muted)]">
              {skill.name}
            </p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 flex-1 text-[13px] leading-5 text-[color:var(--lime-text)]">
          {summary}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 text-[12px] leading-4 text-[color:var(--lime-text-muted)]">
          <span className="line-clamp-1">{secondaryText}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {canUninstall ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-full px-2.5 text-[12px] font-semibold text-[color:var(--lime-warning)] hover:bg-[color:var(--lime-warning-soft)]"
                disabled={actionDisabled}
                onClick={() => handleMarketplaceSkillUninstall(item)}
              >
                {t("skills.workspace.marketplace.action.uninstall")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2.5 text-[12px] font-semibold text-[color:var(--lime-text)] hover:bg-[color:var(--lime-surface-hover)]"
              onClick={openDetail}
            >
              {t("skills.workspace.marketplace.action.detail")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 rounded-full bg-[color:var(--lime-text-strong)] px-3 text-[12px] font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
              disabled={actionDisabled}
              onClick={() => handleMarketplaceSkillPrimaryAction(item)}
            >
              {getMarketplaceSkillActionLabel(actionState)}
            </Button>
          </div>
        </div>
      </article>
    );
  };

  const renderMarketplaceSkillSection = (
    title: string,
    items: SkillStoreItem[],
    startIndex = 0,
    meta?: string,
  ) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[color:var(--lime-text-strong)]">
            {title}
          </h2>
          {meta ? (
            <span className="text-[12px] leading-5 text-[color:var(--lime-text-muted)]">
              {meta}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) =>
            renderMarketplaceSkillCard(item, startIndex + index),
          )}
        </div>
      </section>
    );
  };

  return (
    <>
      <div className="lime-workbench-theme-scope flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--lime-app-bg)] text-[color:var(--lime-text)]">
        <header className="flex h-16 shrink-0 items-center justify-end gap-3 border-b border-[color:var(--lime-surface-border)] bg-[color:var(--lime-app-bg)] px-5 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-[color:var(--lime-text-muted)] hover:bg-[color:var(--lime-surface-hover)]"
            data-testid="skills-workspace-refresh-button"
            onClick={() => void handleRefreshAll()}
            disabled={refreshing}
            aria-label={t("skills.workspace.header.refresh")}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </Button>
          <label className="relative hidden w-[280px] sm:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--lime-text-muted)]" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("skills.workspace.search.placeholder")}
              className="h-9 rounded-full border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] pl-10 pr-4 text-sm font-semibold text-[color:var(--lime-text-strong)] shadow-none placeholder:text-[color:var(--lime-text-muted)]"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text-strong)] shadow-none hover:bg-[color:var(--lime-surface-hover)]"
            onClick={() => {
              setScaffoldDialogDraft(null);
              setScaffoldDialogOpen(true);
            }}
          >
            {t("skills.workspace.header.createWithLime")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
            disabled={importingLocalSkill}
            onClick={() => void handleImportLocalSkill()}
          >
            {importingLocalSkill
              ? t("skills.workspace.header.installingSkill")
              : t("skills.workspace.header.installSkill")}
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto bg-[color:var(--lime-surface)] px-5 pb-10 pt-10">
          <div className="mx-auto w-full max-w-[900px] space-y-8">
            <section className="space-y-4">
              <div>
                <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[color:var(--lime-text-strong)]">
                  {t("skills.workspace.header.title")}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[color:var(--lime-text-muted)]">
                  {t("skills.workspace.header.subtitle")}
                </p>
              </div>
              <div className="relative h-[128px] overflow-hidden rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)]">
                <div className="absolute left-6 top-1/2 -translate-y-1/2">
                  <div className="text-base font-semibold leading-6 text-[color:var(--lime-text-strong)]">
                    {t("skills.workspace.hero.title")}
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[color:var(--lime-text)]">
                    {t("skills.workspace.hero.description")}
                  </p>
                </div>
                <div className="pointer-events-none absolute right-2 top-1/2 hidden h-[142px] w-[320px] -translate-y-1/2 sm:block">
                  <SkillsHeroBannerSvg />
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
                      {t("skills.workspace.activeScaffold.badge")}
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
                    {t("skills.workspace.activeScaffold.backToCreation")}
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
                className="flex items-center gap-5"
                role="tablist"
                aria-label={t("skills.workspace.view.tabsLabel")}
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
                        "inline-flex h-8 items-center gap-2 rounded-full text-base font-semibold transition",
                        active
                          ? "text-[color:var(--lime-text-strong)]"
                          : "text-[color:var(--lime-text-muted)] hover:text-[color:var(--lime-text-strong)]",
                      )}
                      onClick={() => setActiveView(tab.key)}
                    >
                      {tab.label}
                      {tab.key === "installed" &&
                      typeof tab.count === "number" ? (
                        <span className="text-xs text-[color:var(--lime-text-muted)]">
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
                    className="h-8 rounded-lg border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] shadow-none hover:bg-[color:var(--lime-surface-hover)]"
                  >
                    {t("skills.workspace.filter.all")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] shadow-none hover:bg-[color:var(--lime-surface-hover)]"
                  >
                    {t("skills.workspace.sort.hot")}
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
                <div className="space-y-5">
                  {officialMarketplaceError &&
                  officialMarketplaceSkills.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                      {t("skills.workspace.marketplace.fallbackNotice")}
                    </div>
                  ) : null}

                  {visibleStoreItems.length > 0 ? (
                    <>
                      {renderMarketplaceSkillSection(
                        t("skills.workspace.marketplace.featuredTitle"),
                        featuredStoreItems,
                        0,
                        officialMarketplaceLoading
                          ? t("skills.workspace.marketplace.syncing")
                          : t("skills.workspace.marketplace.count", {
                              count: skillStoreCount,
                            }),
                      )}
                      {renderMarketplaceSkillSection(
                        t("skills.workspace.marketplace.otherTitle", {
                          count: otherStoreItems.length,
                        }),
                        otherStoreItems,
                        featuredStoreItems.length,
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      {t("skills.workspace.marketplace.empty")}
                    </div>
                  )}
                </div>
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
                    {t("skills.workspace.builtin.title")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("skills.workspace.builtin.subtitle")}
                  </p>
                </div>
                {visibleBuiltinLocalSkills.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {visibleBuiltinLocalSkills.map((skill) => (
                      <div
                        key={skill.key}
                        data-testid="skills-local-skill-row"
                        data-skill-directory={skill.directory}
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
                            {t("skills.workspace.autoLoad.description")}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {renderAutoLoadControl(skill)}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-none hover:bg-slate-50"
                            onClick={() =>
                              setDetailInstalledSkillDirectory(skill.directory)
                            }
                          >
                            {t("skills.workspace.marketplace.action.detail")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {t("skills.workspace.builtin.empty")}
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
                    {t("skills.workspace.installed.title")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("skills.workspace.installed.subtitle")}
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
                          data-testid="skills-local-skill-row"
                          data-skill-directory={skill.directory}
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
                              {t("skills.workspace.autoLoad.description")}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                            {renderAutoLoadControl(skill)}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-none hover:bg-slate-50"
                              onClick={() =>
                                setDetailInstalledSkillDirectory(
                                  skill.directory,
                                )
                              }
                            >
                              {t("skills.workspace.marketplace.action.detail")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-none hover:bg-slate-50"
                              onClick={() => handleInstalledSkillSelect(skill)}
                            >
                              {t("skills.workspace.installedSkill.action.use")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-none hover:bg-slate-50"
                              disabled={
                                exportingSkillDirectory === skill.directory
                              }
                              onClick={() =>
                                void handleExportLocalSkillPackage(skill)
                              }
                              title={t(
                                "skills.workspace.installedSkill.action.exportTitle",
                                {
                                  name: skill.name,
                                },
                              )}
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              {exportingSkillDirectory === skill.directory
                                ? t(
                                    "skills.workspace.installedSkill.action.exporting",
                                  )
                                : t(
                                    "skills.workspace.installedSkill.action.export",
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
                                    )
                                  : t(
                                      "skills.workspace.installedSkill.action.uninstall",
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

      <SkillPackageInstallDialog
        open={localPackageDialogOpen}
        sourcePath={localPackageSourcePath}
        sourceName={localPackageSourceName}
        onOpenChange={(open) => {
          setLocalPackageDialogOpen(open);
          if (!open) {
            setLocalPackageSourcePath(null);
            setLocalPackageSourceName(null);
          }
        }}
        onInstalled={handleLocalSkillPackageInstalled}
      />

      <Dialog
        open={Boolean(detailInstalledSkill)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailInstalledSkillDirectory(null);
          }
        }}
      >
        <DialogContent
          className="lime-workbench-theme-scope lime-workbench-surface-scope overflow-hidden rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]"
          maxWidth="max-w-[920px]"
        >
          {detailInstalledSkill ? (
            <div
              className="flex max-h-[calc(100vh-3rem)] min-h-[560px] flex-col bg-[color:var(--lime-surface)]"
              data-testid="skills-installed-detail"
            >
              <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-6 py-5 pr-14">
                <DialogHeader className="space-y-0 text-left">
                  <div className="flex items-center gap-3">
                    <SkillTileSvg tone="slate" />
                    <div className="min-w-0">
                      <DialogTitle className="line-clamp-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[color:var(--lime-text-strong)]">
                        {detailInstalledSkill.name}
                      </DialogTitle>
                      <div className="mt-1 line-clamp-1 text-[13px] leading-5 text-[color:var(--lime-text-muted)]">
                        {detailInstalledSkill.directory}
                      </div>
                    </div>
                  </div>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-5 rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] px-4 py-3 text-[13px] leading-5 text-[color:var(--lime-info)]">
                  {t("skills.workspace.marketplace.detail.sourceNotice")}
                </div>
                <article className="mx-auto max-w-[760px] pb-8 text-left">
                  {(() => {
                    const contentState =
                      installedDetailContentState?.directory ===
                      detailInstalledSkill.directory
                        ? installedDetailContentState
                        : null;

                    const fallback = buildInstalledSkillFallbackMarkdown(
                      detailInstalledSkill,
                      installedSkillPresentationCopy,
                    );

                    if (!contentState || contentState.status === "loading") {
                      return (
                        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--lime-text-muted)]">
                          {t(
                            "skills.workspace.marketplace.detail.loadingSkillContent",
                          )}
                        </div>
                      );
                    }

                    if (contentState.status === "error") {
                      return (
                        <>
                          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
                            {t(
                              "skills.workspace.marketplace.detail.loadSkillContentFailed",
                              {
                                message: contentState.message,
                              },
                            )}
                          </div>
                          {renderSkillMarkdown(fallback)}
                        </>
                      );
                    }

                    return renderSkillMarkdown(
                      contentState.content || fallback,
                    );
                  })()}
                </article>
              </div>

              <div className="flex shrink-0 justify-end border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-6 py-4">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
                  onClick={() => {
                    handleInstalledSkillSelect(detailInstalledSkill);
                    setDetailInstalledSkillDirectory(null);
                  }}
                >
                  {t("skills.workspace.installedSkill.action.use")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailStoreItem)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailMarketplaceSkillName(null);
          }
        }}
      >
        <DialogContent
          className="lime-workbench-theme-scope lime-workbench-surface-scope overflow-hidden rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]"
          maxWidth="max-w-[920px]"
        >
          {detailStoreItem ? (
            <div
              className="flex max-h-[calc(100vh-3rem)] min-h-[560px] flex-col bg-[color:var(--lime-surface)]"
              data-testid="skills-marketplace-detail"
            >
              <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-6 py-5 pr-14">
                <DialogHeader className="space-y-0 text-left">
                  <div className="flex items-center gap-3">
                    <MarketplaceSkillVisual
                      asset={
                        detailStoreItem.skill.icon ??
                        buildMarketplaceIconPlaceholder(
                          detailStoreItem.skill.title,
                        )
                      }
                      title={detailStoreItem.skill.title}
                    />
                    <div className="min-w-0">
                      <DialogTitle className="line-clamp-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[color:var(--lime-text-strong)]">
                        {detailStoreItem.skill.title}
                      </DialogTitle>
                      <div className="mt-1 line-clamp-1 text-[13px] leading-5 text-[color:var(--lime-text-muted)]">
                        {detailStoreItem.skill.name}
                      </div>
                    </div>
                  </div>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-5 rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] px-4 py-3 text-[13px] leading-5 text-[color:var(--lime-info)]">
                  {t("skills.workspace.marketplace.detail.sourceNotice")}
                </div>
                <article className="mx-auto max-w-[760px] pb-8 text-left">
                  {(() => {
                    const contentState =
                      detailContentState?.skillName ===
                      detailStoreItem.skill.name
                        ? detailContentState
                        : null;

                    if (!contentState || contentState.status === "loading") {
                      return (
                        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--lime-text-muted)]">
                          {t(
                            "skills.workspace.marketplace.detail.loadingSkillContent",
                          )}
                        </div>
                      );
                    }

                    if (contentState.status === "error") {
                      return (
                        <>
                          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
                            {t(
                              "skills.workspace.marketplace.detail.loadSkillContentFailed",
                              {
                                message: contentState.message,
                              },
                            )}
                          </div>
                          {renderSkillMarkdown(
                            buildFallbackSkillMarkdown(detailStoreItem),
                          )}
                        </>
                      );
                    }

                    return renderSkillMarkdown(contentState.content);
                  })()}
                </article>
              </div>

              <div className="flex shrink-0 justify-end border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-6 py-4">
                {(() => {
                  const actionState =
                    resolveMarketplaceSkillActionState(detailStoreItem);
                  const localSkill = localSkillByDirectory.get(
                    detailStoreItem.skill.name,
                  );
                  const canUninstall =
                    detailStoreItem.source === "official" &&
                    Boolean(localSkill) &&
                    localSkill?.sourceKind !== "builtin";
                  return (
                    <div className="flex items-center gap-2">
                      {canUninstall ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-full border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-5 text-sm font-semibold text-[color:var(--lime-text)] shadow-none hover:bg-[color:var(--lime-surface-hover)]"
                          disabled={actionState === "uninstalling"}
                          onClick={() =>
                            handleMarketplaceSkillUninstall(detailStoreItem)
                          }
                        >
                          {t("skills.workspace.marketplace.action.uninstall")}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
                        disabled={
                          actionState === "installing" ||
                          actionState === "uninstalling"
                        }
                        onClick={() =>
                          handleMarketplaceSkillPrimaryAction(detailStoreItem)
                        }
                      >
                        {getMarketplaceSkillActionLabel(actionState)}
                      </Button>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
