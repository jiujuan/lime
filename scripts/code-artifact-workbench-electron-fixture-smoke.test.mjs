import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/code-artifact-workbench-electron-fixture-smoke.mjs",
    "utf8",
  );
}

describe("code artifact workbench Electron fixture smoke guard", () => {
  it("keeps the smoke on real Electron Desktop Host IPC and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain('"--use-mock-keychain"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain(
      'typeof window.electronAPI?.invoke === "function"',
    );
    expect(content).toContain("window.electronAPI.supportsCommand");
    expect(content).toContain("app_server_handle_json_lines");
  });

  it("uses a local external fixture backend instead of a live provider or mock backend", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND: process.execPath");
    expect(content).toContain("writeFixtureBackend");
    expect(content).toContain('providerPreference: "fixture-provider"');
    expect(content).toContain('modelPreference: "fixture-model"');
    expect(content).toContain("liveProviderNotUsed");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('backendMode: "mock"');
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain("APP_SERVER_BACKEND_COMMAND: undefined");
  });

  it("creates a code artifact session and opens the GUI workbench", () => {
    const content = readSmokeScript();

    expect(content).toContain('"agentSession/start"');
    expect(content).toContain('"agentSession/update"');
    expect(content).toContain('"agentSession/turn/start"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain('type: "artifact.snapshot"');
    expect(content).toContain('type: "turn.final_done"');
    expect(content).toContain("Hello Lime Workbench");
    expect(content).toContain("CODE_ARTIFACT_WORKBENCH_DONE");
    expect(content).toContain("openFixtureSessionFromSidebar");
    expect(content).toContain("openWorkbench");
    expect(content).toContain("theme-workbench-harness-toggle");
    expect(content).toContain("general-workbench-sidebar");
    expect(content).toContain('window.dispatchEvent(new Event("focus"))');
  });

  it("does not use legacy commands or renderer mock fallback as success evidence", () => {
    const content = readSmokeScript();

    expect(content).not.toContain("agent_runtime_");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain("safeInvoke(");
  });
});
