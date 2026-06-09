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

const IMAGE_SEARCH_CURRENT_MISSING_MESSAGE =
  "Image Search 尚未接入 App Server / RuntimeCore current 通道，旧 Tauri in-process command 已退役。";

function failImageSearchCurrentMissing(): never {
  throw new Error(IMAGE_SEARCH_CURRENT_MISSING_MESSAGE);
}

export async function searchPixabayImages(
  _req: PixabaySearchRequest,
): Promise<PixabaySearchResponse> {
  failImageSearchCurrentMissing();
}

export async function searchWebImages(
  _req: WebImageSearchRequest,
): Promise<WebImageSearchResponse> {
  failImageSearchCurrentMissing();
}
