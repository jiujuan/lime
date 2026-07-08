import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { resolveOemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import {
  PLUGINS_CHANGED_EVENT,
  getPluginCloudCatalog,
  listInstalledPlugins,
  startPluginUiRuntime,
  type PluginUiRuntimeStatus,
} from "@/lib/api/plugins";
import type { PluginPageParams } from "@/types/page";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryPluginCapabilityStore } from "../adapters/InMemoryPluginCapabilityStore";
import { buildLimeRuntimeProfileForInstalledState } from "../runtime-profile";
import { createPluginCapabilityDispatcher } from "../runtime/capabilityDispatcher";
import { wrapPluginCapabilityDispatchWithBrowserIntentLaunch } from "../runtime/browserIntentLaunch";
import { evaluatePluginEntryRuntimeGuard } from "../runtime/entryRuntimeGuard";
import {
  createPluginHostBridge,
  type PluginHostAgentRunUiRequest,
  type PluginHostBridge,
  type PluginHostBridgeNotifyPayload,
} from "../runtime/hostBridge";
import { createDefaultPluginRuntimeHostOptions } from "../runtime/agentRuntimeAppServerClient";
import { AgentRuntimeCapabilityHost } from "../runtime/agentRuntimeCapabilityHost";
import type {
  PluginRunProjectionAction,
  PluginRunProjectionActionControl,
} from "../runtime/agentUiProjectionViewModel";
import { buildLimeCapabilityInvokeRequest } from "../sdk/capabilityContract";
import type {
  CloudBootstrapApp,
  InstalledPluginState,
} from "../types";
import { buildRuntimePackageLoadForPreview } from "./pluginsRuntime";
import { resolveInstalledPluginDisplayName } from "./pluginDisplay";
import {
  AgentRunHostDrawer,
  type AgentRunTranslator,
  type AgentRunUiState,
} from "./AgentRunHostDrawer";
import {
  type AgentRunDismissalKey,
  buildAgentRunActionResponse,
  buildAgentRunDismissalKey,
  buildAgentRunUiStorageKey,
  matchesDismissedAgentRun,
  mergeAgentRunDismissalKey,
  mergeAgentRunUiState,
  normalizeAgentRunActionType,
  persistAgentRunUi,
  readAgentRunTaskId,
  readStoredAgentRunUi,
  shouldCloseAgentRunUi,
} from "./PluginRuntimeAgentRunState";
import {
  RUNTIME_PAGE_FLAGS,
  RUNTIME_PAGE_PROFILE,
  buildPreviewFromInstalledState,
  hasNewerCloudVersion,
  normalizeErrorMessage,
  resolveActiveEntry,
  resolveHostBridgeCapabilities,
  shouldExposeCloudSession,
  sourceLabelKey,
} from "./PluginRuntimePageHelpers";

export function PluginRuntimePage({
  pageParams,
}: {
  pageParams?: PluginPageParams;
}) {
  const { t } = useTranslation("agent");
  const [installed, setInstalled] = useState<InstalledPluginState[]>([]);
  const [loading, setLoading] = useState(true);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtime, setRuntime] = useState<PluginUiRuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [agentRunUi, setAgentRunUi] = useState<AgentRunUiState | null>(null);
  const [agentRunExpanded, setAgentRunExpanded] = useState(false);
  const [cloudApps, setCloudApps] = useState<CloudBootstrapApp[]>([]);
  const [appInfoOpen, setAppInfoOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const hostBridgeRef = useRef<PluginHostBridge | null>(null);
  const dismissedAgentRunRef = useRef<AgentRunDismissalKey | null>(null);

  const selected = useMemo(
    () =>
      installed.find((state) => state.appId === pageParams?.appId) ??
      installed[0] ??
      null,
    [installed, pageParams?.appId],
  );
  const activeEntry = selected
    ? resolveActiveEntry(selected, pageParams?.entryKey)
    : undefined;
  const agentRunStorageKey = useMemo(
    () => buildAgentRunUiStorageKey(selected?.appId, activeEntry?.key),
    [activeEntry?.key, selected?.appId],
  );
  const agentRunStorageKeyRef = useRef<string | null>(agentRunStorageKey);
  const displayName = selected
    ? resolveInstalledPluginDisplayName(selected)
    : t("plugin.apps.runtime.unavailable");
  const currentProjectId = pageParams?.projectId?.trim() || undefined;
  const selectedCloudApp = useMemo(
    () => cloudApps.find((app) => app.appId === selected?.appId),
    [cloudApps, selected?.appId],
  );
  const upgradeAvailable = hasNewerCloudVersion(selected, selectedCloudApp);
  const capabilityHost = useMemo(() => {
    if (!selected) {
      return null;
    }
    const adapterHost = new AdapterCapabilityHost({
      preview: buildPreviewFromInstalledState(selected),
      store: new InMemoryPluginCapabilityStore(),
    });
    return new AgentRuntimeCapabilityHost({
      delegate: adapterHost,
      appId: selected.appId,
      appVersion: selected.identity.appVersion,
      packageHash: selected.identity.packageHash,
      manifestHash: selected.identity.manifestHash,
      ...(currentProjectId ? { workspaceId: currentProjectId } : {}),
      ...createDefaultPluginRuntimeHostOptions(),
    });
  }, [currentProjectId, selected]);
  const hostBridgeCapabilities = useMemo(
    () => (selected ? resolveHostBridgeCapabilities(selected) : undefined),
    [selected],
  );
  const hostBridgeCloud = useCallback(() => {
    if (!selected || !shouldExposeCloudSession(selected)) {
      return undefined;
    }
    const cloudRuntime = resolveOemCloudRuntimeContext();
    return cloudRuntime
      ? {
          controlPlaneBaseUrl: cloudRuntime.controlPlaneBaseUrl,
          tenantId: cloudRuntime.tenantId,
          hasSession: Boolean(cloudRuntime.sessionToken),
        }
      : undefined;
  }, [selected]);
  const runtimeProfile = useMemo(
    () =>
      selected
        ? buildLimeRuntimeProfileForInstalledState({
            state: selected,
            hostProfile: RUNTIME_PAGE_PROFILE,
          })
        : null,
    [selected],
  );
  const baseDispatchCapability = useMemo(() => {
    if (!selected || !capabilityHost || !activeEntry || !runtimeProfile) {
      return undefined;
    }
    return createPluginCapabilityDispatcher({
      host: capabilityHost,
      projection: selected.projection,
      entryKey: activeEntry.key,
      profile: RUNTIME_PAGE_PROFILE,
      runtimeProfile,
      manifestVersion: selected.manifest.manifestVersion,
      agentRuntime: selected.manifest.agentRuntime,
      requirements: selected.manifest.requirements,
      boundary: selected.manifest.boundary,
      integrations: selected.manifest.integrations,
      operations: selected.manifest.operations,
    });
  }, [activeEntry, capabilityHost, runtimeProfile, selected]);
  const dispatchCapability = useMemo(() => {
    if (!baseDispatchCapability || !selected || !activeEntry) {
      return undefined;
    }
    return wrapPluginCapabilityDispatchWithBrowserIntentLaunch(
      baseDispatchCapability,
      {
        appId: selected.appId,
        title: displayName,
        entry: activeEntry,
        target: pageParams?.rightSurfaceTarget ?? null,
      },
      {
        onError: (error) => {
          toast.error(normalizeErrorMessage(error));
        },
      },
    );
  }, [
    activeEntry,
    baseDispatchCapability,
    displayName,
    pageParams?.rightSurfaceTarget,
    selected,
  ]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listInstalledPlugins();
      setInstalled(result.states.filter((state) => !state.disabled));
    } catch (error) {
      setInstalled([]);
      setRuntimeError(normalizeErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") {
      return;
    }

    const reload = () => {
      void refresh();
    };
    window.addEventListener(PLUGINS_CHANGED_EVENT, reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener(PLUGINS_CHANGED_EVENT, reload);
      window.removeEventListener("focus", reload);
    };
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    getPluginCloudCatalog()
      .then((result) => {
        if (!disposed) {
          setCloudApps(result.payload.apps);
        }
      })
      .catch(() => {
        if (!disposed) {
          setCloudApps([]);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  const openRuntime = useCallback(async () => {
    if (!selected || !activeEntry || !runtimeProfile) {
      setRuntime(null);
      setRuntimeError(t("plugin.apps.runtime.unavailable"));
      return;
    }

    setRuntimeLoading(true);
    setRuntime(null);
    setRuntimeError(null);
    try {
      const preview = buildPreviewFromInstalledState(selected);
      const guard = evaluatePluginEntryRuntimeGuard({
        preview,
        entryKey: activeEntry.key,
        flags: RUNTIME_PAGE_FLAGS,
        operation: "mount-ui",
        runtimePackageLoad: buildRuntimePackageLoadForPreview(preview),
        permissionDecision: "accepted",
        installMode: selected.installMode,
        runtimeProfile,
        lifecycle: {
          disabled: selected.disabled,
        },
      });
      if (guard.status !== "allow") {
        throw new Error(t(`plugin.lab.guard.summary.${guard.status}`));
      }
      const status = await startPluginUiRuntime({
        appId: selected.appId,
        entryKey: activeEntry.key,
      });
      if (status.status !== "running" || !status.entryUrl) {
        throw new Error(status.message ?? t("plugin.apps.runtime.openFailed"));
      }
      setRuntime(status);
    } catch (error) {
      setRuntimeError(normalizeErrorMessage(error));
    } finally {
      setRuntimeLoading(false);
    }
  }, [activeEntry, runtimeProfile, selected, t]);

  useEffect(() => {
    if (loading || !selected) {
      return;
    }
    void openRuntime();
  }, [loading, openRuntime, pageParams?.launchRequestKey, retryKey, selected]);

  const notifyFromApp = useCallback(
    ({ message, level }: PluginHostBridgeNotifyPayload) => {
      if (level === "error") {
        toast.error(message);
        return;
      }
      if (level === "success") {
        toast.success(message);
        return;
      }
      toast(message);
    },
    [],
  );
  const translateAgentRun = useCallback<AgentRunTranslator>(
    (key, params) => (t as unknown as AgentRunTranslator)(key, params),
    [t],
  );

  useEffect(() => {
    dismissedAgentRunRef.current = null;
    agentRunStorageKeyRef.current = agentRunStorageKey;
    setAgentRunUi(readStoredAgentRunUi(agentRunStorageKey));
    setAgentRunExpanded(false);
    setAppInfoOpen(false);
  }, [agentRunStorageKey]);

  const openAgentRunUi = useCallback((request: PluginHostAgentRunUiRequest) => {
    const now = new Date().toISOString();
    const mode = request.mode ?? "drawer";
    setAgentRunUi((previous) => {
      if (
        !previous &&
        matchesDismissedAgentRun(dismissedAgentRunRef.current, request)
      ) {
        return null;
      }
      dismissedAgentRunRef.current = null;
      const next = mergeAgentRunUiState(previous, request, now, mode);
      persistAgentRunUi(agentRunStorageKeyRef.current, next);
      return next;
    });
    return {
      opened: true as const,
      surface: "host_agent_run" as const,
      mode,
      taskId: request.taskId,
    };
  }, []);

  const updateAgentRunUi = useCallback(
    (request: PluginHostAgentRunUiRequest) => {
      const now = new Date().toISOString();
      setAgentRunUi((previous) => {
        if (
          !previous &&
          matchesDismissedAgentRun(dismissedAgentRunRef.current, request)
        ) {
          return null;
        }
        const next = mergeAgentRunUiState(
          previous,
          request,
          now,
          previous?.mode ?? "drawer",
        );
        persistAgentRunUi(agentRunStorageKeyRef.current, next);
        return next;
      });
      return {
        updated: true as const,
        surface: "host_agent_run" as const,
        taskId: request.taskId,
      };
    },
    [],
  );

  const closeAgentRunUi = useCallback(
    (request: Pick<PluginHostAgentRunUiRequest, "taskId" | "bridgeAction">) => {
      const requestKey = buildAgentRunDismissalKey(request);
      setAgentRunUi((previous) => {
        if (!previous) {
          dismissedAgentRunRef.current = requestKey;
          persistAgentRunUi(agentRunStorageKeyRef.current, null);
          return null;
        }
        if (!shouldCloseAgentRunUi(previous, request)) {
          return previous;
        }
        dismissedAgentRunRef.current = mergeAgentRunDismissalKey(
          requestKey,
          buildAgentRunDismissalKey(previous),
        );
        persistAgentRunUi(agentRunStorageKeyRef.current, null);
        return null;
      });
      return {
        closed: true as const,
        surface: "host_agent_run" as const,
        taskId: request.taskId,
      };
    },
    [],
  );

  const submitAgentRunAction = useCallback(
    async (
      action: PluginRunProjectionAction,
      control: PluginRunProjectionActionControl,
    ) => {
      const taskId = action.taskId ?? readAgentRunTaskId(agentRunUi);
      if (!dispatchCapability || !selected || !taskId) {
        toast.error(t("plugin.apps.toast.failed"));
        return;
      }
      const actionType = normalizeAgentRunActionType(action.actionType);
      const response = buildAgentRunActionResponse(control);
      const input = {
        taskId,
        requestId: action.actionId,
        actionType,
        confirmed: response.confirmed,
        response: response.response,
        metadata: {
          source: "host_agent_run_panel",
          control,
        },
        actionScope: {
          sessionId: action.sessionId,
          threadId: action.threadId,
          turnId: action.turnId,
        },
      };
      const requestId = `agent-run-action:${action.actionId}:${control}`;
      const invokeRequest = buildLimeCapabilityInvokeRequest({
        capability: "lime.agent",
        method: "submitHostResponse",
        args: input,
        requestId,
        provenance: {
          appId: selected.appId,
          entryKey: activeEntry?.key,
          packageHash: selected.identity.packageHash,
          manifestHash: selected.identity.manifestHash,
          taskId,
        },
      });

      try {
        await dispatchCapability({
          appId: selected.appId,
          entryKey: activeEntry?.key,
          requestId,
          capability: "lime.agent",
          method: "submitHostResponse",
          input,
          invokeRequest,
          rawPayload: invokeRequest as unknown as Record<string, unknown>,
        });
        const now = new Date().toISOString();
        setAgentRunUi((previous) => {
          const next = mergeAgentRunUiState(
            previous,
            {
              taskId,
              events: [
                {
                  id: requestId,
                  type: "action.resolved",
                  actionId: action.actionId,
                  taskId,
                  status: "resolved",
                  control: "none",
                  payload: {
                    actionType,
                    controls: [],
                    preview: action.preview,
                    response: response.response,
                  },
                },
              ],
            },
            now,
            previous?.mode ?? "drawer",
          );
          persistAgentRunUi(agentRunStorageKeyRef.current, next);
          return next;
        });
      } catch (error) {
        toast.error(normalizeErrorMessage(error));
      }
    },
    [activeEntry?.key, agentRunUi, dispatchCapability, selected, t],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !runtime?.entryUrl || !selected || !activeEntry) {
      hostBridgeRef.current?.dispose();
      hostBridgeRef.current = null;
      return;
    }

    try {
      const bridge = createPluginHostBridge({
        frame,
        appId: selected.appId,
        entryKey: activeEntry.key,
        displayName,
        entryRoute: activeEntry.route,
        entryUrl: runtime.entryUrl,
        notify: notifyFromApp,
        openAgentRunUi,
        updateAgentRunUi,
        closeAgentRunUi,
        cloud: hostBridgeCloud,
        capabilities: hostBridgeCapabilities,
        dispatchCapability,
      });
      hostBridgeRef.current = bridge;
      const cleanup = bridge.start();
      return () => {
        if (hostBridgeRef.current === bridge) {
          hostBridgeRef.current = null;
        }
        cleanup();
      };
    } catch (error) {
      setRuntimeError(normalizeErrorMessage(error));
      return;
    }
  }, [
    activeEntry,
    closeAgentRunUi,
    dispatchCapability,
    displayName,
    hostBridgeCloud,
    hostBridgeCapabilities,
    notifyFromApp,
    openAgentRunUi,
    runtime?.entryUrl,
    selected,
    updateAgentRunUi,
  ]);

  const handleFrameLoad = useCallback(() => {
    hostBridgeRef.current?.sendSnapshot();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        {t("plugin.apps.runtime.loading")}
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-8 text-center text-sm text-slate-500">
        {t("plugin.apps.runtime.empty")}
      </div>
    );
  }

  if (runtimeError) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-6">
        <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
            {t("plugin.apps.runtime.openFailed")}
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-950">
            {displayName}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {runtimeError}
          </p>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={runtimeLoading}
            onClick={() => setRetryKey((value) => value + 1)}
          >
            <RefreshCw size={16} />
            {t("plugin.apps.runtime.retry")}
          </button>
        </section>
      </div>
    );
  }

  if (runtimeLoading || !runtime?.entryUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        {t("plugin.apps.runtime.opening", { name: displayName })}
      </div>
    );
  }

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden bg-white"
      data-testid="plugin-runtime-surface"
    >
      <iframe
        ref={frameRef}
        title={displayName}
        src={runtime.entryUrl}
        className="h-full w-full border-0 bg-white"
        data-testid="plugin-runtime-frame"
        onLoad={handleFrameLoad}
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-modals"
      />
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
        {appInfoOpen ? (
          <section
            className="pointer-events-auto w-64 rounded-lg border border-border bg-background p-3 text-left shadow-md shadow-slate-950/10"
            data-testid="plugin-host-app-info-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {displayName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("plugin.apps.runtime.appInfo.version", {
                    version: selected.identity.appVersion,
                  })}
                </p>
              </div>
              {upgradeAvailable ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {t("plugin.apps.runtime.appInfo.upgradeBadge")}
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("plugin.apps.runtime.appInfo.source")}
                </dt>
                <dd className="font-medium text-foreground">
                  {t(sourceLabelKey(selected))}
                </dd>
              </div>
              {selectedCloudApp?.version ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t("plugin.apps.runtime.appInfo.latestVersion")}
                  </dt>
                  <dd
                    className={
                      upgradeAvailable
                        ? "font-semibold text-rose-700 dark:text-rose-300"
                        : "font-medium text-foreground"
                    }
                  >
                    {t("plugin.apps.runtime.appInfo.versionValue", {
                      version: selectedCloudApp.version,
                    })}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("plugin.apps.runtime.appInfo.entry")}
                </dt>
                <dd className="max-w-32 truncate font-medium text-foreground">
                  {activeEntry?.title ?? activeEntry?.key ?? "-"}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}
        <button
          type="button"
          className="pointer-events-auto relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm shadow-slate-950/10 transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          aria-label={t("plugin.apps.runtime.appInfo.toggle")}
          aria-expanded={appInfoOpen}
          data-testid="plugin-host-app-info-toggle"
          onClick={() => setAppInfoOpen((value) => !value)}
        >
          <Info size={14} aria-hidden="true" />
          {upgradeAvailable ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-rose-500"
              data-testid="plugin-host-app-info-update-dot"
            />
          ) : null}
        </button>
      </div>
      {agentRunUi ? (
        <AgentRunHostDrawer
          run={agentRunUi}
          displayName={displayName}
          expanded={agentRunExpanded}
          onExpand={() => {
            setAgentRunExpanded(true);
          }}
          onCollapse={() => {
            setAgentRunExpanded(false);
          }}
          onClose={() => {
            setAgentRunExpanded(false);
            closeAgentRunUi({
              taskId: readAgentRunTaskId(agentRunUi) ?? agentRunUi.taskId,
              bridgeAction: agentRunUi.bridgeAction,
            });
          }}
          onAction={submitAgentRunAction}
          t={translateAgentRun}
        />
      ) : null}
    </div>
  );
}
