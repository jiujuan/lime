import {
  IPC_DEEP_LINK_GET_CURRENT_CHANNEL,
  IPC_DEEP_LINK_GET_URLS_CHANNEL,
  IPC_DIALOG_OPEN_CHANNEL,
  IPC_DIALOG_SAVE_CHANNEL,
  IPC_EMIT_CHANNEL,
  IPC_GLOBAL_SHORTCUT_COMMAND_CHANNEL,
  IPC_INVOKE_CHANNEL,
  IPC_SHELL_OPEN_CHANNEL,
  IPC_WINDOW_COMMAND_CHANNEL,
  isElectronAppServerCommand,
  isElectronHostCommand,
  isElectronUpdateCommand,
  type ElectronInvokeResponse,
} from "./ipcChannels";
import { ElectronAppServerHost } from "./appServerHost";
import { ElectronHostCommands } from "./hostCommands";
import { ElectronUpdateHost } from "./updateHost";
import {
  AppServerClient,
  decodeMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  SERVER_NAME,
  type InitializeResponse,
} from "app-server-client";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  type OpenDialogOptions,
  shell,
  type SaveDialogOptions,
  Tray,
  type IpcMainInvokeEvent,
} from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appServerHost = new ElectronAppServerHost();
const hostCommands = new ElectronHostCommands(appServerHost);
const updateHost = new ElectronUpdateHost(broadcast);
const pendingDeepLinks: string[] = [];
const APP_NAME = "Lime";
const APP_ICON_SOURCE = "lime-rs/icons/icon.png";
const APP_ICON_PACKAGED_NAME = "icon.png";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

app.setName(APP_NAME);

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: APP_NAME,
    icon: resolveDesktopAsset(APP_ICON_SOURCE, APP_ICON_PACKAGED_NAME),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.resolve(__dirname, "../preload/preload.cjs"),
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  installMainWindowNavigationGuard(window, devServerUrl);
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    if (process.env.LIME_ELECTRON_OPEN_DEVTOOLS === "1") {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void window.loadFile(path.resolve(app.getAppPath(), "dist/index.html"));
  }

  if (process.env.LIME_ELECTRON_SMOKE === "1") {
    window.webContents.once("did-finish-load", () => {
      void runElectronSmokeChecks()
        .then(() => {
          app.quit();
        })
        .catch((error) => {
          console.error(
            `[electron-smoke] failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          process.exitCode = 1;
          app.quit();
        });
    });
    window.webContents.once("did-fail-load", (_event, code, description) => {
      console.error(`[electron-smoke] renderer failed: ${code} ${description}`);
      process.exitCode = 1;
      app.quit();
    });
  }

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.on("close", (event) => {
    if (isQuitting || process.env.LIME_ELECTRON_SMOKE === "1") {
      return;
    }
    event.preventDefault();
    window.hide();
  });

  mainWindow = window;
  return window;
}

async function runElectronSmokeChecks(): Promise<void> {
  console.log("[electron-smoke] renderer loaded");
  const client = new AppServerClient({ initialRequestId: 1 });
  const request = client.initialize({
    clientInfo: {
      name: "electron_smoke",
      title: "Electron smoke",
      version: app.getVersion(),
    },
    capabilities: {
      eventMethods: ["agentSession/event"],
      experimental: true,
    },
  });
  const response = await appServerHost.handleJsonLines({
    lines: [encodeMessage(request)],
  });
  const message = decodeMessage(response.lines[0] ?? "");
  if (!("result" in message)) {
    throw new Error("app-server initialize did not return a result");
  }

  const result = message.result as InitializeResponse;
  if (result.serverInfo.name !== SERVER_NAME) {
    throw new Error(
      `unexpected app-server name: ${String(result.serverInfo.name)}`,
    );
  }
  if (result.serverInfo.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `unexpected app-server protocol: ${String(
        result.serverInfo.protocolVersion,
      )}`,
    );
  }
  console.log(
    `[electron-smoke] app-server initialized protocol=${result.serverInfo.protocolVersion} version=${result.serverInfo.version}`,
  );
}

function installMainWindowNavigationGuard(
  window: BrowserWindow,
  devServerUrl?: string,
): void {
  const allowedOrigin = devServerUrl ? new URL(devServerUrl).origin : null;

  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (isAllowedMainWindowNavigation(targetUrl, allowedOrigin)) {
      return;
    }
    event.preventDefault();
    void shell.openExternal(targetUrl);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "deny" };
  });
}

function isAllowedMainWindowNavigation(
  targetUrl: string,
  allowedOrigin: string | null,
): boolean {
  try {
    const url = new URL(targetUrl);
    if (url.protocol === "file:") {
      return true;
    }
    return allowedOrigin !== null && url.origin === allowedOrigin;
  } catch {
    return false;
  }
}

function createTray(): Tray | null {
  const image = loadTrayImage();
  if (image.isEmpty()) {
    console.warn("[electron-host] tray icon missing, skip tray setup");
    return null;
  }

  const nextTray = new Tray(image);
  nextTray.setToolTip(APP_NAME);
  nextTray.setContextMenu(buildTrayMenu());
  nextTray.on("click", () => {
    showMainWindow();
  });
  return nextTray;
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: `显示 ${APP_NAME}`,
      click: () => showMainWindow(),
    },
    {
      label: "隐藏窗口",
      click: () => mainWindow?.hide(),
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function loadTrayImage(): Electron.NativeImage {
  const preferred =
    process.platform === "darwin"
      ? "lime-rs/icons/tray/trayTemplate.png"
      : "lime-rs/icons/tray/tray-running.png";
  const image = nativeImage.createFromPath(
    resolveDesktopAsset(preferred, path.basename(preferred)),
  );
  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }
  return image;
}

function broadcast(event: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(`evt:${event}`, { event, payload });
  }
}

function currentWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE_CHANNEL,
    async (_event, command: string, args?: Record<string, unknown>) => {
      try {
        const result = await handleHostInvoke(command, args);
        return { ok: true, result } satisfies ElectronInvokeResponse;
      } catch (error) {
        return {
          ok: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        } satisfies ElectronInvokeResponse;
      }
    },
  );

  ipcMain.on(IPC_EMIT_CHANNEL, (_event, event: string, payload?: unknown) => {
    broadcast(event, payload);
  });

  ipcMain.handle(IPC_DIALOG_OPEN_CHANNEL, async (_event, options) => {
    const normalizedOptions = normalizeOpenDialogOptions(options);
    const result = await dialog.showOpenDialog(normalizedOptions.options);
    if (result.canceled) {
      return null;
    }
    return normalizedOptions.multipleSelection
      ? result.filePaths
      : result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC_DIALOG_SAVE_CHANNEL, async (_event, options) => {
    const result = await dialog.showSaveDialog({
      ...normalizeSaveDialogOptions(options),
    });
    return result.canceled ? null : result.filePath ?? null;
  });

  ipcMain.handle(IPC_SHELL_OPEN_CHANNEL, async (_event, target: string) => {
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
      return;
    }
    await shell.openPath(target);
  });

  ipcMain.handle(
    IPC_WINDOW_COMMAND_CHANNEL,
    async (event, command: string, ...args: unknown[]) => {
      const window = currentWindow(event);
      if (!window) {
        return null;
      }
      return handleWindowCommand(window, command, args);
    },
  );

  ipcMain.handle(
    IPC_GLOBAL_SHORTCUT_COMMAND_CHANNEL,
    async (_event, command: string, shortcut?: string) => {
      return handleGlobalShortcutCommand(command, shortcut);
    },
  );

  ipcMain.handle(IPC_DEEP_LINK_GET_URLS_CHANNEL, async () => pendingDeepLinks);
  ipcMain.handle(IPC_DEEP_LINK_GET_CURRENT_CHANNEL, async () =>
    pendingDeepLinks.length > 0 ? pendingDeepLinks : null,
  );
}

async function handleHostInvoke(
  command: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  if (!isElectronHostCommand(command)) {
    throw new Error(`Electron host command is not supported: ${command}`);
  }
  const request = args?.request;
  if (isElectronAppServerCommand(command)) {
    if (command === "app_server_handle_json_lines") {
      return await appServerHost.handleJsonLines(
        typeof request === "object" && request !== null
          ? (request as { lines: string[] })
          : { lines: [] },
      );
    }
    return await appServerHost.drainEvents(
      typeof request === "object" && request !== null
        ? (request as { limit?: number })
        : {},
    );
  }
  if (isElectronUpdateCommand(command)) {
    return await updateHost.invoke(command);
  }
  return await hostCommands.invoke(command, args);
}

type HostOpenDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: OpenDialogOptions["filters"];
  multiple?: boolean;
  directory?: boolean;
  recursive?: boolean;
};

function normalizeOpenDialogOptions(options: unknown): {
  options: OpenDialogOptions;
  multipleSelection: boolean;
} {
  const input =
    options && typeof options === "object"
      ? (options as HostOpenDialogOptions)
      : {};
  const properties: OpenDialogOptions["properties"] = [];
  if (input.directory) {
    properties.push("openDirectory");
  } else {
    properties.push("openFile");
  }
  if (input.multiple) {
    properties.push("multiSelections");
  }
  if (input.recursive) {
    properties.push("treatPackageAsDirectory");
  }

  return {
    options: {
      title: input.title,
      defaultPath: input.defaultPath,
      filters: input.filters,
      properties,
    },
    multipleSelection: Boolean(input.multiple),
  };
}

function normalizeSaveDialogOptions(options: unknown): SaveDialogOptions {
  return options && typeof options === "object"
    ? (options as SaveDialogOptions)
    : {};
}

function handleWindowCommand(
  window: BrowserWindow,
  command: string,
  args: unknown[],
): unknown {
  switch (command) {
    case "show":
      window.show();
      return null;
    case "hide":
      window.hide();
      return null;
    case "close":
      window.close();
      return null;
    case "minimize":
      window.minimize();
      return null;
    case "maximize":
      window.maximize();
      return null;
    case "unmaximize":
      window.unmaximize();
      return null;
    case "center":
      window.center();
      return null;
    case "setFocus":
      window.focus();
      return null;
    case "startDragging":
      return null;
    case "setTitle":
      window.setTitle(String(args[0] ?? ""));
      return null;
    case "setSize":
      window.setSize(Number(args[0]), Number(args[1]));
      return null;
    case "setPosition":
      window.setPosition(Number(args[0]), Number(args[1]));
      return null;
    case "isVisible":
      return window.isVisible();
    case "isMaximized":
      return window.isMaximized();
    case "isFullscreen":
      return window.isFullScreen();
    case "isDecorated":
      return !window.isFullScreen();
    case "isResizable":
      return window.isResizable();
    default:
      throw new Error(`Unsupported window command: ${command}`);
  }
}

function handleGlobalShortcutCommand(
  command: string,
  shortcut?: string,
): boolean | null {
  switch (command) {
    case "register":
      if (!shortcut) {
        throw new Error("Shortcut is required");
      }
      return globalShortcut.register(shortcut, () => {
        broadcast("global-shortcut", { shortcut });
      });
    case "unregister":
      if (shortcut) {
        globalShortcut.unregister(shortcut);
      }
      return null;
    case "unregisterAll":
      globalShortcut.unregisterAll();
      return null;
    case "isRegistered":
      return shortcut ? globalShortcut.isRegistered(shortcut) : false;
    default:
      throw new Error(`Unsupported global shortcut command: ${command}`);
  }
}

function handleDeepLink(url: string): void {
  pendingDeepLinks.push(url);
  broadcast("deep-link-open-url", [url]);
}

app.setAsDefaultProtocolClient("lime");
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

const singleInstanceLock =
  process.env.LIME_ELECTRON_E2E === "1" ||
  process.env.LIME_ELECTRON_SMOKE === "1" ||
  app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    showMainWindow();
    const url = argv.find((arg) => arg.startsWith("lime://"));
    if (url) {
      handleDeepLink(url);
    }
  });

  app.whenReady().then(() => {
    app.setName(APP_NAME);
    const dockIcon = nativeImage.createFromPath(
      resolveDesktopAsset(APP_ICON_SOURCE, APP_ICON_PACKAGED_NAME),
    );
    if (process.platform === "darwin" && !dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon);
    }
    registerIpcHandlers();
    tray = createTray();
    void warmupAppServer();
    createMainWindow();
  });
}

app.on("window-all-closed", () => {
  if (isQuitting || process.env.LIME_ELECTRON_SMOKE === "1") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  void appServerHost.stop();
});

async function warmupAppServer(): Promise<void> {
  try {
    const response = await appServerHost.warmup();
    console.log(
      `[electron-host] app-server ready protocol=${response.serverInfo.protocolVersion} version=${response.serverInfo.version}`,
    );
  } catch (error) {
    console.error(
      `[electron-host] app-server warmup failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function resolveDesktopAsset(sourceRelativePath: string, packagedName: string): string {
  const packagedPath = path.join(process.resourcesPath, "desktop-assets", packagedName);
  if (existsSync(packagedPath)) {
    return packagedPath;
  }

  const builtAssetPath = path.resolve(
    app.getAppPath(),
    "dist-electron/desktop-assets",
    packagedName,
  );
  if (existsSync(builtAssetPath)) {
    return builtAssetPath;
  }

  const appPath = app.getAppPath();
  const repoPath = path.resolve(appPath, sourceRelativePath);
  if (existsSync(repoPath)) {
    return repoPath;
  }

  return path.resolve(process.cwd(), sourceRelativePath);
}
