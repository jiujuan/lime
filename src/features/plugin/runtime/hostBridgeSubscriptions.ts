import {
  buildLimeCapabilityInvokeRequest,
  type LimeCapabilityInvokeRequest,
} from "../sdk/capabilityContract";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import { readPositiveInteger } from "./hostBridgeCommon";
import type { PluginTaskSubscription } from "./hostBridgeTaskReplay";

const DEFAULT_TASK_SUBSCRIPTION_POLL_INTERVAL_MS = 1000;
const MIN_TASK_SUBSCRIPTION_POLL_INTERVAL_MS = 250;
const MAX_TASK_SUBSCRIPTION_POLL_INTERVAL_MS = 10_000;

export const DEFAULT_TERMINAL_ARTIFACT_REPLAY_POLLS = 24;

export interface PluginWorkflowSubscription {
  subscriptionId: string;
  sessionId: string;
  pollIntervalMs: number;
  timerId?: number;
  inFlight: boolean;
}

export function readSubscriptionPollInterval(
  value: unknown,
): number {
  return readPositiveInteger(
    value,
    DEFAULT_TASK_SUBSCRIPTION_POLL_INTERVAL_MS,
    MIN_TASK_SUBSCRIPTION_POLL_INTERVAL_MS,
    MAX_TASK_SUBSCRIPTION_POLL_INTERVAL_MS,
  );
}

export function buildTaskSubscriptionPollRequest(options: {
  appId: string;
  entryKey?: string;
  subscription: PluginTaskSubscription;
}): PluginHostBridgeCapabilityRequest {
  const { appId, entryKey, subscription } = options;
  const input: Record<string, unknown> = { taskId: subscription.taskId };
  if (subscription.sessionId) {
    input.sessionId = subscription.sessionId;
  }
  if (subscription.expectedOutput !== undefined) {
    input.expectedOutput = subscription.expectedOutput;
  }
  const invokeRequest = buildLimeCapabilityInvokeRequest({
    capability: "lime.agent",
    method: "getTask" as never,
    args: input,
    requestId: `${subscription.subscriptionId}:poll`,
  }) as LimeCapabilityInvokeRequest;
  const request: PluginHostBridgeCapabilityRequest = {
    appId,
    capability: "lime.agent",
    method: "getTask",
    requestId: `${subscription.subscriptionId}:poll`,
    input,
    invokeRequest,
    rawPayload: {
      capability: "lime.agent",
      method: "getTask",
      input,
      subscriptionId: subscription.subscriptionId,
    },
  };
  if (entryKey) {
    request.entryKey = entryKey;
  }
  return request;
}

export function buildWorkflowSubscriptionPollRequest(options: {
  appId: string;
  entryKey?: string;
  subscription: PluginWorkflowSubscription;
}): PluginHostBridgeCapabilityRequest {
  const { appId, entryKey, subscription } = options;
  const input = {
    sessionId: subscription.sessionId,
  };
  const invokeRequest = buildLimeCapabilityInvokeRequest({
    capability: "lime.agent",
    method: "readWorkflow",
    args: input,
    requestId: `${subscription.subscriptionId}:workflow:poll`,
  }) as LimeCapabilityInvokeRequest;
  const request: PluginHostBridgeCapabilityRequest = {
    appId,
    capability: "lime.agent",
    method: "readWorkflow",
    requestId: `${subscription.subscriptionId}:workflow:poll`,
    input,
    invokeRequest,
    rawPayload: {
      capability: "lime.agent",
      method: "readWorkflow",
      input,
      subscriptionId: subscription.subscriptionId,
    },
  };
  if (entryKey) {
    request.entryKey = entryKey;
  }
  return request;
}

export function stopCapabilitySubscription(
  taskSubscriptions: Map<string, PluginTaskSubscription>,
  workflowSubscriptions: Map<string, PluginWorkflowSubscription>,
  subscriptionId: string,
): boolean {
  return (
    stopTaskSubscription(taskSubscriptions, subscriptionId) ||
    stopWorkflowSubscription(workflowSubscriptions, subscriptionId)
  );
}

export function stopTaskSubscription(
  taskSubscriptions: Map<string, PluginTaskSubscription>,
  subscriptionId: string,
): boolean {
  const subscription = taskSubscriptions.get(subscriptionId);
  if (!subscription) {
    return false;
  }
  if (subscription.timerId !== undefined) {
    window.clearTimeout(subscription.timerId);
  }
  subscription.runtimeEventUnlisten?.();
  taskSubscriptions.delete(subscriptionId);
  return true;
}

export function stopWorkflowSubscription(
  workflowSubscriptions: Map<string, PluginWorkflowSubscription>,
  subscriptionId: string,
): boolean {
  const subscription = workflowSubscriptions.get(subscriptionId);
  if (!subscription) {
    return false;
  }
  if (subscription.timerId !== undefined) {
    window.clearTimeout(subscription.timerId);
  }
  workflowSubscriptions.delete(subscriptionId);
  return true;
}
