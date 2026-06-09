import { type AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeCloseSubagentRequest,
  AgentRuntimeCloseSubagentResponse,
  AgentRuntimeResumeSubagentRequest,
  AgentRuntimeResumeSubagentResponse,
  AgentRuntimeSendSubagentInputRequest,
  AgentRuntimeSendSubagentInputResponse,
  AgentRuntimeSpawnSubagentRequest,
  AgentRuntimeSpawnSubagentResponse,
  AgentRuntimeWaitSubagentsRequest,
  AgentRuntimeWaitSubagentsResponse,
} from "./types";

export interface AgentRuntimeSubagentClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
}

function assertSubagentControlMovedToAppServer(command: string): never {
  throw new Error(
    `${command} is retired from the production Agent Runtime gateway; public subagent control must use App Server current methods before it can be re-enabled.`,
  );
}

export function createSubagentClient({
  invokeCommand: _invokeCommand,
}: AgentRuntimeSubagentClientDeps = {}) {
  async function spawnAgentRuntimeSubagent(
    _request: AgentRuntimeSpawnSubagentRequest,
  ): Promise<AgentRuntimeSpawnSubagentResponse> {
    return assertSubagentControlMovedToAppServer(
      "agent_runtime_spawn_subagent",
    );
  }

  async function sendAgentRuntimeSubagentInput(
    _request: AgentRuntimeSendSubagentInputRequest,
  ): Promise<AgentRuntimeSendSubagentInputResponse> {
    return assertSubagentControlMovedToAppServer(
      "agent_runtime_send_subagent_input",
    );
  }

  async function waitAgentRuntimeSubagents(
    _request: AgentRuntimeWaitSubagentsRequest,
  ): Promise<AgentRuntimeWaitSubagentsResponse> {
    return assertSubagentControlMovedToAppServer(
      "agent_runtime_wait_subagents",
    );
  }

  async function resumeAgentRuntimeSubagent(
    _request: AgentRuntimeResumeSubagentRequest,
  ): Promise<AgentRuntimeResumeSubagentResponse> {
    return assertSubagentControlMovedToAppServer(
      "agent_runtime_resume_subagent",
    );
  }

  async function closeAgentRuntimeSubagent(
    _request: AgentRuntimeCloseSubagentRequest,
  ): Promise<AgentRuntimeCloseSubagentResponse> {
    return assertSubagentControlMovedToAppServer(
      "agent_runtime_close_subagent",
    );
  }

  return {
    closeAgentRuntimeSubagent,
    resumeAgentRuntimeSubagent,
    sendAgentRuntimeSubagentInput,
    spawnAgentRuntimeSubagent,
    waitAgentRuntimeSubagents,
  };
}
