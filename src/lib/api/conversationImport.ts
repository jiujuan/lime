import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
  type ConversationImportSourceClient,
  type ConversationImportSourceScanParams,
  type ConversationImportSourceScanResponse,
  type ConversationImportSourceStatus,
  type ConversationImportThreadStatus,
  type ImportedThreadSummary,
} from "../../../packages/app-server-client/src/protocol";

export type {
  ConversationImportSourceClient,
  ConversationImportSourceScanParams,
  ConversationImportSourceScanResponse,
  ConversationImportSourceStatus,
  ConversationImportThreadStatus,
  ImportedThreadSummary,
};

type ConversationImportAppServerClient = Pick<AppServerClient, "request">;

const SOURCE_CLIENTS = new Set(["codex", "claude_code"]);
const SOURCE_STATUSES = new Set(["ready", "missing", "unsupported", "error"]);
const THREAD_STATUSES = new Set(["not_imported", "imported", "conflict"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isImportedThreadSummary(value: unknown): value is ImportedThreadSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    SOURCE_CLIENTS.has(String(value.sourceClient)) &&
    typeof value.sourceThreadId === "string" &&
    isOptionalString(value.title) &&
    isOptionalString(value.createdAt) &&
    isOptionalString(value.updatedAt) &&
    isOptionalString(value.cwd) &&
    isOptionalString(value.source) &&
    isOptionalString(value.modelProvider) &&
    typeof value.archived === "boolean" &&
    isOptionalString(value.sourcePath) &&
    THREAD_STATUSES.has(String(value.importStatus))
  );
}

function assertConversationImportSourceScanResponse(
  value: unknown,
): asserts value is ConversationImportSourceScanResponse {
  if (!isRecord(value) || !isRecord(value.source)) {
    throw new Error(
      `${METHOD_CONVERSATION_IMPORT_SOURCE_SCAN} did not return a source scan response`,
    );
  }
  const { source } = value;
  if (
    !SOURCE_CLIENTS.has(String(source.sourceClient)) ||
    !SOURCE_STATUSES.has(String(source.status)) ||
    !isOptionalString(source.sourceRoot) ||
    typeof source.readable !== "boolean" ||
    typeof source.threadCount !== "number" ||
    !isOptionalString(source.indexedAt) ||
    !isOptionalString(source.statePath) ||
    !isOptionalString(source.message) ||
    !Array.isArray(value.threads) ||
    !value.threads.every(isImportedThreadSummary) ||
    !isOptionalString(value.nextCursor)
  ) {
    throw new Error(
      `${METHOD_CONVERSATION_IMPORT_SOURCE_SCAN} returned an invalid source scan shape`,
    );
  }
}

export async function scanConversationImportSource(
  params: ConversationImportSourceScanParams = {},
  appServerClient: ConversationImportAppServerClient = new AppServerClient(),
): Promise<ConversationImportSourceScanResponse> {
  const response =
    await appServerClient.request<ConversationImportSourceScanResponse>(
      METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
      params,
    );
  assertConversationImportSourceScanResponse(response.result);
  return response.result;
}
