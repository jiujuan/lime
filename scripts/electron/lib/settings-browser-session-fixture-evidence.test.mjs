import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BROWSER_SESSION_REQUIRED_METHODS,
  applyPassingSettingsBrowserSessionEvidence,
  createSettingsBrowserSessionEvidence,
  parseSettingsBrowserSessionFixtureArgs,
  summarizeSettingsBrowserSessionTrace,
} from "./settings-browser-session-fixture-evidence.mjs";

const RUN_ID = "standalone-settings-b-test";

function traceRaw(transport = "electron-ipc", methods = undefined) {
  return JSON.stringify(
    (methods ?? BROWSER_SESSION_REQUIRED_METHODS).map((method) => ({
      command: "app_server_handle_json_lines",
      transport,
      status: "success",
      args_preview: {
        request: {
          lines: [
            JSON.stringify({ jsonrpc: "2.0", id: method, method, params: {} }),
          ],
        },
      },
    })),
  );
}

function passingFacts() {
  return {
    completedAt: "2026-07-17T00:03:00.000Z",
    electron: true,
    preloadInvoke: true,
    isolatedUserData: true,
    localCdpFixture: true,
    settingsTabActive: true,
    targetDetected: true,
    targetSelected: true,
    sessionOpened: true,
    sessionReadback: true,
    connectedVisible: true,
    sessionClosed: true,
    closedVisible: true,
    trace: summarizeSettingsBrowserSessionTrace(traceRaw()),
    consoleErrors: [],
    pageErrors: [],
    invokeErrorCount: 0,
    connectedScreenshotWritten: true,
    closedScreenshotWritten: true,
  };
}

describe("Settings Browser Session Gate B evidence", () => {
  it("uses the same project Gate run root", () => {
    const options = parseSettingsBrowserSessionFixtureArgs(
      ["--run-id", RUN_ID],
      {
        defaults: {
          runId: null,
          evidenceDir: null,
          prefix: "settings-browser-session-fixture",
          timeoutMs: 120_000,
          intervalMs: 250,
          keepTemp: false,
        },
        cwd: "/repo",
      },
    );
    expect(options.evidenceDir).toBe(
      path.join(
        "/repo",
        ".lime",
        "qc",
        "project-gates",
        RUN_ID,
        "settings-browser-session-lifecycle",
      ),
    );
  });

  it("requires the complete current browserSession lifecycle", () => {
    expect(summarizeSettingsBrowserSessionTrace(traceRaw())).toMatchObject({
      methods: BROWSER_SESSION_REQUIRED_METHODS,
      missingMethods: [],
      legacyCommands: [],
      mockFallbackHitCount: 0,
    });
  });

  it("completes only after visible open, readback, and close", () => {
    const summary = createSettingsBrowserSessionEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-browser-session-fixture",
    });
    applyPassingSettingsBrowserSessionEvidence(summary, passingFacts());
    expect(summary).toMatchObject({
      result: "pass",
      proofLevel: "Gate B-R",
      settingsScenarioProof: {
        scenarioId: "chrome-relay-lifecycle",
        complete: true,
      },
    });
  });

  it("rejects legacy transport and an incomplete close", () => {
    const summary = createSettingsBrowserSessionEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-browser-session-fixture",
    });
    expect(() =>
      applyPassingSettingsBrowserSessionEvidence(summary, {
        ...passingFacts(),
        sessionClosed: false,
        trace: summarizeSettingsBrowserSessionTrace(
          traceRaw("renderer-mock", ["list_cdp_targets"]),
        ),
      }),
    ).toThrow(
      /appServerElectronIpc.*allCurrentBrowserSessionMethods.*sessionClosed.*mockFallbackZero/,
    );
  });
});
