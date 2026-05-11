import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Archive, PencilLine, RotateCcw, Save, SquarePen } from "lucide-react";
import { formatNumber } from "@/i18n/format";
import { browserRuntimeApi } from "./api";
import type { BrowserEnvironmentPresetRecord } from "./api";

type RuntimeMessage = {
  type: "success" | "error";
  text: string;
};

interface BrowserEnvironmentPresetManagerProps {
  onMessage?: (message: RuntimeMessage) => void;
  selectedPresetId?: string;
  onSelectedPresetChange?: (presetId: string) => void;
  onPresetsChanged?: (presets: BrowserEnvironmentPresetRecord[]) => void;
}

type PresetFormState = {
  id?: string;
  name: string;
  description: string;
  proxy_server: string;
  timezone_id: string;
  locale: string;
  accept_language: string;
  geolocation_lat: string;
  geolocation_lng: string;
  geolocation_accuracy_m: string;
  user_agent: string;
  platform: string;
  viewport_width: string;
  viewport_height: string;
  device_scale_factor: string;
};

const EMPTY_FORM: PresetFormState = {
  name: "",
  description: "",
  proxy_server: "",
  timezone_id: "",
  locale: "",
  accept_language: "",
  geolocation_lat: "",
  geolocation_lng: "",
  geolocation_accuracy_m: "",
  user_agent: "",
  platform: "",
  viewport_width: "",
  viewport_height: "",
  device_scale_factor: "",
};

const BROWSER_RUNTIME_PRIMARY_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-3 text-sm text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95";

function toFormState(preset: BrowserEnvironmentPresetRecord): PresetFormState {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description ?? "",
    proxy_server: preset.proxy_server ?? "",
    timezone_id: preset.timezone_id ?? "",
    locale: preset.locale ?? "",
    accept_language: preset.accept_language ?? "",
    geolocation_lat:
      preset.geolocation_lat === null ? "" : String(preset.geolocation_lat),
    geolocation_lng:
      preset.geolocation_lng === null ? "" : String(preset.geolocation_lng),
    geolocation_accuracy_m:
      preset.geolocation_accuracy_m === null
        ? ""
        : String(preset.geolocation_accuracy_m),
    user_agent: preset.user_agent ?? "",
    platform: preset.platform ?? "",
    viewport_width:
      preset.viewport_width === null ? "" : String(preset.viewport_width),
    viewport_height:
      preset.viewport_height === null ? "" : String(preset.viewport_height),
    device_scale_factor:
      preset.device_scale_factor === null
        ? ""
        : String(preset.device_scale_factor),
  };
}

function parseOptionalNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function BrowserEnvironmentPresetManager(
  props: BrowserEnvironmentPresetManagerProps,
) {
  const {
    onMessage,
    selectedPresetId = "",
    onSelectedPresetChange,
    onPresetsChanged,
  } = props;
  const { t, i18n } = useTranslation("workspace");
  const [presets, setPresets] = useState<BrowserEnvironmentPresetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PresetFormState>(EMPTY_FORM);

  const activePresets = useMemo(
    () => presets.filter((preset) => preset.archived_at === null),
    [presets],
  );

  const refreshPresets = useCallback(
    async (includeArchived = showArchived) => {
      setLoading(true);
      try {
        const nextPresets =
          await browserRuntimeApi.listBrowserEnvironmentPresets({
            include_archived: includeArchived,
          });
        const nextActivePresets = nextPresets.filter(
          (preset) => preset.archived_at === null,
        );
        startTransition(() => {
          setPresets(nextPresets);
        });
        onPresetsChanged?.(nextActivePresets);
        if (
          selectedPresetId &&
          !nextActivePresets.some((preset) => preset.id === selectedPresetId)
        ) {
          onSelectedPresetChange?.("");
        }
      } catch (error) {
        onMessage?.({
          type: "error",
          text: t("workspace.browserEnvironment.feedback.loadFailed", {
            message: getErrorMessage(error),
          }),
        });
      } finally {
        setLoading(false);
      }
    },
    [
      onMessage,
      onPresetsChanged,
      onSelectedPresetChange,
      selectedPresetId,
      showArchived,
      t,
    ],
  );

  useEffect(() => {
    void refreshPresets(showArchived);
  }, [refreshPresets, showArchived]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormOpen(false);
  }, []);

  const handleCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((preset: BrowserEnvironmentPresetRecord) => {
    setForm(toFormState(preset));
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserEnvironment.feedback.nameRequired"),
      });
      return;
    }

    const request = {
      id: form.id,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      proxy_server: form.proxy_server.trim() || undefined,
      timezone_id: form.timezone_id.trim() || undefined,
      locale: form.locale.trim() || undefined,
      accept_language: form.accept_language.trim() || undefined,
      geolocation_lat: parseOptionalNumber(form.geolocation_lat),
      geolocation_lng: parseOptionalNumber(form.geolocation_lng),
      geolocation_accuracy_m: parseOptionalNumber(form.geolocation_accuracy_m),
      user_agent: form.user_agent.trim() || undefined,
      platform: form.platform.trim() || undefined,
      viewport_width: parseOptionalNumber(form.viewport_width),
      viewport_height: parseOptionalNumber(form.viewport_height),
      device_scale_factor: parseOptionalNumber(form.device_scale_factor),
    };

    const hasInvalidNumber = [
      request.geolocation_lat,
      request.geolocation_lng,
      request.geolocation_accuracy_m,
      request.viewport_width,
      request.viewport_height,
      request.device_scale_factor,
    ].some((value) => Number.isNaN(value));
    if (hasInvalidNumber) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserEnvironment.feedback.invalidNumber"),
      });
      return;
    }

    setSubmitting(true);
    try {
      const saved =
        await browserRuntimeApi.saveBrowserEnvironmentPreset(request);
      await refreshPresets(showArchived);
      setForm(toFormState(saved));
      onMessage?.({
        type: "success",
        text: form.id
          ? t("workspace.browserEnvironment.feedback.updated", {
              name: saved.name,
            })
          : t("workspace.browserEnvironment.feedback.created", {
              name: saved.name,
            }),
      });
      setFormOpen(false);
    } catch (error) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserEnvironment.feedback.saveFailed", {
          message: getErrorMessage(error),
        }),
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, onMessage, refreshPresets, showArchived, t]);

  const handleArchive = useCallback(
    async (preset: BrowserEnvironmentPresetRecord) => {
      try {
        await browserRuntimeApi.archiveBrowserEnvironmentPreset(preset.id);
        await refreshPresets(showArchived);
        if (form.id === preset.id) {
          resetForm();
        }
        onMessage?.({
          type: "success",
          text: t("workspace.browserEnvironment.feedback.archived", {
            name: preset.name,
          }),
        });
      } catch (error) {
        onMessage?.({
          type: "error",
          text: t("workspace.browserEnvironment.feedback.archiveFailed", {
            message: getErrorMessage(error),
          }),
        });
      }
    },
    [form.id, onMessage, refreshPresets, resetForm, showArchived, t],
  );

  const handleRestore = useCallback(
    async (preset: BrowserEnvironmentPresetRecord) => {
      try {
        await browserRuntimeApi.restoreBrowserEnvironmentPreset(preset.id);
        await refreshPresets(showArchived);
        onMessage?.({
          type: "success",
          text: t("workspace.browserEnvironment.feedback.restored", {
            name: preset.name,
          }),
        });
      } catch (error) {
        onMessage?.({
          type: "error",
          text: t("workspace.browserEnvironment.feedback.restoreFailed", {
            message: getErrorMessage(error),
          }),
        });
      }
    },
    [onMessage, refreshPresets, showArchived, t],
  );

  return (
    <section className="rounded-lg border p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            {t("workspace.browserEnvironment.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("workspace.browserEnvironment.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("workspace.browserEnvironment.launch.label")}</span>
            <select
              value={selectedPresetId}
              onChange={(event) => onSelectedPresetChange?.(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="">
                {t("workspace.browserEnvironment.launch.none")}
              </option>
              {activePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void refreshPresets(showArchived)}
            disabled={loading}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loading
              ? t("workspace.browserEnvironment.actions.refreshing")
              : t("workspace.browserEnvironment.actions.refresh")}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className={BROWSER_RUNTIME_PRIMARY_ACTION_BUTTON_CLASSNAME}
          >
            <SquarePen className="h-4 w-4" />
            {t("workspace.browserEnvironment.actions.new")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {t("workspace.browserEnvironment.summary.activePresets", {
            activeCount: formatNumber(activePresets.length, {
              locale: i18n.language,
            }),
          })}
        </span>
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className="rounded-md border px-2 py-1 transition hover:bg-muted"
        >
          {showArchived
            ? t("workspace.browserEnvironment.actions.hideArchived")
            : t("workspace.browserEnvironment.actions.showArchived")}
        </button>
      </div>

      {formOpen ? (
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.name")}
            </span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder={t("workspace.browserEnvironment.placeholders.name")}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.proxyServer")}
            </span>
            <input
              value={form.proxy_server}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  proxy_server: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="http://127.0.0.1:7890"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.timezone")}
            </span>
            <input
              value={form.timezone_id}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  timezone_id: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="America/Los_Angeles"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.locale")}
            </span>
            <input
              value={form.locale}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  locale: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="en-US"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.acceptLanguage")}
            </span>
            <input
              value={form.accept_language}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  accept_language: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="en-US,en;q=0.9"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.platform")}
            </span>
            <input
              value={form.platform}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  platform: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="MacIntel"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.latitude")}
            </span>
            <input
              value={form.geolocation_lat}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  geolocation_lat: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="37.7749"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.longitude")}
            </span>
            <input
              value={form.geolocation_lng}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  geolocation_lng: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="-122.4194"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.accuracy")}
            </span>
            <input
              value={form.geolocation_accuracy_m}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  geolocation_accuracy_m: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="100"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.viewportWidth")}
            </span>
            <input
              value={form.viewport_width}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  viewport_width: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="1440"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.viewportHeight")}
            </span>
            <input
              value={form.viewport_height}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  viewport_height: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.deviceScaleFactor")}
            </span>
            <input
              value={form.device_scale_factor}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  device_scale_factor: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="2"
            />
          </label>
          <label className="space-y-1 text-sm xl:col-span-3">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.userAgent")}
            </span>
            <input
              value={form.user_agent}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  user_agent: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="Mozilla/5.0 ..."
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2 xl:col-span-3">
            <span className="text-muted-foreground">
              {t("workspace.browserEnvironment.fields.description")}
            </span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
              placeholder={t(
                "workspace.browserEnvironment.placeholders.description",
              )}
            />
          </label>
          <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
            >
              {t("workspace.browserEnvironment.actions.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-sm text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {submitting
                ? t("workspace.browserEnvironment.actions.saving")
                : form.id
                  ? t("workspace.browserEnvironment.actions.update")
                  : t("workspace.browserEnvironment.actions.create")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {presets.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
            {t("workspace.browserEnvironment.empty")}
          </div>
        ) : null}

        {presets.map((preset) => {
          const isArchived = preset.archived_at !== null;
          return (
            <article
              key={preset.id}
              className={`rounded-xl border px-4 py-4 transition ${
                isArchived ? "border-dashed opacity-70" : "bg-background"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{preset.name}</h3>
                    {selectedPresetId === preset.id && !isArchived ? (
                      <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                        {t("workspace.browserEnvironment.badge.current")}
                      </span>
                    ) : null}
                    {isArchived ? (
                      <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                        {t("workspace.browserEnvironment.badge.archived")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("workspace.browserEnvironment.meta.proxy", {
                        value:
                          preset.proxy_server ||
                          t("workspace.browserEnvironment.value.unset"),
                      })}
                    </span>
                    <span>
                      {t("workspace.browserEnvironment.meta.timezone", {
                        value:
                          preset.timezone_id ||
                          t("workspace.browserEnvironment.value.unset"),
                      })}
                    </span>
                    <span>
                      {t("workspace.browserEnvironment.meta.locale", {
                        value:
                          preset.locale ||
                          t("workspace.browserEnvironment.value.unset"),
                      })}
                    </span>
                    <span>
                      {t("workspace.browserEnvironment.meta.lastUsed", {
                        value:
                          preset.last_used_at ||
                          t("workspace.browserEnvironment.value.never"),
                      })}
                    </span>
                  </div>
                  {preset.description ? (
                    <p className="max-w-3xl text-sm text-muted-foreground">
                      {preset.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isArchived ? (
                    <button
                      type="button"
                      onClick={() => void handleRestore(preset)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("workspace.browserEnvironment.actions.restore")}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEdit(preset)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        {t("workspace.browserEnvironment.actions.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleArchive(preset)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        {t("workspace.browserEnvironment.actions.archive")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
