import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAgentUiPerformanceMetrics,
  recordAgentUiPerformanceMetric,
  summarizeAgentUiPerformanceMetrics,
} from "./agentUiPerformanceMetrics";
import {
  AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS,
  AGENT_UI_PERFORMANCE_TRACE_HISTORY_STORAGE_KEY,
  clearAgentUiPerformanceTraceHistory,
  exportAgentUiPerformanceTraceHistory,
  listAgentUiPerformanceTraceHistory,
  saveAgentUiPerformanceTraceSnapshot,
} from "./agentUiPerformanceTraceHistory";

function recordTraceSummary(sessionId: string, providerWaitMs: number): void {
  recordAgentUiPerformanceMetric("agentStream.providerTrace", {
    providerWaitMs,
    raw_provider_payload: "secret-provider-payload",
    sessionId,
    stage: "first_text_delta_received",
  });
  recordAgentUiPerformanceMetric("agentStream.firstTextDelta", {
    rendererEventReceivedDeltaMs: 4,
    serverToRendererDeltaMs: 18,
    sessionId,
  });
  recordAgentUiPerformanceMetric("agentStream.firstTextPaint", {
    clientLocalOutputDeltaMs: 80,
    sessionId,
  });
}

describe("agentUiPerformanceTraceHistory", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAgentUiPerformanceMetrics();
  });

  afterEach(() => {
    clearAgentUiPerformanceTraceHistory();
    clearAgentUiPerformanceMetrics();
  });

  it("应只持久化脱敏后的 compact Trace summary", () => {
    recordTraceSummary("session-a", 1200);

    const record = saveAgentUiPerformanceTraceSnapshot(
      summarizeAgentUiPerformanceMetrics(),
      {
        label: "slow first token",
      },
    );

    expect(record).toMatchObject({
      label: "slow first token",
      summary: {
        entry_count: 3,
        session_count: 1,
      },
    });
    expect(listAgentUiPerformanceTraceHistory()).toHaveLength(1);

    const exported = exportAgentUiPerformanceTraceHistory();
    const exportedText = JSON.stringify(exported);
    expect(exported.retention).toMatchObject({
      mode: "compact_summary_only",
      raw_entries: false,
      prompt_text: false,
      provider_payload: false,
    });
    expect(exported.records[0]?.summary.sessions[0]?.metrics).toMatchObject({
      providerWaitMs: 1200,
      serverToRendererFirstTextDeltaMs: 18,
      rendererApplyFirstTextDeltaMs: 4,
      clientLocalOutputMs: 80,
    });
    expect(exportedText).not.toContain("secret-provider-payload");
    expect(exportedText).not.toContain("raw_provider_payload");
  });

  it("应按数量和时间保留策略裁剪历史", () => {
    const nowMs = Date.now();
    recordTraceSummary("expired-session", 1);
    saveAgentUiPerformanceTraceSnapshot(summarizeAgentUiPerformanceMetrics(), {
      label: "expired",
      nowMs: nowMs - 8 * 24 * 60 * 60 * 1000,
    });

    for (
      let index = 0;
      index < AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS + 5;
      index += 1
    ) {
      clearAgentUiPerformanceMetrics();
      recordTraceSummary(`session-${index}`, index);
      saveAgentUiPerformanceTraceSnapshot(
        summarizeAgentUiPerformanceMetrics(),
        {
          label: `snapshot-${index}`,
          nowMs: nowMs + index,
        },
      );
    }

    const records = listAgentUiPerformanceTraceHistory();
    expect(records).toHaveLength(
      AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS,
    );
    expect(records[0]?.label).toBe("snapshot-5");
    expect(records.at(-1)?.label).toBe("snapshot-24");
    expect(records.some((record) => record.label === "expired")).toBe(false);
  });

  it("无 summary 和损坏历史数据时应 fail closed", () => {
    expect(
      saveAgentUiPerformanceTraceSnapshot(summarizeAgentUiPerformanceMetrics()),
    ).toBeNull();

    window.localStorage.setItem(
      AGENT_UI_PERFORMANCE_TRACE_HISTORY_STORAGE_KEY,
      "{not-json",
    );
    expect(listAgentUiPerformanceTraceHistory()).toEqual([]);
    expect(exportAgentUiPerformanceTraceHistory().records).toEqual([]);
  });
});
