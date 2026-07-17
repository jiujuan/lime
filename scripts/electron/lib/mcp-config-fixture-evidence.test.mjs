import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyPassingMcpSettingsScenarioEvidence,
  createMcpSettingsScenarioEvidence,
  parseMcpConfigFixtureArgs,
} from "./mcp-config-fixture-evidence.mjs";

const RUN_ID = "standalone-settings-b-test";

function defaults() {
  return {
    runId: null,
    evidenceDir: null,
    prefix: "mcp-config-fixture",
    timeoutMs: 120_000,
    intervalMs: 250,
    keepTemp: false,
  };
}

function baseEvidence() {
  return createMcpSettingsScenarioEvidence({
    candidateRunId: RUN_ID,
    startedAt: "2026-07-17T00:00:00.000Z",
    prefix: "mcp-config-fixture",
  });
}

function passingFacts(overrides = {}) {
  return {
    completedAt: "2026-07-17T00:01:00.000Z",
    electronRenderer: true,
    preloadInvoke: true,
    electronEvidence: {
      appServerHandleJsonLinesSeen: true,
      electronIpcSeen: true,
      electronIpcHitCount: 2,
      electronIpcRequestMethods: ["mcpServer/create", "mcpServer/list"],
      legacyMcpCommandsSeen: [],
      mockFallbackHitCount: 0,
    },
    guiCreatedContext7: true,
    context7Server: { name: "Context7" },
    consoleErrors: [],
    pageErrors: [],
    invokeErrorCount: 0,
    screenshotWritten: true,
    ...overrides,
  };
}

describe("MCP Settings Gate B evidence", () => {
  it("binds default evidence to a validated project Gate run", () => {
    const options = parseMcpConfigFixtureArgs(["--run-id", RUN_ID], {
      defaults: defaults(),
      cwd: "/repo",
    });

    expect(options.evidenceDir).toBe(
      path.join(
        "/repo",
        ".lime",
        "qc",
        "project-gates",
        RUN_ID,
        "settings-mcp-create-list",
      ),
    );
  });

  it("starts fail closed and completes only from structured Electron facts", () => {
    const evidence = baseEvidence();

    expect(evidence.settingsScenarioProof).toEqual({
      scenarioId: "mcp-create-list",
      complete: false,
    });

    applyPassingMcpSettingsScenarioEvidence(evidence, passingFacts());

    expect(evidence.result).toBe("pass");
    expect(evidence.settingsScenarioProof.complete).toBe(true);
    expect(evidence.bridge).toMatchObject({
      electron: true,
      preloadInvoke: true,
      transport: "electron-ipc",
      command: "app_server_handle_json_lines",
      methods: ["mcpServer/create", "mcpServer/list"],
    });
    expect(evidence.errors).toMatchObject({
      consoleErrorCount: 0,
      pageErrorCount: 0,
      invokeErrorCount: 0,
      legacyCommandHitCount: 0,
      mockFallbackHitCount: 0,
    });
  });

  it("rejects missing Electron IPC and mock fallback hits", () => {
    expect(() =>
      applyPassingMcpSettingsScenarioEvidence(
        baseEvidence(),
        passingFacts({
          electronEvidence: {
            ...passingFacts().electronEvidence,
            electronIpcSeen: false,
            electronIpcHitCount: 0,
            mockFallbackHitCount: 1,
          },
        }),
      ),
    ).toThrow(/electronIpcTransport.*appServerIpcHit.*mockFallbackZero/);
  });

  it("rejects another run-id and unsafe prefixes", () => {
    expect(() =>
      parseMcpConfigFixtureArgs(["--run-id", "../escape"], {
        defaults: defaults(),
        cwd: "/repo",
      }),
    ).toThrow(/--run-id/);
    expect(() =>
      parseMcpConfigFixtureArgs(["--prefix", "../escape"], {
        defaults: defaults(),
        cwd: "/repo",
      }),
    ).toThrow(/--prefix/);
  });
});
