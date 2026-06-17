import React from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  readConversationImportRuntimeEvents,
  type ConversationImportRuntimeEventDetail,
  type ConversationImportThreadRuntimeEventsReadResponse,
} from "@/lib/api/conversationImport";
import { cn } from "@/lib/utils";
import {
  buildImportedRuntimeEventDisplay,
  type ImportedRuntimeEventPayloadSummary,
} from "./importedRuntimeEventDetailViewModel";
import {
  createFallbackWorkflowTranslate,
  translateTaskRailText,
} from "./generalWorkbenchTaskRailText";

type TaskRailTranslate = (key: string, options?: Record<string, unknown>) => unknown;

interface ImportedRuntimeEventDetailPanelProps {
  enabled: boolean;
  sessionId?: string | null;
  t?: TaskRailTranslate;
  pageSize?: number;
}

const fallbackTaskRailTranslate = createFallbackWorkflowTranslate();

function taskRailText(
  t: TaskRailTranslate | undefined,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return translateTaskRailText(t ?? fallbackTaskRailTranslate, key, defaultValue, options);
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function payloadSummaryText(
  t: TaskRailTranslate | undefined,
  summary: ImportedRuntimeEventPayloadSummary,
): string {
  switch (summary.kind) {
    case "empty":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.empty",
        "空负载",
      );
    case "record":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.record",
        "{{count}} 个字段",
        { count: summary.fieldCount },
      );
    case "array":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.array",
        "{{count}} 项",
        { count: summary.itemCount },
      );
    case "scalar":
      return summary.length !== undefined
        ? taskRailText(
            t,
            "generalWorkbench.taskRail.importedRuntime.payload.scalarLength",
            "{{type}} · {{count}} 字符",
            { type: summary.valueType, count: summary.length },
          )
        : taskRailText(
            t,
            "generalWorkbench.taskRail.importedRuntime.payload.scalar",
            "{{type}}",
            { type: summary.valueType },
          );
  }
}

function mergeEvents(
  current: ConversationImportRuntimeEventDetail[],
  incoming: ConversationImportRuntimeEventDetail[],
): ConversationImportRuntimeEventDetail[] {
  const seen = new Set(
    current.map((event) =>
      [
        event.sourceEventIndex,
        event.turnIndex,
        event.eventIndex,
        event.eventType,
      ].join(":"),
    ),
  );
  const merged = [...current];
  for (const event of incoming) {
    const key = [
      event.sourceEventIndex,
      event.turnIndex,
      event.eventIndex,
      event.eventType,
    ].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(event);
    }
  }
  return merged;
}

export function ImportedRuntimeEventDetailPanel({
  enabled,
  sessionId,
  t,
  pageSize = 50,
}: ImportedRuntimeEventDetailPanelProps) {
  const normalizedSessionId = sessionId?.trim() || null;
  const [expanded, setExpanded] = React.useState(false);
  const [events, setEvents] = React.useState<ConversationImportRuntimeEventDetail[]>([]);
  const [summary, setSummary] =
    React.useState<ConversationImportThreadRuntimeEventsReadResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    setExpanded(false);
    setEvents([]);
    setSummary(null);
    setLoading(false);
    setError(null);
    requestIdRef.current += 1;
  }, [normalizedSessionId, enabled]);

  const loadPage = React.useCallback(
    async (offset: number) => {
      if (!enabled || !normalizedSessionId) {
        return;
      }
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const response = await readConversationImportRuntimeEvents({
          sessionId: normalizedSessionId,
          offset,
          limit: pageSize,
        });
        if (requestId !== requestIdRef.current) {
          return;
        }
        setSummary(response);
        setEvents((current) => mergeEvents(current, response.events));
      } catch (readError) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setError(extractErrorMessage(readError));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled, normalizedSessionId, pageSize],
  );

  React.useEffect(() => {
    if (expanded && events.length === 0 && !summary && !loading && !error) {
      void loadPage(0);
    }
  }, [error, events.length, expanded, loadPage, loading, summary]);

  if (!enabled || !normalizedSessionId) {
    return null;
  }

  const totalEvents = summary?.totalEvents ?? 0;
  const materializedEvents = summary?.materializedRuntimeEvents ?? 0;
  const sidecarEvents = summary?.sidecarRuntimeEvents ?? 0;
  const nextOffset = summary?.nextOffset ?? null;
  const visibleEvents = events.map((event) => buildImportedRuntimeEventDisplay(event));

  return (
    <div
      className="mt-2 rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-muted)] p-2.5"
      data-testid="imported-runtime-detail-panel"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-xl px-1 text-left text-[11px] font-medium text-[color:var(--lime-text)] transition hover:text-[color:var(--lime-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        data-testid="imported-runtime-detail-toggle"
      >
        <span>
          {taskRailText(
            t,
            expanded
              ? "generalWorkbench.taskRail.importedRuntime.close"
              : "generalWorkbench.taskRail.importedRuntime.open",
            expanded ? "收起完整记录" : "查看完整记录",
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>

      {expanded ? (
        <div className="mt-2 space-y-2" data-testid="imported-runtime-detail-body">
          <div className="text-[11px] leading-5 text-[color:var(--lime-text-muted)]">
            {summary
              ? taskRailText(
                  t,
                  "generalWorkbench.taskRail.importedRuntime.summary",
                  "已默认展示 {{materialized}} / {{total}} 条，完整记录保留 {{sidecar}} 条",
                  {
                    materialized: materializedEvents,
                    total: totalEvents,
                    sidecar: sidecarEvents,
                  },
                )
              : taskRailText(
                  t,
                  "generalWorkbench.taskRail.importedRuntime.title",
                  "完整运行记录",
                )}
          </div>

          {error ? (
            <div
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] leading-5 text-rose-700"
              data-testid="imported-runtime-detail-error"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {taskRailText(
                  t,
                  "generalWorkbench.taskRail.importedRuntime.error",
                  "完整记录读取失败",
                )}
                {error ? `：${error}` : ""}
              </span>
            </div>
          ) : null}

          {visibleEvents.length > 0 ? (
            <div
              className="max-h-72 space-y-2 overflow-y-auto pr-1"
              data-testid="imported-runtime-detail-events"
            >
              {visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2.5 py-2"
                  data-testid="imported-runtime-detail-event"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] font-semibold text-[color:var(--lime-text-strong)]">
                      {event.eventTypeLabel}
                    </span>
                    <span className="shrink-0 text-[10px] text-[color:var(--lime-text-muted)]">
                      {taskRailText(
                        t,
                        "generalWorkbench.taskRail.importedRuntime.eventMeta",
                        "轮次 {{turn}} · 事件 {{event}}",
                        {
                          turn: event.turnNumber,
                          event: event.eventNumber,
                        },
                      )}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-[color:var(--lime-text-muted)]">
                    {payloadSummaryText(t, event.payloadSummary)}
                    {" · #"}
                    {event.sourceEventNumber}
                  </div>
                  <pre
                    className={cn(
                      "mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950/5 px-2 py-1.5 text-[10px] leading-4 text-[color:var(--lime-text-muted)]",
                      event.payloadPreviewTruncated &&
                        "border border-amber-200 bg-amber-50 text-amber-800",
                    )}
                    data-testid="imported-runtime-detail-event-payload"
                  >
                    {event.payloadPreview}
                  </pre>
                </div>
              ))}
            </div>
          ) : null}

          {loading ? (
            <div
              className="flex items-center gap-2 text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
              data-testid="imported-runtime-detail-loading"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>
                {taskRailText(
                  t,
                  "generalWorkbench.taskRail.importedRuntime.loading",
                  "正在读取完整记录",
                )}
              </span>
            </div>
          ) : null}

          {!loading && !error && summary && visibleEvents.length === 0 ? (
            <div
              className="text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
              data-testid="imported-runtime-detail-empty"
            >
              {taskRailText(
                t,
                "generalWorkbench.taskRail.importedRuntime.empty",
                "暂无更多记录",
              )}
            </div>
          ) : null}

          {nextOffset !== null ? (
            <button
              type="button"
              className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              onClick={() => void loadPage(nextOffset)}
              data-testid="imported-runtime-detail-load-more"
            >
              {taskRailText(
                t,
                "generalWorkbench.taskRail.importedRuntime.loadMore",
                "加载更多",
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
