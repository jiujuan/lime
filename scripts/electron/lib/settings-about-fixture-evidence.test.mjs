import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyPassingSettingsAboutEvidence,
  applyPassingSettingsHomeEvidence,
  createSettingsAboutEvidence,
  createSettingsHomeEvidence,
  isLocalizedAboutVersionLine,
  parseSettingsAboutFixtureArgs,
  summarizeSettingsAboutTrace,
} from "./settings-about-fixture-evidence.mjs";

const RUN_ID = "standalone-settings-b-test";

function traceEntry(command, argsPreview = {}) {
  return {
    command,
    transport: "electron-ipc",
    status: "success",
    args_preview: argsPreview,
  };
}

function traceRaw() {
  return JSON.stringify([
    traceEntry("check_for_updates"),
    traceEntry("get_update_install_session"),
    traceEntry("app_server_handle_json_lines", {
      request: {
        lines: [
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "modelProvider/list",
            params: {},
          }),
        ],
      },
    }),
  ]);
}

describe("Settings About Gate B evidence", () => {
  it("defaults evidence into the same project Gate run", () => {
    const options = parseSettingsAboutFixtureArgs(["--run-id", RUN_ID], {
      defaults: {
        runId: null,
        evidenceDir: null,
        prefix: "settings-about-fixture",
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
        "settings-about-version",
      ),
    );
  });

  it("derives current Host and App Server methods from Electron IPC trace", () => {
    expect(summarizeSettingsAboutTrace(traceRaw())).toMatchObject({
      appServerIpcHitCount: 1,
      appServerMethods: ["modelProvider/list"],
      hostCommands: ["check_for_updates", "get_update_install_session"],
      hostIpcHitCount: 2,
      missingHostCommands: [],
      legacyCommands: [],
      mockFallbackHitCount: 0,
    });
  });

  it("keeps the visible version label localized", () => {
    expect(
      isLocalizedAboutVersionLine("zh-CN", "版本 1.106.0（1.106.0）"),
    ).toBe(true);
    expect(isLocalizedAboutVersionLine("zh-CN", "Version 1.106.0")).toBe(false);
    expect(isLocalizedAboutVersionLine("ja-JP", "バージョン 1.106.0")).toBe(
      true,
    );
    expect(isLocalizedAboutVersionLine("ko-KR", "버전 1.106.0")).toBe(true);
  });

  it("completes only when visible and Host versions share one truth", () => {
    const summary = createSettingsAboutEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-about-fixture",
    });
    applyPassingSettingsAboutEvidence(summary, {
      completedAt: "2026-07-17T00:01:00.000Z",
      electronRenderer: true,
      preloadInvoke: true,
      packageVersion: "1.106.0",
      visibleVersion: "1.106.0",
      versionLabelLocalized: true,
      aboutActive: true,
      loadingVisible: false,
      internalDiagnosticVisible: false,
      trace: summarizeSettingsAboutTrace(traceRaw()),
      consoleErrors: [],
      pageErrors: [],
      invokeErrorCount: 0,
      screenshotWritten: true,
    });

    expect(summary.result).toBe("pass");
    expect(summary.settingsScenarioProof).toEqual({
      scenarioId: "about-version-truth",
      complete: true,
    });
  });

  it("rejects version drift and non-Electron fallback", () => {
    const summary = createSettingsAboutEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-about-fixture",
    });
    const trace = summarizeSettingsAboutTrace(traceRaw());
    trace.mockFallbackHitCount = 1;

    expect(() =>
      applyPassingSettingsAboutEvidence(summary, {
        completedAt: "2026-07-17T00:01:00.000Z",
        electronRenderer: true,
        preloadInvoke: true,
        packageVersion: "1.106.0",
        visibleVersion: "1.105.0",
        versionLabelLocalized: false,
        aboutActive: true,
        loadingVisible: false,
        internalDiagnosticVisible: false,
        trace,
        consoleErrors: [],
        pageErrors: [],
        invokeErrorCount: 0,
        screenshotWritten: true,
      }),
    ).toThrow(/versionTruth.*versionLabelLocalized.*mockFallbackZero/);
  });

  it("keeps back-home navigation as an independent scenario claim", () => {
    const summary = createSettingsHomeEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-about-fixture",
    });
    applyPassingSettingsHomeEvidence(summary, {
      completedAt: "2026-07-17T00:02:00.000Z",
      electronRenderer: true,
      preloadInvoke: true,
      homeStartVisible: true,
      settingsHeaderVisible: false,
      accountButtonVisible: true,
      trace: summarizeSettingsAboutTrace(traceRaw()),
      consoleErrors: [],
      pageErrors: [],
      invokeErrorCount: 0,
      screenshotWritten: true,
    });

    expect(summary.settingsScenarioProof).toEqual({
      scenarioId: "home-navigation",
      complete: true,
    });
    expect(summary.artifacts.screenshot).toBe(
      "settings-about-fixture-home.png",
    );
  });
});
