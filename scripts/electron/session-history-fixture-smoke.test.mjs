import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/session-history-fixture-smoke.mjs",
    "utf8",
  );
}

describe("agent session history Electron fixture smoke guard", () => {
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

  it("uses deterministic session history methods without live model backend", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "unavailable"');
    expect(content).toContain('"initialize"');
    expect(content).toContain('"agentSession/start"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain('"agentSession/update"');
    expect(content).toContain('"agentSession/list"');
    expect(content).toContain(
      'const FORBIDDEN_METHODS = ["agentSession/turn/start"]',
    );
    expect(content).toContain("forbiddenMethodsSeen.length === 0");
    expect(content).toContain("ARCHIVE_FAIL_CLOSED_MESSAGE");
    expect(content).toContain("archived: true");
    expect(content).toContain("callExpectError");
    expect(content).toContain("archiveFailClosed");
    expect(content).toContain("listedSessionArchivedAt == null");
    expect(content).toContain("seedPersistedProjectionSession");
    expect(content).not.toContain("seedPersistedCurrentTimelineSession");
    expect(content).toContain("SQLITE3_BINARY");
    expect(content).toContain("PERSISTED_SESSION_ID");
    expect(content).toContain("launchElectronFixture");
    expect(content).toContain("closeElectronFixture");
    expect(content).toContain('"archive-readback"');
    expect(content).toContain('"unarchive-readback"');
    expect(content).toContain("sidecarRestartReadback");
    expect(content).toContain("persistedArchiveReopenSummary");
    expect(content).toContain("persistedUnarchiveReopenSummary");
    expect(content).toContain("archived: false");
    expect(content).toContain("PERSISTED_SESSION_FORBIDDEN_METHODS");
    expect(content).toContain("sidecarRestartReadback");
    expect(content).toContain("projection_1.sqlite");
    expect(content).toContain("projected_sessions");
    expect(content).toContain("projected_items");
    expect(content).toContain("projection_watermarks");
    expect(content).toContain("message.created");
    expect(content).toContain('"launch-electron-persisted-archive-readback"');
    expect(content).toContain('"launch-electron-persisted-unarchive-readback"');
    expect(content).toContain("SIDEBAR_GUI_REQUIRED_METHODS");
    expect(content).toContain("SIDEBAR_GUI_FORBIDDEN_METHODS");
    expect(content).toContain("runSidebarGuiArchivePhase");
    expect(content).toContain("runSettingsGuiRestorePhase");
    expect(content).toContain("sidebarGuiArchiveSummary");
    expect(content).toContain("settingsGuiRestoreSummary");
    expect(content).toContain("parseJsonRpcRequestsFromInvokeTrace");
    expect(content).toContain("OPENED_PROJECT_IDS_KEY");
    expect(content).toContain("agent-opened-project-ids-changed");
    expect(content).toContain("app-sidebar-conversation-menu-archive");
    expect(content).toContain("settings-archived-conversation-restore");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).not.toContain("APP_SERVER_BACKEND_COMMAND");
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain("seedLegacyAgentMessagesSession");
    expect(content).not.toContain("runLegacyAgentMessagesBackfillPhase");
    expect(content).not.toContain("assertLegacyBackfillPhase");
    expect(content).not.toContain("LEGACY_SESSION_ID");
    expect(content).not.toContain("agent_messages");
    expect(content).not.toContain("a2ui_forms");
  });

  it("guards current detail arrays that previously crashed history restore", () => {
    const content = readSmokeScript();

    expect(content).toContain("detail.turns");
    expect(content).toContain("detail.items");
    expect(content).toContain("detail.queued_turns");
    expect(content).toContain("detail.thread_read");
    expect(content).toContain("不是数组");
  });

  it("does not use legacy commands or mock fallback as success evidence", () => {
    const content = readSmokeScript();

    expect(content).not.toContain("agent_runtime_");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain('backendMode: "mock"');
  });
});
