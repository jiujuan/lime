import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyPassingSettingsStatsEvidence,
  createSettingsStatsEvidence,
  parseSettingsStatsFixtureArgs,
  summarizeSettingsStatsTrace,
} from "./settings-stats-fixture-evidence.mjs";

const RUN_ID = "standalone-settings-b-test";

function traceRaw(transport = "electron-ipc") {
  return JSON.stringify(
    [
      "usageStats/read",
      "usageStats/modelRanking/list",
      "usageStats/dailyTrends/list",
    ].map((method, index) => ({
      command: "app_server_handle_json_lines",
      transport,
      status: "success",
      args_preview: {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", id: index, method })],
        },
      },
    })),
  );
}

describe("Settings Stats Gate B evidence", () => {
  it("uses the same project Gate run root by default", () => {
    const options = parseSettingsStatsFixtureArgs(["--run-id", RUN_ID], {
      defaults: {
        runId: null,
        evidenceDir: null,
        prefix: "settings-stats-fixture",
        timeoutMs: 120_000,
        intervalMs: 250,
        keepTemp: false,
      },
      cwd: "/repo",
    });
    expect(options.evidenceDir).toBe(
      path.join(
        "/repo",
        ".lime",
        "qc",
        "project-gates",
        RUN_ID,
        "settings-stats-current-read",
      ),
    );
  });

  it("requires all three usage stats methods over Electron IPC", () => {
    expect(summarizeSettingsStatsTrace(traceRaw())).toMatchObject({
      appServerIpcHitCount: 3,
      methods: [
        "usageStats/read",
        "usageStats/modelRanking/list",
        "usageStats/dailyTrends/list",
      ],
      missingMethods: [],
      mockFallbackHitCount: 0,
    });
    expect(
      summarizeSettingsStatsTrace(traceRaw("renderer-mock")),
    ).toMatchObject({
      appServerIpcHitCount: 0,
      missingMethods: [
        "usageStats/read",
        "usageStats/modelRanking/list",
        "usageStats/dailyTrends/list",
      ],
      mockFallbackHitCount: 3,
    });
  });

  it("completes only from a terminal current read state", () => {
    const summary = createSettingsStatsEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-stats-fixture",
    });
    applyPassingSettingsStatsEvidence(summary, {
      completedAt: "2026-07-17T00:01:00.000Z",
      electronRenderer: true,
      preloadInvoke: true,
      statsActive: true,
      loadingVisible: false,
      errorVisible: false,
      trace: summarizeSettingsStatsTrace(traceRaw()),
      consoleErrors: [],
      pageErrors: [],
      invokeErrorCount: 0,
      screenshotWritten: true,
    });
    expect(summary.result).toBe("pass");
    expect(summary.settingsScenarioProof).toEqual({
      scenarioId: "stats-current-read",
      complete: true,
    });
  });

  it("rejects loading and visible read errors", () => {
    const summary = createSettingsStatsEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-stats-fixture",
    });
    expect(() =>
      applyPassingSettingsStatsEvidence(summary, {
        completedAt: "2026-07-17T00:01:00.000Z",
        electronRenderer: true,
        preloadInvoke: true,
        statsActive: true,
        loadingVisible: true,
        errorVisible: true,
        trace: summarizeSettingsStatsTrace(traceRaw()),
        consoleErrors: [],
        pageErrors: [],
        invokeErrorCount: 0,
        screenshotWritten: true,
      }),
    ).toThrow(/loadingCleared.*readErrorHidden/);
  });
});
