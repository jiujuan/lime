import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Compass,
  Image as ImageIcon,
  Layers3,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getConfig, saveConfig, type Config } from "@/lib/api/appConfig";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";

type SearchEngine = "google" | "xiaohongshu";
type WebSearchProvider =
  | "tavily"
  | "multi_search_engine"
  | "duckduckgo_instant"
  | "bing_search_api"
  | "google_custom_search";

type MultiSearchEngineOption = {
  name: string;
  url_template: string;
  enabled: boolean;
};

interface SurfacePanelProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tipAriaLabel: string;
  aside?: ReactNode;
  children: ReactNode;
}

interface FieldBlockProps {
  label: string;
  htmlFor: string;
  hint?: string;
  tipAriaLabel?: string;
  children: ReactNode;
}

interface StatusPillProps {
  active: boolean;
  label: string;
}

const INPUT_CLASS_NAME =
  "w-full rounded-[16px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200";
const TEXT_BUTTON_CLASS_NAME =
  "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900";
const ACTION_BUTTON_CLASS_NAME =
  "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON_CLASS_NAME =
  "rounded-full border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";

const PEXELS_APPLY_URL = "https://www.pexels.com/api/new/";
const PEXELS_DOC_URL = "https://www.pexels.com/api/";
const PIXABAY_APPLY_URL = "https://pixabay.com/accounts/register/";
const PIXABAY_DOC_URL = "https://pixabay.com/api/docs/";
const TAVILY_APPLY_URL = "https://app.tavily.com/";
const TAVILY_DOC_URL = "https://docs.tavily.com/";
const MSE_DOC_URL = "https://docs.tavily.com/";
const BING_SEARCH_APPLY_URL =
  "https://portal.azure.com/#create/Microsoft.CognitiveServicesBingSearch-v7";
const BING_SEARCH_DOC_URL =
  "https://learn.microsoft.com/zh-cn/bing/search-apis/bing-web-search/overview";
const GOOGLE_SEARCH_API_APPLY_URL =
  "https://console.cloud.google.com/apis/library/customsearch.googleapis.com";
const GOOGLE_SEARCH_DOC_URL =
  "https://developers.google.com/custom-search/v1/overview";
const GOOGLE_SEARCH_CSE_URL = "https://programmablesearchengine.google.com/";

const DEFAULT_MSE_ENGINES: MultiSearchEngineOption[] = [
  {
    name: "google",
    url_template: "https://www.google.com/search?q={query}",
    enabled: true,
  },
  {
    name: "bing",
    url_template: "https://www.bing.com/search?q={query}",
    enabled: true,
  },
  {
    name: "duckduckgo",
    url_template: "https://duckduckgo.com/?q={query}",
    enabled: true,
  },
  {
    name: "yahoo",
    url_template: "https://search.yahoo.com/search?p={query}",
    enabled: true,
  },
  {
    name: "baidu",
    url_template: "https://www.baidu.com/s?wd={query}",
    enabled: true,
  },
  {
    name: "yandex",
    url_template: "https://yandex.com/search/?text={query}",
    enabled: true,
  },
  {
    name: "ecosia",
    url_template: "https://www.ecosia.org/search?q={query}",
    enabled: true,
  },
  {
    name: "brave",
    url_template: "https://search.brave.com/search?q={query}",
    enabled: true,
  },
  {
    name: "startpage",
    url_template: "https://www.startpage.com/do/search?query={query}",
    enabled: true,
  },
  {
    name: "qwant",
    url_template: "https://www.qwant.com/?q={query}&t=web",
    enabled: true,
  },
  {
    name: "sogou",
    url_template: "https://www.sogou.com/web?query={query}",
    enabled: true,
  },
  {
    name: "so360",
    url_template: "https://www.so.com/s?q={query}",
    enabled: true,
  },
  {
    name: "aol",
    url_template: "https://search.aol.com/aol/search?q={query}",
    enabled: true,
  },
  {
    name: "ask",
    url_template: "https://www.ask.com/web?q={query}",
    enabled: true,
  },
  {
    name: "naver",
    url_template: "https://search.naver.com/search.naver?query={query}",
    enabled: true,
  },
  {
    name: "seznam",
    url_template: "https://search.seznam.cz/?q={query}",
    enabled: true,
  },
  {
    name: "dogpile",
    url_template: "https://www.dogpile.com/serp?q={query}",
    enabled: true,
  },
];

const DEFAULT_MSE_ENGINE_NAMES = new Set(
  DEFAULT_MSE_ENGINES.map((item) => item.name),
);
const ALL_PROVIDERS: WebSearchProvider[] = [
  "tavily",
  "multi_search_engine",
  "duckduckgo_instant",
  "bing_search_api",
  "google_custom_search",
];

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isWebSearchProvider(value: string): value is WebSearchProvider {
  return ALL_PROVIDERS.includes(value as WebSearchProvider);
}

function parseBoundedInt(
  value: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function SurfacePanel({
  icon: Icon,
  title,
  description,
  tipAriaLabel,
  aside,
  children,
}: SurfacePanelProps) {
  return (
    <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Icon className="h-4 w-4 text-sky-600" />
            {title}
            <WorkbenchInfoTip
              ariaLabel={tipAriaLabel}
              content={description}
              tone="slate"
            />
          </div>
        </div>
        {aside ? (
          <div className="flex flex-wrap items-center gap-2">{aside}</div>
        ) : null}
      </div>

      <div className="mt-5">{children}</div>
    </article>
  );
}

function FieldBlock({
  label,
  htmlFor,
  hint,
  tipAriaLabel,
  children,
}: FieldBlockProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-2 text-sm font-medium text-slate-900"
      >
        <span>{label}</span>
        {hint ? (
          <WorkbenchInfoTip
            ariaLabel={tipAriaLabel || label}
            content={hint}
            tone="slate"
          />
        ) : null}
      </label>
      {children}
    </div>
  );
}

function StatusPill({ active, label }: StatusPillProps) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-500",
      )}
    >
      {label}
    </span>
  );
}

function SecretInput({
  id,
  value,
  placeholder,
  visible,
  onToggleVisible,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_CLASS_NAME} pr-20`}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
      >
        {visible
          ? t("settings.webSearch.secret.hide")
          : t("settings.webSearch.secret.show")}
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 pb-20">
      <div className="h-[228px] animate-pulse rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(244,251,248,0.98)_0%,rgba(248,250,252,0.98)_45%,rgba(241,246,255,0.96)_100%)]" />
      <div className="h-[520px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
    </div>
  );
}

export function WebSearchSettings() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [draftEngine, setDraftEngine] = useState<SearchEngine>("google");
  const [draftProvider, setDraftProvider] =
    useState<WebSearchProvider>("duckduckgo_instant");
  const [draftProviderPriority, setDraftProviderPriority] = useState("");
  const [draftTavilyApiKey, setDraftTavilyApiKey] = useState("");
  const [draftBingSearchApiKey, setDraftBingSearchApiKey] = useState("");
  const [draftGoogleSearchApiKey, setDraftGoogleSearchApiKey] = useState("");
  const [draftGoogleSearchEngineId, setDraftGoogleSearchEngineId] =
    useState("");
  const [draftMsePriority, setDraftMsePriority] = useState("");
  const [draftMseMaxResultsPerEngine, setDraftMseMaxResultsPerEngine] =
    useState("5");
  const [draftMseMaxTotalResults, setDraftMseMaxTotalResults] = useState("20");
  const [draftMseTimeoutMs, setDraftMseTimeoutMs] = useState("4000");
  const [draftMseCustomEngineName, setDraftMseCustomEngineName] = useState("");
  const [draftMseCustomEngineTemplate, setDraftMseCustomEngineTemplate] =
    useState("");
  const [draftPexelsApiKey, setDraftPexelsApiKey] = useState("");
  const [draftPixabayApiKey, setDraftPixabayApiKey] = useState("");
  const [showTavilyApiKey, setShowTavilyApiKey] = useState(false);
  const [showBingSearchApiKey, setShowBingSearchApiKey] = useState(false);
  const [showGoogleSearchApiKey, setShowGoogleSearchApiKey] = useState(false);
  const [showPexelsApiKey, setShowPexelsApiKey] = useState(false);
  const [showPixabayApiKey, setShowPixabayApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const nextConfig = await getConfig();
      const engine = (nextConfig.web_search?.engine ||
        "google") as SearchEngine;
      const provider = (nextConfig.web_search?.provider ||
        "duckduckgo_instant") as WebSearchProvider;
      const providerPriority = (
        nextConfig.web_search?.provider_priority || []
      ).join(", ");
      const tavilyApiKey = nextConfig.web_search?.tavily_api_key || "";
      const bingSearchApiKey = nextConfig.web_search?.bing_search_api_key || "";
      const googleSearchApiKey =
        nextConfig.web_search?.google_search_api_key || "";
      const googleSearchEngineId =
        nextConfig.web_search?.google_search_engine_id || "";
      const multiSearch = nextConfig.web_search?.multi_search;
      const msePriority = (multiSearch?.priority || []).join(", ");
      const mseMaxResultsPerEngine = String(
        multiSearch?.max_results_per_engine || 5,
      );
      const mseMaxTotalResults = String(multiSearch?.max_total_results || 20);
      const mseTimeoutMs = String(multiSearch?.timeout_ms || 4000);
      const customEngine = (multiSearch?.engines || []).find(
        (engineItem) => !DEFAULT_MSE_ENGINE_NAMES.has(engineItem.name),
      );
      const pexelsApiKey =
        nextConfig.image_gen?.image_search_pexels_api_key || "";
      const pixabayApiKey =
        nextConfig.image_gen?.image_search_pixabay_api_key || "";

      setConfig(nextConfig);
      setDraftEngine(engine);
      setDraftProvider(provider);
      setDraftProviderPriority(providerPriority);
      setDraftTavilyApiKey(tavilyApiKey);
      setDraftBingSearchApiKey(bingSearchApiKey);
      setDraftGoogleSearchApiKey(googleSearchApiKey);
      setDraftGoogleSearchEngineId(googleSearchEngineId);
      setDraftMsePriority(msePriority);
      setDraftMseMaxResultsPerEngine(mseMaxResultsPerEngine);
      setDraftMseMaxTotalResults(mseMaxTotalResults);
      setDraftMseTimeoutMs(mseTimeoutMs);
      setDraftMseCustomEngineName(customEngine?.name || "");
      setDraftMseCustomEngineTemplate(customEngine?.url_template || "");
      setDraftPexelsApiKey(pexelsApiKey);
      setDraftPixabayApiKey(pixabayApiKey);
    } catch (error) {
      console.error("加载网络搜索配置失败:", error);
      setMessage({
        type: "error",
        text: t("settings.webSearch.message.loadFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const currentEngine = useMemo(
    () => (config?.web_search?.engine || "google") as SearchEngine,
    [config],
  );
  const currentProvider = useMemo(
    () =>
      (config?.web_search?.provider ||
        "duckduckgo_instant") as WebSearchProvider,
    [config],
  );
  const currentProviderPriority = useMemo(
    () => (config?.web_search?.provider_priority || []).join(", "),
    [config],
  );
  const currentTavilyApiKey = useMemo(
    () => config?.web_search?.tavily_api_key || "",
    [config],
  );
  const currentBingSearchApiKey = useMemo(
    () => config?.web_search?.bing_search_api_key || "",
    [config],
  );
  const currentGoogleSearchApiKey = useMemo(
    () => config?.web_search?.google_search_api_key || "",
    [config],
  );
  const currentGoogleSearchEngineId = useMemo(
    () => config?.web_search?.google_search_engine_id || "",
    [config],
  );
  const currentMsePriority = useMemo(
    () => (config?.web_search?.multi_search?.priority || []).join(", "),
    [config],
  );
  const currentMseMaxResultsPerEngine = useMemo(
    () => String(config?.web_search?.multi_search?.max_results_per_engine || 5),
    [config],
  );
  const currentMseMaxTotalResults = useMemo(
    () => String(config?.web_search?.multi_search?.max_total_results || 20),
    [config],
  );
  const currentMseTimeoutMs = useMemo(
    () => String(config?.web_search?.multi_search?.timeout_ms || 4000),
    [config],
  );
  const currentMseCustomEngine = useMemo(
    () =>
      (config?.web_search?.multi_search?.engines || []).find(
        (engineItem) => !DEFAULT_MSE_ENGINE_NAMES.has(engineItem.name),
      ) || null,
    [config],
  );
  const currentPexelsApiKey = useMemo(
    () => config?.image_gen?.image_search_pexels_api_key || "",
    [config],
  );
  const currentPixabayApiKey = useMemo(
    () => config?.image_gen?.image_search_pixabay_api_key || "",
    [config],
  );

  const hasUnsavedChanges =
    draftEngine !== currentEngine ||
    draftProvider !== currentProvider ||
    draftProviderPriority.trim() !== currentProviderPriority ||
    draftTavilyApiKey.trim() !== currentTavilyApiKey ||
    draftBingSearchApiKey.trim() !== currentBingSearchApiKey ||
    draftGoogleSearchApiKey.trim() !== currentGoogleSearchApiKey ||
    draftGoogleSearchEngineId.trim() !== currentGoogleSearchEngineId ||
    draftMsePriority.trim() !== currentMsePriority ||
    draftMseMaxResultsPerEngine.trim() !== currentMseMaxResultsPerEngine ||
    draftMseMaxTotalResults.trim() !== currentMseMaxTotalResults ||
    draftMseTimeoutMs.trim() !== currentMseTimeoutMs ||
    draftMseCustomEngineName.trim() !== (currentMseCustomEngine?.name || "") ||
    draftMseCustomEngineTemplate.trim() !==
      (currentMseCustomEngine?.url_template || "") ||
    draftPexelsApiKey.trim() !== currentPexelsApiKey ||
    draftPixabayApiKey.trim() !== currentPixabayApiKey;

  const tavilyKeyConfigured = draftTavilyApiKey.trim().length > 0;
  const bingSearchKeyConfigured = draftBingSearchApiKey.trim().length > 0;
  const googleSearchKeyConfigured = draftGoogleSearchApiKey.trim().length > 0;
  const googleSearchEngineConfigured =
    draftGoogleSearchEngineId.trim().length > 0;
  const mseCustomEngineReady =
    draftMseCustomEngineName.trim().length > 0 &&
    draftMseCustomEngineTemplate.trim().includes("{query}");
  const pexelsKeyConfigured = draftPexelsApiKey.trim().length > 0;
  const pixabayKeyConfigured = draftPixabayApiKey.trim().length > 0;
  const filledLabel = t("settings.webSearch.status.filled");
  const missingLabel = t("settings.webSearch.status.missing");
  const readyLabel = t("settings.webSearch.status.ready");
  const notConfiguredLabel = t("settings.webSearch.status.notConfigured");
  const googleEngineLabel = t("settings.webSearch.engine.google");
  const xiaohongshuEngineLabel = t("settings.webSearch.engine.xiaohongshu");
  const tavilyProviderLabel = t("settings.webSearch.provider.tavily");
  const multiSearchEngineProviderLabel = t(
    "settings.webSearch.provider.multiSearchEngine",
  );
  const duckduckgoInstantProviderLabel = t(
    "settings.webSearch.provider.duckduckgoInstant",
  );
  const bingSearchApiProviderLabel = t(
    "settings.webSearch.provider.bingSearchApi",
  );
  const googleCustomSearchProviderLabel = t(
    "settings.webSearch.provider.googleCustomSearch",
  );
  const googleCseProviderLabel = t("settings.webSearch.provider.googleCse");
  const pexelsProviderLabel = t("settings.webSearch.provider.pexels");
  const pixabayProviderLabel = t("settings.webSearch.provider.pixabay");
  const credentialStatusLabel = (name: string, configured: boolean) =>
    t("settings.webSearch.status.credential", {
      name,
      status: configured ? filledLabel : missingLabel,
    });

  const providerChainPreview =
    parseCsv(draftProviderPriority).length > 0
      ? parseCsv(draftProviderPriority).join(" -> ")
      : t("settings.webSearch.providerChain.auto");

  const handleSave = async () => {
    if (!config || !hasUnsavedChanges) return;

    const providerPriority = parseCsv(draftProviderPriority).filter(
      isWebSearchProvider,
    );
    const msePriority = parseCsv(draftMsePriority);
    const customName = draftMseCustomEngineName.trim();
    const customTemplate = draftMseCustomEngineTemplate.trim();

    const mseEngines: MultiSearchEngineOption[] = [...DEFAULT_MSE_ENGINES];
    if (customName && customTemplate.includes("{query}")) {
      mseEngines.push({
        name: customName,
        url_template: customTemplate,
        enabled: true,
      });
    }

    const nextConfig: Config = {
      ...config,
      web_search: {
        engine: draftEngine,
        provider: draftProvider,
        provider_priority: providerPriority,
        tavily_api_key: draftTavilyApiKey.trim() || null,
        bing_search_api_key: draftBingSearchApiKey.trim() || null,
        google_search_api_key: draftGoogleSearchApiKey.trim() || null,
        google_search_engine_id: draftGoogleSearchEngineId.trim() || null,
        multi_search: {
          priority: msePriority,
          engines: mseEngines,
          max_results_per_engine: parseBoundedInt(
            draftMseMaxResultsPerEngine,
            1,
            20,
            5,
          ),
          max_total_results: parseBoundedInt(
            draftMseMaxTotalResults,
            1,
            100,
            20,
          ),
          timeout_ms: parseBoundedInt(draftMseTimeoutMs, 500, 15000, 4000),
        },
      },
      image_gen: {
        ...(config.image_gen || {}),
        image_search_pexels_api_key: draftPexelsApiKey.trim(),
        image_search_pixabay_api_key: draftPixabayApiKey.trim(),
      },
    };

    setSaving(true);
    setMessage(null);
    try {
      await saveConfig(nextConfig);
      setConfig(nextConfig);
      setMessage({
        type: "success",
        text: t("settings.webSearch.message.saved"),
      });
      setTimeout(() => setMessage(null), 2500);
    } catch (error) {
      setMessage({
        type: "error",
        text: t("settings.webSearch.message.saveFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraftEngine(currentEngine);
    setDraftProvider(currentProvider);
    setDraftProviderPriority(currentProviderPriority);
    setDraftTavilyApiKey(currentTavilyApiKey);
    setDraftBingSearchApiKey(currentBingSearchApiKey);
    setDraftGoogleSearchApiKey(currentGoogleSearchApiKey);
    setDraftGoogleSearchEngineId(currentGoogleSearchEngineId);
    setDraftMsePriority(currentMsePriority);
    setDraftMseMaxResultsPerEngine(currentMseMaxResultsPerEngine);
    setDraftMseMaxTotalResults(currentMseMaxTotalResults);
    setDraftMseTimeoutMs(currentMseTimeoutMs);
    setDraftMseCustomEngineName(currentMseCustomEngine?.name || "");
    setDraftMseCustomEngineTemplate(currentMseCustomEngine?.url_template || "");
    setDraftPexelsApiKey(currentPexelsApiKey);
    setDraftPixabayApiKey(currentPixabayApiKey);
    setMessage(null);
  };

  const openExternalUrl = async (url: string) => {
    try {
      await openExternalUrlWithSystemBrowser(url);
    } catch (error) {
      console.error("打开外部链接失败:", error);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6 pb-20">
      {message ? (
        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-[20px] border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
            message.type === "error"
              ? "border-rose-200 bg-rose-50/90 text-rose-700"
              : "border-emerald-200 bg-emerald-50/90 text-emerald-700",
          )}
        >
          <span>{message.text}</span>
          {message.type === "error" ? (
            <button
              type="button"
              onClick={() => void loadConfig()}
              className="rounded-full border border-current/15 bg-white/80 px-3 py-1.5 text-xs font-medium transition hover:bg-white"
            >
              {t("settings.webSearch.action.reload")}
            </button>
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="search" className="space-y-5">
        <section className="rounded-[26px] border border-slate-200/80 bg-white px-5 py-4 shadow-sm shadow-slate-950/5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
                  {t("settings.webSearch.title")}
                </h1>
                <WorkbenchInfoTip
                  ariaLabel={t("settings.webSearch.hero.tipAria")}
                  content={t("settings.webSearch.hero.tip")}
                  tone="mint"
                />
              </div>
              <p className="text-sm text-slate-500">
                {t("settings.webSearch.description")}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:items-end">
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {t("settings.webSearch.summary.engine", {
                    engine:
                      draftEngine === "google"
                        ? googleEngineLabel
                        : xiaohongshuEngineLabel,
                  })}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {t("settings.webSearch.summary.provider", {
                    provider: draftProvider,
                  })}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    hasUnsavedChanges
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  {t("settings.webSearch.summary.status", {
                    status: hasUnsavedChanges
                      ? t("settings.webSearch.status.pendingSave")
                      : t("settings.webSearch.status.saved"),
                  })}
                </span>
              </div>

              <TabsList className="grid h-auto w-full grid-cols-2 rounded-[20px] border border-slate-200 bg-slate-50 p-1 shadow-sm shadow-slate-950/5 lg:grid-cols-4 xl:w-[640px]">
                <TabsTrigger
                  value="search"
                  data-testid="web-search-tab-search"
                  className="gap-2 rounded-[14px] px-3 py-3"
                >
                  <Search className="h-4 w-4" />
                  {t("settings.webSearch.tabs.searchChain")}
                </TabsTrigger>
                <TabsTrigger
                  value="providers"
                  data-testid="web-search-tab-providers"
                  className="gap-2 rounded-[14px] px-3 py-3"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {t("settings.webSearch.tabs.providerCredentials")}
                </TabsTrigger>
                <TabsTrigger
                  value="mse"
                  data-testid="web-search-tab-mse"
                  className="gap-2 rounded-[14px] px-3 py-3"
                >
                  <Layers3 className="h-4 w-4" />
                  {t("settings.webSearch.tabs.mse")}
                </TabsTrigger>
                <TabsTrigger
                  value="images"
                  data-testid="web-search-tab-images"
                  className="gap-2 rounded-[14px] px-3 py-3"
                >
                  <ImageIcon className="h-4 w-4" />
                  {t("settings.webSearch.tabs.imageSearch")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </section>

        <TabsContent value="search" className="mt-0">
          <SurfacePanel
            icon={Search}
            title={t("settings.webSearch.searchChain.title")}
            description={t("settings.webSearch.searchChain.description")}
            tipAriaLabel={t("settings.webSearch.searchChain.tipAria")}
            aside={
              <>
                <StatusPill
                  active={draftEngine === "google"}
                  label={
                    draftEngine === "google"
                      ? t("settings.webSearch.searchChain.engineStatus.google")
                      : t(
                          "settings.webSearch.searchChain.engineStatus.xiaohongshu",
                        )
                  }
                />
                <StatusPill
                  active={draftProvider === "duckduckgo_instant"}
                  label={t("settings.webSearch.summary.provider", {
                    provider: draftProvider,
                  })}
                />
              </>
            }
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="space-y-4">
                  <FieldBlock
                    label={t("settings.webSearch.searchChain.engine.label")}
                    htmlFor="web-search-engine"
                    hint={t("settings.webSearch.searchChain.engine.hint")}
                    tipAriaLabel={t(
                      "settings.webSearch.searchChain.engine.tipAria",
                    )}
                  >
                    <select
                      id="web-search-engine"
                      value={draftEngine}
                      onChange={(e) =>
                        setDraftEngine(e.target.value as SearchEngine)
                      }
                      className={`${INPUT_CLASS_NAME} h-11`}
                    >
                      <option value="google">{googleEngineLabel}</option>
                      <option value="xiaohongshu">
                        {t("settings.webSearch.engine.xiaohongshu")}
                      </option>
                    </select>
                  </FieldBlock>

                  <FieldBlock
                    label={t("settings.webSearch.searchChain.provider.label")}
                    htmlFor="web-search-provider"
                  >
                    <select
                      id="web-search-provider"
                      value={draftProvider}
                      onChange={(e) =>
                        setDraftProvider(e.target.value as WebSearchProvider)
                      }
                      className={`${INPUT_CLASS_NAME} h-11`}
                    >
                      <option value="tavily">{tavilyProviderLabel}</option>
                      <option value="multi_search_engine">
                        {multiSearchEngineProviderLabel}
                      </option>
                      <option value="duckduckgo_instant">
                        {duckduckgoInstantProviderLabel}
                      </option>
                      <option value="bing_search_api">
                        {bingSearchApiProviderLabel}
                      </option>
                      <option value="google_custom_search">
                        {googleCustomSearchProviderLabel}
                      </option>
                    </select>
                  </FieldBlock>

                  <FieldBlock
                    label={t(
                      "settings.webSearch.searchChain.providerPriority.label",
                    )}
                    htmlFor="web-search-provider-priority"
                    hint={t(
                      "settings.webSearch.searchChain.providerPriority.hint",
                    )}
                    tipAriaLabel={t(
                      "settings.webSearch.searchChain.providerPriority.tipAria",
                    )}
                  >
                    <input
                      id="web-search-provider-priority"
                      value={draftProviderPriority}
                      onChange={(e) => setDraftProviderPriority(e.target.value)}
                      placeholder={t(
                        "settings.webSearch.searchChain.providerPriority.placeholder",
                      )}
                      className={INPUT_CLASS_NAME}
                    />
                  </FieldBlock>
                </div>
              </article>

              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="space-y-4">
                  <div className="rounded-[20px] border border-slate-200/80 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {t(
                        "settings.webSearch.searchChain.credentialsStatus.title",
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusPill
                        active={tavilyKeyConfigured}
                        label={credentialStatusLabel(
                          tavilyProviderLabel,
                          tavilyKeyConfigured,
                        )}
                      />
                      <StatusPill
                        active={bingSearchKeyConfigured}
                        label={credentialStatusLabel(
                          bingSearchApiProviderLabel,
                          bingSearchKeyConfigured,
                        )}
                      />
                      <StatusPill
                        active={googleSearchKeyConfigured}
                        label={credentialStatusLabel(
                          googleCustomSearchProviderLabel,
                          googleSearchKeyConfigured,
                        )}
                      />
                      <StatusPill
                        active={googleSearchEngineConfigured}
                        label={credentialStatusLabel(
                          googleCseProviderLabel,
                          googleSearchEngineConfigured,
                        )}
                      />
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-slate-200/80 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span>
                        {t(
                          "settings.webSearch.searchChain.fallbackPreview.title",
                        )}
                      </span>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.webSearch.searchChain.fallbackPreview.tipAria",
                        )}
                        content={t(
                          "settings.webSearch.searchChain.fallbackPreview.tip",
                        )}
                        tone="slate"
                      />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {providerChainPreview}
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-slate-200/80 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span>
                        {t("settings.webSearch.searchChain.suggestion.title")}
                      </span>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.webSearch.searchChain.suggestion.tipAria",
                        )}
                        content={t(
                          "settings.webSearch.searchChain.suggestion.tip",
                        )}
                        tone="slate"
                      />
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </SurfacePanel>
        </TabsContent>

        <TabsContent value="providers" className="mt-0">
          <SurfacePanel
            icon={ShieldCheck}
            title={t("settings.webSearch.providers.title")}
            description={t("settings.webSearch.providers.description")}
            tipAriaLabel={t("settings.webSearch.providers.tipAria")}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <FieldBlock
                  label={t("settings.webSearch.providers.tavily.label")}
                  htmlFor="web-search-tavily-key"
                  hint={t("settings.webSearch.providers.tavily.hint")}
                  tipAriaLabel={t(
                    "settings.webSearch.providers.tavily.tipAria",
                  )}
                >
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(TAVILY_APPLY_URL)}
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.providers.tavily.apply")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(TAVILY_DOC_URL)}
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.action.viewDocs")}
                      </button>
                    </div>
                    <SecretInput
                      id="web-search-tavily-key"
                      value={draftTavilyApiKey}
                      placeholder={t(
                        "settings.webSearch.providers.tavily.placeholder",
                      )}
                      visible={showTavilyApiKey}
                      onToggleVisible={() =>
                        setShowTavilyApiKey((prev) => !prev)
                      }
                      onChange={setDraftTavilyApiKey}
                    />
                  </>
                </FieldBlock>
              </article>

              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <FieldBlock
                  label={t("settings.webSearch.providers.bing.label")}
                  htmlFor="web-search-bing-key"
                  hint={t("settings.webSearch.providers.bing.hint")}
                  tipAriaLabel={t("settings.webSearch.providers.bing.tipAria")}
                >
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void openExternalUrl(BING_SEARCH_APPLY_URL)
                        }
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.providers.bing.apply")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void openExternalUrl(BING_SEARCH_DOC_URL)
                        }
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.action.viewDocs")}
                      </button>
                    </div>
                    <SecretInput
                      id="web-search-bing-key"
                      value={draftBingSearchApiKey}
                      placeholder={t(
                        "settings.webSearch.providers.bing.placeholder",
                      )}
                      visible={showBingSearchApiKey}
                      onToggleVisible={() =>
                        setShowBingSearchApiKey((prev) => !prev)
                      }
                      onChange={setDraftBingSearchApiKey}
                    />
                  </>
                </FieldBlock>
              </article>

              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4 xl:col-span-2">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.74fr)]">
                  <FieldBlock
                    label={t("settings.webSearch.providers.googleApi.label")}
                    htmlFor="web-search-google-key"
                    hint={t("settings.webSearch.providers.googleApi.hint")}
                    tipAriaLabel={t(
                      "settings.webSearch.providers.googleApi.tipAria",
                    )}
                  >
                    <>
                      <div className="mb-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void openExternalUrl(GOOGLE_SEARCH_API_APPLY_URL)
                          }
                          className={TEXT_BUTTON_CLASS_NAME}
                        >
                          {t("settings.webSearch.providers.googleApi.apply")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void openExternalUrl(GOOGLE_SEARCH_DOC_URL)
                          }
                          className={TEXT_BUTTON_CLASS_NAME}
                        >
                          {t("settings.webSearch.action.viewDocs")}
                        </button>
                      </div>
                      <SecretInput
                        id="web-search-google-key"
                        value={draftGoogleSearchApiKey}
                        placeholder={t(
                          "settings.webSearch.providers.googleApi.placeholder",
                        )}
                        visible={showGoogleSearchApiKey}
                        onToggleVisible={() =>
                          setShowGoogleSearchApiKey((prev) => !prev)
                        }
                        onChange={setDraftGoogleSearchApiKey}
                      />
                    </>
                  </FieldBlock>

                  <FieldBlock
                    label={t("settings.webSearch.providers.googleEngine.label")}
                    htmlFor="web-search-google-engine-id"
                    hint={t("settings.webSearch.providers.googleEngine.hint")}
                    tipAriaLabel={t(
                      "settings.webSearch.providers.googleEngine.tipAria",
                    )}
                  >
                    <>
                      <div className="mb-2">
                        <button
                          type="button"
                          onClick={() =>
                            void openExternalUrl(GOOGLE_SEARCH_CSE_URL)
                          }
                          className={TEXT_BUTTON_CLASS_NAME}
                        >
                          {t(
                            "settings.webSearch.providers.googleEngine.create",
                          )}
                        </button>
                      </div>
                      <input
                        id="web-search-google-engine-id"
                        value={draftGoogleSearchEngineId}
                        onChange={(e) =>
                          setDraftGoogleSearchEngineId(e.target.value)
                        }
                        placeholder={t(
                          "settings.webSearch.providers.googleEngine.placeholder",
                        )}
                        className={INPUT_CLASS_NAME}
                      />
                    </>
                  </FieldBlock>
                </div>
              </article>
            </div>
          </SurfacePanel>
        </TabsContent>

        <TabsContent value="mse" className="mt-0">
          <SurfacePanel
            icon={Layers3}
            title={t("settings.webSearch.mse.title")}
            description={t("settings.webSearch.mse.description")}
            tipAriaLabel={t("settings.webSearch.mse.tipAria")}
            aside={
              <StatusPill
                active={mseCustomEngineReady}
                label={t("settings.webSearch.mse.customTemplateStatus", {
                  status: mseCustomEngineReady
                    ? readyLabel
                    : notConfiguredLabel,
                })}
              />
            }
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="space-y-4">
                  <FieldBlock
                    label={t("settings.webSearch.mse.priority.label")}
                    htmlFor="web-search-mse-priority"
                  >
                    <>
                      <div className="mb-2">
                        <button
                          type="button"
                          onClick={() => void openExternalUrl(MSE_DOC_URL)}
                          className={TEXT_BUTTON_CLASS_NAME}
                        >
                          {t("settings.webSearch.mse.action.viewDesign")}
                        </button>
                      </div>
                      <input
                        id="web-search-mse-priority"
                        value={draftMsePriority}
                        onChange={(e) => setDraftMsePriority(e.target.value)}
                        placeholder={t(
                          "settings.webSearch.mse.priority.placeholder",
                        )}
                        className={INPUT_CLASS_NAME}
                      />
                    </>
                  </FieldBlock>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <FieldBlock
                      label={t("settings.webSearch.mse.maxPerEngine.label")}
                      htmlFor="web-search-mse-max-per-engine"
                    >
                      <input
                        id="web-search-mse-max-per-engine"
                        value={draftMseMaxResultsPerEngine}
                        onChange={(e) =>
                          setDraftMseMaxResultsPerEngine(e.target.value)
                        }
                        className={INPUT_CLASS_NAME}
                      />
                    </FieldBlock>
                    <FieldBlock
                      label={t("settings.webSearch.mse.maxTotal.label")}
                      htmlFor="web-search-mse-max-total"
                    >
                      <input
                        id="web-search-mse-max-total"
                        value={draftMseMaxTotalResults}
                        onChange={(e) =>
                          setDraftMseMaxTotalResults(e.target.value)
                        }
                        className={INPUT_CLASS_NAME}
                      />
                    </FieldBlock>
                    <FieldBlock
                      label={t("settings.webSearch.mse.timeout.label")}
                      htmlFor="web-search-mse-timeout"
                    >
                      <input
                        id="web-search-mse-timeout"
                        value={draftMseTimeoutMs}
                        onChange={(e) => setDraftMseTimeoutMs(e.target.value)}
                        className={INPUT_CLASS_NAME}
                      />
                    </FieldBlock>
                  </div>

                  <FieldBlock
                    label={t("settings.webSearch.mse.customName.label")}
                    htmlFor="web-search-mse-custom-engine-name"
                  >
                    <input
                      id="web-search-mse-custom-engine-name"
                      value={draftMseCustomEngineName}
                      onChange={(e) =>
                        setDraftMseCustomEngineName(e.target.value)
                      }
                      placeholder={t(
                        "settings.webSearch.mse.customName.placeholder",
                      )}
                      className={INPUT_CLASS_NAME}
                    />
                  </FieldBlock>

                  <FieldBlock
                    label={t("settings.webSearch.mse.customTemplate.label")}
                    htmlFor="web-search-mse-custom-engine-template"
                  >
                    <input
                      id="web-search-mse-custom-engine-template"
                      value={draftMseCustomEngineTemplate}
                      onChange={(e) =>
                        setDraftMseCustomEngineTemplate(e.target.value)
                      }
                      placeholder={t(
                        "settings.webSearch.mse.customTemplate.placeholder",
                      )}
                      className={INPUT_CLASS_NAME}
                    />
                  </FieldBlock>
                </div>
              </article>

              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="space-y-4">
                  <div className="rounded-[20px] border border-slate-200/80 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span>
                        {t("settings.webSearch.mse.suggestion.title")}
                      </span>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.webSearch.mse.suggestion.tipAria",
                        )}
                        content={t("settings.webSearch.mse.suggestion.tip")}
                        tone="slate"
                      />
                    </div>
                  </div>
                  <div className="rounded-[20px] border border-slate-200/80 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {t("settings.webSearch.mse.templateStatus.title")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {mseCustomEngineReady
                        ? t("settings.webSearch.mse.templateStatus.ready", {
                            name: draftMseCustomEngineName,
                          })
                        : t("settings.webSearch.mse.templateStatus.notReady")}
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </SurfacePanel>
        </TabsContent>

        <TabsContent value="images" className="mt-0 space-y-6">
          <SurfacePanel
            icon={ImageIcon}
            title={t("settings.webSearch.images.title")}
            description={t("settings.webSearch.images.description")}
            tipAriaLabel={t("settings.webSearch.images.tipAria")}
            aside={
              <>
                <StatusPill
                  active={pexelsKeyConfigured}
                  label={credentialStatusLabel(
                    pexelsProviderLabel,
                    pexelsKeyConfigured,
                  )}
                />
                <StatusPill
                  active={pixabayKeyConfigured}
                  label={credentialStatusLabel(
                    pixabayProviderLabel,
                    pixabayKeyConfigured,
                  )}
                />
              </>
            }
          >
            <div className="space-y-5">
              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <FieldBlock
                  label={t("settings.webSearch.images.pexels.label")}
                  htmlFor="web-search-pexels-key"
                  hint={t("settings.webSearch.images.pexels.hint")}
                  tipAriaLabel={t("settings.webSearch.images.pexels.tipAria")}
                >
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(PEXELS_APPLY_URL)}
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.images.pexels.apply")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(PEXELS_DOC_URL)}
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.action.viewDocs")}
                      </button>
                    </div>
                    <SecretInput
                      id="web-search-pexels-key"
                      value={draftPexelsApiKey}
                      placeholder={t(
                        "settings.webSearch.images.pexels.placeholder",
                      )}
                      visible={showPexelsApiKey}
                      onToggleVisible={() =>
                        setShowPexelsApiKey((prev) => !prev)
                      }
                      onChange={setDraftPexelsApiKey}
                    />
                  </>
                </FieldBlock>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
                  <span>{t("settings.webSearch.images.pexels.note")}</span>
                  <WorkbenchInfoTip
                    ariaLabel={t("settings.webSearch.images.pexels.noteAria")}
                    content={t("settings.webSearch.images.pexels.noteTip", {
                      applyUrl: PEXELS_APPLY_URL,
                    })}
                    tone="slate"
                  />
                </div>
              </article>

              <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <FieldBlock
                  label={t("settings.webSearch.images.pixabay.label")}
                  htmlFor="web-search-pixabay-key"
                  hint={t("settings.webSearch.images.pixabay.hint")}
                  tipAriaLabel={t("settings.webSearch.images.pixabay.tipAria")}
                >
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(PIXABAY_APPLY_URL)}
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.images.pixabay.apply")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(PIXABAY_DOC_URL)}
                        className={TEXT_BUTTON_CLASS_NAME}
                      >
                        {t("settings.webSearch.action.viewDocs")}
                      </button>
                    </div>
                    <SecretInput
                      id="web-search-pixabay-key"
                      value={draftPixabayApiKey}
                      placeholder={t(
                        "settings.webSearch.images.pixabay.placeholder",
                      )}
                      visible={showPixabayApiKey}
                      onToggleVisible={() =>
                        setShowPixabayApiKey((prev) => !prev)
                      }
                      onChange={setDraftPixabayApiKey}
                    />
                  </>
                </FieldBlock>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
                  <span>{t("settings.webSearch.images.pixabay.note")}</span>
                  <WorkbenchInfoTip
                    ariaLabel={t("settings.webSearch.images.pixabay.noteAria")}
                    content={t("settings.webSearch.images.pixabay.noteTip", {
                      applyUrl: PIXABAY_APPLY_URL,
                    })}
                    tone="slate"
                  />
                </div>
              </article>
            </div>
          </SurfacePanel>

          <SurfacePanel
            icon={Compass}
            title={t("settings.webSearch.observability.title")}
            description={t("settings.webSearch.observability.description")}
            tipAriaLabel={t("settings.webSearch.observability.tipAria")}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  active={tavilyKeyConfigured}
                  label={credentialStatusLabel(
                    tavilyProviderLabel,
                    tavilyKeyConfigured,
                  )}
                />
                <StatusPill
                  active={bingSearchKeyConfigured}
                  label={credentialStatusLabel(
                    bingSearchApiProviderLabel,
                    bingSearchKeyConfigured,
                  )}
                />
                <StatusPill
                  active={googleSearchKeyConfigured}
                  label={credentialStatusLabel(
                    googleCustomSearchProviderLabel,
                    googleSearchKeyConfigured,
                  )}
                />
                <StatusPill
                  active={googleSearchEngineConfigured}
                  label={credentialStatusLabel(
                    googleCseProviderLabel,
                    googleSearchEngineConfigured,
                  )}
                />
                <StatusPill
                  active={mseCustomEngineReady}
                  label={t(
                    "settings.webSearch.observability.mseCustomTemplateStatus",
                    {
                      status: mseCustomEngineReady
                        ? readyLabel
                        : notConfiguredLabel,
                    },
                  )}
                />
              </div>
              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.webSearch.observability.providerChain.title")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {providerChainPreview}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.webSearch.observability.imageKeys.title")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {pexelsKeyConfigured || pixabayKeyConfigured
                    ? t("settings.webSearch.observability.imageKeys.ready")
                    : t("settings.webSearch.observability.imageKeys.missing")}
                </p>
              </div>
            </div>
          </SurfacePanel>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 rounded-[24px] border border-slate-200/80 bg-white/92 px-4 py-3 shadow-lg shadow-slate-950/5 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">
            {hasUnsavedChanges
              ? t("settings.webSearch.status.unsavedChanges")
              : t("settings.webSearch.status.allSaved")}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasUnsavedChanges || saving}
              className={ACTION_BUTTON_CLASS_NAME}
            >
              {t("settings.webSearch.action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saving}
              className={PRIMARY_BUTTON_CLASS_NAME}
            >
              {saving
                ? t("settings.webSearch.action.saving")
                : t("settings.webSearch.action.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
