import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/current-fixture-regression-smoke.mjs",
    "utf8",
  );
}

describe("agent runtime current fixture regression smoke guard", () => {
  it("runs current Agent Runtime regression tests through Vitest smoke runner", () => {
    const content = readSmokeScript();

    expect(content).toContain("runVitestSmoke");
    expect(content).toContain("runNodeSmoke");
    expect(content).toContain("runElectronFixtureSmoke");
    expect(content).toContain(
      "src/components/agent/chat/hooks/agentChatHistory.test.ts",
    );
    expect(content).toContain(
      "src/components/agent/chat/hooks/agentSessionScopedStorage.test.ts",
    );
    expect(content).toContain(
      "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts",
    );
    expect(content).toContain(
      "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts",
    );
    expect(content).toContain(
      "src/components/agent/chat/components/MessageList.test.tsx",
    );
  });

  it("keeps Electron fixture guards in the current regression set", () => {
    const content = readSmokeScript();

    expect(content).toContain(
      "scripts/electron/session-history-fixture-smoke.test.mjs",
    );
    expect(content).toContain(
      "scripts/electron/code-artifact-workbench-fixture-smoke.test.mjs",
    );
    expect(content).toContain(
      "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs",
    );
    expect(content).toContain("Electron/App Server fixture smoke guard");
    expect(content).toContain("Claw GUI current fixture guard");
  });

  it("runs the real Electron cancel-then-continue Claw fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("Claw 停止后同会话继续输出 Electron fixture");
    expect(content).toContain(
      "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    );
    expect(content).toContain("--scenario");
    expect(content).toContain("cancel-then-continue");
    expect(content).toContain(
      "claw-chat-current-fixture-cancel-then-continue-regression",
    );
    expect(content).toContain("停止后同会话继续输出 Electron fixture");
  });

  it("runs the real Electron Plan history hydrate Claw fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain(
      "Claw Plan revisioned history hydrate Electron fixture",
    );
    expect(content).toContain(
      "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    );
    expect(content).toContain("--scenario");
    expect(content).toContain("plan");
    expect(content).toContain(
      "claw-chat-current-fixture-plan-history-hydrate-regression",
    );
    expect(content).toContain(
      "Plan revisioned thread item + history hydrate Electron fixture",
    );
  });

  it("runs the real Coding Workbench Electron fixture in the current regression set", () => {
    const content = readSmokeScript();

    expect(content).toContain("Coding Workbench Electron fixture");
    expect(content).toContain(
      "scripts/electron/code-artifact-workbench-fixture-smoke.mjs",
    );
    expect(content).toContain("--scenario");
    expect(content).toContain("gui-coding-input");
    expect(content).toContain(
      "code-artifact-workbench-gui-coding-input-regression",
    );
    expect(content).toContain(
      "真实 GUI coding 输入到 Coding Workbench Electron fixture",
    );
  });

  it("runs the Content Factory article Article Editor Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain(
      "Content Factory article Article Editor Electron fixture",
    );
    expect(content).toContain(
      "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    );
    expect(content).toContain("--scenario");
    expect(content).toContain("content-factory-article-workspace");
    expect(content).toContain(
      "claw-chat-current-fixture-content-factory-article-workspace-regression",
    );
    expect(content).toContain(
      "内容工厂文章 Article Editor / articleDraft 右侧产物闭环 Electron fixture",
    );
  });

  it("keeps the aggregate fixture smoke diagnosable and app-url aware", () => {
    const content = readSmokeScript();

    expect(content).toContain("function printHelp()");
    expect(content).toContain('arg === "-h" || arg === "--help"');
    expect(content).toContain("--app-url <url>");
    expect(content).toContain("function nodeSmokeArgs(args, options)");
    expect(content).toContain('"--app-url", options.appUrl');
    expect(content).toContain("args: resolvedArgs");
  });

  it("prepares packaged renderer and Electron host assets before real Electron fixtures", () => {
    const content = readSmokeScript();

    expect(content).toContain("function ensureElectronFixtureBuild(options)");
    expect(content).toContain(
      "function runElectronFixtureSmoke(label, args, options)",
    );
    expect(content).toContain('path.join(rootDir, "dist", "index.html")');
    expect(content).toContain(
      'path.join(rootDir, "dist-electron", "main", "main.js")',
    );
    expect(content).toContain(
      'path.join(rootDir, "dist-electron", "app-server.release.json")',
    );
    expect(content).toContain('"electron:build:smoke"');
    expect(content).toContain("ensureElectronFixtureBuild(options)");
    expect(content.indexOf("ensureElectronFixtureBuild(options)")).toBeLessThan(
      content.indexOf("Coding Workbench Electron fixture"),
    );
    expect(content).toContain(
      "Claw Expert Plaza Skills Runtime click-through Electron fixture",
    );
  });

  it("does not opt into live provider or mock backend evidence", () => {
    const content = readSmokeScript();

    expect(content).toContain('LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0"');
    expect(content).toContain('LIME_REAL_API_TEST: "0"');
    expect(content).toContain("liveProviderUsed=false");
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });
});
