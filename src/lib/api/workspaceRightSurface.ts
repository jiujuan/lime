import { AppServerClient } from "@/lib/api/appServer";
import {
  subscribeAppServerNotifications,
  type AppServerEventBusDrainOptions,
  type AppServerEventBusSubscription,
} from "@/lib/api/appServerEventBus";
import {
  METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME,
  METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED,
  METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS,
  METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
  METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  workspaceRightSurfacePendingChangedNotification as parseWorkspaceRightSurfacePendingChangedNotification,
  type JsonRpcMessage,
  type WorkspaceRightSurfacePendingChangedNotification,
  type WorkspaceRightSurfacePendingChangedParams,
  type WorkspaceRightSurfacePendingConsumeParams,
  type WorkspaceRightSurfacePendingConsumeResponse,
  type WorkspaceRightSurfacePendingDismissParams,
  type WorkspaceRightSurfacePendingDismissResponse,
  type WorkspaceRightSurfacePendingListParams,
  type WorkspaceRightSurfacePendingListResponse,
  type WorkspaceRightSurfacePendingRequest,
  type WorkspaceRightSurfaceRequestParams,
  type WorkspaceRightSurfaceRequestResponse,
} from "../../../packages/app-server-client/src/protocol";

export type {
  WorkspaceRightSurfacePendingChangedNotification,
  WorkspaceRightSurfacePendingChangedParams,
  WorkspaceRightSurfacePendingConsumeParams,
  WorkspaceRightSurfacePendingConsumeResponse,
  WorkspaceRightSurfacePendingDismissParams,
  WorkspaceRightSurfacePendingDismissResponse,
  WorkspaceRightSurfacePendingListParams,
  WorkspaceRightSurfacePendingListResponse,
  WorkspaceRightSurfacePendingRequest,
  WorkspaceRightSurfaceRequestParams,
  WorkspaceRightSurfaceRequestResponse,
} from "../../../packages/app-server-client/src/protocol";

export type WorkspaceRightSurfaceAppServerClient = Pick<
  AppServerClient,
  "request"
> &
  Partial<Pick<AppServerClient, "drainEvents">>;

export type WorkspaceRightSurfacePendingEventClient = Pick<
  AppServerClient,
  "drainEvents"
>;

export interface WorkspaceRightSurfacePendingChangedSubscription {
  onChanges: (changes: WorkspaceRightSurfacePendingChangedParams[]) => void;
  onError?: (error: unknown) => void;
}

export type WorkspaceRightSurfacePendingChangedSubscriber = (
  subscription: WorkspaceRightSurfacePendingChangedSubscription,
  options?: AppServerEventBusDrainOptions & {
    isBridgeAvailable?: () => boolean;
  },
) => () => void;

export interface WorkspaceRightSurfaceClientDeps {
  appServerClient?: WorkspaceRightSurfaceAppServerClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPendingRequest(value: unknown): value is WorkspaceRightSurfacePendingRequest {
  return (
    isRecord(value) &&
    typeof value.requestId === "string" &&
    typeof value.surfaceKind === "string" &&
    typeof value.origin === "string" &&
    typeof value.priority === "string" &&
    typeof value.status === "string" &&
    typeof value.requestedAt === "string" &&
    isOptionalString(value.workspaceId) &&
    isOptionalString(value.workspaceRoot) &&
    isOptionalString(value.sessionId) &&
    isOptionalString(value.candidateId) &&
    isOptionalString(value.reason) &&
    isOptionalString(value.expiresAt) &&
    isOptionalFiniteNumber(value.ttlMs)
  );
}

function assertRequestResponse(
  response: WorkspaceRightSurfaceRequestResponse | null | undefined,
): WorkspaceRightSurfaceRequestResponse {
  if (!isRecord(response)) {
    throw new Error(
      "App Server workspaceRightSurface/request did not return a response",
    );
  }

  if (
    typeof response.status !== "string" ||
    typeof response.requestId !== "string" ||
    !isPendingRequest(response.pending)
  ) {
    throw new Error(
      "App Server workspaceRightSurface/request did not return a valid pending request",
    );
  }

  return response;
}

function assertPendingListResponse(
  response: WorkspaceRightSurfacePendingListResponse | null | undefined,
): WorkspaceRightSurfacePendingListResponse {
  if (!isRecord(response) || !Array.isArray(response.pending)) {
    throw new Error(
      "App Server workspaceRightSurface/pending/list did not return pending requests",
    );
  }

  if (!response.pending.every(isPendingRequest)) {
    throw new Error(
      "App Server workspaceRightSurface/pending/list did not return valid pending requests",
    );
  }

  return response;
}

function assertPendingConsumeResponse(
  response: WorkspaceRightSurfacePendingConsumeResponse | null | undefined,
): WorkspaceRightSurfacePendingConsumeResponse {
  if (
    !isRecord(response) ||
    typeof response.status !== "string" ||
    !isStringArray(response.consumedRequestIds) ||
    !isStringArray(response.missingRequestIds)
  ) {
    throw new Error(
      "App Server workspaceRightSurface/pending/consume did not return consumed request ids",
    );
  }

  return response;
}

function assertPendingDismissResponse(
  response: WorkspaceRightSurfacePendingDismissResponse | null | undefined,
): WorkspaceRightSurfacePendingDismissResponse {
  if (
    !isRecord(response) ||
    typeof response.status !== "string" ||
    !isStringArray(response.dismissedRequestIds) ||
    !isStringArray(response.missingRequestIds)
  ) {
    throw new Error(
      "App Server workspaceRightSurface/pending/dismiss did not return dismissed request ids",
    );
  }

  return response;
}

export async function requestWorkspaceRightSurface(
  params: WorkspaceRightSurfaceRequestParams,
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<WorkspaceRightSurfaceRequestResponse> {
  const appServerClient = deps.appServerClient ?? new AppServerClient();
  const response =
    await appServerClient.request<WorkspaceRightSurfaceRequestResponse>(
      METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
      params,
    );
  return assertRequestResponse(response.result);
}

export async function listWorkspaceRightSurfacePending(
  params: WorkspaceRightSurfacePendingListParams = {},
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<WorkspaceRightSurfacePendingListResponse> {
  const appServerClient = deps.appServerClient ?? new AppServerClient();
  const response =
    await appServerClient.request<WorkspaceRightSurfacePendingListResponse>(
      METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
      params,
    );
  return assertPendingListResponse(response.result);
}

export async function consumeWorkspaceRightSurfacePending(
  params: WorkspaceRightSurfacePendingConsumeParams,
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<WorkspaceRightSurfacePendingConsumeResponse> {
  const appServerClient = deps.appServerClient ?? new AppServerClient();
  const response =
    await appServerClient.request<WorkspaceRightSurfacePendingConsumeResponse>(
      METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME,
      params,
    );
  return assertPendingConsumeResponse(response.result);
}

export async function dismissWorkspaceRightSurfacePending(
  params: WorkspaceRightSurfacePendingDismissParams,
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<WorkspaceRightSurfacePendingDismissResponse> {
  const appServerClient = deps.appServerClient ?? new AppServerClient();
  const response =
    await appServerClient.request<WorkspaceRightSurfacePendingDismissResponse>(
      METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS,
      params,
  );
  return assertPendingDismissResponse(response.result);
}

export function readWorkspaceRightSurfacePendingChangedNotification(
  message: unknown,
): WorkspaceRightSurfacePendingChangedNotification | null {
  if (!isRecord(message)) {
    return null;
  }
  return (
    parseWorkspaceRightSurfacePendingChangedNotification(
      message as JsonRpcMessage,
    ) ?? null
  );
}

export async function drainWorkspaceRightSurfacePendingChangedNotifications(
  limit = 20,
  deps: { appServerClient?: WorkspaceRightSurfacePendingEventClient } = {},
): Promise<WorkspaceRightSurfacePendingChangedParams[]> {
  const appServerClient = deps.appServerClient ?? new AppServerClient();
  const messages = await appServerClient.drainEvents(limit);
  return messages
    .map(readWorkspaceRightSurfacePendingChangedNotification)
    .filter(
      (
        notification,
      ): notification is WorkspaceRightSurfacePendingChangedNotification =>
        notification !== null &&
        notification.method ===
          METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED,
    )
    .map((notification) => notification.params);
}

export function subscribeWorkspaceRightSurfacePendingChangedNotifications(
  subscription: WorkspaceRightSurfacePendingChangedSubscription,
  options: AppServerEventBusDrainOptions & {
    isBridgeAvailable?: () => boolean;
    subscribeNotifications?: (
      subscription: AppServerEventBusSubscription,
    ) => () => void;
  } = {},
): () => void {
  const subscribeNotifications =
    options.subscribeNotifications ?? subscribeAppServerNotifications;
  return subscribeNotifications({
    getDrainOptions: () => ({
      intervalMs: options.intervalMs,
      limit: options.limit,
    }),
    onError: subscription.onError,
    onNotifications: (notifications) => {
      const changes = notifications
        .map(readWorkspaceRightSurfacePendingChangedNotification)
        .filter(
          (
            notification,
          ): notification is WorkspaceRightSurfacePendingChangedNotification =>
            notification !== null &&
            notification.method ===
              METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED,
        )
        .map((notification) => notification.params);
      if (changes.length > 0) {
        subscription.onChanges(changes);
      }
    },
    shouldDrain: options.isBridgeAvailable,
  });
}
