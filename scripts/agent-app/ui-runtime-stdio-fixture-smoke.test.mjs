import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-app/ui-runtime-stdio-fixture-smoke.mjs",
    "utf8",
  );
}

describe("agent app ui runtime stdio fixture smoke guard", () => {
  it("keeps fixture lifecycle on App Server JSON-RPC current methods", () => {
    const content = readSmokeScript();

    expect(content).toContain('"agentAppUiRuntime/status"');
    expect(content).toContain('"agentAppUiRuntime/start"');
    expect(content).toContain('"agentAppUiRuntime/stop"');
    expect(content).toContain('rpc.notify("initialized")');
    expect(content).toContain("/api/bootstrap");
    expect(content).toContain("entryUrl should be reachable");
    expect(content).toContain('statusRunning.result?.status === "running"');
    expect(content).toContain('statusAfterStop.result?.status === "stopped"');
  });

  it("uses temporary app data instead of legacy writes or real user data", () => {
    const content = readSmokeScript();

    expect(content).toContain("createTempRuntimeEnv()");
    expect(content).toContain("XDG_DATA_HOME");
    expect(content).toContain("APPDATA");
    expect(content).toContain("LOCALAPPDATA");
    expect(content).toContain("HOME");
    expect(content).toContain("seedInstalledState(");
    expect(content).toContain("agent-apps");
    expect(content).toContain("installed");
    expect(content).toContain("fs.rmSync(runtimeEnv.tempRoot");
    expect(content).not.toContain("saveInstalledAgentAppState");
    expect(content).not.toContain('"agent_app_save_installed_state"');
    expect(content).not.toContain('"agent_app_start_ui_runtime"');
    expect(content).not.toContain('"agent_app_get_ui_runtime_status"');
    expect(content).not.toContain('"agent_app_stop_ui_runtime"');
  });
});
