import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getConfig, saveConfig, type Config } from "@/lib/api/appConfig";
import type {
  MemoryAutoConfig,
  MemoryConfig,
  MemoryEmbeddingConfig,
  MemoryEmbeddingProvider,
  MemoryProfileConfig,
  MemoryResolveConfig,
  MemorySourcesConfig,
} from "@/lib/api/memoryRuntime";
import {
  getUnifiedMemoryStats,
  type UnifiedMemoryStatsResponse,
} from "@/lib/api/unifiedMemory";

type EmbeddingProviderChoice =
  | "auto"
  | "local_onnx"
  | "ollama"
  | "openai_api"
  | "disabled";

interface ProviderChoiceDefinition {
  value: EmbeddingProviderChoice;
  labelKey: string;
  descriptionKey: string;
  runtimeProvider: MemoryEmbeddingProvider;
  providerId?: string;
  model: string;
}

const PROVIDER_CHOICES: ProviderChoiceDefinition[] = [
  {
    value: "auto",
    labelKey: "settings.memory.embedding.provider.auto.label",
    descriptionKey: "settings.memory.embedding.provider.auto.description",
    runtimeProvider: "auto",
    model: "all-MiniLM-L6-v2",
  },
  {
    value: "local_onnx",
    labelKey: "settings.memory.embedding.provider.localOnnx.label",
    descriptionKey: "settings.memory.embedding.provider.localOnnx.description",
    runtimeProvider: "local_onnx",
    model: "all-MiniLM-L6-v2",
  },
  {
    value: "ollama",
    labelKey: "settings.memory.embedding.provider.ollama.label",
    descriptionKey: "settings.memory.embedding.provider.ollama.description",
    runtimeProvider: "provider",
    providerId: "ollama",
    model: "nomic-embed-text",
  },
  {
    value: "openai_api",
    labelKey: "settings.memory.embedding.provider.openaiApi.label",
    descriptionKey: "settings.memory.embedding.provider.openaiApi.description",
    runtimeProvider: "openai_api",
    model: "text-embedding-3-small",
  },
  {
    value: "disabled",
    labelKey: "settings.memory.embedding.provider.disabled.label",
    descriptionKey: "settings.memory.embedding.provider.disabled.description",
    runtimeProvider: "disabled",
    model: "all-MiniLM-L6-v2",
  },
];

function memoryT(
  t: TFunction<"settings">,
  key: string,
  values: Record<string, string | number | boolean> = {},
): string {
  const translate = t as unknown as (
    key: string,
    values?: Record<string, string | number | boolean>,
  ) => string;
  return String(translate(key, values));
}

function normalizeProfile(profile?: MemoryProfileConfig): MemoryProfileConfig {
  return {
    current_status: profile?.current_status || undefined,
    strengths: profile?.strengths || [],
    explanation_style: profile?.explanation_style || [],
    challenge_preference: profile?.challenge_preference || [],
  };
}

function normalizeSources(sources?: MemorySourcesConfig): MemorySourcesConfig {
  return {
    managed_policy_path: sources?.managed_policy_path ?? undefined,
    project_memory_paths:
      sources?.project_memory_paths?.filter((item) => item.trim().length > 0)
        .length
        ? sources.project_memory_paths
        : [".lime/AGENTS.md"],
    project_rule_dirs:
      sources?.project_rule_dirs?.filter((item) => item.trim().length > 0)
        .length
        ? sources.project_rule_dirs
        : [".agents/rules"],
    user_memory_path: sources?.user_memory_path ?? undefined,
    project_local_memory_path:
      sources?.project_local_memory_path ?? ".lime/AGENTS.local.md",
  };
}

function normalizeAuto(auto?: MemoryAutoConfig): MemoryAutoConfig {
  return {
    enabled: auto?.enabled ?? true,
    entrypoint: auto?.entrypoint || "MEMORY.md",
    max_loaded_lines: auto?.max_loaded_lines ?? 200,
    root_dir: auto?.root_dir ?? undefined,
  };
}

function normalizeResolve(resolve?: MemoryResolveConfig): MemoryResolveConfig {
  return {
    additional_dirs: resolve?.additional_dirs || [],
    follow_imports: resolve?.follow_imports ?? true,
    import_max_depth: resolve?.import_max_depth ?? 5,
    load_additional_dirs_memory: resolve?.load_additional_dirs_memory ?? false,
  };
}

function normalizeEmbedding(
  embedding?: MemoryEmbeddingConfig,
): MemoryEmbeddingConfig {
  const provider = embedding?.provider ?? "auto";
  const defaultModel =
    provider === "local_onnx" || provider === "auto"
      ? "all-MiniLM-L6-v2"
      : provider === "provider" && embedding?.provider_id === "ollama"
        ? "nomic-embed-text"
        : "text-embedding-3-small";

  return {
    provider,
    provider_id: embedding?.provider_id ?? undefined,
    model: embedding?.model?.trim() || defaultModel,
  };
}

function normalizeMemoryConfig(memory?: MemoryConfig): MemoryConfig {
  return {
    enabled: memory?.enabled ?? true,
    max_entries: memory?.max_entries ?? 1000,
    retention_days: memory?.retention_days ?? 30,
    auto_cleanup: memory?.auto_cleanup ?? true,
    profile: normalizeProfile(memory?.profile),
    sources: normalizeSources(memory?.sources),
    auto: normalizeAuto(memory?.auto),
    resolve: normalizeResolve(memory?.resolve),
    embedding: normalizeEmbedding(memory?.embedding),
  };
}

function resolveProviderChoice(
  embedding?: MemoryEmbeddingConfig,
): EmbeddingProviderChoice {
  const normalized = normalizeEmbedding(embedding);
  if (
    normalized.provider === "provider" &&
    normalized.provider_id === "ollama"
  ) {
    return "ollama";
  }
  if (
    normalized.provider === "auto" ||
    normalized.provider === "local_onnx" ||
    normalized.provider === "openai_api" ||
    normalized.provider === "disabled"
  ) {
    return normalized.provider;
  }
  return "auto";
}

function buildEmbeddingConfig(
  choice: EmbeddingProviderChoice,
): MemoryEmbeddingConfig {
  const definition =
    PROVIDER_CHOICES.find((item) => item.value === choice) ??
    PROVIDER_CHOICES[0];

  return {
    provider: definition.runtimeProvider,
    provider_id: definition.providerId,
    model: definition.model,
  };
}

function formatCount(value?: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat().format(value);
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-[820px] space-y-5 pb-8">
      <div className="h-[88px] animate-pulse rounded-md border border-slate-200 bg-white" />
      <div className="h-[160px] animate-pulse rounded-md border border-slate-200 bg-white" />
      <div className="h-[220px] animate-pulse rounded-md border border-slate-200 bg-white" />
    </div>
  );
}

export function MemorySettings() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [draft, setDraft] = useState<MemoryConfig>(() =>
    normalizeMemoryConfig(),
  );
  const [snapshot, setSnapshot] = useState<MemoryConfig>(() =>
    normalizeMemoryConfig(),
  );
  const [stats, setStats] = useState<UnifiedMemoryStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await getUnifiedMemoryStats());
    } catch (error) {
      console.error("加载记忆统计失败:", error);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    async function load() {
      setLoading(true);
      try {
        const nextConfig = await getConfig();
        if (disposed) {
          return;
        }
        const nextMemory = normalizeMemoryConfig(nextConfig.memory);
        setConfig(nextConfig);
        setDraft(nextMemory);
        setSnapshot(nextMemory);
      } catch (error) {
        console.error("加载记忆设置失败:", error);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void load();
    void loadStats();

    return () => {
      disposed = true;
    };
  }, [loadStats]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(snapshot),
    [draft, snapshot],
  );
  const providerChoice = resolveProviderChoice(draft.embedding);
  const activeProvider =
    PROVIDER_CHOICES.find((item) => item.value === providerChoice) ??
    PROVIDER_CHOICES[0];
  const embeddingConfig = normalizeEmbedding(draft.embedding);
  const vectorSearchEnabled =
    draft.enabled && embeddingConfig.provider !== "disabled";
  const indexedCount = stats?.total_entries ?? stats?.memory_count ?? null;
  const cachedEmbeddingCount = vectorSearchEnabled ? indexedCount : 0;

  const handleProviderChange = (choice: EmbeddingProviderChoice) => {
    setDraft((previous) => ({
      ...previous,
      embedding: buildEmbeddingConfig(choice),
    }));
  };

  const handleCancel = () => {
    setDraft(snapshot);
    setMessage(memoryT(t, "settings.memory.message.restored"));
    window.setTimeout(() => setMessage(null), 2500);
  };

  const handleSave = async () => {
    if (!config) {
      return;
    }
    setSaving(true);
    try {
      const updatedConfig: Config = {
        ...config,
        memory: normalizeMemoryConfig(draft),
      };
      await saveConfig(updatedConfig);
      setConfig(updatedConfig);
      setSnapshot(updatedConfig.memory ?? normalizeMemoryConfig());
      setDraft(updatedConfig.memory ?? normalizeMemoryConfig());
      setMessage(memoryT(t, "settings.memory.message.saved"));
      window.setTimeout(() => setMessage(null), 2500);
      await loadStats();
    } catch (error) {
      console.error("保存记忆设置失败:", error);
      setMessage(memoryT(t, "settings.memory.message.saveFailed"));
      window.setTimeout(() => setMessage(null), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  const messageIsError = Boolean(
    message &&
      /失败|失敗|실패|failed|error|cannot|can't/u.test(message.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[820px] space-y-5 pb-8">
      {message ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
            messageIsError
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {messageIsError ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{message}</span>
        </div>
      ) : null}

      <section className="rounded-md border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[24px] font-semibold text-slate-950">
              {memoryT(t, "settings.memory.title")}
            </h1>
            <p className="text-sm leading-6 text-slate-500">
              {memoryT(t, "settings.memory.hero.description")}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-medium text-slate-600">
              {draft.enabled
                ? memoryT(t, "settings.memory.status.enabled")
                : memoryT(t, "settings.memory.status.disabled")}
            </span>
            <Switch
              aria-label={memoryT(t, "settings.memory.toggle.aria")}
              checked={draft.enabled}
              onCheckedChange={(checked) =>
                setDraft((previous) => ({
                  ...previous,
                  enabled: checked,
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">
              {memoryT(t, "settings.memory.embedding.title")}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {memoryT(t, "settings.memory.embedding.description")}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {memoryT(t, "settings.memory.embedding.status.provider")}
            </div>
            <p className="mt-2 text-base font-semibold text-slate-950">
              {memoryT(t, activeProvider.labelKey)}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Search className="h-4 w-4 text-sky-600" />
              {memoryT(t, "settings.memory.embedding.status.model")}
            </div>
            <p className="mt-2 text-base font-semibold text-slate-950">
              {embeddingConfig.model || activeProvider.model}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              {memoryT(t, "settings.memory.embedding.status.vectorSearch")}
            </p>
            <p
              className={cn(
                "mt-2 text-base font-semibold",
                vectorSearchEnabled ? "text-emerald-700" : "text-slate-500",
              )}
            >
              {vectorSearchEnabled
                ? memoryT(t, "settings.memory.embedding.status.enabled")
                : memoryT(t, "settings.memory.embedding.status.disabled")}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-500">
                {memoryT(t, "settings.memory.embedding.status.indexed")}
              </p>
              <button
                type="button"
                onClick={() => loadStats()}
                disabled={statsLoading}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                aria-label={memoryT(t, "settings.memory.action.refresh")}
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", statsLoading && "animate-spin")}
                />
              </button>
            </div>
            <p className="mt-2 text-base font-semibold text-slate-950">
              {memoryT(t, "settings.memory.embedding.status.indexedValue", {
                count: formatCount(indexedCount),
              })}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {memoryT(t, "settings.memory.embedding.status.cachedValue", {
                count: formatCount(cachedEmbeddingCount),
              })}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-950/5">
        <label
          className="text-sm font-semibold text-slate-950"
          htmlFor="memory-embedding-provider"
        >
          {memoryT(t, "settings.memory.embedding.providerSelect.title")}
        </label>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {memoryT(t, "settings.memory.embedding.providerSelect.description")}
        </p>

        <div className="relative mt-4">
          <select
            id="memory-embedding-provider"
            value={providerChoice}
            onChange={(event) =>
              handleProviderChange(event.target.value as EmbeddingProviderChoice)
            }
            className="w-full appearance-none rounded-md border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
            aria-label={memoryT(
              t,
              "settings.memory.embedding.providerSelect.aria",
            )}
          >
            {PROVIDER_CHOICES.map((item) => (
              <option key={item.value} value={item.value}>
                {memoryT(t, item.labelKey)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {memoryT(t, activeProvider.labelKey)}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {memoryT(t, activeProvider.descriptionKey)}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-md border border-slate-200/90 bg-white p-4 shadow-sm shadow-slate-950/5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">
          {dirty
            ? memoryT(t, "settings.memory.toggle.unsavedHint")
            : memoryT(t, "settings.memory.toggle.syncedHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={handleCancel}
            disabled={!dirty || saving}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
          >
            {memoryT(t, "settings.memory.action.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-md border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving
              ? memoryT(t, "settings.memory.action.saving")
              : memoryT(t, "settings.memory.action.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
