import {
  createAppServerClient,
  type AppServerClient,
  type AppServerRequestResult,
  type AppServerWorkflowReadResponse,
} from "@/lib/api/appServer";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";

export interface PluginWorkflowReadProjection {
  appId: string;
  entryKey?: string;
  sessionId: string;
  source: "app_server_workflow_read";
  workflow: unknown;
  workflowRuns?: unknown[];
  workflowSteps?: unknown[];
}

export type PluginWorkflowReadClient = Pick<AppServerClient, "readWorkflow">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readSessionIdFromValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return readString(value[0]);
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return (
    readString(value.sessionId) ??
    readString(value.session_id) ??
    readSessionIdFromValue(value.input) ??
    readSessionIdFromValue(value.args)
  );
}

export function readWorkflowSessionIdFromRequest(
  request: PluginHostBridgeCapabilityRequest,
): string | undefined {
  return (
    readSessionIdFromValue(request.input) ??
    readSessionIdFromValue(request.args) ??
    readSessionIdFromValue(request.invokeRequest.args) ??
    readSessionIdFromValue(request.rawPayload)
  );
}

export function createDefaultPluginWorkflowReadClient(): PluginWorkflowReadClient {
  return createAppServerClient();
}

export function projectWorkflowReadResponse(
  request: PluginHostBridgeCapabilityRequest,
  response: AppServerWorkflowReadResponse,
): PluginWorkflowReadProjection {
  return {
    appId: request.appId,
    entryKey: request.entryKey,
    sessionId: response.sessionId,
    source: "app_server_workflow_read",
    workflow: response.workflow,
    workflowRuns: response.workflowRuns,
    workflowSteps: response.workflowSteps,
  };
}

export async function readWorkflowProjection(
  request: PluginHostBridgeCapabilityRequest,
  client: PluginWorkflowReadClient = createDefaultPluginWorkflowReadClient(),
): Promise<PluginWorkflowReadProjection> {
  const sessionId = readWorkflowSessionIdFromRequest(request);
  if (!sessionId) {
    throw Object.assign(
      new Error("lime.agent.readWorkflow requires input.sessionId."),
      { code: "INVALID_PAYLOAD" },
    );
  }
  const response: AppServerRequestResult<AppServerWorkflowReadResponse> =
    await client.readWorkflow({ sessionId });
  return projectWorkflowReadResponse(request, response.result);
}
