export type WorkspaceArticleWorkspaceActionHistoryStatus =
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "unknown";

export interface WorkspaceArticleWorkspaceActionHistoryObjectRef {
  appId: string;
  kind: string;
  id: string;
  sessionId: string;
  version?: string | null;
  artifactIds?: string[];
  sourceTurnId?: string | null;
  sourceTaskId?: string | null;
}

export interface WorkspaceArticleWorkspaceActionResultArtifact {
  artifactRef: string;
  eventId?: string | null;
  artifactId?: string | null;
  path?: string | null;
  title?: string | null;
  kind?: string | null;
  status?: string | null;
}

export interface WorkspaceArticleWorkspaceActionHistoryItem {
  id: string;
  key: string;
  intent: string;
  risk: "read" | "write" | "unknown";
  status: WorkspaceArticleWorkspaceActionHistoryStatus;
  turnStatus: string | null;
  turnId: string;
  sessionId: string;
  threadId: string | null;
  appId: string;
  objectRef: WorkspaceArticleWorkspaceActionHistoryObjectRef | null;
  objectTitle: string | null;
  objectStatus: string | null;
  taskKind: string | null;
  prompt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultArtifacts?: WorkspaceArticleWorkspaceActionResultArtifact[];
}

export function readWorkspaceArticleWorkspaceActionHistory(
  value: unknown,
): WorkspaceArticleWorkspaceActionHistoryItem[] {
  return readArray(value)
    .map(readActionHistoryItem)
    .filter((item): item is WorkspaceArticleWorkspaceActionHistoryItem =>
      Boolean(item),
    )
    .sort(compareActionHistoryDesc);
}

export function filterWorkspaceArticleWorkspaceActionHistoryForObject(
  history: readonly WorkspaceArticleWorkspaceActionHistoryItem[],
  object: { ref: WorkspaceArticleWorkspaceActionHistoryObjectRef },
): WorkspaceArticleWorkspaceActionHistoryItem[] {
  return history.filter((item) => objectRefMatches(item.objectRef, object.ref));
}

function readActionHistoryItem(
  value: unknown,
): WorkspaceArticleWorkspaceActionHistoryItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const turnId = readString(record.turnId, record.turn_id);
  const key = readString(record.key);
  if (!turnId || !key) {
    return null;
  }
  const risk = readString(record.risk);
  return {
    id: readString(record.id) || `${turnId}:articleWorkspaceAction:${key}`,
    key,
    intent: readString(record.intent) || "custom",
    risk: risk === "read" || risk === "write" ? risk : "unknown",
    status: readActionHistoryStatus(record.status),
    turnStatus: readString(record.turnStatus, record.turn_status) || null,
    turnId,
    sessionId: readString(record.sessionId, record.session_id),
    threadId: readString(record.threadId, record.thread_id) || null,
    appId: readString(record.appId, record.app_id),
    objectRef: readActionHistoryObjectRef(
      firstRecord(record.objectRef, record.object_ref),
    ),
    objectTitle:
      readString(record.objectTitle, record.object_title) ||
      readString(firstRecord(record.object)?.title) ||
      null,
    objectStatus:
      readString(record.objectStatus, record.object_status) ||
      readString(firstRecord(record.object)?.status) ||
      null,
    taskKind: readString(record.taskKind, record.task_kind) || null,
    prompt: readString(record.prompt) || null,
    submittedAt: readString(record.submittedAt, record.submitted_at) || null,
    completedAt: readString(record.completedAt, record.completed_at) || null,
    errorCode: readString(record.errorCode, record.error_code) || null,
    errorMessage:
      readString(
        record.errorMessage,
        record.error_message,
        record.message,
        record.error,
      ) || null,
    resultArtifacts: readArray(record.resultArtifacts, record.result_artifacts)
      .map(readActionResultArtifact)
      .filter(
        (
          item,
        ): item is WorkspaceArticleWorkspaceActionResultArtifact =>
          Boolean(item),
      ),
  };
}

function readActionResultArtifact(
  value: unknown,
): WorkspaceArticleWorkspaceActionResultArtifact | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const artifactRef = readString(record.artifactRef, record.artifact_ref);
  if (!artifactRef) {
    return null;
  }
  return {
    artifactRef,
    eventId: readString(record.eventId, record.event_id) || null,
    artifactId: readString(record.artifactId, record.artifact_id) || null,
    path: readString(record.path) || null,
    title: readString(record.title) || null,
    kind: readString(record.kind) || null,
    status: readString(record.status) || null,
  };
}

function readActionHistoryObjectRef(
  value: unknown,
): WorkspaceArticleWorkspaceActionHistoryObjectRef | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const appId = readString(record.appId, record.app_id);
  const kind = readString(record.kind);
  const id = readString(record.id);
  const sessionId = readString(record.sessionId, record.session_id);
  if (!appId || !kind || !id || !sessionId) {
    return null;
  }
  return {
    appId,
    kind,
    id,
    sessionId,
    version: readString(record.version) || null,
    artifactIds: readArray(record.artifactIds, record.artifact_ids).filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    ),
    sourceTurnId:
      readString(record.sourceTurnId, record.source_turn_id) || null,
    sourceTaskId:
      readString(record.sourceTaskId, record.source_task_id) || null,
  };
}

function readActionHistoryStatus(
  value: unknown,
): WorkspaceArticleWorkspaceActionHistoryStatus {
  const status = readString(value).replace(/-/g, "_");
  if (
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "canceled"
  ) {
    return status;
  }
  return "unknown";
}

function compareActionHistoryDesc(
  left: WorkspaceArticleWorkspaceActionHistoryItem,
  right: WorkspaceArticleWorkspaceActionHistoryItem,
): number {
  return (
    dateValue(right.submittedAt ?? right.completedAt) -
      dateValue(left.submittedAt ?? left.completedAt) ||
    right.turnId.localeCompare(left.turnId)
  );
}

function dateValue(value: string | null): number {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function objectRefMatches(
  left: WorkspaceArticleWorkspaceActionHistoryObjectRef | null,
  right: WorkspaceArticleWorkspaceActionHistoryObjectRef,
): boolean {
  return Boolean(
    left &&
    left.appId === right.appId &&
    left.sessionId === right.sessionId &&
    left.kind === right.kind &&
    left.id === right.id,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) {
      return record;
    }
  }
  return null;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function readArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}
