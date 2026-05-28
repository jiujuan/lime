import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitCompare,
  ListChecks,
  Loader2,
  Monitor,
  RefreshCw,
  TerminalSquare,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import { Badge } from "@/components/ui/badge";
import { listDirectory, type DirectoryListing } from "@/lib/api/fileBrowser";
import type { Artifact } from "@/lib/artifact/types";
import type { CanvasStateUnion } from "@/lib/workspace/workbenchCanvas";
import type { DocumentVersion } from "@/lib/workspace/workbenchCanvas";
import type { TaskFile } from "./TaskFiles";
import type { HarnessFilePreviewResult } from "./HarnessStatusPanel";
import {
  buildArtifactFromWrite,
  formatArtifactWritePhaseLabel,
  resolveArtifactPreviewText,
  resolveArtifactWritePhase,
} from "../utils/messageArtifacts";
import { resolveContentPostArtifactDisplayTitle } from "../utils/contentPostSkill";
import {
  buildCanvasWorkbenchDiff,
  type CanvasWorkbenchDiffLine,
} from "../utils/canvasWorkbenchDiff";
import {
  extractFileNameFromPath,
  normalizeManagedWorkspacePathForDisplay,
  resolveAbsoluteWorkspacePath,
} from "../workspace/workspacePath";
import { filterWorkspaceDirectoryListing } from "../workspace/workspaceTreeVisibility";
import {
  ArtifactWorkbenchDocumentInspector,
  type ArtifactWorkbenchDocumentController,
} from "../workspace/artifactWorkbenchDocument";

export type CanvasWorkbenchTab =
  | "preview"
  | "session"
  | "workspace"
  | "changes"
  | "outputs"
  | "logs"
  | "team"
  | `document:${string}`;
export interface CanvasWorkbenchUtilityLeadContext {
  openTab: (tab: CanvasWorkbenchTab) => void;
}
export type CanvasWorkbenchUtilityLeadContent =
  | ReactNode
  | ((context: CanvasWorkbenchUtilityLeadContext) => ReactNode);
type CanvasWorkbenchDocumentViewMode = "preview" | "changes";
export type CanvasWorkbenchLayoutMode = "split" | "stacked";
export type CanvasWorkbenchMode = "default" | "coding";

interface CanvasWorkbenchEntryBase {
  key: string;
  title: string;
  subtitle?: string;
  filePath?: string;
  absolutePath?: string;
  previewText?: string;
  createdAt?: number;
  isCurrent?: boolean;
  badgeLabel?: string;
  kindLabel: string;
}

interface CanvasWorkbenchArtifactEntry extends CanvasWorkbenchEntryBase {
  source: "artifact";
  artifact: Artifact;
}

interface CanvasWorkbenchDocumentVersionEntry extends CanvasWorkbenchEntryBase {
  source: "document-version";
  version: DocumentVersion;
}

interface CanvasWorkbenchTaskFileEntry extends CanvasWorkbenchEntryBase {
  source: "task-file";
  taskFile: TaskFile;
}

type CanvasWorkbenchEntry =
  | CanvasWorkbenchArtifactEntry
  | CanvasWorkbenchDocumentVersionEntry
  | CanvasWorkbenchTaskFileEntry;

export interface CanvasWorkbenchDefaultPreview {
  selectionKey?: string | null;
  title: string;
  content: string;
  filePath?: string;
  absolutePath?: string;
  previousContent?: string | null;
}

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface CanvasWorkbenchCopy {
  kind: {
    artifact: string;
    currentDraft: string;
    currentVersion: string;
    defaultDraft: string;
    taskDocument: string;
    taskFile: string;
    version: string;
    versionTitle: (count: number) => string;
    workspaceFile: string;
  };
  tab: {
    files: string;
    generated: string;
    sessionMain: string;
  };
  workspaceFile: {
    binaryUnsupported: string;
    readFailed: string;
  };
}

export type CanvasWorkbenchHeaderBadgeTone = "default" | "accent" | "success";

export interface CanvasWorkbenchHeaderBadge {
  key: string;
  label: string;
  tone?: CanvasWorkbenchHeaderBadgeTone;
}

export interface CanvasWorkbenchSummaryStat {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone?: CanvasWorkbenchHeaderBadgeTone;
}

export interface CanvasWorkbenchPanelCopy {
  introText?: string;
  emptyText?: string;
  unavailableText?: string;
  sectionEyebrow?: string;
  loadingText?: string;
  emptyDirectoryText?: string;
}

export interface CanvasWorkbenchHeaderView {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  badges?: CanvasWorkbenchHeaderBadge[];
  summaryStats?: CanvasWorkbenchSummaryStat[];
  tabLabel?: string;
  tabBadge?: string;
  tabBadgeTone?: "slate" | "sky" | "rose";
  panelCopy?: CanvasWorkbenchPanelCopy;
}

export type CanvasWorkbenchPreviewTarget =
  | {
      kind: "default-canvas";
      title: string;
      content: string;
      filePath?: string;
      absolutePath?: string;
    }
  | {
      kind: "artifact";
      title: string;
      artifact: Artifact;
      filePath?: string;
      absolutePath?: string;
    }
  | {
      kind: "synthetic-artifact";
      title: string;
      artifact: Artifact;
      filePath?: string;
      absolutePath?: string;
    }
  | {
      kind: "loading";
      title: string;
      filePath?: string;
      absolutePath?: string;
    }
  | {
      kind: "unsupported";
      title: string;
      reason: string;
      filePath?: string;
      absolutePath?: string;
    }
  | {
      kind: "empty";
      title: string;
    }
  | {
      kind: "team-workbench";
      title: string;
    };

export interface CanvasWorkbenchTeamView extends CanvasWorkbenchHeaderView {
  enabled: boolean;
  autoFocusToken?: string | number | null;
  preferFullscreenPreview?: boolean;
  preferFixedPanel?: boolean;
  triggerState?: {
    tone: "idle" | "active" | "error";
    label?: string | null;
  } | null;
  renderPreview: (options?: {
    stackedWorkbenchTrigger?: ReactNode;
  }) => ReactNode;
  renderPanel?: () => ReactNode;
  renderFooter?: () => ReactNode;
}

export interface CanvasWorkbenchSessionView extends CanvasWorkbenchHeaderView {
  renderPanel: () => ReactNode;
}

export interface CanvasWorkbenchUtilityView extends CanvasWorkbenchHeaderView {
  enabled?: boolean;
  leadContent?: CanvasWorkbenchUtilityLeadContent;
  renderPanel: () => ReactNode;
}

export interface CanvasWorkbenchChangeItem {
  id: string;
  path: string;
  absolutePath?: string | null;
  displayName?: string;
  source?: string;
  status?: "in_progress" | "completed" | "failed";
  reviewStatus?: "pending_review" | "applied" | "rejected";
  preview?: string;
  currentContent?: string | null;
  previousContent?: string | null;
  checkpointPath?: string | null;
  checkpointLabel?: string | null;
}

export interface CanvasWorkbenchChangeView {
  items: CanvasWorkbenchChangeItem[];
  checkpointCount?: number;
  latestCheckpointPath?: string | null;
  onOpenFile?: (path: string) => void | Promise<void>;
}

interface WorkspaceFileSelection {
  path: string;
  title: string;
  status: "loading" | "ready" | "error" | "binary";
  content?: string;
  error?: string | null;
  size?: number;
}

interface CanvasWorkbenchResolvedSelection {
  selectionKey: string | null;
  entrySource:
    | CanvasWorkbenchEntry["source"]
    | "workspace-file"
    | "default-preview";
  title: string;
  tabLabel: string;
  subtitle?: string;
  kindLabel: string;
  badgeLabel?: string;
  target: CanvasWorkbenchPreviewTarget;
  content: string;
  previousContent: string | null;
  selectionPath?: string;
}

export interface CanvasWorkbenchLayoutProps {
  artifacts: Artifact[];
  canvasState: CanvasStateUnion | null;
  taskFiles: TaskFile[];
  selectedFileId?: string;
  workspaceRoot?: string | null;
  workspaceUnavailable?: boolean;
  defaultPreview: CanvasWorkbenchDefaultPreview | null;
  loadFilePreview: (path: string) => Promise<HarnessFilePreviewResult>;
  onOpenPath: (path: string) => Promise<void>;
  onRevealPath: (path: string) => Promise<void>;
  renderPreview: (
    target: CanvasWorkbenchPreviewTarget,
    options?: {
      stackedWorkbenchTrigger?: ReactNode;
      onArtifactDocumentControllerChange?: (
        controller: ArtifactWorkbenchDocumentController | null,
      ) => void;
    },
  ) => ReactNode;
  onClose?: () => void;
  onLayoutModeChange?: (mode: CanvasWorkbenchLayoutMode) => void;
  workbenchMode?: CanvasWorkbenchMode;
  workspaceView?: CanvasWorkbenchHeaderView | null;
  teamView?: CanvasWorkbenchTeamView | null;
  sessionView?: CanvasWorkbenchSessionView | null;
  outputView?: CanvasWorkbenchUtilityView | null;
  logView?: CanvasWorkbenchUtilityView | null;
  changeView?: CanvasWorkbenchChangeView | null;
}

const WORKBENCH_SHELL_CLASSNAME =
  "rounded-[28px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] shadow-sm shadow-slate-950/5";

const WORKBENCH_PANEL_CLASSNAME =
  "rounded-[24px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] shadow-sm shadow-slate-950/5";

const WORKBENCH_MUTED_PANEL_CLASSNAME =
  "rounded-[24px] border border-dashed border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-6 text-sm text-[color:var(--lime-text-muted)]";

const WORKBENCH_BUTTON_CLASSNAME =
  "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] text-[color:var(--lime-text)] hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface)] hover:text-[color:var(--lime-text-strong)]";

const WORKBENCH_ACTIVE_BUTTON_CLASSNAME =
  "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-strong)] shadow-sm shadow-slate-950/5";

const WORKBENCH_GHOST_BUTTON_CLASSNAME =
  "border-[color:var(--lime-surface-border)] text-[color:var(--lime-text-muted)] hover:bg-[color:var(--lime-surface-soft)] hover:text-[color:var(--lime-text-strong)]";

const STACKED_LAYOUT_BREAKPOINT = 1040;

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function resolveWorkspaceRelativeDisplayPath(
  workspaceRoot: string | null | undefined,
  path: string | null | undefined,
): string | undefined {
  const normalizedPath = normalizePath(path?.trim() || "");
  if (!normalizedPath) {
    return undefined;
  }

  const normalizedRoot = normalizePath(workspaceRoot?.trim() || "");
  if (!normalizedRoot) {
    return normalizedPath;
  }

  if (normalizedPath === normalizedRoot) {
    return extractFileNameFromPath(normalizedPath);
  }

  const prefix = `${normalizedRoot}/`;
  if (normalizedPath.startsWith(prefix)) {
    return normalizedPath.slice(prefix.length);
  }

  return normalizedPath;
}

function resolveWorkspaceRelativePath(
  workspaceRoot: string | null | undefined,
  path: string | null | undefined,
): string | null {
  const normalizedPath = normalizePath(path?.trim() || "");
  if (!normalizedPath) {
    return null;
  }

  const normalizedRoot = normalizePath(workspaceRoot?.trim() || "");
  if (!normalizedRoot) {
    return normalizedPath;
  }

  if (normalizedPath === normalizedRoot) {
    return "";
  }

  const prefix = `${normalizedRoot}/`;
  if (normalizedPath.startsWith(prefix)) {
    return normalizedPath.slice(prefix.length);
  }

  if (!/^(\/|[A-Za-z]:\/|\\\\)/.test(normalizedPath)) {
    return normalizedPath;
  }

  return null;
}

function resolveSavedContentBundleRoot(
  workspaceRoot: string | null | undefined,
  selectionPath: string | null | undefined,
): string | null {
  const relativePath = resolveWorkspaceRelativePath(
    workspaceRoot,
    selectionPath,
  );
  if (!relativePath) {
    return null;
  }

  const match = relativePath.match(/^(exports\/[^/]+\/[^/]+)/);
  if (!match?.[1]) {
    return null;
  }

  return resolveAbsoluteWorkspacePath(workspaceRoot, match[1]) || null;
}

function resolveWorkspacePanelDisplayPath(
  workspaceRoot: string | null | undefined,
  panelRootPath: string | null | undefined,
): string | undefined {
  const normalizedPanelRoot = normalizePath(panelRootPath?.trim() || "");
  if (!normalizedPanelRoot) {
    return undefined;
  }

  const normalizedWorkspaceRoot = normalizePath(workspaceRoot?.trim() || "");
  if (
    normalizedWorkspaceRoot &&
    normalizedPanelRoot !== normalizedWorkspaceRoot
  ) {
    return (
      resolveWorkspaceRelativeDisplayPath(workspaceRoot, panelRootPath) ||
      normalizeManagedWorkspacePathForDisplay(normalizedPanelRoot)
    );
  }

  return normalizeManagedWorkspacePathForDisplay(normalizedPanelRoot);
}

function isSavedContentBundleDirectory(
  workspaceRoot: string | null | undefined,
  listingPath: string,
): boolean {
  const relativePath = resolveWorkspaceRelativePath(workspaceRoot, listingPath);
  return Boolean(relativePath?.match(/^exports\/[^/]+\/[^/]+(?:\/.*)?$/));
}

function compareWorkspaceTreeEntryName(left: string, right: string): number {
  return left.localeCompare(right, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortWorkspaceListingEntries(
  entries: DirectoryListing["entries"],
  listingPath: string,
  workspaceRoot: string | null | undefined,
): DirectoryListing["entries"] {
  const isBundleDirectory = isSavedContentBundleDirectory(
    workspaceRoot,
    listingPath,
  );

  const resolveRank = (entry: DirectoryListing["entries"][number]) => {
    const normalizedName = (entry.name || "").trim().toLowerCase();

    if (isBundleDirectory) {
      if (normalizedName === "index.md") {
        return 0;
      }
      if (normalizedName === "agents.md") {
        return 1;
      }
      if (entry.isDir && normalizedName === "skills") {
        return 2;
      }
      if (
        entry.isDir &&
        (normalizedName === "images" || normalizedName === "assets")
      ) {
        return 3;
      }
      if (entry.isDir) {
        return 4;
      }
      if (/\.(md|markdown|mdx)$/i.test(normalizedName)) {
        return 5;
      }
      if (/\.(png|jpe?g|webp|gif|svg)$/i.test(normalizedName)) {
        return 6;
      }
      if (/\.json$/i.test(normalizedName)) {
        return 8;
      }
      return 7;
    }

    if (entry.isDir) {
      return 0;
    }
    if (/\.(md|markdown|mdx)$/i.test(normalizedName)) {
      return 1;
    }
    return 2;
  };

  return [...entries].sort((left, right) => {
    const rankDiff = resolveRank(left) - resolveRank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return compareWorkspaceTreeEntryName(left.name, right.name);
  });
}

function buildSyntheticArtifact(
  id: string,
  filePath: string,
  content: string,
): Artifact {
  return buildArtifactFromWrite({
    filePath,
    content,
    context: {
      artifactId: id,
      status: "complete",
      metadata: {
        previewText: content,
      },
    },
  });
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function resolvePreviousVersionContent(
  version: DocumentVersion,
  versions: DocumentVersion[],
): string | null {
  const parentVersionId = version.metadata?.parentVersionId?.trim();
  if (parentVersionId) {
    const parentVersion = versions.find((item) => item.id === parentVersionId);
    if (parentVersion) {
      return parentVersion.content;
    }
  }

  const currentIndex = versions.findIndex((item) => item.id === version.id);
  if (currentIndex > 0) {
    return versions[currentIndex - 1]?.content || null;
  }

  return null;
}

function resolvePreviousArtifactContent(
  artifact: Artifact,
  artifacts: Artifact[],
): string | null {
  const currentPath = normalizePath(resolveArtifactProtocolFilePath(artifact));

  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    const candidate = artifacts[index];
    if (candidate.id === artifact.id) {
      continue;
    }
    const candidatePath = normalizePath(
      resolveArtifactProtocolFilePath(candidate),
    );
    if (candidatePath === currentPath && candidate.content.trim()) {
      return candidate.content;
    }
  }

  return null;
}

function isDocumentCanvasState(
  state: CanvasStateUnion | null,
): state is Extract<CanvasStateUnion, { type: "document" }> {
  return Boolean(state && state.type === "document");
}

function resolveMappedPreviousContentForPath(
  absolutePath: string,
  canvasState: CanvasStateUnion | null,
  artifacts: Artifact[],
  workspaceRoot?: string | null,
): string | null {
  const normalizedTarget = normalizePath(absolutePath);
  if (isDocumentCanvasState(canvasState)) {
    const matchedVersion = canvasState.versions.find((version) => {
      const versionPath = resolveAbsoluteWorkspacePath(
        workspaceRoot,
        version.metadata?.sourceFileName,
      );
      return versionPath
        ? normalizePath(versionPath) === normalizedTarget
        : false;
    });
    if (matchedVersion) {
      return resolvePreviousVersionContent(
        matchedVersion,
        canvasState.versions,
      );
    }
  }

  const matchedArtifact = artifacts.find((artifact) => {
    const artifactPath = resolveAbsoluteWorkspacePath(
      workspaceRoot,
      resolveArtifactProtocolFilePath(artifact),
    );
    return artifactPath
      ? normalizePath(artifactPath) === normalizedTarget
      : false;
  });

  return matchedArtifact
    ? resolvePreviousArtifactContent(matchedArtifact, artifacts)
    : null;
}

function buildEntries(
  artifacts: Artifact[],
  canvasState: CanvasStateUnion | null,
  taskFiles: TaskFile[],
  copy: CanvasWorkbenchCopy,
  workspaceRoot?: string | null,
): CanvasWorkbenchEntry[] {
  const taskFileEntries: CanvasWorkbenchTaskFileEntry[] = taskFiles
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((taskFile) => ({
      key: `task:${taskFile.id}`,
      source: "task-file" as const,
      taskFile,
      title: resolveContentPostArtifactDisplayTitle({
        title: extractFileNameFromPath(taskFile.name),
        filePath: taskFile.name,
        metadata: taskFile.metadata,
      }),
      subtitle: taskFile.name,
      filePath: taskFile.name,
      absolutePath: resolveAbsoluteWorkspacePath(workspaceRoot, taskFile.name),
      previewText: taskFile.content?.trim().slice(0, 180),
      createdAt: taskFile.updatedAt,
      badgeLabel:
        taskFile.type === "document" ? copy.kind.taskDocument : undefined,
      kindLabel: copy.kind.taskFile,
    }));

  const taskFilePathSet = new Set(
    taskFileEntries
      .map((entry) => normalizePath(entry.absolutePath || entry.filePath || ""))
      .filter(Boolean),
  );
  const seenArtifactPaths = new Set<string>();

  const entries: CanvasWorkbenchEntry[] = artifacts
    .slice()
    .reverse()
    .flatMap((artifact) => {
      const filePath = resolveArtifactProtocolFilePath(artifact);
      const writePhase = resolveArtifactWritePhase(artifact);
      const absolutePath = resolveAbsoluteWorkspacePath(
        workspaceRoot,
        filePath,
      );
      const pathKey = normalizePath(absolutePath || filePath || "");
      if (pathKey) {
        if (taskFilePathSet.has(pathKey) || seenArtifactPaths.has(pathKey)) {
          return [];
        }
        seenArtifactPaths.add(pathKey);
      }

      return [
        {
          key: `artifact:${artifact.id}`,
          source: "artifact",
          artifact,
          title: resolveContentPostArtifactDisplayTitle({
            title: artifact.title,
            filePath,
            metadata: artifact.meta,
          }),
          subtitle: filePath,
          filePath,
          absolutePath,
          previewText: resolveArtifactPreviewText(artifact),
          createdAt: artifact.updatedAt || artifact.createdAt,
          badgeLabel: writePhase
            ? formatArtifactWritePhaseLabel(writePhase)
            : undefined,
          kindLabel: copy.kind.artifact,
        },
      ];
    });

  if (isDocumentCanvasState(canvasState)) {
    entries.push(
      ...canvasState.versions
        .slice()
        .reverse()
        .map((version, index) => ({
          key: `version:${version.id}`,
          source: "document-version" as const,
          version,
          title:
            version.description?.trim() ||
            copy.kind.versionTitle(canvasState.versions.length - index),
          subtitle: version.metadata?.sourceFileName || copy.kind.currentDraft,
          filePath: version.metadata?.sourceFileName,
          absolutePath: resolveAbsoluteWorkspacePath(
            workspaceRoot,
            version.metadata?.sourceFileName,
          ),
          previewText: version.content.trim().slice(0, 180),
          createdAt: version.createdAt,
          isCurrent: version.id === canvasState.currentVersionId,
          badgeLabel:
            version.id === canvasState.currentVersionId
              ? copy.kind.currentVersion
              : undefined,
          kindLabel: copy.kind.version,
        })),
    );
  }

  entries.push(...taskFileEntries);

  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.key)) {
      return false;
    }
    seen.add(entry.key);
    return true;
  });
}

function renderDiffState(diffLines: CanvasWorkbenchDiffLine[]): ReactNode {
  return (
    <div className={cn("overflow-hidden", WORKBENCH_PANEL_CLASSNAME)}>
      <div className="max-h-[28rem] overflow-auto">
        {diffLines.map((line, index) => (
          <div
            key={`${line.type}-${index}`}
            className={cn(
              "grid grid-cols-[20px_1fr] gap-3 px-3 py-2 font-mono text-[12px] leading-6",
              line.type === "add" && "bg-emerald-50 text-emerald-900",
              line.type === "remove" && "bg-rose-50 text-rose-900",
              line.type === "context" && "text-slate-500",
            )}
          >
            <span className="select-none text-center">
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <span className="whitespace-pre-wrap break-all">
              {line.value || " "}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDocumentTabKey(selectionKey: string): `document:${string}` {
  return `document:${selectionKey}`;
}

function isDocumentTabKey(
  value: CanvasWorkbenchTab | string,
): value is `document:${string}` {
  return value.startsWith("document:");
}

function parseDocumentTabKey(tabKey: `document:${string}` | string): string {
  return tabKey.replace(/^document:/, "");
}

function isHtmlPreviewContext(
  context: CanvasWorkbenchResolvedSelection | null | undefined,
): boolean {
  const path = (
    context?.selectionPath ||
    context?.subtitle ||
    context?.title ||
    ""
  )
    .trim()
    .toLowerCase();
  return /\.(html|htm)$/.test(path);
}

function resolveCodingPreviewTabLabel(
  context: CanvasWorkbenchResolvedSelection | null | undefined,
  fallback: string,
): string {
  const label = context?.tabLabel?.trim() || context?.title?.trim();
  return label ? `${fallback} · ${label}` : fallback;
}

function isPendingChangeItem(item: CanvasWorkbenchChangeItem): boolean {
  return item.status === "in_progress";
}

function resolveChangeItemDisplayName(item: CanvasWorkbenchChangeItem): string {
  return item.displayName?.trim() || extractFileNameFromPath(item.path);
}

function normalizeChangeItemPathForMatch(value: string | null | undefined) {
  return normalizePath(value || "")
    .trim()
    .toLowerCase();
}

function findChangeItemForSelection(
  items: CanvasWorkbenchChangeItem[],
  context: CanvasWorkbenchResolvedSelection | null,
): CanvasWorkbenchChangeItem | null {
  if (!context) {
    return null;
  }

  const selectionCandidates = [
    context.selectionPath,
    resolvePreviewPath(context.target),
    context.subtitle,
    context.title,
  ]
    .map(normalizeChangeItemPathForMatch)
    .filter(Boolean);

  return (
    items.find((item) => {
      const itemCandidates = [
        item.path,
        item.absolutePath,
        resolveChangeItemDisplayName(item),
      ]
        .map(normalizeChangeItemPathForMatch)
        .filter(Boolean);

      return itemCandidates.some((candidate) =>
        selectionCandidates.includes(candidate),
      );
    }) || null
  );
}

function resolveChangeStatusCopyKey(item: CanvasWorkbenchChangeItem): string {
  if (item.reviewStatus === "pending_review") {
    return "agentChat.canvasWorkbench.coding.changes.status.pendingReview";
  }
  if (item.reviewStatus === "applied") {
    return "agentChat.canvasWorkbench.coding.changes.status.applied";
  }
  if (item.reviewStatus === "rejected") {
    return "agentChat.canvasWorkbench.coding.changes.status.rejected";
  }
  if (item.status === "failed") {
    return "agentChat.canvasWorkbench.coding.changes.status.failed";
  }
  if (item.status === "in_progress") {
    return "agentChat.canvasWorkbench.coding.changes.status.inProgress";
  }
  return "agentChat.canvasWorkbench.coding.changes.status.completed";
}

function resolveChangeStatusClassName(item: CanvasWorkbenchChangeItem): string {
  if (item.reviewStatus === "pending_review") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (item.reviewStatus === "applied") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (item.reviewStatus === "rejected") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (item.status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (item.status === "in_progress") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (item.status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function resolveChangeStatusIcon(item: CanvasWorkbenchChangeItem): ReactNode {
  if (item.reviewStatus === "pending_review") {
    return <GitCompare className="h-3.5 w-3.5" />;
  }
  if (item.reviewStatus === "applied") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  if (item.reviewStatus === "rejected") {
    return <AlertTriangle className="h-3.5 w-3.5" />;
  }
  if (item.status === "failed") {
    return <AlertTriangle className="h-3.5 w-3.5" />;
  }
  if (item.status === "in_progress") {
    return <Clock3 className="h-3.5 w-3.5" />;
  }
  if (item.status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  return <GitCompare className="h-3.5 w-3.5" />;
}

function canvasWorkbenchText(
  t: CanvasWorkbenchTranslation,
  key: string,
  options?: Record<string, unknown>,
): string {
  return t(key, options);
}

function resolvePreviewContent(target: CanvasWorkbenchPreviewTarget): string {
  if (target.kind === "default-canvas") {
    return target.content;
  }

  if (target.kind === "artifact" || target.kind === "synthetic-artifact") {
    return target.artifact.content;
  }

  return "";
}

function resolvePreviewPath(
  target: CanvasWorkbenchPreviewTarget,
): string | undefined {
  if (
    target.kind === "default-canvas" ||
    target.kind === "artifact" ||
    target.kind === "synthetic-artifact" ||
    target.kind === "loading" ||
    target.kind === "unsupported"
  ) {
    return target.absolutePath || target.filePath;
  }

  return undefined;
}

function buildDefaultPreviewSelection(
  defaultPreview: CanvasWorkbenchDefaultPreview,
  copy: CanvasWorkbenchCopy,
): CanvasWorkbenchResolvedSelection {
  const target: CanvasWorkbenchPreviewTarget = {
    kind: "default-canvas",
    title: defaultPreview.title,
    content: defaultPreview.content,
    filePath: defaultPreview.filePath,
    absolutePath: defaultPreview.absolutePath,
  };
  const fileLabel = extractFileNameFromPath(
    defaultPreview.filePath || defaultPreview.title,
  );

  return {
    selectionKey: defaultPreview.selectionKey || null,
    entrySource: "default-preview",
    title: defaultPreview.title,
    tabLabel: fileLabel || defaultPreview.title,
    subtitle: defaultPreview.filePath,
    kindLabel: copy.kind.defaultDraft,
    target,
    content: defaultPreview.content,
    previousContent: defaultPreview.previousContent || null,
    selectionPath: resolvePreviewPath(target),
  };
}

function resolveSelectionContext({
  selectionKey,
  defaultPreview,
  entryMap,
  workspaceFileSelections,
  canvasState,
  artifacts,
  copy,
  workspaceRoot,
}: {
  selectionKey: string | null;
  defaultPreview: CanvasWorkbenchDefaultPreview | null;
  entryMap: Map<string, CanvasWorkbenchEntry>;
  workspaceFileSelections: Record<string, WorkspaceFileSelection>;
  canvasState: CanvasStateUnion | null;
  artifacts: Artifact[];
  copy: CanvasWorkbenchCopy;
  workspaceRoot?: string | null;
}): CanvasWorkbenchResolvedSelection | null {
  if (
    selectionKey &&
    defaultPreview &&
    selectionKey === defaultPreview.selectionKey &&
    defaultPreview.content.trim()
  ) {
    return buildDefaultPreviewSelection(defaultPreview, copy);
  }

  if (!selectionKey) {
    return defaultPreview
      ? buildDefaultPreviewSelection(defaultPreview, copy)
      : null;
  }

  if (selectionKey.startsWith("workspace-file:")) {
    const rawPath = selectionKey.replace(/^workspace-file:/, "");
    const workspaceFile = workspaceFileSelections[selectionKey] || {
      path: rawPath,
      title: extractFileNameFromPath(rawPath),
      status: "loading" as const,
    };

    let target: CanvasWorkbenchPreviewTarget;
    if (workspaceFile.status === "loading") {
      target = {
        kind: "loading",
        title: workspaceFile.title,
        filePath: workspaceFile.path,
        absolutePath: workspaceFile.path,
      };
    } else if (workspaceFile.status === "binary") {
      target = {
        kind: "unsupported",
        title: workspaceFile.title,
        reason: copy.workspaceFile.binaryUnsupported,
        filePath: workspaceFile.path,
        absolutePath: workspaceFile.path,
      };
    } else if (workspaceFile.status === "error") {
      target = {
        kind: "unsupported",
        title: workspaceFile.title,
        reason: workspaceFile.error || copy.workspaceFile.readFailed,
        filePath: workspaceFile.path,
        absolutePath: workspaceFile.path,
      };
    } else {
      target = {
        kind: "default-canvas",
        title: workspaceFile.title,
        content: workspaceFile.content || "",
        filePath: workspaceFile.path,
        absolutePath: workspaceFile.path,
      };
    }

    const displayPath = resolveWorkspaceRelativeDisplayPath(
      workspaceRoot,
      workspaceFile.path,
    );

    return {
      selectionKey,
      entrySource: "workspace-file",
      title: workspaceFile.title,
      tabLabel:
        extractFileNameFromPath(workspaceFile.path) || workspaceFile.title,
      subtitle: displayPath,
      kindLabel: copy.kind.workspaceFile,
      target,
      content: resolvePreviewContent(target),
      previousContent:
        workspaceFile.status === "ready"
          ? resolveMappedPreviousContentForPath(
              workspaceFile.path,
              canvasState,
              artifacts,
              workspaceRoot,
            )
          : null,
      selectionPath: resolvePreviewPath(target),
    };
  }

  const entry = entryMap.get(selectionKey) || null;
  if (!entry) {
    return defaultPreview
      ? buildDefaultPreviewSelection(defaultPreview, copy)
      : null;
  }

  let target: CanvasWorkbenchPreviewTarget;
  if (entry.source === "artifact") {
    target = {
      kind: "artifact",
      title: entry.title,
      artifact: entry.artifact,
      filePath: entry.filePath,
      absolutePath: entry.absolutePath,
    };
  } else if (entry.source === "document-version") {
    target = {
      kind: "synthetic-artifact",
      title: entry.title,
      artifact: buildSyntheticArtifact(
        `canvas-workbench:version:${entry.version.id}`,
        entry.filePath || `${entry.title}.md`,
        entry.version.content,
      ),
      filePath: entry.filePath,
      absolutePath: entry.absolutePath,
    };
  } else {
    target = {
      kind: "synthetic-artifact",
      title: entry.title,
      artifact: buildSyntheticArtifact(
        `canvas-workbench:task:${entry.taskFile.id}`,
        entry.filePath || entry.title,
        entry.taskFile.content || "",
      ),
      filePath: entry.filePath,
      absolutePath: entry.absolutePath,
    };
  }

  let previousContent: string | null = null;
  if (entry.source === "artifact") {
    previousContent = resolvePreviousArtifactContent(entry.artifact, artifacts);
  } else if (
    entry.source === "document-version" &&
    isDocumentCanvasState(canvasState)
  ) {
    previousContent = resolvePreviousVersionContent(
      entry.version,
      canvasState.versions,
    );
  } else if (entry.absolutePath) {
    previousContent = resolveMappedPreviousContentForPath(
      entry.absolutePath,
      canvasState,
      artifacts,
      workspaceRoot,
    );
  }

  return {
    selectionKey,
    entrySource: entry.source,
    title: entry.title,
    tabLabel:
      extractFileNameFromPath(entry.filePath || entry.title) || entry.title,
    subtitle: entry.subtitle,
    kindLabel: entry.kindLabel,
    badgeLabel: entry.badgeLabel,
    target,
    content: resolvePreviewContent(target),
    previousContent,
    selectionPath: resolvePreviewPath(target),
  };
}

export const CanvasWorkbenchLayout = memo(function CanvasWorkbenchLayout({
  artifacts,
  canvasState,
  taskFiles,
  selectedFileId,
  workspaceRoot,
  workspaceUnavailable = false,
  defaultPreview,
  loadFilePreview,
  onOpenPath,
  onRevealPath,
  renderPreview,
  onClose,
  onLayoutModeChange,
  workbenchMode = "default",
  workspaceView = null,
  teamView = null,
  sessionView = null,
  outputView = null,
  logView = null,
  changeView = null,
}: CanvasWorkbenchLayoutProps) {
  const { t } = useTranslation("agent");
  const canvasT = t as unknown as CanvasWorkbenchTranslation;
  const canvasTRef = useRef(canvasT);
  canvasTRef.current = canvasT;
  const translateWorkbench = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      canvasWorkbenchText(canvasTRef.current, key, options),
    [],
  );
  const workbenchCopy = useMemo<CanvasWorkbenchCopy>(
    () => ({
      kind: {
        artifact: translateWorkbench("agentChat.canvasWorkbench.kind.artifact"),
        currentDraft: translateWorkbench(
          "agentChat.canvasWorkbench.kind.currentDraft",
        ),
        currentVersion: translateWorkbench(
          "agentChat.canvasWorkbench.kind.currentVersion",
        ),
        defaultDraft: translateWorkbench(
          "agentChat.canvasWorkbench.kind.defaultDraft",
        ),
        taskDocument: translateWorkbench(
          "agentChat.canvasWorkbench.kind.taskDocument",
        ),
        taskFile: translateWorkbench("agentChat.canvasWorkbench.kind.taskFile"),
        version: translateWorkbench("agentChat.canvasWorkbench.kind.version"),
        versionTitle: (count: number) =>
          translateWorkbench("agentChat.canvasWorkbench.kind.versionTitle", {
            count,
          }),
        workspaceFile: translateWorkbench(
          "agentChat.canvasWorkbench.kind.workspaceFile",
        ),
      },
      tab: {
        files: translateWorkbench("agentChat.canvasWorkbench.tabs.files"),
        generated: translateWorkbench(
          "agentChat.canvasWorkbench.tabs.generated",
        ),
        sessionMain: translateWorkbench(
          "agentChat.canvasWorkbench.tabs.sessionMain",
        ),
      },
      workspaceFile: {
        binaryUnsupported: translateWorkbench(
          "agentChat.canvasWorkbench.workspaceFile.binaryUnsupported",
        ),
        readFailed: translateWorkbench(
          "agentChat.canvasWorkbench.workspaceFile.readFailed",
        ),
      },
    }),
    [translateWorkbench],
  );
  const isCodingWorkbench = workbenchMode === "coding";
  const shouldPreferTeamTabByDefault =
    !isCodingWorkbench && teamView?.enabled === true && !defaultPreview;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isStackedLayout, setIsStackedLayout] = useState(false);
  const [documentPreviewMode, setDocumentPreviewMode] =
    useState<CanvasWorkbenchDocumentViewMode>("preview");
  const [documentInspectorCollapsed, setDocumentInspectorCollapsed] =
    useState(true);
  const [artifactDocumentController, setArtifactDocumentController] =
    useState<ArtifactWorkbenchDocumentController | null>(null);
  const [directoryCache, setDirectoryCache] = useState<
    Record<string, DirectoryListing>
  >({});
  const [loadingDirectories, setLoadingDirectories] = useState<
    Record<string, boolean>
  >({});
  const [expandedDirectories, setExpandedDirectories] = useState<
    Record<string, boolean>
  >({});
  const [workspaceFileSelections, setWorkspaceFileSelections] = useState<
    Record<string, WorkspaceFileSelection>
  >({});

  const entries = useMemo(
    () =>
      buildEntries(
        artifacts,
        canvasState,
        taskFiles,
        workbenchCopy,
        workspaceRoot,
      ),
    [artifacts, canvasState, taskFiles, workbenchCopy, workspaceRoot],
  );

  const entryMap = useMemo(
    () => new Map(entries.map((entry) => [entry.key, entry])),
    [entries],
  );

  const fallbackSelectionKey = useMemo(() => {
    if (
      defaultPreview?.selectionKey &&
      entryMap.has(defaultPreview.selectionKey)
    ) {
      return defaultPreview.selectionKey;
    }

    if (selectedFileId) {
      const selectedTaskKey = `task:${selectedFileId}`;
      if (entryMap.has(selectedTaskKey)) {
        return selectedTaskKey;
      }
    }

    return entries[0]?.key || null;
  }, [defaultPreview?.selectionKey, entries, entryMap, selectedFileId]);

  const initialDocumentSelectionKey =
    defaultPreview?.selectionKey || fallbackSelectionKey;
  const shouldPreferSessionTabOnMount = Boolean(
    !isCodingWorkbench &&
    sessionView?.renderPanel &&
    !initialDocumentSelectionKey,
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialDocumentSelectionKey,
  );
  const [openDocumentTabs, setOpenDocumentTabs] = useState<
    Array<`document:${string}`>
  >(() =>
    initialDocumentSelectionKey
      ? [buildDocumentTabKey(initialDocumentSelectionKey)]
      : [],
  );
  const [activeTab, setActiveTab] = useState<CanvasWorkbenchTab>(() => {
    if (isCodingWorkbench) {
      return "preview";
    }
    if (shouldPreferSessionTabOnMount) {
      return "session";
    }
    if (initialDocumentSelectionKey) {
      return buildDocumentTabKey(initialDocumentSelectionKey);
    }
    return shouldPreferTeamTabByDefault ? "team" : "session";
  });
  const hasAutoFocusedInitialDocumentTabRef = useRef(
    isCodingWorkbench || Boolean(initialDocumentSelectionKey),
  );
  const isKnownSelectionKey = useCallback(
    (selectionKey: string | null) => {
      if (!selectionKey) {
        return false;
      }
      if (selectionKey.startsWith("workspace-file:")) {
        return true;
      }
      return (
        entryMap.has(selectionKey) ||
        selectionKey === defaultPreview?.selectionKey
      );
    },
    [defaultPreview?.selectionKey, entryMap],
  );

  useEffect(() => {
    if (!selectedKey || isKnownSelectionKey(selectedKey)) {
      return;
    }
    setSelectedKey(fallbackSelectionKey);
  }, [fallbackSelectionKey, isKnownSelectionKey, selectedKey]);

  useEffect(() => {
    const seedSelectionKeys = [
      defaultPreview?.selectionKey || null,
      fallbackSelectionKey,
    ].filter((value): value is string => Boolean(value));

    if (seedSelectionKeys.length === 0) {
      return;
    }

    setOpenDocumentTabs((previous) => {
      const next = [...previous];
      let changed = false;
      seedSelectionKeys.forEach((selectionKey) => {
        const tabKey = buildDocumentTabKey(selectionKey);
        if (!next.includes(tabKey)) {
          next.push(tabKey);
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [defaultPreview?.selectionKey, fallbackSelectionKey]);

  useEffect(() => {
    setOpenDocumentTabs((previous) => {
      const next = previous.filter((tabKey) =>
        isKnownSelectionKey(parseDocumentTabKey(tabKey)),
      );
      return next.length === previous.length ? previous : next;
    });
  }, [isKnownSelectionKey]);

  useEffect(() => {
    if (isCodingWorkbench) {
      return;
    }
    if (activeTab !== "team" || teamView?.enabled) {
      return;
    }
    setActiveTab(openDocumentTabs[0] || "session");
  }, [activeTab, isCodingWorkbench, openDocumentTabs, teamView?.enabled]);

  useEffect(() => {
    if (isCodingWorkbench) {
      return;
    }
    if (!isDocumentTabKey(activeTab)) {
      return;
    }
    const selectionKey = parseDocumentTabKey(activeTab);
    if (!isKnownSelectionKey(selectionKey)) {
      setActiveTab(openDocumentTabs[0] || "session");
      return;
    }
    if (selectedKey !== selectionKey) {
      setSelectedKey(selectionKey);
    }
  }, [
    activeTab,
    isCodingWorkbench,
    isKnownSelectionKey,
    openDocumentTabs,
    selectedKey,
  ]);

  useEffect(() => {
    if (isCodingWorkbench) {
      return;
    }
    if (hasAutoFocusedInitialDocumentTabRef.current) {
      return;
    }
    if (!sessionView?.renderPanel || activeTab !== "session") {
      return;
    }
    const initialDocumentTab = openDocumentTabs[0];
    if (!initialDocumentTab) {
      return;
    }
    hasAutoFocusedInitialDocumentTabRef.current = true;
    setActiveTab(initialDocumentTab);
  }, [
    activeTab,
    isCodingWorkbench,
    openDocumentTabs,
    sessionView?.renderPanel,
  ]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) {
      return;
    }

    const updateLayout = (width: number) => {
      if (width <= 0) {
        return;
      }
      setIsStackedLayout(width < STACKED_LAYOUT_BREAKPOINT);
    };

    const fallbackWidth =
      node.getBoundingClientRect().width ||
      node.clientWidth ||
      window.innerWidth;
    updateLayout(fallbackWidth);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((observerEntries) => {
      const contentRect = observerEntries[0]?.contentRect;
      const nextWidth =
        contentRect?.width ||
        node.getBoundingClientRect().width ||
        node.clientWidth;
      updateLayout(nextWidth);
    });

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    onLayoutModeChange?.(isStackedLayout ? "stacked" : "split");
  }, [isStackedLayout, onLayoutModeChange]);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!path.trim()) {
        return;
      }
      setLoadingDirectories((previous) => ({ ...previous, [path]: true }));
      try {
        const listing = filterWorkspaceDirectoryListing(
          await listDirectory(path),
          workspaceRoot,
        );
        setDirectoryCache((previous) => ({
          ...previous,
          [path]: listing,
        }));
      } catch (error) {
        toast.error(
          translateWorkbench("agentChat.canvasWorkbench.workspace.loadFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        setLoadingDirectories((previous) => ({ ...previous, [path]: false }));
      }
    },
    [translateWorkbench, workspaceRoot],
  );

  const teamAutoFocusTokenRef = useRef<string | number | null | undefined>(
    teamView?.autoFocusToken,
  );

  useEffect(() => {
    if (
      isCodingWorkbench ||
      !teamView?.enabled ||
      teamView.autoFocusToken == null
    ) {
      return;
    }

    if (teamAutoFocusTokenRef.current === teamView.autoFocusToken) {
      return;
    }

    teamAutoFocusTokenRef.current = teamView.autoFocusToken;
    setActiveTab("team");
  }, [isCodingWorkbench, teamView?.autoFocusToken, teamView?.enabled]);

  const handleOpenDocumentSelection = useCallback(
    (selectionKey: string) => {
      setSelectedKey(selectionKey);
      const tabKey = buildDocumentTabKey(selectionKey);
      setOpenDocumentTabs((previous) =>
        previous.includes(tabKey) ? previous : [...previous, tabKey],
      );
      setActiveTab(isCodingWorkbench ? "preview" : tabKey);
    },
    [isCodingWorkbench],
  );
  const handleCloseDocumentTab = useCallback(
    (tabKey: `document:${string}`) => {
      const selectionKey = parseDocumentTabKey(tabKey);
      setOpenDocumentTabs((previous) =>
        previous.filter((currentTabKey) => currentTabKey !== tabKey),
      );

      if (selectedKey === selectionKey) {
        setSelectedKey(fallbackSelectionKey);
      }

      if (activeTab === tabKey) {
        const fallbackTab =
          openDocumentTabs.find((currentTabKey) => currentTabKey !== tabKey) ||
          (teamView?.enabled && shouldPreferTeamTabByDefault
            ? "team"
            : "session");
        setActiveTab(fallbackTab as CanvasWorkbenchTab);
      }
    },
    [
      activeTab,
      fallbackSelectionKey,
      openDocumentTabs,
      selectedKey,
      shouldPreferTeamTabByDefault,
      teamView?.enabled,
    ],
  );

  const handleToggleDirectory = useCallback(
    (path: string) => {
      const willExpand = !expandedDirectories[path];
      setExpandedDirectories((previous) => ({
        ...previous,
        [path]: willExpand,
      }));
      if (willExpand) {
        void loadDirectory(path);
      }
    },
    [expandedDirectories, loadDirectory],
  );

  const refreshDirectorySubtree = useCallback(
    async (rootPath: string) => {
      const normalizedRootPath = normalizePath(rootPath.trim());
      if (!normalizedRootPath) {
        return;
      }

      const expandedDescendants = Object.entries(expandedDirectories)
        .filter(
          ([path, expanded]) =>
            expanded &&
            normalizePath(path).startsWith(`${normalizedRootPath}/`),
        )
        .map(([path]) => path);

      await Promise.all([
        loadDirectory(rootPath),
        ...expandedDescendants.map((path) => loadDirectory(path)),
      ]);
    },
    [expandedDirectories, loadDirectory],
  );

  const handleSelectWorkspaceFile = useCallback(
    async (path: string) => {
      const title = extractFileNameFromPath(path);
      const selectionKey = `workspace-file:${path}`;
      handleOpenDocumentSelection(selectionKey);
      setWorkspaceFileSelections((previous) => ({
        ...previous,
        [selectionKey]: {
          path,
          title,
          status: "loading",
        },
      }));

      const preview = await loadFilePreview(path);
      setWorkspaceFileSelections((previous) => {
        if (preview.isBinary) {
          return {
            ...previous,
            [selectionKey]: {
              path,
              title,
              status: "binary",
              error: preview.error ?? null,
              size: preview.size,
            },
          };
        }

        if (preview.error) {
          return {
            ...previous,
            [selectionKey]: {
              path,
              title,
              status: "error",
              error: preview.error,
              size: preview.size,
            },
          };
        }

        return {
          ...previous,
          [selectionKey]: {
            path,
            title,
            status: "ready",
            content: preview.content || "",
            size: preview.size,
          },
        };
      });
    },
    [handleOpenDocumentSelection, loadFilePreview],
  );

  const documentSelectionKey = useMemo(() => {
    if (!isCodingWorkbench && isDocumentTabKey(activeTab)) {
      return parseDocumentTabKey(activeTab);
    }
    return selectedKey || fallbackSelectionKey;
  }, [activeTab, fallbackSelectionKey, isCodingWorkbench, selectedKey]);

  const documentContext = useMemo(
    () =>
      resolveSelectionContext({
        selectionKey: documentSelectionKey,
        defaultPreview,
        entryMap,
        workspaceFileSelections,
        canvasState,
        artifacts,
        copy: workbenchCopy,
        workspaceRoot,
      }),
    [
      artifacts,
      canvasState,
      defaultPreview,
      documentSelectionKey,
      entryMap,
      workspaceFileSelections,
      workbenchCopy,
      workspaceRoot,
    ],
  );

  const sessionContext = useMemo(() => {
    if (defaultPreview?.content.trim()) {
      return buildDefaultPreviewSelection(defaultPreview, workbenchCopy);
    }
    return documentContext;
  }, [defaultPreview, documentContext, workbenchCopy]);

  const workspacePanelRootPath = useMemo(
    () =>
      resolveSavedContentBundleRoot(
        workspaceRoot,
        documentContext?.selectionPath || sessionContext?.selectionPath,
      ) ||
      workspaceRoot ||
      null,
    [
      documentContext?.selectionPath,
      sessionContext?.selectionPath,
      workspaceRoot,
    ],
  );

  const workspacePanelDisplayPath = useMemo(
    () =>
      resolveWorkspacePanelDisplayPath(workspaceRoot, workspacePanelRootPath),
    [workspacePanelRootPath, workspaceRoot],
  );

  useEffect(() => {
    if (!workspacePanelRootPath?.trim() || workspaceUnavailable) {
      return;
    }
    if (directoryCache[workspacePanelRootPath]) {
      return;
    }
    void loadDirectory(workspacePanelRootPath);
  }, [
    directoryCache,
    loadDirectory,
    workspacePanelRootPath,
    workspaceUnavailable,
  ]);

  const teamTarget = useMemo<CanvasWorkbenchPreviewTarget | null>(() => {
    if (!teamView?.enabled) {
      return null;
    }
    return {
      kind: "team-workbench",
      title: teamView.title || workbenchCopy.tab.generated,
    };
  }, [teamView, workbenchCopy.tab.generated]);

  const hasCustomSessionView = Boolean(sessionView?.renderPanel);

  const activePreviewContext =
    activeTab === "preview"
      ? documentContext
      : activeTab === "session"
        ? hasCustomSessionView
          ? null
          : sessionContext
        : isDocumentTabKey(activeTab)
          ? documentContext
          : null;

  const activeSelectionPath = activePreviewContext?.selectionPath;
  const activeContent = activePreviewContext?.content || "";
  const closeWorkbenchLabel = canvasWorkbenchText(
    canvasT,
    "agentChat.canvasWorkbench.close",
  );

  const documentDiffLines = useMemo(
    () =>
      documentContext && documentContext.previousContent !== null
        ? buildCanvasWorkbenchDiff(
            documentContext.previousContent,
            documentContext.content,
          )
        : [],
    [documentContext],
  );
  const changeItems = useMemo(() => changeView?.items ?? [], [changeView]);
  const changeItemCount = changeItems.length;
  const hasChangeQueue = changeItemCount > 0;
  const pendingChangeItemCount = useMemo(
    () => changeItems.filter(isPendingChangeItem).length,
    [changeItems],
  );
  const failedChangeItemCount = useMemo(
    () => changeItems.filter((item) => item.status === "failed").length,
    [changeItems],
  );
  const activeSelectionChangeItem = useMemo(
    () => findChangeItemForSelection(changeItems, documentContext),
    [changeItems, documentContext],
  );

  useEffect(() => {
    setDocumentPreviewMode("preview");
  }, [documentSelectionKey]);

  const handleArtifactDocumentControllerChange = useCallback(
    (controller: ArtifactWorkbenchDocumentController | null) => {
      setArtifactDocumentController((previous) =>
        previous === controller ? previous : controller,
      );
    },
    [],
  );

  useEffect(() => {
    if (
      activeTab !== "preview" &&
      activeTab !== "session" &&
      !isDocumentTabKey(activeTab)
    ) {
      setArtifactDocumentController(null);
      return;
    }

    const previewTarget = activePreviewContext?.target;
    if (previewTarget?.kind !== "artifact") {
      setArtifactDocumentController(null);
    }
  }, [activePreviewContext?.target, activeTab]);

  useEffect(() => {
    setDocumentInspectorCollapsed(true);
  }, [documentSelectionKey, artifactDocumentController?.document?.artifactId]);

  const documentTabs = useMemo(
    () =>
      openDocumentTabs.map((tabKey) => {
        const context = resolveSelectionContext({
          selectionKey: parseDocumentTabKey(tabKey),
          defaultPreview,
          entryMap,
          workspaceFileSelections,
          canvasState,
          artifacts,
          copy: workbenchCopy,
          workspaceRoot,
        });

        if (context) {
          return {
            key: tabKey,
            label: context.tabLabel,
            title: context.title,
            badgeLabel: context.badgeLabel,
            kindLabel: context.kindLabel,
          };
        }

        const selectionKey = parseDocumentTabKey(tabKey);
        const fallbackLabel = selectionKey.startsWith("workspace-file:")
          ? extractFileNameFromPath(
              selectionKey.replace(/^workspace-file:/, ""),
            )
          : selectionKey;
        return {
          key: tabKey,
          label: fallbackLabel,
          title: fallbackLabel,
          badgeLabel: undefined,
          kindLabel: undefined,
        };
      }),
    [
      artifacts,
      canvasState,
      defaultPreview,
      entryMap,
      openDocumentTabs,
      workspaceFileSelections,
      workbenchCopy,
      workspaceRoot,
    ],
  );

  const primaryTabs = useMemo<
    Array<{
      key: CanvasWorkbenchTab;
      label: string;
      badge?: string;
      badgeTone?: "slate" | "sky" | "rose";
    }>
  >(() => {
    const workspaceBadge =
      workspaceView?.tabBadge?.trim() ||
      (workspacePanelRootPath?.trim() &&
      directoryCache[workspacePanelRootPath]?.entries.length
        ? String(
            Math.min(directoryCache[workspacePanelRootPath].entries.length, 99),
          )
        : undefined);

    if (isCodingWorkbench) {
      return [
        {
          key: "preview" as const,
          label: resolveCodingPreviewTabLabel(
            documentContext,
            canvasWorkbenchText(
              canvasT,
              "agentChat.canvasWorkbench.coding.tabs.preview",
            ),
          ),
          badge: isHtmlPreviewContext(documentContext)
            ? canvasWorkbenchText(
                canvasT,
                "agentChat.canvasWorkbench.coding.preview.htmlBadge",
              )
            : documentContext?.kindLabel,
          badgeTone: isHtmlPreviewContext(documentContext) ? "sky" : "slate",
        },
        {
          key: "workspace" as const,
          label: canvasWorkbenchText(
            canvasT,
            "agentChat.canvasWorkbench.coding.tabs.files",
          ),
          badge: workspaceBadge,
          badgeTone: workspaceView?.tabBadgeTone,
        },
        {
          key: "changes" as const,
          label: canvasWorkbenchText(
            canvasT,
            "agentChat.canvasWorkbench.coding.tabs.changes",
          ),
          badge:
            changeItemCount > 0
              ? changeItemCount > 99
                ? "99+"
                : String(changeItemCount)
              : documentDiffLines.length > 0
                ? String(documentDiffLines.length)
                : undefined,
          badgeTone:
            failedChangeItemCount > 0
              ? "rose"
              : changeItemCount > 0 || documentDiffLines.length > 0
                ? "sky"
                : "slate",
        },
        {
          key: "outputs" as const,
          label: canvasWorkbenchText(
            canvasT,
            "agentChat.canvasWorkbench.coding.tabs.outputs",
          ),
          badge: outputView?.tabBadge?.trim() || undefined,
          badgeTone: outputView?.tabBadgeTone,
        },
        {
          key: "logs" as const,
          label: canvasWorkbenchText(
            canvasT,
            "agentChat.canvasWorkbench.coding.tabs.logs",
          ),
          badge:
            logView?.tabBadge?.trim() ||
            sessionView?.tabBadge?.trim() ||
            undefined,
          badgeTone: logView?.tabBadgeTone || sessionView?.tabBadgeTone,
        },
      ];
    }

    return [
      {
        key: "session" as const,
        label: sessionView?.tabLabel?.trim() || workbenchCopy.tab.sessionMain,
        badge: sessionView?.tabBadge?.trim() || undefined,
        badgeTone: sessionView?.tabBadgeTone,
      },
      {
        key: "workspace" as const,
        label: workspaceView?.tabLabel?.trim() || workbenchCopy.tab.files,
        badge: workspaceBadge,
        badgeTone: workspaceView?.tabBadgeTone,
      },
      ...(teamView?.enabled
        ? [
            {
              key: "team" as const,
              label:
                teamView.tabLabel?.trim() ||
                teamView.title?.trim() ||
                workbenchCopy.tab.generated,
              badge:
                teamView.tabBadge?.trim() ||
                teamView.triggerState?.label?.trim() ||
                undefined,
              badgeTone:
                teamView.tabBadgeTone ||
                (teamView.triggerState?.tone === "error"
                  ? ("rose" as const)
                  : teamView.triggerState?.tone === "active"
                    ? ("sky" as const)
                    : ("slate" as const)),
            },
          ]
        : []),
    ];
  }, [
    changeItemCount,
    directoryCache,
    documentContext,
    documentDiffLines.length,
    failedChangeItemCount,
    isCodingWorkbench,
    logView?.tabBadge,
    logView?.tabBadgeTone,
    outputView?.tabBadge,
    outputView?.tabBadgeTone,
    sessionView?.tabBadge,
    sessionView?.tabBadgeTone,
    sessionView?.tabLabel,
    teamView,
    canvasT,
    workbenchCopy.tab.files,
    workbenchCopy.tab.generated,
    workbenchCopy.tab.sessionMain,
    workspacePanelRootPath,
    workspaceView?.tabBadge,
    workspaceView?.tabBadgeTone,
    workspaceView?.tabLabel,
  ]);
  const handleCopyPath = useCallback(async () => {
    if (!activeSelectionPath) {
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(
          translateWorkbench("agentChat.canvasWorkbench.clipboard.unsupported"),
        );
      }
      await navigator.clipboard.writeText(activeSelectionPath);
      toast.success(
        translateWorkbench("agentChat.canvasWorkbench.clipboard.copied"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateWorkbench(
              "agentChat.canvasWorkbench.clipboard.copyFailed",
            ),
      );
    }
  }, [activeSelectionPath, translateWorkbench]);

  const handleDownload = useCallback(() => {
    if (!activeContent.trim()) {
      return;
    }
    const filename = extractFileNameFromPath(
      activeSelectionPath || activePreviewContext?.title || "canvas.md",
    );
    downloadText(filename, activeContent);
  }, [activeContent, activePreviewContext?.title, activeSelectionPath]);

  const renderDocumentInspector = () => {
    if (
      !isDocumentTabKey(activeTab) ||
      !artifactDocumentController?.document ||
      !documentContext
    ) {
      return null;
    }

    const documentTitle =
      artifactDocumentController.document.title?.trim() ||
      documentContext.title;
    const documentSummary =
      artifactDocumentController.document.summary?.trim() ||
      canvasWorkbenchText(
        canvasT,
        "agentChat.canvasWorkbench.documentInspector.summaryFallback",
      );
    const versionCount = artifactDocumentController.versionHistory.length || 0;
    const sourceCount = artifactDocumentController.sourceLinks.length || 0;
    const diffCount =
      artifactDocumentController.currentVersionDiff?.changedBlocks.length || 0;
    const currentVersionLabel = artifactDocumentController.currentVersion
      ? `v${artifactDocumentController.currentVersion.versionNo}`
      : null;

    return (
      <section
        className={cn(WORKBENCH_PANEL_CLASSNAME, "overflow-hidden bg-slate-50")}
      >
        <button
          type="button"
          aria-label={
            documentInspectorCollapsed
              ? canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.documentInspector.expand",
                )
              : canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.documentInspector.collapse",
                )
          }
          aria-expanded={!documentInspectorCollapsed}
          aria-controls="canvas-workbench-document-inspector-panel"
          onClick={() => setDocumentInspectorCollapsed((current) => !current)}
          className="flex w-full items-start justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {canvasWorkbenchText(
                canvasT,
                "agentChat.canvasWorkbench.documentInspector.title",
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-slate-900">
                {documentTitle}
              </div>
              {currentVersionLabel ? (
                <span className="rounded-full border border-emerald-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 shadow-sm shadow-emerald-950/10">
                  {currentVersionLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
              {documentSummary}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span>
                {canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.documentInspector.sourceCount",
                  { count: sourceCount },
                )}
              </span>
              <span>
                {canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.documentInspector.versionCount",
                  { count: versionCount },
                )}
              </span>
              <span>
                {canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.documentInspector.diffCount",
                  { count: diffCount },
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 pt-1 text-slate-500">
            <span className="text-[11px] font-medium">
              {documentInspectorCollapsed
                ? canvasWorkbenchText(
                    canvasT,
                    "agentChat.canvasWorkbench.documentInspector.expandShort",
                  )
                : canvasWorkbenchText(
                    canvasT,
                    "agentChat.canvasWorkbench.documentInspector.collapseShort",
                  )}
            </span>
            {documentInspectorCollapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" />
            )}
          </div>
        </button>

        {documentInspectorCollapsed ? (
          <div className="px-4 py-3 text-xs leading-5 text-slate-500">
            {canvasWorkbenchText(
              canvasT,
              "agentChat.canvasWorkbench.documentInspector.collapsedHint",
            )}
          </div>
        ) : (
          <ArtifactWorkbenchDocumentInspector
            controller={artifactDocumentController}
            testId="canvas-workbench-document-inspector"
            containerClassName="min-h-0 overflow-hidden bg-slate-50"
            tabsClassName="flex h-full min-h-0 flex-col p-4"
          />
        )}
      </section>
    );
  };

  const renderDirectoryNode = (path: string, depth = 0): ReactNode => {
    const listing = directoryCache[path];
    if (!listing) {
      return null;
    }

    return sortWorkspaceListingEntries(
      listing.entries,
      path,
      workspaceRoot,
    ).map((entry) => {
      const rowKey = entry.path;
      const isDirectory = entry.isDir;
      const isExpanded = Boolean(expandedDirectories[entry.path]);
      const fileSelectionKey = `workspace-file:${entry.path}`;
      const isSelected = documentSelectionKey === fileSelectionKey;

      return (
        <div key={rowKey}>
          <button
            type="button"
            aria-label={
              isDirectory
                ? translateWorkbench(
                    isExpanded
                      ? "agentChat.canvasWorkbench.workspace.collapseDirectoryAria"
                      : "agentChat.canvasWorkbench.workspace.expandDirectoryAria",
                    { name: entry.name },
                  )
                : translateWorkbench(
                    "agentChat.canvasWorkbench.workspace.selectFileAria",
                    { name: entry.name },
                  )
            }
            onClick={() => {
              if (isDirectory) {
                handleToggleDirectory(entry.path);
                return;
              }
              void handleSelectWorkspaceFile(entry.path);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
              isSelected
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:bg-white hover:text-slate-900",
            )}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isDirectory ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {isDirectory ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-amber-600" />
              )
            ) : entry.name.match(
                /\.(ts|tsx|js|jsx|rs|json|yml|yaml|toml)$/i,
              ) ? (
              <FileCode2 className="h-4 w-4 shrink-0 text-sky-600" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {loadingDirectories[entry.path] ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : null}
          </button>
          {isDirectory && isExpanded
            ? renderDirectoryNode(entry.path, depth + 1)
            : null}
        </div>
      );
    });
  };

  const renderHeaderActionButton = ({
    label,
    onClick,
    disabled,
    icon,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        WORKBENCH_GHOST_BUTTON_CLASSNAME,
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );

  const renderTopTab = ({
    key,
    label,
    badge,
    badgeTone,
    closable = false,
  }: {
    key: CanvasWorkbenchTab;
    label: string;
    badge?: string;
    badgeTone?: "slate" | "sky" | "rose";
    closable?: boolean;
  }) => {
    const active = activeTab === key;
    const badgeClassName =
      badgeTone === "rose"
        ? "bg-rose-50 text-rose-700"
        : badgeTone === "sky"
          ? "bg-sky-50 text-sky-700"
          : "bg-slate-100 text-slate-600";
    const leading =
      key === "preview" ? (
        <Monitor className="h-3.5 w-3.5 shrink-0" />
      ) : key === "changes" ? (
        <GitCompare className="h-3.5 w-3.5 shrink-0" />
      ) : key === "outputs" ? (
        <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
      ) : key === "logs" ? (
        <ListChecks className="h-3.5 w-3.5 shrink-0" />
      ) : key === "session" ? (
        <span className="h-2 w-2 rounded-full bg-slate-400" />
      ) : key === "workspace" ? (
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
      ) : key === "team" ? (
        <span className="h-2 w-2 rounded-full bg-sky-400" />
      ) : label.match(/\.(ts|tsx|js|jsx|rs|json|yml|yaml|toml)$/i) ? (
        <FileCode2 className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0" />
      );

    return (
      <button
        key={key}
        type="button"
        aria-label={translateWorkbench(
          "agentChat.canvasWorkbench.tabs.switchAria",
          { label },
        )}
        data-canvas-tab-key={key}
        onClick={() => setActiveTab(key)}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition-colors",
          active
            ? "border-slate-200 bg-white text-slate-950 shadow-sm shadow-slate-950/5"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200/80 hover:bg-white hover:text-slate-900",
        )}
      >
        <span className={cn(active ? "text-slate-500" : "text-slate-400")}>
          {leading}
        </span>
        <span className="truncate">{label}</span>
        {badge ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              badgeClassName,
            )}
          >
            {badge}
          </span>
        ) : null}
        {closable && isDocumentTabKey(key) ? (
          <span
            role="button"
            aria-label={translateWorkbench(
              "agentChat.canvasWorkbench.tabs.closeFileAria",
              { label },
            )}
            onClick={(event) => {
              event.stopPropagation();
              handleCloseDocumentTab(key);
            }}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3 w-3" />
          </span>
        ) : null}
      </button>
    );
  };

  const renderWorkspacePanel = () => {
    if (workspaceUnavailable) {
      return (
        <div data-testid="canvas-workbench-panel-workspace" className="p-5">
          <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
            {workspaceView?.panelCopy?.unavailableText ||
              translateWorkbench(
                "agentChat.canvasWorkbench.workspace.unavailable",
              )}
          </div>
        </div>
      );
    }

    if (!workspacePanelRootPath?.trim()) {
      return (
        <div data-testid="canvas-workbench-panel-workspace" className="p-5">
          <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
            {workspaceView?.panelCopy?.emptyText ||
              translateWorkbench("agentChat.canvasWorkbench.workspace.empty")}
          </div>
        </div>
      );
    }

    const rootListing = directoryCache[workspacePanelRootPath];
    const workspacePanelEyebrow =
      workspacePanelRootPath !== workspaceRoot
        ? translateWorkbench("agentChat.canvasWorkbench.workspace.resultDir")
        : null;

    return (
      <section
        data-testid="canvas-workbench-panel-workspace"
        className="flex h-full min-h-0 flex-col p-5"
      >
        <div
          className={cn(
            WORKBENCH_PANEL_CLASSNAME,
            "min-h-0 flex-1 overflow-hidden",
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                {workspaceView?.panelCopy?.sectionEyebrow ||
                  workspacePanelEyebrow ||
                  translateWorkbench(
                    "agentChat.canvasWorkbench.workspace.projectDir",
                  )}
              </div>
              <div className="mt-1 truncate text-sm font-medium text-slate-900">
                {workspacePanelDisplayPath || workspacePanelRootPath}
              </div>
            </div>
            <button
              type="button"
              aria-label={canvasWorkbenchText(
                canvasT,
                "agentChat.canvasWorkbench.workspace.refreshTree",
              )}
              onClick={() =>
                void refreshDirectorySubtree(workspacePanelRootPath)
              }
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                WORKBENCH_GHOST_BUTTON_CLASSNAME,
              )}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {loadingDirectories[workspacePanelRootPath] && !rootListing ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {workspaceView?.panelCopy?.loadingText ||
                  translateWorkbench(
                    "agentChat.canvasWorkbench.workspace.loading",
                  )}
              </div>
            ) : rootListing ? (
              renderDirectoryNode(workspacePanelRootPath)
            ) : (
              <div className="px-2 py-4 text-sm text-slate-500">
                {workspaceView?.panelCopy?.emptyDirectoryText ||
                  translateWorkbench(
                    "agentChat.canvasWorkbench.workspace.emptyDirectory",
                  )}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderSessionPanel = () => {
    if (sessionContext) {
      return (
        <div
          data-testid="canvas-workbench-panel-session"
          className="h-full min-h-0 p-4"
        >
          <div
            data-testid="canvas-workbench-preview-region"
            className="h-full min-h-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white"
          >
            {renderPreview(sessionContext.target)}
          </div>
        </div>
      );
    }

    if (sessionView?.renderPanel) {
      return (
        <div
          data-testid="canvas-workbench-panel-session"
          className="h-full min-h-0 overflow-auto p-5"
        >
          {sessionView.renderPanel()}
        </div>
      );
    }

    return (
      <div data-testid="canvas-workbench-panel-session" className="p-5">
        <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
          {canvasWorkbenchText(
            canvasT,
            "agentChat.canvasWorkbench.session.empty",
          )}
        </div>
      </div>
    );
  };

  const renderTeamPanel = () => {
    if (!teamView?.enabled || !teamTarget) {
      return (
        <div data-testid="canvas-workbench-panel-team" className="p-5">
          <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
            {teamView?.panelCopy?.emptyText ||
              translateWorkbench("agentChat.canvasWorkbench.team.empty")}
          </div>
        </div>
      );
    }

    return (
      <section
        data-testid="canvas-workbench-panel-team"
        className="flex h-full min-h-0 flex-col gap-4 p-4"
      >
        <div
          data-testid="canvas-workbench-preview-region"
          className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-slate-200 bg-white"
        >
          {renderPreview(teamTarget)}
        </div>
        {teamView.renderPanel ? (
          <div
            className={cn(
              WORKBENCH_PANEL_CLASSNAME,
              "min-h-0 overflow-auto p-4",
            )}
          >
            {teamView.renderPanel()}
          </div>
        ) : null}
        {teamView.renderFooter ? (
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
            {teamView.renderFooter()}
          </div>
        ) : null}
      </section>
    );
  };

  const renderPreviewPanel = () => {
    if (!documentContext) {
      return (
        <div data-testid="canvas-workbench-panel-preview" className="p-5">
          <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
            {canvasWorkbenchText(
              canvasT,
              "agentChat.canvasWorkbench.coding.preview.empty",
            )}
          </div>
        </div>
      );
    }

    return (
      <section
        data-testid="canvas-workbench-panel-preview"
        className="flex h-full min-h-0 flex-col gap-3 p-4"
      >
        <div
          data-testid="canvas-workbench-preview-region"
          className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-slate-200 bg-white"
        >
          {renderPreview(documentContext.target, {
            onArtifactDocumentControllerChange:
              handleArtifactDocumentControllerChange,
          })}
        </div>
        {isHtmlPreviewContext(documentContext) ? (
          <div className="flex items-center gap-2 rounded-[18px] border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-700">
            <Monitor className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {canvasWorkbenchText(
                canvasT,
                "agentChat.canvasWorkbench.coding.preview.staticHtmlHint",
              )}
            </span>
          </div>
        ) : null}
      </section>
    );
  };

  const renderChangesPanel = () => {
    if (hasChangeQueue) {
      const selectedChangeItem = activeSelectionChangeItem || changeItems[0];
      const selectedDiffLines =
        selectedChangeItem?.previousContent != null &&
        selectedChangeItem.currentContent != null
          ? buildCanvasWorkbenchDiff(
              selectedChangeItem.previousContent,
              selectedChangeItem.currentContent,
            )
          : [];
      const latestCheckpointPath =
        changeView?.latestCheckpointPath ||
        selectedChangeItem?.checkpointPath ||
        null;

      return (
        <section
          data-testid="canvas-workbench-panel-changes"
          className="grid h-full min-h-0 gap-4 p-4 lg:grid-cols-[minmax(260px,0.36fr)_minmax(0,1fr)]"
        >
          <div
            className={cn(
              WORKBENCH_PANEL_CLASSNAME,
              "flex min-h-0 flex-col overflow-hidden",
            )}
          >
            <div className="border-b border-slate-200/80 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    {canvasWorkbenchText(
                      canvasT,
                      "agentChat.canvasWorkbench.coding.changes.queueTitle",
                    )}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {canvasWorkbenchText(
                      canvasT,
                      "agentChat.canvasWorkbench.coding.changes.queueSummary",
                      {
                        count: changeItemCount,
                        pending: pendingChangeItemCount,
                      },
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {changeView?.checkpointCount ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                      data-testid="canvas-workbench-changes-checkpoints"
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      {canvasWorkbenchText(
                        canvasT,
                        "agentChat.canvasWorkbench.coding.changes.checkpointBadge",
                        { count: changeView.checkpointCount },
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="space-y-2">
                {changeItems.map((item) => {
                  const active = item.id === selectedChangeItem?.id;
                  const displayName = resolveChangeItemDisplayName(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-slate-300 bg-white shadow-sm shadow-slate-950/5"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
                      )}
                      onClick={() => {
                        if (item.absolutePath || item.path) {
                          void changeView?.onOpenFile?.(
                            item.absolutePath || item.path,
                          );
                        }
                      }}
                      data-testid="canvas-workbench-change-item"
                      data-change-id={item.id}
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {displayName}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {item.path}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            resolveChangeStatusClassName(item),
                          )}
                        >
                          {resolveChangeStatusIcon(item)}
                          {canvasWorkbenchText(
                            canvasT,
                            resolveChangeStatusCopyKey(item),
                          )}
                        </span>
                      </div>
                      {item.preview ? (
                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                          {item.preview}
                        </div>
                      ) : null}
                      {item.source ? (
                        <div className="mt-2 text-[11px] text-slate-400">
                          {canvasWorkbenchText(
                            canvasT,
                            "agentChat.canvasWorkbench.coding.changes.source",
                            { source: item.source },
                          )}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            {selectedChangeItem ? (
              <div className={cn(WORKBENCH_PANEL_CLASSNAME, "px-4 py-3")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-500">
                      {canvasWorkbenchText(
                        canvasT,
                        "agentChat.canvasWorkbench.coding.changes.detailTitle",
                      )}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {resolveChangeItemDisplayName(selectedChangeItem)}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {selectedChangeItem.path}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {latestCheckpointPath ? (
                      <Badge variant="outline">
                        {canvasWorkbenchText(
                          canvasT,
                          "agentChat.canvasWorkbench.coding.changes.latestCheckpoint",
                          {
                            path:
                              selectedChangeItem.checkpointLabel ||
                              latestCheckpointPath,
                          },
                        )}
                      </Badge>
                    ) : null}
                    <Badge variant="outline">
                      {selectedDiffLines.length > 0
                        ? canvasWorkbenchText(
                            canvasT,
                            "agentChat.canvasWorkbench.coding.changes.badge",
                            { count: selectedDiffLines.length },
                          )
                        : canvasWorkbenchText(
                            canvasT,
                            "agentChat.canvasWorkbench.coding.changes.noDiffBadge",
                          )}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              {selectedDiffLines.length > 0 ? (
                renderDiffState(selectedDiffLines)
              ) : selectedChangeItem?.preview ? (
                <div
                  className={cn(
                    WORKBENCH_PANEL_CLASSNAME,
                    "h-full overflow-auto p-4",
                  )}
                >
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-700">
                    {selectedChangeItem.preview}
                  </pre>
                </div>
              ) : (
                <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
                  {canvasWorkbenchText(
                    canvasT,
                    "agentChat.canvasWorkbench.coding.changes.noDiff",
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    if (!documentContext) {
      return (
        <div data-testid="canvas-workbench-panel-changes" className="p-5">
          <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
            {canvasWorkbenchText(
              canvasT,
              "agentChat.canvasWorkbench.coding.changes.empty",
            )}
          </div>
        </div>
      );
    }

    if (documentContext.previousContent === null) {
      return (
        <div data-testid="canvas-workbench-panel-changes" className="p-5">
          <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
            {canvasWorkbenchText(
              canvasT,
              "agentChat.canvasWorkbench.coding.changes.noBaseline",
            )}
          </div>
        </div>
      );
    }

    return (
      <section
        data-testid="canvas-workbench-panel-changes"
        className="flex h-full min-h-0 flex-col gap-3 p-4"
      >
        <div className={cn(WORKBENCH_PANEL_CLASSNAME, "px-4 py-3")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-500">
                {canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.coding.changes.title",
                )}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                {documentContext.title}
              </div>
              {documentContext.subtitle || documentContext.selectionPath ? (
                <div className="mt-1 truncate text-xs text-slate-500">
                  {documentContext.subtitle || documentContext.selectionPath}
                </div>
              ) : null}
            </div>
            <Badge variant="outline">
              {canvasWorkbenchText(
                canvasT,
                "agentChat.canvasWorkbench.coding.changes.badge",
                {
                  count: documentDiffLines.length,
                },
              )}
            </Badge>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {renderDiffState(documentDiffLines)}
        </div>
      </section>
    );
  };

  const renderUtilityPanel = (
    view: CanvasWorkbenchUtilityView | null | undefined,
    fallback: {
      testId: string;
      textKey: string;
    },
  ) => {
    if (view?.enabled !== false && view?.renderPanel) {
      const resolvedLeadContent =
        typeof view.leadContent === "function"
          ? view.leadContent({ openTab: (tab) => setActiveTab(tab) })
          : view.leadContent;

      return (
        <div
          data-testid={fallback.testId}
          className="flex h-full min-h-0 flex-col gap-4 p-4"
        >
          {resolvedLeadContent ? (
            <div data-testid={`${fallback.testId}-lead`}>
              {resolvedLeadContent}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">{view.renderPanel()}</div>
        </div>
      );
    }

    return (
      <div data-testid={fallback.testId} className="p-5">
        <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
          {canvasWorkbenchText(canvasT, fallback.textKey)}
        </div>
      </div>
    );
  };

  const renderDocumentPanel = () => {
    if (!documentContext) {
      return (
        <div data-testid="canvas-workbench-panel-document" className="p-5">
          <div className={WORKBENCH_MUTED_PANEL_CLASSNAME}>
            {canvasWorkbenchText(
              canvasT,
              "agentChat.canvasWorkbench.document.empty",
            )}
          </div>
        </div>
      );
    }

    const canShowDiff = documentContext.previousContent !== null;
    const showDiff = canShowDiff && documentPreviewMode === "changes";

    return (
      <section
        data-testid="canvas-workbench-panel-document"
        className="flex h-full min-h-0 flex-col gap-4 p-4"
      >
        <div className={cn(WORKBENCH_PANEL_CLASSNAME, "px-4 py-3")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {documentContext.kindLabel}
                </span>
                {documentContext.badgeLabel ? (
                  <Badge variant="outline">{documentContext.badgeLabel}</Badge>
                ) : null}
              </div>
              <div className="mt-2 truncate text-sm font-semibold text-slate-900">
                {documentContext.title}
              </div>
              {documentContext.subtitle ? (
                <div className="mt-1 truncate text-xs text-slate-500">
                  {documentContext.subtitle}
                </div>
              ) : documentContext.selectionPath ? (
                <div className="mt-1 truncate text-xs text-slate-500">
                  {documentContext.selectionPath}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.document.view.previewAria",
                )}
                onClick={() => setDocumentPreviewMode("preview")}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs transition-colors",
                  documentPreviewMode === "preview"
                    ? WORKBENCH_ACTIVE_BUTTON_CLASSNAME
                    : WORKBENCH_BUTTON_CLASSNAME,
                )}
              >
                {canvasWorkbenchText(
                  canvasT,
                  "agentChat.canvasWorkbench.document.view.preview",
                )}
              </button>
              {canShowDiff ? (
                <button
                  type="button"
                  aria-label={canvasWorkbenchText(
                    canvasT,
                    "agentChat.canvasWorkbench.document.view.changesAria",
                  )}
                  onClick={() => setDocumentPreviewMode("changes")}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-xs transition-colors",
                    documentPreviewMode === "changes"
                      ? WORKBENCH_ACTIVE_BUTTON_CLASSNAME
                      : WORKBENCH_BUTTON_CLASSNAME,
                  )}
                >
                  {canvasWorkbenchText(
                    canvasT,
                    "agentChat.canvasWorkbench.document.view.changes",
                  )}
                </button>
              ) : null}
            </div>
          </div>
          {canShowDiff ? (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
              <GitCompare className="h-3.5 w-3.5" />
              {canvasWorkbenchText(
                canvasT,
                "agentChat.canvasWorkbench.document.diffHint",
              )}
            </div>
          ) : null}
        </div>

        {renderDocumentInspector()}

        <div className="min-h-0 flex-1">
          {showDiff ? (
            renderDiffState(documentDiffLines)
          ) : (
            <div
              data-testid="canvas-workbench-preview-region"
              className="h-full min-h-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white"
            >
              {renderPreview(documentContext.target, {
                onArtifactDocumentControllerChange:
                  handleArtifactDocumentControllerChange,
              })}
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <section
      ref={shellRef}
      data-testid="canvas-workbench-shell"
      data-layout-mode={isStackedLayout ? "stacked" : "split"}
      className={cn(
        "lime-workbench-theme-scope",
        "lime-workbench-surface-scope",
        WORKBENCH_SHELL_CLASSNAME,
        "relative flex h-full min-h-0 flex-col overflow-hidden",
      )}
    >
      <header className="border-b border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 py-3">
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            isStackedLayout && "flex-col items-stretch",
          )}
        >
          <div className="min-w-0 flex-1 rounded-[24px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-1.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {primaryTabs.map((tab) =>
                renderTopTab({
                  key: tab.key,
                  label: tab.label,
                  badge: tab.badge,
                  badgeTone: tab.badgeTone,
                }),
              )}

              {!isCodingWorkbench && documentTabs.length > 0 ? (
                <div className="mx-1 h-6 w-px shrink-0 bg-[color:var(--lime-surface-border-strong)]" />
              ) : null}

              {!isCodingWorkbench
                ? documentTabs.map((tab) =>
                    renderTopTab({
                      key: tab.key,
                      label: tab.label,
                      badge: tab.badgeLabel || tab.kindLabel,
                      closable: true,
                    }),
                  )
                : null}
            </div>
          </div>

          {activeTab !== "team" && activePreviewContext ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {renderHeaderActionButton({
                label: translateWorkbench(
                  "agentChat.canvasWorkbench.actions.copyPath",
                ),
                disabled: !activeSelectionPath,
                onClick: () => {
                  void handleCopyPath();
                },
                icon: <Copy className="h-4 w-4" />,
              })}
              {renderHeaderActionButton({
                label: translateWorkbench(
                  "agentChat.canvasWorkbench.actions.revealPath",
                ),
                disabled: !activeSelectionPath,
                onClick: () => {
                  if (activeSelectionPath) {
                    void onRevealPath(activeSelectionPath);
                  }
                },
                icon: <FolderOpen className="h-4 w-4" />,
              })}
              {renderHeaderActionButton({
                label: translateWorkbench(
                  "agentChat.canvasWorkbench.actions.openPath",
                ),
                disabled: !activeSelectionPath,
                onClick: () => {
                  if (activeSelectionPath) {
                    void onOpenPath(activeSelectionPath);
                  }
                },
                icon: <ExternalLink className="h-4 w-4" />,
              })}
              {renderHeaderActionButton({
                label: translateWorkbench(
                  "agentChat.canvasWorkbench.actions.download",
                ),
                disabled: !activeContent.trim(),
                onClick: handleDownload,
                icon: <Download className="h-4 w-4" />,
              })}
            </div>
          ) : null}

          {onClose ? (
            <button
              type="button"
              aria-label={closeWorkbenchLabel}
              title={closeWorkbenchLabel}
              onClick={onClose}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                WORKBENCH_GHOST_BUTTON_CLASSNAME,
              )}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </header>

      <div
        data-testid="canvas-workbench-layout"
        data-panel-placement="canvas"
        className="min-h-0 flex-1 overflow-hidden bg-[image:var(--lime-stage-surface-soft)]"
      >
        {activeTab === "preview"
          ? renderPreviewPanel()
          : activeTab === "workspace"
            ? renderWorkspacePanel()
            : activeTab === "changes"
              ? renderChangesPanel()
              : activeTab === "outputs"
                ? renderUtilityPanel(outputView, {
                    testId: "canvas-workbench-panel-outputs",
                    textKey: "agentChat.canvasWorkbench.coding.outputs.empty",
                  })
                : activeTab === "logs"
                  ? renderUtilityPanel(logView || sessionView, {
                      testId: "canvas-workbench-panel-logs",
                      textKey: "agentChat.canvasWorkbench.coding.logs.empty",
                    })
                  : activeTab === "team"
                    ? renderTeamPanel()
                    : activeTab === "session"
                      ? renderSessionPanel()
                      : renderDocumentPanel()}
      </div>
    </section>
  );
});
