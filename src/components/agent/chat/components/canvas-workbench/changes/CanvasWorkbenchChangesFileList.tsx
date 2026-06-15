import { type ReactNode, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeTreeNode,
} from "./CanvasWorkbenchChangesPanelViewModel";
import { CanvasWorkbenchChangeStatusMark } from "./CanvasWorkbenchChangeStatusMark";
import { resolveCanvasWorkbenchChangeTreeNodeMeta } from "./CanvasWorkbenchChangeTreeMeta";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface RenderChangeTreeNodeOptions {
  nodes: CanvasWorkbenchChangeTreeNode[];
  selectedChangeItem: CanvasWorkbenchChangeItem | undefined;
  collapsedFolderIds: Set<string>;
  onSelectChangeItem?: (item: CanvasWorkbenchChangeItem) => void;
  onToggleFolder: (nodeId: string) => void;
  translateWorkbench: CanvasWorkbenchTranslation;
}

function resolveFileIcon(path: string) {
  const normalizedPath = path.toLowerCase();
  if (normalizedPath.endsWith(".json")) {
    return FileJson;
  }
  if (
    normalizedPath.endsWith(".ts") ||
    normalizedPath.endsWith(".tsx") ||
    normalizedPath.endsWith(".js") ||
    normalizedPath.endsWith(".jsx") ||
    normalizedPath.endsWith(".css") ||
    normalizedPath.endsWith(".html")
  ) {
    return FileCode;
  }
  return FileText;
}

function resolveFileBadge(path: string): string | null {
  const extension = path.split(".").pop()?.trim().toLowerCase();
  if (!extension) {
    return null;
  }
  if (extension === "tsx" || extension === "ts") {
    return "TS";
  }
  if (extension === "jsx" || extension === "js" || extension === "mjs") {
    return "JS";
  }
  if (extension === "md" || extension === "mdx") {
    return "MD";
  }
  if (extension === "rs") {
    return "RS";
  }
  if (extension === "json") {
    return "{}";
  }
  return extension.length <= 3 ? extension.toUpperCase() : null;
}

function renderChangeTreeNodes({
  nodes,
  selectedChangeItem,
  collapsedFolderIds,
  onSelectChangeItem,
  onToggleFolder,
  translateWorkbench,
}: RenderChangeTreeNodeOptions): ReactNode {
  return nodes.map((node) => {
    const paddingLeft = 8 + node.depth * 14;
    const meta = resolveCanvasWorkbenchChangeTreeNodeMeta(node);

    if (node.type === "folder") {
      const collapsed = collapsedFolderIds.has(node.id);
      const FolderIcon = collapsed ? Folder : FolderOpen;
      return (
        <div key={node.id}>
          <button
            type="button"
            className="flex h-7 w-full items-center gap-1 rounded-[6px] pr-2 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-950"
            style={{ paddingLeft }}
            onClick={() => onToggleFolder(node.id)}
            data-testid="canvas-workbench-change-folder"
            data-change-folder-id={node.id}
            title={node.path}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            )}
            <FolderIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <CanvasWorkbenchChangeStatusMark
              meta={meta}
              translateWorkbench={translateWorkbench}
              className="ml-1"
            />
          </button>
          {collapsed
            ? null
            : renderChangeTreeNodes({
                nodes: node.children,
                selectedChangeItem,
                collapsedFolderIds,
                onSelectChangeItem,
                onToggleFolder,
                translateWorkbench,
              })}
        </div>
      );
    }

    const item = node.item;
    const active = item.id === selectedChangeItem?.id;
    const FileIcon = resolveFileIcon(item.path);
    const fileBadge = resolveFileBadge(item.path);

    return (
      <button
        key={node.id}
        type="button"
        className={cn(
          "group flex min-h-8 w-full items-start gap-1.5 rounded-[6px] py-1 pr-2 text-left text-[13px] transition-colors",
          active
            ? "bg-emerald-50 text-slate-950 shadow-[inset_2px_0_0_#22c55e]"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
        )}
        style={{ paddingLeft }}
        onClick={() => onSelectChangeItem?.(item)}
        disabled={!onSelectChangeItem}
        data-testid="canvas-workbench-change-item"
        data-change-id={item.id}
        title={item.path}
      >
        {fileBadge ? (
          <span
            className={cn(
              "mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[4px] bg-sky-50 px-0.5 font-mono text-[9px] font-bold leading-none text-sky-700",
              active && "bg-white text-sky-700",
            )}
          >
            {fileBadge}
          </span>
        ) : (
          <FileIcon
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0",
              active ? "text-slate-700" : "text-slate-400",
            )}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{node.name}</span>
          {item.preview ? (
            <span
              className={cn(
                "mt-0.5 block truncate font-mono text-[11px]",
                active ? "text-emerald-700" : "text-slate-500",
              )}
            >
              {item.preview}
            </span>
          ) : null}
        </span>
        <CanvasWorkbenchChangeStatusMark
          meta={meta}
          translateWorkbench={translateWorkbench}
          className="ml-1 mt-0.5"
        />
      </button>
    );
  });
}

export function CanvasWorkbenchChangesFileList({
  fileTree,
  selectedChangeItem,
  fileFilter,
  disabled,
  translateWorkbench,
  onFileFilterChange,
  onSelectChangeItem,
}: {
  fileTree: CanvasWorkbenchChangeTreeNode[];
  selectedChangeItem: CanvasWorkbenchChangeItem | undefined;
  fileFilter: string;
  disabled?: boolean;
  translateWorkbench: CanvasWorkbenchTranslation;
  onFileFilterChange?: (value: string) => void;
  onSelectChangeItem?: (item: CanvasWorkbenchChangeItem) => void;
}) {
  const filterDisabled = Boolean(disabled || !onFileFilterChange);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const handleToggleFolder = (nodeId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <aside
      className="flex min-h-0 flex-col border-l border-slate-200 bg-slate-50"
      data-testid="canvas-workbench-changes-file-list"
    >
      <div className="px-2 py-2">
        <label className="flex h-8 items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-2.5 text-xs text-slate-500 shadow-sm shadow-slate-950/5">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            value={fileFilter}
            disabled={filterDisabled}
            onChange={(event) => onFileFilterChange?.(event.target.value)}
            placeholder={translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.filterFiles",
            )}
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
            data-testid="canvas-workbench-changes-file-filter"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {fileTree.length > 0 ? (
          <div className="space-y-px">
            {renderChangeTreeNodes({
              nodes: fileTree,
              selectedChangeItem,
              collapsedFolderIds,
              onSelectChangeItem,
              onToggleFolder: handleToggleFolder,
              translateWorkbench,
            })}
          </div>
        ) : (
          <div className="px-2 py-3 text-xs text-slate-500">
            {translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.filterEmpty",
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
