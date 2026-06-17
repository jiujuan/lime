import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/codex-import-continuation-fixture-smoke.mjs",
    "utf8",
  );
}

describe("codex import continuation Electron fixture smoke guard", () => {
  it("keeps the smoke on real Electron Desktop Host IPC and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("resolveDevAppServerBinary");
    expect(content).toContain("APP_SERVER_BIN: appServerBinary");
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

  it("imports Codex rollout details then continues the same current session", () => {
    const content = readSmokeScript();

    expect(content).toContain('"conversationImport/thread/commit"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain('"agentSession/turn/start"');
    expect(content).toContain("writeCodexRolloutFixture");
    expect(content).toContain('type: "reasoning"');
    expect(content).toContain('type: "function_call"');
    expect(content).toContain('type: "web_search_call"');
    expect(content).toContain('type: "patch_apply_end"');
    expect(content).toContain('type: "exec_approval_request"');
    expect(content).toContain("hasReasoningItem");
    expect(content).toContain("hasCommandItem");
    expect(content).toContain("hasPatchItem");
    expect(content).toContain("hasWebSearchItem");
    expect(content).toContain("hasApprovalItem");
    expect(content).toContain("continuedReadSessionId === summary.sessionId");
    expect(content).toContain("backendMetadataImported");
    expect(content).toContain('summary.backendCwd === "/workspace/imported-codex"');
  });

  it("uses external fixture backend only, not legacy runtime or mock fallback", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND: process.execPath");
    expect(content).toContain("writeFixtureBackend");
    expect(content).toContain('input.kind === "turnStart"');
    expect(content).toContain('type: "message.delta"');
    expect(content).toContain('type: "turn.completed"');
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('backendMode: "mock"');
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain("agent_runtime_");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });
});
