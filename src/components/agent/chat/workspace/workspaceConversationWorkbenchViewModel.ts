import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeView,
  CanvasWorkbenchHeaderView,
} from "../components/CanvasWorkbenchLayout";
import { extractFileNameFromPath } from "./workspacePath";

export function resolvePathLeaf(value?: string | null): string {
  const normalized = (value || "").trim().replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || normalized;
}

export function buildWorkspaceHeaderView({
  projectRootPath,
  workspacePathMissing,
  workspaceHealthError,
}: {
  projectRootPath?: string | null;
  workspacePathMissing?: boolean | null;
  workspaceHealthError?: boolean | null;
}): CanvasWorkbenchHeaderView {
  const workspaceRootLabel = resolvePathLeaf(projectRootPath) || "未绑定";
  const hasProjectRootPath = Boolean(projectRootPath?.trim());
  const workspaceBindingValue = workspacePathMissing
    ? "路径缺失"
    : workspaceHealthError
      ? "状态异常"
      : hasProjectRootPath
        ? "已连接"
        : "未绑定";

  return {
    eyebrow: "Project Workspace",
    tabLabel: "文件",
    tabBadge:
      workspacePathMissing || workspaceHealthError
        ? workspaceBindingValue
        : hasProjectRootPath
          ? workspaceRootLabel
          : undefined,
    tabBadgeTone:
      workspacePathMissing || workspaceHealthError
        ? "rose"
        : hasProjectRootPath
          ? "sky"
          : undefined,
    title: hasProjectRootPath ? "项目工作区文件" : "当前没有可浏览的项目文件",
    subtitle: hasProjectRootPath
      ? projectRootPath || ""
      : "绑定工作区目录后，这里会显示真实文件树。",
    badges: [
      {
        key: "workspace-root",
        label: hasProjectRootPath ? workspaceRootLabel : "未绑定工作区",
        tone: hasProjectRootPath ? "accent" : "default",
      },
      ...(workspacePathMissing
        ? [
            {
              key: "workspace-missing",
              label: "路径缺失",
              tone: "default" as const,
            },
          ]
        : workspaceHealthError
          ? [
              {
                key: "workspace-health-error",
                label: "状态异常",
                tone: "default" as const,
              },
            ]
          : []),
    ],
    summaryStats: [
      {
        key: "workspace-root",
        label: "工作区",
        value: workspaceRootLabel,
        detail: projectRootPath?.trim() || "绑定工作区后，这里会展示真实文件树。",
        tone: hasProjectRootPath ? "accent" : "default",
      },
      {
        key: "workspace-binding",
        label: "目录状态",
        value: workspaceBindingValue,
        detail: workspacePathMissing
          ? "当前工作区路径缺失，需重新选择目录。"
          : workspaceHealthError
            ? "当前工作区状态异常，建议先修复后再继续浏览。"
            : hasProjectRootPath
              ? "画布会直接读取项目里的真实文件。"
              : "尚未绑定工作区目录。",
        tone:
          workspacePathMissing || workspaceHealthError ? "default" : "success",
      },
    ],
    panelCopy: {
      unavailableText: "当前工作区路径不可用，暂时无法浏览项目文件。",
      emptyText: "当前会话没有绑定可浏览的工作区目录。",
      sectionEyebrow: "项目目录",
      loadingText: "正在加载目录...",
      emptyDirectoryText: "暂无目录内容。",
    },
  };
}

function normalizeChangePath(value: string): string {
  return value.replace(/\\/g, "/").trim().toLowerCase();
}

function readMetadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMetadataText(
  metadata: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readMetadataRecordValue(
  metadata: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = readMetadataRecord(metadata?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readMetadataVersionNo(
  metadata: Record<string, unknown> | null,
): number | undefined {
  const versionRecord = readMetadataRecordValue(metadata, [
    "artifactVersion",
    "artifact_version",
  ]);
  const rawValue =
    metadata?.artifactVersionNo ??
    metadata?.artifact_version_no ??
    metadata?.versionNo ??
    metadata?.version_no ??
    versionRecord?.versionNo ??
    versionRecord?.version_no;
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === "string" && rawValue.trim()) {
    const parsed = Number(rawValue.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function buildFileArtifactChangeItem(
  item: Extract<AgentThreadItem, { type: "file_artifact" }>,
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null,
): CanvasWorkbenchChangeItem | null {
  const path = item.path.trim();
  if (!path) {
    return null;
  }

  const metadata = readMetadataRecord(item.metadata);
  const versionRecord = readMetadataRecordValue(metadata, [
    "artifactVersion",
    "artifact_version",
  ]);
  const preview =
    readMetadataText(metadata, [
      "previewText",
      "preview_text",
      "artifactSummary",
      "artifact_summary",
      "summary",
    ]) || item.content;
  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const metadataCheckpointPath =
    readMetadataText(metadata, ["snapshotPath", "snapshot_path"]) ||
    readMetadataText(versionRecord, ["snapshotPath", "snapshot_path"]);
  const checkpointMatches =
    latestCheckpoint?.path &&
    normalizeChangePath(latestCheckpoint.path) === normalizeChangePath(path);
  const versionNo = readMetadataVersionNo(metadata);

  return {
    id: item.id,
    path,
    displayName:
      readMetadataText(metadata, [
        "artifactTitle",
        "artifact_title",
        "title",
        "fileName",
        "filename",
      ]) || extractFileNameFromPath(path),
    source: item.source,
    status: item.status,
    preview,
    currentContent: item.content || preview || null,
    previousContent: null,
    checkpointPath: checkpointMatches
      ? latestCheckpoint.path
      : metadataCheckpointPath || null,
    checkpointLabel:
      (checkpointMatches && latestCheckpoint.version_no) || versionNo
        ? `v${latestCheckpoint?.version_no || versionNo}`
        : null,
  };
}

function upsertChangeItem(
  byPath: Map<string, CanvasWorkbenchChangeItem>,
  item: CanvasWorkbenchChangeItem | null,
) {
  if (!item) {
    return;
  }
  const key = normalizeChangePath(item.path);
  const previous = byPath.get(key);
  if (!previous) {
    byPath.set(key, item);
    return;
  }

  byPath.set(key, {
    ...previous,
    ...item,
    id: previous.id,
    currentContent: item.currentContent || previous.currentContent,
    previousContent: item.previousContent ?? previous.previousContent,
    preview: item.preview || previous.preview,
    source: item.source || previous.source,
    absolutePath: item.absolutePath || previous.absolutePath,
    status:
      previous.status === "in_progress" || item.status === "in_progress"
        ? "in_progress"
        : previous.status === "failed" || item.status === "failed"
          ? "failed"
          : item.status || previous.status,
    checkpointPath: item.checkpointPath || previous.checkpointPath,
    checkpointLabel: item.checkpointLabel || previous.checkpointLabel,
  });
}

export function buildCanvasWorkbenchChangeView({
  threadItems,
  fileCheckpointSummary,
  onOpenFile,
}: {
  threadItems: AgentThreadItem[];
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  onOpenFile?: (path: string) => void | Promise<void>;
}): CanvasWorkbenchChangeView | null {
  const byPath = new Map<string, CanvasWorkbenchChangeItem>();

  threadItems
    .filter(
      (item): item is Extract<AgentThreadItem, { type: "file_artifact" }> =>
        item.type === "file_artifact",
    )
    .forEach((item) => {
      upsertChangeItem(
        byPath,
        buildFileArtifactChangeItem(item, fileCheckpointSummary),
      );
    });

  const items = [...byPath.values()];
  if (items.length === 0 && !(fileCheckpointSummary?.count ?? 0)) {
    return null;
  }

  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const latestCheckpointPath =
    latestCheckpoint?.snapshot_path || latestCheckpoint?.path || null;

  return {
    items,
    checkpointCount: fileCheckpointSummary?.count ?? 0,
    latestCheckpointPath,
    onOpenFile,
  };
}
