import {
  OEM_CLOUD_BOOTSTRAP_CHANGED_EVENT,
  OEM_CLOUD_SESSION_CHANGED_EVENT,
} from "@/lib/oemCloudSession";
import { safeListen } from "@/lib/api/bridgeEvents";
import {
  buildLimeCapabilityInvokeRequest,
  createLimeCapabilitySuccessResponse,
  type LimeCapabilityInvokeProvenance,
  type LimeCapabilityInvokeRequest,
  type LimeCapabilityName,
} from "../sdk/capabilityContract";
import { toLimeCapabilityError } from "../sdk/capabilityErrors";
import { enrichAgentCapabilityResult } from "./hostBridgeAgentCapability";
import { readCapabilityInvokeProvenance } from "./hostBridgeCapabilityInvoke";
import {
  handleUiCapabilityInvoke,
  type PluginHostAgentRunUiCloseResult,
  type PluginHostAgentRunUiOpenResult,
  type PluginHostAgentRunUiRequest,
  type PluginHostAgentRunUiUpdateResult,
} from "./hostBridgeUiCapability";
import {
  PluginHostBridgeActionError,
  hasOwn,
  isRecord,
  readErrorCode,
  readString,
} from "./hostBridgeCommon";
import {
  downloadSameOriginUrl,
  handleHostToast,
  openHostExternalUrl,
  resolveExternalUrl,
  resolveSameOriginActionUrl,
  type PluginHostBridgeNotifyPayload,
} from "./hostBridgeHostActions";
import { PluginHostBridgeSubscriptionRuntime } from "./hostBridgeSubscriptionRuntime";
import {
  LIME_COLOR_SCHEME_CHANGED_EVENT,
  LIME_THEME_CHANGED_EVENT,
  PLUGIN_BRIDGE_PROTOCOL,
  PLUGIN_BRIDGE_VERSION,
  buildPluginHostSnapshot,
  buildPluginThemePayload,
  isTrustedPluginBridgeMessage,
  readDocumentVisibilityState,
  resolvePluginRuntimeOrigin,
  type LimePluginBridgeMessage,
  type PluginHostBridgeCapabilities,
  type PluginHostSnapshotPayload,
} from "./hostBridgeSnapshot";

export {
  PLUGIN_BRIDGE_PROTOCOL,
  PLUGIN_BRIDGE_VERSION,
  buildPluginHostSnapshot,
  buildPluginThemePayload,
  isLimePluginBridgeMessage,
  isTrustedPluginBridgeMessage,
  resolvePluginRuntimeOrigin,
} from "./hostBridgeSnapshot";
export type {
  LimePluginBridgeMessage,
  PluginHostBridgeCapabilities,
  PluginHostSnapshotPayload,
  PluginThemePayload,
  PluginVisibilityState,
} from "./hostBridgeSnapshot";
export type {
  PluginHostBridgeNotifyPayload,
  PluginHostSelectDirectoryResult,
} from "./hostBridgeHostActions";
export type {
  PluginHostAgentRunUiCloseResult,
  PluginHostAgentRunUiMode,
  PluginHostAgentRunUiOpenResult,
  PluginHostAgentRunUiRequest,
  PluginHostAgentRunUiUpdateResult,
} from "./hostBridgeUiCapability";

export interface PluginHostBridgeCapabilityRequest {
  appId: string;
  entryKey?: string;
  requestId?: string;
  capability: string;
  method: string;
  args?: unknown[];
  input?: unknown;
  idempotencyKey?: string;
  expectedSchema?: unknown;
  provenance?: LimeCapabilityInvokeProvenance;
  invokeRequest: LimeCapabilityInvokeRequest;
  rawPayload: Record<string, unknown>;
}

export interface CreatePluginHostBridgeOptions {
  frame: HTMLIFrameElement;
  appId: string;
  entryKey?: string;
  displayName: string;
  entryRoute?: string;
  entryUrl: string;
  locale?: string;
  notify?: (payload: PluginHostBridgeNotifyPayload) => void;
  openExternal?: (url: string) => void | Promise<void>;
  openAgentRunUi?: (
    request: PluginHostAgentRunUiRequest,
  ) => PluginHostAgentRunUiOpenResult;
  updateAgentRunUi?: (
    request: PluginHostAgentRunUiRequest,
  ) => PluginHostAgentRunUiUpdateResult;
  closeAgentRunUi?: (
    request: Pick<PluginHostAgentRunUiRequest, "taskId" | "bridgeAction">,
  ) => PluginHostAgentRunUiCloseResult;
  cloud?:
    | PluginHostSnapshotPayload["cloud"]
    | (() => PluginHostSnapshotPayload["cloud"]);
  capabilities?: PluginHostBridgeCapabilities;
  dispatchCapability?: (
    request: PluginHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  listenRuntimeEvent?: typeof safeListen;
  now?: () => string;
}

const HOST_ACTION_TYPES = new Set([
  "host:navigate",
  "host:toast",
  "host:openExternal",
  "host:download",
  "capability:invoke",
  "capability:subscribe",
  "capability:unsubscribe",
]);

export class PluginHostBridge {
  private readonly frame: HTMLIFrameElement;
  private readonly appId: string;
  private readonly entryKey?: string;
  private readonly displayName: string;
  private readonly entryRoute?: string;
  private readonly entryUrl: string;
  private readonly locale?: string;
  private readonly notify?: (payload: PluginHostBridgeNotifyPayload) => void;
  private readonly openExternal?: (url: string) => void | Promise<void>;
  private readonly openAgentRunUi?: (
    request: PluginHostAgentRunUiRequest,
  ) => PluginHostAgentRunUiOpenResult;
  private readonly updateAgentRunUi?: (
    request: PluginHostAgentRunUiRequest,
  ) => PluginHostAgentRunUiUpdateResult;
  private readonly closeAgentRunUi?: (
    request: Pick<PluginHostAgentRunUiRequest, "taskId" | "bridgeAction">,
  ) => PluginHostAgentRunUiCloseResult;
  private readonly cloud?: CreatePluginHostBridgeOptions["cloud"];
  private readonly capabilities?: PluginHostBridgeCapabilities;
  private readonly dispatchCapability?: (
    request: PluginHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  private readonly listenRuntimeEvent: typeof safeListen;
  private readonly now?: () => string;
  private readonly runtimeOrigin: string;
  private readonly subscriptionRuntime: PluginHostBridgeSubscriptionRuntime;
  private disposed = false;

  constructor(options: CreatePluginHostBridgeOptions) {
    const runtimeOrigin = resolvePluginRuntimeOrigin(options.entryUrl);
    if (!runtimeOrigin) {
      throw new Error("Plugin runtime entryUrl is invalid.");
    }

    this.frame = options.frame;
    this.appId = options.appId;
    this.entryKey = options.entryKey;
    this.displayName = options.displayName;
    this.entryRoute = options.entryRoute;
    this.entryUrl = options.entryUrl;
    this.locale = options.locale;
    this.notify = options.notify;
    this.openExternal = options.openExternal;
    this.openAgentRunUi = options.openAgentRunUi;
    this.updateAgentRunUi = options.updateAgentRunUi;
    this.closeAgentRunUi = options.closeAgentRunUi;
    this.cloud = options.cloud;
    this.capabilities = options.capabilities;
    this.dispatchCapability = options.dispatchCapability;
    this.listenRuntimeEvent = options.listenRuntimeEvent ?? safeListen;
    this.now = options.now;
    this.runtimeOrigin = runtimeOrigin;
    this.subscriptionRuntime = new PluginHostBridgeSubscriptionRuntime({
      appId: this.appId,
      entryKey: this.entryKey,
      dispatchCapability: this.dispatchCapability,
      listenRuntimeEvent: this.listenRuntimeEvent,
      now: this.now,
      isDisposed: () => this.disposed,
      postToApp: (type, payload, requestId) => {
        this.postToApp(type, payload, requestId);
      },
      buildHostErrorPayload: (request, error) =>
        this.buildHostErrorPayload(request, error),
    });
  }

  start(): () => void {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    window.addEventListener("message", this.handleWindowMessage);
    window.addEventListener(LIME_THEME_CHANGED_EVENT, this.handleThemeChanged);
    window.addEventListener(
      LIME_COLOR_SCHEME_CHANGED_EVENT,
      this.handleThemeChanged,
    );
    window.addEventListener(
      OEM_CLOUD_SESSION_CHANGED_EVENT,
      this.handleHostContextChanged,
    );
    window.addEventListener(
      OEM_CLOUD_BOOTSTRAP_CHANGED_EVENT,
      this.handleHostContextChanged,
    );
    window.addEventListener("storage", this.handleThemeChanged);
    document.addEventListener("visibilitychange", this.handleVisibilityChanged);

    return () => this.dispose();
  }

  dispose(): void {
    if (this.disposed || typeof window === "undefined") {
      return;
    }
    this.disposed = true;
    window.removeEventListener("message", this.handleWindowMessage);
    window.removeEventListener(
      LIME_THEME_CHANGED_EVENT,
      this.handleThemeChanged,
    );
    window.removeEventListener(
      LIME_COLOR_SCHEME_CHANGED_EVENT,
      this.handleThemeChanged,
    );
    window.removeEventListener(
      OEM_CLOUD_SESSION_CHANGED_EVENT,
      this.handleHostContextChanged,
    );
    window.removeEventListener(
      OEM_CLOUD_BOOTSTRAP_CHANGED_EVENT,
      this.handleHostContextChanged,
    );
    window.removeEventListener("storage", this.handleThemeChanged);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChanged,
    );
    this.subscriptionRuntime.dispose();
  }

  sendSnapshot(requestId?: string): void {
    this.postToApp(
      "host:snapshot",
      buildPluginHostSnapshot({
        appId: this.appId,
        entryKey: this.entryKey,
        displayName: this.displayName,
        entryRoute: this.entryRoute,
        entryUrl: this.entryUrl,
        locale: this.locale,
        now: this.now,
        runtimeOrigin: this.runtimeOrigin,
        cloud: this.cloud,
        capabilities: this.capabilities,
      }),
      requestId,
    );
  }

  sendThemeUpdate(requestId?: string): void {
    this.postToApp("theme:update", buildPluginThemePayload(), requestId);
  }

  private readonly handleWindowMessage = (event: MessageEvent<unknown>) => {
    const trusted = isTrustedPluginBridgeMessage(event, {
      appWindow: this.frame.contentWindow,
      runtimeOrigin: this.runtimeOrigin,
      appId: this.appId,
      entryKey: this.entryKey,
    });
    if (!trusted) {
      return;
    }

    void this.handleAppMessage(trusted.message);
  };

  private readonly handleHostContextChanged = () => {
    this.sendSnapshot();
  };

  private readonly handleThemeChanged = () => {
    this.sendThemeUpdate();
  };

  private readonly handleVisibilityChanged = () => {
    this.postToApp("host:visibility", {
      visibilityState: readDocumentVisibilityState(),
    });
  };

  private async handleAppMessage(
    message: LimePluginBridgeMessage,
  ): Promise<void> {
    if (message.type === "app:ready" || message.type === "host:getSnapshot") {
      this.sendSnapshot(message.requestId);
      return;
    }

    if (!HOST_ACTION_TYPES.has(message.type)) {
      this.sendError(message, {
        code: "UNKNOWN_MESSAGE",
        message: "Unsupported bridge message.",
      });
      return;
    }

    try {
      const result = await this.dispatchHostAction(message);
      this.sendResponse(message, result);
    } catch (error) {
      const payload = this.buildHostErrorPayload(message, error);
      this.sendError(message, payload);
    }
  }

  private async dispatchHostAction(
    message: LimePluginBridgeMessage,
  ): Promise<Record<string, unknown>> {
    if (message.type === "host:toast") {
      handleHostToast(message.payload, this.notify);
      return { accepted: true };
    }
    if (message.type === "host:navigate") {
      const url = resolveSameOriginActionUrl({
        payload: message.payload,
        keys: ["route", "url"],
        entryUrl: this.entryUrl,
        runtimeOrigin: this.runtimeOrigin,
      });
      window.setTimeout(() => {
        if (!this.disposed) {
          this.frame.src = url.href;
        }
      }, 0);
      return { navigatedTo: url.pathname + url.search + url.hash };
    }
    if (message.type === "host:openExternal") {
      const url = resolveExternalUrl(message.payload);
      await openHostExternalUrl(url, this.openExternal);
      return { opened: true };
    }
    if (message.type === "host:download") {
      const url = resolveSameOriginActionUrl({
        payload: message.payload,
        keys: ["url", "href"],
        entryUrl: this.entryUrl,
        runtimeOrigin: this.runtimeOrigin,
      });
      downloadSameOriginUrl(url, message.payload);
      return { downloaded: true };
    }
    if (message.type === "capability:invoke") {
      return this.handleCapabilityInvoke(message);
    }
    if (message.type === "capability:subscribe") {
      return this.subscriptionRuntime.handleSubscribe(message);
    }
    if (message.type === "capability:unsubscribe") {
      return this.subscriptionRuntime.handleUnsubscribe(message);
    }

    throw new PluginHostBridgeActionError(
      "CAPABILITY_BLOCKED",
      "Capability invocation is not enabled for this Plugin runtime.",
    );
  }

  private async handleCapabilityInvoke(
    message: LimePluginBridgeMessage,
  ): Promise<Record<string, unknown>> {
    if (!isRecord(message.payload)) {
      throw new PluginHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:invoke requires a payload object.",
      );
    }
    const capability = readString(message.payload, "capability");
    const method = readString(message.payload, "method");
    if (!capability || !method) {
      throw new PluginHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:invoke requires payload.capability and payload.method.",
      );
    }
    const rawArgs = hasOwn(message.payload, "args")
      ? message.payload.args
      : undefined;
    const args = Array.isArray(rawArgs) ? rawArgs : undefined;
    const input = hasOwn(message.payload, "input")
      ? message.payload.input
      : Array.isArray(rawArgs)
        ? undefined
        : rawArgs;
    const idempotencyKey = readString(message.payload, "idempotencyKey");
    const expectedSchema = hasOwn(message.payload, "expectedSchema")
      ? message.payload.expectedSchema
      : undefined;
    const provenance = readCapabilityInvokeProvenance(
      message.payload.provenance,
    );
    const invokeRequest = buildLimeCapabilityInvokeRequest({
      capability: capability as LimeCapabilityName,
      method: method as never,
      args: input,
      requestId: message.requestId,
      idempotencyKey,
      expectedSchema,
      provenance,
    }) as LimeCapabilityInvokeRequest;
    const request: PluginHostBridgeCapabilityRequest = {
      appId: this.appId,
      capability,
      method,
      invokeRequest,
      rawPayload: message.payload,
    };
    if (this.entryKey) {
      request.entryKey = this.entryKey;
    }
    if (message.requestId) {
      request.requestId = message.requestId;
    }
    if (args) {
      request.args = args;
    }
    if (input !== undefined) {
      request.input = input;
    }
    if (idempotencyKey) {
      request.idempotencyKey = idempotencyKey;
    }
    if (expectedSchema !== undefined) {
      request.expectedSchema = expectedSchema;
    }
    if (provenance) {
      request.provenance = provenance;
    }
    const uiResult = await handleUiCapabilityInvoke({
      request,
      frame: this.frame,
      isDisposed: () => this.disposed,
      appId: this.appId,
      entryKey: this.entryKey,
      displayName: this.displayName,
      entryRoute: this.entryRoute,
      entryUrl: this.entryUrl,
      locale: this.locale,
      now: this.now,
      runtimeOrigin: this.runtimeOrigin,
      notify: this.notify,
      openExternal: this.openExternal,
      openAgentRunUi: this.openAgentRunUi,
      updateAgentRunUi: this.updateAgentRunUi,
      closeAgentRunUi: this.closeAgentRunUi,
      cloud: this.cloud,
      capabilities: this.capabilities,
    });
    if (uiResult) {
      return {
        ...createLimeCapabilitySuccessResponse(uiResult),
        result: uiResult,
      };
    }
    if (!this.dispatchCapability) {
      throw new PluginHostBridgeActionError(
        "CAPABILITY_BLOCKED",
        "Capability invocation is not enabled for this Plugin runtime.",
      );
    }
    const result = enrichAgentCapabilityResult(
      request,
      await this.dispatchCapability(request),
    );
    return {
      ...createLimeCapabilitySuccessResponse(result),
      result,
    };
  }

  private sendResponse(
    request: LimePluginBridgeMessage,
    payload: Record<string, unknown>,
  ): void {
    this.postToApp("host:response", payload, request.requestId);
  }

  private buildHostErrorPayload(
    request: LimePluginBridgeMessage,
    error: unknown,
  ): Record<string, unknown> {
    if (request.type === "capability:invoke") {
      const payload = isRecord(request.payload) ? request.payload : {};
      const stableError = toLimeCapabilityError(error, {
        appId: request.appId,
        entryKey: request.entryKey,
        capability: readString(payload, "capability"),
        method: readString(payload, "method"),
        requestId: request.requestId,
      });
      return {
        ok: false,
        error: stableError,
        code: stableError.code,
        message: stableError.message,
        causeCode: stableError.causeCode,
      };
    }

    if (error instanceof PluginHostBridgeActionError) {
      return {
        code: error.code,
        message: error.message,
      };
    }
    return {
      code: readErrorCode(error) ?? "HOST_ACTION_FAILED",
      message: error instanceof Error ? error.message : "Host action failed.",
    };
  }

  private sendError(
    request: LimePluginBridgeMessage,
    payload: Record<string, unknown>,
  ): void {
    this.postToApp("host:error", payload, request.requestId);
  }

  private postToApp(type: string, payload?: unknown, requestId?: string): void {
    const target = this.frame.contentWindow;
    if (!target) {
      return;
    }
    const message: LimePluginBridgeMessage = {
      protocol: PLUGIN_BRIDGE_PROTOCOL,
      version: PLUGIN_BRIDGE_VERSION,
      type,
      requestId,
      appId: this.appId,
      entryKey: this.entryKey,
      payload,
    };
    target.postMessage(message, this.runtimeOrigin);
  }
}

export function createPluginHostBridge(
  options: CreatePluginHostBridgeOptions,
): PluginHostBridge {
  return new PluginHostBridge(options);
}
