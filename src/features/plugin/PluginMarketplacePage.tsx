import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  ChevronRight,
  FolderOpen,
  Info,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  resolveOemCloudRuntimeContext,
  type OemCloudRuntimeContext,
} from "@/lib/api/oemCloudRuntime";
import { listAgentRuntimeSessions } from "@/lib/api/agentRuntime";
import { buildAppCenterRuntimeCapabilityProfile } from "@/features/agent-app/runtime/appCenterRuntimeProfile";
import type { PluginsPageParams } from "@/types/page";
import type { Page, PageParams } from "@/types/page";
import {
  usePluginMarketplaceRegistry,
  type PluginMarketplaceRegistryLoader,
} from "./marketplace/usePluginMarketplaceRegistry";
import {
  performPluginMarketplaceLocalInstall,
  performPluginMarketplaceAction,
  resolvePluginMarketplaceItemLabel,
  submitPluginMarketplaceRegistrationCode,
  type PluginMarketplaceActionDeps,
  type PluginMarketplaceExecutableActionKind,
} from "./marketplace/pluginMarketplaceActions";
import {
  pluginMarketplaceActionTone,
  pluginMarketplaceCategoryText,
  pluginMarketplaceStatusLabelKey,
  pluginMarketplaceStatusTone,
} from "./marketplace/pluginMarketplacePresentation";
import { PluginMarketplaceDetailPanel } from "./PluginMarketplaceDetailPanel";
import {
  buildPluginHistorySessionSelectionModel,
  type PluginHistorySessionCandidate,
  type PluginHistorySessionSelectionModel,
} from "./history/pluginHistorySessionSelection";
import type {
  PluginMarketplaceStatusFilter,
  PluginMarketplaceViewItem,
} from "./marketplace/pluginMarketplaceViewModel";
import type { PluginSkillDeclaration } from "./manifest/types";
import {
  buildPluginMarketplaceHistoryAgentParams,
  buildPluginMarketplaceOpenAgentParams,
} from "./PluginMarketplacePageNavigation";

export type PluginMarketplaceHistorySessionLoader = (
  item: PluginMarketplaceViewItem,
) => Promise<PluginHistorySessionSelectionModel>;

export interface PluginMarketplacePageProps {
  pageParams?: PluginsPageParams;
  runtimeContext?: OemCloudRuntimeContext | null;
  loader?: PluginMarketplaceRegistryLoader;
  historySessionLoader?: PluginMarketplaceHistorySessionLoader;
  actionDeps?: PluginMarketplaceActionDeps;
  onNavigate?: (page: Page, params?: PageParams) => void;
}

const STATUS_FILTERS: PluginMarketplaceStatusFilter[] = [
  "all",
  "installed",
  "installable",
  "activatable",
  "attention",
];

type PluginMarketplaceTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

function normalizeStatusFilter(
  value: PluginsPageParams["statusFilter"],
): PluginMarketplaceStatusFilter {
  return value && STATUS_FILTERS.includes(value) ? value : "all";
}

function actionRefreshErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PluginMarketplacePage({
  pageParams,
  runtimeContext,
  loader,
  historySessionLoader,
  actionDeps,
  onNavigate,
}: PluginMarketplacePageProps) {
  const { t } = useTranslation("agent");
  const translate = useMemo<PluginMarketplaceTranslate>(() => {
    const baseTranslate = t as unknown as PluginMarketplaceTranslate;
    return (key, options) => String(baseTranslate(key, options));
  }, [t]);
  const resolvedRuntime = useMemo(
    () =>
      runtimeContext === undefined
        ? resolveOemCloudRuntimeContext()
        : runtimeContext,
    [runtimeContext],
  );
  const [query, setQuery] = useState(pageParams?.query ?? "");
  const [statusFilter, setStatusFilter] =
    useState<PluginMarketplaceStatusFilter>(() =>
      normalizeStatusFilter(pageParams?.statusFilter),
    );
  const [category, setCategory] = useState(pageParams?.category ?? "");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [localInstallPending, setLocalInstallPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [suppressedRegistryError, setSuppressedRegistryError] = useState<
    string | null
  >(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(
    pageParams?.selectedPluginId ?? null,
  );
  const [historySelectionPluginId, setHistorySelectionPluginId] = useState<
    string | null
  >(null);
  const [historySelectionModel, setHistorySelectionModel] =
    useState<PluginHistorySessionSelectionModel | null>(null);
  const [historySelectionLoading, setHistorySelectionLoading] = useState(false);
  const [historySelectionError, setHistorySelectionError] = useState<
    string | null
  >(null);
  const [registrationCodes, setRegistrationCodes] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    setSelectedPluginId(pageParams?.selectedPluginId ?? null);
  }, [pageParams?.selectedPluginId]);
  const actionRuntimeProfile = useMemo(
    buildAppCenterRuntimeCapabilityProfile,
    [],
  );
  const resolvedActionDeps = useMemo<PluginMarketplaceActionDeps>(
    () => ({
      ...actionDeps,
      profile: actionDeps?.profile ?? actionRuntimeProfile,
    }),
    [actionDeps, actionRuntimeProfile],
  );
  const registryLoaderDeps = useMemo(
    () => ({
      profile: resolvedActionDeps.profile,
    }),
    [resolvedActionDeps.profile],
  );
  const registry = usePluginMarketplaceRegistry({
    tenantId: resolvedRuntime?.sessionToken ? resolvedRuntime.tenantId : "",
    marketplaceQuery: {
      category,
      sort: "name",
    },
    viewOptions: {
      query,
      category,
      statusFilter,
      sort: "status",
    },
    loader,
    loaderDeps: registryLoaderDeps,
  });
  const model = registry.model;
  const categories = useMemo(() => {
    const values = new Set<string>();
    registry.snapshot?.marketplace.items.forEach((item) => {
      item.categories?.forEach((entry) => {
        if (entry.trim()) {
          values.add(entry.trim());
        }
      });
      if (item.category?.trim()) {
        values.add(item.category.trim());
      }
    });
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [registry.snapshot]);
  const selectedDetailItem = useMemo(() => {
    if (!model?.items.length) {
      return null;
    }
    return model.items.find((item) => item.pluginId === selectedPluginId) ?? null;
  }, [model, selectedPluginId]);

  function buildListParams(): PluginsPageParams {
    return {
      query: query || undefined,
      category: category || undefined,
      statusFilter,
    };
  }

  function handleOpenDetail(item: PluginMarketplaceViewItem) {
    setSelectedPluginId(item.pluginId);
    onNavigate?.("plugins", {
      ...buildListParams(),
      selectedPluginId: item.pluginId,
    });
  }

  function handleBackToList() {
    setSelectedPluginId(null);
    onNavigate?.("plugins", buildListParams());
  }

  async function loadHistorySessions(item: PluginMarketplaceViewItem) {
    const load =
      historySessionLoader ??
      (async (target: PluginMarketplaceViewItem) => {
        const sessions = await listAgentRuntimeSessions({
          includeArchived: true,
          limit: 80,
        });
        return buildPluginHistorySessionSelectionModel({
          item: target,
          sessions,
        });
      });
    setSelectedPluginId(item.pluginId);
    onNavigate?.("plugins", {
      ...buildListParams(),
      selectedPluginId: item.pluginId,
    });
    setHistorySelectionPluginId(item.pluginId);
    setHistorySelectionLoading(true);
    setHistorySelectionError(null);
    try {
      const nextModel = await load(item);
      setHistorySelectionModel(nextModel);
    } catch (error) {
      setHistorySelectionModel(null);
      setHistorySelectionError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setHistorySelectionLoading(false);
    }
  }

  async function handlePrimaryAction(item: PluginMarketplaceViewItem) {
    if (item.primaryAction.kind === "open") {
      const params = buildPluginMarketplaceOpenAgentParams(item);
      if (params) {
        onNavigate?.("agent", params);
      }
      return;
    }
    if (item.primaryAction.kind === "view_history") {
      void loadHistorySessions(item);
      return;
    }
    if (
      item.primaryAction.kind !== "install" &&
      item.primaryAction.kind !== "enable"
    ) {
      return;
    }
    setPendingActionId(item.pluginId);
    setActionError(null);
    setSuppressedRegistryError(null);
    try {
      const result = await performPluginMarketplaceAction(
        item,
        resolvedActionDeps,
      );
      if (result.status === "blocked") {
        setActionError(result.blockerCodes.join(", "));
        return;
      }
      if (result.status === "noop") {
        return;
      }
      registry.refresh().catch((error) => {
        setSuppressedRegistryError(actionRefreshErrorMessage(error));
        console.warn("[plugin-marketplace] action refresh failed", error);
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingActionId((current) =>
        current === item.pluginId ? null : current,
      );
    }
  }

  async function handleInstallLocalPackage() {
    setLocalInstallPending(true);
    setActionError(null);
    setSuppressedRegistryError(null);
    try {
      const result = await performPluginMarketplaceLocalInstall(
        {
          title: t("plugin.marketplace.localInstall.dialogTitle"),
        },
        resolvedActionDeps,
      );
      if (result.status !== "performed") {
        return;
      }
      registry.refresh().catch((error) => {
        setSuppressedRegistryError(actionRefreshErrorMessage(error));
        console.warn("[plugin-marketplace] local install refresh failed", error);
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setLocalInstallPending(false);
    }
  }

  function handleOpenSkill(
    item: PluginMarketplaceViewItem,
    skill: PluginSkillDeclaration,
  ) {
    const params = buildPluginMarketplaceOpenAgentParams(item, skill);
    if (params) {
      onNavigate?.("agent", params);
    }
  }

  function handleOpenHistorySession(
    item: PluginMarketplaceViewItem,
    candidate: PluginHistorySessionCandidate,
  ) {
    const params = buildPluginMarketplaceHistoryAgentParams(item, candidate);
    if (params) {
      onNavigate?.("agent", params);
    }
  }

  async function handleManagementAction(
    item: PluginMarketplaceViewItem,
    action: PluginMarketplaceExecutableActionKind,
  ) {
    if (action === "uninstall_keep_data") {
      const confirmed = window.confirm(
        t("plugin.marketplace.management.uninstallConfirm", {
          name: resolvePluginMarketplaceItemLabel(item),
        }),
      );
      if (!confirmed) {
        return;
      }
    }
    setPendingActionId(item.pluginId);
    setActionError(null);
    setSuppressedRegistryError(null);
    try {
      const result = await performPluginMarketplaceAction(
        item,
        resolvedActionDeps,
        action,
      );
      if (result.status === "blocked") {
        setActionError(result.blockerCodes.join(", "));
        return;
      }
      if (result.status === "noop") {
        return;
      }
      if (action === "uninstall_keep_data") {
        setSelectedPluginId(null);
        setHistorySelectionPluginId(null);
        setHistorySelectionModel(null);
        setHistorySelectionError(null);
        onNavigate?.("plugins", buildListParams());
      }
      registry.refresh().catch((error) => {
        setSuppressedRegistryError(actionRefreshErrorMessage(error));
        console.warn("[plugin-marketplace] action refresh failed", error);
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingActionId((current) =>
        current === item.pluginId ? null : current,
      );
    }
  }

  async function handleSubmitRegistration(item: PluginMarketplaceViewItem) {
    const code = registrationCodes[item.pluginId]?.trim() ?? "";
    if (!code) {
      setActionError("PLUGIN_REGISTRATION_CODE_MISSING");
      return;
    }
    setPendingActionId(item.pluginId);
    setActionError(null);
    setSuppressedRegistryError(null);
    try {
      await submitPluginMarketplaceRegistrationCode(
        item,
        code,
        resolvedActionDeps,
      );
      setRegistrationCodes((current) => ({
        ...current,
        [item.pluginId]: "",
      }));
      await registry.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingActionId((current) =>
        current === item.pluginId ? null : current,
      );
    }
  }

  const body = selectedDetailItem ? (
    <PluginMarketplaceDetailPage
      item={selectedDetailItem}
      pendingPluginId={pendingActionId}
      registrationCode={registrationCodes[selectedDetailItem.pluginId] ?? ""}
      historySelectionPluginId={historySelectionPluginId}
      historySelectionModel={historySelectionModel}
      historySelectionLoading={historySelectionLoading}
      historySelectionError={historySelectionError}
      onBack={handleBackToList}
      onRegistrationCodeChange={(pluginId, code) =>
        setRegistrationCodes((current) => ({
          ...current,
          [pluginId]: code,
        }))
      }
      onSubmitRegistration={(item) => void handleSubmitRegistration(item)}
      onOpenSkill={handleOpenSkill}
      onOpenHistorySession={handleOpenHistorySession}
      onRefreshHistorySessions={(item) => void loadHistorySessions(item)}
      onPrimaryAction={(item) => void handlePrimaryAction(item)}
      onManage={(item, action) => void handleManagementAction(item, action)}
      t={translate}
    />
  ) : (
    <>
      <header className="flex flex-col gap-4 rounded-2xl border border-[color:var(--lime-surface-border,#e2e8f0)] bg-[color:var(--lime-surface,#fff)] p-5 shadow-sm shadow-slate-950/5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Boxes className="size-3.5" aria-hidden="true" />
            {t("plugin.marketplace.eyebrow")}
          </div>
          <h1 className="m-0 text-2xl font-semibold tracking-normal text-[color:var(--lime-text-strong,#0f172a)]">
            {t("plugin.marketplace.title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--lime-text-muted,#64748b)]">
            {t("plugin.marketplace.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm shadow-slate-950/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="plugin-marketplace-local-install"
            disabled={localInstallPending}
            title={t("plugin.marketplace.localInstall.actionTitle")}
            onClick={() => void handleInstallLocalPackage()}
          >
            <FolderOpen className="size-4" aria-hidden="true" />
            {localInstallPending
              ? t("plugin.marketplace.localInstall.pending")
              : t("plugin.marketplace.localInstall.action")}
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[color:var(--lime-surface-border,#e2e8f0)] bg-[color:var(--lime-surface,#fff)] px-4 text-sm font-semibold text-[color:var(--lime-text-strong,#0f172a)] transition hover:bg-[color:var(--lime-surface-hover,#f8fafc)] disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="plugin-marketplace-refresh"
            disabled={registry.loading}
            onClick={() => void registry.refresh().catch(() => undefined)}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {registry.loading
              ? t("plugin.marketplace.loading")
              : t("plugin.marketplace.refresh")}
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <SummaryCard
          label={t("plugin.marketplace.count.all")}
          value={model?.filterCounts.all ?? 0}
        />
        <SummaryCard
          label={t("plugin.marketplace.count.installed")}
          value={model?.filterCounts.installed ?? 0}
        />
        <SummaryCard
          label={t("plugin.marketplace.count.installable")}
          value={model?.filterCounts.installable ?? 0}
        />
        <SummaryCard
          label={t("plugin.marketplace.count.activatable")}
          value={model?.filterCounts.activatable ?? 0}
        />
        <SummaryCard
          label={t("plugin.marketplace.count.attention")}
          value={model?.filterCounts.attention ?? 0}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-[color:var(--lime-surface-border,#e2e8f0)] bg-[color:var(--lime-surface,#fff)] p-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">
              {t("plugin.marketplace.search.label")}
            </span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              className="h-10 w-full rounded-full border border-[color:var(--lime-surface-border,#e2e8f0)] bg-[color:var(--lime-surface,#fff)] pl-10 pr-4 text-sm font-medium text-[color:var(--lime-text-strong,#0f172a)] outline-none transition placeholder:text-[color:var(--lime-text-muted,#94a3b8)] focus:border-[color:var(--lime-surface-border-strong,#94a3b8)]"
              data-testid="plugin-marketplace-search"
              value={query}
              placeholder={t("plugin.marketplace.search.placeholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="h-10 rounded-full border border-[color:var(--lime-surface-border,#e2e8f0)] bg-[color:var(--lime-surface,#fff)] px-3 text-sm font-semibold text-[color:var(--lime-text-strong,#0f172a)] outline-none"
            data-testid="plugin-marketplace-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label={t("plugin.marketplace.category.label")}
          >
            <option value="">{t("plugin.marketplace.category.all")}</option>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              data-testid={`plugin-marketplace-filter-${filter}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === filter
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => setStatusFilter(filter)}
            >
              {t(`plugin.marketplace.filter.${filter}`)}
            </button>
          ))}
        </div>
      </section>

      {registry.error !== suppressedRegistryError || actionError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <h2 className="m-0 text-base font-semibold">
            {registry.error !== suppressedRegistryError
              ? t("plugin.marketplace.error.title")
              : t("plugin.marketplace.actionError.title")}
          </h2>
          <p className="mt-1">
            {registry.error !== suppressedRegistryError
              ? registry.error
              : actionError}
          </p>
        </section>
      ) : null}

      <div className="min-h-0 flex-1">
        <section className="min-h-0 overflow-auto rounded-2xl border border-[color:var(--lime-surface-border,#e2e8f0)] bg-[color:var(--lime-surface,#fff)] p-4 shadow-sm shadow-slate-950/5">
          {registry.loading && !model ? (
            <div className="flex min-h-[260px] items-center justify-center text-sm font-medium text-[color:var(--lime-text-muted,#64748b)]">
              {t("plugin.marketplace.loading")}
            </div>
          ) : model && model.items.length > 0 ? (
            <div
              className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3"
              data-testid="plugin-marketplace-list"
            >
              {model.items.map((item) => (
                <article
                  key={item.pluginId}
                  className="flex min-h-[230px] flex-col rounded-2xl border border-[color:var(--lime-surface-border,#e2e8f0)] bg-white p-4 shadow-sm shadow-slate-950/5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md hover:shadow-slate-950/10"
                  data-testid={`plugin-marketplace-card-${item.pluginId}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="m-0 text-base font-semibold text-[color:var(--lime-text-strong,#0f172a)]">
                        {resolvePluginMarketplaceItemLabel(item)}
                      </h2>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {item.version}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${pluginMarketplaceStatusTone(
                          item,
                        )}`}
                      >
                        {translate(pluginMarketplaceStatusLabelKey(item))}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--lime-text-muted,#64748b)]">
                      {item.description ||
                        t("plugin.marketplace.descriptionFallback")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--lime-text-muted,#64748b)]">
                      <span>{item.pluginId}</span>
                      <span>{pluginMarketplaceCategoryText(item)}</span>
                      {item.visibleBlockers.slice(0, 2).map((blocker) => (
                        <span
                          key={blocker.code}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700"
                        >
                          {translate(blocker.labelKey)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      data-testid={`plugin-marketplace-detail-${item.pluginId}`}
                      onClick={() => handleOpenDetail(item)}
                      title={t("plugin.marketplace.detailActionTitle")}
                    >
                      <Info className="size-4" aria-hidden="true" />
                      {t("plugin.marketplace.action.detail")}
                    </button>
                    <MarketplaceActionButton
                      item={item}
                      pending={pendingActionId === item.pluginId}
                      onClick={() => void handlePrimaryAction(item)}
                      t={translate}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center px-4 text-center">
              <div>
                <h2 className="m-0 text-base font-semibold text-[color:var(--lime-text-strong,#0f172a)]">
                  {t("plugin.marketplace.empty.title")}
                </h2>
                <p className="mt-2 text-sm text-[color:var(--lime-text-muted,#64748b)]">
                  {t("plugin.marketplace.empty.description")}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );

  return (
    <main
      className="lime-workbench-theme-scope flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--lime-stage-surface,#f8fafc)] text-[color:var(--lime-text,#334155)]"
      data-testid="plugin-marketplace-page"
    >
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-1 flex-col gap-5 overflow-hidden px-6 py-6">
        {body}
      </div>
    </main>
  );
}

interface PluginMarketplaceDetailPageProps {
  item: PluginMarketplaceViewItem;
  pendingPluginId: string | null;
  registrationCode: string;
  historySelectionPluginId: string | null;
  historySelectionModel: PluginHistorySessionSelectionModel | null;
  historySelectionLoading: boolean;
  historySelectionError: string | null;
  onBack: () => void;
  onRegistrationCodeChange: (pluginId: string, code: string) => void;
  onSubmitRegistration: (item: PluginMarketplaceViewItem) => void;
  onOpenSkill: (
    item: PluginMarketplaceViewItem,
    skill: PluginSkillDeclaration,
  ) => void;
  onOpenHistorySession: (
    item: PluginMarketplaceViewItem,
    candidate: PluginHistorySessionCandidate,
  ) => void;
  onRefreshHistorySessions: (item: PluginMarketplaceViewItem) => void;
  onPrimaryAction: (item: PluginMarketplaceViewItem) => void;
  onManage: (
    item: PluginMarketplaceViewItem,
    action: PluginMarketplaceExecutableActionKind,
  ) => void;
  t: PluginMarketplaceTranslate;
}

function PluginMarketplaceDetailPage({
  item,
  pendingPluginId,
  registrationCode,
  historySelectionPluginId,
  historySelectionModel,
  historySelectionLoading,
  historySelectionError,
  onBack,
  onRegistrationCodeChange,
  onSubmitRegistration,
  onOpenSkill,
  onOpenHistorySession,
  onRefreshHistorySessions,
  onPrimaryAction,
  onManage,
  t,
}: PluginMarketplaceDetailPageProps) {
  return (
    <section
      className="min-h-0 flex-1 overflow-auto"
      data-testid="plugin-marketplace-detail-page"
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-2">
        <nav
          className="flex items-center gap-2 text-sm font-medium text-[color:var(--lime-text-muted,#64748b)]"
          aria-label={t("plugin.marketplace.detail.breadcrumb")}
        >
          <button
            type="button"
            className="rounded-md px-1 py-0.5 transition hover:bg-slate-100 hover:text-slate-900"
            data-testid="plugin-marketplace-detail-back"
            onClick={onBack}
          >
            {t("plugin.marketplace.title")}
          </button>
          <ChevronRight className="size-4" aria-hidden="true" />
          <span className="text-[color:var(--lime-text-strong,#0f172a)]">
            {resolvePluginMarketplaceItemLabel(item)}
          </span>
        </nav>

        <header className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm shadow-slate-950/5">
            <Boxes className="size-8" aria-hidden="true" />
          </div>
          <h1 className="m-0 mt-4 text-2xl font-semibold tracking-normal text-[color:var(--lime-text-strong,#0f172a)]">
            {resolvePluginMarketplaceItemLabel(item)}
          </h1>
          <p className="mt-1 text-sm leading-6 text-[color:var(--lime-text-muted,#64748b)]">
            {item.description || t("plugin.marketplace.descriptionFallback")}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {item.version}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${pluginMarketplaceStatusTone(
                item,
              )}`}
            >
              {t(pluginMarketplaceStatusLabelKey(item))}
            </span>
          </div>
        </header>

        <div className="flex justify-end">
          <MarketplaceActionButton
            item={item}
            pending={pendingPluginId === item.pluginId}
            onClick={() => onPrimaryAction(item)}
            t={t}
          />
        </div>

        <PluginMarketplaceDetailPanel
          item={item}
          showOverview={false}
          pendingPluginId={pendingPluginId}
          registrationCode={registrationCode}
          onRegistrationCodeChange={onRegistrationCodeChange}
          onSubmitRegistration={onSubmitRegistration}
          onOpenSkill={onOpenSkill}
          historySelectionModel={
            item.pluginId === historySelectionPluginId
              ? historySelectionModel
              : null
          }
          historySelectionLoading={
            item.pluginId === historySelectionPluginId &&
            historySelectionLoading
          }
          historySelectionError={
            item.pluginId === historySelectionPluginId
              ? historySelectionError
              : null
          }
          onOpenHistorySession={onOpenHistorySession}
          onRefreshHistorySessions={onRefreshHistorySessions}
          onManage={onManage}
          t={t}
        />
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[color:var(--lime-surface-border,#e2e8f0)] bg-[color:var(--lime-surface,#fff)] p-4 shadow-sm shadow-slate-950/5">
      <div className="text-xs font-semibold text-[color:var(--lime-text-muted,#64748b)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[color:var(--lime-text-strong,#0f172a)]">
        {value}
      </div>
    </div>
  );
}

function MarketplaceActionButton({
  item,
  pending,
  onClick,
  t,
}: {
  item: PluginMarketplaceViewItem;
  pending: boolean;
  onClick: () => void;
  t: (key: string) => string;
}) {
  const disabled =
    pending ||
    item.primaryAction.disabled ||
    item.primaryAction.kind === "blocked";
  const title =
    item.primaryAction.kind === "open"
      ? t("plugin.marketplace.openActionTitle")
      : item.primaryAction.kind === "view_history"
        ? t("plugin.marketplace.historyActionTitle")
        : item.primaryAction.kind === "install" ||
            item.primaryAction.kind === "enable"
          ? t("plugin.marketplace.writeActionTitle")
          : t("plugin.marketplace.readOnlyAction");

  return (
    <button
      type="button"
      className={`inline-flex h-9 min-w-[112px] items-center justify-center rounded-full border px-4 text-sm font-semibold ${pluginMarketplaceActionTone(
        item,
      )}`}
      data-testid={`plugin-marketplace-action-${item.pluginId}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {pending
        ? t("plugin.marketplace.action.pending")
        : t(item.primaryAction.labelKey)}
    </button>
  );
}
