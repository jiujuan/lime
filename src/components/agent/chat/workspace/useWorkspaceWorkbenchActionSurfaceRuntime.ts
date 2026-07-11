import { useWorkspaceCanvasWorkflowActions } from "./useWorkspaceCanvasWorkflowActions";
import { useWorkspaceGeneralWorkbenchEntryPromptActionsRuntime } from "./useWorkspaceGeneralWorkbenchEntryPromptActionsRuntime";

type EntryPromptParams = Parameters<
  typeof useWorkspaceGeneralWorkbenchEntryPromptActionsRuntime
>[0];
type CanvasWorkflowParams = Parameters<
  typeof useWorkspaceCanvasWorkflowActions
>[0];

interface UseWorkspaceWorkbenchActionSurfaceRuntimeParams {
  canvasWorkflow: CanvasWorkflowParams;
  entryPrompt: EntryPromptParams;
}

/** General Workbench 的入口提示与画布动作共用发送链，集中在同一 surface。 */
export function useWorkspaceWorkbenchActionSurfaceRuntime({
  canvasWorkflow,
  entryPrompt,
}: UseWorkspaceWorkbenchActionSurfaceRuntimeParams) {
  const entryPromptRuntime =
    useWorkspaceGeneralWorkbenchEntryPromptActionsRuntime(entryPrompt);
  const canvasWorkflowRuntime =
    useWorkspaceCanvasWorkflowActions(canvasWorkflow);

  return {
    ...entryPromptRuntime,
    ...canvasWorkflowRuntime,
  };
}
