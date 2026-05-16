import { safeInvoke } from "@/lib/dev-bridge";
import type { AgentRuntimeRespondActionRequest } from "./agentRuntime/types";

export const AGENT_APP_RUNTIME_COMMANDS = {
  startTask: "agent_app_runtime_start_task",
  cancelTask: "agent_app_runtime_cancel_task",
  getTask: "agent_app_runtime_get_task",
  submitHostResponse: "agent_app_runtime_submit_host_response",
} as const;

export interface AgentAppRuntimeStartTaskRequest {
  appId: string;
  entryKey?: string;
  workspaceId?: string;
  sessionId?: string;
  taskId?: string;
  taskKind: string;
  idempotencyKey?: string;
  title?: string;
  prompt?: string;
  input?: unknown;
  expectedOutput?: unknown;
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  knowledgeBindings?: unknown[];
  humanReview?: boolean;
  eventName?: string;
  turnId?: string;
  providerPreference?: string;
  modelPreference?: string;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
  runStartHooks?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AgentAppRuntimeStartTaskResult {
  appId: string;
  entryKey?: string;
  taskId: string;
  traceId: string;
  taskKind: string;
  sessionId: string;
  turnId: string;
  eventName: string;
  status: "accepted";
  submittedAt: string;
}

export interface AgentAppRuntimeCancelTaskRequest {
  appId: string;
  taskId: string;
  sessionId: string;
  turnId?: string;
}

export interface AgentAppRuntimeCancelTaskResult {
  appId: string;
  taskId: string;
  sessionId: string;
  cancelled: boolean;
  status: "cancelled" | "not_running";
}

export interface AgentAppRuntimeGetTaskRequest {
  appId: string;
  taskId: string;
  sessionId: string;
}

export interface AgentAppRuntimeTaskEvent {
  id: string;
  eventType: string;
  status: string;
  message: string;
  severity?: string;
  turnId?: string;
  requestId?: string;
  toolName?: string;
  evidenceRef?: string;
  artifactRef?: string;
  occurredAt?: string;
  payload?: unknown;
}

export interface AgentAppRuntimeTaskSnapshot {
  appId: string;
  taskId: string;
  sessionId: string;
  status: "thread_read_available";
  taskStatus: string;
  taskEvents: AgentAppRuntimeTaskEvent[];
  threadRead: unknown;
}

export interface AgentAppRuntimeSubmitHostResponseRequest {
  appId: string;
  taskId: string;
  runtimeRequest: AgentRuntimeRespondActionRequest;
}

export interface AgentAppRuntimeSubmitHostResponseResult {
  appId: string;
  taskId: string;
  status: "submitted";
}

export async function startAgentAppRuntimeTask(
  request: AgentAppRuntimeStartTaskRequest,
): Promise<AgentAppRuntimeStartTaskResult> {
  return safeInvoke<AgentAppRuntimeStartTaskResult>(
    AGENT_APP_RUNTIME_COMMANDS.startTask,
    { request },
  );
}

export async function cancelAgentAppRuntimeTask(
  request: AgentAppRuntimeCancelTaskRequest,
): Promise<AgentAppRuntimeCancelTaskResult> {
  return safeInvoke<AgentAppRuntimeCancelTaskResult>(
    AGENT_APP_RUNTIME_COMMANDS.cancelTask,
    { request },
  );
}

export async function getAgentAppRuntimeTask(
  request: AgentAppRuntimeGetTaskRequest,
): Promise<AgentAppRuntimeTaskSnapshot> {
  return safeInvoke<AgentAppRuntimeTaskSnapshot>(
    AGENT_APP_RUNTIME_COMMANDS.getTask,
    { request },
  );
}

export async function submitAgentAppRuntimeHostResponse(
  request: AgentAppRuntimeSubmitHostResponseRequest,
): Promise<AgentAppRuntimeSubmitHostResponseResult> {
  return safeInvoke<AgentAppRuntimeSubmitHostResponseResult>(
    AGENT_APP_RUNTIME_COMMANDS.submitHostResponse,
    { request },
  );
}
