import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
  METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
  METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW,
  METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
  type ConversationImportRuntimeEventDetail,
  type ConversationImportSourceClient,
  type ConversationImportSourceProvenance,
  type ConversationImportSourceScanParams,
  type ConversationImportSourceScanResponse,
  type ConversationImportSourceStatus,
  type ConversationImportThreadCommitParams,
  type ConversationImportThreadCommitResponse,
  type ConversationImportThreadStatus,
  type ConversationImportThreadPreviewParams,
  type ConversationImportThreadPreviewResponse,
  type ConversationImportThreadRuntimeEventsReadParams,
  type ConversationImportThreadRuntimeEventsReadResponse,
  type ImportedThreadSummary,
} from "../../../packages/app-server-client/src/protocol";

export type {
  ConversationImportSourceProvenance,
  ConversationImportSourceClient,
  ConversationImportSourceScanParams,
  ConversationImportSourceScanResponse,
  ConversationImportSourceStatus,
  ConversationImportThreadStatus,
  ConversationImportThreadCommitParams,
  ConversationImportThreadCommitResponse,
  ConversationImportThreadPreviewParams,
  ConversationImportThreadPreviewResponse,
  ConversationImportThreadRuntimeEventsReadParams,
  ConversationImportThreadRuntimeEventsReadResponse,
  ConversationImportRuntimeEventDetail,
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

function isAgentSession(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sessionId === "string" &&
    typeof value.threadId === "string" &&
    typeof value.appId === "string" &&
    isOptionalString(value.workspaceId) &&
    typeof value.status === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isImportedThreadSummary(
  value: unknown,
): value is ImportedThreadSummary {
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
    THREAD_STATUSES.has(String(value.importStatus)) &&
    (value.metadata === undefined ||
      value.metadata === null ||
      typeof value.metadata !== "function")
  );
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === "number";
}

function isSourceProvenance(
  value: unknown,
): value is ConversationImportSourceProvenance {
  if (value === undefined) {
    return true;
  }
  return (
    isRecord(value) &&
    SOURCE_CLIENTS.has(String(value.sourceClient)) &&
    isOptionalString(value.sourceThreadId) &&
    isOptionalString(value.sourcePath) &&
    isOptionalString(value.sourceEventType) &&
    isOptionalNumber(value.sourceEventSeq) &&
    isOptionalString(value.sourcePayloadType) &&
    isOptionalString(value.sourceCallId) &&
    isOptionalString(value.sourceRole) &&
    isOptionalString(value.sourceChannel)
  );
}

function isPreviewMessage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.role === "string" &&
    typeof value.text === "string" &&
    Array.isArray(value.attachments) &&
    value.attachments.every(
      (attachment) =>
        isRecord(attachment) &&
        typeof attachment.kind === "string" &&
        isOptionalString(attachment.uri) &&
        (attachment.metadata === undefined ||
          attachment.metadata === null ||
          typeof attachment.metadata !== "function"),
    ) &&
    typeof value.truncated === "boolean" &&
    typeof value.omittedBytes === "number" &&
    isOptionalString(value.timestamp) &&
    isOptionalString(value.sourceType) &&
    isSourceProvenance(value.provenance)
  );
}

function isPreviewEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    isOptionalString(value.timestamp) &&
    isOptionalString(value.label) &&
    isSourceProvenance(value.provenance)
  );
}

function isPreviewDryRun(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.willCreateSession === "boolean" &&
    typeof value.willAppendToExistingSession === "boolean" &&
    typeof value.willImportMessages === "number" &&
    typeof value.willImportTurns === "number" &&
    typeof value.willImportTimelineItems === "number" &&
    typeof value.willImportAttachments === "number" &&
    typeof value.unsupportedItems === "number"
  );
}

function isFidelitySummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.messages === "number" &&
    typeof value.reasoning === "number" &&
    typeof value.tools === "number" &&
    typeof value.commands === "number" &&
    typeof value.patches === "number" &&
    typeof value.approvals === "number" &&
    typeof value.mcp === "number" &&
    typeof value.webSearch === "number" &&
    typeof value.attachments === "number" &&
    typeof value.unsupported === "number" &&
    typeof value.provenanceOnly === "number" &&
    typeof value.budgetDropped === "number"
  );
}

function isPreviewSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.lineCount === "number" &&
    typeof value.messageCount === "number" &&
    typeof value.rolloutEventItems === "number" &&
    typeof value.unsupportedCount === "number" &&
    isPreviewDryRun(value.dryRun) &&
    isFidelitySummary(value.fidelity) &&
    typeof value.truncated === "boolean" &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
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

function assertConversationImportThreadPreviewResponse(
  value: unknown,
): asserts value is ConversationImportThreadPreviewResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.source) ||
    !isImportedThreadSummary(value.thread) ||
    !isPreviewSummary(value.summary) ||
    !Array.isArray(value.messages) ||
    !value.messages.every(isPreviewMessage) ||
    !Array.isArray(value.events) ||
    !value.events.every(isPreviewEvent)
  ) {
    throw new Error(
      `${METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW} returned an invalid thread preview shape`,
    );
  }
  assertConversationImportSourceScanResponse({
    source: value.source,
    threads: [],
  });
}

function assertConversationImportThreadCommitResponse(
  value: unknown,
): asserts value is ConversationImportThreadCommitResponse {
  if (
    !isRecord(value) ||
    !isAgentSession(value.session) ||
    !isImportedThreadSummary(value.thread) ||
    !isPreviewSummary(value.summary) ||
    typeof value.importedMessages !== "number" ||
    typeof value.importedTurns !== "number" ||
    typeof value.canContinue !== "boolean" ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error(
      `${METHOD_CONVERSATION_IMPORT_THREAD_COMMIT} returned an invalid thread commit shape`,
    );
  }
}

function isRuntimeEventDetail(
  value: unknown,
): value is ConversationImportRuntimeEventDetail {
  return (
    isRecord(value) &&
    typeof value.sourceEventIndex === "number" &&
    typeof value.turnIndex === "number" &&
    typeof value.eventIndex === "number" &&
    typeof value.eventType === "string" &&
    value.payload !== undefined
  );
}

function assertConversationImportRuntimeEventsReadResponse(
  value: unknown,
): asserts value is ConversationImportThreadRuntimeEventsReadResponse {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    typeof value.offset !== "number" ||
    typeof value.limit !== "number" ||
    typeof value.totalEvents !== "number" ||
    !isOptionalNumber(value.nextOffset) ||
    typeof value.sourceRuntimeEvents !== "number" ||
    typeof value.materializedRuntimeEvents !== "number" ||
    typeof value.sidecarRuntimeEvents !== "number" ||
    !Array.isArray(value.events) ||
    !value.events.every(isRuntimeEventDetail)
  ) {
    throw new Error(
      `${METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ} returned an invalid runtime event detail shape`,
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

export async function previewConversationImportThread(
  params: ConversationImportThreadPreviewParams,
  appServerClient: ConversationImportAppServerClient = new AppServerClient(),
): Promise<ConversationImportThreadPreviewResponse> {
  const response =
    await appServerClient.request<ConversationImportThreadPreviewResponse>(
      METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW,
      params,
    );
  assertConversationImportThreadPreviewResponse(response.result);
  return response.result;
}

export async function commitConversationImportThread(
  params: ConversationImportThreadCommitParams,
  appServerClient: ConversationImportAppServerClient = new AppServerClient(),
): Promise<ConversationImportThreadCommitResponse> {
  const response =
    await appServerClient.request<ConversationImportThreadCommitResponse>(
      METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
      params,
    );
  assertConversationImportThreadCommitResponse(response.result);
  return response.result;
}

export async function readConversationImportRuntimeEvents(
  params: ConversationImportThreadRuntimeEventsReadParams,
  appServerClient: ConversationImportAppServerClient = new AppServerClient(),
): Promise<ConversationImportThreadRuntimeEventsReadResponse> {
  const response =
    await appServerClient.request<ConversationImportThreadRuntimeEventsReadResponse>(
      METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
      params,
    );
  assertConversationImportRuntimeEventsReadResponse(response.result);
  return response.result;
}
