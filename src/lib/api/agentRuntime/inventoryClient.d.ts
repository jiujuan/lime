import { type AppServerClient } from "@/lib/api/appServer";
import type {
  AgentRuntimeListWorkspaceSkillBindingsRequest,
  AgentRuntimeToolInventory,
  AgentRuntimeToolInventoryRequest,
  AgentRuntimeWorkspaceSkillBindings,
} from "./types";
export type AgentRuntimeWorkspaceSkillBindingsAppServerClient = Pick<
  AppServerClient,
  "request"
>;
export interface AgentRuntimeInventoryClientDeps {
  appServerClient?: AgentRuntimeWorkspaceSkillBindingsAppServerClient;
}
export declare function createInventoryClient({
  appServerClient,
}?: AgentRuntimeInventoryClientDeps): {
  getAgentRuntimeToolInventory: (
    request?: AgentRuntimeToolInventoryRequest,
  ) => Promise<AgentRuntimeToolInventory>;
  listWorkspaceSkillBindings: (
    request: AgentRuntimeListWorkspaceSkillBindingsRequest,
  ) => Promise<AgentRuntimeWorkspaceSkillBindings>;
};
export declare const getAgentRuntimeToolInventory: (
    request?: AgentRuntimeToolInventoryRequest,
  ) => Promise<AgentRuntimeToolInventory>,
  listWorkspaceSkillBindings: (
    request: AgentRuntimeListWorkspaceSkillBindingsRequest,
  ) => Promise<AgentRuntimeWorkspaceSkillBindings>;
