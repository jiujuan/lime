import { Layers3, PlayCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { InstalledPluginState, ProjectedEntry } from "../types";
import {
  buildDetailTags,
  getDetailCapabilityCount,
  getDetailCategory,
  getDetailCommonEntries,
  getDetailDeveloper,
  getDetailPermissions,
} from "./PluginsPageDetailModel";
import {
  buildAppCenterHostLifecycleSummary,
  canOneClickUpdate,
  getDefaultEntry,
  getDetailActionLabelKey,
  hasCloudUpdate,
  isCloudActionDisabled,
  isPrimaryActionDisabled,
  type AppCenterItem,
} from "./PluginsPageViewModel";
import {
  buildDetailActivationEntries,
  type DetailDeclaration,
} from "./pluginDetailDeclarations";
import {
  PluginAppIcon,
  type PluginDynamicTranslation,
} from "./PluginsPagePresentation";
import { PluginReadinessIssueSummary } from "./PluginReadinessIssueSummary";
import {
  appCenterSourceClass,
  appCenterStatusClass,
  hostLifecycleClass,
} from "./PluginsPageStyles";

export function PluginDetailHeroSection({
  item,
  busyAction,
  t,
  onPrimaryAction,
  onCloudAction,
  onLaunchEntry,
}: {
  item: AppCenterItem;
  busyAction: string | null;
  t: PluginDynamicTranslation;
  onPrimaryAction: (item: AppCenterItem) => void | Promise<void>;
  onCloudAction: (item: AppCenterItem) => void | Promise<void>;
  onLaunchEntry: (
    state: InstalledPluginState,
    entry: ProjectedEntry,
  ) => void | Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-4">
        <PluginAppIcon
          item={item}
          className="size-20 shrink-0"
          testId={`plugins-detail-icon-${item.appId}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[color:var(--lime-text-muted)]">
            {t("plugin.apps.center.detail.title")}
          </p>
          <h2 className="mt-2 text-[22px] font-semibold text-[color:var(--lime-text-strong)]">
            {item.title}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-md border px-2.5 py-1 text-sm font-medium ${appCenterSourceClass(
                item.sourceKind,
              )}`}
            >
              {t(`plugin.apps.center.source.${item.sourceKind}`)}
            </span>
            <span
              className={`rounded-md border px-2.5 py-1 text-sm font-medium ${appCenterStatusClass(
                item.statusKind,
              )}`}
            >
              {t(`plugin.apps.center.status.${item.statusKind}`)}
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm leading-6 text-[color:var(--lime-text-muted)]">
        {item.description || t("plugin.apps.center.descriptionFallback")}
      </p>
      <button
        type="button"
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-3 text-sm font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-100"
        disabled={isPrimaryActionDisabled(item, busyAction)}
        onClick={() => void onPrimaryAction(item)}
        data-testid={`plugins-detail-primary-action-${item.appId}`}
      >
        {canOneClickUpdate(item) ? (
          <RefreshCw size={16} />
        ) : (
          <PlayCircle size={16} />
        )}
        {t(getDetailActionLabelKey(item))}
      </button>
      {item.installedState && item.cloudApp && hasCloudUpdate(item) ? (
        <button
          type="button"
          className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={
            canOneClickUpdate(item)
              ? isPrimaryActionDisabled(item, busyAction) ||
                !getDefaultEntry(item)
              : isCloudActionDisabled(item, busyAction)
          }
          onClick={() => {
            if (canOneClickUpdate(item)) {
              const entry = getDefaultEntry(item);
              if (item.installedState && entry) {
                void onLaunchEntry(item.installedState, entry);
                return;
              }
            }
            void onCloudAction(item);
          }}
          data-testid={
            canOneClickUpdate(item)
              ? `plugins-launch-installed-${item.appId}`
              : `plugins-install-cloud-${item.appId}`
          }
        >
          {canOneClickUpdate(item)
            ? t("plugin.apps.center.action.open")
            : t("plugin.apps.center.action.update")}
        </button>
      ) : null}
    </section>
  );
}

export function PluginDetailHostLifecycleSection({
  item,
  t,
}: {
  item: AppCenterItem;
  t: PluginDynamicTranslation;
}) {
  const hostSummary = buildAppCenterHostLifecycleSummary(item);
  if (!hostSummary) {
    return null;
  }
  return (
    <section
      className="space-y-3 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-3"
      data-testid="plugins-host-lifecycle"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
          <ShieldCheck size={16} />
          {t("plugin.apps.center.host.title")}
        </div>
        <span
          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${hostLifecycleClass(
            hostSummary.tone,
          )}`}
          data-testid={`plugins-detail-host-status-${item.appId}`}
        >
          {t(hostSummary.labelKey)}
        </span>
      </div>
      <div className="grid gap-2 text-xs text-[color:var(--lime-text-muted)] sm:grid-cols-2">
        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
          {t("plugin.apps.center.host.rightSurface", {
            tabs: hostSummary.supportedTabCount,
            tab: hostSummary.defaultTab ?? "-",
          })}
        </div>
        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
          {t(
            hostSummary.blockerCount > 0
              ? "plugin.apps.center.host.blockers"
              : "plugin.apps.center.host.noBlockers",
            {
              count: hostSummary.blockerCount,
            },
          )}
        </div>
        {hostSummary.articleWorkspaceEnabled ? (
          <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 sm:col-span-2">
            {t("plugin.apps.center.host.articleWorkspace", {
              count: hostSummary.productObjectCount,
            })}
          </div>
        ) : null}
      </div>
      <PluginReadinessIssueSummary
        summary={hostSummary}
        appId={item.appId}
      />
    </section>
  );
}

export function PluginDetailMoreInfoSection({
  item,
  isOpen,
  t,
  onToggle,
}: {
  item: AppCenterItem;
  isOpen: boolean;
  t: PluginDynamicTranslation;
  onToggle: () => void;
}) {
  return (
    <section>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3 text-left text-sm font-semibold text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)]"
        onClick={onToggle}
        data-testid="plugins-more-info"
      >
        {t("plugin.apps.center.detail.moreInfo")}
        <span className="text-xs font-medium text-[color:var(--lime-text-muted)]">
          {isOpen
            ? t("plugin.apps.center.detail.collapse")
            : t("plugin.apps.center.detail.expand")}
        </span>
      </button>
      {isOpen ? (
        <div
          className="mt-2 space-y-3 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-3 text-xs text-[color:var(--lime-text-muted)]"
          data-testid="plugins-more-info-content"
        >
          <p className="break-all">
            {t("plugin.apps.center.detail.appId")}: {item.appId}
          </p>
          <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
            <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {t("plugin.apps.center.detail.sourceVersion")}
            </p>
            <div className="mt-3 grid gap-2 text-sm text-[color:var(--lime-text-muted)]">
              <div className="flex items-center justify-between gap-3">
                <span>{t("plugin.apps.center.detail.installedVersion")}</span>
                <span className="font-medium text-[color:var(--lime-text-strong)]">
                  {item.installedVersion ?? "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{t("plugin.apps.center.detail.cloudVersion")}</span>
                <span className="font-medium text-[color:var(--lime-text-strong)]">
                  {item.cloudVersion ?? "-"}
                </span>
              </div>
            </div>
          </div>
          {item.installedState ? (
            <>
              <p className="break-all">
                {t("plugin.apps.installReview.source", {
                  kind: item.installedState.identity.sourceKind,
                })}
              </p>
              <p className="break-all">
                {item.installedState.identity.sourceUri}
              </p>
              <p className="break-all">
                {t("plugin.apps.installReview.hashes", {
                  packageHash: item.installedState.identity.packageHash,
                  manifestHash: item.installedState.identity.manifestHash,
                })}
              </p>
            </>
          ) : null}
          {item.sourceState?.reason ? <p>{item.sourceState.reason}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function PluginDetailAgentsSection({
  item,
  busyAction,
  t,
  onLaunchActivationDeclaration,
}: {
  item: AppCenterItem;
  busyAction: string | null;
  t: PluginDynamicTranslation;
  onLaunchActivationDeclaration: (
    state: InstalledPluginState,
    declaration: DetailDeclaration,
  ) => void;
}) {
  const activationEntries = buildDetailActivationEntries(item);
  if (activationEntries.length === 0) {
    return null;
  }
  return (
    <section className="space-y-3" data-testid="plugins-detail-agents">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
          {t("plugin.apps.center.detail.agents")}
        </h3>
        <span className="text-xs text-[color:var(--lime-text-muted)]">
          {activationEntries.length}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {activationEntries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3 text-left transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              !item.installedState ||
              item.installedState.disabled ||
              Boolean(busyAction)
            }
            onClick={() => {
              if (!item.installedState) {
                return;
              }
              onLaunchActivationDeclaration(item.installedState, entry);
            }}
            data-testid={`plugins-detail-agent-${entry.key}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                  {entry.title}
                </p>
                {entry.meta ? (
                  <p className="mt-1 truncate text-xs text-[color:var(--lime-text-muted)]">
                    {entry.meta}
                  </p>
                ) : null}
              </div>
              <PlayCircle className="shrink-0 text-emerald-600" size={16} />
            </div>
            {entry.aliases?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {entry.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function PluginDetailAuthorizationsSection({
  item,
  t,
}: {
  item: AppCenterItem;
  t: PluginDynamicTranslation;
}) {
  const permissions = getDetailPermissions(item);
  return (
    <section className="space-y-3" data-testid="plugins-detail-authorizations">
      <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
        {t("plugin.apps.center.detail.authorizations")}
      </h3>
      {permissions.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {permissions.map((permission) => (
            <div
              key={permission.key}
              className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                    {permission.key}
                  </p>
                  {permission.reason ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                      {permission.reason}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${
                    permission.required
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  {permission.required
                    ? t("plugin.apps.center.detail.required")
                    : t("plugin.apps.center.detail.optional")}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-3 py-3 text-sm text-[color:var(--lime-text-muted)]">
          {item.registrationBlocked
            ? t("plugin.apps.center.detail.authorizationRequired")
            : t("plugin.apps.center.detail.noAuthorizations")}
        </div>
      )}
    </section>
  );
}

export function PluginDetailCommonEntriesSection({
  item,
  busyAction,
  t,
  onLaunchEntry,
}: {
  item: AppCenterItem;
  busyAction: string | null;
  t: PluginDynamicTranslation;
  onLaunchEntry: (
    state: InstalledPluginState,
    entry: ProjectedEntry,
  ) => void | Promise<void>;
}) {
  if (!item.installedState) {
    return null;
  }
  const commonEntries = getDetailCommonEntries(item);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
        <Layers3 size={16} />
        {t("plugin.apps.center.detail.commonEntries")}
      </div>
      {commonEntries.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {commonEntries.slice(0, 5).map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="flex items-center justify-between gap-3 rounded-[10px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3 text-left transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={item.installedState?.disabled || Boolean(busyAction)}
              onClick={() =>
                item.installedState
                  ? void onLaunchEntry(item.installedState, entry)
                  : undefined
              }
              data-testid={`plugins-launch-entry-${entry.key}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[color:var(--lime-text-strong)]">
                  {entry.title}
                </span>
                <span className="mt-1 block truncate text-xs text-[color:var(--lime-text-muted)]">
                  {t(`plugin.apps.runtime.entryKind.${entry.kind}`)}
                </span>
              </span>
              <PlayCircle className="shrink-0 text-sky-600" size={16} />
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4 text-sm text-[color:var(--lime-text-muted)]">
          {t("plugin.apps.center.detail.noEntries")}
        </p>
      )}
    </section>
  );
}

export function PluginDetailSummaryAside({
  item,
  t,
}: {
  item: AppCenterItem;
  t: PluginDynamicTranslation;
}) {
  return (
    <aside
      className="sticky top-4 space-y-1 rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-4 text-sm shadow-sm shadow-[color:var(--lime-shadow-color)]"
      data-testid="plugins-detail-summary"
    >
      {[
        [
          t("plugin.apps.center.detail.summary.category"),
          getDetailCategory(item) ??
            t(`plugin.apps.center.source.${item.sourceKind}`),
        ],
        [
          t("plugin.apps.center.detail.summary.version"),
          item.installedVersion ?? item.cloudVersion ?? "-",
        ],
        [
          t("plugin.apps.center.detail.summary.source"),
          t(`plugin.apps.center.source.${item.sourceKind}`),
        ],
        [
          t("plugin.apps.center.detail.summary.installedAt"),
          item.installedState?.installedAt ?? "-",
        ],
        [
          t("plugin.apps.center.detail.summary.capabilities"),
          t("plugin.apps.center.detail.summary.capabilityCount", {
            count: getDetailCapabilityCount(item),
          }),
        ],
        [
          t("plugin.apps.center.detail.summary.developer"),
          getDetailDeveloper(item) ?? "-",
        ],
      ].map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-4 border-b border-[color:var(--lime-surface-border)] py-2 last:border-b-0"
        >
          <span className="text-xs text-[color:var(--lime-text-muted)]">
            {label}
          </span>
          <span className="max-w-[150px] text-right text-xs font-semibold text-[color:var(--lime-text-strong)]">
            {value}
          </span>
        </div>
      ))}
      {buildDetailTags(item).length ? (
        <div className="pt-3">
          <p className="text-xs text-[color:var(--lime-text-muted)]">
            {t("plugin.apps.center.detail.summary.tags")}
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            {buildDetailTags(item).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-[color:var(--lime-surface-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--lime-text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
