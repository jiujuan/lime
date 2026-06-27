import { History, RefreshCw } from "lucide-react";
import type {
  PluginHistorySessionCandidate,
  PluginHistorySessionSelectionModel,
} from "./history/pluginHistorySessionSelection";

export interface PluginMarketplaceHistorySessionPanelProps {
  model: PluginHistorySessionSelectionModel | null;
  loading: boolean;
  error: string | null;
  pending: boolean;
  onOpenSession: (candidate: PluginHistorySessionCandidate) => void;
  onRefresh: () => void;
  t: (key: string, options?: Record<string, string | number>) => string;
}

function formatUpdatedAt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  return new Date(value).toLocaleString();
}

export function PluginMarketplaceHistorySessionPanel({
  error,
  loading,
  model,
  onOpenSession,
  onRefresh,
  pending,
  t,
}: PluginMarketplaceHistorySessionPanelProps) {
  if (!model) {
    return null;
  }

  return (
    <section
      className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4"
      data-testid="plugin-marketplace-history-session-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-sky-900">
            <History className="size-4" aria-hidden="true" />
            {t("plugin.marketplace.historySelection.title")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-sky-800">
            {t("plugin.marketplace.historySelection.description", {
              plugin: model.pluginLabel,
            })}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-sky-200 bg-white px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="plugin-marketplace-history-session-refresh"
          disabled={loading || pending}
          onClick={onRefresh}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {loading
            ? t("plugin.marketplace.historySelection.loading")
            : t("plugin.marketplace.historySelection.refresh")}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm font-medium text-sky-800">
          {t("plugin.marketplace.historySelection.loading")}
        </p>
      ) : model.candidates.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {model.candidates.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              className="grid gap-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`plugin-marketplace-history-session-${candidate.sessionId}`}
              disabled={pending}
              onClick={() => onOpenSession(candidate)}
            >
              <span className="truncate text-sm font-semibold text-slate-900">
                {candidate.title}
              </span>
              <span className="text-xs text-slate-500">
                {t("plugin.marketplace.historySelection.sessionMeta", {
                  count: candidate.messagesCount,
                  updatedAt: formatUpdatedAt(candidate.updatedAt),
                })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-sky-800">
          {t("plugin.marketplace.historySelection.empty")}
        </p>
      )}
    </section>
  );
}
