import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-app-ui-runtime-electron-fixture-smoke.mjs",
    "utf8",
  );
}

describe("agent app ui runtime Electron fixture smoke guard", () => {
  it("keeps the GUI proof on the real Electron Desktop Host bridge", () => {
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
    expect(content).toContain('[data-testid="app-sidebar"]');
  });

  it("uses isolated fixture app data and the formal runtime iframe surface", () => {
    const content = readSmokeScript();

    expect(content).toContain("createTempRuntimeEnv()");
    expect(content).toContain("XDG_DATA_HOME");
    expect(content).toContain("APPDATA");
    expect(content).toContain("LOCALAPPDATA");
    expect(content).toContain("HOME");
    expect(content).toContain("seedInstalledState(");
    expect(content).toContain("agent-apps");
    expect(content).toContain("installed");
    expect(content).toContain("stableStringifyAgentAppValue(");
    expect(content).toContain("buildAgentAppPackageHash(");
    expect(content).toContain("buildAgentAppManifestHash(");
    expect(content).toContain("package-fnv1a-");
    expect(content).toContain("manifest-fnv1a-");
    expect(content).toContain('installMode: "in_lime"');
    expect(content).toContain("runtimeProfileSummary");
    expect(content).toContain('supportedModes: ["in_lime"]');
    expect(content).toContain("runtimeRequirements");
    expect(content).toContain("entryReadiness");
    expect(content).toContain("supportedCapabilities");
    expect(content).toContain("readinessHints");
    expect(content).toContain("provenance");
    expect(content).toContain('uiPath: "./dist/ui"');
    expect(content).toContain("waitForAgentAppSidebarEntry(");
    expect(content).toContain("clickAgentAppSidebarEntry(");
    expect(content).toContain('[data-testid="agent-app-runtime-surface"]');
    expect(content).toContain('[data-testid="agent-app-runtime-frame"]');
    expect(content).toContain("waitForFixtureFrameContent(");
    expect(content).toContain("内容工厂");
    expect(content).toContain("工作台状态");
    expect(content).toContain("fs.rmSync(runtimeEnv.tempRoot");
    expect(content).not.toContain("sha256:fixture-agent-app-ui-runtime");
  });

  it("proves current App Server JSON-RPC methods and rejects legacy Agent App commands", () => {
    const content = readSmokeScript();

    expect(content).toContain('"app_server_handle_json_lines"');
    expect(content).toContain('"agentAppInstalled/list"');
    expect(content).toContain('"agentAppUiRuntime/start"');
    expect(content).toContain('"agentAppUiRuntime/status"');
    expect(content).toContain('"agentAppUiRuntime/stop"');
    expect(content).toContain("summarizeTraceEntries(");
    expect(content).toContain("legacyAgentAppCommandsSeen.length === 0");
    expect(content).toContain("missingRequiredAppServerMethods");
    expect(content).toContain("LEGACY_AGENT_APP_COMMANDS");
    expect(content).toContain('"agent_app_save_installed_state"');
    expect(content).toContain('"agent_app_start_ui_runtime"');
    expect(content).toContain('"agent_app_get_ui_runtime_status"');
    expect(content).toContain('"agent_app_stop_ui_runtime"');
    expect(content).not.toContain("saveInstalledAgentAppState");
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_app_start_ui_runtime"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_app_get_ui_runtime_status"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_app_stop_ui_runtime"',
    );
  });
});
