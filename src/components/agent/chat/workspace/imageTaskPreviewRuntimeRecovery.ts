import { listDirectory } from "@/lib/api/fileBrowser";
import { resolveAbsoluteWorkspacePath } from "./workspacePath";
import { IMAGE_TASKS_ROOT_RELATIVE_PATH } from "./imageTaskLocator";
import type { SessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { asRecord, readString } from "./imageTaskPreviewRuntimePayload";
import {
  normalizeTaskStatus,
  type ParsedImageTaskSnapshot,
} from "./imageTaskPreviewRuntimeSnapshot";

const IMAGE_TASK_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const IMAGE_TASK_RESTORE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const IMAGE_TASKS_RESTORE_SCAN_DEPTH = 2;

export interface TrackedImageTask {
  taskId: string;
  taskType: string;
  taskFamily: string;
  artifactPath: string;
  absolutePath: string;
  lookupTaskRef: string;
  timerId: number | null;
  polling: boolean;
}

interface TaskContextMetadata {
  sessionId?: string;
  projectId?: string;
  contentId?: string;
}

export interface LoadedImageTaskSnapshot {
  snapshot: ParsedImageTaskSnapshot;
  taskRecord: Record<string, unknown>;
}

export interface RestoredImageTaskSnapshot extends LoadedImageTaskSnapshot {
  absolutePath: string;
  taskType: string;
  taskFamily: string;
}

export function shouldPreferLoadedImageTaskSnapshot(
  current: LoadedImageTaskSnapshot | null,
  candidate: LoadedImageTaskSnapshot | null,
): boolean {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }

  const currentIsTerminal = current.snapshot.terminal;
  const candidateIsTerminal = candidate.snapshot.terminal;
  if (currentIsTerminal !== candidateIsTerminal) {
    return candidateIsTerminal;
  }

  const currentOutputCount = current.snapshot.outputs.length;
  const candidateOutputCount = candidate.snapshot.outputs.length;
  if (currentOutputCount !== candidateOutputCount) {
    return candidateOutputCount > currentOutputCount;
  }

  return candidate.snapshot.updatedAt > current.snapshot.updatedAt;
}

export function isImageWorkbenchTaskSatisfiedByCache(params: {
  imageWorkbenchState?: SessionImageWorkbenchState;
  taskId: string;
}): boolean {
  const imageWorkbenchState = params.imageWorkbenchState;
  if (!imageWorkbenchState) {
    return false;
  }

  const task = imageWorkbenchState.tasks.find(
    (item) => item.id === params.taskId,
  );
  if (!task) {
    return false;
  }

  const outputs = imageWorkbenchState.outputs.filter(
    (output) => output.taskId === params.taskId,
  );
  if (outputs.length > 0) {
    return true;
  }

  return (
    task.status === "cancelled" ||
    task.status === "error" ||
    task.status === "partial" ||
    task.status === "complete"
  );
}

export function normalizeTaskFamily(
  taskType: string,
  taskFamily?: string,
): string | undefined {
  const normalizedFamily = taskFamily?.trim().toLowerCase();
  if (normalizedFamily) {
    return normalizedFamily;
  }

  const normalizedType = taskType.trim().toLowerCase();
  if (normalizedType.includes("image") || normalizedType.includes("cover")) {
    return "image";
  }
  if (normalizedType.includes("video")) {
    return "video";
  }
  return undefined;
}

function normalizeTaskRef(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function matchesRuntimeEventContext(params: {
  payload: {
    session_id?: string;
    project_id?: string;
    content_id?: string;
  };
  sessionId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
}): boolean {
  const normalizedSessionId = normalizeTaskRef(params.sessionId);
  const normalizedProjectId = normalizeTaskRef(params.projectId);
  const normalizedContentId = normalizeTaskRef(params.contentId);
  const payloadSessionId = normalizeTaskRef(params.payload.session_id);
  const payloadProjectId = normalizeTaskRef(params.payload.project_id);
  const payloadContentId = normalizeTaskRef(params.payload.content_id);
  let matchedScopedContext = false;

  if (
    normalizedSessionId &&
    payloadSessionId &&
    payloadSessionId !== normalizedSessionId
  ) {
    return false;
  }
  if (normalizedSessionId && payloadSessionId === normalizedSessionId) {
    matchedScopedContext = true;
  }
  if (
    normalizedProjectId &&
    payloadProjectId &&
    payloadProjectId !== normalizedProjectId
  ) {
    return false;
  }
  if (
    normalizedContentId &&
    payloadContentId &&
    payloadContentId !== normalizedContentId
  ) {
    return false;
  }
  if (normalizedContentId && payloadContentId === normalizedContentId) {
    matchedScopedContext = true;
  }

  if (normalizedSessionId || normalizedContentId) {
    return matchedScopedContext;
  }

  return true;
}

function resolveTaskRecordTimestamp(
  taskRecord: Record<string, unknown>,
): number {
  const timestampRaw =
    readString(
      [taskRecord],
      ["updated_at", "updatedAt", "created_at", "createdAt"],
    ) || "";
  const timestamp = Date.parse(timestampRaw);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isNonTerminalTaskStatus(status: string): boolean {
  return (
    status === "pending" ||
    status === "queued" ||
    status === "running" ||
    status === "partial"
  );
}

function isRecentlyActiveTaskRecord(
  taskRecord: Record<string, unknown>,
  now = Date.now(),
): boolean {
  return (
    now - resolveTaskRecordTimestamp(taskRecord) <= IMAGE_TASK_ACTIVE_WINDOW_MS
  );
}

export function shouldRestoreLoadedImageTaskSnapshot(
  snapshot: LoadedImageTaskSnapshot,
  now = Date.now(),
): boolean {
  if (snapshot.snapshot.terminal) {
    return true;
  }

  return isRecentlyActiveTaskRecord(snapshot.taskRecord, now);
}

function resolveTaskContextMetadata(
  taskRecord: Record<string, unknown>,
): TaskContextMetadata {
  const payload = asRecord(taskRecord.payload);
  return {
    sessionId: normalizeTaskRef(
      readString([taskRecord, payload], ["session_id", "sessionId"]),
    ),
    projectId: normalizeTaskRef(
      readString([taskRecord, payload], ["project_id", "projectId"]),
    ),
    contentId: normalizeTaskRef(
      readString([taskRecord, payload], ["content_id", "contentId"]),
    ),
  };
}

export function shouldRestoreImageTaskRecord(params: {
  taskRecord: Record<string, unknown>;
  sessionId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
  now?: number;
}): boolean {
  const taskType =
    readString([params.taskRecord], ["task_type", "taskType"]) || "";
  const taskFamily = normalizeTaskFamily(
    taskType,
    readString([params.taskRecord], ["task_family", "taskFamily"]),
  );
  if (taskFamily !== "image") {
    return false;
  }

  const metadata = resolveTaskContextMetadata(params.taskRecord);
  const normalizedSessionId = normalizeTaskRef(params.sessionId);
  const normalizedProjectId = normalizeTaskRef(params.projectId);
  const normalizedContentId = normalizeTaskRef(params.contentId);
  let matchedScopedContext = false;

  if (
    normalizedSessionId &&
    metadata.sessionId &&
    metadata.sessionId !== normalizedSessionId
  ) {
    return false;
  }
  if (
    normalizedProjectId &&
    metadata.projectId &&
    metadata.projectId !== normalizedProjectId
  ) {
    return false;
  }
  if (
    normalizedContentId &&
    metadata.contentId &&
    metadata.contentId !== normalizedContentId
  ) {
    return false;
  }

  if (normalizedSessionId && metadata.sessionId === normalizedSessionId) {
    matchedScopedContext = true;
  }
  if (normalizedContentId && metadata.contentId === normalizedContentId) {
    matchedScopedContext = true;
  }

  const normalizedStatus = normalizeTaskStatus(
    readString([params.taskRecord], ["normalized_status", "status"]),
  );
  if (
    isNonTerminalTaskStatus(normalizedStatus) &&
    !isRecentlyActiveTaskRecord(params.taskRecord, params.now)
  ) {
    return false;
  }

  if (normalizedSessionId || normalizedContentId) {
    return matchedScopedContext;
  }
  if (normalizedProjectId && metadata.projectId === normalizedProjectId) {
    return true;
  }

  if (isNonTerminalTaskStatus(normalizedStatus)) {
    return true;
  }

  return (
    (params.now ?? Date.now()) -
      resolveTaskRecordTimestamp(params.taskRecord) <=
    IMAGE_TASK_RESTORE_LOOKBACK_MS
  );
}

export async function collectImageTaskCandidatePaths(
  projectRootPath: string,
): Promise<string[]> {
  const normalizedProjectRoot = projectRootPath.trim();
  if (!normalizedProjectRoot) {
    return [];
  }

  const rootPath = resolveAbsoluteWorkspacePath(
    normalizedProjectRoot,
    IMAGE_TASKS_ROOT_RELATIVE_PATH,
  );
  if (!rootPath) {
    return [];
  }

  const pendingDirs: Array<{ path: string; depth: number }> = [
    { path: rootPath, depth: 0 },
  ];
  const discoveredPaths: string[] = [];
  const visitedDirs = new Set<string>();

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.shift();
    if (!currentDir || visitedDirs.has(currentDir.path)) {
      continue;
    }
    visitedDirs.add(currentDir.path);

    try {
      const listing = await listDirectory(currentDir.path);
      if (listing.error) {
        continue;
      }

      for (const entry of listing.entries) {
        if (entry.isDir) {
          if (currentDir.depth < IMAGE_TASKS_RESTORE_SCAN_DEPTH) {
            pendingDirs.push({
              path: entry.path,
              depth: currentDir.depth + 1,
            });
          }
          continue;
        }

        if (entry.name.toLowerCase().endsWith(".json")) {
          discoveredPaths.push(entry.path);
        }
      }
    } catch {
      continue;
    }
  }

  return discoveredPaths;
}
