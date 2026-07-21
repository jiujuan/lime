import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildProjectGateCoverage } from "../lib/project-gate-coverage-core.mjs";
import {
  buildMigrationProviderCreateParams,
  buildMigrationProviderUpdateParams,
  createMigrationSurfaceEvidence,
  createStandaloneProjectGateRunId,
  filterInvokeTraceEntriesSince,
  markMigrationSurfaceEvidenceFail,
  markMigrationSurfaceEvidencePass,
  projectMigrationProviderInfo,
  assertMigrationElectronEvidence,
  assertPermissionFailureElectronEvidence,
  summarizeMigrationElectronEvidence,
  summarizePermissionFailureElectronEvidence,
  validateProjectGateRunId,
} from "./lib/settings-provider-migration-fixture-core.mjs";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/settings-provider-migration-fixture-smoke.mjs",
    "utf8",
  );
}

function readFixtureCore() {
  return fs.readFileSync(
    "scripts/electron/lib/settings-provider-migration-fixture-core.mjs",
    "utf8",
  );
}

describe("settings provider migration Electron fixture smoke guard", () => {
  it("keeps the smoke on real Electron Desktop Host IPC and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain("APP_SERVER_HANDLE_JSON_LINES_COMMAND");
    expect(content).toContain("app_server_handle_json_lines");
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain(
      'typeof window.electronAPI?.invoke === "function"',
    );
    expect(content).toContain("window.electronAPI.supportsCommand");
  });

  it("uses current model provider methods without legacy Provider commands", () => {
    const content = readSmokeScript();
    const coreContent = readFixtureCore();
    const combined = `${content}\n${coreContent}`;

    expect(combined).toContain('APP_SERVER_BACKEND_MODE: "unavailable"');
    expect(combined).not.toContain("APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP");
    expect(combined).not.toContain("PRODUCT_DB_MIGRATION_CLEANUP_POLICY");
    expect(coreContent).toContain('"modelProvider/create"');
    expect(coreContent).toContain('"modelProvider/update"');
    expect(coreContent).toContain('"modelProviderKey/create"');
    expect(coreContent).toContain('"modelProviderUiState/write"');
    expect(coreContent).toContain('"modelProvider/list"');
    expect(coreContent).toContain('"modelProviderUiState/read"');
    expect(content).toContain("oldProductDbUserSchemaObjectCount");
    expect(content).toContain("readProductDbUserSchemaObjectCount");
    expect(content).toContain("迁移启动流程修改了旧 Product DB");
    expect(combined).toContain("migration-manifest.json");
    expect(combined).toContain("storage-migration.v1");
    expect(combined).toContain("database-path-v1");
    expect(combined).toContain("cleanupAuthorizedAt");
    expect(combined).not.toContain(".migration_completed");
    const requiredMethodsBlock = coreContent.slice(
      coreContent.indexOf("const SEED_REQUIRED_METHODS"),
      coreContent.indexOf("const ELECTRON_REQUIRED_METHODS"),
    );
    const electronMethodsBlock = coreContent.slice(
      coreContent.indexOf("const ELECTRON_REQUIRED_METHODS"),
      coreContent.indexOf("PROJECT_GATE_RUN_ID_PATTERN"),
    );
    expect(requiredMethodsBlock).not.toContain("api_key_provider");
    expect(electronMethodsBlock).not.toContain("api_key_provider");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });

  it("writes partial SHELL-02 evidence under a validated project run-id", () => {
    const content = readSmokeScript();
    const combined = `${content}\n${readFixtureCore()}`;

    expect(content).toContain("LIME_GATE_RUN_ID");
    expect(combined).toContain('surfaceId: "SHELL-02"');
    expect(combined).toContain('proof: "gate-b-f"');
    expect(combined).toContain("complete: false");
    expect(combined).toContain('claimScope: "provider-migration-only"');
    expect(combined).toContain(
      'missingScenarios: ["restart", "permission-failure"]',
    );
    expect(combined).toContain('"project-gates"');
    expect(combined).toContain('request.transport === "electron-ipc"');
    expect(content).toContain('page.on("pageerror"');
    expect(content).toContain('page.on("crash"');
    expect(content).toContain("applyPassingMigrationSurfaceEvidence");
    expect(content).toContain("applyFailedMigrationSurfaceEvidence");
    expect(content).toContain("restart-electron-with-same-user-data");
    expect(content).toContain("read-persisted-provider-after-restart");
    expect(content).toContain("restartScreenshotPath");
    expect(readFixtureCore()).not.toContain(
      'summary.missingScenarios = ["permission-failure"]',
    );
    expect(content).toContain(
      "launch-electron-with-read-only-app-server-data-dir",
    );
    expect(content).toContain("observe-user-visible-permission-failure");
    expect(content).toContain("provider-load-error");
    expect(content).toContain("requiredMethods: SEED_REQUIRED_METHODS");
    expect(readFixtureCore()).toContain("summary.surfaceProof.complete = true");
    expect(readFixtureCore()).toContain("summary.missingScenarios = []");
    expect(
      content.indexOf("seed-permission-failure-product-database"),
    ).toBeLessThan(content.indexOf("launch-electron-and-trigger-migration"));
    expect(
      content.indexOf("const uiStateResult = await appServerCallFromPage"),
    ).toBeLessThan(content.indexOf("await openProviderSettings"));
    expect(content.indexOf("await waitForProviderVisible")).toBeLessThan(
      content.indexOf("const guiInvokeBuffers"),
    );
    expect(content.indexOf("const guiInvokeBuffers")).toBeLessThan(
      content.indexOf(
        "const electronEvidence = summarizeMigrationElectronEvidence",
      ),
    );
  });

  it("validates project run ids before creating evidence or temp state", () => {
    expect(validateProjectGateRunId("candidate-20260716.1")).toBe(
      "candidate-20260716.1",
    );
    expect(() => validateProjectGateRunId("../escape")).toThrow(
      /LIME_GATE_RUN_ID/,
    );
    expect(
      createStandaloneProjectGateRunId({
        now: new Date("2026-07-16T06:05:11.832Z"),
        random: () => 0.123456,
      }),
    ).toBe("standalone-shell-02-20260716T060511832Z-123456");
  });

  it("uses the current top-level model provider request DTOs", () => {
    expect(buildMigrationProviderCreateParams()).toEqual({
      name: "Migration Fixture Provider",
      providerType: "openai",
      apiHost: "https://migration-fixture.invalid/v1",
    });
    expect(buildMigrationProviderUpdateParams("custom-fixture")).toEqual({
      providerId: "custom-fixture",
      customModels: ["migration-fixture-model"],
      sortOrder: 1,
    });
    expect(buildMigrationProviderCreateParams()).not.toHaveProperty("provider");
    expect(
      buildMigrationProviderUpdateParams("custom-fixture"),
    ).not.toHaveProperty("patch");
    expect(
      projectMigrationProviderInfo({
        id: "custom-fixture",
        name: "Fixture",
        providerType: "openai",
        apiHost: "https://example.invalid/v1",
        apiKeyCount: 1,
        customModels: ["fixture-model"],
        api_key_count: 99,
        custom_models: ["legacy-model"],
      }),
    ).toEqual({
      id: "custom-fixture",
      name: "Fixture",
      providerType: "openai",
      apiHost: "https://example.invalid/v1",
      apiKeyCount: 1,
      customModels: ["fixture-model"],
    });
  });

  it("requires every current read method to be observed over Electron IPC", () => {
    const providerId = "custom-fixture";
    const listResult = {
      method: "modelProvider/list",
      result: {
        providers: [
          {
            id: providerId,
            name: "Migration Fixture Provider",
            providerType: "openai",
            apiHost: "https://migration-fixture.invalid/v1",
            apiKeyCount: 1,
            customModels: ["migration-fixture-model"],
          },
        ],
      },
    };
    const uiStateResult = {
      method: "modelProviderUiState/read",
      result: { value: providerId },
    };
    const makeTrace = (method) => ({
      command: "app_server_handle_json_lines",
      transport: "electron-ipc",
      status: "fulfilled",
      args_preview: {
        request: {
          lines: [
            JSON.stringify({ jsonrpc: "2.0", id: method, method, params: {} }),
          ],
        },
      },
    });
    const incomplete = summarizeMigrationElectronEvidence({
      listResult,
      uiStateResult,
      traceRaw: JSON.stringify([makeTrace("modelProviderUiState/read")]),
    });

    expect(incomplete.missingRequiredMethods).toEqual(["modelProvider/list"]);
    expect(() =>
      assertMigrationElectronEvidence(incomplete, providerId),
    ).toThrow(/modelProvider\/list/);

    const complete = summarizeMigrationElectronEvidence({
      listResult,
      uiStateResult,
      traceRaw: JSON.stringify([
        makeTrace("modelProvider/list"),
        makeTrace("modelProviderUiState/read"),
      ]),
    });
    expect(complete.missingRequiredMethods).toEqual([]);
    expect(() =>
      assertMigrationElectronEvidence(complete, providerId),
    ).not.toThrow();
  });

  it("requires permission failure to be visible on the current Electron IPC path", () => {
    const trace = {
      command: "app_server_handle_json_lines",
      transport: "electron-ipc",
      status: "error",
      error: "app-server sidecar exited after database migration failed",
      args_preview: {
        request: {
          lines: [
            JSON.stringify({
              jsonrpc: "2.0",
              id: "permission",
              method: "modelProvider/list",
              params: {},
            }),
          ],
        },
      },
    };
    const evidence = summarizePermissionFailureElectronEvidence({
      traceRaw: JSON.stringify([trace]),
      errorRaw: JSON.stringify([trace]),
      consoleErrors: ["数据库迁移失败，拒绝回退旧路径"],
    });

    expect(evidence).toMatchObject({
      appServerHandleJsonLinesSeen: true,
      electronIpcSeen: true,
      failedRequestMethods: ["modelProvider/list"],
      invokeErrorCount: 1,
      failureCauseSeen: true,
    });
    expect(() =>
      assertPermissionFailureElectronEvidence(evidence),
    ).not.toThrow();
  });

  it("scopes persisted invoke buffers to the current Electron launch", () => {
    const current = {
      timestamp: "2026-07-16T15:41:12.000Z",
      command: "app_server_handle_json_lines",
    };
    const missingTimestamp = { command: "diagnostic-without-timestamp" };

    expect(
      filterInvokeTraceEntriesSince(
        JSON.stringify([
          {
            timestamp: "2026-07-16T15:41:11.000Z",
            command: "app_server_drain_events",
          },
          current,
          missingTimestamp,
        ]),
        "2026-07-16T15:41:11.500Z",
      ),
    ).toEqual([current, missingTimestamp]);
    expect(() =>
      filterInvokeTraceEntriesSince("[]", "not-a-timestamp"),
    ).toThrow(/invalid Electron launch timestamp/);
  });

  it("is recognized by coverage without counting partial migration as complete", () => {
    const runId = "candidate-shell-02";
    const summary = createMigrationSurfaceEvidence(runId);
    markMigrationSurfaceEvidencePass(summary, [
      "electronIpcTransport",
      "providerVisible",
    ]);
    const manifest = {
      schemaVersion: 1,
      surfaces: [
        {
          id: "SHELL-02",
          priority: "P0",
          owners: ["app-paths", "desktop-host"],
          requiredProofs: ["gate-b-f"],
        },
      ],
    };
    const coverage = buildProjectGateCoverage({
      candidateRunId: runId,
      manifest,
      evidenceRecords: [{ file: "shell-02/summary.json", value: summary }],
    });

    expect(coverage.evidence).toEqual({
      recognized: 1,
      counting: 0,
      failed: 0,
    });
    expect(coverage.surfaces[0]).toMatchObject({
      status: "unstarted",
      completedProofs: [],
      missingProofs: ["gate-b-f"],
    });

    markMigrationSurfaceEvidenceFail(summary, new Error("fixture failed"));
    const failedCoverage = buildProjectGateCoverage({
      candidateRunId: runId,
      manifest,
      evidenceRecords: [{ file: "shell-02/summary.json", value: summary }],
    });
    expect(failedCoverage.surfaces[0].status).toBe("blocked");
  });
});
