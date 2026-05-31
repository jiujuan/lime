import { useEffect, useRef } from "react";
import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";
import { resolveAgentChatPageShellViewModel } from "./agentChatPageShellViewModel";
import { AgentChatWorkspace } from "./AgentChatWorkspace";

export type {
  AgentChatWorkspaceProps,
  WorkflowProgressSnapshot,
} from "./agentChatWorkspaceContract";

export function AgentChatPage(props: AgentChatWorkspaceProps) {
  const {
    onHasMessagesChange,
    onSessionChange,
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

  // 用首次渲染时的时间戳作为强制重挂载的 key，避免复用旧工作区实例导致旧状态闪烁
  const forcedMountKey = useRef<number | null>(
    shouldForceClawWorkspace ? Date.now() : null,
  );

  useEffect(() => {
    if (!shouldForceClawWorkspace) {
      return;
    }

    onHasMessagesChange?.(false);
    onSessionChange?.(null);
    onWorkflowProgressChange?.(null);
  }, [
    onHasMessagesChange,
    onSessionChange,
    onWorkflowProgressChange,
    shouldForceClawWorkspace,
  ]);

  return (
    <AgentChatWorkspace
      {...props}
      key={forcedMountKey.current ?? undefined}
      agentEntry={effectiveAgentEntry}
      showChatPanel={effectiveShowChatPanel}
    />
  );
}
