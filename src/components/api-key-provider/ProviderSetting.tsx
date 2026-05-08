/**
 * @file ProviderSetting 组件
 * @description Provider 的简洁配置页，只保留密钥、模型优先级和连接测试。
 * @module components/api-key-provider/ProviderSetting
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { ProviderIcon } from "@/icons/providers";
import {
  apiKeyProviderApi,
  type ProviderWithKeysDisplay,
  type UpdateProviderRequest,
} from "@/lib/api/apiKeyProvider";
import {
  fetchProviderModelsAuto,
  normalizeFetchProviderModelsSource,
} from "@/lib/api/modelRegistry";
import { getProviderModelAutoFetchCapability } from "@/lib/model/providerModelFetchSupport";
import { getProviderPromptCacheMode } from "@/lib/model/providerPromptCacheSupport";
import { getProviderAccessHelp } from "@/lib/provider/providerAccessHelp";
import { dedupeModelIds, getProviderTypeLabel } from "./providerConfigUtils";
import type { ConnectionTestResult } from "./connectionTestTypes";

// ============================================================================
// 类型定义
// ============================================================================

export interface ProviderSettingProps {
  /** Provider 数据（包含 API Keys） */
  provider: ProviderWithKeysDisplay | null;
  /** 当前授权状态 */
  authStatus?: "ready" | "login_required";
  /** 触发登录或授权 */
  onLogin?: () => void | Promise<void>;
  /** 更新 Provider 配置回调 */
  onUpdate?: (id: string, request: UpdateProviderRequest) => Promise<void>;
  /** 添加 API Key 回调 */
  onAddApiKey?: (
    providerId: string,
    apiKey: string,
    alias?: string,
  ) => Promise<void>;
  /** 测试连接回调 */
  onTestConnection?: (providerId: string) => Promise<ConnectionTestResult>;
  /** 删除或停用 Provider 配置回调 */
  onDeleteProvider?: (providerId: string) => Promise<boolean | void>;
  /** 是否正在加载 */
  loading?: boolean;
  /** 额外的 CSS 类名 */
  className?: string;
}

interface ProviderSettingBodyProps extends ProviderSettingProps {
  provider: ProviderWithKeysDisplay;
}

type InlineStatusTone = "success" | "error" | "info";

interface InlineStatus {
  tone: InlineStatusTone;
  message: string;
}

// ============================================================================
// 辅助函数
// ============================================================================

function formatProviderHost(apiHost: string): string {
  try {
    const url = new URL(apiHost);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return apiHost;
  }
}

function getFirstVisibleApiKey(provider: ProviderWithKeysDisplay): string {
  const key =
    provider.api_keys?.find((apiKey) => apiKey.enabled) ??
    provider.api_keys?.[0];
  return key?.api_key_masked ?? "";
}

function hasConfiguredApiKey(provider: ProviderWithKeysDisplay): boolean {
  if (provider.api_keys && provider.api_keys.length > 0) {
    return provider.api_keys.some((apiKey) => apiKey.enabled);
  }

  return provider.api_key_count > 0;
}

function parseModelDraft(value: string): string[] {
  return dedupeModelIds(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function buildStatusClass(tone: InlineStatusTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "info":
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function getStatusIcon(tone: InlineStatusTone) {
  if (tone === "success") {
    return <CheckCircle2 className="h-4 w-4" />;
  }
  if (tone === "error") {
    return <AlertCircle className="h-4 w-4" />;
  }
  return <Sparkles className="h-4 w-4" />;
}

function extractApiModelIds(models: Array<{ id?: string | null }>): string[] {
  return dedupeModelIds(
    models
      .map((model) => model.id?.trim() ?? "")
      .filter((modelId) => modelId.length > 0),
  );
}

function isResponsesImageModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized.includes("gpt-image") || normalized.includes("gpt-images");
}

function isFalProviderLike(provider: ProviderWithKeysDisplay): boolean {
  const providerId = provider.id.trim().toLowerCase();
  const providerType = provider.type.trim().toLowerCase();
  const apiHost = provider.api_host.trim().toLowerCase();

  return (
    providerType === "fal" ||
    providerId === "fal" ||
    providerId.startsWith("fal-") ||
    providerId.includes("fal.ai") ||
    apiHost.includes("fal.run") ||
    apiHost.includes("queue.fal.run")
  );
}

function isFalModelFetchUnsupported(result: {
  error?: string | null;
  diagnostic_hint?: string | null;
}): boolean {
  const message = `${result.error ?? ""} ${result.diagnostic_hint ?? ""}`
    .trim()
    .toLowerCase();
  return message.includes("fal") && message.includes("/models");
}

function isLikelyFalImageModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith("fal-ai/") ||
    /(nano-banana|banana|flux|seedream|kontext|recraft|ideogram|sdxl|stable-diffusion|image)/.test(
      normalized,
    )
  );
}

function isProviderApiKeyRequired(
  provider: ProviderWithKeysDisplay,
  modelFetchApiKeyRequired: boolean,
): boolean {
  return isFalProviderLike(provider) || modelFetchApiKeyRequired;
}

function isResponsesModelFetchUnsupported(result: {
  error?: string | null;
  diagnostic_hint?: string | null;
}): boolean {
  const message = `${result.error ?? ""} ${result.diagnostic_hint ?? ""}`
    .trim()
    .toLowerCase();
  return (
    message.includes("responses") &&
    (message.includes("/models") || message.includes("models 接口"))
  );
}

function buildResponsesModelFetchStatus(
  result: {
    error?: string | null;
    diagnostic_hint?: string | null;
  },
  models: string[],
): InlineStatus | null {
  if (!isResponsesModelFetchUnsupported(result)) {
    return null;
  }

  const imageModel = models.find(isResponsesImageModel);
  if (imageModel) {
    return {
      tone: "success",
      message: `已确认 Responses 图片模型 ${imageModel}，该入口无需标准 /models 枚举，图片生成会走 Responses image_generation。`,
    };
  }

  return {
    tone: "info",
    message:
      "该 Responses 图片入口不提供标准 /models 枚举；请手动添加 gpt-images-2 或 gpt-image-2，图片生成会走 Responses image_generation。",
  };
}

function buildFalModelFetchStatus(
  provider: ProviderWithKeysDisplay,
  result: {
    error?: string | null;
    diagnostic_hint?: string | null;
  },
  models: string[],
): InlineStatus | null {
  if (!isFalProviderLike(provider) || !isFalModelFetchUnsupported(result)) {
    return null;
  }

  const firstModel = models.find(isLikelyFalImageModel);
  if (firstModel) {
    return {
      tone: "success",
      message: `已确认 Fal 模型 ${firstModel}，Fal 不提供标准 /models 枚举，后续会使用手动声明的模型 ID。`,
    };
  }

  return {
    tone: "info",
    message:
      "Fal 不提供标准 /models 枚举；当前模型优先级没有可用 Fal 图片模型，请手动添加 fal-ai/nano-banana-pro、fal-ai/flux-pro 或其他 fal-ai/... 模型 ID。",
  };
}

// ============================================================================
// 组件实现
// ============================================================================

/**
 * Provider 设置面板组件
 *
 * 只保留最常用路径：API Key、模型优先级、接口获取模型、手动添加模型、测试连接。
 */
export const ProviderSetting: React.FC<ProviderSettingProps> = (props) => {
  if (!props.provider) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center bg-slate-50 px-6",
          props.className,
        )}
        data-testid="provider-setting-empty"
      >
        <div className="w-full max-w-[720px] rounded-[28px] border border-slate-200/80 bg-white p-8 shadow-sm shadow-slate-950/5">
          <div className="flex items-center gap-3 text-slate-900">
            <Sparkles className="h-5 w-5" />
            <p className="text-lg font-semibold">选择或添加模型</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            左侧选择一个已启用模型后，这里只展示密钥、模型优先级和测试连接。
          </p>
        </div>
      </div>
    );
  }

  if (props.authStatus === "login_required") {
    return (
      <div
        className={cn("flex h-full flex-col bg-slate-50", props.className)}
        data-testid="provider-login-required"
        data-provider-id={props.provider.id}
      >
        <div className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          <section className="mx-auto w-full max-w-[820px] rounded-[30px] border border-amber-200 bg-amber-50 p-5 shadow-sm shadow-slate-950/5 lg:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <ProviderIcon
                  providerType={props.provider.id}
                  fallbackText={props.provider.name}
                  size={48}
                  className="flex-shrink-0"
                  data-testid="provider-icon"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate text-xl font-semibold tracking-tight text-amber-950">
                      {props.provider.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-white text-amber-800"
                    >
                      需要登录
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    登录后会自动同步 Lime Hub 的可用模型和本地托管访问凭证；未登录时不会展示本地兜底模型。
                  </p>
                </div>
              </div>

              {props.onLogin ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 rounded-full border-amber-300 bg-white px-4 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
                  onClick={() => {
                    void props.onLogin?.();
                  }}
                  disabled={props.loading}
                  data-testid="provider-login-button"
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  去登录
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return <ProviderSettingBody {...props} provider={props.provider} />;
};

const ProviderSettingBody: React.FC<ProviderSettingBodyProps> = ({
  provider,
  onUpdate,
  onAddApiKey,
  onTestConnection,
  onDeleteProvider,
  loading = false,
  className,
}) => {
  const [modelList, setModelList] = useState<string[]>(
    provider?.custom_models ?? [],
  );
  const [modelDraft, setModelDraft] = useState("");
  const [apiModelIds, setApiModelIds] = useState<string[]>([]);
  const [apiModelQuery, setApiModelQuery] = useState("");
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchStatus, setModelFetchStatus] = useState<InlineStatus | null>(
    null,
  );
  const [providerActionStatus, setProviderActionStatus] =
    useState<InlineStatus | null>(null);
  const [deletingProvider, setDeletingProvider] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<InlineStatus | null>(
    null,
  );

  useEffect(() => {
    setModelList(provider?.custom_models ?? []);
    setModelDraft("");
    setApiModelIds([]);
    setApiModelQuery("");
    setModelFetchStatus(null);
    setProviderActionStatus(null);
    setConnectionStatus(null);
    setApiKeyDraft("");
    setApiKeyDirty(false);
    setShowApiKey(false);
  }, [provider?.id, provider?.custom_models]);

  const providerHostLabel = formatProviderHost(provider.api_host);
  const apiKeyMask = getFirstVisibleApiKey(provider);
  const hasApiKey = hasConfiguredApiKey(provider);
  const accessHelp = getProviderAccessHelp({
    providerId: provider.id,
    providerName: provider.name,
    apiHost: provider.api_host,
  });
  const modelAutoFetchCapability = getProviderModelAutoFetchCapability({
    providerId: provider.id,
    providerType: provider.type,
    apiHost: provider.api_host,
  });
  const modelFetchApiKeyRequired = modelAutoFetchCapability.requiresApiKey;
  const providerApiKeyRequired = isProviderApiKeyRequired(
    provider,
    modelFetchApiKeyRequired,
  );
  const canUseDraftApiKey = apiKeyDirty && apiKeyDraft.trim().length > 0;
  const canReadModelsFromApi =
    modelAutoFetchCapability.supported &&
    (!modelFetchApiKeyRequired || hasApiKey || canUseDraftApiKey);
  const apiKeyInputValue = apiKeyDirty ? apiKeyDraft : apiKeyMask;
  const primaryModel = modelList[0] ?? null;
  const normalizedModelSet = useMemo(
    () => new Set(modelList.map((model) => model.toLowerCase())),
    [modelList],
  );
  const availableApiModels = useMemo(
    () =>
      apiModelIds.filter(
        (modelId) => !normalizedModelSet.has(modelId.toLowerCase()),
      ),
    [apiModelIds, normalizedModelSet],
  );
  const normalizedApiModelQuery = apiModelQuery.trim().toLowerCase();
  const suggestedApiModels = useMemo(
    () =>
      normalizedApiModelQuery
        ? availableApiModels.filter((modelId) =>
            modelId.toLowerCase().includes(normalizedApiModelQuery),
          )
        : availableApiModels,
    [availableApiModels, normalizedApiModelQuery],
  );
  const canDeleteProvider = Boolean(onDeleteProvider);
  const showExplicitPromptCacheBadge =
    getProviderPromptCacheMode(
      provider.type,
      provider.prompt_cache_mode,
      provider.api_host,
    ) === "explicit_only";
  const canTestConnection =
    !loading &&
    !testingConnection &&
    modelList.length > 0 &&
    (!providerApiKeyRequired || hasApiKey || canUseDraftApiKey);

  const persistDraftApiKey = useCallback(async () => {
    const nextApiKey = apiKeyDraft.trim();
    if (!apiKeyDirty || !nextApiKey) {
      return;
    }

    if (!onAddApiKey) {
      throw new Error("当前页面缺少添加 API Key 的能力。");
    }

    await onAddApiKey(provider.id, nextApiKey);
    setApiKeyDraft("");
    setApiKeyDirty(false);
  }, [apiKeyDirty, apiKeyDraft, onAddApiKey, provider.id]);

  const applyModels = useCallback(
    async (nextModels: string[]) => {
      const dedupedModels = dedupeModelIds(nextModels);
      setModelList(dedupedModels);
      setConnectionStatus(null);

      if (onUpdate) {
        await onUpdate(provider.id, { custom_models: dedupedModels });
      }
    },
    [onUpdate, provider.id],
  );

  const addModels = useCallback(
    async (models: string[]) => {
      const nextModels = dedupeModelIds([...modelList, ...models]);
      await applyModels(nextModels);
    },
    [applyModels, modelList],
  );

  const handleAddModelDraft = useCallback(async () => {
    const nextModels = parseModelDraft(modelDraft);
    if (nextModels.length === 0) {
      return;
    }

    await addModels(nextModels);
    setModelDraft("");
  }, [addModels, modelDraft]);

  const handleRemoveModel = useCallback(
    async (modelId: string) => {
      await applyModels(
        modelList.filter(
          (currentModel) =>
            currentModel.toLowerCase() !== modelId.toLowerCase(),
        ),
      );
    },
    [applyModels, modelList],
  );

  const handleSetMainModel = useCallback(
    async (modelId: string) => {
      await applyModels([
        modelId,
        ...modelList.filter(
          (currentModel) =>
            currentModel.toLowerCase() !== modelId.toLowerCase(),
        ),
      ]);
    },
    [applyModels, modelList],
  );

  const handleFetchModelsFromApi = useCallback(async () => {
    if (!modelAutoFetchCapability.supported) {
      setModelFetchStatus({
        tone: "info",
        message:
          modelAutoFetchCapability.unsupportedReason ??
          "当前协议不支持接口获取模型，请手动添加模型 ID。",
      });
      return;
    }

    if (!canReadModelsFromApi) {
      setModelFetchStatus({
        tone: "error",
        message: "请先填写并保存 API 密钥，再从接口获取模型。",
      });
      return;
    }

    setFetchingModels(true);
    setModelFetchStatus(null);

    try {
      await persistDraftApiKey();
      const result = await fetchProviderModelsAuto(provider.id);
      const source = normalizeFetchProviderModelsSource(result);
      const fetchedModelIds = extractApiModelIds(result.models ?? []);

      if (source !== "Api") {
        setApiModelIds([]);
        const responsesStatus = buildResponsesModelFetchStatus(
          result,
          modelList,
        );
        const falStatus = buildFalModelFetchStatus(provider, result, modelList);
        setModelFetchStatus({
          tone:
            responsesStatus?.tone ??
            falStatus?.tone ??
            (source === "Error" ? "error" : "info"),
          message:
            responsesStatus?.message ??
            falStatus?.message ??
            (source === "Error"
              ? (result.error ?? "接口获取模型失败。请手动添加模型 ID。")
              : "接口没有返回实时模型列表。请手动添加模型 ID。"),
        });
        return;
      }

      const effectiveFetchedModelIds = isFalProviderLike(provider)
        ? fetchedModelIds.filter(isLikelyFalImageModel)
        : fetchedModelIds;

      if (effectiveFetchedModelIds.length === 0) {
        setApiModelIds([]);
        setModelFetchStatus({
          tone: "info",
          message: isFalProviderLike(provider)
            ? "Fal 不提供标准 /models 枚举；当前没有可用 Fal 图片模型，请手动添加 fal-ai/nano-banana-pro、fal-ai/flux-pro 或其他 fal-ai/... 模型 ID。"
            : "接口已响应，但没有返回可添加的模型 ID。请手动添加模型。",
        });
        return;
      }

      setApiModelIds(effectiveFetchedModelIds);
      setApiModelQuery("");
      const existingFetchedModelCount = effectiveFetchedModelIds.filter((modelId) =>
        normalizedModelSet.has(modelId.toLowerCase()),
      ).length;
      if (existingFetchedModelCount === effectiveFetchedModelIds.length) {
        setModelFetchStatus({
          tone: "success",
          message: `已确认 ${effectiveFetchedModelIds.length} 个模型，当前模型优先级已包含全部结果。`,
        });
        return;
      }

      setModelFetchStatus({
        tone: "success",
        message: `接口返回 ${effectiveFetchedModelIds.length} 个模型，点击下方模型即可加入优先级。`,
      });
    } catch (error) {
      setModelFetchStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "接口获取模型失败",
      });
    } finally {
      setFetchingModels(false);
    }
  }, [
    canReadModelsFromApi,
    modelList,
    modelAutoFetchCapability.supported,
    modelAutoFetchCapability.unsupportedReason,
    normalizedModelSet,
    persistDraftApiKey,
    provider,
  ]);

  const handleDeleteProvider = useCallback(async () => {
    if (!onDeleteProvider) {
      return;
    }

    const deleteDescription = provider.is_system
      ? "此操作会移除该服务商的已启用模型和本地 API 密钥，系统服务商入口仍可重新添加。"
      : "此操作会移除该服务商和关联密钥。";
    const confirmed = window.confirm(
      `确认删除「${provider.name}」配置？${deleteDescription}`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingProvider(true);
    setProviderActionStatus(null);

    try {
      await onDeleteProvider(provider.id);
      setProviderActionStatus({
        tone: "success",
        message: "配置已删除。",
      });
    } catch (error) {
      setProviderActionStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "删除配置失败",
      });
    } finally {
      setDeletingProvider(false);
    }
  }, [onDeleteProvider, provider.id, provider.is_system, provider.name]);

  const handleTestConnection = useCallback(async () => {
    if (modelList.length === 0) {
      setConnectionStatus({
        tone: "error",
        message: "请先添加至少一个模型，再测试连接。",
      });
      return;
    }

    if (providerApiKeyRequired && !hasApiKey && !canUseDraftApiKey) {
      setConnectionStatus({
        tone: "error",
        message: "请先填写 API 密钥，再测试连接。",
      });
      return;
    }

    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      await persistDraftApiKey();
      const result = onTestConnection
        ? await onTestConnection(provider.id)
        : await apiKeyProviderApi
            .testConnection(provider.id, primaryModel ?? undefined)
            .then((response) => ({
              success: response.success,
              latencyMs: response.latency_ms,
              error: response.error,
              models: response.models,
            }));

      if (result.success) {
        setConnectionStatus({
          tone: "success",
          message:
            result.latencyMs !== undefined
              ? `连接成功 · ${result.latencyMs}ms`
              : "连接成功",
        });
      } else {
        setConnectionStatus({
          tone: "error",
          message: result.error || "连接测试未通过，请检查密钥或模型 ID。",
        });
      }
    } catch (error) {
      setConnectionStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "连接测试失败",
      });
    } finally {
      setTestingConnection(false);
    }
  }, [
    canUseDraftApiKey,
    hasApiKey,
    modelList.length,
    onTestConnection,
    persistDraftApiKey,
    primaryModel,
    providerApiKeyRequired,
    provider.id,
  ]);

  return (
    <div
      className={cn("flex h-full flex-col bg-slate-50", className)}
      data-testid="provider-setting"
      data-provider-id={provider.id}
    >
      <div className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
        <section
          className="mx-auto w-full max-w-[820px] rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5 lg:p-6"
          data-testid="provider-simple-card"
        >
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderIcon
                providerType={provider.id}
                fallbackText={provider.name}
                size={48}
                className="flex-shrink-0"
                data-testid="provider-icon"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    className="min-w-0 truncate text-xl font-semibold tracking-tight text-slate-900"
                    data-testid="provider-name"
                  >
                    {provider.name}
                  </h3>
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-600"
                  >
                    {getProviderTypeLabel(provider.type)}
                  </Badge>
                  {showExplicitPromptCacheBadge ? (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-amber-700"
                      data-testid="provider-prompt-cache-badge"
                    >
                      显式缓存
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 break-all text-sm text-slate-500">
                  {providerHostLabel}
                </p>
              </div>
            </div>

            {accessHelp.url || canDeleteProvider ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {accessHelp.url ? (
                  <a
                    href={accessHelp.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                    data-testid="provider-api-key-link"
                  >
                    去获取 API 密钥
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {canDeleteProvider ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full border-rose-200 bg-white px-3 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => {
                      void handleDeleteProvider();
                    }}
                    disabled={loading || deletingProvider}
                    data-testid="provider-delete-button"
                  >
                    {deletingProvider ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {deletingProvider ? "删除中..." : "删除配置"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </header>

          <div className="mt-6 space-y-6">
            {providerActionStatus ? (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-[16px] border px-3 py-2 text-sm",
                  buildStatusClass(providerActionStatus.tone),
                )}
                data-testid="provider-action-status"
              >
                {getStatusIcon(providerActionStatus.tone)}
                <span className="leading-5">
                  {providerActionStatus.message}
                </span>
              </div>
            ) : null}

            <div className="space-y-2" data-testid="api-key-section">
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="provider-api-key"
                  className="text-sm text-slate-600"
                >
                  API 密钥{providerApiKeyRequired ? "" : "（可选）"}
                </Label>
                {hasApiKey ? (
                  <span className="text-xs text-emerald-600">已配置</span>
                ) : null}
              </div>
              <div className="relative">
                <Input
                  id="provider-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKeyInputValue}
                  onFocus={() => {
                    if (!apiKeyDirty && apiKeyMask) {
                      setApiKeyDraft("");
                      setApiKeyDirty(true);
                    }
                  }}
                  onChange={(event) => {
                    setApiKeyDirty(true);
                    setApiKeyDraft(event.target.value);
                  }}
                  placeholder={
                    providerApiKeyRequired ? "输入 API 密钥" : "本地服务可留空"
                  }
                  className="h-12 rounded-[18px] border-slate-200 bg-white px-4 pr-11"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={loading || testingConnection || fetchingModels}
                  data-testid="provider-api-key-input"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((previous) => !previous)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  aria-label="显示或隐藏 API 密钥"
                  data-testid="provider-api-key-eye-button"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
              {accessHelp.keylessHint ? (
                <p className="text-xs leading-5 text-slate-500">
                  {accessHelp.keylessHint}
                </p>
              ) : null}
            </div>

            <div className="space-y-3" data-testid="model-priority-section">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label className="text-sm text-slate-600">模型优先级</Label>
                  <p className="mt-1 text-xs text-slate-500">
                    只使用接口返回或你手动添加的模型，不再显示本地兜底模型。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full border-slate-200 bg-white"
                  onClick={() => {
                    void handleFetchModelsFromApi();
                  }}
                  disabled={loading || fetchingModels || !canReadModelsFromApi}
                  data-testid="fetch-models-button"
                >
                  {fetchingModels ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  从接口获取
                </Button>
              </div>

              {!modelAutoFetchCapability.supported &&
              modelAutoFetchCapability.unsupportedReason ? (
                <p className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  {modelAutoFetchCapability.unsupportedReason}
                </p>
              ) : null}

              {modelFetchStatus ? (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-[16px] border px-3 py-2 text-sm",
                    buildStatusClass(modelFetchStatus.tone),
                  )}
                  data-testid="model-fetch-status"
                >
                  {getStatusIcon(modelFetchStatus.tone)}
                  <span className="leading-5">{modelFetchStatus.message}</span>
                </div>
              ) : null}

              {availableApiModels.length > 0 ? (
                <div
                  className="rounded-[18px] border border-slate-200/80 bg-slate-50 p-3"
                  data-testid="api-model-suggestions"
                >
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-medium text-slate-500">
                      接口模型（显示 {suggestedApiModels.length} /{" "}
                      {availableApiModels.length} 个，点击添加）
                    </div>
                    <Input
                      value={apiModelQuery}
                      onChange={(event) => setApiModelQuery(event.target.value)}
                      placeholder="筛选接口模型"
                      className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs normal-case sm:w-[220px]"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      data-testid="api-model-filter-input"
                    />
                  </div>
                  <div
                    className="max-h-56 overflow-y-auto pr-1"
                    data-testid="api-model-suggestion-list"
                  >
                    {suggestedApiModels.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {suggestedApiModels.map((modelId) => (
                          <button
                            key={modelId}
                            type="button"
                            onClick={() => {
                              void addModels([modelId]);
                            }}
                            className="max-w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                            data-testid="api-model-suggestion"
                          >
                            <span className="block max-w-[220px] truncate normal-case">
                              {modelId}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-500">
                        没有匹配的接口模型。
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div
                className="rounded-[22px] bg-slate-100 p-3"
                data-testid="model-priority-list"
              >
                <input
                  id="custom-models"
                  type="hidden"
                  value={modelList.join(", ")}
                  readOnly
                />

                {modelList.length > 0 ? (
                  <div className="space-y-2">
                    {modelList.map((modelId, index) => (
                      <div
                        key={modelId}
                        className="flex items-center gap-3 rounded-[16px] bg-white px-3 py-2 text-sm text-slate-800"
                        data-testid="model-priority-item"
                      >
                        <span className="text-slate-400">::</span>
                        {index === 0 ? (
                          <Badge className="border border-amber-200 bg-amber-50 px-2 py-0 text-[11px] text-amber-700 hover:bg-amber-50">
                            主模型
                          </Badge>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate normal-case">
                          {modelId}
                        </span>
                        {index > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              void handleSetMainModel(modelId);
                            }}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            <Star className="mr-1 inline h-3 w-3" />
                            设为主模型
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            void handleRemoveModel(modelId);
                          }}
                          className="text-slate-400 hover:text-rose-600"
                          aria-label={`移除模型 ${modelId}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                    暂无模型。请从接口获取后选择，或手动添加模型 ID。
                  </div>
                )}

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={modelDraft}
                    onChange={(event) => setModelDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        void handleAddModelDraft();
                      }
                    }}
                    placeholder="输入模型 ID，按 Enter 添加"
                    className="h-11 rounded-[16px] border-slate-200 bg-white px-4 normal-case"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loading}
                    data-testid="model-draft-input"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 rounded-[16px] px-4"
                    onClick={() => {
                      void handleAddModelDraft();
                    }}
                    disabled={loading || !modelDraft.trim()}
                    data-testid="model-draft-add-button"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    添加模型
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3" data-testid="connection-test-section">
              <Button
                type="button"
                onClick={() => {
                  void handleTestConnection();
                }}
                disabled={!canTestConnection}
                className="h-12 w-full rounded-full bg-slate-950 text-sm font-semibold text-white hover:bg-slate-800"
                data-testid="provider-test-connection-button"
              >
                {testingConnection ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {testingConnection ? "测试中..." : "测试连接"}
              </Button>

              {!canTestConnection && !testingConnection ? (
                <p className="text-center text-xs text-slate-500">
                  {modelList.length === 0
                    ? "先添加一个模型，再测试连接。"
                    : providerApiKeyRequired && !hasApiKey && !canUseDraftApiKey
                      ? "先填写 API 密钥，再测试连接。"
                      : "当前暂不可测试。"}
                </p>
              ) : null}

              {connectionStatus ? (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-[16px] border px-3 py-2 text-sm",
                    buildStatusClass(connectionStatus.tone),
                  )}
                  data-testid="connection-status"
                >
                  {getStatusIcon(connectionStatus.tone)}
                  <span className="leading-5">{connectionStatus.message}</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// 辅助函数（用于测试）
// ============================================================================

/**
 * 从 Provider 数据中提取简洁设置页所需的信息。
 */
export function extractProviderSettingInfo(
  provider: ProviderWithKeysDisplay | null,
): {
  hasProvider: boolean;
  hasIcon: boolean;
  hasName: boolean;
  hasApiKeyInput: boolean;
  hasModelPriority: boolean;
  hasApiModelFetch: boolean;
  hasConnectionTest: boolean;
} {
  if (!provider) {
    return {
      hasProvider: false,
      hasIcon: false,
      hasName: false,
      hasApiKeyInput: false,
      hasModelPriority: false,
      hasApiModelFetch: false,
      hasConnectionTest: false,
    };
  }

  return {
    hasProvider: true,
    hasIcon: typeof provider.id === "string" && provider.id.length > 0,
    hasName: typeof provider.name === "string" && provider.name.length > 0,
    hasApiKeyInput: true,
    hasModelPriority: true,
    hasApiModelFetch: true,
    hasConnectionTest: true,
  };
}

export default ProviderSetting;
