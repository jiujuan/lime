import {
  LIME_COLOR_SCHEME_CHANGED_EVENT,
  loadLimeColorSchemeId,
  type LimeColorSchemeId,
} from "@/lib/appearance/colorSchemes";
import {
  getEffectiveLimeThemeMode,
  LIME_THEME_CHANGED_EVENT,
  loadLimeThemeMode,
  type LimeEffectiveThemeMode,
  type LimeThemeMode,
} from "@/lib/appearance/themeMode";

export const AGENT_APP_BRIDGE_PROTOCOL = "lime.agentApp.bridge";
export const AGENT_APP_BRIDGE_VERSION = 1;

export interface LimeAgentAppBridgeMessage {
  protocol: typeof AGENT_APP_BRIDGE_PROTOCOL;
  version: typeof AGENT_APP_BRIDGE_VERSION;
  type: string;
  requestId?: string;
  appId: string;
  entryKey?: string;
  payload?: unknown;
}

export interface AgentAppThemePayload {
  themeMode: LimeThemeMode;
  effectiveThemeMode: LimeEffectiveThemeMode;
  colorSchemeId: LimeColorSchemeId;
  tokens: Record<string, string>;
}

export interface AgentAppHostSnapshotPayload {
  app: {
    appId: string;
    entryKey?: string;
    displayName: string;
    route?: string;
    runtimeOrigin: string;
  };
  host: {
    name: "Lime";
    bridgeProtocol: typeof AGENT_APP_BRIDGE_PROTOCOL;
    bridgeVersion: typeof AGENT_APP_BRIDGE_VERSION;
    locale: string;
    visibilityState: AgentAppVisibilityState;
    sentAt: string;
  };
  theme: AgentAppThemePayload;
  capabilities: {
    available: string[];
    blocked: string[];
  };
}

export interface AgentAppHostBridgeCapabilities {
  available: string[];
  blocked: string[];
}

export type AgentAppVisibilityState = "hidden" | "visible" | "prerender";

export interface AgentAppHostBridgeNotifyPayload {
  message: string;
  level: "info" | "success" | "warning" | "error";
}

export interface AgentAppHostBridgeCapabilityRequest {
  appId: string;
  entryKey?: string;
  requestId?: string;
  capability: string;
  method: string;
  args?: unknown[];
  input?: unknown;
  rawPayload: Record<string, unknown>;
}

export interface CreateAgentAppHostBridgeOptions {
  frame: HTMLIFrameElement;
  appId: string;
  entryKey?: string;
  displayName: string;
  entryRoute?: string;
  entryUrl: string;
  locale?: string;
  notify?: (payload: AgentAppHostBridgeNotifyPayload) => void;
  openExternal?: (url: string) => void;
  capabilities?: AgentAppHostBridgeCapabilities;
  dispatchCapability?: (
    request: AgentAppHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  now?: () => string;
}

interface TrustedAgentAppBridgeMessage {
  message: LimeAgentAppBridgeMessage;
  source: Window;
  origin: string;
}

const HOST_ACTION_TYPES = new Set([
  "host:navigate",
  "host:toast",
  "host:openExternal",
  "host:download",
  "capability:invoke",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function readErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" && error.code.trim()
    ? error.code.trim()
    : undefined;
}

function collectCssVariableTokens(root: HTMLElement): Record<string, string> {
  const tokens: Record<string, string> = {};
  const appendToken = (name: string, value: string) => {
    if (!name.startsWith("--lime-") && !name.startsWith("--app-")) {
      return;
    }
    const normalized = value.trim();
    if (normalized) {
      tokens[name] = normalized;
    }
  };

  for (let index = 0; index < root.style.length; index += 1) {
    const name = root.style.item(index);
    appendToken(name, root.style.getPropertyValue(name));
  }

  if (typeof window !== "undefined" && window.getComputedStyle) {
    const computed = window.getComputedStyle(root);
    for (let index = 0; index < computed.length; index += 1) {
      const name = computed.item(index);
      appendToken(name, computed.getPropertyValue(name));
    }
  }

  return tokens;
}

function normalizeCapabilities(
  capabilities?: AgentAppHostBridgeCapabilities,
): AgentAppHostBridgeCapabilities {
  if (!capabilities) {
    return {
      available: ["lime.ui"],
      blocked: ["lime.storage", "lime.agent", "lime.knowledge", "lime.workflow"],
    };
  }
  return {
    available: Array.from(new Set(["lime.ui", ...capabilities.available])).sort(),
    blocked: Array.from(
      new Set(capabilities.blocked.filter((item) => item !== "lime.ui")),
    ).sort(),
  };
}

function readDocumentVisibilityState(): AgentAppVisibilityState {
  if (typeof document === "undefined") {
    return "visible";
  }
  const visibilityState = String(document.visibilityState);
  return visibilityState === "hidden"
    ? "hidden"
    : visibilityState === "prerender"
      ? "prerender"
      : "visible";
}

export function buildAgentAppThemePayload(
  root: HTMLElement =
    typeof document === "undefined" ? (undefined as never) : document.documentElement,
): AgentAppThemePayload {
  const themeMode = loadLimeThemeMode();
  const effectiveThemeMode = getEffectiveLimeThemeMode(themeMode);
  return {
    themeMode,
    effectiveThemeMode,
    colorSchemeId: loadLimeColorSchemeId(),
    tokens: root ? collectCssVariableTokens(root) : {},
  };
}

export function buildAgentAppHostSnapshot(
  options: Omit<CreateAgentAppHostBridgeOptions, "frame" | "notify" | "openExternal"> & {
    runtimeOrigin: string;
  },
): AgentAppHostSnapshotPayload {
  return {
    app: {
      appId: options.appId,
      entryKey: options.entryKey,
      displayName: options.displayName,
      route: options.entryRoute,
      runtimeOrigin: options.runtimeOrigin,
    },
    host: {
      name: "Lime",
      bridgeProtocol: AGENT_APP_BRIDGE_PROTOCOL,
      bridgeVersion: AGENT_APP_BRIDGE_VERSION,
      locale:
        options.locale ??
        (typeof document !== "undefined" && document.documentElement.lang
          ? document.documentElement.lang
          : typeof navigator !== "undefined"
            ? navigator.language
            : "zh-CN"),
      visibilityState: readDocumentVisibilityState(),
      sentAt: (options.now ?? (() => new Date().toISOString()))(),
    },
    theme: buildAgentAppThemePayload(),
    capabilities: normalizeCapabilities(options.capabilities),
  };
}

export function resolveAgentAppRuntimeOrigin(entryUrl: string): string | null {
  try {
    return new URL(entryUrl).origin;
  } catch {
    return null;
  }
}

export function isLimeAgentAppBridgeMessage(
  value: unknown,
): value is LimeAgentAppBridgeMessage {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.protocol === AGENT_APP_BRIDGE_PROTOCOL &&
    value.version === AGENT_APP_BRIDGE_VERSION &&
    typeof value.type === "string" &&
    typeof value.appId === "string" &&
    (value.requestId === undefined || typeof value.requestId === "string") &&
    (value.entryKey === undefined || typeof value.entryKey === "string")
  );
}

export function isTrustedAgentAppBridgeMessage(
  event: MessageEvent<unknown>,
  options: {
    appWindow: Window | null;
    runtimeOrigin: string;
    appId: string;
    entryKey?: string;
  },
): TrustedAgentAppBridgeMessage | null {
  if (!options.appWindow || event.source !== options.appWindow) {
    return null;
  }
  if (event.origin !== options.runtimeOrigin) {
    return null;
  }
  if (!isLimeAgentAppBridgeMessage(event.data)) {
    return null;
  }
  if (event.data.appId !== options.appId) {
    return null;
  }
  if (options.entryKey && event.data.entryKey !== options.entryKey) {
    return null;
  }
  return {
    message: event.data,
    source: options.appWindow,
    origin: event.origin,
  };
}

export class AgentAppHostBridge {
  private readonly frame: HTMLIFrameElement;
  private readonly appId: string;
  private readonly entryKey?: string;
  private readonly displayName: string;
  private readonly entryRoute?: string;
  private readonly entryUrl: string;
  private readonly locale?: string;
  private readonly notify?: (payload: AgentAppHostBridgeNotifyPayload) => void;
  private readonly openExternal?: (url: string) => void;
  private readonly capabilities?: AgentAppHostBridgeCapabilities;
  private readonly dispatchCapability?: (
    request: AgentAppHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  private readonly now?: () => string;
  private readonly runtimeOrigin: string;
  private disposed = false;

  constructor(options: CreateAgentAppHostBridgeOptions) {
    const runtimeOrigin = resolveAgentAppRuntimeOrigin(options.entryUrl);
    if (!runtimeOrigin) {
      throw new Error("Agent App runtime entryUrl is invalid.");
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
    this.capabilities = options.capabilities;
    this.dispatchCapability = options.dispatchCapability;
    this.now = options.now;
    this.runtimeOrigin = runtimeOrigin;
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
    window.removeEventListener(LIME_THEME_CHANGED_EVENT, this.handleThemeChanged);
    window.removeEventListener(
      LIME_COLOR_SCHEME_CHANGED_EVENT,
      this.handleThemeChanged,
    );
    window.removeEventListener("storage", this.handleThemeChanged);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChanged,
    );
  }

  sendSnapshot(requestId?: string): void {
    this.postToApp(
      "host:snapshot",
      buildAgentAppHostSnapshot({
        appId: this.appId,
        entryKey: this.entryKey,
        displayName: this.displayName,
        entryRoute: this.entryRoute,
        entryUrl: this.entryUrl,
        locale: this.locale,
        now: this.now,
        runtimeOrigin: this.runtimeOrigin,
        capabilities: this.capabilities,
      }),
      requestId,
    );
  }

  sendThemeUpdate(requestId?: string): void {
    this.postToApp("theme:update", buildAgentAppThemePayload(), requestId);
  }

  private readonly handleWindowMessage = (event: MessageEvent<unknown>) => {
    const trusted = isTrustedAgentAppBridgeMessage(event, {
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

  private readonly handleThemeChanged = () => {
    this.sendThemeUpdate();
  };

  private readonly handleVisibilityChanged = () => {
    this.postToApp("host:visibility", {
      visibilityState: readDocumentVisibilityState(),
    });
  };

  private async handleAppMessage(message: LimeAgentAppBridgeMessage): Promise<void> {
    if (message.type === "app:ready" || message.type === "host:getSnapshot") {
      this.sendSnapshot(message.requestId);
      return;
    }

    if (!HOST_ACTION_TYPES.has(message.type)) {
      this.sendError(message, "UNKNOWN_MESSAGE", "Unsupported bridge message.");
      return;
    }

    try {
      const result = await this.dispatchHostAction(message);
      this.sendResponse(message, result);
    } catch (error) {
      const payload =
        error instanceof AgentAppHostBridgeActionError
          ? { code: error.code, message: error.message }
          : {
              code: readErrorCode(error) ?? "HOST_ACTION_FAILED",
              message:
                error instanceof Error ? error.message : "Host action failed.",
            };
      this.sendError(message, payload.code, payload.message);
    }
  }

  private async dispatchHostAction(
    message: LimeAgentAppBridgeMessage,
  ): Promise<Record<string, unknown>> {
    if (message.type === "host:toast") {
      this.handleToast(message.payload);
      return { accepted: true };
    }
    if (message.type === "host:navigate") {
      const url = this.resolveSameOriginActionUrl(message.payload, ["route", "url"]);
      window.setTimeout(() => {
        if (!this.disposed) {
          this.frame.src = url.href;
        }
      }, 0);
      return { navigatedTo: url.pathname + url.search + url.hash };
    }
    if (message.type === "host:openExternal") {
      const url = this.resolveExternalUrl(message.payload);
      (this.openExternal ?? ((target) => window.open(target, "_blank", "noopener,noreferrer")))(
        url.href,
      );
      return { opened: true };
    }
    if (message.type === "host:download") {
      const url = this.resolveSameOriginActionUrl(message.payload, ["url", "href"]);
      this.downloadSameOriginUrl(url, message.payload);
      return { downloaded: true };
    }
    if (message.type === "capability:invoke") {
      return this.handleCapabilityInvoke(message);
    }

    throw new AgentAppHostBridgeActionError(
      "CAPABILITY_BLOCKED",
      "Capability invocation is not enabled for this Agent App runtime.",
    );
  }

  private async handleCapabilityInvoke(
    message: LimeAgentAppBridgeMessage,
  ): Promise<Record<string, unknown>> {
    if (!this.dispatchCapability) {
      throw new AgentAppHostBridgeActionError(
        "CAPABILITY_BLOCKED",
        "Capability invocation is not enabled for this Agent App runtime.",
      );
    }
    if (!isRecord(message.payload)) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:invoke requires a payload object.",
      );
    }
    const capability = readString(message.payload, "capability");
    const method = readString(message.payload, "method");
    if (!capability || !method) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:invoke requires payload.capability and payload.method.",
      );
    }
    const args = Array.isArray(message.payload.args)
      ? message.payload.args
      : undefined;
    const request: AgentAppHostBridgeCapabilityRequest = {
      appId: this.appId,
      capability,
      method,
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
    if (Object.prototype.hasOwnProperty.call(message.payload, "input")) {
      request.input = message.payload.input;
    }
    const result = await this.dispatchCapability(request);
    return { result };
  }

  private handleToast(payload: unknown): void {
    if (!isRecord(payload)) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "host:toast requires a payload object.",
      );
    }
    const message = readString(payload, "message");
    if (!message) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "host:toast requires payload.message.",
      );
    }
    const rawLevel = readString(payload, "level") ?? "info";
    const level =
      rawLevel === "success" ||
      rawLevel === "warning" ||
      rawLevel === "error" ||
      rawLevel === "info"
        ? rawLevel
        : "info";
    this.notify?.({ message, level });
  }

  private resolveSameOriginActionUrl(
    payload: unknown,
    keys: string[],
  ): URL {
    if (!isRecord(payload)) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "URL action requires a payload object.",
      );
    }
    const target = keys.map((key) => readString(payload, key)).find(Boolean);
    if (!target) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "URL action requires a route or url.",
      );
    }
    const url = new URL(target, this.entryUrl);
    if (url.origin !== this.runtimeOrigin) {
      throw new AgentAppHostBridgeActionError(
        "UNTRUSTED_URL",
        "URL must stay inside the Agent App runtime origin.",
      );
    }
    return url;
  }

  private resolveExternalUrl(payload: unknown): URL {
    if (!isRecord(payload)) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "host:openExternal requires a payload object.",
      );
    }
    const target = readString(payload, "url");
    if (!target) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "host:openExternal requires payload.url.",
      );
    }
    const url = new URL(target);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new AgentAppHostBridgeActionError(
        "UNTRUSTED_URL",
        "Only http and https URLs can be opened externally.",
      );
    }
    return url;
  }

  private downloadSameOriginUrl(url: URL, payload: unknown): void {
    const link = document.createElement("a");
    link.href = url.href;
    link.download = isRecord(payload) ? readString(payload, "fileName") ?? "" : "";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  private sendResponse(
    request: LimeAgentAppBridgeMessage,
    payload: Record<string, unknown>,
  ): void {
    this.postToApp("host:response", payload, request.requestId);
  }

  private sendError(
    request: LimeAgentAppBridgeMessage,
    code: string,
    message: string,
  ): void {
    this.postToApp(
      "host:error",
      {
        code,
        message,
      },
      request.requestId,
    );
  }

  private postToApp(type: string, payload?: unknown, requestId?: string): void {
    const target = this.frame.contentWindow;
    if (!target) {
      return;
    }
    const message: LimeAgentAppBridgeMessage = {
      protocol: AGENT_APP_BRIDGE_PROTOCOL,
      version: AGENT_APP_BRIDGE_VERSION,
      type,
      requestId,
      appId: this.appId,
      entryKey: this.entryKey,
      payload,
    };
    target.postMessage(message, this.runtimeOrigin);
  }
}

class AgentAppHostBridgeActionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentAppHostBridgeActionError";
    this.code = code;
  }
}

export function createAgentAppHostBridge(
  options: CreateAgentAppHostBridgeOptions,
): AgentAppHostBridge {
  return new AgentAppHostBridge(options);
}
