import type {
  RunSiteAdapterRequest,
  SavedSiteAdapterContent,
  SaveSiteAdapterResultRequest,
  SiteAdapterCatalogStatus,
  SiteAdapterDefinition,
  SiteAdapterImportResult,
  SiteAdapterImportYamlBundleRequest,
  SiteAdapterLaunchReadinessRequest,
  SiteAdapterLaunchReadinessResult,
  SiteAdapterRecommendation,
  SiteAdapterRunResult,
} from "@/lib/webview-api";
import type { AgentRuntimeBridgeInvoke } from "./transport";

export interface AgentRuntimeSiteClientDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}

function rejectRetiredSiteAdapterCommand(command: string): never {
  throw new Error(
    `${command} is retired until Site Adapter moves to App Server current methods`,
  );
}

export function createSiteClient({
  bridgeInvoke,
}: AgentRuntimeSiteClientDeps = {}) {
  void bridgeInvoke;

  async function siteListAdapters(): Promise<SiteAdapterDefinition[]> {
    return rejectRetiredSiteAdapterCommand("site_list_adapters");
  }

  async function siteRecommendAdapters(
    limit?: number,
  ): Promise<SiteAdapterRecommendation[]> {
    void limit;
    return rejectRetiredSiteAdapterCommand("site_recommend_adapters");
  }

  async function siteSearchAdapters(
    query: string,
  ): Promise<SiteAdapterDefinition[]> {
    void query;
    return rejectRetiredSiteAdapterCommand("site_search_adapters");
  }

  async function siteGetAdapterInfo(
    name: string,
  ): Promise<SiteAdapterDefinition> {
    void name;
    return rejectRetiredSiteAdapterCommand("site_get_adapter_info");
  }

  async function siteGetAdapterLaunchReadiness(
    request: SiteAdapterLaunchReadinessRequest,
  ): Promise<SiteAdapterLaunchReadinessResult> {
    void request;
    return rejectRetiredSiteAdapterCommand("site_get_adapter_launch_readiness");
  }

  async function siteGetAdapterCatalogStatus(): Promise<SiteAdapterCatalogStatus> {
    return rejectRetiredSiteAdapterCommand("site_get_adapter_catalog_status");
  }

  async function siteApplyAdapterCatalogBootstrap(
    payload: unknown,
  ): Promise<SiteAdapterCatalogStatus> {
    void payload;
    return rejectRetiredSiteAdapterCommand(
      "site_apply_adapter_catalog_bootstrap",
    );
  }

  async function siteClearAdapterCatalogCache(): Promise<SiteAdapterCatalogStatus> {
    return rejectRetiredSiteAdapterCommand("site_clear_adapter_catalog_cache");
  }

  async function siteImportAdapterYamlBundle(
    request: SiteAdapterImportYamlBundleRequest,
  ): Promise<SiteAdapterImportResult> {
    void request;
    return rejectRetiredSiteAdapterCommand("site_import_adapter_yaml_bundle");
  }

  async function siteRunAdapter(
    request: RunSiteAdapterRequest,
  ): Promise<SiteAdapterRunResult> {
    void request;
    return rejectRetiredSiteAdapterCommand("site_run_adapter");
  }

  async function siteDebugRunAdapter(
    request: RunSiteAdapterRequest,
  ): Promise<SiteAdapterRunResult> {
    void request;
    return rejectRetiredSiteAdapterCommand("site_debug_run_adapter");
  }

  async function siteSaveAdapterResult(
    request: SaveSiteAdapterResultRequest,
  ): Promise<SavedSiteAdapterContent> {
    void request;
    return rejectRetiredSiteAdapterCommand("site_save_adapter_result");
  }

  return {
    siteApplyAdapterCatalogBootstrap,
    siteClearAdapterCatalogCache,
    siteDebugRunAdapter,
    siteGetAdapterCatalogStatus,
    siteGetAdapterInfo,
    siteGetAdapterLaunchReadiness,
    siteImportAdapterYamlBundle,
    siteListAdapters,
    siteRecommendAdapters,
    siteRunAdapter,
    siteSaveAdapterResult,
    siteSearchAdapters,
  };
}
