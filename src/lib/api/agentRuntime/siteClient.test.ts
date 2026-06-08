import { describe, expect, it, vi } from "vitest";
import { createSiteClient } from "./siteClient";
import type {
  SavedSiteAdapterContent,
  SiteAdapterCatalogStatus,
  SiteAdapterDefinition,
  SiteAdapterImportResult,
  SiteAdapterLaunchReadinessResult,
  SiteAdapterRecommendation,
  SiteAdapterRunResult,
} from "@/lib/webview-api";

const siteAdapter: SiteAdapterDefinition = {
  name: "news_reader",
  domain: "example.com",
  description: "读取示例站点",
  read_only: true,
  capabilities: ["extract"],
  input_schema: { type: "object" },
  example_args: { url: "https://example.com/article" },
  example: "读取文章正文",
  source_kind: "bundled",
};

const siteRecommendation: SiteAdapterRecommendation = {
  adapter: siteAdapter,
  reason: "domain_match",
  entry_url: "https://example.com/article",
  score: 100,
};

const catalogStatus: SiteAdapterCatalogStatus = {
  exists: true,
  source_kind: "bundled",
  registry_version: 1,
  directory: "/tmp/site-adapters",
  adapter_count: 1,
};

const importResult: SiteAdapterImportResult = {
  directory: "/tmp/site-adapters/imported",
  adapter_count: 1,
  catalog_version: "2026.06.08",
};

const launchReadiness: SiteAdapterLaunchReadinessResult = {
  status: "ready",
  adapter: "news_reader",
  domain: "example.com",
  message: "ready",
};

const savedContent: SavedSiteAdapterContent = {
  content_id: "content-1",
  project_id: "project-1",
  title: "站点采集结果",
};

const runResult: SiteAdapterRunResult = {
  ok: true,
  adapter: "news_reader",
  domain: "example.com",
  profile_key: "default",
  entry_url: "https://example.com/article",
  saved_content: savedContent,
};

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
  it("应代理全部 Site Adapter 命令并校验返回形态", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce([siteAdapter])
      .mockResolvedValueOnce([siteRecommendation])
      .mockResolvedValueOnce([siteAdapter])
      .mockResolvedValueOnce(siteAdapter)
      .mockResolvedValueOnce(launchReadiness)
      .mockResolvedValueOnce(catalogStatus)
      .mockResolvedValueOnce(catalogStatus)
      .mockResolvedValueOnce(catalogStatus)
      .mockResolvedValueOnce(importResult)
      .mockResolvedValueOnce(runResult)
      .mockResolvedValueOnce(runResult)
      .mockResolvedValueOnce(savedContent);
    const client = createSiteClient({ bridgeInvoke });

    await expect(client.siteListAdapters()).resolves.toEqual([siteAdapter]);
    await expect(client.siteRecommendAdapters(3)).resolves.toEqual([
      siteRecommendation,
    ]);
    await expect(client.siteSearchAdapters("news")).resolves.toEqual([
      siteAdapter,
    ]);
    await expect(client.siteGetAdapterInfo("news_reader")).resolves.toEqual(
      siteAdapter,
    );
    await expect(
      client.siteGetAdapterLaunchReadiness({ adapter_name: "news_reader" }),
    ).resolves.toEqual(launchReadiness);
    await expect(client.siteGetAdapterCatalogStatus()).resolves.toEqual(
      catalogStatus,
    );
    await expect(
      client.siteApplyAdapterCatalogBootstrap({ adapters: [] }),
    ).resolves.toEqual(catalogStatus);
    await expect(client.siteClearAdapterCatalogCache()).resolves.toEqual(
      catalogStatus,
    );
    await expect(
      client.siteImportAdapterYamlBundle({ yaml_bundle: "adapters: []" }),
    ).resolves.toEqual(importResult);
    await expect(
      client.siteRunAdapter({ adapter_name: "news_reader" }),
    ).resolves.toEqual(runResult);
    await expect(
      client.siteDebugRunAdapter({ adapter_name: "news_reader" }),
    ).resolves.toEqual(runResult);
    await expect(
      client.siteSaveAdapterResult({
        run_request: { adapter_name: "news_reader" },
        result: runResult,
      }),
    ).resolves.toEqual(savedContent);

    expect(bridgeInvoke).toHaveBeenNthCalledWith(1, "site_list_adapters");
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      2,
      "site_recommend_adapters",
      {
        request: { limit: 3 },
      },
    );
    expect(bridgeInvoke).toHaveBeenNthCalledWith(3, "site_search_adapters", {
      request: { query: "news" },
    });
    expect(bridgeInvoke).toHaveBeenNthCalledWith(4, "site_get_adapter_info", {
      request: { name: "news_reader" },
    });
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      5,
      "site_get_adapter_launch_readiness",
      {
        request: { adapter_name: "news_reader" },
      },
    );
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      6,
      "site_get_adapter_catalog_status",
    );
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      7,
      "site_apply_adapter_catalog_bootstrap",
      {
        request: { payload: { adapters: [] } },
      },
    );
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      8,
      "site_clear_adapter_catalog_cache",
    );
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      9,
      "site_import_adapter_yaml_bundle",
      {
        request: { yaml_bundle: "adapters: []" },
      },
    );
    expect(bridgeInvoke).toHaveBeenNthCalledWith(10, "site_run_adapter", {
      request: { adapter_name: "news_reader" },
    });
    expect(bridgeInvoke).toHaveBeenNthCalledWith(11, "site_debug_run_adapter", {
      request: { adapter_name: "news_reader" },
    });
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      12,
      "site_save_adapter_result",
      {
        request: {
          run_request: { adapter_name: "news_reader" },
          result: runResult,
        },
      },
    );
  });

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

  it("Site Adapter 列表和推荐命令收到错误返回形态时应 fail closed", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce([{ ...siteAdapter, capabilities: [1] }])
      .mockResolvedValueOnce([{ ...siteRecommendation, score: "100" }])
      .mockResolvedValueOnce({ items: [siteAdapter] });
    const client = createSiteClient({ bridgeInvoke });

    await expect(client.siteListAdapters()).rejects.toThrow(
      "site_list_adapters 未返回有效 Site Adapter 列表",
    );
    await expect(client.siteSearchAdapters("news")).rejects.toThrow(
      "site_search_adapters 未返回有效 Site Adapter 列表",
    );
    await expect(client.siteRecommendAdapters()).rejects.toThrow(
      "site_recommend_adapters 未返回有效 Site Adapter recommendation 列表",
    );
    await expect(client.siteSearchAdapters("news")).rejects.toThrow(
      "site_search_adapters 未返回有效 Site Adapter 列表",
    );
  });

  it("Site Adapter 对象命令收到错误返回形态时应 fail closed", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ ...launchReadiness, status: "unknown" })
      .mockResolvedValueOnce({ ...catalogStatus, adapter_count: "1" })
      .mockResolvedValueOnce({
        ...catalogStatus,
        source_kind: "legacy_mock",
      })
      .mockResolvedValueOnce({ directory: "/tmp/site-adapters" })
      .mockResolvedValueOnce({ ...runResult, saved_content: { success: true } })
      .mockResolvedValueOnce({ ...runResult, entry_url: null })
      .mockResolvedValueOnce({ ...savedContent, title: undefined });
    const client = createSiteClient({ bridgeInvoke });

    await expect(client.siteGetAdapterInfo("news_reader")).rejects.toThrow(
      "site_get_adapter_info 未返回有效 Site Adapter",
    );
    await expect(
      client.siteGetAdapterLaunchReadiness({ adapter_name: "news_reader" }),
    ).rejects.toThrow(
      "site_get_adapter_launch_readiness 未返回有效 Site Adapter launch readiness",
    );
    await expect(client.siteGetAdapterCatalogStatus()).rejects.toThrow(
      "site_get_adapter_catalog_status 未返回有效 Site Adapter catalog status",
    );
    await expect(client.siteClearAdapterCatalogCache()).rejects.toThrow(
      "site_clear_adapter_catalog_cache 未返回有效 Site Adapter catalog status",
    );
    await expect(
      client.siteImportAdapterYamlBundle({ yaml_bundle: "adapters: []" }),
    ).rejects.toThrow(
      "site_import_adapter_yaml_bundle 未返回有效 Site Adapter import result",
    );
    await expect(
      client.siteRunAdapter({ adapter_name: "news_reader" }),
    ).rejects.toThrow("site_run_adapter 未返回有效 Site Adapter run result");
    await expect(
      client.siteDebugRunAdapter({ adapter_name: "news_reader" }),
    ).rejects.toThrow(
      "site_debug_run_adapter 未返回有效 Site Adapter run result",
    );
    await expect(
      client.siteSaveAdapterResult({
        run_request: { adapter_name: "news_reader" },
        result: runResult,
      }),
    ).rejects.toThrow(
      "site_save_adapter_result 未返回有效 saved Site Adapter content",
    );
  });
});
