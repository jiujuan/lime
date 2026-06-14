import { type CSSProperties, type ReactNode } from "react";
import { CanvasWorkbenchChangesContent } from "./CanvasWorkbenchChangesContent";
import {
  CanvasWorkbenchChangesToolbar,
  type CanvasWorkbenchChangesToolbarProps,
} from "./CanvasWorkbenchChangesToolbar";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeTreeNode,
} from "./CanvasWorkbenchChangesPanelViewModel";
import type { CanvasWorkbenchTranslation } from "./CanvasWorkbenchChangesTypes";

export interface CanvasWorkbenchReviewSurfaceProps {
  toolbar: CanvasWorkbenchChangesToolbarProps;
  detail: ReactNode;
  filesPanelOpen: boolean;
  filesPanelGridStyle: CSSProperties | undefined;
  filesPanelResizeHandle: ReactNode;
  fileTree: CanvasWorkbenchChangeTreeNode[];
  selectedChangeItem?: CanvasWorkbenchChangeItem;
  fileFilter: string;
  fileListDisabled?: boolean;
  translateWorkbench: CanvasWorkbenchTranslation;
  onFileFilterChange?: (value: string) => void;
  onSelectChangeItem?: (item: CanvasWorkbenchChangeItem) => void;
}

export function CanvasWorkbenchReviewSurface({
  toolbar,
  detail,
  filesPanelOpen,
  filesPanelGridStyle,
  filesPanelResizeHandle,
  fileTree,
  selectedChangeItem,
  fileFilter,
  fileListDisabled,
  translateWorkbench,
  onFileFilterChange,
  onSelectChangeItem,
}: CanvasWorkbenchReviewSurfaceProps) {
  return (
    <section
      data-testid="canvas-workbench-panel-changes"
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-white"
    >
      <CanvasWorkbenchChangesToolbar {...toolbar} />
      <CanvasWorkbenchChangesContent
        filesPanelOpen={filesPanelOpen}
        filesPanelGridStyle={filesPanelGridStyle}
        filesPanelResizeHandle={filesPanelResizeHandle}
        fileTree={fileTree}
        selectedChangeItem={selectedChangeItem}
        fileFilter={fileFilter}
        fileListDisabled={fileListDisabled}
        translateWorkbench={translateWorkbench}
        onFileFilterChange={onFileFilterChange}
        onSelectChangeItem={onSelectChangeItem}
        detail={detail}
      />
    </section>
  );
}
