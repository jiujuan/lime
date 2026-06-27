import { safeInvoke } from "@/lib/dev-bridge";
import {
  CURRENT_SIDEBAR_NAV_SCHEMA_VERSION,
  type Config,
  type EnvironmentPreview,
} from "./appConfigTypes";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

const APP_CONFIG_CHANGE_STAMP_KEY = "lime.app-config.changed-at";
const APP_CONFIG_CHANGED_EVENT = "lime:app-config-changed";

let configCache: Config | null = null;
let configLoadingPromise: Promise<Config> | null = null;
let configCacheStamp: string | null = null;

export type {
  ClawTraceConfig,
  ClawTraceLevelConfig,
  Config,
  CrashReportingConfig,
  ChatAppearanceConfig,
  DeveloperConfig,
  EnvironmentConfig,
  EnvironmentPreview,
  EnvironmentPreviewEntry,
  EnvironmentVariableOverride,
  ImageGenConfig,
  MultiSearchConfig,
  MultiSearchEngineEntryConfig,
  NavigationConfig,
  NativeAgentConfig,
  QuotaExceededConfig,
  RemoteManagementConfig,
  ResponseCacheConfig,
  ServiceModelPreferenceConfig,
  ServiceModelsConfig,
  ShellImportPreview,
  TlsConfig,
  ToolCallingConfig,
  ToolExecutionCommandRiskLevelConfig,
  ToolExecutionCommandRuleConfig,
  ToolExecutionCommandRuleMatchTypeConfig,
  ToolExecutionNetworkRuleConfig,
  ToolExecutionNetworkRuleTargetConfig,
  ToolExecutionOverrideConfig,
  ToolExecutionPolicyConfig,
  ToolExecutionRestrictionProfileConfig,
  ToolExecutionSandboxProfileConfig,
  ToolExecutionWarningPolicyConfig,
  UserProfile,
  WorkspacePreferencesConfig,
  WorkspaceSandboxConfig,
} from "./appConfigTypes";

interface GetConfigOptions {
  forceRefresh?: boolean;
}

function cloneConfig(config: Config): Config {
  if (typeof structuredClone === "function") {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as Config;
}

function normalizeConfig(config: Config): Config {
  const nextConfig = cloneConfig(config);
  const navigation = nextConfig.navigation;

  if (navigation) {
    nextConfig.navigation = {
      ...navigation,
      schema_version: CURRENT_SIDEBAR_NAV_SCHEMA_VERSION,
      enabled_items: [],
    };
  }

  return nextConfig;
}

function readAppConfigChangeStamp(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(APP_CONFIG_CHANGE_STAMP_KEY);
  } catch {
    return null;
  }
}

function markAppConfigChanged(): string | null {
  const nextStamp = String(Date.now());

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(APP_CONFIG_CHANGE_STAMP_KEY, nextStamp);
    } catch {
      // ignore
    }

    try {
      window.dispatchEvent(new CustomEvent(APP_CONFIG_CHANGED_EVENT));
    } catch {
      // ignore
    }
  }

  return nextStamp;
}

function invalidateConfigCache(): void {
  configCache = null;
  configLoadingPromise = null;
  configCacheStamp = null;
}

function assertNonEmptyString(
  command: string,
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${command} 未返回有效${label}`);
  }
}

function assertConfigShape(value: unknown): asserts value is Config {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("get_config 未返回有效配置");
  }

  const defaultProvider = (value as { default_provider?: unknown })
    .default_provider;
  if (
    typeof defaultProvider !== "string" ||
    defaultProvider.trim().length === 0
  ) {
    throw new Error("get_config 未返回有效配置");
  }
}

function assertVoidResult(command: string, value: unknown): void {
  if (value !== null && value !== undefined) {
    throw new Error(`${command} did not return void result`);
  }
}

export function invalidateAppConfigCache(): void {
  invalidateConfigCache();
}

export function subscribeAppConfigChanged(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleCustomChange = () => {
    listener();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === APP_CONFIG_CHANGE_STAMP_KEY) {
      listener();
    }
  };

  window.addEventListener(APP_CONFIG_CHANGED_EVENT, handleCustomChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(APP_CONFIG_CHANGED_EVENT, handleCustomChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export async function getConfig(
  options: GetConfigOptions = {},
): Promise<Config> {
  if (options.forceRefresh) {
    invalidateConfigCache();
  }

  const currentStamp = readAppConfigChangeStamp();
  if (configCache && configCacheStamp !== currentStamp) {
    invalidateConfigCache();
  }

  if (configCache) {
    return cloneConfig(configCache);
  }

  if (!configLoadingPromise) {
    configLoadingPromise = safeInvoke<unknown>("get_config")
      .then((config) => {
        assertNotDiagnosticFacade(
          "get_config",
          config,
          "真实配置 current 通道",
        );
        assertConfigShape(config);
        configCache = normalizeConfig(config);
        configCacheStamp = readAppConfigChangeStamp();
        return configCache;
      })
      .finally(() => {
        configLoadingPromise = null;
      });
  }

  return cloneConfig(await configLoadingPromise);
}

export async function saveConfig(config: Config): Promise<void> {
  const normalizedConfig = normalizeConfig(config);
  const result = await safeInvoke("save_config", { config: normalizedConfig });
  assertNotDiagnosticFacade("save_config", result, "真实配置 current 通道");
  assertVoidResult("save_config", result);
  configCache = cloneConfig(normalizedConfig);
  configCacheStamp = markAppConfigChanged();
}

export async function getEnvironmentPreview(): Promise<EnvironmentPreview> {
  const result = await safeInvoke<EnvironmentPreview>(
    "get_environment_preview",
  );
  assertNotDiagnosticFacade(
    "get_environment_preview",
    result,
    "真实环境预览 current 通道",
  );
  return result;
}

export async function getDefaultProvider(): Promise<string> {
  const result = await safeInvoke<unknown>("get_default_provider");
  assertNotDiagnosticFacade(
    "get_default_provider",
    result,
    "真实默认 Provider current 通道",
  );
  assertNonEmptyString("get_default_provider", result, "默认 Provider");
  return result;
}
