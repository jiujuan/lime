import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDeferredMcpToolSearchAssertions,
  buildDeferredMcpToolSearchFixtureResponses,
} from "./deferred-mcp-tool-search-gate-b.mjs";

function readDeferredGateBSources() {
  return [
    "scripts/agent-runtime/tool-execution-smoke.mjs",
    "scripts/agent-runtime/deferred-mcp-tool-search-gate-b.mjs",
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

describe("agent runtime tool execution smoke guard", () => {
  it("keeps multi-agent execution on the six per-turn AgentControl tools", () => {
    const content = fs.readFileSync(
      "scripts/agent-runtime/tool-execution-smoke.mjs",
      "utf8",
    );

    for (const toolName of [
      "spawn_agent",
      "send_message",
      "followup_task",
      "wait_agent",
      "interrupt_agent",
      "list_agents",
    ]) {
      expect(content).toContain(`"${toolName}"`);
    }
    for (const retiredName of [
      "TeamCreate",
      "TeamDelete",
      "ListPeers",
      "SendMessage",
      "AgentTool",
    ]) {
      expect(content).not.toContain(`"${retiredName}"`);
    }
  });

  it("keeps the deferred MCP Gate B on the current Electron/App Server path", () => {
    const content = readDeferredGateBSources();

    expect(content).toContain("mcp-deferred-tool-search-gate-b");
    expect(content).toContain("deferred_loading: true");
    expect(content).toContain("always_visible: false");
    expect(content).toContain('"mcpServer/create"');
    expect(content).toContain('"mcpServer/start"');
    expect(content).toContain('"mcpServer/stop"');
    expect(content).toContain('"mcpServer/delete"');
    expect(content).toContain("startAgentSessionTurnCurrent");
  });

  it("requires the provider request boundary and new-Turn isolation assertions", () => {
    const content = readDeferredGateBSources();

    expect(content).toContain(
      "providerRequestBeforeSelectionHidesDeferredTool",
    );
    expect(content).toContain("sameTurnNextStepExposesDeferredTool");
    expect(content).toContain("newTurnDoesNotLeakDeferredTool");
    expect(content).toContain("runDeferredMcpNewTurnIsolation");
  });

  it("accepts only the next-step and Turn-local deferred tool lifecycle", () => {
    const deferredToolName = "mcp__fixture__deferred_echo";
    const scriptedResponses = buildDeferredMcpToolSearchFixtureResponses({
      deferredToolName,
      toolCall: (name, id, argumentsPayload) => ({
        type: "tool_call",
        name,
        id,
        arguments: argumentsPayload,
      }),
    });
    const assertions = buildDeferredMcpToolSearchAssertions({
      deferredToolName,
      evidencePackText: deferredToolName,
      providerRequests: [
        { toolNames: ["tool_search"] },
        { toolNames: ["tool_search", deferredToolName] },
      ],
      runtimeContext: {
        serverCreated: true,
        deferredToolFoundByCurrentSearch: true,
        deferredToolSearchMetadata: { deferredLoading: true },
      },
      toolOutputText: `${deferredToolName}:LIME_DEFERRED_MCP_TOOL_OK`,
      newTurnProviderRequests: [{ toolNames: ["tool_search"] }],
    });

    expect(scriptedResponses).toHaveLength(3);
    expect(scriptedResponses[0]).toMatchObject({
      name: "tool_search",
      arguments: { query: `select:${deferredToolName}` },
    });
    expect(scriptedResponses[1]).toMatchObject({ name: deferredToolName });
    expect(Object.values(assertions)).toEqual(
      Array(Object.keys(assertions).length).fill(true),
    );
  });
});
