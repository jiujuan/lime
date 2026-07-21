/**
 * AgentChatWorkspace 的 current runtime owner。
 *
 * 根组件只负责公开组件入口；Thread/Turn/Item 投影和 GUI scene 的编排继续在这里按既有 owner 组合。
 *
 * AI Agent 聊天页面
 *
 * 包含聊天区域、任务中心和工作台布局
 * 支持内容创作模式下的布局过渡和步骤引导
 * 当主题为 general 时，使用 GeneralChat 组件实现
 */

import { useAgentChatWorkspaceEntryRuntime } from "./workspace/useAgentChatWorkspaceEntryRuntime";
import { useAgentChatWorkspaceSetupRuntime } from "./workspace/useAgentChatWorkspaceSetupRuntime";
import { useAgentChatWorkspaceCommandRuntime } from "./workspace/useAgentChatWorkspaceCommandRuntime";
import { useAgentChatWorkspaceSceneRuntime } from "./workspace/useAgentChatWorkspaceSceneRuntime";
import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";
export type {
  AgentBackgroundSessionRuntimeSnapshot,
  AgentChatWorkspaceProps,
  WorkflowProgressSnapshot,
} from "./agentChatWorkspaceContract";

export function useAgentChatWorkspaceRuntime(props: AgentChatWorkspaceProps) {
  const entryRuntime = useAgentChatWorkspaceEntryRuntime(props);
  const setupRuntime = useAgentChatWorkspaceSetupRuntime({
    props,
    entryRuntime,
  });
  const commandRuntime = useAgentChatWorkspaceCommandRuntime({
    props,
    entryRuntime,
    setupRuntime,
  });
  return useAgentChatWorkspaceSceneRuntime({
    props,
    entryRuntime,
    setupRuntime,
    commandRuntime,
  });
}
