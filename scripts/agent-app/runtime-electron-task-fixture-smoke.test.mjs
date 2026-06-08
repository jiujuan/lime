import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-app/runtime-electron-task-fixture-smoke.mjs",
    "utf8",
  );
}

describe("agent app runtime Electron task fixture smoke guard", () => {
  it("keeps the proof on the real Electron Desktop Host bridge", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain('"--use-mock-keychain"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain('typeof electronApi?.invoke === "function"');
    expect(content).toContain(
      'typeof electronApi?.supportsCommand === "function"',
    );
    expect(content).toContain("api.supportsCommand?.(command)");
  });

  it("drives Agent App task commands through Electron Host facade", () => {
    const content = readSmokeScript();

    expect(content).toContain('"agent_app_runtime_start_task"');
    expect(content).toContain('"agent_app_runtime_get_task"');
    expect(content).toContain('"agent_app_runtime_submit_host_response"');
    expect(content).toContain('"agent_app_runtime_cancel_task"');
    expect(content).toContain('api.invoke("agent_app_runtime_start_task"');
    expect(content).toContain('api.invoke("agent_app_runtime_get_task"');
    expect(content).toMatch(
      /api\.invoke\(\s*"agent_app_runtime_submit_host_response"/,
    );
    expect(content).toContain('api.invoke("agent_app_runtime_cancel_task"');
    expect(content).toContain(
      "request: { appId, taskId, sessionId, turnId }",
    );
    expect(content).toContain('action_type: "ask_user"');
    expect(content).toContain("action_scope");
    expect(content).toContain('taskStatus === "blocked"');
    expect(content).toContain('taskStatus === "running"');
    expect(content).toContain('taskStatus === "cancelled"');
  });

  it("uses a real external App Server backend fixture instead of mocks", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND: process.execPath");
    expect(content).toContain("APP_SERVER_BACKEND_ARGS");
    expect(content).toContain("writeExternalBackend(");
    expect(content).toContain('kind === "turnStart"');
    expect(content).toContain('kind === "actionRespond"');
    expect(content).toContain('kind === "turnCancel"');
    expect(content).toContain('"action.required"');
    expect(content).toContain('"action.resolved"');
    expect(content).toContain('"turn.canceled"');
    expect(content).toContain("hostOptionsAsterChatRequestSeen");
    expect(content).toContain("turnConfigMirrorSeen");
    expect(content).toContain("async function waitForBackendKinds(");
    expect(content).toContain("await waitForBackendKinds(backendLogPath, options)");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_runtime_submit_turn"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_runtime_get_thread_read"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_runtime_respond_action"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_runtime_interrupt_turn"',
    );
  });
});
