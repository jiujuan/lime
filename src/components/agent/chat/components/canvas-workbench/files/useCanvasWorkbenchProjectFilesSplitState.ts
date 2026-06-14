import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

const DEFAULT_TREE_WIDTH_PERCENT = 34;
const MIN_TREE_WIDTH_PERCENT = 24;
const MAX_TREE_WIDTH_PERCENT = 52;
const KEYBOARD_STEP_PERCENT = 2;

function clampTreeWidthPercent(value: number): number {
  return Math.min(
    MAX_TREE_WIDTH_PERCENT,
    Math.max(MIN_TREE_WIDTH_PERCENT, value),
  );
}

export function useCanvasWorkbenchProjectFilesSplitState() {
  const containerRef = useRef<HTMLElement | null>(null);
  const [treeWidthPercent, setTreeWidthPercent] = useState(
    DEFAULT_TREE_WIDTH_PERCENT,
  );

  const updateFromPointer = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const treeWidth = rect.right - clientX;
    setTreeWidthPercent(clampTreeWidthPercent((treeWidth / rect.width) * 100));
  }, []);

  const handleResizerPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateFromPointer(event.clientX);

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        updateFromPointer(moveEvent.clientX);
      };
      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [updateFromPointer],
  );

  const handleResizerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      setTreeWidthPercent((current) =>
        clampTreeWidthPercent(
          current +
            (event.key === "ArrowLeft"
              ? KEYBOARD_STEP_PERCENT
              : -KEYBOARD_STEP_PERCENT),
        ),
      );
    },
    [],
  );

  return {
    containerRef,
    treeWidthPercent,
    minTreeWidthPercent: MIN_TREE_WIDTH_PERCENT,
    maxTreeWidthPercent: MAX_TREE_WIDTH_PERCENT,
    handleResizerPointerDown,
    handleResizerKeyDown,
  };
}
