import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiKeyProviderSection } from "@/components/api-key-provider";
import { useOemCloudAccess } from "@/hooks/useOemCloudAccess";
import type { SettingsProviderView } from "@/types/page";
import { cn } from "@/lib/utils";

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

export interface CloudProviderSettingsProps {
  initialView?: SettingsProviderView;
}

export function CloudProviderSettings(_props: CloudProviderSettingsProps) {
  const { t } = useTranslation("settings");
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
    hubProviderName?.trim() || t("settings.providers.cloud.brandFallback");
  const [cloudOpenError, setCloudOpenError] = useState<string | null>(null);
  const [cloudOpenInfo, setCloudOpenInfo] = useState<string | null>(null);

  const handleOpenCloudUserCenter = useCallback(
    async (path = "/welcome") => {
      if (!runtime) {
        setCloudOpenInfo(null);
        setCloudOpenError(
          t("settings.providers.cloud.message.userCenterMissing"),
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
            }),
          );
          return;
        }

        await openUserCenter(path);
        setCloudOpenInfo(
          t("settings.providers.cloud.message.userCenterOpened", {
            brand: cloudBrandLabel,
          }),
        );
      } catch (error) {
        const detail =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : t("settings.providers.cloud.message.browserRetry");
        setCloudOpenError(
          t("settings.providers.cloud.message.userCenterOpenFailed", {
            brand: cloudBrandLabel,
            detail,
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

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1
          className="text-2xl font-semibold tracking-normal text-slate-950"
          data-testid="provider-settings-title"
        >
          {t("settings.tab.providers")}
        </h1>
      </div>
      {errorMessage ? <NoticeBar tone="error" message={errorMessage} /> : null}
      {infoMessage ? <NoticeBar tone="success" message={infoMessage} /> : null}
      {cloudOpenError ? (
        <NoticeBar tone="error" message={cloudOpenError} />
      ) : null}
      {cloudOpenInfo ? (
        <NoticeBar tone="success" message={cloudOpenInfo} />
      ) : null}

      <ApiKeyProviderSection
        className="h-[calc(100vh-280px)] min-h-[520px] max-h-[780px]"
        exposeOemLoginPrompt={isOemRuntime && !session}
        onOemLogin={() => {
          void handleOpenCloudUserCenter("/welcome");
        }}
      />
    </div>
  );
}
