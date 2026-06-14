import { type ReactNode } from "react";
import {
  ChevronDown,
  FileCode,
  FileJson,
  FileText,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeTreeNode,
} from "./CanvasWorkbenchChangesPanelViewModel";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface RenderChangeTreeNodeOptions {
  nodes: CanvasWorkbenchChangeTreeNode[];
  selectedChangeItem: CanvasWorkbenchChangeItem | undefined;
  onSelectChangeItem?: (item: CanvasWorkbenchChangeItem) => void;
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

function renderChangeTreeNodes({
  nodes,
  selectedChangeItem,
  onSelectChangeItem,
}: RenderChangeTreeNodeOptions): ReactNode {
  return nodes.map((node) => {
    const paddingLeft = 8 + node.depth * 14;

    if (node.type === "folder") {
      return (
        <div key={node.id}>
          <div
            className="flex h-7 items-center gap-1 rounded-[6px] pr-2 text-[13px] font-medium text-slate-500"
            style={{ paddingLeft }}
          >
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{node.name}</span>
          </div>
          {renderChangeTreeNodes({
            nodes: node.children,
            selectedChangeItem,
            onSelectChangeItem,
          })}
        </div>
      );
    }

    const item = node.item;
    const active = item.id === selectedChangeItem?.id;
    const FileIcon = resolveFileIcon(item.path);

    return (
      <button
        key={node.id}
        type="button"
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-[6px] pr-2 text-left text-[13px] transition-colors",
          active
            ? "bg-slate-100 text-slate-950"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
        )}
        style={{ paddingLeft }}
        onClick={() => onSelectChangeItem?.(item)}
        disabled={!onSelectChangeItem}
        data-testid="canvas-workbench-change-item"
        data-change-id={item.id}
        title={item.path}
      >
        <FileIcon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            active ? "text-slate-700" : "text-slate-400",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
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
              onSelectChangeItem,
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
