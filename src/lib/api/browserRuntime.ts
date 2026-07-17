import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_BROWSER_SESSION_ACTION_EXECUTE,
  METHOD_BROWSER_SESSION_CLOSE,
  METHOD_BROWSER_SESSION_EVENT_LIST,
  METHOD_BROWSER_SESSION_OPEN,
  METHOD_BROWSER_SESSION_READ,
  METHOD_BROWSER_SESSION_TARGET_LIST,
  type BrowserSessionActionExecuteParams,
  type BrowserSessionActionExecuteResponse,
  type BrowserSessionCloseResponse,
  type BrowserSessionEventListParams,
  type BrowserSessionEventListResponse,
  type BrowserSessionIdParams,
  type BrowserSessionOpenParams,
  type BrowserSessionOpenResponse,
  type BrowserSessionReadResponse,
  type BrowserSessionState,
  type BrowserSessionTargetInfo,
  type BrowserSessionTargetListParams,
  type BrowserSessionTargetListResponse,
} from "../../../packages/app-server-client/src/protocol";

export type { BrowserSessionState, BrowserSessionTargetInfo };

export type BrowserRuntimeAppServerClient = Pick<AppServerClient, "request">;

export interface BrowserRuntimeClientDeps {
  appServerClient?: BrowserRuntimeAppServerClient;
}

function appServerClientFromDeps(
  deps: BrowserRuntimeClientDeps,
): BrowserRuntimeAppServerClient {
  return deps.appServerClient ?? new AppServerClient();
}

function assertRecord<T>(
  value: T | null | undefined,
  method: string,
): NonNullable<T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`App Server ${method} did not return an object response`);
  }
  return value;
}

export async function listBrowserSessionTargets(
  params: BrowserSessionTargetListParams,
  deps: BrowserRuntimeClientDeps = {},
): Promise<BrowserSessionTargetListResponse> {
  const response =
    await appServerClientFromDeps(deps).request<BrowserSessionTargetListResponse>(
      METHOD_BROWSER_SESSION_TARGET_LIST,
      params,
    );
  const result = assertRecord(response.result, METHOD_BROWSER_SESSION_TARGET_LIST);
  if (!Array.isArray(result.targets)) {
    throw new Error(
      `App Server ${METHOD_BROWSER_SESSION_TARGET_LIST} did not return targets`,
    );
  }
  return result;
}

export async function openBrowserSession(
  params: BrowserSessionOpenParams,
  deps: BrowserRuntimeClientDeps = {},
): Promise<BrowserSessionOpenResponse> {
  const response =
    await appServerClientFromDeps(deps).request<BrowserSessionOpenResponse>(
      METHOD_BROWSER_SESSION_OPEN,
      params,
    );
  const result = assertRecord(response.result, METHOD_BROWSER_SESSION_OPEN);
  assertRecord(result.session, METHOD_BROWSER_SESSION_OPEN);
  return result;
}

export async function readBrowserSession(
  params: BrowserSessionIdParams,
  deps: BrowserRuntimeClientDeps = {},
): Promise<BrowserSessionReadResponse> {
  const response =
    await appServerClientFromDeps(deps).request<BrowserSessionReadResponse>(
      METHOD_BROWSER_SESSION_READ,
      params,
    );
  const result = assertRecord(response.result, METHOD_BROWSER_SESSION_READ);
  assertRecord(result.session, METHOD_BROWSER_SESSION_READ);
  return result;
}

export async function closeBrowserSession(
  params: BrowserSessionIdParams,
  deps: BrowserRuntimeClientDeps = {},
): Promise<BrowserSessionCloseResponse> {
  const response =
    await appServerClientFromDeps(deps).request<BrowserSessionCloseResponse>(
      METHOD_BROWSER_SESSION_CLOSE,
      params,
    );
  const result = assertRecord(response.result, METHOD_BROWSER_SESSION_CLOSE);
  if (typeof result.status !== "string" || typeof result.sessionId !== "string") {
    throw new Error(
      `App Server ${METHOD_BROWSER_SESSION_CLOSE} did not return close status`,
    );
  }
  return result;
}

export async function listBrowserSessionEvents(
  params: BrowserSessionEventListParams,
  deps: BrowserRuntimeClientDeps = {},
): Promise<BrowserSessionEventListResponse> {
  const response =
    await appServerClientFromDeps(deps).request<BrowserSessionEventListResponse>(
      METHOD_BROWSER_SESSION_EVENT_LIST,
      params,
    );
  const result = assertRecord(response.result, METHOD_BROWSER_SESSION_EVENT_LIST);
  if (!Array.isArray(result.events) || typeof result.nextCursor !== "number") {
    throw new Error(
      `App Server ${METHOD_BROWSER_SESSION_EVENT_LIST} did not return event list`,
    );
  }
  return result;
}

export async function executeBrowserSessionAction(
  params: BrowserSessionActionExecuteParams,
  deps: BrowserRuntimeClientDeps = {},
): Promise<BrowserSessionActionExecuteResponse> {
  const response =
    await appServerClientFromDeps(deps).request<BrowserSessionActionExecuteResponse>(
      METHOD_BROWSER_SESSION_ACTION_EXECUTE,
      params,
    );
  const result = assertRecord(
    response.result,
    METHOD_BROWSER_SESSION_ACTION_EXECUTE,
  );
  if (typeof result.sessionId !== "string" || typeof result.action !== "string") {
    throw new Error(
      `App Server ${METHOD_BROWSER_SESSION_ACTION_EXECUTE} did not return action result`,
    );
  }
  return result;
}
