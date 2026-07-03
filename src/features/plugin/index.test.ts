import { describe, expect, it } from "vitest";

import {
  LIME_PLUGIN_BRIDGE_PROTOCOL,
  LIME_PLUGIN_BRIDGE_VERSION,
  createLimeCoreCapabilityAdapters,
  createLimeHostBridgeCapabilityInvoker,
} from ".";

describe("plugin public SDK exports", () => {
  it("exposes the Host Bridge SDK client and core capability adapters from the public feature entry", () => {
    expect(createLimeCoreCapabilityAdapters).toEqual(expect.any(Function));
    expect(createLimeHostBridgeCapabilityInvoker).toEqual(expect.any(Function));
    expect(LIME_PLUGIN_BRIDGE_PROTOCOL).toBe("lime.plugin.bridge");
    expect(LIME_PLUGIN_BRIDGE_VERSION).toBe(1);
  });
});
