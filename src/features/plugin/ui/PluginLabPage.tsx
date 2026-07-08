import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Archive,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Database,
  FileJson,
  FlaskConical,
  Layers3,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { buildAdapterCapabilityProfile } from "../adapters/adapterCapabilityProfile";
import { InMemoryPluginCapabilityStore } from "../adapters/InMemoryPluginCapabilityStore";
import { resolvePluginHostFlags } from "../featureFlag";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import {
  buildPluginLabResolvedSetupState,
  evaluatePluginLabInstallFlow,
} from "../install/labInstallFlow";
import { buildPluginCleanupRehearsalEvidence } from "../install/cleanupRehearsalEvidence";
import { buildPluginCleanupResidualAudit } from "../install/cleanupResidualAudit";
import {
  BrowserLocalStoragePluginPersistenceDriver,
  buildInstalledPluginState,
  LocalInstalledPluginStateRepository,
  type InstalledPluginStatePersistenceIssue,
} from "../install/installedAppState";
import { buildPackageIdentity } from "../install/packageIdentity";
import {
  evaluatePluginEntryRuntimeGuard,
  type PluginEntryRuntimeGuardOperation,
  type PluginEntryRuntimeGuardResult,
} from "../runtime/entryRuntimeGuard";
import { UiExtensionHost } from "../runtime/uiExtensionHost";
import { buildUiRuntimeCapabilityProfile } from "../runtime/uiRuntimeCapabilityProfile";
import { buildLimeRuntimeProfileForPreview } from "../runtime-profile";
import type { CapabilityHost } from "../sdk/CapabilityHost";
import type {
  PluginHostFlags,
  PluginRunResult,
  PluginUiMountResult,
  AppManifest,
  InstalledPluginState,
  ProjectedEntry,
} from "../types";
import {
  buildManagerCompanionFixture,
  buildPreviewFromInstalledState,
  buildRuntimePackageLoadForPreview,
} from "./PluginLabHelpers";
import {
  CleanupPlanPanel,
  EntryList,
  EntryRuntimeGuardPanel,
  InstallFlowPanel,
  IssueList,
  RunResultPanel,
  SectionCard,
  StatusBadge,
  UiRuntimePanel,
} from "./PluginLabPanels";
import { CapabilityTable } from "./PluginLabCapabilityTable";
import {
  type PluginManagerEvidenceAction,
  type PluginManagerEvidenceSummary,
} from "./pluginManagerStatus";
import { PluginManagerPanel } from "./PluginManagerPanel";

interface PluginLabPageProps {
  flags?: Partial<PluginHostFlags>;
  fixture?: AppManifest;
}

type CapabilityHostMode = "adapter";

function PluginLabUnavailable() {
  const { t } = useTranslation("agent");
  return (
    <div
      className="min-h-full bg-slate-50 px-6 py-8 text-slate-900"
      data-testid="plugin-lab-page"
    >
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("plugin.lab.badge")}
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            {t("plugin.lab.title")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {t("plugin.lab.boundary.description")}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {t("plugin.lab.boundary.noRuntime")}
          </p>
        </div>
      </div>
    </div>
  );
}

export function PluginLabPage({ fixture, flags }: PluginLabPageProps = {}) {
  if (!fixture) {
    return <PluginLabUnavailable />;
  }
  return <PluginLabPageWithFixture fixture={fixture} flags={flags} />;
}

function PluginLabPageWithFixture({
  fixture: contentFactoryFixture,
  flags,
}: PluginLabPageProps & { fixture: AppManifest }) {
  const { t } = useTranslation("agent");
  const resolvedFlags = useMemo(() => resolvePluginHostFlags(flags), [flags]);
  const [runResult, setRunResult] = useState<PluginRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [uiMountResult, setUiMountResult] =
    useState<PluginUiMountResult | null>(null);
  const [uiMountError, setUiMountError] = useState<string | null>(null);
  const [entryGuardResult, setEntryGuardResult] =
    useState<PluginEntryRuntimeGuardResult | null>(null);
  const [labSetupResolved, setLabSetupResolved] = useState(false);
  const [managerDisabled, setManagerDisabled] = useState(false);
  const [managerEvidence, setManagerEvidence] =
    useState<PluginManagerEvidenceSummary | null>(null);
  const [managerRepositoryStates, setManagerRepositoryStates] = useState<
    InstalledPluginState[]
  >([]);
  const [managerRepositoryIssueCount, setManagerRepositoryIssueCount] =
    useState(0);
  const [managerRepositoryIssues, setManagerRepositoryIssues] = useState<
    InstalledPluginStatePersistenceIssue[]
  >([]);
  const [managerRepositorySeedKey, setManagerRepositorySeedKey] = useState<
    string | null
  >(null);
  const [managerSelectedAppId, setManagerSelectedAppId] = useState<
    string | null
  >(null);
  const [lastLaunch, setLastLaunch] = useState<{
    entryKey: string;
    operation: PluginEntryRuntimeGuardOperation;
  } | null>(null);
  const managerRepository = useMemo(() => {
    try {
      return new LocalInstalledPluginStateRepository({
        driver: new BrowserLocalStoragePluginPersistenceDriver({
          keyPrefix: "lime.plugin.lab.persistence:",
        }),
      });
    } catch {
      return null;
    }
  }, []);
  const adapterStore = useMemo(() => new InMemoryPluginCapabilityStore(), []);
  const hostMode: CapabilityHostMode | null = resolvedFlags.realAdapterEnabled
    ? "adapter"
    : null;
  const capabilityProfile = useMemo(() => {
    if (resolvedFlags.uiRuntimeEnabled) {
      return buildUiRuntimeCapabilityProfile(resolvedFlags);
    }
    if (hostMode === "adapter") {
      return buildAdapterCapabilityProfile(resolvedFlags);
    }
    return undefined;
  }, [hostMode, resolvedFlags]);
  const setupPreview = useMemo(
    () =>
      buildInstalledAppPreview({
        fixture: contentFactoryFixture,
        profile: capabilityProfile,
        loadedAt: "2026-05-15T00:00:00.000Z",
        checkedAt: "2026-05-15T00:00:00.000Z",
        generatedAt: "2026-05-15T00:00:00.000Z",
      }),
    [capabilityProfile, contentFactoryFixture],
  );
  const labSetup = useMemo(
    () =>
      labSetupResolved
        ? buildPluginLabResolvedSetupState(setupPreview.projection)
        : undefined,
    [labSetupResolved, setupPreview],
  );
  const preview = useMemo(
    () =>
      buildInstalledAppPreview({
        fixture: contentFactoryFixture,
        setup: labSetup,
        profile: capabilityProfile,
        loadedAt: "2026-05-15T00:00:00.000Z",
        checkedAt: "2026-05-15T00:00:00.000Z",
        generatedAt: "2026-05-15T00:00:00.000Z",
      }),
    [capabilityProfile, labSetup, contentFactoryFixture],
  );
  const managerCompanionFixture = useMemo(
    () => buildManagerCompanionFixture(contentFactoryFixture),
    [contentFactoryFixture],
  );
  const managerCompanionPreview = useMemo(() => {
    const identity = buildPackageIdentity({
      manifest: managerCompanionFixture,
      sourceKind: "fixture",
      sourceUri: "fixture:content-factory-playbook-app",
      loadedAt: "2026-05-15T00:00:00.000Z",
    });
    return buildInstalledAppPreview({
      fixture: managerCompanionFixture,
      identity,
      setup: labSetup,
      profile: capabilityProfile,
      loadedAt: "2026-05-15T00:00:00.000Z",
      checkedAt: "2026-05-15T00:00:00.000Z",
      generatedAt: "2026-05-15T00:00:00.000Z",
    });
  }, [capabilityProfile, labSetup, managerCompanionFixture]);
  const runtimePackageLoad = useMemo(
    () => buildRuntimePackageLoadForPreview(preview),
    [preview],
  );
  const capabilityHost = useMemo<CapabilityHost | null>(() => {
    if (hostMode === "adapter") {
      return new AdapterCapabilityHost({
        preview,
        realAdapterEnabled: resolvedFlags.realAdapterEnabled,
        store: adapterStore,
      });
    }
    return null;
  }, [adapterStore, hostMode, preview, resolvedFlags.realAdapterEnabled]);
  const uiExtensionHost = useMemo(
    () =>
      resolvedFlags.uiRuntimeEnabled
        ? new UiExtensionHost({ preview, flags: resolvedFlags })
        : null,
    [preview, resolvedFlags],
  );
  const defaultLaunchEntry = preview.projection.entries[0];
  const defaultLaunchOperation: PluginEntryRuntimeGuardOperation =
    defaultLaunchEntry &&
    ["page", "panel", "settings"].includes(defaultLaunchEntry.kind)
      ? "mount-ui"
      : "run-entry";
  const installFlow = useMemo(
    () =>
      evaluatePluginLabInstallFlow({
        preview,
        setup: labSetup,
        flags: resolvedFlags,
        entryKey: lastLaunch?.entryKey ?? defaultLaunchEntry?.key ?? "",
        operation: lastLaunch?.operation ?? defaultLaunchOperation,
        permissionDecision: "accepted",
        launchRequested: Boolean(lastLaunch),
        runtimeProfile: capabilityProfile
          ? buildLimeRuntimeProfileForPreview({
              preview,
              hostProfile: capabilityProfile,
            })
          : undefined,
        now: "2026-05-15T00:00:00.000Z",
      }),
    [
      capabilityProfile,
      defaultLaunchEntry?.key,
      defaultLaunchOperation,
      labSetup,
      lastLaunch,
      preview,
      resolvedFlags,
    ],
  );
  const managerCompanionInstalledState = useMemo(
    () =>
      buildInstalledPluginState({
        preview: managerCompanionPreview,
        setup: labSetup,
        installedAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      }),
    [labSetup, managerCompanionPreview],
  );
  const managerSeedStates = useMemo(
    () =>
      [installFlow.installedState, managerCompanionInstalledState].filter(
        (state): state is InstalledPluginState => Boolean(state),
      ),
    [installFlow.installedState, managerCompanionInstalledState],
  );
  const managerSelectedState = managerRepositoryStates.find(
    (state) =>
      state.appId === (managerSelectedAppId ?? installFlow.review.appId),
  );
  const managerPersistedState =
    managerSelectedState ??
    managerRepositoryStates.find(
      (state) => state.appId === installFlow.review.appId,
    );
  const managerEffectiveDisabled =
    managerPersistedState?.disabled ?? managerDisabled;
  const allIssues = [
    ...preview.readiness.blockers,
    ...preview.readiness.warnings,
  ];
  useEffect(() => {
    if (!managerRepository || managerSeedStates.length === 0) {
      return;
    }
    const seedKey = managerSeedStates
      .map(
        (state) =>
          `${state.appId}:${state.identity.packageHash}:${Boolean(labSetup)}`,
      )
      .join("|");
    let canceled = false;

    void (async () => {
      if (managerRepositorySeedKey !== seedKey) {
        for (const state of managerSeedStates) {
          const current = await managerRepository.get(state.appId);
          await managerRepository.save(
            {
              ...state,
              disabled: current.state?.disabled ?? state.disabled,
            },
            state.updatedAt,
          );
        }
        setManagerRepositorySeedKey(seedKey);
      }
      const list = await managerRepository.list();
      if (!canceled) {
        setManagerRepositoryStates(list.states);
        setManagerRepositoryIssueCount(list.issues.length);
        setManagerRepositoryIssues(list.issues);
        setManagerSelectedAppId(
          (current) => current ?? installFlow.review.appId,
        );
      }
    })();

    return () => {
      canceled = true;
    };
  }, [
    installFlow.review.appId,
    labSetup,
    managerRepository,
    managerRepositorySeedKey,
    managerSeedStates,
  ]);
  const handleResolveLabSetup = () => {
    setLabSetupResolved(true);
    setLastLaunch(null);
    setEntryGuardResult(null);
    setRunResult(null);
    setRunError(null);
    setUiMountResult(null);
    setUiMountError(null);
    setManagerDisabled(false);
    setManagerEvidence(null);
    setManagerRepositoryIssues([]);
    setManagerRepositorySeedKey(null);
    setManagerSelectedAppId(null);
  };
  const buildManagerEvidence = (params: {
    action: PluginManagerEvidenceAction;
    state?: InstalledPluginState;
    entryKey?: string;
    guardStatus?: PluginEntryRuntimeGuardResult["status"];
    deletedTargetCount?: number;
    retainedTargetCount?: number;
    cleanupEvidence?: PluginManagerEvidenceSummary["cleanupEvidence"];
    residualAudit?: PluginManagerEvidenceSummary["residualAudit"];
  }): PluginManagerEvidenceSummary => {
    const identity = params.state?.identity ?? preview.identity;
    return {
      action: params.action,
      appId: identity.appId,
      appVersion: identity.appVersion,
      packageHash: identity.packageHash,
      manifestHash: identity.manifestHash,
      generatedAt: "2026-05-15T00:00:00.000Z",
      entryKey: params.entryKey,
      guardStatus: params.guardStatus,
      deletedTargetCount: params.deletedTargetCount ?? 0,
      retainedTargetCount: params.retainedTargetCount ?? 0,
      cleanupEvidence: params.cleanupEvidence,
      residualAudit: params.residualAudit,
    };
  };
  const evaluateGuard = (
    entryKey: string,
    operation: PluginEntryRuntimeGuardOperation,
    state?: InstalledPluginState,
  ): PluginEntryRuntimeGuardResult => {
    const guardPreview = state
      ? buildPreviewFromInstalledState(state)
      : preview;
    const runtimeProfile = capabilityProfile
      ? buildLimeRuntimeProfileForPreview({
          preview: guardPreview,
          hostProfile: capabilityProfile,
          installMode: state?.installMode,
        })
      : undefined;
    const result = evaluatePluginEntryRuntimeGuard({
      preview: guardPreview,
      entryKey,
      flags: resolvedFlags,
      operation,
      runtimePackageLoad: state
        ? buildRuntimePackageLoadForPreview(guardPreview)
        : runtimePackageLoad,
      permissionDecision: "accepted",
      installMode:
        state?.installMode ?? guardPreview.projection.install.preferredMode,
      runtimeProfile,
      lifecycle: {
        disabled: state?.disabled ?? false,
      },
    });
    setEntryGuardResult(result);
    return result;
  };
  const handleRunEntry = async (
    entryKey: string,
    state?: InstalledPluginState,
  ): Promise<PluginEntryRuntimeGuardResult | undefined> => {
    const runPreview = state ? buildPreviewFromInstalledState(state) : preview;
    const runHost =
      state && hostMode === "adapter"
        ? new AdapterCapabilityHost({
            preview: runPreview,
            realAdapterEnabled: resolvedFlags.realAdapterEnabled,
            store: adapterStore,
          })
        : capabilityHost;
    if (!runHost) {
      return undefined;
    }
    const guardResult = evaluateGuard(entryKey, "run-entry", state);
    if (guardResult.status !== "allow") {
      setRunResult(null);
      setRunError(t(`plugin.lab.guard.summary.${guardResult.status}`));
      return guardResult;
    }
    setIsRunning(true);
    setRunError(null);
    try {
      setRunResult(await runHost.runEntry(entryKey));
      setLastLaunch({ entryKey, operation: "run-entry" });
      return guardResult;
    } catch (error) {
      setRunResult(null);
      setRunError(error instanceof Error ? error.message : String(error));
      return guardResult;
    } finally {
      setIsRunning(false);
    }
  };
  const handleOpenUiEntry = (
    entryKey: string,
    state?: InstalledPluginState,
  ): PluginEntryRuntimeGuardResult | undefined => {
    const mountPreview = state
      ? buildPreviewFromInstalledState(state)
      : preview;
    const mountHost =
      state && resolvedFlags.uiRuntimeEnabled
        ? new UiExtensionHost({ preview: mountPreview, flags: resolvedFlags })
        : uiExtensionHost;
    if (!mountHost) {
      return undefined;
    }
    try {
      const guardResult = evaluateGuard(entryKey, "mount-ui", state);
      if (guardResult.status !== "allow") {
        setUiMountResult(null);
        setUiMountError(t(`plugin.lab.guard.summary.${guardResult.status}`));
        return guardResult;
      }
      setUiMountResult(mountHost.mountEntry(entryKey));
      setLastLaunch({ entryKey, operation: "mount-ui" });
      setUiMountError(null);
      return guardResult;
    } catch (error) {
      setUiMountResult(null);
      setUiMountError(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  };
  const handleManagerLaunchEntry = async (
    entry: ProjectedEntry,
    state: InstalledPluginState,
  ) => {
    if (managerEffectiveDisabled) {
      return;
    }
    const isUiEntry = ["page", "panel", "settings"].includes(entry.kind);
    const guardResult = isUiEntry
      ? handleOpenUiEntry(entry.key, state)
      : await handleRunEntry(entry.key, state);
    setManagerEvidence(
      buildManagerEvidence({
        action: "launch",
        state,
        entryKey: entry.key,
        guardStatus: guardResult?.status,
      }),
    );
  };
  const handleManagerDisabledChange = async (
    disabled: boolean,
    state: InstalledPluginState,
  ) => {
    setManagerDisabled(disabled);
    if (managerRepository) {
      const result = await managerRepository.setDisabled(
        state.appId,
        disabled,
        "2026-05-15T00:00:00.000Z",
      );
      const list = await managerRepository.list();
      setManagerRepositoryStates(list.states);
      setManagerRepositoryIssueCount(list.issues.length + result.issues.length);
      setManagerRepositoryIssues([...list.issues, ...result.issues]);
      if (result.state) {
        setManagerDisabled(result.state.disabled);
      }
    }
    setManagerEvidence(
      buildManagerEvidence({
        action: disabled ? "disable" : "enable",
        state,
        retainedTargetCount: installFlow.review.cleanupTargetCount,
      }),
    );
  };
  const handleManagerUninstallPreview = (
    mode: "keep-data" | "delete-data",
    state: InstalledPluginState,
  ) => {
    const cleanupEvidence = buildPluginCleanupRehearsalEvidence({
      state,
      cleanupPlan: buildPreviewFromInstalledState(state).cleanupPlan,
      strategy: mode,
      generatedAt: "2026-05-15T00:00:00.000Z",
    });
    const residualAudit = buildPluginCleanupResidualAudit({
      state,
      cleanupEvidence,
      repositoryIssues: managerRepositoryIssues,
      generatedAt: "2026-05-15T00:00:00.000Z",
    });
    setManagerEvidence(
      buildManagerEvidence({
        action:
          mode === "keep-data"
            ? "uninstall-keep-data"
            : "uninstall-delete-data",
        state,
        deletedTargetCount: cleanupEvidence.deletedTargetCount,
        retainedTargetCount: cleanupEvidence.retainedTargetCount,
        cleanupEvidence,
        residualAudit,
      }),
    );
  };
  return (
    <main
      className="min-h-full overflow-auto bg-gradient-to-b from-slate-50 via-white to-emerald-50/30 px-6 py-6"
      data-testid="plugin-lab-page"
    >
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                <FlaskConical size={16} />
                {t("plugin.lab.badge")}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                {t("plugin.lab.title")}
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {t("plugin.lab.description")}
              </p>
            </div>
            <div className="min-w-[260px] rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-600">
                  {t("plugin.lab.overview.status")}
                </span>
                <StatusBadge status={preview.readiness.status} />
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">
                    {t("plugin.lab.overview.appId")}
                  </dt>
                  <dd className="font-mono text-xs text-slate-700">
                    {preview.identity.appId}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">
                    {t("plugin.lab.overview.version")}
                  </dt>
                  <dd className="font-mono text-xs text-slate-700">
                    {preview.identity.appVersion}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">
                    {t("plugin.lab.overview.source")}
                  </dt>
                  <dd className="font-mono text-xs text-slate-700">
                    {preview.identity.sourceKind}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-5">
            <SectionCard
              title={t("plugin.lab.installFlow.title")}
              description={t("plugin.lab.installFlow.description")}
              icon={<ClipboardList size={18} />}
            >
              <InstallFlowPanel
                flow={installFlow}
                setupResolved={labSetupResolved}
                onResolveSetup={handleResolveLabSetup}
              />
            </SectionCard>

            <SectionCard
              title={t("plugin.lab.manager.title")}
              description={t("plugin.lab.manager.description")}
              icon={<Layers3 size={18} />}
            >
              <PluginManagerPanel
                flow={installFlow}
                disabled={managerEffectiveDisabled}
                evidence={managerEvidence}
                capabilityHostAvailable={Boolean(capabilityHost)}
                repositoryIssueCount={managerRepositoryIssueCount}
                repositoryStates={managerRepositoryStates}
                selectedAppId={managerSelectedAppId ?? undefined}
                uiRuntimeAvailable={Boolean(uiExtensionHost)}
                onLaunchEntry={handleManagerLaunchEntry}
                onPreviewUninstall={handleManagerUninstallPreview}
                onSelectApp={setManagerSelectedAppId}
                onSetDisabled={handleManagerDisabledChange}
              />
            </SectionCard>

            <SectionCard
              title={t("plugin.lab.package.title")}
              description={t("plugin.lab.package.description")}
              icon={<FileJson size={18} />}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900">
                    {preview.projection.app.displayName}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {preview.projection.app.description}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-600">
                  <p>{preview.identity.packageHash}</p>
                  <p className="mt-2">{preview.identity.manifestHash}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={t("plugin.lab.entries.title")}
              description={t("plugin.lab.entries.description")}
              icon={<Layers3 size={18} />}
            >
              <EntryList
                entries={preview.projection.entries}
                onRunEntry={capabilityHost ? handleRunEntry : undefined}
                onOpenUiEntry={uiExtensionHost ? handleOpenUiEntry : undefined}
              />
            </SectionCard>

            {uiExtensionHost ? (
              <SectionCard
                title={t("plugin.lab.uiRuntime.title")}
                description={t("plugin.lab.uiRuntime.description")}
                icon={<Layers3 size={18} />}
              >
                <UiRuntimePanel result={uiMountResult} error={uiMountError} />
              </SectionCard>
            ) : null}

            {capabilityHost ? (
              <SectionCard
                title={t("plugin.lab.run.adapterTitle")}
                description={t("plugin.lab.run.adapterDescription")}
                icon={<PlayCircle size={18} />}
              >
                <RunResultPanel
                  result={runResult}
                  isRunning={isRunning}
                  error={runError}
                />
              </SectionCard>
            ) : null}

            <SectionCard
              title={t("plugin.lab.capability.title")}
              description={t("plugin.lab.capability.description")}
              icon={<Boxes size={18} />}
            >
              <CapabilityTable preview={preview} />
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard
              title={t("plugin.lab.guard.title")}
              description={t("plugin.lab.guard.description")}
              icon={<ShieldCheck size={18} />}
            >
              <EntryRuntimeGuardPanel result={entryGuardResult} />
            </SectionCard>

            <SectionCard
              title={t("plugin.lab.readiness.title")}
              description={t("plugin.lab.readiness.description")}
              icon={
                preview.readiness.status === "blocked" ? (
                  <ShieldAlert size={18} />
                ) : preview.readiness.status === "degraded" ||
                  preview.readiness.status === "needs-setup" ? (
                  <AlertTriangle size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )
              }
            >
              <IssueList issues={allIssues} />
            </SectionCard>

            <SectionCard
              title={t("plugin.lab.cleanup.title")}
              description={t("plugin.lab.cleanup.description")}
              icon={<Archive size={18} />}
            >
              <CleanupPlanPanel plan={preview.cleanupPlan} />
            </SectionCard>

            <SectionCard
              title={t("plugin.lab.boundary.title")}
              description={t("plugin.lab.boundary.description")}
              icon={<Database size={18} />}
            >
              <ul className="space-y-2 text-sm leading-6 text-slate-600">
                <li>{t("plugin.lab.boundary.noRuntime")}</li>
                <li>{t("plugin.lab.boundary.noRegistry")}</li>
                <li>{t("plugin.lab.boundary.noStorage")}</li>
              </ul>
            </SectionCard>
          </div>
        </div>

        <footer className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm shadow-slate-950/5">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 text-slate-500" size={18} />
            <p>{t("plugin.lab.footer")}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
