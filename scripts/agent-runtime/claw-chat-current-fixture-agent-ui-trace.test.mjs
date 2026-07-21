import { describe, expect, it } from "vitest";

import { summarizeTraceEvidence } from "./claw-chat-current-fixture-agent-ui-trace.mjs";

function traceEvent(checkpoint, metrics = {}) {
  return {
    seq: 1,
    checkpoint,
    eventType: checkpoint,
    metrics,
    redaction: { mode: "summary_only" },
  };
}

function traceResults(events) {
  return {
    listResult: {
      available: true,
      traces: [
        {
          sessionId: "session-1",
          traceId: "trace-1",
          path: "sessions/session-1/trace-1.jsonl",
          eventCount: events.length,
        },
      ],
      redaction: { mode: "summary_only" },
    },
    readResult: {
      available: true,
      trace: {
        sessionId: "session-1",
        traceId: "trace-1",
        path: "sessions/session-1/trace-1.jsonl",
        eventCount: events.length,
      },
      events,
      redaction: { mode: "summary_only" },
    },
    exportResult: {},
    supportBundleResult: {},
  };
}

describe("claw chat App Server trace evidence", () => {
  it("keeps provider wait and message emission timing as safe scalar evidence", () => {
    const evidence = summarizeTraceEvidence(
      traceResults([
        traceEvent("provider.first_text_delta.received", {
          elapsed_ms: 1500,
          server_event_emitted_at: 1_780_000_000_000,
          w3c_trace_id: "a".repeat(32),
          w3c_traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01`,
        }),
        traceEvent("app_server.message_delta.emitted", {
          server_event_emitted_at: 1_780_000_000_123,
        }),
      ]),
    );

    expect(evidence.providerWaitMs).toBe(1500);
    expect(evidence.hasProviderWaitMs).toBe(true);
    expect(evidence.serverEventEmittedAt).toBe(1_780_000_000_123);
    expect(evidence.hasServerEventEmittedAt).toBe(true);
    expect(evidence.hasProviderFirstTextDelta).toBe(true);
    expect(evidence.hasAppServerMessageDelta).toBe(true);
    expect(evidence.events[0]).toMatchObject({
      elapsedMs: 1500,
      serverEventEmittedAt: 1_780_000_000_000,
    });
    expect(evidence.forbiddenFragmentPresent).toBe(false);
  });

  it("fails closed for invalid timing metrics and does not expose raw payloads", () => {
    const evidence = summarizeTraceEvidence(
      traceResults([
        traceEvent("provider.first_text_delta.received", {
          elapsed_ms: "1500",
          server_event_emitted_at: "not-a-timestamp",
          text: "secret assistant text",
        }),
      ]),
    );

    expect(evidence.providerWaitMs).toBeNull();
    expect(evidence.hasProviderWaitMs).toBe(false);
    expect(evidence.serverEventEmittedAt).toBeNull();
    expect(evidence.hasServerEventEmittedAt).toBe(false);
    expect(evidence.events[0]).toMatchObject({
      elapsedMs: null,
      serverEventEmittedAt: null,
    });
    expect(JSON.stringify(evidence)).not.toContain("secret assistant text");
    expect(evidence.forbiddenFragmentPresent).toBe(false);
  });
});
