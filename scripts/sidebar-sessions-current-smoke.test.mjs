import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync("scripts/sidebar-sessions-current-smoke.mjs", "utf8");
}

describe("sidebar sessions current smoke guard", () => {
  it("keeps seeded remembered workspace out of App Server session list filters", () => {
    const content = readSmokeScript();

    expect(content).toContain('workspaceId: "workspace-1"');
    expect(content).toContain("LAST_PROJECT_ID_KEY");
    expect(content).toContain("agent_last_project_id");
    expect(content).toContain("summarizeInvokeEntries(entries, options = {})");
    expect(content).toContain("seededWorkspaceFilterRequests");
    expect(content).toContain("seededWorkspaceFilterRequestCount");
    expect(content).toContain(
      "request.params?.workspaceId === seededWorkspaceId",
    );
    expect(content).toContain(
      "observed.seededWorkspaceFilterRequestCount === 0",
    );
    expect(content).toContain(
      "summary.seededWorkspaceFilterRequestCount === 0",
    );
    expect(content).toContain(
      "观察到本地记忆项目污染 thread/list workspaceId",
    );
    expect(content).toContain("summarizeInvokeEntries(invokeEntries, options)");
  });

  it("continues to prove current App Server list path and reject legacy list commands", () => {
    const content = readSmokeScript();

    expect(content).toContain(
      'const REQUIRED_APP_SERVER_METHODS = ["thread/list"]',
    );
    expect(content).toContain(
      'const LEGACY_SESSION_COMMANDS = ["agent_runtime_list_sessions"]',
    );
    expect(content).toContain("APP_SERVER_HANDLE_JSON_LINES_COMMAND");
    expect(content).toContain("summary.legacySessionCommandsSeen.length === 0");
    expect(content).toContain("recentSessionListResponsesValid");
    expect(content).toContain("archivedSessionListResponsesValid");
    expect(content).toContain("archivedOnlySeen");
  });
});
