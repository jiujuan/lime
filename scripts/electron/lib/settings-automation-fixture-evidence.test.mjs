import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTOMATION_REQUIRED_METHODS,
  applyPassingSettingsAutomationEvidence,
  createSettingsAutomationEvidence,
  parseSettingsAutomationFixtureArgs,
  summarizeSettingsAutomationTrace,
} from "./settings-automation-fixture-evidence.mjs";

const RUN_ID = "standalone-settings-b-test";

function traceRaw(transport = "electron-ipc", methods = undefined) {
  return JSON.stringify(
    (methods ?? AUTOMATION_REQUIRED_METHODS).map((method) => ({
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
    electronLaunchCount: 3,
    preloadLaunchCount: 3,
    isolatedUserData: true,
    automationTabActive: true,
    schedulerControlsReady: true,
    jobSummaryReady: true,
    healthSummaryReady: true,
    allControlsChanged: true,
    restartReadback: true,
    restorationSaved: true,
    finalRestorationReadback: true,
    loadingVisible: false,
    errorVisible: false,
    trace: summarizeSettingsAutomationTrace([
      traceRaw(),
      traceRaw(),
      traceRaw(),
    ]),
    consoleErrors: [],
    pageErrors: [],
    invokeErrorCount: 0,
    changedScreenshotWritten: true,
    restartScreenshotWritten: true,
    restoredScreenshotWritten: true,
  };
}

describe("Settings Automation Gate B evidence", () => {
  it("uses the same project Gate run root", () => {
    const options = parseSettingsAutomationFixtureArgs(["--run-id", RUN_ID], {
      defaults: {
        runId: null,
        evidenceDir: null,
        prefix: "settings-automation-fixture",
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
        "settings-automation-lifecycle",
      ),
    );
  });

  it("requires scheduler read/write plus status, jobs and health", () => {
    expect(summarizeSettingsAutomationTrace(traceRaw())).toMatchObject({
      appServerIpcHitCount: AUTOMATION_REQUIRED_METHODS.length,
      methods: AUTOMATION_REQUIRED_METHODS,
      missingMethods: [],
      legacyCommands: [],
      mockFallbackHitCount: 0,
    });
  });

  it("completes only after change, restart, restore and final restart", () => {
    const summary = createSettingsAutomationEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-automation-fixture",
    });
    applyPassingSettingsAutomationEvidence(summary, passingFacts());
    expect(summary.result).toBe("pass");
    expect(summary.settingsScenarioProof).toEqual({
      scenarioId: "automation-lifecycle",
      complete: true,
    });
  });

  it("rejects mock transport and missing final restoration", () => {
    const summary = createSettingsAutomationEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-automation-fixture",
    });
    expect(() =>
      applyPassingSettingsAutomationEvidence(summary, {
        ...passingFacts(),
        finalRestorationReadback: false,
        trace: summarizeSettingsAutomationTrace(
          traceRaw("renderer-mock", ["automationJob/list"]),
        ),
      }),
    ).toThrow(
      /appServerElectronIpc.*allCurrentAutomationMethods.*finalRestorationReadback.*mockFallbackZero/,
    );
  });
});
