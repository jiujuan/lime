import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  checkForUpdates,
  downloadUpdate,
  type DownloadUpdateResult,
  type VersionInfo,
} from "@/lib/api/appUpdate";
import {
  skillsApi,
  type SkillPackageFileAssociationStatus,
} from "@/lib/api/skills";
import { LIME_BRAND_LOGO_SRC, LIME_BRAND_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

const FALLBACK_RELEASES_URL = "https://github.com/limecloud/lime/releases";
const PRIMARY_ACTION_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-slate-950/10 transition hover:bg-slate-800 disabled:opacity-50";
const SECONDARY_ACTION_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50";

export function AboutSection() {
  const { t } = useTranslation("settings");
  const [versionInfo, setVersionInfo] = useState<VersionInfo>({
    current: "",
    latest: undefined,
    hasUpdate: false,
    downloadUrl: undefined,
    error: undefined,
  });
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadResult, setDownloadResult] =
    useState<DownloadUpdateResult | null>(null);
  const [skillAssociationStatus, setSkillAssociationStatus] =
    useState<SkillPackageFileAssociationStatus | null>(null);
  const [skillAssociationLoading, setSkillAssociationLoading] = useState(false);
  const [skillAssociationApplying, setSkillAssociationApplying] =
    useState(false);
  const [skillAssociationMessage, setSkillAssociationMessage] = useState<
    string | null
  >(null);
  const manualDownloadUrl =
    versionInfo.releaseNotesUrl || FALLBACK_RELEASES_URL;
  const isWindows =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

  useEffect(() => {
    const loadCurrentVersion = async () => {
      try {
        const result = await checkForUpdates();
        if (result.error) {
          console.warn(
            "Update check returned a diagnostic error:",
            result.error,
          );
        }
        setVersionInfo({
          ...result,
          downloadUrl: result.downloadUrl || FALLBACK_RELEASES_URL,
        });
      } catch (error) {
        console.error("Failed to load version:", error);
        setVersionInfo((prev) => ({
          ...prev,
          downloadUrl: prev.downloadUrl || FALLBACK_RELEASES_URL,
        }));
      }
    };

    void loadCurrentVersion();
  }, []);

  const refreshSkillAssociationStatus = useCallback(async () => {
    setSkillAssociationLoading(true);
    try {
      const status = await skillsApi.getSkillPackageFileAssociationStatus();
      setSkillAssociationStatus(status);
      setSkillAssociationMessage(null);
    } catch (error) {
      setSkillAssociationMessage(
        t("settings.about.skillAssociation.message.checkFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSkillAssociationLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshSkillAssociationStatus();
  }, [refreshSkillAssociationStatus]);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setDownloadResult(null);
    try {
      const result = await checkForUpdates();
      if (result.error) {
        console.warn("Update check returned a diagnostic error:", result.error);
      }
      setVersionInfo({
        ...result,
        downloadUrl: result.downloadUrl || FALLBACK_RELEASES_URL,
      });
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setVersionInfo((prev) => ({
        ...prev,
        error: t("settings.about.update.errorCheck"),
        downloadUrl: prev.downloadUrl || FALLBACK_RELEASES_URL,
      }));
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setDownloading(true);
    setDownloadResult(null);
    try {
      const result = await downloadUpdate();
      setDownloadResult(result);

      if (result.success) {
        setTimeout(() => {
          setDownloadResult({
            ...result,
            message: t("settings.about.update.installedRestart"),
          });
        }, 1000);
      } else {
        console.error("Download failed:", result.message);
        setDownloadResult({
          ...result,
          message: t("settings.about.update.errorDownload"),
        });
      }
    } catch (error) {
      console.error("Failed to download update:", error);
      setDownloadResult({
        success: false,
        message: t("settings.about.update.errorDownload"),
        filePath: undefined,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleSetSkillAssociationDefault = async () => {
    setSkillAssociationApplying(true);
    try {
      const result = await skillsApi.setSkillPackageFileAssociationDefault();
      setSkillAssociationStatus(result.status);
      if (result.status.isDefault) {
        setSkillAssociationMessage(
          t("settings.about.skillAssociation.message.updated"),
        );
      } else if (result.status.requiresUserConfirmation) {
        setSkillAssociationMessage(
          t("settings.about.skillAssociation.message.needsConfirmation"),
        );
      } else {
        setSkillAssociationMessage(result.message);
      }
    } catch (error) {
      setSkillAssociationMessage(
        t("settings.about.skillAssociation.message.updateFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSkillAssociationApplying(false);
    }
  };

  const versionLabel = t("settings.about.version.label", {
    version: versionInfo.current || t("settings.about.version.loading"),
    build: versionInfo.current || t("settings.about.version.loading"),
  });

  const updateStatus = useMemo(() => {
    if (versionInfo.hasUpdate) {
      return {
        label: t("settings.about.status.updateAvailable", {
          version: versionInfo.latest ?? "",
        }),
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }

    if (versionInfo.error) {
      return {
        label: t("settings.about.update.errorCheck"),
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    }

    if (versionInfo.latest) {
      return {
        label: t("settings.about.status.latest"),
        className: "border-slate-200 bg-slate-100 text-slate-600",
      };
    }

    return {
      label: t("settings.about.status.manualCheck"),
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }, [t, versionInfo.error, versionInfo.hasUpdate, versionInfo.latest]);

  const skillAssociationStatusMeta = useMemo(() => {
    if (skillAssociationLoading && !skillAssociationStatus) {
      return {
        label: t("settings.about.skillAssociation.status.checking"),
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    }
    if (skillAssociationStatus?.isDefault) {
      return {
        label: t("settings.about.skillAssociation.status.default"),
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    if (skillAssociationStatus?.currentHandler) {
      return {
        label: t("settings.about.skillAssociation.status.other", {
          handler: skillAssociationStatus.currentHandler,
        }),
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    }
    return {
      label: t("settings.about.skillAssociation.status.unknown"),
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }, [skillAssociationLoading, skillAssociationStatus, t]);

  const skillAssociationActionLabel = skillAssociationStatus?.isDefault
    ? t("settings.about.skillAssociation.action.recheck")
    : skillAssociationStatus?.requiresUserConfirmation
      ? t("settings.about.skillAssociation.action.openSystemSettings")
      : t("settings.about.skillAssociation.action.setDefault");

  return (
    <div className="pb-8">
      <section className="mx-auto max-w-[560px] rounded-[28px] border border-slate-200/80 bg-white px-6 py-9 text-center shadow-sm shadow-slate-950/5">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[24px] border border-slate-200 bg-slate-50 shadow-sm shadow-slate-950/5">
          <img
            src={LIME_BRAND_LOGO_SRC}
            alt={LIME_BRAND_NAME}
            className="h-16 w-16 object-contain"
          />
        </div>

        <h2 className="mt-6 text-[28px] font-semibold tracking-tight text-slate-950">
          {LIME_BRAND_NAME}
        </h2>
        <p className="mt-3 text-base text-slate-700">{versionLabel}</p>
        <p className="mt-2 text-sm text-slate-500">
          {t("settings.about.copyright", {
            brand: LIME_BRAND_NAME,
          })}
        </p>

        <div className="mt-5 flex justify-center">
          <span
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              updateStatus.className,
            )}
          >
            {updateStatus.label}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void handleCheckUpdate()}
            disabled={checking || downloading}
            className={SECONDARY_ACTION_BUTTON_CLASS}
          >
            <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} />
            {t("settings.about.action.check")}
          </button>

          {versionInfo.hasUpdate ? (
            <>
              <button
                type="button"
                onClick={() => void handleDownloadUpdate()}
                disabled={downloading}
                className={PRIMARY_ACTION_BUTTON_CLASS}
              >
                <RefreshCw
                  className={cn("h-4 w-4", downloading && "animate-spin")}
                />
                {downloading
                  ? t("settings.about.action.downloading")
                  : t("settings.about.action.download")}
              </button>
              <a
                href={manualDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={SECONDARY_ACTION_BUTTON_CLASS}
              >
                <ExternalLink className="h-4 w-4" />
                {t("settings.about.action.webDownload")}
              </a>
            </>
          ) : null}
        </div>

        {isWindows ? (
          <p className="mx-auto mt-4 max-w-[420px] text-xs leading-5 text-slate-500">
            {t("settings.about.windowsSetupNotice")}
          </p>
        ) : null}

        {downloadResult ? (
          <div
            className={cn(
              "mt-5 rounded-[20px] border p-4 text-left text-sm shadow-sm shadow-slate-950/5",
              downloadResult.success
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700",
            )}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p>{downloadResult.message}</p>
                {!downloadResult.success ? (
                  <a
                    href={manualDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 underline hover:no-underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("settings.about.action.openWebDownload")}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mx-auto mt-4 max-w-[560px] rounded-[24px] border border-slate-200/80 bg-white p-5 text-left shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <PackageCheck className="h-4 w-4 text-amber-600" />
              {t("settings.about.skillAssociation.title")}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("settings.about.skillAssociation.description")}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
              skillAssociationStatusMeta.className,
            )}
          >
            {skillAssociationStatusMeta.label}
          </span>
        </div>

        <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          {skillAssociationStatus?.requiresUserConfirmation
            ? t("settings.about.skillAssociation.notice.requiresConfirmation")
            : t("settings.about.skillAssociation.notice.default")}
        </div>

        {skillAssociationMessage ? (
          <p
            className={cn(
              "mt-3 rounded-[16px] border px-3 py-2 text-xs leading-5",
              skillAssociationStatus?.isDefault
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            {skillAssociationMessage}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              skillAssociationStatus?.isDefault
                ? void refreshSkillAssociationStatus()
                : void handleSetSkillAssociationDefault()
            }
            disabled={skillAssociationLoading || skillAssociationApplying}
            className={
              skillAssociationStatus?.isDefault
                ? SECONDARY_ACTION_BUTTON_CLASS
                : PRIMARY_ACTION_BUTTON_CLASS
            }
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (skillAssociationLoading || skillAssociationApplying) &&
                  "animate-spin",
              )}
            />
            {skillAssociationApplying
              ? t("settings.about.skillAssociation.action.setting")
              : skillAssociationActionLabel}
          </button>

          {!skillAssociationStatus?.isDefault ? (
            <button
              type="button"
              onClick={() => void refreshSkillAssociationStatus()}
              disabled={skillAssociationLoading || skillAssociationApplying}
              className={SECONDARY_ACTION_BUTTON_CLASS}
            >
              {t("settings.about.skillAssociation.action.recheck")}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
