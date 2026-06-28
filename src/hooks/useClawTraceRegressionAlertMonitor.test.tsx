import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";

const { mockGetConfig, mockSubscribeAppConfigChanged } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSubscribeAppConfigChanged: vi.fn(),
}));

const { mockEvaluateClawTraceRegressionAlertMonitor } = vi.hoisted(() => ({
  mockEvaluateClawTraceRegressionAlertMonitor: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  subscribeAppConfigChanged: mockSubscribeAppConfigChanged,
}));

vi.mock("@/lib/trace/clawTraceRegressionAlertMonitor", () => ({
  evaluateClawTraceRegressionAlertMonitor:
    mockEvaluateClawTraceRegressionAlertMonitor,
}));

import { clearAgentUiPerformanceMetrics } from "@/lib/agentUiPerformanceMetrics";
import { useClawTraceRegressionAlertMonitor } from "./useClawTraceRegressionAlertMonitor";

function Harness() {
  useClawTraceRegressionAlertMonitor({ debounceMs: 10 });
  return null;
}

describe("useClawTraceRegressionAlertMonitor", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    clearAgentUiPerformanceMetrics();
    mockGetConfig.mockResolvedValue({
      developer: {
        claw_trace: {
          alert_enabled: true,
          alert_notification_enabled: false,
          enabled: true,
          sample_rate: 1,
        },
      },
    });
    mockSubscribeAppConfigChanged.mockImplementation(() => () => undefined);
    mockEvaluateClawTraceRegressionAlertMonitor.mockResolvedValue({
      alert: null,
      app_server_trace_requested: false,
      dispatch_result: null,
      notification_result: "not_evaluated",
      report: null,
      skipped_reason: null,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearAgentUiPerformanceMetrics();
  });

  it("配置加载和 metric 事件都会触发全局告警评估", async () => {
    await act(async () => {
      root?.render(<Harness />);
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });

    expect(mockEvaluateClawTraceRegressionAlertMonitor).toHaveBeenCalledTimes(
      1,
    );
    expect(
      mockEvaluateClawTraceRegressionAlertMonitor.mock.calls[0]?.[0],
    ).toMatchObject({
      alertEnabled: true,
      notificationEnabled: false,
      traceEnabled: true,
    });

    await act(async () => {
      recordAgentUiPerformanceMetric("agentStream.firstTextPaint", {
        clientLocalOutputDeltaMs: 80,
        sessionId: "session-a",
      });
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });

    expect(mockEvaluateClawTraceRegressionAlertMonitor).toHaveBeenCalledTimes(
      2,
    );
  });
});
