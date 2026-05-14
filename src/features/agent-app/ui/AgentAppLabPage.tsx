import { useMemo, type ReactNode } from "react";
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
  ShieldAlert,
} from "lucide-react";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import type {
  AppCleanupPlan,
  CleanupTarget,
  InstalledAppPreview,
  ProjectedEntry,
  ReadinessIssue,
  ReadinessStatus,
} from "../types";

function readinessTone(status: ReadinessStatus): string {
  if (status === "ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "degraded") {
    return "border-amber-200 bg-amber-50 text-amber-700";
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

function EntryList({ entries }: { entries: ProjectedEntry[] }) {
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
            <p className="mt-3 text-sm leading-6 text-slate-600">{entry.description}</p>
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
            <span className="font-mono text-xs text-slate-500">{issue.code}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{issue.message}</p>
          {issue.capability ? (
            <p className="mt-1 font-mono text-xs text-slate-500">{issue.capability}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CleanupTargets({ title, targets }: { title: string; targets: CleanupTarget[] }) {
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
            <div key={`${target.kind}:${target.value}`} className="rounded-xl bg-white px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {target.kind}
                </span>
                <span className="font-mono text-xs text-slate-700">{target.value}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{target.reason}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("agentApp.lab.cleanup.empty")}</p>
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
        targets={plan.packageCachePaths}
      />
      <CleanupTargets
        title={t("agentApp.lab.cleanup.projection")}
        targets={[...plan.projectionPaths, ...plan.readinessPaths]}
      />
      <CleanupTargets
        title={t("agentApp.lab.cleanup.storage")}
        targets={plan.storageNamespaces}
      />
      <CleanupTargets title={t("agentApp.lab.cleanup.logs")} targets={plan.logPaths} />
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
            <th className="px-4 py-3 font-medium">{t("agentApp.lab.capability.name")}</th>
            <th className="px-4 py-3 font-medium">{t("agentApp.lab.capability.range")}</th>
            <th className="px-4 py-3 font-medium">{t("agentApp.lab.capability.source")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {preview.projection.requiredCapabilities.map((requirement) => (
            <tr key={`${requirement.capability}:${requirement.entryKey ?? "app"}`}>
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

export function AgentAppLabPage() {
  const { t } = useTranslation("agent");
  const preview = useMemo(
    () =>
      buildInstalledAppPreview({
        loadedAt: "2026-05-15T00:00:00.000Z",
        checkedAt: "2026-05-15T00:00:00.000Z",
        generatedAt: "2026-05-15T00:00:00.000Z",
      }),
    [],
  );
  const allIssues = [...preview.readiness.blockers, ...preview.readiness.warnings];

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
                  <dt className="text-slate-500">{t("agentApp.lab.overview.appId")}</dt>
                  <dd className="font-mono text-xs text-slate-700">{preview.identity.appId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t("agentApp.lab.overview.version")}</dt>
                  <dd className="font-mono text-xs text-slate-700">
                    {preview.identity.appVersion}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t("agentApp.lab.overview.source")}</dt>
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
              <EntryList entries={preview.projection.entries} />
            </SectionCard>

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
              title={t("agentApp.lab.readiness.title")}
              description={t("agentApp.lab.readiness.description")}
              icon={
                preview.readiness.status === "blocked" ? (
                  <ShieldAlert size={18} />
                ) : preview.readiness.status === "degraded" ? (
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
