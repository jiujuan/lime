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
  label: string;
  description: string;
  settingsUrl: string;
  assistUrl: string;
  bridgeTestUrl: string;
  backendTestUrl: string;
  profileKey: string;
  settingsButtonLabel: string;
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
    label: "Google",
    description: "独立 Profile 用于搜索偏好、语言和地区设置。",
    settingsUrl: "https://www.google.com/preferences?hl=zh-CN",
    assistUrl: "https://www.google.com/search?q=lime+browser+assist",
    bridgeTestUrl: "https://www.google.com/search?q=lime",
    backendTestUrl: "https://www.google.com/search?q=lime+browser+backend",
    profileKey: "search_google",
    settingsButtonLabel: "打开 Google 设置",
  },
  xiaohongshu: {
    id: "xiaohongshu",
    label: "小红书",
    description: "独立 Profile 用于账号登录、内容浏览和扩展桥接。",
    settingsUrl: "https://www.xiaohongshu.com/explore",
    assistUrl: "https://www.xiaohongshu.com/explore",
    bridgeTestUrl: "https://www.xiaohongshu.com/explore",
    backendTestUrl: "https://www.xiaohongshu.com/explore",
    profileKey: "search_xiaohongshu",
    settingsButtonLabel: "打开小红书设置",
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
              ariaLabel={`${title}说明`}
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
                defaultValue: "刷新连接器设置失败: {{message}}",
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
                defaultValue: "刷新浏览器连接器安装状态失败: {{message}}",
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
              defaultValue: "刷新会话失败: {{message}}",
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
              defaultValue: "刷新扩展连接状态失败: {{message}}",
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
              defaultValue: "刷新浏览器后端状态失败: {{message}}",
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
      reason: "等待状态拉取",
      capabilities: [],
    }));

  const openSearchSettingsWindow = useCallback(
    async (engine: SearchEngine) => {
      const target = ENGINE_DEFINITIONS[engine];
      try {
        setOpeningEngine(engine);
        const result = await openChromeProfileWindow({
          profile_key: target.profileKey,
          url: target.settingsUrl,
        });
        if (!result.success) {
          throw new Error(
            result.error ||
              t("settings.chromeRelay.main.message.createWindowFailed", {
                defaultValue: "创建窗口失败",
              }),
          );
        }
        pushMessage({
          type: "success",
          text: result.reused
            ? t("settings.chromeRelay.main.message.sessionReused", {
                defaultValue: "已复用 {{label}} 会话 (PID {{pid}})",
                label: target.label,
                pid: result.pid ?? "-",
              })
            : t("settings.chromeRelay.main.message.sessionStarted", {
                defaultValue: "已启动 {{label}} 会话 (PID {{pid}})",
                label: target.label,
                pid: result.pid ?? "-",
              }),
        });
        await refreshSessions(true);
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.openSettingsFailed", {
            defaultValue: "打开设置窗口失败: {{message}}",
            message: getRelayErrorMessage(error),
          }),
        });
      } finally {
        setOpeningEngine(null);
      }
    },
    [pushMessage, refreshSessions, t],
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
            ? t("settings.chromeRelay.main.message.sessionClosed", {
                defaultValue: "会话已关闭",
              })
            : t("settings.chromeRelay.main.message.sessionNotFound", {
                defaultValue: "未找到运行中的会话",
              }),
        });
        await refreshSessions(true);
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.closeSessionFailed", {
            defaultValue: "关闭会话失败: {{message}}",
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
          defaultValue: "浏览器协助已启动：{{target}}",
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
          defaultValue: "启动浏览器协助失败: {{message}}",
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
        text: t("settings.chromeRelay.main.message.debugWindowOpened", {
          defaultValue: "已打开独立浏览器调试窗口",
        }),
      });
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.openDebugWindowFailed", {
          defaultValue: "打开独立调试窗口失败: {{message}}",
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
              ? t("settings.chromeRelay.main.message.extensionGuideOpened", {
                  defaultValue: "已打开扩展连接引导窗口",
                })
              : t("settings.chromeRelay.main.message.cdpGuideOpened", {
                  defaultValue: "已打开 CDP 直连配置引导窗口",
                }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.openGuideFailed", {
            defaultValue: "打开连接器引导失败: {{message}}",
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
            ? t("settings.chromeRelay.main.message.connectorEnabled", {
                defaultValue: "浏览器连接器已开启",
              })
            : t("settings.chromeRelay.main.message.connectorDisabled", {
                defaultValue: "浏览器连接器已关闭",
              }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.updateConnectorFailed", {
            defaultValue: "更新浏览器连接器开关失败: {{message}}",
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
          defaultValue: "打开 Chrome 扩展页面失败: {{message}}",
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
            t("settings.chromeRelay.main.message.clipboardUnsupported", {
              defaultValue: "当前环境不支持剪贴板写入",
            }),
          );
        }
        await navigator.clipboard.writeText(text);
        pushMessage({
          type: "success",
          text: t("settings.chromeRelay.main.message.copySuccess", {
            defaultValue: "{{label}} 已复制到剪贴板",
            label,
          }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.copyFailed", {
            defaultValue: "复制 {{label}} 失败: {{message}}",
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
          defaultValue: "打开 Chrome 远程调试页失败: {{message}}",
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
                defaultValue:
                  "已断开 {{observerCount}} 个扩展观察连接和 {{controlCount}} 个控制连接",
                observerCount: result.disconnected_observer_count,
                controlCount: result.disconnected_control_count,
              })
            : t("settings.chromeRelay.main.message.noConnectorToDisconnect", {
                defaultValue: "当前没有可断开的扩展连接",
              }),
      });
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.disconnectFailed", {
          defaultValue: "断开扩展连接失败: {{message}}",
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
              defaultValue: "{{label}} 已关闭",
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
                defaultValue: "{{label}} 已授权并启用",
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
              defaultValue: "{{label}} 当前未获得系统授权",
              label: updatedConnector.label,
            }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t(
            "settings.chromeRelay.main.message.updateSystemConnectorFailed",
            {
              defaultValue: "更新系统连接器失败: {{message}}",
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
                defaultValue: "{{label}} 已{{state}}",
                label: updatedCapability.label,
                state: enabled
                  ? t("settings.chromeRelay.main.status.enabled", {
                      defaultValue: "开启",
                    })
                  : t("settings.chromeRelay.main.status.disabled", {
                      defaultValue: "关闭",
                    }),
              })
            : t("settings.chromeRelay.main.message.browserActionUpdated", {
                defaultValue: "浏览器动作已{{state}}",
                state: enabled
                  ? t("settings.chromeRelay.main.status.enabled", {
                      defaultValue: "开启",
                    })
                  : t("settings.chromeRelay.main.status.disabled", {
                      defaultValue: "关闭",
                    }),
              }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.updateActionFailed", {
            defaultValue: "更新浏览器动作配置失败: {{message}}",
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
          text: t("settings.chromeRelay.main.message.bridgeEndpointMissing", {
            defaultValue: "桥接端点尚未加载，无法复制配置",
          }),
        });
        return;
      }

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error(
            t("settings.chromeRelay.main.message.clipboardUnsupported", {
              defaultValue: "当前环境不支持剪贴板写入",
            }),
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
            defaultValue: "{{label}} 配置已复制到剪贴板",
            label,
          }),
        });
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.copyConfigFailed", {
            defaultValue: "复制扩展配置失败: {{message}}",
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
          text: t("settings.chromeRelay.main.message.bridgeServiceNotRunning", {
            defaultValue: "服务未运行，无法执行扩展桥接测试",
          }),
        });
        return;
      }
      if (!hasObserverConnected) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.bridgeObserverMissing", {
            defaultValue: "未检测到扩展 observer 连接，请先完成扩展接入",
          }),
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
              t("settings.chromeRelay.main.message.commandExecutionFailed", {
                defaultValue: "命令执行失败",
              }),
          );
        }
        pushMessage({
          type: "success",
          text: t("settings.chromeRelay.main.message.bridgeTestSuccess", {
            defaultValue: "扩展桥接测试成功：{{target}}",
            target:
              result.page_info?.title ||
              t("settings.chromeRelay.main.message.bridgeTestFallback", {
                defaultValue: "已打开目标页面",
              }),
          }),
        });
        await refreshBridgeStatus(true);
      } catch (error) {
        pushMessage({
          type: "error",
          text: t("settings.chromeRelay.main.message.bridgeTestFailed", {
            defaultValue: "扩展桥接测试失败: {{message}}",
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
          return t("settings.chromeRelay.main.backend.asterCompat.label", {
            defaultValue: "Aster 协议适配",
          });
        case "lime_extension_bridge":
          return t("settings.chromeRelay.main.backend.extensionBridge.label", {
            defaultValue: "Lime 扩展桥接",
          });
        case "cdp_direct":
          return t("settings.chromeRelay.main.backend.cdpDirect.label", {
            defaultValue: "CDP 直连",
          });
      }
    },
    [t],
  );
  const getBackendDescription = useCallback(
    (backend: BrowserBackendType) => {
      switch (backend) {
        case "aster_compat":
          return t(
            "settings.chromeRelay.main.backend.asterCompat.description",
            {
              defaultValue:
                "优先复用现有 Aster 兼容链路，适合需要兼容旧协议接入的场景。",
            },
          );
        case "lime_extension_bridge":
          return t(
            "settings.chromeRelay.main.backend.extensionBridge.description",
            {
              defaultValue:
                "通过浏览器扩展回传页面信息并执行命令，适合人工观察和轻量控制。",
            },
          );
        case "cdp_direct":
          return t("settings.chromeRelay.main.backend.cdpDirect.description", {
            defaultValue:
              "直接走 Chrome DevTools Protocol，适合实时调试与会话接管。",
          });
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
        text: t("settings.chromeRelay.main.message.backendPolicySaved", {
          defaultValue: "浏览器后端策略已保存",
        }),
      });
      await refreshBackendStatus(true);
    } catch (error) {
      pushMessage({
        type: "error",
        text: t("settings.chromeRelay.main.message.saveBackendPolicyFailed", {
          defaultValue: "保存后端策略失败: {{message}}",
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
            defaultValue: "{{label}} 当前不可用: {{reason}}",
            label: getBackendLabel(backend),
            reason:
              backendStatus.reason ||
              t(
                "settings.chromeRelay.main.message.backendUnavailableFallback",
                {
                  defaultValue: "缺少可用连接",
                },
              ),
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
              t("settings.chromeRelay.main.message.backendActionFailed", {
                defaultValue: "执行失败",
              }),
          );
        }
        pushMessage({
          type: "success",
          text: t("settings.chromeRelay.main.message.backendTestSuccess", {
            defaultValue: "{{label}} 测试成功",
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
            defaultValue: "{{label}} 测试失败: {{message}}",
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
        ? t("settings.chromeRelay.main.engine.google.description", {
            defaultValue: "独立 Profile 用于搜索偏好、语言和地区设置。",
          })
        : t("settings.chromeRelay.main.engine.xiaohongshu.description", {
            defaultValue: "独立 Profile 用于账号登录、内容浏览和扩展桥接。",
          }),
    [t],
  );
  const getEngineSettingsButtonLabel = useCallback(
    (engine: SearchEngine) =>
      engine === "google"
        ? t("settings.chromeRelay.main.engine.google.settingsButton", {
            defaultValue: "打开 Google 设置",
          })
        : t("settings.chromeRelay.main.engine.xiaohongshu.settingsButton", {
            defaultValue: "打开小红书设置",
          }),
    [t],
  );
  const renderProfilePanel = (keyPrefix = "") => (
    <SurfacePanel
      icon={Globe}
      title={t("settings.chromeRelay.main.profile.title", "Profile 会话")}
      description={t(
        "settings.chromeRelay.main.profile.description",
        "为搜索和桥接准备独立浏览器 Profile。每个会话都可以单独打开、关闭，并观察当前调试端口。",
      )}
      aside={
        <StatusPill tone={selectedSession ? "success" : "neutral"}>
          {t("settings.chromeRelay.main.profile.currentEngine", {
            defaultValue: "当前查看 {{label}}",
            label: selectedEngine.label,
          })}
        </StatusPill>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {ENGINE_ORDER.map((engine) => {
          const target = ENGINE_DEFINITIONS[engine];
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
                      {target.label}
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      {getEngineDescription(engine)}
                    </p>
                  </div>
                  <StatusPill tone={session ? "success" : "warning"}>
                    {session
                      ? t(
                          "settings.chromeRelay.main.profile.status.running",
                          "会话运行中",
                        )
                      : t(
                          "settings.chromeRelay.main.profile.status.pending",
                          "尚未启动",
                        )}
                  </StatusPill>
                </div>

                {session ? (
                  <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-200/80 bg-white/90 p-3">
                      <p className="text-xs font-medium text-slate-500">
                        {t(
                          "settings.chromeRelay.main.profile.field.processSource",
                          "进程 / 来源",
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
                        {t(
                          "settings.chromeRelay.main.profile.field.debugPort",
                          "调试端口",
                        )}
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
                        {t(
                          "settings.chromeRelay.main.profile.field.lastPage",
                          "最近页面",
                        )}
                      </p>
                      <p className="mt-2 break-all text-sm text-slate-700">
                        {session.last_url}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-500">
                    {t(
                      "settings.chromeRelay.main.profile.empty",
                      "当前还没有运行中的独立会话。先打开设置窗口，或直接使用上方的一键浏览器协助。",
                    )}
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
                    ? t("settings.chromeRelay.main.action.opening", "打开中...")
                    : getEngineSettingsButtonLabel(engine)}
                </button>
                <button
                  type="button"
                  onClick={() => void closeSession(engine)}
                  disabled={!session || closingProfileKey === target.profileKey}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  {closingProfileKey === target.profileKey
                    ? t("settings.chromeRelay.main.action.closing", "关闭中...")
                    : t(
                        "settings.chromeRelay.main.action.closeSession",
                        "关闭会话",
                      )}
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
      title={t(
        "settings.chromeRelay.main.backendPolicy.title",
        "浏览器后端策略",
      )}
      description={t(
        "settings.chromeRelay.main.backendPolicy.description",
        "统一编排 Aster 协议适配、扩展桥接与 CDP 直连，并决定失败时是否自动回退。",
      )}
    >
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.target.title",
                    "默认测试目标",
                  )}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.target.description",
                    "该目标会用于后端测试和一键浏览器协助，减少多处切换。",
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
                    {ENGINE_DEFINITIONS[engine].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-slate-200/80 bg-white/85 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.autoFallback.title",
                    "自动回退",
                  )}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {t(
                    "settings.chromeRelay.main.backendPolicy.autoFallback.description",
                    "当前后端失败时，自动切换到下一个优先级继续执行。",
                  )}
                </p>
              </div>
              <Switch
                aria-label={t(
                  "settings.chromeRelay.main.backendPolicy.autoFallback.aria",
                  "自动回退到下一后端",
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
                            defaultValue: "优先级 {{index}}",
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
                              "测试中...",
                            )
                          : t(
                              "settings.chromeRelay.main.backendPolicy.action.test",
                              "测试",
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
              {t(
                "settings.chromeRelay.main.backendPolicy.availability.title",
                "当前可用性",
              )}
            </p>
            <p className="text-sm leading-6 text-slate-500">
              {t(
                "settings.chromeRelay.main.backendPolicy.availability.description",
                "后端状态来自运行时即时快照，用于判断当前是否具备可执行链路。",
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
                          "可用",
                        )
                      : item.reason ||
                        t(
                          "settings.chromeRelay.main.backendPolicy.availability.status.pendingCheck",
                          "待检查",
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
                      defaultValue: "能力: {{capabilities}}",
                      capabilities:
                        item.capabilities.length > 0
                          ? item.capabilities.join(" / ")
                          : t(
                              "settings.chromeRelay.main.backendPolicy.availability.capabilitiesPending",
                              "等待运行时返回",
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
                "Aster native-host",
              )}
              :{" "}
              {backendsStatus?.aster_native_host_configured
                ? t(
                    "settings.chromeRelay.main.backendPolicy.nativeHost.configured",
                    "已配置",
                  )
                : t(
                    "settings.chromeRelay.main.backendPolicy.nativeHost.unconfigured",
                    "未配置",
                  )}
            </p>
            <p>
              {t(
                "settings.chromeRelay.main.backendPolicy.nativeHost.platformSupportedLabel",
                "平台支持",
              )}
              :{" "}
              {backendsStatus?.aster_native_host_supported
                ? t(
                    "settings.chromeRelay.main.backendPolicy.nativeHost.yes",
                    "是",
                  )
                : t(
                    "settings.chromeRelay.main.backendPolicy.nativeHost.no",
                    "否",
                  )}
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
                ? t(
                    "settings.chromeRelay.main.backendPolicy.action.saving",
                    "保存中...",
                  )
                : t(
                    "settings.chromeRelay.main.backendPolicy.action.save",
                    "保存后端策略",
                  )}
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
              {t(
                "settings.chromeRelay.main.backendPolicy.action.refresh",
                "刷新后端状态",
              )}
            </button>
          </div>
        </div>
      </div>
    </SurfacePanel>
  );

  const renderBridgePanel = () => (
    <SurfacePanel
      icon={Sparkles}
      title={t("settings.chromeRelay.main.bridge.title", "Chrome 扩展桥接")}
      description={t(
        "settings.chromeRelay.main.bridge.description",
        "该桥接负责让浏览器扩展回传页面信息并接收控制命令，适合在独立 Profile 中补充观察与辅助执行。",
      )}
      aside={
        <StatusPill
          tone={bridgeEndpoint?.server_running ? "success" : "warning"}
        >
          {bridgeEndpoint?.server_running
            ? t(
                "settings.chromeRelay.main.bridge.status.serviceRunning",
                "桥接服务运行中",
              )
            : t(
                "settings.chromeRelay.main.bridge.status.serviceStopped",
                "桥接服务未运行",
              )}
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
              ? t(
                  "settings.chromeRelay.main.bridge.status.observerConnected",
                  "扩展已接入 observer",
                )
              : t(
                  "settings.chromeRelay.main.bridge.status.observerPending",
                  "待接入 observer",
                )}
          </span>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {t(
                "settings.chromeRelay.main.bridge.access.title",
                "扩展接入信息",
              )}
            </p>
            <p className="text-sm leading-6 text-slate-500">
              {t(
                "settings.chromeRelay.main.bridge.access.description",
                "在目标 Chrome Profile 的扩展弹窗里填写以下 WebSocket 端点与 Bridge Key。",
              )}
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
                {ENGINE_ORDER.map((engine) => (
                  <button
                    key={`copy-config-${engine}`}
                    type="button"
                    onClick={() =>
                      void copyBridgeConfig(
                        ENGINE_DEFINITIONS[engine].profileKey,
                        ENGINE_DEFINITIONS[engine].label,
                      )
                    }
                    className={SECONDARY_BUTTON_CLASS_NAME}
                  >
                    <Copy className="h-4 w-4" />
                    {t("settings.chromeRelay.main.bridge.action.copyConfig", {
                      defaultValue: "复制 {{label}} 配置",
                      label: ENGINE_DEFINITIONS[engine].label,
                    })}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] border border-dashed border-slate-200 bg-white/70 p-4 text-sm leading-6 text-slate-500">
              {t(
                "settings.chromeRelay.main.bridge.endpointMissing",
                "尚未获取到桥接端点信息，请先刷新状态或确认后端服务已经启动。",
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {ENGINE_ORDER.map((engine) => {
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
                      defaultValue: "{{label}} observer",
                      label: ENGINE_DEFINITIONS[engine].label,
                    })}
                  </p>
                  <StatusPill tone={observer ? "success" : "warning"}>
                    {observer
                      ? observer.client_id
                      : t(
                          "settings.chromeRelay.main.bridge.observer.notConnected",
                          "未连接",
                        )}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {observer?.last_page_info?.title
                    ? t("settings.chromeRelay.main.bridge.observer.lastPage", {
                        defaultValue: "最近页面：{{title}}",
                        title: observer.last_page_info.title,
                      })
                    : t(
                        "settings.chromeRelay.main.bridge.observer.noLastPage",
                        "尚未收到最近页面信息",
                      )}
                </p>
              </div>
            );
          })}
        </div>

        {!hasObserverConnected ? (
          <div className="rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-800">
            {t(
              "settings.chromeRelay.main.bridge.observerMissingHint",
              "未检测到扩展 observer 连接。请在对应 Chrome Profile 安装并打开 Lime Browser Bridge 扩展，然后填入上面的 Observer WS 与 Bridge Key。",
            )}
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
                ? t(
                    "settings.chromeRelay.main.bridge.action.testing",
                    "测试中...",
                  )
                : t("settings.chromeRelay.main.bridge.action.testExtension", {
                    defaultValue: "测试 {{label}} 扩展",
                    label: ENGINE_DEFINITIONS[engine].label,
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
            {t(
              "settings.chromeRelay.main.bridge.action.refreshStatus",
              "刷新扩展状态",
            )}
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
        title={t(
          "settings.chromeRelay.main.browserAction.title",
          "浏览器动作配置",
        )}
        description={t(
          "settings.chromeRelay.main.browserAction.description",
          "按读取和写入分组管理浏览器动作能力。关闭后不再分发到浏览器。",
        )}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            {
              id: "read",
              title: t(
                "settings.chromeRelay.main.browserAction.group.read",
                "读取权限",
              ),
              items: browserActionCapabilityGroups.read,
            },
            {
              id: "write",
              title: t(
                "settings.chromeRelay.main.browserAction.group.write",
                "写入权限",
              ),
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
                              defaultValue: "切换{{label}}",
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
      title={t("settings.chromeRelay.main.overview.title", "当前概览")}
      description={t(
        "settings.chromeRelay.main.overview.description",
        "把最常用的观察点和入口压缩在一屏内，详情再进入对应页签查看。",
      )}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t(
                  "settings.chromeRelay.main.overview.profile.title",
                  "Profile 会话",
                )}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t("settings.chromeRelay.main.overview.profile.description", {
                  defaultValue:
                    "当前目标 {{label}}，可快速检查独立浏览器是否已启动。",
                  label: selectedEngine.label,
                })}
              </p>
            </div>
            <StatusPill tone={selectedSession ? "success" : "warning"}>
              {selectedSession
                ? t(
                    "settings.chromeRelay.main.overview.profile.started",
                    "已启动",
                  )
                : t(
                    "settings.chromeRelay.main.overview.profile.pending",
                    "未启动",
                  )}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.overview.profile.runningCount", {
              defaultValue: "运行中的独立 Profile 数量：{{count}}",
              count: runtimeSummary.runningProfiles,
            })}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("profile")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t(
              "settings.chromeRelay.main.overview.action.viewProfile",
              "查看 Profile 详情",
            )}
          </button>
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t(
                  "settings.chromeRelay.main.overview.bridge.title",
                  "扩展桥接",
                )}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t(
                  "settings.chromeRelay.main.overview.bridge.description",
                  "observer / control 连接情况决定扩展侧链路是否可用。",
                )}
              </p>
            </div>
            <StatusPill tone={hasObserverConnected ? "success" : "warning"}>
              {hasObserverConnected
                ? t(
                    "settings.chromeRelay.main.overview.bridge.connected",
                    "已连通",
                  )
                : t(
                    "settings.chromeRelay.main.overview.bridge.pending",
                    "待接入",
                  )}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.overview.bridge.connectionCount", {
              defaultValue:
                "observer / control 当前连接数：{{observerCount}}/{{controlCount}}",
              observerCount: runtimeSummary.observerCount,
              controlCount: runtimeSummary.controlCount,
            })}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("bridge")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t(
              "settings.chromeRelay.main.overview.action.viewBridge",
              "查看桥接详情",
            )}
          </button>
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t(
                  "settings.chromeRelay.main.overview.backend.title",
                  "后端策略",
                )}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t(
                  "settings.chromeRelay.main.overview.backend.description",
                  "默认优先级与自动回退开关决定动作链路如何降级。",
                )}
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
                ? t(
                    "settings.chromeRelay.main.overview.backend.fallbackOn",
                    "自动回退开",
                  )
                : t(
                    "settings.chromeRelay.main.overview.backend.fallbackOff",
                    "自动回退关",
                  )}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-900">
            {(draftBackendPolicy?.priority ?? BACKEND_OPTIONS)
              .map((backend) => getBackendLabel(backend))
              .join(" / ")}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t(
              "settings.chromeRelay.main.overview.backend.priorityLabel",
              "当前优先级顺序",
            )}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("backend")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t(
              "settings.chromeRelay.main.overview.action.viewBackend",
              "查看后端详情",
            )}
          </button>
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t(
                  "settings.chromeRelay.main.overview.debug.title",
                  "实时调试",
                )}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t(
                  "settings.chromeRelay.main.overview.debug.description",
                  "需要观察页面、接管输入或排查事件流时再进入调试页签。",
                )}
              </p>
            </div>
            <StatusPill tone={runtimeSessionId ? "success" : "neutral"}>
              {runtimeSessionId
                ? t(
                    "settings.chromeRelay.main.overview.debug.hasSession",
                    "已有会话",
                  )
                : t(
                    "settings.chromeRelay.main.overview.debug.onDemand",
                    "按需进入",
                  )}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t("settings.chromeRelay.main.overview.debug.reusableCount", {
              defaultValue: "当前可复用的 CDP 会话：{{count}}",
              count: runtimeSummary.cdpAliveProfiles,
            })}
          </p>
          <button
            type="button"
            onClick={() => setActiveSectionTab("debug")}
            className={cn(SECONDARY_BUTTON_CLASS_NAME, "mt-4")}
          >
            {t(
              "settings.chromeRelay.main.overview.action.openDebug",
              "打开实时调试",
            )}
          </button>
        </div>
      </div>
    </SurfacePanel>
  );

  const renderUsagePanel = () => (
    <SurfacePanel
      icon={Sparkles}
      title={t("settings.chromeRelay.main.usage.title", "使用建议")}
      description={t(
        "settings.chromeRelay.main.usage.description",
        "按这个顺序处理，页面状态会更稳定，也更容易复用到浏览器协助和实时调试。",
      )}
    >
      <div className="space-y-3">
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t(
              "settings.chromeRelay.main.usage.step1.title",
              "1. 先准备独立 Profile",
            )}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t(
              "settings.chromeRelay.main.usage.step1.description",
              "先为 Google 或小红书打开独立设置窗口，确认账号、语言与内容偏好已经稳定。",
            )}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t(
              "settings.chromeRelay.main.usage.step2.title",
              "2. 再接通扩展桥接",
            )}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t(
              "settings.chromeRelay.main.usage.step2.description",
              "observer 连上以后，扩展才会持续回传页面信息。这样排查桥接链路会更直观。",
            )}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t(
              "settings.chromeRelay.main.usage.step3.title",
              "3. 需要人工介入时再开调试窗口",
            )}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t(
              "settings.chromeRelay.main.usage.step3.description",
              "顶部的独立调试窗口和底部实时调试面板都能复用当前目标 Profile，适合需要观察页面变化或临时接管输入的时刻。",
            )}
          </p>
        </div>
      </div>
    </SurfacePanel>
  );

  const renderDebugPanel = () => (
    <SurfacePanel
      icon={Bug}
      title={t("settings.chromeRelay.main.debug.title", "浏览器实时调试")}
      description={t(
        "settings.chromeRelay.main.debug.description",
        "底部直接复用浏览器实时会话面板。适合观察事件流、查看画面并在必要时接管当前页面。",
      )}
    >
      <Suspense
        fallback={
          <DeferredPanelFallback
            message={t(
              "settings.chromeRelay.main.debug.loading",
              "正在准备浏览器实时调试...",
            )}
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
      ? t("settings.chromeRelay.main.installStatus.installed", {
          defaultValue: "已安装",
        })
      : browserConnectorInstallStatus?.status === "update_available"
        ? t("settings.chromeRelay.main.installStatus.updateAvailable", {
            defaultValue: "可更新",
          })
        : browserConnectorInstallStatus?.status === "broken"
          ? t("settings.chromeRelay.main.installStatus.broken", {
              defaultValue: "安装异常",
            })
          : t("settings.chromeRelay.main.installStatus.notInstalled", {
              defaultValue: "未安装",
            });
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
    ? t("settings.chromeRelay.main.systemConnector.macTitle", {
        defaultValue: "macOS 连接器",
      })
    : t("settings.chromeRelay.main.systemConnector.genericTitle", {
        defaultValue: "系统连接器",
      });
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
          {
            defaultValue: "当前平台不支持",
          },
        );
      }
      if (
        connector.enabled &&
        connector.authorization_status === "authorized"
      ) {
        return t("settings.chromeRelay.main.systemConnector.status.enabled", {
          defaultValue: "已启用",
        });
      }
      switch (connector.authorization_status) {
        case "authorized":
          return t(
            "settings.chromeRelay.main.systemConnector.status.authorized",
            {
              defaultValue: "已授权",
            },
          );
        case "denied":
          return t("settings.chromeRelay.main.systemConnector.status.denied", {
            defaultValue: "授权被拒绝",
          });
        case "error":
          return t("settings.chromeRelay.main.systemConnector.status.error", {
            defaultValue: "授权异常",
          });
        default:
          return t("settings.chromeRelay.main.systemConnector.status.pending", {
            defaultValue: "等待授权",
          });
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
            {t("settings.chromeRelay.main.action.closeMessage", "关闭")}
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
                  {t("settings.chromeRelay.main.core.eyebrow", "浏览器")}
                </div>

                <div className="rounded-[18px] border border-border bg-card px-4 py-3 text-card-foreground shadow-sm shadow-slate-950/5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t(
                      "settings.chromeRelay.main.core.systemEnvironment.title",
                      "系统环境",
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <span className="font-semibold text-foreground">
                      {window.navigator.platform.toLowerCase().includes("mac")
                        ? "macOS"
                        : window.navigator.platform ||
                          t(
                            "settings.chromeRelay.main.core.systemEnvironment.currentSystem",
                            "当前系统",
                          )}
                    </span>
                    <span className="h-4 w-px bg-border" />
                    <span className="text-muted-foreground">
                      {t(
                        "settings.chromeRelay.main.core.systemEnvironment.archLabel",
                        "系统架构",
                      )}{" "}
                      {window.navigator.platform.includes("arm")
                        ? "arm64"
                        : t(
                            "settings.chromeRelay.main.core.systemEnvironment.currentArch",
                            "当前架构",
                          )}
                    </span>
                  </div>
                </div>

                <section className="rounded-[22px] bg-card p-5 text-card-foreground shadow-sm shadow-slate-950/5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-foreground">
                      {t(
                        "settings.chromeRelay.main.core.browserList.title",
                        "浏览器列表",
                      )}
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
                      {t("settings.chromeRelay.main.action.rescan", "重新扫描")}
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
                                "使用中",
                              )}
                            </StatusPill>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <StatusPill tone="neutral">M144+</StatusPill>
                            <span>
                              {t(
                                "settings.chromeRelay.main.core.browserList.currentChrome",
                                "当前 Chrome",
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
                          "开启浏览器连接器",
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
                      {t(
                        "settings.chromeRelay.main.core.chrome.description",
                        "功能最完整 — 支持扩展中继和 CDP 直连两种方式。",
                      )}
                    </p>

                    <div className="mt-4 space-y-3 pl-[52px]">
                      <div className="rounded-[14px] border border-border bg-muted/30 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {t(
                                  "settings.chromeRelay.main.core.extension.title",
                                  "通过扩展连接",
                                )}
                              </p>
                              <StatusPill tone="success">
                                {t(
                                  "settings.chromeRelay.main.status.recommended",
                                  "推荐",
                                )}
                              </StatusPill>
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {t(
                                "settings.chromeRelay.main.core.extension.description",
                                "通过浏览器扩展连接，适用于所有 Chromium 浏览器。",
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
                              ? t(
                                  "settings.chromeRelay.main.action.opening",
                                  "打开中...",
                                )
                              : t(
                                  "settings.chromeRelay.main.action.connectionGuide",
                                  "连接引导",
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
                                {t(
                                  "settings.chromeRelay.main.core.cdp.title",
                                  "CDP 直连",
                                )}
                              </p>
                              <StatusPill tone="neutral">Beta</StatusPill>
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {t(
                                "settings.chromeRelay.main.core.cdp.description",
                                "通过 Chrome DevTools Protocol 直连，推荐 Chrome M144+。",
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
                              ? t(
                                  "settings.chromeRelay.main.action.opening",
                                  "打开中...",
                                )
                              : t(
                                  "settings.chromeRelay.main.action.configGuide",
                                  "配置引导",
                                )}
                          </button>
                        </div>
                        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                          <p className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {t(
                              "settings.chromeRelay.main.core.cdp.versionOk",
                              "Chrome M144+，版本符合要求",
                            )}
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
                                  "已通过 Chrome 连接",
                                )
                              : t(
                                  "settings.chromeRelay.main.core.cdp.waiting",
                                  "等待 Chrome 连接",
                                )}
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
                              "调试会话",
                            )}
                            {runtimeSessionId
                              ? t(
                                  "settings.chromeRelay.main.core.cdp.debugConnected",
                                  "已连接",
                                )
                              : t(
                                  "settings.chromeRelay.main.core.cdp.debugDisconnected",
                                  "未连接",
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
                                      "请求中...",
                                    )
                                  : t(
                                      "settings.chromeRelay.main.action.requestConnection",
                                      "发送连接请求",
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
                                "内置 Chromium",
                              )}
                            </p>
                            <StatusPill tone="neutral">
                              {t(
                                "settings.chromeRelay.main.installStatus.notInstalled",
                                "未安装",
                              )}
                            </StatusPill>
                            <StatusPill tone="neutral">
                              {t(
                                "settings.chromeRelay.main.status.comingSoon",
                                "尚未支持，敬请期待",
                              )}
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
                                "不支持",
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
                    {t(
                      "settings.chromeRelay.main.core.onlyChrome",
                      "目前仅支持 Google Chrome，其他浏览器支持即将推出。",
                    )}
                  </p>
                </section>

                <section className="space-y-3">
                  <div className="rounded-[18px] bg-card p-4 shadow-sm shadow-slate-950/5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {t(
                            "settings.chromeRelay.main.core.advanced.title",
                            "高级工具",
                          )}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {t(
                            "settings.chromeRelay.main.core.advanced.description",
                            "Profile 会话、动作配置、后端策略和实时调试集中放在这里。",
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
                          "打开高级工具",
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
                  {t(
                    "settings.chromeRelay.main.action.backToBrowserList",
                    "返回浏览器列表",
                  )}
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
                      {t(
                        "settings.chromeRelay.main.connectionMethod.title",
                        "连接方式",
                      )}
                    </h3>
                    <p className="text-xs leading-5 text-slate-500">
                      {t(
                        "settings.chromeRelay.main.connectionMethod.description",
                        "常用优先扩展，调试再用 CDP。",
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
                              "浏览器扩展",
                            )}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {t(
                              "settings.chromeRelay.main.connectionMethod.extension.description",
                              "安装一次，长期自动连接。",
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
                                "推荐",
                              )
                            : t(
                                "settings.chromeRelay.main.connectionMethod.extension.status.pending",
                                "待完成",
                              )}
                        </StatusPill>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {t(
                          "settings.chromeRelay.main.connectionMethod.extension.body",
                          "安装步骤已移入独立引导窗口；这里保留快捷入口和调试操作。",
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
                            ? t(
                                "settings.chromeRelay.main.action.opening",
                                "打开中...",
                              )
                            : t(
                                "settings.chromeRelay.main.action.connectionGuide",
                                "连接引导",
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
                            ? t(
                                "settings.chromeRelay.main.action.opening",
                                "打开中...",
                              )
                            : t(
                                "settings.chromeRelay.main.connectionMethod.extension.action.openExtensions",
                                "打开扩展页",
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
                            "复制扩展页地址",
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
                              "CDP 直连",
                            )}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {t(
                              "settings.chromeRelay.main.connectionMethod.cdp.description",
                              "零扩展，适合临时调试和人工接管。",
                            )}
                          </p>
                        </div>
                        <StatusPill
                          tone={hasCdpDirectAvailable ? "success" : "warning"}
                        >
                          {hasCdpDirectAvailable
                            ? t(
                                "settings.chromeRelay.main.connectionMethod.cdp.status.ready",
                                "已就绪",
                              )
                            : t(
                                "settings.chromeRelay.main.connectionMethod.cdp.status.pending",
                                "待接入",
                              )}
                        </StatusPill>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {t(
                          "settings.chromeRelay.main.connectionMethod.cdp.body",
                          "直连步骤已移入独立引导窗口；这里保留远程调试快捷入口。",
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
                            ? t(
                                "settings.chromeRelay.main.action.opening",
                                "打开中...",
                              )
                            : t(
                                "settings.chromeRelay.main.action.configGuide",
                                "配置引导",
                              )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenRemoteDebuggingPage()}
                          disabled={openingRemoteDebuggingPage}
                          className={SECONDARY_BUTTON_CLASS_NAME}
                        >
                          <ExternalLink className="h-4 w-4" />
                          {openingRemoteDebuggingPage
                            ? t(
                                "settings.chromeRelay.main.action.opening",
                                "打开中...",
                              )
                            : t(
                                "settings.chromeRelay.main.connectionMethod.cdp.action.openRemoteDebugging",
                                "打开远程调试页",
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
                            "复制远程调试地址",
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
                            "默认浏览器连接器",
                          ),
                        )
                      }
                      disabled={!bridgeEndpoint}
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      <Copy className="h-4 w-4" />
                      {t(
                        "settings.chromeRelay.main.action.copyConfig",
                        "复制配置",
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDisconnectBrowserConnector()}
                      disabled={!hasObserverConnected || disconnectingConnector}
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      {disconnectingConnector
                        ? t(
                            "settings.chromeRelay.main.action.disconnecting",
                            "断开中...",
                          )
                        : t(
                            "settings.chromeRelay.main.action.disconnectConnectedExtension",
                            "断开已连接扩展",
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
                            "按需开启系统能力，把授权和系统访问集中放在这里。",
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-slate-500">
                        {t(
                          "settings.chromeRelay.main.systemConnector.enabledCount",
                          {
                            defaultValue: "{{enabled}} / {{count}} 已启用",
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
                                    defaultValue: "能力：{{capabilities}}",
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
                                defaultValue: "切换{{label}}",
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
                      {t(
                        "settings.chromeRelay.main.advancedControl.title",
                        "高级控制",
                      )}
                    </h3>
                    <p className="text-sm leading-6 text-slate-500">
                      {t(
                        "settings.chromeRelay.main.advancedControl.description",
                        "这里集中放 Profile 会话、扩展桥接、后端策略和实时调试。",
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
                        ? t(
                            "settings.chromeRelay.main.action.launching",
                            "启动中...",
                          )
                        : t(
                            "settings.chromeRelay.main.action.launchBrowserAssist",
                            "一键启动浏览器协助",
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
                        ? t(
                            "settings.chromeRelay.main.action.opening",
                            "打开中...",
                          )
                        : t(
                            "settings.chromeRelay.main.action.openStandaloneDebugger",
                            "打开独立调试窗口",
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
                      {t(
                        "settings.chromeRelay.main.action.refreshStatus",
                        "刷新状态",
                      )}
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
                          t("settings.chromeRelay.main.tab.overview", "总览"),
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
                          t("settings.chromeRelay.main.tab.bridge", "桥接"),
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
                          t("settings.chromeRelay.main.tab.backend", "后端"),
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
                          t("settings.chromeRelay.main.tab.debug", "调试"),
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
