import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAW_TRACE_SCHEMA_VERSION,
  createClawTraceRecorder,
  createW3cTraceContextCarrier,
  normalizeW3cTraceContextCarrier,
  sanitizeClawTraceAttributes,
} from "./clawTrace";

describe("clawTrace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("默认应创建 Noop recorder，不记录 checkpoint", () => {
    const recorder = createClawTraceRecorder({
      traceId: "trace-a",
      sessionId: "session-a",
    });

    expect(recorder.enabled).toBe(false);
    expect(
      recorder.recordCheckpoint({
        checkpoint: "renderer.submit",
      }),
    ).toBeNull();
    expect(recorder.snapshot()).toEqual([]);
  });

  it("开启后应记录结构化 envelope，并递增 seq", () => {
    const recorder = createClawTraceRecorder(
      {
        traceId: "trace-a",
        runId: "run-a",
        sessionId: "session-a",
        workspaceId: "workspace-a",
      },
      {
        enabled: true,
        now: () => 1000,
      },
    );

    const first = recorder.recordCheckpoint({
      checkpoint: "renderer.submit",
      attributes: {
        source: "home",
        prompt: { should: "drop" },
      },
      monotonicMs: 10,
    });
    const second = recorder.recordCheckpoint({
      checkpoint: "renderer.event.received",
      context: { turnId: "turn-a" },
      wallTimeUnixMs: 1200,
    });

    expect(first).toEqual({
      attributes: {
        source: "home",
      },
      checkpoint: "renderer.submit",
      monotonicMs: 10,
      requestId: null,
      runId: "run-a",
      schemaVersion: CLAW_TRACE_SCHEMA_VERSION,
      seq: 1,
      sessionId: "session-a",
      threadId: null,
      traceId: "trace-a",
      turnId: null,
      wallTimeUnixMs: 1000,
      workspaceId: "workspace-a",
    });
    expect(second).toMatchObject({
      checkpoint: "renderer.event.received",
      seq: 2,
      turnId: "turn-a",
      wallTimeUnixMs: 1200,
    });
    expect(recorder.snapshot()).toHaveLength(2);
  });

  it("应只保留 trace attribute 的安全标量", () => {
    expect(
      sanitizeClawTraceAttributes({
        empty: "",
        finite: 12,
        infinite: Infinity,
        nested: { text: "drop" },
        nil: null,
        ok: true,
        text: ` ${"x".repeat(200)} `,
      }),
    ).toEqual({
      empty: null,
      finite: 12,
      nil: null,
      ok: true,
      text: "x".repeat(160),
    });
  });

  it("应限制内存 recorder 的事件数量", () => {
    const recorder = createClawTraceRecorder(
      { traceId: "trace-a" },
      { enabled: true, maxEvents: 1, now: () => 1000 },
    );

    recorder.recordCheckpoint({ checkpoint: "renderer.submit" });
    recorder.recordCheckpoint({ checkpoint: "renderer.text_delta.applied" });

    expect(recorder.snapshot()).toEqual([
      expect.objectContaining({
        checkpoint: "renderer.text_delta.applied",
        seq: 2,
      }),
    ]);
  });

  it("应生成合法 W3C trace context carrier", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-2222-3333-4444-555555555555")
      .mockReturnValueOnce("66666666-7777-8888-9999-aaaaaaaaaaaa");

    expect(createW3cTraceContextCarrier()).toEqual({
      traceparent: "00-11111111222233334444555555555555-9999aaaaaaaaaaaa-01",
      tracestate: null,
      traceId: "11111111222233334444555555555555",
    });
  });

  it("应归一化合法 W3C carrier 并拒绝非法 traceparent", () => {
    expect(
      normalizeW3cTraceContextCarrier({
        traceparent: "00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB-01",
        tracestate: "vendor=value",
      }),
    ).toEqual({
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
      tracestate: "vendor=value",
      traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(
      normalizeW3cTraceContextCarrier({
        traceparent: "00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01",
      }),
    ).toBeNull();
  });
});
