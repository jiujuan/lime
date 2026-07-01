import {
  extractGeminiImageUrlFromPayload,
  extractImageUrlFromText,
  looksLikeBase64Data,
  normalizeImageUrl,
  previewResponseText,
  tryParseJson,
} from "./imageResponseParsers";
import {
  IMAGE_GENERATION_CANCELED_MESSAGE,
  IMAGE_REQUEST_TIMEOUT_MS,
  buildProviderEndpoint,
  ensureHttpProtocol,
  fetchWithManagedAbort,
  isAbortLikeError,
  sizeToAspectRatio,
} from "./imageExecutorUtils";

interface GeminiImageContentPartText {
  type: "text";
  text: string;
}

interface GeminiImageContentPartImage {
  type: "image";
  data?: string;
  mime_type?: string;
}

type GeminiImageContentPart =
  | GeminiImageContentPartText
  | GeminiImageContentPartImage;

interface GeminiInteractionsImageRequest {
  model: string;
  input: string | GeminiImageContentPart[];
  response_format: {
    type: "image";
    mime_type: "image/png";
    aspect_ratio?: string;
    image_size?: "1K" | "2K" | "4K";
  };
}

function normalizeGeminiApiHost(apiHost: string): string {
  const trimmed = (apiHost || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://generativelanguage.googleapis.com";
  }

  return ensureHttpProtocol(trimmed);
}

function normalizeGeminiBase64ImageData(referenceImage: string): string | null {
  const normalized = referenceImage.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("data:image/")) {
    const match = normalized.match(/^data:(image\/[\w.+-]+);base64,(.+)$/i);
    if (match?.[2]) {
      return match[2].replace(/\s+/g, "");
    }
  }

  if (looksLikeBase64Data(normalized)) {
    return normalized.replace(/\s+/g, "");
  }

  return null;
}

function resolveGeminiDirectImageReference(
  referenceImage: string,
): GeminiImageContentPartImage | null {
  const normalized = referenceImage.trim();
  if (!normalized) {
    return null;
  }

  const base64Data = normalizeGeminiBase64ImageData(normalized);
  if (base64Data) {
    return {
      type: "image",
      mime_type: "image/png",
      data: base64Data,
    };
  }

  return null;
}

function buildGeminiImageInput(
  prompt: string,
  referenceImages: string[],
): string | GeminiImageContentPart[] {
  const parts: GeminiImageContentPart[] = [];
  const cleanedPrompt = prompt.trim();

  if (cleanedPrompt) {
    parts.push({
      type: "text",
      text: cleanedPrompt,
    });
  }

  for (const referenceImage of referenceImages) {
    const normalizedReference =
      resolveGeminiDirectImageReference(referenceImage);
    if (normalizedReference) {
      parts.push(normalizedReference);
    }
  }

  return parts.length > 0 ? parts : cleanedPrompt;
}

function resolveGeminiImageSize(size: string): "1K" | "2K" | "4K" | undefined {
  const matched = size.match(/^(\d+)x(\d+)$/i);
  if (!matched) {
    return undefined;
  }

  const width = Number.parseInt(matched[1], 10);
  const height = Number.parseInt(matched[2], 10);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge >= 3072) {
    return "4K";
  }
  if (longestEdge >= 1536) {
    return "2K";
  }
  return "1K";
}

function buildGeminiResponseFormat(
  size: string,
): GeminiInteractionsImageRequest["response_format"] {
  const responseFormat: GeminiInteractionsImageRequest["response_format"] = {
    type: "image",
    mime_type: "image/png",
  };

  const aspectRatio = sizeToAspectRatio(size);
  if (aspectRatio) {
    responseFormat.aspect_ratio = aspectRatio;
  }

  const imageSize = resolveGeminiImageSize(size);
  if (imageSize) {
    responseFormat.image_size = imageSize;
  }

  return responseFormat;
}

export async function requestImageFromGemini(
  apiHost: string,
  apiKey: string,
  model: string,
  prompt: string,
  referenceImages: string[],
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  const endpoint = buildProviderEndpoint(
    normalizeGeminiApiHost(apiHost),
    "/v1beta/interactions",
  );
  const request: GeminiInteractionsImageRequest = {
    model,
    input: buildGeminiImageInput(prompt, referenceImages),
    response_format: buildGeminiResponseFormat(size),
  };

  let response: Response;
  try {
    response = await fetchWithManagedAbort(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(request),
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

    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Gemini 图片请求异常: ${rawErrorMessage}`);
  }

  const rawText = await response.text();
  const parsedJson = tryParseJson(rawText);

  console.log(
    `[ImageGen][gemini/image] endpoint=${endpoint}, status=${response.status}`,
  );

  if (!response.ok) {
    throw new Error(
      `Gemini 图片请求失败: ${response.status} - ${previewResponseText(rawText, 300)}`,
    );
  }

  const imageUrl = parsedJson
    ? extractGeminiImageUrlFromPayload(parsedJson)
    : extractImageUrlFromText(rawText);

  if (!imageUrl) {
    throw new Error("Gemini 响应中未找到图片数据");
  }

  return normalizeImageUrl(endpoint, imageUrl);
}
