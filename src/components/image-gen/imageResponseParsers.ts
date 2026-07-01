export function wrapBase64AsDataUrl(value: string): string {
  if (value.startsWith("data:image/")) {
    return value;
  }
  return `data:image/png;base64,${value}`;
}

export function looksLikeBase64Data(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length < 128) {
    return false;
  }
  return /^[A-Za-z0-9+/=\n\r]+$/.test(normalized);
}

export function previewResponseText(text: string, maxLength = 600): string {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

export function tryParseJson(text: string): unknown | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function looksLikeRelativeImagePath(value: string): boolean {
  return (
    /^\/?[^\s"'`<>]+\.(png|jpe?g|gif|webp|bmp|svg)(\?[^\s"'`<>]*)?$/i.test(
      value,
    ) || /^\/?(v\d+\/)?(images?|files?|uploads?)\/[^\s"'`<>]+$/i.test(value)
  );
}

function extractDirectImageCandidate(value: string): string | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("data:image/")
  ) {
    return normalized;
  }

  if (looksLikeBase64Data(normalized)) {
    return wrapBase64AsDataUrl(normalized.replace(/\s+/g, ""));
  }

  if (looksLikeRelativeImagePath(normalized)) {
    return normalized;
  }

  if (/^\/[^\s]+$/.test(normalized)) {
    return normalized;
  }

  return null;
}

export function normalizeImageUrl(endpoint: string, candidate: string): string {
  const value = candidate.trim();

  if (!value) {
    return value;
  }

  if (value.startsWith("data:image/")) {
    return value;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (looksLikeBase64Data(value)) {
    return wrapBase64AsDataUrl(value.replace(/\s+/g, ""));
  }

  try {
    const endpointUrl = new URL(endpoint);

    if (value.startsWith("//")) {
      return `${endpointUrl.protocol}${value}`;
    }

    if (value.startsWith("/")) {
      return `${endpointUrl.origin}${value}`;
    }

    if (value.startsWith("images/") || value.startsWith("v1/")) {
      return `${endpointUrl.origin}/${value.replace(/^\/+/, "")}`;
    }
  } catch {
    return value;
  }

  return value;
}

export function extractImageUrlFromText(content: string): string | null {
  if (!content) {
    return null;
  }

  const normalizedContent = stripCodeFence(content);

  const directCandidate = extractDirectImageCandidate(normalizedContent);
  if (directCandidate) {
    return directCandidate;
  }

  const base64MarkdownMatch = normalizedContent.match(
    /!\[.*?\]\((data:image\/[^;]+;base64,[^)]+)\)/,
  );
  if (base64MarkdownMatch) {
    return base64MarkdownMatch[1];
  }

  const markdownMatch = normalizedContent.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (markdownMatch) {
    const markdownValue = markdownMatch[1]
      .trim()
      .replace(/^<|>$/g, "")
      .split(/\s+/)[0];
    const markdownCandidate = extractDirectImageCandidate(markdownValue);
    if (markdownCandidate) {
      return markdownCandidate;
    }
    return markdownValue;
  }

  const dataUrlMatch = normalizedContent.match(
    /data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/,
  );
  if (dataUrlMatch) {
    return dataUrlMatch[0];
  }

  const plainUrlMatch = normalizedContent.match(/https?:\/\/[^\s"'`<>]+/);
  if (plainUrlMatch) {
    return plainUrlMatch[0];
  }

  const quotedFieldMatch = normalizedContent.match(
    /"(?:url|uri|link|image_url|imageUrl|path|image_path|imagePath|download_url|downloadUrl|file|file_url|fileUrl)"\s*:\s*"([^"]+)"/i,
  );
  if (quotedFieldMatch) {
    const quotedCandidate = extractDirectImageCandidate(quotedFieldMatch[1]);
    if (quotedCandidate) {
      return quotedCandidate;
    }
    return quotedFieldMatch[1];
  }

  const relativePathMatch = normalizedContent.match(
    /(?:^|["'(\s])((?:\/|\.\/)?(?:v\d+\/)?(?:images?|files?|uploads?)\/[^\s"'`<>)]+)(?=$|["')\s])/i,
  );
  if (relativePathMatch) {
    return relativePathMatch[1];
  }

  if (looksLikeBase64Data(normalizedContent)) {
    return wrapBase64AsDataUrl(normalizedContent.replace(/\s+/g, ""));
  }

  const parsed = tryParseJson(normalizedContent);
  if (parsed) {
    return extractImageUrlFromPayload(parsed);
  }

  const jsonBlockMatch = normalizedContent.match(/\{[\s\S]+\}/);
  if (jsonBlockMatch) {
    const nestedParsed = tryParseJson(jsonBlockMatch[0]);
    if (nestedParsed) {
      return extractImageUrlFromPayload(nestedParsed);
    }
  }

  return null;
}

export function extractImageUrlFromPayload(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    return extractImageUrlFromText(payload);
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const extracted = extractImageUrlFromPayload(item);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    const inlineDataValue = record.inline_data || record.inlineData;
    if (inlineDataValue && typeof inlineDataValue === "object") {
      const inlineDataRecord = inlineDataValue as Record<string, unknown>;
      const inlineBase64 = inlineDataRecord.data;
      if (typeof inlineBase64 === "string" && inlineBase64.trim().length > 0) {
        const mime =
          typeof inlineDataRecord.mime_type === "string"
            ? inlineDataRecord.mime_type
            : typeof inlineDataRecord.mimeType === "string"
              ? inlineDataRecord.mimeType
              : "image/png";
        if (inlineBase64.startsWith("data:image/")) {
          return inlineBase64;
        }
        return `data:${mime};base64,${inlineBase64.replace(/\s+/g, "")}`;
      }
    }

    const fileDataValue = record.file_data || record.fileData;
    if (fileDataValue && typeof fileDataValue === "object") {
      const fileDataRecord = fileDataValue as Record<string, unknown>;
      const fileUri = fileDataRecord.file_uri || fileDataRecord.fileUri;
      if (typeof fileUri === "string" && fileUri.trim().length > 0) {
        return fileUri.trim();
      }
    }

    const base64Keys = [
      "b64_json",
      "image_base64",
      "base64",
      "b64",
      "image_b64",
    ];

    for (const key of base64Keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        if (value.startsWith("data:image/")) {
          return value;
        }

        if (
          looksLikeBase64Data(value) ||
          key.includes("b64") ||
          key.includes("base64")
        ) {
          return wrapBase64AsDataUrl(value.replace(/\s+/g, ""));
        }
      }
    }

    const directKeys = [
      "url",
      "uri",
      "link",
      "href",
      "image",
      "image_url",
      "imageUrl",
      "image_uri",
      "imageUri",
      "path",
      "image_path",
      "imagePath",
      "download_url",
      "downloadUrl",
      "file",
      "file_url",
      "fileUrl",
    ];

    for (const key of directKeys) {
      const value = record[key];
      if (typeof value === "string") {
        const directCandidate = extractDirectImageCandidate(value);
        if (directCandidate) {
          return directCandidate;
        }

        const extractedFromText = extractImageUrlFromText(value);
        if (extractedFromText) {
          return extractedFromText;
        }
      }

      if (value && typeof value === "object") {
        const nestedCandidate = extractImageUrlFromPayload(value);
        if (nestedCandidate) {
          return nestedCandidate;
        }
      }
    }

    const directUrl = record.url;
    if (typeof directUrl === "string") {
      return directUrl;
    }

    const imageUrl = record.image_url;
    if (typeof imageUrl === "string") {
      return imageUrl;
    }
    if (imageUrl && typeof imageUrl === "object") {
      const nestedUrl = (imageUrl as Record<string, unknown>).url;
      if (typeof nestedUrl === "string") {
        return nestedUrl;
      }
    }

    const b64Json = record.b64_json;
    if (typeof b64Json === "string" && b64Json.length > 0) {
      return wrapBase64AsDataUrl(b64Json);
    }

    const imageBase64 = record.image_base64;
    if (typeof imageBase64 === "string" && imageBase64.length > 0) {
      return wrapBase64AsDataUrl(imageBase64);
    }

    const base64 = record.base64;
    if (typeof base64 === "string" && base64.length > 0) {
      return wrapBase64AsDataUrl(base64);
    }

    const messageValue = record.message;
    if (messageValue && typeof messageValue === "object") {
      const messageRecord = messageValue as Record<string, unknown>;
      const messageContent = messageRecord.content;

      if (typeof messageContent === "string") {
        const fromMessageText = extractImageUrlFromText(messageContent);
        if (fromMessageText) {
          return fromMessageText;
        }
      }

      if (Array.isArray(messageContent)) {
        for (const item of messageContent) {
          const fromMessageItem = extractImageUrlFromPayload(item);
          if (fromMessageItem) {
            return fromMessageItem;
          }
        }
      }
    }

    const contentValue = record.content;
    if (typeof contentValue === "string") {
      const fromContent = extractImageUrlFromText(contentValue);
      if (fromContent) {
        return fromContent;
      }
    }

    if (Array.isArray(contentValue)) {
      for (const item of contentValue) {
        const fromContentItem = extractImageUrlFromPayload(item);
        if (fromContentItem) {
          return fromContentItem;
        }
      }
    }

    const outputTextValue = record.output_text;
    if (typeof outputTextValue === "string") {
      const fromOutputText = extractImageUrlFromText(outputTextValue);
      if (fromOutputText) {
        return fromOutputText;
      }
    }

    const outputValue = record.output;
    if (Array.isArray(outputValue)) {
      for (const outputItem of outputValue) {
        const fromOutput = extractImageUrlFromPayload(outputItem);
        if (fromOutput) {
          return fromOutput;
        }
      }
    }

    for (const value of Object.values(record)) {
      const extracted = extractImageUrlFromPayload(value);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

export function extractGeminiImageUrlFromPayload(
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directOutputImage = record.output_image;
  if (directOutputImage && typeof directOutputImage === "object") {
    const imageRecord = directOutputImage as Record<string, unknown>;
    const data = imageRecord.data;
    if (typeof data === "string" && data.trim().length > 0) {
      return wrapBase64AsDataUrl(data.replace(/\s+/g, ""));
    }

    const uri = imageRecord.uri;
    if (typeof uri === "string" && uri.trim().length > 0) {
      return uri.trim();
    }
  }

  const interaction = record.interaction;
  if (interaction && typeof interaction === "object") {
    const nested =
      extractGeminiImageUrlFromPayload(interaction) ??
      extractImageUrlFromPayload(interaction);
    if (nested) {
      return nested;
    }
  }

  const steps = record.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const extracted =
        extractGeminiImageUrlFromPayload(step) ??
        extractImageUrlFromPayload(step);
      if (extracted) {
        return extracted;
      }
    }
  }

  return extractImageUrlFromPayload(payload);
}

function collectTextFromUnknown(value: unknown): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextFromUnknown(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const texts: string[] = [];

    if (typeof record.text === "string") {
      texts.push(record.text.trim());
    }

    if (typeof record.content === "string") {
      texts.push(record.content.trim());
    }

    if (record.parts) {
      texts.push(...collectTextFromUnknown(record.parts));
    }

    return texts.filter(Boolean);
  }

  return [];
}

export function extractAssistantTextFromPayload(
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  const choicesValue = record.choices;
  if (Array.isArray(choicesValue) && choicesValue.length > 0) {
    const firstChoice = choicesValue[0];
    if (firstChoice && typeof firstChoice === "object") {
      const choiceRecord = firstChoice as Record<string, unknown>;
      const messageValue = choiceRecord.message;
      if (messageValue && typeof messageValue === "object") {
        const messageRecord = messageValue as Record<string, unknown>;
        const contentTexts = collectTextFromUnknown(messageRecord.content);
        if (contentTexts.length > 0) {
          return contentTexts.join("\n");
        }
      }

      const deltaValue = choiceRecord.delta;
      if (deltaValue && typeof deltaValue === "object") {
        const deltaRecord = deltaValue as Record<string, unknown>;
        const deltaTexts = collectTextFromUnknown(deltaRecord.content);
        if (deltaTexts.length > 0) {
          return deltaTexts.join("\n");
        }
      }
    }
  }

  const outputText = record.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText.trim();
  }

  const candidatesValue = record.candidates;
  if (Array.isArray(candidatesValue) && candidatesValue.length > 0) {
    const candidateTexts = collectTextFromUnknown(candidatesValue[0]);
    if (candidateTexts.length > 0) {
      return candidateTexts.join("\n");
    }
  }

  const contentTexts = collectTextFromUnknown(record.content);
  if (contentTexts.length > 0) {
    return contentTexts.join("\n");
  }

  return null;
}

export function extractImageBase64FromResponsesStreamEvent(
  rawEvent: string,
): string | null {
  const lines = rawEvent.split(/\r?\n/);
  const eventName = lines
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim();
  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (
    eventName !== "response.output_item.done" ||
    !dataText ||
    dataText === "[DONE]"
  ) {
    return null;
  }

  const parsed = tryParseJson(dataText);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const item = (parsed as Record<string, unknown>).item;
  if (!item || typeof item !== "object") {
    return null;
  }

  const itemRecord = item as Record<string, unknown>;
  if (
    itemRecord.type === "image_generation_call" &&
    typeof itemRecord.result === "string" &&
    itemRecord.result.trim()
  ) {
    return itemRecord.result;
  }

  return null;
}
