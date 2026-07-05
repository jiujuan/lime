import { useTranslation } from "react-i18next";
import type { BulkPublishPluginPreflightResponse } from "@/lib/api/oemCloudPluginPublish";

export interface PluginPublishPreflightPlanProps {
  preflight: BulkPublishPluginPreflightResponse;
}

function targetActionTone(action: string): string {
  return action === "updated"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function signatureTone(status: string): string {
  if (status === "verified") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function PluginPublishPreflightPlan({
  preflight,
}: PluginPublishPreflightPlanProps) {
  const { t } = useTranslation("agent");
  const payload = preflight.normalizedPayload;
  const catalog = payload?.catalog;
  const release = payload?.release;
  const targetImpact = preflight.targetImpact ?? [];
  const signatureVerification = preflight.signatureVerification;

  if (
    !catalog &&
    !release &&
    targetImpact.length === 0 &&
    !signatureVerification
  ) {
    return null;
  }

  return (
    <div
      className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs text-emerald-900"
      data-testid="plugin-publish-preflight-plan"
    >
      <div className="font-semibold text-emerald-800">
        {t("plugin.publish.preflight.plan.title")}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        {catalog ? (
          <div className="min-w-0 rounded-lg border border-emerald-100 bg-white px-3 py-2">
            <div className="font-semibold text-emerald-700">
              {t("plugin.publish.preflight.plan.catalog")}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-emerald-950">
              {catalog.pluginName}@{catalog.marketplaceName ?? "limecloud"}
            </div>
          </div>
        ) : null}
        {release ? (
          <div className="min-w-0 rounded-lg border border-emerald-100 bg-white px-3 py-2">
            <div className="font-semibold text-emerald-700">
              {t("plugin.publish.preflight.plan.release")}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-emerald-950">
              {release.version} · {release.packageHash}
            </div>
          </div>
        ) : null}
        <div className="min-w-0 rounded-lg border border-emerald-100 bg-white px-3 py-2">
          <div className="font-semibold text-emerald-700">
            {t("plugin.publish.preflight.plan.targets")}
          </div>
          {targetImpact.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {targetImpact.map((item) => (
                <span
                  key={`${item.tenantId}:${item.action}`}
                  className={`rounded-full border px-2 py-0.5 font-semibold ${targetActionTone(
                    item.action,
                  )}`}
                >
                  {item.tenantId} ·{" "}
                  {t(`plugin.publish.preflight.plan.target.${item.action}`)}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-emerald-700">
              {t("plugin.publish.preflight.plan.targetsEmpty")}
            </div>
          )}
        </div>
        {signatureVerification ? (
          <div className="min-w-0 rounded-lg border border-emerald-100 bg-white px-3 py-2">
            <div className="font-semibold text-emerald-700">
              {t("plugin.publish.preflight.plan.signature")}
            </div>
            <div
              className={`mt-2 inline-flex rounded-full border px-2 py-0.5 font-semibold ${signatureTone(
                signatureVerification.status,
              )}`}
            >
              {t(
                `plugin.publish.preflight.plan.signature.${signatureVerification.status}`,
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
