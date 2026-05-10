import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { ProviderIcon } from "@/icons/providers";
import {
  formatOemCloudDateTime,
  useOemCloudAccess,
} from "@/hooks/useOemCloudAccess";
import { cn } from "@/lib/utils";

const SURFACE_CLASS_NAME =
  "rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5";
const PRIMARY_ACTION_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-[18px] border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95 disabled:opacity-60";
const ACTIVE_SEGMENT_BUTTON_CLASS =
  "border border-emerald-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,253,245,0.96)_54%,rgba(224,242,254,0.95)_100%)] text-slate-800 shadow-sm shadow-emerald-950/10";

function SessionValueCard(props: {
  label: string;
  value: string;
  hint: string;
  hintAriaLabel: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/90 bg-white/88 p-4 shadow-sm shadow-slate-950/5">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        <span>{props.label}</span>
        <WorkbenchInfoTip
          ariaLabel={props.hintAriaLabel}
          content={props.hint}
          tone="slate"
        />
      </div>
      <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
        {props.value}
      </p>
    </div>
  );
}

function NoticeBar(props: { tone: "error" | "success"; message: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[20px] border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
        props.tone === "success"
          ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
          : "border-rose-200 bg-rose-50/90 text-rose-700",
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

function resolveServiceSkillCount(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return 0;
  }

  const items = (payload as { items?: unknown[] }).items;
  return Array.isArray(items) ? items.length : 0;
}

type UserCenterSessionTranslate = TFunction<"settings", undefined>;

function formatProviderLabel(t: UserCenterSessionTranslate, provider?: string) {
  const normalized = provider?.trim();
  if (!normalized) {
    return t("settings.userCenterSession.provider.system", "系统账号");
  }

  if (normalized.toLowerCase() === "google") {
    return "Google";
  }

  return normalized;
}

function buildAccountInitials(value?: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return "LH";
  }

  return normalized.slice(0, 2).toUpperCase();
}

export function UserCenterSessionSettings() {
  const { t } = useTranslation("settings");
  const [showAlternativeMethods, setShowAlternativeMethods] = useState(false);
  const {
    runtime,
    loginMode,
    setLoginMode,
    passwordForm,
    setPasswordForm,
    emailCodeForm,
    setEmailCodeForm,
    codeDelivery,
    session,
    bootstrap,
    initializing,
    refreshing,
    sendingCode,
    loggingIn,
    loggingOut,
    openingGoogleLogin,
    errorMessage,
    infoMessage,
    defaultProviderSummary,
    handleRefresh,
    handleSendEmailCode,
    handleEmailCodeLogin,
    handlePasswordLogin,
    handleGoogleLogin,
    handleLogout,
    openUserCenter,
  } = useOemCloudAccess();

  const accountName =
    session?.user.displayName?.trim() ||
    session?.user.username?.trim() ||
    session?.user.email?.trim() ||
    t("settings.userCenterSession.account.fallbackName", "未登录");
  const accountEmail =
    session?.user.email?.trim() ||
    session?.user.username?.trim() ||
    t("settings.userCenterSession.account.loginRequired", "登录后显示");
  const accountIdentity =
    session?.user.username?.trim() ||
    session?.user.id ||
    t("settings.userCenterSession.account.loginRequired", "登录后显示");
  const identityLabel = session?.user.username?.trim()
    ? t("settings.userCenterSession.account.identity.username", "账号")
    : t("settings.userCenterSession.account.identity.userId", "用户 ID");
  const providerLabel = formatProviderLabel(t, session?.session.provider);
  const accountInitials = buildAccountInitials(
    session?.user.displayName ||
      session?.user.username ||
      session?.user.email ||
      undefined,
  );
  const syncedCapabilitiesSummary = session
    ? t("settings.userCenterSession.account.syncedCapabilities", {
        skills: resolveServiceSkillCount(bootstrap?.serviceSkillCatalog),
        scenes: bootstrap?.sceneCatalog?.length || 0,
        defaultValue: "{{skills}} 项技能 / {{scenes}} 个入口",
      })
    : t("settings.userCenterSession.account.syncedPending", "登录后自动同步");
  const manageProfileLabel = bootstrap?.features?.profileEditable
    ? t(
        "settings.userCenterSession.action.manageProfile",
        "前往账号中心修改资料",
      )
    : t("settings.userCenterSession.action.openUserCenter", "打开账号中心");

  return (
    <section className="space-y-4">
      <div className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[24px] font-semibold tracking-tight text-slate-900">
                  {t("settings.userCenterSession.title", "账户资料")}
                </h2>
                <WorkbenchInfoTip
                  ariaLabel={t(
                    "settings.userCenterSession.hero.tipAria",
                    "账户资料说明",
                  )}
                  content={t(
                    "settings.userCenterSession.hero.tip",
                    "昵称、头像、邮箱和默认服务统一由账号中心维护；本地只展示当前会话状态与同步结果。",
                  )}
                  tone="mint"
                />
              </div>
              <p className="text-sm text-slate-500">
                {t(
                  "settings.userCenterSession.description",
                  "查看登录状态、默认服务和账号同步结果。",
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
                  session
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-600",
                )}
              >
                {t("settings.userCenterSession.status.login", {
                  status: session
                    ? t("settings.userCenterSession.status.loggedIn", "已登录")
                    : t(
                        "settings.userCenterSession.status.loggedOut",
                        "未登录",
                      ),
                  defaultValue: "状态：{{status}}",
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {t("settings.userCenterSession.status.current", {
                  status: session
                    ? t(
                        "settings.userCenterSession.status.connected",
                        "账号已连接",
                      )
                    : t(
                        "settings.userCenterSession.status.waitingLogin",
                        "等待登录",
                      ),
                  defaultValue: "当前状态：{{status}}",
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {t("settings.userCenterSession.status.defaultService", {
                  service:
                    defaultProviderSummary ||
                    t(
                      "settings.userCenterSession.account.syncedPending",
                      "登录后自动同步",
                    ),
                  defaultValue: "默认服务：{{service}}",
                })}
              </span>
            </div>
          </div>

          {errorMessage ? (
            <NoticeBar tone="error" message={errorMessage} />
          ) : null}
          {infoMessage ? (
            <NoticeBar tone="success" message={infoMessage} />
          ) : null}

          {!runtime ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/80 px-5 py-6 text-sm leading-6 text-slate-600">
              {t(
                "settings.userCenterSession.empty.runtimeMissing",
                "当前版本未配置云端服务。开源版可继续使用本地功能；品牌服务配置登录入口后会自动显示。",
              )}
            </div>
          ) : initializing ? (
            <div className="rounded-[24px] border border-white/90 bg-white/84 p-5 shadow-sm">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {t(
                  "settings.userCenterSession.loading.restoreAccount",
                  "正在恢复账户状态...",
                )}
              </div>
            </div>
          ) : session ? (
            <div
              className="grid gap-4 xl:grid-cols-[minmax(0,2.15fr)_minmax(300px,1fr)]"
              data-testid="oem-cloud-session-panel"
            >
              <article className={SURFACE_CLASS_NAME}>
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100 text-lg font-semibold text-slate-700">
                        {session.user.avatarUrl ? (
                          <img
                            src={session.user.avatarUrl}
                            alt={t("settings.userCenterSession.avatar.alt", {
                              name: accountName,
                              defaultValue: "{{name}} 头像",
                            })}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{accountInitials}</span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-3">
                        <div>
                          <p className="break-words text-xl font-semibold text-slate-900">
                            {accountName}
                          </p>
                          <p className="mt-1 break-words text-sm text-slate-500">
                            {accountEmail}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            {t(
                              "settings.userCenterSession.account.loginMethod",
                              {
                                provider: providerLabel,
                                defaultValue: "登录方式：{{provider}}",
                              },
                            )}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            {t("settings.userCenterSession.account.synced", {
                              summary: syncedCapabilitiesSummary,
                              defaultValue: "已同步：{{summary}}",
                            })}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-slate-600">
                            {t(
                              "settings.userCenterSession.profile.unified",
                              "资料维护已统一到账号中心",
                            )}
                          </span>
                          <WorkbenchInfoTip
                            ariaLabel={t(
                              "settings.userCenterSession.profile.syncTipAria",
                              "账号中心同步说明",
                            )}
                            content={t(
                              "settings.userCenterSession.profile.syncTip",
                              "资料修改请前往账号中心完成。客户端会同步最新昵称、头像、邮箱与默认服务状态，不再在本地维护第二份个人资料。",
                            )}
                            tone="slate"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 xl:w-[220px]">
                    <button
                      type="button"
                      onClick={() => void handleRefresh()}
                      disabled={refreshing}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                      data-testid="oem-cloud-refresh"
                    >
                      <RefreshCw
                        className={cn("h-4 w-4", refreshing && "animate-spin")}
                      />
                      {t(
                        "settings.userCenterSession.action.refresh",
                        "同步最新状态",
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openUserCenter("")}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {manageProfileLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      disabled={loggingOut}
                      className={PRIMARY_ACTION_BUTTON_CLASS}
                      data-testid="oem-cloud-logout"
                    >
                      <LogOut className="h-4 w-4" />
                      {loggingOut
                        ? t(
                            "settings.userCenterSession.action.loggingOut",
                            "退出中...",
                          )
                        : t(
                            "settings.userCenterSession.action.logout",
                            "退出当前账号",
                          )}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SessionValueCard
                    label={t(
                      "settings.userCenterSession.value.email.label",
                      "邮箱",
                    )}
                    value={accountEmail}
                    hint={t(
                      "settings.userCenterSession.value.email.hint",
                      "来自账号中心当前账户信息。",
                    )}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.email.tipAria",
                      "邮箱说明",
                    )}
                  />
                  <SessionValueCard
                    label={identityLabel}
                    value={accountIdentity}
                    hint={t(
                      "settings.userCenterSession.value.identity.hint",
                      "用于识别当前账户身份。",
                    )}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.identity.tipAria",
                      "账户身份说明",
                    )}
                  />
                  <SessionValueCard
                    label={t(
                      "settings.userCenterSession.value.expiresAt.label",
                      "会话有效期",
                    )}
                    value={formatOemCloudDateTime(session.session.expiresAt)}
                    hint={t(
                      "settings.userCenterSession.value.expiresAt.hint",
                      "到期后需要重新登录。",
                    )}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.expiresAt.tipAria",
                      "会话有效期说明",
                    )}
                  />
                  <SessionValueCard
                    label={t(
                      "settings.userCenterSession.value.defaultService.label",
                      "默认服务",
                    )}
                    value={
                      defaultProviderSummary ||
                      t(
                        "settings.userCenterSession.value.defaultService.unset",
                        "尚未设定",
                      )
                    }
                    hint={t(
                      "settings.userCenterSession.value.defaultService.hint",
                      "当前 AI 服务页默认使用的来源。",
                    )}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.defaultService.tipAria",
                      "默认服务说明",
                    )}
                  />
                </div>
              </article>

              <article className={SURFACE_CLASS_NAME}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {t(
                        "settings.userCenterSession.profile.method.title",
                        "资料维护方式",
                      )}
                    </h3>
                    <WorkbenchInfoTip
                      ariaLabel={t(
                        "settings.userCenterSession.profile.method.tipAria",
                        "资料维护方式说明",
                      )}
                      content={
                        <div className="space-y-1">
                          <p>
                            {t(
                              "settings.userCenterSession.profile.method.tipLine1",
                              "昵称、头像、邮箱等资料由账号中心统一维护。这里专注展示当前账户状态，不再提供单独的本地资料编辑入口。",
                            )}
                          </p>
                          <p>
                            {t(
                              "settings.userCenterSession.profile.method.tipLine2",
                              "如需调整资料，请前往账号中心完成修改，然后回到这里点击“同步最新状态”。",
                            )}
                          </p>
                        </div>
                      }
                      tone="slate"
                    />
                  </div>
                  {codeDelivery ? (
                    <p className="text-sm leading-6 text-slate-600">
                      {t("settings.userCenterSession.code.sentTo", {
                        email: codeDelivery.maskedEmail,
                        defaultValue: "最近一次验证码已发送到 {{email}}。",
                      })}
                    </p>
                  ) : null}
                </div>
              </article>
            </div>
          ) : (
            <article
              className={SURFACE_CLASS_NAME}
              data-testid="oem-cloud-login-panel"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.95fr)]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {t(
                          "settings.userCenterSession.login.google.title",
                          "使用 Google 一键登录",
                        )}
                      </h3>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.userCenterSession.login.google.tipAria",
                          "Google 一键登录说明",
                        )}
                        content={t(
                          "settings.userCenterSession.login.google.tip",
                          "Google 是默认登录方式。浏览器完成授权后，客户端会自动同步账户资料、默认服务与已开通能力；如果浏览器出现确认页，请继续完成。",
                        )}
                        tone="slate"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleGoogleLogin()}
                    disabled={openingGoogleLogin}
                    className="flex w-full items-center gap-4 rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                    data-testid="oem-cloud-google-login"
                  >
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                      <ProviderIcon providerType="google" size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {openingGoogleLogin
                          ? t(
                              "settings.userCenterSession.login.google.opening",
                              "正在打开 Google 登录...",
                            )
                          : t(
                              "settings.userCenterSession.login.google.title",
                              "使用 Google 一键登录",
                            )}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {t(
                          "settings.userCenterSession.login.google.description",
                          "在系统浏览器完成授权后会自动同步；如果浏览器出现确认页，请继续完成。",
                        )}
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleGoogleLogin()}
                      disabled={openingGoogleLogin}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {openingGoogleLogin
                        ? t(
                            "settings.userCenterSession.login.google.waiting",
                            "等待授权中...",
                          )
                        : t(
                            "settings.userCenterSession.login.google.reopen",
                            "重新打开授权页",
                          )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setShowAlternativeMethods((current) => !current)
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                      data-testid="oem-cloud-toggle-alternative-login"
                    >
                      {showAlternativeMethods ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {showAlternativeMethods
                        ? t(
                            "settings.userCenterSession.login.alternative.collapse",
                            "收起其他登录方式",
                          )
                        : t(
                            "settings.userCenterSession.login.alternative.expand",
                            "使用邮箱验证码 / 账号密码",
                          )}
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-5">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {t(
                          "settings.userCenterSession.login.afterBrowser.title",
                          "浏览器完成后自动同步",
                        )}
                      </h4>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.userCenterSession.login.afterBrowser.tipAria",
                          "登录后自动完成说明",
                        )}
                        content={
                          <div className="space-y-1">
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine1",
                                "Google 登录成功后，桌面端会自动同步当前账户会话。",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine2",
                                "如果浏览器出现确认页，需要再确认一次当前桌面请求。",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine3",
                                "同步当前账户资料与头像、昵称显示。",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine4",
                                "同步默认 AI 服务、模型目录与已开通能力。",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine5",
                                "个人资料统一在账号中心维护，避免多入口重复编辑。",
                              )}
                            </p>
                          </div>
                        }
                        tone="slate"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {showAlternativeMethods ? (
                <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-900">
                          {t(
                            "settings.userCenterSession.login.alternative.title",
                            "备用登录方式",
                          )}
                        </h4>
                        <WorkbenchInfoTip
                          ariaLabel={t(
                            "settings.userCenterSession.login.alternative.tipAria",
                            "备用登录方式说明",
                          )}
                          content={t(
                            "settings.userCenterSession.login.alternative.tip",
                            "如果当前组织没有启用 Google，或需要兼容已有账号体系，可以改用邮箱验证码或账号密码登录。",
                          )}
                          tone="slate"
                        />
                      </div>
                    </div>

                    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        onClick={() => setLoginMode("password")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium transition",
                          loginMode === "password"
                            ? ACTIVE_SEGMENT_BUTTON_CLASS
                            : "text-slate-600 hover:text-slate-900",
                        )}
                      >
                        {t(
                          "settings.userCenterSession.login.mode.password",
                          "账号密码",
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginMode("email_code")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium transition",
                          loginMode === "email_code"
                            ? ACTIVE_SEGMENT_BUTTON_CLASS
                            : "text-slate-600 hover:text-slate-900",
                        )}
                      >
                        {t(
                          "settings.userCenterSession.login.mode.emailCode",
                          "邮箱验证码",
                        )}
                      </button>
                    </div>
                  </div>

                  {loginMode === "password" ? (
                    <div className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          {t(
                            "settings.userCenterSession.form.identifier.label",
                            "邮箱 / 账号",
                          )}
                        </label>
                        <input
                          value={passwordForm.identifier}
                          onChange={(event) =>
                            setPasswordForm((current) => ({
                              ...current,
                              identifier: event.target.value,
                            }))
                          }
                          placeholder={t(
                            "settings.userCenterSession.form.identifier.placeholder",
                            "例如：operator@example.com",
                          )}
                          className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          data-testid="oem-cloud-password-identifier"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          {t(
                            "settings.userCenterSession.form.password.label",
                            "密码",
                          )}
                        </label>
                        <input
                          type="password"
                          value={passwordForm.password}
                          onChange={(event) =>
                            setPasswordForm((current) => ({
                              ...current,
                              password: event.target.value,
                            }))
                          }
                          placeholder={t(
                            "settings.userCenterSession.form.password.placeholder",
                            "输入账号中心密码",
                          )}
                          className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          data-testid="oem-cloud-password-secret"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => void handlePasswordLogin()}
                        disabled={loggingIn}
                        className={PRIMARY_ACTION_BUTTON_CLASS}
                        data-testid="oem-cloud-password-submit"
                      >
                        <LogIn className="h-4 w-4" />
                        {loggingIn
                          ? t(
                              "settings.userCenterSession.action.loggingIn",
                              "登录中...",
                            )
                          : t(
                              "settings.userCenterSession.login.password.submit",
                              "登录并同步账户",
                            )}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          {t(
                            "settings.userCenterSession.form.identifier.label",
                            "邮箱 / 账号",
                          )}
                        </label>
                        <input
                          value={emailCodeForm.identifier}
                          onChange={(event) =>
                            setEmailCodeForm((current) => ({
                              ...current,
                              identifier: event.target.value,
                            }))
                          }
                          placeholder={t(
                            "settings.userCenterSession.form.identifier.placeholder",
                            "例如：operator@example.com",
                          )}
                          className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          data-testid="oem-cloud-code-identifier"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            {t(
                              "settings.userCenterSession.form.code.label",
                              "验证码",
                            )}
                          </label>
                          <input
                            value={emailCodeForm.code}
                            onChange={(event) =>
                              setEmailCodeForm((current) => ({
                                ...current,
                                code: event.target.value,
                              }))
                            }
                            placeholder={t(
                              "settings.userCenterSession.form.code.placeholder",
                              "输入 6 位验证码",
                            )}
                            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                            data-testid="oem-cloud-code-value"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSendEmailCode()}
                          disabled={sendingCode}
                          className="self-end rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                          data-testid="oem-cloud-code-send"
                        >
                          {sendingCode
                            ? t(
                                "settings.userCenterSession.action.sendingCode",
                                "发送中...",
                              )
                            : t(
                                "settings.userCenterSession.action.sendCode",
                                "发送验证码",
                              )}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            {t(
                              "settings.userCenterSession.form.displayName.label",
                              "首次登录昵称",
                            )}
                          </label>
                          <input
                            value={emailCodeForm.displayName || ""}
                            onChange={(event) =>
                              setEmailCodeForm((current) => ({
                                ...current,
                                displayName: event.target.value,
                              }))
                            }
                            placeholder={t(
                              "settings.userCenterSession.form.optional.placeholder",
                              "选填",
                            )}
                            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            {t(
                              "settings.userCenterSession.form.username.label",
                              "首次登录账号",
                            )}
                          </label>
                          <input
                            value={emailCodeForm.username || ""}
                            onChange={(event) =>
                              setEmailCodeForm((current) => ({
                                ...current,
                                username: event.target.value,
                              }))
                            }
                            placeholder={t(
                              "settings.userCenterSession.form.optional.placeholder",
                              "选填",
                            )}
                            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleEmailCodeLogin()}
                        disabled={loggingIn}
                        className={PRIMARY_ACTION_BUTTON_CLASS}
                        data-testid="oem-cloud-code-submit"
                      >
                        <LogIn className="h-4 w-4" />
                        {loggingIn
                          ? t(
                              "settings.userCenterSession.action.loggingIn",
                              "登录中...",
                            )
                          : t(
                              "settings.userCenterSession.login.emailCode.submit",
                              "验证并同步账户",
                            )}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
