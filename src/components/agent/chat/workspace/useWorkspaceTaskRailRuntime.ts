import { useCallback, useMemo } from "react";
import type {
  AgentRuntimeThreadReadModel,
  AsterTodoItem,
  AsterSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
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
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  messages: Message[];
  activityLogs?: SidebarActivityLog[];
  creationTaskEvents?: GeneralWorkbenchCreationTaskEvent[];
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  threadItems?: AgentThreadItem[];
  todoItems?: AsterTodoItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  childSubagentSessions?: AsterSubagentSessionInfo[];
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
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  messages: Message[];
  activityLogs?: SidebarActivityLog[];
  creationTaskEvents?: GeneralWorkbenchCreationTaskEvent[];
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  threadItems?: AgentThreadItem[];
  todoItems?: AsterTodoItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  childSubagentSessions?: AsterSubagentSessionInfo[];
  context: GeneralWorkbenchTaskRailContextInput;
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
  childSubagentSessions = [],
}: Pick<
  WorkspaceTaskRailRuntimeInput,
  | "providerType"
  | "model"
  | "accessMode"
  | "reasoningEffort"
  | "threadRead"
  | "threadItems"
  | "childSubagentSessions"
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
      childSubagentSessions,
    }) ?? {}
  );
}

export function useWorkspaceTaskRailRuntime({
  workflowSteps,
  messages,
  activityLogs,
  creationTaskEvents,
  pendingActions,
  submittedActionsInFlight,
  threadItems,
  todoItems,
  threadRead,
  childSubagentSessions,
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
      workflowSteps,
      messages,
      activityLogs,
      creationTaskEvents,
      pendingActions,
      submittedActionsInFlight,
      threadItems,
      todoItems,
      threadRead,
      childSubagentSessions,
      context: buildWorkspaceTaskRailRuntimeContext({
        providerType,
        model,
        accessMode,
        reasoningEffort,
        workspaceRootPath,
        threadRead,
        threadItems,
        childSubagentSessions,
      }),
      onOpenOutput: handleOpenOutput,
      onRespondToAction,
    }),
    [
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
      submittedActionsInFlight,
      threadItems,
      todoItems,
      workflowSteps,
      workspaceRootPath,
      childSubagentSessions,
    ],
  );
}
