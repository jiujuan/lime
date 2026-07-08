import { Suspense, lazy, useEffect, useRef } from "react";
import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";
import { resolveAgentChatPageShellViewModel } from "./agentChatPageShellViewModel";

export type {
  AgentBackgroundSessionRuntimeSnapshot,
  AgentChatWorkspaceProps,
  WorkflowProgressSnapshot,
} from "./agentChatWorkspaceContract";

const AgentChatWorkspace = lazy(() =>
  import("./AgentChatWorkspace").then((module) => ({
    default: module.AgentChatWorkspace,
  })),
);

const workspaceLoadingStyle = {
  flex: 1,
  minHeight: 0,
} as const;

export function AgentChatPage(props: AgentChatWorkspaceProps) {
  const {
    onHasMessagesChange,
    onSessionChange,
    onAgentStreamingChange,
    onWorkflowProgressChange,
  } = props;

  // 性能埋点：记录路由进入时间
  const mountT0 = useRef<number>(performance.now());
  useEffect(() => {
    console.info(
      `[PERF] AgentChatPage mounted: ${(performance.now() - mountT0.current).toFixed(0)}ms`,
    );
  }, []);

  const {
    effectiveAgentEntry,
    effectiveShowChatPanel,
    shouldForceClawWorkspace,
  } = resolveAgentChatPageShellViewModel(props);

  useEffect(() => {
    if (!shouldForceClawWorkspace) {
      return;
    }

    onHasMessagesChange?.(false);
    onSessionChange?.(null);
    onAgentStreamingChange?.(false);
    onWorkflowProgressChange?.(null);
  }, [
    onHasMessagesChange,
    onSessionChange,
    onAgentStreamingChange,
    onWorkflowProgressChange,
    shouldForceClawWorkspace,
  ]);

  return (
    <Suspense
      fallback={
        <div
          data-testid="agent-chat-workspace-loading"
          style={workspaceLoadingStyle}
        />
      }
    >
      <AgentChatWorkspace
        {...props}
        agentEntry={effectiveAgentEntry}
        showChatPanel={effectiveShowChatPanel}
      />
    </Suspense>
  );
}
