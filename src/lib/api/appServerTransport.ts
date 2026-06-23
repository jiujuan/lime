import { safeInvoke } from "@/lib/dev-bridge";
import {
  decodeMessage,
  decodeMessages,
  encodeMessage,
  notification as createProtocolNotification,
  request as createProtocolRequest,
} from "../../../packages/app-server-client/src/protocol";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import type {
  AppServerDrainEventsRequest,
  AppServerDrainEventsResult,
  AppServerHandleJsonLinesRequest,
  AppServerHandleJsonLinesResult,
  AppServerJsonRpcMessage,
  AppServerJsonRpcNotification,
  AppServerJsonRpcRequest,
  AppServerRequestId,
} from "./appServerTypes";

type AppServerSafeInvokeEnvelope<T> = T | { result?: T };

export async function handleAppServerJsonLines(
  request: AppServerHandleJsonLinesRequest,
): Promise<AppServerHandleJsonLinesResult> {
  return unwrapAppServerSafeInvokeResult(
    "app_server_handle_json_lines",
    await safeInvoke<
      AppServerSafeInvokeEnvelope<AppServerHandleJsonLinesResult>
    >("app_server_handle_json_lines", { request }),
  );
}

export async function drainAppServerEvents(
  request: AppServerDrainEventsRequest = {},
): Promise<AppServerDrainEventsResult> {
  return unwrapAppServerSafeInvokeResult(
    "app_server_drain_events",
    await safeInvoke<AppServerSafeInvokeEnvelope<AppServerDrainEventsResult>>(
      "app_server_drain_events",
      { request },
    ),
  );
}

function unwrapAppServerSafeInvokeResult<T>(
  command: string,
  payload: AppServerSafeInvokeEnvelope<T>,
): T {
  assertNotDiagnosticFacade(command, payload, "真实 App Server bridge");
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "result" in payload
  ) {
    const result = (payload as { result?: T }).result as T;
    assertNotDiagnosticFacade(command, result, "真实 App Server bridge");
    return result;
  }
  return payload as T;
}

export function createAppServerRequest(
  id: AppServerRequestId,
  method: string,
  params?: unknown,
): AppServerJsonRpcRequest {
  return createProtocolRequest(id, method, params);
}

export function createAppServerNotification(
  method: string,
  params?: unknown,
): AppServerJsonRpcNotification {
  return createProtocolNotification(method, params);
}

export function encodeAppServerMessage(
  message: AppServerJsonRpcMessage,
): string {
  return encodeMessage(message);
}

export function decodeAppServerMessage(line: string): AppServerJsonRpcMessage {
  return decodeMessage(line);
}

export function decodeAppServerMessages(
  lines: string[],
): AppServerJsonRpcMessage[] {
  return decodeMessages(lines);
}
