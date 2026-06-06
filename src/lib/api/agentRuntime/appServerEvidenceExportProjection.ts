import type {
  AppServerEvidenceExportResponse,
  AppServerEvidencePackSummary,
} from "@/lib/api/appServer";
import { normalizeEvidencePack } from "./normalizers";
import type { AgentRuntimeEvidencePack } from "./types";

export function projectAppServerEvidenceExportToRuntimeEvidencePack(
  response: AppServerEvidenceExportResponse,
): AgentRuntimeEvidencePack {
  const evidencePack = response.evidencePack;
  if (!evidencePack) {
    throw new Error("App Server evidence/export did not return evidencePack");
  }

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
