import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Layers3, PlayCircle, ShieldCheck } from "lucide-react";
import type {
  PluginLabInstallFlowResult,
  PluginLabInstallFlowStage,
} from "../install/labInstallFlow";
import type { PluginEntryRuntimeGuardResult } from "../runtime/entryRuntimeGuard";
import type {
  AppCleanupPlan,
  CleanupTarget,
  PluginRunResult,
  PluginUiMountResult,
  ProjectedEntry,
  ReadinessIssue,
  ReadinessStatus,
} from "../types";

const LAB_INSTALL_FLOW_STAGES: PluginLabInstallFlowStage[] = [
  "source-selected",
  "package-reviewed",
  "package-verified",
  "installed",
  "setup-review",
  "permission-review",
  "launched",
  "cleanup-preview",
];

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

export function StatusBadge({ status }: { status: ReadinessStatus }) {
  const { t } = useTranslation("agent");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${readinessTone(
        status,
      )}`}
      data-testid={`plugin-readiness-${status}`}
    >
      {t(`plugin.lab.status.${status}`)}
    </span>
  );
}

function guardTone(status: PluginEntryRuntimeGuardResult["status"]): string {
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
  status: PluginEntryRuntimeGuardResult["status"];
}) {
  const { t } = useTranslation("agent");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${guardTone(
        status,
      )}`}
      data-testid={`plugin-entry-runtime-guard-${status}`}
    >
      {t(`plugin.lab.guard.status.${status}`)}
    </span>
  );
}

export function SectionCard({
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
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function installFlowTone(
  status: PluginLabInstallFlowResult["status"],
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

export function InstallFlowPanel({
  flow,
  setupResolved,
  onResolveSetup,
}: {
  flow: PluginLabInstallFlowResult;
  setupResolved: boolean;
  onResolveSetup: () => void;
}) {
  const { t } = useTranslation("agent");
  const completed = new Set(flow.completedStages);
  return (
    <div className="space-y-4" data-testid="plugin-install-flow">
      <div className={`rounded-2xl border p-4 ${installFlowTone(flow.status)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {t(`plugin.lab.installFlow.status.${flow.status}`)}
            </p>
            <p className="mt-1 text-xs font-mono">
              {flow.review.sourceKind}:{flow.review.appId}@
              {flow.review.appVersion}
            </p>
          </div>
          <span className="rounded-full border border-white/70 bg-white/70 px-2 py-1 text-xs font-medium">
            {t("plugin.lab.installFlow.cleanupTargets", {
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
              data-testid={`plugin-install-flow-stage-${stage}`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} />
                <span>{t(`plugin.lab.installFlow.stage.${stage}`)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.installFlow.packageIdentity")}
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
            {t("plugin.lab.installFlow.setup")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {setupResolved
              ? t("plugin.lab.installFlow.setupResolved")
              : t("plugin.lab.installFlow.setupPending", {
                  count: flow.review.requiredSetupCount,
                })}
          </p>
          {!setupResolved ? (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50"
              data-testid="plugin-lab-resolve-setup"
              onClick={onResolveSetup}
            >
              <ShieldCheck size={14} />
              {t("plugin.lab.installFlow.setupAction")}
            </button>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.installFlow.permission")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("plugin.lab.installFlow.permissionCount", {
              count: flow.review.requestedPermissionCount,
            })}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {flow.canLaunch
              ? t("plugin.lab.installFlow.launchReady")
              : t("plugin.lab.installFlow.launchBlocked")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.installFlow.keepData")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("plugin.lab.installFlow.uninstallCounts", {
              deleted: flow.uninstallPreview.keepData.deletedTargetCount,
              retained: flow.uninstallPreview.keepData.retainedTargetCount,
            })}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.installFlow.deleteData")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("plugin.lab.installFlow.uninstallCounts", {
              deleted: flow.uninstallPreview.deleteData.deletedTargetCount,
              retained: flow.uninstallPreview.deleteData.retainedTargetCount,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EntryList({
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
          data-testid="plugin-entry-card"
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
              {t("plugin.lab.entry.labOnly")}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              {t("plugin.lab.entry.capabilities", {
                count: entry.requiredCapabilities.length,
              })}
            </span>
          </div>
          {onRunEntry ? (
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              data-testid={`plugin-run-entry-${entry.key}`}
              onClick={() => onRunEntry(entry.key)}
            >
              <PlayCircle size={14} />
              {t("plugin.lab.run.adapterAction")}
            </button>
          ) : null}
          {onOpenUiEntry &&
          ["page", "panel", "settings"].includes(entry.kind) ? (
            <button
              type="button"
              className="ml-2 mt-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50"
              data-testid={`plugin-open-ui-entry-${entry.key}`}
              onClick={() => onOpenUiEntry(entry.key)}
            >
              <Layers3 size={14} />
              {t("plugin.lab.uiRuntime.open")}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function IssueList({ issues }: { issues: ReadinessIssue[] }) {
  const { t } = useTranslation("agent");
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        {t("plugin.lab.readiness.noIssues")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue, index) => (
        <div
          key={`${issue.code}:${issue.capability ?? "app"}:${issue.entryKey ?? "global"}:${index}`}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          data-testid="plugin-readiness-issue"
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
                ? t("plugin.lab.readiness.blocker")
                : t("plugin.lab.readiness.warning")}
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

export function EntryRuntimeGuardPanel({
  result,
}: {
  result: PluginEntryRuntimeGuardResult | null;
}) {
  const { t } = useTranslation("agent");
  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {t("plugin.lab.guard.empty")}
      </div>
    );
  }

  const prompt = result.prompt;
  return (
    <div
      className="space-y-3"
      data-testid="plugin-entry-runtime-guard-result"
    >
      <div className={`rounded-2xl border p-4 ${guardTone(result.status)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <GuardStatusBadge status={result.status} />
          <span className="font-mono text-xs">
            {prompt?.entryKey ?? result.provenance.entryKey}
          </span>
        </div>
        <p className="mt-2 text-sm">
          {t(`plugin.lab.guard.summary.${result.status}`)}
        </p>
      </div>

      {prompt ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">
              {t("plugin.lab.guard.capabilities")}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {t("plugin.lab.guard.capabilityCount", {
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
              {t("plugin.lab.guard.policy")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                {t("plugin.lab.guard.rawApiBlocked")}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                {t("plugin.lab.guard.networkBlocked")}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                {t("plugin.lab.guard.fileSystemBlocked")}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {prompt?.setupSummary.length ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-semibold text-sky-900">
            {t("plugin.lab.guard.setup")}
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
                      ? t("plugin.lab.readiness.blocker")
                      : t("plugin.lab.readiness.warning")}
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
          {t("plugin.lab.cleanup.targetCount", { count: targets.length })}
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
          {t("plugin.lab.cleanup.empty")}
        </p>
      )}
    </div>
  );
}

export function CleanupPlanPanel({ plan }: { plan: AppCleanupPlan }) {
  const { t } = useTranslation("agent");
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <CleanupTargets
        title={t("plugin.lab.cleanup.package")}
        targets={[
          ...plan.installedStatePaths,
          ...plan.packageCachePaths,
          ...plan.packageCacheIndexPaths,
          ...plan.packageStagingPaths,
        ]}
      />
      <CleanupTargets
        title={t("plugin.lab.cleanup.projection")}
        targets={[
          ...plan.projectionPaths,
          ...plan.readinessPaths,
          ...plan.setupStatePaths,
        ]}
      />
      <CleanupTargets
        title={t("plugin.lab.cleanup.storage")}
        targets={plan.storageNamespaces}
      />
      <CleanupTargets
        title={t("plugin.lab.cleanup.logs")}
        targets={plan.logPaths}
      />
    </div>
  );
}

export function RunResultPanel({
  result,
  isRunning,
  error,
}: {
  result: PluginRunResult | null;
  isRunning: boolean;
  error: string | null;
}) {
  const { t } = useTranslation("agent");
  if (isRunning) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        {t("plugin.lab.run.running")}
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
        {t("plugin.lab.run.empty")}
      </div>
    );
  }

  const artifact = result.artifacts[0];
  const evidence = result.evidence[0];
  const task = result.tasks[0];
  const knowledge = result.knowledge[0];
  return (
    <div className="space-y-3" data-testid="plugin-run-result">
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
          {t("plugin.lab.run.success")}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {t("plugin.lab.run.artifact")}
        </p>
        <p className="mt-2 font-mono text-xs text-slate-600">{artifact.id}</p>
        <p className="mt-2 text-sm text-slate-600">{artifact.title}</p>
        <p className="mt-2 font-mono text-xs text-slate-500">
          {artifact.provenance.sourceKind}:{artifact.provenance.appId}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {t("plugin.lab.run.evidence")}
        </p>
        <p className="mt-2 font-mono text-xs text-slate-600">{evidence.id}</p>
        <p className="mt-2 text-sm text-slate-600">{evidence.message}</p>
      </div>
      {task ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.run.task")}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-600">
            {task.taskId}
          </p>
          <p className="mt-2 text-sm text-slate-600">{task.status}</p>
        </div>
      ) : null}
      {knowledge ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.run.knowledge")}
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

export function UiRuntimePanel({
  result,
  error,
}: {
  result: PluginUiMountResult | null;
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
        {t("plugin.lab.uiRuntime.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="plugin-ui-runtime-result">
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
          {t("plugin.lab.uiRuntime.mounted")}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.uiRuntime.bundle")}
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
            {t("plugin.lab.uiRuntime.sdkBridge")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("plugin.lab.uiRuntime.allowedCapabilities", {
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
          {t("plugin.lab.uiRuntime.sandbox")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
            {t("plugin.lab.uiRuntime.rawApiBlocked")}
          </span>
          <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
            {t("plugin.lab.uiRuntime.networkBlocked")}
          </span>
          <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-amber-700">
            {t("plugin.lab.uiRuntime.workerStillDisabled")}
          </span>
        </div>
      </div>
    </div>
  );
}
