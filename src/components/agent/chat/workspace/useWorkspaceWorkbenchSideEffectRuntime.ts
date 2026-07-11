import { useRef } from "react";
import { useGeneralWorkbenchInitialAutoGuideRuntime } from "./useGeneralWorkbenchInitialDispatchRuntime";
import { useWorkspaceMediaTaskRuntime } from "./useWorkspaceMediaTaskRuntime";

type AutoGuideParams = Parameters<
  typeof useGeneralWorkbenchInitialAutoGuideRuntime
>[0];
type MediaTaskParams = Parameters<typeof useWorkspaceMediaTaskRuntime>[0];

interface UseWorkspaceWorkbenchSideEffectRuntimeParams {
  autoGuide: Omit<AutoGuideParams, "triggerAIGuideRef">;
  mediaTask: MediaTaskParams;
  triggerAIGuide: AutoGuideParams["triggerAIGuideRef"]["current"];
}

/** 工作台自动引导与媒体任务副作用在同一运行面注册。 */
export function useWorkspaceWorkbenchSideEffectRuntime({
  autoGuide,
  mediaTask,
  triggerAIGuide,
}: UseWorkspaceWorkbenchSideEffectRuntimeParams): void {
  const triggerAIGuideRef = useRef(triggerAIGuide);
  triggerAIGuideRef.current = triggerAIGuide;

  useGeneralWorkbenchInitialAutoGuideRuntime({
    ...autoGuide,
    triggerAIGuideRef,
  });
  useWorkspaceMediaTaskRuntime(mediaTask);
}
