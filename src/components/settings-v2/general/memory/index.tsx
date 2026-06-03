import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  Database,
  FileText,
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
  MemorySoulArtifactVoiceConfig,
  MemorySoulArtifactVoiceSource,
  MemorySoulConfig,
  MemorySourcesConfig,
} from "@/lib/api/memoryRuntime";
import {
  getUnifiedMemoryStats,
  type UnifiedMemoryStatsResponse,
} from "@/lib/api/unifiedMemory";
import {
  buildSoulMarkdown,
  formatSoulListInput,
  hasSoulContent,
  normalizeSoulArtifactVoiceConfig,
  normalizeSoulConfig,
  parseSoulListInput,
  parseSoulMarkdown,
  type SoulImportResult,
  type SoulImportWarningCode,
} from "@/lib/soul/soulConfig";

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
const SOUL_WARNING_KEYS: Record<SoulImportWarningCode, string> = {
  empty: "settings.memory.soul.import.warning.empty",
  local_path: "settings.memory.soul.import.warning.localPath",
  project_rules: "settings.memory.soul.import.warning.projectRules",
  secret_like: "settings.memory.soul.import.warning.secretLike",
  too_long: "settings.memory.soul.import.warning.tooLong",
};

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
    project_memory_paths: sources?.project_memory_paths?.filter(
      (item) => item.trim().length > 0,
    ).length
      ? sources.project_memory_paths
      : [".lime/AGENTS.md"],
    project_rule_dirs: sources?.project_rule_dirs?.filter(
      (item) => item.trim().length > 0,
    ).length
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
    soul: normalizeSoulConfig(memory?.soul),
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

function buildSoulDraftPatch(
  current: MemorySoulConfig | undefined,
  patch: Partial<MemorySoulConfig>,
): MemorySoulConfig {
  return normalizeSoulConfig({
    ...normalizeSoulConfig(current),
    ...patch,
    imported_from: patch.imported_from ?? "manual",
    updated_at: new Date().toISOString(),
  });
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
  const [soulImportText, setSoulImportText] = useState("");
  const [soulImportPreview, setSoulImportPreview] =
    useState<SoulImportResult | null>(null);

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
  const soul = normalizeSoulConfig(draft.soul);
  const soulArtifactVoice = normalizeSoulArtifactVoiceConfig(
    soul.artifact_voice,
  );
  const soulExportMarkdown = buildSoulMarkdown(soul);
  const soulEnabledWithContent = soul.enabled && hasSoulContent(soul);

  const handleProviderChange = (choice: EmbeddingProviderChoice) => {
    setDraft((previous) => ({
      ...previous,
      embedding: buildEmbeddingConfig(choice),
    }));
  };

  const updateSoulDraft = (patch: Partial<MemorySoulConfig>) => {
    setDraft((previous) => ({
      ...previous,
      soul: buildSoulDraftPatch(previous.soul, patch),
    }));
  };

  const updateSoulArtifactVoiceDraft = (
    patch: Partial<MemorySoulArtifactVoiceConfig>,
  ) => {
    setDraft((previous) => {
      const previousSoul = normalizeSoulConfig(previous.soul);
      return {
        ...previous,
        soul: buildSoulDraftPatch(previous.soul, {
          artifact_voice: normalizeSoulArtifactVoiceConfig({
            ...previousSoul.artifact_voice,
            ...patch,
          }),
        }),
      };
    });
  };

  const handleSoulReset = () => {
    setDraft((previous) => ({
      ...previous,
      soul: normalizeSoulConfig({ enabled: false, imported_from: "manual" }),
    }));
    setSoulImportPreview(null);
    setSoulImportText("");
    setMessage(memoryT(t, "settings.memory.soul.message.reset"));
    window.setTimeout(() => setMessage(null), 2500);
  };

  const handleSoulImportPreview = () => {
    const result = parseSoulMarkdown(soulImportText);
    setSoulImportPreview(result);
    setMessage(
      memoryT(
        t,
        result.canImport
          ? "settings.memory.soul.message.importPreviewReady"
          : "settings.memory.soul.message.importEmpty",
      ),
    );
    window.setTimeout(() => setMessage(null), 2500);
  };

  const handleSoulImportApply = () => {
    if (!soulImportPreview?.canImport) {
      return;
    }
    setDraft((previous) => ({
      ...previous,
      soul: normalizeSoulConfig(soulImportPreview.draft),
    }));
    setMessage(memoryT(t, "settings.memory.soul.message.importApplied"));
    window.setTimeout(() => setMessage(null), 2500);
  };

  const handleSoulExportCopy = async () => {
    if (!soulExportMarkdown) {
      setMessage(memoryT(t, "settings.memory.soul.message.exportEmpty"));
      window.setTimeout(() => setMessage(null), 2500);
      return;
    }

    try {
      await navigator.clipboard.writeText(soulExportMarkdown);
      setMessage(memoryT(t, "settings.memory.soul.message.exportCopied"));
    } catch (error) {
      console.error("复制 SOUL.md 失败:", error);
      setMessage(memoryT(t, "settings.memory.soul.message.exportCopyFailed"));
    }
    window.setTimeout(() => setMessage(null), 2500);
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700">
              <Brain className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">
                {memoryT(t, "settings.memory.soul.title")}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {memoryT(t, "settings.memory.soul.description")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-medium text-slate-600">
              {soulEnabledWithContent
                ? memoryT(t, "settings.memory.status.enabled")
                : memoryT(t, "settings.memory.status.disabled")}
            </span>
            <Switch
              aria-label={memoryT(t, "settings.memory.soul.toggle.aria")}
              checked={soul.enabled ?? false}
              onCheckedChange={(checked) =>
                updateSoulDraft({ enabled: checked })
              }
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              {memoryT(t, "settings.memory.soul.field.name.label")}
            </span>
            <input
              type="text"
              value={soul.name ?? ""}
              onChange={(event) =>
                updateSoulDraft({ name: event.target.value || undefined })
              }
              placeholder={memoryT(
                t,
                "settings.memory.soul.field.name.placeholder",
              )}
              className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              {memoryT(t, "settings.memory.soul.field.tone.label")}
            </span>
            <textarea
              value={formatSoulListInput(soul.tone)}
              onChange={(event) =>
                updateSoulDraft({
                  tone: parseSoulListInput(event.target.value),
                })
              }
              rows={3}
              placeholder={memoryT(
                t,
                "settings.memory.soul.field.tone.placeholder",
              )}
              className="mt-2 min-h-[92px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">
              {memoryT(t, "settings.memory.soul.field.summary.label")}
            </span>
            <textarea
              value={soul.summary ?? ""}
              onChange={(event) =>
                updateSoulDraft({ summary: event.target.value || undefined })
              }
              rows={3}
              placeholder={memoryT(
                t,
                "settings.memory.soul.field.summary.placeholder",
              )}
              className="mt-2 min-h-[92px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              {memoryT(t, "settings.memory.soul.field.communication.label")}
            </span>
            <textarea
              value={formatSoulListInput(soul.communication_style)}
              onChange={(event) =>
                updateSoulDraft({
                  communication_style: parseSoulListInput(event.target.value),
                })
              }
              rows={4}
              placeholder={memoryT(
                t,
                "settings.memory.soul.field.communication.placeholder",
              )}
              className="mt-2 min-h-[116px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              {memoryT(t, "settings.memory.soul.field.avoid.label")}
            </span>
            <textarea
              value={formatSoulListInput(soul.avoid)}
              onChange={(event) =>
                updateSoulDraft({
                  avoid: parseSoulListInput(event.target.value),
                })
              }
              rows={4}
              placeholder={memoryT(
                t,
                "settings.memory.soul.field.avoid.placeholder",
              )}
              className="mt-2 min-h-[116px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              {memoryT(t, "settings.memory.soul.field.depth.label")}
            </span>
            <input
              type="text"
              value={soul.explanation_depth ?? ""}
              onChange={(event) =>
                updateSoulDraft({
                  explanation_depth: event.target.value || undefined,
                })
              }
              placeholder={memoryT(
                t,
                "settings.memory.soul.field.depth.placeholder",
              )}
              className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              {memoryT(t, "settings.memory.soul.field.challenge.label")}
            </span>
            <input
              type="text"
              value={soul.challenge_style ?? ""}
              onChange={(event) =>
                updateSoulDraft({
                  challenge_style: event.target.value || undefined,
                })
              }
              placeholder={memoryT(
                t,
                "settings.memory.soul.field.challenge.placeholder",
              )}
              className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>
        </div>

        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {memoryT(t, "settings.memory.soul.artifactVoice.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {memoryT(t, "settings.memory.soul.artifactVoice.description")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
              <span className="text-xs font-medium text-slate-600">
                {soulArtifactVoice.enabled
                  ? memoryT(t, "settings.memory.status.enabled")
                  : memoryT(t, "settings.memory.status.disabled")}
              </span>
              <Switch
                aria-label={memoryT(
                  t,
                  "settings.memory.soul.artifactVoice.toggle.aria",
                )}
                checked={soulArtifactVoice.enabled ?? false}
                onCheckedChange={(checked) =>
                  updateSoulArtifactVoiceDraft({
                    enabled: checked,
                    voice_source: checked
                      ? (soulArtifactVoice.voice_source ?? "creator_voice")
                      : soulArtifactVoice.voice_source,
                  })
                }
              />
            </div>
          </div>

          <div
            className={cn(
              "mt-4 grid gap-4 md:grid-cols-2",
              !soulArtifactVoice.enabled && "opacity-75",
            )}
          >
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                {memoryT(t, "settings.memory.soul.artifactVoice.source.label")}
              </span>
              <select
                value={soulArtifactVoice.voice_source ?? "creator_voice"}
                onChange={(event) =>
                  updateSoulArtifactVoiceDraft({
                    voice_source: event.target
                      .value as MemorySoulArtifactVoiceSource,
                  })
                }
                disabled={!soulArtifactVoice.enabled}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="creator_voice">
                  {memoryT(
                    t,
                    "settings.memory.soul.artifactVoice.source.creator",
                  )}
                </option>
                <option value="brand_voice">
                  {memoryT(
                    t,
                    "settings.memory.soul.artifactVoice.source.brand",
                  )}
                </option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                {memoryT(
                  t,
                  soulArtifactVoice.voice_source === "brand_voice"
                    ? "settings.memory.soul.artifactVoice.brandId.label"
                    : "settings.memory.soul.artifactVoice.creatorId.label",
                )}
              </span>
              <input
                type="text"
                value={
                  soulArtifactVoice.voice_source === "brand_voice"
                    ? (soulArtifactVoice.brand_voice_id ?? "")
                    : (soulArtifactVoice.creator_voice_id ?? "")
                }
                onChange={(event) =>
                  updateSoulArtifactVoiceDraft(
                    soulArtifactVoice.voice_source === "brand_voice"
                      ? { brand_voice_id: event.target.value || undefined }
                      : { creator_voice_id: event.target.value || undefined },
                  )
                }
                disabled={!soulArtifactVoice.enabled}
                placeholder={memoryT(
                  t,
                  soulArtifactVoice.voice_source === "brand_voice"
                    ? "settings.memory.soul.artifactVoice.brandId.placeholder"
                    : "settings.memory.soul.artifactVoice.creatorId.placeholder",
                )}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                {memoryT(
                  t,
                  "settings.memory.soul.artifactVoice.evidencePack.label",
                )}
              </span>
              <input
                type="text"
                value={soulArtifactVoice.evidence_pack_id ?? ""}
                onChange={(event) =>
                  updateSoulArtifactVoiceDraft({
                    evidence_pack_id: event.target.value || undefined,
                  })
                }
                disabled={!soulArtifactVoice.enabled}
                placeholder={memoryT(
                  t,
                  "settings.memory.soul.artifactVoice.evidencePack.placeholder",
                )}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                {memoryT(
                  t,
                  "settings.memory.soul.artifactVoice.evidenceRefs.label",
                )}
              </span>
              <textarea
                value={formatSoulListInput(soulArtifactVoice.evidence_refs)}
                onChange={(event) =>
                  updateSoulArtifactVoiceDraft({
                    evidence_refs: parseSoulListInput(event.target.value),
                  })
                }
                rows={3}
                disabled={!soulArtifactVoice.enabled}
                placeholder={memoryT(
                  t,
                  "settings.memory.soul.artifactVoice.evidenceRefs.placeholder",
                )}
                className="mt-2 min-h-[92px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            {memoryT(t, "settings.memory.soul.artifactVoice.boundary")}
          </p>
        </div>

        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {memoryT(t, "settings.memory.soul.import.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {memoryT(t, "settings.memory.soul.import.description")}
              </p>
            </div>
          </div>
          <textarea
            value={soulImportText}
            onChange={(event) => setSoulImportText(event.target.value)}
            rows={5}
            placeholder={memoryT(t, "settings.memory.soul.import.placeholder")}
            className="mt-3 min-h-[128px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
          />
          {soulImportPreview ? (
            <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600">
                {memoryT(t, "settings.memory.soul.import.preview")}
              </p>
              {soulImportPreview.warnings.length > 0 ? (
                <ul className="space-y-1 text-xs leading-5 text-amber-700">
                  {soulImportPreview.warnings.map((warning) => (
                    <li key={warning}>
                      {memoryT(t, SOUL_WARNING_KEYS[warning])}
                    </li>
                  ))}
                </ul>
              ) : null}
              <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-50">
                {soulImportPreview.preview ||
                  memoryT(t, "settings.memory.soul.import.emptyPreview")}
              </pre>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSoulImportPreview}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              {memoryT(t, "settings.memory.soul.action.previewImport")}
            </button>
            <button
              type="button"
              onClick={handleSoulImportApply}
              disabled={!soulImportPreview?.canImport}
              className="rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {memoryT(t, "settings.memory.soul.action.applyImport")}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {memoryT(t, "settings.memory.soul.export.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {memoryT(t, "settings.memory.soul.export.description")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSoulExportCopy}
              disabled={!soulExportMarkdown}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-60"
            >
              {memoryT(t, "settings.memory.soul.action.copyExport")}
            </button>
          </div>
          <pre className="mt-3 max-h-[180px] overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
            {soulExportMarkdown ||
              memoryT(t, "settings.memory.soul.export.empty")}
          </pre>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs leading-5 text-slate-500">
            {memoryT(t, "settings.memory.soul.boundary")}
          </p>
          <button
            type="button"
            onClick={handleSoulReset}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
          >
            {memoryT(t, "settings.memory.soul.action.reset")}
          </button>
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
              handleProviderChange(
                event.target.value as EmbeddingProviderChoice,
              )
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
