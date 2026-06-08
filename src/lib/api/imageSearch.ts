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
  return invokeImageSearchCommand(
    "search_pixabay_images",
    req,
    assertPixabaySearchResponse,
  );
}

export async function searchWebImages(
  req: WebImageSearchRequest,
): Promise<WebImageSearchResponse> {
  return invokeImageSearchCommand(
    "search_web_images",
    req,
    assertWebImageSearchResponse,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPixabaySearchResponse(
  command: string,
  value: unknown,
): asserts value is PixabaySearchResponse {
  if (
    !isRecord(value) ||
    typeof value.total !== "number" ||
    !Array.isArray(value.hits)
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
    !Array.isArray(value.hits)
  ) {
    throw new Error(`${command} did not return a web image search result`);
  }
}
