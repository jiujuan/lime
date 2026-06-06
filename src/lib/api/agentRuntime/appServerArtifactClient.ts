import {
  AppServerClient,
  type AppServerArtifactReadParams,
  type AppServerArtifactSummary,
} from "@/lib/api/appServer";
import type { Artifact } from "@/lib/artifact/types";
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

export type AppServerArtifactRpcClient = Pick<AppServerClient, "readArtifacts">;

export interface AppServerArtifactClientDeps {
  appServerClient?: AppServerArtifactRpcClient;
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
    return projectArtifactPreviewContentFromAppServerSummaries({
      artifact,
      artifactPath,
      params,
      artifacts: response.result.artifacts,
    });
  }

  return {
    readAgentRuntimeArtifactPreviewContent,
    readAgentRuntimeTimelineArtifactContent,
  };
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
  const metadata = asRecord(artifact.meta);
  const sessionId = readText(metadata, [
    "sessionId",
    "session_id",
    "appServerSessionId",
    "app_server_session_id",
  ]);
  if (!sessionId) {
    return null;
  }

  const normalizedArtifactPath = normalizeText(artifactPath);
  const artifactRef =
    readText(metadata, [
      "artifactRef",
      "artifact_ref",
      "appServerArtifactRef",
      "app_server_artifact_ref",
      "artifactId",
      "artifact_id",
      "artifactDocumentId",
      "artifact_document_id",
    ]) ||
    normalizeText(artifact.id) ||
    normalizedArtifactPath;
  if (!artifactRef) {
    return null;
  }

  const turnId = readText(metadata, [
    "turnId",
    "turn_id",
    "appServerTurnId",
    "app_server_turn_id",
  ]);

  return omitUndefined({
    sessionId,
    turnId,
    artifactRef,
    includeContent: true,
    limit: 1,
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
