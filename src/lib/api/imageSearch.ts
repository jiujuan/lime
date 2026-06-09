import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export type AspectRatioFilter = "all" | "landscape" | "portrait" | "square";

export interface PixabaySearchRequest {
  query: string;
  page: number;
  perPage: number;
  orientation?: string;
}

export interface PixabaySearchResponse {
  total: number;
  total_hits?: number;
  totalHits?: number;
  hits: Array<{
    id: number;
    preview_url?: string;
    previewUrl?: string;
    large_image_url?: string;
    largeImageUrl?: string;
    image_width?: number;
    imageWidth?: number;
    image_height?: number;
    imageHeight?: number;
    tags: string;
    page_url?: string;
    pageUrl?: string;
    user: string;
  }>;
}

export interface WebImageSearchRequest {
  query: string;
  page: number;
  perPage: number;
  aspect?: AspectRatioFilter;
}

export interface WebImageSearchResponse {
  total: number;
  totalResults?: number;
  photos?: Array<{
    id: number;
    width: number;
    height: number;
    url: string;
    alt?: string;
    src: {
      medium?: string;
      small?: string;
      tiny?: string;
      large?: string;
      large2x?: string;
      original?: string;
      landscape?: string;
      portrait?: string;
    };
  }>;
  provider: string;
  hits: Array<{
    id: string;
    thumbnail_url?: string;
    thumbnailUrl?: string;
    content_url?: string;
    contentUrl?: string;
    width: number;
    height: number;
    name: string;
    host_page_url?: string;
    hostPageUrl?: string;
  }>;
}

type PixabayHit = PixabaySearchResponse["hits"][number];
type WebImageHit = WebImageSearchResponse["hits"][number];

async function invokeImageSearchCommand<T>(
  command: string,
  req: unknown,
  validate: (command: string, value: unknown) => asserts value is T,
): Promise<T> {
  const result = await safeInvoke<unknown>(command, { req });
  assertNotDiagnosticFacade(command, result, "真实 Image Search current 通道");
  validate(command, result);
  return result;
}

export async function searchPixabayImages(
  req: PixabaySearchRequest,
): Promise<PixabaySearchResponse> {
  const response = await invokeImageSearchCommand(
    "search_pixabay_images",
    req,
    assertPixabaySearchResponse,
  );
  return {
    ...response,
    hits: response.hits.map(normalizePixabayHit),
  };
}

export async function searchWebImages(
  req: WebImageSearchRequest,
): Promise<WebImageSearchResponse> {
  const response = await invokeImageSearchCommand(
    "search_web_images",
    req,
    assertWebImageSearchResponse,
  );
  return {
    ...response,
    hits: response.hits.map(normalizeWebImageHit),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pickStringField(
  value: Record<string, unknown>,
  fields: string[],
): string | undefined {
  return fields.map((field) => value[field]).find(isNonEmptyString);
}

function pickPositiveFiniteNumberField(
  value: Record<string, unknown>,
  fields: string[],
): number | undefined {
  return fields.map((field) => value[field]).find(isPositiveFiniteNumber);
}

function isPixabayHit(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isPositiveFiniteNumber(value.id) &&
    isNonEmptyString(value.tags) &&
    isNonEmptyString(value.user) &&
    Boolean(pickStringField(value, [
      "preview_url",
      "previewUrl",
      "previewURL",
      "large_image_url",
      "largeImageUrl",
      "largeImageURL",
    ])) &&
    Boolean(pickStringField(value, ["page_url", "pageUrl", "pageURL"])) &&
    Boolean(
      pickPositiveFiniteNumberField(value, ["image_width", "imageWidth"]),
    ) &&
    Boolean(
      pickPositiveFiniteNumberField(value, ["image_height", "imageHeight"]),
    )
  );
}

function isWebImageHit(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isPositiveFiniteNumber(value.width) &&
    isPositiveFiniteNumber(value.height) &&
    isNonEmptyString(value.name) &&
    Boolean(pickStringField(value, ["thumbnail_url", "thumbnailUrl"])) &&
    Boolean(pickStringField(value, ["content_url", "contentUrl"])) &&
    Boolean(pickStringField(value, ["host_page_url", "hostPageUrl"]))
  );
}

function normalizePixabayHit(hit: PixabayHit): PixabayHit {
  const record = hit as Record<string, unknown>;
  const previewUrl = pickStringField(record, [
    "preview_url",
    "previewUrl",
    "previewURL",
  ]);
  const largeImageUrl = pickStringField(record, [
    "large_image_url",
    "largeImageUrl",
    "largeImageURL",
  ]);
  const pageUrl = pickStringField(record, ["page_url", "pageUrl", "pageURL"]);
  const imageWidth = pickPositiveFiniteNumberField(record, [
    "image_width",
    "imageWidth",
  ]);
  const imageHeight = pickPositiveFiniteNumberField(record, [
    "image_height",
    "imageHeight",
  ]);

  return {
    ...hit,
    preview_url: previewUrl,
    previewUrl,
    large_image_url: largeImageUrl,
    largeImageUrl,
    image_width: imageWidth,
    imageWidth,
    image_height: imageHeight,
    imageHeight,
    page_url: pageUrl,
    pageUrl,
  };
}

function normalizeWebImageHit(hit: WebImageHit): WebImageHit {
  const record = hit as Record<string, unknown>;
  const thumbnailUrl = pickStringField(record, [
    "thumbnail_url",
    "thumbnailUrl",
  ]);
  const contentUrl = pickStringField(record, ["content_url", "contentUrl"]);
  const hostPageUrl = pickStringField(record, [
    "host_page_url",
    "hostPageUrl",
  ]);

  return {
    ...hit,
    thumbnail_url: thumbnailUrl,
    thumbnailUrl,
    content_url: contentUrl,
    contentUrl,
    host_page_url: hostPageUrl,
    hostPageUrl,
  };
}

function assertPixabaySearchResponse(
  command: string,
  value: unknown,
): asserts value is PixabaySearchResponse {
  if (
    !isRecord(value) ||
    typeof value.total !== "number" ||
    !Array.isArray(value.hits) ||
    !value.hits.every(isPixabayHit)
  ) {
    throw new Error(`${command} did not return a Pixabay image search result`);
  }
}

function assertWebImageSearchResponse(
  command: string,
  value: unknown,
): asserts value is WebImageSearchResponse {
  if (
    !isRecord(value) ||
    typeof value.total !== "number" ||
    typeof value.provider !== "string" ||
    !Array.isArray(value.hits) ||
    !value.hits.every(isWebImageHit)
  ) {
    throw new Error(`${command} did not return a web image search result`);
  }
}
