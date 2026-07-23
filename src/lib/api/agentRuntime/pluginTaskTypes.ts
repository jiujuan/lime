import type { RuntimeRequest } from "@limecloud/app-server-client";

import type { AgentRuntimeRespondActionRequest } from "./requestTypes";

export interface PluginRuntimeStartTaskRequest {
  appId: string;
  entryKey?: string;
  workspaceId?: string;
  sessionId?: string;
  threadId?: string;
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
  packageRootPath?: string;
  runtimePackageRoot?: string;
  appRootPath?: string;
  runWorker?: boolean;
  workerTimeoutMs?: number;
  runtimeRequest?: RuntimeRequest;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
  runStartHooks?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PluginRuntimeStartTaskResult {
  appId: string;
  entryKey?: string;
  taskId: string;
  traceId: string;
  taskKind: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  eventName: string;
  status: "accepted";
  worker?: unknown;
  submittedAt: string;
}

export interface PluginRuntimeCancelTaskRequest {
  appId: string;
  taskId: string;
  threadId: string;
  turnId?: string;
}

export interface PluginRuntimeCancelTaskResult {
  appId: string;
  taskId: string;
  sessionId: string;
  threadId: string;
  cancelled: boolean;
  status: "cancelled" | "not_running";
}

export interface PluginRuntimeGetTaskRequest {
  appId: string;
  taskId: string;
  threadId: string;
}

export interface PluginRuntimeTaskEvent {
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

export interface PluginRuntimeTaskSnapshot {
  appId: string;
  taskId: string;
  sessionId: string;
  threadId: string;
  status: "thread_read_available";
  taskStatus: string;
  taskEvents: PluginRuntimeTaskEvent[];
  threadRead: unknown;
}

export interface PluginRuntimeSubmitHostResponseRequest {
  appId: string;
  taskId: string;
  runtimeRequest: AgentRuntimeRespondActionRequest;
}

export interface PluginRuntimeSubmitHostResponseResult {
  appId: string;
  taskId: string;
  status: "submitted";
}
