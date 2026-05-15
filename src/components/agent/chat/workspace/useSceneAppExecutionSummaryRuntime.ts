import { useCallback, useMemo } from "react";
import type { SceneAppRunSummary } from "@/lib/agent/legacySceneAppExecutionSummary";
import type {
  SceneAppExecutionSummaryViewModel,
  SceneAppRunDetailViewModel,
} from "@/lib/agent/legacySceneAppExecutionSummary";

interface UseSceneAppExecutionSummaryRuntimeParams {
  initialSummary?: SceneAppExecutionSummaryViewModel | null;
  sessionId?: string | null;
  isSending: boolean;
}

export interface SceneAppExecutionSummaryRuntimeState {
  summary?: SceneAppExecutionSummaryViewModel | null;
  latestPackResultDetailView: SceneAppRunDetailViewModel | null;
  latestPackResultUsesFallback: boolean;
  reviewTargetRunSummary: SceneAppRunSummary | null;
  loading: boolean;
  requestRefresh: () => void;
}

function createInitialRuntimeState(params: {
  initialSummary?: SceneAppExecutionSummaryViewModel | null;
}): Omit<SceneAppExecutionSummaryRuntimeState, "requestRefresh"> {
  return {
    summary: params.initialSummary ?? null,
    latestPackResultDetailView: null,
    latestPackResultUsesFallback: false,
    reviewTargetRunSummary: null,
    loading: false,
  };
}

export function useSceneAppExecutionSummaryRuntime({
  initialSummary,
}: UseSceneAppExecutionSummaryRuntimeParams):
  | SceneAppExecutionSummaryRuntimeState
  | undefined {
  const requestRefresh = useCallback(() => {
    // SceneApp 独立运行面已下线；历史摘要只保留当前 payload 内的只读信息。
  }, []);

  return useMemo(
    () => ({
      ...createInitialRuntimeState({ initialSummary }),
      requestRefresh,
    }),
    [initialSummary, requestRefresh],
  );
}
