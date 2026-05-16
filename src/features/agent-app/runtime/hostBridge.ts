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
import { safeListen } from "@/lib/dev-bridge";
import {
  buildLimeCapabilityInvokeRequest,
  createLimeCapabilitySuccessResponse,
  type LimeCapabilityInvokeProvenance,
  type LimeCapabilityInvokeRequest,
  type LimeCapabilityName,
} from "../sdk/capabilityContract";
import { toLimeCapabilityError } from "../sdk/capabilityErrors";
import type { AgentAppRuntimeProcessView } from "../types";
import { buildAgentRuntimeProcessView } from "./agentRuntimeProcess";

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

export type AgentAppHostAgentRunUiMode = "drawer" | "modal" | "page";

export interface AgentAppHostAgentRunUiRequest {
  taskId?: string;
  bridgeAction?: string;
  title?: string;
  mode?: AgentAppHostAgentRunUiMode;
  expectedOutput?: unknown;
  runtimeProcess?: unknown;
  runtimeFacts?: unknown;
  task?: unknown;
  snapshot?: unknown;
  events?: unknown[];
}

export interface AgentAppHostAgentRunUiOpenResult {
  opened: true;
  surface: "host_agent_run";
  mode: AgentAppHostAgentRunUiMode;
  taskId?: string;
}

export interface AgentAppHostAgentRunUiUpdateResult {
  updated: true;
  surface: "host_agent_run";
  taskId?: string;
}

export interface AgentAppHostAgentRunUiCloseResult {
  closed: true;
  surface: "host_agent_run";
  taskId?: string;
}

export interface AgentAppHostBridgeCapabilityRequest {
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
  openAgentRunUi?: (
    request: AgentAppHostAgentRunUiRequest,
  ) => AgentAppHostAgentRunUiOpenResult;
  updateAgentRunUi?: (
    request: AgentAppHostAgentRunUiRequest,
  ) => AgentAppHostAgentRunUiUpdateResult;
  closeAgentRunUi?: (
    request: Pick<AgentAppHostAgentRunUiRequest, "taskId" | "bridgeAction">,
  ) => AgentAppHostAgentRunUiCloseResult;
  capabilities?: AgentAppHostBridgeCapabilities;
  dispatchCapability?: (
    request: AgentAppHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  listenRuntimeEvent?: typeof safeListen;
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
  "capability:subscribe",
  "capability:unsubscribe",
]);

const DEFAULT_TASK_SUBSCRIPTION_POLL_INTERVAL_MS = 1000;
const MIN_TASK_SUBSCRIPTION_POLL_INTERVAL_MS = 250;
const MAX_TASK_SUBSCRIPTION_POLL_INTERVAL_MS = 10_000;
const DEFAULT_TERMINAL_ARTIFACT_REPLAY_POLLS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function readPositiveInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(number), min), max);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" && error.code.trim()
    ? error.code.trim()
    : undefined;
}

function readCapabilityInvokeProvenance(
  value: unknown,
): LimeCapabilityInvokeProvenance | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    typeof value.appId !== "string" ||
    typeof value.packageHash !== "string" ||
    typeof value.manifestHash !== "string"
  ) {
    return undefined;
  }
  return {
    appId: value.appId,
    packageHash: value.packageHash,
    manifestHash: value.manifestHash,
    entryKey: typeof value.entryKey === "string" ? value.entryKey : undefined,
    workflowRunId:
      typeof value.workflowRunId === "string" ? value.workflowRunId : undefined,
    workspaceId:
      typeof value.workspaceId === "string" ? value.workspaceId : undefined,
    taskId: typeof value.taskId === "string" ? value.taskId : undefined,
  };
}

function readTaskIdFromPayload(payload: Record<string, unknown>): string | undefined {
  const directTaskId = readString(payload, "taskId");
  if (directTaskId) {
    return directTaskId;
  }
  if (isRecord(payload.input)) {
    const inputTaskId = readString(payload.input, "taskId");
    if (inputTaskId) {
      return inputTaskId;
    }
  }
  return Array.isArray(payload.args) && typeof payload.args[0] === "string"
    ? payload.args[0].trim()
    : undefined;
}

function readRuntimeEventNameFromPayload(
  appId: string,
  taskId: string,
  payload: Record<string, unknown>,
): string {
  const explicit =
    readString(payload, "eventName") ??
    (isRecord(payload.input) ? readString(payload.input, "eventName") : undefined);
  return explicit ?? `agent_app_runtime:${appId}:${taskId}`;
}

function buildTaskEventsFromRuntimeEventPayload(payload: unknown): unknown[] {
  if (!isRecord(payload)) {
    return [];
  }
  return [
    {
      eventType:
        readString(payload, "eventType") ??
        readString(payload, "type") ??
        "task:runtimeEvent",
      status: readString(payload, "status"),
      message:
        readString(payload, "message") ??
        readString(payload, "status") ??
        readString(payload, "type") ??
        "AgentRuntime event",
      payload,
    },
  ];
}

function readTaskEventsFromValue(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const artifactEvents = buildArtifactReplayEventsFromValue(value);
  if (Array.isArray(value.events)) {
    return [...value.events, ...artifactEvents];
  }
  if (Array.isArray(value.taskEvents)) {
    return [...value.taskEvents, ...artifactEvents];
  }
  return artifactEvents;
}

function taskEventIdentity(event: unknown, index: number): string {
  if (!isRecord(event)) {
    return `event:${index}`;
  }
  const stableParts = [
    readString(event, "eventId"),
    readString(event, "id"),
    readString(event, "type") ?? readString(event, "eventType"),
    readString(event, "requestId"),
    readString(event, "message"),
    readString(event, "occurredAt") ?? readString(event, "at"),
  ].filter(Boolean);
  return stableParts.length ? stableParts.join(":") : `event:${index}`;
}

function mergeTaskEvents(...groups: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  groups.flat().forEach((event, index) => {
    if (!event) {
      return;
    }
    const key = taskEventIdentity(event, index);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(event);
  });
  return merged;
}

function readArtifactsFromValue(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) {
    return [];
  }
  const direct = Array.isArray(value.artifacts) ? value.artifacts : [];
  const fromResult = isRecord(value.result) ? readArtifactsFromValue(value.result) : [];
  const fromThreadRead = isRecord(value.threadRead)
    ? readArtifactsFromValue(value.threadRead)
    : [];
  return [...direct, ...fromResult, ...fromThreadRead].filter(isRecord);
}

function buildArtifactReplayEventsFromValue(value: unknown): unknown[] {
  const artifacts = readArtifactsFromValue(value);
  if (!artifacts.length) {
    return [];
  }
  return artifacts.map((artifact, index) => {
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
    const artifactRef =
      readString(artifact, "path") ??
      readString(artifact, "item_id") ??
      readString(artifact, "id") ??
      `artifact:${index + 1}`;
    const artifactDocument =
      isRecord(metadata.artifactDocument) || isRecord(metadata.artifact_document)
        ? (metadata.artifactDocument ?? metadata.artifact_document)
        : undefined;
    const workspacePatch =
      isRecord(metadata.workspacePatch) || isRecord(metadata.contentFactoryWorkspacePatch)
        ? (metadata.workspacePatch ?? metadata.contentFactoryWorkspacePatch)
        : undefined;
    return {
      eventType: "artifact:created",
      status: readString(artifact, "status") ?? "created",
      message:
        readString(artifact, "title") ??
        readString(artifact, "artifact_type") ??
        "Artifact 已创建",
      artifactRef,
      payload: {
        artifact,
        artifactDocument,
        workspacePatch,
        contentFactoryWorkspacePatch: workspacePatch,
      },
    };
  });
}

function isTerminalTaskValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const status = String(value.taskStatus ?? value.status ?? "").toLowerCase();
  return [
    "succeeded",
    "success",
    "completed",
    "complete",
    "failed",
    "failure",
    "error",
    "cancelled",
    "canceled",
  ].includes(status);
}

function isSuccessfulTerminalTaskValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const status = String(value.taskStatus ?? value.status ?? "").toLowerCase();
  return ["succeeded", "success", "completed", "complete"].includes(status);
}

function hasWorkspacePatchPayload(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (isRecord(value.workspacePatch) || isRecord(value.contentFactoryWorkspacePatch)) {
    return true;
  }
  if (isRecord(value.payload) && hasWorkspacePatchPayload(value.payload)) {
    return true;
  }
  if (isRecord(value.result) && hasWorkspacePatchPayload(value.result)) {
    return true;
  }
  if (isRecord(value.threadRead) && hasWorkspacePatchPayload(value.threadRead)) {
    return true;
  }
  if (Array.isArray(value.events) && value.events.some(hasWorkspacePatchPayload)) {
    return true;
  }
  if (Array.isArray(value.taskEvents) && value.taskEvents.some(hasWorkspacePatchPayload)) {
    return true;
  }
  if (Array.isArray(value.artifacts) && value.artifacts.length > 0) {
    return true;
  }
  return false;
}

interface AgentAppTaskSubscription {
  subscriptionId: string;
  taskId: string;
  pollIntervalMs: number;
  bridgeAction?: string;
  runtimeEventName?: string;
  runtimeEventUnlisten?: () => void;
  timerId?: number;
  inFlight: boolean;
  terminalArtifactReplayPolls: number;
  events: unknown[];
  latestTask?: unknown;
  process?: AgentAppRuntimeProcessView;
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
  private readonly openAgentRunUi?: (
    request: AgentAppHostAgentRunUiRequest,
  ) => AgentAppHostAgentRunUiOpenResult;
  private readonly updateAgentRunUi?: (
    request: AgentAppHostAgentRunUiRequest,
  ) => AgentAppHostAgentRunUiUpdateResult;
  private readonly closeAgentRunUi?: (
    request: Pick<AgentAppHostAgentRunUiRequest, "taskId" | "bridgeAction">,
  ) => AgentAppHostAgentRunUiCloseResult;
  private readonly capabilities?: AgentAppHostBridgeCapabilities;
  private readonly dispatchCapability?: (
    request: AgentAppHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  private readonly listenRuntimeEvent: typeof safeListen;
  private readonly now?: () => string;
  private readonly runtimeOrigin: string;
  private readonly taskSubscriptions = new Map<string, AgentAppTaskSubscription>();
  private taskSubscriptionSequence = 0;
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
    this.openAgentRunUi = options.openAgentRunUi;
    this.updateAgentRunUi = options.updateAgentRunUi;
    this.closeAgentRunUi = options.closeAgentRunUi;
    this.capabilities = options.capabilities;
    this.dispatchCapability = options.dispatchCapability;
    this.listenRuntimeEvent = options.listenRuntimeEvent ?? safeListen;
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
    for (const subscriptionId of Array.from(this.taskSubscriptions.keys())) {
      this.stopTaskSubscription(subscriptionId);
    }
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
    if (message.type === "capability:subscribe") {
      return this.handleCapabilitySubscribe(message);
    }
    if (message.type === "capability:unsubscribe") {
      return this.handleCapabilityUnsubscribe(message);
    }

    throw new AgentAppHostBridgeActionError(
      "CAPABILITY_BLOCKED",
      "Capability invocation is not enabled for this Agent App runtime.",
    );
  }

  private async handleCapabilityInvoke(
    message: LimeAgentAppBridgeMessage,
  ): Promise<Record<string, unknown>> {
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
    const request: AgentAppHostBridgeCapabilityRequest = {
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
    const uiResult = this.handleUiCapabilityInvoke(request);
    if (uiResult) {
      return {
        ...createLimeCapabilitySuccessResponse(uiResult),
        result: uiResult,
      };
    }
    if (!this.dispatchCapability) {
      throw new AgentAppHostBridgeActionError(
        "CAPABILITY_BLOCKED",
        "Capability invocation is not enabled for this Agent App runtime.",
      );
    }
    const result = this.enrichAgentCapabilityResult(
      request,
      await this.dispatchCapability(request),
    );
    return {
      ...createLimeCapabilitySuccessResponse(result),
      result,
    };
  }

  private handleUiCapabilityInvoke(
    request: AgentAppHostBridgeCapabilityRequest,
  ): unknown | null {
    if (request.capability !== "lime.ui") {
      return null;
    }
    if (request.method === "toast") {
      this.handleToast(request.input);
      return { accepted: true };
    }
    if (request.method === "navigate") {
      const url = this.resolveSameOriginActionUrl(request.input, ["route", "url"]);
      window.setTimeout(() => {
        if (!this.disposed) {
          this.frame.src = url.href;
        }
      }, 0);
      return { navigatedTo: url.pathname + url.search + url.hash };
    }
    if (request.method === "openExternal") {
      const url = this.resolveExternalUrl(request.input);
      (this.openExternal ?? ((target) => window.open(target, "_blank", "noopener,noreferrer")))(
        url.href,
      );
      return { opened: true };
    }
    if (request.method === "download") {
      const url = this.resolveSameOriginActionUrl(request.input, ["url", "href"]);
      this.downloadSameOriginUrl(url, request.input);
      return { downloaded: true };
    }
    if (request.method === "getSnapshot") {
      return buildAgentAppHostSnapshot({
        appId: this.appId,
        entryKey: this.entryKey,
        displayName: this.displayName,
        entryRoute: this.entryRoute,
        entryUrl: this.entryUrl,
        locale: this.locale,
        now: this.now,
        runtimeOrigin: this.runtimeOrigin,
        capabilities: this.capabilities,
      }) as unknown as Record<string, unknown>;
    }
    if (request.method === "openAgentRun") {
      return this.openAgentRunUi?.(this.normalizeAgentRunUiRequest(request.input)) ?? {
        opened: true,
        surface: "host_agent_run",
        mode: "drawer",
        taskId: this.readAgentRunUiTaskId(request.input),
      };
    }
    if (request.method === "updateAgentRun") {
      return this.updateAgentRunUi?.(this.normalizeAgentRunUiRequest(request.input)) ?? {
        updated: true,
        surface: "host_agent_run",
        taskId: this.readAgentRunUiTaskId(request.input),
      };
    }
    if (request.method === "closeAgentRun") {
      const normalized = this.normalizeAgentRunUiRequest(request.input);
      return this.closeAgentRunUi?.({
        taskId: normalized.taskId,
        bridgeAction: normalized.bridgeAction,
      }) ?? {
        closed: true,
        surface: "host_agent_run",
        taskId: normalized.taskId,
      };
    }
    throw new AgentAppHostBridgeActionError(
      "UNSUPPORTED_CAPABILITY_METHOD",
      `${request.capability}.${request.method} is not supported by Agent App Host Bridge.`,
    );
  }

  private normalizeAgentRunUiRequest(input: unknown): AgentAppHostAgentRunUiRequest {
    if (!isRecord(input)) {
      return {};
    }
    const mode = readString(input, "mode");
    return {
      taskId: this.readAgentRunUiTaskId(input),
      bridgeAction: readString(input, "bridgeAction"),
      title: readString(input, "title"),
      mode: mode === "modal" || mode === "page" ? mode : "drawer",
      expectedOutput: hasOwn(input, "expectedOutput") ? input.expectedOutput : undefined,
      runtimeProcess: hasOwn(input, "runtimeProcess")
        ? input.runtimeProcess
        : hasOwn(input, "process")
          ? input.process
          : undefined,
      runtimeFacts: hasOwn(input, "runtimeFacts") ? input.runtimeFacts : undefined,
      task: hasOwn(input, "task") ? input.task : undefined,
      snapshot: hasOwn(input, "snapshot") ? input.snapshot : undefined,
      events: Array.isArray(input.events) ? input.events : undefined,
    };
  }

  private readAgentRunUiTaskId(input: unknown): string | undefined {
    if (!isRecord(input)) {
      return undefined;
    }
    return (
      readString(input, "taskId") ??
      (isRecord(input.task) ? readString(input.task, "taskId") : undefined) ??
      (isRecord(input.snapshot) ? readString(input.snapshot, "taskId") : undefined)
    );
  }

  private enrichAgentCapabilityResult(
    request: AgentAppHostBridgeCapabilityRequest,
    result: unknown,
  ): unknown {
    if (request.capability !== "lime.agent" || !isRecord(result)) {
      return result;
    }
    if (
      isRecord(result.process) &&
      isRecord(result.runtimeProcess)
    ) {
      return result;
    }
    if (
      request.method !== "startTask" &&
      request.method !== "getTask" &&
      request.method !== "cancelTask" &&
      request.method !== "retryTask"
    ) {
      return result;
    }
    const process = buildAgentRuntimeProcessView({
      events: readTaskEventsFromValue(result),
      task: result,
      snapshot: result,
      expectedOutput:
        isRecord(request.input) && hasOwn(request.input, "expectedOutput")
          ? request.input.expectedOutput
          : undefined,
      lastInput: request.input,
    });
    return {
      ...result,
      runtimeProcess: isRecord(result.runtimeProcess) ? result.runtimeProcess : process,
      process: isRecord(result.process) ? result.process : process,
    };
  }

  private async handleCapabilitySubscribe(
    message: LimeAgentAppBridgeMessage,
  ): Promise<Record<string, unknown>> {
    if (!this.dispatchCapability) {
      throw new AgentAppHostBridgeActionError(
        "CAPABILITY_BLOCKED",
        "Capability subscription is not enabled for this Agent App runtime.",
      );
    }
    if (!isRecord(message.payload)) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:subscribe requires a payload object.",
      );
    }
    const capability = readString(message.payload, "capability");
    const topic =
      readString(message.payload, "topic") ?? readString(message.payload, "method");
    const taskId = readTaskIdFromPayload(message.payload);
    if (capability !== "lime.agent" || !topic || !topic.startsWith("task") || !taskId) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:subscribe currently requires lime.agent task payload.taskId.",
      );
    }
    const subscriptionId =
      readString(message.payload, "subscriptionId") ??
      `agent-app-subscription-${++this.taskSubscriptionSequence}`;
    const pollIntervalMs = readPositiveInteger(
      message.payload.pollIntervalMs,
      DEFAULT_TASK_SUBSCRIPTION_POLL_INTERVAL_MS,
      MIN_TASK_SUBSCRIPTION_POLL_INTERVAL_MS,
      MAX_TASK_SUBSCRIPTION_POLL_INTERVAL_MS,
    );
    const bridgeAction =
      readString(message.payload, "bridgeAction") ??
      (isRecord(message.payload.input)
        ? readString(message.payload.input, "bridgeAction")
        : undefined);
    const runtimeEventName = readRuntimeEventNameFromPayload(
      this.appId,
      taskId,
      message.payload,
    );

    this.stopTaskSubscription(subscriptionId);
    this.taskSubscriptions.set(subscriptionId, {
      subscriptionId,
      taskId,
      pollIntervalMs,
      bridgeAction,
      runtimeEventName,
      inFlight: false,
      terminalArtifactReplayPolls: 0,
      events: [],
    });
    void this.attachRuntimeEventSubscription(subscriptionId);
    void this.pollTaskSubscription(subscriptionId);

    return {
      subscriptionId,
      capability,
      topic: "task",
      taskId,
      pollIntervalMs,
      bridgeAction,
      runtimeEventName,
    };
  }

  private handleCapabilityUnsubscribe(
    message: LimeAgentAppBridgeMessage,
  ): Record<string, unknown> {
    if (!isRecord(message.payload)) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:unsubscribe requires a payload object.",
      );
    }
    const subscriptionId =
      readString(message.payload, "subscriptionId") ??
      (isRecord(message.payload.input)
        ? readString(message.payload.input, "subscriptionId")
        : undefined);
    if (!subscriptionId) {
      throw new AgentAppHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:unsubscribe requires payload.subscriptionId.",
      );
    }
    const unsubscribed = this.stopTaskSubscription(subscriptionId);
    return {
      subscriptionId,
      unsubscribed,
    };
  }

  private async attachRuntimeEventSubscription(
    subscriptionId: string,
  ): Promise<void> {
    const subscription = this.taskSubscriptions.get(subscriptionId);
    if (!subscription?.runtimeEventName || this.disposed) {
      return;
    }
    try {
      const unlisten = await this.listenRuntimeEvent<unknown>(
        subscription.runtimeEventName,
        (event) => this.handleRuntimeTaskEvent(subscriptionId, event.payload),
      );
      const latest = this.taskSubscriptions.get(subscriptionId);
      if (!latest || latest.runtimeEventName !== subscription.runtimeEventName) {
        unlisten();
        return;
      }
      latest.runtimeEventUnlisten = unlisten;
    } catch (error) {
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "task",
        eventType: "task:eventStreamUnavailable",
        taskId: subscription.taskId,
        bridgeAction: subscription.bridgeAction,
        runtimeEventName: subscription.runtimeEventName,
        error: this.buildHostErrorPayload(
          {
            protocol: AGENT_APP_BRIDGE_PROTOCOL,
            version: AGENT_APP_BRIDGE_VERSION,
            type: "capability:subscribe",
            appId: this.appId,
            entryKey: this.entryKey,
          },
          error,
        ),
        emittedAt: (this.now ?? (() => new Date().toISOString()))(),
      });
    }
  }

  private handleRuntimeTaskEvent(subscriptionId: string, payload: unknown): void {
    const subscription = this.taskSubscriptions.get(subscriptionId);
    if (!subscription || this.disposed) {
      return;
    }
    const events = readTaskEventsFromValue(payload);
    const process = this.updateTaskSubscriptionProcess(
      subscription,
      payload,
      events.length ? events : buildTaskEventsFromRuntimeEventPayload(payload),
    );
    this.postToApp("capability:event", {
      subscriptionId,
      capability: "lime.agent",
      topic: "task",
      eventType: "task:runtimeEvent",
      taskId: subscription.taskId,
      bridgeAction: subscription.bridgeAction,
      runtimeEventName: subscription.runtimeEventName,
      runtimeEvent: payload,
      events: events.length ? events : buildTaskEventsFromRuntimeEventPayload(payload),
      runtimeProcess: process,
      process,
      emittedAt: (this.now ?? (() => new Date().toISOString()))(),
    });
  }

  private updateTaskSubscriptionProcess(
    subscription: AgentAppTaskSubscription,
    value: unknown,
    events: unknown[],
  ): AgentAppRuntimeProcessView {
    if (isRecord(value) && (Array.isArray(value.events) || Array.isArray(value.taskEvents))) {
      subscription.latestTask = value;
    }
    subscription.events = mergeTaskEvents(subscription.events, events);
    const explicitProcess = this.readRuntimeProcess(value);
    if (explicitProcess) {
      subscription.process = explicitProcess;
      return explicitProcess;
    }
    const process = buildAgentRuntimeProcessView({
      events: subscription.events,
      task: subscription.latestTask,
      snapshot: value,
    });
    subscription.process = process;
    return process;
  }

  private readRuntimeProcess(value: unknown): AgentAppRuntimeProcessView | null {
    if (!isRecord(value)) {
      return null;
    }
    if (isRecord(value.runtimeProcess)) {
      return value.runtimeProcess as unknown as AgentAppRuntimeProcessView;
    }
    if (isRecord(value.process)) {
      return value.process as unknown as AgentAppRuntimeProcessView;
    }
    const task = isRecord(value.task) ? value.task : undefined;
    if (isRecord(task?.runtimeProcess)) {
      return task.runtimeProcess as unknown as AgentAppRuntimeProcessView;
    }
    if (isRecord(task?.process)) {
      return task.process as unknown as AgentAppRuntimeProcessView;
    }
    const snapshot = isRecord(value.snapshot) ? value.snapshot : undefined;
    if (isRecord(snapshot?.runtimeProcess)) {
      return snapshot.runtimeProcess as unknown as AgentAppRuntimeProcessView;
    }
    if (isRecord(snapshot?.process)) {
      return snapshot.process as unknown as AgentAppRuntimeProcessView;
    }
    return null;
  }

  private async pollTaskSubscription(subscriptionId: string): Promise<void> {
    const subscription = this.taskSubscriptions.get(subscriptionId);
    if (!subscription || subscription.inFlight || this.disposed || !this.dispatchCapability) {
      return;
    }
    subscription.inFlight = true;
    try {
      const result = await this.dispatchCapability(
        this.buildTaskSubscriptionPollRequest(subscription),
      );
      const events = readTaskEventsFromValue(result);
      const process = this.updateTaskSubscriptionProcess(
        subscription,
        result,
        events,
      );
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "task",
        eventType: "task:update",
        taskId: subscription.taskId,
        bridgeAction: subscription.bridgeAction,
        task: result,
        events,
        runtimeProcess: process,
        process,
        emittedAt: (this.now ?? (() => new Date().toISOString()))(),
      });
      const shouldPollForTerminalArtifact =
        isSuccessfulTerminalTaskValue(result) && !hasWorkspacePatchPayload(result);
      if (shouldPollForTerminalArtifact) {
        subscription.terminalArtifactReplayPolls += 1;
      }
      if (
        isTerminalTaskValue(result) &&
        (!shouldPollForTerminalArtifact ||
          subscription.terminalArtifactReplayPolls > DEFAULT_TERMINAL_ARTIFACT_REPLAY_POLLS)
      ) {
        this.stopTaskSubscription(subscriptionId);
        return;
      }
    } catch (error) {
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "task",
        eventType: "task:error",
        taskId: subscription.taskId,
        bridgeAction: subscription.bridgeAction,
        error: this.buildHostErrorPayload(
          {
            protocol: AGENT_APP_BRIDGE_PROTOCOL,
            version: AGENT_APP_BRIDGE_VERSION,
            type: "capability:invoke",
            appId: this.appId,
            entryKey: this.entryKey,
          },
          error,
        ),
        emittedAt: (this.now ?? (() => new Date().toISOString()))(),
      });
      this.stopTaskSubscription(subscriptionId);
      return;
    } finally {
      subscription.inFlight = false;
    }

    const latest = this.taskSubscriptions.get(subscriptionId);
    if (!latest || this.disposed) {
      return;
    }
    latest.timerId = window.setTimeout(() => {
      void this.pollTaskSubscription(subscriptionId);
    }, latest.pollIntervalMs);
  }

  private buildTaskSubscriptionPollRequest(
    subscription: AgentAppTaskSubscription,
  ): AgentAppHostBridgeCapabilityRequest {
    const input = { taskId: subscription.taskId };
    const invokeRequest = buildLimeCapabilityInvokeRequest({
      capability: "lime.agent",
      method: "getTask" as never,
      args: input,
      requestId: `${subscription.subscriptionId}:poll`,
    }) as LimeCapabilityInvokeRequest;
    const request: AgentAppHostBridgeCapabilityRequest = {
      appId: this.appId,
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
    if (this.entryKey) {
      request.entryKey = this.entryKey;
    }
    return request;
  }

  private stopTaskSubscription(subscriptionId: string): boolean {
    const subscription = this.taskSubscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }
    if (subscription.timerId !== undefined) {
      window.clearTimeout(subscription.timerId);
    }
    subscription.runtimeEventUnlisten?.();
    this.taskSubscriptions.delete(subscriptionId);
    return true;
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

  private buildHostErrorPayload(
    request: LimeAgentAppBridgeMessage,
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

    if (error instanceof AgentAppHostBridgeActionError) {
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
    request: LimeAgentAppBridgeMessage,
    payload: Record<string, unknown>,
  ): void {
    this.postToApp(
      "host:error",
      payload,
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
