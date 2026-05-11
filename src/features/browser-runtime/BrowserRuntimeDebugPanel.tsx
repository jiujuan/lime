import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Bug,
  ExternalLink,
  Globe,
  Hand,
  Pause,
  Play,
  RefreshCw,
  Send,
} from "lucide-react";
import { formatNumber } from "@/i18n/format";
import type {
  BrowserRuntimeAuditRecord,
  ChromeProfileSessionInfo,
} from "@/lib/webview-api";
import { browserRuntimeApi } from "./api";
import { BrowserSiteAdapterPanel } from "./BrowserSiteAdapterPanel";
import { getExistingSessionTabLabel } from "./existingSessionBridge";
import {
  useExistingSessionAttachPanel,
  type ExistingSessionAttachPanelCopy,
} from "./useExistingSessionAttachPanel";
import { useBrowserRuntimeDebug } from "./useBrowserRuntimeDebug";

interface BrowserRuntimeDebugPanelProps {
  sessions: ChromeProfileSessionInfo[];
  onMessage?: (message: { type: "success" | "error"; text: string }) => void;
  showStandaloneWindowButton?: boolean;
  showSiteAdapterPanel?: boolean;
  initialProfileKey?: string;
  initialSessionId?: string;
  initialTargetId?: string;
  embedded?: boolean;
}

type BrowserRuntimeStatusCopy = {
  agentResumingDescription: string;
  agentResumingLabel: string;
  closedDescription: string;
  closedLabel: string;
  connectingDescription: string;
  connectingLabel: string;
  disconnectedDescription: string;
  disconnectedLabel: string;
  failedDescription: string;
  failedLabel: string;
  humanControllingDescription: string;
  humanControllingLabel: string;
  runningDescription: string;
  runningLabel: string;
  waitingForHumanDescription: string;
  waitingForHumanLabel: string;
};

type LiveViewPlaceholderCopy = {
  connecting: string;
  launching: string;
  noSession: string;
  waitingFrame: string;
};

function formatEventSubtitle(event: {
  type: string;
  occurred_at: string;
  text?: string;
  url?: string;
  status?: number;
}) {
  if (event.type === "console_message") {
    return event.text || "";
  }
  if (event.type === "network_response") {
    return `${event.status || "-"} · ${event.url || ""}`;
  }
  if (event.type === "network_request") {
    return event.url || "";
  }
  return event.occurred_at;
}

function resolveSessionStatus(
  sessionState: {
    connected: boolean;
    lifecycle_state: string;
    human_reason?: string;
    last_error?: string;
  } | null,
  copy: BrowserRuntimeStatusCopy,
) {
  if (!sessionState) {
    return {
      label: copy.disconnectedLabel,
      toneClass: "border-border/70 bg-muted/40 text-muted-foreground",
      description: copy.disconnectedDescription,
    };
  }

  switch (sessionState.lifecycle_state) {
    case "human_controlling":
      return {
        label: copy.humanControllingLabel,
        toneClass:
          "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200",
        description:
          sessionState.human_reason || copy.humanControllingDescription,
      };
    case "waiting_for_human":
      return {
        label: copy.waitingForHumanLabel,
        toneClass:
          "border-orange-300/70 bg-orange-50 text-orange-800 dark:border-orange-800/70 dark:bg-orange-950/30 dark:text-orange-200",
        description:
          sessionState.human_reason || copy.waitingForHumanDescription,
      };
    case "agent_resuming":
      return {
        label: copy.agentResumingLabel,
        toneClass:
          "border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-200",
        description: sessionState.human_reason || copy.agentResumingDescription,
      };
    case "failed":
      return {
        label: copy.failedLabel,
        toneClass: "border-destructive/60 bg-destructive/10 text-destructive",
        description: sessionState.last_error || copy.failedDescription,
      };
    case "closed":
      return {
        label: copy.closedLabel,
        toneClass: "border-border/70 bg-muted/40 text-muted-foreground",
        description: copy.closedDescription,
      };
    case "launching":
      return {
        label: copy.connectingLabel,
        toneClass:
          "border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-200",
        description: copy.connectingDescription,
      };
    default:
      return {
        label: sessionState.connected
          ? copy.runningLabel
          : copy.disconnectedLabel,
        toneClass:
          "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200",
        description: copy.runningDescription,
      };
  }
}

function resolveFrameCoordinate(params: {
  clientX: number;
  clientY: number;
  rect: DOMRect;
  frameWidth?: number;
  frameHeight?: number;
}) {
  const { clientX, clientY, rect, frameWidth, frameHeight } = params;
  if (!frameWidth || !frameHeight || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const frameAspect = frameWidth / frameHeight;
  const containerAspect = rect.width / rect.height;
  let renderedWidth = rect.width;
  let renderedHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (frameAspect > containerAspect) {
    renderedHeight = rect.width / frameAspect;
    offsetY = (rect.height - renderedHeight) / 2;
  } else {
    renderedWidth = rect.height * frameAspect;
    offsetX = (rect.width - renderedWidth) / 2;
  }

  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  if (
    localX < 0 ||
    localY < 0 ||
    localX > renderedWidth ||
    localY > renderedHeight
  ) {
    return null;
  }

  return {
    x: (localX / renderedWidth) * frameWidth,
    y: (localY / renderedHeight) * frameHeight,
  };
}

function resolveLiveViewPlaceholder(
  params: {
    sessionCount: number;
    hasAttachIntent: boolean;
    openingSession: boolean;
    refreshingState: boolean;
    sessionState: {
      connected: boolean;
      lifecycle_state: string;
    } | null;
  },
  copy: LiveViewPlaceholderCopy,
) {
  const {
    sessionCount,
    hasAttachIntent,
    openingSession,
    refreshingState,
    sessionState,
  } = params;

  if (sessionCount === 0 && !hasAttachIntent) {
    return copy.noSession;
  }

  if (openingSession || refreshingState) {
    return copy.launching;
  }

  if (sessionState) {
    return copy.waitingFrame;
  }

  return copy.connecting;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function summarizePageMarkdown(markdown: string, maxLines = 6) {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= maxLines) {
    return lines.join("\n");
  }

  return `${lines.slice(0, maxLines).join("\n")}\n...`;
}

function formatAuditTime(value: string) {
  const time = value.split("T")[1];
  if (!time) {
    return value;
  }
  return time.replace("Z", "").slice(0, 8);
}

type AuditRecordCopy = {
  actionAudit: string;
  actionTitle: (action: string) => string;
  attempts: (value: string) => string;
  launchFailure: string;
  launchSuccess: string;
  newSession: string;
  profileMissing: string;
  reusedSession: string;
  targetMissing: string;
};

function describeAuditRecord(
  record: BrowserRuntimeAuditRecord,
  copy: AuditRecordCopy,
) {
  if (record.kind === "launch") {
    return {
      title: record.success ? copy.launchSuccess : copy.launchFailure,
      subject:
        record.url ||
        record.session_id ||
        record.target_id ||
        copy.targetMissing,
      meta: [
        record.environment_preset_name,
        record.reused === undefined
          ? undefined
          : record.reused
            ? copy.reusedSession
            : copy.newSession,
        record.browser_source,
        record.remote_debugging_port
          ? `CDP ${record.remote_debugging_port}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  return {
    title: record.action ? copy.actionTitle(record.action) : copy.actionAudit,
    subject: record.profile_key || record.session_id || copy.profileMissing,
    meta: [
      record.selected_backend || record.requested_backend,
      record.attempts?.length
        ? copy.attempts(String(record.attempts.length))
        : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function BrowserRuntimeDebugPanel(props: BrowserRuntimeDebugPanelProps) {
  const {
    sessions,
    onMessage,
    showStandaloneWindowButton = true,
    showSiteAdapterPanel = true,
    initialProfileKey,
    initialSessionId,
    initialTargetId,
    embedded = false,
  } = props;
  const { t, i18n } = useTranslation("workspace");
  const formatCount = useCallback(
    (value: number) => formatNumber(value, { locale: i18n.language }),
    [i18n.language],
  );
  const runtime = useBrowserRuntimeDebug(sessions, onMessage, {
    initialProfileKey,
    initialSessionId,
    initialTargetId,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [auditLogs, setAuditLogs] = useState<BrowserRuntimeAuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const liveViewRef = useRef<HTMLDivElement | null>(null);
  const existingSessionAttachCopy = useMemo<ExistingSessionAttachPanelCopy>(
    () => ({
      presentation: {
        status: {
          checking: {
            label: t(
              "workspace.browserExistingSession.presentation.status.checking.label",
            ),
            description: t(
              "workspace.browserExistingSession.presentation.status.checking.description",
            ),
          },
          waiting: {
            label: t(
              "workspace.browserExistingSession.presentation.status.waiting.label",
            ),
            description: t(
              "workspace.browserExistingSession.presentation.status.waiting.description",
            ),
          },
          reading: {
            label: t(
              "workspace.browserExistingSession.presentation.status.reading.label",
            ),
            description: t(
              "workspace.browserExistingSession.presentation.status.reading.description",
            ),
          },
          attached: {
            label: t(
              "workspace.browserExistingSession.presentation.status.attached.label",
            ),
            description: t(
              "workspace.browserExistingSession.presentation.status.attached.description",
            ),
          },
        },
        placeholder: {
          default: t(
            "workspace.browserExistingSession.presentation.placeholder.default",
          ),
          checking: t(
            "workspace.browserExistingSession.presentation.placeholder.checking",
          ),
          waiting: t(
            "workspace.browserExistingSession.presentation.placeholder.waiting",
          ),
          reading: t(
            "workspace.browserExistingSession.presentation.placeholder.reading",
          ),
        },
        actions: {
          reading: t(
            "workspace.browserExistingSession.presentation.actions.reading",
          ),
          checking: t(
            "workspace.browserExistingSession.presentation.actions.checking",
          ),
          readPage: t(
            "workspace.browserExistingSession.presentation.actions.readPage",
          ),
          refreshBridge: t(
            "workspace.browserExistingSession.presentation.actions.refreshBridge",
          ),
          refreshing: t(
            "workspace.browserExistingSession.presentation.actions.refreshing",
          ),
          refreshBridgeStatus: t(
            "workspace.browserExistingSession.presentation.actions.refreshBridgeStatus",
          ),
          readCurrentPage: t(
            "workspace.browserExistingSession.presentation.actions.readCurrentPage",
          ),
          readTabs: t(
            "workspace.browserExistingSession.presentation.actions.readTabs",
          ),
        },
        hint: {
          embedded: {
            connected: t(
              "workspace.browserExistingSession.presentation.hint.embedded.connected",
            ),
            waiting: t(
              "workspace.browserExistingSession.presentation.hint.embedded.waiting",
            ),
          },
          live: {
            connected: t(
              "workspace.browserExistingSession.presentation.hint.live.connected",
            ),
            waiting: t(
              "workspace.browserExistingSession.presentation.hint.live.waiting",
            ),
          },
        },
      },
      attachStatusLoadFailed: (message) =>
        t("workspace.browserExistingSession.feedback.attachStatusLoadFailed", {
          message,
        }),
      pageReadSuccess: t(
        "workspace.browserExistingSession.feedback.pageReadSuccess",
      ),
      pageReadFailed: (message) =>
        t("workspace.browserExistingSession.feedback.pageReadFailed", {
          message,
        }),
      tabsLoadFailed: (message) =>
        t("workspace.browserExistingSession.feedback.tabsLoadFailed", {
          message,
        }),
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
  const auditRecordCopy = useMemo<AuditRecordCopy>(
    () => ({
      actionAudit: t("workspace.browserRuntimeDebug.audit.actionAudit"),
      actionTitle: (action) =>
        t("workspace.browserRuntimeDebug.audit.actionTitle", {
          action,
        }),
      attempts: (value) =>
        t("workspace.browserRuntimeDebug.audit.attempts", {
          value,
        }),
      launchFailure: t("workspace.browserRuntimeDebug.audit.launchFailure"),
      launchSuccess: t("workspace.browserRuntimeDebug.audit.launchSuccess"),
      newSession: t("workspace.browserRuntimeDebug.audit.newSession"),
      profileMissing: t("workspace.browserRuntimeDebug.audit.profileMissing"),
      reusedSession: t("workspace.browserRuntimeDebug.audit.reusedSession"),
      targetMissing: t("workspace.browserRuntimeDebug.audit.targetMissing"),
    }),
    [t],
  );
  const {
    activeAttachProfileKey,
    attachProfile,
    attachObserver,
    attachContextLoading,
    attachPageLoading,
    attachTabsLoading,
    attachTabs,
    switchingAttachTabId,
    attachPageInfo,
    shouldUseAttachPresentation,
    attachPresentation,
    loadAttachContext,
    loadAttachPage,
    loadAttachTabs,
    handleSwitchAttachTab,
  } = useExistingSessionAttachPanel({
    selectedProfileKey: runtime.selectedProfileKey,
    initialProfileKey,
    sessionState: runtime.sessionState,
    copy: existingSessionAttachCopy,
    onMessage,
  });
  const preferRuntimeLivePresentation =
    runtime.isExistingSessionProfile &&
    !runtime.runtimeConnectionError &&
    Boolean(
      runtime.sessionState ||
      runtime.openingSession ||
      runtime.refreshingState ||
      runtime.selectedSession,
    );
  const showAttachPresentation =
    shouldUseAttachPresentation && !preferRuntimeLivePresentation;
  const statusCopy = useMemo<BrowserRuntimeStatusCopy>(
    () => ({
      agentResumingDescription: t(
        "workspace.browserRuntimeDebug.status.agentResumingDescription",
      ),
      agentResumingLabel: t(
        "workspace.browserRuntimeDebug.status.agentResumingLabel",
      ),
      closedDescription: t(
        "workspace.browserRuntimeDebug.status.closedDescription",
      ),
      closedLabel: t("workspace.browserRuntimeDebug.status.closedLabel"),
      connectingDescription: t(
        "workspace.browserRuntimeDebug.status.connectingDescription",
      ),
      connectingLabel: t(
        "workspace.browserRuntimeDebug.status.connectingLabel",
      ),
      disconnectedDescription: t(
        "workspace.browserRuntimeDebug.status.disconnectedDescription",
      ),
      disconnectedLabel: t(
        "workspace.browserRuntimeDebug.status.disconnectedLabel",
      ),
      failedDescription: t(
        "workspace.browserRuntimeDebug.status.failedDescription",
      ),
      failedLabel: t("workspace.browserRuntimeDebug.status.failedLabel"),
      humanControllingDescription: t(
        "workspace.browserRuntimeDebug.status.humanControllingDescription",
      ),
      humanControllingLabel: t(
        "workspace.browserRuntimeDebug.status.humanControllingLabel",
      ),
      runningDescription: t(
        "workspace.browserRuntimeDebug.status.runningDescription",
      ),
      runningLabel: t("workspace.browserRuntimeDebug.status.runningLabel"),
      waitingForHumanDescription: t(
        "workspace.browserRuntimeDebug.status.waitingForHumanDescription",
      ),
      waitingForHumanLabel: t(
        "workspace.browserRuntimeDebug.status.waitingForHumanLabel",
      ),
    }),
    [t],
  );
  const liveViewPlaceholderCopy = useMemo<LiveViewPlaceholderCopy>(
    () => ({
      connecting: t("workspace.browserRuntimeDebug.liveView.connecting"),
      launching: t("workspace.browserRuntimeDebug.liveView.launching"),
      noSession: t("workspace.browserRuntimeDebug.liveView.noSession"),
      waitingFrame: t("workspace.browserRuntimeDebug.liveView.waitingFrame"),
    }),
    [t],
  );

  const currentTitle =
    runtime.sessionState?.last_page_info?.title ||
    runtime.sessionState?.target_title ||
    attachPageInfo?.title ||
    attachProfile?.name ||
    (showAttachPresentation
      ? t("workspace.browserRuntimeDebug.fallback.attachedChromeTitle")
      : t("workspace.browserRuntimeDebug.fallback.noSessionTitle"));
  const currentUrl =
    runtime.sessionState?.last_page_info?.url ||
    runtime.sessionState?.target_url ||
    attachPageInfo?.url ||
    runtime.selectedSession?.last_url ||
    "";
  const statusInfo = useMemo(
    () =>
      showAttachPresentation
        ? attachPresentation.statusInfo
        : resolveSessionStatus(runtime.sessionState, statusCopy),
    [
      attachPresentation.statusInfo,
      runtime.sessionState,
      showAttachPresentation,
      statusCopy,
    ],
  );
  const hasAttachIntent = Boolean(
    runtime.sessionState ||
    runtime.selectedProfileKey ||
    initialProfileKey ||
    initialSessionId,
  );
  const compactActionButtonClass =
    "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted disabled:opacity-60";
  const embeddedIconButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border/70 bg-background/90 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60";
  const embeddedPrimaryButtonClass =
    "inline-flex h-8 items-center gap-1 rounded-[10px] border px-2.5 text-xs font-medium transition-colors disabled:opacity-60";
  const showEmbeddedControlTray =
    runtime.canDirectControl ||
    runtime.isWaitingForHuman ||
    runtime.isHumanControlling ||
    showAdvanced;
  const auditProfileKey =
    runtime.sessionState?.profile_key ||
    runtime.selectedProfileKey ||
    initialProfileKey ||
    "";
  const auditSessionId = runtime.sessionState?.session_id || "";
  const liveViewPlaceholder = resolveLiveViewPlaceholder(
    {
      sessionCount: sessions.length,
      hasAttachIntent,
      openingSession: runtime.openingSession,
      refreshingState: runtime.refreshingState,
      sessionState: runtime.sessionState,
    },
    liveViewPlaceholderCopy,
  );
  const effectiveLiveViewPlaceholder = showAttachPresentation
    ? attachPresentation.placeholder
    : liveViewPlaceholder;
  const visibleAuditLogs = useMemo(() => {
    const filtered = auditLogs.filter((record) => {
      if (auditSessionId && record.session_id === auditSessionId) {
        return true;
      }
      if (auditProfileKey && record.profile_key === auditProfileKey) {
        return true;
      }
      return false;
    });
    return (filtered.length > 0 ? filtered : auditLogs).slice(0, 6);
  }, [auditLogs, auditProfileKey, auditSessionId]);

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const logs = await browserRuntimeApi.getBrowserRuntimeAuditLogs(16);
      setAuditLogs(logs);
    } catch (error) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserRuntimeDebug.feedback.auditLoadFailed", {
          message: getErrorMessage(error),
        }),
      });
    } finally {
      setAuditLoading(false);
    }
  }, [onMessage, t]);

  useEffect(() => {
    if (!showAdvanced) {
      return;
    }
    void loadAuditLogs();
  }, [showAdvanced, loadAuditLogs, auditProfileKey, auditSessionId]);

  const renderAuditPanel = (maxHeightClass: string) => (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">
            {t("workspace.browserRuntimeDebug.audit.title")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("workspace.browserRuntimeDebug.audit.description")}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-60"
          onClick={() => void loadAuditLogs()}
          disabled={auditLoading}
        >
          <RefreshCw
            className={`h-3 w-3 ${auditLoading ? "animate-spin" : ""}`}
          />
          {t("workspace.browserRuntimeDebug.actions.refresh")}
        </button>
      </div>
      <div className={`space-y-2 overflow-auto text-xs ${maxHeightClass}`}>
        {auditLoading && visibleAuditLogs.length === 0 ? (
          <div className="text-muted-foreground">
            {t("workspace.browserRuntimeDebug.audit.loading")}
          </div>
        ) : visibleAuditLogs.length === 0 ? (
          <div className="text-muted-foreground">
            {t("workspace.browserRuntimeDebug.audit.empty")}
          </div>
        ) : (
          visibleAuditLogs.map((record) => {
            const description = describeAuditRecord(record, auditRecordCopy);
            return (
              <div
                key={record.id}
                className={`rounded border p-2 ${
                  record.success
                    ? "border-border/80"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-foreground/90">
                    {description.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatAuditTime(record.created_at)}
                  </div>
                </div>
                <div className="mt-1 break-all text-muted-foreground">
                  {description.subject}
                </div>
                {description.meta ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {description.meta}
                  </div>
                ) : null}
                {record.error ? (
                  <div className="mt-1 text-[11px] text-destructive">
                    {record.error}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderAttachTabsPanel = (maxHeightClass: string) => (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">
            {t("workspace.browserRuntimeDebug.attachTabs.title")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("workspace.browserRuntimeDebug.attachTabs.description")}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-60"
          onClick={() => void loadAttachTabs()}
          disabled={attachTabsLoading || !attachObserver}
        >
          <RefreshCw
            className={`h-3 w-3 ${attachTabsLoading ? "animate-spin" : ""}`}
          />
          {attachTabsLoading
            ? t("workspace.browserRuntimeDebug.attachTabs.loading")
            : t("workspace.browserRuntimeDebug.attachTabs.refresh")}
        </button>
      </div>

      <div className={`space-y-2 overflow-auto text-xs ${maxHeightClass}`}>
        {!attachObserver ? (
          <div className="text-muted-foreground">
            {t("workspace.browserRuntimeDebug.attachTabs.observerMissing")}
          </div>
        ) : attachTabs.length === 0 ? (
          <div className="text-muted-foreground">
            {t("workspace.browserRuntimeDebug.attachTabs.empty")}
          </div>
        ) : (
          attachTabs.map((tab) => {
            const tabKey = `${activeAttachProfileKey}:${tab.id}`;
            return (
              <div
                key={tabKey}
                className={`rounded border p-2 ${
                  tab.active
                    ? "border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/20"
                    : "border-border/80"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground/90">
                      {getExistingSessionTabLabel(tab)}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {tab.url ||
                        t("workspace.browserRuntimeDebug.value.urlMissing")}
                    </div>
                  </div>
                  {tab.active ? (
                    <span className="rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                      {t("workspace.browserRuntimeDebug.attachTabs.current")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-60"
                      onClick={() => void handleSwitchAttachTab(tab)}
                      disabled={switchingAttachTabId === tab.id}
                    >
                      {switchingAttachTabId === tab.id
                        ? t(
                            "workspace.browserRuntimeDebug.attachTabs.switching",
                          )
                        : t(
                            "workspace.browserRuntimeDebug.attachTabs.switchTo",
                          )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderAttachFallbackPanel = (maxHeightClass: string) => (
    <div className="space-y-3">
      <div className="rounded-md border p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              {t("workspace.browserRuntimeDebug.attachFallback.title")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("workspace.browserRuntimeDebug.attachFallback.description")}
            </div>
          </div>
          <div
            className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusInfo.toneClass}`}
          >
            {statusInfo.label}
          </div>
        </div>

        <div className="grid gap-2 text-xs md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">
              {t("workspace.browserRuntimeDebug.attachFallback.profile")}
            </span>
            <span>{attachProfile?.name || activeAttachProfileKey || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("workspace.browserRuntimeDebug.attachFallback.profileKey")}
            </span>
            <span className="break-all">{activeAttachProfileKey || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("workspace.browserRuntimeDebug.attachFallback.observer")}
            </span>
            <span>
              {attachObserver?.client_id ||
                t("workspace.browserRuntimeDebug.value.disconnected")}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("workspace.browserRuntimeDebug.attachFallback.lastHeartbeat")}
            </span>
            <span>{attachObserver?.last_heartbeat_at || "-"}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
            onClick={() => void loadAttachContext()}
            disabled={attachContextLoading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                attachContextLoading ? "animate-spin" : ""
              }`}
            />
            {attachContextLoading
              ? t("workspace.browserRuntimeDebug.actions.refreshing")
              : t("workspace.browserRuntimeDebug.actions.refreshBridge")}
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
            onClick={() => void loadAttachPage()}
            disabled={attachPageLoading || !attachObserver}
          >
            {attachPageLoading
              ? t("workspace.browserRuntimeDebug.attachPage.loading")
              : t("workspace.browserRuntimeDebug.attachPage.refresh")}
          </button>
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              {t("workspace.browserRuntimeDebug.attachPage.title")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("workspace.browserRuntimeDebug.attachPage.description")}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {attachPageInfo?.updated_at
              ? formatAuditTime(attachPageInfo.updated_at)
              : t("workspace.browserRuntimeDebug.attachPage.notSynced")}
          </div>
        </div>

        {!attachObserver ? (
          <div className="text-xs text-muted-foreground">
            {t("workspace.browserRuntimeDebug.attachPage.observerMissing")}
          </div>
        ) : attachPageInfo ? (
          <div className="space-y-2 text-xs">
            <div>
              <div className="text-[11px] text-muted-foreground">
                {t("workspace.browserRuntimeDebug.attachPage.fields.title")}
              </div>
              <div className="break-all text-foreground/90">
                {attachPageInfo.title ||
                  t("workspace.browserRuntimeDebug.value.titleMissing")}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">
                {t("workspace.browserRuntimeDebug.attachPage.fields.url")}
              </div>
              <div className="break-all text-muted-foreground">
                {attachPageInfo.url ||
                  t("workspace.browserRuntimeDebug.value.urlMissing")}
              </div>
            </div>
            {attachPageInfo.markdown ? (
              <div className="rounded-md bg-muted/35 p-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                {summarizePageMarkdown(attachPageInfo.markdown)}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {t("workspace.browserRuntimeDebug.attachPage.empty")}
          </div>
        )}
      </div>

      {renderAttachTabsPanel(maxHeightClass)}
    </div>
  );

  const handleOpenStandaloneWindow = async () => {
    try {
      await browserRuntimeApi.openBrowserRuntimeDebuggerWindow({
        session_id: runtime.sessionState?.session_id,
        profile_key:
          runtime.sessionState?.profile_key ||
          runtime.selectedProfileKey ||
          initialProfileKey,
      });
      onMessage?.({
        type: "success",
        text: t("workspace.browserRuntimeDebug.feedback.standaloneOpened"),
      });
    } catch (error) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserRuntimeDebug.feedback.standaloneOpenFailed", {
          message: getErrorMessage(error),
        }),
      });
    }
  };

  const handleOpenSystemBrowser = async () => {
    const profileKey =
      runtime.sessionState?.profile_key ||
      runtime.selectedProfileKey ||
      initialProfileKey;
    if (!profileKey || !currentUrl) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserRuntimeDebug.feedback.noBrowserPage"),
      });
      return;
    }

    try {
      await browserRuntimeApi.reopenProfileWindow({
        profile_key: profileKey,
        url: currentUrl,
      });
      onMessage?.({
        type: "success",
        text: t("workspace.browserRuntimeDebug.feedback.systemBrowserOpened"),
      });
    } catch (error) {
      onMessage?.({
        type: "error",
        text: t("workspace.browserRuntimeDebug.feedback.systemBrowserFailed", {
          message: getErrorMessage(error),
        }),
      });
    }
  };

  const handleLiveViewClick = async (event: MouseEvent<HTMLDivElement>) => {
    if (!runtime.canDirectControl || runtime.controlBusy) {
      return;
    }
    const rect = liveViewRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const point = resolveFrameCoordinate({
      clientX: event.clientX,
      clientY: event.clientY,
      rect,
      frameWidth: runtime.latestFrameMetadata?.width,
      frameHeight: runtime.latestFrameMetadata?.height,
    });
    if (!point) {
      return;
    }
    await runtime.clickAt(point.x, point.y);
  };

  const handleLiveViewWheel = async (event: WheelEvent<HTMLDivElement>) => {
    if (!runtime.canDirectControl || runtime.controlBusy) {
      return;
    }
    event.preventDefault();
    await runtime.scrollPage(event.deltaY < 0 ? "up" : "down");
  };

  const handleSendManualInput = async () => {
    const value = manualInput.trim();
    if (!value) {
      return;
    }
    await runtime.typeIntoFocusedElement(value);
    setManualInput("");
  };

  if (embedded) {
    const embeddedAction = showAttachPresentation ? (
      <button
        type="button"
        className={embeddedPrimaryButtonClass}
        onClick={() =>
          void (attachPresentation.observerConnected
            ? loadAttachPage()
            : loadAttachContext())
        }
        disabled={attachPageLoading || attachContextLoading}
      >
        {attachPresentation.embeddedActionLabel}
      </button>
    ) : !runtime.sessionState ? (
      <button
        type="button"
        className={embeddedPrimaryButtonClass}
        onClick={() => void runtime.openSession()}
        disabled={runtime.openingSession || !runtime.selectedProfileKey}
      >
        {runtime.openingSession
          ? t("workspace.browserRuntimeDebug.actions.connectingShort")
          : t("workspace.browserRuntimeDebug.actions.connectShort")}
      </button>
    ) : runtime.isHumanControlling ? (
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-emerald-300/70 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200"
        onClick={() => void runtime.resumeSession()}
        disabled={runtime.controlBusy}
      >
        <Play className="h-3.5 w-3.5" />
        {runtime.controlBusy
          ? t("workspace.browserRuntimeDebug.actions.processingShort")
          : t("workspace.browserRuntimeDebug.actions.continueShort")}
      </button>
    ) : runtime.isWaitingForHuman ? (
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-amber-300/70 bg-amber-50 px-2.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200"
        onClick={() => void runtime.takeOverSession()}
        disabled={runtime.controlBusy}
      >
        <Hand className="h-3.5 w-3.5" />
        {t("workspace.browserRuntimeDebug.actions.handleShort")}
      </button>
    ) : (
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-amber-300/70 bg-amber-50 px-2.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200"
        onClick={() => void runtime.takeOverSession()}
        disabled={runtime.controlBusy || runtime.isAgentResuming}
      >
        <Hand className="h-3.5 w-3.5" />
        {runtime.isAgentResuming
          ? t("workspace.browserRuntimeDebug.actions.resumingShort")
          : t("workspace.browserRuntimeDebug.actions.takeOverShort")}
      </button>
    );

    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-3 py-2">
          <div className="hidden items-center gap-1.5 md:flex">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="min-w-0 flex-1 rounded-[12px] border border-border/70 bg-background/95 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  runtime.sessionState?.connected
                    ? runtime.isHumanControlling
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                    : "bg-muted-foreground/50"
                }`}
              />
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-[12px] text-foreground/90">
                {currentUrl ||
                  t("workspace.browserRuntimeDebug.fallback.preparingSession")}
              </span>
            </div>
          </div>
          <div
            className={`hidden rounded-full border px-2 py-1 text-[11px] font-medium lg:block ${statusInfo.toneClass}`}
          >
            {statusInfo.label}
          </div>
          {embeddedAction}
          <button
            type="button"
            className={embeddedIconButtonClass}
            onClick={() =>
              void (showAttachPresentation
                ? loadAttachContext()
                : runtime.refreshSessionState())
            }
            disabled={
              showAttachPresentation
                ? attachContextLoading
                : runtime.refreshingState || !runtime.sessionState
            }
            aria-label={
              showAttachPresentation
                ? t("workspace.browserRuntimeDebug.actions.refreshBridge")
                : t("workspace.browserRuntimeDebug.actions.refreshSession")
            }
            title={
              showAttachPresentation
                ? t("workspace.browserRuntimeDebug.actions.refreshBridge")
                : t("workspace.browserRuntimeDebug.actions.refreshSession")
            }
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                showAttachPresentation
                  ? attachContextLoading
                    ? "animate-spin"
                    : ""
                  : runtime.refreshingState
                    ? "animate-spin"
                    : ""
              }`}
            />
          </button>
          {showStandaloneWindowButton ? (
            <button
              type="button"
              className={embeddedIconButtonClass}
              onClick={() => void handleOpenStandaloneWindow()}
              aria-label={t("workspace.browserRuntimeDebug.actions.standalone")}
              title={t("workspace.browserRuntimeDebug.actions.standalone")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className={embeddedIconButtonClass}
            onClick={() => setShowAdvanced((value) => !value)}
            aria-label={
              showAdvanced
                ? t("workspace.browserRuntimeDebug.actions.collapseDebug")
                : t("workspace.browserRuntimeDebug.actions.expandDebug")
            }
            title={
              showAdvanced
                ? t("workspace.browserRuntimeDebug.actions.collapseDebug")
                : t("workspace.browserRuntimeDebug.actions.expandDebug")
            }
          >
            <Bug className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          ref={liveViewRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-black/95 ${
            runtime.canDirectControl ? "cursor-crosshair" : "cursor-default"
          }`}
          onClick={(event) => void handleLiveViewClick(event)}
          onWheel={(event) => void handleLiveViewWheel(event)}
        >
          {runtime.latestFrame ? (
            <img
              src={`data:image/jpeg;base64,${runtime.latestFrame}`}
              alt="browser-live-view"
              className="absolute inset-0 h-full w-full select-none object-contain"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/75">
              {effectiveLiveViewPlaceholder}
            </div>
          )}

          <div className="absolute left-3 top-3 max-w-[min(60%,24rem)] rounded-full bg-black/55 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur">
            <span className="truncate">{currentTitle}</span>
          </div>

          {runtime.sessionState?.last_error ? (
            <div className="absolute bottom-3 left-3 right-3 rounded-md bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground shadow-sm">
              {runtime.sessionState.last_error}
            </div>
          ) : showEmbeddedControlTray ? (
            <div className="absolute bottom-3 left-3 right-3 rounded-full bg-black/55 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur">
              {showAttachPresentation
                ? attachPresentation.embeddedControlHint
                : runtime.canDirectControl
                  ? t(
                      "workspace.browserRuntimeDebug.liveView.controlHintDirect",
                    )
                  : runtime.isWaitingForHuman
                    ? t(
                        "workspace.browserRuntimeDebug.liveView.controlHintWaiting",
                      )
                    : runtime.isHumanControlling
                      ? t(
                          "workspace.browserRuntimeDebug.liveView.controlHintHuman",
                        )
                      : t(
                          "workspace.browserRuntimeDebug.liveView.controlHintAttached",
                        )}
            </div>
          ) : null}
        </div>

        {showEmbeddedControlTray ? (
          <div className="border-t border-border/70 bg-background/95 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {runtime.isHumanControlling ? (
                <button
                  type="button"
                  className={compactActionButtonClass}
                  onClick={() => void runtime.releaseSession()}
                  disabled={runtime.controlBusy}
                >
                  <Pause className="h-3.5 w-3.5" />
                  {t("workspace.browserRuntimeDebug.actions.endTakeOver")}
                </button>
              ) : null}
              {runtime.isWaitingForHuman ? (
                <button
                  type="button"
                  className={compactActionButtonClass}
                  onClick={() =>
                    void runtime.resumeSession(
                      t("workspace.browserRuntimeDebug.resume.noManualNeeded"),
                    )
                  }
                  disabled={runtime.controlBusy}
                >
                  <Play className="h-3.5 w-3.5" />
                  {t("workspace.browserRuntimeDebug.actions.continue")}
                </button>
              ) : null}
              {runtime.sessionState ? (
                <button
                  type="button"
                  className={compactActionButtonClass}
                  onClick={() =>
                    void (runtime.streaming
                      ? runtime.stopStream()
                      : runtime.startStream("both"))
                  }
                >
                  {runtime.streaming
                    ? t("workspace.browserRuntimeDebug.actions.stopView")
                    : t("workspace.browserRuntimeDebug.actions.restoreView")}
                </button>
              ) : null}
              {showAttachPresentation ? (
                <button
                  type="button"
                  className={compactActionButtonClass}
                  onClick={() => void loadAttachTabs()}
                  disabled={
                    attachTabsLoading || !attachPresentation.observerConnected
                  }
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      attachTabsLoading ? "animate-spin" : ""
                    }`}
                  />
                  {attachPresentation.tabsActionLabel}
                </button>
              ) : null}
              {showAdvanced ? (
                <button
                  type="button"
                  className={compactActionButtonClass}
                  onClick={() =>
                    void (showAttachPresentation
                      ? loadAttachPage()
                      : handleOpenSystemBrowser())
                  }
                  disabled={
                    showAttachPresentation
                      ? attachPageLoading ||
                        !attachPresentation.observerConnected
                      : !currentUrl
                  }
                >
                  <Globe className="h-3.5 w-3.5" />
                  {showAttachPresentation
                    ? attachPresentation.pageActionLabel
                    : t("workspace.browserRuntimeDebug.actions.openInChrome")}
                </button>
              ) : null}
            </div>

            {runtime.canDirectControl ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="h-8 w-full min-w-0 flex-1 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[220px]"
                  placeholder={t(
                    "workspace.browserRuntimeDebug.manualControl.embeddedPlaceholder",
                  )}
                  value={manualInput}
                  disabled={runtime.controlBusy}
                  onChange={(event) => setManualInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSendManualInput();
                    }
                  }}
                />
                <button
                  type="button"
                  className={compactActionButtonClass}
                  disabled={runtime.controlBusy}
                  onClick={() => void handleSendManualInput()}
                >
                  <Send className="h-3.5 w-3.5" />
                  {t("workspace.browserRuntimeDebug.actions.send")}
                </button>
                <button
                  type="button"
                  className={compactActionButtonClass}
                  disabled={runtime.controlBusy}
                  onClick={() => void runtime.scrollPage("up")}
                >
                  {t("workspace.browserRuntimeDebug.actions.scrollUp")}
                </button>
                <button
                  type="button"
                  className={compactActionButtonClass}
                  disabled={runtime.controlBusy}
                  onClick={() => void runtime.scrollPage("down")}
                >
                  {t("workspace.browserRuntimeDebug.actions.scrollDown")}
                </button>
              </div>
            ) : null}

            {showAdvanced ? (
              <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
                {showAttachPresentation ? (
                  <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
                    <div>{renderAttachFallbackPanel("max-h-[180px]")}</div>
                    <div>{renderAuditPanel("max-h-[180px]")}</div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">
                          {t(
                            "workspace.browserRuntimeDebug.cdp.profileSession",
                          )}
                        </span>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={runtime.selectedProfileKey}
                          onChange={(event) =>
                            runtime.setSelectedProfileKey(event.target.value)
                          }
                        >
                          {sessions.map((session) => (
                            <option
                              key={session.profile_key}
                              value={session.profile_key}
                            >
                              {session.profile_key} · PID {session.pid || "-"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">
                          {t("workspace.browserRuntimeDebug.cdp.targetTab")}
                        </span>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={runtime.selectedTargetId}
                          onChange={(event) =>
                            runtime.setSelectedTargetId(event.target.value)
                          }
                        >
                          {runtime.targets.length === 0 ? (
                            <option value="">
                              {t("workspace.browserRuntimeDebug.cdp.noTargets")}
                            </option>
                          ) : (
                            runtime.targets.map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.title || target.url || target.id}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={compactActionButtonClass}
                        onClick={() => void runtime.refreshTargets()}
                        disabled={
                          runtime.loadingTargets || !runtime.selectedProfileKey
                        }
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t(
                          "workspace.browserRuntimeDebug.actions.refreshTargets",
                        )}
                      </button>
                      <button
                        type="button"
                        className={compactActionButtonClass}
                        onClick={() => void runtime.openSession()}
                        disabled={
                          runtime.openingSession || !runtime.selectedProfileKey
                        }
                      >
                        {runtime.openingSession
                          ? t("workspace.browserRuntimeDebug.actions.opening")
                          : t("workspace.browserRuntimeDebug.actions.reattach")}
                      </button>
                      <button
                        type="button"
                        className={compactActionButtonClass}
                        onClick={() => void handleOpenSystemBrowser()}
                        disabled={!currentUrl}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        {t(
                          "workspace.browserRuntimeDebug.actions.continueInChrome",
                        )}
                      </button>
                    </div>

                    {showSiteAdapterPanel ? (
                      <BrowserSiteAdapterPanel
                        selectedProfileKey={runtime.selectedProfileKey}
                        onMessage={onMessage}
                        variant="debug"
                      />
                    ) : null}

                    <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
                      <div className="rounded-md border p-3 text-xs">
                        <div className="mb-2 text-sm font-medium">
                          {t("workspace.browserRuntimeDebug.sessionInfo.title")}
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">
                              {t(
                                "workspace.browserRuntimeDebug.sessionInfo.session",
                              )}
                            </span>
                            <span className="break-all">
                              {runtime.sessionState?.session_id || "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t(
                                "workspace.browserRuntimeDebug.sessionInfo.target",
                              )}
                            </span>
                            <span className="break-all">
                              {runtime.sessionState?.target_id || "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t(
                                "workspace.browserRuntimeDebug.sessionInfo.status",
                              )}
                            </span>
                            <span>
                              {runtime.sessionState?.lifecycle_state || "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t(
                                "workspace.browserRuntimeDebug.sessionInfo.controlMode",
                              )}
                            </span>
                            <span>
                              {runtime.sessionState?.control_mode || "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t(
                                "workspace.browserRuntimeDebug.sessionInfo.webSocket",
                              )}
                            </span>
                            <span className="break-all">
                              {runtime.sessionState?.ws_debugger_url || "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t(
                                "workspace.browserRuntimeDebug.sessionInfo.lastFrame",
                              )}
                            </span>
                            <span>
                              {runtime.sessionState?.last_frame_at || "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                        {renderAuditPanel("max-h-[180px]")}

                        <div className="rounded-md border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {t(
                                "workspace.browserRuntimeDebug.events.consoleTitle",
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {t("workspace.browserRuntimeDebug.events.count", {
                                value: formatCount(
                                  runtime.consoleEvents.length,
                                ),
                              })}
                            </div>
                          </div>
                          <div className="max-h-[180px] space-y-2 overflow-auto text-xs">
                            {runtime.consoleEvents.length === 0 ? (
                              <div className="text-muted-foreground">
                                {t(
                                  "workspace.browserRuntimeDebug.events.consoleEmpty",
                                )}
                              </div>
                            ) : (
                              runtime.consoleEvents.map((event) => (
                                <div
                                  key={event.sequence}
                                  className="rounded border p-2"
                                >
                                  <div className="font-medium text-foreground/90">
                                    [
                                    {event.type === "console_message"
                                      ? event.level
                                      : event.type}
                                    ]
                                  </div>
                                  <div className="text-muted-foreground">
                                    {formatEventSubtitle(event)}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {t(
                                "workspace.browserRuntimeDebug.events.networkTitle",
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {t("workspace.browserRuntimeDebug.events.count", {
                                value: formatCount(
                                  runtime.networkEvents.length,
                                ),
                              })}
                            </div>
                          </div>
                          <div className="max-h-[180px] space-y-2 overflow-auto text-xs">
                            {runtime.networkEvents.length === 0 ? (
                              <div className="text-muted-foreground">
                                {t(
                                  "workspace.browserRuntimeDebug.events.networkEmpty",
                                )}
                              </div>
                            ) : (
                              runtime.networkEvents.map((event) => (
                                <div
                                  key={event.sequence}
                                  className="rounded border p-2"
                                >
                                  <div className="font-medium text-foreground/90">
                                    {event.type}
                                  </div>
                                  <div className="break-all text-muted-foreground">
                                    {formatEventSubtitle(event)}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">
            {t("workspace.browserRuntimeDebug.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("workspace.browserRuntimeDebug.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showStandaloneWindowButton ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
              onClick={() => void handleOpenStandaloneWindow()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("workspace.browserRuntimeDebug.actions.standalone")}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            <Bug className="h-3.5 w-3.5" />
            {showAdvanced
              ? t("workspace.browserRuntimeDebug.actions.collapseAdvanced")
              : t("workspace.browserRuntimeDebug.actions.advanced")}
          </button>
        </div>
      </div>

      {sessions.length === 0 && !hasAttachIntent ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {t("workspace.browserRuntimeDebug.empty")}
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-muted/15 p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  {t("workspace.browserRuntimeDebug.currentPage.label")}
                </div>
                <div className="truncate text-sm font-medium">
                  {currentTitle}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {currentUrl ||
                    t("workspace.browserRuntimeDebug.currentPage.noUrl")}
                </div>
              </div>
              <div
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusInfo.toneClass}`}
              >
                {statusInfo.label}
              </div>
            </div>

            <div className="mb-3 rounded-lg border bg-background/70 px-3 py-2">
              <div className="text-xs text-foreground">
                {statusInfo.description}
              </div>
              {runtime.sessionState?.last_error ? (
                <div className="mt-1 text-[11px] text-destructive">
                  {t("workspace.browserRuntimeDebug.currentPage.recentError", {
                    message: runtime.sessionState.last_error,
                  })}
                </div>
              ) : null}
            </div>

            <div
              ref={liveViewRef}
              className={`relative h-[260px] w-full overflow-hidden rounded-lg border bg-black/95 sm:h-[320px] lg:h-[420px] ${
                runtime.canDirectControl ? "cursor-crosshair" : "cursor-default"
              }`}
              onClick={(event) => void handleLiveViewClick(event)}
              onWheel={(event) => void handleLiveViewWheel(event)}
            >
              {runtime.latestFrame ? (
                <img
                  src={`data:image/jpeg;base64,${runtime.latestFrame}`}
                  alt="browser-live-view"
                  className="absolute inset-0 h-full w-full select-none object-contain"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
                  {effectiveLiveViewPlaceholder}
                </div>
              )}

              <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                {runtime.sessionState?.transport_kind ||
                  (showAttachPresentation ? "existing_session" : "cdp_frames")}
              </div>

              <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/60 px-3 py-2 text-[11px] text-white/90">
                {showAttachPresentation
                  ? attachPresentation.liveViewHint
                  : runtime.canDirectControl
                    ? t(
                        "workspace.browserRuntimeDebug.liveView.directControlHint",
                      )
                    : t("workspace.browserRuntimeDebug.liveView.takeOverHint")}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {showAttachPresentation ? (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                  onClick={() => void loadAttachContext()}
                  disabled={attachContextLoading}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      attachContextLoading ? "animate-spin" : ""
                    }`}
                  />
                  {attachPresentation.contextActionLabel}
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                  onClick={() => void loadAttachPage()}
                  disabled={
                    attachPageLoading || !attachPresentation.observerConnected
                  }
                >
                  {attachPresentation.pageActionLabel}
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                  onClick={() => void loadAttachTabs()}
                  disabled={
                    attachTabsLoading || !attachPresentation.observerConnected
                  }
                >
                  {attachPresentation.tabsActionLabel}
                </button>
              </>
            ) : !runtime.sessionState ? (
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                onClick={() => void runtime.openSession()}
                disabled={runtime.openingSession || !runtime.selectedProfileKey}
              >
                {runtime.openingSession
                  ? t("workspace.browserRuntimeDebug.actions.connecting")
                  : t("workspace.browserRuntimeDebug.actions.connect")}
              </button>
            ) : null}

            {runtime.sessionState ? (
              <>
                {runtime.isHumanControlling ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200"
                      onClick={() => void runtime.resumeSession()}
                      disabled={runtime.controlBusy}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {runtime.controlBusy
                        ? t("workspace.browserRuntimeDebug.actions.processing")
                        : t(
                            "workspace.browserRuntimeDebug.actions.doneContinue",
                          )}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                      onClick={() => void runtime.releaseSession()}
                      disabled={runtime.controlBusy}
                    >
                      <Pause className="h-3.5 w-3.5" />
                      {t("workspace.browserRuntimeDebug.actions.endTakeOver")}
                    </button>
                  </>
                ) : runtime.isWaitingForHuman ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200"
                      onClick={() => void runtime.takeOverSession()}
                      disabled={runtime.controlBusy}
                    >
                      <Hand className="h-3.5 w-3.5" />
                      {t("workspace.browserRuntimeDebug.actions.startManual")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                      onClick={() =>
                        void runtime.resumeSession(
                          t(
                            "workspace.browserRuntimeDebug.resume.noManualNeeded",
                          ),
                        )
                      }
                      disabled={runtime.controlBusy}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {t(
                        "workspace.browserRuntimeDebug.actions.continueDirect",
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200"
                    onClick={() => void runtime.takeOverSession()}
                    disabled={runtime.controlBusy || runtime.isAgentResuming}
                  >
                    <Hand className="h-3.5 w-3.5" />
                    {runtime.isAgentResuming
                      ? t("workspace.browserRuntimeDebug.actions.resuming")
                      : t("workspace.browserRuntimeDebug.actions.takeOver")}
                  </button>
                )}

                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                  onClick={() =>
                    void (runtime.streaming
                      ? runtime.stopStream()
                      : runtime.startStream("both"))
                  }
                  disabled={!runtime.sessionState}
                >
                  {runtime.streaming
                    ? t("workspace.browserRuntimeDebug.actions.stopLiveView")
                    : t(
                        "workspace.browserRuntimeDebug.actions.restoreLiveView",
                      )}
                </button>

                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                  onClick={() => void runtime.refreshSessionState()}
                  disabled={runtime.refreshingState}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      runtime.refreshingState ? "animate-spin" : ""
                    }`}
                  />
                  {runtime.refreshingState
                    ? t("workspace.browserRuntimeDebug.actions.refreshing")
                    : t("workspace.browserRuntimeDebug.actions.refreshStatus")}
                </button>

                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                  onClick={() => void runtime.closeSession()}
                >
                  {t("workspace.browserRuntimeDebug.actions.closeSession")}
                </button>
              </>
            ) : null}
          </div>

          <div className="rounded-lg border bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium">
                  {t("workspace.browserRuntimeDebug.manualControl.title")}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("workspace.browserRuntimeDebug.manualControl.description")}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {runtime.canDirectControl
                  ? t("workspace.browserRuntimeDebug.manualControl.enabled")
                  : t("workspace.browserRuntimeDebug.manualControl.disabled")}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                className="w-full min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[220px]"
                placeholder={t(
                  "workspace.browserRuntimeDebug.manualControl.placeholder",
                )}
                value={manualInput}
                disabled={!runtime.canDirectControl || runtime.controlBusy}
                onChange={(event) => setManualInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSendManualInput();
                  }
                }}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                disabled={!runtime.canDirectControl || runtime.controlBusy}
                onClick={() => void handleSendManualInput()}
              >
                <Send className="h-3.5 w-3.5" />
                {t("workspace.browserRuntimeDebug.actions.sendText")}
              </button>
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                disabled={!runtime.canDirectControl || runtime.controlBusy}
                onClick={() => void runtime.scrollPage("up")}
              >
                {t("workspace.browserRuntimeDebug.actions.scrollUp")}
              </button>
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                disabled={!runtime.canDirectControl || runtime.controlBusy}
                onClick={() => void runtime.scrollPage("down")}
              >
                {t("workspace.browserRuntimeDebug.actions.scrollDown")}
              </button>
            </div>
          </div>

          {showAdvanced ? (
            showAttachPresentation ? (
              <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
                <div>{renderAttachFallbackPanel("max-h-[220px]")}</div>
                <div>{renderAuditPanel("max-h-[220px]")}</div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">
                      {t("workspace.browserRuntimeDebug.cdp.profileSession")}
                    </span>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={runtime.selectedProfileKey}
                      onChange={(event) =>
                        runtime.setSelectedProfileKey(event.target.value)
                      }
                    >
                      {sessions.map((session) => (
                        <option
                          key={session.profile_key}
                          value={session.profile_key}
                        >
                          {session.profile_key} · PID {session.pid}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">
                      {t("workspace.browserRuntimeDebug.cdp.targetTab")}
                    </span>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={runtime.selectedTargetId}
                      onChange={(event) =>
                        runtime.setSelectedTargetId(event.target.value)
                      }
                    >
                      {runtime.targets.length === 0 ? (
                        <option value="">
                          {t("workspace.browserRuntimeDebug.cdp.noTargets")}
                        </option>
                      ) : (
                        runtime.targets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.title || target.url || target.id}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                    onClick={() => void runtime.refreshTargets()}
                    disabled={
                      runtime.loadingTargets || !runtime.selectedProfileKey
                    }
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("workspace.browserRuntimeDebug.actions.refreshTargets")}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                    onClick={() => void runtime.openSession()}
                    disabled={
                      runtime.openingSession || !runtime.selectedProfileKey
                    }
                  >
                    {runtime.openingSession
                      ? t("workspace.browserRuntimeDebug.actions.opening")
                      : t(
                          "workspace.browserRuntimeDebug.actions.reattachSession",
                        )}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                    onClick={() => void handleOpenSystemBrowser()}
                    disabled={!currentUrl}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {t(
                      "workspace.browserRuntimeDebug.actions.continueInChrome",
                    )}
                  </button>
                </div>

                {showSiteAdapterPanel ? (
                  <BrowserSiteAdapterPanel
                    selectedProfileKey={runtime.selectedProfileKey}
                    onMessage={onMessage}
                    variant="debug"
                  />
                ) : null}

                <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-3">
                    <div className="rounded-md border p-3 text-xs">
                      <div className="mb-2 text-sm font-medium">
                        {t("workspace.browserRuntimeDebug.sessionInfo.title")}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.sessionInfo.session",
                            )}
                          </span>
                          <span className="break-all">
                            {runtime.sessionState?.session_id || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.sessionInfo.target",
                            )}
                          </span>
                          <span className="break-all">
                            {runtime.sessionState?.target_id || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.sessionInfo.status",
                            )}
                          </span>
                          <span>
                            {runtime.sessionState?.lifecycle_state || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.sessionInfo.controlMode",
                            )}
                          </span>
                          <span>
                            {runtime.sessionState?.control_mode || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.sessionInfo.webSocket",
                            )}
                          </span>
                          <span className="break-all">
                            {runtime.sessionState?.ws_debugger_url || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.sessionInfo.lastFrame",
                            )}
                          </span>
                          <span>
                            {runtime.sessionState?.last_frame_at || "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {renderAuditPanel("max-h-[220px]")}

                    <div className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium">
                          {t(
                            "workspace.browserRuntimeDebug.events.consoleTitle",
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("workspace.browserRuntimeDebug.events.count", {
                            value: formatCount(runtime.consoleEvents.length),
                          })}
                        </div>
                      </div>
                      <div className="max-h-[220px] space-y-2 overflow-auto text-xs">
                        {runtime.consoleEvents.length === 0 ? (
                          <div className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.events.consoleEmpty",
                            )}
                          </div>
                        ) : (
                          runtime.consoleEvents.map((event) => (
                            <div
                              key={event.sequence}
                              className="rounded border p-2"
                            >
                              <div className="font-medium text-foreground/90">
                                [
                                {event.type === "console_message"
                                  ? event.level
                                  : event.type}
                                ]
                              </div>
                              <div className="text-muted-foreground">
                                {formatEventSubtitle(event)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium">
                          {t(
                            "workspace.browserRuntimeDebug.events.networkTitle",
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("workspace.browserRuntimeDebug.events.count", {
                            value: formatCount(runtime.networkEvents.length),
                          })}
                        </div>
                      </div>
                      <div className="max-h-[220px] space-y-2 overflow-auto text-xs">
                        {runtime.networkEvents.length === 0 ? (
                          <div className="text-muted-foreground">
                            {t(
                              "workspace.browserRuntimeDebug.events.networkEmpty",
                            )}
                          </div>
                        ) : (
                          runtime.networkEvents.map((event) => (
                            <div
                              key={event.sequence}
                              className="rounded border p-2"
                            >
                              <div className="font-medium text-foreground/90">
                                {event.type}
                              </div>
                              <div className="break-all text-muted-foreground">
                                {formatEventSubtitle(event)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
