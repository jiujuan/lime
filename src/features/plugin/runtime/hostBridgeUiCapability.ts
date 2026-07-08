import type {
  PluginHostBridgeCapabilityRequest,
} from "./hostBridge";
import {
  PluginHostBridgeActionError,
  hasOwn,
  isRecord,
  readString,
} from "./hostBridgeCommon";
import {
  downloadSameOriginUrl,
  handleHostToast,
  openHostExternalUrl,
  resolveExternalUrl,
  resolveSameOriginActionUrl,
  selectHostDirectory,
  type PluginHostBridgeNotifyPayload,
} from "./hostBridgeHostActions";
import {
  buildPluginHostSnapshot,
  type PluginHostBridgeCapabilities,
  type PluginHostSnapshotPayload,
} from "./hostBridgeSnapshot";

export type PluginHostAgentRunUiMode = "drawer" | "modal" | "page";

export interface PluginHostAgentRunUiRequest {
  taskId?: string;
  sessionId?: string;
  bridgeAction?: string;
  title?: string;
  mode?: PluginHostAgentRunUiMode;
  expectedOutput?: unknown;
  runtimeProcess?: unknown;
  runtimeFacts?: unknown;
  task?: unknown;
  snapshot?: unknown;
  events?: unknown[];
}

export interface PluginHostAgentRunUiOpenResult {
  opened: true;
  surface: "host_agent_run";
  mode: PluginHostAgentRunUiMode;
  taskId?: string;
}

export interface PluginHostAgentRunUiUpdateResult {
  updated: true;
  surface: "host_agent_run";
  taskId?: string;
}

export interface PluginHostAgentRunUiCloseResult {
  closed: true;
  surface: "host_agent_run";
  taskId?: string;
}

interface HandleUiCapabilityInvokeOptions {
  request: PluginHostBridgeCapabilityRequest;
  frame: HTMLIFrameElement;
  isDisposed: () => boolean;
  appId: string;
  entryKey?: string;
  displayName: string;
  entryRoute?: string;
  entryUrl: string;
  locale?: string;
  runtimeOrigin: string;
  now?: () => string;
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
}

export function handleUiCapabilityInvoke(
  options: HandleUiCapabilityInvokeOptions,
): unknown | Promise<unknown> | null {
  const { request } = options;
  if (request.capability !== "lime.ui") {
    return null;
  }
  if (request.method === "toast") {
    handleHostToast(request.input, options.notify);
    return { accepted: true };
  }
  if (request.method === "navigate") {
    const url = resolveSameOriginActionUrl({
      payload: request.input,
      keys: ["route", "url"],
      entryUrl: options.entryUrl,
      runtimeOrigin: options.runtimeOrigin,
    });
    window.setTimeout(() => {
      if (!options.isDisposed()) {
        options.frame.src = url.href;
      }
    }, 0);
    return { navigatedTo: url.pathname + url.search + url.hash };
  }
  if (request.method === "openExternal") {
    const url = resolveExternalUrl(request.input);
    return openHostExternalUrl(url, options.openExternal).then(() => ({
      opened: true,
    }));
  }
  if (request.method === "download") {
    const url = resolveSameOriginActionUrl({
      payload: request.input,
      keys: ["url", "href"],
      entryUrl: options.entryUrl,
      runtimeOrigin: options.runtimeOrigin,
    });
    downloadSameOriginUrl(url, request.input);
    return { downloaded: true };
  }
  if (request.method === "selectDirectory") {
    return selectHostDirectory(request.input);
  }
  if (request.method === "getSnapshot") {
    return buildPluginHostSnapshot({
      appId: options.appId,
      entryKey: options.entryKey,
      displayName: options.displayName,
      entryRoute: options.entryRoute,
      entryUrl: options.entryUrl,
      locale: options.locale,
      now: options.now,
      runtimeOrigin: options.runtimeOrigin,
      cloud: options.cloud,
      capabilities: options.capabilities,
    }) as unknown as Record<string, unknown>;
  }
  if (request.method === "openAgentRun") {
    return (
      options.openAgentRunUi?.(normalizeAgentRunUiRequest(request.input)) ?? {
        opened: true,
        surface: "host_agent_run",
        mode: "drawer",
        taskId: readAgentRunUiTaskId(request.input),
      }
    );
  }
  if (request.method === "updateAgentRun") {
    return (
      options.updateAgentRunUi?.(normalizeAgentRunUiRequest(request.input)) ?? {
        updated: true,
        surface: "host_agent_run",
        taskId: readAgentRunUiTaskId(request.input),
      }
    );
  }
  if (request.method === "closeAgentRun") {
    const normalized = normalizeAgentRunUiRequest(request.input);
    return (
      options.closeAgentRunUi?.({
        taskId: normalized.taskId,
        bridgeAction: normalized.bridgeAction,
      }) ?? {
        closed: true,
        surface: "host_agent_run",
        taskId: normalized.taskId,
      }
    );
  }
  throw new PluginHostBridgeActionError(
    "UNSUPPORTED_CAPABILITY_METHOD",
    `${request.capability}.${request.method} is not supported by Plugin Host Bridge.`,
  );
}

function normalizeAgentRunUiRequest(
  input: unknown,
): PluginHostAgentRunUiRequest {
  if (!isRecord(input)) {
    return {};
  }
  const mode = readString(input, "mode");
  return {
    taskId: readAgentRunUiTaskId(input),
    sessionId: readString(input, "sessionId"),
    bridgeAction: readString(input, "bridgeAction"),
    title: readString(input, "title"),
    mode: mode === "modal" || mode === "page" ? mode : "drawer",
    expectedOutput: hasOwn(input, "expectedOutput")
      ? input.expectedOutput
      : undefined,
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

function readAgentRunUiTaskId(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  return (
    readString(input, "taskId") ??
    (isRecord(input.task) ? readString(input.task, "taskId") : undefined) ??
    (isRecord(input.snapshot)
      ? readString(input.snapshot, "taskId")
      : undefined)
  );
}
