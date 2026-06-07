import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/code-artifact-workbench-fixture-smoke.mjs",
    "utf8",
  );
}

describe("code artifact workbench Electron fixture smoke guard", () => {
  it("keeps the smoke on real Electron Desktop Host IPC and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain("waitForAppUrlReady");
    expect(content).toContain('logStage("wait-app-url")');
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
    expect(content).toContain('type: "tool.started"');
    expect(content).toContain('type: "tool.result"');
    expect(content).toContain("TOOL_CALL_ID");
    expect(content).toContain("TOOL_OUTPUT_PREVIEW");
    expect(content).toContain("collectToolCalls");
    expect(content).toContain("hasToolTimelineProjection");
    expect(content).toContain("toolTimelineProjectionPersisted");
    expect(content).toContain("hasGuiToolTimelineEvidence");
    expect(content).toContain("guiToolTimelineEvidencePresent");
    expect(content).toContain("toolTimelineEvidencePresent");
    const toolTimelineEvidenceAssertion = content.slice(
      content.indexOf("toolTimelineEvidencePresent:"),
      content.indexOf(
        "noInvokeErrors:",
        content.indexOf("toolTimelineEvidencePresent:"),
      ),
    );
    expect(toolTimelineEvidenceAssertion).not.toContain(
      "toolTimelineProjectionPersisted",
    );
    expect(toolTimelineEvidenceAssertion).toContain(
      "guiToolTimelineEvidencePresent",
    );
    expect(content).toContain('type: "artifact.snapshot"');
    expect(content).toContain('type: "turn.final_done"');
    expect(content).toContain("Hello Lime Workbench");
    expect(content).toContain("CODE_ARTIFACT_WORKBENCH_DONE");
    expect(content).toContain("openFixtureSessionFromSidebar");
    expect(content).toContain("openWorkbench");
    expect(content).toContain("hasUserPrompt");
    expect(content).toContain("hasTaskCenterShell");
    expect(content).toContain("hasTaskCenterWorkbenchTab");
    expect(content).toContain("task-center-chrome-shell");
    expect(content).toContain("task-center-tab-workbench");
    expect(content).toContain("theme-workbench-harness-toggle");
    expect(content).toContain("general-workbench-sidebar");
    expect(content).toContain("hasWorkbenchEntry");
    expect(content).toContain("artifact-workbench-shell");
    expect(content).toContain("canvas-workbench-shell");
    expect(content).toContain("canvas-workbench-layout");
    expect(content).toContain("canvas-workbench-panel-");
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
