/**
 * 模型注册表 API
 *
 * 提供与后端 ModelRegistryService 交互的 API
 */

import { AppServerClient } from "@/lib/api/appServer";
import {
  buildModelContextPolicy,
  type ModelContextPolicyInput,
} from "@/lib/model/modelContextPolicy";
import {
  buildModelExecutionPolicy,
  type ModelExecutionPolicyInput,
} from "@/lib/model/modelExecutionPolicy";
import {
  buildModelInputModalityPolicy,
  type ModelInputModalityPolicyInput,
} from "@/lib/model/modelInputModalityPolicy";
import {
  buildModelNativeToolPolicy,
  type ModelNativeToolPolicyInput,
} from "@/lib/model/modelNativeToolPolicy";
import {
  buildModelPickerPolicy,
  type ModelPickerPolicyInput,
} from "@/lib/model/modelPickerPolicy";
import {
  buildModelReasoningOutputPolicy,
  type ModelReasoningOutputPolicyInput,
} from "@/lib/model/modelReasoningOutputPolicy";
import {
  buildModelReasoningPolicy,
  type ModelReasoningPolicyInput,
} from "@/lib/model/modelReasoningPolicy";
import {
  buildModelResponsesPolicy,
  type ModelResponsesPolicyInput,
} from "@/lib/model/modelResponsesPolicy";
import {
  buildModelToolCallPolicy,
  type ModelToolCallPolicyInput,
} from "@/lib/model/modelToolCallPolicy";
import {
  buildModelTruncationPolicy,
  type ModelTruncationPolicyInput,
} from "@/lib/model/modelTruncationPolicy";
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
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_PROVIDER_FETCH_MODELS,
  METHOD_MODEL_SYNC_STATE_READ,
  type ModelInfo,
  type ModelListParams,
  type ModelListResponse,
  type ModelProviderFetchModelsResponse,
  type ModelProviderListResponse,
  type ProviderInfo,
} from "../../../packages/app-server-client/src/protocol";

type ModelRegistryAppServerClient = Pick<AppServerClient, "request">;

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

type ModelProviderIdRecord = {
  id?: unknown;
};

function toSnakeModelInfo(model: ModelInfo): EnhancedModelMetadata {
  return {
    id: model.id,
    display_name: model.displayName,
    provider_id: model.providerId,
    provider_name: model.providerName,
    family: model.family ?? null,
    tier: model.tier as EnhancedModelMetadata["tier"],
    capabilities: {
      vision: Boolean(model.capabilities?.vision),
      tools: Boolean(model.capabilities?.tools),
      streaming: Boolean(model.capabilities?.streaming),
      json_mode: Boolean(model.capabilities?.jsonMode),
      function_calling: Boolean(model.capabilities?.functionCalling),
      reasoning: Boolean(model.capabilities?.reasoning),
      reasoning_effort:
        (model.capabilities?.reasoningEffort as
          | EnhancedModelMetadata["capabilities"]["reasoning_effort"]
          | undefined) ?? null,
    },
    execution_policy: buildModelExecutionPolicy(
      model as ModelExecutionPolicyInput,
    ),
    context_policy: buildModelContextPolicy(model as ModelContextPolicyInput),
    picker_policy: buildModelPickerPolicy(model as ModelPickerPolicyInput),
    tool_call_policy: buildModelToolCallPolicy(
      model as ModelToolCallPolicyInput,
    ),
    reasoning_policy: buildModelReasoningPolicy(
      model as ModelReasoningPolicyInput,
    ),
    reasoning_output_policy: buildModelReasoningOutputPolicy(
      model as ModelReasoningOutputPolicyInput,
    ),
    input_modality_policy: buildModelInputModalityPolicy(
      model as ModelInputModalityPolicyInput,
    ),
    responses_policy: buildModelResponsesPolicy(
      model as ModelResponsesPolicyInput,
    ),
    truncation_policy: buildModelTruncationPolicy(
      model as ModelTruncationPolicyInput,
    ),
    native_tool_policy: buildModelNativeToolPolicy(
      model as ModelNativeToolPolicyInput,
    ),
    task_families: (model.taskFamilies ??
      []) as EnhancedModelMetadata["task_families"],
    input_modalities: (model.inputModalities ??
      []) as EnhancedModelMetadata["input_modalities"],
    output_modalities: (model.outputModalities ??
      []) as EnhancedModelMetadata["output_modalities"],
    runtime_features: (model.runtimeFeatures ??
      []) as EnhancedModelMetadata["runtime_features"],
    deployment_source:
      model.deploymentSource as EnhancedModelMetadata["deployment_source"],
    management_plane:
      model.managementPlane as EnhancedModelMetadata["management_plane"],
    canonical_model_id: model.canonicalModelId ?? null,
    provider_model_id: model.providerModelId ?? null,
    alias_source:
      (model.aliasSource as EnhancedModelMetadata["alias_source"]) ?? null,
    pricing: (model.pricing as EnhancedModelMetadata["pricing"]) ?? null,
    limits: model.limits as EnhancedModelMetadata["limits"],
    status: model.status as EnhancedModelMetadata["status"],
    release_date: model.releaseDate ?? null,
    is_latest: Boolean(model.isLatest),
    description: model.description ?? null,
    source: model.source as EnhancedModelMetadata["source"],
    created_at: model.createdAt,
    updated_at: model.updatedAt,
  };
}

function assertModelInfos(
  models: ModelInfo[] | null | undefined,
  method: string,
): EnhancedModelMetadata[] {
  if (!Array.isArray(models)) {
    if (method === METHOD_MODEL_LIST) {
      throw new Error("App Server model/list did not return models");
    }
    throw new Error(`App Server ${method} did not return models`);
  }
  return models.map(toSnakeModelInfo);
}

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
  const response = await requestModelRegistryAppServer<ModelListResponse>(
    METHOD_MODEL_LIST,
    params,
  );
  return assertModelInfos(response.models, "model/list");
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

function assertModelProviderIds(
  response: ModelProviderListResponse | null | undefined,
): string[] {
  if (!response || typeof response !== "object") {
    throw new Error("App Server modelProvider/list did not return providers");
  }
  if (!Array.isArray(response.providers)) {
    throw new Error("App Server modelProvider/list did not return providers");
  }

  return Array.from(
    new Set(
      response.providers
        .map((provider: ProviderInfo | ModelProviderIdRecord) =>
          typeof provider.id === "string" ? provider.id.trim() : "",
        )
        .filter((providerId) => providerId.length > 0),
    ),
  );
}

function modelMatchesSearchQuery(
  model: EnhancedModelMetadata,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return [
    model.id,
    model.display_name,
    model.provider_id,
    model.provider_name,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function modelPreferenceMutationUnavailable(operation: string): never {
  throw new Error(
    `${operation} 尚未接入 App Server model preference current 写链；旧 Tauri 模型注册表业务命令已退役。`,
  );
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

export async function getModelRegistryProviderIds(): Promise<string[]> {
  const response =
    await requestModelRegistryAppServer<ModelProviderListResponse>(
      METHOD_MODEL_PROVIDER_LIST,
      {},
    );
  return assertModelProviderIds(response);
}

/**
 * 刷新模型注册表（清空已下线的本地模型注册缓存）
 * @returns 当前模型数量
 */
export async function refreshModelRegistry(): Promise<number> {
  invalidateModelRegistryCache();
  const models = await readModelsFromAppServer();
  modelRegistryCache = cloneValue(models);
  return models.length;
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
  const normalizedQuery = query.trim().toLowerCase();
  const models = await getModelRegistry();
  const filteredModels = models.filter((model) =>
    modelMatchesSearchQuery(model, normalizedQuery),
  );
  const safeLimit =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.max(0, Math.floor(limit))
      : undefined;
  return typeof safeLimit === "number"
    ? filteredModels.slice(0, safeLimit)
    : filteredModels;
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
  void modelId;
  return modelPreferenceMutationUnavailable("toggleModelFavorite");
}

/**
 * 隐藏模型
 * @param modelId 模型 ID
 */
export async function hideModel(modelId: string): Promise<void> {
  void modelId;
  modelPreferenceMutationUnavailable("hideModel");
}

/**
 * 记录模型使用
 * @param modelId 模型 ID
 */
export async function recordModelUsage(modelId: string): Promise<void> {
  void modelId;
  modelPreferenceMutationUnavailable("recordModelUsage");
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
  const response =
    await requestModelRegistryAppServer<ModelProviderFetchModelsResponse>(
      METHOD_MODEL_PROVIDER_FETCH_MODELS,
      { providerId },
    );
  return {
    models: assertModelInfos(response.models, "modelProvider/fetchModels"),
    source: response.source === "Api" ? "Api" : "Error",
    error: response.error ?? null,
    request_url: response.requestUrl ?? null,
    diagnostic_hint: response.diagnosticHint ?? null,
    error_kind:
      (response.errorKind as FetchProviderModelsResult["error_kind"]) ?? null,
    should_prompt_error: Boolean(response.shouldPromptError),
    from_cache: Boolean(response.fromCache),
  };
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
