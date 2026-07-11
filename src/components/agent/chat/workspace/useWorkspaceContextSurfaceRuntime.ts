import { useEffect, useMemo } from "react";
import type {
  AgentRuntimeThreadReadModel,
  AsterSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import type { ProjectMemory } from "@/lib/api/projectMemory";
import type { LayoutMode, ThemeType } from "@/lib/workspace/workbenchContract";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import type { ActionRequired } from "../types";
import {
  deriveHarnessSessionShellState,
  deriveHarnessSessionState,
  type HarnessSessionState,
} from "../utils/harnessState";
import { buildRealSubagentTimelineItems } from "../utils/subagentTimeline";
import { mergeThreadItems } from "../utils/threadTimelineView";
import type { AsterTodoItem } from "@/lib/api/agentRuntime";
import {
  resolveHarnessRuntimeVisible,
  shouldBuildFullThreadTimeline,
} from "./agentChatWorkspaceHelpers";
import { useWorkspaceContextHarnessRuntime } from "./useWorkspaceContextHarnessRuntime";
import { useWorkspaceRightSurfaceLocalStateRuntime } from "./useWorkspaceRightSurfaceLocalStateRuntime";
import { hasRunningThreadReadActivity } from "./workspaceSceneSessionProjection";

interface UseWorkspaceContextSurfaceRuntimeParams {
  activeTheme: string;
  childSubagentSessions: AsterSubagentSessionInfo[];
  generalHarnessEntryEnabled: boolean;
  isSending: boolean;
  layoutMode: LayoutMode;
  mappedTheme: ThemeType;
  messages: Message[];
  model: string;
  onAgentStreamingChange?: (isStreaming: boolean) => void;
  onSessionChange?: (sessionId: string | null) => void;
  pendingActions: ActionRequired[];
  projectId?: string | null;
  projectMemory: ProjectMemory | null;
  providerType: string;
  sessionId?: string | null;
  threadId?: string | null;
  threadItems: AgentThreadItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  todoItems: AsterTodoItem[];
  turns: AgentThreadTurn[];
  workspaceHarnessEnabled: boolean;
}

interface WorkspaceContextTimelineRuntime {
  effectiveThreadItems: AgentThreadItem[];
  needsFullThreadTimeline: boolean;
  realSubagentTimelineItems: AgentThreadItem[];
}

export function useWorkspaceContextSurfaceRuntime({
  activeTheme,
  childSubagentSessions,
  generalHarnessEntryEnabled,
  isSending,
  layoutMode,
  mappedTheme,
  messages,
  model,
  onAgentStreamingChange,
  onSessionChange,
  pendingActions,
  projectId,
  projectMemory,
  providerType,
  sessionId,
  threadId,
  threadItems,
  threadRead,
  todoItems,
  turns,
  workspaceHarnessEnabled,
}: UseWorkspaceContextSurfaceRuntimeParams) {
  const harnessShellState = useMemo(
    () => deriveHarnessSessionShellState(messages, pendingActions, todoItems),
    [messages, pendingActions, todoItems],
  );

  useEffect(() => {
    onSessionChange?.(sessionId ?? null);
  }, [onSessionChange, sessionId]);

  useEffect(() => {
    return () => {
      onAgentStreamingChange?.(false);
    };
  }, [onAgentStreamingChange]);

  const contextHarnessRuntime = useWorkspaceContextHarnessRuntime({
    enabled: workspaceHarnessEnabled || generalHarnessEntryEnabled,
    prefetchEnabled: false,
    projectId: projectId ?? undefined,
    activeTheme,
    messages,
    providerType,
    model,
    mappedTheme,
    isSending,
    projectMemory,
    harnessState: harnessShellState,
  });
  const rightSurfaceLocalState = useWorkspaceRightSurfaceLocalStateRuntime();
  const harnessRuntimeVisible = resolveHarnessRuntimeVisible({
    harnessPanelVisible: contextHarnessRuntime.harnessPanelVisible,
    rightSurfaceActive: rightSurfaceLocalState.manualRightSurface,
  });
  const timelineRuntime = useWorkspaceContextTimelineRuntime({
    childSubagentSessions,
    harnessRuntimeVisible,
    layoutMode,
    sessionId,
    threadId,
    threadItems,
    turns,
  });
  const harnessState = useWorkspaceHarnessStateRuntime({
    effectiveThreadItems: timelineRuntime.effectiveThreadItems,
    harnessPanelVisible: contextHarnessRuntime.harnessPanelVisible,
    harnessShellState,
    messages,
    pendingActions,
    todoItems,
  });
  const inputbarIsSending =
    isSending || hasRunningThreadReadActivity(threadRead);

  useEffect(() => {
    onAgentStreamingChange?.(inputbarIsSending);
  }, [inputbarIsSending, onAgentStreamingChange]);

  return {
    ...timelineRuntime,
    contextHarnessRuntime,
    harnessState,
    harnessShellState,
    harnessRuntimeVisible,
    inputbarIsSending,
    rightSurfaceLocalState,
  };
}

function useWorkspaceHarnessStateRuntime({
  effectiveThreadItems,
  harnessPanelVisible,
  harnessShellState,
  messages,
  pendingActions,
  todoItems,
}: {
  effectiveThreadItems: AgentThreadItem[];
  harnessPanelVisible: boolean;
  harnessShellState: ReturnType<typeof deriveHarnessSessionShellState>;
  messages: Message[];
  pendingActions: ActionRequired[];
  todoItems: AsterTodoItem[];
}): HarnessSessionState {
  return useMemo(
    () =>
      harnessPanelVisible
        ? deriveHarnessSessionState(
            messages,
            pendingActions,
            effectiveThreadItems,
            todoItems,
          )
        : ({
            ...harnessShellState,
            reasoning: undefined,
            activity: {
              planning: 0,
              filesystem: 0,
              execution: 0,
              web: 0,
              skills: 0,
              delegation: 0,
            },
            delegatedTasks: [],
            outputSignals: [],
            activeFileWrites: [],
            recentFileEvents: [],
          } satisfies HarnessSessionState),
    [
      effectiveThreadItems,
      harnessPanelVisible,
      harnessShellState,
      messages,
      pendingActions,
      todoItems,
    ],
  );
}

function useWorkspaceContextTimelineRuntime({
  childSubagentSessions,
  harnessRuntimeVisible,
  layoutMode,
  sessionId,
  threadId,
  threadItems,
  turns,
}: {
  childSubagentSessions: AsterSubagentSessionInfo[];
  harnessRuntimeVisible: boolean;
  layoutMode: LayoutMode;
  sessionId?: string | null;
  threadId?: string | null;
  threadItems: AgentThreadItem[];
  turns: AgentThreadTurn[];
}): WorkspaceContextTimelineRuntime {
  const needsFullThreadTimeline = shouldBuildFullThreadTimeline({
    harnessPanelVisible: harnessRuntimeVisible,
    layoutMode,
  });
  const realSubagentTimelineItems = useMemo(
    () =>
      needsFullThreadTimeline
        ? buildRealSubagentTimelineItems({
            threadId: threadId ?? sessionId,
            turns,
            childSessions: childSubagentSessions,
          })
        : [],
    [
      childSubagentSessions,
      needsFullThreadTimeline,
      sessionId,
      threadId,
      turns,
    ],
  );
  const effectiveThreadItems = useMemo(
    () =>
      needsFullThreadTimeline
        ? mergeThreadItems(threadItems, realSubagentTimelineItems)
        : threadItems,
    [needsFullThreadTimeline, realSubagentTimelineItems, threadItems],
  );

  return {
    effectiveThreadItems,
    needsFullThreadTimeline,
    realSubagentTimelineItems,
  };
}
