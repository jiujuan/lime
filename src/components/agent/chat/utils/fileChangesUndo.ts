import {
  listAgentRuntimeFileCheckpoints,
  restoreAgentRuntimeFileCheckpoint,
} from "@/lib/api/agentRuntime/threadClient";
import type {
  AgentRuntimeFileCheckpointRestoreResult,
  AgentRuntimeFileCheckpointSummary,
} from "@/lib/api/agentRuntime/sessionTypes";
import { areArtifactProtocolPathsEquivalent } from "@/lib/artifact-protocol";
import type { FileChangesAggregate } from "./fileChangeSummary";

export type FileChangesUndoErrorCode =
  | "emptyAggregate"
  | "missingSession"
  | "noMatchingCheckpoints";

export class FileChangesUndoError extends Error {
  readonly code: FileChangesUndoErrorCode;

  constructor(code: FileChangesUndoErrorCode) {
    super(code);
    this.name = "FileChangesUndoError";
    this.code = code;
  }
}

export interface FileChangesUndoResult {
  checkpointIds: string[];
  missingPaths: string[];
  restored: AgentRuntimeFileCheckpointRestoreResult[];
  restoredCount: number;
}

function parseCheckpointTime(value?: string | number | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function sortCheckpointsByFreshness(
  checkpoints: AgentRuntimeFileCheckpointSummary[],
): AgentRuntimeFileCheckpointSummary[] {
  return [...checkpoints].sort(
    (left, right) =>
      parseCheckpointTime(right.updated_at) - parseCheckpointTime(left.updated_at),
  );
}

function uniqueChangedPaths(aggregate: FileChangesAggregate): string[] {
  return Array.from(
    new Set(
      aggregate.files
        .map((file) => file.path.trim())
        .filter((path) => path.length > 0),
    ),
  );
}

function isRestorableCheckpointCandidate(
  checkpoint: AgentRuntimeFileCheckpointSummary,
): boolean {
  if (
    checkpoint.kind ||
    checkpoint.version_id ||
    typeof checkpoint.version_no === "number"
  ) {
    return true;
  }
  return Boolean(
    checkpoint.snapshot_path &&
      !areArtifactProtocolPathsEquivalent(
        checkpoint.snapshot_path,
        checkpoint.path,
      ),
  );
}

export async function restoreFileChangesFromCheckpoints(params: {
  aggregate: FileChangesAggregate;
  sessionId?: string | null;
}): Promise<FileChangesUndoResult> {
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    throw new FileChangesUndoError("missingSession");
  }

  const changedPaths = uniqueChangedPaths(params.aggregate);
  if (changedPaths.length === 0) {
    throw new FileChangesUndoError("emptyAggregate");
  }

  const checkpointList = await listAgentRuntimeFileCheckpoints({
    session_id: sessionId,
  });
  const checkpoints = sortCheckpointsByFreshness(checkpointList.checkpoints || []);
  const checkpointIds = new Set<string>();
  const matchedCheckpoints: AgentRuntimeFileCheckpointSummary[] = [];
  const missingPaths: string[] = [];

  for (const changedPath of changedPaths) {
    const checkpoint = checkpoints.find(
      (candidate) =>
        isRestorableCheckpointCandidate(candidate) &&
        areArtifactProtocolPathsEquivalent(candidate.path, changedPath),
    );
    if (!checkpoint) {
      missingPaths.push(changedPath);
      continue;
    }
    if (!checkpointIds.has(checkpoint.checkpoint_id)) {
      checkpointIds.add(checkpoint.checkpoint_id);
      matchedCheckpoints.push(checkpoint);
    }
  }

  if (matchedCheckpoints.length === 0) {
    throw new FileChangesUndoError("noMatchingCheckpoints");
  }

  const restored: AgentRuntimeFileCheckpointRestoreResult[] = [];
  for (const checkpoint of matchedCheckpoints) {
    restored.push(
      await restoreAgentRuntimeFileCheckpoint({
        session_id: sessionId,
        checkpoint_id: checkpoint.checkpoint_id,
        confirm_restore: true,
        create_backup: true,
      }),
    );
  }

  return {
    checkpointIds: Array.from(checkpointIds),
    missingPaths,
    restored,
    restoredCount: restored.length,
  };
}
