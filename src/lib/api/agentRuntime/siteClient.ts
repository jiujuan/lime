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
import { assertNotDiagnosticFacade } from "../diagnosticFacade";
import {
  invokeAgentRuntimeBridge,
  type AgentRuntimeBridgeInvoke,
} from "./transport";

export interface AgentRuntimeSiteClientDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}

const SITE_ADAPTER_SOURCE_KINDS = new Set([
  "bundled",
  "imported",
  "server_synced",
]);

const SITE_ADAPTER_LAUNCH_READINESS_STATUSES = new Set([
  "ready",
  "requires_browser_runtime",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(
  value: unknown,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isSiteAdapterDefinition(
  value: unknown,
): value is SiteAdapterDefinition {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.domain === "string" &&
    typeof value.description === "string" &&
    typeof value.read_only === "boolean" &&
    isStringArray(value.capabilities) &&
    isRecord(value.input_schema) &&
    isRecord(value.example_args) &&
    typeof value.example === "string" &&
    isOptionalString(value.auth_hint) &&
    (value.source_kind === undefined ||
      (typeof value.source_kind === "string" &&
        SITE_ADAPTER_SOURCE_KINDS.has(value.source_kind))) &&
    isOptionalString(value.source_version)
  );
}

function isSiteAdapterRecommendation(
  value: unknown,
): value is SiteAdapterRecommendation {
  return (
    isRecord(value) &&
    isSiteAdapterDefinition(value.adapter) &&
    typeof value.reason === "string" &&
    isOptionalString(value.profile_key) &&
    isOptionalString(value.target_id) &&
    typeof value.entry_url === "string" &&
    typeof value.score === "number" &&
    Number.isFinite(value.score)
  );
}

function isSiteAdapterCatalogStatus(
  value: unknown,
): value is SiteAdapterCatalogStatus {
  return (
    isRecord(value) &&
    typeof value.exists === "boolean" &&
    typeof value.source_kind === "string" &&
    SITE_ADAPTER_SOURCE_KINDS.has(value.source_kind) &&
    typeof value.registry_version === "number" &&
    Number.isFinite(value.registry_version) &&
    isOptionalString(value.directory) &&
    isOptionalString(value.catalog_version) &&
    isOptionalString(value.tenant_id) &&
    isOptionalString(value.synced_at) &&
    typeof value.adapter_count === "number" &&
    Number.isFinite(value.adapter_count)
  );
}

function isSiteAdapterImportResult(
  value: unknown,
): value is SiteAdapterImportResult {
  return (
    isRecord(value) &&
    typeof value.directory === "string" &&
    typeof value.adapter_count === "number" &&
    Number.isFinite(value.adapter_count) &&
    isOptionalString(value.catalog_version)
  );
}

function isSiteAdapterLaunchReadinessResult(
  value: unknown,
): value is SiteAdapterLaunchReadinessResult {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    SITE_ADAPTER_LAUNCH_READINESS_STATUSES.has(value.status) &&
    typeof value.adapter === "string" &&
    typeof value.domain === "string" &&
    isOptionalString(value.profile_key) &&
    isOptionalString(value.target_id) &&
    typeof value.message === "string" &&
    isOptionalString(value.report_hint)
  );
}

function isSavedSiteAdapterContent(
  value: unknown,
): value is SavedSiteAdapterContent {
  return (
    isRecord(value) &&
    typeof value.content_id === "string" &&
    typeof value.project_id === "string" &&
    typeof value.title === "string" &&
    isOptionalString(value.project_root_path) &&
    isOptionalString(value.bundle_relative_dir) &&
    isOptionalString(value.markdown_relative_path) &&
    isOptionalString(value.images_relative_dir) &&
    isOptionalString(value.meta_relative_path) &&
    isOptionalFiniteNumber(value.image_count)
  );
}

function isSiteAdapterRunResult(value: unknown): value is SiteAdapterRunResult {
  return (
    isRecord(value) &&
    typeof value.ok === "boolean" &&
    typeof value.adapter === "string" &&
    typeof value.domain === "string" &&
    typeof value.profile_key === "string" &&
    isOptionalString(value.session_id) &&
    isOptionalString(value.target_id) &&
    typeof value.entry_url === "string" &&
    isOptionalString(value.source_url) &&
    isOptionalString(value.error_code) &&
    isOptionalString(value.error_message) &&
    isOptionalString(value.auth_hint) &&
    isOptionalString(value.report_hint) &&
    (value.saved_content === undefined ||
      isSavedSiteAdapterContent(value.saved_content)) &&
    isOptionalString(value.saved_project_id) &&
    isOptionalString(value.saved_by) &&
    isOptionalString(value.save_skipped_project_id) &&
    isOptionalString(value.save_skipped_by) &&
    isOptionalString(value.save_error_message)
  );
}

function assertSiteAdapterResult<T>(
  command: string,
  value: unknown,
  predicate: (value: unknown) => value is T,
  description: string,
): asserts value is T {
  assertNotDiagnosticFacade(command, value, "真实 Site Adapter current 通道");
  if (!predicate(value)) {
    throw new Error(`${command} 未返回有效 ${description}`);
  }
}

function assertSiteAdapterListResult<T>(
  command: string,
  value: unknown,
  predicate: (value: unknown) => value is T,
  description: string,
): asserts value is T[] {
  assertNotDiagnosticFacade(command, value, "真实 Site Adapter current 通道");
  if (!Array.isArray(value) || !value.every((item) => predicate(item))) {
    throw new Error(`${command} 未返回有效 ${description} 列表`);
  }
}

export function createSiteClient({
  bridgeInvoke = invokeAgentRuntimeBridge,
}: AgentRuntimeSiteClientDeps = {}) {
  async function siteListAdapters(): Promise<SiteAdapterDefinition[]> {
    const result = await bridgeInvoke<unknown>("site_list_adapters");
    assertSiteAdapterListResult(
      "site_list_adapters",
      result,
      isSiteAdapterDefinition,
      "Site Adapter",
    );
    return result;
  }

  async function siteRecommendAdapters(
    limit?: number,
  ): Promise<SiteAdapterRecommendation[]> {
    const command = "site_recommend_adapters";
    const result = await bridgeInvoke<unknown>(command, {
      request: { limit },
    });
    assertSiteAdapterListResult(
      command,
      result,
      isSiteAdapterRecommendation,
      "Site Adapter recommendation",
    );
    return result;
  }

  async function siteSearchAdapters(
    query: string,
  ): Promise<SiteAdapterDefinition[]> {
    const command = "site_search_adapters";
    const result = await bridgeInvoke<unknown>(command, {
      request: { query },
    });
    assertSiteAdapterListResult(
      command,
      result,
      isSiteAdapterDefinition,
      "Site Adapter",
    );
    return result;
  }

  async function siteGetAdapterInfo(
    name: string,
  ): Promise<SiteAdapterDefinition> {
    const command = "site_get_adapter_info";
    const result = await bridgeInvoke<unknown>(command, {
      request: { name },
    });
    assertSiteAdapterResult(
      command,
      result,
      isSiteAdapterDefinition,
      "Site Adapter",
    );
    return result;
  }

  async function siteGetAdapterLaunchReadiness(
    request: SiteAdapterLaunchReadinessRequest,
  ): Promise<SiteAdapterLaunchReadinessResult> {
    const command = "site_get_adapter_launch_readiness";
    const result = await bridgeInvoke<unknown>(command, {
      request,
    });
    assertSiteAdapterResult(
      command,
      result,
      isSiteAdapterLaunchReadinessResult,
      "Site Adapter launch readiness",
    );
    return result;
  }

  async function siteGetAdapterCatalogStatus(): Promise<SiteAdapterCatalogStatus> {
    const result = await bridgeInvoke<unknown>("site_get_adapter_catalog_status");
    assertSiteAdapterResult(
      "site_get_adapter_catalog_status",
      result,
      isSiteAdapterCatalogStatus,
      "Site Adapter catalog status",
    );
    return result;
  }

  async function siteApplyAdapterCatalogBootstrap(
    payload: unknown,
  ): Promise<SiteAdapterCatalogStatus> {
    const command = "site_apply_adapter_catalog_bootstrap";
    const result = await bridgeInvoke<unknown>(command, {
      request: {
        payload,
      },
    });
    assertSiteAdapterResult(
      command,
      result,
      isSiteAdapterCatalogStatus,
      "Site Adapter catalog status",
    );
    return result;
  }

  async function siteClearAdapterCatalogCache(): Promise<SiteAdapterCatalogStatus> {
    const command = "site_clear_adapter_catalog_cache";
    const result = await bridgeInvoke<unknown>(command);
    assertSiteAdapterResult(
      command,
      result,
      isSiteAdapterCatalogStatus,
      "Site Adapter catalog status",
    );
    return result;
  }

  async function siteImportAdapterYamlBundle(
    request: SiteAdapterImportYamlBundleRequest,
  ): Promise<SiteAdapterImportResult> {
    const command = "site_import_adapter_yaml_bundle";
    const result = await bridgeInvoke<unknown>(command, {
      request,
    });
    assertSiteAdapterResult(
      command,
      result,
      isSiteAdapterImportResult,
      "Site Adapter import result",
    );
    return result;
  }

  async function siteRunAdapter(
    request: RunSiteAdapterRequest,
  ): Promise<SiteAdapterRunResult> {
    const command = "site_run_adapter";
    const result = await bridgeInvoke<unknown>(command, { request });
    assertSiteAdapterResult(
      command,
      result,
      isSiteAdapterRunResult,
      "Site Adapter run result",
    );
    return result;
  }

  async function siteDebugRunAdapter(
    request: RunSiteAdapterRequest,
  ): Promise<SiteAdapterRunResult> {
    const command = "site_debug_run_adapter";
    const result = await bridgeInvoke<unknown>(command, {
      request,
    });
    assertSiteAdapterResult(
      command,
      result,
      isSiteAdapterRunResult,
      "Site Adapter run result",
    );
    return result;
  }

  async function siteSaveAdapterResult(
    request: SaveSiteAdapterResultRequest,
  ): Promise<SavedSiteAdapterContent> {
    const command = "site_save_adapter_result";
    const result = await bridgeInvoke<unknown>(command, {
      request,
    });
    assertSiteAdapterResult(
      command,
      result,
      isSavedSiteAdapterContent,
      "saved Site Adapter content",
    );
    return result;
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

export const {
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
} = createSiteClient();
