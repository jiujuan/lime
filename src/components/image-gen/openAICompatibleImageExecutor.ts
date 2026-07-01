import {
  extractAssistantTextFromPayload,
  extractImageBase64FromResponsesStreamEvent,
  extractImageUrlFromPayload,
  extractImageUrlFromText,
  normalizeImageUrl,
  previewResponseText,
  stripCodeFence,
  tryParseJson,
  wrapBase64AsDataUrl,
} from "./imageResponseParsers";
import {
  IMAGE_GENERATION_CANCELED_MESSAGE,
  IMAGE_REQUEST_TIMEOUT_MS,
  buildProviderEndpoint,
  fetchWithManagedAbort,
  isAbortLikeError,
  sizeToAspectRatio,
  type EndpointAttemptResult,
  type EndpointRequestOptions,
} from "./imageExecutorUtils";
import { isResponsesImageGenerationModelId } from "@/lib/imageGen/providerMatchers";

export interface OpenAICompatibleImageRequest {
  endpointPath: "/v1/images/generations" | "/v1/images/edits";
  payload: Record<string, unknown>;
  logTag: "new-api/images" | "new-api/images-edit";
}

type NewApiResponsesImageContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

interface NewApiResponsesImageInputMessage {
  role: "user";
  content: NewApiResponsesImageContentPart[];
}

export interface NewApiResponsesImageRequest {
  model: string;
  input: string | NewApiResponsesImageInputMessage[];
  tools: Array<{
    type: "image_generation";
    model: string;
  }>;
  stream: true;
}

function shouldAutoConfirmChat(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  const normalized = stripCodeFence(text);
  return (
    /确认继续|是否继续|要继续吗|你觉得怎么样|是否确认/i.test(normalized) ||
    /不支持.*比例|建议使用.*比例|已支持的比例/i.test(normalized)
  );
}

async function requestImageWithEndpoint(
  endpoint: string,
  payload: Record<string, unknown>,
  apiKey: string,
  logTag: string,
  options?: EndpointRequestOptions,
): Promise<EndpointAttemptResult> {
  const timeoutMs = options?.timeoutMs ?? IMAGE_REQUEST_TIMEOUT_MS;
  let response: Response;

  try {
    response = await fetchWithManagedAbort(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      {
        timeoutMs,
        signal: options?.signal,
      },
    );
  } catch (error) {
    if (options?.signal?.aborted && isAbortLikeError(error)) {
      throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
    }

    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    const loweredMessage = rawErrorMessage.toLowerCase();
    const isTimeoutLike =
      (error instanceof DOMException && error.name === "AbortError") ||
      loweredMessage.includes("timed out") ||
      loweredMessage.includes("timeout") ||
      loweredMessage.includes("load failed") ||
      loweredMessage.includes("networkerror");

    console.warn(
      `[ImageGen][${logTag}] request failed: endpoint=${endpoint}, timeoutMs=${timeoutMs}, error=${rawErrorMessage}`,
    );

    return {
      imageUrl: null,
      error: isTimeoutLike
        ? `请求超时或网络错误: ${rawErrorMessage}`
        : `请求异常: ${rawErrorMessage}`,
      assistantText: null,
      status: 0,
    };
  }

  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();
  const parsedJson = tryParseJson(rawText);

  console.log(
    `[ImageGen][${logTag}] endpoint=${endpoint}, status=${response.status}, content-type=${contentType}`,
  );

  if (parsedJson && typeof parsedJson === "object") {
    const parsedRecord = parsedJson as Record<string, unknown>;

    console.log(
      `[ImageGen][${logTag}] response keys:`,
      Object.keys(parsedRecord),
    );

    const choicesValue = parsedRecord.choices;
    if (Array.isArray(choicesValue) && choicesValue.length > 0) {
      const firstChoice = choicesValue[0];
      if (firstChoice && typeof firstChoice === "object") {
        const firstChoiceRecord = firstChoice as Record<string, unknown>;
        const messageValue = firstChoiceRecord.message;
        if (messageValue && typeof messageValue === "object") {
          const messageRecord = messageValue as Record<string, unknown>;
          const contentValue = messageRecord.content;

          if (typeof contentValue === "string") {
            console.log(
              `[ImageGen][${logTag}] first choice content preview:`,
              previewResponseText(contentValue, 300),
            );
          } else if (Array.isArray(contentValue)) {
            const firstItem = contentValue[0];
            const firstItemKeys =
              firstItem && typeof firstItem === "object"
                ? Object.keys(firstItem as Record<string, unknown>)
                : [];

            console.log(
              `[ImageGen][${logTag}] first choice content array: length=${contentValue.length}, firstItemKeys=${firstItemKeys.join(",") || "none"}`,
            );

            if (typeof firstItem === "string") {
              console.log(
                `[ImageGen][${logTag}] first choice first item preview:`,
                previewResponseText(firstItem, 200),
              );
            } else if (firstItem && typeof firstItem === "object") {
              const firstItemText = (firstItem as Record<string, unknown>).text;
              if (typeof firstItemText === "string") {
                console.log(
                  `[ImageGen][${logTag}] first choice first item text preview:`,
                  previewResponseText(firstItemText, 200),
                );
              }
            }
          } else if (contentValue !== undefined) {
            console.log(
              `[ImageGen][${logTag}] first choice content type:`,
              typeof contentValue,
            );
          }
        }
      }
    }

    const outputValue = parsedRecord.output;
    if (Array.isArray(outputValue) && outputValue.length > 0) {
      const firstOutput = outputValue[0];
      if (firstOutput && typeof firstOutput === "object") {
        console.log(
          `[ImageGen][${logTag}] first output keys:`,
          Object.keys(firstOutput as Record<string, unknown>),
        );
      }
    }
  } else {
    console.log(
      `[ImageGen][${logTag}] response preview:`,
      previewResponseText(rawText),
    );
  }

  const assistantText = extractAssistantTextFromPayload(parsedJson);

  if (assistantText) {
    console.log(
      `[ImageGen][${logTag}] assistant text preview:`,
      previewResponseText(stripCodeFence(assistantText), 260),
    );
  }

  if (!response.ok) {
    return {
      imageUrl: null,
      error: `请求失败: ${response.status} - ${previewResponseText(rawText, 300)}`,
      assistantText,
      status: response.status,
    };
  }

  const imageUrl = parsedJson
    ? extractImageUrlFromPayload(parsedJson)
    : extractImageUrlFromText(rawText);

  if (!imageUrl) {
    return {
      imageUrl: null,
      error: "未能从响应中提取图片",
      assistantText,
      status: response.status,
    };
  }

  const normalizedImageUrl = normalizeImageUrl(endpoint, imageUrl);

  return {
    imageUrl: normalizedImageUrl,
    error: null,
    assistantText,
    status: response.status,
  };
}

export async function requestImageFromNewApi(
  apiHost: string,
  apiKey: string,
  model: string,
  prompt: string,
  referenceImages: string[],
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  const normalizedReferenceImages =
    normalizeOpenAICompatibleImageReferences(referenceImages);
  const referenceText =
    normalizedReferenceImages.length > 0
      ? `\n参考图链接：\n${normalizedReferenceImages
          .map((url, index) => `${index + 1}. ${url}`)
          .join("\n")}`
      : "";

  const imagesRequest = buildOpenAICompatibleImageRequest(
    model,
    prompt,
    normalizedReferenceImages,
    size,
  );
  const prefersResponsesImageGeneration =
    isNewApiResponsesImageGenerationModel(model);
  let responsesStreamAttempt: EndpointAttemptResult | null = null;

  if (prefersResponsesImageGeneration) {
    responsesStreamAttempt = await requestImageFromNewApiResponsesStream(
      apiHost,
      apiKey,
      model,
      prompt,
      normalizedReferenceImages,
      size,
      { signal },
    );

    if (responsesStreamAttempt.imageUrl) {
      return responsesStreamAttempt.imageUrl;
    }

    console.warn(
      `[ImageGen][new-api/responses-stream] failed, fallback to images API: ${responsesStreamAttempt.error || "unknown"}`,
    );

    if (isTerminalNewApiCredentialError(responsesStreamAttempt)) {
      throw new Error(
        `Responses image_generation 调用失败：${responsesStreamAttempt.error || "未知错误"}`,
      );
    }
  }

  const imageEndpoint = buildProviderEndpoint(
    apiHost,
    imagesRequest.endpointPath,
  );
  const imageAttempt = await requestImageWithEndpoint(
    imageEndpoint,
    imagesRequest.payload,
    apiKey,
    imagesRequest.logTag,
    { signal },
  );

  if (imageAttempt.imageUrl) {
    return imageAttempt.imageUrl;
  }

  console.warn(
    `[ImageGen][${imagesRequest.logTag}] failed, fallback to chat: ${imageAttempt.error || "unknown"}`,
  );

  const chatRequest = {
    model,
    messages: [
      {
        role: "user",
        content:
          "请根据以下描述生成一张图片，并以 Markdown 图片格式返回结果。" +
          "\n要求：不要询问是否继续，不要额外解释。若比例不支持，请自动选择最接近的支持比例并直接生成。" +
          (() => {
            const preferredAspectRatio = sizeToAspectRatio(size);
            return preferredAspectRatio
              ? `\n目标分辨率：${size}（优先比例 ${preferredAspectRatio}）`
              : `\n目标分辨率：${size}`;
          })() +
          `\n描述：${prompt}${referenceText}`,
      },
    ],
    temperature: 0.7,
    stream: false,
  };

  const chatEndpoint = buildProviderEndpoint(apiHost, "/v1/chat/completions");
  const chatAttempt = await requestImageWithEndpoint(
    chatEndpoint,
    chatRequest,
    apiKey,
    "new-api/chat",
    { signal },
  );

  if (chatAttempt.imageUrl) {
    return chatAttempt.imageUrl;
  }

  console.warn(
    `[ImageGen][new-api/chat] failed, continue fallback: ${chatAttempt.error || "unknown"}`,
  );

  let chatRetryAttempt: EndpointAttemptResult | null = null;
  if (shouldAutoConfirmChat(chatAttempt.assistantText)) {
    const preferredAspectRatio = sizeToAspectRatio(size);
    const retryMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [
      {
        role: "user",
        content:
          "请直接生成图片，不要询问确认。" +
          (preferredAspectRatio
            ? `\n可优先使用比例：${preferredAspectRatio}`
            : "\n可优先使用最接近可用比例") +
          `\n描述：${prompt}${referenceText}`,
      },
    ];

    if (chatAttempt.assistantText) {
      retryMessages.push({
        role: "assistant",
        content: stripCodeFence(chatAttempt.assistantText),
      });
    }

    retryMessages.push({
      role: "user",
      content:
        "确认继续。请按你建议的可用比例立即生成图片。" +
        "\n只返回 Markdown 图片，不要任何额外文字。",
    });

    chatRetryAttempt = await requestImageWithEndpoint(
      chatEndpoint,
      {
        model,
        messages: retryMessages,
        temperature: 0.7,
        stream: false,
      },
      apiKey,
      "new-api/chat-retry",
      { signal },
    );

    if (chatRetryAttempt.imageUrl) {
      return chatRetryAttempt.imageUrl;
    }

    console.warn(
      `[ImageGen][new-api/chat-retry] failed, fallback to responses: ${chatRetryAttempt.error || "unknown"}`,
    );
  }

  const responsesRequest = {
    model,
    input: `请根据以下描述生成一张图片，仅返回图片结果。\n描述：${prompt}${referenceText}`,
    tools: [{ type: "image_generation" }],
    size,
  };

  const responsesEndpoint = buildProviderEndpoint(apiHost, "/v1/responses");
  const responsesAttempt = await requestImageWithEndpoint(
    responsesEndpoint,
    responsesRequest,
    apiKey,
    "new-api/responses",
    { signal },
  );

  if (responsesAttempt.imageUrl) {
    return responsesAttempt.imageUrl;
  }

  console.warn(
    `[ImageGen][new-api/responses] failed: ${responsesAttempt.error || "unknown"}`,
  );

  if (!responsesStreamAttempt) {
    responsesStreamAttempt = await requestImageFromNewApiResponsesStream(
      apiHost,
      apiKey,
      model,
      prompt,
      normalizedReferenceImages,
      size,
      { signal },
    );

    if (responsesStreamAttempt.imageUrl) {
      return responsesStreamAttempt.imageUrl;
    }

    console.warn(
      `[ImageGen][new-api/responses-stream] failed: ${responsesStreamAttempt.error || "unknown"}`,
    );
  }

  throw new Error(
    `未能从响应中提取图片，请检查服务商返回格式（${imagesRequest.logTag}: ${imageAttempt.error || "未知"}; chat: ${chatAttempt.error || "未知"}; chat-retry: ${chatRetryAttempt?.error || "未触发"}; responses: ${responsesAttempt.error || "未知"}; responses-stream: ${responsesStreamAttempt.error || "未知"}）`,
  );
}

function isNewApiResponsesImageGenerationModel(model: string): boolean {
  return isResponsesImageGenerationModelId(model);
}

function isTerminalNewApiCredentialError(
  attempt: EndpointAttemptResult,
): boolean {
  if (attempt.status !== 401 && attempt.status !== 429) {
    return false;
  }

  const message = (attempt.error || "").toLowerCase();
  return (
    message.includes("quota") ||
    message.includes("token") ||
    message.includes("api key") ||
    message.includes("invalid") ||
    message.includes("unauthorized") ||
    message.includes("rate limit") ||
    message.includes("too many")
  );
}

export async function requestImageFromNewApiResponsesStream(
  apiHost: string,
  apiKey: string,
  model: string,
  prompt: string,
  referenceImages: string[],
  size: string,
  options?: EndpointRequestOptions,
): Promise<EndpointAttemptResult> {
  const endpoint = buildProviderEndpoint(apiHost, "/v1/responses");
  const input = buildNewApiResponsesImageInput(prompt, referenceImages, size);
  const initialPayload = buildNewApiResponsesImageRequest(model, input);
  const initialAttempt = await requestImageFromNewApiResponsesStreamEndpoint(
    endpoint,
    initialPayload,
    apiKey,
    "new-api/responses-stream",
    options,
  );

  if (
    initialAttempt.imageUrl ||
    !shouldRetryNewApiResponsesWithInputList(initialAttempt)
  ) {
    return initialAttempt;
  }

  return requestImageFromNewApiResponsesStreamEndpoint(
    endpoint,
    buildNewApiResponsesImageRequest(model, [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: resolveNewApiResponsesRetryText(input),
          },
        ],
      },
    ]),
    apiKey,
    "new-api/responses-stream-retry",
    options,
  );
}

export function buildNewApiResponsesImageRequest(
  model: string,
  input: NewApiResponsesImageRequest["input"],
): NewApiResponsesImageRequest {
  return {
    model: "gpt-5.5",
    input,
    tools: [{ type: "image_generation", model }],
    stream: true,
  };
}

function resolveNewApiResponsesRetryText(
  input: NewApiResponsesImageRequest["input"],
): string {
  if (typeof input === "string") {
    return input;
  }

  return (
    input[0]?.content.find(
      (
        part,
      ): part is Extract<
        NewApiResponsesImageContentPart,
        { type: "input_text" }
      > => part.type === "input_text",
    )?.text ?? ""
  );
}

function buildNewApiResponsesImageInput(
  prompt: string,
  referenceImages: string[],
  size: string,
): NewApiResponsesImageRequest["input"] {
  const aspectRatio = sizeToAspectRatio(size);
  const sizeHint = aspectRatio
    ? `\n目标尺寸：${size}，优先比例：${aspectRatio}`
    : `\n目标尺寸：${size}`;

  const text = ["请生成一张图片，只返回图片结果。", sizeHint, `描述：${prompt}`]
    .filter(Boolean)
    .join("\n");

  if (referenceImages.length === 0) {
    return text;
  }

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text,
        },
        ...referenceImages.map((url) => ({
          type: "input_image" as const,
          image_url: url,
        })),
      ],
    },
  ];
}

function shouldRetryNewApiResponsesWithInputList(
  attempt: EndpointAttemptResult,
): boolean {
  return Boolean(
    attempt.status === 400 && /input must be a list/i.test(attempt.error || ""),
  );
}

async function requestImageFromNewApiResponsesStreamEndpoint(
  endpoint: string,
  payload: NewApiResponsesImageRequest,
  apiKey: string,
  logTag: string,
  options?: EndpointRequestOptions,
): Promise<EndpointAttemptResult> {
  const timeoutMs = options?.timeoutMs ?? IMAGE_REQUEST_TIMEOUT_MS;
  let response: Response;

  try {
    response = await fetchWithManagedAbort(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      {
        timeoutMs,
        signal: options?.signal,
      },
    );
  } catch (error) {
    if (options?.signal?.aborted && isAbortLikeError(error)) {
      throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
    }

    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    console.warn(
      `[ImageGen][${logTag}] request failed: endpoint=${endpoint}, timeoutMs=${timeoutMs}, error=${rawErrorMessage}`,
    );

    return {
      imageUrl: null,
      error: `请求异常: ${rawErrorMessage}`,
      assistantText: null,
      status: 0,
    };
  }

  console.log(
    `[ImageGen][${logTag}] endpoint=${endpoint}, status=${response.status}, content-type=${response.headers.get("content-type") || ""}`,
  );

  if (!response.ok || !response.body) {
    const rawText = await response.text().catch(() => "");
    return {
      imageUrl: null,
      error: `请求失败: ${response.status} - ${previewResponseText(rawText, 300)}`,
      assistantText: null,
      status: response.status,
    };
  }

  const imageBase64 = await extractImageBase64FromResponsesStream(
    response.body,
  );

  if (!imageBase64) {
    return {
      imageUrl: null,
      error: "SSE 流里没有找到 image_generation_call.result",
      assistantText: null,
      status: response.status,
    };
  }

  return {
    imageUrl: wrapBase64AsDataUrl(imageBase64.replace(/\s+/g, "")),
    error: null,
    assistantText: null,
    status: response.status,
  };
}

async function extractImageBase64FromResponsesStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string | null> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  let imageBase64: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        imageBase64 =
          extractImageBase64FromResponsesStreamEvent(rawEvent) ?? imageBase64;
        boundary = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      imageBase64 =
        extractImageBase64FromResponsesStreamEvent(buffer) ?? imageBase64;
    }
  } finally {
    reader.releaseLock();
  }

  return imageBase64;
}

function isSupportedOpenAICompatibleImageReference(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\/[\w.+-]+;base64,/i.test(value)
  );
}

export function normalizeOpenAICompatibleImageReferences(
  referenceImages: string[],
): string[] {
  const normalizedReferences = referenceImages
    .map((url) => url.trim())
    .filter(Boolean);
  const invalidReference = normalizedReferences.find(
    (url) => !isSupportedOpenAICompatibleImageReference(url),
  );

  if (invalidReference) {
    throw new Error(
      `OpenAI 图片编辑仅支持 http/https URL 或 data:image base64 参考图，当前参考图不可直接传给中转站：${invalidReference}`,
    );
  }

  return normalizedReferences;
}

export function buildOpenAICompatibleImageRequest(
  model: string,
  prompt: string,
  referenceImages: string[],
  size: string,
): OpenAICompatibleImageRequest {
  if (referenceImages.length > 0) {
    return {
      endpointPath: "/v1/images/edits",
      payload: {
        model,
        prompt,
        n: 1,
        size,
        images: referenceImages.map((url) => ({ image_url: url })),
      },
      logTag: "new-api/images-edit",
    };
  }

  return {
    endpointPath: "/v1/images/generations",
    payload: {
      model,
      prompt,
      n: 1,
      size,
    },
    logTag: "new-api/images",
  };
}
