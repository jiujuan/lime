import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow } from "./electronRuntime";

type HostArgs = Record<string, unknown> | null | undefined;

type OpenResourceManagerWindowResult = {
  opened: true;
  reused: boolean;
  url: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCE_MANAGER_ROUTE = "/resource-manager";
const RESOURCE_MANAGER_ROUTE_ID = "resource-manager";
const WINDOW_ROUTE_QUERY_PARAM = "lime_window";

export function openResourceManagerWindow(
  args: HostArgs,
): OpenResourceManagerWindowResult {
  const request = readRequest(args);
  const sessionId = readRequiredString(request, "sessionId");
  const url = buildResourceManagerWindowUrl({
    appPath: app.getAppPath(),
    devServerUrl: process.env.VITE_DEV_SERVER_URL?.trim(),
    sessionId,
  });
  const existingWindow = findResourceManagerWindow();
  const targetWindow =
    existingWindow ??
    new BrowserWindow({
      width: 1240,
      height: 820,
      minWidth: 860,
      minHeight: 560,
      title: "Lime 资源管理器",
      show: false,
      backgroundColor: "#f8fafc",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.resolve(__dirname, "../preload/preload.cjs"),
      },
    });

  void targetWindow.loadURL(url);
  if (existingWindow) {
    targetWindow.show();
  } else {
    targetWindow.once("ready-to-show", () => {
      if (!targetWindow.isDestroyed()) {
        targetWindow.show();
      }
    });
  }
  targetWindow.focus();

  return {
    opened: true,
    reused: Boolean(existingWindow),
    url,
  };
}

function buildResourceManagerWindowUrl(params: {
  appPath: string;
  devServerUrl?: string;
  sessionId: string;
}): string {
  const targetUrl = params.devServerUrl
    ? new URL(RESOURCE_MANAGER_ROUTE, params.devServerUrl)
    : pathToFileURL(path.resolve(params.appPath, "dist/index.html"));

  targetUrl.searchParams.set("session", params.sessionId);
  targetUrl.searchParams.set(
    WINDOW_ROUTE_QUERY_PARAM,
    RESOURCE_MANAGER_ROUTE_ID,
  );
  return targetUrl.toString();
}

function findResourceManagerWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((window) =>
      isResourceManagerWindowUrl(window.webContents.getURL()),
    ) ?? null
  );
}

function isResourceManagerWindowUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.pathname === RESOURCE_MANAGER_ROUTE ||
      url.searchParams.get(WINDOW_ROUTE_QUERY_PARAM) ===
        RESOURCE_MANAGER_ROUTE_ID
    );
  } catch {
    return false;
  }
}

function readRequest(value: unknown): Record<string, unknown> {
  return readRecord(value, "request") ?? toRecord(value) ?? {};
}

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const next = record[key];
  return next && typeof next === "object" && !Array.isArray(next)
    ? (next as Record<string, unknown>)
    : null;
}

function readRequiredString(value: unknown, key: string): string {
  const record = toRecord(value);
  const next = typeof record?.[key] === "string" ? record[key].trim() : "";
  if (!next) {
    throw new Error(`${key} is required`);
  }
  return next;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
