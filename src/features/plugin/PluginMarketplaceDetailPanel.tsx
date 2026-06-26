import { Power, Trash2 } from "lucide-react";
import { resolvePluginMarketplaceItemLabel } from "./marketplace/pluginMarketplaceActions";
import {
  pluginMarketplaceCategoryText,
  pluginMarketplaceStatusLabelKey,
  pluginMarketplaceStatusTone,
} from "./marketplace/pluginMarketplacePresentation";
import type {
  PluginMarketplaceViewItem,
} from "./marketplace/pluginMarketplaceViewModel";
import type {
  PluginMarketplaceExecutableActionKind,
} from "./marketplace/pluginMarketplaceActions";
import { PluginMarketplaceRegistrationPanel } from "./PluginMarketplaceRegistrationPanel";
import { shouldShowPluginMarketplaceRegistrationPanel } from "./PluginMarketplaceRegistrationPanelModel";
import { PluginMarketplaceSkillPanel } from "./PluginMarketplaceSkillPanel";
import type { PluginSkillDeclaration } from "./manifest/types";

export interface PluginMarketplaceDetailPanelProps {
  item: PluginMarketplaceViewItem | null;
  pendingPluginId: string | null;
  registrationCode: string;
  onRegistrationCodeChange: (pluginId: string, code: string) => void;
  onSubmitRegistration: (item: PluginMarketplaceViewItem) => void;
  onOpenSkill: (
    item: PluginMarketplaceViewItem,
    skill: PluginSkillDeclaration,
  ) => void;
  onManage: (
    item: PluginMarketplaceViewItem,
    action: PluginMarketplaceExecutableActionKind,
  ) => void;
  t: (key: string, options?: Record<string, string>) => string;
}

export function PluginMarketplaceDetailPanel({
  item,
  pendingPluginId,
  registrationCode,
  onRegistrationCodeChange,
  onSubmitRegistration,
  onOpenSkill,
  onManage,
  t,
}: PluginMarketplaceDetailPanelProps) {
  if (!item) {
    return (
      <aside
        className="min-h-[260px] rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500"
        data-testid="plugin-marketplace-detail-empty"
      >
        <h2 className="m-0 text-base font-semibold text-slate-700">
          {t("plugin.marketplace.detail.emptyTitle")}
        </h2>
        <p className="mt-2 leading-6">
          {t("plugin.marketplace.detail.emptyDescription")}
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="min-h-0 overflow-auto rounded-2xl border border-[color:var(--lime-surface-border,#e2e8f0)] bg-white p-5 shadow-sm shadow-slate-950/5"
      data-testid="plugin-marketplace-detail-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-xs font-semibold text-emerald-700">
            {t("plugin.marketplace.detail.eyebrow")}
          </p>
          <h2 className="m-0 mt-1 text-lg font-semibold text-slate-950">
            {resolvePluginMarketplaceItemLabel(item)}
          </h2>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${pluginMarketplaceStatusTone(
            item,
          )}`}
        >
          {t(pluginMarketplaceStatusLabelKey(item))}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {item.description || t("plugin.marketplace.descriptionFallback")}
      </p>

      <dl className="mt-5 grid gap-3">
        <DetailField
          label={t("plugin.marketplace.detail.pluginId")}
          value={item.pluginId}
        />
        <DetailField
          label={t("plugin.marketplace.detail.marketplace")}
          value={item.marketplaceDisplayName || item.marketplaceName}
        />
        <DetailField
          label={t("plugin.marketplace.detail.version")}
          value={item.version}
        />
        <DetailField
          label={t("plugin.marketplace.detail.categories")}
          value={pluginMarketplaceCategoryText(item)}
        />
        <DetailField
          label={t("plugin.marketplace.detail.installPolicy")}
          value={item.policy.installation}
        />
        <DetailField
          label={t("plugin.marketplace.detail.authPolicy")}
          value={item.policy.authentication}
        />
        <DetailField
          label={t("plugin.marketplace.detail.appId")}
          value={item.appId || "-"}
        />
        <DetailField
          label={t("plugin.marketplace.detail.releaseId")}
          value={item.releaseId || "-"}
        />
        <DetailField
          label={t("plugin.marketplace.detail.package")}
          value={packageSummary(item)}
        />
      </dl>

      <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="m-0 text-sm font-semibold text-amber-800">
          {t("plugin.marketplace.detail.blockers")}
        </h3>
        {item.blockerCodes.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.blockerCodes.map((code) => (
              <span
                key={code}
                className="rounded-md border border-amber-200 bg-white px-2 py-0.5 text-xs font-semibold text-amber-700"
              >
                {code}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-amber-800">
            {t("plugin.marketplace.detail.noBlockers")}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <h3 className="m-0 text-sm font-semibold text-sky-800">
          {t("plugin.marketplace.detail.nextStep")}
        </h3>
        <p className="mt-2 text-sm leading-6 text-sky-800">
          {t(detailNextStepKey(item))}
        </p>
      </section>

      <PluginMarketplaceSkillPanel
        item={item}
        pending={pendingPluginId === item.pluginId}
        onOpenSkill={onOpenSkill}
        t={t}
      />

      {shouldShowPluginMarketplaceRegistrationPanel(item) ? (
        <PluginMarketplaceRegistrationPanel
          item={item}
          code={registrationCode}
          pending={pendingPluginId === item.pluginId}
          onCodeChange={onRegistrationCodeChange}
          onSubmit={onSubmitRegistration}
          t={t}
        />
      ) : null}

      {item.installed ? (
        <PluginMarketplaceManagementPanel
          item={item}
          pending={pendingPluginId === item.pluginId}
          onManage={onManage}
          t={t}
        />
      ) : null}
    </aside>
  );
}

function PluginMarketplaceManagementPanel({
  item,
  pending,
  onManage,
  t,
}: {
  item: PluginMarketplaceViewItem;
  pending: boolean;
  onManage: (
    item: PluginMarketplaceViewItem,
    action: PluginMarketplaceExecutableActionKind,
  ) => void;
  t: (key: string, options?: Record<string, string>) => string;
}) {
  return (
    <section
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
      data-testid="plugin-marketplace-management-panel"
    >
      <h3 className="m-0 text-sm font-semibold text-slate-800">
        {t("plugin.marketplace.management.title")}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {t("plugin.marketplace.management.description")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.enabled ? (
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`plugin-marketplace-manage-disable-${item.pluginId}`}
            disabled={pending}
            onClick={() => onManage(item, "disable")}
            title={t("plugin.marketplace.management.disableTitle")}
          >
            <Power className="size-4" aria-hidden="true" />
            {pending
              ? t("plugin.marketplace.action.pending")
              : t("plugin.marketplace.action.disable")}
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`plugin-marketplace-manage-uninstall-${item.pluginId}`}
          disabled={pending}
          onClick={() => onManage(item, "uninstall_keep_data")}
          title={t("plugin.marketplace.management.uninstallTitle")}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {pending
            ? t("plugin.marketplace.action.pending")
            : t("plugin.marketplace.action.uninstallKeepData")}
        </button>
      </div>
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="m-0 break-words text-sm font-medium text-slate-800">
        {value || "-"}
      </dd>
    </div>
  );
}

function packageSummary(item: PluginMarketplaceViewItem): string {
  const parts = [
    item.package?.packageUrl,
    item.package?.packageHash,
    item.package?.manifestHash,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" / ") : "-";
}

function detailNextStepKey(item: PluginMarketplaceViewItem): string {
  if (!item.installed && item.policy.authentication === "ON_INSTALL") {
    return "plugin.marketplace.detail.nextStepRegistration";
  }
  switch (item.primaryAction.kind) {
    case "install":
      return "plugin.marketplace.detail.nextStepInstall";
    case "enable":
      return "plugin.marketplace.detail.nextStepEnable";
    case "open":
      return "plugin.marketplace.detail.nextStepOpen";
    case "view_history":
      return "plugin.marketplace.detail.nextStepHistory";
    case "blocked":
    default:
      return "plugin.marketplace.detail.nextStepBlocked";
  }
}
