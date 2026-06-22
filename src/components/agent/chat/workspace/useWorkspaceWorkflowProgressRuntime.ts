import { useEffect, useMemo, useRef } from "react";
import type { StepStatus } from "@/lib/workspace/workbenchContract";
import type { WorkflowProgressSnapshot } from "../agentChatWorkspaceContract";

export interface WorkspaceWorkflowProgressStep {
  id: string;
  title: string;
  status: StepStatus;
}

export interface WorkspaceWorkflowProgressRuntimeParams {
  currentStepIndex: number;
  hasMessages: boolean;
  isSpecializedThemeMode: boolean;
  onWorkflowProgressChange?: (
    snapshot: WorkflowProgressSnapshot | null,
  ) => void;
  steps: readonly WorkspaceWorkflowProgressStep[];
}

export function shouldEnableWorkspaceWorkflowProgress({
  hasMessages,
  isSpecializedThemeMode,
  steps,
}: Pick<
  WorkspaceWorkflowProgressRuntimeParams,
  "hasMessages" | "isSpecializedThemeMode" | "steps"
>): boolean {
  return isSpecializedThemeMode && hasMessages && steps.length > 0;
}

export function buildWorkspaceWorkflowProgressSnapshot({
  currentStepIndex,
  enabled,
  steps,
}: {
  currentStepIndex: number;
  enabled: boolean;
  steps: readonly WorkspaceWorkflowProgressStep[];
}): WorkflowProgressSnapshot | null {
  if (!enabled) {
    return null;
  }

  return {
    currentIndex: currentStepIndex,
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      status: step.status,
    })),
  };
}

export function buildWorkspaceWorkflowProgressSignature(
  snapshot: WorkflowProgressSnapshot | null,
): string {
  if (!snapshot) {
    return "hidden";
  }

  const stepSignature = snapshot.steps
    .map((step) => `${step.id}:${step.status}:${step.title}`)
    .join("|");
  return `${snapshot.currentIndex}:${stepSignature}`;
}

export function useWorkspaceWorkflowProgressRuntime({
  currentStepIndex,
  hasMessages,
  isSpecializedThemeMode,
  onWorkflowProgressChange,
  steps,
}: WorkspaceWorkflowProgressRuntimeParams): void {
  const enabled = shouldEnableWorkspaceWorkflowProgress({
    hasMessages,
    isSpecializedThemeMode,
    steps,
  });
  const snapshot = useMemo(
    () =>
      buildWorkspaceWorkflowProgressSnapshot({
        currentStepIndex,
        enabled,
        steps,
      }),
    [currentStepIndex, enabled, steps],
  );
  const signature = useMemo(
    () => buildWorkspaceWorkflowProgressSignature(snapshot),
    [snapshot],
  );
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!onWorkflowProgressChange) {
      return;
    }

    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;
    onWorkflowProgressChange(snapshot);
  }, [onWorkflowProgressChange, signature, snapshot]);

  useEffect(() => {
    return () => {
      onWorkflowProgressChange?.(null);
    };
  }, [onWorkflowProgressChange]);
}
