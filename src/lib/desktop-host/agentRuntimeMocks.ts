import agentCommandCatalog from "../governance/agentCommandCatalog.json";
import { agentRuntimeObjectiveMocks } from "./agentRuntimeObjectiveMocks";

const createDeprecatedCommandMock =
  (command: string, replacement: string) => () => {
    throw new Error(
      `命令 ${command} 已废弃，请迁移到 ${replacement}。Mock 不再为旧链路伪造成功结果。`,
    );
  };

const deprecatedAgentCommandReplacements =
  agentCommandCatalog.deprecatedCommandReplacements as Record<string, string>;

const deprecatedAgentCommandMocks = Object.fromEntries(
  Object.entries(deprecatedAgentCommandReplacements)
    .filter(([, replacement]) => !replacement.startsWith("agentApp"))
    .map(([command, replacement]) => [
      command,
      createDeprecatedCommandMock(command, replacement),
    ]),
) as Record<string, () => never>;

const createAppServerSessionCurrentMock =
  (command: string, method: string) => () => {
    throw new Error(
      `命令 ${command} 已迁移到 App Server JSON-RPC ${method}，Mock 不再为旧 session 链路伪造成功结果。`,
    );
  };

export const agentRuntimeMocks: Record<string, (args?: any) => any> = {
  ...deprecatedAgentCommandMocks,
  ...agentRuntimeObjectiveMocks,
  agent_runtime_create_session: createAppServerSessionCurrentMock(
    "agent_runtime_create_session",
    "agentSession/start",
  ),
  agent_runtime_list_sessions: createAppServerSessionCurrentMock(
    "agent_runtime_list_sessions",
    "agentSession/list",
  ),
  agent_runtime_get_session: createAppServerSessionCurrentMock(
    "agent_runtime_get_session",
    "agentSession/read",
  ),
};
