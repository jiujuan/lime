import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  HardDrive,
  History,
  Languages,
  Layers3,
  Moon,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getConfig } from "@/lib/api/appConfig";
import { MemorySettings } from "@/components/settings-v2/general/memory";
import {
  getUnifiedMemoryStats,
  listUnifiedMemories,
  type MemoryCategory,
  type MemorySource,
  type UnifiedMemory,
  type UnifiedMemoryStatsResponse,
} from "@/lib/api/unifiedMemory";
import {
  normalizeUserFacingMemorySummary,
  normalizeUserFacingMemoryTags,
  normalizeUserFacingMemoryTitle,
} from "@/lib/memory/userFacingMemoryText";
import { cn } from "@/lib/utils";
import type { MemoryPageParams, Page, PageParams } from "@/types/page";

type MemoryCategoryFilter = MemoryCategory | "all";
type MemoryPageTab = "memory" | "settings";

interface MemoryPageProps {
  onNavigate: (page: Page, pageParams?: PageParams) => void;
  pageParams?: MemoryPageParams;
}

interface MemoryViewModel {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  tags: string[];
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  original: UnifiedMemory;
}

interface MemoryStatCard {
  icon: typeof FileText;
  label: string;
  value: string;
}

const CATEGORY_FILTERS: MemoryCategoryFilter[] = [
  "all",
  "identity",
  "context",
  "preference",
  "experience",
  "activity",
];

const LEGACY_CATEGORY_SECTIONS = new Set<MemoryCategory>([
  "identity",
  "context",
  "preference",
  "experience",
  "activity",
]);

const MEMORY_LIBRARY_DYNAMIC_I18N_KEYS = [
  "memoryLibrary.toolbar.0",
  "memoryLibrary.toolbar.1",
  "memoryLibrary.toolbar.2",
  "memoryLibrary.toolbar.3",
  "memoryLibrary.toolbar.4",
  "memoryLibrary.toolbar.5",
  "memoryLibrary.leftTabs.group",
  "memoryLibrary.leftTabs.dimension",
  "memoryLibrary.leftTabs.date",
  "memoryLibrary.tabs.memory",
  "memoryLibrary.tabs.settings",
  "memoryLibrary.category.all",
  "memoryLibrary.category.identity",
  "memoryLibrary.category.context",
  "memoryLibrary.category.preference",
  "memoryLibrary.category.experience",
  "memoryLibrary.category.activity",
  "memoryLibrary.source.activity",
  "memoryLibrary.source.manual",
  "memoryLibrary.source.imported",
  "memoryLibrary.dimension.identity",
  "memoryLibrary.dimension.context",
  "memoryLibrary.dimension.preference",
  "memoryLibrary.dimension.experience",
  "memoryLibrary.dimension.activity",
] as const;

void MEMORY_LIBRARY_DYNAMIC_I18N_KEYS;

function normalizeOptionalText(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveInitialCategory(
  pageParams?: MemoryPageParams,
): MemoryCategoryFilter {
  const section = pageParams?.section;
  if (section && LEGACY_CATEGORY_SECTIONS.has(section as MemoryCategory)) {
    return section as MemoryCategory;
  }
  return "all";
}

function buildMemoryViewModel(memory: UnifiedMemory): MemoryViewModel {
  return {
    id: memory.id,
    title: normalizeUserFacingMemoryTitle({
      value: memory.title,
      category: memory.category,
    }),
    summary: normalizeUserFacingMemorySummary(memory.summary),
    content:
      normalizeOptionalText(memory.content) ??
      normalizeUserFacingMemorySummary(memory.summary),
    category: memory.category,
    source: memory.metadata.source,
    tags: normalizeUserFacingMemoryTags(memory.tags, 6),
    sessionId: memory.session_id,
    createdAt: memory.created_at,
    updatedAt: memory.updated_at,
    original: memory,
  };
}

function buildSearchText(memory: MemoryViewModel): string {
  return [
    memory.title,
    memory.summary,
    memory.content,
    memory.category,
    memory.source,
    memory.sessionId,
    memory.tags.join(" "),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function formatDateTime(timestamp: number | undefined, locale: string): string {
  if (!timestamp) {
    return "";
  }
  const normalized =
    timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatNumber(
  value: number | undefined | null,
  locale: string,
): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat(locale).format(value);
}

function formatBytes(bytes: number | undefined | null, locale: string): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "--";
  }
  if (bytes < 1024) {
    return `${formatNumber(bytes, locale)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(Math.round(bytes / 102.4) / 10, locale)} KB`;
  }
  return `${formatNumber(Math.round(bytes / 1024 / 102.4) / 10, locale)} MB`;
}

function estimateMemoryBytes(memory: MemoryViewModel): number {
  const text = [
    memory.title,
    memory.summary,
    memory.content,
    memory.tags.join(""),
  ].join("");
  return new TextEncoder().encode(text).length;
}

function estimateMemoryStorage(memories: MemoryViewModel[]): number {
  return memories.reduce(
    (total, memory) =>
      total +
      memory.title.length +
      memory.summary.length +
      memory.content.length +
      memory.tags.join("").length,
    0,
  );
}

function countIndexedFragments(memories: MemoryViewModel[]): number {
  return memories.reduce((total, memory) => {
    const fragments = memory.content
      .split(/\n+|[。.!?！？；;]/u)
      .map((line) => line.trim())
      .filter(Boolean);
    return total + Math.max(1, fragments.length);
  }, 0);
}

function buildMemoryPoints(memory: MemoryViewModel): string[] {
  const summary = memory.summary.toLocaleLowerCase();
  const lines = memory.content
    .split(/\n+|[。.!?！？；;]/u)
    .map((line) => line.replace(/^[-*•\s]+/u, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => line.toLocaleLowerCase() !== summary);

  const points = lines.length > 0 ? lines : [memory.summary];
  return Array.from(new Set(points)).slice(0, 8);
}

function formatRelativeTime(
  timestamp: number | undefined,
  locale: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (!timestamp) {
    return t("memoryLibrary.time.unknown");
  }
  const normalized =
    timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return t("memoryLibrary.time.unknown");
  }

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) {
    return t("memoryLibrary.time.justNow");
  }
  if (diffMinutes < 60) {
    return t("memoryLibrary.time.minutesAgo", { count: diffMinutes });
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return t("memoryLibrary.time.hoursAgo", { count: diffHours });
  }
  return formatDateTime(timestamp, locale);
}

function resolveMemorySourceKey(memory: MemoryViewModel): string {
  if (memory.source === "auto_extracted") {
    return "activity";
  }
  return memory.source;
}

export function MemoryPage({ pageParams }: MemoryPageProps) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.resolvedLanguage || i18n.language || "zh-CN";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UnifiedMemoryStatsResponse | null>(null);
  const [memories, setMemories] = useState<MemoryViewModel[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategoryFilter>(
    () => resolveInitialCategory(pageParams),
  );
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [vectorSearchEnabled, setVectorSearchEnabled] = useState(true);
  const [activePageTab, setActivePageTab] = useState<MemoryPageTab>("memory");

  useEffect(() => {
    setCategoryFilter(resolveInitialCategory(pageParams));
  }, [pageParams]);

  useEffect(() => {
    let disposed = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [nextStats, nextMemories, nextConfig] = await Promise.all([
          getUnifiedMemoryStats().catch(() => null),
          listUnifiedMemories({ limit: 120 }),
          getConfig().catch(() => null),
        ]);
        if (disposed) {
          return;
        }
        const viewModels = nextMemories.map(buildMemoryViewModel);
        setStats(nextStats);
        setMemories(viewModels);
        setVectorSearchEnabled(
          (nextConfig?.memory?.enabled ?? true) &&
            nextConfig?.memory?.embedding?.provider !== "disabled",
        );
      } catch (loadError) {
        if (!disposed) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : String(t("memoryLibrary.error.loadFailed")),
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      disposed = true;
    };
  }, [t]);

  const categoryCounts = useMemo(() => {
    return memories.reduce(
      (result, memory) => {
        result.all += 1;
        result[memory.category] += 1;
        return result;
      },
      {
        activity: 0,
        all: 0,
        context: 0,
        experience: 0,
        identity: 0,
        preference: 0,
      } as Record<MemoryCategoryFilter, number>,
    );
  }, [memories]);

  const filteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return memories.filter((memory) => {
      if (categoryFilter !== "all" && memory.category !== categoryFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return buildSearchText(memory).includes(normalizedQuery);
    });
  }, [categoryFilter, memories, query]);

  useEffect(() => {
    const focusTitle = normalizeOptionalText(pageParams?.focusMemoryTitle);
    const focusCategory = pageParams?.focusMemoryCategory;
    const focused =
      focusTitle &&
      filteredMemories.find((memory) => {
        if (focusCategory && memory.category !== focusCategory) {
          return false;
        }
        return (
          memory.title.toLocaleLowerCase() === focusTitle.toLocaleLowerCase()
        );
      });

    setSelectedMemoryId((current) => {
      if (focused) {
        return focused.id;
      }
      if (current && filteredMemories.some((memory) => memory.id === current)) {
        return current;
      }
      return null;
    });
  }, [
    filteredMemories,
    pageParams?.focusMemoryCategory,
    pageParams?.focusMemoryTitle,
  ]);

  const selectedMemory = useMemo(
    () =>
      filteredMemories.find((memory) => memory.id === selectedMemoryId) ?? null,
    [filteredMemories, selectedMemoryId],
  );
  const selectedMemoryPoints = useMemo(
    () => (selectedMemory ? buildMemoryPoints(selectedMemory) : []),
    [selectedMemory],
  );
  const storageUsed = stats?.storage_used ?? estimateMemoryStorage(memories);
  const indexedFragments = countIndexedFragments(memories);
  const totalEntries =
    stats?.memory_count ?? stats?.total_entries ?? memories.length;
  const translate = (
    key: string,
    values?: Record<string, string | number>,
  ): string =>
    String(
      (t as unknown as (k: string, v?: typeof values) => string)(key, values),
    );
  const statCards: MemoryStatCard[] = [
    {
      icon: FileText,
      label: translate("memoryLibrary.stats.files"),
      value: formatNumber(totalEntries, locale),
    },
    {
      icon: HardDrive,
      label: translate("memoryLibrary.stats.size"),
      value: formatBytes(storageUsed, locale),
    },
    {
      icon: Layers3,
      label: translate("memoryLibrary.stats.indexed"),
      value: formatNumber(indexedFragments, locale),
    },
    {
      icon: Search,
      label: translate("memoryLibrary.stats.vector"),
      value: vectorSearchEnabled
        ? translate("memoryLibrary.vector.on")
        : translate("memoryLibrary.vector.off"),
    },
  ];
  const recentMemories = filteredMemories.slice(0, 5);

  return (
    <div className="lime-workbench-theme-scope flex min-h-full items-center justify-center bg-slate-900/25 px-4 py-6 text-slate-900">
      <div
        className={cn(
          "grid h-[min(704px,calc(100vh-48px))] w-full max-w-[1080px] overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20",
          activePageTab === "memory"
            ? "lg:grid-cols-[300px_minmax(0,1fr)]"
            : "lg:grid-cols-1",
        )}
        data-testid="memory-library-shell"
      >
        {activePageTab === "memory" ? (
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
            <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Database className="h-4 w-4" />
                <span>{translate("memoryLibrary.title")}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500">
                {[
                  Download,
                  Moon,
                  Languages,
                  RefreshCw,
                  Plus,
                  PanelLeftClose,
                ].map((Icon, index) => (
                  <button
                    key={index}
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label={translate(`memoryLibrary.toolbar.${index}`)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>

            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={translate("memoryLibrary.search.placeholder")}
                  aria-label={translate("memoryLibrary.search.aria")}
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
                />
              </div>
              <div className="mt-3 grid grid-cols-3 text-xs text-slate-500">
                {["group", "dimension", "date"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cn(
                      "border-b py-2 text-left transition",
                      item === "dimension"
                        ? "border-slate-950 font-semibold text-slate-950"
                        : "border-slate-100 hover:text-slate-900",
                    )}
                  >
                    {translate(`memoryLibrary.leftTabs.${item}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              <div className="mb-2 flex items-center justify-between px-2 text-xs text-slate-500">
                <span>
                  {translate("memoryLibrary.group.userInsight", {
                    count: categoryCounts.all,
                  })}
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5 px-2">
                {CATEGORY_FILTERS.map((category) => {
                  const active = categoryFilter === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setCategoryFilter(category)}
                      className={cn(
                        "rounded-full border px-2 py-1 text-[11px] font-medium transition",
                        active
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-500 hover:text-slate-900",
                      )}
                    >
                      {translate(`memoryLibrary.category.${category}`)}
                      <span className="ml-1 opacity-70">
                        {formatNumber(categoryCounts[category], locale)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1" data-testid="memory-library-list">
                {loading ? (
                  Array.from({ length: 8 }, (_, index) => (
                    <div
                      key={index}
                      className="mx-1 h-[52px] animate-pulse rounded-md bg-slate-100"
                    />
                  ))
                ) : error ? (
                  <div className="mx-1 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    {error}
                  </div>
                ) : filteredMemories.length === 0 ? (
                  <div className="mx-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    {translate("memoryLibrary.empty")}
                  </div>
                ) : (
                  filteredMemories.map((memory) => {
                    const selected = memory.id === selectedMemory?.id;
                    return (
                      <button
                        key={memory.id}
                        type="button"
                        data-testid={`memory-library-entry-${memory.id}`}
                        onClick={() => setSelectedMemoryId(memory.id)}
                        className={cn(
                          "w-full rounded-md px-3 py-2 text-left transition",
                          selected
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                        )}
                      >
                        <p className="truncate text-sm font-medium">
                          {memory.title}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 truncate text-xs",
                            selected ? "text-blue-500" : "text-slate-400",
                          )}
                        >
                          {translate("memoryLibrary.listMeta", {
                            scope: translate("memoryLibrary.scope.user"),
                            size: formatBytes(
                              estimateMemoryBytes(memory),
                              locale,
                            ),
                          })}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
        ) : null}

        <main
          className="flex min-h-0 flex-col bg-white"
          data-testid="memory-library-detail"
        >
          <div className="flex h-12 items-center justify-between border-b border-slate-100 px-6">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="inline-flex rounded-lg bg-slate-100 p-1"
                role="tablist"
                aria-label={translate("memoryLibrary.tabs.aria")}
              >
                {(["memory", "settings"] as const).map((tab) => {
                  const active = activePageTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActivePageTab(tab)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "bg-white text-slate-950 shadow-sm shadow-slate-950/5"
                          : "text-slate-500 hover:text-slate-900",
                      )}
                    >
                      {translate(`memoryLibrary.tabs.${tab}`)}
                    </button>
                  );
                })}
              </div>
              <h1 className="truncate text-base font-semibold text-slate-950">
                {activePageTab === "settings"
                  ? translate("memoryLibrary.tabs.settings")
                  : (selectedMemory?.title ?? translate("memoryLibrary.title"))}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
              {activePageTab === "memory" && selectedMemory ? (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-slate-950"
                  >
                    <Languages className="h-3.5 w-3.5" />
                    {translate("memoryLibrary.action.translate")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-slate-950"
                  >
                    <History className="h-3.5 w-3.5" />
                    {translate("memoryLibrary.action.history")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-slate-950"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {translate("memoryLibrary.action.copy")}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-slate-100 px-3 py-1.5 font-semibold text-slate-950"
                  >
                    {translate("memoryLibrary.action.edit")}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label={translate("memoryLibrary.action.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-12 py-6">
            {activePageTab === "settings" ? (
              <MemorySettings />
            ) : selectedMemory ? (
              <div className="mx-auto max-w-[672px] space-y-4">
                <section className="rounded-md border border-slate-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-slate-950">
                    {translate("memoryLibrary.detail.metadataTitle")}
                  </h2>
                  <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    {[
                      {
                        label: translate("memoryLibrary.detail.time"),
                        value: formatDateTime(selectedMemory.createdAt, locale),
                      },
                      {
                        label: translate("memoryLibrary.detail.source"),
                        value: translate(
                          `memoryLibrary.source.${resolveMemorySourceKey(
                            selectedMemory,
                          )}`,
                        ),
                      },
                      {
                        label: translate("memoryLibrary.detail.dimension"),
                        value: translate(
                          `memoryLibrary.dimension.${selectedMemory.category}`,
                        ),
                      },
                      {
                        label: translate("memoryLibrary.detail.apps"),
                        value:
                          selectedMemory.tags.length > 0
                            ? selectedMemory.tags.join(", ")
                            : translate("memoryLibrary.detail.emptyValue"),
                      },
                      {
                        label: translate("memoryLibrary.detail.session"),
                        value:
                          normalizeOptionalText(selectedMemory.sessionId) ??
                          translate("memoryLibrary.detail.emptyValue"),
                      },
                    ].map((item) => (
                      <div key={item.label} className="contents">
                        <dt className="text-slate-500">{item.label}</dt>
                        <dd className="break-words text-slate-900">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-slate-950">
                    {translate("memoryLibrary.points.title")}
                  </h2>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-900">
                    {selectedMemoryPoints.map((point, index) => (
                      <li key={`${point}-${index}`}>{point}</li>
                    ))}
                  </ul>
                </section>
              </div>
            ) : (
              <div className="mx-auto max-w-[624px] space-y-6">
                <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {statCards.map((item) => (
                    <article
                      key={item.label}
                      className="rounded-md border border-slate-200 bg-white px-4 py-4 text-center"
                    >
                      <p className="text-2xl font-semibold text-slate-950">
                        {item.value}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.label}
                      </p>
                    </article>
                  ))}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {translate("memoryLibrary.recent.title")}
                    </h2>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {translate("memoryLibrary.action.new")}
                    </button>
                  </div>

                  {recentMemories.map((memory) => (
                    <button
                      key={memory.id}
                      type="button"
                      onClick={() => setSelectedMemoryId(memory.id)}
                      className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-950">
                              {memory.title}
                            </p>
                            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                              {translate(
                                `memoryLibrary.source.${resolveMemorySourceKey(
                                  memory,
                                )}`,
                              )}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            - {memory.summary}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                          <span>
                            {formatBytes(estimateMemoryBytes(memory), locale)}
                          </span>
                          <span>
                            {formatRelativeTime(
                              memory.updatedAt,
                              locale,
                              translate,
                            )}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </button>
                  ))}
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
