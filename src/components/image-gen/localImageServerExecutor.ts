import { getConfig } from "@/lib/api/appConfig";
import {
  IMAGE_REQUEST_TIMEOUT_MS,
  fetchWithManagedAbort,
} from "./imageExecutorUtils";
import {
  extractImageUrlFromPayload,
  tryParseJson,
  wrapBase64AsDataUrl,
} from "./imageResponseParsers";
import {
  LocalImageServerError,
  classifyLocalImageServerError,
} from "./localImageServerErrors";
import type { ImageGenRequest, ImageGenResponse } from "./types";

function normalizeLocalServerHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::") {
    return "127.0.0.1";
  }
  return trimmed;
}

function buildLocalImageGenerationUrl(params: {
  host: string;
  port: number;
  tlsEnabled?: boolean;
}): string {
  const protocol = params.tlsEnabled ? "https" : "http";
  const host = normalizeLocalServerHost(params.host);
  return `${protocol}://${host}:${params.port}/v1/images/generations`;
}

export async function requestImagesFromLocalImageServer(params: {
  providerId: string;
  model: string;
  prompt: string;
  count: number;
  size: string;
  referenceImages?: string[];
  signal?: AbortSignal;
}): Promise<string[]> {
  const config = await getConfig();
  const endpoint = buildLocalImageGenerationUrl({
    host: config.server.host,
    port: config.server.port,
    tlsEnabled: config.server.tls?.enable,
  });
  const apiKey = config.server.api_key?.trim();

  if (!apiKey) {
    throw new LocalImageServerError(
      "missing_api_key",
      "本机图片服务缺少 API Key，请检查服务配置。",
      {
        status: 401,
      },
    );
  }

  const request: ImageGenRequest = {
    model: params.model,
    prompt: params.prompt,
    n: params.count,
    size: params.size,
    reference_images: params.referenceImages ?? [],
  };
  const response = await fetchWithManagedAbort(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-provider-id": params.providerId,
      },
      body: JSON.stringify(request),
    },
    {
      timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
      signal: params.signal,
    },
  );

  const rawText = await response.text();
  const parsedJson = tryParseJson(rawText);

  if (!response.ok) {
    throw classifyLocalImageServerError({
      response,
      rawText,
      parsedJson,
    });
  }

  const data = (parsedJson || {}) as ImageGenResponse;
  const urls = (data.data || [])
    .map((item) => {
      if (item.url) {
        return item.url;
      }
      if (item.b64_json) {
        return wrapBase64AsDataUrl(item.b64_json);
      }
      return "";
    })
    .filter(Boolean);

  if (urls.length === 0) {
    const fallbackUrl = extractImageUrlFromPayload(parsedJson || rawText);
    if (fallbackUrl) {
      urls.push(fallbackUrl);
    }
  }

  if (urls.length === 0) {
    throw classifyLocalImageServerError({
      response,
      rawText,
      parsedJson,
    });
  }

  return urls;
}

export const __localImageServerExecutorTestUtils = {
  buildLocalImageGenerationUrl,
  normalizeLocalServerHost,
};
