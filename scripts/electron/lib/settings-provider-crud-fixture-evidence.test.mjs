import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PROVIDER_CRUD_REQUIRED_METHODS,
  applyPassingSettingsProviderCrudEvidence,
  createSettingsProviderCrudEvidence,
  parseSettingsProviderCrudFixtureArgs,
  summarizeSettingsProviderCrudTrace,
} from "./settings-provider-crud-fixture-evidence.mjs";

const RUN_ID = "standalone-settings-b-test";

function traceRaw(transport = "electron-ipc", methods = undefined) {
  return JSON.stringify(
    (methods ?? PROVIDER_CRUD_REQUIRED_METHODS).map((method) => ({
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
    guiCreated: true,
    authFailureVisible: true,
    authRecovered: true,
    modelSelected: true,
    connectionReady: true,
    restartReadback: true,
    guiDeleted: true,
    finalRestartAbsent: true,
    unauthorizedRequestCount: 1,
    authorizedRequestCount: 2,
    trace: summarizeSettingsProviderCrudTrace(traceRaw()),
    consoleErrors: [],
    pageErrors: [],
    invokeErrorCount: 0,
    authFailureScreenshotWritten: true,
    configuredScreenshotWritten: true,
    recoveredScreenshotWritten: true,
    finalScreenshotWritten: true,
  };
}

describe("Settings Provider CRUD Gate B evidence", () => {
  it("uses the same project Gate run root", () => {
    const options = parseSettingsProviderCrudFixtureArgs(["--run-id", RUN_ID], {
      defaults: {
        runId: null,
        evidenceDir: null,
        prefix: "settings-provider-crud-fixture",
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
        "settings-provider-crud-model-auth",
      ),
    );
  });

  it("requires CRUD, key, model fetch, and connection methods", () => {
    expect(summarizeSettingsProviderCrudTrace(traceRaw())).toMatchObject({
      methods: PROVIDER_CRUD_REQUIRED_METHODS,
      missingMethods: [],
      legacyCommands: [],
      mockFallbackHitCount: 0,
    });
  });

  it("completes only after auth recovery, restart, and deletion", () => {
    const summary = createSettingsProviderCrudEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-provider-crud-fixture",
    });
    applyPassingSettingsProviderCrudEvidence(summary, passingFacts());
    expect(summary).toMatchObject({
      result: "pass",
      settingsScenarioProof: {
        scenarioId: "provider-crud-model-auth",
        complete: true,
      },
      localFixture: {
        responseBodyStored: false,
        authorizationValueStored: false,
      },
    });
  });

  it("rejects mock transport and missing auth recovery", () => {
    const summary = createSettingsProviderCrudEvidence({
      candidateRunId: RUN_ID,
      startedAt: "2026-07-17T00:00:00.000Z",
      prefix: "settings-provider-crud-fixture",
    });
    expect(() =>
      applyPassingSettingsProviderCrudEvidence(summary, {
        ...passingFacts(),
        authRecovered: false,
        authorizedRequestCount: 0,
        trace: summarizeSettingsProviderCrudTrace(
          traceRaw("renderer-mock", ["get_api_key_providers"]),
        ),
      }),
    ).toThrow(
      /appServerElectronIpc.*allCurrentProviderMethods.*authRecovered.*authorizedRequestObserved.*mockFallbackZero/,
    );
  });
});
