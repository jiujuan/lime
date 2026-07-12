import { describe, expect, it } from "vitest";
import {
  buildAgentStreamFirstRuntimeStatusMetricContext,
  buildAgentStreamFirstTextDeltaMetricContext,
  buildAgentStreamProviderTraceMetricContext,
  shouldRecordAgentStreamFirstRuntimeStatus,
  shouldRecordAgentStreamFirstTextDelta,
} from "./agentStreamRuntimeMetricsController";

describe("agentStreamRuntimeMetricsController", () => {
  it("应判断 first runtime status / first text delta 是否需要记录", () => {
    expect(
      shouldRecordAgentStreamFirstRuntimeStatus({
        firstRuntimeStatusAt: null,
      }),
    ).toBe(true);
    expect(
      shouldRecordAgentStreamFirstRuntimeStatus({
        firstRuntimeStatusAt: 120,
      }),
    ).toBe(false);
    expect(
      shouldRecordAgentStreamFirstTextDelta({ firstTextDeltaAt: undefined }),
    ).toBe(true);
    expect(
      shouldRecordAgentStreamFirstTextDelta({ firstTextDeltaAt: 130 }),
    ).toBe(false);
  });

  it("应构造 first runtime status 指标上下文", () => {
    expect(
      buildAgentStreamFirstRuntimeStatusMetricContext({
        activeSessionId: "session-a",
        eventName: "event-a",
        firstEventReceivedAt: 140,
        firstRuntimeStatusAt: 190,
        requestStartedAt: 100,
        statusPhase: "routing",
        statusTitle: "分析中",
      }),
    ).toEqual({
      elapsedMs: 90,
      eventName: "event-a",
      firstEventDeltaMs: 50,
      phase: "routing",
      sessionId: "session-a",
      title: "分析中",
    });
  });

  it("应构造 first text delta 指标上下文", () => {
    expect(
      buildAgentStreamFirstTextDeltaMetricContext({
        activeSessionId: "session-a",
        deltaText: "你好",
        eventName: "event-a",
        firstEventReceivedAt: 140,
        firstRuntimeStatusAt: 190,
        firstTextDeltaAt: 260,
        requestStartedAt: 100,
      }),
    ).toEqual({
      deltaChars: 2,
      elapsedMs: 160,
      eventName: "event-a",
      firstEventDeltaMs: 120,
      firstRuntimeStatusDeltaMs: 70,
      rendererEventReceivedDeltaMs: null,
      serverEventDeltaMs: null,
      serverToRendererDeltaMs: null,
      sessionId: "session-a",
    });
  });

  it("未记录前置阶段时 delta 字段应为 null", () => {
    expect(
      buildAgentStreamFirstTextDeltaMetricContext({
        activeSessionId: "session-a",
        deltaText: "好",
        eventName: "event-a",
        firstEventReceivedAt: null,
        firstRuntimeStatusAt: null,
        firstTextDeltaAt: 150,
        requestStartedAt: 100,
      }),
    ).toMatchObject({
      firstEventDeltaMs: null,
      firstRuntimeStatusDeltaMs: null,
      rendererEventReceivedDeltaMs: null,
      serverEventDeltaMs: null,
      serverToRendererDeltaMs: null,
    });
  });

  it("应构造 first text delta 的 renderer apply 分段上下文", () => {
    expect(
      buildAgentStreamFirstTextDeltaMetricContext({
        activeSessionId: "session-a",
        deltaText: "好",
        eventName: "event-a",
        firstTextDeltaAt: 190,
        rendererEventReceivedAt: 160,
        requestStartedAt: 100,
        serverEventEmittedAt: 130,
      }),
    ).toMatchObject({
      rendererEventReceivedDeltaMs: 30,
      serverEventDeltaMs: 60,
      serverToRendererDeltaMs: 30,
    });
  });

  it("应构造 provider trace 指标并仅在首个 provider text delta 暴露 providerWaitMs", () => {
    expect(
      buildAgentStreamProviderTraceMetricContext({
        activeSessionId: "session-a",
        attempt: 1,
        elapsedMs: 1500,
        eventName: "event-a",
        model: "gpt-4.1",
        provider: "openai",
        runtimeProviderActiveModel: "gpt-4.1",
        runtimeProviderBackend: "current",
        runtimeProviderProtocol: "responses",
        runtimeProviderSelector: "codex",
        runtimeEventType: "provider.first_text_delta.received",
        stage: "first_text_delta_received",
        status: "running",
        textChars: 4,
      }),
    ).toEqual({
      attempt: 1,
      cancelReason: null,
      elapsedMs: 1500,
      eventName: "event-a",
      failureCategory: null,
      model: "gpt-4.1",
      provider: "openai",
      providerWaitMs: 1500,
      retryable: null,
      runtimeProviderActiveModel: "gpt-4.1",
      runtimeProviderBackend: "current",
      runtimeProviderProtocol: "responses",
      runtimeProviderSelector: "codex",
      runtimeEventType: "provider.first_text_delta.received",
      sessionId: "session-a",
      stage: "first_text_delta_received",
      status: "running",
      textChars: 4,
    });

    expect(
      buildAgentStreamProviderTraceMetricContext({
        activeSessionId: "session-a",
        elapsedMs: 200,
        eventName: "event-a",
        stage: "first_event_received",
      }),
    ).toMatchObject({
      elapsedMs: 200,
      providerWaitMs: null,
      stage: "first_event_received",
    });
  });
});
