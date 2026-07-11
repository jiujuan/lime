import { useEffect, useRef } from "react";
import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";
import { AgentChatWorkspace } from "./AgentChatWorkspace";
import { resolveAgentChatPageShellViewModel } from "./agentChatPageShellViewModel";

export type {
  AgentBackgroundSessionRuntimeSnapshot,
  AgentChatWorkspaceProps,
  WorkflowProgressSnapshot,
} from "./agentChatWorkspaceContract";

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
    <AgentChatWorkspace
      {...props}
      agentEntry={effectiveAgentEntry}
      showChatPanel={effectiveShowChatPanel}
    />
  );
}
