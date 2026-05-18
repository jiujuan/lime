import {
  buildLimeCapabilityInvokeRequest,
  type LimeCapabilityInvoker,
  type LimeCapabilityInvokeRequest,
  type LimeCapabilityInvokeResponse,
  type LimeCapabilityMethod,
  type LimeCapabilityName,
  type LimeTypedCapabilityInvokeRequest,
  type LimeTypedCapabilityInvokeResponse,
} from "./capabilityContract";
import {
  toLimeCapabilityError,
  type LimeCapabilityError,
} from "./capabilityErrors";

export const LIME_AGENT_APP_BRIDGE_PROTOCOL = "lime.agentApp.bridge";
export const LIME_AGENT_APP_BRIDGE_VERSION = 1;

export interface LimeAgentAppBridgeClientMessage {
  protocol: typeof LIME_AGENT_APP_BRIDGE_PROTOCOL;
  version: typeof LIME_AGENT_APP_BRIDGE_VERSION;
  type: string;
  requestId?: string;
  appId: string;
  entryKey?: string;
  payload?: unknown;
}

interface LimeHostBridgeMessageEvent {
  data: unknown;
  origin: string;
  source: unknown;
}

interface LimeHostBridgeWindowLike {
  readonly parent: {
    postMessage(message: LimeAgentAppBridgeClientMessage, targetOrigin: string): void;
  };
  readonly self?: unknown;
  addEventListener(
    type: "message",
    listener: (event: LimeHostBridgeMessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: LimeHostBridgeMessageEvent) => void,
  ): void;
  setTimeout(handler: () => void, timeoutMs: number): number;
  clearTimeout(timerId: number): void;
}

export interface CreateLimeHostBridgeCapabilityInvokerOptions {
  appId: string;
  entryKey?: string;
  windowRef?: LimeHostBridgeWindowLike;
  hostWindow?: LimeHostBridgeWindowLike;
  targetOrigin?: string;
  trustedHostOrigin?: string;
  requestTimeoutMs?: number;
  requestIdPrefix?: string;
  onSnapshot?: LimeHostBridgeEventHandler;
  onTheme?: LimeHostBridgeEventHandler;
  onVisibility?: LimeHostBridgeEventHandler;
  onCapabilityEvent?: LimeHostBridgeCapabilityEventHandler;
}

export interface LimeHostBridgeCapabilityInvoker extends LimeCapabilityInvoker {
  send(type: string, payload?: unknown, requestId?: string): void;
  request(
    type: string,
    payload?: unknown,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<unknown>;
  ready(): void;
  getSnapshot(): void;
  notifyHost(
    message: string,
    level?: LimeHostBridgeNotifyPayload["level"],
  ): Promise<LimeCapabilityInvokeResponse<{ accepted: true }>>;
  sendReady(): void;
  getHostSnapshot(): Promise<LimeCapabilityInvokeResponse<unknown>>;
  notifyHost(
    payload: LimeHostBridgeNotifyPayload,
  ): Promise<LimeCapabilityInvokeResponse<{ accepted: true }>>;
  navigateHost(
    payload: LimeHostBridgeNavigatePayload,
  ): Promise<LimeCapabilityInvokeResponse<{ navigatedTo: string }>>;
  openExternalHost(
    payload: LimeHostBridgeOpenExternalPayload,
  ): Promise<LimeCapabilityInvokeResponse<{ opened: true }>>;
  selectDirectoryHost(
    payload?: LimeHostBridgeSelectDirectoryPayload,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeSelectDirectoryResult>>;
  downloadHost(
    payload: LimeHostBridgeDownloadPayload,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<LimeCapabilityInvokeResponse<{ downloaded: true }>>;
  onHostSnapshot(handler: LimeHostBridgeEventHandler): () => void;
  onThemeUpdate(handler: LimeHostBridgeEventHandler): () => void;
  onVisibilityChange(handler: LimeHostBridgeEventHandler): () => void;
  onCapabilityEvent(handler: LimeHostBridgeCapabilityEventHandler): () => void;
  invoke<
    Capability extends LimeCapabilityName,
    Method extends LimeCapabilityMethod<Capability>,
  >(
    request: LimeHostBridgeLegacyInvokeRequest<Capability, Method>,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<unknown>;
  subscribe(
    request: LimeHostBridgeCapabilitySubscribeRequest,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<unknown>;
  unsubscribe(
    subscriptionId: string,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<unknown>;
  subscribeCapability(
    request: LimeHostBridgeCapabilitySubscribeRequest,
    handler?: LimeHostBridgeCapabilityEventHandler,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeCapabilitySubscription>>;
  unsubscribeCapability(
    subscriptionId: string,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeCapabilityUnsubscribeResult>>;
  download(
    url: string,
    fileName?: string,
    options?: LimeHostBridgeLegacyRequestOptions,
  ): Promise<unknown>;
  getCallLog(): LimeHostBridgeLegacyCallLogEntry[];
  dispose(): void;
  readonly pendingRequestCount: number;
}

export interface LimeHostBridgeLegacyRequestOptions {
  requestId?: string;
  timeoutMs?: number;
}

export interface LimeHostBridgeLegacyInvokeRequest<
  Capability extends LimeCapabilityName = LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability> = LimeCapabilityMethod<Capability>,
> {
  capability: Capability;
  method: Method;
  args?: unknown;
  provenance?: LimeCapabilityInvokeRequest["provenance"];
}

export interface LimeHostBridgeLegacyCallLogEntry {
  capability: string;
  method: string;
  args?: unknown;
}

export interface LimeHostBridgeNotifyPayload {
  message: string;
  level?: "info" | "success" | "warning" | "error";
}

export interface LimeHostBridgeDownloadPayload {
  url: string;
  fileName?: string;
}

export interface LimeHostBridgeNavigatePayload {
  route?: string;
  url?: string;
}

export interface LimeHostBridgeOpenExternalPayload {
  url: string;
}

export interface LimeHostBridgeSelectDirectoryPayload {
  title?: string;
}

export interface LimeHostBridgeSelectDirectoryResult {
  path: string | null;
  cancelled: boolean;
  message?: string;
}

export type LimeHostBridgeEventHandler = (payload: unknown) => void;

export interface LimeHostBridgeCapabilitySubscribeRequest {
  capability: LimeCapabilityName;
  topic: string;
  input?: unknown;
  subscriptionId?: string;
  pollIntervalMs?: number;
  bridgeAction?: string;
}

export interface LimeHostBridgeCapabilitySubscription {
  subscriptionId: string;
  capability: LimeCapabilityName;
  topic: string;
  taskId?: string;
  pollIntervalMs?: number;
  bridgeAction?: string;
}

export interface LimeHostBridgeCapabilityUnsubscribeResult {
  subscriptionId: string;
  unsubscribed: boolean;
}

export interface LimeHostBridgeCapabilityEvent {
  subscriptionId?: string;
  capability?: string;
  topic?: string;
  eventType?: string;
  taskId?: string;
  task?: unknown;
  events?: unknown[];
  snapshot?: unknown;
  error?: unknown;
  emittedAt?: string;
}

export type LimeHostBridgeCapabilityEventHandler = (
  event: LimeHostBridgeCapabilityEvent,
) => void;

interface PendingBridgeRequest {
  request: LimeCapabilityInvokeRequest;
  resolve: (response: LimeCapabilityInvokeResponse) => void;
  timerId: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_DIRECTORY_PICKER_TIMEOUT_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function attachOptional<T extends Record<string, unknown>>(
  target: T,
  values: Record<string, unknown | undefined>,
): T {
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  });
  return target;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unwrapLegacyResponse<T>(response: LimeCapabilityInvokeResponse<T>): T {
  if (response.ok) {
    return response.value;
  }
  const error = new Error(response.error.message) as Error & {
    code?: string;
    payload?: unknown;
    capability?: string;
    method?: string;
    requestId?: string;
  };
  error.code = response.error.code;
  error.payload = response.error;
  error.capability = response.error.capability;
  error.method = response.error.method;
  error.requestId = response.error.requestId;
  throw error;
}

function isBridgeMessage(
  value: unknown,
): value is LimeAgentAppBridgeClientMessage {
  return (
    isRecord(value) &&
    value.protocol === LIME_AGENT_APP_BRIDGE_PROTOCOL &&
    value.version === LIME_AGENT_APP_BRIDGE_VERSION &&
    typeof value.type === "string" &&
    typeof value.appId === "string" &&
    (value.requestId === undefined || typeof value.requestId === "string") &&
    (value.entryKey === undefined || typeof value.entryKey === "string")
  );
}

function normalizeHostResponsePayload(
  payload: unknown,
  context: {
    appId: string;
    entryKey?: string;
    request: LimeCapabilityInvokeRequest;
  },
): LimeCapabilityInvokeResponse {
  if (isRecord(payload) && payload.ok === false) {
    return {
      ok: false,
      error: toLimeCapabilityError(payload.error ?? payload, {
        appId: context.appId,
        entryKey: context.entryKey,
        capability: context.request.capability,
        method: context.request.method,
        requestId: context.request.requestId,
      }),
    };
  }

  if (isRecord(payload) && payload.ok === true) {
    const value = Object.prototype.hasOwnProperty.call(payload, "value")
      ? payload.value
      : Object.prototype.hasOwnProperty.call(payload, "result")
        ? payload.result
        : undefined;
    return attachOptional<LimeCapabilityInvokeResponse & Record<string, unknown>>(
      {
        ok: true,
        value,
      },
      {
        traceId: readString(payload.traceId),
        evidenceId: readString(payload.evidenceId),
      },
    ) as LimeCapabilityInvokeResponse;
  }

  if (isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, "result")) {
    return {
      ok: true,
      value: payload.result,
    };
  }

  return {
    ok: true,
    value: payload,
  };
}

function buildBridgePayload(
  request: LimeCapabilityInvokeRequest,
): Record<string, unknown> {
  return attachOptional<Record<string, unknown>>(
    {
      capability: request.capability,
      method: request.method,
    },
    {
      input: request.args,
      idempotencyKey: request.idempotencyKey,
      expectedSchema: request.expectedSchema,
      provenance: request.provenance,
    },
  );
}

class BrowserLimeHostBridgeCapabilityInvoker
  implements LimeHostBridgeCapabilityInvoker
{
  private readonly appId: string;
  private entryKey?: string;
  private readonly windowRef?: LimeHostBridgeWindowLike;
  private readonly targetOrigin: string;
  private readonly trustedHostOrigin?: string;
  private readonly requestTimeoutMs: number;
  private readonly requestIdPrefix: string;
  private readonly pendingRequests = new Map<string, PendingBridgeRequest>();
  private readonly subscriptionHandlers = new Map<
    string,
    LimeHostBridgeCapabilityEventHandler
  >();
  private readonly snapshotHandlers = new Set<LimeHostBridgeEventHandler>();
  private readonly themeHandlers = new Set<LimeHostBridgeEventHandler>();
  private readonly visibilityHandlers = new Set<LimeHostBridgeEventHandler>();
  private readonly capabilityEventHandlers =
    new Set<LimeHostBridgeCapabilityEventHandler>();
  private readonly callLog: LimeHostBridgeLegacyCallLogEntry[] = [];
  private requestSequence = 0;
  private disposed = false;

  constructor(options: CreateLimeHostBridgeCapabilityInvokerOptions) {
    this.appId = options.appId;
    this.entryKey = options.entryKey;
    this.windowRef =
      options.windowRef ??
      options.hostWindow ??
      (typeof window === "undefined"
        ? undefined
        : (window as unknown as LimeHostBridgeWindowLike));
    this.targetOrigin = options.targetOrigin ?? options.trustedHostOrigin ?? "*";
    this.trustedHostOrigin = options.trustedHostOrigin;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.requestIdPrefix = options.requestIdPrefix ?? "lime-capability";
    if (options.onSnapshot) {
      this.snapshotHandlers.add(options.onSnapshot);
    }
    if (options.onTheme) {
      this.themeHandlers.add(options.onTheme);
    }
    if (options.onVisibility) {
      this.visibilityHandlers.add(options.onVisibility);
    }
    if (options.onCapabilityEvent) {
      this.capabilityEventHandlers.add(options.onCapabilityEvent);
    }
    this.windowRef?.addEventListener("message", this.handleHostMessage);
  }

  get pendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  async call<
    Capability extends LimeCapabilityName,
    Method extends LimeCapabilityMethod<Capability>,
  >(
    request: LimeTypedCapabilityInvokeRequest<Capability, Method>,
  ): Promise<LimeTypedCapabilityInvokeResponse<Capability, Method>> {
    this.callLog.push({
      capability: request.capability,
      method: request.method,
      args: request.args,
    });
    const normalizedRequest = {
      ...request,
      requestId: request.requestId ?? this.nextRequestId(request),
    } as LimeCapabilityInvokeRequest;
    return this.requestBridgeAction(
      "capability:invoke",
      buildBridgePayload(normalizedRequest),
      normalizedRequest,
    ) as Promise<LimeTypedCapabilityInvokeResponse<Capability, Method>>;
  }

  readonly send = (
    type: string,
    payload?: unknown,
    requestId?: string,
  ): void => {
    this.postBridgeMessage(type, payload, requestId);
  };

  readonly request = (
    type: string,
    payload?: unknown,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<unknown> => {
    const request = this.buildHostActionContext(
      "lime.ui",
      type || "request",
      options.requestId,
    );
    return this.requestBridgeAction(type, payload, request, options).then(
      unwrapLegacyResponse,
    );
  };

  readonly ready = (): void => {
    this.sendReady();
  };

  sendReady(): void {
    this.postBridgeMessage("app:ready");
  }

  readonly getSnapshot = (): void => {
    this.postBridgeMessage("host:getSnapshot");
  };

  getHostSnapshot(): Promise<LimeCapabilityInvokeResponse<unknown>> {
    const request = this.buildHostActionContext("lime.ui", "getSnapshot");
    return this.requestBridgeAction("host:getSnapshot", undefined, request);
  }

  notifyHost(
    payloadOrMessage: LimeHostBridgeNotifyPayload | string,
    level?: LimeHostBridgeNotifyPayload["level"],
  ): Promise<LimeCapabilityInvokeResponse<{ accepted: true }>> {
    const payload =
      typeof payloadOrMessage === "string"
        ? { message: payloadOrMessage, level }
        : payloadOrMessage;
    const request = this.buildHostActionContext("lime.ui", "toast");
    return this.requestBridgeAction(
      "host:toast",
      payload,
      request,
    ) as Promise<LimeCapabilityInvokeResponse<{ accepted: true }>>;
  }

  navigateHost(
    payload: LimeHostBridgeNavigatePayload,
  ): Promise<LimeCapabilityInvokeResponse<{ navigatedTo: string }>> {
    const request = this.buildHostActionContext("lime.ui", "navigate");
    return this.requestBridgeAction(
      "host:navigate",
      payload,
      request,
    ) as Promise<LimeCapabilityInvokeResponse<{ navigatedTo: string }>>;
  }

  openExternalHost(
    payload: LimeHostBridgeOpenExternalPayload,
  ): Promise<LimeCapabilityInvokeResponse<{ opened: true }>> {
    const request = this.buildHostActionContext("lime.ui", "openExternal");
    return this.requestBridgeAction(
      "host:openExternal",
      payload,
      request,
    ) as Promise<LimeCapabilityInvokeResponse<{ opened: true }>>;
  }

  selectDirectoryHost(
    payload: LimeHostBridgeSelectDirectoryPayload = {},
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeSelectDirectoryResult>> {
    const request = {
      capability: "lime.ui",
      method: "selectDirectory",
      args: payload,
      requestId:
        options.requestId ??
        this.nextRequestId({
          capability: "lime.ui",
          method: "selectDirectory",
        } as LimeCapabilityInvokeRequest),
    } as LimeCapabilityInvokeRequest;
    this.callLog.push({
      capability: request.capability,
      method: request.method,
      args: payload,
    });
    return this.requestBridgeAction(
      "capability:invoke",
      buildBridgePayload(request),
      request,
      {
        ...options,
        timeoutMs: options.timeoutMs ?? DEFAULT_DIRECTORY_PICKER_TIMEOUT_MS,
      },
    ) as Promise<LimeCapabilityInvokeResponse<LimeHostBridgeSelectDirectoryResult>>;
  }

  downloadHost(
    payload: LimeHostBridgeDownloadPayload,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<LimeCapabilityInvokeResponse<{ downloaded: true }>> {
    const request = this.buildHostActionContext("lime.ui", "download");
    return this.requestBridgeAction(
      "host:download",
      payload,
      request,
      options,
    ) as Promise<LimeCapabilityInvokeResponse<{ downloaded: true }>>;
  }

  onHostSnapshot(handler: LimeHostBridgeEventHandler): () => void {
    this.snapshotHandlers.add(handler);
    return () => {
      this.snapshotHandlers.delete(handler);
    };
  }

  onThemeUpdate(handler: LimeHostBridgeEventHandler): () => void {
    this.themeHandlers.add(handler);
    return () => {
      this.themeHandlers.delete(handler);
    };
  }

  onVisibilityChange(handler: LimeHostBridgeEventHandler): () => void {
    this.visibilityHandlers.add(handler);
    return () => {
      this.visibilityHandlers.delete(handler);
    };
  }

  onCapabilityEvent(handler: LimeHostBridgeCapabilityEventHandler): () => void {
    this.capabilityEventHandlers.add(handler);
    return () => {
      this.capabilityEventHandlers.delete(handler);
    };
  }

  invoke<
    Capability extends LimeCapabilityName,
    Method extends LimeCapabilityMethod<Capability>,
  >(
    request: LimeHostBridgeLegacyInvokeRequest<Capability, Method>,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<unknown> {
    return this.call(
      buildLimeCapabilityInvokeRequest({
        capability: request.capability,
        method: request.method,
        args: request.args as never,
        requestId: options.requestId,
        provenance: request.provenance,
      }),
    ).then(unwrapLegacyResponse);
  }

  subscribe(
    request: LimeHostBridgeCapabilitySubscribeRequest,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<unknown> {
    return this.subscribeCapability(request, undefined, options).then(
      unwrapLegacyResponse,
    );
  }

  unsubscribe(
    subscriptionId: string,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<unknown> {
    return this.unsubscribeCapability(subscriptionId, options).then(
      unwrapLegacyResponse,
    );
  }

  async subscribeCapability(
    request: LimeHostBridgeCapabilitySubscribeRequest,
    handler?: LimeHostBridgeCapabilityEventHandler,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeCapabilitySubscription>> {
    const context = {
      capability: request.capability,
      method: "subscribe",
      requestId:
        options.requestId ??
        this.nextRequestId({
          capability: request.capability,
          method: "subscribe",
        } as LimeCapabilityInvokeRequest),
    } as LimeCapabilityInvokeRequest;
    const response = await this.requestBridgeAction(
      "capability:subscribe",
      attachOptional<Record<string, unknown>>(
        {
          capability: request.capability,
          topic: request.topic,
        },
        {
          input: request.input,
          subscriptionId: request.subscriptionId,
          pollIntervalMs: request.pollIntervalMs,
          bridgeAction: request.bridgeAction,
        },
      ),
      context,
      options,
    );
    if (response.ok && isRecord(response.value)) {
      const subscriptionId = readString(response.value.subscriptionId);
      if (subscriptionId && handler) {
        this.subscriptionHandlers.set(subscriptionId, handler);
      }
    }
    return response as LimeCapabilityInvokeResponse<LimeHostBridgeCapabilitySubscription>;
  }

  async unsubscribeCapability(
    subscriptionId: string,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeCapabilityUnsubscribeResult>> {
    const context = {
      capability: "lime.agent",
      method: "unsubscribe",
      requestId:
        options.requestId ??
        this.nextRequestId({
          capability: "lime.agent",
          method: "unsubscribe",
        } as LimeCapabilityInvokeRequest),
    } as LimeCapabilityInvokeRequest;
    const response = await this.requestBridgeAction(
      "capability:unsubscribe",
      { subscriptionId },
      context,
      options,
    );
    if (response.ok) {
      this.subscriptionHandlers.delete(subscriptionId);
    }
    return response as LimeCapabilityInvokeResponse<LimeHostBridgeCapabilityUnsubscribeResult>;
  }

  download(
    url: string,
    fileName?: string,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<unknown> {
    return this.downloadHost({ url, fileName }, options).then(
      unwrapLegacyResponse,
    );
  }

  readonly getCallLog = (): LimeHostBridgeLegacyCallLogEntry[] => {
    return [...this.callLog];
  };

  private requestBridgeAction(
    type: string,
    payload: unknown,
    request: LimeCapabilityInvokeRequest,
    options: LimeHostBridgeLegacyRequestOptions = {},
  ): Promise<LimeCapabilityInvokeResponse> {
    if (this.disposed || !this.windowRef || this.windowRef.parent === this.windowRef.self) {
      return Promise.resolve({
        ok: false,
        error: this.buildError(
          "CAPABILITY_BLOCKED",
          "Lime host bridge is not connected.",
          request,
        ),
      });
    }

    return new Promise<LimeCapabilityInvokeResponse>((resolve) => {
      const timerId = this.windowRef!.setTimeout(() => {
        this.pendingRequests.delete(request.requestId!);
        resolve({
          ok: false,
          error: this.buildError(
            "TIMEOUT",
            "Lime host bridge request timed out.",
            request,
          ),
        });
      }, options.timeoutMs ?? this.requestTimeoutMs);
      this.pendingRequests.set(request.requestId!, {
        request,
        resolve,
        timerId,
      });
      this.postBridgeMessage(type, payload, request.requestId);
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.windowRef?.removeEventListener("message", this.handleHostMessage);
    for (const pending of this.pendingRequests.values()) {
      this.windowRef?.clearTimeout(pending.timerId);
    }
    this.pendingRequests.clear();
    this.subscriptionHandlers.clear();
    this.snapshotHandlers.clear();
    this.themeHandlers.clear();
    this.visibilityHandlers.clear();
  }

  private readonly handleHostMessage = (event: LimeHostBridgeMessageEvent) => {
    if (event.source !== this.windowRef?.parent) {
      return;
    }
    if (this.trustedHostOrigin && event.origin !== this.trustedHostOrigin) {
      return;
    }
    if (!isBridgeMessage(event.data)) {
      return;
    }
    if (event.data.appId !== this.appId) {
      return;
    }
    if (this.entryKey && event.data.entryKey && event.data.entryKey !== this.entryKey) {
      return;
    }
    if (event.data.type === "host:snapshot") {
      if (isRecord(event.data.payload) && isRecord(event.data.payload.app)) {
        this.entryKey =
          readString(event.data.payload.app.entryKey) ?? this.entryKey;
      }
      this.dispatchHostEvent(this.snapshotHandlers, event.data.payload);
      if (event.data.requestId) {
        this.settlePendingResponse(event.data.requestId, event.data.payload);
      }
      return;
    }
    if (event.data.type === "theme:update") {
      this.dispatchHostEvent(this.themeHandlers, event.data.payload);
      return;
    }
    if (event.data.type === "host:visibility") {
      this.dispatchHostEvent(this.visibilityHandlers, event.data.payload);
      return;
    }
    if (event.data.type === "capability:event") {
      this.dispatchCapabilityEvent(event.data.payload);
      return;
    }
    if (event.data.type !== "host:response" && event.data.type !== "host:error") {
      return;
    }
    const requestId = event.data.requestId;
    if (!requestId) {
      return;
    }
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    this.windowRef?.clearTimeout(pending.timerId);
    this.pendingRequests.delete(requestId);
    if (event.data.type === "host:error") {
      pending.resolve({
        ok: false,
        error: toLimeCapabilityError(event.data.payload, {
          appId: this.appId,
          entryKey: this.entryKey,
          capability: pending.request.capability,
          method: pending.request.method,
          requestId,
        }),
      });
      return;
    }
    pending.resolve(
      normalizeHostResponsePayload(event.data.payload, {
        appId: this.appId,
        entryKey: this.entryKey,
        request: pending.request,
      }),
    );
  };

  private settlePendingResponse(requestId: string, payload: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    this.windowRef?.clearTimeout(pending.timerId);
    this.pendingRequests.delete(requestId);
    pending.resolve(
      normalizeHostResponsePayload(payload, {
        appId: this.appId,
        entryKey: this.entryKey,
        request: pending.request,
      }),
    );
  }

  private dispatchHostEvent(
    handlers: Set<LimeHostBridgeEventHandler>,
    payload: unknown,
  ): void {
    for (const handler of handlers) {
      handler(payload);
    }
  }

  private dispatchCapabilityEvent(payload: unknown): void {
    if (!isRecord(payload)) {
      return;
    }
    const subscriptionId = readString(payload.subscriptionId);
    const event = payload as LimeHostBridgeCapabilityEvent;
    for (const handler of this.capabilityEventHandlers) {
      handler(event);
    }
    if (!subscriptionId) {
      return;
    }
    const handler = this.subscriptionHandlers.get(subscriptionId);
    if (!handler) {
      return;
    }
    handler(event);
  }

  private postBridgeMessage(
    type: string,
    payload?: unknown,
    requestId?: string,
  ): void {
    if (this.disposed || !this.windowRef || this.windowRef.parent === this.windowRef.self) {
      return;
    }
    this.windowRef.parent.postMessage(
      this.buildMessage(type, payload, requestId),
      this.targetOrigin,
    );
  }

  private buildMessage(
    type: string,
    payload?: unknown,
    requestId?: string,
  ): LimeAgentAppBridgeClientMessage {
    return {
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type,
      requestId,
      appId: this.appId,
      entryKey: this.entryKey,
      payload,
    };
  }

  private buildHostActionContext(
    capability: LimeCapabilityName,
    method: string,
    requestId?: string,
  ): LimeCapabilityInvokeRequest {
    return {
      capability,
      method,
      requestId:
        requestId ??
        this.nextRequestId({ capability, method } as LimeCapabilityInvokeRequest),
    } as LimeCapabilityInvokeRequest;
  }

  private nextRequestId(request: LimeCapabilityInvokeRequest): string {
    this.requestSequence += 1;
    return `${this.requestIdPrefix}-${this.requestSequence}-${request.capability}:${request.method}`;
  }

  private buildError(
    code: string,
    message: string,
    request: LimeCapabilityInvokeRequest,
  ): LimeCapabilityError {
    return toLimeCapabilityError({
      code,
      message,
    }, {
      appId: this.appId,
      entryKey: this.entryKey,
      capability: request.capability,
      method: request.method,
      requestId: request.requestId,
    });
  }
}

export function createLimeHostBridgeCapabilityInvoker(
  options: CreateLimeHostBridgeCapabilityInvokerOptions,
): LimeHostBridgeCapabilityInvoker {
  return new BrowserLimeHostBridgeCapabilityInvoker(options);
}
