import { describe, expect, it, vi } from "vitest";
import { createSiteClient } from "./siteClient";

describe("agentRuntime siteClient retired fail-closed", () => {
  it("Site Adapter 发现与目录命令默认 fail closed，不能回到旧 bridge", async () => {
    const bridgeInvoke = vi.fn();
    const client = createSiteClient({ bridgeInvoke });

    await expect(client.siteListAdapters()).rejects.toThrow(
      "site_list_adapters is retired until Site Adapter moves to App Server current methods",
    );
    await expect(client.siteRecommendAdapters(3)).rejects.toThrow(
      "site_recommend_adapters is retired until Site Adapter moves to App Server current methods",
    );
    await expect(client.siteSearchAdapters("news")).rejects.toThrow(
      "site_search_adapters is retired until Site Adapter moves to App Server current methods",
    );
    await expect(client.siteGetAdapterInfo("news_reader")).rejects.toThrow(
      "site_get_adapter_info is retired until Site Adapter moves to App Server current methods",
    );
    await expect(client.siteGetAdapterCatalogStatus()).rejects.toThrow(
      "site_get_adapter_catalog_status is retired until Site Adapter moves to App Server current methods",
    );

    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("Site Adapter 管理与运行命令默认 fail closed，不能回到旧 bridge", async () => {
    const bridgeInvoke = vi.fn();
    const client = createSiteClient({ bridgeInvoke });

    await expect(
      client.siteGetAdapterLaunchReadiness({ adapter_name: "news_reader" }),
    ).rejects.toThrow(
      "site_get_adapter_launch_readiness is retired until Site Adapter moves to App Server current methods",
    );
    await expect(
      client.siteApplyAdapterCatalogBootstrap({ adapters: [] }),
    ).rejects.toThrow(
      "site_apply_adapter_catalog_bootstrap is retired until Site Adapter moves to App Server current methods",
    );
    await expect(client.siteClearAdapterCatalogCache()).rejects.toThrow(
      "site_clear_adapter_catalog_cache is retired until Site Adapter moves to App Server current methods",
    );
    await expect(
      client.siteImportAdapterYamlBundle({ yaml_bundle: "adapters: []" }),
    ).rejects.toThrow(
      "site_import_adapter_yaml_bundle is retired until Site Adapter moves to App Server current methods",
    );
    await expect(
      client.siteRunAdapter({ adapter_name: "news_reader" }),
    ).rejects.toThrow(
      "site_run_adapter is retired until Site Adapter moves to App Server current methods",
    );
    await expect(
      client.siteDebugRunAdapter({ adapter_name: "news_reader" }),
    ).rejects.toThrow(
      "site_debug_run_adapter is retired until Site Adapter moves to App Server current methods",
    );
    await expect(
      client.siteSaveAdapterResult({
        run_request: { adapter_name: "news_reader" },
        result: {
          ok: true,
          adapter: "news_reader",
          domain: "example.com",
          profile_key: "default",
          entry_url: "https://example.com/article",
        },
      }),
    ).rejects.toThrow(
      "site_save_adapter_result is retired until Site Adapter moves to App Server current methods",
    );

    expect(bridgeInvoke).not.toHaveBeenCalled();
  });
});
