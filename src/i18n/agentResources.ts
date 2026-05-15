import agentEnUS from "./resources/en-US/agent.json";
import agentHomeEnUS from "./resources/en-US/agentHome.json";
import agentInputbarEnUS from "./resources/en-US/agentInputbar.json";
import agentMessageListEnUS from "./resources/en-US/agentMessageList.json";
import agentRuntimeEnUS from "./resources/en-US/agentRuntime.json";
import agentSkillsEnUS from "./resources/en-US/agentSkills.json";
import agentExpertsEnUS from "./resources/en-US/agentExperts.json";
import agentTeamWorkspaceEnUS from "./resources/en-US/agentTeamWorkspace.json";
import agentZhCN from "./resources/zh-CN/agent.json";
import agentHomeZhCN from "./resources/zh-CN/agentHome.json";
import agentInputbarZhCN from "./resources/zh-CN/agentInputbar.json";
import agentMessageListZhCN from "./resources/zh-CN/agentMessageList.json";
import agentRuntimeZhCN from "./resources/zh-CN/agentRuntime.json";
import agentSkillsZhCN from "./resources/zh-CN/agentSkills.json";
import agentExpertsZhCN from "./resources/zh-CN/agentExperts.json";
import agentTeamWorkspaceZhCN from "./resources/zh-CN/agentTeamWorkspace.json";

export const agentZhCNResource = {
  ...agentZhCN,
  ...agentHomeZhCN,
  ...agentInputbarZhCN,
  ...agentMessageListZhCN,
  ...agentRuntimeZhCN,
  ...agentSkillsZhCN,
  ...agentExpertsZhCN,
  ...agentTeamWorkspaceZhCN,
} as const;

export const agentEnUSResource = {
  ...agentEnUS,
  ...agentHomeEnUS,
  ...agentInputbarEnUS,
  ...agentMessageListEnUS,
  ...agentRuntimeEnUS,
  ...agentSkillsEnUS,
  ...agentExpertsEnUS,
  ...agentTeamWorkspaceEnUS,
} as const;

export type AgentI18nResource = typeof agentZhCNResource;
export type AgentI18nKey = keyof AgentI18nResource;
