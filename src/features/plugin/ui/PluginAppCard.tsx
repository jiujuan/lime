import { PlayCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { InstalledPluginState, ProjectedEntry } from "../types";
import {
  buildAppCenterHostLifecycleSummary,
  canOneClickUpdate,
  getActionLabelKey,
  getCloudActionLabelKey,
  getDefaultEntry,
  hasCloudUpdate,
  isCloudActionDisabled,
  isPrimaryActionDisabled,
  type AppCenterItem,
} from "./PluginsPageViewModel";
import {
  appCenterSourceClass,
  appCenterStatusClass,
  hostLifecycleClass,
} from "./PluginsPageStyles";
import {
  PluginAppIcon,
  type PluginDynamicTranslation,
} from "./PluginsPagePresentation";

export function PluginAppCard({
  item,
  busyAction,
  t,
  dynamicT,
  onOpenDetail,
  onPrimaryAction,
  onCloudAction,
  onLaunchEntry,
}: {
  item: AppCenterItem;
  busyAction: string | null;
  t: PluginDynamicTranslation;
  dynamicT: PluginDynamicTranslation;
  onOpenDetail: (appId: string) => void;
  onPrimaryAction: (item: AppCenterItem) => void | Promise<void>;
  onCloudAction: (item: AppCenterItem) => void | Promise<void>;
  onLaunchEntry: (
    state: InstalledPluginState,
    entry: ProjectedEntry,
  ) => void | Promise<void>;
}) {
  const selectedRow = false;
  const defaultEntry = getDefaultEntry(item);
  const hostSummary = buildAppCenterHostLifecycleSummary(item);
  return (
    <div
      className={`group flex min-h-[188px] flex-col rounded-[10px] border bg-[color:var(--lime-surface)] p-4 text-left shadow-sm shadow-[color:var(--lime-shadow-color)] transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] hover:shadow-md ${
        selectedRow
          ? "border-emerald-300 ring-1 ring-emerald-200"
          : "border-[color:var(--lime-surface-border)]"
      }`}
      data-testid={`plugins-list-row-${item.appId}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <PluginAppIcon item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <h2 className="min-w-0 truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {item.title}
            </h2>
            <span
              className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${appCenterStatusClass(
                item.statusKind,
              )}`}
            >
              {t(`plugin.apps.center.status.${item.statusKind}`)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${appCenterSourceClass(
                item.sourceKind,
              )}`}
            >
              {t(`plugin.apps.center.source.${item.sourceKind}`)}
            </span>
            {item.sourceState ? (
              <span
                className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                data-testid={`plugins-source-state-${item.appId}`}
              >
                {t(item.sourceState.labelKey)}
              </span>
            ) : null}
          </div>
          {hostSummary ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${hostLifecycleClass(
                  hostSummary.tone,
                )}`}
                data-testid={`plugins-host-status-${item.appId}`}
              >
                {dynamicT(hostSummary.labelKey)}
              </span>
              {hostSummary.articleWorkspaceEnabled ? (
                <span
                  className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                  data-testid={`plugins-host-article-workspace-${item.appId}`}
                >
                  {t("plugin.apps.center.host.articleWorkspace", {
                    count: hostSummary.productObjectCount,
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-[color:var(--lime-text-muted)]">
        {item.description || t("plugin.apps.center.descriptionFallback")}
      </p>
      {item.installedState ? (
        <span
          className="sr-only"
          data-testid={`plugins-installed-${item.appId}`}
        />
      ) : null}
      {item.registrationBlocked ? (
        <span
          className="sr-only"
          data-testid={`plugins-registration-${item.appId}`}
        />
      ) : null}

      <div className="mt-3 border-t border-[color:var(--lime-surface-border)] pt-3">
        <div className="text-xs text-[color:var(--lime-text-muted)]">
          <span className="font-medium text-[color:var(--lime-text)]">
            {item.installedVersion
              ? t("plugin.apps.center.version.current", {
                  version: item.installedVersion,
                })
              : (item.cloudVersion ?? "-")}
          </span>
          {item.installedVersion &&
          item.cloudVersion &&
          item.installedVersion !== item.cloudVersion ? (
            <span className="mt-1 block text-amber-700">
              {t("plugin.apps.center.version.cloud", {
                version: item.cloudVersion,
              })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-3">
        <button
          type="button"
          className="inline-flex h-8 flex-1 min-w-0 items-center justify-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-3 text-xs font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPrimaryActionDisabled(item, busyAction)}
          onClick={(event) => {
            event.stopPropagation();
            void onPrimaryAction(item);
          }}
          data-testid={
            !item.installedState && item.cloudApp
              ? `plugins-install-cloud-${item.appId}`
              : canOneClickUpdate(item)
                ? `plugins-update-cloud-${item.appId}`
                : undefined
          }
        >
          {canOneClickUpdate(item) ? (
            <RefreshCw size={14} />
          ) : defaultEntry && item.installedState ? (
            <PlayCircle size={14} />
          ) : (
            <ShieldCheck size={14} />
          )}
          {t(getActionLabelKey(item))}
        </button>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)]"
          onClick={() => onOpenDetail(item.appId)}
          data-testid={`plugins-open-detail-${item.appId}`}
        >
          {t("plugin.apps.center.action.details")}
        </button>
      </div>

      {item.installedState && item.cloudApp && hasCloudUpdate(item) ? (
        <button
          type="button"
          className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={
            canOneClickUpdate(item)
              ? isPrimaryActionDisabled(item, busyAction) || !defaultEntry
              : isCloudActionDisabled(item, busyAction)
          }
          onClick={(event) => {
            event.stopPropagation();
            if (canOneClickUpdate(item) && item.installedState && defaultEntry) {
              void onLaunchEntry(item.installedState, defaultEntry);
              return;
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
            : t(getCloudActionLabelKey(item))}
        </button>
      ) : null}
    </div>
  );
}
