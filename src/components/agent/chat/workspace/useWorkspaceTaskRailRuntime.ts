import { useCallback, useMemo } from "react";
import type {
  AgentRuntimeThreadReadModel,
  AgentSessionExecutionRuntime,
  AgentTodoItem,
} from "@/lib/api/agentRuntime";
import type { CanonicalChildThreadSummary } from "../projection/canonicalChildThreadSummary";
import type { SidebarActivityLog } from "../hooks/useThemeContextWorkspace";
import type {
  ActionRequired,
  AgentThreadItem,
  ConfirmResponse,
  Message,
} from "../types";
import {
  buildGeneralWorkbenchTaskRailRuntimeContext,
  type GeneralWorkbenchTaskRailContextInput,
} from "../components/generalWorkbenchTaskRailViewModel";
import type { GeneralWorkbenchCreationTaskEvent } from "../components/generalWorkbenchWorkflowData";
import type { GeneralWorkbenchWorkflowStepInput } from "../components/generalWorkbenchWorkflowPanelViewModel";
import { resolveAbsoluteWorkspacePath } from "./workspacePath";

export interface WorkspaceTaskRailRuntimeInput {
  sessionId?: string | null;
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  messages: Message[];
  activityLogs?: SidebarActivityLog[];
  creationTaskEvents?: GeneralWorkbenchCreationTaskEvent[];
  pendingActions?: readonly ActionRequired[];
  submittedActionsInFlight?: readonly ActionRequired[];
  threadItems?: readonly AgentThreadItem[];
  todoItems?: readonly AgentTodoItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  executionRuntime?: AgentSessionExecutionRuntime | null;
  canonicalChildren?: CanonicalChildThreadSummary[];
  providerType?: string | null;
  model?: string | null;
  accessMode?: GeneralWorkbenchTaskRailContextInput["accessMode"];
  reasoningEffort?: string | null;
  projectRootPath?: string | null;
  canvasWorkbenchRootPath?: string | null;
  onOpenWorkspacePath: (path: string) => void | Promise<void>;
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
}

export interface WorkspaceTaskRailProps {
  sessionId?: string | null;
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  messages: Message[];
  activityLogs?: SidebarActivityLog[];
  creationTaskEvents?: GeneralWorkbenchCreationTaskEvent[];
  pendingActions?: readonly ActionRequired[];
  submittedActionsInFlight?: readonly ActionRequired[];
  threadItems?: readonly AgentThreadItem[];
  todoItems?: readonly AgentTodoItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  executionRuntime?: AgentSessionExecutionRuntime | null;
  canonicalChildren?: CanonicalChildThreadSummary[];
  providerType?: string | null;
  model?: string | null;
  accessMode?: GeneralWorkbenchTaskRailContextInput["accessMode"];
  reasoningEffort?: string | null;
  workspaceRootPath: string | null;
  onOpenOutput: (path: string) => void | Promise<void>;
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
}

export function resolveWorkspaceTaskRailRootPath({
  projectRootPath,
  canvasWorkbenchRootPath,
}: Pick<
  WorkspaceTaskRailRuntimeInput,
  "projectRootPath" | "canvasWorkbenchRootPath"
>) {
  return projectRootPath?.trim() || canvasWorkbenchRootPath?.trim() || null;
}

export function buildWorkspaceTaskRailRuntimeContext({
  providerType,
  model,
  accessMode,
  reasoningEffort,
  workspaceRootPath,
  threadRead,
  threadItems,
  canonicalChildren = [],
}: Pick<
  WorkspaceTaskRailRuntimeInput,
  | "providerType"
  | "model"
  | "accessMode"
  | "reasoningEffort"
  | "threadRead"
  | "threadItems"
  | "canonicalChildren"
> & {
  workspaceRootPath: string | null;
}): GeneralWorkbenchTaskRailContextInput {
  return (
    buildGeneralWorkbenchTaskRailRuntimeContext({
      context: {
        providerType,
        model,
        accessMode,
        reasoningEffort,
        workspacePath: workspaceRootPath,
      },
      threadRead,
      threadItems,
      canonicalChildren,
    }) ?? {}
  );
}

export function useWorkspaceTaskRailRuntime({
  sessionId,
  workflowSteps,
  messages,
  activityLogs,
  creationTaskEvents,
  pendingActions,
  submittedActionsInFlight,
  threadItems,
  todoItems,
  threadRead,
  executionRuntime,
  canonicalChildren,
  providerType,
  model,
  accessMode,
  reasoningEffort,
  projectRootPath,
  canvasWorkbenchRootPath,
  onOpenWorkspacePath,
  onRespondToAction,
}: WorkspaceTaskRailRuntimeInput): WorkspaceTaskRailProps {
  const workspaceRootPath = resolveWorkspaceTaskRailRootPath({
    projectRootPath,
    canvasWorkbenchRootPath,
  });

  const handleOpenOutput = useCallback(
    (path: string) =>
      onOpenWorkspacePath(
        resolveAbsoluteWorkspacePath(workspaceRootPath, path) || path,
      ),
    [onOpenWorkspacePath, workspaceRootPath],
  );

  return useMemo(
    () => ({
      sessionId,
      workflowSteps,
      messages,
      activityLogs,
      creationTaskEvents,
      pendingActions,
      submittedActionsInFlight,
      threadItems,
      todoItems,
      threadRead,
      executionRuntime,
      canonicalChildren,
      providerType,
      model,
      accessMode,
      reasoningEffort,
      workspaceRootPath,
      onOpenOutput: handleOpenOutput,
      onRespondToAction,
    }),
    [
      sessionId,
      accessMode,
      activityLogs,
      creationTaskEvents,
      handleOpenOutput,
      messages,
      model,
      onRespondToAction,
      pendingActions,
      providerType,
      reasoningEffort,
      threadRead,
      executionRuntime,
      submittedActionsInFlight,
      threadItems,
      todoItems,
      workflowSteps,
      workspaceRootPath,
      canonicalChildren,
    ],
  );
}
