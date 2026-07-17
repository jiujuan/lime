import { useCallback, useMemo } from "react";

import {
  readAgentRuntimeTimelineArtifactContent,
  type AgentRuntimeTimelineArtifactContent,
} from "@/lib/api/agentRuntime/appServerArtifactClient";
import type {
  FileChangeDiffLine,
  FileChangeKind,
  FileChangesAggregate,
  FileChangeSummary,
} from "../utils/fileChangeSummary";
import type { AgentThreadItem } from "../types";
import {
  resolveTimelineArtifactNavigation,
  type ArtifactTimelineOpenTarget,
} from "../utils/artifactTimelineNavigation";
import { FileChangesSummaryCard } from "./FileChangesSummaryCard";

type FileArtifactItem = Extract<AgentThreadItem, { type: "file_artifact" }>;

interface AgentThreadTimelineFileChangesCardProps {
  items: FileArtifactItem[];
  onFileClick?: (fileName: string, content: string) => void;
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void;
  readTimelineArtifactContent?: (
    item: FileArtifactItem,
  ) => Promise<AgentRuntimeTimelineArtifactContent | null>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readNumber(
  record: Record<string, unknown> | null,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function resolveFileChangeRecord(
  item: FileArtifactItem,
): Record<string, unknown> | null {
  const metadata = asRecord(item.metadata);
  return asRecord(metadata?.file_change) || asRecord(metadata?.fileChange);
}

// eslint-disable-next-line react-refresh/only-export-components
export function hasTimelineFileChangeEvidence(
  item: AgentThreadItem,
): item is FileArtifactItem {
  return (
    item.type === "file_artifact" && Boolean(resolveFileChangeRecord(item))
  );
}

function normalizeFileChangeKind(value: unknown): FileChangeKind {
  if (value === "add" || value === "delete" || value === "update") {
    return value;
  }
  if (value === "added") {
    return "add";
  }
  if (value === "deleted") {
    return "delete";
  }
  return "update";
}

function normalizeDiffLine(value: unknown): FileChangeDiffLine | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const kind = record.kind;
  if (kind !== "context" && kind !== "add" && kind !== "remove") {
    return null;
  }
  const text =
    typeof record.value === "string"
      ? record.value
      : typeof record.text === "string"
        ? record.text
        : "";
  const oldLine = readNumber(record, ["old_line", "oldLine"]);
  const newLine = readNumber(record, ["new_line", "newLine"]);
  return {
    kind,
    value: text,
    ...(oldLine !== null ? { oldLine } : {}),
    ...(newLine !== null ? { newLine } : {}),
  };
}

function resolveDiffLines(
  fileChange: Record<string, unknown> | null,
): FileChangeDiffLine[] {
  const diff = fileChange?.diff;
  if (!Array.isArray(diff)) {
    return [];
  }
  return diff
    .map(normalizeDiffLine)
    .filter((line): line is FileChangeDiffLine => Boolean(line));
}

function countDiffLines(diff: FileChangeDiffLine[]): {
  added: number;
  removed: number;
} {
  return diff.reduce(
    (stats, line) => {
      if (line.kind === "add") {
        stats.added += 1;
      } else if (line.kind === "remove") {
        stats.removed += 1;
      }
      return stats;
    },
    { added: 0, removed: 0 },
  );
}

function buildFileChangeSummary(item: FileArtifactItem): FileChangeSummary {
  const fileChange = resolveFileChangeRecord(item);
  const diff = resolveDiffLines(fileChange);
  const counted = countDiffLines(diff);
  const path =
    readString(fileChange, ["path", "filePath", "file_path"]) || item.path;
  const linesAdded =
    readNumber(fileChange, [
      "lines_added",
      "linesAdded",
      "additions",
      "addedCount",
    ]) ?? counted.added;
  const linesRemoved =
    readNumber(fileChange, [
      "lines_removed",
      "linesRemoved",
      "deletions",
      "removedCount",
    ]) ?? counted.removed;

  return {
    path,
    kind: normalizeFileChangeKind(fileChange?.kind),
    linesAdded,
    linesRemoved,
    diff,
    truncated: fileChange?.truncated === true,
    source: fileChange ? "backend" : "approx",
    status: item.status === "failed" ? "failed" : "completed",
  };
}

function buildAggregate(items: FileArtifactItem[]): FileChangesAggregate {
  const files = items.map(buildFileChangeSummary);
  return {
    files,
    totalAdded: files.reduce((total, file) => total + file.linesAdded, 0),
    totalRemoved: files.reduce((total, file) => total + file.linesRemoved, 0),
    fileCount: files.length,
  };
}

export function AgentThreadTimelineFileChangesCard({
  items,
  onFileClick,
  onOpenArtifactFromTimeline,
  readTimelineArtifactContent = readAgentRuntimeTimelineArtifactContent,
}: AgentThreadTimelineFileChangesCardProps) {
  const aggregate = useMemo(() => buildAggregate(items), [items]);
  const itemByPath = useMemo(() => {
    const entries = new Map<string, FileArtifactItem>();
    for (const item of items) {
      const summary = buildFileChangeSummary(item);
      entries.set(summary.path, item);
      entries.set(item.path, item);
    }
    return entries;
  }, [items]);

  const openTimelineItem = useCallback(
    (item: FileArtifactItem) => {
      void (async () => {
        const navigation = resolveTimelineArtifactNavigation(item);
        const baseTarget = navigation?.rootTarget ?? {
          filePath: item.path,
          content: item.content || "",
          timelineItemId: item.id,
          openMode: "file_preview" as const,
        };
        let target = baseTarget;

        if (!target.content.trim()) {
          const artifactContent = await readTimelineArtifactContent(item).catch(
            () => null,
          );
          if (artifactContent?.content.trim()) {
            target = {
              ...target,
              artifactId: artifactContent.artifactId || target.artifactId,
              content: artifactContent.content,
              filePath: artifactContent.filePath || target.filePath,
            };
          }
        }

        if (onOpenArtifactFromTimeline) {
          onOpenArtifactFromTimeline(target);
          return;
        }

        onFileClick?.(target.filePath, target.content);
      })();
    },
    [onFileClick, onOpenArtifactFromTimeline, readTimelineArtifactContent],
  );

  return (
    <div className="py-1.5" data-testid="timeline-file-artifact-group">
      <FileChangesSummaryCard
        aggregate={aggregate}
        onOpenFile={(file) => {
          const item = itemByPath.get(file.path);
          if (item) {
            openTimelineItem(item);
          }
        }}
      />
    </div>
  );
}
