import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readCdpGateScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/agent-session-recovery-cdp-gate.mjs",
    "utf8",
  );
}

describe("agent session recovery CDP Gate guard", () => {
  it("launches real Electron and attaches through CDP for Gate B evidence", () => {
    const content = readCdpGateScript();

    expect(content).toContain("import { _electron as electron, chromium }");
    expect(content).toContain("ensureElectronFixtureBuild");
    expect(content).toContain("electron.launch({");
    expect(content).toContain("--remote-debugging-port=");
    expect(content).toContain("chromium.connectOverCDP");
    expect(content).toContain("findElectronCdpPage");
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain(
      'typeof window.electronAPI?.invoke === "function"',
    );
    expect(content).toContain("window.electronAPI.supportsCommand");
    expect(content).toContain("app_server_handle_json_lines");
  });

  it("proves canonical App Server thread recovery without live Provider", () => {
    const content = readCdpGateScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "unavailable"');
    expect(content).toContain('LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0"');
    expect(content).toContain('LIME_REAL_API_TEST: "0"');
    expect(content).toContain('"thread/start"');
    expect(content).toContain('"thread/read"');
    expect(content).toContain('"thread/list"');
    expect(content).toContain('"thread/resume"');
    expect(content).toContain("model: FIXTURE_MODEL");
    expect(content).toContain("modelProvider: FIXTURE_PROVIDER");
    expect(content).toContain("threadId: identity.threadId");
    expect(content).toContain(
      `await openSessionFromSidebar(page, options, requestLog, {
        sessionId: identity.sessionId,
        threadId: identity.threadId,`,
    );
    expect(content).toContain("includeTurns: true");
    expect(content).toContain("excludeTurns: true");
    expect(content).toContain("initialTurnsPage");
    expect(content).toContain("threadResumeNoLegacyFields");
    expect(content).toContain("threadResumeDoesNotRestartThread");
    expect(content).toContain("workspace/default/ensure");
    expect(content).toContain("noTurnStart");
    expect(content).not.toContain('"agentSession/update"');
    expect(content).not.toContain("sessionId: SESSION_ID");
    expect(content).not.toContain("threadId: THREAD_ID");
    expect(content).not.toContain("historyLimit:");
    expect(content).not.toContain("optionalThreadResume");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });

  it("stores only sanitized CDP and JSON-RPC summaries", () => {
    const content = readCdpGateScript();

    expect(content).toContain("summarizeTraceMessages");
    expect(content).toContain("promptLength");
    expect(content).toContain("sanitizeJson");
    expect(content).toContain("traceSummaryPath");
    expect(content).toContain(".lime");
    expect(content).toContain("cdp-evidence");
    expect(content).toContain("claimBoundary");
    expect(content).toContain("Gate B");
    expect(content).not.toContain("system_prompt");
    expect(content).not.toContain("apiKey:");
  });
});
