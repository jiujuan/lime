/**
 * 模型注册表 API
 *
 * 提供与后端 ModelRegistryService 交互的 API
 */

import { AppServerClient } from "@/lib/api/appServer";
import { safeInvoke } from "@/lib/dev-bridge";
import type {
  EnhancedModelMetadata,
  ModelSyncState,
  ModelTier,
  ProviderAliasConfig,
  UserModelPreference,
} from "@/lib/types/modelRegistry";
import {
  METHOD_MODEL_LIST,
  METHOD_MODEL_PREFERENCES_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_SYNC_STATE_READ,
  type ModelListParams,
} from "../../../packages/app-server-client/src/protocol";

type ModelRegistryAppServerClient = Pick<AppServerClient, "request">;

type ModelListAppServerResponse = {
  models?: EnhancedModelMetadata[] | null;
};

type ModelPreferencesListAppServerResponse = {
  preferences?: UserModelPreference[] | null;
};

type ModelSyncStateReadAppServerResponse = {
  syncState?: ModelSyncState | null;
};

type ModelProviderAliasReadAppServerResponse = {
  config?: ProviderAliasConfig | null;
};

type ModelProviderAliasListAppServerResponse = {
  configs?: Record<string, ProviderAliasConfig> | null;
};

async function requestModelRegistryAppServer<T>(
  method: string,
  params: unknown,
  appServerClient: ModelRegistryAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  return response.result;
}

async function readModelsFromAppServer(
  params: ModelListParams = {},
): Promise<EnhancedModelMetadata[]> {
  const response =
    await requestModelRegistryAppServer<ModelListAppServerResponse>(
      METHOD_MODEL_LIST,
      params,
    );
  if (!Array.isArray(response.models)) {
    throw new Error("App Server model/list did not return models");
  }
  return response.models;
}

interface ModelRegistryQueryOptions {
  forceRefresh?: boolean;
}

export interface FetchProviderModelsResult {
  models: EnhancedModelMetadata[];
  source: "Api" | "Error";
  error: string | null;
  request_url?: string | null;
  diagnostic_hint?: string | null;
  error_kind?:
    | "not_found"
    | "unauthorized"
    | "forbidden"
    | "network"
    | "invalid_response"
    | "other"
    | null;
  should_prompt_error?: boolean;
  from_cache?: boolean;
}

export function normalizeFetchProviderModelsSource(
  result: Pick<FetchProviderModelsResult, "source" | "models" | "error">,
): FetchProviderModelsResult["source"] {
  return result.source;
}

let modelRegistryCache: EnhancedModelMetadata[] | null = null;
let modelRegistryLoadingPromise: Promise<EnhancedModelMetadata[]> | null = null;
let allAliasConfigsCache: Record<string, ProviderAliasConfig> | null = null;
let allAliasConfigsLoadingPromise: Promise<
  Record<string, ProviderAliasConfig>
> | null = null;
const providerAliasConfigCache = new Map<string, ProviderAliasConfig | null>();
const providerAliasConfigLoadingPromises = new Map<
  string,
  Promise<ProviderAliasConfig | null>
>();

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeProviderKey(provider: string): string {
  return provider.trim();
}

function invalidateAliasConfigCache(): void {
  allAliasConfigsCache = null;
  allAliasConfigsLoadingPromise = null;
  providerAliasConfigCache.clear();
  providerAliasConfigLoadingPromises.clear();
}

export function invalidateModelRegistryCache(): void {
  modelRegistryCache = null;
  modelRegistryLoadingPromise = null;
  invalidateAliasConfigCache();
}

/**
 * 获取所有模型
 */
export async function getModelRegistry(
  options: ModelRegistryQueryOptions = {},
): Promise<EnhancedModelMetadata[]> {
  if (options.forceRefresh) {
    modelRegistryCache = null;
    modelRegistryLoadingPromise = null;
  }

  if (modelRegistryCache) {
    return cloneValue(modelRegistryCache);
  }

  if (!modelRegistryLoadingPromise) {
    modelRegistryLoadingPromise = readModelsFromAppServer()
      .then((models) => {
        modelRegistryCache = cloneValue(models);
        return modelRegistryCache;
      })
      .finally(() => {
        modelRegistryLoadingPromise = null;
      });
  }

  return cloneValue(await modelRegistryLoadingPromise);
}

/**
 * 兼容旧模型注册表 provider_id 查询；本地模型目录已下线，后端返回空集合。
 */
export async function getModelRegistryProviderIds(): Promise<string[]> {
  return safeInvoke("get_model_registry_provider_ids");
}

/**
 * 刷新模型注册表（清空已下线的本地模型注册缓存）
 * @returns 当前模型数量
 */
export async function refreshModelRegistry(): Promise<number> {
  const count = await safeInvoke<number>("refresh_model_registry");
  invalidateModelRegistryCache();
  return count;
}

/**
 * 搜索模型
 * @param query 搜索关键词
 * @param limit 返回数量限制
 */
export async function searchModels(
  query: string,
  limit?: number,
): Promise<EnhancedModelMetadata[]> {
  return safeInvoke("search_models", { query, limit });
}

/**
 * 获取用户模型偏好
 */
export async function getModelPreferences(): Promise<UserModelPreference[]> {
  const response =
    await requestModelRegistryAppServer<ModelPreferencesListAppServerResponse>(
      METHOD_MODEL_PREFERENCES_LIST,
      {},
    );
  if (!Array.isArray(response.preferences)) {
    throw new Error(
      "App Server modelPreferences/list did not return preferences",
    );
  }
  return response.preferences;
}

/**
 * 切换模型收藏状态
 * @param modelId 模型 ID
 * @returns 新的收藏状态
 */
export async function toggleModelFavorite(modelId: string): Promise<boolean> {
  return safeInvoke("toggle_model_favorite", { modelId });
}

/**
 * 隐藏模型
 * @param modelId 模型 ID
 */
export async function hideModel(modelId: string): Promise<void> {
  return safeInvoke("hide_model", { modelId });
}

/**
 * 记录模型使用
 * @param modelId 模型 ID
 */
export async function recordModelUsage(modelId: string): Promise<void> {
  return safeInvoke("record_model_usage", { modelId });
}

/**
 * 获取模型同步状态
 */
export async function getModelSyncState(): Promise<ModelSyncState> {
  const response =
    await requestModelRegistryAppServer<ModelSyncStateReadAppServerResponse>(
      METHOD_MODEL_SYNC_STATE_READ,
      {},
    );
  if (!response.syncState) {
    throw new Error("App Server modelSyncState/read did not return syncState");
  }
  return response.syncState;
}

/**
 * 按 Provider 获取模型
 * @param providerId Provider ID
 */
export async function getModelsForProvider(
  providerId: string,
): Promise<EnhancedModelMetadata[]> {
  return readModelsFromAppServer({ providerId });
}

/**
 * 按服务等级获取模型
 * @param tier 服务等级
 */
export async function getModelsByTier(
  tier: ModelTier,
): Promise<EnhancedModelMetadata[]> {
  return readModelsFromAppServer({ tier });
}

export async function fetchProviderModelsAuto(
  providerId: string,
): Promise<FetchProviderModelsResult> {
  return safeInvoke("fetch_provider_models_auto", { providerId });
}

/**
 * 获取指定 Provider 的别名配置
 * 用于获取中转服务或协议转换相关的模型别名映射
 * @param provider Provider ID
 */
export async function getProviderAliasConfig(
  provider: string,
  options: ModelRegistryQueryOptions = {},
): Promise<ProviderAliasConfig | null> {
  const normalizedProvider = normalizeProviderKey(provider);
  if (!normalizedProvider) {
    return null;
  }

  if (options.forceRefresh) {
    invalidateAliasConfigCache();
  }

  if (allAliasConfigsCache) {
    return cloneValue(allAliasConfigsCache[normalizedProvider] ?? null);
  }

  if (providerAliasConfigCache.has(normalizedProvider)) {
    return cloneValue(providerAliasConfigCache.get(normalizedProvider) ?? null);
  }

  const existingPromise =
    providerAliasConfigLoadingPromises.get(normalizedProvider);
  if (existingPromise) {
    return cloneValue(await existingPromise);
  }

  const loadingPromise =
    requestModelRegistryAppServer<ModelProviderAliasReadAppServerResponse>(
      METHOD_MODEL_PROVIDER_ALIAS_READ,
      { provider: normalizedProvider },
    )
      .then((config) => {
        const snapshot = config.config ? cloneValue(config.config) : null;
        providerAliasConfigCache.set(normalizedProvider, snapshot);
        return snapshot;
      })
      .finally(() => {
        providerAliasConfigLoadingPromises.delete(normalizedProvider);
      });

  providerAliasConfigLoadingPromises.set(normalizedProvider, loadingPromise);
  return cloneValue(await loadingPromise);
}

/**
 * 获取所有 Provider 的别名配置
 */
export async function getAllAliasConfigs(): Promise<
  Record<string, ProviderAliasConfig>
> {
  return getAllAliasConfigsCached();
}

async function getAllAliasConfigsCached(
  options: ModelRegistryQueryOptions = {},
): Promise<Record<string, ProviderAliasConfig>> {
  if (options.forceRefresh) {
    invalidateAliasConfigCache();
  }

  if (allAliasConfigsCache) {
    return cloneValue(allAliasConfigsCache);
  }

  if (!allAliasConfigsLoadingPromise) {
    allAliasConfigsLoadingPromise =
      requestModelRegistryAppServer<ModelProviderAliasListAppServerResponse>(
        METHOD_MODEL_PROVIDER_ALIAS_LIST,
        {},
      )
        .then((configs) => {
          if (!configs.configs) {
            throw new Error(
              "App Server modelProviderAlias/list did not return configs",
            );
          }
          allAliasConfigsCache = cloneValue(configs.configs);
          providerAliasConfigCache.clear();
          Object.entries(allAliasConfigsCache).forEach(([key, value]) => {
            providerAliasConfigCache.set(key, cloneValue(value));
          });
          return allAliasConfigsCache;
        })
        .finally(() => {
          allAliasConfigsLoadingPromise = null;
        });
  }

  return cloneValue(await allAliasConfigsLoadingPromise);
}

/**
 * 模型注册表 API 对象
 */
export const modelRegistryApi = {
  getModelRegistry,
  getModelRegistryProviderIds,
  refreshModelRegistry,
  searchModels,
  getModelPreferences,
  toggleModelFavorite,
  hideModel,
  recordModelUsage,
  getModelSyncState,
  getModelsForProvider,
  getModelsByTier,
  fetchProviderModelsAuto,
  normalizeFetchProviderModelsSource,
  getProviderAliasConfig,
  getAllAliasConfigs: getAllAliasConfigsCached,
};
