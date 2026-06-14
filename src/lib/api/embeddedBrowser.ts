import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import {
  getElectronHostBridge,
  isElectronDevBridgeFallbackAvailable,
  isElectronHostCommandAvailable,
} from "@/lib/electron-host";

export interface EmbeddedBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EmbeddedBrowserViewState {
  viewId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

export interface EmbeddedBrowserViewLoadFailedEvent extends EmbeddedBrowserViewState {
  errorCode: number | null;
  errorDescription: string;
}

interface EmbeddedBrowserCommandParams extends Record<string, unknown> {
  viewId: string;
  url?: string;
  bounds?: EmbeddedBrowserBounds;
  visible?: boolean;
}

const EMBEDDED_BROWSER_REQUIRED_COMMANDS = [
  "embedded_browser_view_mount",
  "embedded_browser_view_set_bounds",
  "embedded_browser_view_navigate",
  "embedded_browser_view_reload",
  "embedded_browser_view_go_back",
  "embedded_browser_view_go_forward",
  "embedded_browser_view_destroy",
] as const;

export function isEmbeddedBrowserHostAvailable(): boolean {
  return (
    Boolean(getElectronHostBridge()) &&
    !isElectronDevBridgeFallbackAvailable() &&
    EMBEDDED_BROWSER_REQUIRED_COMMANDS.every((command) =>
      isElectronHostCommandAvailable(command),
    )
  );
}

function assertEmbeddedBrowserViewState(
  value: unknown,
): asserts value is EmbeddedBrowserViewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("embedded browser 未返回有效状态。");
  }
  const record = value as Partial<EmbeddedBrowserViewState>;
  if (
    typeof record.viewId !== "string" ||
    typeof record.url !== "string" ||
    typeof record.title !== "string" ||
    typeof record.canGoBack !== "boolean" ||
    typeof record.canGoForward !== "boolean" ||
    typeof record.isLoading !== "boolean"
  ) {
    throw new Error("embedded browser 状态字段不完整。");
  }
}

async function invokeEmbeddedBrowser(
  command: string,
  params: EmbeddedBrowserCommandParams,
): Promise<EmbeddedBrowserViewState> {
  const result = await safeInvoke<unknown>(command, params);
  assertEmbeddedBrowserViewState(result);
  return result;
}

export async function mountEmbeddedBrowserView(
  params: EmbeddedBrowserCommandParams,
): Promise<EmbeddedBrowserViewState> {
  return invokeEmbeddedBrowser("embedded_browser_view_mount", params);
}

export async function setEmbeddedBrowserViewBounds(
  params: EmbeddedBrowserCommandParams,
): Promise<EmbeddedBrowserViewState> {
  return invokeEmbeddedBrowser("embedded_browser_view_set_bounds", params);
}

export async function navigateEmbeddedBrowserView(
  params: Required<Pick<EmbeddedBrowserCommandParams, "viewId" | "url">>,
): Promise<EmbeddedBrowserViewState> {
  return invokeEmbeddedBrowser("embedded_browser_view_navigate", params);
}

export async function reloadEmbeddedBrowserView(
  viewId: string,
): Promise<EmbeddedBrowserViewState> {
  return invokeEmbeddedBrowser("embedded_browser_view_reload", { viewId });
}

export async function goBackEmbeddedBrowserView(
  viewId: string,
): Promise<EmbeddedBrowserViewState> {
  return invokeEmbeddedBrowser("embedded_browser_view_go_back", { viewId });
}

export async function goForwardEmbeddedBrowserView(
  viewId: string,
): Promise<EmbeddedBrowserViewState> {
  return invokeEmbeddedBrowser("embedded_browser_view_go_forward", { viewId });
}

export async function destroyEmbeddedBrowserView(
  viewId: string,
): Promise<void> {
  await safeInvoke("embedded_browser_view_destroy", { viewId });
}

export function listenEmbeddedBrowserViewState(
  handler: (state: EmbeddedBrowserViewState) => void,
): Promise<() => void> {
  return safeListen<EmbeddedBrowserViewState>(
    "embedded-browser-view-state",
    (event) => {
      if (event.payload && typeof event.payload === "object") {
        const payload = event.payload;
        assertEmbeddedBrowserViewState(payload);
        handler(payload);
      }
    },
  );
}

function assertEmbeddedBrowserViewLoadFailedEvent(
  value: unknown,
): asserts value is EmbeddedBrowserViewLoadFailedEvent {
  assertEmbeddedBrowserViewState(value);
  const record = value as Partial<EmbeddedBrowserViewLoadFailedEvent>;
  if (
    !(typeof record.errorCode === "number" || record.errorCode === null) ||
    typeof record.errorDescription !== "string"
  ) {
    throw new Error("embedded browser 加载失败事件字段不完整。");
  }
}

export function listenEmbeddedBrowserViewLoadFailed(
  handler: (event: EmbeddedBrowserViewLoadFailedEvent) => void,
): Promise<() => void> {
  return safeListen<EmbeddedBrowserViewLoadFailedEvent>(
    "embedded-browser-view-load-failed",
    (event) => {
      if (event.payload && typeof event.payload === "object") {
        const payload = event.payload;
        assertEmbeddedBrowserViewLoadFailedEvent(payload);
        handler(payload);
      }
    },
  );
}
