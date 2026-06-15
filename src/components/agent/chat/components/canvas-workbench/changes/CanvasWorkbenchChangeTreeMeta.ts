import type {
  CanvasWorkbenchChangeDisplayMeta,
  CanvasWorkbenchChangeKind,
  CanvasWorkbenchChangeTreeNode,
} from "./CanvasWorkbenchChangesPanelViewModel";
import { resolveChangeDisplayMeta } from "./CanvasWorkbenchChangesPanelViewModel";

const CANVAS_WORKBENCH_CHANGE_KIND_PRIORITY: CanvasWorkbenchChangeKind[] = [
  "deleted",
  "added",
  "renamed",
  "copied",
  "modified",
  "unknown",
];

function resolveChangeMetaPriority(kind: CanvasWorkbenchChangeKind): number {
  const priority = CANVAS_WORKBENCH_CHANGE_KIND_PRIORITY.indexOf(kind);
  return priority >= 0 ? priority : CANVAS_WORKBENCH_CHANGE_KIND_PRIORITY.length;
}

export function resolveCanvasWorkbenchChangeTreeNodeMeta(
  node: CanvasWorkbenchChangeTreeNode,
): CanvasWorkbenchChangeDisplayMeta | null {
  if (node.type === "file") {
    return resolveChangeDisplayMeta(node.item);
  }

  const childMeta = node.children
    .map((child) => resolveCanvasWorkbenchChangeTreeNodeMeta(child))
    .filter((meta): meta is CanvasWorkbenchChangeDisplayMeta => Boolean(meta))
    .sort(
      (left, right) =>
        resolveChangeMetaPriority(left.kind) -
        resolveChangeMetaPriority(right.kind),
    )[0];

  return childMeta || null;
}
