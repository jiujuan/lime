import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

const MIN_FILES_PANEL_WIDTH = 220;
const MAX_FILES_PANEL_WIDTH = 420;
const DEFAULT_FILES_PANEL_WIDTH = 252;

export interface CanvasWorkbenchChangesFilesPanelResizeState {
  filesPanelWidth: number;
  filesPanelGridStyle: CSSProperties | undefined;
  handleFilesPanelResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  handleFilesPanelResizeMove: (event: PointerEvent<HTMLDivElement>) => void;
  handleFilesPanelResizeEnd: (event: PointerEvent<HTMLDivElement>) => void;
  handleFilesPanelResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function useCanvasWorkbenchChangesFilesPanelResize(
  filesPanelOpen: boolean,
): CanvasWorkbenchChangesFilesPanelResizeState {
  const [filesPanelWidth, setFilesPanelWidth] = useState(
    DEFAULT_FILES_PANEL_WIDTH,
  );
  const dragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleFilesPanelResizeStart = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!filesPanelOpen) {
        return;
      }
      event.preventDefault();
      dragStartRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: filesPanelWidth,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [filesPanelOpen, filesPanelWidth],
  );

  const handleFilesPanelResizeMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragStart = dragStartRef.current;
      if (!dragStart || dragStart.pointerId !== event.pointerId) {
        return;
      }
      const nextWidth =
        dragStart.startWidth - (event.clientX - dragStart.startX);
      setFilesPanelWidth(
        Math.min(
          MAX_FILES_PANEL_WIDTH,
          Math.max(MIN_FILES_PANEL_WIDTH, nextWidth),
        ),
      );
    },
    [],
  );

  const handleFilesPanelResizeEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragStart = dragStartRef.current;
      if (!dragStart || dragStart.pointerId !== event.pointerId) {
        return;
      }
      dragStartRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleFilesPanelResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setFilesPanelWidth((width) =>
          Math.min(MAX_FILES_PANEL_WIDTH, width + 16),
        );
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setFilesPanelWidth((width) =>
          Math.max(MIN_FILES_PANEL_WIDTH, width - 16),
        );
      }
    },
    [],
  );

  return {
    filesPanelWidth,
    filesPanelGridStyle: filesPanelOpen
      ? {
          gridTemplateColumns: `minmax(0, 1fr) ${filesPanelWidth}px`,
        }
      : undefined,
    handleFilesPanelResizeStart,
    handleFilesPanelResizeMove,
    handleFilesPanelResizeEnd,
    handleFilesPanelResizeKeyDown,
  };
}
