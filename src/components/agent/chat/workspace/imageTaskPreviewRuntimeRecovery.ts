import { listDirectory } from "@/lib/api/fileBrowser";
import { markdownContainsDocumentImageTaskPlaceholder } from "@/components/workspace/document/utils/imageTaskPlaceholder";
import { resolveAbsoluteWorkspacePath } from "./workspacePath";
import { IMAGE_TASKS_ROOT_RELATIVE_PATH } from "./imageTaskLocator";
import type { SessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { normalizeTaskFamily } from "./imageTaskFamily";
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function documentMarkdownsNeedInlineApplyTarget(
  documentMarkdowns?: readonly (string | null | undefined)[],
): boolean {
  return (documentMarkdowns || []).some((markdown) =>
    markdownContainsDocumentImageTaskPlaceholder(markdown),
  );
}

function cachedTaskHasDocumentInlineApplyTarget(params: {
  task: SessionImageWorkbenchState["tasks"][number];
  documentMarkdowns?: readonly (string | null | undefined)[];
}): boolean {
  const applyTarget = params.task.applyTarget;
  if (
    applyTarget?.kind !== "canvas-insert" ||
    applyTarget.canvasType !== "document"
  ) {
    return false;
  }

  const slotId = applyTarget.slotId?.trim();
  if (!slotId) {
    return false;
  }

  const slotMarkerPattern = new RegExp(
    `lime:image-task-slot:\\s*${escapeRegExp(slotId)}`,
  );
  return (params.documentMarkdowns || []).some((markdown) =>
    slotMarkerPattern.test(markdown || ""),
  );
}

function documentMarkdownsContainPendingInlineTaskReference(params: {
  documentMarkdowns?: readonly (string | null | undefined)[];
  taskId?: string | null;
  slotId?: string | null;
}): boolean {
  const taskId = normalizeTaskRef(params.taskId);
  const slotId = normalizeTaskRef(params.slotId);
  const slotMarkerPattern = slotId
    ? new RegExp(`lime:image-task-slot:\\s*${escapeRegExp(slotId)}`)
    : null;

  return (params.documentMarkdowns || []).some((markdown) => {
    const content = markdown || "";
    if (
      taskId &&
      (content.includes(`pending-image-task://${encodeURIComponent(taskId)}`) ||
        content.includes(`pending-image-task://${taskId}`))
    ) {
      return true;
    }
    return Boolean(slotMarkerPattern?.test(content)) &&
      content.includes("pending-image-task://");
  });
}

function documentMarkdownsContainImageTaskOutput(params: {
  documentMarkdowns?: readonly (string | null | undefined)[];
  outputs: SessionImageWorkbenchState["outputs"];
}): boolean {
  const outputUrls = params.outputs
    .map((output) => output.url?.trim())
    .filter((url): url is string => Boolean(url));
  if (outputUrls.length === 0) {
    return false;
  }
  return (params.documentMarkdowns || []).some((markdown) =>
    outputUrls.some((url) => (markdown || "").includes(url)),
  );
}

function documentMarkdownsContainInlineTaskReference(params: {
  documentMarkdowns?: readonly (string | null | undefined)[];
  taskId?: string | null;
  slotId?: string | null;
}): boolean {
  const taskId = normalizeTaskRef(params.taskId);
  const slotId = normalizeTaskRef(params.slotId);
  if (!taskId && !slotId) {
    return false;
  }

  const slotMarkerPattern = slotId
    ? new RegExp(`lime:image-task-slot:\\s*${escapeRegExp(slotId)}`)
    : null;
  return (params.documentMarkdowns || []).some((markdown) => {
    const content = markdown || "";
    return (
      Boolean(slotMarkerPattern?.test(content)) ||
      Boolean(
        taskId &&
          (content.includes(`pending-image-task://${encodeURIComponent(taskId)}`) ||
            content.includes(`pending-image-task://${taskId}`)),
      )
    );
  });
}

function taskRecordMatchesDocumentInlineMarkdown(params: {
  taskRecord: Record<string, unknown>;
  documentMarkdowns?: readonly (string | null | undefined)[];
}): boolean {
  const payload = asRecord(params.taskRecord.payload);
  const relationships =
    asRecord(params.taskRecord.relationships) ||
    asRecord(payload?.relationships);
  const slotId = readString(
    [relationships, payload, params.taskRecord],
    ["slot_id", "slotId"],
  );
  return documentMarkdownsContainInlineTaskReference({
    documentMarkdowns: params.documentMarkdowns,
    taskId: readString([params.taskRecord], ["task_id", "taskId"]),
    slotId,
  });
}

function eventPayloadMatchesDocumentInlineMarkdown(params: {
  payload: {
    task_id?: string;
    slot_id?: string;
  };
  documentMarkdowns?: readonly (string | null | undefined)[];
}): boolean {
  return documentMarkdownsContainInlineTaskReference({
    documentMarkdowns: params.documentMarkdowns,
    taskId: params.payload.task_id,
    slotId: params.payload.slot_id,
  });
}

function isDocumentInlineReplaceableCachedStatus(
  task: SessionImageWorkbenchState["tasks"][number],
): boolean {
  return task.status === "complete" || task.status === "partial";
}

export function isImageWorkbenchTaskSatisfiedByCache(params: {
  imageWorkbenchState?: SessionImageWorkbenchState;
  taskId: string;
  documentMarkdowns?: readonly (string | null | undefined)[];
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
    if (
      documentMarkdownsNeedInlineApplyTarget(params.documentMarkdowns)
    ) {
      const slotId =
        task.applyTarget?.kind === "canvas-insert"
          ? task.applyTarget.slotId
          : null;
      if (
        !isDocumentInlineReplaceableCachedStatus(task) ||
        !cachedTaskHasDocumentInlineApplyTarget({
          task,
          documentMarkdowns: params.documentMarkdowns,
        }) ||
        documentMarkdownsContainPendingInlineTaskReference({
          documentMarkdowns: params.documentMarkdowns,
          taskId: params.taskId,
          slotId,
        }) ||
        !documentMarkdownsContainImageTaskOutput({
          documentMarkdowns: params.documentMarkdowns,
          outputs,
        })
      ) {
        return false;
      }
    }
    return true;
  }

  if (task.status === "cancelled" || task.status === "error") {
    if (
      documentMarkdownsNeedInlineApplyTarget(params.documentMarkdowns) &&
      !cachedTaskHasDocumentInlineApplyTarget({
        task,
        documentMarkdowns: params.documentMarkdowns,
      })
    ) {
      return false;
    }
    return true;
  }

  return false;
}

export { normalizeTaskFamily } from "./imageTaskFamily";

function normalizeTaskRef(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function matchesRuntimeEventContext(params: {
  payload: {
    task_id?: string;
    session_id?: string;
    project_id?: string;
    content_id?: string;
    slot_id?: string;
  };
  sessionId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
  documentMarkdowns?: readonly (string | null | undefined)[];
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
    return (
      matchedScopedContext ||
      eventPayloadMatchesDocumentInlineMarkdown({
        payload: params.payload,
        documentMarkdowns: params.documentMarkdowns,
      })
    );
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
  documentMarkdowns?: readonly (string | null | undefined)[];
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
    return (
      matchedScopedContext ||
      taskRecordMatchesDocumentInlineMarkdown({
        taskRecord: params.taskRecord,
        documentMarkdowns: params.documentMarkdowns,
      })
    );
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
