import type { WorkflowProgressSnapshot } from "../agentChatWorkspaceContract";
import { useWorkspaceWorkflowProgressRuntime } from "./useWorkspaceWorkflowProgressRuntime";

export const EMPTY_WORKSPACE_WORKFLOW_STEPS: never[] = [];
export const HIDDEN_WORKSPACE_WORKFLOW_STEP_INDEX = 0;

export function ignoreHiddenWorkspaceWorkflowStepClick(index: number): void {
  void index;
}

interface UseWorkspaceHiddenWorkflowProgressRuntimeParams {
  hasMessages: boolean;
  isSpecializedThemeMode: boolean;
  onWorkflowProgressChange?: (
    snapshot: WorkflowProgressSnapshot | null,
  ) => void;
}

export function useWorkspaceHiddenWorkflowProgressRuntime({
  hasMessages,
  isSpecializedThemeMode,
  onWorkflowProgressChange,
}: UseWorkspaceHiddenWorkflowProgressRuntimeParams): void {
  useWorkspaceWorkflowProgressRuntime({
    currentStepIndex: HIDDEN_WORKSPACE_WORKFLOW_STEP_INDEX,
    hasMessages,
    isSpecializedThemeMode,
    onWorkflowProgressChange,
    steps: EMPTY_WORKSPACE_WORKFLOW_STEPS,
  });
}
