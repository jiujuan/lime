import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { Bell, Download, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  checkForUpdates,
  getUpdateInstallSession,
  isUpdateInstallSessionActive,
  listenUpdateInstallSession,
  recordUpdateNotificationAction,
  remindUpdateLater,
  startUpdateInstallSession,
  type UpdateInstallSession,
  type VersionInfo,
} from "@/lib/api/appUpdate";

interface AppUpdateEntryProps {
  collapsed?: boolean;
  onOpenPanel?: () => void;
}

const REMIND_LATER_HOURS = 24;

function clampProgressPercent(percent: number | null | undefined): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((percent ?? 0) * 100)));
}

function shouldShowInstallSession(
  session: UpdateInstallSession | null,
): boolean {
  return Boolean(
    session && session.stage !== "idle" && session.stage !== "up_to_date",
  );
}

const EntryRoot = styled.div<{ $collapsed?: boolean }>`
  position: relative;
  display: flex;
  justify-content: ${({ $collapsed }) =>
    $collapsed ? "center" : "flex-start"};
  padding: 0 2px;
`;

const EntryButton = styled.button<{ $active?: boolean }>`
  position: relative;
  width: 30px;
  height: 30px;
  border: 1px solid
    ${({ $active }) =>
      $active
        ? "var(--lime-brand-soft-border, #bbf7d0)"
        : "var(--sidebar-card-border, #e2f0e2)"};
  border-radius: 10px;
  background: ${({ $active }) =>
    $active
      ? "var(--lime-brand-soft, #ecfdf5)"
      : "var(--lime-surface, #ffffff)"};
  color: ${({ $active }) =>
    $active ? "var(--lime-brand-strong, #166534)" : "var(--sidebar-muted)"};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.56);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    border-color: var(--lime-brand-soft-border, #bbf7d0);
    background: var(--lime-brand-soft, #ecfdf5);
    color: var(--lime-brand-strong, #166534);
  }

  svg {
    width: 15px;
    height: 15px;
  }

  &::after {
    content: "";
    position: absolute;
    right: 5px;
    top: 5px;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--lime-warning, #f59e0b);
    box-shadow: 0 0 0 2px var(--lime-surface, #ffffff);
  }
`;

const UpdatePanel = styled.div<{ $collapsed?: boolean }>`
  position: absolute;
  left: ${({ $collapsed }) => ($collapsed ? "calc(100% + 10px)" : "0")};
  bottom: ${({ $collapsed }) => ($collapsed ? "0" : "calc(100% + 8px)")};
  z-index: 78;
  width: 196px;
  max-width: min(196px, calc(100vw - 24px));
  max-height: min(420px, calc(100vh - 24px));
  overflow-y: auto;
  border-radius: 14px;
  border: 1px solid var(--lime-card-subtle-border, rgba(226, 240, 226, 0.92));
  background: var(--lime-surface, #ffffff);
  box-shadow:
    0 20px 42px -30px rgba(15, 23, 42, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  color: var(--lime-text, #1a3b2b);
  padding: 9px;
  transform-origin: ${({ $collapsed }) =>
    $collapsed ? "left bottom" : "left bottom"};
  animation: appSidebarUpdatePanelIn 140ms ease-out both;

  @keyframes appSidebarUpdatePanelIn {
    from {
      opacity: 0;
      transform: translateY(5px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const PanelTitleGroup = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const PanelTitle = styled.div`
  color: var(--lime-text-strong, #0f172a);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
  word-break: break-word;
`;

const PanelSubtitle = styled.div`
  color: var(--lime-text-muted, #6b826b);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
  word-break: break-word;
`;

const CloseButton = styled.button`
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--lime-text-muted, #6b826b);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--lime-surface-hover, #f4fdf4);
    color: var(--lime-text-strong, #0f172a);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const StatusBlock = styled.div<{ $tone?: "error" | "normal" }>`
  margin-top: 8px;
  border-radius: 11px;
  background: ${({ $tone }) =>
    $tone === "error"
      ? "var(--lime-danger-soft, #fff1f2)"
      : "var(--lime-surface-soft, #f8fcf9)"};
  color: ${({ $tone }) =>
    $tone === "error"
      ? "var(--lime-danger, #be123c)"
      : "var(--lime-text-muted, #6b826b)"};
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

const StatusText = styled.div`
  min-width: 0;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.35;
  word-break: break-word;
`;

const ProgressTrack = styled.div`
  position: relative;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--lime-card-subtle-border, #e2e8f0);
`;

const ProgressFill = styled.div`
  height: 100%;
  min-width: 4px;
  border-radius: inherit;
  background: var(--lime-brand-strong, #166534);
  transition: width 0.16s ease;
`;

const ActionStack = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-top: 9px;
`;

const PanelActionButton = styled.button<{ $primary?: boolean }>`
  width: 100%;
  min-height: 30px;
  border-radius: 10px;
  border: 1px solid
    ${({ $primary }) =>
      $primary
        ? "var(--lime-text-strong, #0f172a)"
        : "var(--lime-card-subtle-border, #d9eadf)"};
  background: ${({ $primary }) =>
    $primary ? "var(--lime-text-strong, #0f172a)" : "var(--lime-surface)"};
  color: ${({ $primary }) =>
    $primary ? "var(--lime-surface, #ffffff)" : "var(--lime-text, #1a3b2b)"};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  text-align: center;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;

  &:hover:not(:disabled) {
    background: ${({ $primary }) =>
      $primary ? "#1f2937" : "var(--lime-surface-hover, #f4fdf4)"};
  }

  &:disabled {
    cursor: default;
    opacity: 0.68;
  }

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
`;

const SpinningIcon = styled(RefreshCw)`
  animation: appSidebarUpdateSpin 0.8s linear infinite;

  @keyframes appSidebarUpdateSpin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

export function AppUpdateEntry({
  collapsed,
  onOpenPanel,
}: AppUpdateEntryProps) {
  const { t } = useTranslation(["navigation", "common"]);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [installSession, setInstallSession] =
    useState<UpdateInstallSession | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [startingInstall, setStartingInstall] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  useEffect(() => {
    let disposed = false;

    void checkForUpdates()
      .then((result) => {
        if (!disposed) {
          setVersionInfo(result);
        }
      })
      .catch((error) => {
        console.error("检查应用更新失败:", error);
      });

    void getUpdateInstallSession()
      .then((session) => {
        if (!disposed && shouldShowInstallSession(session)) {
          setInstallSession(session);
        }
      })
      .catch((error) => {
        console.error("读取更新安装会话失败:", error);
      });

    const unlistenPromise = listenUpdateInstallSession((session) => {
      setInstallSession(session);
      if (isUpdateInstallSessionActive(session)) {
        setDismissedForSession(false);
        setStartFailed(false);
      }
    });

    return () => {
      disposed = true;
      void unlistenPromise
        .then((unlisten) => unlisten())
        .catch((error) => {
          console.error("取消更新安装会话监听失败:", error);
        });
    };
  }, []);

  const installActive = isUpdateInstallSessionActive(installSession);
  const sessionVisible = shouldShowInstallSession(installSession);
  const updateAvailable = Boolean(versionInfo?.hasUpdate && !versionInfo.error);
  const shouldShowEntry =
    (updateAvailable || sessionVisible) &&
    (!dismissedForSession || installActive);
  const progressPercent = clampProgressPercent(installSession?.percent);
  const latestVersion =
    installSession?.latestVersion || versionInfo?.latest || "";
  const currentVersion =
    installSession?.currentVersion || versionInfo?.current || "";
  const hasProgress =
    installSession?.stage === "downloading" ||
    installSession?.stage === "installing" ||
    installSession?.stage === "restarting";
  const statusTone =
    startFailed || installSession?.stage === "failed" ? "error" : "normal";

  const panelTitle = latestVersion
    ? t("common.updateNotification.version.new", {
        ns: "common",
        version: latestVersion,
      })
    : t("navigation.sidebar.update.available");
  const currentVersionLabel = currentVersion
    ? t("common.updateNotification.version.current", {
        ns: "common",
        version: currentVersion,
      })
    : "";
  const openLabel = t("navigation.sidebar.update.open");
  const closePanelLabel = t("navigation.sidebar.update.closePanel");
  const hideLabel = t("common.updateNotification.action.hide", {
    ns: "common",
  });
  const laterLabel = t("common.updateNotification.action.laterOneDay", {
    ns: "common",
  });
  const checkingLabel = t("common.updateNotification.progress.checking", {
    ns: "common",
  });

  const sessionProgressLabel = useMemo(() => {
    if (startFailed) {
      return t("navigation.sidebar.update.startFailed");
    }

    if (!installSession) {
      return "";
    }

    switch (installSession.stage) {
      case "checking":
        return t("common.updateNotification.progress.checking", {
          ns: "common",
        });
      case "downloading":
        return installSession.totalBytes
          ? t("common.updateNotification.progress.downloading", {
              ns: "common",
              percent: `${progressPercent}%`,
            })
          : t("common.updateNotification.progress.downloadingUnknown", {
              ns: "common",
            });
      case "installing":
        return t("common.updateNotification.progress.installing", {
          ns: "common",
        });
      case "restarting":
        return t("common.updateNotification.progress.restarting", {
          ns: "common",
        });
      case "failed":
        return t("common.updateNotification.progress.failed", {
          ns: "common",
        });
      case "completed":
        return t("common.updateNotification.progress.completed", {
          ns: "common",
        });
      default:
        return "";
    }
  }, [installSession, progressPercent, startFailed, t]);

  const sessionActionLabel = useMemo(() => {
    if (startingInstall) {
      return checkingLabel;
    }

    switch (installSession?.stage) {
      case "checking":
        return checkingLabel;
      case "downloading":
        return t("common.updateNotification.action.downloading", {
          ns: "common",
        });
      case "installing":
        return t("common.updateNotification.action.installing", {
          ns: "common",
        });
      case "restarting":
        return t("common.updateNotification.action.restarting", {
          ns: "common",
        });
      case "failed":
        return t("common.updateNotification.action.retry", { ns: "common" });
      default:
        return t("common.updateNotification.action.updateNow", {
          ns: "common",
        });
    }
  }, [checkingLabel, installSession?.stage, startingInstall, t]);

  useEffect(() => {
    if (!shouldShowEntry) {
      setPanelOpen(false);
    }
  }, [shouldShowEntry]);

  const togglePanel = useCallback(() => {
    setPanelOpen((current) => {
      const next = !current;
      if (next) {
        onOpenPanel?.();
      }
      return next;
    });
  }, [onOpenPanel]);

  const handleLater = useCallback(async () => {
    if (installActive) {
      setPanelOpen(false);
      return;
    }

    try {
      await remindUpdateLater(REMIND_LATER_HOURS);
    } catch (error) {
      console.error("设置稍后提醒失败:", error);
    }

    setDismissedForSession(true);
    setPanelOpen(false);
  }, [installActive]);

  const handleInstall = useCallback(async () => {
    if (installActive || startingInstall) {
      return;
    }

    setStartingInstall(true);
    setStartFailed(false);

    try {
      await recordUpdateNotificationAction("update_now");
    } catch (error) {
      console.error("记录立即更新行为失败:", error);
    }

    try {
      const session = await startUpdateInstallSession();
      setInstallSession(session);
    } catch (error) {
      console.error("启动更新安装失败:", error);
      setStartFailed(true);
    } finally {
      setStartingInstall(false);
    }
  }, [installActive, startingInstall]);

  if (!shouldShowEntry) {
    return null;
  }

  return (
    <EntryRoot
      $collapsed={collapsed}
      data-testid="app-sidebar-update-entry"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <EntryButton
        type="button"
        $active={panelOpen || installActive}
        title={openLabel}
        aria-label={openLabel}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        data-testid="app-sidebar-update-button"
        onClick={togglePanel}
      >
        {installActive ? <SpinningIcon /> : <Bell />}
      </EntryButton>

      {panelOpen ? (
        <UpdatePanel
          $collapsed={collapsed}
          role="dialog"
          aria-label={panelTitle}
          data-testid="app-sidebar-update-panel"
        >
          <PanelHeader>
            <PanelTitleGroup>
              <PanelTitle>{panelTitle}</PanelTitle>
              {currentVersionLabel ? (
                <PanelSubtitle>{currentVersionLabel}</PanelSubtitle>
              ) : null}
            </PanelTitleGroup>
            <CloseButton
              type="button"
              title={closePanelLabel}
              aria-label={closePanelLabel}
              onClick={() => setPanelOpen(false)}
            >
              <X />
            </CloseButton>
          </PanelHeader>

          {sessionProgressLabel ? (
            <StatusBlock $tone={statusTone} aria-live="polite">
              <StatusText>{sessionProgressLabel}</StatusText>
              {hasProgress ? (
                <ProgressTrack
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                >
                  <ProgressFill style={{ width: `${progressPercent}%` }} />
                </ProgressTrack>
              ) : null}
            </StatusBlock>
          ) : null}

          <ActionStack>
            {installActive ? (
              <>
                <PanelActionButton
                  type="button"
                  onClick={() => setPanelOpen(false)}
                >
                  {hideLabel}
                </PanelActionButton>
                <PanelActionButton type="button" $primary disabled>
                  <SpinningIcon />
                  {sessionActionLabel}
                </PanelActionButton>
              </>
            ) : (
              <>
                <PanelActionButton type="button" onClick={handleLater}>
                  {laterLabel}
                </PanelActionButton>
                <PanelActionButton
                  type="button"
                  $primary
                  disabled={startingInstall}
                  onClick={handleInstall}
                >
                  {startingInstall ? <SpinningIcon /> : <Download />}
                  {sessionActionLabel}
                </PanelActionButton>
              </>
            )}
          </ActionStack>
        </UpdatePanel>
      ) : null}
    </EntryRoot>
  );
}
