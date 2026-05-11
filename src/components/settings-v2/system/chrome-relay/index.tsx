import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bug,
  Copy,
  ExternalLink,
  Globe,
  Layers3,
  Link2,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getConfig } from "@/lib/api/appConfig";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  browserExecuteAction,
  chromeBridgeExecuteCommand,
  disconnectBrowserConnectorSession,
  getBrowserConnectorInstallStatus,
  getBrowserConnectorSettings,
  closeChromeProfileSession,
  getBrowserBackendPolicy,
  getBrowserBackendsStatus,
  getChromeBridgeEndpointInfo,
  getChromeBridgeStatus,
  getChromeProfileSessions,
  launchBrowserSession,
  openBrowserExtensionsPage,
  openBrowserRemoteDebuggingPage,
  openBrowserRuntimeDebuggerWindow,
  openChromeProfileWindow,
  setBrowserActionCapabilityEnabled,
  setBrowserConnectorEnabled,
  setBrowserBackendPolicy,
  setSystemConnectorEnabled,
  type BrowserActionCapabilitySnapshot,
  type BrowserConnectorInstallStatus,
  type BrowserConnectorSettingsSnapshot,
  type BrowserBackendPolicy,
  type BrowserBackendsStatusSnapshot,
  type BrowserBackendStatusItem,
  type BrowserBackendType,
  type ChromeBridgeEndpointInfo,
  type ChromeBridgeStatusSnapshot,
  type ChromeProfileSessionInfo,
  type SystemConnectorSnapshot,
} from "@/lib/webview-api";
import {
  openBrowserConnectorGuideWindow,
  type BrowserConnectorGuideMode,
} from "./guide-window-launcher";

type SearchEngine = "google" | "xiaohongshu";
type RelayPrimaryTab = "core" | "advanced";
type RelaySectionTab = "overview" | "profile" | "bridge" | "backend" | "debug";

interface SurfacePanelProps {
  icon: LucideIcon;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}

interface EngineDefinition {
  id: SearchEngine;
  settingsUrl: string;
  assistUrl: string;
  bridgeTestUrl: string;
  backendTestUrl: string;
  profileKey: string;
}

const SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";
const SELECT_CLASS_NAME =
  "h-11 w-full rounded-[16px] border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 sm:w-auto";
const SECTION_TABS_CLASS_NAME =
  "flex h-auto w-full flex-wrap justify-start gap-2 rounded-[20px] border border-slate-200/80 bg-slate-100/90 p-2 shadow-sm shadow-slate-950/5";
const SECTION_TAB_TRIGGER_CLASS_NAME =
  "rounded-full border px-4 py-2 text-sm font-medium";
const SECTION_TAB_BADGE_CLASS_NAME =
  "inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold";
const ACTIVE_TAB_TRIGGER_CLASS_NAME =
  "border-emerald-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,253,245,0.96)_52%,rgba(224,242,254,0.95)_100%)] text-slate-800 shadow-sm shadow-emerald-950/10";
const REMOTE_DEBUGGING_URL = "chrome://inspect/#remote-debugging";

const BrowserRuntimeDebugPanel = lazy(() =>
  import("@/features/browser-runtime").then((module) => ({
    default: module.BrowserRuntimeDebugPanel,
  })),
);

const ENGINE_ORDER: SearchEngine[] = ["google", "xiaohongshu"];
const ENGINE_DEFINITIONS: Record<SearchEngine, EngineDefinition> = {
  google: {
    id: "google",
    settingsUrl: "https://www.google.com/preferences?hl=zh-CN",
    assistUrl: "https://www.google.com/search?q=lime+browser+assist",
    bridgeTestUrl: "https://www.google.com/search?q=lime",
    backendTestUrl: "https://www.google.com/search?q=lime+browser+backend",
    profileKey: "search_google",
  },
  xiaohongshu: {
    id: "xiaohongshu",
    settingsUrl: "https://www.xiaohongshu.com/explore",
    assistUrl: "https://www.xiaohongshu.com/explore",
    bridgeTestUrl: "https://www.xiaohongshu.com/explore",
    backendTestUrl: "https://www.xiaohongshu.com/explore",
    profileKey: "search_xiaohongshu",
  },
};

const BACKEND_OPTIONS: BrowserBackendType[] = [
  "aster_compat",
  "lime_extension_bridge",
  "cdp_direct",
];

function createPolicyKey(policy: BrowserBackendPolicy | null) {
  if (!policy) {
    return "";
  }
  return `${policy.auto_fallback}:${policy.priority.join(",")}`;
}

function normalizePriority(priority: BrowserBackendType[]) {
  const merged: BrowserBackendType[] = [];
  for (const backend of priority) {
    if (BACKEND_OPTIONS.includes(backend) && !merged.includes(backend)) {
      merged.push(backend);
    }
  }

  for (const backend of BACKEND_OPTIONS) {
    if (!merged.includes(backend)) {
      merged.push(backend);
    }
  }

  return merged.slice(0, BACKEND_OPTIONS.length);
}

function SurfacePanel({
  icon: Icon,
  title,
  description,
  aside,
  children,
}: SurfacePanelProps) {
  return (
    <article className="min-w-0 rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Icon className="h-4 w-4 text-sky-600" />
            {title}
            <WorkbenchInfoTip
              ariaLabel={title}
              content={description}
              tone="slate"
            />
          </div>
        </div>
        {aside ? (
          <div className="flex flex-wrap items-center gap-2">{aside}</div>
        ) : null}
      </div>

      <div className="mt-5 min-w-0">{children}</div>
    </article>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium",
        tone === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "neutral" && "border-slate-200 bg-white text-slate-500",
      )}
    >
      {children}
    </span>
  );
}

function DeferredPanelFallback({ message }: { message: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm leading-6 text-slate-500">
      {message}
    </div>
  );
}

function getRelayErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resolveBackendTone(item?: BrowserBackendStatusItem | null) {
  if (!item) {
    return "neutral" as const;
  }
  return item.available ? ("success" as const) : ("warning" as const);
}

function getSystemConnectorStatusTone(
  connector: Pick<
    SystemConnectorSnapshot,
    "available" | "authorization_status"
  >,
) {
  if (!connector.available) {
    return "neutral" as const;
  }
  if (connector.authorization_status === "authorized") {
    return "success" as const;
  }
  return "warning" as const;
}

export function ChromeRelaySettings() {
  const { t } = useTranslation("settings");
  const [activeEngine, setActiveEngine] = useState<SearchEngine>("google");
  const [activePrimaryTab, setActivePrimaryTab] =
    useState<RelayPrimaryTab>("core");
  const [activeSectionTab, setActiveSectionTab] =
    useState<RelaySectionTab>("overview");
  const [openingEngine, setOpeningEngine] = useState<SearchEngine | null>(null);
  const [closingProfileKey, setClosingProfileKey] = useState<string | null>(
    null,
  );
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [refreshingBridge, setRefreshingBridge] = useState(false);
  const [refreshingBackends, setRefreshingBackends] = useState(false);
  const [savingBackendPolicy, setSavingBackendPolicy] = useState(false);
  const [testingBackend, setTestingBackend] =
    useState<BrowserBackendType | null>(null);
  const [testingBridgeEngine, setTestingBridgeEngine] =
    useState<SearchEngine | null>(null);
  const [launchingAssist, setLaunchingAssist] = useState(false);
  const [openingDebugger, setOpeningDebugger] = useState(false);
  const [openingGuideMode, setOpeningGuideMode] =
    useState<BrowserConnectorGuideMode | null>(null);
  const [sessions, setSessions] = useState<ChromeProfileSessionInfo[]>([]);
  const [bridgeEndpoint, setBridgeEndpoint] =
    useState<ChromeBridgeEndpointInfo | null>(null);
  const [bridgeStatus, setBridgeStatus] =
    useState<ChromeBridgeStatusSnapshot | null>(null);
  const [backendPolicy, setBackendPolicy] =
    useState<BrowserBackendPolicy | null>(null);
  const [draftBackendPolicy, setDraftBackendPolicy] =
    useState<BrowserBackendPolicy | null>(null);
  const [backendsStatus, setBackendsStatus] =
    useState<BrowserBackendsStatusSnapshot | null>(null);
  const [runtimeSessionId, setRuntimeSessionId] = useState<string | null>(null);
  const [browserConnectorSettings, setBrowserConnectorSettings] =
    useState<BrowserConnectorSettingsSnapshot | null>(null);
  const [browserConnectorInstallStatus, setBrowserConnectorInstallStatus] =
    useState<BrowserConnectorInstallStatus | null>(null);
  const [refreshingConnectorSettings, setRefreshingConnectorSettings] =
    useState(false);
  const [
    refreshingConnectorInstallStatus,
    setRefreshingConnectorInstallStatus,
  ] = useState(false);
  const [savingConnectorEnabled, setSavingConnectorEnabled] = useState(false);
  const [openingExtensionsPage, setOpeningExtensionsPage] = useState(false);
  const [openingRemoteDebuggingPage, setOpeningRemoteDebuggingPage] =
    useState(false);
  const [disconnectingConnector, setDisconnectingConnector] = useState(false);
  const [updatingSystemConnectorId, setUpdatingSystemConnectorId] = useState<
    string | null
  >(null);
  const [
    updatingBrowserActionCapabilityKey,
    setUpdatingBrowserActionCapabilityKey,
  ] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const backendPolicyRef = useRef<BrowserBackendPolicy | null>(null);
  const draftBackendPolicyRef = useRef<BrowserBackendPolicy | null>(null);
  const messageTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    backendPolicyRef.current = backendPolicy;
  }, [backendPolicy]);

  useEffect(() => {
    draftBackendPolicyRef.current = draftBackendPolicy;
  }, [draftBackendPolicy]);

  const pushMessage = useCallback(
    (
      nextMessage: { type: "success" | "error"; text: string },
      timeout = 2500,
    ) => {
      if (messageTimeoutRef.current !== null) {
        window.clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = null;
      }
      setMessage(nextMessage);
      if (timeout > 0) {
        messageTimeoutRef.current = window.setTimeout(() => {
          messageTimeoutRef.current = null;
          setMessage(null);
        }, timeout);
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current !== null) {
        window.clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = null;
      }
    };
  }, []);

  const refreshConnectorSettings = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setRefreshingConnectorSettings(true);
      }
      try {
        const next = await getBrowserConnectorSettings();
        setBrowserConnectorSettings(next);
      } catch (error) {
        if (!silent) {
          pushMessage({
            type: "error",
            text: t(
              "settings.chromeRelay.main.message.refreshConnectorSettingsFailed",
              {
                message: getRelayErrorMessage(error),
              },
            ),
          });
        }
      } finally {
        if (!silent) {
          setRefreshingConnectorSettings(false);
        }
      }
    },
    [pushMessage, t],
  );

  const refreshConnectorInstallStatus = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setRefreshingConnectorInstallStatus(true);
      }
      try {
        const next = await getBrowserConnectorInstallStatus();
        setBrowserConnectorInstallStatus(next);
      } catch (error) {
        if (!silent) {
          pushMessage({
            type: "error",
            text: t(
              "settings.chromeRelay.main.message.refreshInstallStatusFailed",
              {
                message: getRelayErrorMessage(error),
              },
            ),
          });
        }
      } finally {
        if (!silent) {
          setRefreshingConnectorInstallStatus(false);
        }
      }
    },
    [pushMessage, t],
  );

  const refreshSessions = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setRefreshingSessions(true);
      }
      try {
        const next = await getChromeProfileSessions();
        setSessions(next);
      } catch (error) {
        if (!silent) {
          pushMessage({
            type: "error",
            text: t("settings.chromeRelay.main.message.refreshSessionsFailed", {
              message: getRelayErrorMessage(error),
            }),
          });
        }
      } finally {
        if (!silent) {
          setRefreshingSessions(false);
        }
      }
    },
    [pushMessage, t],
  );

  const refreshBridgeStatus = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setRefreshingBridge(true);
      }
      try {
        const [endpoint, status] = await Promise.all([
          getChromeBridgeEndpointInfo(),
          getChromeBridgeStatus(),
        ]);
        setBridgeEndpoint(endpoint);
        setBridgeStatus(status);
      } catch (error) {
        if (!silent) {
          pushMessage({
            type: "error",
            text: t("settings.chromeRelay.main.message.refreshBridgeFailed", {
              message: getRelayErrorMessage(error),
            }),
          });
        }
      } finally {
        if (!silent) {
          setRefreshingBridge(false);
        }
      }
    },
    [pushMessage, t],
  );

  const refreshBackendStatus = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setRefreshingBackends(true);
      }
      try {
        const [policy, status] = await Promise.all([
          getBrowserBackendPolicy(),
          getBrowserBackendsStatus(),
        ]);
        const normalizedPolicy: BrowserBackendPolicy = {
          auto_fallback: policy.auto_fallback,
          priority: normalizePriority(policy.priority),
        };
        const shouldSyncDraft =
          !draftBackendPolicyRef.current ||
          !backendPolicyRef.current ||
          createPolicyKey(draftBackendPolicyRef.current) ===
            createPolicyKey(backendPolicyRef.current);

        setBackendPolicy(normalizedPolicy);
        backendPolicyRef.current = normalizedPolicy;
        if (shouldSyncDraft) {
          setDraftBackendPolicy(normalizedPolicy);
          draftBackendPolicyRef.current = normalizedPolicy;
        }
        setBackendsStatus(status);
      } catch (error) {
        if (!silent) {
          pushMessage({
            type: "error",
            text: t("settings.chromeRelay.main.message.refreshBackendFailed", {
              message: getRelayErrorMessage(error),
            }),
          });
        }
      } finally {
        if (!silent) {
          setRefreshingBackends(false);
        }
      }
    },
    [pushMessage, t],
  );

  const refreshAll = useCallback(
    async (silent: boolean) => {
      await Promise.all([
        refreshConnectorSettings(silent),
        refreshConnectorInstallStatus(silent),
        refreshSessions(silent),
        refreshBridgeStatus(silent),
        refreshBackendStatus(silent),
      ]);
    },
    [
      refreshBackendStatus,
      refreshBridgeStatus,
      refreshConnectorInstallStatus,
      refreshConnectorSettings,
      refreshSessions,
    ],
  );

  useEffect(() => {
    void getConfig()
      .then((config) => {
        const nextEngine = config.web_search?.engine;
        if (
          nextEngine === ENGINE_DEFINITIONS.google.id ||
          nextEngine === ENGINE_DEFINITIONS.xiaohongshu.id
        ) {
          setActiveEngine(nextEngine);
        }
      })
      .catch(() => {
        // ignore
      });

    void refreshAll(true);
    const timer = window.setInterval(() => {
      void refreshAll(true);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const selectedEngine = ENGINE_DEFINITIONS[activeEngine];
  const getEngineLabel = useCallback(
    (engine: SearchEngine) =>
      engine === "google"
        ? t("settings.chromeRelay.main.engine.google.label")
        : t("settings.chromeRelay.main.engine.xiaohongshu.label"),
    [t],
  );
  const selectedEngineLabel = getEngineLabel(activeEngine);
  const sessionsByProfile = useMemo(
    () => new Map(sessions.map((session) => [session.profile_key, session])),
    [sessions],
  );
  const observersByProfile = useMemo(
    () =>
      new Map(
        (bridgeStatus?.observers ?? []).map((observer) => [
          observer.profile_key,
          observer,
        ]),
      ),
    [bridgeStatus?.observers],
  );
  const selectedSession =
    sessionsByProfile.get(selectedEngine.profileKey) ?? null;
  const hasObserverConnected =
    Math.max(
      bridgeStatus?.observer_count ?? 0,
      backendsStatus?.bridge_observer_count ?? 0,
    ) > 0;
  const hasBackendPolicyChanges =
    createPolicyKey(backendPolicy) !== createPolicyKey(draftBackendPolicy);
  const backendStatusList =
    backendsStatus?.backends ??
    BACKEND_OPTIONS.map((backend) => ({
      backend,
      available: false,
      reason: t(
        "settings.chromeRelay.main.backendPolicy.availability.status.pendingCheck",
      ),
      capabilities: [],
    }));

  const openSearchSettingsWindow = useCallback(
    async (engine: SearchEngine) => {
      const target = ENGINE_DEFINITIONS[engine];
      const targetLabel = getEngineLabel(engine);
      try {
        setOpeningEngine(engine);
        const result = await openChromeProfileWindow({
          profile_key: target.profileKey,
          url: target.settingsUrl,
        });
        if (!result.success) {
          throw new Error(
            result.error ||
              t("settings.chromeRelay.main.message.createWindowFailed"),
          );
        }
        pushMessage({
          type: "success",
          text: result.reused
            ? t("settings.chromeRelay.main.message.sessionReused", {
                label: targetLabel,
                pid: result.pid ?? "-",
              })
            : t("settings.chromeRelay.main.message.sessionStarted", {
                label: targetLabel,
                pid: result.pid ?? "-",
              }),
        });
        await refreshSessions(true);
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.openSettingsFailed", {
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setOpeningEngine(null);
      }
    },
    [getEngineLabel, pushMessage, refreshSessions, t],
  );

  const closeSession = useCallback(
    async (engine: SearchEngine) => {
      const target = ENGINE_DEFINITIONS[engine];
      setClosingProfileKey(target.profileKey);
      try {
        const closed = await closeChromeProfileSession(target.profileKey);
        pushMessage({
          type: closed ? "success" : "error",
          text: closed
            ? t("settings.chromeRelay.main.message.sessionClosed")
            : t("settings.chromeRelay.main.message.sessionNotFound"),
        });
        await refreshSessions(true);
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.closeSessionFailed", {
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setClosingProfileKey(null);
      }
    },
    [pushMessage, refreshSessions, t],
  );

  const handleLaunchBrowserAssist = useCallback(async () => {
    try {
      setLaunchingAssist(true);
      const result = await launchBrowserSession({
        profile_key: selectedEngine.profileKey,
        url: selectedEngine.assistUrl,
        open_window: true,
        stream_mode: "both",
      });
      setRuntimeSessionId(result.session.session_id);
      pushMessage({
        type: "success",
        text: t("settings.chromeRelay.main.message.browserAssistStarted", {
          target:
            result.session.target_title ||
            result.session.target_url ||
            selectedEngine.assistUrl,
        }),
      });
      await refreshAll(true);
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.launchAssistFailed", {
          message: getRelayErrorMessage(error),
        }),
      });
    } finally {
      setLaunchingAssist(false);
    }
  }, [pushMessage, refreshAll, selectedEngine, t]);

  const handleOpenDebuggerWindow = useCallback(async () => {
    try {
      setOpeningDebugger(true);
      await openBrowserRuntimeDebuggerWindow(
        runtimeSessionId
          ? { session_id: runtimeSessionId }
          : { profile_key: selectedEngine.profileKey },
      );
      pushMessage({
        type: "success",
        text: t("settings.chromeRelay.main.message.debugWindowOpened"),
      });
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.openDebugWindowFailed", {
          message: getRelayErrorMessage(error),
        }),
      });
    } finally {
      setOpeningDebugger(false);
    }
  }, [pushMessage, runtimeSessionId, selectedEngine.profileKey, t]);

  const handleOpenConnectorGuide = useCallback(
    async (mode: BrowserConnectorGuideMode) => {
      try {
        setOpeningGuideMode(mode);
        await openBrowserConnectorGuideWindow({ mode });
        pushMessage({
          type: "success",
          text:
            mode === "extension"
              ? t("settings.chromeRelay.main.message.extensionGuideOpened")
              : t("settings.chromeRelay.main.message.cdpGuideOpened"),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.openGuideFailed", {
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setOpeningGuideMode(null);
      }
    },
    [pushMessage, t],
  );

  const handleSetConnectorEnabled = useCallback(
    async (checked: boolean) => {
      try {
        setSavingConnectorEnabled(true);
        const next = await setBrowserConnectorEnabled(checked);
        setBrowserConnectorSettings(next);
        await refreshConnectorInstallStatus(true);
        pushMessage({
          type: "success",
          text: checked
            ? t("settings.chromeRelay.main.message.connectorEnabled")
            : t("settings.chromeRelay.main.message.connectorDisabled"),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.updateConnectorFailed", {
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setSavingConnectorEnabled(false);
      }
    },
    [pushMessage, refreshConnectorInstallStatus, t],
  );

  const handleOpenBrowserExtensionsPage = useCallback(async () => {
    try {
      setOpeningExtensionsPage(true);
      await openBrowserExtensionsPage();
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.openExtensionsFailed", {
          message: getRelayErrorMessage(error),
        }),
      });
    } finally {
      setOpeningExtensionsPage(false);
    }
  }, [pushMessage, t]);

  const copyPlainText = useCallback(
    async (text: string, label: string) => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error(
            t("settings.chromeRelay.main.message.clipboardUnsupported"),
          );
        }
        await navigator.clipboard.writeText(text);
        pushMessage({
          type: "success",
          text: t("settings.chromeRelay.main.message.copySuccess", { label }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.copyFailed", {
            label,
            message: getRelayErrorMessage(error),
          }),
        });
      }
    },
    [pushMessage, t],
  );

  const handleOpenRemoteDebuggingPage = useCallback(async () => {
    try {
      setOpeningRemoteDebuggingPage(true);
      await openBrowserRemoteDebuggingPage();
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.openRemoteFailed", {
          message: getRelayErrorMessage(error),
        }),
      });
    } finally {
      setOpeningRemoteDebuggingPage(false);
    }
  }, [pushMessage, t]);

  const handleDisconnectBrowserConnector = useCallback(async () => {
    try {
      setDisconnectingConnector(true);
      const result = await disconnectBrowserConnectorSession();
      setBridgeStatus(result.status);
      pushMessage({
        type: "success",
        text:
          result.disconnected_observer_count > 0 ||
          result.disconnected_control_count > 0
            ? t("settings.chromeRelay.main.message.connectorDisconnected", {
                observerCount: result.disconnected_observer_count,
                controlCount: result.disconnected_control_count,
              })
            : t("settings.chromeRelay.main.message.noConnectorToDisconnect"),
      });
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.disconnectFailed", {
          message: getRelayErrorMessage(error),
        }),
      });
    } finally {
      setDisconnectingConnector(false);
    }
  }, [pushMessage, t]);

  const handleSetSystemConnectorEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        setUpdatingSystemConnectorId(id);
        const next = await setSystemConnectorEnabled({ id, enabled });
        setBrowserConnectorSettings(next);
        const updatedConnector = next.system_connectors.find(
          (connector) => connector.id === id,
        );
        if (!updatedConnector) {
          return;
        }
        if (!enabled) {
          pushMessage({
            type: "success",
            text: t("settings.chromeRelay.main.message.systemConnectorClosed", {
              label: updatedConnector.label,
            }),
          });
          return;
        }
        if (
          updatedConnector.enabled &&
          updatedConnector.authorization_status === "authorized"
        ) {
          pushMessage({
            type: "success",
            text: t(
              "settings.chromeRelay.main.message.systemConnectorAuthorized",
              {
                label: updatedConnector.label,
              },
            ),
          });
          return;
        }
        pushMessage({
          type: "error",
          text:
            updatedConnector.last_error ||
            t("settings.chromeRelay.main.message.systemConnectorUnauthorized", {
              label: updatedConnector.label,
            }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t(
            "settings.chromeRelay.main.message.updateSystemConnectorFailed",
            {
              message: getRelayErrorMessage(error),
            },
          ),
        });
      } finally {
        setUpdatingSystemConnectorId(null);
      }
    },
    [pushMessage, t],
  );

  const handleSetBrowserActionCapabilityEnabled = useCallback(
    async (key: string, enabled: boolean) => {
      try {
        setUpdatingBrowserActionCapabilityKey(key);
        const next = await setBrowserActionCapabilityEnabled({ key, enabled });
        setBrowserConnectorSettings(next);
        await refreshBackendStatus(true);
        const updatedCapability = next.browser_action_capabilities?.find(
          (capability) => capability.key === key,
        );
        pushMessage({
          type: "success",
          text: updatedCapability
            ? t("settings.chromeRelay.main.message.actionCapabilityUpdated", {
                label: updatedCapability.label,
                state: enabled
                  ? t("settings.chromeRelay.main.status.enabled")
                  : t("settings.chromeRelay.main.status.disabled"),
              })
            : t("settings.chromeRelay.main.message.browserActionUpdated", {
                state: enabled
                  ? t("settings.chromeRelay.main.status.enabled")
                  : t("settings.chromeRelay.main.status.disabled"),
              }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.updateActionFailed", {
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setUpdatingBrowserActionCapabilityKey(null);
      }
    },
    [pushMessage, refreshBackendStatus, t],
  );

  const copyBridgeConfig = useCallback(
    async (profileKey: string, label: string) => {
      if (!bridgeEndpoint) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.bridgeEndpointMissing"),
        });
        return;
      }

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error(
            t("settings.chromeRelay.main.message.clipboardUnsupported"),
          );
        }
        await navigator.clipboard.writeText(
          JSON.stringify(
            {
              serverUrl: `ws://${bridgeEndpoint.host}:${bridgeEndpoint.port}`,
              bridgeKey: bridgeEndpoint.bridge_key,
              profileKey,
            },
            null,
            2,
          ),
        );
        pushMessage({
          type: "success",
          text: t("settings.chromeRelay.main.message.copyConfigSuccess", {
            label,
          }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.copyConfigFailed", {
            message: getRelayErrorMessage(error),
          }),
        });
      }
    },
    [bridgeEndpoint, pushMessage, t],
  );

  const testBridgeCommand = useCallback(
    async (engine: SearchEngine) => {
      if (!bridgeEndpoint?.server_running) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.bridgeServiceNotRunning"),
        });
        return;
      }
      if (!hasObserverConnected) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.bridgeObserverMissing"),
        });
        return;
      }

      const target = ENGINE_DEFINITIONS[engine];
      try {
        setTestingBridgeEngine(engine);
        const result = await chromeBridgeExecuteCommand({
          profile_key: target.profileKey,
          command: "open_url",
          url: target.bridgeTestUrl,
          wait_for_page_info: true,
          timeout_ms: 45000,
        });
        if (!result.success) {
          throw new Error(
            result.error ||
              t("settings.chromeRelay.main.message.commandExecutionFailed"),
          );
        }
        pushMessage({
          type: "success",
          text: t("settings.chromeRelay.main.message.bridgeTestSuccess", {
            target:
              result.page_info?.title ||
              t("settings.chromeRelay.main.message.bridgeTestFallback"),
          }),
        });
        await refreshBridgeStatus(true);
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.bridgeTestFailed", {
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setTestingBridgeEngine(null);
      }
    },
    [
      bridgeEndpoint?.server_running,
      hasObserverConnected,
      pushMessage,
      refreshBridgeStatus,
      t,
    ],
  );

  const updateBackendPriority = useCallback(
    (index: number, backend: BrowserBackendType) => {
      setDraftBackendPolicy((prev) => {
        if (!prev) {
          return prev;
        }
        const next = [...prev.priority];
        next[index] = backend;
        return {
          ...prev,
          priority: normalizePriority(next),
        };
      });
    },
    [],
  );

  const getBackendLabel = useCallback(
    (backend: BrowserBackendType) => {
      switch (backend) {
        case "aster_compat":
          return t("settings.chromeRelay.main.backend.asterCompat.label");
        case "lime_extension_bridge":
          return t("settings.chromeRelay.main.backend.extensionBridge.label");
        case "cdp_direct":
          return t("settings.chromeRelay.main.backend.cdpDirect.label");
      }
    },
    [t],
  );
  const getBackendDescription = useCallback(
    (backend: BrowserBackendType) => {
      switch (backend) {
        case "aster_compat":
          return t("settings.chromeRelay.main.backend.asterCompat.description");
        case "lime_extension_bridge":
          return t(
            "settings.chromeRelay.main.backend.extensionBridge.description",
          );
        case "cdp_direct":
          return t("settings.chromeRelay.main.backend.cdpDirect.description");
      }
    },
    [t],
  );
  const saveBackendPolicy = useCallback(async () => {
    if (!draftBackendPolicy) {
      return;
    }

    setSavingBackendPolicy(true);
    try {
      const normalizedPolicy: BrowserBackendPolicy = {
        auto_fallback: draftBackendPolicy.auto_fallback,
        priority: normalizePriority(draftBackendPolicy.priority),
      };
      const saved = await setBrowserBackendPolicy(normalizedPolicy);
      const finalPolicy = {
        auto_fallback: saved.auto_fallback,
        priority: normalizePriority(saved.priority),
      };
      setBackendPolicy(finalPolicy);
      setDraftBackendPolicy(finalPolicy);
      pushMessage({
        type: "success",
        text: t("settings.chromeRelay.main.message.backendPolicySaved"),
      });
      await refreshBackendStatus(true);
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.saveBackendPolicyFailed", {
          message: getRelayErrorMessage(error),
        }),
      });
    } finally {
      setSavingBackendPolicy(false);
    }
  }, [draftBackendPolicy, pushMessage, refreshBackendStatus, t]);

  const testBackendAction = useCallback(
    async (backend: BrowserBackendType) => {
      const backendStatus = backendsStatus?.backends.find(
        (item) => item.backend === backend,
      );
      if (backendStatus && !backendStatus.available) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.backendUnavailable", {
            label: getBackendLabel(backend),
            reason:
              backendStatus.reason ||
              t("settings.chromeRelay.main.message.backendUnavailableFallback"),
          }),
        });
        return;
      }

      try {
        setTestingBackend(backend);
        const result = await browserExecuteAction({
          backend,
          profile_key: selectedEngine.profileKey,
          action: "navigate",
          args: {
            action: "goto",
            url: selectedEngine.backendTestUrl,
            wait_for_page_info: true,
          },
          timeout_ms: 45000,
        });
        if (!result.success) {
          throw new Error(
            result.error ||
              t("settings.chromeRelay.main.message.backendActionFailed"),
          );
        }
        pushMessage({
          type: "success",
          text: t("settings.chromeRelay.main.message.backendTestSuccess", {
            label: getBackendLabel(backend),
          }),
        });
        await Promise.all([
          refreshBridgeStatus(true),
          refreshBackendStatus(true),
        ]);
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.backendTestFailed", {
            label: getBackendLabel(backend),
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setTestingBackend(null);
      }
    },
    [
      backendsStatus?.backends,
      getBackendLabel,
      pushMessage,
      refreshBackendStatus,
      refreshBridgeStatus,
      selectedEngine,
      t,
    ],
  );

  const runtimeSummary = useMemo(
    () => ({
      runningProfiles: backendsStatus?.running_profile_count ?? 0,
      cdpAliveProfiles: backendsStatus?.cdp_alive_profile_count ?? 0,
      observerCount: Math.max(
        bridgeStatus?.observer_count ?? 0,
        backendsStatus?.bridge_observer_count ?? 0,
      ),
      controlCount: Math.max(
        bridgeStatus?.control_count ?? 0,
        backendsStatus?.bridge_control_count ?? 0,
      ),
      pendingCommands: bridgeStatus?.pending_command_count ?? 0,
    }),
    [backendsStatus, bridgeStatus],
  );
  const browserActionCapabilityGroups = useMemo(() => {
    const items = browserConnectorSettings?.browser_action_capabilities ?? [];
    return {
      read: items.filter((item) => item.group === "read"),
      write: items.filter((item) => item.group === "write"),
    };
  }, [browserConnectorSettings?.browser_action_capabilities]);
  const getEngineDescription = useCallback(
    (engine: SearchEngine) =>
      engine === "google"
        ? t("settings.chromeRelay.main.engine.google.description")
        : t("settings.chromeRelay.main.engine.xiaohongshu.description"),
    [t],
  );
  const getEngineSettingsButtonLabel = useCallback(
    (engine: SearchEngine) =>
      engine === "google"
        ? t("settings.chromeRelay.main.engine.google.settingsButton")
        : t("settings.chromeRelay.main.engine.xiaohongshu.settingsButton"),
    [t],
  );
  const renderProfilePanel = (keyPrefix = "") => (
    <SurfacePanel
      icon={Globe}
      title={t("settings.chromeRelay.main.profile.title")}
      description={t("settings.chromeRelay.main.profile.description")}
      aside={
        <StatusPill tone={selectedSession ? "success" : "neutral"}>
          {t("settings.chromeRelay.main.profile.currentEngine", {
            label: selectedEngineLabel,
          })}
        </StatusPill>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {ENGINE_ORDER.map((engine) => {
          const target = ENGINE_DEFINITIONS[engine];
          const targetLabel = getEngineLabel(engine);
          const session = sessionsByProfile.get(target.profileKey) ?? null;

          return (
            <div
              key={`${keyPrefix}${engine}`}
              className="flex h-full flex-col justify-between gap-5 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.92)_100%)] p-5"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-slate-900">
                      {targetLabel}
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      {getEngineDescription(engine)}
                    </p>
                  </div>
                  <StatusPill tone={session ? "success" : "warning"}>
                    {session
                      ? t("settings.chromeRelay.main.profile.status.running")
                      : t("settings.chromeRelay.main.profile.status.pending")}
                  </StatusPill>
                </div>

                {session ? (
                  <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-200/80 bg-white/90 p-3">
                      <p className="text-xs font-medium text-slate-500">
                        {t(
                          "settings.chromeRelay.main.profile.field.processSource",
                        )}
                      </p>
                      <p className="mt-2 font-medium text-slate-900">
                        PID {session.pid}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {session.browser_source}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200/80 bg-white/90 p-3">
                      <p className="text-xs font-medium text-slate-500">
                        {t("settings.chromeRelay.main.profile.field.debugPort")}
                      </p>
                      <p className="mt-2 font-medium text-slate-900">
                        {session.remote_debugging_port}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Profile {session.profile_key}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200/80 bg-white/90 p-3 sm:col-span-2">
                      <p className="text-xs font-medium text-slate-500">
                        {t("settings.chromeRelay.main.profile.field.lastPage")}
                      </p>
                      <p className="mt-2 break-all text-sm text-slate-700">
                        {session.last_url}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-500">
                    {t("settings.chromeRelay.main.profile.empty")}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openSearchSettingsWindow(engine)}
                  disabled={openingEngine === engine}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  <ExternalLink className="h-4 w-4" />
                  {openingEngine === engine
                    ? t("settings.chromeRelay.main.action.opening")
                    : getEngineSettingsButtonLabel(engine)}
                </button>
                <button
                  type="button"
                  onClick={() => void closeSession(engine)}
                  disabled={!session || closingProfileKey === target.profileKey}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  {closingProfileKey === target.profileKey
                    ? t("settings.chromeRelay.main.action.closing")
                    : t("settings.chromeRelay.main.action.closeSession")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </SurfacePanel>
  );

  const renderBackendPanel = () => (
    <SurfacePanel
      icon={Layers3}
      title={t("settings.chromeRelay.main.backendPolicy.title")}
      description={t("settings.chromeRelay.main.backendPolicy.description")}
    >
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.chromeRelay.main.backendPolicy.target.title")}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.target.description",
                  )}
                </p>
              </div>
              <select
                value={activeEngine}
                onChange={(event) =>
                  setActiveEngine(event.target.value as SearchEngine)
                }
                className={cn(SELECT_CLASS_NAME, "sm:min-w-[180px]")}
              >
                {ENGINE_ORDER.map((engine) => (
                  <option key={`relay-engine-${engine}`} value={engine}>
                    {getEngineLabel(engine)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-slate-200/80 bg-white/85 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.autoFallback.title",
                  )}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.autoFallback.description",
                  )}
                </p>
              </div>
              <Switch
                aria-label={t(
                  "settings.chromeRelay.main.backendPolicy.autoFallback.aria",
                )}
                checked={draftBackendPolicy?.auto_fallback ?? true}
                onCheckedChange={(checked) =>
                  setDraftBackendPolicy((prev) =>
                    prev
                      ? {
                          ...prev,
                          auto_fallback: checked,
                        }
                      : prev,
                  )
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            {[0, 1, 2].map((index) => {
              const selectedBackend =
                draftBackendPolicy?.priority[index] || BACKEND_OPTIONS[index];
              return (
                <div
                  key={`backend-priority-${index}`}
                  className="rounded-[22px] border border-slate-200/80 bg-white p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {t(
                          "settings.chromeRelay.main.backendPolicy.priority.label",
                          {
                            index: index + 1,
                          },
                        )}
                      </p>
                      <p className="text-sm leading-6 text-slate-500">
                        {getBackendDescription(selectedBackend)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        value={selectedBackend}
                        onChange={(event) =>
                          updateBackendPriority(
                            index,
                            event.target.value as BrowserBackendType,
                          )
                        }
                        className={cn(SELECT_CLASS_NAME, "sm:min-w-[220px]")}
                      >
                        {BACKEND_OPTIONS.map((option) => (
                          <option
                            key={`backend-option-${index}-${option}`}
                            value={option}
                          >
                            {getBackendLabel(option)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void testBackendAction(selectedBackend)}
                        disabled={testingBackend === selectedBackend}
                        className={SECONDARY_BUTTON_CLASS_NAME}
                      >
                        {testingBackend === selectedBackend
                          ? t(
                              "settings.chromeRelay.main.backendPolicy.action.testing",
                            )
                          : t(
                              "settings.chromeRelay.main.backendPolicy.action.test",
                            )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {t("settings.chromeRelay.main.backendPolicy.availability.title")}
            </p>
            <p className="text-sm leading-6 text-slate-500">
              {t(
                "settings.chromeRelay.main.backendPolicy.availability.description",
              )}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {backendStatusList.map((item) => (
              <div
                key={`backend-status-${item.backend}`}
                className="rounded-[20px] border border-slate-200/80 bg-white/90 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {getBackendLabel(item.backend)}
                  </p>
                  <StatusPill tone={resolveBackendTone(item)}>
                    {item.available
                      ? t(
                          "settings.chromeRelay.main.backendPolicy.availability.status.available",
                        )
                      : item.reason ||
                        t(
                          "settings.chromeRelay.main.backendPolicy.availability.status.pendingCheck",
                        )}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {item.reason || getBackendDescription(item.backend)}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.availability.capabilities",
                    {
                      capabilities:
                        item.capabilities.length > 0
                          ? item.capabilities.join(" / ")
                          : t(
                              "settings.chromeRelay.main.backendPolicy.availability.capabilitiesPending",
                            ),
                    },
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[20px] border border-slate-200/80 bg-white/90 p-4 text-sm leading-6 text-slate-600">
            <p>
              {t(
                "settings.chromeRelay.main.backendPolicy.nativeHost.configuredLabel",
              )}
              :{" "}
              {backendsStatus?.aster_native_host_configured
                ? t(
                    "settings.chromeRelay.main.backendPolicy.nativeHost.configured",
                  )
                : t(
                    "settings.chromeRelay.main.backendPolicy.nativeHost.unconfigured",
                  )}
            </p>
            <p>
              {t(
                "settings.chromeRelay.main.backendPolicy.nativeHost.platformSupportedLabel",
              )}
              :{" "}
              {backendsStatus?.aster_native_host_supported
                ? t("settings.chromeRelay.main.backendPolicy.nativeHost.yes")
                : t("settings.chromeRelay.main.backendPolicy.nativeHost.no")}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveBackendPolicy()}
              disabled={!hasBackendPolicyChanges || savingBackendPolicy}
              className={PRIMARY_BUTTON_CLASS_NAME}
            >
              {savingBackendPolicy
                ? t("settings.chromeRelay.main.backendPolicy.action.saving")
                : t("settings.chromeRelay.main.backendPolicy.action.save")}
            </button>
            <button
              type="button"
              onClick={() => void refreshBackendStatus(false)}
              disabled={refreshingBackends}
              className={SECONDARY_BUTTON_CLASS_NAME}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  refreshingBackends ? "animate-spin" : "",
                )}
              />
              {t("settings.chromeRelay.main.backendPolicy.action.refresh")}
            </button>
          </div>
        </div>
      </div>
    </SurfacePanel>
  );

  const renderBridgePanel = () => (
    <SurfacePanel
      icon={Sparkles}
      title={t("settings.chromeRelay.main.bridge.title")}
      description={t("settings.chromeRelay.main.bridge.description")}
      aside={
        <StatusPill
          tone={bridgeEndpoint?.server_running ? "success" : "warning"}
        >
          {bridgeEndpoint?.server_running
            ? t("settings.chromeRelay.main.bridge.status.serviceRunning")
            : t("settings.chromeRelay.main.bridge.status.serviceStopped")}
        </StatusPill>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            Observer：{runtimeSummary.observerCount}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            Control：{runtimeSummary.controlCount}
          </span>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              hasObserverConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700",
            )}
          >
            {hasObserverConnected
              ? t("settings.chromeRelay.main.bridge.status.observerConnected")
              : t("settings.chromeRelay.main.bridge.status.observerPending")}
          </span>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {t("settings.chromeRelay.main.bridge.access.title")}
            </p>
            <p className="text-sm leading-6 text-slate-500">
              {t("settings.chromeRelay.main.bridge.access.description")}
            </p>
          </div>

          {bridgeEndpoint ? (
            <div className="mt-4 rounded-[20px] border border-slate-200/80 bg-white/90 p-4">
              <div className="space-y-2 text-sm text-slate-600">
                <p className="break-all">
                  Observer WS: {bridgeEndpoint.observer_ws_url}
                </p>
                <p className="break-all">
                  Control WS: {bridgeEndpoint.control_ws_url}
                </p>
                <p className="break-all">
                  Bridge Key: {bridgeEndpoint.bridge_key}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {ENGINE_ORDER.map((engine) => {
                  const engineLabel = getEngineLabel(engine);

                  return (
                    <button
                      key={`copy-config-${engine}`}
                      type="button"
                      onClick={() =>
                        void copyBridgeConfig(
                          ENGINE_DEFINITIONS[engine].profileKey,
                          engineLabel,
                        )
                      }
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      <Copy className="h-4 w-4" />
                      {t("settings.chromeRelay.main.bridge.action.copyConfig", {
                        label: engineLabel,
                      })}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] border border-dashed border-slate-200 bg-white/70 p-4 text-sm leading-6 text-slate-500">
              {t("settings.chromeRelay.main.bridge.endpointMissing")}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {ENGINE_ORDER.map((engine) => {
            const engineLabel = getEngineLabel(engine);
            const observer =
              observersByProfile.get(ENGINE_DEFINITIONS[engine].profileKey) ??
              null;
            return (
              <div
                key={`observer-status-${engine}`}
                className="rounded-[20px] border border-slate-200/80 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("settings.chromeRelay.main.bridge.observer.title", {
                      label: engineLabel,
                    })}
                  </p>
                  <StatusPill tone={observer ? "success" : "warning"}>
                    {observer
                      ? observer.client_id
                      : t(
                          "settings.chromeRelay.main.bridge.observer.notConnected",
                        )}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {observer?.last_page_info?.title
                    ? t("settings.chromeRelay.main.bridge.observer.lastPage", {
                        title: observer.last_page_info.title,
                      })
                    : t("settings.chromeRelay.main.bridge.observer.noLastPage")}
                </p>
              </div>
            );
          })}
        </div>

        {!hasObserverConnected ? (
          <div className="rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-800">
            {t("settings.chromeRelay.main.bridge.observerMissingHint")}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {ENGINE_ORDER.map((engine) => (
            <button
              key={`bridge-test-${engine}`}
              type="button"
              onClick={() => void testBridgeCommand(engine)}
              disabled={testingBridgeEngine === engine}
              className={SECONDARY_BUTTON_CLASS_NAME}
            >
              {testingBridgeEngine === engine
                ? t("settings.chromeRelay.main.bridge.action.testing")
                : t("settings.chromeRelay.main.bridge.action.testExtension", {
                    label: getEngineLabel(engine),
                  })}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void refreshBridgeStatus(false)}
            disabled={refreshingBridge}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshingBridge ? "animate-spin" : "")}
            />
            {t("settings.chromeRelay.main.bridge.action.refreshStatus")}
          </button>
        </div>
      </div>
    </SurfacePanel>
  );

  const renderBrowserActionPanel = () => {
    if (
      browserActionCapabilityGroups.read.length === 0 &&
      browserActionCapabilityGroups.write.length === 0
    ) {
      return null;
    }

    return (
      <SurfacePanel
        icon={Layers3}
        title={t("settings.chromeRelay.main.browserAction.title")}
        description={t("settings.chromeRelay.main.browserAction.description")}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            {
              id: "read",
              title: t("settings.chromeRelay.main.browserAction.group.read"),
              items: browserActionCapabilityGroups.read,
            },
            {
              id: "write",
              title: t("settings.chromeRelay.main.browserAction.group.write"),
              items: browserActionCapabilityGroups.write,
            },
          ]
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <div
                key={section.id}
                className="rounded-[20px] border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-xs font-semibold tracking-[0.12em] text-slate-500">
                  {section.title}
                </p>
                <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-[16px] border border-slate-200 bg-white">
                  {section.items.map(
                    (capability: BrowserActionCapabilitySnapshot) => (
                      <div
                        key={capability.key}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {capability.label}
                          </p>
                        </div>
                        <Switch
                          aria-label={t(
                            "settings.chromeRelay.main.browserAction.toggleAria",
                            {
                              label: capability.label,
                            },
                          )}
                          checked={capability.enabled}
                          disabled={
                            updatingBrowserActionCapabilityKey ===
                            capability.key
                          }
                          onCheckedChange={(checked) =>
                            void handleSetBrowserActionCapabilityEnabled(
                              capability.key,
                              checked,
                            )
                          }
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
        </div>
      </SurfacePanel>
    );
  };

  const renderOverviewPanel = () => (
    <SurfacePanel
      icon={Sparkles}
      title={t("settings.chromeRelay.main.overview.title")}
      description={t("settings.chromeRelay.main.overview.description")}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t("settings.chromeRelay.main.overview.profile.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t("settings.chromeRelay.main.overview.profile.description", {
                  label: selectedEngineLabel,
                })}
              </p>
            </div>
            <StatusPill tone={selectedSession ? "success" : "warning"}>
              {selectedSession
                ? t("settings.chromeRelay.main.overview.profile.started")
                : t("settings.chromeRelay.main.overview.profile.pending")}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.overview.profile.runningCount", {
              count: runtimeSummary.runningProfiles,
            })}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("profile")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t("settings.chromeRelay.main.overview.action.viewProfile")}
          </button>
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t("settings.chromeRelay.main.overview.bridge.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t("settings.chromeRelay.main.overview.bridge.description")}
              </p>
            </div>
            <StatusPill tone={hasObserverConnected ? "success" : "warning"}>
              {hasObserverConnected
                ? t("settings.chromeRelay.main.overview.bridge.connected")
                : t("settings.chromeRelay.main.overview.bridge.pending")}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.overview.bridge.connectionCount", {
              observerCount: runtimeSummary.observerCount,
              controlCount: runtimeSummary.controlCount,
            })}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("bridge")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t("settings.chromeRelay.main.overview.action.viewBridge")}
          </button>
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t("settings.chromeRelay.main.overview.backend.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t("settings.chromeRelay.main.overview.backend.description")}
              </p>
            </div>
            <StatusPill
              tone={
                (draftBackendPolicy?.auto_fallback ?? true)
                  ? "success"
                  : "neutral"
              }
            >
              {(draftBackendPolicy?.auto_fallback ?? true)
                ? t("settings.chromeRelay.main.overview.backend.fallbackOn")
                : t("settings.chromeRelay.main.overview.backend.fallbackOff")}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-900">
            {(draftBackendPolicy?.priority ?? BACKEND_OPTIONS)
              .map((backend) => getBackendLabel(backend))
              .join(" / ")}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t("settings.chromeRelay.main.overview.backend.priorityLabel")}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("backend")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t("settings.chromeRelay.main.overview.action.viewBackend")}
          </button>
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t("settings.chromeRelay.main.overview.debug.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t("settings.chromeRelay.main.overview.debug.description")}
              </p>
            </div>
            <StatusPill tone={runtimeSessionId ? "success" : "neutral"}>
              {runtimeSessionId
                ? t("settings.chromeRelay.main.overview.debug.hasSession")
                : t("settings.chromeRelay.main.overview.debug.onDemand")}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.overview.debug.reusableCount", {
              count: runtimeSummary.cdpAliveProfiles,
            })}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("debug")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t("settings.chromeRelay.main.overview.action.openDebug")}
          </button>
        </div>
      </div>
    </SurfacePanel>
  );

  const renderUsagePanel = () => (
    <SurfacePanel
      icon={Sparkles}
      title={t("settings.chromeRelay.main.usage.title")}
      description={t("settings.chromeRelay.main.usage.description")}
    >
      <div className="space-y-3">
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.chromeRelay.main.usage.step1.title")}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.usage.step1.description")}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.chromeRelay.main.usage.step2.title")}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.usage.step2.description")}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.chromeRelay.main.usage.step3.title")}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.usage.step3.description")}
          </p>
        </div>
      </div>
    </SurfacePanel>
  );

  const renderDebugPanel = () => (
    <SurfacePanel
      icon={Bug}
      title={t("settings.chromeRelay.main.debug.title")}
      description={t("settings.chromeRelay.main.debug.description")}
    >
      <Suspense
        fallback={
          <DeferredPanelFallback
            message={t("settings.chromeRelay.main.debug.loading")}
          />
        }
      >
        <div className="min-w-0 overflow-x-auto">
          <BrowserRuntimeDebugPanel
            sessions={sessions}
            onMessage={(nextMessage) => setMessage(nextMessage)}
            showStandaloneWindowButton={false}
            initialProfileKey={selectedEngine.profileKey}
            initialSessionId={runtimeSessionId ?? undefined}
          />
        </div>
      </Suspense>
    </SurfacePanel>
  );

  const availableBackendCount = backendStatusList.filter(
    (item) => item.available,
  ).length;
  const connectorInstallStatusTone =
    browserConnectorInstallStatus?.status === "installed"
      ? "success"
      : browserConnectorInstallStatus?.status === "update_available"
        ? "warning"
        : "neutral";
  const connectorInstallStatusLabel =
    browserConnectorInstallStatus?.status === "installed"
      ? t("settings.chromeRelay.main.installStatus.installed")
      : browserConnectorInstallStatus?.status === "update_available"
        ? t("settings.chromeRelay.main.installStatus.updateAvailable")
        : browserConnectorInstallStatus?.status === "broken"
          ? t("settings.chromeRelay.main.installStatus.broken")
          : t("settings.chromeRelay.main.installStatus.notInstalled");
  const connectorEnabled = browserConnectorSettings?.enabled ?? true;
  const hasControlConnected = runtimeSummary.controlCount > 0;
  const hasCdpDirectAvailable = runtimeSummary.cdpAliveProfiles > 0;
  const visibleSystemConnectors = (
    browserConnectorSettings?.system_connectors ?? []
  ).filter((item) => item.visible !== false);
  const shouldShowSystemConnectors = visibleSystemConnectors.length > 0;
  const systemConnectorCount = visibleSystemConnectors.length;
  const enabledSystemConnectorCount = visibleSystemConnectors.filter(
    (item) => item.enabled,
  ).length;
  const systemConnectorTitle = /mac/i.test(window.navigator.platform)
    ? t("settings.chromeRelay.main.systemConnector.macTitle")
    : t("settings.chromeRelay.main.systemConnector.genericTitle");
  const getSystemConnectorStatusLabel = useCallback(
    (
      connector: Pick<
        SystemConnectorSnapshot,
        "available" | "authorization_status" | "enabled"
      >,
    ) => {
      if (!connector.available) {
        return t(
          "settings.chromeRelay.main.systemConnector.status.unsupportedPlatform",
        );
      }
      if (
        connector.enabled &&
        connector.authorization_status === "authorized"
      ) {
        return t("settings.chromeRelay.main.systemConnector.status.enabled");
      }
      switch (connector.authorization_status) {
        case "authorized":
          return t(
            "settings.chromeRelay.main.systemConnector.status.authorized",
          );
        case "denied":
          return t("settings.chromeRelay.main.systemConnector.status.denied");
        case "error":
          return t("settings.chromeRelay.main.systemConnector.status.error");
        default:
          return t("settings.chromeRelay.main.systemConnector.status.pending");
      }
    },
    [t],
  );
  const getSectionTabClassName = (tab: RelaySectionTab) =>
    cn(
      SECTION_TAB_TRIGGER_CLASS_NAME,
      activeSectionTab === tab
        ? ACTIVE_TAB_TRIGGER_CLASS_NAME
        : "border-transparent bg-white/70 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900",
    );

  const renderSectionTabLabel = (
    tab: RelaySectionTab,
    label: string,
    icon: LucideIcon,
    badge: string | number,
  ) => {
    const Icon = icon;
    const active = activeSectionTab === tab;

    return (
      <span className="inline-flex items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4",
            active ? "text-emerald-600" : "text-slate-500",
          )}
        />
        <span>{label}</span>
        <span
          className={cn(
            SECTION_TAB_BADGE_CLASS_NAME,
            active
              ? "border border-emerald-200 bg-white/90 text-emerald-700"
              : "bg-slate-200 text-slate-600",
          )}
        >
          {badge}
        </span>
      </span>
    );
  };

  return (
    <div className="min-w-0 space-y-6 pb-8">
      {message ? (
        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-[20px] border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
              : "border-rose-200 bg-rose-50/90 text-rose-700",
          )}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="rounded-full border border-current/20 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-white/90"
          >
            {t("settings.chromeRelay.main.action.closeMessage")}
          </button>
        </div>
      ) : null}

      <Tabs
        value={activePrimaryTab}
        onValueChange={(value) => setActivePrimaryTab(value as RelayPrimaryTab)}
        className="w-full"
      >
        <TabsContent value="core" className="space-y-6">
          {activePrimaryTab === "core" ? (
            <>
              <section className="mx-auto w-full max-w-[640px] space-y-6">
                <div className="text-center text-sm font-medium text-muted-foreground">
                  {t("settings.chromeRelay.main.core.eyebrow")}
                </div>

                <div className="rounded-[18px] border border-border bg-card px-4 py-3 text-card-foreground shadow-sm shadow-slate-950/5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t(
                      "settings.chromeRelay.main.core.systemEnvironment.title",
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <span className="font-semibold text-foreground">
                      {window.navigator.platform.toLowerCase().includes("mac")
                        ? "macOS"
                        : window.navigator.platform ||
                          t(
                            "settings.chromeRelay.main.core.systemEnvironment.currentSystem",
                          )}
                    </span>
                    <span className="h-4 w-px bg-border" />
                    <span className="text-muted-foreground">
                      {t(
                        "settings.chromeRelay.main.core.systemEnvironment.archLabel",
                      )}{" "}
                      {window.navigator.platform.includes("arm")
                        ? "arm64"
                        : t(
                            "settings.chromeRelay.main.core.systemEnvironment.currentArch",
                          )}
                    </span>
                  </div>
                </div>

                <section className="rounded-[22px] bg-card p-5 text-card-foreground shadow-sm shadow-slate-950/5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-foreground">
                      {t("settings.chromeRelay.main.core.browserList.title")}
                    </h2>
                    <button
                      type="button"
                      onClick={() => void refreshAll(false)}
                      disabled={
                        refreshingConnectorSettings ||
                        refreshingConnectorInstallStatus ||
                        refreshingSessions ||
                        refreshingBridge ||
                        refreshingBackends
                      }
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          refreshingConnectorSettings ||
                            refreshingConnectorInstallStatus ||
                            refreshingSessions ||
                            refreshingBridge ||
                            refreshingBackends
                            ? "animate-spin"
                            : "",
                        )}
                      />
                      {t("settings.chromeRelay.main.action.rescan")}
                    </button>
                  </div>

                  <article className="mt-4 rounded-[18px] border border-sky-300 bg-card p-4 shadow-sm shadow-sky-950/5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-muted text-sm font-semibold text-emerald-600">
                          C
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground">
                              Google Chrome
                            </h3>
                            <StatusPill tone="success">
                              {t(
                                "settings.chromeRelay.main.core.browserList.inUse",
                              )}
                            </StatusPill>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <StatusPill tone="neutral">M144+</StatusPill>
                            <span>
                              {t(
                                "settings.chromeRelay.main.core.browserList.currentChrome",
                              )}
                            </span>
                            <span>Chromium</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={t(
                          "settings.chromeRelay.main.core.browserList.toggleConnectorAria",
                        )}
                        onClick={() =>
                          void handleSetConnectorEnabled(!connectorEnabled)
                        }
                        disabled={savingConnectorEnabled}
                        className="rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <span className="text-lg leading-none">⌃</span>
                      </button>
                    </div>

                    <p className="mt-4 pl-[52px] text-xs leading-5 text-muted-foreground">
                      {t("settings.chromeRelay.main.core.chrome.description")}
                    </p>

                    <div className="mt-4 space-y-3 pl-[52px]">
                      <div className="rounded-[14px] border border-border bg-muted/30 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {t(
                                  "settings.chromeRelay.main.core.extension.title",
                                )}
                              </p>
                              <StatusPill tone="success">
                                {t(
                                  "settings.chromeRelay.main.status.recommended",
                                )}
                              </StatusPill>
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {t(
                                "settings.chromeRelay.main.core.extension.description",
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void handleOpenConnectorGuide("extension")
                            }
                            disabled={openingGuideMode === "extension"}
                            className={SECONDARY_BUTTON_CLASS_NAME}
                          >
                            {openingGuideMode === "extension"
                              ? t("settings.chromeRelay.main.action.opening")
                              : t(
                                  "settings.chromeRelay.main.action.connectionGuide",
                                )}
                          </button>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              connectorInstallStatusTone === "success"
                                ? "bg-emerald-500"
                                : "bg-amber-500",
                            )}
                          />
                          {connectorInstallStatusLabel}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-emerald-300 bg-emerald-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {t("settings.chromeRelay.main.core.cdp.title")}
                              </p>
                              <StatusPill tone="neutral">Beta</StatusPill>
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {t(
                                "settings.chromeRelay.main.core.cdp.description",
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleOpenConnectorGuide("cdp")}
                            disabled={openingGuideMode === "cdp"}
                            className={SECONDARY_BUTTON_CLASS_NAME}
                          >
                            {openingGuideMode === "cdp"
                              ? t("settings.chromeRelay.main.action.opening")
                              : t(
                                  "settings.chromeRelay.main.action.configGuide",
                                )}
                          </button>
                        </div>
                        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                          <p className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {t("settings.chromeRelay.main.core.cdp.versionOk")}
                          </p>
                          <p className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                hasCdpDirectAvailable
                                  ? "bg-emerald-500"
                                  : "bg-amber-500",
                              )}
                            />
                            {hasCdpDirectAvailable
                              ? t(
                                  "settings.chromeRelay.main.core.cdp.connected",
                                )
                              : t("settings.chromeRelay.main.core.cdp.waiting")}
                          </p>
                          <p className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                runtimeSessionId
                                  ? "bg-emerald-500"
                                  : "bg-amber-500",
                              )}
                            />
                            {t(
                              "settings.chromeRelay.main.core.cdp.debugSessionPrefix",
                            )}
                            {runtimeSessionId
                              ? t(
                                  "settings.chromeRelay.main.core.cdp.debugConnected",
                                )
                              : t(
                                  "settings.chromeRelay.main.core.cdp.debugDisconnected",
                                )}
                            {!runtimeSessionId ? (
                              <button
                                type="button"
                                onClick={() => void handleLaunchBrowserAssist()}
                                disabled={launchingAssist}
                                className="rounded-md bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
                              >
                                {launchingAssist
                                  ? t(
                                      "settings.chromeRelay.main.action.requesting",
                                    )
                                  : t(
                                      "settings.chromeRelay.main.action.requestConnection",
                                    )}
                              </button>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>

                  <div className="mt-3 space-y-3">
                    <div className="rounded-[18px] border border-border bg-muted/20 px-4 py-3 opacity-55">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                          C
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-muted-foreground">
                              {t(
                                "settings.chromeRelay.main.core.builtinChromium.title",
                              )}
                            </p>
                            <StatusPill tone="neutral">
                              {t(
                                "settings.chromeRelay.main.installStatus.notInstalled",
                              )}
                            </StatusPill>
                            <StatusPill tone="neutral">
                              {t("settings.chromeRelay.main.status.comingSoon")}
                            </StatusPill>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Chromium
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-border bg-muted/20 px-4 py-3 opacity-55">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                          S
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-muted-foreground">
                              Safari
                            </p>
                            <StatusPill tone="neutral">
                              {t(
                                "settings.chromeRelay.main.status.unsupported",
                              )}
                            </StatusPill>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            WebKit
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    {t("settings.chromeRelay.main.core.onlyChrome")}
                  </p>
                </section>

                <section className="space-y-3">
                  <div className="rounded-[18px] bg-card p-4 shadow-sm shadow-slate-950/5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {t("settings.chromeRelay.main.core.advanced.title")}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {t(
                            "settings.chromeRelay.main.core.advanced.description",
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivePrimaryTab("advanced")}
                        className={SECONDARY_BUTTON_CLASS_NAME}
                      >
                        {t(
                          "settings.chromeRelay.main.action.openAdvancedTools",
                        )}
                      </button>
                    </div>
                  </div>
                </section>
              </section>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="advanced" className="mt-6 space-y-6">
          {activePrimaryTab === "advanced" ? (
            <>
              <div className="mx-auto flex w-full max-w-[960px] justify-start">
                <button
                  type="button"
                  onClick={() => setActivePrimaryTab("core")}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  {t("settings.chromeRelay.main.action.backToBrowserList")}
                </button>
              </div>
              <section
                className={cn(
                  "grid gap-5",
                  shouldShowSystemConnectors
                    ? "xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]"
                    : "xl:grid-cols-1",
                )}
              >
                <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {t("settings.chromeRelay.main.connectionMethod.title")}
                    </h3>
                    <p className="text-xs leading-5 text-slate-500">
                      {t(
                        "settings.chromeRelay.main.connectionMethod.description",
                      )}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {t(
                              "settings.chromeRelay.main.connectionMethod.extension.title",
                            )}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {t(
                              "settings.chromeRelay.main.connectionMethod.extension.description",
                            )}
                          </p>
                        </div>
                        <StatusPill
                          tone={
                            hasObserverConnected && hasControlConnected
                              ? "success"
                              : "warning"
                          }
                        >
                          {hasObserverConnected && hasControlConnected
                            ? t(
                                "settings.chromeRelay.main.connectionMethod.extension.status.recommended",
                              )
                            : t(
                                "settings.chromeRelay.main.connectionMethod.extension.status.pending",
                              )}
                        </StatusPill>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {t(
                          "settings.chromeRelay.main.connectionMethod.extension.body",
                        )}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleOpenConnectorGuide("extension")
                          }
                          disabled={openingGuideMode === "extension"}
                          className={PRIMARY_BUTTON_CLASS_NAME}
                        >
                          <Link2 className="h-4 w-4" />
                          {openingGuideMode === "extension"
                            ? t("settings.chromeRelay.main.action.opening")
                            : t(
                                "settings.chromeRelay.main.action.connectionGuide",
                              )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenBrowserExtensionsPage()}
                          disabled={openingExtensionsPage}
                          className={SECONDARY_BUTTON_CLASS_NAME}
                        >
                          <Link2 className="h-4 w-4" />
                          {openingExtensionsPage
                            ? t("settings.chromeRelay.main.action.opening")
                            : t(
                                "settings.chromeRelay.main.connectionMethod.extension.action.openExtensions",
                              )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void copyPlainText(
                              "chrome://extensions",
                              "chrome://extensions",
                            )
                          }
                          className={SECONDARY_BUTTON_CLASS_NAME}
                        >
                          <Copy className="h-4 w-4" />
                          {t(
                            "settings.chromeRelay.main.connectionMethod.extension.action.copyExtensionsUrl",
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-sky-200 bg-sky-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {t(
                              "settings.chromeRelay.main.connectionMethod.cdp.title",
                            )}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {t(
                              "settings.chromeRelay.main.connectionMethod.cdp.description",
                            )}
                          </p>
                        </div>
                        <StatusPill
                          tone={hasCdpDirectAvailable ? "success" : "warning"}
                        >
                          {hasCdpDirectAvailable
                            ? t(
                                "settings.chromeRelay.main.connectionMethod.cdp.status.ready",
                              )
                            : t(
                                "settings.chromeRelay.main.connectionMethod.cdp.status.pending",
                              )}
                        </StatusPill>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {t(
                          "settings.chromeRelay.main.connectionMethod.cdp.body",
                        )}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleOpenConnectorGuide("cdp")}
                          disabled={openingGuideMode === "cdp"}
                          className={PRIMARY_BUTTON_CLASS_NAME}
                        >
                          <ExternalLink className="h-4 w-4" />
                          {openingGuideMode === "cdp"
                            ? t("settings.chromeRelay.main.action.opening")
                            : t("settings.chromeRelay.main.action.configGuide")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenRemoteDebuggingPage()}
                          disabled={openingRemoteDebuggingPage}
                          className={SECONDARY_BUTTON_CLASS_NAME}
                        >
                          <ExternalLink className="h-4 w-4" />
                          {openingRemoteDebuggingPage
                            ? t("settings.chromeRelay.main.action.opening")
                            : t(
                                "settings.chromeRelay.main.connectionMethod.cdp.action.openRemoteDebugging",
                              )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void copyPlainText(
                              REMOTE_DEBUGGING_URL,
                              "chrome://inspect/#remote-debugging",
                            )
                          }
                          className={SECONDARY_BUTTON_CLASS_NAME}
                        >
                          <Copy className="h-4 w-4" />
                          {t(
                            "settings.chromeRelay.main.connectionMethod.cdp.action.copyRemoteDebuggingUrl",
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void copyBridgeConfig(
                          "default",
                          t(
                            "settings.chromeRelay.main.connectionMethod.defaultConnectorLabel",
                          ),
                        )
                      }
                      disabled={!bridgeEndpoint}
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      <Copy className="h-4 w-4" />
                      {t("settings.chromeRelay.main.action.copyConfig")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDisconnectBrowserConnector()}
                      disabled={!hasObserverConnected || disconnectingConnector}
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      {disconnectingConnector
                        ? t("settings.chromeRelay.main.action.disconnecting")
                        : t(
                            "settings.chromeRelay.main.action.disconnectConnectedExtension",
                          )}
                    </button>
                  </div>
                </article>

                {shouldShowSystemConnectors ? (
                  <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5 sm:p-6">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {systemConnectorTitle}
                        </h3>
                        <p className="text-sm leading-6 text-slate-500">
                          {t(
                            "settings.chromeRelay.main.systemConnector.description",
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-slate-500">
                        {t(
                          "settings.chromeRelay.main.systemConnector.enabledCount",
                          {
                            enabled: enabledSystemConnectorCount,
                            count: systemConnectorCount,
                          },
                        )}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {visibleSystemConnectors.map((connector) => (
                        <div
                          key={connector.id}
                          className="flex items-center justify-between gap-4 py-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {connector.label}
                              </p>
                              <StatusPill
                                tone={getSystemConnectorStatusTone(connector)}
                              >
                                {getSystemConnectorStatusLabel(connector)}
                              </StatusPill>
                            </div>
                            <p className="text-sm leading-6 text-slate-500">
                              {connector.description}
                            </p>
                            {connector.capabilities.length > 0 ? (
                              <p className="text-xs leading-5 text-slate-500">
                                {t(
                                  "settings.chromeRelay.main.systemConnector.capabilities",
                                  {
                                    capabilities:
                                      connector.capabilities.join(" / "),
                                  },
                                )}
                              </p>
                            ) : null}
                            {connector.last_error ? (
                              <p className="text-xs text-rose-600">
                                {connector.last_error}
                              </p>
                            ) : null}
                          </div>
                          <Switch
                            aria-label={t(
                              "settings.chromeRelay.main.systemConnector.toggleAria",
                              {
                                label: connector.label,
                              },
                            )}
                            checked={connector.enabled}
                            disabled={
                              !connector.available ||
                              updatingSystemConnectorId === connector.id
                            }
                            onCheckedChange={(checked) =>
                              void handleSetSystemConnectorEnabled(
                                connector.id,
                                checked,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
              </section>

              {renderBrowserActionPanel()}

              <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {t("settings.chromeRelay.main.advancedControl.title")}
                    </h3>
                    <p className="text-sm leading-6 text-slate-500">
                      {t(
                        "settings.chromeRelay.main.advancedControl.description",
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleLaunchBrowserAssist()}
                      disabled={launchingAssist}
                      className={PRIMARY_BUTTON_CLASS_NAME}
                    >
                      <ExternalLink className="h-4 w-4" />
                      {launchingAssist
                        ? t("settings.chromeRelay.main.action.launching")
                        : t(
                            "settings.chromeRelay.main.action.launchBrowserAssist",
                          )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenDebuggerWindow()}
                      disabled={openingDebugger}
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      <Bug className="h-4 w-4" />
                      {openingDebugger
                        ? t("settings.chromeRelay.main.action.opening")
                        : t(
                            "settings.chromeRelay.main.action.openStandaloneDebugger",
                          )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshAll(false)}
                      disabled={
                        refreshingConnectorSettings ||
                        refreshingConnectorInstallStatus ||
                        refreshingSessions ||
                        refreshingBridge ||
                        refreshingBackends
                      }
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          refreshingConnectorSettings ||
                            refreshingConnectorInstallStatus ||
                            refreshingSessions ||
                            refreshingBridge ||
                            refreshingBackends
                            ? "animate-spin"
                            : "",
                        )}
                      />
                      {t("settings.chromeRelay.main.action.refreshStatus")}
                    </button>
                  </div>
                </div>

                <div className="mt-5">
                  <Tabs
                    value={activeSectionTab}
                    onValueChange={(value) =>
                      setActiveSectionTab(value as RelaySectionTab)
                    }
                    className="w-full"
                  >
                    <TabsList className={SECTION_TABS_CLASS_NAME}>
                      <TabsTrigger
                        value="overview"
                        className={getSectionTabClassName("overview")}
                      >
                        {renderSectionTabLabel(
                          "overview",
                          t("settings.chromeRelay.main.tab.overview"),
                          Sparkles,
                          runtimeSummary.pendingCommands,
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="profile"
                        className={getSectionTabClassName("profile")}
                      >
                        {renderSectionTabLabel(
                          "profile",
                          "Profile",
                          Globe,
                          runtimeSummary.runningProfiles,
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="bridge"
                        className={getSectionTabClassName("bridge")}
                      >
                        {renderSectionTabLabel(
                          "bridge",
                          t("settings.chromeRelay.main.tab.bridge"),
                          Copy,
                          runtimeSummary.observerCount,
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="backend"
                        className={getSectionTabClassName("backend")}
                      >
                        {renderSectionTabLabel(
                          "backend",
                          t("settings.chromeRelay.main.tab.backend"),
                          Layers3,
                          availableBackendCount,
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="debug"
                        className={getSectionTabClassName("debug")}
                      >
                        {renderSectionTabLabel(
                          "debug",
                          t("settings.chromeRelay.main.tab.debug"),
                          Bug,
                          runtimeSummary.cdpAliveProfiles,
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-5 space-y-6">
                      {activeSectionTab === "overview" ? (
                        <>
                          {renderOverviewPanel()}
                          {renderUsagePanel()}
                        </>
                      ) : null}
                    </TabsContent>

                    <TabsContent value="profile" className="mt-5">
                      {activeSectionTab === "profile"
                        ? renderProfilePanel("profile-")
                        : null}
                    </TabsContent>

                    <TabsContent value="bridge" className="mt-5">
                      {activeSectionTab === "bridge"
                        ? renderBridgePanel()
                        : null}
                    </TabsContent>

                    <TabsContent value="backend" className="mt-5">
                      {activeSectionTab === "backend"
                        ? renderBackendPanel()
                        : null}
                    </TabsContent>

                    <TabsContent value="debug" className="mt-5">
                      {activeSectionTab === "debug" ? renderDebugPanel() : null}
                    </TabsContent>
                  </Tabs>
                </div>
              </section>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
