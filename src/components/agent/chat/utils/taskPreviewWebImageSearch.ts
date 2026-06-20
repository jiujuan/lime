import { ARTIFACT_DOCUMENT_SCHEMA_VERSION } from "@/lib/artifact-document/types";
import type {
  MessageGenericTaskPreview,
  MessageTaskPreviewImageCandidate,
} from "../types";
import {
  resolveTaskPreviewLocale,
  resolveWebImageCandidateLabel,
  resolveWebImageSearchArtifactEyebrow,
  resolveWebImageSearchArtifactHeroSummary,
  resolveWebImageSearchArtifactSummary,
  resolveWebImageSearchAspectHighlight,
  resolveWebImageSearchCandidateHighlight,
  resolveWebImageSearchCountMeta,
  resolveWebImageSearchPreviewText,
  resolveWebImageSearchProviderLabel,
  resolveWebImageSearchQueryLabel,
  resolveWebImageSearchSourceHighlight,
  resolveWebImageSearchStatusMessage,
  resolveWebImageSearchTitle,
} from "./taskPreviewCopy";

interface WebImageSearchPreviewParams {
  toolId?: string;
  toolName: string;
  toolArguments: string | undefined;
  toolResult: Record<string, unknown> | undefined;
  fallbackPrompt: string;
}

const WEB_IMAGE_SEARCH_TOOL_NAMES = new Set(["lime_search_web_images"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readMetadataString(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return undefined;
}

function readMetadataPositiveNumber(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): number | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }
  return undefined;
}

function readArrayRecords(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): Record<string, unknown>[] {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (!Array.isArray(value) || value.length === 0) {
        continue;
      }
      const records = value
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
      if (records.length > 0) {
        return records;
      }
    }
  }
  return [];
}

function extractQueryFromToolArguments(
  toolArguments: string | undefined,
): string | undefined {
  if (!toolArguments) {
    return undefined;
  }

  try {
    const parsed = asRecord(JSON.parse(toolArguments));
    return readMetadataString([parsed], ["query"]);
  } catch {
    return undefined;
  }
}

function normalizeToolName(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

function buildPreviewId(value: string | undefined, fallback: string): string {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildWebImageSearchArtifactPath(
  toolId: string | undefined,
  query: string | undefined,
): string {
  const identifier = buildPreviewId(toolId || query, "resource-search-preview");
  return `.lime/runtime/resource-search/${identifier}.md`;
}

function readWebImageSearchResult(params: WebImageSearchPreviewParams): {
  provider?: string;
  query?: string;
  returnedCount?: number;
  aspect?: string;
  hits: MessageTaskPreviewImageCandidate[];
} | null {
  if (!WEB_IMAGE_SEARCH_TOOL_NAMES.has(normalizeToolName(params.toolName))) {
    return null;
  }

  const resultRecord = asRecord(params.toolResult);
  const metadata = asRecord(resultRecord?.metadata);
  const metadataResult = asRecord(metadata?.result);
  const taskResult = asRecord(resultRecord?.result);
  const hitRecords = readArrayRecords(
    [metadataResult, taskResult, resultRecord],
    ["hits"],
  );
  if (hitRecords.length === 0) {
    return null;
  }

  const hits = hitRecords
    .map<MessageTaskPreviewImageCandidate | null>((hit, index) => {
      const thumbnailUrl = readMetadataString(
        [hit],
        ["thumbnail_url", "thumbnailUrl", "content_url", "contentUrl"],
      );
      if (!thumbnailUrl) {
        return null;
      }

      return {
        id:
          readMetadataString([hit], ["id"]) ||
          `${buildPreviewId(params.toolId, "resource-search")}-${index + 1}`,
        thumbnailUrl,
        contentUrl:
          readMetadataString([hit], ["content_url", "contentUrl"]) ||
          thumbnailUrl,
        hostPageUrl:
          readMetadataString([hit], ["host_page_url", "hostPageUrl"]) || null,
        width: readMetadataPositiveNumber([hit], ["width"]),
        height: readMetadataPositiveNumber([hit], ["height"]),
        name:
          readMetadataString([hit], ["name", "title", "alt"]) ||
          resolveWebImageCandidateLabel(index + 1),
      };
    })
    .filter((item): item is MessageTaskPreviewImageCandidate => item !== null);

  if (hits.length === 0) {
    return null;
  }

  return {
    provider: readMetadataString(
      [metadataResult, taskResult, resultRecord],
      ["provider", "provider_id", "providerId"],
    ),
    query:
      readMetadataString(
        [metadataResult, taskResult, resultRecord],
        ["query"],
      ) || extractQueryFromToolArguments(params.toolArguments),
    returnedCount:
      readMetadataPositiveNumber(
        [metadataResult, taskResult, resultRecord],
        ["returnedCount", "returned_count"],
      ) || hits.length,
    aspect: readMetadataString(
      [metadataResult, taskResult, resultRecord],
      ["aspect"],
    ),
    hits,
  };
}

function buildWebImageSearchArtifactDocument(params: {
  toolId: string | undefined;
  provider?: string;
  query?: string;
  returnedCount: number;
  aspect?: string;
  hits: MessageTaskPreviewImageCandidate[];
}) {
  const providerLabel = resolveWebImageSearchProviderLabel(params.provider);
  const artifactId = `resource-search:${buildPreviewId(params.toolId, "preview")}`;
  const queryLabel = resolveWebImageSearchQueryLabel(params.query);
  const highlightItems = [
    resolveWebImageSearchSourceHighlight(providerLabel),
    resolveWebImageSearchCandidateHighlight(params.returnedCount),
    params.aspect?.trim()
      ? resolveWebImageSearchAspectHighlight(params.aspect.trim())
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    schemaVersion: ARTIFACT_DOCUMENT_SCHEMA_VERSION,
    artifactId,
    kind: "brief" as const,
    title: resolveWebImageSearchTitle(providerLabel),
    status: "ready" as const,
    language: resolveTaskPreviewLocale(),
    summary: resolveWebImageSearchArtifactSummary({
      queryLabel,
      returnedCount: params.returnedCount,
    }),
    blocks: [
      {
        id: "hero",
        type: "hero_summary" as const,
        eyebrow: resolveWebImageSearchArtifactEyebrow(),
        title: queryLabel,
        summary: resolveWebImageSearchArtifactHeroSummary(
          params.returnedCount,
        ),
        highlights: highlightItems,
      },
      ...params.hits.map((hit, index) => ({
        id: `image-${index + 1}`,
        type: "image" as const,
        url: hit.contentUrl || hit.thumbnailUrl,
        alt: hit.name || resolveWebImageCandidateLabel(index + 1),
        caption: [
          hit.name?.trim(),
          hit.width && hit.height ? `${hit.width}x${hit.height}` : null,
          hit.hostPageUrl?.trim() || null,
        ]
          .filter((item): item is string => Boolean(item))
          .join(" · "),
        sourceIds: [`source-${index + 1}`],
      })),
    ],
    sources: params.hits.map((hit, index) => ({
      id: `source-${index + 1}`,
      type: "search_result" as const,
      label: hit.name || resolveWebImageCandidateLabel(index + 1),
      locator: {
        url: hit.hostPageUrl || hit.contentUrl || hit.thumbnailUrl,
      },
      reliability: "secondary" as const,
    })),
    metadata: {
      generatedBy: "agent" as const,
      rendererHints: {
        density: "comfortable" as const,
      },
      searchProvider: params.provider || null,
      searchQuery: params.query || null,
      returnedCount: params.returnedCount,
      aspect: params.aspect || null,
    },
  };
}

export function buildWebImageSearchTaskPreviewFromToolResult(
  params: WebImageSearchPreviewParams,
): MessageGenericTaskPreview | null {
  const webImageSearch = readWebImageSearchResult(params);
  if (!webImageSearch) {
    return null;
  }

  const providerLabel = resolveWebImageSearchProviderLabel(
    webImageSearch.provider,
  );
  const query = resolveWebImageSearchQueryLabel(
    webImageSearch.query,
    params.fallbackPrompt,
  );
  const returnedCount =
    webImageSearch.returnedCount || webImageSearch.hits.length;

  return {
    kind: "modal_resource_search",
    taskId: `resource-search:${buildPreviewId(params.toolId, "preview")}`,
    taskType: "modal_resource_search",
    prompt: query,
    title: resolveWebImageSearchTitle(providerLabel),
    status: "complete",
    projectId: null,
    contentId: null,
    artifactPath: buildWebImageSearchArtifactPath(params.toolId, query),
    providerId: webImageSearch.provider || null,
    model: null,
    phase: "completed",
    statusMessage: resolveWebImageSearchStatusMessage({
      providerLabel,
      returnedCount,
    }),
    metaItems: [
      providerLabel,
      resolveWebImageSearchCountMeta(returnedCount),
      webImageSearch.aspect?.trim() || undefined,
    ].filter((item): item is string => Boolean(item)),
    imageCandidates: webImageSearch.hits.slice(0, 4),
  };
}

export function buildWebImageSearchArtifactFromToolResult(
  params: WebImageSearchPreviewParams,
): {
  filePath: string;
  content: string;
  metadata: Record<string, unknown>;
} | null {
  const webImageSearch = readWebImageSearchResult(params);
  if (!webImageSearch) {
    return null;
  }

  const providerLabel = resolveWebImageSearchProviderLabel(
    webImageSearch.provider,
  );
  const query = resolveWebImageSearchQueryLabel(
    webImageSearch.query,
    params.fallbackPrompt,
  );
  const returnedCount =
    webImageSearch.returnedCount || webImageSearch.hits.length;
  const artifactPath = buildWebImageSearchArtifactPath(params.toolId, query);
  const artifactDocument = buildWebImageSearchArtifactDocument({
    toolId: params.toolId,
    provider: webImageSearch.provider,
    query,
    returnedCount,
    aspect: webImageSearch.aspect,
    hits: webImageSearch.hits,
  });

  return {
    filePath: artifactPath,
    content: "",
    metadata: {
      artifactDocument,
      artifact_type: "document",
      previewText: resolveWebImageSearchPreviewText({
        providerLabel,
        returnedCount,
      }),
      provider: webImageSearch.provider || null,
      query,
      returnedCount,
      aspect: webImageSearch.aspect || null,
    },
  };
}
