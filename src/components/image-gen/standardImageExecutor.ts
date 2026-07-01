import type { ImageGenRequest, ImageGenResponse } from "./types";
import {
  IMAGE_REQUEST_TIMEOUT_MS,
  buildProviderEndpoint,
  fetchWithManagedAbort,
} from "./imageExecutorUtils";
import {
  extractImageUrlFromPayload,
  previewResponseText,
  tryParseJson,
  wrapBase64AsDataUrl,
} from "./imageResponseParsers";

export async function requestImagesFromStandardImagesApi(params: {
  apiHost: string;
  apiKey: string;
  model: string;
  prompt: string;
  count: number;
  size: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const request: ImageGenRequest = {
    model: params.model,
    prompt: params.prompt,
    n: params.count,
    size: params.size,
  };
  const endpoint = buildProviderEndpoint(
    params.apiHost,
    "/v1/images/generations",
  );
  const response = await fetchWithManagedAbort(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(request),
    },
    {
      timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
      signal: params.signal,
    },
  );

  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();
  const parsedJson = tryParseJson(rawText);

  console.log(
    `[ImageGen][standard/images] endpoint=${endpoint}, status=${response.status}, content-type=${contentType}`,
  );

  if (parsedJson && typeof parsedJson === "object") {
    console.log(
      "[ImageGen][standard/images] response keys:",
      Object.keys(parsedJson as Record<string, unknown>),
    );
  } else {
    console.log(
      "[ImageGen][standard/images] response preview:",
      previewResponseText(rawText),
    );
  }

  if (!response.ok) {
    throw new Error(
      `请求失败: ${response.status} - ${previewResponseText(rawText, 300)}`,
    );
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
    throw new Error("未返回图片 URL（响应中未检测到可解析图片字段）");
  }

  return urls;
}
