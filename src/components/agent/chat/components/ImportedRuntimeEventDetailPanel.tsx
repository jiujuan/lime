import React from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  readConversationImportRuntimeEvents,
  type ConversationImportRuntimeEventDetail,
  type ConversationImportThreadRuntimeEventsReadResponse,
} from "@/lib/api/conversationImport";
import { cn } from "@/lib/utils";
import {
  buildImportedRuntimeEventDisplay,
  type ImportedRuntimeEventDisplay,
  type ImportedRuntimeEventLocalizedText,
  type ImportedRuntimeEventPayloadSummary,
  type ImportedRuntimeEventStatusDisplay,
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

function localizedRuntimeText(
  t: TaskRailTranslate | undefined,
  text: ImportedRuntimeEventLocalizedText,
): string {
  return taskRailText(t, text.key, text.defaultValue);
}

function statusText(
  t: TaskRailTranslate | undefined,
  status: ImportedRuntimeEventStatusDisplay,
): string {
  return taskRailText(t, status.key, status.defaultValue);
}

function statusClassName(status: ImportedRuntimeEventStatusDisplay) {
  return cn(
    "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-4",
    status.tone === "running" && "border-sky-200 bg-sky-50 text-sky-700",
    status.tone === "completed" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    status.tone === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
    status.tone === "muted" &&
      "border-[color:var(--lime-surface-border)] bg-white text-[color:var(--lime-text-muted)]",
  );
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
    case "scalar": {
      const typeLabel = payloadTypeLabel(t, summary.valueType);
      return summary.length !== undefined
        ? taskRailText(
            t,
            "generalWorkbench.taskRail.importedRuntime.payload.scalarLength",
            "{{type}} · {{count}} 字符",
            { type: typeLabel, count: summary.length },
          )
        : taskRailText(
            t,
            "generalWorkbench.taskRail.importedRuntime.payload.scalar",
            "{{type}}",
            { type: typeLabel },
          );
    }
  }
}

function payloadTypeLabel(
  t: TaskRailTranslate | undefined,
  valueType: string,
): string {
  switch (valueType) {
    case "string":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.type.string",
        "文本",
      );
    case "number":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.type.number",
        "数字",
      );
    case "boolean":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.type.boolean",
        "布尔值",
      );
    case "bigint":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.type.bigint",
        "大整数",
      );
    case "symbol":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.type.symbol",
        "符号",
      );
    case "function":
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.type.function",
        "函数",
      );
    default:
      return taskRailText(
        t,
        "generalWorkbench.taskRail.importedRuntime.payload.type.value",
        "值",
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
  merged.sort((left, right) =>
    left.sourceEventIndex !== right.sourceEventIndex
      ? left.sourceEventIndex - right.sourceEventIndex
      : left.turnIndex !== right.turnIndex
        ? left.turnIndex - right.turnIndex
        : left.eventIndex !== right.eventIndex
          ? left.eventIndex - right.eventIndex
          : left.eventType.localeCompare(right.eventType),
  );
  return merged;
}

function ImportedRuntimeEventCard({
  event,
  t,
}: {
  event: ImportedRuntimeEventDisplay;
  t?: TaskRailTranslate;
}) {
  return (
    <div
      className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2.5 py-2"
      data-testid="imported-runtime-detail-event"
      data-event-kind={event.kind}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[11px] font-semibold text-[color:var(--lime-text-strong)]">
              {localizedRuntimeText(t, event.title)}
            </span>
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] leading-4 text-[color:var(--lime-text-muted)]">
              {event.eventTypeLabel}
            </span>
          </div>
          {event.description ? (
            <div
              className="mt-1 line-clamp-2 text-[10px] leading-4 text-[color:var(--lime-text-muted)]"
              title={event.description}
            >
              {event.description}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {event.status ? (
            <span className={statusClassName(event.status)}>
              {statusText(t, event.status)}
            </span>
          ) : null}
          <span className="text-[10px] text-[color:var(--lime-text-muted)]">
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
      </div>

      {event.facts.length > 0 ? (
        <div
          className="mt-1.5 flex flex-wrap gap-1"
          data-testid="imported-runtime-detail-event-facts"
        >
          {event.facts.map((fact) => (
            <span
              key={`${fact.id}:${fact.value}`}
              className="max-w-full rounded-md border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-muted)] px-1.5 py-0.5 text-[10px] leading-4 text-[color:var(--lime-text-muted)]"
              title={`${localizedRuntimeText(t, fact.label)}：${fact.value}`}
            >
              <span className="text-[color:var(--lime-text-faint)]">
                {localizedRuntimeText(t, fact.label)}
              </span>
              <span className="mx-1 text-[color:var(--lime-text-faint)]">
                ·
              </span>
              <span className="break-all">{fact.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-1.5 text-[10px] text-[color:var(--lime-text-muted)]">
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
  );
}

export function ImportedRuntimeEventDetailPanel({
  enabled,
  sessionId,
  t,
  pageSize = 10,
}: ImportedRuntimeEventDetailPanelProps) {
  const { t: agentT } = useTranslation("agent");
  const effectiveT: TaskRailTranslate =
    t ?? ((key, options) => agentT(key, options));
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

  const sourceRuntimeEvents = summary?.sourceRuntimeEvents ?? summary?.totalEvents ?? 0;
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
            effectiveT,
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
                  effectiveT,
                  "generalWorkbench.taskRail.importedRuntime.summary",
                  "已默认展示 {{materialized}} / {{total}} 条，完整记录保留 {{sidecar}} 条",
                  {
                    materialized: materializedEvents,
                    total: sourceRuntimeEvents,
                    sidecar: sidecarEvents,
                  },
                )
              : taskRailText(
                  effectiveT,
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
                  effectiveT,
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
                <ImportedRuntimeEventCard
                  key={event.id}
                  event={event}
                  t={effectiveT}
                />
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
                  effectiveT,
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
                effectiveT,
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
                effectiveT,
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
