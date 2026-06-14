import {
  shell,
  WebContentsView,
  type BrowserWindow,
  type Rectangle,
} from "./electronRuntime";

type HostArgs = Record<string, unknown> | null | undefined;
type HostEventEmitter = (event: string, payload?: unknown) => void;

export const EMBEDDED_BROWSER_COMMANDS = [
  "embedded_browser_view_mount",
  "embedded_browser_view_set_bounds",
  "embedded_browser_view_navigate",
  "embedded_browser_view_reload",
  "embedded_browser_view_go_back",
  "embedded_browser_view_go_forward",
  "embedded_browser_view_destroy",
] as const;

export type EmbeddedBrowserCommand = (typeof EMBEDDED_BROWSER_COMMANDS)[number];

export interface EmbeddedBrowserViewState {
  viewId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

interface EmbeddedBrowserEntry {
  viewId: string;
  view: WebContentsView;
  window: BrowserWindow;
  closeListener: () => void;
  pendingUrl?: string;
  navigationToken: number;
}

export function isEmbeddedBrowserCommand(
  command: string,
): command is EmbeddedBrowserCommand {
  return EMBEDDED_BROWSER_COMMANDS.includes(command as EmbeddedBrowserCommand);
}

export class ElectronEmbeddedBrowserHost {
  #entries = new Map<string, EmbeddedBrowserEntry>();
  #emit: HostEventEmitter;

  constructor(emit: HostEventEmitter = () => undefined) {
    this.#emit = emit;
  }

  async invoke(
    window: BrowserWindow | null,
    command: EmbeddedBrowserCommand,
    args?: HostArgs,
  ): Promise<unknown> {
    if (command === "embedded_browser_view_destroy") {
      return this.#destroy(args);
    }

    if (!window || window.isDestroyed()) {
      throw new Error("当前窗口不可用，无法显示内嵌浏览器。");
    }

    switch (command) {
      case "embedded_browser_view_mount":
        return await this.#mount(window, args);
      case "embedded_browser_view_set_bounds":
        return this.#setBounds(window, args);
      case "embedded_browser_view_navigate":
        return await this.#navigate(window, args);
      case "embedded_browser_view_reload":
        return this.#reload(window, args);
      case "embedded_browser_view_go_back":
        return this.#goBack(window, args);
      case "embedded_browser_view_go_forward":
        return this.#goForward(window, args);
      default:
        return {};
    }
  }

  dispose(): void {
    for (const viewId of [...this.#entries.keys()]) {
      this.#destroy({ viewId });
    }
  }

  async #mount(
    window: BrowserWindow,
    args?: HostArgs,
  ): Promise<EmbeddedBrowserViewState> {
    const viewId = readViewId(args);
    const url = readOptionalUrl(args);
    const bounds = readOptionalBounds(args);
    const visible = readOptionalBoolean(args, "visible") ?? true;
    const entry = this.#ensureEntry(window, viewId);

    if (bounds) {
      applyBounds(entry.view, bounds, visible);
    } else {
      entry.view.setVisible(visible);
    }

    if (url) {
      this.#startNavigation(entry, url);
    }

    return this.#emitState(entry);
  }

  #setBounds(window: BrowserWindow, args?: HostArgs): EmbeddedBrowserViewState {
    const entry = this.#ensureEntry(window, readViewId(args));
    const bounds = readBounds(args);
    const visible = readOptionalBoolean(args, "visible") ?? true;
    applyBounds(entry.view, bounds, visible);
    return this.#emitState(entry);
  }

  async #navigate(
    window: BrowserWindow,
    args?: HostArgs,
  ): Promise<EmbeddedBrowserViewState> {
    const entry = this.#ensureEntry(window, readViewId(args));
    this.#startNavigation(entry, readUrl(args));
    return this.#emitState(entry);
  }

  #reload(window: BrowserWindow, args?: HostArgs): EmbeddedBrowserViewState {
    const entry = this.#ensureEntry(window, readViewId(args));
    entry.view.webContents.reload();
    return this.#emitState(entry);
  }

  #goBack(window: BrowserWindow, args?: HostArgs): EmbeddedBrowserViewState {
    const entry = this.#ensureEntry(window, readViewId(args));
    if (entry.view.webContents.navigationHistory.canGoBack()) {
      entry.view.webContents.navigationHistory.goBack();
    }
    return this.#emitState(entry);
  }

  #goForward(window: BrowserWindow, args?: HostArgs): EmbeddedBrowserViewState {
    const entry = this.#ensureEntry(window, readViewId(args));
    if (entry.view.webContents.navigationHistory.canGoForward()) {
      entry.view.webContents.navigationHistory.goForward();
    }
    return this.#emitState(entry);
  }

  #destroy(args?: HostArgs): Record<string, never> {
    const viewId = readViewId(args);
    const entry = this.#entries.get(viewId);
    if (!entry) {
      return {};
    }

    entry.window.off("closed", entry.closeListener);
    entry.window.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close();
    }
    this.#entries.delete(viewId);
    this.#emit("embedded-browser-view-destroyed", { viewId });
    return {};
  }

  #ensureEntry(window: BrowserWindow, viewId: string): EmbeddedBrowserEntry {
    const existing = this.#entries.get(viewId);
    if (existing) {
      if (existing.window !== window) {
        existing.window.off("closed", existing.closeListener);
        existing.window.contentView.removeChildView(existing.view);
        existing.window = window;
        existing.closeListener = () => this.#destroy({ viewId });
        window.on("closed", existing.closeListener);
      }
      window.contentView.addChildView(existing.view);
      return existing;
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        javascript: true,
        nodeIntegration: false,
        partition: "persist:embedded-browser",
        sandbox: true,
        webSecurity: true,
      },
    });
    view.setBackgroundColor("#ffffff");
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    const entry: EmbeddedBrowserEntry = {
      viewId,
      view,
      window,
      closeListener: () => this.#destroy({ viewId }),
      navigationToken: 0,
    };
    window.on("closed", entry.closeListener);
    window.contentView.addChildView(view);
    this.#entries.set(viewId, entry);
    view.webContents.on("did-navigate", (_event, url) => {
      this.#clearPendingNavigation(entry, url);
      this.#emitState(entry);
    });
    view.webContents.on("did-navigate-in-page", (_event, url) => {
      this.#clearPendingNavigation(entry, url);
      this.#emitState(entry);
    });
    view.webContents.on("did-start-loading", () => this.#emitState(entry));
    view.webContents.on("did-stop-loading", () => {
      this.#clearPendingNavigation(entry, entry.view.webContents.getURL());
      this.#emitState(entry);
    });
    view.webContents.on("page-title-updated", () => this.#emitState(entry));
    view.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedUrl) => {
        if (!this.#isCurrentNavigationEvent(entry, validatedUrl)) {
          return;
        }
        this.#clearPendingNavigation(entry, validatedUrl);
        this.#emitLoadFailed(
          entry,
          errorCode,
          errorDescription,
          typeof validatedUrl === "string" ? validatedUrl : undefined,
        );
      },
    );
    return entry;
  }

  #startNavigation(entry: EmbeddedBrowserEntry, url: string): void {
    entry.pendingUrl = url;
    const navigationToken = entry.navigationToken + 1;
    entry.navigationToken = navigationToken;

    let loadPromise: Promise<void>;
    try {
      loadPromise = entry.view.webContents.loadURL(url);
    } catch (error) {
      this.#clearPendingNavigation(entry);
      this.#emitLoadFailed(
        entry,
        null,
        error instanceof Error ? error.message : String(error),
        url,
      );
      return;
    }

    void loadPromise
      .then(() => {
        if (
          this.#entries.get(entry.viewId) !== entry ||
          entry.navigationToken !== navigationToken ||
          entry.pendingUrl !== url
        ) {
          return;
        }
        this.#clearPendingNavigation(entry);
        this.#emitState(entry);
      })
      .catch((error) => {
        if (
          this.#entries.get(entry.viewId) !== entry ||
          entry.navigationToken !== navigationToken ||
          entry.pendingUrl !== url
        ) {
          return;
        }
        this.#clearPendingNavigation(entry);
        this.#emitLoadFailed(
          entry,
          null,
          error instanceof Error ? error.message : String(error),
          url,
        );
      });
  }

  #clearPendingNavigation(entry: EmbeddedBrowserEntry, url?: unknown): void {
    if (!this.#isCurrentNavigationEvent(entry, url)) {
      return;
    }
    entry.pendingUrl = undefined;
  }

  #isCurrentNavigationEvent(
    entry: EmbeddedBrowserEntry,
    url?: unknown,
  ): boolean {
    return !(
      typeof url === "string" &&
      entry.pendingUrl &&
      url !== entry.pendingUrl
    );
  }

  #emitLoadFailed(
    entry: EmbeddedBrowserEntry,
    errorCode: number | null,
    errorDescription: string,
    url?: string,
  ): void {
    this.#emit("embedded-browser-view-load-failed", {
      ...readState(entry),
      ...(url ? { url } : {}),
      errorCode,
      errorDescription,
    });
  }

  #emitState(entry: EmbeddedBrowserEntry): EmbeddedBrowserViewState {
    const state = readState(entry);
    this.#emit("embedded-browser-view-state", state);
    return state;
  }
}

function readState(entry: EmbeddedBrowserEntry): EmbeddedBrowserViewState {
  const webContents = entry.view.webContents;
  return {
    viewId: entry.viewId,
    url: entry.pendingUrl || webContents.getURL(),
    title: webContents.getTitle(),
    canGoBack: webContents.navigationHistory.canGoBack(),
    canGoForward: webContents.navigationHistory.canGoForward(),
    isLoading: webContents.isLoading() || Boolean(entry.pendingUrl),
  };
}

function readViewId(args?: HostArgs): string {
  const value = readString(args, "viewId");
  if (!value) {
    throw new Error("embedded browser viewId 不能为空。");
  }
  return value;
}

function readUrl(args?: HostArgs): string {
  const value = readOptionalUrl(args);
  if (!value) {
    throw new Error("embedded browser url 不能为空。");
  }
  return value;
}

function readOptionalUrl(args?: HostArgs): string | null {
  const value = readString(args, "url");
  if (!value) {
    return null;
  }
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    throw new Error("内嵌浏览器只支持 http/https 地址。");
  }
  return normalized;
}

function readBounds(args?: HostArgs): Rectangle {
  const bounds = readOptionalBounds(args);
  if (!bounds) {
    throw new Error("embedded browser bounds 不能为空。");
  }
  return bounds;
}

function readOptionalBounds(args?: HostArgs): Rectangle | null {
  const source = readRecord(args)?.bounds;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const record = source as Record<string, unknown>;
  const x = readInteger(record.x);
  const y = readInteger(record.y);
  const width = readInteger(record.width);
  const height = readInteger(record.height);
  if (x === null || y === null || width === null || height === null) {
    throw new Error("embedded browser bounds 必须包含整数 x/y/width/height。");
  }
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

function applyBounds(
  view: WebContentsView,
  bounds: Rectangle,
  visible: boolean,
): void {
  view.setBounds(bounds);
  view.setVisible(visible && bounds.width > 0 && bounds.height > 0);
}

function readOptionalBoolean(args: HostArgs, key: string): boolean | null {
  const value = readRecord(args)?.[key];
  return typeof value === "boolean" ? value : null;
}

function readString(args: HostArgs, key: string): string | null {
  const value = readRecord(args)?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(args: HostArgs): Record<string, unknown> | null {
  return args && typeof args === "object" && !Array.isArray(args) ? args : null;
}

function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  return Boolean(normalizeHttpUrl(value));
}
