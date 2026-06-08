import { createAgentClient } from "./agentClient";
import {
  createExportClient,
  type AgentRuntimeEvidenceExportAppServerClient,
} from "./exportClient";
import {
  createInventoryClient,
  type AgentRuntimeWorkspaceSkillBindingsAppServerClient,
} from "./inventoryClient";
import { createMediaClient } from "./mediaClient";
import { createObjectiveClient } from "./objectiveClient";
import type { AppServerSessionRpcClient } from "./appServerSessionClient";
import { createSessionClient } from "./sessionClient";
import { createSiteClient } from "./siteClient";
import { createSubagentClient } from "./subagentClient";
import {
  createThreadClient,
  type AgentRuntimeThreadClientDeps,
} from "./threadClient";
import {
  createAgentRuntimeBridgeInvoke,
  createAgentRuntimeCommandInvoke,
  type AgentRuntimeBridgeInvoke,
  type AgentRuntimeCommandInvoke,
  type AgentRuntimeTransportDeps,
} from "./transport";

export type AgentRuntimeAppServerClient =
  AgentRuntimeThreadClientDeps["appServerClient"] &
    AppServerSessionRpcClient &
    AgentRuntimeEvidenceExportAppServerClient &
    AgentRuntimeWorkspaceSkillBindingsAppServerClient;

export interface AgentRuntimeClientDeps extends AgentRuntimeTransportDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeAppServerClient;
  isAppServerTurnLifecycleAvailable?: AgentRuntimeThreadClientDeps["isAppServerTurnLifecycleAvailable"];
}

export function createAgentRuntimeClient({
  appServerClient,
  bridgeInvoke,
  invoke,
  invokeCommand,
  isAppServerTurnLifecycleAvailable,
}: AgentRuntimeClientDeps = {}) {
  const resolvedBridgeInvoke =
    bridgeInvoke ?? createAgentRuntimeBridgeInvoke({ invoke });
  const resolvedInvokeCommand =
    invokeCommand ??
    createAgentRuntimeCommandInvoke({
      bridgeInvoke: resolvedBridgeInvoke,
    });

  return {
    ...createAgentClient({ bridgeInvoke: resolvedBridgeInvoke }),
    ...createExportClient({
      appServerClient,
      invokeCommand: resolvedInvokeCommand,
    }),
    ...createInventoryClient({
      appServerClient,
      invokeCommand: resolvedInvokeCommand,
    }),
    ...createMediaClient({ bridgeInvoke: resolvedBridgeInvoke }),
    ...createObjectiveClient({ invokeCommand: resolvedInvokeCommand }),
    ...createSessionClient({
      appServerClient,
    }),
    ...createSiteClient({ bridgeInvoke: resolvedBridgeInvoke }),
    ...createSubagentClient({ invokeCommand: resolvedInvokeCommand }),
    ...createThreadClient({
      appServerClient,
      invokeCommand: resolvedInvokeCommand,
      isAppServerTurnLifecycleAvailable,
    }),
  };
}

export type AgentRuntimeClient = ReturnType<typeof createAgentRuntimeClient>;
