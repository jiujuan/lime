import {
  startTransition,
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useWorkspaceCanvasLayoutRuntime } from "./useWorkspaceCanvasLayoutRuntime";
import { useWorkspaceCanvasTaskFileSync } from "./useWorkspaceCanvasTaskFileSync";

type CanvasLayoutParams = Parameters<typeof useWorkspaceCanvasLayoutRuntime>[0];
type CanvasTaskFileSyncParams = Parameters<
  typeof useWorkspaceCanvasTaskFileSync
>[0];

interface UseWorkspaceCanvasSurfaceRuntimeParams {
  layout: CanvasLayoutParams;
  selection: {
    activeTheme: string;
    contentId?: string | null;
    setSelectedText: Dispatch<SetStateAction<string>>;
  };
  taskFileSync: CanvasTaskFileSyncParams;
}

/** 画布布局和任务文件同步共享同一 surface，避免父级重复编排。 */
export function useWorkspaceCanvasSurfaceRuntime({
  layout,
  selection: { activeTheme, contentId, setSelectedText },
  taskFileSync,
}: UseWorkspaceCanvasSurfaceRuntimeParams) {
  const handleCanvasSelectionTextChange = useCallback(
    (text: string) => {
      const normalized = text.trim().replace(/\s+/g, " ");
      const nextValue =
        normalized.length > 500 ? normalized.slice(0, 500) : normalized;
      startTransition(() => {
        setSelectedText((previous) =>
          previous === nextValue ? previous : nextValue,
        );
      });
    },
    [setSelectedText],
  );

  useEffect(() => {
    setSelectedText("");
  }, [activeTheme, contentId, setSelectedText]);

  const layoutRuntime = useWorkspaceCanvasLayoutRuntime(layout);
  useWorkspaceCanvasTaskFileSync(taskFileSync);

  return {
    ...layoutRuntime,
    handleCanvasSelectionTextChange,
  };
}
