import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clawTraceSpanKey,
  clawTraceTimelineRowKey,
  filterClawTraceTimelineRows,
  filterClawTraceTimelineRowsBySpan,
  findClawTraceSpanByKey,
  type ClawTraceTimelineFilter,
  type ClawTraceTimelinePhase,
  type ClawTraceTimelineProjection,
} from "@/lib/trace/clawTraceTimeline";

interface ClawTraceTimelineViewProps {
  projection: ClawTraceTimelineProjection;
}

const TRACE_TIMELINE_FILTERS: ClawTraceTimelineFilter[] = [
  "all",
  "provider_api",
  "app_server",
  "renderer",
  "terminal",
  "slow",
];

function formatMs(value: number | null): string {
  if (value === null) {
    return "0";
  }
  return String(Math.max(0, Math.round(value)));
}

function phaseKey(phase: ClawTraceTimelinePhase): string {
  switch (phase) {
    case "provider_api":
      return "settings.developer.debugSwitch.clawTrace.timeline.phase.providerApi";
    case "app_server":
      return "settings.developer.debugSwitch.clawTrace.timeline.phase.appServer";
    case "renderer":
      return "settings.developer.debugSwitch.clawTrace.timeline.phase.renderer";
    case "terminal":
      return "settings.developer.debugSwitch.clawTrace.timeline.phase.terminal";
    case "other":
      return "settings.developer.debugSwitch.clawTrace.timeline.phase.other";
  }
}

function filterLabelKey(filter: ClawTraceTimelineFilter): string {
  switch (filter) {
    case "all":
      return "settings.developer.debugSwitch.clawTrace.timeline.filter.all";
    case "slow":
      return "settings.developer.debugSwitch.clawTrace.timeline.filter.slow";
    default:
      return phaseKey(filter);
  }
}

export function ClawTraceTimelineView({
  projection,
}: ClawTraceTimelineViewProps) {
  const { t } = useTranslation("settings");
  const [timelineFilter, setTimelineFilter] =
    useState<ClawTraceTimelineFilter>("all");
  const [selectedSpanKey, setSelectedSpanKey] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(
    projection.timeline[0]
      ? clawTraceTimelineRowKey(projection.timeline[0])
      : null,
  );

  const selectedSpan = useMemo(
    () => findClawTraceSpanByKey(projection, selectedSpanKey),
    [projection, selectedSpanKey],
  );
  const filteredRows = useMemo(() => {
    if (selectedSpan) {
      return filterClawTraceTimelineRowsBySpan(projection, selectedSpan);
    }
    return filterClawTraceTimelineRows(projection, timelineFilter);
  }, [projection, selectedSpan, timelineFilter]);
  const selectedRow = useMemo(() => {
    return (
      filteredRows.find(
        (row) => clawTraceTimelineRowKey(row) === selectedRowKey,
      ) ??
      filteredRows[0] ??
      null
    );
  }, [filteredRows, selectedRowKey]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-900">
          {t("settings.developer.debugSwitch.clawTrace.timeline.title")}
        </p>
        <p className="text-xs font-medium text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.timeline.overview", {
            durationMs: formatMs(projection.root_duration_ms),
            eventCount: projection.event_count,
            redactionMode: projection.redaction_mode,
          })}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.timeline.spansTitle")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {projection.spans.map((span) => (
            <button
              key={clawTraceSpanKey(span)}
              type="button"
              aria-pressed={
                selectedSpan
                  ? clawTraceSpanKey(selectedSpan) === clawTraceSpanKey(span)
                  : false
              }
              data-testid={`claw-trace-span-${span.phase}`}
              className={
                selectedSpan &&
                clawTraceSpanKey(selectedSpan) === clawTraceSpanKey(span)
                  ? "rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left shadow-sm shadow-sky-950/5"
                  : "rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-200 hover:bg-white"
              }
              onClick={() => {
                const spanRows = filterClawTraceTimelineRowsBySpan(
                  projection,
                  span,
                );
                setSelectedSpanKey(clawTraceSpanKey(span));
                setTimelineFilter(span.phase);
                setSelectedRowKey(
                  spanRows[0] ? clawTraceTimelineRowKey(spanRows[0]) : null,
                );
              }}
            >
              <p className="text-xs font-semibold text-slate-800">
                {t(phaseKey(span.phase))}
              </p>
              <p className="text-xs text-slate-500">
                {t(
                  "settings.developer.debugSwitch.clawTrace.timeline.spanMeta",
                  {
                    endMs: formatMs(span.end_offset_ms),
                    eventCount: span.event_count,
                    startMs: formatMs(span.start_offset_ms),
                  },
                )}
              </p>
            </button>
          ))}
        </div>
      </div>

      {projection.slow_segments.length > 0 ||
      projection.phase_gaps.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t(
              "settings.developer.debugSwitch.clawTrace.timeline.diagnosticsTitle",
            )}
          </p>
          <div className="space-y-2">
            {projection.slow_segments.map((segment) => (
              <div
                key={`${segment.from_checkpoint}:${segment.to_checkpoint}`}
                className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2"
              >
                <p className="text-xs font-semibold text-amber-900">
                  {t(
                    "settings.developer.debugSwitch.clawTrace.timeline.slowSegmentMeta",
                    {
                      durationMs: formatMs(segment.duration_ms),
                      endMs: formatMs(segment.end_offset_ms),
                      phase: t(phaseKey(segment.phase)),
                      startMs: formatMs(segment.start_offset_ms),
                    },
                  )}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {segment.from_checkpoint}
                  {" -> "}
                  {segment.to_checkpoint}
                </p>
              </div>
            ))}
            {projection.phase_gaps.map((gap) => (
              <div
                key={gap.phase}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <p className="text-xs font-semibold text-slate-800">
                  {t(
                    "settings.developer.debugSwitch.clawTrace.timeline.phaseGapMissing",
                    {
                      phase: t(phaseKey(gap.phase)),
                    },
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.timeline.eventsTitle")}
        </p>
        <div className="flex flex-wrap gap-2">
          {TRACE_TIMELINE_FILTERS.map((filter) => {
            const count = filterClawTraceTimelineRows(
              projection,
              filter,
            ).length;
            const active = timelineFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                data-testid={`claw-trace-filter-${filter}`}
                className={
                  active
                    ? "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                }
                onClick={() => {
                  const nextRows = filterClawTraceTimelineRows(
                    projection,
                    filter,
                  );
                  setSelectedSpanKey(null);
                  setTimelineFilter(filter);
                  setSelectedRowKey(
                    nextRows[0] ? clawTraceTimelineRowKey(nextRows[0]) : null,
                  );
                }}
              >
                {t(filterLabelKey(filter))}
                <span className="ml-1 text-[11px] opacity-75">
                  {t(
                    "settings.developer.debugSwitch.clawTrace.timeline.filter.count",
                    { count },
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div
            className="max-h-64 space-y-2 overflow-auto pr-1"
            data-testid="claw-trace-timeline-events"
          >
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => {
                const rowKey = clawTraceTimelineRowKey(row);
                const selected =
                  selectedRow &&
                  clawTraceTimelineRowKey(selectedRow) === rowKey;
                return (
                  <button
                    key={rowKey}
                    type="button"
                    className={
                      selected
                        ? "w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left"
                        : "w-full rounded-xl border border-slate-100 px-3 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
                    }
                    onClick={() => setSelectedRowKey(rowKey)}
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold text-slate-900">
                        {row.checkpoint}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.delta_ms === null
                          ? t(
                              "settings.developer.debugSwitch.clawTrace.timeline.eventMetaStart",
                              {
                                offsetMs: formatMs(row.offset_ms),
                              },
                            )
                          : t(
                              "settings.developer.debugSwitch.clawTrace.timeline.eventMeta",
                              {
                                deltaMs: formatMs(row.delta_ms),
                                offsetMs: formatMs(row.offset_ms),
                              },
                            )}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {t(phaseKey(row.phase))}
                      {" · "}
                      {row.event_type}
                    </p>
                    {row.metrics.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.metrics.map((metric) => (
                          <span
                            key={`${row.seq}:${metric.key}`}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                          >
                            {metric.key}={metric.value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                {t(
                  "settings.developer.debugSwitch.clawTrace.timeline.filter.empty",
                )}
              </div>
            )}
          </div>
          <div
            className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
            data-testid="claw-trace-timeline-detail"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t(
                "settings.developer.debugSwitch.clawTrace.timeline.detail.title",
              )}
            </p>
            {selectedRow ? (
              <div className="mt-2 space-y-2 text-xs text-slate-600">
                {selectedSpan ? (
                  <div
                    className="rounded-lg border border-sky-100 bg-white px-2.5 py-2"
                    data-testid="claw-trace-selected-span"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      {t(
                        "settings.developer.debugSwitch.clawTrace.timeline.spanDetail.title",
                      )}
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {t(phaseKey(selectedSpan.phase))}
                      {" · "}
                      {formatMs(selectedSpan.duration_ms)}
                      {" ms"}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {t(
                        "settings.developer.debugSwitch.clawTrace.timeline.spanMeta",
                        {
                          endMs: formatMs(selectedSpan.end_offset_ms),
                          eventCount: selectedSpan.event_count,
                          startMs: formatMs(selectedSpan.start_offset_ms),
                        },
                      )}
                    </p>
                  </div>
                ) : null}
                <p className="font-semibold text-slate-900">
                  {selectedRow.checkpoint}
                </p>
                <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-2 gap-y-1">
                  <dt>
                    {t(
                      "settings.developer.debugSwitch.clawTrace.timeline.detail.phase",
                    )}
                  </dt>
                  <dd className="font-medium text-slate-800">
                    {t(phaseKey(selectedRow.phase))}
                  </dd>
                  <dt>
                    {t(
                      "settings.developer.debugSwitch.clawTrace.timeline.detail.seq",
                    )}
                  </dt>
                  <dd>{selectedRow.seq}</dd>
                  <dt>
                    {t(
                      "settings.developer.debugSwitch.clawTrace.timeline.detail.eventType",
                    )}
                  </dt>
                  <dd className="break-all">{selectedRow.event_type}</dd>
                  <dt>
                    {t(
                      "settings.developer.debugSwitch.clawTrace.timeline.detail.offset",
                    )}
                  </dt>
                  <dd>
                    {formatMs(selectedRow.offset_ms)}
                    {" ms"}
                  </dd>
                  <dt>
                    {t(
                      "settings.developer.debugSwitch.clawTrace.timeline.detail.delta",
                    )}
                  </dt>
                  <dd>
                    {selectedRow.delta_ms === null
                      ? t(
                          "settings.developer.debugSwitch.clawTrace.timeline.detail.start",
                        )
                      : `${formatMs(selectedRow.delta_ms)} ms`}
                  </dd>
                </dl>
                <div className="space-y-1">
                  <p className="font-semibold text-slate-700">
                    {t(
                      "settings.developer.debugSwitch.clawTrace.timeline.detail.metrics",
                    )}
                  </p>
                  {selectedRow.metrics.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedRow.metrics.map((metric) => (
                        <span
                          key={`${selectedRow.seq}:${metric.key}`}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
                        >
                          {metric.key}={metric.value}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500">
                      {t(
                        "settings.developer.debugSwitch.clawTrace.timeline.detail.noMetrics",
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {t(
                  "settings.developer.debugSwitch.clawTrace.timeline.detail.empty",
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
