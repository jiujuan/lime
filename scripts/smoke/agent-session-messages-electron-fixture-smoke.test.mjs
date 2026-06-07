import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/smoke/agent-session-messages-electron-fixture-smoke.mjs",
    "utf8",
  );
}

describe("agent session messages Electron fixture smoke guard", () => {
  it("keeps the proof on real Electron Desktop Host IPC and App Server JSON-RPC", () => {
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

  it("starts a real turn with an explicit external backend fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND: process.execPath");
    expect(content).toContain("APP_SERVER_BACKEND_ARGS: JSON.stringify");
    expect(content).toContain("writeFixtureBackend(");
    expect(content).toContain("readBackendLedger(");
    expect(content).toContain('input.kind === "turnStart"');
    expect(content).toContain('"agentSession/start"');
    expect(content).toContain('"agentSession/turn/start"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain("waitForReadModel");
    expect(content).toContain("readModelConverged");
    expect(content).toContain("readSnapshots");
    expect(content).toContain("backendTurnStartSeen");
  });

  it("asserts read.detail.messages and messages_count from current read model", () => {
    const content = readSmokeScript();

    expect(content).toContain("detail?.messages_count");
    expect(content).toContain("detailMessagesLength");
    expect(content).toContain("contentTextFromMessage");
    expect(content).toContain("summary.detailMessagesCount === 2");
    expect(content).toContain("summary.detailMessagesLength === 2");
    expect(content).toContain("summary.userMessageText === USER_TEXT");
    expect(content).toContain(
      "summary.assistantMessageText === ASSISTANT_TEXT",
    );
    expect(content).toContain("用户消息未从 App Server detail.messages 恢复");
    expect(content).toContain("助手消息未从 message.delta 投影");
  });

  it("does not use legacy commands or mock fallback as success evidence", () => {
    const content = readSmokeScript();

    expect(content).not.toContain("agent_runtime_");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('backendMode: "mock"');
    expect(content).not.toContain("--allow-live-provider");
  });
});
