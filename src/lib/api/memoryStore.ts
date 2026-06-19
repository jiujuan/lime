import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_MEMORY_STORE_ADD_NOTE,
  METHOD_MEMORY_STORE_HEALTH,
  METHOD_MEMORY_STORE_LIST,
  METHOD_MEMORY_STORE_READ,
  METHOD_MEMORY_STORE_RESET,
  METHOD_MEMORY_STORE_SEARCH,
  type MemoryStoreAddNoteParams,
  type MemoryStoreAddNoteResponse,
  type MemoryStoreCitation,
  type MemoryStoreEntry,
  type MemoryStoreHealthResponse,
  type MemoryStoreListParams,
  type MemoryStoreListResponse,
  type MemoryStoreReadParams,
  type MemoryStoreReadResponse,
  type MemoryStoreResetParams,
  type MemoryStoreResetResponse,
  type MemoryStoreRootParams,
  type MemoryStoreScope,
  type MemoryStoreSearchHit,
  type MemoryStoreSearchMatchMode,
  type MemoryStoreSearchParams,
  type MemoryStoreSearchResponse,
} from "../../../packages/app-server-client/src/protocol";

export type {
  MemoryStoreAddNoteParams,
  MemoryStoreAddNoteResponse,
  MemoryStoreCitation,
  MemoryStoreEntry,
  MemoryStoreHealthResponse,
  MemoryStoreListParams,
  MemoryStoreListResponse,
  MemoryStoreReadParams,
  MemoryStoreReadResponse,
  MemoryStoreResetParams,
  MemoryStoreResetResponse,
  MemoryStoreRootParams,
  MemoryStoreScope,
  MemoryStoreSearchHit,
  MemoryStoreSearchMatchMode,
  MemoryStoreSearchParams,
  MemoryStoreSearchResponse,
};

type MemoryStoreAppServerClient = Pick<AppServerClient, "request">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined | null {
  return value === undefined || value === null || typeof value === "string";
}

function isMemoryStoreScope(value: unknown): value is MemoryStoreScope {
  return value === "global" || value === "workspace";
}

function isMemoryStoreCitation(value: unknown): value is MemoryStoreCitation {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.startLineNumber === "number" &&
    typeof value.endLineNumber === "number"
  );
}

function isMemoryStoreEntry(value: unknown): value is MemoryStoreEntry {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.entryType === "string" &&
    typeof value.size === "number" &&
    typeof value.modifiedAt === "number"
  );
}

function isMemoryStoreSearchHit(
  value: unknown,
): value is MemoryStoreSearchHit {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    Array.isArray(value.matchedQueries) &&
    value.matchedQueries.every((query) => typeof query === "string") &&
    typeof value.matchLineNumber === "number" &&
    typeof value.contentStartLineNumber === "number" &&
    typeof value.content === "string" &&
    isMemoryStoreCitation(value.citation)
  );
}

function assertMemoryStoreListResponse(
  value: unknown,
): MemoryStoreListResponse {
  if (
    !isRecord(value) ||
    !isMemoryStoreScope(value.rootScope) ||
    typeof value.path !== "string" ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isMemoryStoreEntry) ||
    typeof value.truncated !== "boolean" ||
    !isOptionalString(value.nextCursor)
  ) {
    throw new Error(
      `${METHOD_MEMORY_STORE_LIST} returned an invalid memory store list response`,
    );
  }
  return value;
}

function assertMemoryStoreReadResponse(
  value: unknown,
): MemoryStoreReadResponse {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.startLineNumber !== "number" ||
    typeof value.content !== "string" ||
    typeof value.truncated !== "boolean" ||
    !isMemoryStoreCitation(value.citation)
  ) {
    throw new Error(
      `${METHOD_MEMORY_STORE_READ} returned an invalid memory store read response`,
    );
  }
  return value;
}

function assertMemoryStoreSearchResponse(
  value: unknown,
): MemoryStoreSearchResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.hits) ||
    !value.hits.every(isMemoryStoreSearchHit) ||
    typeof value.truncated !== "boolean" ||
    !isOptionalString(value.nextCursor)
  ) {
    throw new Error(
      `${METHOD_MEMORY_STORE_SEARCH} returned an invalid memory store search response`,
    );
  }
  return value;
}

function assertMemoryStoreAddNoteResponse(
  value: unknown,
): MemoryStoreAddNoteResponse {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !isMemoryStoreCitation(value.citation)
  ) {
    throw new Error(
      `${METHOD_MEMORY_STORE_ADD_NOTE} returned an invalid memory store add note response`,
    );
  }
  return value;
}

function assertMemoryStoreHealthResponse(
  value: unknown,
): MemoryStoreHealthResponse {
  if (
    !isRecord(value) ||
    !isMemoryStoreScope(value.rootScope) ||
    typeof value.rootPath !== "string" ||
    typeof value.initialized !== "boolean" ||
    typeof value.fileCount !== "number" ||
    typeof value.totalBytes !== "number" ||
    typeof value.summaryExists !== "boolean" ||
    typeof value.summaryBytes !== "number" ||
    typeof value.memoryExists !== "boolean" ||
    typeof value.memoryBytes !== "number" ||
    typeof value.notesCount !== "number"
  ) {
    throw new Error(
      `${METHOD_MEMORY_STORE_HEALTH} returned an invalid memory store health response`,
    );
  }
  return value;
}

function assertMemoryStoreResetResponse(
  value: unknown,
): MemoryStoreResetResponse {
  if (
    !isRecord(value) ||
    !isMemoryStoreScope(value.rootScope) ||
    typeof value.rootPath !== "string" ||
    typeof value.removedFiles !== "number" ||
    typeof value.removedDirectories !== "number" ||
    typeof value.preservedSoul !== "boolean"
  ) {
    throw new Error(
      `${METHOD_MEMORY_STORE_RESET} returned an invalid memory store reset response`,
    );
  }
  return value;
}

export async function listMemoryStore(
  params: MemoryStoreListParams = {},
  appServerClient: MemoryStoreAppServerClient = new AppServerClient(),
): Promise<MemoryStoreListResponse> {
  const response = await appServerClient.request<MemoryStoreListResponse>(
    METHOD_MEMORY_STORE_LIST,
    params,
  );
  return assertMemoryStoreListResponse(response.result);
}

export async function readMemoryStore(
  params: MemoryStoreReadParams,
  appServerClient: MemoryStoreAppServerClient = new AppServerClient(),
): Promise<MemoryStoreReadResponse> {
  const response = await appServerClient.request<MemoryStoreReadResponse>(
    METHOD_MEMORY_STORE_READ,
    params,
  );
  return assertMemoryStoreReadResponse(response.result);
}

export async function searchMemoryStore(
  params: MemoryStoreSearchParams,
  appServerClient: MemoryStoreAppServerClient = new AppServerClient(),
): Promise<MemoryStoreSearchResponse> {
  const response = await appServerClient.request<MemoryStoreSearchResponse>(
    METHOD_MEMORY_STORE_SEARCH,
    params,
  );
  return assertMemoryStoreSearchResponse(response.result);
}

export async function addMemoryStoreNote(
  params: MemoryStoreAddNoteParams,
  appServerClient: MemoryStoreAppServerClient = new AppServerClient(),
): Promise<MemoryStoreAddNoteResponse> {
  const response = await appServerClient.request<MemoryStoreAddNoteResponse>(
    METHOD_MEMORY_STORE_ADD_NOTE,
    params,
  );
  return assertMemoryStoreAddNoteResponse(response.result);
}

export async function getMemoryStoreHealth(
  params: MemoryStoreRootParams = {},
  appServerClient: MemoryStoreAppServerClient = new AppServerClient(),
): Promise<MemoryStoreHealthResponse> {
  const response = await appServerClient.request<MemoryStoreHealthResponse>(
    METHOD_MEMORY_STORE_HEALTH,
    params,
  );
  return assertMemoryStoreHealthResponse(response.result);
}

export async function resetMemoryStore(
  params: MemoryStoreResetParams = {},
  appServerClient: MemoryStoreAppServerClient = new AppServerClient(),
): Promise<MemoryStoreResetResponse> {
  const response = await appServerClient.request<MemoryStoreResetResponse>(
    METHOD_MEMORY_STORE_RESET,
    params,
  );
  return assertMemoryStoreResetResponse(response.result);
}
