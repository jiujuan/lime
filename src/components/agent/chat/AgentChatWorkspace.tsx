import { useAgentChatWorkspaceRuntime } from "./useAgentChatWorkspaceRuntime";
import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";

export type {
  AgentBackgroundSessionRuntimeSnapshot,
  AgentChatWorkspaceProps,
  WorkflowProgressSnapshot,
} from "./agentChatWorkspaceContract";

/** Workspace 公共入口；运行时组合统一由 current owner hook 承接。 */
export function AgentChatWorkspace(props: AgentChatWorkspaceProps) {
  return useAgentChatWorkspaceRuntime(props);
}
