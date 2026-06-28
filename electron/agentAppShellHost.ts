import {
  METHOD_AGENT_APP_SHELL_PREPARE,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  type AgentAppShellPrepareResponse,
  type AgentAppUiRuntimeStartParams,
  type AgentAppUiRuntimeStatusParams,
  type AgentAppUiRuntimeStatusResponse,
  type AgentAppUiRuntimeStopParams,
} from "@limecloud/app-server-client";
import { BrowserWindow, dialog } from "./electronRuntime";

type HostArgs = Record<string, unknown> | null | undefined;
type AppServerParams = Record<string, unknown>;
type AppServerRequest = <T>(
  method: string,
  params?: AppServerParams,
) => Promise<T>;

type AgentAppShellPrepareFields = {
  descriptorVersion?: number;
  appId: string;
  installMode: string;
  shellKind: string;
  entryKey: string;
  windowTitle: string;
};
type AgentAppShellSurfaceStrategy =
  | "controlledBrowserWindow"
  | "webContentsView";
type AgentAppShellSurfaceInfo = {
  activeStrategy: AgentAppShellSurfaceStrategy;
  supportedStrategies: AgentAppShellSurfaceStrategy[];
  entryUrl: string;
  containerId: string;
  embedding: {
    standaloneWindow: boolean;
    rightSurfaceDock: boolean;
    iframe: false;
    browserView: false;
  };
  isolation: {
    contextIsolation: true;
    sandbox: true;
    nodeIntegration: false;
  };
};
type AgentAppShellLaunchResult = {
  appId?: string;
  status: "launched" | "blocked";
  installMode?: string;
  shellKind?: string;
  descriptorVersion?: number;
  devShell: true;
  blockerCodes: string[];
  message?: string;
  packageMount?: {
    kind: "local_dir";
    path: string;
    readOnly: true;
    packageHash: string;
    manifestHash: string;
  };
  runtimeStatus?: AgentAppUiRuntimeStatusResponse;
  surface?: AgentAppShellSurfaceInfo;
  shellWindow?: {
    label: string;
    title: string;
    url: string;
    reused: boolean;
    chrome: {
      deepLinkScheme: string;
      openEntryKey: string;
      trayEnabled: boolean;
      closePolicy: "hide_to_tray";
      menuItemIds: string[];
      multiAppManagement: boolean;
      runtimeBypass: boolean;
    };
  };
  launchedAt: string;
};

export class AgentAppShellHost {
  readonly #appServerRequest: AppServerRequest;

  constructor(appServerRequest: AppServerRequest) {
    this.#appServerRequest = appServerRequest;
  }

  async selectDirectory(
    args: HostArgs,
  ): Promise<{ path: string | null; cancelled: boolean }> {
    const request = readRequest(args);
    const title = readString(request, "title") || "选择 Agent App 目录";
    const selected = await dialog.showOpenDialog({
      title,
      properties: ["openDirectory"],
    });
    const path = selected.canceled ? null : (selected.filePaths[0] ?? null);
    return {
      path,
      cancelled: path === null,
    };
  }

  async launchShell(args: HostArgs): Promise<AgentAppShellLaunchResult> {
    const launchedAt = new Date().toISOString();
    const request = readRequest(args);
    const prepare = await this.#appServerRequest<AgentAppShellPrepareResponse>(
      METHOD_AGENT_APP_SHELL_PREPARE,
      {
        descriptor: request.descriptor ?? {},
      },
    );
    const fields = prepareAgentAppShellFields(prepare);
    if (prepare.status !== "ready") {
      return buildAgentAppShellLaunchResult({
        fields,
        status: "blocked",
        blockerCodes: Array.isArray(prepare.blockerCodes)
          ? prepare.blockerCodes
          : ["SHELL_PREPARE_FAILED"],
        message: prepare.message ?? "Agent App shell 启动前校验未通过。",
        packageMount: normalizeAgentAppShellPackageMount(prepare.packageMount),
        launchedAt,
      });
    }
    if (!fields) {
      return buildAgentAppShellLaunchResult({
        status: "blocked",
        blockerCodes: ["SHELL_PREPARE_RESULT_INVALID"],
        message: "App Server agentAppShell/prepare 未返回可启动字段。",
        launchedAt,
      });
    }

    const packageMount = normalizeAgentAppShellPackageMount(
      prepare.packageMount,
    );
    const runtimeStatus = await this.startUiRuntime({
      appId: fields.appId,
      entryKey: fields.entryKey,
    });
    if (!runtimeStatus.entryUrl) {
      return buildAgentAppShellLaunchResult({
        fields,
        status: "blocked",
        blockerCodes: ["SHELL_ENTRY_URL_MISSING"],
        message: "Agent App UI runtime 未返回可打开的 entry URL。",
        packageMount,
        runtimeStatus,
        launchedAt,
      });
    }

    const shellWindow = openAgentAppShellBrowserWindow(
      fields,
      runtimeStatus.entryUrl,
    );
    const surface = buildAgentAppShellSurfaceInfo({
      containerId: shellWindow.label,
      entryUrl: runtimeStatus.entryUrl,
    });
    return buildAgentAppShellLaunchResult({
      fields,
      status: "launched",
      blockerCodes: [],
      message: "Agent App dev shell 已复用 current UI runtime 并打开独立窗口。",
      packageMount,
      runtimeStatus,
      surface,
      shellWindow,
      launchedAt,
    });
  }

  async startUiRuntime(
    args: HostArgs,
  ): Promise<AgentAppUiRuntimeStatusResponse> {
    const request = readRequest(args);
    const params: AgentAppUiRuntimeStartParams = {
      appId: readRequiredString(request, "appId"),
    };
    const entryKey = readString(request, "entryKey");
    if (entryKey) {
      params.entryKey = entryKey;
    }
    return await this.#appServerRequest<AgentAppUiRuntimeStatusResponse>(
      METHOD_AGENT_APP_UI_RUNTIME_START,
      params,
    );
  }

  async getUiRuntimeStatus(
    args: HostArgs,
  ): Promise<AgentAppUiRuntimeStatusResponse> {
    const request = readRequest(args);
    const params: AgentAppUiRuntimeStatusParams = {
      appId: readRequiredString(request, "appId"),
    };
    return await this.#appServerRequest<AgentAppUiRuntimeStatusResponse>(
      METHOD_AGENT_APP_UI_RUNTIME_STATUS,
      params,
    );
  }

  async stopUiRuntime(
    args: HostArgs,
  ): Promise<AgentAppUiRuntimeStatusResponse> {
    const request = readRequest(args);
    const params: AgentAppUiRuntimeStopParams = {
      appId: readRequiredString(request, "appId"),
    };
    return await this.#appServerRequest<AgentAppUiRuntimeStatusResponse>(
      METHOD_AGENT_APP_UI_RUNTIME_STOP,
      params,
    );
  }
}

function openAgentAppShellBrowserWindow(
  fields: AgentAppShellPrepareFields,
  entryUrl: string,
): NonNullable<AgentAppShellLaunchResult["shellWindow"]> {
  const label = `agent-app-shell-${fields.appId}-${fields.installMode}`;
  const existing = BrowserWindow.getAllWindows().find(
    (window) => window.webContents.getURL() === entryUrl,
  );
  const targetWindow =
    existing ??
    new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 960,
      minHeight: 640,
      title: fields.windowTitle,
      show: false,
      backgroundColor: "#f7fbf4",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  if (!existing) {
    void targetWindow.loadURL(entryUrl);
    targetWindow.once("ready-to-show", () => {
      targetWindow.show();
    });
  } else {
    targetWindow.show();
  }
  targetWindow.focus();

  return {
    label,
    title: fields.windowTitle,
    url: entryUrl,
    reused: Boolean(existing),
    chrome: {
      deepLinkScheme: `lime-agent-${fields.appId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      openEntryKey: fields.entryKey,
      trayEnabled: true,
      closePolicy: "hide_to_tray",
      menuItemIds: ["open", "check_updates", "quit"],
      multiAppManagement: false,
      runtimeBypass: false,
    },
  };
}

function buildAgentAppShellSurfaceInfo({
  containerId,
  entryUrl,
}: {
  containerId: string;
  entryUrl: string;
}): AgentAppShellSurfaceInfo {
  return {
    activeStrategy: "controlledBrowserWindow",
    supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
    entryUrl,
    containerId,
    embedding: {
      standaloneWindow: true,
      rightSurfaceDock: true,
      iframe: false,
      browserView: false,
    },
    isolation: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  };
}

function prepareAgentAppShellFields(
  response: AgentAppShellPrepareResponse,
): AgentAppShellPrepareFields | undefined {
  if (
    !response.appId ||
    !response.installMode ||
    !response.shellKind ||
    !response.entryKey
  ) {
    return undefined;
  }
  return {
    appId: response.appId,
    installMode: response.installMode,
    shellKind: response.shellKind,
    descriptorVersion: response.descriptorVersion,
    entryKey: response.entryKey,
    windowTitle: response.windowTitle || response.appId,
  };
}

function normalizeAgentAppShellPackageMount(
  value: AgentAppShellPrepareResponse["packageMount"],
): AgentAppShellLaunchResult["packageMount"] | undefined {
  if (
    !value ||
    value.kind !== "local_dir" ||
    !value.path ||
    !value.packageHash ||
    !value.manifestHash
  ) {
    return undefined;
  }
  return {
    kind: "local_dir",
    path: value.path,
    readOnly: true,
    packageHash: value.packageHash,
    manifestHash: value.manifestHash,
  };
}

function buildAgentAppShellLaunchResult(params: {
  fields?: AgentAppShellPrepareFields;
  status: "launched" | "blocked";
  blockerCodes: string[];
  message?: string;
  packageMount?: AgentAppShellLaunchResult["packageMount"];
  runtimeStatus?: AgentAppUiRuntimeStatusResponse;
  surface?: AgentAppShellLaunchResult["surface"];
  shellWindow?: AgentAppShellLaunchResult["shellWindow"];
  launchedAt: string;
}): AgentAppShellLaunchResult {
  return {
    appId: params.fields?.appId,
    status: params.status,
    installMode: params.fields?.installMode,
    shellKind: params.fields?.shellKind,
    descriptorVersion: params.fields?.descriptorVersion,
    devShell: true,
    blockerCodes: params.blockerCodes,
    message: params.message,
    packageMount: params.packageMount,
    runtimeStatus: params.runtimeStatus,
    surface: params.surface,
    shellWindow: params.shellWindow,
    launchedAt: params.launchedAt,
  };
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
  const next = readString(value, key);
  if (!next) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readString(value: unknown, key: string): string | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
