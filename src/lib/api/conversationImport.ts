import { AppServerClient } from "@/lib/api/appServer";
import {
  CONVERSATION_IMPORT_JOB_PHASES,
  CONVERSATION_IMPORT_JOB_STATUSES,
  CONVERSATION_IMPORT_SOURCE_CLIENTS,
  CONVERSATION_IMPORT_SOURCE_STATUSES,
  CONVERSATION_IMPORT_THREAD_STATUSES,
  METHOD_CONVERSATION_IMPORT_JOB_READ,
  METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
  METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
  METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW,
  type ConversationImportJob,
  type ConversationImportJobPhase,
  type ConversationImportJobReadParams,
  type ConversationImportJobReadResponse,
  type ConversationImportJobStatus,
  type ConversationImportSourceClient,
  type ConversationImportSourceProvenance,
  type ConversationImportSourceScanParams,
  type ConversationImportSourceScanResponse,
  type ConversationImportSourceStatus,
  type ConversationImportThreadCommitParams,
  type ConversationImportThreadCommitResponse,
  type ConversationImportThreadCommitStartResponse,
  type ConversationImportThreadStatus,
  type ConversationImportThreadPreviewParams,
  type ConversationImportThreadPreviewResponse,
  type ImportedThreadSummary,
} from "../../../packages/app-server-client/src/protocol";

export type {
  ConversationImportJob,
  ConversationImportJobPhase,
  ConversationImportJobReadParams,
  ConversationImportJobReadResponse,
  ConversationImportJobStatus,
  ConversationImportSourceProvenance,
  ConversationImportSourceClient,
  ConversationImportSourceScanParams,
  ConversationImportSourceScanResponse,
  ConversationImportSourceStatus,
  ConversationImportThreadStatus,
  ConversationImportThreadCommitParams,
  ConversationImportThreadCommitResponse,
  ConversationImportThreadCommitStartResponse,
  ConversationImportThreadPreviewParams,
  ConversationImportThreadPreviewResponse,
  ImportedThreadSummary,
};

type ConversationImportAppServerClient = Pick<AppServerClient, "request">;

const SOURCE_CLIENT_VALUES = new Set<string>(
  CONVERSATION_IMPORT_SOURCE_CLIENTS,
);
const SOURCE_STATUS_VALUES = new Set<string>(
  CONVERSATION_IMPORT_SOURCE_STATUSES,
);
const THREAD_STATUS_VALUES = new Set<string>(
  CONVERSATION_IMPORT_THREAD_STATUSES,
);
const JOB_STATUS_VALUES = new Set<string>(CONVERSATION_IMPORT_JOB_STATUSES);
const JOB_PHASE_VALUES = new Set<string>(CONVERSATION_IMPORT_JOB_PHASES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isConversationImportSourceClient(
  value: unknown,
): value is ConversationImportSourceClient {
  return typeof value === "string" && SOURCE_CLIENT_VALUES.has(value);
}

function isConversationImportSourceStatus(
  value: unknown,
): value is ConversationImportSourceStatus {
  return typeof value === "string" && SOURCE_STATUS_VALUES.has(value);
}

function isConversationImportThreadStatus(
  value: unknown,
): value is ConversationImportThreadStatus {
  return typeof value === "string" && THREAD_STATUS_VALUES.has(value);
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
    isConversationImportSourceClient(value.sourceClient) &&
    typeof value.sourceThreadId === "string" &&
    isOptionalString(value.title) &&
    isOptionalString(value.createdAt) &&
    isOptionalString(value.updatedAt) &&
    isOptionalString(value.cwd) &&
    isOptionalString(value.source) &&
    isOptionalString(value.modelProvider) &&
    typeof value.archived === "boolean" &&
    isOptionalString(value.sourcePath) &&
    isOptionalString(value.importJobId) &&
    isConversationImportThreadStatus(value.importStatus) &&
    (value.metadata === undefined ||
      value.metadata === null ||
      typeof value.metadata !== "function")
  );
}

function isConversationImportJobStatus(
  value: unknown,
): value is ConversationImportJobStatus {
  return typeof value === "string" && JOB_STATUS_VALUES.has(value);
}

function isConversationImportJobPhase(
  value: unknown,
): value is ConversationImportJobPhase {
  return typeof value === "string" && JOB_PHASE_VALUES.has(value);
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
    isConversationImportSourceClient(value.sourceClient) &&
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
    !isConversationImportSourceClient(source.sourceClient) ||
    !isConversationImportSourceStatus(source.status) ||
    !isOptionalString(source.sourceRoot) ||
    typeof source.readable !== "boolean" ||
    typeof source.threadCount !== "number" ||
    typeof source.sourceHomeExists !== "boolean" ||
    typeof source.stateDbReadable !== "boolean" ||
    typeof source.rolloutFileCount !== "number" ||
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

function isConversationImportJob(
  value: unknown,
): value is ConversationImportJob {
  if (
    !isRecord(value) ||
    typeof value.jobId !== "string" ||
    !isConversationImportSourceClient(value.sourceClient) ||
    !isOptionalString(value.sourceThreadId) ||
    !isConversationImportJobStatus(value.status) ||
    !isRecord(value.progress) ||
    !isConversationImportJobPhase(value.progress.phase) ||
    typeof value.progress.completedItems !== "number" ||
    typeof value.progress.totalItems !== "number" ||
    typeof value.progress.completedTurns !== "number" ||
    typeof value.progress.totalTurns !== "number" ||
    !isOptionalString(value.error) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return false;
  }
  if (value.result !== undefined) {
    try {
      assertConversationImportThreadCommitResponse(value.result);
    } catch {
      return false;
    }
  }
  return true;
}

function assertConversationImportThreadCommitStartResponse(
  value: unknown,
): asserts value is ConversationImportThreadCommitStartResponse {
  if (!isRecord(value) || !isConversationImportJob(value.job)) {
    throw new Error(
      `${METHOD_CONVERSATION_IMPORT_THREAD_COMMIT} did not return an import job`,
    );
  }
}

function assertConversationImportJobReadResponse(
  value: unknown,
): asserts value is ConversationImportJobReadResponse {
  if (!isRecord(value) || !isConversationImportJob(value.job)) {
    throw new Error(
      `${METHOD_CONVERSATION_IMPORT_JOB_READ} did not return an import job`,
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
): Promise<ConversationImportThreadCommitStartResponse> {
  const response =
    await appServerClient.request<ConversationImportThreadCommitStartResponse>(
      METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
      params,
    );
  assertConversationImportThreadCommitStartResponse(response.result);
  return response.result;
}

export async function readConversationImportJob(
  params: ConversationImportJobReadParams,
  appServerClient: ConversationImportAppServerClient = new AppServerClient(),
): Promise<ConversationImportJobReadResponse> {
  const response =
    await appServerClient.request<ConversationImportJobReadResponse>(
      METHOD_CONVERSATION_IMPORT_JOB_READ,
      params,
    );
  assertConversationImportJobReadResponse(response.result);
  return response.result;
}

export interface WaitForConversationImportJobOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (job: ConversationImportJob) => void;
}

export async function waitForConversationImportJob(
  initialJob: ConversationImportJob,
  options: WaitForConversationImportJobOptions = {},
  appServerClient: ConversationImportAppServerClient = new AppServerClient(),
): Promise<ConversationImportThreadCommitResponse> {
  const intervalMs = Math.max(100, options.intervalMs ?? 250);
  const timeoutMs = Math.max(intervalMs, options.timeoutMs ?? 30 * 60_000);
  const deadline = Date.now() + timeoutMs;
  let job = initialJob;

  while (true) {
    options.onProgress?.(job);
    if (job.status === "completed") {
      if (!job.result) {
        throw new Error("Conversation import completed without a result");
      }
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "Conversation import failed");
    }
    if (options.signal?.aborted) {
      throw new DOMException(
        "Conversation import wait was aborted",
        "AbortError",
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(`Conversation import job timed out: ${job.jobId}`);
    }

    await waitForPoll(intervalMs, options.signal);
    job = (
      await readConversationImportJob({ jobId: job.jobId }, appServerClient)
    ).job;
  }
}

function waitForPoll(intervalMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(
        new DOMException("Conversation import wait was aborted", "AbortError"),
      );
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, intervalMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
