import { describe, expect, it } from "vitest";
import type {
  DiagnosticsTraceEvent,
  DiagnosticsTraceReadResult,
} from "@/lib/api/serverRuntime";
import { projectClawTraceTimeline } from "./clawTraceTimeline";
import {
  projectClawTraceAppServerComparison,
  selectClawTraceAppServerComparisonWindow,
} from "./clawTraceAppServerComparison";

const redaction = {
  mode: "summary_only",
  raw_agent_event_payload: false,
  prompt_text: false,
  provider_payload: false,
};

function event(
  seq: number,
  checkpoint: string,
  wallTimeUnixMs: number,
  metrics: Record<string, unknown> = {},
): DiagnosticsTraceEvent {
  return {
    checkpoint,
    event_id: `evt-${seq}`,
    event_sequence: seq,
    event_type: checkpoint,
    metrics,
    redaction,
    schema_version: 1,
    seq,
    session_id: "session-a",
    trace_id: "trace-a",
    wall_time_unix_ms: wallTimeUnixMs,
  };
}

function timeline(
  traceId: string,
  offsets: {
    appServerDelta?: number;
    firstEvent?: number;
    firstText?: number;
    terminal?: number;
  },
) {
  const base = 1_000_000_000;
  const events: DiagnosticsTraceEvent[] = [
    event(1, "provider.request.started", base, {
      raw_provider_payload: { should: "drop" },
    }),
  ];
  if (typeof offsets.firstEvent === "number") {
    events.push(
      event(2, "provider.first_event.received", base + offsets.firstEvent),
    );
  }
  if (typeof offsets.firstText === "number") {
    events.push(
      event(3, "provider.first_text_delta.received", base + offsets.firstText),
    );
  }
  if (typeof offsets.appServerDelta === "number") {
    events.push(
      event(
        4,
        "app_server.message_delta.emitted",
        base + offsets.appServerDelta,
      ),
    );
  }
  if (typeof offsets.terminal === "number") {
    events.push(event(5, "app_server.turn.terminal", base + offsets.terminal));
  }

  const result: DiagnosticsTraceReadResult = {
    available: true,
    events: events.map((item) => ({ ...item, trace_id: traceId })),
    redaction,
    trace: {
      event_count: events.length,
      path: `sessions/session_session-a/trace_${traceId}.jsonl`,
      session_id: "session-a",
      size_bytes: 128,
      trace_id: traceId,
    },
  };
  return projectClawTraceTimeline(result);
}

describe("clawTraceAppServerComparison", () => {
  it("应对最近和上一条 summary-only App Server trace 做分段对比", () => {
    const comparison = projectClawTraceAppServerComparison({
      baseline: timeline("trace-baseline", {
        appServerDelta: 110,
        firstEvent: 40,
        firstText: 100,
        terminal: 160,
      }),
      current: timeline("trace-current", {
        appServerDelta: 210,
        firstEvent: 70,
        firstText: 180,
        terminal: 310,
      }),
    });

    expect(comparison).toMatchObject({
      baseline_trace_id: "trace-baseline",
      baseline_strategy: "oldest_retained_trace",
      current_trace_id: "trace-current",
      latest_trace_id: "trace-current",
      trace_window_count: 2,
      verdict: "regressed",
    });
    expect(comparison.metrics).toEqual([
      {
        baseline_ms: 40,
        current_ms: 70,
        delta_ms: 30,
        delta_ratio: 0.75,
        key: "providerFirstEventMs",
        verdict: "same",
      },
      {
        baseline_ms: 100,
        current_ms: 180,
        delta_ms: 80,
        delta_ratio: 0.8,
        key: "providerFirstTextMs",
        verdict: "regressed",
      },
      {
        baseline_ms: 10,
        current_ms: 30,
        delta_ms: 20,
        delta_ratio: 2,
        key: "providerToAppServerFirstDeltaMs",
        verdict: "same",
      },
      {
        baseline_ms: 50,
        current_ms: 100,
        delta_ms: 50,
        delta_ratio: 1,
        key: "appServerFirstDeltaToTerminalMs",
        verdict: "regressed",
      },
      {
        baseline_ms: 160,
        current_ms: 310,
        delta_ms: 150,
        delta_ratio: 0.9375,
        key: "rootDurationMs",
        verdict: "regressed",
      },
    ]);
    expect(JSON.stringify(comparison)).not.toContain("raw_provider_payload");
    expect(JSON.stringify(comparison)).not.toContain("should");
  });

  it("无当前 trace 或无 baseline trace 时应 fail closed", () => {
    const baseline = timeline("trace-baseline", { firstText: 100 });

    expect(
      projectClawTraceAppServerComparison({
        baseline,
        current: null,
        latestTraceId: "trace-current",
        traceWindowCount: 2,
      }),
    ).toMatchObject({
      baseline_trace_id: "trace-baseline",
      current_trace_id: null,
      latest_trace_id: "trace-current",
      metrics: [],
      trace_window_count: 2,
      verdict: "no_current",
    });

    expect(
      projectClawTraceAppServerComparison({
        baseline: null,
        current: timeline("trace-current", { firstText: 100 }),
        latestTraceId: "trace-current",
        traceWindowCount: 1,
      }),
    ).toMatchObject({
      baseline_trace_id: null,
      current_trace_id: "trace-current",
      latest_trace_id: "trace-current",
      metrics: [],
      trace_window_count: 1,
      verdict: "no_baseline",
    });
  });

  it("应从 retained trace window 选择最早 trace 作为长期 baseline", () => {
    const window = selectClawTraceAppServerComparisonWindow([
      {
        event_count: 4,
        path: "sessions/session_session-a/trace_trace-current.jsonl",
        session_id: "session-a",
        size_bytes: 256,
        trace_id: "trace-current",
      },
      {
        event_count: 4,
        path: "sessions/session_session-a/trace_trace-previous.jsonl",
        session_id: "session-a",
        size_bytes: 224,
        trace_id: "trace-previous",
      },
      {
        event_count: 4,
        path: "sessions/session_session-a/trace_trace-oldest.jsonl",
        session_id: "session-a",
        size_bytes: 192,
        trace_id: "trace-oldest",
      },
    ]);

    expect(window).toEqual({
      baseline_strategy: "oldest_retained_trace",
      baseline_trace: expect.objectContaining({
        trace_id: "trace-oldest",
      }),
      current_trace: expect.objectContaining({
        trace_id: "trace-current",
      }),
      latest_trace_id: "trace-current",
      trace_window_count: 3,
    });
  });

  it("只有单事件 trace 时应标记为不可比", () => {
    const comparison = projectClawTraceAppServerComparison({
      baseline: timeline("trace-baseline", {}),
      current: timeline("trace-current", {}),
      latestTraceId: "trace-current",
      traceWindowCount: 2,
    });

    expect(comparison).toEqual({
      baseline_trace_id: "trace-baseline",
      baseline_strategy: "oldest_retained_trace",
      current_trace_id: "trace-current",
      latest_trace_id: "trace-current",
      metrics: [],
      trace_window_count: 2,
      verdict: "no_comparable",
    });
  });
});
