import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { selectPluginDirectory } from "@/lib/api/plugins";
import {
  PluginHostBridgeActionError,
  isRecord,
  readString,
} from "./hostBridgeCommon";

export interface PluginHostBridgeNotifyPayload {
  message: string;
  level: "info" | "success" | "warning" | "error";
}

export interface PluginHostSelectDirectoryResult {
  path: string | null;
  cancelled: boolean;
  message?: string;
}

export function handleHostToast(
  payload: unknown,
  notify?: (payload: PluginHostBridgeNotifyPayload) => void,
): void {
  if (!isRecord(payload)) {
    throw new PluginHostBridgeActionError(
      "INVALID_PAYLOAD",
      "host:toast requires a payload object.",
    );
  }
  const message = readString(payload, "message");
  if (!message) {
    throw new PluginHostBridgeActionError(
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
  notify?.({ message, level });
}

export function resolveSameOriginActionUrl(options: {
  payload: unknown;
  keys: string[];
  entryUrl: string;
  runtimeOrigin: string;
}): URL {
  const { payload, keys, entryUrl, runtimeOrigin } = options;
  if (!isRecord(payload)) {
    throw new PluginHostBridgeActionError(
      "INVALID_PAYLOAD",
      "URL action requires a payload object.",
    );
  }
  const target = keys.map((key) => readString(payload, key)).find(Boolean);
  if (!target) {
    throw new PluginHostBridgeActionError(
      "INVALID_PAYLOAD",
      "URL action requires a route or url.",
    );
  }
  const url = new URL(target, entryUrl);
  if (url.origin !== runtimeOrigin) {
    throw new PluginHostBridgeActionError(
      "UNTRUSTED_URL",
      "URL must stay inside the Plugin runtime origin.",
    );
  }
  return url;
}

export function resolveExternalUrl(payload: unknown): URL {
  if (!isRecord(payload)) {
    throw new PluginHostBridgeActionError(
      "INVALID_PAYLOAD",
      "host:openExternal requires a payload object.",
    );
  }
  const target = readString(payload, "url");
  if (!target) {
    throw new PluginHostBridgeActionError(
      "INVALID_PAYLOAD",
      "host:openExternal requires payload.url.",
    );
  }
  const url = new URL(target);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PluginHostBridgeActionError(
      "UNTRUSTED_URL",
      "Only http and https URLs can be opened externally.",
    );
  }
  return url;
}

export function downloadSameOriginUrl(url: URL, payload: unknown): void {
  const link = document.createElement("a");
  link.href = url.href;
  link.download = isRecord(payload) ? (readString(payload, "fileName") ?? "") : "";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function openHostExternalUrl(
  url: URL,
  openExternal?: (url: string) => void | Promise<void>,
): Promise<void> {
  const target = url.href;
  if (openExternal) {
    await openExternal(target);
    return;
  }
  await openExternalUrlWithSystemBrowser(target);
}

export async function selectHostDirectory(
  input: unknown,
): Promise<PluginHostSelectDirectoryResult> {
  const title = isRecord(input) ? readString(input, "title") : undefined;
  const selected = await selectPluginDirectory({ title });
  const path = selected.path ?? null;
  return {
    path,
    cancelled: selected.cancelled || !path,
    message: selected.message,
  };
}
