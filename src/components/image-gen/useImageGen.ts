/**
 * @file 图片生成 Hook
 * @description 管理图片生成状态，复用 AI 服务商设置中的 API Key Provider
 * @module components/image-gen/useImageGen
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useApiKeyProvider } from "@/hooks/useApiKeyProvider";
import {
  importMaterialFromUrl,
  type ImportMaterialFromUrlRequest,
} from "@/lib/api/materials";
import {
  findDefaultImageCapabilityProvider,
  isImageCapabilityProvider,
  resolveImageCapabilityModels,
} from "@/lib/imageGen/catalog";
import { isDebugFlagEnabled } from "@/lib/perfDebug";
import { setStoredResourceProjectId } from "@/lib/resourceProjectSelection";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import type { GeneratedImage } from "./types";
import {
  IMAGE_GEN_MATERIAL_TAG,
  buildGeneratedImageMaterialName,
  loadStoredImageGenerationHistory,
  saveStoredImageGenerationHistory,
} from "./imageGenLocalState";
import {
  IMAGE_GENERATION_CANCELED_MESSAGE,
  createAbortError,
  isGenerationCanceledError,
} from "./imageExecutorUtils";
import { resolveImageErrorPresentation } from "./imageErrorPresentation";
import { requestImagesFromLocalImageServer } from "./localImageServerExecutor";

export { IMAGE_GENERATION_CANCELED_MESSAGE } from "./imageExecutorUtils";

const PROVIDER_DEBUG_KEY = "lime:provider-debug";

interface GenerateImageOptions {
  imageCount?: number;
  referenceImages?: string[];
  size?: string;
  targetProjectId?: string;
}

interface BackfillImagesResult {
  total: number;
  saved: number;
  failed: number;
  skipped: number;
  errors: string[];
}

interface SaveImageToResourceResult {
  saved: boolean;
  skipped: boolean;
  error?: string;
}

interface UseImageGenOptions {
  preferredProviderId?: string;
  preferredModelId?: string;
  allowFallback?: boolean;
  providerLoadEnabled?: boolean;
  providerLoadMode?: "immediate" | "deferred";
  providerDeferredDelayMs?: number;
  selectionScopeKey?: string;
}

const IMAGE_GEN_PROVIDER_IDLE_TIMEOUT_MS = 1_500;

function imageGenDebugLog(...args: unknown[]): void {
  if (!isDebugFlagEnabled(PROVIDER_DEBUG_KEY)) {
    return;
  }

  console.debug("[image-gen]", ...args);
}

/**
 * 检查 Provider 是否支持图片生成
 * 优先按统一能力目录判断，保留旧关键字列表作为兜底调试信息。
 */
function isImageGenProvider(provider: {
  id: string;
  type: string;
  custom_models?: string[];
  api_host?: string;
}): boolean {
  return isImageCapabilityProvider({
    id: provider.id,
    type: provider.type,
    custom_models: provider.custom_models,
    api_host: provider.api_host,
  });
}

export function useImageGen(options: UseImageGenOptions = {}) {
  const providerLoadEnabled = options.providerLoadEnabled ?? true;
  const providerLoadMode = options.providerLoadMode ?? "immediate";
  const providerDeferredDelayMs =
    options.providerDeferredDelayMs ?? IMAGE_GEN_PROVIDER_IDLE_TIMEOUT_MS;
  const [providerLoadReady, setProviderLoadReady] = useState(
    providerLoadEnabled && providerLoadMode !== "deferred",
  );
  const imageProviderRuntime = useApiKeyProvider({
    autoLoad: providerLoadReady,
  });
  const { providers, loading: providersLoading } = imageProviderRuntime;
  const preferredProviderId = options.preferredProviderId?.trim() || "";
  const preferredModelId = options.preferredModelId?.trim() || "";
  const allowFallback = options.allowFallback ?? true;
  const selectionScopeKey = options.selectionScopeKey?.trim() || "";

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("1024x1024");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [resourceSavingCount, setResourceSavingCount] = useState(0);
  const imagesRef = useRef<GeneratedImage[]>([]);
  const generationAbortControllerRef = useRef<AbortController | null>(null);
  const generationRunIdRef = useRef(0);
  const syncedPreferredProviderIdRef = useRef("");
  const syncedPreferredModelIdRef = useRef("");
  const hasManualProviderSelectionRef = useRef(false);
  const syncedSelectionScopeKeyRef = useRef("");

  useEffect(() => {
    if (syncedSelectionScopeKeyRef.current === selectionScopeKey) {
      return;
    }

    syncedSelectionScopeKeyRef.current = selectionScopeKey;
    hasManualProviderSelectionRef.current = false;
    syncedPreferredProviderIdRef.current = "";
    syncedPreferredModelIdRef.current = "";
    setSelectedProviderId("");
    setSelectedModelId("");
  }, [selectionScopeKey]);

  useEffect(() => {
    if (!providerLoadEnabled) {
      return;
    }

    if (providerLoadMode !== "deferred") {
      setProviderLoadReady(true);
      return;
    }

    if (providerLoadReady) {
      return;
    }

    return scheduleMinimumDelayIdleTask(
      () => {
        setProviderLoadReady(true);
      },
      {
        minimumDelayMs: providerDeferredDelayMs,
        idleTimeoutMs: IMAGE_GEN_PROVIDER_IDLE_TIMEOUT_MS,
      },
    );
  }, [
    providerDeferredDelayMs,
    providerLoadEnabled,
    providerLoadMode,
    providerLoadReady,
  ]);

  const ensureProvidersLoaded = useCallback(() => {
    setProviderLoadReady(true);
  }, []);

  const availableProviders = useMemo(() => {
    imageGenDebugLog(
      "[useImageGen] 所有 Provider:",
      providers.map((p) => ({
        id: p.id,
        type: p.type,
        enabled: p.enabled,
        api_key_count: p.api_key_count,
        isImageGen: isImageGenProvider(p),
      })),
    );

    const filtered = providers.filter(
      (p) => p.enabled && p.api_key_count > 0 && isImageGenProvider(p),
    );

    imageGenDebugLog(
      "[useImageGen] 过滤后的 Provider:",
      filtered.map((p) => p.id),
    );
    return filtered;
  }, [providers]);

  // 从 localStorage 加载历史记录
  useEffect(() => {
    try {
      const parsed = loadStoredImageGenerationHistory();
      setImages(parsed);
      if (parsed.length > 0) {
        setSelectedImageId(parsed[0].id);
      }
    } catch (e) {
      console.error("加载历史记录失败:", e);
    }
  }, []);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // 自动选择可用 Provider，优先使用项目偏好
  useEffect(() => {
    if (availableProviders.length === 0) {
      if (selectedProviderId) {
        setSelectedProviderId("");
      }
      return;
    }

    const preferredProvider = preferredProviderId
      ? availableProviders.find(
          (provider) => provider.id === preferredProviderId,
        )
      : null;
    const preferredProviderChanged =
      syncedPreferredProviderIdRef.current !== preferredProviderId;
    const currentProviderAvailable = availableProviders.some(
      (provider) => provider.id === selectedProviderId,
    );

    if (preferredProviderChanged) {
      syncedPreferredProviderIdRef.current = preferredProviderId;
      if (preferredProvider && selectedProviderId !== preferredProvider.id) {
        hasManualProviderSelectionRef.current = false;
        setSelectedProviderId(preferredProvider.id);
        return;
      }
    }

    if (preferredProviderId && !preferredProvider && !allowFallback) {
      if (
        selectedProviderId &&
        currentProviderAvailable &&
        hasManualProviderSelectionRef.current
      ) {
        return;
      }
      if (selectedProviderId) {
        hasManualProviderSelectionRef.current = false;
        setSelectedProviderId("");
      }
      return;
    }

    if (selectedProviderId && currentProviderAvailable) {
      return;
    }

    const nextProvider = preferredProvider
      ? preferredProvider
      : allowFallback
        ? findDefaultImageCapabilityProvider(availableProviders)
        : null;

    if (nextProvider) {
      hasManualProviderSelectionRef.current = false;
      setSelectedProviderId(nextProvider.id);
    }
  }, [
    allowFallback,
    availableProviders,
    preferredProviderId,
    selectedProviderId,
  ]);

  // 保存历史记录
  const saveHistory = useCallback((newImages: GeneratedImage[]) => {
    saveStoredImageGenerationHistory(newImages);
  }, []);

  const cancelGeneration = useCallback(() => {
    const cancelledPresentation = resolveImageErrorPresentation(
      IMAGE_GENERATION_CANCELED_MESSAGE,
    );
    generationRunIdRef.current += 1;
    const activeController = generationAbortControllerRef.current;
    generationAbortControllerRef.current = null;

    if (activeController && !activeController.signal.aborted) {
      activeController.abort(
        createAbortError(IMAGE_GENERATION_CANCELED_MESSAGE),
      );
    }

    setGenerating(false);
    setImages((prev) => {
      let changed = false;
      const updated = prev.map((image) => {
        if (image.status !== "generating") {
          return image;
        }
        changed = true;
        return {
          ...image,
          status: "error" as const,
          error: cancelledPresentation.message,
          errorRecoveryHint: cancelledPresentation.recoveryHint,
        };
      });

      if (!changed) {
        return prev;
      }

      saveHistory(updated);
      return updated;
    });
  }, [saveHistory]);

  useEffect(() => {
    return () => {
      generationRunIdRef.current += 1;
      const activeController = generationAbortControllerRef.current;
      generationAbortControllerRef.current = null;
      if (activeController && !activeController.signal.aborted) {
        activeController.abort(
          createAbortError(IMAGE_GENERATION_CANCELED_MESSAGE),
        );
      }
    };
  }, []);

  const savingToResource = resourceSavingCount > 0;

  const saveImageToResource = useCallback(
    async (
      image: GeneratedImage,
      targetProjectId: string,
    ): Promise<SaveImageToResourceResult> => {
      const normalizedTargetProjectId = targetProjectId.trim();
      if (!normalizedTargetProjectId) {
        return { saved: false, skipped: true, error: "未指定目标资源库" };
      }

      if (image.status !== "complete" || !image.url) {
        return { saved: false, skipped: true };
      }

      const existing = imagesRef.current.find((item) => item.id === image.id);
      if (
        existing?.resourceMaterialId &&
        existing.resourceProjectId === normalizedTargetProjectId
      ) {
        return { saved: false, skipped: true };
      }

      const request: ImportMaterialFromUrlRequest = {
        projectId: normalizedTargetProjectId,
        name: buildGeneratedImageMaterialName(image),
        type: "image",
        url: image.url,
        tags: [IMAGE_GEN_MATERIAL_TAG],
        description: `图片生成自动入库（模型：${image.model}，尺寸：${image.size}）`,
      };

      setResourceSavingCount((count) => count + 1);
      try {
        const savedMaterial = await importMaterialFromUrl(request);

        const savedAt = Date.now();
        setImages((prev) => {
          const updated = prev.map((item) =>
            item.id === image.id
              ? {
                  ...item,
                  resourceMaterialId: savedMaterial.id,
                  resourceProjectId: normalizedTargetProjectId,
                  resourceSavedAt: savedAt,
                  resourceSaveError: undefined,
                  resourceSaveErrorRecoveryHint: undefined,
                }
              : item,
          );
          saveHistory(updated);
          return updated;
        });
        setStoredResourceProjectId(normalizedTargetProjectId, {
          source: "image-gen-save",
          syncLegacy: true,
          emitEvent: true,
        });

        return { saved: true, skipped: false };
      } catch (error) {
        const errorPresentation = resolveImageErrorPresentation(error);

        setImages((prev) => {
          const updated = prev.map((item) =>
            item.id === image.id
              ? {
                  ...item,
                  resourceSaveError: errorPresentation.message,
                  resourceSaveErrorRecoveryHint: errorPresentation.recoveryHint,
                }
              : item,
          );
          saveHistory(updated);
          return updated;
        });

        return {
          saved: false,
          skipped: false,
          error: errorPresentation.message,
        };
      } finally {
        setResourceSavingCount((count) => Math.max(0, count - 1));
      }
    },
    [saveHistory],
  );

  // 获取当前选中的 Provider
  const selectedProvider = useMemo(() => {
    return availableProviders.find((p) => p.id === selectedProviderId);
  }, [availableProviders, selectedProviderId]);
  const preferredProviderUnavailable = useMemo(
    () =>
      Boolean(preferredProviderId) &&
      !providersLoading &&
      !availableProviders.some(
        (provider) => provider.id === preferredProviderId,
      ),
    [availableProviders, preferredProviderId, providersLoading],
  );

  // 获取当前 Provider 支持的模型
  const availableModels = useMemo(() => {
    if (!selectedProvider) return [];
    return resolveImageCapabilityModels({
      id: selectedProvider.id,
      type: selectedProvider.type,
      custom_models: selectedProvider.custom_models,
      api_host: selectedProvider.api_host,
    });
  }, [selectedProvider]);

  // 获取当前选中的模型
  const selectedModel = useMemo(() => {
    return availableModels.find((m) => m.id === selectedModelId);
  }, [availableModels, selectedModelId]);

  useEffect(() => {
    if (availableModels.length === 0) {
      return;
    }

    const preferredModelChanged =
      syncedPreferredModelIdRef.current !== preferredModelId;

    if (preferredModelChanged) {
      syncedPreferredModelIdRef.current = preferredModelId;
      if (
        preferredModelId &&
        availableModels.some((model) => model.id === preferredModelId) &&
        selectedModelId !== preferredModelId
      ) {
        setSelectedModelId(preferredModelId);
        return;
      }
    }

    if (
      preferredModelId &&
      availableModels.some((model) => model.id === preferredModelId) &&
      selectedModelId !== preferredModelId
    ) {
      setSelectedModelId(preferredModelId);
      return;
    }

    const hasSelectedModel = availableModels.some(
      (model) => model.id === selectedModelId,
    );

    if (!hasSelectedModel) {
      setSelectedModelId(availableModels[0]?.id ?? "");
    }
  }, [availableModels, preferredModelId, selectedModelId]);

  // 获取当前选中的图片
  const selectedImage = useMemo(() => {
    return images.find((img) => img.id === selectedImageId);
  }, [images, selectedImageId]);

  // 切换 Provider 时更新模型
  const handleProviderChange = useCallback(
    (providerId: string) => {
      hasManualProviderSelectionRef.current = true;
      setSelectedProviderId(providerId);
      const provider = availableProviders.find((p) => p.id === providerId);
      if (provider) {
        const models = resolveImageCapabilityModels({
          id: provider.id,
          type: provider.type,
          custom_models: provider.custom_models,
          api_host: provider.api_host,
        });
        if (models.length > 0) {
          setSelectedModelId(models[0].id);
        }
      }
    },
    [availableProviders],
  );

  // 生成图片
  const generateImage = useCallback(
    async (
      prompt: string,
      options?: GenerateImageOptions,
    ): Promise<GeneratedImage[]> => {
      if (!selectedProvider) {
        if (preferredProviderUnavailable && !allowFallback) {
          throw new Error(
            `当前默认图片服务不可用：${preferredProviderId}。请到媒体服务 > 图片服务中调整默认 Provider，或开启自动回退。`,
          );
        }
        throw new Error("请先在设置 -> AI 服务商中配置 API Key Provider");
      }

      const generationCount = Math.max(
        1,
        Math.min(options?.imageCount ?? 1, 8),
      );
      const requestSize = options?.size || selectedSize;
      const referenceImages = options?.referenceImages || [];
      const targetProjectId = options?.targetProjectId?.trim() || "";
      const resolvedModelId =
        selectedModel?.id || availableModels[0]?.id || selectedModelId;

      if (!resolvedModelId) {
        throw new Error(
          "当前图片服务没有可用模型，请到媒体服务 > 图片服务中检查模型配置。",
        );
      }

      if (
        generationAbortControllerRef.current &&
        !generationAbortControllerRef.current.signal.aborted
      ) {
        cancelGeneration();
      }

      const generationController = new AbortController();
      const generationRunId = generationRunIdRef.current + 1;
      generationRunIdRef.current = generationRunId;
      generationAbortControllerRef.current = generationController;

      const ensureGenerationStillActive = () => {
        if (
          generationRunIdRef.current !== generationRunId ||
          generationController.signal.aborted
        ) {
          throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
        }
      };

      const canCommitGenerationState = () =>
        generationRunIdRef.current === generationRunId &&
        !generationController.signal.aborted;

      const baseId = Date.now();
      const generationItems: GeneratedImage[] = Array.from(
        { length: generationCount },
        (_, index) => ({
          id: `img-${baseId}-${index}`,
          url: "",
          prompt,
          model: resolvedModelId,
          size: requestSize,
          providerId: selectedProvider.id,
          providerName: selectedProvider.name,
          createdAt: baseId + index,
          status: "generating",
        }),
      );

      setImages((prev) => {
        const updated = [...generationItems, ...prev];
        saveHistory(updated);
        return updated;
      });
      setSelectedImageId(generationItems[0]?.id || null);

      setGenerating(true);
      const completedResults: GeneratedImage[] = [];

      try {
        const urls = await requestImagesFromLocalImageServer({
          providerId: selectedProvider.id,
          model: resolvedModelId,
          prompt,
          count: generationCount,
          size: requestSize,
          referenceImages,
          signal: generationController.signal,
        });
        ensureGenerationStillActive();

        const completedImages: GeneratedImage[] = generationItems.flatMap(
          (item, index) => {
            const imageUrl = urls[index];
            if (!imageUrl) {
              return [];
            }
            return [
              {
                ...item,
                url: imageUrl,
                status: "complete" as const,
                error: undefined,
              },
            ];
          },
        );

        setImages((prev) => {
          if (!canCommitGenerationState()) {
            return prev;
          }
          const updated = prev.map((img) => {
            const index = generationItems.findIndex(
              (item) => item.id === img.id,
            );

            if (index === -1) return img;

            const imageUrl = urls[index];
            if (imageUrl) {
              return {
                ...img,
                url: imageUrl,
                status: "complete" as const,
                error: undefined,
              };
            }

            return {
              ...img,
              status: "error" as const,
              error: "服务返回的图片数量少于请求数量",
            };
          });

          saveHistory(updated);
          return updated;
        });

        if (targetProjectId) {
          for (const image of completedImages) {
            ensureGenerationStillActive();
            await saveImageToResource(image, targetProjectId);
            ensureGenerationStillActive();
          }
        }

        completedResults.push(...completedImages);
      } catch (error) {
        const errorPresentation = resolveImageErrorPresentation(error);
        const canceled =
          isGenerationCanceledError(error) ||
          generationRunIdRef.current !== generationRunId ||
          generationController.signal.aborted;

        if (!canceled) {
          setImages((prev) => {
            if (!canCommitGenerationState()) {
              return prev;
            }
            const updated = prev.map((img) =>
              generationItems.some((item) => item.id === img.id) &&
              img.status === "generating"
                ? {
                    ...img,
                    status: "error" as const,
                    error: errorPresentation.message,
                    errorRecoveryHint: errorPresentation.recoveryHint,
                  }
                : img,
            );
            saveHistory(updated);
            return updated;
          });
        }

        if (canceled) {
          throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
        }

        const stableError = new Error(errorPresentation.message) as Error & {
          code?: string;
          recoveryHint?: string;
        };
        stableError.code = errorPresentation.code;
        stableError.recoveryHint = errorPresentation.recoveryHint;
        throw stableError;
      } finally {
        if (generationRunIdRef.current === generationRunId) {
          generationAbortControllerRef.current = null;
          setGenerating(false);
        }
      }

      ensureGenerationStillActive();
      return completedResults;
    },
    [
      allowFallback,
      cancelGeneration,
      preferredProviderId,
      preferredProviderUnavailable,
      selectedProvider,
      selectedModel,
      selectedModelId,
      selectedSize,
      saveHistory,
      saveImageToResource,
      availableModels,
    ],
  );

  const backfillImagesToResource = useCallback(
    async (
      targetProjectId: string,
      imageIds?: string[],
    ): Promise<BackfillImagesResult> => {
      const normalizedTargetProjectId = targetProjectId.trim();
      const imageIdSet =
        imageIds && imageIds.length > 0 ? new Set(imageIds) : null;
      const completedImages = imagesRef.current.filter(
        (image) =>
          image.status === "complete" &&
          !!image.url &&
          (!imageIdSet || imageIdSet.has(image.id)),
      );
      const result: BackfillImagesResult = {
        total: completedImages.length,
        saved: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };

      if (!normalizedTargetProjectId) {
        if (completedImages.length > 0) {
          result.failed = completedImages.length;
          result.errors.push("未指定目标资源库");
        }
        return result;
      }

      for (const image of completedImages) {
        if (
          image.resourceMaterialId &&
          image.resourceProjectId === normalizedTargetProjectId
        ) {
          result.skipped += 1;
          continue;
        }

        const saveResult = await saveImageToResource(
          image,
          normalizedTargetProjectId,
        );

        if (saveResult.skipped) {
          result.skipped += 1;
          continue;
        }

        if (saveResult.saved) {
          result.saved += 1;
          continue;
        }

        result.failed += 1;
        if (saveResult.error) {
          result.errors.push(`${image.id}: ${saveResult.error}`);
        }
      }

      return result;
    },
    [saveImageToResource],
  );

  const saveImagesToResource = useCallback(
    async (
      imageIds: string[],
      targetProjectId: string,
    ): Promise<BackfillImagesResult> =>
      backfillImagesToResource(targetProjectId, imageIds),
    [backfillImagesToResource],
  );

  // 删除图片
  const deleteImage = useCallback(
    (id: string) => {
      setImages((prev) => {
        const updated = prev.filter((img) => img.id !== id);
        if (selectedImageId === id) {
          setSelectedImageId(updated[0]?.id || null);
        }
        saveHistory(updated);
        return updated;
      });
    },
    [selectedImageId, saveHistory],
  );

  // 新建图片（创建一个新的空白图片项）
  const newImage = useCallback(() => {
    imageGenDebugLog("[useImageGen] newImage 被调用，创建新图片项");
    const imageId = `img-${Date.now()}`;
    const newImg: GeneratedImage = {
      id: imageId,
      url: "",
      prompt: "",
      model: selectedModelId,
      size: selectedSize,
      providerId: selectedProviderId,
      providerName: selectedProvider?.name || "",
      createdAt: Date.now(),
      status: "pending",
    };

    setImages((prev) => {
      const updated = [newImg, ...prev];
      saveHistory(updated);
      return updated;
    });
    setSelectedImageId(imageId);
  }, [
    selectedModelId,
    selectedSize,
    selectedProviderId,
    selectedProvider,
    saveHistory,
  ]);

  return {
    // Provider 相关
    availableProviders,
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId: handleProviderChange,
    ensureProvidersLoaded,
    providersLoading,
    preferredProviderUnavailable,

    // 模型相关
    availableModels,
    selectedModel,
    selectedModelId,
    setSelectedModelId,

    // 尺寸相关
    selectedSize,
    setSelectedSize,

    // 图片相关
    images,
    selectedImage,
    selectedImageId,
    setSelectedImageId,
    generating,
    savingToResource,

    // 操作
    generateImage,
    cancelGeneration,
    backfillImagesToResource,
    saveImagesToResource,
    deleteImage,
    newImage,
  };
}
