export const MODEL_TOOL_MODES = [
  "direct",
  "code_mode",
  "code_mode_only",
] as const;

export type ModelToolMode = (typeof MODEL_TOOL_MODES)[number];

export const MODEL_WEB_SEARCH_TOOL_TYPES = [
  "text",
  "text_and_image",
] as const;

export type ModelWebSearchToolType =
  (typeof MODEL_WEB_SEARCH_TOOL_TYPES)[number];

export const MODEL_IMAGE_DETAIL_VALUES = [
  "auto",
  "low",
  "high",
  "original",
] as const;

export type ModelImageDetailValue = (typeof MODEL_IMAGE_DETAIL_VALUES)[number];

export type ModelSearchContentModality = "text" | "image";

export interface ModelExecutionPolicyInput {
  tool_mode?: unknown;
  toolMode?: unknown;
  supports_image_detail_original?: unknown;
  supportsImageDetailOriginal?: unknown;
  supports_search_tool?: unknown;
  supportsSearchTool?: unknown;
  web_search_tool_type?: unknown;
  webSearchToolType?: unknown;
}

export interface ModelExecutionPolicy {
  tool_mode: ModelToolMode | null;
  supports_search_tool: boolean;
  web_search_tool_type: ModelWebSearchToolType | null;
  search_content_modalities: ModelSearchContentModality[];
  supports_image_detail_original: boolean;
  allowed_image_detail_values: ModelImageDetailValue[];
  default_image_detail: Exclude<ModelImageDetailValue, "original">;
}

const MODEL_TOOL_MODE_SET = new Set<string>(MODEL_TOOL_MODES);
const MODEL_WEB_SEARCH_TOOL_TYPE_SET = new Set<string>(
  MODEL_WEB_SEARCH_TOOL_TYPES,
);
const MODEL_IMAGE_DETAIL_VALUE_SET = new Set<string>(MODEL_IMAGE_DETAIL_VALUES);
const DEFAULT_IMAGE_DETAIL: Exclude<ModelImageDetailValue, "original"> = "high";
const BASE_IMAGE_DETAIL_VALUES: ModelImageDetailValue[] = [
  "auto",
  "low",
  "high",
];

function firstPresent<T>(
  input: ModelExecutionPolicyInput,
  keys: Array<keyof ModelExecutionPolicyInput>,
): T | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replaceAll("-", "_").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export function normalizeModelToolMode(value: unknown): ModelToolMode | null {
  const normalized = normalizeToken(value);
  if (!normalized || !MODEL_TOOL_MODE_SET.has(normalized)) {
    return null;
  }
  return normalized as ModelToolMode;
}

export function normalizeModelWebSearchToolType(
  value: unknown,
): ModelWebSearchToolType | null {
  const normalized = normalizeToken(value);
  if (!normalized || !MODEL_WEB_SEARCH_TOOL_TYPE_SET.has(normalized)) {
    return null;
  }
  return normalized as ModelWebSearchToolType;
}

export function normalizeModelImageDetail(
  policy: Pick<ModelExecutionPolicy, "supports_image_detail_original">,
  detail: unknown,
): ModelImageDetailValue | null {
  const normalized = normalizeToken(detail);
  if (!normalized || !MODEL_IMAGE_DETAIL_VALUE_SET.has(normalized)) {
    return null;
  }
  if (normalized === "original" && !policy.supports_image_detail_original) {
    return null;
  }
  return normalized as ModelImageDetailValue;
}

export function buildModelExecutionPolicy(
  input: ModelExecutionPolicyInput | null | undefined,
): ModelExecutionPolicy {
  const source = input ?? {};
  const toolMode = normalizeModelToolMode(
    firstPresent(source, ["tool_mode", "toolMode"]),
  );
  const supportsImageDetailOriginal = normalizeBoolean(
    firstPresent(source, [
      "supports_image_detail_original",
      "supportsImageDetailOriginal",
    ]),
  );
  const supportsSearchTool = normalizeBoolean(
    firstPresent(source, ["supports_search_tool", "supportsSearchTool"]),
  );
  const requestedWebSearchToolType = normalizeModelWebSearchToolType(
    firstPresent(source, ["web_search_tool_type", "webSearchToolType"]),
  );
  const webSearchToolType = supportsSearchTool
    ? requestedWebSearchToolType ?? "text"
    : null;
  const allowedImageDetailValues: ModelImageDetailValue[] = supportsImageDetailOriginal
    ? [...BASE_IMAGE_DETAIL_VALUES, "original"]
    : [...BASE_IMAGE_DETAIL_VALUES];

  return {
    tool_mode: toolMode,
    supports_search_tool: supportsSearchTool,
    web_search_tool_type: webSearchToolType,
    search_content_modalities: webSearchToolType
      ? searchContentModalitiesForType(webSearchToolType)
      : [],
    supports_image_detail_original: supportsImageDetailOriginal,
    allowed_image_detail_values: allowedImageDetailValues,
    default_image_detail: DEFAULT_IMAGE_DETAIL,
  };
}

function searchContentModalitiesForType(
  type: ModelWebSearchToolType,
): ModelSearchContentModality[] {
  return type === "text_and_image" ? ["text", "image"] : ["text"];
}
