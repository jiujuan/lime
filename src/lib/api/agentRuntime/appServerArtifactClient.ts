import {
  AppServerClient,
  type AppServerAgentSessionRuntimeEventAppendParams,
  type AppServerAgentSessionRuntimeEventAppendResponse,
  type AppServerArtifactReadResponse,
  type AppServerArtifactReadParams,
  type AppServerArtifactSummary,
} from "@/lib/api/appServer";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import type { AgentThreadItem } from "../agentProtocol";

export type AgentRuntimeTimelineArtifactItem = Extract<
  AgentThreadItem,
  { type: "file_artifact" }
>;

export type AgentRuntimeTimelineArtifactContent = {
  artifactId?: string;
  artifactRef: string;
  content: string;
  filePath: string;
  metadata?: unknown;
  title?: string;
};

export type AppServerArtifactRpcClient = Pick<AppServerClient, "readArtifacts"> &
  Partial<Pick<AppServerClient, "appendAgentSessionRuntimeEvents">>;

export interface AppServerArtifactClientDeps {
  appServerClient?: AppServerArtifactRpcClient;
}

export type AgentRuntimeArtifactDocumentSnapshotSaveResult =
  | {
      status: "appended";
      eventCount: number;
      evidence: AgentRuntimeArtifactDocumentSnapshotSaveEvidence;
    }
  | {
      status: "skipped";
      reason: "missing_scope" | "missing_append_method";
    };

export interface AgentRuntimeArtifactDocumentSnapshotSaveEvidence {
  artifactDocumentId: string;
  artifactRef: string;
  contentBytes?: number;
  contentSha256?: string;
  contentStatus?: string;
  eventId?: string;
  filePath?: string;
  lastPersistedAt?: string;
  sessionId: string;
  sidecarRelativePath?: string;
  sourceArtifactRef?: string;
  turnId?: string;
  versionId?: string;
  versionNo?: number;
}

export interface AgentRuntimeArtifactDocumentScope {
  artifactDocumentId?: string;
  artifactRef: string;
  lastPersistedAt?: string;
  sessionId: string;
  sidecarRelativePath?: string;
  sourceArtifactRef?: string;
  turnId?: string;
  versionId?: string;
  versionNo?: number;
}

export function createAppServerArtifactClient({
  appServerClient = new AppServerClient(),
}: AppServerArtifactClientDeps = {}) {
  async function readAgentRuntimeTimelineArtifactContent(
    item: AgentRuntimeTimelineArtifactItem,
  ): Promise<AgentRuntimeTimelineArtifactContent | null> {
    const params = appServerArtifactReadParamsFromTimelineItem(item);
    if (!params) {
      return null;
    }

    const response = await appServerClient.readArtifacts(params);
    assertArtifactReadResponse(response.result);
    return projectTimelineArtifactContentFromAppServerSummaries({
      item,
      params,
      artifacts: response.result.artifacts,
    });
  }

  async function readAgentRuntimeArtifactPreviewContent(
    artifact: Artifact,
    artifactPath: string,
  ): Promise<AgentRuntimeTimelineArtifactContent | null> {
    const params = appServerArtifactReadParamsFromArtifactPreview(
      artifact,
      artifactPath,
    );
    if (!params) {
      return null;
    }

    const response = await appServerClient.readArtifacts(params);
    assertArtifactReadResponse(response.result);
    return projectArtifactPreviewContentFromAppServerSummaries({
      artifact,
      artifactPath,
      params,
      artifacts: response.result.artifacts,
    });
  }

  async function saveAgentRuntimeArtifactDocumentSnapshot(
    artifact: Artifact,
    document: ArtifactDocumentV1,
  ): Promise<AgentRuntimeArtifactDocumentSnapshotSaveResult> {
    const params = appServerArtifactSnapshotAppendParamsFromArtifactDocument(
      artifact,
      document,
    );
    if (!params) {
      return {
        status: "skipped",
        reason: "missing_scope",
      };
    }
    if (!appServerClient.appendAgentSessionRuntimeEvents) {
      return {
        status: "skipped",
        reason: "missing_append_method",
      };
    }

    const response =
      await appServerClient.appendAgentSessionRuntimeEvents(params);
    assertRuntimeEventAppendResponse(response.result);
    const evidence = projectArtifactDocumentSnapshotSaveEvidence({
      document,
      params,
      response: response.result,
    });
    return {
      status: "appended",
      eventCount: response.result.events?.length ?? 0,
      evidence,
    };
  }

  return {
    readAgentRuntimeArtifactPreviewContent,
    readAgentRuntimeTimelineArtifactContent,
    saveAgentRuntimeArtifactDocumentSnapshot,
  };
}

export function projectArtifactDocumentSnapshotSaveEvidence({
  document,
  params,
  response,
}: {
  document: ArtifactDocumentV1;
  params: AppServerAgentSessionRuntimeEventAppendParams;
  response: AppServerAgentSessionRuntimeEventAppendResponse;
}): AgentRuntimeArtifactDocumentSnapshotSaveEvidence {
  const firstEvent = response.events?.[0];
  const eventPayload = asRecord(firstEvent?.payload);
  const artifact = asRecord(eventPayload?.artifact) || eventPayload;
  const sidecarRef =
    asRecord(artifact?.sidecarRef) || asRecord(eventPayload?.sidecarRef);
  const metadata = asRecord(artifact?.metadata);
  const artifactRef =
    readText(artifact, ["artifactRef", "artifact_ref", "artifactId"]) ||
    readText(metadata, ["artifactRef", "artifact_ref"]) ||
    normalizeText(document.artifactId) ||
    "artifact-document";
  const filePath =
    readText(artifact, ["filePath", "file_path", "path"]) ||
    readText(metadata, ["filePath", "file_path"]);
  const versionId =
    readText(metadata, ["artifactVersionId", "artifact_version_id"]) ||
    normalizeText(document.metadata.currentVersionId);
  const versionNo =
    readFiniteNumber(metadata?.artifactVersionNo) ??
    readFiniteNumber(metadata?.artifact_version_no) ??
    document.metadata.currentVersionNo;
  const sourceArtifactRef =
    readText(metadata, ["sourceArtifactRef", "source_artifact_ref"]) ||
    readText(eventPayload, ["sourceArtifactRef", "source_artifact_ref"]);

  return omitUndefined({
    artifactDocumentId: document.artifactId,
    artifactRef,
    contentBytes:
      readFiniteNumber(artifact?.contentBytes) ??
      readFiniteNumber(eventPayload?.contentBytes),
    contentSha256:
      readText(artifact, ["contentSha256", "content_sha256"]) ||
      readText(eventPayload, ["contentSha256", "content_sha256"]),
    contentStatus:
      readText(artifact, ["contentStatus", "content_status"]) ||
      readText(eventPayload, ["contentStatus", "content_status"]),
    eventId: normalizeText(firstEvent?.eventId),
    filePath,
    lastPersistedAt: normalizeText(firstEvent?.timestamp),
    sessionId: params.sessionId,
    sidecarRelativePath: readText(sidecarRef, [
      "relativePath",
      "relative_path",
    ]),
    sourceArtifactRef,
    turnId: normalizeText(params.turnId) || normalizeText(firstEvent?.turnId),
    versionId,
    versionNo,
  });
}

function assertArtifactReadResponse(
  value: unknown,
): asserts value is AppServerArtifactReadResponse {
  if (!isArtifactReadResponse(value)) {
    throw new Error("artifact/read did not return artifact summaries");
  }
}

function isArtifactReadResponse(
  value: unknown,
): value is AppServerArtifactReadResponse {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { artifacts?: unknown }).artifacts) &&
    (value as { artifacts: unknown[] }).artifacts.every(isArtifactSummary) &&
    (typeof (value as { nextCursor?: unknown }).nextCursor === "undefined" ||
      typeof (value as { nextCursor?: unknown }).nextCursor === "string")
  );
}

function assertRuntimeEventAppendResponse(
  value: unknown,
): asserts value is AppServerAgentSessionRuntimeEventAppendResponse {
  if (!isRuntimeEventAppendResponse(value)) {
    throw new Error(
      "agentSession/runtimeEvents/append did not return runtime events",
    );
  }
}

function isRuntimeEventAppendResponse(
  value: unknown,
): value is AppServerAgentSessionRuntimeEventAppendResponse {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (typeof (value as { events?: unknown }).events === "undefined" ||
      Array.isArray((value as { events?: unknown }).events))
  );
}

function isArtifactSummary(value: unknown): value is AppServerArtifactSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const artifact = value as Record<string, unknown>;
  return (
    typeof artifact.artifactRef === "string" &&
    artifact.artifactRef.length > 0 &&
    typeof artifact.eventId === "string" &&
    artifact.eventId.length > 0 &&
    typeof artifact.sequence === "number" &&
    Number.isFinite(artifact.sequence) &&
    isArtifactContentStatus(artifact.contentStatus) &&
    optionalString(artifact.turnId) &&
    optionalString(artifact.artifactId) &&
    optionalString(artifact.path) &&
    optionalString(artifact.title) &&
    optionalString(artifact.kind) &&
    optionalString(artifact.status) &&
    optionalString(artifact.content)
  );
}

function isArtifactContentStatus(value: unknown): boolean {
  return (
    value === "notRequested" || value === "available" || value === "unavailable"
  );
}

function optionalString(value: unknown): boolean {
  return typeof value === "undefined" || typeof value === "string";
}

export function appServerArtifactReadParamsFromTimelineItem(
  item: AgentRuntimeTimelineArtifactItem,
): AppServerArtifactReadParams | null {
  const metadata = asRecord(item.metadata);
  const sessionId = readText(metadata, [
    "sessionId",
    "session_id",
    "appServerSessionId",
    "app_server_session_id",
    "appServerArtifactSessionId",
    "app_server_artifact_session_id",
  ]);
  if (!sessionId) {
    return null;
  }

  const artifactRef = readText(metadata, [
    "artifactRef",
    "artifact_ref",
    "appServerArtifactRef",
    "app_server_artifact_ref",
    "artifactId",
    "artifact_id",
    "artifactDocumentId",
    "artifact_document_id",
  ]);
  const turnId =
    readText(metadata, [
      "turnId",
      "turn_id",
      "appServerTurnId",
      "app_server_turn_id",
      "appServerArtifactTurnId",
      "app_server_artifact_turn_id",
    ]) || normalizeText(item.turn_id);

  return omitUndefined({
    sessionId,
    turnId,
    artifactRef,
    includeContent: true,
    limit: artifactRef ? 1 : 20,
  });
}

export function appServerArtifactReadParamsFromArtifactPreview(
  artifact: Artifact,
  artifactPath: string,
): AppServerArtifactReadParams | null {
  const scope = resolveAgentRuntimeArtifactDocumentScope(artifact, {
    artifactPath,
  });
  if (!scope) {
    return null;
  }

  return omitUndefined({
    sessionId: scope.sessionId,
    turnId: scope.turnId,
    artifactRef: scope.artifactRef,
    includeContent: true,
    limit: 1,
  });
}

export function appServerArtifactSnapshotAppendParamsFromArtifactDocument(
  artifact: Artifact,
  document: ArtifactDocumentV1,
): AppServerAgentSessionRuntimeEventAppendParams | null {
  const metadata = asRecord(artifact.meta);
  const filePath = resolveArtifactProtocolFilePath(artifact);
  const scope = resolveAgentRuntimeArtifactDocumentScope(artifact, {
    artifactPath: filePath,
    document,
  });
  if (!scope) {
    return null;
  }

  const content = JSON.stringify(document, null, 2);
  const artifactMetadata = {
    ...(metadata || {}),
    artifactSchema: document.schemaVersion,
    artifactKind: document.kind,
    artifactDocument: document,
    artifactDocumentPersistence: scope,
    artifactTitle: document.title,
    artifactDocumentId: document.artifactId,
    artifactVersionId: normalizeText(document.metadata.currentVersionId),
    artifactVersionNo: document.metadata.currentVersionNo,
    artifactRef: scope.artifactRef,
    filePath,
    productProfile:
      asRecord(document.metadata.productProfile) ||
      asRecord(metadata?.productProfile),
  };

  return omitUndefined({
    sessionId: scope.sessionId,
    turnId: scope.turnId,
    runtimeEvents: [
      {
        type: "artifact.snapshot",
        payload: {
          artifact: omitUndefined({
            artifactId: scope.artifactRef,
            artifactRef: scope.artifactRef,
            artifactDocumentId: document.artifactId,
            filePath,
            path: filePath,
            title: document.title || artifact.title,
            kind: "artifact_document",
            status: document.status,
            content,
            metadata: omitUndefined(artifactMetadata),
          }),
        },
      },
    ],
  });
}

export function resolveAgentRuntimeArtifactDocumentScope(
  artifact: Artifact,
  options: {
    artifactPath?: string;
    document?: ArtifactDocumentV1;
  } = {},
): AgentRuntimeArtifactDocumentScope | null {
  const metadata = asRecord(artifact.meta);
  const savedScope =
    asRecord(metadata?.artifactDocumentPersistence) ||
    asRecord(metadata?.artifactDocumentScope) ||
    asRecord(metadata?.artifactDocumentSaveEvidence);
  const document = options.document;
  const artifactPath =
    normalizeText(options.artifactPath) ||
    normalizeText(resolveArtifactProtocolFilePath(artifact));

  const sessionId =
    readText(savedScope, ["sessionId", "session_id"]) ||
    resolveArtifactSessionId(metadata);
  if (!sessionId) {
    return null;
  }

  const artifactRef =
    readText(savedScope, ["artifactRef", "artifact_ref"]) ||
    resolveArtifactRef(metadata) ||
    normalizeText(document?.artifactId) ||
    normalizeText(artifact.id) ||
    artifactPath;
  if (!artifactRef) {
    return null;
  }

  const artifactDocumentId =
    readText(savedScope, ["artifactDocumentId", "artifact_document_id"]) ||
    readText(metadata, [
      "artifactDocumentId",
      "artifact_document_id",
      "appServerArtifactDocumentId",
      "app_server_artifact_document_id",
    ]) ||
    normalizeText(document?.artifactId);

  return omitUndefined({
    artifactDocumentId,
    artifactRef,
    lastPersistedAt:
      readText(savedScope, ["lastPersistedAt", "last_persisted_at"]) ||
      readText(metadata, ["appServerLastPersistedAt"]),
    sessionId,
    sidecarRelativePath:
      readText(savedScope, ["sidecarRelativePath", "sidecar_relative_path"]) ||
      readText(metadata, [
        "appServerSidecarRelativePath",
        "app_server_sidecar_relative_path",
      ]),
    sourceArtifactRef:
      readText(savedScope, ["sourceArtifactRef", "source_artifact_ref"]) ||
      readText(metadata, ["sourceArtifactRef", "source_artifact_ref"]),
    turnId:
      readText(savedScope, ["turnId", "turn_id"]) ||
      resolveArtifactTurnId(metadata) ||
      normalizeText(document?.turnId),
    versionId:
      readText(savedScope, ["versionId", "version_id"]) ||
      readText(metadata, [
        "artifactVersionId",
        "artifact_version_id",
        "appServerArtifactVersionId",
      ]) ||
      normalizeText(document?.metadata.currentVersionId),
    versionNo:
      readFiniteNumber(savedScope?.versionNo) ??
      readFiniteNumber(savedScope?.version_no) ??
      readFiniteNumber(metadata?.artifactVersionNo) ??
      readFiniteNumber(metadata?.artifact_version_no) ??
      document?.metadata.currentVersionNo,
  });
}

export function agentRuntimeArtifactDocumentScopeFromSaveEvidence(
  evidence: AgentRuntimeArtifactDocumentSnapshotSaveEvidence,
): AgentRuntimeArtifactDocumentScope {
  return omitUndefined({
    artifactDocumentId: evidence.artifactDocumentId,
    artifactRef: evidence.artifactRef,
    lastPersistedAt: evidence.lastPersistedAt,
    sessionId: evidence.sessionId,
    sidecarRelativePath: evidence.sidecarRelativePath,
    sourceArtifactRef: evidence.sourceArtifactRef,
    turnId: evidence.turnId,
    versionId: evidence.versionId,
    versionNo: evidence.versionNo,
  });
}

export function hasAgentRuntimeArtifactPreviewScope(
  artifact: Artifact,
  artifactPath: string,
): boolean {
  return (
    appServerArtifactReadParamsFromArtifactPreview(artifact, artifactPath) !==
    null
  );
}

export function projectTimelineArtifactContentFromAppServerSummaries({
  item,
  params,
  artifacts,
}: {
  item: AgentRuntimeTimelineArtifactItem;
  params: AppServerArtifactReadParams;
  artifacts: AppServerArtifactSummary[];
}): AgentRuntimeTimelineArtifactContent | null {
  const metadata = asRecord(item.metadata);
  const expectedArtifactIds = new Set(
    [
      params.artifactRef,
      normalizeText(item.id),
      readText(metadata, ["artifactId", "artifact_id"]),
      readText(metadata, ["artifactDocumentId", "artifact_document_id"]),
    ].filter((value): value is string => Boolean(value)),
  );
  const expectedPath = normalizePath(item.path);
  const selected =
    artifacts.find((artifact) => artifact.artifactRef === params.artifactRef) ??
    artifacts.find(
      (artifact) =>
        (artifact.artifactId && expectedArtifactIds.has(artifact.artifactId)) ||
        expectedArtifactIds.has(artifact.artifactRef),
    ) ??
    artifacts.find((artifact) => normalizePath(artifact.path) === expectedPath);

  if (
    !selected ||
    selected.contentStatus !== "available" ||
    typeof selected.content !== "string"
  ) {
    return null;
  }

  return omitUndefined({
    artifactId: selected.artifactId,
    artifactRef: selected.artifactRef,
    content: selected.content,
    filePath: selected.path || item.path,
    metadata: selected.metadata,
    title: selected.title,
  });
}

export function projectArtifactPreviewContentFromAppServerSummaries({
  artifact,
  artifactPath,
  params,
  artifacts,
}: {
  artifact: Artifact;
  artifactPath: string;
  params: AppServerArtifactReadParams;
  artifacts: AppServerArtifactSummary[];
}): AgentRuntimeTimelineArtifactContent | null {
  const metadata = asRecord(artifact.meta);
  const expectedArtifactIds = new Set(
    [
      params.artifactRef,
      normalizeText(artifact.id),
      readText(metadata, ["artifactId", "artifact_id"]),
      readText(metadata, ["artifactDocumentId", "artifact_document_id"]),
    ].filter((value): value is string => Boolean(value)),
  );
  const expectedPath = normalizePath(artifactPath);
  const selected =
    artifacts.find((entry) => entry.artifactRef === params.artifactRef) ??
    artifacts.find(
      (entry) =>
        (entry.artifactId && expectedArtifactIds.has(entry.artifactId)) ||
        expectedArtifactIds.has(entry.artifactRef),
    ) ??
    artifacts.find((entry) => normalizePath(entry.path) === expectedPath);

  if (
    !selected ||
    selected.contentStatus !== "available" ||
    typeof selected.content !== "string"
  ) {
    return null;
  }

  return omitUndefined({
    artifactId: selected.artifactId,
    artifactRef: selected.artifactRef,
    content: selected.content,
    filePath: selected.path || artifactPath,
    metadata: selected.metadata,
    title: selected.title,
  });
}

const defaultAppServerArtifactClient = createAppServerArtifactClient();

export const readAgentRuntimeTimelineArtifactContent =
  defaultAppServerArtifactClient.readAgentRuntimeTimelineArtifactContent;

export const readAgentRuntimeArtifactPreviewContent =
  defaultAppServerArtifactClient.readAgentRuntimeArtifactPreviewContent;

export const saveAgentRuntimeArtifactDocumentSnapshot =
  defaultAppServerArtifactClient.saveAgentRuntimeArtifactDocumentSnapshot;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readText(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const direct = normalizeText(record?.[key]);
    if (direct) {
      return direct;
    }
  }
  return undefined;
}

function readNestedText(
  record: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  let current: unknown = record;
  for (const key of path) {
    const next = asRecord(current)?.[key];
    if (typeof next === "undefined") {
      return undefined;
    }
    current = next;
  }
  return normalizeText(current);
}

function readStringArrayFirst(
  record: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  let current: unknown = record;
  for (const key of path) {
    const next = asRecord(current)?.[key];
    if (typeof next === "undefined") {
      return undefined;
    }
    current = next;
  }
  if (!Array.isArray(current)) {
    return undefined;
  }
  for (const item of current) {
    const normalized = normalizeText(item);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function resolveArtifactSessionId(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readText(metadata, [
      "sessionId",
      "session_id",
      "appServerSessionId",
      "app_server_session_id",
      "appServerArtifactSessionId",
      "app_server_artifact_session_id",
    ]) ||
    readNestedText(metadata, ["productProfile", "sessionId"]) ||
    readNestedText(metadata, ["productProfile", "session_id"]) ||
    readNestedText(metadata, ["sourceRunBinding", "sessionId"]) ||
    readNestedText(metadata, ["sourceRunBinding", "session_id"])
  );
}

function resolveArtifactTurnId(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readText(metadata, [
      "turnId",
      "turn_id",
      "appServerTurnId",
      "app_server_turn_id",
      "appServerArtifactTurnId",
      "app_server_artifact_turn_id",
    ]) ||
    readNestedText(metadata, ["sourceRunBinding", "turnId"]) ||
    readNestedText(metadata, ["sourceRunBinding", "turn_id"])
  );
}

function resolveArtifactRef(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readText(metadata, [
      "artifactRef",
      "artifact_ref",
      "appServerArtifactRef",
      "app_server_artifact_ref",
    ]) ||
    readStringArrayFirst(metadata, ["productProfile", "artifactIds"]) ||
    readStringArrayFirst(metadata, ["productProfile", "artifact_ids"]) ||
    readText(metadata, [
      "sourceRef",
      "artifactId",
      "artifact_id",
      "artifactDocumentId",
      "artifact_document_id",
    ])
  );
}

function normalizePath(value: unknown): string | undefined {
  return typeof value === "string"
    ? value.replace(/\\/g, "/").trim()
    : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
