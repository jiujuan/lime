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

function assertSubagentControlMovedToAppServer(): never {
  throw new Error(
    "Public subagent control is retired from the production Agent Runtime gateway; public subagent control must use App Server current methods before it can be re-enabled.",
  );
}

export function createSubagentClient({
  invokeCommand: _invokeCommand,
}: AgentRuntimeSubagentClientDeps = {}) {
  async function spawnAgentRuntimeSubagent(
    _request: AgentRuntimeSpawnSubagentRequest,
  ): Promise<AgentRuntimeSpawnSubagentResponse> {
    return assertSubagentControlMovedToAppServer();
  }

  async function sendAgentRuntimeSubagentInput(
    _request: AgentRuntimeSendSubagentInputRequest,
  ): Promise<AgentRuntimeSendSubagentInputResponse> {
    return assertSubagentControlMovedToAppServer();
  }

  async function waitAgentRuntimeSubagents(
    _request: AgentRuntimeWaitSubagentsRequest,
  ): Promise<AgentRuntimeWaitSubagentsResponse> {
    return assertSubagentControlMovedToAppServer();
  }

  async function resumeAgentRuntimeSubagent(
    _request: AgentRuntimeResumeSubagentRequest,
  ): Promise<AgentRuntimeResumeSubagentResponse> {
    return assertSubagentControlMovedToAppServer();
  }

  async function closeAgentRuntimeSubagent(
    _request: AgentRuntimeCloseSubagentRequest,
  ): Promise<AgentRuntimeCloseSubagentResponse> {
    return assertSubagentControlMovedToAppServer();
  }

  return {
    closeAgentRuntimeSubagent,
    resumeAgentRuntimeSubagent,
    sendAgentRuntimeSubagentInput,
    spawnAgentRuntimeSubagent,
    waitAgentRuntimeSubagents,
  };
}
