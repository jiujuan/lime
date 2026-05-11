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
import { useOemCloudAccess } from "@/hooks/useOemCloudAccess";
import {
  formatDate as formatLocaleDate,
  formatNumber as formatLocaleNumber,
} from "@/i18n/format";
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
    return t("settings.userCenterSession.provider.system");
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

function formatSessionDateTime(
  value: string | undefined,
  locale: string,
  unknownLabel: string,
) {
  if (!value) {
    return unknownLabel;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return formatLocaleDate(timestamp, {
    locale,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function UserCenterSessionSettings() {
  const { t, i18n } = useTranslation("settings");
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
    t("settings.userCenterSession.account.fallbackName");
  const accountEmail =
    session?.user.email?.trim() ||
    session?.user.username?.trim() ||
    t("settings.userCenterSession.account.loginRequired");
  const accountIdentity =
    session?.user.username?.trim() ||
    session?.user.id ||
    t("settings.userCenterSession.account.loginRequired");
  const identityLabel = session?.user.username?.trim()
    ? t("settings.userCenterSession.account.identity.username")
    : t("settings.userCenterSession.account.identity.userId");
  const providerLabel = formatProviderLabel(t, session?.session.provider);
  const accountInitials = buildAccountInitials(
    session?.user.displayName ||
      session?.user.username ||
      session?.user.email ||
      undefined,
  );
  const syncedCapabilitiesSummary = session
    ? t("settings.userCenterSession.account.syncedCapabilities", {
        skills: formatLocaleNumber(
          resolveServiceSkillCount(bootstrap?.serviceSkillCatalog),
          { locale: i18n.language },
        ),
        scenes: formatLocaleNumber(bootstrap?.sceneCatalog?.length || 0, {
          locale: i18n.language,
        }),
      })
    : t("settings.userCenterSession.account.syncedPending");
  const manageProfileLabel = bootstrap?.features?.profileEditable
    ? t("settings.userCenterSession.action.manageProfile")
    : t("settings.userCenterSession.action.openUserCenter");

  return (
    <section className="space-y-4">
      <div className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[24px] font-semibold tracking-tight text-slate-900">
                  {t("settings.userCenterSession.title")}
                </h2>
                <WorkbenchInfoTip
                  ariaLabel={t("settings.userCenterSession.hero.tipAria")}
                  content={t("settings.userCenterSession.hero.tip")}
                  tone="mint"
                />
              </div>
              <p className="text-sm text-slate-500">
                {t("settings.userCenterSession.description")}
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
                    ? t("settings.userCenterSession.status.loggedIn")
                    : t("settings.userCenterSession.status.loggedOut"),
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {t("settings.userCenterSession.status.current", {
                  status: session
                    ? t("settings.userCenterSession.status.connected")
                    : t("settings.userCenterSession.status.waitingLogin"),
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {t("settings.userCenterSession.status.defaultService", {
                  service:
                    defaultProviderSummary ||
                    t("settings.userCenterSession.account.syncedPending"),
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
              {t("settings.userCenterSession.empty.runtimeMissing")}
            </div>
          ) : initializing ? (
            <div className="rounded-[24px] border border-white/90 bg-white/84 p-5 shadow-sm">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {t("settings.userCenterSession.loading.restoreAccount")}
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
                              },
                            )}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            {t("settings.userCenterSession.account.synced", {
                              summary: syncedCapabilitiesSummary,
                            })}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-slate-600">
                            {t("settings.userCenterSession.profile.unified")}
                          </span>
                          <WorkbenchInfoTip
                            ariaLabel={t(
                              "settings.userCenterSession.profile.syncTipAria",
                            )}
                            content={t(
                              "settings.userCenterSession.profile.syncTip",
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
                      {t("settings.userCenterSession.action.refresh")}
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
                        ? t("settings.userCenterSession.action.loggingOut")
                        : t("settings.userCenterSession.action.logout")}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SessionValueCard
                    label={t("settings.userCenterSession.value.email.label")}
                    value={accountEmail}
                    hint={t("settings.userCenterSession.value.email.hint")}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.email.tipAria",
                    )}
                  />
                  <SessionValueCard
                    label={identityLabel}
                    value={accountIdentity}
                    hint={t("settings.userCenterSession.value.identity.hint")}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.identity.tipAria",
                    )}
                  />
                  <SessionValueCard
                    label={t(
                      "settings.userCenterSession.value.expiresAt.label",
                    )}
                    value={formatSessionDateTime(
                      session.session.expiresAt,
                      i18n.language,
                      t("settings.userCenterSession.value.expiresAt.unknown"),
                    )}
                    hint={t("settings.userCenterSession.value.expiresAt.hint")}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.expiresAt.tipAria",
                    )}
                  />
                  <SessionValueCard
                    label={t(
                      "settings.userCenterSession.value.defaultService.label",
                    )}
                    value={
                      defaultProviderSummary ||
                      t("settings.userCenterSession.value.defaultService.unset")
                    }
                    hint={t(
                      "settings.userCenterSession.value.defaultService.hint",
                    )}
                    hintAriaLabel={t(
                      "settings.userCenterSession.value.defaultService.tipAria",
                    )}
                  />
                </div>
              </article>

              <article className={SURFACE_CLASS_NAME}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {t("settings.userCenterSession.profile.method.title")}
                    </h3>
                    <WorkbenchInfoTip
                      ariaLabel={t(
                        "settings.userCenterSession.profile.method.tipAria",
                      )}
                      content={
                        <div className="space-y-1">
                          <p>
                            {t(
                              "settings.userCenterSession.profile.method.tipLine1",
                            )}
                          </p>
                          <p>
                            {t(
                              "settings.userCenterSession.profile.method.tipLine2",
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
                        {t("settings.userCenterSession.login.google.title")}
                      </h3>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.userCenterSession.login.google.tipAria",
                        )}
                        content={t(
                          "settings.userCenterSession.login.google.tip",
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
                          ? t("settings.userCenterSession.login.google.opening")
                          : t("settings.userCenterSession.login.google.title")}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {t(
                          "settings.userCenterSession.login.google.description",
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
                        ? t("settings.userCenterSession.login.google.waiting")
                        : t("settings.userCenterSession.login.google.reopen")}
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
                          )
                        : t(
                            "settings.userCenterSession.login.alternative.expand",
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
                        )}
                      </h4>
                      <WorkbenchInfoTip
                        ariaLabel={t(
                          "settings.userCenterSession.login.afterBrowser.tipAria",
                        )}
                        content={
                          <div className="space-y-1">
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine1",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine2",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine3",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine4",
                              )}
                            </p>
                            <p>
                              {t(
                                "settings.userCenterSession.login.afterBrowser.tipLine5",
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
                          )}
                        </h4>
                        <WorkbenchInfoTip
                          ariaLabel={t(
                            "settings.userCenterSession.login.alternative.tipAria",
                          )}
                          content={t(
                            "settings.userCenterSession.login.alternative.tip",
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
                        {t("settings.userCenterSession.login.mode.password")}
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
                        {t("settings.userCenterSession.login.mode.emailCode")}
                      </button>
                    </div>
                  </div>

                  {loginMode === "password" ? (
                    <div className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          {t(
                            "settings.userCenterSession.form.identifier.label",
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
                          )}
                          className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          data-testid="oem-cloud-password-identifier"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          {t("settings.userCenterSession.form.password.label")}
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
                          ? t("settings.userCenterSession.action.loggingIn")
                          : t(
                              "settings.userCenterSession.login.password.submit",
                            )}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          {t(
                            "settings.userCenterSession.form.identifier.label",
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
                          )}
                          className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          data-testid="oem-cloud-code-identifier"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            {t("settings.userCenterSession.form.code.label")}
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
                            ? t("settings.userCenterSession.action.sendingCode")
                            : t("settings.userCenterSession.action.sendCode")}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            {t(
                              "settings.userCenterSession.form.displayName.label",
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
                            )}
                            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            {t(
                              "settings.userCenterSession.form.username.label",
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
                          ? t("settings.userCenterSession.action.loggingIn")
                          : t(
                              "settings.userCenterSession.login.emailCode.submit",
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
