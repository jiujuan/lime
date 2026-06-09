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
export declare function createSubagentClient({
  invokeCommand,
}?: AgentRuntimeSubagentClientDeps): {
  closeAgentRuntimeSubagent: (
    request: AgentRuntimeCloseSubagentRequest,
  ) => Promise<AgentRuntimeCloseSubagentResponse>;
  resumeAgentRuntimeSubagent: (
    request: AgentRuntimeResumeSubagentRequest,
  ) => Promise<AgentRuntimeResumeSubagentResponse>;
  sendAgentRuntimeSubagentInput: (
    request: AgentRuntimeSendSubagentInputRequest,
  ) => Promise<AgentRuntimeSendSubagentInputResponse>;
  spawnAgentRuntimeSubagent: (
    request: AgentRuntimeSpawnSubagentRequest,
  ) => Promise<AgentRuntimeSpawnSubagentResponse>;
  waitAgentRuntimeSubagents: (
    request: AgentRuntimeWaitSubagentsRequest,
  ) => Promise<AgentRuntimeWaitSubagentsResponse>;
};
