import { describe, expect, it } from "vitest";

import {
  LIME_AGENT_APP_BRIDGE_PROTOCOL,
  LIME_AGENT_APP_BRIDGE_VERSION,
  createLimeCoreCapabilityAdapters,
  createLimeHostBridgeCapabilityInvoker,
} from ".";

describe("agent-app public SDK exports", () => {
  it("exposes the Host Bridge SDK client and core capability adapters from the public feature entry", () => {
    expect(createLimeCoreCapabilityAdapters).toEqual(expect.any(Function));
    expect(createLimeHostBridgeCapabilityInvoker).toEqual(expect.any(Function));
    expect(LIME_AGENT_APP_BRIDGE_PROTOCOL).toBe("lime.agentApp.bridge");
    expect(LIME_AGENT_APP_BRIDGE_VERSION).toBe(1);
  });
});
