import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  subscribeAppServerConfigWarnings,
  type AppServerConfigWarningNotification,
} from "@/lib/api/appServer";
import type { TFunction } from "i18next";

export function AppServerConfigWarningToastBridge() {
  const { t } = useTranslation("common");
  const seenWarningsRef = useRef(new Set<string>());

  useEffect(() => {
    return subscribeAppServerConfigWarnings((warnings) => {
      for (const warning of warnings) {
        const key = configWarningKey(warning);
        if (seenWarningsRef.current.has(key)) {
          continue;
        }
        seenWarningsRef.current.add(key);
        toast.warning(t("common.app.configWarning.title"), {
          description: formatConfigWarningDescription(warning, t),
          duration: 12_000,
        });
      }
    });
  }, [t]);

  return null;
}

function formatConfigWarningDescription(
  warning: AppServerConfigWarningNotification,
  t: TFunction<"common">,
): string {
  const path = warning.path?.trim();
  const details = warning.details?.trim();

  if (path && details) {
    return t("common.app.configWarning.descriptionWithPathAndDetails", {
      details,
      path,
    });
  }
  if (path) {
    return t("common.app.configWarning.descriptionWithPath", { path });
  }
  if (details) {
    return t("common.app.configWarning.descriptionWithDetails", { details });
  }
  return t("common.app.configWarning.description");
}

function configWarningKey(warning: AppServerConfigWarningNotification): string {
  return [
    warning.summary,
    warning.path ?? "",
    warning.details ?? "",
    warning.range?.start?.line ?? "",
    warning.range?.start?.column ?? "",
    warning.range?.end?.line ?? "",
    warning.range?.end?.column ?? "",
  ].join("\u0000");
}
