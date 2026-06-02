import type {
  HarnessActiveFileWrite,
  HarnessFileAction,
  HarnessFileKind,
  HarnessSessionState,
} from "../utils/harnessState";
import { resolveFileKind } from "../utils/harnessState";
import { formatArtifactWritePhaseLabel } from "../utils/messageArtifacts";
import {
  resolveDiffReviewSummaryFromCandidates,
  type DiffReviewFile,
  type DiffReviewSummary,
} from "../utils/diffReview";

export type HarnessFileFilterValue = "all" | HarnessFileKind;

export interface HarnessFileFilterOption {
  value: HarnessFileFilterValue;
  label: string;
}

export interface HarnessGroupedFileEvent {
  key: string;
  path: string;
  displayName: string;
  kind: HarnessFileKind;
  latestEvent: HarnessSessionState["recentFileEvents"][number];
  count: number;
  events: HarnessSessionState["recentFileEvents"];
  actionSummary: string;
}

export type FileChangeDecisionStatus = "pending" | "applied" | "rejected";

export type FileChangeReviewSummaryItem =
  | {
      type: "action";
      action: HarnessFileAction;
      count: number;
    }
  | {
      type: "phase";
      phase: HarnessActiveFileWrite["phase"];
      count: number;
    };

export interface FileChangeReviewEntry {
  key: string;
  path: string;
  displayName: string;
  kind: HarnessFileKind;
  latestAction: HarnessFileAction;
  latestEvent?: HarnessSessionState["recentFileEvents"][number];
  activeWrite?: HarnessActiveFileWrite;
  count: number;
  events: HarnessSessionState["recentFileEvents"];
  actionSummaryItems: FileChangeReviewSummaryItem[];
  preview?: string;
  content?: string;
  timestamp?: Date;
  status: FileChangeDecisionStatus;
}

export interface FileReviewSummaryTextPart {
  labelKey: string;
  valueLabelKey: string;
  count: number;
}

const FILE_CHANGE_STATUS_LABEL_KEY_BY_STATUS: Record<
  FileChangeDecisionStatus,
  string
> = {
  pending: "agentChat.harness.fileReview.status.pending",
  applied: "agentChat.harness.fileReview.status.applied",
  rejected: "agentChat.harness.fileReview.status.rejected",
};

const FILE_REVIEW_ACTION_LABEL_KEY_BY_ACTION: Record<
  HarnessFileAction,
  string
> = {
  read: "agentChat.harness.fileReview.action.read",
  write: "agentChat.harness.fileReview.action.write",
  edit: "agentChat.harness.fileReview.action.edit",
  offload: "agentChat.harness.fileReview.action.offload",
  persist: "agentChat.harness.fileReview.action.persist",
};

const FILE_REVIEW_KIND_LABEL_KEY_BY_KIND: Record<HarnessFileKind, string> = {
  document: "agentChat.harness.fileReview.kind.document",
  code: "agentChat.harness.fileReview.kind.code",
  log: "agentChat.harness.fileReview.kind.log",
  artifact: "agentChat.harness.fileReview.kind.artifact",
  offload: "agentChat.harness.fileReview.kind.offload",
  other: "agentChat.harness.fileReview.kind.other",
};

const FILE_REVIEW_PHASE_LABEL_KEY_BY_PHASE: Record<
  HarnessActiveFileWrite["phase"],
  string
> = {
  preparing: "agentChat.harness.fileReview.phase.preparing",
  streaming: "agentChat.harness.fileReview.phase.streaming",
  persisted: "agentChat.harness.fileReview.phase.persisted",
  completed: "agentChat.harness.fileReview.phase.completed",
  failed: "agentChat.harness.fileReview.phase.failed",
};

export function formatHarnessTime(value?: Date): string {
  if (!value) {
    return "刚刚";
  }

  return value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWriteSourceLabel(source?: string): string {
  switch (source) {
    case "tool_start":
      return "工具启动";
    case "artifact_snapshot":
      return "快照同步";
    case "tool_result":
      return "工具结果";
    case "message_content":
      return "消息流";
    default:
      return source || "处理中";
  }
}

export function getActiveWriteDescription(
  write: HarnessActiveFileWrite,
): string {
  const parts = [
    formatArtifactWritePhaseLabel(write.phase),
    write.source ? formatWriteSourceLabel(write.source) : undefined,
    write.updatedAt ? formatHarnessTime(write.updatedAt) : undefined,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function resolveDiffReviewStatusLabelKey(
  status?: DiffReviewFile["status"],
): string {
  switch (status) {
    case "added":
      return "agentChat.harness.diff.status.added";
    case "deleted":
      return "agentChat.harness.diff.status.deleted";
    case "modified":
      return "agentChat.harness.diff.status.modified";
    case "unknown":
    default:
      return "agentChat.harness.diff.status.unknown";
  }
}

export function buildFileChangeReviewDiffSummary(
  entry: FileChangeReviewEntry,
): DiffReviewSummary | null {
  return resolveDiffReviewSummaryFromCandidates(
    [
      entry.content,
      entry.preview,
      entry.latestEvent?.content,
      entry.latestEvent?.preview,
      entry.activeWrite?.content,
      entry.activeWrite?.preview,
      entry.activeWrite?.latestChunk,
    ],
    { fallbackPath: entry.path },
  );
}

export function resolveFileChangeStatusLabelKey(
  status: FileChangeDecisionStatus,
): string {
  return FILE_CHANGE_STATUS_LABEL_KEY_BY_STATUS[status] || status;
}

export function resolveFileReviewActionLabelKey(
  action: HarnessFileAction,
): string {
  return FILE_REVIEW_ACTION_LABEL_KEY_BY_ACTION[action] || action;
}

export function resolveFileReviewKindLabelKey(
  kind: HarnessFileKind,
): string {
  return FILE_REVIEW_KIND_LABEL_KEY_BY_KIND[kind] || kind;
}

export function resolveFileReviewPhaseLabelKey(
  phase: HarnessActiveFileWrite["phase"],
): string {
  return FILE_REVIEW_PHASE_LABEL_KEY_BY_PHASE[phase] || phase;
}

export function buildFileReviewSummaryTextParts(
  items: FileChangeReviewSummaryItem[],
): FileReviewSummaryTextPart[] {
  return items.map((item) =>
    item.type === "phase"
      ? {
          labelKey: "agentChat.harness.fileReview.phaseCount",
          valueLabelKey: resolveFileReviewPhaseLabelKey(item.phase),
          count: item.count,
        }
      : {
          labelKey: "agentChat.harness.fileReview.actionCount",
          valueLabelKey: resolveFileReviewActionLabelKey(item.action),
          count: item.count,
        },
  );
}

export function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || path;
}

export function describeAction(action: HarnessFileAction): string {
  switch (action) {
    case "read":
      return "读取";
    case "write":
      return "写入";
    case "edit":
      return "编辑";
    case "offload":
      return "转存";
    case "persist":
      return "落盘";
    default:
      return action;
  }
}

export function describeKind(kind: HarnessFileKind): string {
  switch (kind) {
    case "document":
      return "文档";
    case "code":
      return "代码";
    case "log":
      return "日志";
    case "artifact":
      return "产物";
    case "offload":
      return "转存";
    default:
      return "文件";
  }
}

export function summarizeFileActions(
  events: HarnessSessionState["recentFileEvents"],
): string {
  const counts = new Map<HarnessFileAction, number>();

  for (const event of events) {
    counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([action, count]) => `${describeAction(action)} ${count}`)
    .join(" · ");
}

export function buildFileFilterOptions(
  recentFileEvents: HarnessSessionState["recentFileEvents"],
): HarnessFileFilterOption[] {
  return [
    { value: "all" as const, label: "全部" },
    { value: "document" as const, label: "文档" },
    { value: "code" as const, label: "代码" },
    { value: "log" as const, label: "日志" },
    { value: "artifact" as const, label: "产物" },
    { value: "offload" as const, label: "转存" },
    { value: "other" as const, label: "其他" },
  ].filter(
    (option) =>
      option.value === "all" ||
      recentFileEvents.some((event) => event.kind === option.value),
  );
}

export function buildFilteredFileEvents(
  recentFileEvents: HarnessSessionState["recentFileEvents"],
  fileFilter: HarnessFileFilterValue,
): HarnessSessionState["recentFileEvents"] {
  return recentFileEvents.filter(
    (event) => fileFilter === "all" || event.kind === fileFilter,
  );
}

export function groupHarnessFileEvents(
  fileEvents: HarnessSessionState["recentFileEvents"],
): HarnessGroupedFileEvent[] {
  const groups = new Map<string, Omit<HarnessGroupedFileEvent, "actionSummary">>();

  for (const event of fileEvents) {
    const key = event.path.trim() || event.id;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        path: event.path,
        displayName: event.displayName,
        kind: event.kind,
        latestEvent: event,
        count: 1,
        events: [event],
      });
      continue;
    }

    existing.events.push(event);
    existing.count += 1;

    const currentTime = existing.latestEvent.timestamp?.getTime() ?? 0;
    const nextTime = event.timestamp?.getTime() ?? 0;
    if (nextTime >= currentTime) {
      existing.latestEvent = event;
      existing.displayName = event.displayName;
      existing.kind = event.kind;
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      actionSummary: summarizeFileActions(group.events),
    }))
    .sort((left, right) => {
      const leftTime = left.latestEvent.timestamp?.getTime() ?? 0;
      const rightTime = right.latestEvent.timestamp?.getTime() ?? 0;
      return rightTime - leftTime;
    });
}

export function summarizeFileReviewActions(
  events: HarnessSessionState["recentFileEvents"],
  activeWrite?: HarnessActiveFileWrite,
): FileChangeReviewSummaryItem[] {
  const items: FileChangeReviewSummaryItem[] = [];

  if (activeWrite) {
    items.push({
      type: "phase",
      phase: activeWrite.phase,
      count: 1,
    });
  }

  const counts = new Map<HarnessFileAction, number>();
  for (const event of events) {
    counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
  }

  for (const [action, count] of counts.entries()) {
    items.push({
      type: "action",
      action,
      count,
    });
  }

  return items;
}

export function isReviewableFileEvent(
  event: HarnessSessionState["recentFileEvents"][number],
): boolean {
  if (!event.path.trim()) {
    return false;
  }
  if (event.action === "write" || event.action === "edit") {
    return true;
  }
  if (event.action !== "persist") {
    return false;
  }
  return event.kind !== "log" && event.kind !== "offload";
}

export function buildFileChangeReviewEntries(params: {
  activeFileWrites: HarnessActiveFileWrite[];
  recentFileEvents: HarnessSessionState["recentFileEvents"];
  decisions: Record<string, FileChangeDecisionStatus>;
}): FileChangeReviewEntry[] {
  const entries = new Map<string, FileChangeReviewEntry>();

  for (const write of params.activeFileWrites) {
    const path = write.path.trim();
    if (!path) {
      continue;
    }
    const key = path;
    entries.set(key, {
      key,
      path,
      displayName: write.displayName || getFileName(path),
      kind: resolveFileKind(path, "artifact"),
      latestAction: "write",
      activeWrite: write,
      count: 1,
      events: [],
      actionSummaryItems: summarizeFileReviewActions([], write),
      preview: write.preview || write.latestChunk,
      content: write.content,
      timestamp: write.updatedAt,
      status: params.decisions[key] || "pending",
    });
  }

  for (const event of params.recentFileEvents) {
    if (!isReviewableFileEvent(event)) {
      continue;
    }

    const key = event.path.trim();
    const existing = entries.get(key);
    const eventTime = event.timestamp?.getTime() ?? 0;
    const existingTime = existing?.timestamp?.getTime() ?? 0;
    if (!existing) {
      entries.set(key, {
        key,
        path: event.path,
        displayName: event.displayName,
        kind: event.kind,
        latestAction: event.action,
        latestEvent: event,
        count: 1,
        events: [event],
        actionSummaryItems: summarizeFileReviewActions([event]),
        preview: event.preview,
        content: event.content,
        timestamp: event.timestamp,
        status: params.decisions[key] || "pending",
      });
      continue;
    }

    const events = [...existing.events, event];
    entries.set(key, {
      ...existing,
      displayName:
        eventTime >= existingTime ? event.displayName : existing.displayName,
      kind: eventTime >= existingTime ? event.kind : existing.kind,
      latestAction:
        eventTime >= existingTime ? event.action : existing.latestAction,
      latestEvent: eventTime >= existingTime ? event : existing.latestEvent,
      count: events.length + (existing.activeWrite ? 1 : 0),
      events,
      actionSummaryItems: summarizeFileReviewActions(
        events,
        existing.activeWrite,
      ),
      preview: event.preview || existing.preview,
      content: event.content || existing.content,
      timestamp:
        eventTime >= existingTime ? event.timestamp : existing.timestamp,
      status: params.decisions[key] || "pending",
    });
  }

  return Array.from(entries.values()).sort((left, right) => {
    const leftTime = left.timestamp?.getTime() ?? 0;
    const rightTime = right.timestamp?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

export function countFileChangeStatuses(
  entries: FileChangeReviewEntry[],
): Record<FileChangeDecisionStatus, number> {
  return entries.reduce(
    (result, entry) => ({
      ...result,
      [entry.status]: result[entry.status] + 1,
    }),
    { pending: 0, applied: 0, rejected: 0 },
  );
}
