import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { InMemoryAgentAppCapabilityStore } from "../adapters/InMemoryAgentAppCapabilityStore";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { resolveAgentAppHostFlags } from "../featureFlag";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import {
  buildAgentAppLabResolvedSetupState,
  evaluateAgentAppLabInstallFlow,
  type AgentAppLabInstallFlowResult,
  type AgentAppLabInstallFlowStage,
} from "../install/labInstallFlow";
import { buildCleanupPlan } from "../install/cleanupPlan";
import { buildAgentAppCleanupRehearsalEvidence } from "../install/cleanupRehearsalEvidence";
import { buildAgentAppCleanupResidualAudit } from "../install/cleanupResidualAudit";
import {
  BrowserLocalStorageAgentAppPersistenceDriver,
  buildInstalledAgentAppState,
  LocalInstalledAgentAppStateRepository,
  type InstalledAgentAppStatePersistenceIssue,
} from "../install/installedAppState";
import { buildPackageIdentity } from "../install/packageIdentity";
import { buildAgentAppPackageCacheEntry } from "../install/packageCache";
import {
  runContentFactoryDemo,
  type ContentFactoryDemoResult,
} from "../runtime/contentFactoryDemo";
import {
  evaluateAgentAppEntryRuntimeGuard,
  type AgentAppEntryRuntimeGuardOperation,
  type AgentAppEntryRuntimeGuardResult,
} from "../runtime/entryRuntimeGuard";
import { loadRuntimePackageDescriptor } from "../runtime/runtimePackageLoader";
import { WorkflowRuntimeHost } from "../runtime/workflowRuntimeHost";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import { UiExtensionHost } from "../runtime/uiExtensionHost";
import { buildUiRuntimeCapabilityProfile } from "../runtime/uiRuntimeCapabilityProfile";
import { buildLimeRuntimeProfileForPreview } from "../runtime-profile";
import type { CapabilityHost } from "../sdk/CapabilityHost";
import type {
  AgentAppHostFlags,
  AgentAppRunResult,
  AgentAppUiMountResult,
  AppManifest,
  AppCleanupPlan,
  CleanupTarget,
  InstalledAppPreview,
  InstalledAgentAppState,
  ProjectedEntry,
  ReadinessIssue,
  ReadinessStatus,
} from "../types";
import {
  type AgentAppManagerEvidenceAction,
  type AgentAppManagerEvidenceSummary,
} from "./agentAppManagerStatus";
import { AgentAppManagerPanel } from "./AgentAppManagerPanel";

interface AgentAppLabPageProps {
  flags?: Partial<AgentAppHostFlags>;
}

type CapabilityHostMode = "adapter";

const LAB_INSTALL_FLOW_STAGES: AgentAppLabInstallFlowStage[] = [
  "source-selected",
  "package-reviewed",
  "package-verified",
  "installed",
  "setup-review",
  "permission-review",
  "launched",
  "cleanup-preview",
];

function buildManagerCompanionFixture(): AppManifest {
  const base = contentFactoryFixture as AppManifest;
  return {
    ...base,
    name: "content-factory-playbook-app",
    displayName: "内容策略复盘 App",
    description:
      "P16-H 本地多 App repository fixture，用于验证 Manager list、选中态和生命周期边界。",
    storage: {
      ...(base.storage ?? {}),
      namespace: "content-factory-playbook-app",
      retention: base.storage?.retention ?? "ask",
    },
    entries: base.entries.map((entry) => ({ ...entry })),
  };
}

function buildPreviewFromInstalledState(
  state: InstalledAgentAppState,
): InstalledAppPreview {
  return {
    identity: state.identity,
    manifest: state.manifest,
    projection: state.projection,
    readiness: state.readiness,
    cleanupPlan: buildCleanupPlan({
      projection: state.projection,
      generatedAt: state.updatedAt,
    }),
  };
}

function buildRuntimePackageLoadForPreview(preview: InstalledAppPreview) {
  const cacheEntry = buildAgentAppPackageCacheEntry({
    identity: preview.identity,
    manifestSnapshot: preview.manifest,
    actualPackageHash: preview.identity.packageHash,
    actualManifestHash: preview.identity.manifestHash,
    cachedAt: "2026-05-15T00:00:00.000Z",
  });
  return loadRuntimePackageDescriptor({
    cacheEntry,
    identity: preview.identity,
    projection: preview.projection,
  });
}

function readinessTone(status: ReadinessStatus): string {
  if (status === "ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "degraded") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "needs-setup") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function StatusBadge({ status }: { status: ReadinessStatus }) {
  const { t } = useTranslation("agent");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${readinessTone(
        status,
      )}`}
      data-testid={`agent-app-readiness-${status}`}
    >
      {t(`agentApp.lab.status.${status}`)}
    </span>
  );
}

function guardTone(status: AgentAppEntryRuntimeGuardResult["status"]): string {
  if (status === "allow") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "needs-setup") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "denied") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function GuardStatusBadge({
  status,
}: {
  status: AgentAppEntryRuntimeGuardResult["status"];
}) {
  const { t } = useTranslation("agent");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${guardTone(
        status,
      )}`}
      data-testid={`agent-app-entry-runtime-guard-${status}`}
    >
      {t(`agentApp.lab.guard.status.${status}`)}
    </span>
  );
}

function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function installFlowTone(
  status: AgentAppLabInstallFlowResult["status"],
): string {
  if (status === "launched" || status === "cleanup-preview") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (
    status === "needs-setup" ||
    status === "permission-review" ||
    status === "setup-review"
  ) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "permission-denied") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (
    status === "package-invalid" ||
    status === "package-mismatch" ||
    status === "runtime-blocked" ||
    status === "cleanup-required"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function InstallFlowPanel({
  flow,
  setupResolved,
  onResolveSetup,
}: {
  flow: AgentAppLabInstallFlowResult;
  setupResolved: boolean;
  onResolveSetup: () => void;
}) {
  const { t } = useTranslation("agent");
  const completed = new Set(flow.completedStages);
  return (
    <div className="space-y-4" data-testid="agent-app-install-flow">
      <div className={`rounded-2xl border p-4 ${installFlowTone(flow.status)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {t(`agentApp.lab.installFlow.status.${flow.status}`)}
            </p>
            <p className="mt-1 text-xs font-mono">
              {flow.review.sourceKind}:{flow.review.appId}@
              {flow.review.appVersion}
            </p>
          </div>
          <span className="rounded-full border border-white/70 bg-white/70 px-2 py-1 text-xs font-medium">
            {t("agentApp.lab.installFlow.cleanupTargets", {
              count: flow.review.cleanupTargetCount,
            })}
          </span>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        {LAB_INSTALL_FLOW_STAGES.map((stage) => {
          const isCompleted = completed.has(stage);
          return (
            <div
              key={stage}
              className={`rounded-2xl border px-3 py-2 text-xs ${
                isCompleted
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
              data-testid={`agent-app-install-flow-stage-${stage}`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} />
                <span>{t(`agentApp.lab.installFlow.stage.${stage}`)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.installFlow.packageIdentity")}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-600">
            {flow.review.packageHash}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-500">
            {flow.review.manifestHash}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.installFlow.setup")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {setupResolved
              ? t("agentApp.lab.installFlow.setupResolved")
              : t("agentApp.lab.installFlow.setupPending", {
                  count: flow.review.requiredSetupCount,
                })}
          </p>
          {!setupResolved ? (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50"
              data-testid="agent-app-lab-resolve-setup"
              onClick={onResolveSetup}
            >
              <ShieldCheck size={14} />
              {t("agentApp.lab.installFlow.setupAction")}
            </button>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.installFlow.permission")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("agentApp.lab.installFlow.permissionCount", {
              count: flow.review.requestedPermissionCount,
            })}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {flow.canLaunch
              ? t("agentApp.lab.installFlow.launchReady")
              : t("agentApp.lab.installFlow.launchBlocked")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.installFlow.keepData")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("agentApp.lab.installFlow.uninstallCounts", {
              deleted: flow.uninstallPreview.keepData.deletedTargetCount,
              retained: flow.uninstallPreview.keepData.retainedTargetCount,
            })}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.installFlow.deleteData")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("agentApp.lab.installFlow.uninstallCounts", {
              deleted: flow.uninstallPreview.deleteData.deletedTargetCount,
              retained: flow.uninstallPreview.deleteData.retainedTargetCount,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function EntryList({
  entries,
  onRunEntry,
  onOpenUiEntry,
}: {
  entries: ProjectedEntry[];
  onRunEntry?: (entryKey: string) => void;
  onOpenUiEntry?: (entryKey: string) => void;
}) {
  const { t } = useTranslation("agent");
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {entries.map((entry) => (
        <article
          key={entry.key}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          data-testid="agent-app-entry-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-slate-950">{entry.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{entry.key}</p>
            </div>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
              {entry.kind}
            </span>
          </div>
          {entry.description ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {entry.description}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              {t("agentApp.lab.entry.labOnly")}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              {t("agentApp.lab.entry.capabilities", {
                count: entry.requiredCapabilities.length,
              })}
            </span>
          </div>
          {onRunEntry ? (
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              data-testid={`agent-app-run-entry-${entry.key}`}
              onClick={() => onRunEntry(entry.key)}
            >
              <PlayCircle size={14} />
              {t("agentApp.lab.run.adapterAction")}
            </button>
          ) : null}
          {onOpenUiEntry &&
          ["page", "panel", "settings"].includes(entry.kind) ? (
            <button
              type="button"
              className="ml-2 mt-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50"
              data-testid={`agent-app-open-ui-entry-${entry.key}`}
              onClick={() => onOpenUiEntry(entry.key)}
            >
              <Layers3 size={14} />
              {t("agentApp.lab.uiRuntime.open")}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function IssueList({ issues }: { issues: ReadinessIssue[] }) {
  const { t } = useTranslation("agent");
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        {t("agentApp.lab.readiness.noIssues")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue, index) => (
        <div
          key={`${issue.code}:${issue.capability ?? "app"}:${issue.entryKey ?? "global"}:${index}`}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          data-testid="agent-app-readiness-issue"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-1 text-xs font-medium ${
                issue.severity === "blocker"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {issue.severity === "blocker"
                ? t("agentApp.lab.readiness.blocker")
                : t("agentApp.lab.readiness.warning")}
            </span>
            <span className="font-mono text-xs text-slate-500">
              {issue.code}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {issue.message}
          </p>
          {issue.capability ? (
            <p className="mt-1 font-mono text-xs text-slate-500">
              {issue.capability}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function EntryRuntimeGuardPanel({
  result,
}: {
  result: AgentAppEntryRuntimeGuardResult | null;
}) {
  const { t } = useTranslation("agent");
  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {t("agentApp.lab.guard.empty")}
      </div>
    );
  }

  const prompt = result.prompt;
  return (
    <div
      className="space-y-3"
      data-testid="agent-app-entry-runtime-guard-result"
    >
      <div className={`rounded-2xl border p-4 ${guardTone(result.status)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <GuardStatusBadge status={result.status} />
          <span className="font-mono text-xs">
            {prompt?.entryKey ?? result.provenance.entryKey}
          </span>
        </div>
        <p className="mt-2 text-sm">
          {t(`agentApp.lab.guard.summary.${result.status}`)}
        </p>
      </div>

      {prompt ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">
              {t("agentApp.lab.guard.capabilities")}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {t("agentApp.lab.guard.capabilityCount", {
                count: prompt.requestedCapabilities.length,
              })}
            </p>
            <p className="mt-2 font-mono text-xs text-slate-500">
              {prompt.requestedCapabilities
                .map((capability) => capability.capability)
                .join(" / ")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">
              {t("agentApp.lab.guard.policy")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                {t("agentApp.lab.guard.rawApiBlocked")}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                {t("agentApp.lab.guard.networkBlocked")}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                {t("agentApp.lab.guard.fileSystemBlocked")}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {prompt?.setupSummary.length ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-semibold text-sky-900">
            {t("agentApp.lab.guard.setup")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {prompt.setupSummary.slice(0, 8).map((item) => (
              <span
                key={`${item.kind}:${item.key}`}
                className="rounded-full border border-sky-200 bg-white px-2 py-1 font-mono text-xs text-sky-700"
              >
                {item.kind}:{item.key}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {result.blockers.length || result.warnings.length ? (
        <div className="space-y-2">
          {[...result.blockers, ...result.warnings]
            .slice(0, 5)
            .map((issue, index) => (
              <div
                key={`${issue.code}:${issue.entryKey ?? "app"}:${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-medium ${
                      issue.severity === "blocker"
                        ? "border-rose-200 bg-white text-rose-700"
                        : "border-amber-200 bg-white text-amber-700"
                    }`}
                  >
                    {issue.severity === "blocker"
                      ? t("agentApp.lab.readiness.blocker")
                      : t("agentApp.lab.readiness.warning")}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {issue.code}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {issue.message}
                </p>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function CleanupTargets({
  title,
  targets,
}: {
  title: string;
  targets: CleanupTarget[];
}) {
  const { t } = useTranslation("agent");
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
          {t("agentApp.lab.cleanup.targetCount", { count: targets.length })}
        </span>
      </div>
      {targets.length ? (
        <div className="space-y-2">
          {targets.map((target) => (
            <div
              key={`${target.kind}:${target.value}`}
              className="rounded-xl bg-white px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {target.kind}
                </span>
                <span className="font-mono text-xs text-slate-700">
                  {target.value}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{target.reason}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {t("agentApp.lab.cleanup.empty")}
        </p>
      )}
    </div>
  );
}

function CleanupPlanPanel({ plan }: { plan: AppCleanupPlan }) {
  const { t } = useTranslation("agent");
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <CleanupTargets
        title={t("agentApp.lab.cleanup.package")}
        targets={[
          ...plan.installedStatePaths,
          ...plan.packageCachePaths,
          ...plan.packageCacheIndexPaths,
          ...plan.packageStagingPaths,
        ]}
      />
      <CleanupTargets
        title={t("agentApp.lab.cleanup.projection")}
        targets={[
          ...plan.projectionPaths,
          ...plan.readinessPaths,
          ...plan.setupStatePaths,
        ]}
      />
      <CleanupTargets
        title={t("agentApp.lab.cleanup.storage")}
        targets={plan.storageNamespaces}
      />
      <CleanupTargets
        title={t("agentApp.lab.cleanup.logs")}
        targets={plan.logPaths}
      />
    </div>
  );
}

function RunResultPanel({
  result,
  isRunning,
  error,
}: {
  result: AgentAppRunResult | null;
  isRunning: boolean;
  error: string | null;
}) {
  const { t } = useTranslation("agent");
  if (isRunning) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        {t("agentApp.lab.run.running")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {t("agentApp.lab.run.empty")}
      </div>
    );
  }

  const artifact = result.artifacts[0];
  const evidence = result.evidence[0];
  const task = result.tasks[0];
  const knowledge = result.knowledge[0];
  return (
    <div className="space-y-3" data-testid="agent-app-run-result">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-emerald-700">
            {result.run.status}
          </span>
          <span className="font-mono text-xs text-emerald-700">
            {result.run.runId}
          </span>
        </div>
        <p className="mt-2 text-sm text-emerald-700">
          {t("agentApp.lab.run.success")}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {t("agentApp.lab.run.artifact")}
        </p>
        <p className="mt-2 font-mono text-xs text-slate-600">{artifact.id}</p>
        <p className="mt-2 text-sm text-slate-600">{artifact.title}</p>
        <p className="mt-2 font-mono text-xs text-slate-500">
          {artifact.provenance.sourceKind}:{artifact.provenance.appId}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {t("agentApp.lab.run.evidence")}
        </p>
        <p className="mt-2 font-mono text-xs text-slate-600">{evidence.id}</p>
        <p className="mt-2 text-sm text-slate-600">{evidence.message}</p>
      </div>
      {task ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.run.task")}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-600">{task.taskId}</p>
          <p className="mt-2 text-sm text-slate-600">{task.status}</p>
        </div>
      ) : null}
      {knowledge ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.run.knowledge")}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-600">
            {knowledge.query}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {knowledge.records.map((record) => record.bindingKey).join(" / ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function UiRuntimePanel({
  result,
  error,
}: {
  result: AgentAppUiMountResult | null;
  error: string | null;
}) {
  const { t } = useTranslation("agent");
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {t("agentApp.lab.uiRuntime.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="agent-app-ui-runtime-result">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-sky-700">
            {result.entryKind}
          </span>
          <span className="font-mono text-xs text-sky-700">{result.appId}</span>
          <span className="font-mono text-xs text-sky-700">
            {result.entryKey}
          </span>
        </div>
        <p className="mt-2 text-sm text-sky-700">
          {t("agentApp.lab.uiRuntime.mounted")}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.uiRuntime.bundle")}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-600">
            {result.bundlePath}
          </p>
          {result.route ? (
            <p className="mt-2 font-mono text-xs text-slate-500">
              {result.route}
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("agentApp.lab.uiRuntime.sdkBridge")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("agentApp.lab.uiRuntime.allowedCapabilities", {
              count: result.sdkBridge.allowedCapabilities.length,
            })}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-500">
            {result.sdkBridge.allowedCapabilities.join(" / ")}
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {t("agentApp.lab.uiRuntime.sandbox")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
            {t("agentApp.lab.uiRuntime.rawApiBlocked")}
          </span>
          <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
            {t("agentApp.lab.uiRuntime.networkBlocked")}
          </span>
          <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-amber-700">
            {t("agentApp.lab.uiRuntime.workerStillDisabled")}
          </span>
        </div>
      </div>
    </div>
  );
}

function ContentFactoryDemoPanel({
  result,
  isRunning,
  error,
  workflowRuntimeEnabled,
  onRun,
}: {
  result: ContentFactoryDemoResult | null;
  isRunning: boolean;
  error: string | null;
  workflowRuntimeEnabled: boolean;
  onRun: () => void;
}) {
  const { t } = useTranslation("agent");
  return (
    <div className="space-y-3">
      {workflowRuntimeEnabled ? (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm leading-6 text-cyan-800">
          {t("agentApp.lab.workflowRuntime.enabledHint")}
        </div>
      ) : null}

      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="agent-app-run-content-demo"
        disabled={isRunning}
        onClick={onRun}
      >
        <PlayCircle size={14} />
        {isRunning
          ? t("agentApp.lab.contentDemo.running")
          : t("agentApp.lab.contentDemo.action")}
      </button>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!result && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {t("agentApp.lab.contentDemo.empty")}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3" data-testid="agent-app-content-demo-result">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-emerald-700">
                {result.project.status}
              </span>
              <span className="font-mono text-xs text-emerald-700">
                {result.project.projectId}
              </span>
            </div>
            <p className="mt-2 text-sm text-emerald-700">
              {t("agentApp.lab.contentDemo.completed")}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {t("agentApp.lab.contentDemo.scenarios")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {result.scenarios.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {t("agentApp.lab.contentDemo.assets")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {result.contentAssets.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {t("agentApp.lab.contentDemo.storage")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {result.storageEntries.length}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">
              {t("agentApp.lab.contentDemo.artifact")}
            </p>
            <p className="mt-2 font-mono text-xs text-slate-600">
              {result.artifact.id}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {result.artifact.title}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">
              {t("agentApp.lab.contentDemo.evidence")}
            </p>
            <p className="mt-2 font-mono text-xs text-slate-600">
              {result.evidence.id}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {result.evidence.message}
            </p>
          </div>
          {result.workflowRun ? (
            <div
              className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4"
              data-testid="agent-app-workflow-runtime-result"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-cyan-700">
                  {result.workflowRun.status}
                </span>
                <span className="font-mono text-xs text-cyan-700">
                  {result.workflowRun.workflowKey}
                </span>
              </div>
              <p className="mt-2 text-sm text-cyan-800">
                {t("agentApp.lab.workflowRuntime.completed")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-cyan-200 bg-white px-2 py-1 text-cyan-700">
                  {t("agentApp.lab.workflowRuntime.traceCount", {
                    count: result.workflowRun.trace.length,
                  })}
                </span>
                <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                  {t("agentApp.lab.workflowRuntime.rawWorkerBlocked")}
                </span>
                <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                  {t("agentApp.lab.workflowRuntime.networkBlocked")}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {result.workflowRun.trace
                  .filter(
                    (event) => event.stepId && event.status === "succeeded",
                  )
                  .slice(0, 6)
                  .map((event) => (
                    <div
                      key={`${event.stepId}:${event.status}`}
                      className="rounded-xl bg-white px-3 py-2"
                    >
                      <p className="font-mono text-xs text-cyan-800">
                        {event.stepId}
                      </p>
                      <p className="mt-1 text-xs text-cyan-700">
                        {event.message}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CapabilityTable({ preview }: { preview: InstalledAppPreview }) {
  const { t } = useTranslation("agent");
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">
              {t("agentApp.lab.capability.name")}
            </th>
            <th className="px-4 py-3 font-medium">
              {t("agentApp.lab.capability.range")}
            </th>
            <th className="px-4 py-3 font-medium">
              {t("agentApp.lab.capability.source")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {preview.projection.requiredCapabilities.map((requirement) => (
            <tr
              key={`${requirement.capability}:${requirement.entryKey ?? "app"}`}
            >
              <td className="px-4 py-3 font-mono text-xs text-slate-700">
                {requirement.capability}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {requirement.requestedRange}
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">
                {requirement.declaredBy.join(" / ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgentAppLabPage({ flags }: AgentAppLabPageProps = {}) {
  const { t } = useTranslation("agent");
  const resolvedFlags = useMemo(() => resolveAgentAppHostFlags(flags), [flags]);
  const [runResult, setRunResult] = useState<AgentAppRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [uiMountResult, setUiMountResult] =
    useState<AgentAppUiMountResult | null>(null);
  const [uiMountError, setUiMountError] = useState<string | null>(null);
  const [entryGuardResult, setEntryGuardResult] =
    useState<AgentAppEntryRuntimeGuardResult | null>(null);
  const [contentDemoResult, setContentDemoResult] =
    useState<ContentFactoryDemoResult | null>(null);
  const [contentDemoError, setContentDemoError] = useState<string | null>(null);
  const [isContentDemoRunning, setIsContentDemoRunning] = useState(false);
  const [labSetupResolved, setLabSetupResolved] = useState(false);
  const [managerDisabled, setManagerDisabled] = useState(false);
  const [managerEvidence, setManagerEvidence] =
    useState<AgentAppManagerEvidenceSummary | null>(null);
  const [managerRepositoryStates, setManagerRepositoryStates] = useState<
    InstalledAgentAppState[]
  >([]);
  const [managerRepositoryIssueCount, setManagerRepositoryIssueCount] =
    useState(0);
  const [managerRepositoryIssues, setManagerRepositoryIssues] = useState<
    InstalledAgentAppStatePersistenceIssue[]
  >([]);
  const [managerRepositorySeedKey, setManagerRepositorySeedKey] = useState<
    string | null
  >(null);
  const [managerSelectedAppId, setManagerSelectedAppId] = useState<
    string | null
  >(null);
  const [lastLaunch, setLastLaunch] = useState<{
    entryKey: string;
    operation: AgentAppEntryRuntimeGuardOperation;
  } | null>(null);
  const managerRepository = useMemo(() => {
    try {
      return new LocalInstalledAgentAppStateRepository({
        driver: new BrowserLocalStorageAgentAppPersistenceDriver({
          keyPrefix: "lime.agent-app.lab.persistence:",
        }),
      });
    } catch {
      return null;
    }
  }, []);
  const adapterStore = useMemo(() => new InMemoryAgentAppCapabilityStore(), []);
  const hostMode: CapabilityHostMode | null = resolvedFlags.realAdapterEnabled
    ? "adapter"
    : null;
  const capabilityProfile = useMemo(() => {
    if (resolvedFlags.workerRuntimeEnabled) {
      return buildWorkflowRuntimeCapabilityProfile(resolvedFlags);
    }
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
        profile: capabilityProfile,
        loadedAt: "2026-05-15T00:00:00.000Z",
        checkedAt: "2026-05-15T00:00:00.000Z",
        generatedAt: "2026-05-15T00:00:00.000Z",
      }),
    [capabilityProfile],
  );
  const labSetup = useMemo(
    () =>
      labSetupResolved
        ? buildAgentAppLabResolvedSetupState(setupPreview.projection)
        : undefined,
    [labSetupResolved, setupPreview],
  );
  const preview = useMemo(
    () =>
      buildInstalledAppPreview({
        setup: labSetup,
        profile: capabilityProfile,
        loadedAt: "2026-05-15T00:00:00.000Z",
        checkedAt: "2026-05-15T00:00:00.000Z",
        generatedAt: "2026-05-15T00:00:00.000Z",
      }),
    [capabilityProfile, labSetup],
  );
  const managerCompanionFixture = useMemo(
    () => buildManagerCompanionFixture(),
    [],
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
  const workflowRuntimeHost = useMemo(
    () =>
      resolvedFlags.workerRuntimeEnabled && capabilityHost
        ? new WorkflowRuntimeHost({
            host: capabilityHost,
            flags: resolvedFlags,
          })
        : null,
    [capabilityHost, resolvedFlags],
  );
  const installFlow = useMemo(
    () =>
      evaluateAgentAppLabInstallFlow({
        preview,
        setup: labSetup,
        flags: resolvedFlags,
        entryKey: lastLaunch?.entryKey ?? "dashboard",
        operation: lastLaunch?.operation ?? "mount-ui",
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
    [capabilityProfile, labSetup, lastLaunch, preview, resolvedFlags],
  );
  const managerCompanionInstalledState = useMemo(
    () =>
      buildInstalledAgentAppState({
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
        (state): state is InstalledAgentAppState => Boolean(state),
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
    setContentDemoResult(null);
    setContentDemoError(null);
    setManagerDisabled(false);
    setManagerEvidence(null);
    setManagerRepositoryIssues([]);
    setManagerRepositorySeedKey(null);
    setManagerSelectedAppId(null);
  };
  const buildManagerEvidence = (params: {
    action: AgentAppManagerEvidenceAction;
    state?: InstalledAgentAppState;
    entryKey?: string;
    guardStatus?: AgentAppEntryRuntimeGuardResult["status"];
    deletedTargetCount?: number;
    retainedTargetCount?: number;
    cleanupEvidence?: AgentAppManagerEvidenceSummary["cleanupEvidence"];
    residualAudit?: AgentAppManagerEvidenceSummary["residualAudit"];
  }): AgentAppManagerEvidenceSummary => {
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
    operation: AgentAppEntryRuntimeGuardOperation,
    state?: InstalledAgentAppState,
  ): AgentAppEntryRuntimeGuardResult => {
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
    const result = evaluateAgentAppEntryRuntimeGuard({
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
    state?: InstalledAgentAppState,
  ): Promise<AgentAppEntryRuntimeGuardResult | undefined> => {
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
      setRunError(t(`agentApp.lab.guard.summary.${guardResult.status}`));
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
    state?: InstalledAgentAppState,
  ): AgentAppEntryRuntimeGuardResult | undefined => {
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
        setUiMountError(t(`agentApp.lab.guard.summary.${guardResult.status}`));
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
    state: InstalledAgentAppState,
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
    state: InstalledAgentAppState,
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
    state: InstalledAgentAppState,
  ) => {
    const cleanupEvidence = buildAgentAppCleanupRehearsalEvidence({
      state,
      cleanupPlan: buildPreviewFromInstalledState(state).cleanupPlan,
      strategy: mode,
      generatedAt: "2026-05-15T00:00:00.000Z",
    });
    const residualAudit = buildAgentAppCleanupResidualAudit({
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
  const handleRunContentDemo = async () => {
    if (!capabilityHost || hostMode !== "adapter") {
      return;
    }
    const guardResult = evaluateGuard(
      "content_scenario_planning",
      "run-content-demo",
    );
    if (guardResult.status !== "allow") {
      setContentDemoResult(null);
      setContentDemoError(
        t(`agentApp.lab.guard.summary.${guardResult.status}`),
      );
      return;
    }
    setIsContentDemoRunning(true);
    setContentDemoError(null);
    try {
      setContentDemoResult(
        await runContentFactoryDemo({
          host: capabilityHost,
          workflowRuntime: workflowRuntimeHost ?? undefined,
        }),
      );
      setLastLaunch({
        entryKey: "content_scenario_planning",
        operation: "run-content-demo",
      });
    } catch (error) {
      setContentDemoResult(null);
      setContentDemoError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsContentDemoRunning(false);
    }
  };

  return (
    <main
      className="min-h-full overflow-auto bg-gradient-to-b from-slate-50 via-white to-emerald-50/30 px-6 py-6"
      data-testid="agent-app-lab-page"
    >
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                <FlaskConical size={16} />
                {t("agentApp.lab.badge")}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                {t("agentApp.lab.title")}
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {t("agentApp.lab.description")}
              </p>
            </div>
            <div className="min-w-[260px] rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-600">
                  {t("agentApp.lab.overview.status")}
                </span>
                <StatusBadge status={preview.readiness.status} />
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">
                    {t("agentApp.lab.overview.appId")}
                  </dt>
                  <dd className="font-mono text-xs text-slate-700">
                    {preview.identity.appId}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">
                    {t("agentApp.lab.overview.version")}
                  </dt>
                  <dd className="font-mono text-xs text-slate-700">
                    {preview.identity.appVersion}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">
                    {t("agentApp.lab.overview.source")}
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
              title={t("agentApp.lab.installFlow.title")}
              description={t("agentApp.lab.installFlow.description")}
              icon={<ClipboardList size={18} />}
            >
              <InstallFlowPanel
                flow={installFlow}
                setupResolved={labSetupResolved}
                onResolveSetup={handleResolveLabSetup}
              />
            </SectionCard>

            <SectionCard
              title={t("agentApp.lab.manager.title")}
              description={t("agentApp.lab.manager.description")}
              icon={<Layers3 size={18} />}
            >
              <AgentAppManagerPanel
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
              title={t("agentApp.lab.package.title")}
              description={t("agentApp.lab.package.description")}
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
              title={t("agentApp.lab.entries.title")}
              description={t("agentApp.lab.entries.description")}
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
                title={t("agentApp.lab.uiRuntime.title")}
                description={t("agentApp.lab.uiRuntime.description")}
                icon={<Layers3 size={18} />}
              >
                <UiRuntimePanel result={uiMountResult} error={uiMountError} />
              </SectionCard>
            ) : null}

            {capabilityHost ? (
              <SectionCard
                title={t("agentApp.lab.run.adapterTitle")}
                description={t("agentApp.lab.run.adapterDescription")}
                icon={<PlayCircle size={18} />}
              >
                <RunResultPanel
                  result={runResult}
                  isRunning={isRunning}
                  error={runError}
                />
              </SectionCard>
            ) : null}

            {capabilityHost && hostMode === "adapter" ? (
              <SectionCard
                title={t("agentApp.lab.contentDemo.title")}
                description={t("agentApp.lab.contentDemo.description")}
                icon={<Database size={18} />}
              >
                <ContentFactoryDemoPanel
                  result={contentDemoResult}
                  isRunning={isContentDemoRunning}
                  error={contentDemoError}
                  workflowRuntimeEnabled={Boolean(workflowRuntimeHost)}
                  onRun={handleRunContentDemo}
                />
              </SectionCard>
            ) : null}

            <SectionCard
              title={t("agentApp.lab.capability.title")}
              description={t("agentApp.lab.capability.description")}
              icon={<Boxes size={18} />}
            >
              <CapabilityTable preview={preview} />
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard
              title={t("agentApp.lab.guard.title")}
              description={t("agentApp.lab.guard.description")}
              icon={<ShieldCheck size={18} />}
            >
              <EntryRuntimeGuardPanel result={entryGuardResult} />
            </SectionCard>

            <SectionCard
              title={t("agentApp.lab.readiness.title")}
              description={t("agentApp.lab.readiness.description")}
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
              title={t("agentApp.lab.cleanup.title")}
              description={t("agentApp.lab.cleanup.description")}
              icon={<Archive size={18} />}
            >
              <CleanupPlanPanel plan={preview.cleanupPlan} />
            </SectionCard>

            <SectionCard
              title={t("agentApp.lab.boundary.title")}
              description={t("agentApp.lab.boundary.description")}
              icon={<Database size={18} />}
            >
              <ul className="space-y-2 text-sm leading-6 text-slate-600">
                <li>{t("agentApp.lab.boundary.noRuntime")}</li>
                <li>{t("agentApp.lab.boundary.noRegistry")}</li>
                <li>{t("agentApp.lab.boundary.noStorage")}</li>
              </ul>
            </SectionCard>
          </div>
        </div>

        <footer className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm shadow-slate-950/5">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 text-slate-500" size={18} />
            <p>{t("agentApp.lab.footer")}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
