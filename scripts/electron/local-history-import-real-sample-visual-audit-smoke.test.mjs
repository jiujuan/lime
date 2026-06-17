import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/local-history-import-real-sample-visual-audit-smoke.mjs",
    "utf8",
  );
}

function readSharedHelper() {
  return fs.readFileSync(
    "scripts/electron/lib/local-history-import-smoke-utils.mjs",
    "utf8",
  );
}

describe("local history import real sample visual audit smoke guard", () => {
  it("uses real Electron and App Server JSON-RPC with an isolated runtime", () => {
    const content = readSmokeScript();

    expect(content).toContain('import { _electron as electron }');
    expect(content).toContain("electron.launch({");
    expect(content).toContain("resolveDevAppServerBinary");
    expect(content).toContain("resolveElectronAppServerRuntimeEnv");
    expect(content).toContain('APP_SERVER_BACKEND_MODE: "unavailable"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("createTempRuntimeEnv(");
    expect(content).toContain("waitForRendererReady");
    expect(content).toContain("initializeAppServer");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain("agent_runtime_");
  });

  it("reads the real source as scan and preview, then commits only inside the isolated app data", () => {
    const content = readSmokeScript();

    expect(content).toContain('sourceClient: SOURCE_CLIENT');
    expect(content).toContain('"conversationImport/source/scan"');
    expect(content).toContain('"conversationImport/thread/preview"');
    expect(content).toContain('"conversationImport/thread/commit"');
    expect(content).toContain('confirmed: true');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain("scorePreview");
    expect(content).toContain("willImportTimelineItems");
    expect(content).toContain("willImportAttachments");
    expect(content).toContain("readModelSummary");
    expect(content).toContain("readSummary.itemCounts");
  });

  it("opens the imported session through the GUI and audits multiple viewports and scroll positions", () => {
    const content = readSmokeScript();
    const helper = readSharedHelper();

    expect(content).toContain("openSessionFromSidebar");
    expect(content).toContain("inspectImportedConversationVisualState");
    expect(content).toContain('const SCROLL_POSITIONS = ["top", "middle", "bottom"]');
    expect(content).toContain('{ label: "desktop", width: 1440, height: 1000 }');
    expect(content).toContain('{ label: "compact", width: 1100, height: 820 }');
    expect(content).toContain('{ label: "narrow", width: 820, height: 900 }');
    expect(content).toContain("inputbarVisible");
    expect(content).toContain("messageListVisible");
    expect(content).toContain("hasCommandRecordVisible");
    expect(content).toContain("hasPatchText");
    expect(content).toContain("hasSearchEvidence");
    expect(content).toContain("hasApprovalText");
    expect(content).toContain("visibleTextCaptured");
    expect(helper).toContain("page.screenshot({ path: screenshotPath, fullPage: true })");
    expect(helper).toContain("scrollMessageSurface");
    expect(helper).toContain('[data-testid="app-sidebar-conversation-open"]');
    expect(helper).toContain('textarea[name="agent-chat-message"]');
  });

  it("guards product-facing source leak boundaries without writing raw conversation content to evidence", () => {
    const content = readSmokeScript();
    const helper = readSharedHelper();

    expect(content).toContain("buildForbiddenSourceLeakTokens");
    expect(content).toContain('"sourceThreadId"');
    expect(content).toContain('"sourcePath"');
    expect(content).toContain('"rollout_path"');
    expect(content).toContain('"Approve Codex command"');
    expect(content).toContain('"Codex 导入"');
    expect(content).not.toContain('    ".codex",\n    "state_5.sqlite"');
    expect(content).toContain("sanitizeOpenSnapshot");
    expect(content).toContain("summarizeCommitResult");
    expect(content).toContain("readModelSummary: readModel.summary");
    expect(content).not.toContain("readModel,");
    expect(content).not.toContain("commit,");
    expect(helper).toContain("bodyText: undefined");
    expect(helper).toContain("leakedTokens");
  });
});
