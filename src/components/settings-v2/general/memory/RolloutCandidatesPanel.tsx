import type { TFunction } from "i18next";
import type { RolloutCandidateSummary } from "./rolloutCandidates";

interface RolloutCandidatesPanelProps {
  t: TFunction<"settings">;
  candidates: RolloutCandidateSummary[];
  loading: boolean;
  loadFailed: boolean;
  workspaceName: string | null;
  consolidating: boolean;
  onRefresh: () => void;
  onConsolidate: () => void;
}

function panelT(
  t: TFunction<"settings">,
  key: string,
  values: Record<string, string | number | boolean> = {},
): string {
  const translate = t as unknown as (
    key: string,
    values?: Record<string, string | number | boolean>,
  ) => string;
  return String(translate(key, values));
}

export function RolloutCandidatesPanel({
  t,
  candidates,
  loading,
  loadFailed,
  workspaceName,
  consolidating,
  onRefresh,
  onConsolidate,
}: RolloutCandidatesPanelProps) {
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {panelT(t, "settings.memory.store.rolloutTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {loading
              ? panelT(t, "settings.memory.store.rolloutLoading")
              : panelT(t, "settings.memory.store.rolloutCount", {
                  count: candidates.length,
                })}
          </p>
          {workspaceName ? (
            <p className="mt-1 text-xs text-slate-500">
              {panelT(t, "settings.memory.store.rolloutWorkspace", {
                workspace: workspaceName,
              })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || consolidating}
            data-testid="settings-memory-rollout-refresh"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-60"
          >
            {loading
              ? panelT(t, "settings.memory.store.rolloutRefreshing")
              : panelT(t, "settings.memory.store.rolloutRefresh")}
          </button>
          <button
            type="button"
            onClick={onConsolidate}
            disabled={loading || consolidating || candidates.length === 0}
            data-testid="settings-memory-rollout-consolidate"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-60"
          >
            {consolidating
              ? panelT(t, "settings.memory.store.rolloutConsolidating")
              : panelT(t, "settings.memory.store.rolloutConsolidate")}
          </button>
        </div>
      </div>

      {loadFailed ? (
        <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
          {panelT(t, "settings.memory.store.rolloutLoadFailed")}
        </p>
      ) : candidates.length === 0 ? (
        <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
          {panelT(t, "settings.memory.store.rolloutEmpty")}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {candidates.map((candidate) => (
            <RolloutCandidateCard
              key={candidate.path}
              candidate={candidate}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RolloutCandidateCard({
  candidate,
  t,
}: {
  candidate: RolloutCandidateSummary;
  t: TFunction<"settings">;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {candidate.title}
        </p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {candidate.path}
        </p>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {candidate.source ? (
          <RolloutCandidateFact
            label={panelT(t, "settings.memory.store.rolloutSource")}
            value={candidate.source}
          />
        ) : null}
        {candidate.exportedAt ? (
          <RolloutCandidateFact
            label={panelT(t, "settings.memory.store.rolloutExportedAt")}
            value={candidate.exportedAt}
          />
        ) : null}
        {candidate.exportKind ? (
          <RolloutCandidateFact
            label={panelT(t, "settings.memory.store.rolloutExportKind")}
            value={candidate.exportKind}
          />
        ) : null}
        {candidate.exportRoot ? (
          <RolloutCandidateFact
            label={panelT(t, "settings.memory.store.rolloutExportRoot")}
            value={candidate.exportRoot}
          />
        ) : null}
      </dl>

      {candidate.artifacts.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-medium text-slate-500">
            {panelT(t, "settings.memory.store.rolloutArtifacts")}
          </p>
          <ul className="mt-2 space-y-1">
            {candidate.artifacts.map((artifact) => (
              <li
                key={`${candidate.path}:${artifact.path}`}
                className="min-w-0 text-xs text-slate-700"
              >
                <span className="font-medium text-slate-900">
                  {artifact.title}
                </span>
                <span className="text-slate-400"> · </span>
                <span className="break-all text-slate-500">
                  {artifact.path}
                </span>
                {artifact.kind ? (
                  <span className="text-slate-400"> ({artifact.kind})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {candidate.truncated ? (
        <p className="mt-3 text-xs text-amber-700">
          {panelT(t, "settings.memory.store.rolloutTruncated")}
        </p>
      ) : null}
    </div>
  );
}

function RolloutCandidateFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-xs text-slate-800">{value}</dd>
    </div>
  );
}
