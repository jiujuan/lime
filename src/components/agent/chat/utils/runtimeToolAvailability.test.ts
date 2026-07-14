import type { AgentRuntimeToolInventory } from "@/lib/api/agentRuntime/toolInventoryTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deriveRuntimeToolAvailability,
  RUNTIME_TOOL_AVAILABILITY_OVERRIDE_STORAGE_KEY,
} from "./runtimeToolAvailability";

function asToolInventory(value: unknown): AgentRuntimeToolInventory {
  return value as AgentRuntimeToolInventory;
}

describe("runtime tool surface 派生", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("runtime tool surface 应优先从 runtime_tools 派生 current capability", () => {
    const availability = deriveRuntimeToolAvailability(
      asToolInventory({
        agent_initialized: true,
        runtime_tools: [
          { name: "WebSearch" },
          { name: "Agent" },
          { name: "SendMessage" },
          { name: "TeamCreate" },
          { name: "TeamDelete" },
          { name: "ListPeers" },
          { name: "update_plan" },
        ],
        native_tools: [],
      }),
    );

    expect(availability).toMatchObject({
      source: "runtime_tools",
      known: true,
      webSearch: true,
      subagentRuntime: true,
      planRuntime: true,
      availableToolCount: 7,
    });
  });

  it("runtime tool surface 应支持开发态 localStorage 覆盖，便于真实页面 smoke", () => {
    window.localStorage.setItem(
      RUNTIME_TOOL_AVAILABILITY_OVERRIDE_STORAGE_KEY,
      JSON.stringify({
        known: true,
        agentInitialized: true,
        source: "runtime_tools",
        availableToolCount: 2,
        webSearch: false,
        subagentCore: false,
        subagentTeamTools: false,
        subagentRuntime: false,
        planRuntime: false,
        missingSubagentCoreTools: ["Agent", "SendMessage"],
        missingSubagentTeamTools: ["TeamCreate", "TeamDelete", "ListPeers"],
        missingPlanTools: ["update_plan"],
      }),
    );

    const availability = deriveRuntimeToolAvailability(
      asToolInventory({
        agent_initialized: true,
        runtime_tools: [{ name: "WebSearch" }],
        native_tools: [],
      }),
    );

    expect(availability).toMatchObject({
      source: "runtime_tools",
      known: true,
      webSearch: false,
      subagentRuntime: false,
      planRuntime: false,
      availableToolCount: 2,
      missingSubagentCoreTools: ["Agent", "SendMessage"],
      missingSubagentTeamTools: ["TeamCreate", "TeamDelete", "ListPeers"],
      missingPlanTools: ["update_plan"],
    });
  });
});
