import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Cloud,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { ApiKeyProviderSection } from "@/components/api-key-provider";
import { openUrl } from "@/components/openclaw/openUrl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOemCloudAccess } from "@/hooks/useOemCloudAccess";
import { formatDate } from "@/i18n/format";
import {
  getCompanionPetStatus,
  launchCompanionPet,
  listenCompanionPetStatus,
  sendCompanionPetCommand,
  type CompanionLaunchPetResult,
  type CompanionPetStatus,
} from "@/lib/api/companion";
import { subscribeProviderDataChanged } from "@/lib/providerDataEvents";
import {
  loadCompanionProviderOverview,
  type CompanionProviderOverviewPayload,
} from "@/lib/provider/companionProviderOverview";
import type { SettingsProviderView } from "@/types/page";
import { cn } from "@/lib/utils";
import { CompanionCapabilityPreferencesCard } from "./CompanionCapabilityPreferencesCard";

const SURFACE_CLASS_NAME =
  "rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5";
const PRIMARY_ACTION_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-[16px] border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95 disabled:opacity-60";
const ACTIVE_WORKSPACE_TRIGGER_CLASS =
  "data-[state=active]:border-emerald-200 data-[state=active]:bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,253,245,0.96)_56%,rgba(224,242,254,0.95)_100%)] data-[state=active]:text-slate-800 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-950/10";
const DEFAULT_COMPANION_ENDPOINT = "ws://127.0.0.1:45554/companion/pet";
const LIME_PET_RELEASES_URL =
  "https://github.com/limecloud/lime-pet/releases/latest";

function NoticeBar(props: { tone: "error" | "success"; message: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[18px] border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
        props.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      {props.tone === "success" ? (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
      )}
      <span>{props.message}</span>
    </div>
  );
}

function InfoPill(props: {
  label: string;
  tone?: "slate" | "emerald" | "amber";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
        props.tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : props.tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {props.label}
    </span>
  );
}

function RuntimeSummaryItem(props: {
  label: string;
  value: string;
  hint?: string;
  hintAriaLabel?: string;
}) {
  return (
    <div className="rounded-[16px] border border-slate-200/80 bg-slate-50/80 px-3.5 py-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
          <span>{props.label}</span>
          {props.hint ? (
            <WorkbenchInfoTip
              ariaLabel={props.hintAriaLabel ?? props.label}
              content={props.hint}
              tone="slate"
            />
          ) : null}
        </div>
        <p className="text-sm font-medium leading-6 text-slate-900 sm:text-right">
          {props.value}
        </p>
      </div>
    </div>
  );
}

function formatCompanionError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

function shouldShowCompanionInstallGuide(
  result: CompanionLaunchPetResult,
): boolean {
  if (result.launched || result.resolved_path) {
    return false;
  }

  const message = result.message?.trim() ?? "";
  if (!message) {
    return false;
  }

  return (
    message.includes("未找到 Lime Pet 可执行产物") ||
    message.includes("请先安装桌宠应用") ||
    message.includes("未安装桌宠应用")
  );
}

function formatCompanionCapabilityLabel(
  t: ProviderSettingsTranslate,
  capability: string,
): string {
  switch (capability) {
    case "provider-overview":
      return t(
        "settings.providers.companion.bridge.capability.providerOverview",
        "Provider 概览",
      );
    case "provider-sync-request":
      return t(
        "settings.providers.companion.bridge.capability.syncRequest",
        "主动请求同步",
      );
    default:
      return capability;
  }
}

function formatCompanionVisualStateLabel(
  t: ProviderSettingsTranslate,
  state: CompanionPetStatus["last_state"],
): string {
  switch (state) {
    case "hidden":
      return t(
        "settings.providers.companion.bridge.visualState.hidden",
        "隐藏",
      );
    case "walking":
      return t(
        "settings.providers.companion.bridge.visualState.walking",
        "游走",
      );
    case "thinking":
      return t(
        "settings.providers.companion.bridge.visualState.thinking",
        "思考中",
      );
    case "done":
      return t("settings.providers.companion.bridge.visualState.done", "完成");
    case "idle":
    default:
      return t("settings.providers.companion.bridge.visualState.idle", "待命");
  }
}

function formatCompanionPlatformLabel(
  t: ProviderSettingsTranslate,
  platform: string | null | undefined,
): string {
  switch (platform) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return (
        platform?.trim() ||
        t("settings.providers.companion.bridge.platform.unknown", "未上报平台")
      );
  }
}

function formatCompanionDateTime(
  t: ProviderSettingsTranslate,
  value: Date | null,
  locale?: string | null,
): string {
  if (!value) {
    return t(
      "settings.providers.companion.bridge.preview.lastSyncNever",
      "尚未同步",
    );
  }

  return formatDate(value, {
    locale,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function CompanionProviderBridgeCard() {
  const { t, i18n } = useTranslation("settings");
  const unknownErrorLabel = t(
    "settings.providers.companion.bridge.message.unknownError",
    "未知错误",
  );
  const [status, setStatus] = useState<CompanionPetStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [launchingPet, setLaunchingPet] = useState(false);
  const [installPromptVisible, setInstallPromptVisible] = useState(false);
  const [syncingPreview, setSyncingPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [providerOverviewPreview, setProviderOverviewPreview] =
    useState<CompanionProviderOverviewPayload | null>(null);
  const [lastManualSyncAt, setLastManualSyncAt] = useState<Date | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let statusUnlisten: (() => void) | null = null;
    let unsubscribeProviderData: (() => void) | null = null;

    const applyStatus = (nextStatus: CompanionPetStatus) => {
      if (cancelled) {
        return;
      }
      setStatus(nextStatus);
    };

    const loadProviderPreview = async (forceRefresh = false) => {
      if (!cancelled) {
        setPreviewLoading(true);
        setPreviewError(null);
      }

      try {
        const payload = await loadCompanionProviderOverview({
          forceRefresh,
        });
        if (cancelled) {
          return;
        }
        setProviderOverviewPreview(payload);
      } catch (error) {
        if (!cancelled) {
          setPreviewError(
            t("settings.providers.companion.bridge.message.previewLoadFailed", {
              error: formatCompanionError(error, unknownErrorLabel),
              defaultValue: "读取桌宠摘要预览失败：{{error}}",
            }),
          );
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    const loadStatus = async (initial = false) => {
      if (initial) {
        setLoadingStatus(true);
      } else {
        setRefreshingStatus(true);
      }

      try {
        const nextStatus = await getCompanionPetStatus();
        applyStatus(nextStatus);
      } catch (error) {
        if (!cancelled) {
          setActionFeedback({
            tone: "error",
            message: t(
              "settings.providers.companion.bridge.message.statusLoadFailed",
              {
                error: formatCompanionError(error, unknownErrorLabel),
                defaultValue: "读取桌宠状态失败：{{error}}",
              },
            ),
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
          setRefreshingStatus(false);
        }
      }
    };

    void loadStatus(true);
    void loadProviderPreview();

    void listenCompanionPetStatus((nextStatus) => {
      applyStatus(nextStatus);
    })
      .then((unlisten) => {
        if (cancelled) {
          void unlisten();
          return;
        }
        statusUnlisten = unlisten;
      })
      .catch((error) => {
        if (!cancelled) {
          setActionFeedback({
            tone: "error",
            message: t(
              "settings.providers.companion.bridge.message.statusListenFailed",
              {
                error: formatCompanionError(error, unknownErrorLabel),
                defaultValue: "监听桌宠状态失败：{{error}}",
              },
            ),
          });
        }
      });

    unsubscribeProviderData = subscribeProviderDataChanged(() => {
      void loadProviderPreview(true);
    });

    return () => {
      cancelled = true;
      if (statusUnlisten) {
        statusUnlisten();
      }
      if (unsubscribeProviderData) {
        unsubscribeProviderData();
      }
    };
  }, [t, unknownErrorLabel]);

  useEffect(() => {
    if (status?.connected) {
      setInstallPromptVisible(false);
    }
  }, [status?.connected]);

  const refreshStatus = async () => {
    setActionFeedback(null);
    setRefreshingStatus(true);
    setPreviewLoading(true);
    try {
      const [nextStatus] = await Promise.all([
        getCompanionPetStatus(),
        loadCompanionProviderOverview({ forceRefresh: true })
          .then((payload) => {
            setProviderOverviewPreview(payload);
            setPreviewError(null);
          })
          .catch((error) => {
            setPreviewError(
              t(
                "settings.providers.companion.bridge.message.previewLoadFailed",
                {
                  error: formatCompanionError(error, unknownErrorLabel),
                  defaultValue: "读取桌宠摘要预览失败：{{error}}",
                },
              ),
            );
          })
          .finally(() => {
            setPreviewLoading(false);
          }),
      ]);
      setStatus(nextStatus);
    } catch (error) {
      setActionFeedback({
        tone: "error",
        message: t(
          "settings.providers.companion.bridge.message.refreshFailed",
          {
            error: formatCompanionError(error, unknownErrorLabel),
            defaultValue: "刷新桌宠状态失败：{{error}}",
          },
        ),
      });
    } finally {
      setRefreshingStatus(false);
    }
  };

  const handleLaunchPet = async () => {
    setActionFeedback(null);
    setLaunchingPet(true);
    try {
      const result = await launchCompanionPet();
      const shouldPromptInstall = shouldShowCompanionInstallGuide(result);
      setInstallPromptVisible(shouldPromptInstall);

      if (result.launched) {
        setActionFeedback({
          tone: "success",
          message:
            result.message ||
            t(
              "settings.providers.companion.bridge.message.launchRequested",
              "已请求开启桌宠，请等待 Lime Pet 建立连接。",
            ),
        });
      } else {
        setActionFeedback({
          tone: "error",
          message: shouldPromptInstall
            ? t(
                "settings.providers.companion.bridge.message.installRequired",
                "当前设备还没有安装 Lime Pet，请先安装桌宠应用后再开启。",
              )
            : result.message ||
              t(
                "settings.providers.companion.bridge.message.executableMissing",
                "当前没有可用的 Lime Pet 可执行产物，请先安装桌宠应用。",
              ),
        });
      }

      const nextStatus = await getCompanionPetStatus();
      setStatus(nextStatus);
    } catch (error) {
      setActionFeedback({
        tone: "error",
        message: t("settings.providers.companion.bridge.message.launchFailed", {
          error: formatCompanionError(error, unknownErrorLabel),
          defaultValue: "启动桌宠失败：{{error}}",
        }),
      });
    } finally {
      setLaunchingPet(false);
    }
  };

  const handleSyncPreview = async () => {
    setActionFeedback(null);

    if (!providerOverviewPreview) {
      setActionFeedback({
        tone: "error",
        message: t(
          "settings.providers.companion.bridge.message.previewNotReady",
          "桌宠摘要预览尚未准备完成，请稍后再试。",
        ),
      });
      return;
    }

    if (!connected) {
      setActionFeedback({
        tone: "error",
        message: t(
          "settings.providers.companion.bridge.message.notConnected",
          "桌宠尚未连接，暂时无法同步摘要。",
        ),
      });
      return;
    }

    if (!supportsProviderOverview) {
      setActionFeedback({
        tone: "error",
        message: t(
          "settings.providers.companion.bridge.message.capabilityMissing",
          "当前桌宠未声明 Provider 概览能力，暂时无法接收摘要。",
        ),
      });
      return;
    }

    setSyncingPreview(true);
    try {
      const result = await sendCompanionPetCommand({
        event: "pet.provider_overview",
        payload: providerOverviewPreview,
      });

      if (!result.delivered) {
        setActionFeedback({
          tone: "error",
          message: t(
            "settings.providers.companion.bridge.message.notDelivered",
            "桌宠连接存在但本次摘要未送达，请检查 Companion 连接状态。",
          ),
        });
        return;
      }

      setActionFeedback({
        tone: "success",
        message: t("settings.providers.companion.bridge.message.synced", {
          count: providerOverviewPreview.total_provider_count,
          defaultValue: "已同步 {{count}} 个服务商摘要到桌宠。",
        }),
      });
      setLastManualSyncAt(new Date());
    } catch (error) {
      setActionFeedback({
        tone: "error",
        message: t("settings.providers.companion.bridge.message.syncFailed", {
          error: formatCompanionError(error, unknownErrorLabel),
          defaultValue: "同步桌宠摘要失败：{{error}}",
        }),
      });
    } finally {
      setSyncingPreview(false);
    }
  };

  const connected = Boolean(status?.connected);
  const serverListening = Boolean(status?.server_listening);
  const supportsProviderOverview = Boolean(
    status?.capabilities.includes("provider-overview"),
  );
  const endpoint = status?.endpoint || DEFAULT_COMPANION_ENDPOINT;
  const lastState = formatCompanionVisualStateLabel(
    t,
    status?.last_state || "idle",
  );
  const capabilityText =
    status && status.capabilities.length > 0
      ? status.capabilities
          .map((capability) => formatCompanionCapabilityLabel(t, capability))
          .join(" / ")
      : t(
          "settings.providers.companion.bridge.capability.undeclared",
          "未声明",
        );
  const previewProviders = providerOverviewPreview?.providers || [];
  const petIdentity =
    status?.client_id?.trim() ||
    t("settings.providers.companion.bridge.identity.pending", "等待桌宠上报");
  const syncDiagnostic = (() => {
    if (previewLoading) {
      return {
        label: t(
          "settings.providers.companion.bridge.diagnostic.previewLoading.label",
          "整理摘要中",
        ),
        hint: t(
          "settings.providers.companion.bridge.diagnostic.previewLoading.hint",
          "正在从当前服务商配置整理桌宠预览。",
        ),
      };
    }
    if (previewError) {
      return {
        label: t(
          "settings.providers.companion.bridge.diagnostic.previewError.label",
          "预览异常",
        ),
        hint: previewError,
      };
    }
    if (!serverListening) {
      return {
        label: t(
          "settings.providers.companion.bridge.diagnostic.hostMissing.label",
          "宿主未监听",
        ),
        hint: t(
          "settings.providers.companion.bridge.diagnostic.hostMissing.hint",
          "Companion 服务尚未监听，本地桌宠暂时无法接入。",
        ),
      };
    }
    if (!connected) {
      return {
        label: t(
          "settings.providers.companion.bridge.diagnostic.waitingConnection.label",
          "等待桌宠连接",
        ),
        hint: t(
          "settings.providers.companion.bridge.diagnostic.waitingConnection.hint",
          "Companion 已监听，可点击“开启桌宠”或检查桌宠是否已连上本地入口。",
        ),
      };
    }
    if (!supportsProviderOverview) {
      return {
        label: t(
          "settings.providers.companion.bridge.diagnostic.capabilityMissing.label",
          "能力未声明",
        ),
        hint: t(
          "settings.providers.companion.bridge.diagnostic.capabilityMissing.hint",
          "当前桌宠已连接，但尚未声明 Provider 概览能力，Lime 不会强行下发摘要。",
        ),
      };
    }
    if (syncingPreview) {
      return {
        label: t(
          "settings.providers.companion.bridge.diagnostic.syncing.label",
          "同步中",
        ),
        hint: t(
          "settings.providers.companion.bridge.diagnostic.syncing.hint",
          "正在把当前脱敏摘要发送给桌宠。",
        ),
      };
    }
    return {
      label: t(
        "settings.providers.companion.bridge.diagnostic.ready.label",
        "可立即同步",
      ),
      hint: t(
        "settings.providers.companion.bridge.diagnostic.ready.hint",
        "桌宠已连接且已声明 Provider 概览能力，可以手动下发当前摘要。",
      ),
    };
  })();
  const readinessChecks = [
    {
      key: "host",
      label: t(
        "settings.providers.companion.bridge.readiness.host.label",
        "Companion 宿主已监听",
      ),
      done: serverListening,
      pending: false,
      detail: serverListening
        ? t(
            "settings.providers.companion.bridge.readiness.host.ready",
            "Lime 已监听本地桌宠入口。",
          )
        : t(
            "settings.providers.companion.bridge.readiness.host.missing",
            "当前还没有可用的本地桌宠入口。",
          ),
    },
    {
      key: "connection",
      label: t(
        "settings.providers.companion.bridge.readiness.connection.label",
        "桌宠已建立连接",
      ),
      done: connected,
      pending: false,
      detail: connected
        ? t(
            "settings.providers.companion.bridge.readiness.connection.ready",
            "桌宠已经接入 Lime Companion。",
          )
        : t(
            "settings.providers.companion.bridge.readiness.connection.missing",
            "需要启动桌宠，或检查它是否连到了本地入口。",
          ),
    },
    {
      key: "capability",
      label: t(
        "settings.providers.companion.bridge.readiness.capability.label",
        "桌宠声明 Provider 概览能力",
      ),
      done: supportsProviderOverview,
      pending: connected && !supportsProviderOverview,
      detail: supportsProviderOverview
        ? t(
            "settings.providers.companion.bridge.readiness.capability.ready",
            "桌宠已声明可接收 provider-overview 摘要。",
          )
        : connected
          ? t(
              "settings.providers.companion.bridge.readiness.capability.pending",
              "当前桌宠已连接，但尚未声明 Provider 概览能力。",
            )
          : t(
              "settings.providers.companion.bridge.readiness.capability.waitingConnection",
              "桌宠连接建立后，Lime 会等待能力声明。",
            ),
    },
    {
      key: "preview",
      label: t(
        "settings.providers.companion.bridge.readiness.preview.label",
        "脱敏摘要已准备完成",
      ),
      done:
        !previewLoading &&
        !previewError &&
        providerOverviewPreview !== null &&
        previewProviders.length >= 0,
      pending: previewLoading,
      detail: previewLoading
        ? t(
            "settings.providers.companion.bridge.readiness.preview.loading",
            "正在从当前服务商配置整理脱敏摘要。",
          )
        : previewError
          ? previewError
          : t("settings.providers.companion.bridge.readiness.preview.ready", {
              count: providerOverviewPreview?.total_provider_count ?? 0,
              defaultValue: "当前已准备 {{count}} 个服务商摘要。",
            }),
    },
  ] as const;
  const nextAction = (() => {
    if (!serverListening) {
      return t(
        "settings.providers.companion.bridge.nextAction.startHost",
        "先让 Lime 完整启动 Companion 宿主，再连接桌宠。",
      );
    }
    if (!connected) {
      return t(
        "settings.providers.companion.bridge.nextAction.connectPet",
        "点击“开启桌宠”，或检查桌宠是否已连接到本地 Companion 地址。",
      );
    }
    if (!supportsProviderOverview) {
      return t(
        "settings.providers.companion.bridge.nextAction.declareCapability",
        "先让桌宠在 ready 事件里声明 Provider 概览能力，再尝试同步摘要。",
      );
    }
    if (previewLoading) {
      return t(
        "settings.providers.companion.bridge.nextAction.waitPreview",
        "等待 Lime 整理完当前 Provider 脱敏摘要。",
      );
    }
    if (previewError) {
      return t(
        "settings.providers.companion.bridge.nextAction.fixPreview",
        "先修复摘要预览异常，再把脱敏摘要发送给桌宠。",
      );
    }
    return t(
      "settings.providers.companion.bridge.nextAction.ready",
      "当前链路已就绪，可以直接点击“立即同步到桌宠”。",
    );
  })();

  return (
    <article
      className={SURFACE_CLASS_NAME}
      data-testid="companion-provider-card"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
              <Bot className="h-5 w-5" />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  Lime Pet Companion
                </h3>
                <InfoPill
                  label={
                    connected
                      ? t(
                          "settings.providers.companion.bridge.status.connected",
                          "桌宠已连接",
                        )
                      : serverListening
                        ? t(
                            "settings.providers.companion.bridge.status.waitingConnection",
                            "等待桌宠连接",
                          )
                        : t(
                            "settings.providers.companion.bridge.status.notListening",
                            "本地 Companion 未监听",
                          )
                  }
                  tone={
                    connected ? "emerald" : serverListening ? "amber" : "slate"
                  }
                />
                <InfoPill
                  label={
                    supportsProviderOverview
                      ? t(
                          "settings.providers.companion.bridge.status.autoSync",
                          "自动同步 Provider 概览",
                        )
                      : t(
                          "settings.providers.companion.bridge.status.providerOverviewMissing",
                          "未声明 Provider 概览",
                        )
                  }
                  tone={supportsProviderOverview ? "emerald" : "slate"}
                />
                <WorkbenchInfoTip
                  ariaLabel={t(
                    "settings.providers.companion.bridge.intro.tipAria",
                    "桌宠 Companion 说明",
                  )}
                  content={t(
                    "settings.providers.companion.bridge.intro.tip",
                    "桌宠通过本地 Companion 通道复用 Lime 的 AI 服务商状态，只接收脱敏后的可用性摘要，不会直接读取 API Key、OAuth 凭证或本地凭证文件。",
                  )}
                  tone="mint"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <RuntimeSummaryItem
              label={t(
                "settings.providers.companion.bridge.summary.bridge.label",
                "桥接状态",
              )}
              value={
                connected
                  ? t(
                      "settings.providers.companion.bridge.summary.bridge.connected",
                      "已接通",
                    )
                  : serverListening
                    ? t(
                        "settings.providers.companion.bridge.summary.bridge.waiting",
                        "等待连接",
                      )
                    : t(
                        "settings.providers.companion.bridge.summary.bridge.notListening",
                        "未监听",
                      )
              }
              hintAriaLabel={t(
                "settings.providers.companion.bridge.summary.bridge.tipAria",
                "桥接状态说明",
              )}
              hint={t(
                "settings.providers.companion.bridge.summary.bridge.hint",
                "Lime 负责本地 Companion 宿主，桌宠作为独立原生壳接入。",
              )}
            />
            <RuntimeSummaryItem
              label={t(
                "settings.providers.companion.bridge.summary.recent.label",
                "最近状态",
              )}
              value={lastState}
              hintAriaLabel={t(
                "settings.providers.companion.bridge.summary.recent.tipAria",
                "最近状态说明",
              )}
              hint={
                status?.last_event
                  ? t(
                      "settings.providers.companion.bridge.summary.recent.event",
                      {
                        event: status.last_event,
                        defaultValue: "最近事件：{{event}}",
                      },
                    )
                  : t(
                      "settings.providers.companion.bridge.summary.recent.empty",
                      "尚未收到桌宠事件",
                    )
              }
            />
            <RuntimeSummaryItem
              label={t(
                "settings.providers.companion.bridge.summary.capability.label",
                "能力",
              )}
              value={capabilityText}
              hintAriaLabel={t(
                "settings.providers.companion.bridge.summary.capability.tipAria",
                "能力说明",
              )}
              hint={t(
                "settings.providers.companion.bridge.summary.capability.hint",
                "能力由桌宠在 ready 事件里声明，Lime 只按声明下发脱敏数据。",
              )}
            />
            <RuntimeSummaryItem
              label={t(
                "settings.providers.companion.bridge.summary.identity.label",
                "桌宠身份",
              )}
              value={petIdentity}
              hintAriaLabel={t(
                "settings.providers.companion.bridge.summary.identity.tipAria",
                "桌宠身份说明",
              )}
              hint={t(
                "settings.providers.companion.bridge.summary.identity.platform",
                {
                  platform: formatCompanionPlatformLabel(t, status?.platform),
                  defaultValue: "平台：{{platform}}",
                },
              )}
            />
            <RuntimeSummaryItem
              label={t(
                "settings.providers.companion.bridge.summary.diagnostic.label",
                "同步诊断",
              )}
              value={syncDiagnostic.label}
              hintAriaLabel={t(
                "settings.providers.companion.bridge.summary.diagnostic.tipAria",
                "同步诊断说明",
              )}
              hint={syncDiagnostic.hint}
            />
          </div>

          <div className="rounded-[18px] border border-slate-200/80 bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  <span>
                    {t(
                      "settings.providers.companion.bridge.readiness.title",
                      "接入检查",
                    )}
                  </span>
                  <WorkbenchInfoTip
                    ariaLabel={t(
                      "settings.providers.companion.bridge.readiness.tipAria",
                      "桌宠接入检查说明",
                    )}
                    content={t(
                      "settings.providers.companion.bridge.readiness.tip",
                      "按“宿主监听、桌宠连接、能力声明、摘要准备”这四步排查桌宠接入状态。",
                    )}
                    tone="slate"
                  />
                </div>
              </div>
              <div className="rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-600">
                {t(
                  "settings.providers.companion.bridge.nextAction.label",
                  "当前建议：",
                )}
                <span className="font-medium text-slate-800">{nextAction}</span>
              </div>
            </div>

            <div
              className="mt-4 grid gap-3 md:grid-cols-2"
              data-testid="companion-readiness-grid"
            >
              {readinessChecks.map((item) => (
                <div
                  key={item.key}
                  className="rounded-[16px] border border-white bg-white px-4 py-3 shadow-sm shadow-slate-950/5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border",
                        item.done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : item.pending
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-50 text-slate-500",
                      )}
                    >
                      {item.done ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : item.pending ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        {item.label}
                      </p>
                      <p className="text-xs leading-5 text-slate-500">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-slate-200/80 bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  <span>
                    {t(
                      "settings.providers.companion.bridge.preview.title",
                      "桌宠视角预览",
                    )}
                  </span>
                  <WorkbenchInfoTip
                    ariaLabel={t(
                      "settings.providers.companion.bridge.preview.tipAria",
                      "桌宠视角预览说明",
                    )}
                    content={t(
                      "settings.providers.companion.bridge.preview.tip",
                      "这里展示 Lime 准备发给桌宠的服务商脱敏摘要，会基于当前 AI 服务商配置生成，但不会带出原始凭证。",
                    )}
                    tone="slate"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <InfoPill
                  label={t(
                    "settings.providers.companion.bridge.preview.total",
                    {
                      count: providerOverviewPreview?.total_provider_count ?? 0,
                      defaultValue: "服务商 {{count}}",
                    },
                  )}
                />
                <InfoPill
                  label={t(
                    "settings.providers.companion.bridge.preview.available",
                    {
                      count:
                        providerOverviewPreview?.available_provider_count ?? 0,
                      defaultValue: "可用 {{count}}",
                    },
                  )}
                  tone="emerald"
                />
                <InfoPill
                  label={t(
                    "settings.providers.companion.bridge.preview.attention",
                    {
                      count:
                        providerOverviewPreview?.needs_attention_provider_count ??
                        0,
                      defaultValue: "需关注 {{count}}",
                    },
                  )}
                  tone="amber"
                />
                <InfoPill
                  label={t(
                    "settings.providers.companion.bridge.preview.lastSync",
                    {
                      time: formatCompanionDateTime(
                        t,
                        lastManualSyncAt,
                        i18n.resolvedLanguage || i18n.language,
                      ),
                      defaultValue: "最近同步 {{time}}",
                    },
                  )}
                />
                <button
                  type="button"
                  onClick={() => void handleSyncPreview()}
                  disabled={
                    previewLoading ||
                    syncingPreview ||
                    !providerOverviewPreview ||
                    !connected ||
                    !supportsProviderOverview
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="companion-sync-preview"
                >
                  {syncingPreview ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {t(
                    "settings.providers.companion.bridge.preview.action.sync",
                    "立即同步到桌宠",
                  )}
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-500">
              {t(
                "settings.providers.companion.bridge.preview.endpoint",
                "Companion 地址：",
              )}
              <span className="font-medium text-slate-700">{endpoint}</span>
            </div>

            {previewLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {t(
                  "settings.providers.companion.bridge.preview.loading",
                  "正在整理桌宠摘要预览...",
                )}
              </div>
            ) : previewProviders.length > 0 ? (
              <div
                className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                data-testid="companion-provider-preview-grid"
              >
                {previewProviders.map((provider) => (
                  <div
                    key={provider.provider_type}
                    className="rounded-[16px] border border-white bg-white px-4 py-3 shadow-sm shadow-slate-950/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {provider.display_name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {provider.provider_type}
                        </p>
                      </div>
                      <InfoPill
                        label={
                          provider.available
                            ? t(
                                "settings.providers.companion.bridge.preview.provider.available",
                                "可用",
                              )
                            : t(
                                "settings.providers.companion.bridge.preview.provider.unavailable",
                                "不可用",
                              )
                        }
                        tone={provider.available ? "emerald" : "amber"}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>
                        {t(
                          "settings.providers.companion.bridge.preview.provider.configCount",
                          {
                            count: provider.total_count,
                            defaultValue: "配置 {{count}}",
                          },
                        )}
                      </span>
                      <span>
                        {t(
                          "settings.providers.companion.bridge.preview.provider.healthyCount",
                          {
                            count: provider.healthy_count,
                            defaultValue: "健康 {{count}}",
                          },
                        )}
                      </span>
                      {provider.needs_attention ? (
                        <span className="text-amber-700">
                          {t(
                            "settings.providers.companion.bridge.preview.provider.needsAttention",
                            "需要关注",
                          )}
                        </span>
                      ) : (
                        <span className="text-emerald-700">
                          {t(
                            "settings.providers.companion.bridge.preview.provider.stable",
                            "状态稳定",
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[16px] border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                {t(
                  "settings.providers.companion.bridge.preview.empty",
                  "当前还没有可供桌宠消费的服务商摘要。配置任一服务商后，这里会显示脱敏后的可用性信息。",
                )}
              </div>
            )}
          </div>

          {status?.last_error ? (
            <NoticeBar
              tone="error"
              message={t(
                "settings.providers.companion.bridge.message.lastError",
                {
                  error: status.last_error,
                  defaultValue: "桌宠最近一次错误：{{error}}",
                },
              )}
            />
          ) : null}

          {previewError ? (
            <NoticeBar tone="error" message={previewError} />
          ) : null}

          {installPromptVisible ? (
            <div
              className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm shadow-slate-950/5"
              data-testid="companion-install-guide"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">
                    {t(
                      "settings.providers.companion.bridge.install.title",
                      "还没有安装 Lime Pet",
                    )}
                  </p>
                  <p className="text-sm leading-6 text-amber-800">
                    {t(
                      "settings.providers.companion.bridge.install.description",
                      "先安装桌宠客户端，再回到这里点击“开启桌宠”，Lime 会继续负责本地 Companion 宿主与状态同步。",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void openUrl(LIME_PET_RELEASES_URL)}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 transition hover:border-amber-400 hover:bg-amber-100/40"
                  data-testid="companion-install-button"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t(
                    "settings.providers.companion.bridge.install.action.download",
                    "下载安装 Lime Pet",
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {actionFeedback ? (
            <NoticeBar
              tone={actionFeedback.tone}
              message={actionFeedback.message}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-2 xl:min-w-[220px]">
          <button
            type="button"
            onClick={() => void refreshStatus()}
            disabled={loadingStatus || refreshingStatus}
            className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            data-testid="companion-refresh"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (loadingStatus || refreshingStatus) && "animate-spin",
              )}
            />
            {loadingStatus
              ? t(
                  "settings.providers.companion.bridge.action.loadingStatus",
                  "读取状态中",
                )
              : t(
                  "settings.providers.companion.bridge.action.refresh",
                  "刷新桌宠状态",
                )}
          </button>
          <button
            type="button"
            onClick={() => void handleLaunchPet()}
            disabled={launchingPet}
            className={PRIMARY_ACTION_BUTTON_CLASS}
            data-testid="companion-launch"
          >
            {launchingPet ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            {connected
              ? t(
                  "settings.providers.companion.bridge.action.reopen",
                  "重新打开桌宠",
                )
              : t(
                  "settings.providers.companion.bridge.action.launch",
                  "开启桌宠",
                )}
          </button>
        </div>
      </div>
    </article>
  );
}

type ProviderWorkspaceView = SettingsProviderView;
type ProviderSettingsTranslate = TFunction<"settings", undefined>;

function createProviderWorkspaceViewMeta(t: ProviderSettingsTranslate): Array<{
  value: ProviderWorkspaceView;
  label: string;
  summary: string;
  icon: typeof KeyRound;
}> {
  return [
    {
      value: "settings",
      label: t("settings.providers.workspaceView.settings.label", "服务商设置"),
      summary: t(
        "settings.providers.workspaceView.settings.summary",
        "Provider / API Key / 模型",
      ),
      icon: KeyRound,
    },
    {
      value: "cloud",
      label: t("settings.providers.workspaceView.cloud.label", "云端服务"),
      summary: t(
        "settings.providers.workspaceView.cloud.summary",
        "Offer / 目录 / 会话",
      ),
      icon: Cloud,
    },
    {
      value: "companion",
      label: t("settings.providers.workspaceView.companion.label", "桌宠管理"),
      summary: t(
        "settings.providers.workspaceView.companion.summary",
        "Companion / 同步 / 诊断",
      ),
      icon: Bot,
    },
  ];
}

export interface CloudProviderSettingsProps {
  initialView?: ProviderWorkspaceView;
}

export function CloudProviderSettings(props: CloudProviderSettingsProps) {
  const { t } = useTranslation("settings");
  const { initialView } = props;
  const {
    runtime,
    hubProviderName,
    session,
    initializing,
    openingGoogleLogin,
    errorMessage,
    infoMessage,
    handleGoogleLogin,
    openUserCenter,
  } = useOemCloudAccess();

  const isOemRuntime = Boolean(runtime);
  const cloudBrandLabel =
    hubProviderName?.trim() ||
    t("settings.providers.cloud.brandFallback", "Lime 云端");
  const showProviderSettingsEntry = true;
  const providerWorkspaceViewMeta = useMemo(
    () => createProviderWorkspaceViewMeta(t),
    [t],
  );
  const workspaceViews = useMemo(() => {
    const orderedViews: ProviderWorkspaceView[] = [];

    if (showProviderSettingsEntry) {
      orderedViews.push("settings");
    }

    if (isOemRuntime) {
      orderedViews.push("cloud");
    }

    if (!orderedViews.includes("companion")) {
      orderedViews.push("companion");
    }

    return orderedViews.map(
      (view) => providerWorkspaceViewMeta.find((item) => item.value === view)!,
    );
  }, [isOemRuntime, providerWorkspaceViewMeta, showProviderSettingsEntry]);
  const defaultView = useMemo<ProviderWorkspaceView>(() => {
    if (
      initialView &&
      initialView !== "cloud" &&
      workspaceViews.some((item) => item.value === initialView)
    ) {
      return initialView;
    }

    return (
      workspaceViews.find((item) => item.value === "settings")?.value ??
      workspaceViews.find((item) => item.value !== "cloud")?.value ??
      workspaceViews[0]?.value ??
      "settings"
    );
  }, [initialView, workspaceViews]);
  const [activeView, setActiveView] =
    useState<ProviderWorkspaceView>(defaultView);
  const [cloudOpenError, setCloudOpenError] = useState<string | null>(null);
  const [cloudOpenInfo, setCloudOpenInfo] = useState<string | null>(null);

  const handleOpenCloudUserCenter = useCallback(
    async (path = "/welcome") => {
      if (!runtime) {
        setCloudOpenInfo(null);
        setCloudOpenError(
          t(
            "settings.providers.cloud.message.userCenterMissing",
            "当前版本未配置云端用户中心入口。",
          ),
        );
        return;
      }

      if (initializing || openingGoogleLogin) {
        return;
      }

      setCloudOpenError(null);
      setCloudOpenInfo(null);

      try {
        if (!session) {
          await handleGoogleLogin();
          setCloudOpenInfo(
            t("settings.providers.cloud.message.loginOpened", {
              brand: cloudBrandLabel,
              defaultValue: "已打开 {{brand}} 登录页，请在浏览器完成授权。",
            }),
          );
          return;
        }

        await openUserCenter(path);
        setCloudOpenInfo(
          t("settings.providers.cloud.message.userCenterOpened", {
            brand: cloudBrandLabel,
            defaultValue: "已在浏览器打开 {{brand}} 用户中心。",
          }),
        );
      } catch (error) {
        const detail =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : t(
                "settings.providers.cloud.message.browserRetry",
                "请稍后重试，或检查系统浏览器是否可用。",
              );
        setCloudOpenError(
          t("settings.providers.cloud.message.userCenterOpenFailed", {
            brand: cloudBrandLabel,
            detail,
            defaultValue: "打开 {{brand}} 用户中心失败：{{detail}}",
          }),
        );
      }
    },
    [
      cloudBrandLabel,
      handleGoogleLogin,
      initializing,
      openingGoogleLogin,
      openUserCenter,
      runtime,
      session,
      t,
    ],
  );

  const handleWorkspaceViewChange = useCallback(
    (value: string) => {
      const nextView = value as ProviderWorkspaceView;
      if (nextView === "cloud") {
        void handleOpenCloudUserCenter("/welcome");
        return;
      }

      setActiveView(nextView);
    },
    [handleOpenCloudUserCenter],
  );

  useEffect(() => {
    if (!workspaceViews.some((item) => item.value === activeView)) {
      setActiveView(defaultView);
    }
  }, [activeView, defaultView, workspaceViews]);

  useEffect(() => {
    if (!initialView) {
      return;
    }

    if (initialView === "cloud") {
      setActiveView(defaultView);
      return;
    }

    if (workspaceViews.some((item) => item.value === initialView)) {
      setActiveView(initialView);
    }
  }, [defaultView, initialView, workspaceViews]);

  const localProviderContent = (
    <ApiKeyProviderSection
      className="min-h-[640px]"
      exposeOemLoginPrompt={isOemRuntime && !session}
      onOemLogin={() => {
        void handleOpenCloudUserCenter("/welcome");
      }}
    />
  );
  const companionContent = (
    <div className="space-y-5">
      <CompanionProviderBridgeCard />
      <CompanionCapabilityPreferencesCard />
    </div>
  );

  return (
    <div className="space-y-4">
      {errorMessage ? <NoticeBar tone="error" message={errorMessage} /> : null}
      {infoMessage ? <NoticeBar tone="success" message={infoMessage} /> : null}
      {cloudOpenError ? (
        <NoticeBar tone="error" message={cloudOpenError} />
      ) : null}
      {cloudOpenInfo ? (
        <NoticeBar tone="success" message={cloudOpenInfo} />
      ) : null}

      <Tabs
        value={activeView}
        onValueChange={handleWorkspaceViewChange}
        className="space-y-4"
      >
        {workspaceViews.length > 1 ? (
          <TabsList
            className={cn(
              "grid h-auto w-full gap-2 rounded-[22px] border border-slate-200/80 bg-slate-100 p-1.5 shadow-sm",
              workspaceViews.length === 3
                ? "md:max-w-[680px]"
                : "md:max-w-[460px]",
              workspaceViews.length === 1
                ? "grid-cols-1"
                : workspaceViews.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-3",
            )}
            data-testid="provider-workspace-switcher"
          >
            {workspaceViews.map((item) => {
              const ItemIcon = item.icon;

              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className={cn(
                    "h-auto min-h-[60px] items-center justify-start gap-2 rounded-[18px] border border-transparent bg-transparent px-4 py-3 text-left text-slate-600 shadow-none",
                    ACTIVE_WORKSPACE_TRIGGER_CLASS,
                  )}
                  data-testid={`provider-workspace-tab-${item.value}`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-2xl border border-current/15 bg-white/80 text-current">
                    <ItemIcon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">{item.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        ) : null}

        {showProviderSettingsEntry ? (
          <TabsContent value="settings" className="mt-0">
            {localProviderContent}
          </TabsContent>
        ) : null}

        <TabsContent value="companion" className="mt-0">
          {companionContent}
        </TabsContent>
      </Tabs>
    </div>
  );
}
