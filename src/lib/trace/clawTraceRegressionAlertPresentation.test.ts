import { describe, expect, it } from "vitest";
import { buildClawTraceRegressionAlertNotificationCopy } from "./clawTraceRegressionAlertPresentation";

describe("clawTraceRegressionAlertPresentation", () => {
  it("应生成 summary-only 桌面通知文案", () => {
    const copy = buildClawTraceRegressionAlertNotificationCopy(
      {
        current_regressed_delta_ms: 180,
        primary_owner: "lime_client",
        reason: "large_current_regression",
        recent_report_count: 3,
        repeated_owner_regression_count: 1,
        severity: "warning",
      },
      (key, options) => `${key}:${JSON.stringify(options ?? {})}`,
    );

    expect(copy.title).toContain(
      "settings.developer.debugSwitch.clawTrace.regression.alert.title",
    );
    expect(copy.title).toContain(
      "settings.developer.debugSwitch.clawTrace.regression.alert.severity.warning",
    );
    expect(copy.body).toContain('"deltaMs":"180"');
    expect(copy.body).toContain('"repeatCount":1');
    expect(JSON.stringify(copy)).not.toContain("raw_trace_jsonl");
    expect(JSON.stringify(copy)).not.toContain("provider_payload");
  });
});
