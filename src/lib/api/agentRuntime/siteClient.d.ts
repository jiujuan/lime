import type { RunSiteAdapterRequest, SavedSiteAdapterContent, SaveSiteAdapterResultRequest, SiteAdapterCatalogStatus, SiteAdapterDefinition, SiteAdapterImportResult, SiteAdapterImportYamlBundleRequest, SiteAdapterLaunchReadinessRequest, SiteAdapterLaunchReadinessResult, SiteAdapterRecommendation, SiteAdapterRunResult } from "@/lib/webview-api";
import { type AgentRuntimeBridgeInvoke } from "./transport";
export interface AgentRuntimeSiteClientDeps {
    bridgeInvoke?: AgentRuntimeBridgeInvoke;
}
export declare function createSiteClient({ bridgeInvoke, }?: AgentRuntimeSiteClientDeps): {
    siteApplyAdapterCatalogBootstrap: (payload: unknown) => Promise<SiteAdapterCatalogStatus>;
    siteClearAdapterCatalogCache: () => Promise<SiteAdapterCatalogStatus>;
    siteDebugRunAdapter: (request: RunSiteAdapterRequest) => Promise<SiteAdapterRunResult>;
    siteGetAdapterCatalogStatus: () => Promise<SiteAdapterCatalogStatus>;
    siteGetAdapterInfo: (name: string) => Promise<SiteAdapterDefinition>;
    siteGetAdapterLaunchReadiness: (request: SiteAdapterLaunchReadinessRequest) => Promise<SiteAdapterLaunchReadinessResult>;
    siteImportAdapterYamlBundle: (request: SiteAdapterImportYamlBundleRequest) => Promise<SiteAdapterImportResult>;
    siteListAdapters: () => Promise<SiteAdapterDefinition[]>;
    siteRecommendAdapters: (limit?: number) => Promise<SiteAdapterRecommendation[]>;
    siteRunAdapter: (request: RunSiteAdapterRequest) => Promise<SiteAdapterRunResult>;
    siteSaveAdapterResult: (request: SaveSiteAdapterResultRequest) => Promise<SavedSiteAdapterContent>;
    siteSearchAdapters: (query: string) => Promise<SiteAdapterDefinition[]>;
};
export declare const siteApplyAdapterCatalogBootstrap: (payload: unknown) => Promise<SiteAdapterCatalogStatus>, siteClearAdapterCatalogCache: () => Promise<SiteAdapterCatalogStatus>, siteDebugRunAdapter: (request: RunSiteAdapterRequest) => Promise<SiteAdapterRunResult>, siteGetAdapterCatalogStatus: () => Promise<SiteAdapterCatalogStatus>, siteGetAdapterInfo: (name: string) => Promise<SiteAdapterDefinition>, siteGetAdapterLaunchReadiness: (request: SiteAdapterLaunchReadinessRequest) => Promise<SiteAdapterLaunchReadinessResult>, siteImportAdapterYamlBundle: (request: SiteAdapterImportYamlBundleRequest) => Promise<SiteAdapterImportResult>, siteListAdapters: () => Promise<SiteAdapterDefinition[]>, siteRecommendAdapters: (limit?: number) => Promise<SiteAdapterRecommendation[]>, siteRunAdapter: (request: RunSiteAdapterRequest) => Promise<SiteAdapterRunResult>, siteSaveAdapterResult: (request: SaveSiteAdapterResultRequest) => Promise<SavedSiteAdapterContent>, siteSearchAdapters: (query: string) => Promise<SiteAdapterDefinition[]>;
