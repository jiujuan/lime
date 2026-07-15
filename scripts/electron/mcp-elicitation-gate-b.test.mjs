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
    expect(content).toContain('type: "initialize"');
    expect(content).toContain("startOpenAiCompatibleFixtureServer");
  });

  it("requires exact runtime capability advertisement and management capability absence", () => {
    const content = readGateB();

    expect(content).toContain("capabilityAdvertisementRequired: true");
    expect(content).toContain('initializedProtocolVersion === "2025-06-18"');
    expect(content).toContain(
      "Object.keys(initializedCapabilities).length === 1",
    );
    expect(content).toContain(
      "isExactEmptyObject(initializedCapabilities.elicitation)",
    );
    expect(content).toContain('type: "capability_missing"');
    expect(content).toContain("runtimeCapabilityExact");
    expect(content).toContain("managementElicitationCapabilityAbsent");
    expect(content).toContain("summary.capabilityMissingCount === 0");
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
