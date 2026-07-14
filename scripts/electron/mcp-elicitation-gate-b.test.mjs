import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readGateB() {
  return fs.readFileSync("scripts/electron/mcp-elicitation-gate-b.mjs", "utf8");
}

describe("MCP elicitation Gate B guard", () => {
  it("keeps the success path on real Electron, App Server runtime, and scoped MCP execution", () => {
    const content = readGateB();

    expect(content).toContain('backendMode: "runtime"');
    expect(content).toContain("launchElectronFixture");
    expect(content).toContain("app_server_handle_json_lines");
    expect(content).toContain('"agentSession/turn/start"');
    expect(content).toContain('"mcpServer/create"');
    expect(content).toContain('"mcpServer/start"');
    expect(content).toContain("mcp__${serverName}__${TOOL_SUFFIX}");
    expect(content).toContain('method: "elicitation/create"');
    expect(content).toContain("startOpenAiCompatibleFixtureServer");
  });

  it("requires the renderer boolean form, exact MCP accept ledger, and second provider response", () => {
    const content = readGateB();

    expect(content).toContain('input[type="checkbox"]');
    expect(content).toContain("confirmed=true");
    expect(content).toContain("MCP_ELICITATION_GATE_B_DONE");
    expect(content).toContain("providerRequests.length >= 2");
    expect(content).toContain('entry?.action === "accept"');
    expect(content).toContain("content?.confirmed === true");
    expect(content).toContain("dialogClosedAfterResolved");
  });

  it("does not use generic action response, explicit management call proof, or mock fallback", () => {
    const content = readGateB();

    expect(content).not.toContain("mcpTool/callWithCaller");
    expect(content).not.toContain("agentSession/action/respond");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });
});
