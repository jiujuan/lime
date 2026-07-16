import { describe, expect, it } from "vitest";
import {
  buildElectronSmokeSummary,
  isElectronSmokeStartupUrl,
  normalizeElectronSmokeRunId,
  sanitizeElectronSmokeLocation,
  type ElectronSmokeSummaryInput,
} from "./smokeEvidence";

function passingInput(): ElectronSmokeSummaryInput {
  return {
    runId: "candidate-20260716",
    startedAt: "2026-07-16T00:00:00.000Z",
    completedAt: "2026-07-16T00:00:02.000Z",
    appVersion: "0.1.0",
    backendMode: "unavailable",
    hostAppServerInitialized: true,
    hostAppServerProtocol: "v0",
    routes: [
      {
        stage: "startup",
        ready: true,
        location: "file:///main-window-startup.html",
      },
      {
        stage: "workbench",
        ready: true,
        location: "http://127.0.0.1:1420/?nativeStartup",
      },
      {
        stage: "workbench-reload",
        ready: true,
        location: "http://127.0.0.1:1420/?nativeStartup",
      },
      {
        stage: "settings-memory",
        ready: true,
        location: "http://127.0.0.1:1420/?nativeStartup",
      },
    ],
    renderer: {
      electron: true,
      preloadInvoke: true,
      appServerCommandSupported: true,
      appServerIpcHitCount: 3,
      appServerMethods: ["memoryStore/status", "memoryStore/review/list"],
      invokeErrorCount: 0,
      traceErrorCount: 0,
      legacyCommandHitCount: 0,
      legacyCommands: [],
      mockFallbackHitCount: 0,
      pageErrorCount: 0,
    },
    diagnostics: {
      consoleErrorCount: 0,
      rendererCrashCount: 0,
      rendererUnresponsiveCount: 0,
      preloadErrorCount: 0,
      rendererLoadErrorCount: 0,
    },
    artifacts: {
      summary: "summary.json",
      trace: "trace-summary.json",
      screenshot: "settings-memory.png",
      screenshotCaptured: true,
    },
  };
}

describe("electron smoke evidence", () => {
  it("builds a passing Gate B-F shell summary without request payloads", () => {
    const summary = buildElectronSmokeSummary(passingInput());

    expect(summary.result).toBe("pass");
    expect(summary.proofLevel).toBe("Gate B-F");
    expect(summary.bridge.transport).toBe("electron-ipc");
    expect(summary.bridge.methods).toEqual([
      "memoryStore/review/list",
      "memoryStore/status",
    ]);
    expect(summary.assertions.failed).toEqual([]);
    expect(summary.assertions.details.traceCaptured).toBe(true);
    expect(summary.surfaceProof).toEqual({
      surfaceId: "SHELL-01",
      proof: "gate-b-f",
      complete: true,
    });
    expect(JSON.stringify(summary)).not.toContain("params");
    expect(JSON.stringify(summary)).not.toContain("request");
  });

  it("fails closed when bridge, route, or error assertions are missing", () => {
    const input = passingInput();
    input.routes = input.routes.filter((route) => route.stage !== "startup");
    input.renderer.appServerIpcHitCount = 0;
    input.renderer.appServerMethods = [];
    input.diagnostics.consoleErrorCount = 1;
    input.artifacts.trace = null;

    const summary = buildElectronSmokeSummary(input);

    expect(summary.result).toBe("fail");
    expect(summary.failedStage).toBe("contract-assertions");
    expect(summary.failureClass).toBe("product");
    expect(summary.nextAction).toMatch(/rerun/);
    expect(summary.assertions.failed).toEqual(
      expect.arrayContaining([
        "startupVisible",
        "electronIpcAppServerBridgeUsed",
        "currentAppServerMethodObserved",
        "noConsoleErrors",
        "traceCaptured",
      ]),
    );
  });

  it("normalizes run ids and removes local path and query values", () => {
    expect(normalizeElectronSmokeRunId(" gate-a_1 ", "fallback")).toBe(
      "gate-a_1",
    );
    expect(() => normalizeElectronSmokeRunId("bad/id", "fallback")).toThrow(
      /LIME_GATE_RUN_ID/,
    );
    expect(
      sanitizeElectronSmokeLocation(
        "file:///Users/example/private/index.html?nativeStartup=1&token=secret",
      ),
    ).toBe("file:///index.html?nativeStartup&token");
    expect(
      sanitizeElectronSmokeLocation(
        "http://127.0.0.1:1420/workspace?nativeStartup=1",
      ),
    ).toBe("http://127.0.0.1:1420/workspace?nativeStartup");
  });

  it("recognizes both file and data startup documents", () => {
    expect(
      isElectronSmokeStartupUrl(
        "file:///tmp/profile/startup/main-window-startup.html",
      ),
    ).toBe(true);
    expect(isElectronSmokeStartupUrl("data:text/html,<main></main>")).toBe(
      true,
    );
    expect(
      isElectronSmokeStartupUrl("http://127.0.0.1:1420/?nativeStartup=1"),
    ).toBe(false);
  });
});
