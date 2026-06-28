import type { HarnessOutputSignal } from "../utils/harnessState";
import {
  SEARCH_RESULT_LIST_LIMIT,
  resolveSearchResultPreviewItemsFromText,
  type SearchResultPreviewItem,
} from "../utils/searchResultPreview";

export const HARNESS_SEARCH_OUTPUT_VISIBLE_RESULT_LIMIT = Math.min(
  5,
  SEARCH_RESULT_LIST_LIMIT,
);
const HARNESS_SEARCH_OUTPUT_PREVIEW_LIMIT = 480;

export interface HarnessSearchOutputProjection {
  query: string;
  items: SearchResultPreviewItem[];
  resultCount: number;
  previewText?: string;
  rawDetailsAvailable: boolean;
}

type HarnessSearchOutputProjectionSource = Pick<
  HarnessOutputSignal,
  "content" | "preview" | "summary"
>;

function compactSearchPreviewText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= HARNESS_SEARCH_OUTPUT_PREVIEW_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, HARNESS_SEARCH_OUTPUT_PREVIEW_LIMIT - 1)}…`;
}

function resolveSearchParseSource(
  signal: HarnessSearchOutputProjectionSource,
): string {
  return signal.content?.trim() || signal.preview?.trim() || signal.summary;
}

function collectSearchParseSources(
  signal: HarnessSearchOutputProjectionSource,
): string[] {
  const sources = [
    signal.content?.trim(),
    signal.preview?.trim(),
    signal.summary.trim(),
  ].filter((value): value is string => Boolean(value));
  const nestedSources: string[] = [];

  for (const source of sources) {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }

      const record = parsed as Record<string, unknown>;
      for (const key of ["output", "output_preview"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          nestedSources.push(value.trim());
        }
      }
    } catch {
      continue;
    }
  }

  return [...nestedSources, ...sources];
}

function resolveSearchResultPreviewItems(
  signal: HarnessSearchOutputProjectionSource,
) {
  for (const source of collectSearchParseSources(signal)) {
    const items = resolveSearchResultPreviewItemsFromText(source);
    if (items.length > 0) {
      return items;
    }
  }

  return resolveSearchResultPreviewItemsFromText(
    resolveSearchParseSource(signal),
  );
}

export function buildHarnessSearchOutputProjection(
  signal: HarnessSearchOutputProjectionSource,
): HarnessSearchOutputProjection {
  const allItems = resolveSearchResultPreviewItems(signal);
  const previewText =
    allItems.length > 0 ? undefined : compactSearchPreviewText(signal.preview);

  return {
    query: signal.summary,
    items: allItems.slice(0, HARNESS_SEARCH_OUTPUT_VISIBLE_RESULT_LIMIT),
    resultCount: allItems.length,
    previewText,
    rawDetailsAvailable: Boolean(
      signal.content?.trim() || signal.preview?.trim(),
    ),
  };
}
