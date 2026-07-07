import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readGateFiles() {
  return [
    "package.json",
    "scripts/agent-runtime/reopen-running-turn-cdp-gate.mjs",
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function readGateScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/reopen-running-turn-cdp-gate.mjs",
    "utf8",
  );
}

describe("reopen running turn CDP Gate", () => {
  it("is wired as a package smoke entry", () => {
    const content = readGateFiles();

    expect(content).toContain("smoke:reopen-running-turn-cdp-gate");
    expect(content).toContain(
      "node scripts/agent-runtime/reopen-running-turn-cdp-gate.mjs",
    );
  });

  it("claims Gate B controlled fixture only, not live Provider coverage", () => {
    const content = readGateFiles();

    expect(content).toContain("reopen-running-turn-cdp-gate.v1");
    expect(content).toContain("Gate B controlled fixture");
    expect(content).toContain("completedGateB: false");
    expect(content).toContain("completedGateB = true");
    expect(content).toContain("不证明 live Provider");
    expect(content).not.toContain("Gate B skeleton");
    expect(content).not.toContain("passed_skeleton");
    expect(content).not.toContain("not yet prove");
  });

  it("runs one Electron CDP scenario instead of stitching child gates", () => {
    const content = readGateScript();

    expect(content).toContain("chromium.connectOverCDP");
    expect(content).toContain("--remote-debugging-port");
    expect(content).toContain("reloadRendererDocument");
    expect(content).toContain("waitForTraceMethodAfter");
    expect(content).not.toContain("agent-session-recovery-cdp-gate.mjs");
    expect(content).not.toContain("claw-chat-current-fixture-smoke.mjs");
    expect(content).not.toContain("runNodeScript");
  });

  it("requires current runtime signals and forbids mock fallbacks", () => {
    const content = readGateScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_TURN_START");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_THREAD_RESUME");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_TURN_CANCEL");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_READ");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_LIST");
    expect(content).toContain("APP_SERVER_BACKEND_MODE=mock");
    expect(content).toContain("mockPriorityCommands");
    expect(content).toContain("defaultMocks");
    expect(content).toContain("invokeMockOnly");
    expect(content).toContain("legacy agent_runtime_* production truth");
  });

  it("asserts same-turn running and idle UI consistency across main/sidebar/inputbar", () => {
    const content = readGateFiles();

    expect(content).toContain("sameActiveTurn");
    expect(content).toContain("sameTurnAfterReload");
    expect(content).toContain("waitForGuiRunningConsistency");
    expect(content).toContain("waitForGuiIdleConsistency");
    expect(content).toContain("app-sidebar-conversation-runtime-status");
    expect(content).toContain("inputbarHasStopButton");
    expect(content).toContain("sidebarStatus === \"running\"");
    expect(content).toContain("canceledEventAfterReload");
  });
});
