import {
  extractImageUrlFromPayload,
  extractImageUrlFromText,
  normalizeImageUrl,
  previewResponseText,
  tryParseJson,
} from "./imageResponseParsers";
import {
  IMAGE_GENERATION_CANCELED_MESSAGE,
  IMAGE_REQUEST_TIMEOUT_MS,
  ensureHttpProtocol,
  fetchWithManagedAbort,
  isAbortLikeError,
  isGenerationCanceledError,
  normalizeReferenceImages,
  sizeToAspectRatio,
  sleep,
  type EndpointAttemptResult,
} from "./imageExecutorUtils";

const FAL_DEFAULT_API_HOST = "https://fal.run";
const FAL_QUEUE_API_HOST = "https://queue.fal.run";
const FAL_QUEUE_POLL_INTERVAL_MS = 1500;
const FAL_QUEUE_TIMEOUT_MS = 180_000;

async function attemptFalQueueCancellation(
  cancelUrl: string,
  apiKey: string,
): Promise<void> {
  try {
    const response = await fetchWithManagedAbort(
      cancelUrl,
      {
        method: "PUT",
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      },
      {
        timeoutMs: 10_000,
      },
    );

    if (response.ok || response.status === 404) {
      return;
    }

    const rawText = await response.text();
    console.warn(
      `[ImageGen][fal/queue-cancel] cancel failed: ${response.status} - ${previewResponseText(rawText, 300)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ImageGen][fal/queue-cancel] cancel request failed: ${message}`,
    );
  }
}

function bindFalQueueCancellation(
  cancelUrl: string | undefined,
  apiKey: string,
  signal?: AbortSignal,
): () => void {
  const normalizedCancelUrl = cancelUrl?.trim();
  if (!normalizedCancelUrl || !signal) {
    return () => undefined;
  }

  let cancelRequested = false;
  const requestCancellation = () => {
    if (cancelRequested) {
      return;
    }
    cancelRequested = true;
    void attemptFalQueueCancellation(normalizedCancelUrl, apiKey);
  };

  if (signal.aborted) {
    requestCancellation();
    return () => undefined;
  }

  signal.addEventListener("abort", requestCancellation, { once: true });
  return () => signal.removeEventListener("abort", requestCancellation);
}

function normalizeFalApiHost(apiHost: string): string {
  const trimmed = (apiHost || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return FAL_DEFAULT_API_HOST;
  }
  const normalized = ensureHttpProtocol(trimmed);

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "fal.run" || parsed.hostname === "queue.fal.run") {
      return `${parsed.protocol}//${parsed.hostname}`;
    }
  } catch {
    // noop
  }

  return normalized;
}

function normalizeFalModel(model: string): string {
  const normalized = (model || "").trim();
  if (!normalized) {
    return "fal-ai/nano-banana-pro";
  }
  return normalized.startsWith("fal-ai/") ? normalized : `fal-ai/${normalized}`;
}

export function resolveFalEndpointModelCandidates(
  model: string,
  hasReferenceImages: boolean,
): string[] {
  const endpointModel = normalizeFalModel(model);
  const candidates: string[] = [];
  const pushCandidate = (candidate: string) => {
    const normalized = candidate.trim().replace(/^\/+/, "");
    if (!normalized) {
      return;
    }
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (
    endpointModel.startsWith("fal-ai/bytedance/seedream/v") ||
    endpointModel.startsWith("fal-ai/hunyuan-image/v")
  ) {
    pushCandidate(
      `${endpointModel}/${hasReferenceImages ? "edit" : "text-to-image"}`,
    );
    pushCandidate(endpointModel);
    return candidates;
  }

  if (
    hasReferenceImages &&
    (endpointModel === "fal-ai/nano-banana" ||
      endpointModel === "fal-ai/nano-banana-pro")
  ) {
    pushCandidate(`${endpointModel}/edit`);
    pushCandidate(endpointModel);
    return candidates;
  }

  pushCandidate(endpointModel);
  return candidates;
}

export function buildFalEndpoint(
  apiHost: string,
  endpointModel: string,
): string {
  const normalizedHost = normalizeFalApiHost(apiHost).replace(/\/+$/, "");
  return `${normalizedHost}/${endpointModel.replace(/^\/+/, "")}`;
}

export function resolveFalQueueHost(apiHost: string): string {
  const normalized = normalizeFalApiHost(apiHost);

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "queue.fal.run") {
      return `${parsed.protocol}//${parsed.hostname}`;
    }
    if (parsed.hostname === "fal.run") {
      return `${parsed.protocol}//queue.fal.run`;
    }
  } catch {
    // noop
  }

  return FAL_QUEUE_API_HOST;
}

function stripFalEndpointSuffix(model: string): string {
  return normalizeFalModel(model).replace(
    /(\/(?:edit|text-to-image|text_to_image))$/i,
    "",
  );
}

function isFalNanoBananaModel(model: string): boolean {
  const normalized = stripFalEndpointSuffix(model);
  return (
    normalized === "fal-ai/nano-banana" ||
    normalized === "fal-ai/nano-banana-pro"
  );
}

function isFalNanoBananaEditEndpoint(endpointModel: string): boolean {
  const normalized = normalizeFalModel(endpointModel);
  return /\/edit$/i.test(normalized);
}

export function buildFalInput(
  prompt: string,
  referenceImages: string[],
  size: string,
  endpointModel: string,
  includeOptionalFields = true,
): Record<string, unknown> {
  const cleanedReferences = normalizeReferenceImages(referenceImages);
  const normalizedPrompt = (() => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return trimmedPrompt;
    }

    if (isFalNanoBananaModel(endpointModel) && trimmedPrompt.length < 3) {
      return cleanedReferences.length > 0
        ? `请基于参考图围绕“${trimmedPrompt}”完成图像编辑`
        : `请围绕“${trimmedPrompt}”生成一张图像`;
    }

    return trimmedPrompt;
  })();
  const input: Record<string, unknown> = {
    prompt: normalizedPrompt,
    num_images: 1,
  };

  if (isFalNanoBananaModel(endpointModel)) {
    if (
      cleanedReferences.length > 0 &&
      isFalNanoBananaEditEndpoint(endpointModel)
    ) {
      input.image_urls = cleanedReferences;
    }

    const aspectRatio = sizeToAspectRatio(size);
    if (aspectRatio) {
      input.aspect_ratio = aspectRatio;
    }

    input.output_format = "png";
    input.safety_tolerance = "4";
    return input;
  }

  if (cleanedReferences.length > 0) {
    input.image_urls = cleanedReferences;
    input.image_url = cleanedReferences[0];
  }

  if (!includeOptionalFields) {
    return input;
  }

  input.enable_safety_checker = false;

  const matchedSize = size.match(/^(\d+)x(\d+)$/i);
  if (matchedSize) {
    const width = Number.parseInt(matchedSize[1], 10);
    const height = Number.parseInt(matchedSize[2], 10);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      input.image_size = { width, height };
    }
  }

  const aspectRatio = sizeToAspectRatio(size);
  if (aspectRatio) {
    input.aspect_ratio = aspectRatio;
  }

  return input;
}

function resolveFalQueueResponseEndpoint(candidate: string): string {
  const normalized = candidate.trim().replace(/\/+$/, "");
  if (!normalized) {
    return normalized;
  }

  if (/\/response(?:\?.*)?$/i.test(normalized)) {
    return normalized;
  }

  if (/\/status(?:\/stream)?(?:\?.*)?$/i.test(normalized)) {
    return normalized.replace(/\/status(?:\/stream)?(?:\?.*)?$/i, "/response");
  }

  return `${normalized}/response`;
}

function buildFalQueueResultCandidates(
  responseUrl?: string,
  statusUrl?: string,
  fallbackRequestBase?: string,
): string[] {
  const candidates: string[] = [];
  const pushCandidate = (candidate?: string) => {
    const normalized = candidate?.trim();
    if (!normalized || candidates.includes(normalized)) {
      return;
    }
    candidates.push(normalized);
  };

  if (responseUrl) {
    pushCandidate(responseUrl);
    pushCandidate(resolveFalQueueResponseEndpoint(responseUrl));
  }

  if (statusUrl) {
    const legacyBase = statusUrl.replace(
      /\/status(?:\/stream)?(?:\?.*)?$/i,
      "",
    );
    pushCandidate(resolveFalQueueResponseEndpoint(statusUrl));
    pushCandidate(legacyBase);
  }

  if (fallbackRequestBase) {
    pushCandidate(resolveFalQueueResponseEndpoint(fallbackRequestBase));
    pushCandidate(fallbackRequestBase);
  }

  return candidates;
}

interface FalQueueResultFetch {
  imageUrl: string | null;
  error: string | null;
  pending: boolean;
}

async function fetchFalQueueResult(
  endpoint: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<FalQueueResultFetch> {
  let response: Response;
  try {
    response = await fetchWithManagedAbort(
      endpoint,
      {
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      },
      {
        timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
        signal,
      },
    );
  } catch (error) {
    if (signal?.aborted && isAbortLikeError(error)) {
      throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      imageUrl: null,
      error: `Fal 队列结果获取异常: ${message}`,
      pending: false,
    };
  }

  const rawText = await response.text();
  const payload = tryParseJson(rawText) as Record<string, unknown> | null;
  const statusText =
    typeof payload?.status === "string" ? payload.status.toUpperCase() : "";
  const errorText =
    typeof payload?.error === "string" ? payload.error.trim() : "";

  if (statusText === "COMPLETED" && errorText) {
    return {
      imageUrl: null,
      error: `Fal 队列任务失败: ${errorText}`,
      pending: false,
    };
  }

  if (
    statusText === "FAILED" ||
    statusText === "ERROR" ||
    statusText === "CANCELLED"
  ) {
    return {
      imageUrl: null,
      error: `Fal 队列任务失败: ${errorText || previewResponseText(rawText, 300) || statusText}`,
      pending: false,
    };
  }

  if (
    response.status === 202 ||
    statusText === "IN_QUEUE" ||
    statusText === "IN_PROGRESS"
  ) {
    return {
      imageUrl: null,
      error: null,
      pending: true,
    };
  }

  if (!response.ok) {
    return {
      imageUrl: null,
      error: `Fal 队列结果获取失败: ${response.status} - ${previewResponseText(rawText, 300)}`,
      pending: false,
    };
  }

  const imageUrl = payload
    ? extractImageUrlFromPayload(payload)
    : extractImageUrlFromText(rawText);

  if (imageUrl) {
    return {
      imageUrl,
      error: null,
      pending: false,
    };
  }

  return {
    imageUrl: null,
    error: "Fal 队列结果中未找到图片地址",
    pending: false,
  };
}

async function requestImageFromFalEndpoint(
  endpoint: string,
  payload: Record<string, unknown>,
  apiKey: string,
  logTag: string,
  timeoutMs = IMAGE_REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<EndpointAttemptResult> {
  let response: Response;
  try {
    response = await fetchWithManagedAbort(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      {
        timeoutMs,
        signal,
      },
    );
  } catch (error) {
    if (signal?.aborted && isAbortLikeError(error)) {
      throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      imageUrl: null,
      error: `请求异常: ${message}`,
    };
  }

  const rawText = await response.text();
  const parsedJson = tryParseJson(rawText);

  console.log(
    `[ImageGen][${logTag}] endpoint=${endpoint}, status=${response.status}`,
  );

  if (!response.ok) {
    return {
      imageUrl: null,
      error: `请求失败: ${response.status} - ${previewResponseText(rawText, 300)}`,
    };
  }

  const imageUrl = parsedJson
    ? extractImageUrlFromPayload(parsedJson)
    : extractImageUrlFromText(rawText);

  if (!imageUrl) {
    return {
      imageUrl: null,
      error: "未能从 Fal 响应中提取图片",
    };
  }

  return {
    imageUrl: normalizeImageUrl(endpoint, imageUrl),
    error: null,
  };
}

export async function requestImageFromFalQueue(
  apiHost: string,
  endpointModel: string,
  payload: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const queueHost = resolveFalQueueHost(apiHost).replace(/\/+$/, "");
  const normalizedModel = endpointModel.replace(/^\/+/, "");
  const submitEndpoint = `${queueHost}/${normalizedModel}`;
  let fallbackRequestBase = "";

  const submitResponse = await fetchWithManagedAbort(
    submitEndpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    {
      timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
      signal,
    },
  );

  const submitRaw = await submitResponse.text();
  const submitPayload = tryParseJson(submitRaw) as Record<
    string,
    unknown
  > | null;

  if (!submitResponse.ok) {
    throw new Error(
      `Fal 队列提交失败: ${submitResponse.status} - ${previewResponseText(submitRaw, 300)}`,
    );
  }

  const requestId =
    typeof submitPayload?.request_id === "string"
      ? submitPayload.request_id
      : undefined;
  let statusUrl =
    typeof submitPayload?.status_url === "string"
      ? submitPayload.status_url
      : undefined;
  let responseUrl =
    typeof submitPayload?.response_url === "string"
      ? submitPayload.response_url
      : undefined;
  let cancelUrl =
    typeof submitPayload?.cancel_url === "string"
      ? submitPayload.cancel_url
      : undefined;

  if (requestId) {
    fallbackRequestBase = `${queueHost}/${normalizedModel}/requests/${encodeURIComponent(requestId)}`;
    if (!statusUrl) {
      statusUrl = `${fallbackRequestBase}/status`;
    }
    if (!responseUrl) {
      responseUrl = resolveFalQueueResponseEndpoint(fallbackRequestBase);
    }
    if (!cancelUrl) {
      cancelUrl = `${fallbackRequestBase}/cancel`;
    }
  }

  if (!statusUrl && !responseUrl) {
    throw new Error("Fal 队列提交成功，但返回中缺少状态查询地址");
  }

  const cleanupQueueCancellation = bindFalQueueCancellation(
    cancelUrl,
    apiKey,
    signal,
  );

  try {
    const startedAt = Date.now();
    let queueStatus = "";

    while (Date.now() - startedAt < FAL_QUEUE_TIMEOUT_MS) {
      if (statusUrl) {
        const statusResponse = await fetchWithManagedAbort(
          statusUrl,
          {
            headers: {
              Authorization: `Key ${apiKey}`,
            },
          },
          {
            timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
            signal,
          },
        );
        const statusRaw = await statusResponse.text();
        const statusPayload = tryParseJson(statusRaw) as Record<
          string,
          unknown
        > | null;

        if (!statusResponse.ok) {
          throw new Error(
            `Fal 队列状态查询失败: ${statusResponse.status} - ${previewResponseText(statusRaw, 300)}`,
          );
        }

        if (typeof statusPayload?.response_url === "string") {
          responseUrl = statusPayload.response_url;
        }

        queueStatus =
          typeof statusPayload?.status === "string"
            ? statusPayload.status.toUpperCase()
            : "";

        const queueError =
          typeof statusPayload?.error === "string"
            ? statusPayload.error.trim()
            : "";

        if (queueStatus === "COMPLETED" && queueError) {
          throw new Error(`Fal 队列任务失败: ${queueError}`);
        }

        if (queueStatus === "COMPLETED") {
          break;
        }

        if (
          queueStatus === "FAILED" ||
          queueStatus === "ERROR" ||
          queueStatus === "CANCELLED"
        ) {
          const detail =
            typeof statusPayload?.error === "string"
              ? statusPayload.error
              : previewResponseText(statusRaw, 200);
          throw new Error(`Fal 队列任务失败: ${detail || queueStatus}`);
        }
      } else if (responseUrl) {
        const pollingResult = await fetchFalQueueResult(
          responseUrl,
          apiKey,
          signal,
        );
        if (pollingResult.imageUrl) {
          return normalizeImageUrl(responseUrl, pollingResult.imageUrl);
        }
        if (!pollingResult.pending && pollingResult.error) {
          throw new Error(pollingResult.error);
        }
      }

      await sleep(FAL_QUEUE_POLL_INTERVAL_MS, signal);
    }

    if (Date.now() - startedAt >= FAL_QUEUE_TIMEOUT_MS) {
      throw new Error("Fal 队列任务超时，请稍后重试");
    }

    const finalCandidates = buildFalQueueResultCandidates(
      responseUrl,
      statusUrl,
      fallbackRequestBase || undefined,
    );

    if (finalCandidates.length === 0) {
      throw new Error("Fal 队列任务完成后未返回结果地址");
    }

    const resultErrors: string[] = [];
    for (const endpoint of finalCandidates) {
      const result = await fetchFalQueueResult(endpoint, apiKey, signal);
      if (result.imageUrl) {
        return normalizeImageUrl(endpoint, result.imageUrl);
      }
      if (result.pending) {
        resultErrors.push(`${endpoint}: 结果尚未就绪`);
        continue;
      }
      if (result.error) {
        resultErrors.push(`${endpoint}: ${result.error}`);
      }
    }

    if (resultErrors.length > 0) {
      throw new Error(resultErrors.join("; "));
    }

    throw new Error("Fal 队列结果中未找到图片地址");
  } finally {
    cleanupQueueCancellation();
  }
}

export async function requestImageFromFal(
  apiHost: string,
  apiKey: string,
  model: string,
  prompt: string,
  referenceImages: string[],
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  const cleanedReferences = normalizeReferenceImages(referenceImages);
  const endpointModels = resolveFalEndpointModelCandidates(
    model,
    cleanedReferences.length > 0,
  );
  const errors: string[] = [];

  for (const endpointModel of endpointModels) {
    const primaryInput = buildFalInput(
      prompt,
      cleanedReferences,
      size,
      endpointModel,
      true,
    );
    const compactInput = buildFalInput(
      prompt,
      cleanedReferences,
      size,
      endpointModel,
      false,
    );
    const shouldTryCompact =
      JSON.stringify(primaryInput) !== JSON.stringify(compactInput);
    const endpoint = buildFalEndpoint(apiHost, endpointModel);
    const primaryAttempt = await requestImageFromFalEndpoint(
      endpoint,
      primaryInput,
      apiKey,
      `fal/sync-primary/${endpointModel}`,
      IMAGE_REQUEST_TIMEOUT_MS,
      signal,
    );

    if (primaryAttempt.imageUrl) {
      return primaryAttempt.imageUrl;
    }

    if (primaryAttempt.error) {
      errors.push(`${endpointModel}/sync-primary: ${primaryAttempt.error}`);
    }

    if (shouldTryCompact) {
      const compactAttempt = await requestImageFromFalEndpoint(
        endpoint,
        compactInput,
        apiKey,
        `fal/sync-compact/${endpointModel}`,
        IMAGE_REQUEST_TIMEOUT_MS,
        signal,
      );

      if (compactAttempt.imageUrl) {
        return compactAttempt.imageUrl;
      }

      if (compactAttempt.error) {
        errors.push(`${endpointModel}/sync-compact: ${compactAttempt.error}`);
      }
    }

    try {
      return await requestImageFromFalQueue(
        apiHost,
        endpointModel,
        shouldTryCompact ? compactInput : primaryInput,
        apiKey,
        signal,
      );
    } catch (error) {
      if (isGenerationCanceledError(error)) {
        throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
      }

      const queueError = error instanceof Error ? error.message : String(error);
      errors.push(`${endpointModel}/queue: ${queueError}`);
    }
  }

  throw new Error(`Fal 图片生成失败（${errors.join("; ")}）`);
}
