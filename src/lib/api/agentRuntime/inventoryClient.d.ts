import { type AgentRuntimeCommandInvoke } from "./transport";
import type { AgentRuntimeListWorkspaceSkillBindingsRequest, AgentRuntimeToolInventory, AgentRuntimeToolInventoryRequest, AgentRuntimeWorkspaceSkillBindings } from "./types";
export interface AgentRuntimeInventoryClientDeps {
    invokeCommand?: AgentRuntimeCommandInvoke;
}
export declare function createInventoryClient({ invokeCommand, }?: AgentRuntimeInventoryClientDeps): {
    getAgentRuntimeToolInventory: (request?: AgentRuntimeToolInventoryRequest) => Promise<AgentRuntimeToolInventory>;
    listWorkspaceSkillBindings: (request: AgentRuntimeListWorkspaceSkillBindingsRequest) => Promise<AgentRuntimeWorkspaceSkillBindings>;
};
export declare const getAgentRuntimeToolInventory: (request?: AgentRuntimeToolInventoryRequest) => Promise<AgentRuntimeToolInventory>, listWorkspaceSkillBindings: (request: AgentRuntimeListWorkspaceSkillBindingsRequest) => Promise<AgentRuntimeWorkspaceSkillBindings>;
