import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";

export type WorkspaceProductProfileWorkerEvidenceStatus =
  | "completed"
  | "failed"
  | "unknown";

export interface WorkspaceProductProfileWorkerEvidenceItem {
  id: string;
  status: WorkspaceProductProfileWorkerEvidenceStatus;
  source: string;
  eventType: string | null;
  appId: string | null;
  taskId: string | null;
  taskKind: string | null;
  turnId: string | null;
  workerEntrypoint: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
  outputObjectCount: number | null;
  artifactRef: string | null;
  artifactKind: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
}

export function readWorkspaceProductProfileWorkerEvidence(
  value: unknown,
): WorkspaceProductProfileWorkerEvidenceItem[] {
  return readArray(value)
    .map(readWorkerEvidenceItem)
    .filter((item): item is WorkspaceProductProfileWorkerEvidenceItem =>
      Boolean(item),
    )
    .sort(compareWorkerEvidenceDesc);
}

export function buildWorkspaceProductProfileWorkerEvidenceFromThreadRead(
  params: {
    productWorkspace?: Record<string, unknown> | null;
    sourceArtifacts?: unknown;
    threadRead?: AgentRuntimeThreadReadModel | null;
  },
): WorkspaceProductProfileWorkerEvidenceItem[] {
  const productWorkspace = params.productWorkspace ?? null;
  const explicitEvidence = readWorkspaceProductProfileWorkerEvidence(
    firstArray(
      productWorkspace?.workerEvidence,
      productWorkspace?.worker_evidence,
    ),
  );
  if (explicitEvidence.length > 0) {
    return explicitEvidence;
  }

  const fallbackEvidence = readSourceArtifactWorkerEvidence(
    params.sourceArtifacts,
  );
  const diagnosticEvidence = readDiagnosticWorkerEvidence(params.threadRead);
  return [...diagnosticEvidence, ...fallbackEvidence].sort(
    compareWorkerEvidenceDesc,
  );
}

function readWorkerEvidenceItem(
  value: unknown,
): WorkspaceProductProfileWorkerEvidenceItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id, record.eventId, record.event_id);
  const status = readWorkerEvidenceStatus(record.status);
  return {
    id:
      id ||
      [
        readString(record.turnId, record.turn_id),
        readString(record.taskId, record.task_id),
        status,
      ]
        .filter(Boolean)
        .join(":") ||
      "worker-evidence",
    status,
    source:
      readString(record.source, record.eventType, record.event_type) ||
      "agent_app_task_worker",
    eventType: readString(record.eventType, record.event_type) || null,
    appId: readString(record.appId, record.app_id) || null,
    taskId: readString(record.taskId, record.task_id) || null,
    taskKind: readString(record.taskKind, record.task_kind) || null,
    turnId: readString(record.turnId, record.turn_id) || null,
    workerEntrypoint:
      readString(record.workerEntrypoint, record.worker_entrypoint) || null,
    inputSummary:
      readString(record.inputSummary, record.input_summary) || null,
    outputSummary:
      readString(record.outputSummary, record.output_summary) || null,
    outputObjectCount:
      readNumber(record.outputObjectCount, record.output_object_count) ?? null,
    artifactRef:
      readString(record.artifactRef, record.artifact_ref, record.path) || null,
    artifactKind:
      readString(record.artifactKind, record.artifact_kind, record.kind) ||
      null,
    errorCode: readString(record.errorCode, record.error_code) || null,
    errorMessage:
      readString(
        record.errorMessage,
        record.error_message,
        record.message,
        record.error,
      ) || null,
    updatedAt: readString(record.updatedAt, record.updated_at) || null,
  };
}

function readSourceArtifactWorkerEvidence(
  value: unknown,
): WorkspaceProductProfileWorkerEvidenceItem[] {
  return readArray(value)
    .map((item, index): WorkspaceProductProfileWorkerEvidenceItem | null => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }
      const artifactRef = readString(
        record.artifactRef,
        record.artifact_ref,
        record.path,
      );
      const artifactKind = readString(
        record.kind,
        record.artifactKind,
        record.artifact_kind,
      );
      if (!artifactRef && !artifactKind) {
        return null;
      }
      const id =
        readString(record.eventId, record.event_id, artifactRef) ||
        `source-artifact-${index + 1}`;
      return {
        id,
        status: "completed" as const,
        source: "artifact.snapshot",
        eventType: "artifact.snapshot",
        appId: null,
        taskId: null,
        taskKind: null,
        turnId: readString(record.turnId, record.turn_id) || null,
        workerEntrypoint: null,
        inputSummary: null,
        outputSummary: null,
        outputObjectCount: null,
        artifactRef: artifactRef || null,
        artifactKind: artifactKind || null,
        errorCode: null,
        errorMessage: null,
        updatedAt: readString(record.updatedAt, record.updated_at) || null,
      };
    })
    .filter((item): item is WorkspaceProductProfileWorkerEvidenceItem =>
      Boolean(item),
    );
}

function readDiagnosticWorkerEvidence(
  threadRead?: AgentRuntimeThreadReadModel | null,
): WorkspaceProductProfileWorkerEvidenceItem[] {
  const runtimeSummary = asRecord(threadRead?.runtime_summary);
  const message = readString(
    threadRead?.diagnostics?.latest_turn_error_message,
    runtimeSummary?.latestTurnErrorMessage,
    runtimeSummary?.latest_turn_error_message,
  );
  if (!message) {
    return [];
  }
  const turns = threadRead?.turns ?? [];
  const turnId =
    readString(threadRead?.active_turn_id) ||
    readString(turns.length > 0 ? turns[turns.length - 1]?.turn_id : null);
  return [
    {
      id: `${turnId || threadRead?.thread_id || "thread"}:worker-error`,
      status: "failed",
      source: "diagnostics",
      eventType: "diagnostics",
      appId: null,
      taskId: null,
      taskKind: readString(threadRead?.task_kind) || null,
      turnId: turnId || null,
      workerEntrypoint: null,
      inputSummary: null,
      outputSummary: null,
      outputObjectCount: null,
      artifactRef: null,
      artifactKind: null,
      errorCode: null,
      errorMessage: message,
      updatedAt:
        readString(
          threadRead?.diagnostics?.latest_turn_completed_at,
          threadRead?.diagnostics?.latest_turn_updated_at,
          threadRead?.updated_at,
        ) || null,
    },
  ];
}

function readWorkerEvidenceStatus(
  value: unknown,
): WorkspaceProductProfileWorkerEvidenceStatus {
  const status = readString(value).replace(/-/g, "_");
  if (status === "completed" || status === "failed") {
    return status;
  }
  return "unknown";
}

function compareWorkerEvidenceDesc(
  left: WorkspaceProductProfileWorkerEvidenceItem,
  right: WorkspaceProductProfileWorkerEvidenceItem,
): number {
  return (
    dateValue(right.updatedAt) - dateValue(left.updatedAt) ||
    right.id.localeCompare(left.id)
  );
}

function dateValue(value: string | null): number {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
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

function readNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
