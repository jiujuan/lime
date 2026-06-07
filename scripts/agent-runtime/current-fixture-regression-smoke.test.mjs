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
