import type {
  AppServerEvidenceExportResponse,
  AppServerEvidencePackSummary,
} from "@/lib/api/appServer";
import { normalizeEvidencePack } from "./normalizers";
import type { AgentRuntimeEvidencePack } from "./types";

export function projectAppServerEvidenceExportToRuntimeEvidencePack(
  response: AppServerEvidenceExportResponse,
): AgentRuntimeEvidencePack {
  assertNonEmptyString(
    response.session.sessionId,
    "App Server evidence/export did not return session.sessionId",
  );
  assertNonEmptyString(
    response.session.threadId,
    "App Server evidence/export did not return session.threadId",
  );

  const evidencePack = response.evidencePack;
  if (!evidencePack) {
    throw new Error("App Server evidence/export did not return evidencePack");
  }
  assertEvidencePackSummary(evidencePack);

  return normalizeEvidencePack({
    sessionId: response.session.sessionId,
    threadId: response.session.threadId,
    workspaceId: response.session.workspaceId,
    workspaceRoot: deriveWorkspaceRoot(evidencePack),
    packRelativeRoot: evidencePack.packRelativeRoot,
    packAbsoluteRoot: evidencePack.packAbsoluteRoot ?? "",
    exportedAt: evidencePack.exportedAt,
    threadStatus: evidencePack.threadStatus,
    latestTurnStatus: evidencePack.latestTurnStatus,
    turnCount: evidencePack.turnCount,
    itemCount: evidencePack.itemCount,
    pendingRequestCount: evidencePack.pendingRequestCount,
    queuedTurnCount: evidencePack.queuedTurnCount,
    recentArtifactCount: evidencePack.recentArtifactCount,
    knownGaps: evidencePack.knownGaps,
    observabilitySummary: evidencePack.observabilitySummary,
    completionAuditSummary: evidencePack.completionAuditSummary,
    artifacts: evidencePack.artifacts,
  });
}

function assertEvidencePackSummary(
  evidencePack: AppServerEvidencePackSummary,
): void {
  assertNonEmptyString(
    evidencePack.packRelativeRoot,
    "App Server evidence/export did not return evidencePack.packRelativeRoot",
  );
  assertNonEmptyString(
    evidencePack.exportedAt,
    "App Server evidence/export did not return evidencePack.exportedAt",
  );
  assertNonEmptyString(
    evidencePack.threadStatus,
    "App Server evidence/export did not return evidencePack.threadStatus",
  );
  assertFiniteNumber(
    evidencePack.turnCount,
    "App Server evidence/export did not return evidencePack.turnCount",
  );
  assertFiniteNumber(
    evidencePack.itemCount,
    "App Server evidence/export did not return evidencePack.itemCount",
  );
  assertFiniteNumber(
    evidencePack.pendingRequestCount,
    "App Server evidence/export did not return evidencePack.pendingRequestCount",
  );
  assertFiniteNumber(
    evidencePack.queuedTurnCount,
    "App Server evidence/export did not return evidencePack.queuedTurnCount",
  );
  assertFiniteNumber(
    evidencePack.recentArtifactCount,
    "App Server evidence/export did not return evidencePack.recentArtifactCount",
  );
}

function assertNonEmptyString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
}

function assertFiniteNumber(value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
}

function deriveWorkspaceRoot(
  evidencePack: AppServerEvidencePackSummary,
): string {
  const absoluteRoot = evidencePack.packAbsoluteRoot?.trim();
  if (!absoluteRoot) {
    return "";
  }

  const relativeRoot = trimPathSeparators(evidencePack.packRelativeRoot);
  if (!relativeRoot) {
    return absoluteRoot;
  }

  const normalizedAbsoluteRoot = absoluteRoot.replace(/\\/g, "/");
  const normalizedRelativeRoot = relativeRoot.replace(/\\/g, "/");
  const suffix = `/${normalizedRelativeRoot}`;
  if (normalizedAbsoluteRoot.endsWith(suffix)) {
    return trimTrailingPathSeparators(
      absoluteRoot.slice(0, absoluteRoot.length - suffix.length),
    );
  }
  if (normalizedAbsoluteRoot === normalizedRelativeRoot) {
    return "";
  }

  return absoluteRoot;
}

function trimPathSeparators(value: string): string {
  return value.replace(/^[\\/]+|[\\/]+$/g, "");
}

function trimTrailingPathSeparators(value: string): string {
  return value.replace(/[\\/]+$/g, "");
}
