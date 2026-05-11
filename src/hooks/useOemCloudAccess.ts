import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearSkillCatalogCache } from "@/lib/api/skillCatalog";
import { clearServiceSkillCatalogCache } from "@/lib/api/serviceSkills";
import {
  type ClientPasswordLoginPayload,
  type CreateClientAccessTokenPayload,
  type OemCloudAccessToken,
  type OemCloudActivationResponse,
  type OemCloudActiveAccessTokenResponse,
  type OemCloudBillingDashboard,
  type OemCloudBootstrapResponse,
  type OemCloudCreditAccount,
  type OemCloudCreditTopupOrder,
  type OemCloudCreditsDashboard,
  type OemCloudOrder,
  type OemCloudPaymentAction,
  type OemCloudReadiness,
  type OemCloudCurrentSession,
  type OemCloudEntitlementPlan,
  type OemCloudPaymentConfig,
  type OemCloudPartnerHubAccessMode,
  type OemCloudPartnerHubConfigMode,
  type OemCloudPartnerHubModelsSource,
  type OemCloudProviderModelItem,
  type OemCloudProviderOfferDetail,
  type OemCloudProviderOfferSummary,
  type OemCloudProviderPreference,
  type OemCloudSubscription,
  type OemCloudTopupPackage,
  type OemCloudUsageDashboard,
  type SendAuthEmailCodeResponse,
  type VerifyClientAuthEmailCodePayload,
  OemCloudControlPlaneError,
  createClientAccessToken,
  getClientBootstrap,
  getClientCloudActivation,
  getClientCreditTopupOrder,
  getClientOrder,
  getClientProviderOffer,
  listClientProviderOfferModels,
  loginClientByPassword,
  logoutClient,
  revokeClientAccessToken,
  rotateClientAccessToken,
  sendClientAuthEmailCode,
  updateClientProviderPreference,
  verifyClientAuthEmailCode,
} from "@/lib/api/oemCloudControlPlane";
import { resolveOemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import {
  OEM_CLOUD_OAUTH_COMPLETED_EVENT,
  type OemCloudDesktopOAuthCompletedDetail,
} from "@/lib/oemCloudDesktopAuth";
import {
  buildOemCloudUserCenterUrl,
  createExternalBrowserOpenTarget,
  openExternalUrl,
  startOemCloudLogin,
} from "@/lib/oemCloudLoginLauncher";
import {
  clearStoredOemCloudPaymentReturn,
  consumeStoredOemCloudPaymentReturn,
  OEM_CLOUD_PAYMENT_RETURN_EVENT,
  type OemCloudPaymentReturnDetail,
} from "@/lib/oemCloudPaymentReturn";
import {
  applyStoredOemCloudSessionToWindow,
  clearOemCloudBootstrapSnapshot,
  clearStoredOemCloudSessionState,
  getOemCloudBootstrapSnapshot,
  getStoredOemCloudSessionState,
  setOemCloudBootstrapSnapshot,
  setStoredOemCloudSessionState,
} from "@/lib/oemCloudSession";
import { syncServiceSkillCatalogFromBootstrapPayload } from "@/lib/serviceSkillCatalogBootstrap";
import { syncSkillCatalogFromBootstrapPayload } from "@/lib/skillCatalogBootstrap";
import {
  clearSiteAdapterCatalogCache,
  syncSiteAdapterCatalogFromBootstrapPayload,
} from "@/lib/siteAdapterCatalogBootstrap";
import { resolveOemLimeHubProviderName } from "@/lib/oemLimeHubProvider";

type OemCloudLoginMode = "password" | "email_code";

function buildErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  const message = String(error ?? "").trim();
  if (!message || message === "[object Object]") {
    return fallback;
  }
  return message;
}

function isAuthExpired(error: unknown) {
  return (
    error instanceof OemCloudControlPlaneError &&
    (error.status === 401 || error.status === 403)
  );
}

export function formatOemCloudDateTime(value?: string) {
  if (!value) {
    return "未知";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

interface OemCloudAccessFormatCopy {
  unknown: string;
  accessMode: {
    session: string;
    hubToken: string;
    apiKey: string;
  };
  configMode: {
    managed: string;
    hybrid: string;
    developer: string;
  };
  modelsSource: {
    hubCatalog: string;
    manual: string;
  };
}

interface OemCloudPaymentTitleCopy {
  planOrderTitle: string;
  creditTopupOrderTitle: string;
}

function formatOemCloudAccessModeLabel(
  value: OemCloudPartnerHubAccessMode | undefined,
  copy: OemCloudAccessFormatCopy,
) {
  switch (value) {
    case "session":
      return copy.accessMode.session;
    case "hub_token":
      return copy.accessMode.hubToken;
    case "api_key":
      return copy.accessMode.apiKey;
    default:
      return copy.unknown;
  }
}

function formatOemCloudConfigModeLabel(
  value: OemCloudPartnerHubConfigMode | undefined,
  copy: OemCloudAccessFormatCopy,
) {
  switch (value) {
    case "managed":
      return copy.configMode.managed;
    case "hybrid":
      return copy.configMode.hybrid;
    case "developer":
      return copy.configMode.developer;
    default:
      return copy.unknown;
  }
}

function formatOemCloudModelsSourceLabel(
  value: OemCloudPartnerHubModelsSource | undefined,
  copy: OemCloudAccessFormatCopy,
) {
  switch (value) {
    case "hub_catalog":
      return copy.modelsSource.hubCatalog;
    case "manual":
      return copy.modelsSource.manual;
    default:
      return copy.unknown;
  }
}

const PAYMENT_STATUS_WATCH_INTERVAL_MS = 2500;
const PAYMENT_STATUS_WATCH_MAX_ATTEMPTS = 72;

type OemCloudPaymentWatchKind = "plan_order" | "credit_topup_order";

interface OemCloudPaymentWatcher {
  kind: OemCloudPaymentWatchKind;
  orderId: string;
  title: string;
  status: "waiting" | "confirmed" | "stopped";
  attempts: number;
  message?: string;
}

function normalizePaymentStatus(value?: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isPaidPaymentStatus(value?: string) {
  return [
    "paid",
    "completed",
    "complete",
    "succeeded",
    "success",
    "active",
  ].includes(normalizePaymentStatus(value));
}

function isTerminalUnpaidPaymentStatus(value?: string) {
  return [
    "cancelled",
    "canceled",
    "closed",
    "expired",
    "failed",
    "failure",
    "refunded",
  ].includes(normalizePaymentStatus(value));
}

function resolveOrderTitle(
  kind: OemCloudPaymentWatchKind,
  order: OemCloudOrder | OemCloudCreditTopupOrder,
  copy: OemCloudPaymentTitleCopy,
) {
  if (kind === "plan_order") {
    return (order as OemCloudOrder).planName || copy.planOrderTitle;
  }
  return (
    (order as OemCloudCreditTopupOrder).packageName ||
    copy.creditTopupOrderTitle
  );
}

function normalizePaymentWatchKind(
  value?: string,
): OemCloudPaymentWatchKind | null {
  if (value === "plan_order" || value === "credit_topup_order") {
    return value;
  }
  return null;
}

function resolvePaymentReturnTitle(
  kind: OemCloudPaymentWatchKind,
  copy: OemCloudPaymentTitleCopy,
) {
  return kind === "plan_order"
    ? copy.planOrderTitle
    : copy.creditTopupOrderTitle;
}

interface OemCloudCommerceSnapshot {
  cloudActivation: OemCloudActivationResponse | null;
  cloudReadiness: OemCloudReadiness | null;
  pendingPayment: OemCloudPaymentAction | null;
  paymentConfigs: OemCloudPaymentConfig[];
  plans: OemCloudEntitlementPlan[];
  subscription: OemCloudSubscription | null;
  creditAccount: OemCloudCreditAccount | null;
  creditsDashboard: OemCloudCreditsDashboard | null;
  topupPackages: OemCloudTopupPackage[];
  usageDashboard: OemCloudUsageDashboard | null;
  billingDashboard: OemCloudBillingDashboard | null;
  orders: OemCloudOrder[];
  creditTopupOrders: OemCloudCreditTopupOrder[];
  accessTokens: OemCloudAccessToken[];
  activeAccessToken: OemCloudActiveAccessTokenResponse | null;
}

function buildEmptyCommerceSnapshot(): OemCloudCommerceSnapshot {
  return {
    cloudActivation: null,
    cloudReadiness: null,
    pendingPayment: null,
    paymentConfigs: [],
    plans: [],
    subscription: null,
    creditAccount: null,
    creditsDashboard: null,
    topupPackages: [],
    usageDashboard: null,
    billingDashboard: null,
    orders: [],
    creditTopupOrders: [],
    accessTokens: [],
    activeAccessToken: null,
  };
}

export function useOemCloudAccess() {
  const { t } = useTranslation("common");
  const runtime = resolveOemCloudRuntimeContext();
  const authCopy = useMemo(
    () => ({
      unavailable: t("common.oemCloudAccess.auth.unavailable", {
        defaultValue: "当前版本未配置云端登录入口。",
      }),
      googleSynced: t("common.oemCloudAccess.auth.googleSynced", {
        defaultValue: "Google 登录成功，已同步云端目录。",
      }),
      cloudSynced: t("common.oemCloudAccess.auth.cloudSynced", {
        defaultValue: "云端登录成功，已同步目录。",
      }),
      googleDesktopOpened: t(
        "common.oemCloudAccess.auth.googleDesktopOpened",
        {
          defaultValue:
            "已打开系统浏览器，请完成 Google 授权；如果浏览器出现确认页，请继续完成，桌面端会自动同步登录结果。",
        },
      ),
      userCenterOpened: t("common.oemCloudAccess.auth.userCenterOpened", {
        defaultValue:
          "已打开 Lime 云端登录页，请在浏览器完成授权，桌面端会自动同步登录结果。",
      }),
      openFailedFallback: t(
        "common.oemCloudAccess.auth.openFailedFallback",
        {
          defaultValue: "打开 Lime 云端登录页失败",
        },
      ),
      syncFailedFallback: t(
        "common.oemCloudAccess.auth.syncFailedFallback",
        {
          defaultValue: "同步云端登录结果失败",
        },
      ),
      browserPreopenTitle: t(
        "common.oemCloudAccess.auth.browserPreopenTitle",
        {
          defaultValue: "正在打开登录页...",
        },
      ),
      browserPreopenBody: t(
        "common.oemCloudAccess.auth.browserPreopenBody",
        {
          defaultValue: "正在打开登录页，请稍候...",
        },
      ),
      systemBrowserOpenFailed: t(
        "common.oemCloudAccess.auth.systemBrowserOpenFailed",
        {
          defaultValue: "系统浏览器打开失败。",
        },
      ),
      systemBrowserOpenFailedWithMessage: (message: string) =>
        t("common.oemCloudAccess.auth.systemBrowserOpenFailedWithMessage", {
          message,
          defaultValue: "系统浏览器打开失败：{{message}}",
        }),
      unsupportedExternalBrowser: t(
        "common.oemCloudAccess.auth.unsupportedExternalBrowser",
        {
          defaultValue: "当前环境不支持打开外部浏览器",
        },
      ),
      popupBlocked: t("common.oemCloudAccess.auth.popupBlocked", {
        defaultValue:
          "登录页没有被浏览器打开，可能被弹窗拦截。请点击“重新打开登录页”，或复制登录链接到浏览器打开。",
      }),
    }),
    [t],
  );
  const paymentCopy = useMemo(
    () => ({
      waitingForCallback: t(
        "common.oemCloudAccess.payment.waitingForCallback",
        {
          defaultValue: "已打开支付页，正在等待支付渠道回调。",
        },
      ),
      confirmedPlanWatcher: t(
        "common.oemCloudAccess.payment.confirmedPlanWatcher",
        {
          defaultValue: "支付已确认，套餐权益已同步到客户端。",
        },
      ),
      confirmedCreditWatcher: t(
        "common.oemCloudAccess.payment.confirmedCreditWatcher",
        {
          defaultValue: "支付已确认，Token 积分余额已同步到客户端。",
        },
      ),
      confirmedPlanInfo: t(
        "common.oemCloudAccess.payment.confirmedPlanInfo",
        {
          defaultValue: "支付已确认，套餐权益已同步，可以继续使用云端模型。",
        },
      ),
      confirmedCreditInfo: t(
        "common.oemCloudAccess.payment.confirmedCreditInfo",
        {
          defaultValue: "支付已确认，Token 积分余额已同步。",
        },
      ),
      terminalUnpaidWatcher: t(
        "common.oemCloudAccess.payment.terminalUnpaidWatcher",
        {
          defaultValue: "支付渠道返回未完成终态，请重新发起支付或刷新状态。",
        },
      ),
      terminalUnpaidError: t(
        "common.oemCloudAccess.payment.terminalUnpaidError",
        {
          defaultValue: "支付未完成，请重新发起支付或刷新云端状态。",
        },
      ),
      timeoutWatcher: t("common.oemCloudAccess.payment.timeoutWatcher", {
        defaultValue: "仍未收到支付回调，请稍后手动刷新云端状态。",
      }),
      timeoutInfo: t("common.oemCloudAccess.payment.timeoutInfo", {
        defaultValue: "仍在等待支付渠道回调，请稍后点击“刷新云端状态”。",
      }),
      confirmFailedFallback: t(
        "common.oemCloudAccess.payment.confirmFailedFallback",
        {
          defaultValue: "确认支付结果失败",
        },
      ),
      returnSyncing: t("common.oemCloudAccess.payment.returnSyncing", {
        defaultValue: "已回到 Lime，正在同步支付状态、权益与账本。",
      }),
      returnSynced: t("common.oemCloudAccess.payment.returnSynced", {
        defaultValue: "已同步最新云端权益、积分余额与账本状态。",
      }),
      returnUnpaidWatcher: t(
        "common.oemCloudAccess.payment.returnUnpaidWatcher",
        {
          defaultValue: "支付页已返回未完成状态，请重新发起支付或刷新云端状态。",
        },
      ),
      returnUnpaidInfo: t(
        "common.oemCloudAccess.payment.returnUnpaidInfo",
        {
          defaultValue: "支付页已返回未完成状态，云端状态已同步。",
        },
      ),
      returnSyncFailedFallback: t(
        "common.oemCloudAccess.payment.returnSyncFailedFallback",
        {
          defaultValue: "同步支付回跳结果失败",
        },
      ),
      planOrderTitle: t("common.oemCloudAccess.payment.planOrderTitle", {
        defaultValue: "套餐订单",
      }),
      creditTopupOrderTitle: t(
        "common.oemCloudAccess.payment.creditTopupOrderTitle",
        {
          defaultValue: "充值订单",
        },
      ),
    }),
    [t],
  );
  const cloudCopy = useMemo(
    () => ({
      session: {
        syncActivationFailedFallback: t(
          "common.oemCloudAccess.session.syncActivationFailedFallback",
          {
            defaultValue: "同步云端激活状态失败",
          },
        ),
        expiredRelogin: t("common.oemCloudAccess.session.expiredRelogin", {
          defaultValue: "云端会话已过期，请重新登录。",
        }),
        invalidRelogin: t("common.oemCloudAccess.session.invalidRelogin", {
          defaultValue: "云端会话已失效，请重新登录。",
        }),
        restoreFailedFallback: t(
          "common.oemCloudAccess.session.restoreFailedFallback",
          {
            defaultValue: "恢复云端会话失败",
          },
        ),
        refreshSuccess: t("common.oemCloudAccess.session.refreshSuccess", {
          defaultValue: "已同步最新云端会话、服务目录与服务技能快照。",
        }),
        refreshFailedFallback: t(
          "common.oemCloudAccess.session.refreshFailedFallback",
          {
            defaultValue: "刷新云端状态失败",
          },
        ),
        localCleared: t("common.oemCloudAccess.session.localCleared", {
          defaultValue: "已清理本地云端会话。",
        }),
        logoutSuccess: t("common.oemCloudAccess.session.logoutSuccess", {
          defaultValue: "已退出云端会话。",
        }),
        logoutFallback: t("common.oemCloudAccess.session.logoutFallback", {
          defaultValue: "本地会话已清理，但服务端注销未确认。",
        }),
        logoutFailedFallback: t(
          "common.oemCloudAccess.session.logoutFailedFallback",
          {
            defaultValue: "服务端注销失败",
          },
        ),
      },
      emailCode: {
        identifierRequired: t(
          "common.oemCloudAccess.emailCode.identifierRequired",
          {
            defaultValue: "请输入邮箱或账号后再发送验证码。",
          },
        ),
        sent: (maskedEmail: string, minutes: number) =>
          t("common.oemCloudAccess.emailCode.sent", {
            maskedEmail,
            minutes,
            defaultValue:
              "验证码已发送至 {{maskedEmail}}，有效期约 {{minutes}} 分钟。",
          }),
        sendFailedFallback: t(
          "common.oemCloudAccess.emailCode.sendFailedFallback",
          {
            defaultValue: "发送验证码失败",
          },
        ),
        loginFieldsRequired: t(
          "common.oemCloudAccess.emailCode.loginFieldsRequired",
          {
            defaultValue: "请先填写邮箱/账号和验证码。",
          },
        ),
        loginSuccess: t("common.oemCloudAccess.emailCode.loginSuccess", {
          defaultValue: "验证码登录成功，已同步云端目录。",
        }),
        loginFailedFallback: t(
          "common.oemCloudAccess.emailCode.loginFailedFallback",
          {
            defaultValue: "验证码登录失败",
          },
        ),
      },
      password: {
        fieldsRequired: t("common.oemCloudAccess.password.fieldsRequired", {
          defaultValue: "请输入账号和密码。",
        }),
        loginSuccess: t("common.oemCloudAccess.password.loginSuccess", {
          defaultValue: "账号登录成功，已同步云端目录。",
        }),
        loginFailedFallback: t(
          "common.oemCloudAccess.password.loginFailedFallback",
          {
            defaultValue: "账号登录失败",
          },
        ),
      },
      provider: {
        loadDetailFailedFallback: t(
          "common.oemCloudAccess.provider.loadDetailFailedFallback",
          {
            defaultValue: "加载云服务详情失败",
          },
        ),
        setDefaultSuccess: (offerName: string) =>
          t("common.oemCloudAccess.provider.setDefaultSuccess", {
            offerName,
            defaultValue: "已将 {{offerName}} 设为默认云端服务来源。",
          }),
        setDefaultFailedFallback: t(
          "common.oemCloudAccess.provider.setDefaultFailedFallback",
          {
            defaultValue: "设置默认服务商失败",
          },
        ),
      },
      apiKey: {
        defaultName: t("common.oemCloudAccess.apiKey.defaultName", {
          defaultValue: "Lime Desktop API Key",
        }),
        createSuccess: t("common.oemCloudAccess.apiKey.createSuccess", {
          defaultValue: "已创建 Lime API Key，明文只会在当前页面显示一次。",
        }),
        createFailedFallback: t(
          "common.oemCloudAccess.apiKey.createFailedFallback",
          {
            defaultValue: "创建 API Key 失败",
          },
        ),
        rotateSuccess: t("common.oemCloudAccess.apiKey.rotateSuccess", {
          defaultValue: "已轮换 Lime API Key，旧 Key 已撤销。",
        }),
        rotateFailedFallback: t(
          "common.oemCloudAccess.apiKey.rotateFailedFallback",
          {
            defaultValue: "轮换 API Key 失败",
          },
        ),
        revokeSuccess: t("common.oemCloudAccess.apiKey.revokeSuccess", {
          defaultValue: "已撤销 Lime API Key。",
        }),
        revokeFailedFallback: t(
          "common.oemCloudAccess.apiKey.revokeFailedFallback",
          {
            defaultValue: "撤销 API Key 失败",
          },
        ),
      },
      labels: {
        unknown: t("common.oemCloudAccess.label.unknown", {
          defaultValue: "未知",
        }),
        notSet: t("common.oemCloudAccess.label.notSet", {
          defaultValue: "未设定",
        }),
        localProviderSummary: t(
          "common.oemCloudAccess.label.localProviderSummary",
          {
            defaultValue: "本地开发者 Provider",
          },
        ),
        cloudService: t("common.oemCloudAccess.label.cloudService", {
          defaultValue: "云端服务",
        }),
        accessMode: {
          session: t("common.oemCloudAccess.label.accessMode.session", {
            defaultValue: "登录会话",
          }),
          hubToken: t("common.oemCloudAccess.label.accessMode.hubToken", {
            defaultValue: "平台令牌",
          }),
          apiKey: t("common.oemCloudAccess.label.accessMode.apiKey", {
            defaultValue: "API Key",
          }),
        },
        configMode: {
          managed: t("common.oemCloudAccess.label.configMode.managed", {
            defaultValue: "托管模式",
          }),
          hybrid: t("common.oemCloudAccess.label.configMode.hybrid", {
            defaultValue: "混合模式",
          }),
          developer: t("common.oemCloudAccess.label.configMode.developer", {
            defaultValue: "开发者模式",
          }),
        },
        modelsSource: {
          hubCatalog: t("common.oemCloudAccess.label.modelsSource.hubCatalog", {
            defaultValue: "云端目录",
          }),
          manual: t("common.oemCloudAccess.label.modelsSource.manual", {
            defaultValue: "手动目录",
          }),
        },
        developerAccess: {
          disabled: t("common.oemCloudAccess.label.developerAccess.disabled", {
            defaultValue: "已关闭",
          }),
          visible: t("common.oemCloudAccess.label.developerAccess.visible", {
            defaultValue: "可见",
          }),
          hidden: t("common.oemCloudAccess.label.developerAccess.hidden", {
            defaultValue: "已隐藏",
          }),
        },
      },
    }),
    [t],
  );
  const restoreTargetKey = runtime
    ? `${runtime.baseUrl}::${runtime.tenantId}`
    : "__runtime_unavailable__";
  const [loginMode, setLoginMode] = useState<OemCloudLoginMode>("password");
  const [passwordForm, setPasswordForm] = useState<ClientPasswordLoginPayload>({
    identifier: "",
    password: "",
  });
  const [emailCodeForm, setEmailCodeForm] =
    useState<VerifyClientAuthEmailCodePayload>({
      identifier: "",
      code: "",
      displayName: "",
      username: "",
    });
  const [codeDelivery, setCodeDelivery] =
    useState<SendAuthEmailCodeResponse | null>(null);
  const [session, setSession] = useState<OemCloudCurrentSession | null>(null);
  const [bootstrap, setBootstrap] = useState<OemCloudBootstrapResponse | null>(
    null,
  );
  const [offers, setOffers] = useState<OemCloudProviderOfferSummary[]>([]);
  const [preference, setPreference] =
    useState<OemCloudProviderPreference | null>(null);
  const [selectedOffer, setSelectedOffer] =
    useState<OemCloudProviderOfferDetail | null>(null);
  const [selectedModels, setSelectedModels] = useState<
    OemCloudProviderModelItem[]
  >([]);
  const [cloudActivation, setCloudActivation] =
    useState<OemCloudActivationResponse | null>(null);
  const [cloudReadiness, setCloudReadiness] =
    useState<OemCloudReadiness | null>(null);
  const [pendingPayment, setPendingPayment] =
    useState<OemCloudPaymentAction | null>(null);
  const [paymentConfigs, setPaymentConfigs] = useState<OemCloudPaymentConfig[]>(
    [],
  );
  const [plans, setPlans] = useState<OemCloudEntitlementPlan[]>([]);
  const [subscription, setSubscription] = useState<OemCloudSubscription | null>(
    null,
  );
  const [creditAccount, setCreditAccount] =
    useState<OemCloudCreditAccount | null>(null);
  const [creditsDashboard, setCreditsDashboard] =
    useState<OemCloudCreditsDashboard | null>(null);
  const [topupPackages, setTopupPackages] = useState<OemCloudTopupPackage[]>(
    [],
  );
  const [usageDashboard, setUsageDashboard] =
    useState<OemCloudUsageDashboard | null>(null);
  const [billingDashboard, setBillingDashboard] =
    useState<OemCloudBillingDashboard | null>(null);
  const [orders, setOrders] = useState<OemCloudOrder[]>([]);
  const [creditTopupOrders, setCreditTopupOrders] = useState<
    OemCloudCreditTopupOrder[]
  >([]);
  const [accessTokens, setAccessTokens] = useState<OemCloudAccessToken[]>([]);
  const [activeAccessToken, setActiveAccessToken] =
    useState<OemCloudActiveAccessTokenResponse | null>(null);
  const [lastIssuedRawToken, setLastIssuedRawToken] = useState<string | null>(
    null,
  );
  const [paymentWatcher, setPaymentWatcher] =
    useState<OemCloudPaymentWatcher | null>(null);
  const [commerceErrorMessage, setCommerceErrorMessage] = useState<
    string | null
  >(null);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingCommerce, setLoadingCommerce] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openingGoogleLogin, setOpeningGoogleLogin] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingDefault, setSavingDefault] = useState<string>("");
  const [managingToken, setManagingToken] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const configuredTarget = useMemo(
    () =>
      runtime
        ? {
            baseUrl: runtime.baseUrl,
            tenantId: runtime.tenantId,
          }
        : null,
    [runtime],
  );

  const applyCommerceSnapshot = useCallback(
    (snapshot: OemCloudCommerceSnapshot) => {
      setCloudActivation(snapshot.cloudActivation);
      setCloudReadiness(snapshot.cloudReadiness);
      setPendingPayment(snapshot.pendingPayment);
      setPaymentConfigs(snapshot.paymentConfigs);
      setPlans(snapshot.plans);
      setSubscription(snapshot.subscription);
      setCreditAccount(snapshot.creditAccount);
      setCreditsDashboard(snapshot.creditsDashboard);
      setTopupPackages(snapshot.topupPackages);
      setUsageDashboard(snapshot.usageDashboard);
      setBillingDashboard(snapshot.billingDashboard);
      setOrders(snapshot.orders);
      setCreditTopupOrders(snapshot.creditTopupOrders);
      setAccessTokens(snapshot.accessTokens);
      setActiveAccessToken(snapshot.activeAccessToken);
    },
    [],
  );

  const clearCloudState = useCallback(
    (message?: string) => {
      clearStoredOemCloudSessionState();
      clearOemCloudBootstrapSnapshot();
      clearSkillCatalogCache();
      clearServiceSkillCatalogCache();
      void clearSiteAdapterCatalogCache();
      setSession(null);
      setBootstrap(null);
      setOffers([]);
      setPreference(null);
      setSelectedOffer(null);
      setSelectedModels([]);
      applyCommerceSnapshot(buildEmptyCommerceSnapshot());
      setLastIssuedRawToken(null);
      setCommerceErrorMessage(null);
      setCodeDelivery(null);
      if (message) {
        setInfoMessage(message);
      }
    },
    [applyCommerceSnapshot],
  );

  const applyBootstrap = useCallback(
    (
      nextBootstrap: OemCloudBootstrapResponse,
      fallbackToken?: string,
      extraOffers?: OemCloudProviderOfferSummary[],
      extraPreference?: OemCloudProviderPreference,
    ) => {
      const nextSession: OemCloudCurrentSession = {
        ...nextBootstrap.session,
        token: nextBootstrap.session.token ?? fallbackToken ?? session?.token,
      };

      setStoredOemCloudSessionState(nextSession);
      setOemCloudBootstrapSnapshot({
        ...nextBootstrap,
        session: nextSession,
      });
      syncSkillCatalogFromBootstrapPayload({
        ...nextBootstrap,
        session: nextSession,
      });
      syncServiceSkillCatalogFromBootstrapPayload({
        ...nextBootstrap,
        session: nextSession,
      });
      void syncSiteAdapterCatalogFromBootstrapPayload({
        ...nextBootstrap,
        session: nextSession,
      });

      setSession(nextSession);
      setBootstrap({
        ...nextBootstrap,
        session: nextSession,
      });
      setOffers(extraOffers ?? nextBootstrap.providerOffersSummary);
      setPreference(extraPreference ?? nextBootstrap.providerPreference);
      setErrorMessage(null);
    },
    [session?.token],
  );

  const loadCommerceState = useCallback(
    async (tenantId: string) => {
      setLoadingCommerce(true);
      const currentSnapshot: OemCloudCommerceSnapshot = {
        cloudActivation,
        cloudReadiness,
        pendingPayment,
        paymentConfigs,
        plans,
        subscription,
        creditAccount,
        creditsDashboard,
        topupPackages,
        usageDashboard,
        billingDashboard,
        orders,
        creditTopupOrders,
        accessTokens,
        activeAccessToken,
      };

      try {
        const activation = await getClientCloudActivation(tenantId);
        const snapshot: OemCloudCommerceSnapshot = {
          cloudActivation: activation,
          cloudReadiness: activation.readiness,
          pendingPayment: activation.pendingPayment,
          paymentConfigs: activation.paymentConfigs.filter(
            (item) => item.enabled,
          ),
          plans: activation.plans,
          subscription:
            activation.subscription ??
            activation.creditsDashboard?.subscription ??
            activation.billingDashboard?.subscription ??
            null,
          creditAccount:
            activation.creditAccount ??
            activation.creditsDashboard?.creditAccount ??
            null,
          creditsDashboard: activation.creditsDashboard,
          topupPackages:
            activation.topupPackages.length > 0
              ? activation.topupPackages
              : (activation.creditsDashboard?.topupPackages ?? []),
          usageDashboard: activation.usageDashboard,
          billingDashboard: activation.billingDashboard,
          orders: activation.orders,
          creditTopupOrders: activation.creditTopupOrders,
          accessTokens: activation.accessTokens,
          activeAccessToken: activation.activeAccessToken,
        };

        applyCommerceSnapshot(snapshot);
        setOffers(activation.providerOffers);
        setPreference(activation.providerPreference);
        setSelectedOffer(activation.selectedOffer);
        setSelectedModels(activation.providerModels);
        setCommerceErrorMessage(null);
        return snapshot;
      } catch (error) {
        const message = buildErrorMessage(
          error,
          cloudCopy.session.syncActivationFailedFallback,
        );
        setCommerceErrorMessage(message);
        applyCommerceSnapshot(currentSnapshot);
        return currentSnapshot;
      } finally {
        setLoadingCommerce(false);
      }
    },
    [
      accessTokens,
      activeAccessToken,
      applyCommerceSnapshot,
      billingDashboard,
      cloudActivation,
      cloudReadiness,
      cloudCopy,
      creditAccount,
      creditTopupOrders,
      creditsDashboard,
      orders,
      paymentConfigs,
      pendingPayment,
      plans,
      subscription,
      topupPackages,
      usageDashboard,
    ],
  );

  const refreshAuthenticatedState = useCallback(
    async (tenantIdOverride?: string, fallbackToken?: string) => {
      const targetTenantId =
        tenantIdOverride ?? session?.tenant.id ?? runtime?.tenantId;
      if (!runtime || !targetTenantId) {
        return null;
      }

      const nextBootstrap = await getClientBootstrap(targetTenantId);
      applyBootstrap(nextBootstrap, fallbackToken);
      await loadCommerceState(targetTenantId);
      return nextBootstrap;
    },
    [applyBootstrap, loadCommerceState, runtime, session?.tenant.id],
  );

  const runtimeRef = useRef(runtime);
  const sessionRef = useRef(session);
  const clearCloudStateRef = useRef(clearCloudState);
  const refreshAuthenticatedStateRef = useRef(refreshAuthenticatedState);
  const cloudCopyRef = useRef(cloudCopy);
  const paymentWatchRef = useRef<{
    runId: number;
    timer: number | null;
  }>({
    runId: 0,
    timer: null,
  });

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    clearCloudStateRef.current = clearCloudState;
  }, [clearCloudState]);

  useEffect(() => {
    refreshAuthenticatedStateRef.current = refreshAuthenticatedState;
  }, [refreshAuthenticatedState]);

  useEffect(() => {
    cloudCopyRef.current = cloudCopy;
  }, [cloudCopy]);

  const cancelPaymentWatcher = useCallback((clearState = true) => {
    paymentWatchRef.current.runId += 1;
    if (paymentWatchRef.current.timer !== null) {
      window.clearTimeout(paymentWatchRef.current.timer);
      paymentWatchRef.current.timer = null;
    }
    if (clearState) {
      setPaymentWatcher(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelPaymentWatcher(false);
    };
  }, [cancelPaymentWatcher]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const currentRuntime = runtimeRef.current;
      if (!currentRuntime) {
        setInitializing(false);
        return;
      }

      setInitializing(true);
      const stored = applyStoredOemCloudSessionToWindow();
      if (!stored) {
        setInitializing(false);
        return;
      }

      try {
        await refreshAuthenticatedStateRef.current(
          stored.session.tenant.id,
          stored.token,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isAuthExpired(error)) {
          clearCloudStateRef.current(cloudCopyRef.current.session.expiredRelogin);
        } else {
          setErrorMessage(
            buildErrorMessage(
              error,
              cloudCopyRef.current.session.restoreFailedFallback,
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [restoreTargetKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    let cancelled = false;

    const handleOauthCompleted = (event: Event) => {
      if (cancelled) {
        return;
      }

      const detail =
        event instanceof CustomEvent
          ? (event.detail as OemCloudDesktopOAuthCompletedDetail)
          : null;
      const storedState = getStoredOemCloudSessionState();
      if (!storedState) {
        return;
      }

      const snapshot =
        getOemCloudBootstrapSnapshot<OemCloudBootstrapResponse>();

      setInitializing(false);
      setSession(storedState.session as OemCloudCurrentSession);
      setCodeDelivery(null);
      setSelectedOffer(null);
      setSelectedModels([]);
      setErrorMessage(null);

      if (snapshot) {
        applyBootstrap(snapshot, storedState.token);
        void loadCommerceState(storedState.session.tenant.id);
        setInfoMessage(
          detail?.provider === "google"
            ? authCopy.googleSynced
            : authCopy.cloudSynced,
        );
        return;
      }

      void refreshAuthenticatedState(
        storedState.session.tenant.id,
        storedState.token,
      )
        .then(() => {
          if (!cancelled) {
            setInfoMessage(
              detail?.provider === "google"
                ? authCopy.googleSynced
                : authCopy.cloudSynced,
            );
          }
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          if (isAuthExpired(error)) {
            clearCloudState(cloudCopy.session.invalidRelogin);
            return;
          }
          setErrorMessage(buildErrorMessage(error, authCopy.syncFailedFallback));
        });
    };

    window.addEventListener(
      OEM_CLOUD_OAUTH_COMPLETED_EVENT,
      handleOauthCompleted,
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        OEM_CLOUD_OAUTH_COMPLETED_EVENT,
        handleOauthCompleted,
      );
    };
  }, [
    applyBootstrap,
    authCopy,
    clearCloudState,
    cloudCopy,
    loadCommerceState,
    refreshAuthenticatedState,
  ]);

  const handleRefresh = useCallback(async () => {
    if (!runtime || !session?.tenant.id) {
      return;
    }

    setRefreshing(true);
    try {
      await refreshAuthenticatedState(session.tenant.id, session.token);
      setInfoMessage(cloudCopy.session.refreshSuccess);
      setSelectedOffer(null);
      setSelectedModels([]);
      setLastIssuedRawToken(null);
    } catch (error) {
      if (isAuthExpired(error)) {
        clearCloudState(cloudCopy.session.invalidRelogin);
        return;
      }
      setErrorMessage(
        buildErrorMessage(error, cloudCopy.session.refreshFailedFallback),
      );
    } finally {
      setRefreshing(false);
    }
  }, [clearCloudState, cloudCopy, refreshAuthenticatedState, runtime, session]);

  const startPaymentStatusWatcher = useCallback(
    (target: {
      kind: OemCloudPaymentWatchKind;
      orderId: string;
      title: string;
    }) => {
      if (
        !session?.tenant.id ||
        !target.orderId ||
        typeof window === "undefined"
      ) {
        return;
      }

      cancelPaymentWatcher(false);

      const tenantId = session.tenant.id;
      const fallbackToken = session.token;
      const runId = paymentWatchRef.current.runId + 1;
      paymentWatchRef.current.runId = runId;
      paymentWatchRef.current.timer = null;

      const baseWatcher: OemCloudPaymentWatcher = {
        kind: target.kind,
        orderId: target.orderId,
        title: target.title,
        status: "waiting",
        attempts: 0,
        message: paymentCopy.waitingForCallback,
      };
      setPaymentWatcher(baseWatcher);

      const schedule = (attempt: number) => {
        if (paymentWatchRef.current.runId !== runId) {
          return;
        }

        paymentWatchRef.current.timer = window.setTimeout(() => {
          void tick(attempt);
        }, PAYMENT_STATUS_WATCH_INTERVAL_MS);
      };

      const tick = async (attempt: number) => {
        if (paymentWatchRef.current.runId !== runId) {
          return;
        }

        setPaymentWatcher({
          ...baseWatcher,
          attempts: attempt,
        });

        try {
          const order =
            target.kind === "plan_order"
              ? await getClientOrder(tenantId, target.orderId)
              : await getClientCreditTopupOrder(tenantId, target.orderId);
          const status = normalizePaymentStatus(order.status);
          const title =
            resolveOrderTitle(target.kind, order, paymentCopy) || target.title;

          if (isPaidPaymentStatus(status)) {
            await refreshAuthenticatedState(tenantId, fallbackToken);
            if (paymentWatchRef.current.runId !== runId) {
              return;
            }
            setPaymentWatcher({
              ...baseWatcher,
              title,
              status: "confirmed",
              attempts: attempt,
              message:
                target.kind === "plan_order"
                  ? paymentCopy.confirmedPlanWatcher
                  : paymentCopy.confirmedCreditWatcher,
            });
            setInfoMessage(
              target.kind === "plan_order"
                ? paymentCopy.confirmedPlanInfo
                : paymentCopy.confirmedCreditInfo,
            );
            return;
          }

          if (isTerminalUnpaidPaymentStatus(status)) {
            await refreshAuthenticatedState(tenantId, fallbackToken);
            if (paymentWatchRef.current.runId !== runId) {
              return;
            }
            setPaymentWatcher({
              ...baseWatcher,
              title,
              status: "stopped",
              attempts: attempt,
              message: paymentCopy.terminalUnpaidWatcher,
            });
            setErrorMessage(paymentCopy.terminalUnpaidError);
            return;
          }

          if (attempt >= PAYMENT_STATUS_WATCH_MAX_ATTEMPTS) {
            await refreshAuthenticatedState(tenantId, fallbackToken);
            if (paymentWatchRef.current.runId !== runId) {
              return;
            }
            setPaymentWatcher({
              ...baseWatcher,
              title,
              status: "stopped",
              attempts: attempt,
              message: paymentCopy.timeoutWatcher,
            });
            setInfoMessage(paymentCopy.timeoutInfo);
            return;
          }

          schedule(attempt + 1);
        } catch (error) {
          if (paymentWatchRef.current.runId !== runId) {
            return;
          }

          if (isAuthExpired(error)) {
            clearCloudState(cloudCopy.session.invalidRelogin);
            return;
          }

          if (attempt >= PAYMENT_STATUS_WATCH_MAX_ATTEMPTS) {
            setPaymentWatcher({
              ...baseWatcher,
              status: "stopped",
              attempts: attempt,
              message: buildErrorMessage(
                error,
                paymentCopy.confirmFailedFallback,
              ),
            });
            return;
          }

          schedule(attempt + 1);
        }
      };

      schedule(1);
    },
    [
      cancelPaymentWatcher,
      clearCloudState,
      cloudCopy,
      paymentCopy,
      refreshAuthenticatedState,
      session?.tenant.id,
      session?.token,
    ],
  );
  const startPaymentStatusWatcherRef = useRef(startPaymentStatusWatcher);

  useEffect(() => {
    startPaymentStatusWatcherRef.current = startPaymentStatusWatcher;
  }, [startPaymentStatusWatcher]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    let cancelled = false;

    const handlePaymentReturn = async (detail: OemCloudPaymentReturnDetail) => {
      const currentSession = sessionRef.current;
      if (cancelled || !currentSession?.tenant.id) {
        return;
      }

      if (detail.tenantId && detail.tenantId !== currentSession.tenant.id) {
        return;
      }

      clearStoredOemCloudPaymentReturn(detail.sourceUrl);
      setInfoMessage(paymentCopy.returnSyncing);
      setErrorMessage(null);

      try {
        await refreshAuthenticatedStateRef.current(
          currentSession.tenant.id,
          currentSession.token,
        );
        if (cancelled) {
          return;
        }

        const kind = normalizePaymentWatchKind(detail.kind);
        if (!kind || !detail.orderId) {
          setInfoMessage(paymentCopy.returnSynced);
          return;
        }

        if (isTerminalUnpaidPaymentStatus(detail.status)) {
          cancelPaymentWatcher(false);
          setPaymentWatcher({
            kind,
            orderId: detail.orderId,
            title: resolvePaymentReturnTitle(kind, paymentCopy),
            status: "stopped",
            attempts: 0,
            message: paymentCopy.returnUnpaidWatcher,
          });
          setInfoMessage(paymentCopy.returnUnpaidInfo);
          return;
        }

        startPaymentStatusWatcherRef.current({
          kind,
          orderId: detail.orderId,
          title: resolvePaymentReturnTitle(kind, paymentCopy),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isAuthExpired(error)) {
          clearCloudStateRef.current(
            cloudCopyRef.current.session.invalidRelogin,
          );
          return;
        }
        setErrorMessage(
          buildErrorMessage(error, paymentCopy.returnSyncFailedFallback),
        );
      }
    };

    const handlePaymentReturnEvent = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as OemCloudPaymentReturnDetail)
          : null;
      if (!detail) {
        return;
      }
      void handlePaymentReturn(detail);
    };

    window.addEventListener(
      OEM_CLOUD_PAYMENT_RETURN_EVENT,
      handlePaymentReturnEvent,
    );

    const pendingReturn = session?.tenant.id
      ? consumeStoredOemCloudPaymentReturn(session.tenant.id)
      : null;
    if (pendingReturn) {
      void handlePaymentReturn(pendingReturn);
    }

    return () => {
      cancelled = true;
      window.removeEventListener(
        OEM_CLOUD_PAYMENT_RETURN_EVENT,
        handlePaymentReturnEvent,
      );
    };
  }, [cancelPaymentWatcher, paymentCopy, session?.tenant.id]);

  const handleSendEmailCode = useCallback(async () => {
    if (!runtime) {
      setErrorMessage(authCopy.unavailable);
      return;
    }

    if (!emailCodeForm.identifier.trim()) {
      setErrorMessage(cloudCopy.emailCode.identifierRequired);
      return;
    }

    setSendingCode(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const response = await sendClientAuthEmailCode(runtime.tenantId, {
        identifier: emailCodeForm.identifier.trim(),
      });
      setCodeDelivery(response);
      setInfoMessage(
        cloudCopy.emailCode.sent(
          response.maskedEmail,
          Math.max(
            1,
            Math.round(response.expiresInSeconds / 60),
          ),
        ),
      );
    } catch (error) {
      setErrorMessage(
        buildErrorMessage(error, cloudCopy.emailCode.sendFailedFallback),
      );
    } finally {
      setSendingCode(false);
    }
  }, [authCopy.unavailable, cloudCopy, emailCodeForm.identifier, runtime]);

  const handleEmailCodeLogin = useCallback(async () => {
    if (!runtime) {
      setErrorMessage(authCopy.unavailable);
      return;
    }

    if (!emailCodeForm.identifier.trim() || !emailCodeForm.code.trim()) {
      setErrorMessage(cloudCopy.emailCode.loginFieldsRequired);
      return;
    }

    setLoggingIn(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const nextSession = await verifyClientAuthEmailCode(runtime.tenantId, {
        identifier: emailCodeForm.identifier.trim(),
        code: emailCodeForm.code.trim(),
        displayName: emailCodeForm.displayName?.trim() || undefined,
        username: emailCodeForm.username?.trim() || undefined,
      });
      setStoredOemCloudSessionState(nextSession);
      setSession(nextSession);
      await refreshAuthenticatedState(nextSession.tenant.id, nextSession.token);
      setInfoMessage(cloudCopy.emailCode.loginSuccess);
      setCodeDelivery(null);
      setEmailCodeForm({
        identifier: nextSession.user.email || emailCodeForm.identifier,
        code: "",
        displayName: "",
        username: "",
      });
    } catch (error) {
      setErrorMessage(
        buildErrorMessage(error, cloudCopy.emailCode.loginFailedFallback),
      );
    } finally {
      setLoggingIn(false);
    }
  }, [
    authCopy.unavailable,
    cloudCopy,
    emailCodeForm,
    refreshAuthenticatedState,
    runtime,
  ]);

  const handlePasswordLogin = useCallback(async () => {
    if (!runtime) {
      setErrorMessage(authCopy.unavailable);
      return;
    }

    if (!passwordForm.identifier.trim() || !passwordForm.password.trim()) {
      setErrorMessage(cloudCopy.password.fieldsRequired);
      return;
    }

    setLoggingIn(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const nextSession = await loginClientByPassword(runtime.tenantId, {
        identifier: passwordForm.identifier.trim(),
        password: passwordForm.password,
      });
      setStoredOemCloudSessionState(nextSession);
      setSession(nextSession);
      await refreshAuthenticatedState(nextSession.tenant.id, nextSession.token);
      setInfoMessage(cloudCopy.password.loginSuccess);
      setPasswordForm((current) => ({
        ...current,
        password: "",
      }));
    } catch (error) {
      setErrorMessage(
        buildErrorMessage(error, cloudCopy.password.loginFailedFallback),
      );
    } finally {
      setLoggingIn(false);
    }
  }, [
    authCopy.unavailable,
    cloudCopy,
    passwordForm,
    refreshAuthenticatedState,
    runtime,
  ]);

  const handleLogout = useCallback(async () => {
    if (!session?.tenant.id) {
      clearCloudState(cloudCopy.session.localCleared);
      return;
    }

    setLoggingOut(true);
    setErrorMessage(null);
    try {
      await logoutClient(session.tenant.id);
      clearCloudState(cloudCopy.session.logoutSuccess);
    } catch (error) {
      clearCloudState(cloudCopy.session.logoutFallback);
      setErrorMessage(
        buildErrorMessage(error, cloudCopy.session.logoutFailedFallback),
      );
    } finally {
      setLoggingOut(false);
    }
  }, [clearCloudState, cloudCopy, session?.tenant.id]);

  const handleGoogleLogin = useCallback(async () => {
    if (!runtime) {
      setErrorMessage(authCopy.unavailable);
      return;
    }

    setOpeningGoogleLogin(true);
    setErrorMessage(null);
    setInfoMessage(authCopy.googleDesktopOpened);

    const browserTarget = createExternalBrowserOpenTarget({
      openingTitle: authCopy.browserPreopenTitle,
      openingBody: authCopy.browserPreopenBody,
    });
    try {
      const result = await startOemCloudLogin(runtime, {
        browserTarget,
        copy: authCopy,
      });
      const storedSession = getStoredOemCloudSessionState();
      const storedTenantId = storedSession?.session.tenant.id?.trim();
      const storedTenantSlug = storedSession?.session.tenant.slug?.trim();
      const runtimeTenantId = runtime.tenantId.trim();
      if (
        storedTenantId &&
        (storedTenantId === runtimeTenantId ||
          storedTenantSlug === runtimeTenantId)
      ) {
        setInfoMessage(authCopy.googleSynced);
        return;
      }

      setInfoMessage(
        result.mode === "desktop_auth"
          ? authCopy.googleDesktopOpened
          : authCopy.userCenterOpened,
      );
    } catch (error) {
      setInfoMessage(null);
      setErrorMessage(buildErrorMessage(error, authCopy.openFailedFallback));
    } finally {
      setOpeningGoogleLogin(false);
    }
  }, [authCopy, runtime]);

  const openOfferDetail = useCallback(
    async (providerKey: string) => {
      if (!session?.tenant.id) {
        return;
      }

      setLoadingDetail(true);
      setErrorMessage(null);
      try {
        const [detail, models] = await Promise.all([
          getClientProviderOffer(session.tenant.id, providerKey),
          listClientProviderOfferModels(session.tenant.id, providerKey),
        ]);
        setSelectedOffer(detail);
        setSelectedModels(models);
      } catch (error) {
        if (isAuthExpired(error)) {
          clearCloudState(cloudCopy.session.invalidRelogin);
          return;
        }
        setErrorMessage(
          buildErrorMessage(
            error,
            cloudCopy.provider.loadDetailFailedFallback,
          ),
        );
      } finally {
        setLoadingDetail(false);
      }
    },
    [clearCloudState, cloudCopy, session?.tenant.id],
  );

  const handleSetDefault = useCallback(
    async (
      offer: OemCloudProviderOfferSummary | OemCloudProviderOfferDetail,
      defaultModel?: string,
    ) => {
      if (!session?.tenant.id) {
        return;
      }

      const nextDefaultModel = defaultModel || offer.defaultModel;
      setSavingDefault(offer.providerKey);
      setErrorMessage(null);
      try {
        const nextPreference = await updateClientProviderPreference(
          session.tenant.id,
          {
            providerSource: "oem_cloud",
            providerKey: offer.providerKey,
            defaultModel: nextDefaultModel,
          },
        );
        setPreference(nextPreference);
        await refreshAuthenticatedState(session.tenant.id, session.token);
        setInfoMessage(cloudCopy.provider.setDefaultSuccess(offer.displayName));
      } catch (error) {
        if (isAuthExpired(error)) {
          clearCloudState(cloudCopy.session.invalidRelogin);
          return;
        }
        setErrorMessage(
          buildErrorMessage(error, cloudCopy.provider.setDefaultFailedFallback),
        );
      } finally {
        setSavingDefault("");
      }
    },
    [clearCloudState, cloudCopy, refreshAuthenticatedState, session],
  );

  const handleCreateAccessToken = useCallback(
    async (payload?: Partial<CreateClientAccessTokenPayload>) => {
      if (!session?.tenant.id) {
        return;
      }

      setManagingToken("create");
      setErrorMessage(null);
      setInfoMessage(null);
      try {
        const response = await createClientAccessToken(session.tenant.id, {
          name: payload?.name?.trim() || cloudCopy.apiKey.defaultName,
          scopes: payload?.scopes ?? ["llm:invoke"],
          allowedModels: payload?.allowedModels,
          maxTokensPerRequest: payload?.maxTokensPerRequest,
          requestsPerMinute: payload?.requestsPerMinute,
          tokensPerMinute: payload?.tokensPerMinute,
          monthlyCreditLimit: payload?.monthlyCreditLimit,
        });
        setLastIssuedRawToken(response.apiKey || response.rawToken || null);
        await loadCommerceState(session.tenant.id);
        setInfoMessage(cloudCopy.apiKey.createSuccess);
      } catch (error) {
        if (isAuthExpired(error)) {
          clearCloudState(cloudCopy.session.invalidRelogin);
          return;
        }
        setErrorMessage(
          buildErrorMessage(error, cloudCopy.apiKey.createFailedFallback),
        );
      } finally {
        setManagingToken("");
      }
    },
    [clearCloudState, cloudCopy, loadCommerceState, session?.tenant.id],
  );

  const handleRotateAccessToken = useCallback(
    async (tokenId: string) => {
      if (!session?.tenant.id) {
        return;
      }

      setManagingToken(tokenId);
      setErrorMessage(null);
      setInfoMessage(null);
      try {
        const response = await rotateClientAccessToken(
          session.tenant.id,
          tokenId,
        );
        setLastIssuedRawToken(response.apiKey || response.rawToken || null);
        await loadCommerceState(session.tenant.id);
        setInfoMessage(cloudCopy.apiKey.rotateSuccess);
      } catch (error) {
        if (isAuthExpired(error)) {
          clearCloudState(cloudCopy.session.invalidRelogin);
          return;
        }
        setErrorMessage(
          buildErrorMessage(error, cloudCopy.apiKey.rotateFailedFallback),
        );
      } finally {
        setManagingToken("");
      }
    },
    [clearCloudState, cloudCopy, loadCommerceState, session?.tenant.id],
  );

  const handleRevokeAccessToken = useCallback(
    async (tokenId: string) => {
      if (!session?.tenant.id) {
        return;
      }

      setManagingToken(tokenId);
      setErrorMessage(null);
      setInfoMessage(null);
      try {
        await revokeClientAccessToken(session.tenant.id, tokenId);
        setLastIssuedRawToken(null);
        await loadCommerceState(session.tenant.id);
        setInfoMessage(cloudCopy.apiKey.revokeSuccess);
      } catch (error) {
        if (isAuthExpired(error)) {
          clearCloudState(cloudCopy.session.invalidRelogin);
          return;
        }
        setErrorMessage(
          buildErrorMessage(error, cloudCopy.apiKey.revokeFailedFallback),
        );
      } finally {
        setManagingToken("");
      }
    },
    [clearCloudState, cloudCopy, loadCommerceState, session?.tenant.id],
  );

  const openUserCenter = useCallback(
    async (path = "") => {
      if (!configuredTarget) {
        return;
      }

      const browserTarget = createExternalBrowserOpenTarget({
        openingTitle: authCopy.browserPreopenTitle,
        openingBody: authCopy.browserPreopenBody,
      });
      await openExternalUrl(
        buildOemCloudUserCenterUrl(configuredTarget.baseUrl, path),
        {
          browserTarget,
          copy: authCopy,
        },
      );
    },
    [authCopy, configuredTarget],
  );

  const hubProviderName = useMemo(
    () => resolveOemLimeHubProviderName(runtime),
    [runtime],
  );

  const defaultCloudOffer = useMemo(() => {
    if (!offers.length) {
      return null;
    }

    if (preference?.providerSource === "oem_cloud") {
      const matchedOffer = offers.find(
        (offer) => offer.providerKey === preference.providerKey,
      );
      if (matchedOffer) {
        return matchedOffer;
      }
    }

    return offers[0] ?? null;
  }, [offers, preference]);

  const activeCloudOffer = selectedOffer ?? defaultCloudOffer;

  const defaultProviderSummary = useMemo(() => {
    if (!preference) {
      return null;
    }

    if (preference.providerSource === "local") {
      return `${cloudCopy.labels.localProviderSummary}${
        preference.defaultModel ? ` · ${preference.defaultModel}` : ""
      }`;
    }

    const matchedOffer = offers.find(
      (offer) => offer.providerKey === preference.providerKey,
    );
    if (!matchedOffer) {
      return `${hubProviderName}${
        preference.defaultModel ? ` · ${preference.defaultModel}` : ""
      }`;
    }

    return `${matchedOffer.displayName}${
      preference.defaultModel ? ` · ${preference.defaultModel}` : ""
    }`;
  }, [cloudCopy.labels.localProviderSummary, offers, preference, hubProviderName]);

  const defaultProviderSourceLabel = useMemo(() => {
    if (!preference) {
      return cloudCopy.labels.notSet;
    }

    return preference.providerSource === "local"
      ? cloudCopy.labels.localProviderSummary
      : cloudCopy.labels.cloudService;
  }, [cloudCopy.labels, preference]);

  const activeAccessModeLabel = useMemo(
    () =>
      formatOemCloudAccessModeLabel(
        activeCloudOffer?.effectiveAccessMode,
        cloudCopy.labels,
      ),
    [activeCloudOffer?.effectiveAccessMode, cloudCopy.labels],
  );

  const activeConfigModeLabel = useMemo(
    () =>
      formatOemCloudConfigModeLabel(
        activeCloudOffer?.configMode,
        cloudCopy.labels,
      ),
    [activeCloudOffer?.configMode, cloudCopy.labels],
  );

  const activeModelsSourceLabel = useMemo(
    () =>
      formatOemCloudModelsSourceLabel(
        activeCloudOffer?.modelsSource,
        cloudCopy.labels,
      ),
    [activeCloudOffer?.modelsSource, cloudCopy.labels],
  );

  const activeDeveloperAccessEnabled = Boolean(
    activeCloudOffer?.apiKeyModeEnabled &&
    activeCloudOffer?.developerAccessVisible,
  );

  const activeDeveloperAccessLabel = useMemo(() => {
    if (!activeCloudOffer) {
      return cloudCopy.labels.notSet;
    }

    if (!activeCloudOffer.apiKeyModeEnabled) {
      return cloudCopy.labels.developerAccess.disabled;
    }

    return activeCloudOffer.developerAccessVisible
      ? cloudCopy.labels.developerAccess.visible
      : cloudCopy.labels.developerAccess.hidden;
  }, [activeCloudOffer, cloudCopy.labels]);

  return {
    runtime,
    configuredTarget,
    hubProviderName,
    loginMode,
    setLoginMode,
    passwordForm,
    setPasswordForm,
    emailCodeForm,
    setEmailCodeForm,
    codeDelivery,
    session,
    bootstrap,
    offers,
    preference,
    cloudActivation,
    cloudReadiness,
    pendingPayment,
    paymentConfigs,
    plans,
    subscription,
    creditAccount,
    creditsDashboard,
    topupPackages,
    usageDashboard,
    billingDashboard,
    orders,
    creditTopupOrders,
    accessTokens,
    activeAccessToken,
    lastIssuedRawToken,
    paymentWatcher,
    commerceErrorMessage,
    defaultCloudOffer,
    activeCloudOffer,
    selectedOffer,
    selectedModels,
    initializing,
    refreshing,
    loadingCommerce,
    sendingCode,
    loggingIn,
    loggingOut,
    openingGoogleLogin,
    loadingDetail,
    savingDefault,
    managingToken,
    errorMessage,
    setErrorMessage,
    infoMessage,
    setInfoMessage,
    defaultProviderSummary,
    defaultProviderSourceLabel,
    activeAccessModeLabel,
    activeConfigModeLabel,
    activeModelsSourceLabel,
    activeDeveloperAccessEnabled,
    activeDeveloperAccessLabel,
    clearCloudState,
    handleRefresh,
    handleSendEmailCode,
    handleEmailCodeLogin,
    handlePasswordLogin,
    handleGoogleLogin,
    handleLogout,
    openOfferDetail,
    handleSetDefault,
    handleCreateAccessToken,
    handleRotateAccessToken,
    handleRevokeAccessToken,
    handleDismissIssuedToken: () => setLastIssuedRawToken(null),
    openUserCenter,
  };
}
