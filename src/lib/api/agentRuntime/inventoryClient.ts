import { AppServerClient } from "@/lib/api/appServer";
import { METHOD_WORKSPACE_SKILL_BINDINGS_LIST } from "../../../../packages/app-server-client/src/protocol";
import { AGENT_RUNTIME_COMMANDS } from "./commandManifest.generated";
import {
  invokeAgentRuntimeCommand,
  type AgentRuntimeCommandInvoke,
} from "./transport";
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

type AppServerWorkspaceSkillBindingsListResponse = {
  bindings: AgentRuntimeWorkspaceSkillBindings;
};

export interface AgentRuntimeInventoryClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeWorkspaceSkillBindingsAppServerClient;
}

export function createInventoryClient({
  appServerClient = new AppServerClient(),
  invokeCommand = invokeAgentRuntimeCommand,
}: AgentRuntimeInventoryClientDeps = {}) {
  async function getAgentRuntimeToolInventory(
    request: AgentRuntimeToolInventoryRequest = {},
  ): Promise<AgentRuntimeToolInventory> {
    return await invokeCommand<AgentRuntimeToolInventory>(
      AGENT_RUNTIME_COMMANDS.getToolInventory,
      { request },
    );
  }

  async function listWorkspaceSkillBindings(
    request: AgentRuntimeListWorkspaceSkillBindingsRequest,
  ): Promise<AgentRuntimeWorkspaceSkillBindings> {
    const workspaceRoot = request.workspaceRoot.trim();
    if (!workspaceRoot) {
      throw new Error(
        "workspaceRoot is required to list App Server workspace skill bindings",
      );
    }

    const response =
      await appServerClient.request<AppServerWorkspaceSkillBindingsListResponse>(
        METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
        workspaceSkillBindingsListParamsFromRequest(request, workspaceRoot),
      );
    if (!response.result.bindings) {
      throw new Error(
        "App Server workspaceSkillBindings/list did not return bindings",
      );
    }
    return response.result.bindings;
  }

  return {
    getAgentRuntimeToolInventory,
    listWorkspaceSkillBindings,
  };
}

export const { getAgentRuntimeToolInventory, listWorkspaceSkillBindings } =
  createInventoryClient();

function workspaceSkillBindingsListParamsFromRequest(
  request: AgentRuntimeListWorkspaceSkillBindingsRequest,
  workspaceRoot: string,
) {
  return {
    workspaceRoot,
    ...(request.caller ? { caller: request.caller } : {}),
    ...(request.workbench === undefined
      ? {}
      : { workbench: request.workbench }),
    ...(request.browserAssist === undefined
      ? {}
      : { browserAssist: request.browserAssist }),
  };
}
