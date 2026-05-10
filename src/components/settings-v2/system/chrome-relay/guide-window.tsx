import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FolderOpen,
  Link2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { openPathWithDefaultApp } from "@/lib/api/fileSystem";
import { cn } from "@/lib/utils";
import {
  getBrowserBackendsStatus,
  getBrowserConnectorInstallStatus,
  getBrowserConnectorSettings,
  getChromeBridgeStatus,
  installBrowserConnectorExtension,
  openBrowserExtensionsPage,
  openBrowserRemoteDebuggingPage,
  setBrowserConnectorInstallRoot,
  type BrowserBackendsStatusSnapshot,
  type BrowserConnectorInstallStatus,
  type BrowserConnectorSettingsSnapshot,
  type ChromeBridgeStatusSnapshot,
} from "@/lib/webview-api";
import {
  buildBrowserConnectorGuideNavigationUrl,
  type BrowserConnectorGuideMode,
} from "./guide-window-launcher";

const REMOTE_DEBUGGING_URL = "chrome://inspect/#remote-debugging";
const PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--lime-text-strong,hsl(var(--foreground)))] bg-[color:var(--lime-text-strong,hsl(var(--foreground)))] px-4 py-2.5 text-sm font-semibold text-[color:var(--lime-surface,hsl(var(--background)))] shadow-sm shadow-slate-950/10 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

interface StepBlockProps {
  index: number;
  title: string;
  children: ReactNode;
}

interface GuideMessage {
  type: "success" | "error";
  text: string;
}

function getGuideModeFromUrl(): BrowserConnectorGuideMode {
  if (typeof window === "undefined") {
    return "extension";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "cdp" ? "cdp" : "extension";
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
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
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

function StepBlock({ index, title, children }: StepBlockProps) {
  return (
    <section className="relative grid gap-5 pl-16">
      <div className="absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-[14px] border border-emerald-200 bg-emerald-50 text-base font-semibold text-emerald-700">
        {index}
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <div className="text-sm leading-6 text-slate-500">{children}</div>
      </div>
    </section>
  );
}

function getInstallStatusTone(
  status: BrowserConnectorInstallStatus | null,
): "neutral" | "success" | "warning" {
  if (status?.status === "installed") {
    return "success";
  }
  if (status?.status === "update_available" || status?.status === "broken") {
    return "warning";
  }
  return "neutral";
}

function BrowserConnectorGuideContent() {
  const { t } = useTranslation("settings");
  const mode = getGuideModeFromUrl();
  const [settings, setSettings] =
    useState<BrowserConnectorSettingsSnapshot | null>(null);
  const [installStatus, setInstallStatus] =
    useState<BrowserConnectorInstallStatus | null>(null);
  const [bridgeStatus, setBridgeStatus] =
    useState<ChromeBridgeStatusSnapshot | null>(null);
  const [backendsStatus, setBackendsStatus] =
    useState<BrowserBackendsStatusSnapshot | null>(null);
  const [message, setMessage] = useState<GuideMessage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [openingExtensionsPage, setOpeningExtensionsPage] = useState(false);
  const [openingRemoteDebuggingPage, setOpeningRemoteDebuggingPage] =
    useState(false);
  const [openingInstallDirectory, setOpeningInstallDirectory] = useState(false);

  const installDirectory =
    installStatus?.install_dir ?? settings?.install_dir ?? null;
  const visibleInstallPath =
    installDirectory ??
    installStatus?.install_root_dir ??
    settings?.install_root_dir ??
    t("settings.chromeRelay.guide.installPath.empty", "尚未选择扩展目录");
  const hasObserverConnected = (bridgeStatus?.observer_count ?? 0) > 0;
  const hasControlConnected = (bridgeStatus?.control_count ?? 0) > 0;
  const cdpAliveCount = backendsStatus?.cdp_alive_profile_count ?? 0;

  const refreshState = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextSettings, nextInstallStatus, nextBridgeStatus, nextBackends] =
        await Promise.all([
          getBrowserConnectorSettings(),
          getBrowserConnectorInstallStatus(),
          getChromeBridgeStatus(),
          getBrowserBackendsStatus(),
        ]);
      setSettings(nextSettings);
      setInstallStatus(nextInstallStatus);
      setBridgeStatus(nextBridgeStatus);
      setBackendsStatus(nextBackends);
    } catch (error) {
      setMessage({
        type: "error",
        text: t("settings.chromeRelay.guide.message.refreshFailed", {
          message: error instanceof Error ? error.message : String(error),
          defaultValue: "刷新连接器状态失败: {{message}}",
        }),
      });
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const chooseInstallRoot = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: settings?.install_root_dir ?? undefined,
    });

    if (!selected || Array.isArray(selected)) {
      return null;
    }

    const next = await setBrowserConnectorInstallRoot(selected);
    setSettings(next);
    return selected;
  }, [settings?.install_root_dir]);

  const handleInstallConnector = useCallback(
    async (forceChooseDirectory = false) => {
      try {
        setInstalling(true);
        const installRootDir =
          forceChooseDirectory || !settings?.install_root_dir
            ? await chooseInstallRoot()
            : settings.install_root_dir;

        if (!installRootDir) {
          return;
        }

        const result = await installBrowserConnectorExtension({
          install_root_dir: installRootDir,
          profile_key: "default",
        });
        setMessage({
          type: "success",
          text: t("settings.chromeRelay.guide.message.extensionSynced", {
            path: result.install_dir,
            defaultValue: "扩展已同步到 {{path}}",
          }),
        });
        await refreshState();
      } catch (error) {
        setMessage({
          type: "error",
          text: t("settings.chromeRelay.guide.message.syncExtensionFailed", {
            message: error instanceof Error ? error.message : String(error),
            defaultValue: "同步扩展失败: {{message}}",
          }),
        });
      } finally {
        setInstalling(false);
      }
    },
    [chooseInstallRoot, refreshState, settings?.install_root_dir, t],
  );

  const handleOpenExtensionsPage = useCallback(async () => {
    try {
      setOpeningExtensionsPage(true);
      await openBrowserExtensionsPage();
    } catch (error) {
      setMessage({
        type: "error",
        text: t("settings.chromeRelay.guide.message.openExtensionsFailed", {
          message: error instanceof Error ? error.message : String(error),
          defaultValue: "打开 Chrome 扩展页失败: {{message}}",
        }),
      });
    } finally {
      setOpeningExtensionsPage(false);
    }
  }, [t]);

  const handleOpenRemoteDebuggingPage = useCallback(async () => {
    try {
      setOpeningRemoteDebuggingPage(true);
      await openBrowserRemoteDebuggingPage();
    } catch (error) {
      setMessage({
        type: "error",
        text: t("settings.chromeRelay.guide.message.openRemoteFailed", {
          message: error instanceof Error ? error.message : String(error),
          defaultValue: "打开远程调试页失败: {{message}}",
        }),
      });
    } finally {
      setOpeningRemoteDebuggingPage(false);
    }
  }, [t]);

  const handleOpenInstallDirectory = useCallback(async () => {
    if (!installDirectory) {
      setMessage({
        type: "error",
        text: t(
          "settings.chromeRelay.guide.message.installDirectoryMissing",
          "尚未检测到已同步的扩展目录",
        ),
      });
      return;
    }

    try {
      setOpeningInstallDirectory(true);
      await openPathWithDefaultApp(installDirectory);
    } catch (error) {
      setMessage({
        type: "error",
        text: t("settings.chromeRelay.guide.message.openInstallDirFailed", {
          message: error instanceof Error ? error.message : String(error),
          defaultValue: "打开扩展目录失败: {{message}}",
        }),
      });
    } finally {
      setOpeningInstallDirectory(false);
    }
  }, [installDirectory, t]);

  const copyPlainText = useCallback(
    async (text: string, label: string) => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error(
            t(
              "settings.chromeRelay.guide.message.clipboardUnsupported",
              "当前环境不支持剪贴板写入",
            ),
          );
        }
        await navigator.clipboard.writeText(text);
        setMessage({
          type: "success",
          text: t("settings.chromeRelay.guide.message.copySuccess", {
            label,
            defaultValue: "{{label}} 已复制到剪贴板",
          }),
        });
      } catch (error) {
        setMessage({
          type: "error",
          text: t("settings.chromeRelay.guide.message.copyFailed", {
            label,
            message: error instanceof Error ? error.message : String(error),
            defaultValue: "复制 {{label}} 失败: {{message}}",
          }),
        });
      }
    },
    [t],
  );

  const installStatusLabel = useMemo(() => {
    switch (installStatus?.status) {
      case "installed":
        return t(
          "settings.chromeRelay.guide.installStatus.installed",
          "扩展已同步",
        );
      case "update_available":
        return t(
          "settings.chromeRelay.guide.installStatus.updateAvailable",
          "扩展可更新",
        );
      case "broken":
        return t(
          "settings.chromeRelay.guide.installStatus.broken",
          "扩展目录异常",
        );
      default:
        return t(
          "settings.chromeRelay.guide.installStatus.pending",
          "尚未同步扩展",
        );
    }
  }, [installStatus?.status, t]);
  const installStatusTone = getInstallStatusTone(installStatus);
  const header = useMemo(
    () =>
      mode === "extension"
        ? {
            title: t(
              "settings.chromeRelay.guide.header.extension.title",
              "安装 Lime Browser Bridge",
            ),
            eyebrow: t(
              "settings.chromeRelay.guide.header.extension.eyebrow",
              "扩展连接",
            ),
            description: t(
              "settings.chromeRelay.guide.header.extension.description",
              "把扩展同步到用户目录，再让 Chrome 加载这个目录。",
            ),
          }
        : {
            title: t(
              "settings.chromeRelay.guide.header.cdp.title",
              "启用浏览器直连",
            ),
            eyebrow: t(
              "settings.chromeRelay.guide.header.cdp.eyebrow",
              "CDP 直连",
            ),
            description: t(
              "settings.chromeRelay.guide.header.cdp.description",
              "你的 Chrome 可通过 DevTools Protocol 连接，无需安装扩展。",
            ),
          },
    [mode, t],
  );

  return (
    <main className="lime-settings-theme-scope h-screen overflow-y-auto bg-[color:var(--lime-stage-surface,hsl(var(--background)))] text-[color:var(--lime-text,hsl(var(--foreground)))]">
      <div className="mx-auto max-w-[900px] px-7 py-12 pb-20 sm:px-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[18px] border border-emerald-200 bg-emerald-50 text-emerald-700">
            <Sparkles className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] font-semibold tracking-tight text-slate-950">
                {header.title}
              </h1>
              <StatusPill tone="success">{header.eyebrow}</StatusPill>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {header.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshState()}
            disabled={refreshing}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing ? "animate-spin" : "")}
            />
            {t("settings.chromeRelay.guide.action.refresh", "刷新状态")}
          </button>
        </header>

        {message ? (
          <div
            className={cn(
              "mt-8 rounded-[18px] border px-4 py-3 text-sm font-medium",
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700",
            )}
          >
            {message.text}
          </div>
        ) : null}

        {mode === "extension" ? (
          <div className="mt-10 space-y-9">
            <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-950/5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <StatusPill tone={installStatusTone}>
                {installStatusLabel}
              </StatusPill>
              <StatusPill
                tone={
                  hasObserverConnected && hasControlConnected
                    ? "success"
                    : "warning"
                }
              >
                {hasObserverConnected && hasControlConnected
                  ? t(
                      "settings.chromeRelay.guide.bridge.connected",
                      "Chrome 已连接",
                    )
                  : t(
                      "settings.chromeRelay.guide.bridge.pending",
                      "Chrome 待连接",
                    )}
              </StatusPill>
              <span className="text-sm text-slate-500">
                {t("settings.chromeRelay.guide.bridge.counts", {
                  observer: bridgeStatus?.observer_count ?? 0,
                  control: bridgeStatus?.control_count ?? 0,
                  defaultValue: "observer / control：{{observer}}/{{control}}",
                })}
              </span>
            </div>

            <StepBlock
              index={1}
              title={t(
                "settings.chromeRelay.guide.extension.step1.title",
                "打开 Chrome 扩展管理页面",
              )}
            >
              <p>
                {t(
                  "settings.chromeRelay.guide.extension.step1.description",
                  "打开页面后，先开启右上角的“开发者模式”。",
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleOpenExtensionsPage()}
                  disabled={openingExtensionsPage}
                  className={PRIMARY_BUTTON_CLASS_NAME}
                >
                  <ExternalLink className="h-4 w-4" />
                  {openingExtensionsPage
                    ? t(
                        "settings.chromeRelay.guide.action.opening",
                        "打开中...",
                      )
                    : t(
                        "settings.chromeRelay.guide.action.openExtensions",
                        "打开 chrome://extensions",
                      )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyPlainText(
                      "chrome://extensions",
                      t(
                        "settings.chromeRelay.guide.label.extensionsUrl",
                        "扩展页地址",
                      ),
                    )
                  }
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  <Copy className="h-4 w-4" />
                  {t("settings.chromeRelay.guide.action.copyUrl", "复制地址")}
                </button>
              </div>
            </StepBlock>

            <StepBlock
              index={2}
              title={t(
                "settings.chromeRelay.guide.extension.step2.title",
                "同步并打开扩展文件夹",
              )}
            >
              <p>
                {t(
                  "settings.chromeRelay.guide.extension.step2.description",
                  "扩展文件夹必须来自 Lime 同步出的用户目录。",
                )}
              </p>
              <div className="mt-3 rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {visibleInstallPath}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleInstallConnector(false)}
                  disabled={installing}
                  className={PRIMARY_BUTTON_CLASS_NAME}
                >
                  <FolderOpen className="h-4 w-4" />
                  {installing
                    ? t(
                        "settings.chromeRelay.guide.action.syncing",
                        "同步中...",
                      )
                    : t(
                        "settings.chromeRelay.guide.action.syncExtension",
                        "同步扩展",
                      )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleInstallConnector(true)}
                  disabled={installing}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  {t(
                    "settings.chromeRelay.guide.action.chooseDirectoryAgain",
                    "重新选择目录",
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenInstallDirectory()}
                  disabled={!installDirectory || openingInstallDirectory}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  <FolderOpen className="h-4 w-4" />
                  {openingInstallDirectory
                    ? t(
                        "settings.chromeRelay.guide.action.opening",
                        "打开中...",
                      )
                    : t(
                        "settings.chromeRelay.guide.action.openFolder",
                        "打开文件夹",
                      )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyPlainText(
                      visibleInstallPath,
                      t(
                        "settings.chromeRelay.guide.label.extensionDirectory",
                        "扩展目录",
                      ),
                    )
                  }
                  disabled={!installDirectory}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  <Copy className="h-4 w-4" />
                  {t("settings.chromeRelay.guide.action.copyPath", "复制路径")}
                </button>
              </div>
            </StepBlock>

            <StepBlock
              index={3}
              title={t(
                "settings.chromeRelay.guide.extension.step3.title",
                "将扩展文件夹拖入 Chrome",
              )}
            >
              <p>
                {t(
                  "settings.chromeRelay.guide.extension.step3.prefix",
                  "将同步出的",
                )}{" "}
                <strong>Lime Browser Connector</strong>{" "}
                {t(
                  "settings.chromeRelay.guide.extension.step3.middle",
                  "文件夹拖到",
                )}{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                  chrome://extensions
                </code>{" "}
                {t(
                  "settings.chromeRelay.guide.extension.step3.suffix",
                  "页面，Chrome 会立即安装。",
                )}
              </p>
              <p className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                {t(
                  "settings.chromeRelay.guide.extension.sourceWarning.prefix",
                  "不要直接加载仓库源码里的",
                )}{" "}
                <code>extensions/lime-chrome</code>
                {t(
                  "settings.chromeRelay.guide.extension.sourceWarning.middle",
                  "；源码目录不带",
                )}{" "}
                <code>auto_config.json</code>
                {t(
                  "settings.chromeRelay.guide.extension.sourceWarning.suffix",
                  "，扩展会提示缺少",
                )}{" "}
                <code>serverUrl / bridgeKey</code>
                {t(
                  "settings.chromeRelay.guide.extension.sourceWarning.afterKeys",
                  "。",
                )}
              </p>
            </StepBlock>
          </div>
        ) : (
          <div className="mt-10 space-y-9">
            <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-950/5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <StatusPill tone="success">
                {t(
                  "settings.chromeRelay.guide.cdp.supported",
                  "Chrome 支持直连 CDP",
                )}
              </StatusPill>
              <StatusPill tone={cdpAliveCount > 0 ? "success" : "warning"}>
                {cdpAliveCount > 0
                  ? t(
                      "settings.chromeRelay.guide.cdp.sessionReady",
                      "已有可用会话",
                    )
                  : t(
                      "settings.chromeRelay.guide.cdp.sessionPending",
                      "等待调试会话",
                    )}
              </StatusPill>
              <span className="text-sm text-slate-500">
                {t("settings.chromeRelay.guide.cdp.sessionCount", {
                  count: cdpAliveCount,
                  defaultValue: "可复用 CDP 会话：{{count}}",
                })}
              </span>
            </div>

            <StepBlock
              index={1}
              title={t(
                "settings.chromeRelay.guide.cdp.step1.title",
                "启用远程调试",
              )}
            >
              <p>
                {t(
                  "settings.chromeRelay.guide.cdp.step1.description",
                  "打开远程调试页面，把远程调试开关切换为“开启”。",
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleOpenRemoteDebuggingPage()}
                  disabled={openingRemoteDebuggingPage}
                  className={PRIMARY_BUTTON_CLASS_NAME}
                >
                  <ExternalLink className="h-4 w-4" />
                  {openingRemoteDebuggingPage
                    ? t(
                        "settings.chromeRelay.guide.action.opening",
                        "打开中...",
                      )
                    : t(
                        "settings.chromeRelay.guide.action.openRemoteDebugging",
                        "打开 chrome://inspect/#remote-debugging",
                      )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyPlainText(
                      REMOTE_DEBUGGING_URL,
                      t(
                        "settings.chromeRelay.guide.label.remoteDebuggingUrl",
                        "远程调试地址",
                      ),
                    )
                  }
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  <Copy className="h-4 w-4" />
                  {t("settings.chromeRelay.guide.action.copyUrl", "复制地址")}
                </button>
              </div>
            </StepBlock>

            <StepBlock
              index={2}
              title={t(
                "settings.chromeRelay.guide.cdp.step2.title",
                "允许 Lime 连接",
              )}
            >
              <p>
                {t(
                  "settings.chromeRelay.guide.cdp.step2.description",
                  "当 Lime 请求调试会话时，Chrome 会弹出权限对话框。点击允许后，Lime 就能复用当前浏览器标签页。",
                )}
              </p>
            </StepBlock>

            <StepBlock
              index={3}
              title={t(
                "settings.chromeRelay.guide.cdp.step3.title",
                "设置完成",
              )}
            >
              <p>
                {t(
                  "settings.chromeRelay.guide.cdp.step3.description",
                  "CDP 直连适合临时调试、人工接管和无需扩展的基础浏览器控制。如果需要长期观察页面变化，仍建议优先使用扩展连接。",
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href =
                      buildBrowserConnectorGuideNavigationUrl("extension");
                  }}
                  className={SECONDARY_BUTTON_CLASS_NAME}
                >
                  <Link2 className="h-4 w-4" />
                  {t(
                    "settings.chromeRelay.guide.action.viewExtensionGuide",
                    "查看扩展连接引导",
                  )}
                </button>
              </div>
            </StepBlock>
          </div>
        )}
      </div>
    </main>
  );
}

export function BrowserConnectorGuideWindow() {
  return <BrowserConnectorGuideContent />;
}
