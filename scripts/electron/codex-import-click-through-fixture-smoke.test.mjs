import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/codex-import-click-through-fixture-smoke.mjs",
    "utf8",
  );
}

describe("codex import click-through Electron fixture smoke guard", () => {
  it("drives the real sidebar import dialog instead of direct import API only", () => {
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
    expect(content).toContain("window.electronAPI.supportsCommand");
    expect(content).toContain("app_server_handle_json_lines");
    expect(content).toContain("app-sidebar-import-conversation-button");
    expect(content).toContain("app-sidebar-conversation-import-dialog");
    expect(content).toContain("app-sidebar-conversation-import-confirm");
    expect(content).toContain('textarea[name="agent-chat-message"]');
    expect(content).toContain("clickSidebarImport");
    expect(content).toContain("waitForImportPreview");
    expect(content).toContain("confirmImport");
    expect(content).toContain("sendFollowUpFromGui");
  });

  it("creates a temporary Codex home fixture that scan can discover", () => {
    const content = readSmokeScript();

    expect(content).toContain("CODEX_HOME: sourceRoot");
    expect(content).toContain("session_index.jsonl");
    expect(content).toContain("writeSessionIndexFixture");
    expect(content).toContain("writeCodexRolloutFixture");
    expect(content).toContain('type: "session_meta"');
    expect(content).toContain('type: "reasoning"');
    expect(content).toContain('type: "function_call"');
    expect(content).toContain('type: "web_search_call"');
    expect(content).toContain('type: "patch_apply_end"');
    expect(content).toContain('type: "exec_approval_request"');
    expect(content).toContain("Codex 细节还原");
    expect(content).toContain("IMPORTED_REASONING_TEXT");
    expect(content).toContain("hasCommandText");
    expect(content).toContain("hasPatchText");
    expect(content).toContain("hasSearchEvidence");
    expect(content).toContain("hasApprovalText");
  });

  it("continues the imported session through the GUI inputbar and external backend", () => {
    const content = readSmokeScript();

    expect(content).toContain('"conversationImport/source/scan"');
    expect(content).toContain('"conversationImport/thread/preview"');
    expect(content).toContain('"conversationImport/thread/commit"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain('"agentSession/turn/start"');
    expect(content).toContain("extractInvokeTraceMethods");
    expect(content).toContain("REQUIRED_BACKEND_METHODS");
    expect(content).toContain("CODEX_IMPORT_CLICK_THROUGH_DONE");
    expect(content).toContain("backendMetadataImported");
    expect(content).toContain("backendCwd === IMPORTED_CWD");
    expect(content).toContain("hasContinueUserMessage");
    expect(content).toContain("hasContinueAssistantMessage");
  });

  it("uses external fixture backend only, not live provider, legacy runtime, or mock fallback", () => {
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
