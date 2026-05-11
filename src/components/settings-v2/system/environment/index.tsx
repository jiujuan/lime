import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TFunction } from "i18next";
import {
  Eye,
  EyeOff,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Terminal,
  Trash2,
  Variable,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getConfig,
  getEnvironmentPreview,
  saveConfig,
  type Config,
  type EnvironmentConfig,
  type EnvironmentPreview,
  type EnvironmentVariableOverride,
} from "@/lib/api/appConfig";

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

type EnvironmentSettingsTranslate = TFunction<"settings", undefined>;

const INPUT_CLASS_NAME =
  "w-full rounded-[16px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200";
const SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";

function normalizeEnvironmentConfig(config: Config | null): EnvironmentConfig {
  return {
    shell_import: {
      enabled: config?.environment?.shell_import?.enabled ?? false,
      timeout_ms: config?.environment?.shell_import?.timeout_ms ?? 1500,
    },
    variables: [...(config?.environment?.variables ?? [])],
  };
}

function createEmptyVariable(): EnvironmentVariableOverride {
  return {
    key: "",
    value: "",
    enabled: true,
  };
}

function formatSourceLabel(
  t: EnvironmentSettingsTranslate,
  source: string,
  fallbackLabel?: string,
): string {
  switch (source) {
    case "override":
      return t("settings.environment.source.override");
    case "shell_import":
      return t("settings.environment.source.shellImport");
    case "web_search":
      return t("settings.environment.source.webSearch");
    case "process":
      return t("settings.environment.source.process");
    default:
      return fallbackLabel || source;
  }
}

function resolveShellImportMeta(
  t: EnvironmentSettingsTranslate,
  status?: string,
) {
  switch (status) {
    case "ok":
      return {
        label: t("settings.environment.status.imported"),
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "disabled":
      return {
        label: t("settings.environment.status.disabled"),
        className: "border-slate-200 bg-slate-100 text-slate-500",
      };
    case "error":
      return {
        label: t("settings.environment.status.error"),
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };
    case "timeout":
      return {
        label: t("settings.environment.status.timeout"),
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    default:
      return {
        label: t("settings.environment.status.pending"),
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
  }
}

function formatDuration(
  t: EnvironmentSettingsTranslate,
  durationMs?: number | null,
) {
  if (durationMs == null || durationMs < 0) {
    return t("settings.environment.duration.notRecorded");
  }
  return t("settings.environment.duration.ms", {
    duration: durationMs,
  });
}

function formatShellImportMessage(
  t: EnvironmentSettingsTranslate,
  shellImport?: EnvironmentPreview["shellImport"],
) {
  if (!shellImport) {
    return t("settings.environment.shellImport.previewMessage.fallback");
  }

  switch (shellImport.status) {
    case "ok":
      return t("settings.environment.shellImport.previewMessage.ok", {
        count: shellImport.importedCount,
      });
    case "disabled":
      return t("settings.environment.shellImport.previewMessage.disabled");
    case "timeout":
      return t("settings.environment.shellImport.previewMessage.timeout", {
        duration: formatDuration(t, shellImport.durationMs),
      });
    case "error":
      return t("settings.environment.shellImport.previewMessage.error", {
        message: shellImport.message.replace(/^Shell 环境导入失败[:：]\s*/, ""),
      });
    default:
      return (
        shellImport.message ||
        t("settings.environment.shellImport.previewMessage.fallback")
      );
  }
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

function LoadingSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <div className="h-[132px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(320px,0.84fr)]">
        <div className="space-y-6">
          <div className="h-[290px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
          <div className="h-[360px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
        </div>
        <div className="space-y-6">
          <div className="h-[240px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
          <div className="h-[220px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
        </div>
      </div>
      <div className="h-[360px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
    </div>
  );
}

export function EnvironmentSettings() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [preview, setPreview] = useState<EnvironmentPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingPreview, setRefreshingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const environment = useMemo(
    () => normalizeEnvironmentConfig(config),
    [config],
  );

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [nextConfig, nextPreview] = await Promise.all([
        getConfig(),
        getEnvironmentPreview(),
      ]);
      setConfig(nextConfig);
      setPreview(nextPreview);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.environment.message.loadFailed"),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refreshPreview = useCallback(async () => {
    setRefreshingPreview(true);
    try {
      const nextPreview = await getEnvironmentPreview();
      setPreview(nextPreview);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.environment.message.refreshFailed"),
      });
    } finally {
      setRefreshingPreview(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const updateEnvironment = useCallback(
    (updater: (prev: EnvironmentConfig) => EnvironmentConfig) => {
      setConfig((prev) => {
        const baseConfig = prev ?? ({} as Config);
        const nextEnvironment = updater(normalizeEnvironmentConfig(prev));
        return {
          ...baseConfig,
          environment: nextEnvironment,
        };
      });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!config) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await saveConfig({
        ...config,
        environment,
      });
      const [nextConfig, nextPreview] = await Promise.all([
        getConfig(),
        getEnvironmentPreview(),
      ]);
      setConfig(nextConfig);
      setPreview(nextPreview);
      setMessage({
        type: "success",
        text: t("settings.environment.message.saved"),
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.environment.message.saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [config, environment, t]);

  const updateVariable = useCallback(
    (index: number, patch: Partial<EnvironmentVariableOverride>) => {
      updateEnvironment((prev) => ({
        ...prev,
        variables: prev.variables.map((item, currentIndex) =>
          currentIndex === index ? { ...item, ...patch } : item,
        ),
      }));
    },
    [updateEnvironment],
  );

  const addVariable = useCallback(() => {
    updateEnvironment((prev) => ({
      ...prev,
      variables: [...prev.variables, createEmptyVariable()],
    }));
  }, [updateEnvironment]);

  const removeVariable = useCallback(
    (index: number) => {
      updateEnvironment((prev) => ({
        ...prev,
        variables: prev.variables.filter(
          (_, currentIndex) => currentIndex !== index,
        ),
      }));
    },
    [updateEnvironment],
  );

  const summary = useMemo(() => {
    const enabledOverrides = environment.variables.filter(
      (entry) => entry.enabled && entry.key.trim(),
    ).length;
    const shellImportMeta = resolveShellImportMeta(
      t,
      preview?.shellImport.status,
    );

    return {
      shellImportMeta,
      overrideCount: environment.variables.length,
      enabledOverrides,
      previewCount: preview?.entries.length ?? 0,
    };
  }, [environment.variables, preview, t]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6 pb-8">
      {message ? (
        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-[20px] border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
              : "border-rose-200 bg-rose-50/90 text-rose-700",
          )}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            <span>{message.text}</span>
          </div>
          {message.type === "error" ? (
            <button
              type="button"
              onClick={() => void loadPageData()}
              className="rounded-full border border-current/20 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-white/90"
            >
              {t("settings.environment.action.reload")}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-[26px] border border-slate-200/80 bg-white px-5 py-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
                {t("settings.environment.hero.title")}
              </h1>
              <WorkbenchInfoTip
                ariaLabel={t("settings.environment.hero.tipAria")}
                content={t("settings.environment.hero.tip")}
                tone="mint"
              />
            </div>
            <p className="text-sm text-slate-500">
              {t("settings.environment.hero.description")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                summary.shellImportMeta.className,
              )}
            >
              {t("settings.environment.summary.shellImport", {
                status: summary.shellImportMeta.label,
              })}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              {t("settings.environment.summary.overrides", {
                enabled: summary.enabledOverrides,
                total: summary.overrideCount,
              })}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              {t("settings.environment.summary.previewVariables", {
                count: summary.previewCount,
              })}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-[20px] border border-slate-200/80 bg-slate-50/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.environment.summary.imported", {
                  count: preview?.shellImport.importedCount ?? 0,
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.environment.summary.duration", {
                  duration: formatDuration(t, preview?.shellImport.durationMs),
                })}
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              {formatShellImportMessage(t, preview?.shellImport)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshPreview()}
              disabled={refreshingPreview}
              className={SECONDARY_BUTTON_CLASS_NAME}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  refreshingPreview ? "animate-spin" : "",
                )}
              />
              {t("settings.environment.action.refreshPreview")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={PRIMARY_BUTTON_CLASS_NAME}
            >
              <Save className="h-4 w-4" />
              {saving
                ? t("settings.environment.action.saving")
                : t("settings.environment.action.save")}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(320px,0.84fr)]">
        <div className="space-y-6">
          <SurfacePanel
            icon={Terminal}
            title={t("settings.environment.shellImport.title")}
            description={t("settings.environment.shellImport.description")}
            tipAriaLabel={t("settings.environment.shellImport.tipAria")}
            aside={
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  summary.shellImportMeta.className,
                )}
              >
                {summary.shellImportMeta.label}
              </span>
            }
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {t("settings.environment.shellImport.enable.label")}
                      </p>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.environment.shellImport.enable.tipAria",
                        )}
                        content={t(
                          "settings.environment.shellImport.enable.tip",
                        )}
                        tone="slate"
                      />
                    </div>
                  </div>
                  <Switch
                    aria-label={t(
                      "settings.environment.shellImport.enable.aria",
                    )}
                    checked={environment.shell_import.enabled}
                    onCheckedChange={(checked) =>
                      updateEnvironment((prev) => ({
                        ...prev,
                        shell_import: {
                          ...prev.shell_import,
                          enabled: checked,
                        },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <FieldBlock
                  label={t("settings.environment.shellImport.timeout.label")}
                  htmlFor="environment-shell-import-timeout"
                  hint={t("settings.environment.shellImport.timeout.tip")}
                  tipAriaLabel={t(
                    "settings.environment.shellImport.timeout.tipAria",
                  )}
                >
                  <input
                    id="environment-shell-import-timeout"
                    type="number"
                    min={100}
                    max={30000}
                    step={100}
                    value={environment.shell_import.timeout_ms}
                    onChange={(event) =>
                      updateEnvironment((prev) => ({
                        ...prev,
                        shell_import: {
                          ...prev.shell_import,
                          timeout_ms: Math.min(
                            30000,
                            Math.max(
                              100,
                              Number.parseInt(event.target.value, 10) || 1500,
                            ),
                          ),
                        },
                      }))
                    }
                    className={INPUT_CLASS_NAME}
                  />
                </FieldBlock>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200/80 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.environment.shellImport.status.title")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {preview
                    ? formatShellImportMessage(t, preview.shellImport)
                    : t("settings.environment.shellImport.status.empty")}
                </p>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.environment.shellImport.imported.title")}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  {preview?.shellImport.importedCount ?? 0}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t("settings.environment.shellImport.imported.description")}
                </p>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.environment.shellImport.duration.title")}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  {formatDuration(t, preview?.shellImport.durationMs)}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t("settings.environment.shellImport.duration.description")}
                </p>
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel
            icon={Variable}
            title={t("settings.environment.overrides.title")}
            description={t("settings.environment.overrides.description")}
            tipAriaLabel={t("settings.environment.overrides.tipAria")}
            aside={
              <button
                type="button"
                onClick={addVariable}
                className={SECONDARY_BUTTON_CLASS_NAME}
              >
                <Plus className="h-4 w-4" />
                {t("settings.environment.overrides.action.add")}
              </button>
            }
          >
            {environment.variables.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  {t("settings.environment.overrides.empty.title")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {t("settings.environment.overrides.empty.description")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {environment.variables.map((entry, index) => (
                  <article
                    key={`${entry.key}-${index}`}
                    className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4"
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_180px_56px]">
                      <FieldBlock
                        label={t("settings.environment.variable.name.label")}
                        htmlFor={`environment-variable-key-${index}`}
                      >
                        <input
                          id={`environment-variable-key-${index}`}
                          type="text"
                          value={entry.key}
                          onChange={(event) =>
                            updateVariable(index, { key: event.target.value })
                          }
                          placeholder={t(
                            "settings.environment.variable.name.placeholder",
                          )}
                          className={INPUT_CLASS_NAME}
                        />
                      </FieldBlock>

                      <FieldBlock
                        label={t("settings.environment.variable.value.label")}
                        htmlFor={`environment-variable-value-${index}`}
                      >
                        <input
                          id={`environment-variable-value-${index}`}
                          type="text"
                          value={entry.value}
                          onChange={(event) =>
                            updateVariable(index, { value: event.target.value })
                          }
                          placeholder={t(
                            "settings.environment.variable.value.placeholder",
                          )}
                          className={INPUT_CLASS_NAME}
                        />
                      </FieldBlock>

                      <div className="flex flex-col justify-between gap-3 rounded-[18px] border border-slate-200 bg-white p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">
                              {t("settings.environment.variable.enabled.label")}
                            </p>
                            <WorkbenchInfoTip
                              ariaLabel={t(
                                "settings.environment.variable.enabled.tipAria",
                                {
                                  index: index + 1,
                                },
                              )}
                              content={t(
                                "settings.environment.variable.enabled.tip",
                              )}
                              tone="slate"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                              entry.enabled
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-100 text-slate-500",
                            )}
                          >
                            {entry.enabled
                              ? t("settings.environment.variable.enabled.on")
                              : t("settings.environment.variable.enabled.off")}
                          </span>
                          <Switch
                            aria-label={t(
                              "settings.environment.variable.enabled.aria",
                              {
                                index: index + 1,
                              },
                            )}
                            checked={entry.enabled}
                            onCheckedChange={(checked) =>
                              updateVariable(index, { enabled: checked })
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() => removeVariable(index)}
                          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          title={t(
                            "settings.environment.variable.delete.title",
                          )}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SurfacePanel>
        </div>

        <div className="space-y-6">
          <SurfacePanel
            icon={Layers3}
            title={t("settings.environment.merge.title")}
            description={t("settings.environment.merge.description")}
            tipAriaLabel={t("settings.environment.merge.tipAria")}
          >
            <div className="space-y-3">
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {t("settings.environment.merge.priority1.title")}
                    </p>
                    <WorkbenchInfoTip
                      ariaLabel={t(
                        "settings.environment.merge.priority1.tipAria",
                      )}
                      content={t("settings.environment.merge.priority1.tip")}
                      tone="slate"
                    />
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    {t("settings.environment.merge.priority1.badge")}
                  </span>
                </div>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {t("settings.environment.merge.priority2.title")}
                    </p>
                    <WorkbenchInfoTip
                      ariaLabel={t(
                        "settings.environment.merge.priority2.tipAria",
                      )}
                      content={t("settings.environment.merge.priority2.tip")}
                      tone="slate"
                    />
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                    {t("settings.environment.merge.priority2.badge")}
                  </span>
                </div>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {t("settings.environment.merge.compat.title")}
                    </p>
                    <WorkbenchInfoTip
                      ariaLabel={t("settings.environment.merge.compat.tipAria")}
                      content={t("settings.environment.merge.compat.tip")}
                      tone="slate"
                    />
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    {t("settings.environment.merge.compat.badge")}
                  </span>
                </div>
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel
            icon={ShieldAlert}
            title={t("settings.environment.tips.title")}
            description={t("settings.environment.tips.description")}
            tipAriaLabel={t("settings.environment.tips.tipAria")}
          >
            <div className="space-y-3">
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("settings.environment.tips.mask.title")}
                  </p>
                  <WorkbenchInfoTip
                    ariaLabel={t("settings.environment.tips.mask.tipAria")}
                    content={t("settings.environment.tips.mask.tip")}
                    tone="slate"
                  />
                </div>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("settings.environment.tips.preview.title")}
                  </p>
                  <WorkbenchInfoTip
                    ariaLabel={t("settings.environment.tips.preview.tipAria")}
                    content={t("settings.environment.tips.preview.tip")}
                    tone="slate"
                  />
                </div>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("settings.environment.tips.crossPlatform.title")}
                  </p>
                  <WorkbenchInfoTip
                    ariaLabel={t(
                      "settings.environment.tips.crossPlatform.tipAria",
                    )}
                    content={t("settings.environment.tips.crossPlatform.tip")}
                    tone="slate"
                  />
                </div>
              </div>
            </div>
          </SurfacePanel>
        </div>
      </div>

      <SurfacePanel
        icon={ShieldAlert}
        title={t("settings.environment.preview.title")}
        description={t("settings.environment.preview.description")}
        tipAriaLabel={t("settings.environment.preview.tipAria")}
        aside={
          <>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {showValues
                ? t("settings.environment.preview.badge.showing")
                : t("settings.environment.preview.badge.masked")}
            </span>
            <button
              type="button"
              onClick={() => setShowValues((prev) => !prev)}
              className={SECONDARY_BUTTON_CLASS_NAME}
            >
              {showValues ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {showValues
                ? t("settings.environment.preview.action.hide")
                : t("settings.environment.preview.action.show")}
            </button>
          </>
        }
      >
        {!preview || preview.entries.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              {t("settings.environment.preview.empty.title")}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {t("settings.environment.preview.empty.description")}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white">
            <div className="hidden grid-cols-[220px_minmax(0,1fr)_180px] border-b border-slate-200/80 bg-slate-50/80 px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500 md:grid">
              <span>{t("settings.environment.preview.column.variable")}</span>
              <span>{t("settings.environment.preview.column.value")}</span>
              <span>{t("settings.environment.preview.column.source")}</span>
            </div>
            <div className="divide-y divide-slate-200/80">
              {preview.entries.map((entry) => (
                <article
                  key={entry.key}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[220px_minmax(0,1fr)_180px] md:items-start"
                >
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 md:hidden">
                      {t("settings.environment.preview.column.variable")}
                    </p>
                    <p className="font-mono text-sm font-medium text-slate-900">
                      {entry.key}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 md:hidden">
                      {t("settings.environment.preview.column.value")}
                    </p>
                    <p className="rounded-[16px] border border-slate-200/80 bg-slate-50/70 px-3 py-2 font-mono text-sm break-all text-slate-600">
                      {showValues || !entry.sensitive
                        ? entry.value
                        : entry.maskedValue}
                    </p>
                    {entry.overriddenSources.length > 0 ? (
                      <p className="text-xs leading-5 text-amber-600">
                        {t("settings.environment.preview.overriddenSources", {
                          sources: entry.overriddenSources
                            .map((source) => formatSourceLabel(t, source))
                            .join(
                              t("settings.environment.preview.sourceSeparator"),
                            ),
                        })}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 md:hidden">
                      {t("settings.environment.preview.column.source")}
                    </p>
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {formatSourceLabel(t, entry.source, entry.sourceLabel)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </SurfacePanel>
    </div>
  );
}
