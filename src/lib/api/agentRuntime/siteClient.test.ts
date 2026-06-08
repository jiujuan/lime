import { describe, expect, it, vi } from "vitest";
import { createSiteClient } from "./siteClient";

function createDiagnosticList(command: string): unknown[] {
  const result: unknown[] = [];
  Object.defineProperty(result, "__diagnostic", {
    value: {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
    },
    enumerable: false,
  });
  return result;
}

describe("agentRuntime siteClient", () => {
  it("site adapter 列表遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce(createDiagnosticList("site_list_adapters"));
    const client = createSiteClient({ bridgeInvoke });

    await expect(client.siteListAdapters()).rejects.toThrow(
      "site_list_adapters 尚未接入真实 Site Adapter current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("site adapter catalog 状态遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({
      exists: false,
      source_kind: "bundled",
      registry_version: 1,
      directory: "/tmp/site-adapters",
      adapter_count: 0,
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "site_get_adapter_catalog_status",
        status: "degraded",
      },
    });
    const client = createSiteClient({ bridgeInvoke });

    await expect(client.siteGetAdapterCatalogStatus()).rejects.toThrow(
      "site_get_adapter_catalog_status 尚未接入真实 Site Adapter current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });
});
