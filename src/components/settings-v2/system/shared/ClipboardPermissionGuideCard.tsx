import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { openSystemSettingsUrl } from "@/lib/api/systemSettings";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getClipboardPermissionGuide } from "@/lib/crashDiagnostic";

interface ClipboardPermissionGuideCardProps {
  className?: string;
}

export function ClipboardPermissionGuideCard({
  className,
}: ClipboardPermissionGuideCardProps) {
  const { t } = useTranslation("settings");
  const [openError, setOpenError] = useState<string | null>(null);

  const guide = useMemo(
    () => getClipboardPermissionGuide(navigator.platform, navigator.userAgent),
    [],
  );
  const guideText = useMemo(() => {
    if (guide.platform === "macos") {
      return {
        title: t("settings.system.clipboardPermission.macos.title"),
        steps: [
          t("settings.system.clipboardPermission.macos.step1"),
          t("settings.system.clipboardPermission.macos.step2"),
          t("settings.system.clipboardPermission.macos.step3"),
        ],
      };
    }

    if (guide.platform === "windows") {
      return {
        title: t("settings.system.clipboardPermission.windows.title"),
        steps: [
          t("settings.system.clipboardPermission.windows.step1"),
          t("settings.system.clipboardPermission.windows.step2"),
          t("settings.system.clipboardPermission.windows.step3"),
        ],
      };
    }

    if (guide.platform === "linux") {
      return {
        title: t("settings.system.clipboardPermission.linux.title"),
        steps: [
          t("settings.system.clipboardPermission.linux.step1"),
          t("settings.system.clipboardPermission.linux.step2"),
          t("settings.system.clipboardPermission.linux.step3"),
        ],
      };
    }

    return {
      title: t("settings.system.clipboardPermission.generic.title"),
      steps: [
        t("settings.system.clipboardPermission.generic.step1"),
        t("settings.system.clipboardPermission.generic.step2"),
        t("settings.system.clipboardPermission.generic.step3"),
      ],
    };
  }, [guide, t]);

  const handleOpenSettings = async () => {
    if (!guide.settingsUrl) return;
    setOpenError(null);
    try {
      await openSystemSettingsUrl(guide.settingsUrl);
    } catch (error) {
      setOpenError(
        error instanceof Error
          ? error.message
          : t("settings.system.clipboardPermission.message.openSettingsFailed"),
      );
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-amber-900 dark:text-amber-300">
            {guideText.title}
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-amber-800 dark:text-amber-400">
            {guideText.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.settingsUrl && (
            <button
              type="button"
              onClick={() => void handleOpenSettings()}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2.5 py-1 text-xs text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {t("settings.system.clipboardPermission.action.openSettings")}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {openError && (
            <p className="text-xs text-destructive">
              {t(
                "settings.system.clipboardPermission.message.openSettingsFailedWithMessage",
                {
                  message: openError,
                },
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
