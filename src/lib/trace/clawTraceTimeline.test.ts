import { describe, expect, it } from "vitest";
import type { DiagnosticsTraceReadResult } from "@/lib/api/serverRuntime";
import {
  clawTraceSpanKey,
  filterClawTraceTimelineRowsBySpan,
  filterClawTraceTimelineRows,
  findClawTraceSpanByKey,
  projectClawTraceTimeline,
} from "./clawTraceTimeline";

const redaction = {
  mode: "summary_only",
  raw_agent_event_payload: false,
  prompt_text: false,
  provider_payload: false,
};

describe("clawTraceTimeline", () => {
  it("应从 summary-only trace events 投影 timeline 和 phase spans", () => {
    const result: DiagnosticsTraceReadResult = {
      available: true,
      trace: {
        event_count: 4,
        path: "sessions/session_session-a/trace_trace-a.jsonl",
        session_id: "session-a",
        size_bytes: 128,
        trace_id: "trace-a",
      },
      events: [
        {
          checkpoint: "app_server.message_delta.emitted",
          event_id: "evt-3",
          event_sequence: 3,
          event_type: "message.delta",
          metrics: {
            nested: { should: "drop" },
            text_chars: 4,
          },
          redaction,
          schema_version: 1,
          seq: 3,
          session_id: "session-a",
          trace_id: "trace-a",
          wall_time_unix_ms: 1_000_000_120,
        },
        {
          checkpoint: "provider.request.started",
          event_id: "evt-1",
          event_sequence: 1,
          event_type: "provider.request.started",
          metrics: {
            model: "claude",
            provider: "anthropic",
          },
          redaction,
          schema_version: 1,
          seq: 1,
          session_id: "session-a",
          trace_id: "trace-a",
          wall_time_unix_ms: 1_000_000_000,
        },
        {
          checkpoint: "provider.first_text_delta.received",
          event_id: "evt-2",
          event_sequence: 2,
          event_type: "provider.first_text_delta.received",
          metrics: {
            text_chars: 4,
          },
          redaction,
          schema_version: 1,
          seq: 2,
          session_id: "session-a",
          trace_id: "trace-a",
          wall_time_unix_ms: 1_000_000_090,
        },
        {
          checkpoint: "app_server.turn.terminal",
          event_id: "evt-4",
          event_sequence: 4,
          event_type: "turn.completed",
          metrics: {
            status: "completed",
          },
          redaction,
          schema_version: 1,
          seq: 4,
          session_id: "session-a",
          trace_id: "trace-a",
          wall_time_unix_ms: 1_000_000_160,
        },
      ],
      redaction,
    };

    const projection = projectClawTraceTimeline(result);

    expect(projection).toMatchObject({
      event_count: 4,
      phase_gaps: [],
      redaction_mode: "summary_only",
      root_duration_ms: 160,
      trace_id: "trace-a",
    });
    expect(projection.timeline.map((row) => row.checkpoint)).toEqual([
      "provider.request.started",
      "provider.first_text_delta.received",
      "app_server.message_delta.emitted",
      "app_server.turn.terminal",
    ]);
    expect(projection.timeline[1]).toMatchObject({
      delta_ms: 90,
      offset_ms: 90,
      phase: "provider_api",
    });
    expect(projection.timeline[2].metrics).toEqual([
      { key: "text_chars", value: "4" },
    ]);
    expect(projection.spans).toEqual([
      {
        duration_ms: 90,
        end_offset_ms: 90,
        event_count: 2,
        phase: "provider_api",
        start_offset_ms: 0,
      },
      {
        duration_ms: 0,
        end_offset_ms: 120,
        event_count: 1,
        phase: "app_server",
        start_offset_ms: 120,
      },
      {
        duration_ms: 0,
        end_offset_ms: 160,
        event_count: 1,
        phase: "terminal",
        start_offset_ms: 160,
      },
    ]);
    const providerSpan = projection.spans[0];
    const providerSpanKey = clawTraceSpanKey(providerSpan);
    expect(providerSpanKey).toBe("provider_api:0:90:2");
    expect(findClawTraceSpanByKey(projection, providerSpanKey)).toEqual(
      providerSpan,
    );
    expect(
      filterClawTraceTimelineRowsBySpan(projection, providerSpan).map(
        (row) => row.checkpoint,
      ),
    ).toEqual([
      "provider.request.started",
      "provider.first_text_delta.received",
    ]);
    expect(filterClawTraceTimelineRowsBySpan(projection, null)).toEqual([]);
    expect(projection.slow_segments).toEqual([
      {
        duration_ms: 90,
        end_offset_ms: 90,
        from_checkpoint: "provider.request.started",
        phase: "provider_api",
        start_offset_ms: 0,
        to_checkpoint: "provider.first_text_delta.received",
      },
    ]);
    expect(
      filterClawTraceTimelineRows(projection, "provider_api").map(
        (row) => row.checkpoint,
      ),
    ).toEqual([
      "provider.request.started",
      "provider.first_text_delta.received",
    ]);
    expect(
      filterClawTraceTimelineRows(projection, "slow").map(
        (row) => row.checkpoint,
      ),
    ).toEqual(["provider.first_text_delta.received"]);
  });

  it("应支持按阈值投影慢段并报告缺失 phase", () => {
    const result: DiagnosticsTraceReadResult = {
      available: true,
      trace: null,
      events: [
        {
          checkpoint: "app_server.turn.received",
          event_id: "evt-1",
          event_sequence: 1,
          event_type: "turn.started",
          metrics: {},
          redaction,
          schema_version: 1,
          seq: 1,
          session_id: "session-a",
          trace_id: "trace-a",
          wall_time_unix_ms: 1_000_000_000,
        },
        {
          checkpoint: "app_server.message_delta.emitted",
          event_id: "evt-2",
          event_sequence: 2,
          event_type: "message.delta",
          metrics: {},
          redaction,
          schema_version: 1,
          seq: 2,
          session_id: "session-a",
          trace_id: "trace-a",
          wall_time_unix_ms: 1_000_000_030,
        },
        {
          checkpoint: "app_server.turn.terminal",
          event_id: "evt-3",
          event_sequence: 3,
          event_type: "turn.completed",
          metrics: {},
          redaction,
          schema_version: 1,
          seq: 3,
          session_id: "session-a",
          trace_id: "trace-a",
          wall_time_unix_ms: 1_000_000_140,
        },
      ],
      redaction,
    };

    const projection = projectClawTraceTimeline(result, {
      max_slow_segments: 1,
      slow_segment_threshold_ms: 20,
    });

    expect(projection.phase_gaps).toEqual([
      {
        phase: "provider_api",
        reason: "missing_phase",
      },
    ]);
    expect(projection.slow_segments).toEqual([
      {
        duration_ms: 110,
        end_offset_ms: 140,
        from_checkpoint: "app_server.message_delta.emitted",
        phase: "terminal",
        start_offset_ms: 30,
        to_checkpoint: "app_server.turn.terminal",
      },
    ]);
  });
});
