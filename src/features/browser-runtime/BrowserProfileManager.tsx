import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  PencilLine,
  Play,
  RotateCcw,
  Save,
  SquarePen,
} from "lucide-react";
import { formatNumber } from "@/i18n/format";
import { browserRuntimeApi } from "./api";
import { getExistingSessionTabLabel } from "./existingSessionBridge";
import { getExistingSessionBridgeStatus } from "./existingSessionBridgeClient";
import type {
  BrowserEnvironmentPresetRecord,
  BrowserProfileRecord,
  BrowserProfileTransportKind,
} from "./api";
import {
  useExistingSessionProfileManager,
  type ExistingSessionProfileManagerCopy,
} from "./useExistingSessionProfileManager";

type RuntimeMessage = {
  type: "success" | "error";
  text: string;
};

interface BrowserProfileManagerProps {
  onMessage?: (message: RuntimeMessage) => void;
  onProfileLaunched?: (profileKey: string) => void;
  launchEnvironmentPresetId?: string;
  launchEnvironmentPresetOptions?: Array<
    Pick<BrowserEnvironmentPresetRecord, "id" | "name">
  >;
  onLaunchEnvironmentPresetChange?: (presetId: string) => void;
}

type ProfileFormState = {
  id?: string;
  profile_key: string;
  name: string;
  description: string;
  site_scope: string;
  launch_url: string;
  transport_kind: BrowserProfileTransportKind;
};

const EMPTY_FORM: ProfileFormState = {
  profile_key: "",
  name: "",
  description: "",
  site_scope: "",
  launch_url: "",
  transport_kind: "managed_cdp",
};

const PROFILE_TRANSPORT_OPTIONS: Array<{
  value: BrowserProfileTransportKind;
  key: "managed" | "existing";
}> = [
  {
    value: "managed_cdp",
    key: "managed",
  },
  {
    value: "existing_session",
    key: "existing",
  },
];

const BROWSER_RUNTIME_PRIMARY_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-3 text-sm text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95";

function getProfileTransportOption(
  options: Array<{
    value: BrowserProfileTransportKind;
    label: string;
    description: string;
  }>,
  transportKind: BrowserProfileTransportKind,
) {
  return options.find((option) => option.value === transportKind) ?? options[0];
}

const EXISTING_SESSION_RUNTIME_FALLBACK_PATTERNS = [
  "附着当前 chrome",
  "existing_session",
  "可复用的浏览器会话",
  "远程调试",
  "未检测到可连接的 cdp 调试端口",
  "没有可用的 chrome 会话",
  "未找到 profile_key",
];

function shouldFallbackToExistingSessionBridge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  return EXISTING_SESSION_RUNTIME_FALLBACK_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toFormState(profile: BrowserProfileRecord): ProfileFormState {
  return {
    id: profile.id,
    profile_key: profile.profile_key,
    name: profile.name,
    description: profile.description ?? "",
    site_scope: profile.site_scope ?? "",
    launch_url: profile.launch_url ?? "",
    transport_kind: profile.transport_kind ?? "managed_cdp",
  };
}

export function BrowserProfileManager(props: BrowserProfileManagerProps) {
  const {
    onMessage,
    onProfileLaunched,
    launchEnvironmentPresetId = "",
    launchEnvironmentPresetOptions = [],
    onLaunchEnvironmentPresetChange,
  } = props;
  const { t, i18n } = useTranslation("workspace");
  const [profiles, setProfiles] = useState<BrowserProfileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const transportOptions = useMemo(
    () =>
      PROFILE_TRANSPORT_OPTIONS.map((option) => ({
        value: option.value,
        label: t(
          option.key === "managed"
            ? "workspace.browserProfile.transport.managed.label"
            : "workspace.browserProfile.transport.existing.label",
        ),
        description: t(
          option.key === "managed"
            ? "workspace.browserProfile.transport.managed.description"
            : "workspace.browserProfile.transport.existing.description",
        ),
      })),
    [t],
  );

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => profile.archived_at === null),
    [profiles],
  );
  const selectedLaunchEnvironmentPreset = useMemo(
    () =>
      launchEnvironmentPresetOptions.find(
        (preset) => preset.id === launchEnvironmentPresetId,
      ) ?? null,
    [launchEnvironmentPresetId, launchEnvironmentPresetOptions],
  );
  const existingSessionEnvironmentNotice = useMemo(
    () =>
      selectedLaunchEnvironmentPreset
        ? t("workspace.browserProfile.notice.existingSessionEnvironment", {
            presetName: selectedLaunchEnvironmentPreset.name,
          })
        : null,
    [selectedLaunchEnvironmentPreset, t],
  );
  const existingSessionCopy = useMemo<ExistingSessionProfileManagerCopy>(
    () => ({
      tabsLoadFailed: (message) =>
        t("workspace.browserExistingSession.feedback.tabsLoadFailed", {
          message,
        }),
      attachSuccess: ({ name, url, notice }) => {
        const noticeSuffix = notice
          ? t("workspace.browserExistingSession.feedback.noticeSuffix", {
              notice,
            })
          : "";
        return url
          ? t(
              "workspace.browserExistingSession.feedback.attachSuccessWithUrl",
              {
                name,
                notice: noticeSuffix,
                url,
              },
            )
          : t("workspace.browserExistingSession.feedback.attachSuccess", {
              name,
              notice: noticeSuffix,
            });
      },
      tabSwitchSuccess: (tabLabel) =>
        t("workspace.browserExistingSession.feedback.tabSwitchSuccess", {
          tabLabel,
        }),
      tabSwitchFailed: (message) =>
        t("workspace.browserExistingSession.feedback.tabSwitchFailed", {
          message,
        }),
    }),
    [t],
  );
  const {
    attachProfiles,
    bridgeObserverMap,
    bridgeConnectionCount,
    connectedAttachCount,
    pageInfoByProfileKey,
    tabsByProfileKey,
    tabPanelsOpen,
    loadingTabsByProfileKey,
    switchingTabKey,
    syncBridgeStatus,
    loadExistingSessionTabs,
    handleAttachExistingSession,
    handleToggleExistingSessionTabs,
    handleSwitchExistingSessionTab,
  } = useExistingSessionProfileManager({
    profiles,
    existingSessionEnvironmentNotice,
    copy: existingSessionCopy,
    onMessage,
    onProfileLaunched,
  });

  const refreshProfiles = useCallback(
    async (includeArchived = showArchived) => {
      setLoading(true);
      try {
        const [nextProfiles, nextBridgeStatus] = await Promise.all([
          browserRuntimeApi.listBrowserProfiles({
            include_archived: includeArchived,
          }),
          getExistingSessionBridgeStatus(),
        ]);
        startTransition(() => {
          setProfiles(nextProfiles);
        });
        syncBridgeStatus(nextBridgeStatus);
      } catch (error) {
        onMessage?.({
          type: "error",
          text: t("workspace.browserProfile.feedback.loadFailed", {
            message: getErrorMessage(error),
          }),
        });
      } finally {
        setLoading(false);
      }
    },
    [onMessage, showArchived, syncBridgeStatus, t],
  );

  useEffect(() => {
    void refreshProfiles(showArchived);
  }, [refreshProfiles, showArchived]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormOpen(false);
  }, []);

  const handleCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((profile: BrowserProfileRecord) => {
    setForm(toFormState(profile));
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserProfile.feedback.nameRequired"),
      });
      return;
    }
    if (!form.id && !form.profile_key.trim()) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserProfile.feedback.keyRequired"),
      });
      return;
    }

    setSubmitting(true);
    try {
      const saved = await browserRuntimeApi.saveBrowserProfile({
        id: form.id,
        profile_key: form.profile_key.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        site_scope: form.site_scope.trim() || undefined,
        launch_url: form.launch_url.trim() || undefined,
        transport_kind: form.transport_kind,
      });
      await refreshProfiles(showArchived);
      setForm(toFormState(saved));
      onMessage?.({
        type: "success",
        text: form.id
          ? t("workspace.browserProfile.feedback.updated", {
              name: saved.name,
            })
          : t("workspace.browserProfile.feedback.created", {
              name: saved.name,
            }),
      });
      setFormOpen(false);
    } catch (error) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserProfile.feedback.saveFailed", {
          message: getErrorMessage(error),
        }),
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, onMessage, refreshProfiles, showArchived, t]);

  const handleArchive = useCallback(
    async (profile: BrowserProfileRecord) => {
      try {
        await browserRuntimeApi.archiveBrowserProfile(profile.id);
        await refreshProfiles(showArchived);
        if (form.id === profile.id) {
          resetForm();
        }
        onMessage?.({
          type: "success",
          text: t("workspace.browserProfile.feedback.archived", {
            name: profile.name,
          }),
        });
      } catch (error) {
        onMessage?.({
          type: "error",
          text: t("workspace.browserProfile.feedback.archiveFailed", {
            message: getErrorMessage(error),
          }),
        });
      }
    },
    [form.id, onMessage, refreshProfiles, resetForm, showArchived, t],
  );

  const handleRestore = useCallback(
    async (profile: BrowserProfileRecord) => {
      try {
        await browserRuntimeApi.restoreBrowserProfile(profile.id);
        await refreshProfiles(showArchived);
        onMessage?.({
          type: "success",
          text: t("workspace.browserProfile.feedback.restored", {
            name: profile.name,
          }),
        });
      } catch (error) {
        onMessage?.({
          type: "error",
          text: t("workspace.browserProfile.feedback.restoreFailed", {
            message: getErrorMessage(error),
          }),
        });
      }
    },
    [onMessage, refreshProfiles, showArchived, t],
  );

  const handleLaunch = useCallback(
    async (profile: BrowserProfileRecord) => {
      try {
        if (profile.transport_kind === "existing_session") {
          try {
            await browserRuntimeApi.launchBrowserSession({
              profile_id: profile.id,
              environment_preset_id: launchEnvironmentPresetId || undefined,
              open_window: false,
              stream_mode: "both",
            });
            await refreshProfiles(showArchived);
            onProfileLaunched?.(profile.profile_key);
            onMessage?.({
              type: "success",
              text: selectedLaunchEnvironmentPreset
                ? t(
                    "workspace.browserProfile.feedback.attachedWithEnvironment",
                    {
                      environmentName: selectedLaunchEnvironmentPreset.name,
                      name: profile.name,
                    },
                  )
                : t("workspace.browserProfile.feedback.attached", {
                    name: profile.name,
                  }),
            });
            return;
          } catch (error) {
            if (!shouldFallbackToExistingSessionBridge(error)) {
              throw error;
            }
          }

          await handleAttachExistingSession(profile);
          return;
        }
        await browserRuntimeApi.launchBrowserSession({
          profile_id: profile.id,
          environment_preset_id: launchEnvironmentPresetId || undefined,
          open_window: false,
          stream_mode: "both",
        });
        await refreshProfiles(showArchived);
        onProfileLaunched?.(profile.profile_key);
        onMessage?.({
          type: "success",
          text: selectedLaunchEnvironmentPreset
            ? t("workspace.browserProfile.feedback.launchedWithEnvironment", {
                environmentName: selectedLaunchEnvironmentPreset.name,
                name: profile.name,
              })
            : t("workspace.browserProfile.feedback.launched", {
                name: profile.name,
              }),
        });
      } catch (error) {
        onMessage?.({
          type: "error",
          text: t("workspace.browserProfile.feedback.launchFailed", {
            message: getErrorMessage(error),
          }),
        });
      }
    },
    [
      handleAttachExistingSession,
      launchEnvironmentPresetId,
      onMessage,
      onProfileLaunched,
      refreshProfiles,
      selectedLaunchEnvironmentPreset,
      showArchived,
      t,
    ],
  );

  return (
    <section className="rounded-lg border p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            {t("workspace.browserProfile.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("workspace.browserProfile.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("workspace.browserProfile.launch.label")}</span>
            <select
              value={launchEnvironmentPresetId}
              onChange={(event) =>
                onLaunchEnvironmentPresetChange?.(event.target.value)
              }
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="">
                {t("workspace.browserProfile.launch.none")}
              </option>
              {launchEnvironmentPresetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void refreshProfiles(showArchived)}
            disabled={loading}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loading
              ? t("workspace.browserProfile.actions.refreshing")
              : t("workspace.browserProfile.actions.refresh")}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className={BROWSER_RUNTIME_PRIMARY_ACTION_BUTTON_CLASSNAME}
          >
            <SquarePen className="h-4 w-4" />
            {t("workspace.browserProfile.actions.new")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {t("workspace.browserProfile.summary.activeProfiles", {
            activeCount: formatNumber(activeProfiles.length, {
              locale: i18n.language,
            }),
          })}
        </span>
        <span>
          {t("workspace.browserProfile.summary.attachedChrome", {
            attachCount: formatNumber(attachProfiles.length, {
              locale: i18n.language,
            }),
            connectedCount: formatNumber(connectedAttachCount, {
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
            ? t("workspace.browserProfile.actions.hideArchived")
            : t("workspace.browserProfile.actions.showArchived")}
        </button>
        <span>
          {t("workspace.browserProfile.summary.currentLaunchEnvironment", {
            value:
              selectedLaunchEnvironmentPreset?.name ||
              t("workspace.browserProfile.launch.none"),
          })}
        </span>
      </div>

      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          bridgeConnectionCount > 0
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
            : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        }`}
      >
        <span className="font-medium">
          {bridgeConnectionCount > 0
            ? t("workspace.browserProfile.bridge.availableTitle")
            : t("workspace.browserProfile.bridge.unavailableTitle")}
        </span>
        <span className="ml-1">
          {bridgeConnectionCount > 0
            ? t("workspace.browserProfile.bridge.availableDescription", {
                connectionCount: formatNumber(bridgeConnectionCount, {
                  locale: i18n.language,
                }),
              })
            : t("workspace.browserProfile.bridge.unavailableDescription")}
        </span>
      </div>

      {formOpen ? (
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserProfile.fields.name")}
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
              placeholder={t("workspace.browserProfile.placeholders.name")}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserProfile.fields.profileKey")}
            </span>
            <input
              value={form.profile_key}
              disabled={Boolean(form.id)}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  profile_key: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3 disabled:cursor-not-allowed disabled:bg-muted"
              placeholder={t(
                "workspace.browserProfile.placeholders.profileKey",
              )}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserProfile.fields.transport")}
            </span>
            <select
              value={form.transport_kind}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  transport_kind: event.target
                    .value as BrowserProfileTransportKind,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {transportOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserProfile.fields.siteScope")}
            </span>
            <input
              value={form.site_scope}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  site_scope: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder={t("workspace.browserProfile.placeholders.siteScope")}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("workspace.browserProfile.fields.launchUrl")}
            </span>
            <input
              value={form.launch_url}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  launch_url: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="https://example.com"
            />
          </label>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 md:col-span-2 dark:text-amber-200">
            {getProfileTransportOption(transportOptions, form.transport_kind)
              ?.description ?? ""}
            {form.transport_kind === "existing_session" ? (
              <span>
                {" "}
                {t("workspace.browserProfile.transport.existing.extensionHint")}
              </span>
            ) : null}
          </div>
          {form.transport_kind === "existing_session" &&
          existingSessionEnvironmentNotice ? (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-800 md:col-span-2 dark:text-sky-200">
              {existingSessionEnvironmentNotice}
            </div>
          ) : null}
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">
              {t("workspace.browserProfile.fields.description")}
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
                "workspace.browserProfile.placeholders.description",
              )}
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
            >
              {t("workspace.browserProfile.actions.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-sm text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {submitting
                ? t("workspace.browserProfile.actions.saving")
                : form.id
                  ? t("workspace.browserProfile.actions.update")
                  : t("workspace.browserProfile.actions.create")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {profiles.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
            {t("workspace.browserProfile.empty")}
          </div>
        ) : null}

        {profiles.map((profile) => {
          const isArchived = profile.archived_at !== null;
          const transportKind = profile.transport_kind ?? "managed_cdp";
          const bridgeObserver =
            transportKind === "existing_session"
              ? bridgeObserverMap.get(profile.profile_key)
              : null;
          const pageInfo =
            transportKind === "existing_session"
              ? (pageInfoByProfileKey[profile.profile_key] ??
                bridgeObserver?.last_page_info ??
                null)
              : null;
          const currentTabs = tabsByProfileKey[profile.profile_key] ?? [];
          const isTabPanelOpen = tabPanelsOpen[profile.profile_key] === true;
          const isTabsLoading =
            loadingTabsByProfileKey[profile.profile_key] === true;
          return (
            <article
              key={profile.id}
              className={`rounded-xl border px-4 py-4 transition ${
                isArchived ? "border-dashed opacity-70" : "bg-background"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{profile.name}</h3>
                    <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {profile.profile_key}
                    </span>
                    <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-200">
                      {
                        getProfileTransportOption(
                          transportOptions,
                          transportKind,
                        )?.label
                      }
                    </span>
                    {transportKind === "existing_session" ? (
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] ${
                          bridgeObserver
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {bridgeObserver
                          ? t("workspace.browserProfile.bridge.connectedBadge")
                          : t("workspace.browserProfile.bridge.waitingBadge")}
                      </span>
                    ) : null}
                    {isArchived ? (
                      <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                        {t("workspace.browserProfile.badge.archived")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("workspace.browserProfile.meta.site", {
                        value:
                          profile.site_scope ||
                          t("workspace.browserProfile.value.unset"),
                      })}
                    </span>
                    <span>
                      {t("workspace.browserProfile.meta.defaultUrl", {
                        value: profile.launch_url || "https://www.google.com/",
                      })}
                    </span>
                    <span>
                      {t("workspace.browserProfile.meta.lastUsed", {
                        value:
                          profile.last_used_at ||
                          t("workspace.browserProfile.value.never"),
                      })}
                    </span>
                    {bridgeObserver ? (
                      <span>
                        {t("workspace.browserProfile.meta.currentPage", {
                          value:
                            pageInfo?.title ||
                            pageInfo?.url ||
                            t("workspace.browserProfile.value.connected"),
                        })}
                      </span>
                    ) : null}
                  </div>
                  {profile.description ? (
                    <p className="max-w-3xl text-sm text-muted-foreground">
                      {profile.description}
                    </p>
                  ) : null}
                  {transportKind === "existing_session" &&
                  existingSessionEnvironmentNotice ? (
                    <p className="max-w-3xl text-xs text-amber-700 dark:text-amber-300">
                      {existingSessionEnvironmentNotice}
                    </p>
                  ) : null}
                  {transportKind === "existing_session" && isTabPanelOpen ? (
                    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-foreground">
                            {t("workspace.browserProfile.tabs.title")}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t("workspace.browserProfile.tabs.description")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void loadExistingSessionTabs(profile, {
                              quiet: true,
                              open: true,
                            }).catch(() => undefined)
                          }
                          disabled={isTabsLoading}
                          className="inline-flex h-7 items-center rounded-md border px-2.5 text-xs hover:bg-muted disabled:opacity-60"
                        >
                          {isTabsLoading
                            ? t("workspace.browserProfile.actions.refreshing")
                            : t("workspace.browserProfile.tabs.refresh")}
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {currentTabs.length === 0 ? (
                          <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
                            {t("workspace.browserProfile.tabs.empty")}
                          </div>
                        ) : (
                          currentTabs.map((tab) => {
                            const currentSwitchingTabKey = `${profile.profile_key}:${tab.id}`;
                            const isSwitching =
                              switchingTabKey === currentSwitchingTabKey;
                            return (
                              <div
                                key={tab.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                                      {t(
                                        "workspace.browserProfile.tabs.index",
                                        {
                                          index: formatNumber(tab.index + 1, {
                                            locale: i18n.language,
                                          }),
                                        },
                                      )}
                                    </span>
                                    {tab.active ? (
                                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-200">
                                        {t(
                                          "workspace.browserProfile.tabs.current",
                                        )}
                                      </span>
                                    ) : null}
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {getExistingSessionTabLabel(tab)}
                                    </span>
                                  </div>
                                  {tab.url ? (
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                      {tab.url}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleSwitchExistingSessionTab(
                                      profile,
                                      tab,
                                    )
                                  }
                                  disabled={tab.active || isSwitching}
                                  className="inline-flex h-8 items-center rounded-md border px-2.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {tab.active
                                    ? t(
                                        "workspace.browserProfile.tabs.currentTab",
                                      )
                                    : isSwitching
                                      ? t(
                                          "workspace.browserProfile.tabs.switching",
                                        )
                                      : t(
                                          "workspace.browserProfile.tabs.switchTo",
                                        )}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isArchived ? (
                    <button
                      type="button"
                      onClick={() => void handleRestore(profile)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("workspace.browserProfile.actions.restore")}
                    </button>
                  ) : (
                    <>
                      {transportKind === "existing_session" ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleExistingSessionTabs(profile)
                          }
                          disabled={!bridgeObserver || isTabsLoading}
                          className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isTabsLoading
                            ? t("workspace.browserProfile.tabs.loading")
                            : isTabPanelOpen
                              ? t("workspace.browserProfile.tabs.collapse")
                              : t("workspace.browserProfile.tabs.view")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleLaunch(profile)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-sky-700 bg-sky-700 px-2.5 text-xs text-white transition hover:bg-sky-600"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {transportKind === "existing_session"
                          ? t("workspace.browserProfile.actions.attachChrome")
                          : t("workspace.browserProfile.actions.launch")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(profile)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        {t("workspace.browserProfile.actions.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleArchive(profile)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        {t("workspace.browserProfile.actions.archive")}
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
