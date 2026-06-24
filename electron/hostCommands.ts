/* global Buffer, process */
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  shell,
} from "./electronRuntime";
import {
  AppServerRequestError,
  ERROR_CODES,
  METHOD_AGENT_APP_SHELL_PREPARE,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_MODEL_LIST,
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
  METHOD_PROJECT_SHELL_SESSION_KILL,
  METHOD_PROJECT_SHELL_SESSION_RESIZE,
  METHOD_PROJECT_SHELL_SESSION_START,
  METHOD_PROJECT_SHELL_SESSION_WRITE,
  METHOD_SKILL_LIST,
  METHOD_WORKSPACE_BY_PATH_READ,
  METHOD_WORKSPACE_DEFAULT_ENSURE,
  METHOD_WORKSPACE_DEFAULT_READ,
  METHOD_WORKSPACE_ENSURE,
  METHOD_WORKSPACE_ENSURE_READY,
  METHOD_WORKSPACE_LIST,
  METHOD_WORKSPACE_PROJECTS_ROOT_READ,
  METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
  METHOD_WORKSPACE_READ,
  type AgentSessionActionRespondResponse,
  type AgentSessionReadResponse,
  type AgentSessionRuntimeEventAppendResponse,
  type AgentSessionStartResponse,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartResponse,
  type AgentAppShellPrepareResponse,
  type AgentAppUiRuntimeStartParams,
  type AgentAppUiRuntimeStatusParams,
  type AgentAppUiRuntimeStatusResponse,
  type AgentAppUiRuntimeStopParams,
  type ModelListResponse,
  type ModelProviderListResponse,
  type WorkspaceEnsureProjectResponse,
  type SkillListResponse,
  type WorkspaceEnsureReadyResponse,
  type WorkspaceListResponse,
  type WorkspaceProjectPathResolveResponse,
  type WorkspaceProjectsRootReadResponse,
  type WorkspaceReadResponse,
} from "@limecloud/app-server-client";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ElectronAppServerHost } from "./appServerHost";
import {
  normalizeProjectShellTimeout,
  openProjectPathWithLocalTool,
  runProjectShellCommand,
  type ProjectPathOpenTool,
} from "./projectToolsHost";
import {
  buildAgentAppTaskWorkerFailureResult,
  runAgentAppTaskWorker,
} from "./agentAppTaskWorker";

type HostArgs = Record<string, unknown> | null | undefined;
type AppServerParams = Record<string, unknown>;
type HostEventEmitter = (event: string, payload?: unknown) => void;
type FileManagerLocation = {
  id: string;
  label: string;
  path: string;
  kind: string;
};
type FileManagerLocationCandidate = Omit<FileManagerLocation, "path"> & {
  path: string | null;
};
type ElectronKnownPathName = "home" | "desktop" | "documents" | "downloads";
type LayeredDesignProjectExportFileEncoding = "utf8" | "base64";
type LayeredDesignProjectExportFile = {
  relativePath: string;
  mimeType?: string;
  encoding: LayeredDesignProjectExportFileEncoding;
  content: string;
};
type SaveLayeredDesignProjectExportOutput = {
  projectRootPath: string;
  exportDirectoryPath: string;
  exportDirectoryRelativePath: string;
  designPath: string;
  manifestPath: string;
  previewPngPath?: string;
  assetCount: number;
  fileCount: number;
  bytesWritten: number;
  remoteReferenceAssetCount: number;
  cachedRemoteAssetCount: number;
  uncachedRemoteAssetCount: number;
};
type ReadLayeredDesignProjectExportOutput = {
  projectRootPath: string;
  exportDirectoryPath: string;
  exportDirectoryRelativePath: string;
  designPath: string;
  designJson: string;
  manifestPath?: string;
  manifestJson?: string;
  psdLikeManifestPath?: string;
  psdLikeManifestJson?: string;
  previewPngPath?: string;
  assetCount: number;
  fileCount: number;
  updatedAtMs?: number;
};
type CachedLayeredDesignRemoteAsset = {
  assetId: string;
  originalSrc: string;
  filename: string;
  content: Buffer;
};
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
type VoiceModelCatalogRecord = {
  id: string;
  sizeBytes?: number;
  downloadUrl: string;
  vadDownloadUrl: string;
  checksumSha256?: string | null;
};
type DownloadProgressCallback = (
  downloadedBytes: number,
  totalBytes: number | null,
) => void;
type ProjectShellSessionStartResult = {
  sessionId: string;
  cwd: string;
  shell: string;
  title: string;
  localEcho: boolean;
  tty: boolean;
  pid: number | null;
};
type ProjectShellSessionEvent =
  | {
      type: "data";
      sessionId: string;
      stream: "stdout" | "stderr";
      data: string;
    }
  | {
      type: "exit";
      sessionId: string;
      exitCode: number | null;
      signal: string | null;
    }
  | {
      type: "error";
      sessionId: string;
      message: string;
    };
type ProjectShellSessionDrainEventsResponse = {
  events: ProjectShellSessionEvent[];
};
type OpenFilePreviewWindowResult = {
  opened: true;
  reused: boolean;
  url: string;
  title: string;
};

const CONFIG_FILE = "config.json";
const LAYERED_DESIGN_EXPORT_ROOT = ".lime/layered-designs";
const MAX_LAYERED_DESIGN_EXPORT_FILES = 512;
const MAX_REMOTE_LAYERED_DESIGN_ASSET_BYTES = 10 * 1024 * 1024;
const REMOTE_LAYERED_DESIGN_ASSET_TIMEOUT_MS = 8000;
const SENSEVOICE_MODEL_ID = "sensevoice-small-int8-2024-07-17";
const SILERO_VAD_MODEL_ID = "silero-vad-onnx";
const VOICE_MODEL_ARCHIVE_DOWNLOAD_PATH =
  "voice/sensevoice-small-int8-2024-07-17/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2";
const VOICE_MODEL_ARCHIVE_FILE =
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2";
const VOICE_MODEL_VAD_DOWNLOAD_PATH = "voice/silero-vad-onnx/silero_vad.onnx";
const DEFAULT_VOICE_MODEL_ASSET_BASE_URL =
  "https://pub-fa568bd8496349bcafe04091e2b02e1e.r2.dev";
const DEFAULT_VOICE_MODEL_BYTES = 163_002_883;
const DEFAULT_VOICE_MODEL_ARCHIVE_SHA256 =
  "7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e";
const VOICE_MODEL_ONNX_FILE = "model.int8.onnx";
const VOICE_MODEL_TOKENS_FILE = "tokens.txt";
const VOICE_MODEL_VAD_FILE = "silero_vad.onnx";
const VOICE_MODEL_MANIFEST_FILE = "lime-model.json";
const VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT = "voice-model-download-progress";
const RESERVED_SHORTCUT_REASON =
  "快捷键与系统输入法切换冲突，请换成包含字母或数字的组合，例如 CommandOrControl+Shift+V";
const RESERVED_SHORTCUTS = [
  ["commandorcontrol", "space"],
  ["control", "space"],
  ["command", "space"],
  ["super", "space"],
  ["alt", "space"],
  ["shift", "space"],
  ["control", "alt", "space"],
  ["commandorcontrol", "alt", "space"],
] as const;
const MODIFIER_TOKENS = new Set([
  "commandorcontrol",
  "command",
  "control",
  "alt",
  "shift",
  "super",
]);
const SPECIAL_SHORTCUT_KEYS = new Set([
  "space",
  "tab",
  "enter",
  "return",
  "escape",
  "esc",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
]);
const OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_EVENT = "oem-cloud-oauth-callback";
const PROJECT_SHELL_SESSION_EVENT = "project-shell-session-event";
const PROJECT_SHELL_EVENT_POLL_INTERVAL_MS = 80;
const PROJECT_SHELL_EVENT_DRAIN_LIMIT = 200;
const OEM_CLOUD_OAUTH_CALLBACK_PATH = "/oauth/callback";
const OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_TTL_MS = 10 * 60 * 1000;
const OEM_CLOUD_OAUTH_CALLBACK_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lime 登录回调</title>
    <script>
      (function () {
        if (window.location.hash && window.location.hash.length > 1) {
          var params = new URLSearchParams(window.location.hash.slice(1));
          var search = new URLSearchParams(window.location.search);
          params.forEach(function (value, key) {
            if (!search.has(key)) search.set(key, value);
          });
          window.location.replace(window.location.pathname + "?" + search.toString());
        }
      })();
    </script>
  </head>
  <body>
    <p>Lime 登录结果已返回，可以关闭此页面。</p>
  </body>
</html>`;

export class ElectronHostCommands {
  readonly #appServerHost: ElectronAppServerHost;
  readonly #userDataDir: string;
  readonly #emit: HostEventEmitter;
  readonly #projectShellSessions = new Set<string>();
  #projectShellEventPoller: ReturnType<typeof setInterval> | null = null;
  #projectShellEventDrainInFlight = false;
  #oauthCallbackBridgeServer: Server | null = null;
  #oauthCallbackBridgeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    appServerHost: ElectronAppServerHost,
    userDataDir = app.getPath("userData"),
    emit: HostEventEmitter = () => undefined,
  ) {
    this.#appServerHost = appServerHost;
    this.#userDataDir = userDataDir;
    this.#emit = emit;
  }

  async invoke(command: string, args?: HostArgs): Promise<unknown> {
    switch (command) {
      case "get_config":
        return await this.#readConfig();
      case "save_config":
        return await this.#saveConfig(args);
      case "get_experimental_config":
        return await this.#getExperimentalConfig();
      case "save_experimental_config":
        return await this.#saveExperimentalConfig(args);
      case "open_external_url":
        return await this.#openExternalUrl(args);
      case "open_file_preview_window":
        return await this.#openFilePreviewWindow(args);
      case "open_system_settings_url":
        return await this.#openSystemSettingsUrl(args);
      case "reveal_in_finder":
        return this.#revealInFinder(args);
      case "open_with_default_app":
        return await this.#openWithDefaultApp(args);
      case "open_project_path_with_tool":
        return await this.#openProjectPathWithTool(args);
      case "run_project_shell_command":
        return await this.#runProjectShellCommand(args);
      case "project_shell_session_start":
        return await this.#startProjectShellSession(args);
      case "project_shell_session_write":
        return await this.#writeProjectShellSession(args);
      case "project_shell_session_resize":
        return await this.#resizeProjectShellSession(args);
      case "project_shell_session_kill":
        return await this.#killProjectShellSession(args);
      case "save_exported_document":
        return await this.#saveExportedDocument(args);
      case "save_layered_design_project_export":
        return await this.#saveLayeredDesignProjectExport(args);
      case "read_layered_design_project_export":
        return await this.#readLayeredDesignProjectExport(args);
      case "recognize_layered_design_text":
        return this.#recognizeLayeredDesignText(args);
      case "analyze_layered_design_flat_image":
        return this.#analyzeLayeredDesignFlatImage(args);
      case "get_home_dir":
        return this.#getHomeDir();
      case "get_file_manager_locations":
        return await this.#getFileManagerLocations();
      case "get_file_icon_data_url":
        return await this.#getFileIconDataUrl(args);
      case "start_oem_cloud_oauth_callback_bridge":
        return await this.#startOemCloudOAuthCallbackBridge();
      case "aster_agent_init":
        return await this.#initAgentRuntime();
      case "get_default_provider":
        return await this.#getDefaultProvider();
      case "workspace_list":
        return await this.#listWorkspaces();
      case "workspace_get_default":
        return await this.#readDefaultWorkspace();
      case "get_or_create_default_project":
        return await this.#ensureDefaultWorkspace();
      case "workspace_get":
        return await this.#readWorkspace(args);
      case "workspace_get_by_path":
        return await this.#readWorkspaceByPath(args);
      case "workspace_ensure":
        return await this.#ensureWorkspace(args);
      case "workspace_get_projects_root":
        return await this.#readWorkspaceProjectsRoot();
      case "workspace_resolve_project_path":
        return await this.#resolveWorkspaceProjectPath(args);
      case "workspace_ensure_default_ready":
        return await this.#ensureDefaultWorkspaceReady();
      case "workspace_ensure_ready":
        return await this.#ensureWorkspaceReady(args);
      case "get_local_skills_for_app":
        return await this.#listLocalSkillsForApp(args);
      case "get_voice_shortcut_runtime_status":
        return await this.#getVoiceShortcutRuntimeStatus();
      case "validate_shortcut":
        return this.#validateShortcut(args);
      case "voice_models_list_catalog":
        return this.#listVoiceModelCatalog();
      case "voice_models_get_install_state":
        return await this.#getVoiceModelInstallState(args);
      case "voice_models_download":
        return await this.#downloadVoiceModel(args);
      case "voice_models_delete":
        return await this.#deleteVoiceModel(args);
      case "get_environment_preview":
        return await this.#getEnvironmentPreview();
      case "get_skill_package_file_association_status":
        return this.#getSkillPackageFileAssociationStatus();
      case "set_skill_package_file_association_default":
        return this.#setSkillPackageFileAssociationDefault();
      case "get_browser_connector_settings_cmd":
        return this.#getBrowserConnectorSettings();
      case "get_browser_connector_install_status_cmd":
        return this.#getBrowserConnectorInstallStatus();
      case "get_chrome_profile_sessions":
        return this.#emptyDiagnosticList("get_chrome_profile_sessions");
      case "get_chrome_bridge_endpoint_info":
        return this.#getChromeBridgeEndpointInfo();
      case "get_chrome_bridge_status":
        return this.#getChromeBridgeStatus();
      case "get_browser_backend_policy":
        return this.#getBrowserBackendPolicy();
      case "get_browser_backends_status":
        return this.#getBrowserBackendsStatus();
      case "agent_app_select_directory":
        return await this.#selectAgentAppDirectory(args);
      case "agent_app_launch_shell":
        return await this.#launchAgentAppShell(args);
      case "agent_app_start_ui_runtime":
        return await this.#startAgentAppUiRuntime(args);
      case "agent_app_get_ui_runtime_status":
        return await this.#getAgentAppUiRuntimeStatus(args);
      case "agent_app_stop_ui_runtime":
        return await this.#stopAgentAppUiRuntime(args);
      case "agent_app_runtime_start_task":
        return await this.#startAgentAppRuntimeTask(args);
      case "agent_app_runtime_get_task":
        return await this.#getAgentAppRuntimeTask(args);
      case "agent_app_runtime_cancel_task":
        return await this.#cancelAgentAppRuntimeTask(args);
      case "agent_app_runtime_submit_host_response":
        return await this.#submitAgentAppRuntimeHostResponse(args);
      case "report_frontend_debug_log":
        this.#reportFrontendDebugLog(args);
        return null;
      case "report_frontend_crash":
        this.#reportFrontendCrash(args);
        return { success: true };
      default:
        throw new Error(`Electron host command is not implemented: ${command}`);
    }
  }

  async #appServerRequest<T>(
    method: string,
    params: AppServerParams = {},
  ): Promise<T> {
    return await this.#appServerHost.request<T>(method, params);
  }

  async #openExternalUrl(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    const url = readRequiredString(request, "url");
    const normalizedUrl = normalizeExternalUrl(url);
    await shell.openExternal(normalizedUrl);
    return {};
  }

  async #openSystemSettingsUrl(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    const url = readRequiredString(request, "url");
    const normalizedUrl = normalizeSystemSettingsUrl(url);
    await shell.openExternal(normalizedUrl);
    return {};
  }

  async #openFilePreviewWindow(
    args: HostArgs,
  ): Promise<OpenFilePreviewWindowResult> {
    const request = readRequest(args);
    const targetPath = readRequiredAbsolutePath(request, "path");
    const requestedTitle = readString(request, "title");
    const title = requestedTitle || path.basename(targetPath) || targetPath;
    const url = pathToFileURL(targetPath).toString();
    return openFilePreviewBrowserWindow(url, title);
  }

  #revealInFinder(args: HostArgs): Record<string, never> {
    const request = readRequest(args);
    const targetPath = readRequiredString(request, "path");
    shell.showItemInFolder(targetPath);
    return {};
  }

  async #openWithDefaultApp(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    const targetPath = readRequiredString(request, "path");
    const errorMessage = await shell.openPath(targetPath);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    return {};
  }

  async #openProjectPathWithTool(
    args: HostArgs,
  ): Promise<Record<string, never>> {
    const request = readRequest(args);
    const rootPath = readRequiredAbsolutePath(request, "rootPath");
    const tool = readProjectPathOpenTool(request);
    if (tool === "finder") {
      const errorMessage = await shell.openPath(rootPath);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
      return {};
    }
    await openProjectPathWithLocalTool(rootPath, tool);
    return {};
  }

  async #runProjectShellCommand(
    args: HostArgs,
  ): Promise<Awaited<ReturnType<typeof runProjectShellCommand>>> {
    const request = readRequest(args);
    const rootPath = readRequiredAbsolutePath(request, "rootPath");
    const command = readRequiredRawString(request, "command").trim();
    if (!command) {
      throw new Error("Shell 命令不能为空");
    }
    return await runProjectShellCommand({
      cwd: rootPath,
      command,
      timeoutMs: normalizeProjectShellTimeout(readNumber(request, "timeoutMs")),
    });
  }

  async #startProjectShellSession(
    args: HostArgs,
  ): Promise<ProjectShellSessionStartResult> {
    const request = readRequest(args);
    const response =
      await this.#appServerRequest<ProjectShellSessionStartResult>(
        METHOD_PROJECT_SHELL_SESSION_START,
        {
          rootPath: readRequiredAbsolutePath(request, "rootPath"),
          cols: readNumber(request, "cols") ?? 120,
          rows: readNumber(request, "rows") ?? 16,
        },
      );
    this.#projectShellSessions.add(response.sessionId);
    this.#ensureProjectShellEventPoller();
    void this.#drainProjectShellEvents();
    return response;
  }

  async #writeProjectShellSession(
    args: HostArgs,
  ): Promise<Record<string, never>> {
    const request = readRequest(args);
    await this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_WRITE, {
      sessionId: readRequiredString(request, "sessionId"),
      data: readRequiredRawString(request, "data"),
    });
    void this.#drainProjectShellEvents();
    setTimeout(() => {
      void this.#drainProjectShellEvents();
    }, 30);
    setTimeout(() => {
      void this.#drainProjectShellEvents();
    }, 120);
    return {};
  }

  async #resizeProjectShellSession(
    args: HostArgs,
  ): Promise<Record<string, never>> {
    const request = readRequest(args);
    await this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_RESIZE, {
      sessionId: readRequiredString(request, "sessionId"),
      cols: readNumber(request, "cols") ?? 120,
      rows: readNumber(request, "rows") ?? 16,
    });
    return {};
  }

  async #killProjectShellSession(
    args: HostArgs,
  ): Promise<Record<string, never>> {
    const request = readRequest(args);
    const sessionId = readRequiredString(request, "sessionId");
    await this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_KILL, {
      sessionId,
    });
    this.#projectShellSessions.delete(sessionId);
    this.#stopProjectShellEventPollerIfIdle();
    return {};
  }

  #ensureProjectShellEventPoller(): void {
    if (this.#projectShellEventPoller) {
      return;
    }
    this.#projectShellEventPoller = setInterval(() => {
      void this.#drainProjectShellEvents();
    }, PROJECT_SHELL_EVENT_POLL_INTERVAL_MS);
  }

  #stopProjectShellEventPollerIfIdle(): void {
    if (this.#projectShellSessions.size > 0 || !this.#projectShellEventPoller) {
      return;
    }
    clearInterval(this.#projectShellEventPoller);
    this.#projectShellEventPoller = null;
  }

  async #drainProjectShellEvents(): Promise<void> {
    if (this.#projectShellEventDrainInFlight) {
      return;
    }
    if (this.#projectShellSessions.size === 0) {
      this.#stopProjectShellEventPollerIfIdle();
      return;
    }
    this.#projectShellEventDrainInFlight = true;
    try {
      for (const sessionId of Array.from(this.#projectShellSessions)) {
        const response =
          await this.#appServerRequest<ProjectShellSessionDrainEventsResponse>(
            METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
            { sessionId, limit: PROJECT_SHELL_EVENT_DRAIN_LIMIT },
          );
        for (const event of response.events ?? []) {
          if (event.type === "exit" || event.type === "error") {
            this.#projectShellSessions.delete(event.sessionId);
          }
          this.#emit(PROJECT_SHELL_SESSION_EVENT, event);
        }
      }
    } catch (error) {
      console.warn("[electron-host] project shell event drain failed", error);
    } finally {
      this.#projectShellEventDrainInFlight = false;
      this.#stopProjectShellEventPollerIfIdle();
    }
  }

  async #saveExportedDocument(args: HostArgs): Promise<null> {
    const request = readRequest(args);
    const targetPath = readRequiredString(request, "filePath");
    const content = readRequiredRawString(request, "content");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf8");
    return null;
  }

  async #saveLayeredDesignProjectExport(
    args: HostArgs,
  ): Promise<SaveLayeredDesignProjectExportOutput> {
    const request = readRequest(args);
    const projectRootPath = readRequiredAbsolutePath(
      request,
      "projectRootPath",
    );
    const documentId = readRequiredString(request, "documentId");
    const title = readString(request, "title") ?? documentId;
    const files = readLayeredDesignExportFiles(request);
    if (files.length === 0) {
      throw new Error("图层设计工程导出文件不能为空");
    }
    if (files.length > MAX_LAYERED_DESIGN_EXPORT_FILES) {
      throw new Error(
        `图层设计工程导出文件数量超出限制: ${MAX_LAYERED_DESIGN_EXPORT_FILES}`,
      );
    }
    const exportFilePaths = new Set(
      files.map((file) =>
        normalizeLayeredDesignRelativePath(file.relativePath).join("/"),
      ),
    );
    if (!exportFilePaths.has("design.json")) {
      throw new Error(`图层设计工程 ${documentId} 缺少 design.json 导出文件`);
    }
    if (!exportFilePaths.has("export-manifest.json")) {
      throw new Error(
        `图层设计工程 ${documentId} 缺少 export-manifest.json 导出文件`,
      );
    }

    const directoryName = sanitizeLayeredDesignDirectoryName(
      readString(request, "directoryName") ?? title,
      sanitizeLayeredDesignDirectoryName(documentId, "layered-design"),
    );
    const exportDirectoryRelativePath = `${LAYERED_DESIGN_EXPORT_ROOT}/${directoryName}`;
    const exportDirectoryPath = path.join(
      projectRootPath,
      ...exportDirectoryRelativePath.split("/"),
    );
    await mkdir(exportDirectoryPath, { recursive: true });

    const preparedFiles = await prepareLayeredDesignExportFiles(files);
    let designPath = path.join(exportDirectoryPath, "design.json");
    let manifestPath = path.join(exportDirectoryPath, "export-manifest.json");
    let previewPngPath: string | undefined;
    let bytesWritten = 0;

    for (const file of preparedFiles.files) {
      const relativePath = file.relativePath;
      const targetPath = path.join(exportDirectoryPath, ...relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content);
      bytesWritten += file.content.byteLength;
      const normalizedPath = relativePath.join("/");
      if (normalizedPath === "design.json") {
        designPath = targetPath;
      }
      if (normalizedPath === "export-manifest.json") {
        manifestPath = targetPath;
      }
      if (normalizedPath === "preview.png") {
        previewPngPath = targetPath;
      }
    }

    for (const asset of preparedFiles.cachedRemoteAssets) {
      const relativePath = normalizeLayeredDesignRelativePath(asset.filename);
      const targetPath = path.join(exportDirectoryPath, ...relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, asset.content);
      bytesWritten += asset.content.byteLength;
    }

    const assetsPath = path.join(exportDirectoryPath, "assets");
    const cachedRemoteAssetCount = preparedFiles.cachedRemoteAssets.length;
    return {
      projectRootPath,
      exportDirectoryPath,
      exportDirectoryRelativePath,
      designPath,
      manifestPath,
      previewPngPath,
      assetCount: await countFilesRecursive(assetsPath),
      fileCount: await countFilesRecursive(exportDirectoryPath),
      bytesWritten,
      remoteReferenceAssetCount: preparedFiles.remoteReferenceAssetCount,
      cachedRemoteAssetCount,
      uncachedRemoteAssetCount:
        preparedFiles.remoteReferenceAssetCount - cachedRemoteAssetCount,
    };
  }

  async #readLayeredDesignProjectExport(
    args: HostArgs,
  ): Promise<ReadLayeredDesignProjectExportOutput> {
    const request = readRequest(args);
    const projectRootPath = readRequiredAbsolutePath(
      request,
      "projectRootPath",
    );
    const { exportDirectoryPath, exportDirectoryRelativePath } =
      await resolveLayeredDesignExportDirectory(projectRootPath, request);
    const designPath = path.join(exportDirectoryPath, "design.json");
    const manifestPath = path.join(exportDirectoryPath, "export-manifest.json");
    const psdLikeManifestPath = path.join(
      exportDirectoryPath,
      "psd-like-manifest.json",
    );
    const previewPngPath = path.join(exportDirectoryPath, "preview.png");
    const assetsPath = path.join(exportDirectoryPath, "assets");
    const designStats = await stat(designPath);
    const manifestJson = await readOptionalUtf8File(manifestPath);
    const designJson = await hydrateLayeredDesignJsonWithCachedAssets(
      exportDirectoryPath,
      await readFile(designPath, "utf8"),
      manifestJson,
    );
    const psdLikeManifestJson = await readOptionalUtf8File(psdLikeManifestPath);

    return {
      projectRootPath,
      exportDirectoryPath,
      exportDirectoryRelativePath,
      designPath,
      designJson,
      manifestPath: manifestJson === undefined ? undefined : manifestPath,
      manifestJson,
      psdLikeManifestPath:
        psdLikeManifestJson === undefined ? undefined : psdLikeManifestPath,
      psdLikeManifestJson,
      previewPngPath: (await isFile(previewPngPath))
        ? previewPngPath
        : undefined,
      assetCount: await countFilesRecursive(assetsPath),
      fileCount: await countFilesRecursive(exportDirectoryPath),
      updatedAtMs: Math.floor(designStats.mtimeMs),
    };
  }

  #recognizeLayeredDesignText(args: HostArgs): {
    supported: false;
    engine: string;
    blocks: [];
    message: string;
  } {
    const request = readRequest(args);
    assertPositiveNumber(request, "width", "OCR 图片宽度必须大于 0");
    assertPositiveNumber(request, "height", "OCR 图片高度必须大于 0");
    readRequiredRawString(request, "imageSrc");
    return {
      supported: false,
      engine: "electron_host_unsupported",
      blocks: [],
      message: "Electron Host 尚未接入 native OCR provider",
    };
  }

  #analyzeLayeredDesignFlatImage(args: HostArgs): {
    supported: false;
    engine: string;
    message: string;
  } {
    const request = readRequest(args);
    const image = readRecord(request, "image");
    if (!image) {
      throw new Error("analyze_layered_design_flat_image requires image");
    }
    readRequiredRawString(image, "src");
    assertPositiveNumber(image, "width", "Analyzer 图片宽度必须大于 0");
    assertPositiveNumber(image, "height", "Analyzer 图片高度必须大于 0");
    return {
      supported: false,
      engine: "electron_host_unsupported",
      message: "Electron Host 尚未接入 native structured analyzer provider",
    };
  }

  async #getFileIconDataUrl(args: HostArgs): Promise<string | null> {
    const request = readRequest(args);
    const targetPath = readRequiredString(request, "path");
    try {
      const icon = await app.getFileIcon(targetPath, { size: "normal" });
      if (icon.isEmpty()) {
        return null;
      }
      return icon.toDataURL() || null;
    } catch {
      return null;
    }
  }

  #getHomeDir(): string {
    const homePath = readElectronPath("home");
    if (!homePath) {
      throw new Error("无法获取主目录");
    }
    return homePath;
  }

  async #getFileManagerLocations(): Promise<FileManagerLocation[]> {
    const locations: FileManagerLocation[] = [];
    const seenPaths = new Set<string>();
    const homePath = readElectronPath("home");

    await appendFileManagerLocation(locations, seenPaths, {
      id: "home",
      label: "个人",
      kind: "home",
      path: homePath,
    });
    await appendFileManagerLocation(locations, seenPaths, {
      id: "desktop",
      label: "桌面",
      kind: "desktop",
      path: readElectronPath("desktop"),
    });
    await appendFileManagerLocation(locations, seenPaths, {
      id: "documents",
      label: "文档",
      kind: "documents",
      path: readElectronPath("documents"),
    });
    await appendFileManagerLocation(locations, seenPaths, {
      id: "downloads",
      label: "下载",
      kind: "downloads",
      path: readElectronPath("downloads"),
    });

    if (process.platform === "darwin") {
      await appendFileManagerLocation(locations, seenPaths, {
        id: "applications",
        label: "应用程序",
        kind: "applications",
        path: "/Applications",
      });
      await appendFileManagerLocation(locations, seenPaths, {
        id: "user-applications",
        label: "用户应用程序",
        kind: "applications",
        path: homePath ? path.join(homePath, "Applications") : null,
      });
    }

    if (process.platform === "win32") {
      await appendFileManagerLocation(locations, seenPaths, {
        id: "start-menu-programs",
        label: "应用程序",
        kind: "applications",
        path: process.env.APPDATA
          ? path.join(
              process.env.APPDATA,
              "Microsoft",
              "Windows",
              "Start Menu",
              "Programs",
            )
          : null,
      });
      await appendFileManagerLocation(locations, seenPaths, {
        id: "common-start-menu-programs",
        label: "公共应用程序",
        kind: "applications",
        path: process.env.PROGRAMDATA
          ? path.join(
              process.env.PROGRAMDATA,
              "Microsoft",
              "Windows",
              "Start Menu",
              "Programs",
            )
          : null,
      });
      await appendFileManagerLocation(locations, seenPaths, {
        id: "program-files",
        label: "Program Files",
        kind: "applications",
        path: process.env.ProgramFiles || null,
      });
      await appendFileManagerLocation(locations, seenPaths, {
        id: "program-files-x86",
        label: "Program Files (x86)",
        kind: "applications",
        path: process.env["ProgramFiles(x86)"] || null,
      });
    }

    return locations;
  }

  async #startOemCloudOAuthCallbackBridge(): Promise<{
    callbackUrl: string;
  }> {
    await this.#closeOemCloudOAuthCallbackBridge();

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== OEM_CLOUD_OAUTH_CALLBACK_PATH) {
        response.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Not found");
        return;
      }

      const payload = buildOemCloudOAuthCallbackPayload(requestUrl);
      if (shouldEmitOemCloudOAuthCallback(payload)) {
        this.#emit(OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_EVENT, payload);
        void this.#closeOemCloudOAuthCallbackBridge();
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(OEM_CLOUD_OAUTH_CALLBACK_HTML);
    });

    server.on("error", (error) => {
      console.warn(
        `[OAuthCallbackBridge] OAuth 本地回调桥运行失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("无法读取 OAuth 本地回调地址");
    }

    this.#oauthCallbackBridgeServer = server;
    this.#oauthCallbackBridgeTimer = setTimeout(() => {
      void this.#closeOemCloudOAuthCallbackBridge();
    }, OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_TTL_MS);

    return {
      callbackUrl: `http://127.0.0.1:${address.port}${OEM_CLOUD_OAUTH_CALLBACK_PATH}`,
    };
  }

  async #closeOemCloudOAuthCallbackBridge(): Promise<void> {
    if (this.#oauthCallbackBridgeTimer) {
      clearTimeout(this.#oauthCallbackBridgeTimer);
      this.#oauthCallbackBridgeTimer = null;
    }
    const server = this.#oauthCallbackBridgeServer;
    this.#oauthCallbackBridgeServer = null;
    if (!server || !server.listening) {
      return;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  #diagnosticMeta(command: string): Record<string, unknown> {
    return {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
      appServerCurrent: false,
    };
  }

  #emptyDiagnosticList(command: string): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    Object.defineProperty(result, "__diagnostic", {
      value: this.#diagnosticMeta(command),
      enumerable: false,
    });
    return result;
  }

  async #selectAgentAppDirectory(
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

  async #launchAgentAppShell(
    args: HostArgs,
  ): Promise<AgentAppShellLaunchResult> {
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
    const runtimeStatus = await this.#startAgentAppUiRuntime({
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

  async #startAgentAppUiRuntime(
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

  async #getAgentAppUiRuntimeStatus(
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

  async #stopAgentAppUiRuntime(
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

  async #startAgentAppRuntimeTask(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskKind = readRequiredString(request, "taskKind");
    const workspaceId = readRequiredString(request, "workspaceId");
    const nowMs = Date.now();
    const taskId = readString(request, "taskId") ?? `agent-app-task-${nowMs}`;
    const traceId = `agent-app-trace-${nowMs}`;
    const sessionId =
      readString(request, "sessionId") ?? `agent-app-runtime-${nowMs}`;
    const turnId = readString(request, "turnId") ?? `agent-app-turn-${nowMs}`;
    const eventName =
      readString(request, "eventName") ??
      `agent_app_runtime:${appId}:${taskId}`;
    const queueIfBusy = readBoolean(request, "queueIfBusy") ?? true;
    const skipPreSubmitResume =
      readBoolean(request, "skipPreSubmitResume") ?? false;
    const requestedPackageRootPath =
      readString(request, "packageRootPath") ??
      readString(request, "runtimePackageRoot") ??
      readString(request, "appRootPath") ??
      undefined;
    const explicitRunWorker = readBoolean(request, "runWorker");
    const turnConfig =
      readRecord(request, "turnConfig") ??
      readRecord(request, "turn_config") ??
      {};
    const metadata = {
      ...(readRecord(request, "metadata") ?? {}),
      ...(readRecord(turnConfig, "metadata") ?? {}),
    };
    const message = buildAgentAppRuntimeTaskMessage(request);
    const providerPreference =
      readString(request, "providerPreference") ??
      readString(request, "provider_preference") ??
      readString(turnConfig, "providerPreference") ??
      readString(turnConfig, "provider_preference");
    const modelPreference =
      readString(request, "modelPreference") ??
      readString(request, "model_preference") ??
      readString(turnConfig, "modelPreference") ??
      readString(turnConfig, "model_preference");
    const queuedTurnId = `agent-app-queued-${taskId}`;
    const hostOptions = {
      asterChatRequest: {
        message,
        session_id: sessionId,
        event_name: eventName,
        images: null,
        provider_config:
          turnConfig.providerConfig ?? turnConfig.provider_config ?? null,
        provider_preference: providerPreference,
        model_preference: modelPreference,
        reasoning_effort:
          turnConfig.reasoningEffort ?? turnConfig.reasoning_effort ?? null,
        thinking_enabled:
          turnConfig.thinkingEnabled ?? turnConfig.thinking_enabled ?? null,
        approval_policy:
          turnConfig.approvalPolicy ?? turnConfig.approval_policy ?? null,
        sandbox_policy:
          turnConfig.sandboxPolicy ?? turnConfig.sandbox_policy ?? null,
        project_id: null,
        workspace_id: workspaceId,
        web_search: turnConfig.webSearch ?? turnConfig.web_search ?? null,
        search_mode: turnConfig.searchMode ?? turnConfig.search_mode ?? null,
        execution_strategy:
          turnConfig.executionStrategy ?? turnConfig.execution_strategy ?? null,
        auto_continue:
          turnConfig.autoContinue ?? turnConfig.auto_continue ?? null,
        system_prompt:
          turnConfig.systemPrompt ?? turnConfig.system_prompt ?? null,
        metadata,
        turn_id: turnId,
        queue_if_busy: queueIfBusy,
        queued_turn_id: queuedTurnId,
        turn_config: turnConfig,
      },
    };
    const workerConfig = await this.#resolveAgentAppRuntimeWorkerConfig({
      appId,
      taskKind,
      requestedPackageRootPath,
      requireWorker: explicitRunWorker === true,
      skipWorker: explicitRunWorker === false,
    });
    const shouldRunWorker = Boolean(workerConfig);

    await this.#ensureAgentAppRuntimeSession({ sessionId, appId, workspaceId });
    await this.#appServerRequest<AgentSessionTurnStartResponse>(
      METHOD_AGENT_SESSION_TURN_START,
      {
        sessionId,
        turnId,
        input: {
          text: message,
          attachments: [],
        },
        runtimeOptions: {
          stream: true,
          eventName,
          providerPreference: providerPreference ?? undefined,
          modelPreference: modelPreference ?? undefined,
          metadata,
          queuedTurnId,
          hostOptions,
        },
        queueIfBusy,
        skipPreSubmitResume,
      },
    );
    const worker = shouldRunWorker
      ? await this.#runAndAppendAgentAppRuntimeWorker({
          appId,
          taskId,
          taskKind,
          sessionId,
          turnId,
          packageRootPath: workerConfig?.packageRootPath,
          workerEntrypoint: workerConfig?.workerEntrypoint ?? null,
          request,
        })
      : {
          status: "skipped",
          reason: "package_root_missing",
        };

    return {
      appId,
      entryKey: readString(request, "entryKey") ?? undefined,
      taskId,
      traceId,
      taskKind,
      sessionId,
      turnId,
      eventName,
      status: "accepted",
      worker,
      submittedAt: new Date().toISOString(),
    };
  }

  async #resolveAgentAppRuntimeWorkerConfig(params: {
    appId: string;
    taskKind: string;
    requestedPackageRootPath?: string;
    requireWorker: boolean;
    skipWorker: boolean;
  }): Promise<{
    packageRootPath: string;
    workerEntrypoint: string;
  } | null> {
    if (params.skipWorker) {
      return null;
    }
    const status = await this.#appServerRequest<AgentAppUiRuntimeStatusResponse>(
      METHOD_AGENT_APP_UI_RUNTIME_STATUS,
      { appId: params.appId },
    );
    const taskRuntime = status.taskRuntime;
    if (!taskRuntime?.enabled) {
      if (params.requireWorker || params.requestedPackageRootPath) {
        throw new Error(`Agent App ${params.appId} task runtime is not enabled`);
      }
      return null;
    }
    const taskKinds = Array.isArray(taskRuntime.taskKinds)
      ? taskRuntime.taskKinds
      : [];
    const shouldRunForTaskKind =
      params.requireWorker ||
      Boolean(params.requestedPackageRootPath) ||
      taskKinds.includes(params.taskKind);
    if (!shouldRunForTaskKind) {
      return null;
    }
    const blockers = taskRuntime.blockers ?? [];
    if (blockers.length > 0) {
      throw new Error(
        `Agent App ${params.appId} task runtime is blocked: ${blockers.join(", ")}`,
      );
    }
    const workerEntrypoint = taskRuntime.workerEntrypoint?.trim();
    if (!workerEntrypoint) {
      throw new Error(
        `Agent App ${params.appId} task runtime has no worker entrypoint`,
      );
    }
    const packageRootPath =
      params.requestedPackageRootPath ?? taskRuntime.packageRootPath?.trim();
    if (!packageRootPath) {
      throw new Error(
        `Agent App ${params.appId} task runtime has no package root path`,
      );
    }
    return {
      packageRootPath,
      workerEntrypoint,
    };
  }

  async #runAndAppendAgentAppRuntimeWorker(params: {
    appId: string;
    taskId: string;
    taskKind: string;
    sessionId: string;
    turnId: string;
    packageRootPath?: string;
    workerEntrypoint: string | null;
    request: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (!params.packageRootPath) {
      throw new Error("Agent App task worker requires packageRootPath");
    }
    if (!params.workerEntrypoint) {
      throw new Error("Agent App task worker requires workerEntrypoint");
    }
    const workerRequest = {
      appId: params.appId,
      taskId: params.taskId,
      taskKind: params.taskKind,
      sessionId: params.sessionId,
      turnId: params.turnId,
      packageRootPath: params.packageRootPath,
      workerEntrypoint: params.workerEntrypoint,
      input: params.request.input,
      prompt: readString(params.request, "prompt") ?? undefined,
      title: readString(params.request, "title") ?? undefined,
      metadata: params.request.metadata,
      timeoutMs: readNumber(params.request, "workerTimeoutMs") ?? undefined,
    };
    const workerResult = await runAgentAppTaskWorker(workerRequest).catch(
      (error) => buildAgentAppTaskWorkerFailureResult(workerRequest, error),
    );
    const appended =
      await this.#appServerRequest<AgentSessionRuntimeEventAppendResponse>(
        METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
        {
          sessionId: params.sessionId,
          turnId: params.turnId,
          runtimeEvents: workerResult.runtimeEvents,
        },
      );
    return {
      status: workerResult.status,
      artifactKind:
        workerResult.status === "completed" ? workerResult.artifactKind : undefined,
      errorCode:
        workerResult.status === "failed" ? workerResult.errorCode : undefined,
      errorMessage:
        workerResult.status === "failed" ? workerResult.errorMessage : undefined,
      runtimeEventCount: workerResult.runtimeEvents.length,
      appendedEventCount: appended.events?.length ?? 0,
    };
  }

  async #getAgentAppRuntimeTask(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const sessionId = readRequiredString(request, "sessionId");
    const response = await this.#appServerRequest<AgentSessionReadResponse>(
      METHOD_AGENT_SESSION_READ,
      { sessionId },
    );
    return {
      appId,
      taskId,
      sessionId,
      status: "thread_read_available",
      taskStatus: sessionStatusToAgentAppTaskStatus(response.session.status),
      taskEvents: [],
      threadRead: response.detail ?? sessionReadToLegacy(response),
    };
  }

  async #cancelAgentAppRuntimeTask(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const sessionId = readRequiredString(request, "sessionId");
    let turnId = readString(request, "turnId");
    if (!turnId) {
      const response = await this.#appServerRequest<AgentSessionReadResponse>(
        METHOD_AGENT_SESSION_READ,
        { sessionId },
      );
      turnId = activeAgentSessionTurnId(response);
    }
    if (!turnId) {
      return {
        appId,
        taskId,
        sessionId,
        cancelled: false,
        status: "not_running",
      };
    }
    await this.#appServerRequest<AgentSessionTurnCancelResponse>(
      METHOD_AGENT_SESSION_TURN_CANCEL,
      { sessionId, turnId },
    );
    return {
      appId,
      taskId,
      sessionId,
      cancelled: true,
      status: "cancelled",
    };
  }

  async #submitAgentAppRuntimeHostResponse(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const runtimeRequest = readRecord(request, "runtimeRequest") ?? {};
    const sessionId =
      readString(runtimeRequest, "sessionId") ??
      readRequiredString(runtimeRequest, "session_id");
    const requestId =
      readString(runtimeRequest, "requestId") ??
      readRequiredString(runtimeRequest, "request_id");
    const actionType =
      readString(runtimeRequest, "actionType") ??
      readString(runtimeRequest, "action_type") ??
      "tool_confirmation";
    await this.#appServerRequest<AgentSessionActionRespondResponse>(
      METHOD_AGENT_SESSION_ACTION_RESPOND,
      {
        sessionId,
        requestId,
        actionType,
        confirmed: readBoolean(runtimeRequest, "confirmed") ?? false,
        ...readStringParam(runtimeRequest, "response", "response"),
        userData: runtimeRequest.userData ?? runtimeRequest.user_data,
        metadata: runtimeRequest.metadata,
        ...readStringParam(runtimeRequest, "eventName", "eventName"),
        ...readStringParam(runtimeRequest, "event_name", "eventName"),
        actionScope: normalizeAgentSessionActionScope(
          runtimeRequest.actionScope ?? runtimeRequest.action_scope,
        ),
      },
    );
    return {
      appId,
      taskId,
      status: "submitted",
    };
  }

  async #ensureAgentAppRuntimeSession(params: {
    sessionId: string;
    appId: string;
    workspaceId: string;
  }): Promise<void> {
    try {
      await this.#appServerRequest<AgentSessionStartResponse>(
        METHOD_AGENT_SESSION_START,
        params,
      );
    } catch (error) {
      if (isAppServerSessionAlreadyExistsError(error)) {
        return;
      }
      throw error;
    }
  }

  async #initAgentRuntime(): Promise<{
    initialized: true;
    provider_configured: boolean;
    provider_name?: string;
    provider_selector?: string;
    model_name?: string;
  }> {
    const [config, providers, models] = await Promise.all([
      this.#readConfig().catch(() => buildDefaultConfig()),
      this.#listModelProviders().catch(() => []),
      this.#listModels().catch(() => []),
    ]);
    const defaultProvider = resolveCurrentDefaultProvider(
      config.default_provider,
      providers,
    );
    const configuredDefaultProvider = findProvider(providers, defaultProvider);
    const selectedProvider =
      (configuredDefaultProvider &&
      isConfiguredProvider(configuredDefaultProvider)
        ? configuredDefaultProvider
        : null) ??
      providers.find(isConfiguredProvider) ??
      configuredDefaultProvider;
    const selectedProviderId =
      readString(selectedProvider, "id")?.trim() ?? defaultProvider.trim();
    const normalizedSelectedProviderId =
      normalizeProviderIdentity(selectedProviderId);
    const selectedModel = selectedProviderId
      ? models.find((model) => {
          const providerId = normalizeProviderIdentity(
            readString(model, "provider_id") ?? readString(model, "providerId"),
          );
          return providerId === normalizedSelectedProviderId;
        })
      : undefined;
    const modelName =
      readString(selectedModel, "id") ??
      readString(selectedModel, "model_id") ??
      readString(selectedModel, "modelId");

    return {
      initialized: true,
      provider_configured: selectedProvider
        ? isConfiguredProvider(selectedProvider)
        : false,
      provider_name: readString(selectedProvider, "name") ?? selectedProviderId,
      provider_selector: selectedProviderId || undefined,
      model_name: modelName ?? undefined,
    };
  }

  async #getDefaultProvider(): Promise<string> {
    const [config, providers] = await Promise.all([
      this.#readConfig(),
      this.#listModelProviders(),
    ]);
    return resolveCurrentDefaultProvider(config.default_provider, providers);
  }

  async #getExperimentalConfig(): Promise<Record<string, unknown>> {
    const config = await this.#readConfig();
    return normalizeExperimentalConfig(config.experimental);
  }

  async #saveExperimentalConfig(args: HostArgs): Promise<null> {
    const request = readRequest(args);
    const experimentalConfig =
      readRecord(request, "experimentalConfig") ??
      readRecord(request, "experimental_config");
    if (!experimentalConfig) {
      throw new Error("save_experimental_config requires experimentalConfig");
    }
    const config = await this.#readConfig();
    return await this.#saveConfig({
      config: {
        ...config,
        experimental: normalizeExperimentalConfig(experimentalConfig),
      },
    });
  }

  async #listModelProviders(): Promise<unknown[]> {
    const response = await this.#appServerRequest<ModelProviderListResponse>(
      METHOD_MODEL_PROVIDER_LIST,
    );
    return response.providers ?? [];
  }

  async #listModels(params: AppServerParams = {}): Promise<unknown[]> {
    const response = await this.#appServerRequest<ModelListResponse>(
      METHOD_MODEL_LIST,
      params,
    );
    return response.models ?? [];
  }

  async #listWorkspaces(): Promise<unknown[]> {
    const response = await this.#appServerRequest<WorkspaceListResponse>(
      METHOD_WORKSPACE_LIST,
    );
    return response.workspaces;
  }

  async #readWorkspace(args: HostArgs): Promise<unknown | null> {
    const request = readRequest(args);
    const id = readString(request, "id") ?? readString(args, "id");
    if (!id) {
      return null;
    }
    const response = await this.#appServerRequest<WorkspaceReadResponse>(
      METHOD_WORKSPACE_READ,
      { id },
    );
    return response.workspace ?? null;
  }

  async #readWorkspaceByPath(args: HostArgs): Promise<unknown | null> {
    const request = readRequest(args);
    const rootPath =
      readString(request, "rootPath") ??
      readString(request, "root_path") ??
      readString(args, "rootPath") ??
      readString(args, "root_path");
    if (!rootPath) {
      return null;
    }
    const response = await this.#appServerRequest<WorkspaceReadResponse>(
      METHOD_WORKSPACE_BY_PATH_READ,
      { rootPath },
    );
    return response.workspace ?? null;
  }

  async #readDefaultWorkspace(): Promise<unknown | null> {
    const response = await this.#appServerRequest<WorkspaceReadResponse>(
      METHOD_WORKSPACE_DEFAULT_READ,
    );
    return response.workspace ?? null;
  }

  async #ensureDefaultWorkspace(): Promise<unknown> {
    const response = await this.#appServerRequest<WorkspaceReadResponse>(
      METHOD_WORKSPACE_DEFAULT_ENSURE,
    );
    if (!response.workspace) {
      throw new Error("workspace/default/ensure returned no workspace");
    }
    return response.workspace;
  }

  async #readWorkspaceProjectsRoot(): Promise<string> {
    const response =
      await this.#appServerRequest<WorkspaceProjectsRootReadResponse>(
        METHOD_WORKSPACE_PROJECTS_ROOT_READ,
      );
    return response.rootPath;
  }

  async #resolveWorkspaceProjectPath(args: HostArgs): Promise<string> {
    const request = readRequest(args);
    const name =
      readString(request, "name") ?? readString(args, "name") ?? "untitled";
    const parentRootPath =
      readString(request, "parentRootPath") ??
      readString(request, "parent_root_path") ??
      readString(args, "parentRootPath") ??
      readString(args, "parent_root_path");
    const response =
      await this.#appServerRequest<WorkspaceProjectPathResolveResponse>(
        METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
        {
          name,
          ...(parentRootPath ? { parentRootPath } : {}),
        },
      );
    return response.rootPath;
  }

  async #ensureWorkspace(args: HostArgs): Promise<unknown> {
    const request = readRequest(args);
    const name =
      readString(request, "name") ?? readString(args, "name") ?? "untitled";
    const rootPath =
      readString(request, "rootPath") ??
      readString(request, "root_path") ??
      readString(args, "rootPath") ??
      readString(args, "root_path");
    if (!rootPath) {
      throw new Error("workspace_ensure requires rootPath");
    }
    const workspaceType =
      readString(request, "workspaceType") ??
      readString(request, "workspace_type") ??
      readString(args, "workspaceType") ??
      readString(args, "workspace_type");
    const response =
      await this.#appServerRequest<WorkspaceEnsureProjectResponse>(
        METHOD_WORKSPACE_ENSURE,
        {
          name,
          rootPath,
          ...(workspaceType ? { workspaceType } : {}),
        },
      );
    return response.workspace;
  }

  async #ensureDefaultWorkspaceReady(): Promise<unknown | null> {
    const workspace = await this.#ensureDefaultWorkspace();
    const id = readString(workspace, "id");
    if (!id) {
      return null;
    }
    const response = await this.#appServerRequest<WorkspaceEnsureReadyResponse>(
      METHOD_WORKSPACE_ENSURE_READY,
      { id },
    );
    return response.result;
  }

  async #ensureWorkspaceReady(args: HostArgs): Promise<unknown> {
    const request = readRequest(args);
    const id = readString(request, "id") ?? readString(args, "id");
    if (!id) {
      throw new Error("workspace_ensure_ready requires id");
    }
    const response = await this.#appServerRequest<WorkspaceEnsureReadyResponse>(
      METHOD_WORKSPACE_ENSURE_READY,
      { id },
    );
    return response.result;
  }

  async #listLocalSkillsForApp(args: HostArgs): Promise<unknown[]> {
    const request = readRequest(args);
    const appName = readString(request, "app") ?? "lime";
    if (appName !== "lime") {
      return [];
    }
    const response =
      await this.#appServerRequest<SkillListResponse>(METHOD_SKILL_LIST);
    return response.skills.map(skillToLocalSkill);
  }

  async #getVoiceShortcutRuntimeStatus(): Promise<Record<string, unknown>> {
    const fallbackShortcut = "CommandOrControl+Shift+V";
    const config = await this.#readConfig();
    const requestedShortcut =
      readString(
        readRecord(readRecord(config, "experimental"), "voice_input"),
        "shortcut",
      ) ?? fallbackShortcut;
    let shortcut = requestedShortcut;
    let fnNote = "Fn 按住录音尚未接入；当前使用普通语音快捷键回退。";
    try {
      assertValidShortcut(shortcut);
    } catch {
      shortcut = fallbackShortcut;
      fnNote =
        "语音快捷键配置不可解析，已使用默认普通语音快捷键回退；Fn 按住录音尚未接入。";
    }
    const shortcutRegistered = globalShortcut.isRegistered(shortcut);

    return {
      shortcut_registered: shortcutRegistered,
      registered_shortcut: shortcutRegistered ? shortcut : null,
      fn_supported: process.platform === "darwin",
      fn_registered: false,
      fn_fallback_shortcut: shortcut,
      fn_note: fnNote,
    };
  }

  #validateShortcut(args: HostArgs): boolean {
    const request = readRequest(args);
    const shortcut =
      readString(request, "shortcutStr") ??
      readString(request, "shortcut_str") ??
      readString(request, "shortcut") ??
      readString(args, "shortcutStr") ??
      readString(args, "shortcut_str") ??
      readString(args, "shortcut");
    assertValidShortcut(shortcut);
    return true;
  }

  #listVoiceModelCatalog(): Array<Record<string, unknown>> {
    const assetBaseUrl =
      normalizeString(process.env.LIME_VOICE_MODEL_ASSET_BASE_URL) ??
      normalizeString(process.env.VOICE_MODEL_ASSET_BASE_URL) ??
      normalizeString(process.env.SERVER_VOICE_MODEL_ASSET_BASE_URL) ??
      DEFAULT_VOICE_MODEL_ASSET_BASE_URL;
    return [
      {
        id: SENSEVOICE_MODEL_ID,
        name: "SenseVoice Small INT8",
        provider: "FunAudioLLM / sherpa-onnx",
        description:
          "本地离线 ASR，支持中文、英文、日文、韩文和粤语；模型按需下载到用户数据目录。",
        version: "2024-07-17",
        languages: ["zh", "en", "ja", "ko", "yue"],
        size_bytes: DEFAULT_VOICE_MODEL_BYTES,
        download_url: joinUrl(assetBaseUrl, VOICE_MODEL_ARCHIVE_DOWNLOAD_PATH),
        vad_model_id: SILERO_VAD_MODEL_ID,
        vad_download_url: joinUrl(assetBaseUrl, VOICE_MODEL_VAD_DOWNLOAD_PATH),
        runtime: "sherpa-onnx",
        bundled: false,
        checksum_sha256: DEFAULT_VOICE_MODEL_ARCHIVE_SHA256,
      },
    ];
  }

  async #getVoiceModelInstallState(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const modelId = this.#readVoiceModelId(args);
    const installDir = this.#voiceModelInstallDir(modelId);
    const modelFile = path.join(installDir, VOICE_MODEL_ONNX_FILE);
    const tokensFile = path.join(installDir, VOICE_MODEL_TOKENS_FILE);
    const vadFile = path.join(installDir, VOICE_MODEL_VAD_FILE);
    const requiredFiles = [
      [VOICE_MODEL_ONNX_FILE, modelFile],
      [VOICE_MODEL_TOKENS_FILE, tokensFile],
      [VOICE_MODEL_VAD_FILE, vadFile],
    ] as const;
    const missingFiles: string[] = [];
    for (const [name, filePath] of requiredFiles) {
      if (!(await pathExists(filePath))) {
        missingFiles.push(name);
      }
    }
    const installedBytes = await directorySize(installDir);
    const manifest = await readJsonFile(
      path.join(installDir, VOICE_MODEL_MANIFEST_FILE),
    );
    const installed = missingFiles.length === 0;
    return {
      model_id: modelId,
      installed,
      installing: false,
      install_dir: installDir,
      model_file: installed ? modelFile : null,
      tokens_file: installed ? tokensFile : null,
      vad_file: installed ? vadFile : null,
      installed_bytes: installedBytes,
      last_verified_at: readNumber(manifest, "installed_at") ?? null,
      missing_files: missingFiles,
      default_credential_id: null,
    };
  }

  async #downloadVoiceModel(args: HostArgs): Promise<Record<string, unknown>> {
    const modelId = this.#readVoiceModelId(args);
    const catalog = this.#readVoiceModelCatalogRecord(args, modelId);
    const tempRoot = path.join(
      this.#voiceModelDownloadsDir(),
      `${modelId}-${Date.now()}`,
    );
    const extractDir = path.join(tempRoot, "extract");
    const stagingDir = path.join(tempRoot, "staging");
    const archivePath = path.join(tempRoot, VOICE_MODEL_ARCHIVE_FILE);
    const installDir = this.#voiceModelInstallDir(modelId);

    const expectedArchiveBytes =
      catalog.sizeBytes && catalog.sizeBytes > 0 ? catalog.sizeBytes : null;
    this.#emitVoiceModelDownloadProgress(
      modelId,
      "preparing",
      0,
      expectedArchiveBytes,
      0,
      "准备下载模型",
    );

    try {
      await mkdir(extractDir, { recursive: true });
      const archiveSha256 = await downloadFileToPath(
        catalog.downloadUrl,
        archivePath,
        (downloadedBytes, totalBytes) => {
          const total = totalBytes ?? expectedArchiveBytes;
          this.#emitVoiceModelDownloadProgress(
            modelId,
            "archive",
            downloadedBytes,
            total,
            0.9 * progressRatio(downloadedBytes, total),
            "正在下载模型包",
          );
        },
      );
      verifyOptionalSha256(archiveSha256, catalog.checksumSha256);

      this.#emitVoiceModelDownloadProgress(
        modelId,
        "extracting",
        0,
        null,
        0.92,
        "正在校验并解压",
      );
      await extractTarBz2(archivePath, extractDir);
      const modelSourceDir = await findVoiceModelSourceDir(extractDir);
      await mkdir(stagingDir, { recursive: true });
      await copyFile(
        path.join(modelSourceDir, VOICE_MODEL_ONNX_FILE),
        path.join(stagingDir, VOICE_MODEL_ONNX_FILE),
      );
      await copyFile(
        path.join(modelSourceDir, VOICE_MODEL_TOKENS_FILE),
        path.join(stagingDir, VOICE_MODEL_TOKENS_FILE),
      );

      await downloadFileToPath(
        catalog.vadDownloadUrl,
        path.join(stagingDir, VOICE_MODEL_VAD_FILE),
        (downloadedBytes, totalBytes) => {
          this.#emitVoiceModelDownloadProgress(
            modelId,
            "vad",
            downloadedBytes,
            totalBytes,
            0.92 + 0.05 * progressRatio(downloadedBytes, totalBytes),
            "正在下载 VAD",
          );
        },
      );

      await writeFile(
        path.join(stagingDir, VOICE_MODEL_MANIFEST_FILE),
        JSON.stringify(
          {
            model_id: modelId,
            installed_at: Math.floor(Date.now() / 1000),
            source_url: catalog.downloadUrl,
            vad_url: catalog.vadDownloadUrl,
            archive_sha256: archiveSha256,
            checksum_verified: Boolean(catalog.checksumSha256),
            checksum_note: catalog.checksumSha256
              ? "后端目录提供 sha256，已完成归档内容校验"
              : "后端目录未提供 sha256，当前记录下载内容摘要但不声明已完成可信校验",
          },
          null,
          2,
        ),
      );
      this.#emitVoiceModelDownloadProgress(
        modelId,
        "installing",
        0,
        null,
        0.98,
        "正在安装",
      );
      await rm(installDir, { recursive: true, force: true });
      await mkdir(path.dirname(installDir), { recursive: true });
      await rename(stagingDir, installDir);
      this.#emitVoiceModelDownloadProgress(
        modelId,
        "done",
        0,
        null,
        1,
        "安装完成",
      );
      return { state: await this.#getVoiceModelInstallState({ modelId }) };
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async #deleteVoiceModel(args: HostArgs): Promise<Record<string, unknown>> {
    const modelId = this.#readVoiceModelId(args);
    await rm(this.#voiceModelInstallDir(modelId), {
      recursive: true,
      force: true,
    });
    return await this.#getVoiceModelInstallState({ modelId });
  }

  #readVoiceModelId(args: HostArgs): string {
    const request = readRequest(args);
    const modelId =
      readString(request, "modelId") ??
      readString(request, "model_id") ??
      SENSEVOICE_MODEL_ID;
    if (modelId !== SENSEVOICE_MODEL_ID) {
      throw new Error(`Unsupported voice model: ${modelId}`);
    }
    return modelId;
  }

  #readVoiceModelCatalogRecord(
    args: HostArgs,
    modelId: string,
  ): VoiceModelCatalogRecord {
    const request = readRequest(args);
    const rawCatalog =
      readRecord(request, "catalogEntry") ??
      readRecord(request, "catalog_entry") ??
      this.#listVoiceModelCatalog()[0];
    const id = readString(rawCatalog, "id") ?? modelId;
    if (id !== modelId) {
      throw new Error(
        `语音模型目录 ID 不匹配: expected=${modelId}, actual=${id}`,
      );
    }
    const downloadUrl = readString(rawCatalog, "download_url");
    const vadDownloadUrl = readString(rawCatalog, "vad_download_url");
    if (!downloadUrl) {
      throw new Error("SenseVoice Small 归档下载地址未配置");
    }
    if (!vadDownloadUrl) {
      throw new Error("Silero VAD 下载地址未配置");
    }
    return {
      id,
      sizeBytes: readNumber(rawCatalog, "size_bytes") ?? undefined,
      downloadUrl,
      vadDownloadUrl,
      checksumSha256: readString(rawCatalog, "checksum_sha256"),
    };
  }

  #emitVoiceModelDownloadProgress(
    modelId: string,
    phase: string,
    downloadedBytes: number,
    totalBytes: number | null,
    overallProgress: number,
    message: string,
  ): void {
    this.#emit(VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT, {
      model_id: modelId,
      phase,
      downloaded_bytes: downloadedBytes,
      total_bytes: totalBytes,
      overall_progress: clampRatio(overallProgress),
      message,
    });
  }

  #voiceModelInstallDir(modelId: string): string {
    return path.join(this.#userDataDir, "models", "voice", modelId);
  }

  #voiceModelDownloadsDir(): string {
    return path.join(this.#userDataDir, "models", "voice", ".downloads");
  }

  async #getEnvironmentPreview(): Promise<Record<string, unknown>> {
    const config = await this.#readConfig();
    const serverConfig = toRecord(config.server);
    const apiKey = readString(serverConfig, "api_key") ?? "";
    const apiBase =
      `http://${readString(serverConfig, "host") ?? "127.0.0.1"}:` +
      `${readNumber(serverConfig, "port") ?? 8787}`;
    const entries = [
      {
        key: "LIME_API_BASE",
        value: apiBase,
        maskedValue: apiBase,
        source: "config",
        sourceLabel: "Electron Desktop Host",
        sensitive: false,
        overriddenSources: [],
      },
      {
        key: "LIME_API_KEY",
        value: apiKey,
        maskedValue: apiKey ? "********" : "",
        source: "config",
        sourceLabel: "Electron Desktop Host",
        sensitive: true,
        overriddenSources: [],
      },
    ];
    return {
      shellImport: {
        enabled: false,
        status: "disabled",
        message: "Electron current 暂未接入 shell 环境导入预览。",
        importedCount: 0,
        durationMs: null,
      },
      entries,
    };
  }

  #getSkillPackageFileAssociationStatus(): Record<string, unknown> {
    return {
      platform: process.platform,
      extension: "skill",
      extensions: ["skill", "skills"],
      mimeType: "application/vnd.lime.skill+zip",
      appIdentifier: app.getName(),
      isDefault: false,
      canSetDefault: true,
      requiresUserConfirmation: true,
      currentHandler: null,
      settingsUrl: null,
      detail:
        "Electron Desktop Host 当前只能检查 .skill / .skills 文件关联状态；设置默认打开方式需要系统确认。",
      diagnostic: this.#diagnosticMeta(
        "get_skill_package_file_association_status",
      ),
    };
  }

  #setSkillPackageFileAssociationDefault(): Record<string, unknown> {
    const status = this.#getSkillPackageFileAssociationStatus();
    return {
      changed: false,
      message:
        "Electron Desktop Host 当前不能静默修改系统文件关联，请在系统设置中确认 .skill / .skills 默认打开方式。",
      status,
      diagnostic: this.#diagnosticMeta(
        "set_skill_package_file_association_default",
      ),
    };
  }

  #getBrowserConnectorSettings(): Record<string, unknown> {
    const installRoot = path.join(this.#userDataDir, "browser-connectors");
    return {
      enabled: true,
      install_root_dir: installRoot,
      install_dir: path.join(installRoot, "Lime Browser Connector"),
      browser_action_capabilities: [
        { key: "read_page", label: "读取页面", enabled: true },
        { key: "click", label: "点击", enabled: true },
        { key: "type", label: "输入", enabled: true },
        { key: "scroll_page", label: "滚动页面", enabled: true },
      ],
      system_connectors: [],
      diagnostic: this.#diagnosticMeta("get_browser_connector_settings_cmd"),
    };
  }

  #getBrowserConnectorInstallStatus(): Record<string, unknown> {
    const installRoot = path.join(this.#userDataDir, "browser-connectors");
    return {
      status: "not_installed",
      install_root_dir: installRoot,
      install_dir: path.join(installRoot, "Lime Browser Connector"),
      bundled_name: "Lime Browser Connector",
      bundled_version: app.getVersion(),
      installed_name: null,
      installed_version: null,
      message: "尚未导出浏览器连接器",
      diagnostic: this.#diagnosticMeta(
        "get_browser_connector_install_status_cmd",
      ),
    };
  }

  #getChromeBridgeEndpointInfo(): Record<string, unknown> {
    return {
      server_running: false,
      host: "127.0.0.1",
      port: 8999,
      observer_ws_url: "ws://127.0.0.1:8999/lime-chrome-observer",
      control_ws_url: "ws://127.0.0.1:8999/lime-chrome-control",
      bridge_key: "proxy_cast",
      diagnostic: this.#diagnosticMeta("get_chrome_bridge_endpoint_info"),
    };
  }

  #getChromeBridgeStatus(): Record<string, unknown> {
    return {
      observer_count: 0,
      control_count: 0,
      pending_command_count: 0,
      observers: [],
      controls: [],
      pending_commands: [],
      diagnostic: this.#diagnosticMeta("get_chrome_bridge_status"),
    };
  }

  #getBrowserBackendPolicy(): Record<string, unknown> {
    return {
      priority: ["lime_extension_bridge", "cdp_direct"],
      auto_fallback: false,
      diagnostic: this.#diagnosticMeta("get_browser_backend_policy"),
    };
  }

  #getBrowserBackendsStatus(): Record<string, unknown> {
    const policy = this.#getBrowserBackendPolicy();
    return {
      policy,
      bridge_observer_count: 0,
      bridge_control_count: 0,
      running_profile_count: 0,
      cdp_alive_profile_count: 0,
      aster_native_host_supported: false,
      aster_native_host_configured: false,
      backends: [
        {
          backend: "lime_extension_bridge",
          available: false,
          reason: "浏览器连接器尚未连接",
          capabilities: [],
        },
        {
          backend: "cdp_direct",
          available: false,
          reason: "当前没有运行中的 Chrome Profile 会话",
          capabilities: [],
        },
      ],
      diagnostic: this.#diagnosticMeta("get_browser_backends_status"),
    };
  }

  async #readConfig(): Promise<Record<string, unknown>> {
    const fallback = buildDefaultConfig();
    try {
      const text = await readFile(this.#configPath(), "utf8");
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return { ...fallback, ...parsed };
    } catch {
      return fallback;
    }
  }

  async #saveConfig(args: HostArgs): Promise<null> {
    const config = readRecord(args, "config") ?? args ?? {};
    await mkdir(this.#userDataDir, { recursive: true });
    await writeFile(
      this.#configPath(),
      JSON.stringify(config, null, 2),
      "utf8",
    );
    return null;
  }

  #reportFrontendDebugLog(args: HostArgs): void {
    const report = readRecord(args, "report");
    const level = readString(report, "level") ?? "info";
    const message = readString(report, "message") ?? "";
    safeWriteElectronHostLog("log", `[electron-renderer:${level}] ${message}`);
  }

  #reportFrontendCrash(args: HostArgs): void {
    const report = readRecord(args, "report") ?? {};
    const message = readString(report, "message") ?? "renderer crash report";
    safeWriteElectronHostLog(
      "error",
      "[electron-renderer:crash]",
      message,
      report,
    );
  }

  #configPath(): string {
    return path.join(this.#userDataDir, CONFIG_FILE);
  }

  disposeProjectShellSessionsForShutdown(): void {
    if (this.#projectShellEventPoller) {
      clearInterval(this.#projectShellEventPoller);
      this.#projectShellEventPoller = null;
    }
    const sessionIds = Array.from(this.#projectShellSessions);
    this.#projectShellSessions.clear();
    for (const sessionId of sessionIds) {
      void this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_KILL, {
        sessionId,
      }).catch(() => undefined);
    }
  }
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

function readRequest(value: unknown): Record<string, unknown> {
  return readRecord(value, "request") ?? toRecord(value) ?? {};
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

function openFilePreviewBrowserWindow(
  url: string,
  title: string,
): OpenFilePreviewWindowResult {
  const existing = BrowserWindow.getAllWindows().find(
    (window) => window.webContents.getURL() === url,
  );
  const targetWindow =
    existing ??
    new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 860,
      minHeight: 560,
      title,
      show: false,
      backgroundColor: "#f8fafc",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

  if (!existing) {
    void targetWindow.loadURL(url);
    targetWindow.once("ready-to-show", () => {
      targetWindow.show();
    });
  } else {
    targetWindow.show();
  }
  targetWindow.focus();

  return {
    opened: true,
    reused: Boolean(existing),
    url,
    title,
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

function readArray(value: unknown, key: string): unknown[] | undefined {
  const record = toRecord(value);
  const next = record?.[key];
  return Array.isArray(next) ? next : undefined;
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function joinUrl(baseUrl: string, relativePath: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${relativePath.replace(/^\/+/u, "")}`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directorySize(directoryPath: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
      continue;
    }
    if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function downloadFileToPath(
  url: string,
  targetPath: string,
  onProgress: DownloadProgressCallback,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`下载语音模型文件失败 ${url}: ${response.status}`);
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  const file = await open(targetPath, "w");
  const hash = createHash("sha256");
  const totalBytes = readContentLength(response);
  let downloadedBytes = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = Buffer.from(value);
      downloadedBytes += chunk.byteLength;
      hash.update(chunk);
      await file.write(chunk);
      onProgress(downloadedBytes, totalBytes);
    }
  } finally {
    await file.close();
  }
  return hash.digest("hex");
}

function readContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function verifyOptionalSha256(
  actual: string,
  expected: string | null | undefined,
): void {
  const normalized = expected?.trim();
  if (!normalized) {
    return;
  }
  if (actual.toLowerCase() !== normalized.toLowerCase()) {
    throw new Error(
      `模型归档 sha256 校验失败: expected=${normalized}, actual=${actual}`,
    );
  }
}

async function extractTarBz2(
  archivePath: string,
  extractDir: string,
): Promise<void> {
  await mkdir(extractDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xjf", archivePath, "-C", extractDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new Error(`系统 tar 解压语音模型失败: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `系统 tar 解压语音模型失败: ${stderr.trim() || `exit ${code}`}`,
        ),
      );
    });
  });
}

async function findVoiceModelSourceDir(rootDir: string): Promise<string> {
  const candidates: string[] = [];
  await collectVoiceModelSourceDirs(rootDir, candidates);
  if (candidates.length === 0) {
    throw new Error("模型归档缺少 model.int8.onnx / tokens.txt");
  }
  return candidates[0];
}

async function collectVoiceModelSourceDirs(
  directoryPath: string,
  candidates: string[],
): Promise<void> {
  const modelPath = path.join(directoryPath, VOICE_MODEL_ONNX_FILE);
  const tokensPath = path.join(directoryPath, VOICE_MODEL_TOKENS_FILE);
  if ((await pathExists(modelPath)) && (await pathExists(tokensPath))) {
    candidates.push(directoryPath);
    return;
  }
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await collectVoiceModelSourceDirs(
        path.join(directoryPath, entry.name),
        candidates,
      );
    }
  }
}

function progressRatio(
  downloadedBytes: number,
  totalBytes: number | null,
): number {
  if (!totalBytes || totalBytes <= 0) {
    return 0;
  }
  return clampRatio(downloadedBytes / totalBytes);
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

async function readJsonFile(
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return toRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function assertValidShortcut(shortcut: string | null): void {
  if (!shortcut) {
    throw new Error("快捷键不能为空");
  }
  const tokens = normalizeShortcutTokens(shortcut);
  const hasModifier = tokens.some((token) => MODIFIER_TOKENS.has(token));
  const keyTokens = tokens.filter((token) => !MODIFIER_TOKENS.has(token));
  if (
    !hasModifier ||
    keyTokens.length !== 1 ||
    !isValidShortcutKey(keyTokens[0])
  ) {
    throw new Error(`无法解析快捷键 '${shortcut}'`);
  }
  if (isReservedShortcut(tokens)) {
    throw new Error(RESERVED_SHORTCUT_REASON);
  }
}

function normalizeShortcutTokens(shortcut: string): string[] {
  const tokens = shortcut
    .split("+")
    .map(normalizeShortcutToken)
    .filter(Boolean);
  return [...new Set(tokens)].sort();
}

function normalizeShortcutToken(token: string): string {
  const compact = token
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");

  switch (compact) {
    case "ctrl":
    case "control":
      return "control";
    case "cmd":
    case "command":
      return "command";
    case "cmdorctrl":
    case "cmdorcontrol":
    case "commandorcontrol":
      return "commandorcontrol";
    case "option":
    case "alt":
      return "alt";
    case "win":
    case "windows":
    case "meta":
    case "super":
      return "super";
    case "spacebar":
    case "space":
      return "space";
    default:
      return compact;
  }
}

function isValidShortcutKey(token: string): boolean {
  if (/^[a-z0-9]$/.test(token)) {
    return true;
  }
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return true;
  }
  return SPECIAL_SHORTCUT_KEYS.has(token);
}

function isReservedShortcut(tokens: string[]): boolean {
  return RESERVED_SHORTCUTS.some(
    (candidate) =>
      candidate.length === tokens.length &&
      candidate.every((token) => tokens.includes(token)),
  );
}

function readRequiredString(value: unknown, key: string): string {
  const next = readString(value, key);
  if (!next) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readRequiredRawString(value: unknown, key: string): string {
  const record = toRecord(value);
  const next = record?.[key];
  if (typeof next !== "string") {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readRequiredAbsolutePath(value: unknown, key: string): string {
  const next = readRequiredString(value, key);
  if (!path.isAbsolute(next)) {
    throw new Error(`${key} 必须是绝对路径`);
  }
  return next;
}

function readProjectPathOpenTool(
  value: Record<string, unknown>,
): ProjectPathOpenTool {
  const tool = readRequiredString(value, "tool");
  if (
    tool === "vscode" ||
    tool === "cursor" ||
    tool === "terminal" ||
    tool === "finder"
  ) {
    return tool;
  }
  throw new Error(`不支持的项目打开工具: ${tool}`);
}

function readLayeredDesignExportFiles(
  request: Record<string, unknown>,
): LayeredDesignProjectExportFile[] {
  const files = readArray(request, "files") ?? [];
  return files.map((file, index) => {
    const record = toRecord(file);
    if (!record) {
      throw new Error(`图层设计导出文件 ${index + 1} 不是有效对象`);
    }
    const encoding = readRequiredString(record, "encoding");
    if (encoding !== "utf8" && encoding !== "base64") {
      throw new Error(`图层设计导出文件 ${index + 1} encoding 不受支持`);
    }
    return {
      relativePath: readRequiredString(record, "relativePath"),
      mimeType: readString(record, "mimeType") ?? undefined,
      encoding,
      content: readRequiredRawString(record, "content"),
    };
  });
}

async function prepareLayeredDesignExportFiles(
  files: LayeredDesignProjectExportFile[],
): Promise<{
  files: Array<{ relativePath: string[]; content: Buffer }>;
  remoteReferenceAssetCount: number;
  cachedRemoteAssets: CachedLayeredDesignRemoteAsset[];
}> {
  const preparedFiles = files.map((file) => ({
    relativePath: normalizeLayeredDesignRelativePath(file.relativePath),
    content:
      file.encoding === "base64"
        ? Buffer.from(file.content, "base64")
        : Buffer.from(file.content, "utf8"),
  }));
  const manifestFile = preparedFiles.find(
    (file) => file.relativePath.join("/") === "export-manifest.json",
  );
  if (!manifestFile) {
    return {
      files: preparedFiles,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssets: [],
    };
  }

  const manifest = parseLayeredDesignJsonObject(manifestFile.content);
  if (!manifest) {
    return {
      files: preparedFiles,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssets: [],
    };
  }
  const remoteAssets = collectLayeredDesignRemoteManifestAssets(manifest);
  if (remoteAssets.length === 0) {
    return {
      files: preparedFiles,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssets: [],
    };
  }

  const psdLikeFile = preparedFiles.find(
    (file) => file.relativePath.join("/") === "psd-like-manifest.json",
  );
  const psdLikeManifest = psdLikeFile
    ? parseLayeredDesignJsonObject(psdLikeFile.content)
    : null;
  const cachedRemoteAssets: CachedLayeredDesignRemoteAsset[] = [];
  for (const asset of remoteAssets) {
    const cached = await downloadLayeredDesignRemoteAsset(
      asset.assetId,
      asset.originalSrc,
    );
    if (!cached) {
      continue;
    }
    applyCachedLayeredDesignRemoteAssetToManifest(manifest, cached);
    if (psdLikeManifest) {
      applyCachedLayeredDesignRemoteAssetToPsdLikeManifest(
        psdLikeManifest,
        cached,
      );
    }
    cachedRemoteAssets.push(cached);
  }

  if (cachedRemoteAssets.length > 0) {
    manifestFile.content = Buffer.from(JSON.stringify(manifest, null, 2));
    if (psdLikeFile && psdLikeManifest) {
      psdLikeFile.content = Buffer.from(
        JSON.stringify(psdLikeManifest, null, 2),
      );
    }
  }

  return {
    files: preparedFiles,
    remoteReferenceAssetCount: remoteAssets.length,
    cachedRemoteAssets,
  };
}

function parseLayeredDesignJsonObject(
  content: Buffer | string | undefined,
): Record<string, unknown> | null {
  if (content === undefined) {
    return null;
  }
  try {
    const value = JSON.parse(
      typeof content === "string" ? content : content.toString("utf8"),
    ) as unknown;
    return toRecord(value);
  } catch {
    return null;
  }
}

function collectLayeredDesignRemoteManifestAssets(
  manifest: Record<string, unknown>,
): Array<{ assetId: string; originalSrc: string }> {
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  return assets.flatMap((asset) => {
    const record = toRecord(asset);
    const assetId = readString(record, "id");
    const source = readString(record, "source");
    const originalSrc = readString(record, "originalSrc");
    if (
      !assetId ||
      source !== "reference" ||
      !originalSrc ||
      !isSupportedLayeredDesignRemoteAssetUrl(originalSrc)
    ) {
      return [];
    }
    return [{ assetId, originalSrc }];
  });
}

function isSupportedLayeredDesignRemoteAssetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveLayeredDesignRemoteAssetMimeType(
  contentType: string | null,
  sourceUrl: string,
): string | null {
  const normalizedContentType = contentType
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (normalizedContentType?.startsWith("image/")) {
    return normalizedContentType;
  }
  const lower = sourceUrl.toLowerCase();
  if (lower.includes(".png")) {
    return "image/png";
  }
  if (lower.includes(".jpg") || lower.includes(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.includes(".webp")) {
    return "image/webp";
  }
  if (lower.includes(".gif")) {
    return "image/gif";
  }
  if (lower.includes(".svg")) {
    return "image/svg+xml";
  }
  return null;
}

function resolveLayeredDesignRemoteAssetExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

function sanitizeLayeredDesignAssetFileStem(
  value: string,
  fallback = "asset",
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return (normalized || fallback).slice(0, 96);
}

async function downloadLayeredDesignRemoteAsset(
  assetId: string,
  originalSrc: string,
): Promise<CachedLayeredDesignRemoteAsset | null> {
  try {
    const response = await fetch(originalSrc, {
      signal: AbortSignal.timeout(REMOTE_LAYERED_DESIGN_ASSET_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REMOTE_LAYERED_DESIGN_ASSET_BYTES) {
      return null;
    }
    const mimeType = resolveLayeredDesignRemoteAssetMimeType(
      response.headers.get("content-type"),
      originalSrc,
    );
    if (!mimeType) {
      return null;
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.byteLength > MAX_REMOTE_LAYERED_DESIGN_ASSET_BYTES) {
      return null;
    }
    const extension = resolveLayeredDesignRemoteAssetExtension(mimeType);
    return {
      assetId,
      originalSrc,
      filename: `assets/${sanitizeLayeredDesignAssetFileStem(
        assetId,
      )}.${extension}`,
      content,
    };
  } catch {
    return null;
  }
}

function applyCachedLayeredDesignRemoteAssetToManifest(
  manifest: Record<string, unknown>,
  cached: CachedLayeredDesignRemoteAsset,
): void {
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) {
    const record = toRecord(asset);
    if (!record || readString(record, "id") !== cached.assetId) {
      continue;
    }
    record.source = "file";
    record.filename = cached.filename;
    record.originalSrc = cached.originalSrc;
  }
}

function applyCachedLayeredDesignRemoteAssetToPsdLikeManifest(
  manifest: Record<string, unknown>,
  cached: CachedLayeredDesignRemoteAsset,
): void {
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  for (const layer of layers) {
    const layerRecord = toRecord(layer);
    const asset = toRecord(layerRecord?.asset);
    if (!asset || readString(asset, "id") !== cached.assetId) {
      continue;
    }
    asset.source = "file";
    asset.filename = cached.filename;
    asset.originalSrc = cached.originalSrc;
  }
}

async function hydrateLayeredDesignJsonWithCachedAssets(
  exportDirectoryPath: string,
  designJson: string,
  manifestJson: string | undefined,
): Promise<string> {
  const design = parseLayeredDesignJsonObject(designJson);
  const manifest = parseLayeredDesignJsonObject(manifestJson);
  if (!design || !manifest) {
    return designJson;
  }
  const manifestAssets = new Map<string, string>();
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) {
    const record = toRecord(asset);
    const assetId = readString(record, "id");
    const source = readString(record, "source");
    const filename = readString(record, "filename");
    if (assetId && source === "file" && filename) {
      manifestAssets.set(assetId, filename);
    }
  }
  if (manifestAssets.size === 0) {
    return designJson;
  }

  const designAssets = Array.isArray(design.assets) ? design.assets : [];
  let hydrated = false;
  for (const asset of designAssets) {
    const record = toRecord(asset);
    if (!record) {
      continue;
    }
    const assetId = readString(record, "id");
    if (!assetId) {
      continue;
    }
    const filename = manifestAssets.get(assetId);
    const currentSrc = readString(record, "src") ?? "";
    if (!filename || currentSrc.startsWith("data:")) {
      continue;
    }
    const relativePath = normalizeLayeredDesignRelativePath(filename);
    const assetPath = path.join(exportDirectoryPath, ...relativePath);
    if (!(await isFile(assetPath))) {
      continue;
    }
    const content = await readFile(assetPath);
    const mimeType =
      resolveLayeredDesignRemoteAssetMimeType(null, filename) ?? "image/png";
    record.src = `data:${mimeType};base64,${content.toString("base64")}`;
    hydrated = true;
  }

  return hydrated ? JSON.stringify(design, null, 2) : designJson;
}

function sanitizeLayeredDesignDirectoryName(
  value: string,
  fallback: string,
): string {
  let output = "";
  let previousDash = false;
  for (const character of value.trim()) {
    if (/[a-z0-9._-]/i.test(character)) {
      output += character.toLowerCase();
      previousDash = false;
    } else if (/[\s/\\:|]/.test(character) && !previousDash) {
      output += "-";
      previousDash = true;
    }
    if (output.length >= 96) {
      break;
    }
  }
  const trimmed = output.replace(/^[-.]+|[-.]+$/g, "");
  const directoryName = trimmed || fallback;
  return directoryName.endsWith(".layered-design")
    ? directoryName
    : `${directoryName}.layered-design`;
}

function normalizeLayeredDesignRelativePath(relativePath: string): string[] {
  const normalized = relativePath.trim().replace(/\\/g, "/");
  if (!normalized) {
    throw new Error("导出文件相对路径不能为空");
  }
  if (path.isAbsolute(normalized)) {
    throw new Error(`导出文件路径必须是相对路径: ${relativePath}`);
  }
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`导出文件路径不能包含目录穿越或根路径: ${relativePath}`);
  }
  return segments;
}

async function resolveLayeredDesignExportDirectory(
  projectRootPath: string,
  request: Record<string, unknown>,
): Promise<{
  exportDirectoryPath: string;
  exportDirectoryRelativePath: string;
}> {
  const requestedRelativePath = readString(
    request,
    "exportDirectoryRelativePath",
  );
  if (requestedRelativePath) {
    const segments = normalizeLayeredDesignRelativePath(requestedRelativePath);
    const exportDirectoryRelativePath = segments.join("/");
    if (
      !exportDirectoryRelativePath.startsWith(`${LAYERED_DESIGN_EXPORT_ROOT}/`)
    ) {
      throw new Error(`图层设计工程目录必须位于 ${LAYERED_DESIGN_EXPORT_ROOT}`);
    }
    return {
      exportDirectoryPath: path.join(projectRootPath, ...segments),
      exportDirectoryRelativePath,
    };
  }

  const rootPath = path.join(
    projectRootPath,
    ...LAYERED_DESIGN_EXPORT_ROOT.split("/"),
  );
  const entries = await readdir(rootPath, { withFileTypes: true });
  let latest:
    | {
        name: string;
        updatedAtMs: number;
      }
    | undefined;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".layered-design")) {
      continue;
    }
    const designPath = path.join(rootPath, entry.name, "design.json");
    if (!(await isFile(designPath))) {
      continue;
    }
    const metadata = await stat(designPath);
    if (!latest || metadata.mtimeMs > latest.updatedAtMs) {
      latest = {
        name: entry.name,
        updatedAtMs: metadata.mtimeMs,
      };
    }
  }
  if (!latest) {
    throw new Error(`未找到 ${LAYERED_DESIGN_EXPORT_ROOT} 下的图层设计工程`);
  }
  return {
    exportDirectoryPath: path.join(rootPath, latest.name),
    exportDirectoryRelativePath: `${LAYERED_DESIGN_EXPORT_ROOT}/${latest.name}`,
  };
}

async function readOptionalUtf8File(
  filePath: string,
): Promise<string | undefined> {
  if (!(await isFile(filePath))) {
    return undefined;
  }
  return await readFile(filePath, "utf8");
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function countFilesRecursive(directoryPath: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesRecursive(entryPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function assertPositiveNumber(
  value: unknown,
  key: string,
  message: string,
): void {
  const next = readNumber(value, key);
  if (next === null || next <= 0) {
    throw new Error(message);
  }
}

function readElectronPath(name: ElectronKnownPathName): string | null {
  try {
    const next = app.getPath(name);
    return next.trim() ? next : null;
  } catch {
    return null;
  }
}

async function appendFileManagerLocation(
  locations: FileManagerLocation[],
  seenPaths: Set<string>,
  location: FileManagerLocationCandidate,
): Promise<void> {
  const normalizedPath = location.path?.trim() ?? "";
  if (!normalizedPath || seenPaths.has(normalizedPath)) {
    return;
  }
  try {
    const metadata = await stat(normalizedPath);
    if (!metadata.isDirectory()) {
      return;
    }
  } catch {
    return;
  }
  seenPaths.add(normalizedPath);
  locations.push({ ...location, path: normalizedPath });
}

function readBoolean(value: unknown, key: string): boolean | null {
  const record = toRecord(value);
  if (!record || typeof record[key] !== "boolean") {
    return null;
  }
  return record[key];
}

function readNumber(value: unknown, key: string): number | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function readStringParam(
  value: unknown,
  inputKey: string,
  outputKey: string,
): AppServerParams {
  const next = readString(value, inputKey);
  return next ? { [outputKey]: next } : {};
}

function buildAgentAppRuntimeTaskMessage(
  request: Record<string, unknown>,
): string {
  const prompt =
    readString(request, "prompt") ??
    readString(request, "title") ??
    readRequiredString(request, "taskKind");
  return [
    "【Agent App Runtime Task】",
    `App: ${readRequiredString(request, "appId")}`,
    `Entry: ${readString(request, "entryKey") ?? "default"}`,
    `TaskKind: ${readRequiredString(request, "taskKind")}`,
    "",
    "Business Prompt:",
    prompt,
    "",
    "Runtime Boundary:",
    "- 请在 Lime AgentRuntime 主链中完成这个 App 业务任务。",
    "- 不要要求用户跳回通用 Chat；如需补充上下文，请通过可审计的 action / request 机制表达。",
    "",
    "Input JSON:",
    stringifyJsonField(request, "input"),
    "",
    "Expected Output JSON:",
    stringifyJsonField(request, "expectedOutput"),
  ].join("\n");
}

function stringifyJsonField(
  record: Record<string, unknown>,
  key: string,
): string {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return "{}";
  }
  try {
    return JSON.stringify(record[key], null, 2) ?? "{}";
  } catch {
    return String(record[key]);
  }
}

function sessionStatusToAgentAppTaskStatus(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "waitingAction":
      return "blocked";
    case "idle":
      return "idle";
    case "running":
      return "running";
    default:
      return "thread_read_available";
  }
}

function activeAgentSessionTurnId(
  response: AgentSessionReadResponse,
): string | null {
  for (let index = response.turns.length - 1; index >= 0; index -= 1) {
    const turn = response.turns[index];
    if (
      turn &&
      (turn.status === "accepted" ||
        turn.status === "queued" ||
        turn.status === "running" ||
        turn.status === "waitingAction")
    ) {
      return turn.turnId;
    }
  }
  return null;
}

function normalizeAgentSessionActionScope(
  value: unknown,
): Record<string, string> | undefined {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }
  const scope = {
    ...readStringParam(record, "sessionId", "sessionId"),
    ...readStringParam(record, "session_id", "sessionId"),
    ...readStringParam(record, "threadId", "threadId"),
    ...readStringParam(record, "thread_id", "threadId"),
    ...readStringParam(record, "turnId", "turnId"),
    ...readStringParam(record, "turn_id", "turnId"),
  };
  return Object.keys(scope).length > 0
    ? (scope as Record<string, string>)
    : undefined;
}

function isAppServerSessionAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof AppServerRequestError &&
    error.response.error.code === ERROR_CODES.sessionAlreadyExists
  );
}

function sessionReadToLegacy(
  response: AgentSessionReadResponse,
): Record<string, unknown> {
  const threadRead = threadReadFromAgentSessionRead(response);
  return {
    id: response.session.sessionId,
    thread_id: response.session.threadId,
    name: response.session.sessionId,
    created_at: timestampMillis(response.session.createdAt),
    updated_at: timestampMillis(response.session.updatedAt),
    model: undefined,
    workspace_id: response.session.workspaceId,
    messages: [],
    turns: response.turns,
    items: [],
    queued_turns: [],
    thread_read: threadRead,
    todo_items: [],
    child_subagent_sessions: [],
  };
}

function threadReadFromAgentSessionRead(
  response: AgentSessionReadResponse,
): Record<string, unknown> | null {
  const detail = toRecord(response.detail);
  const threadRead =
    toRecord(detail?.thread_read) ?? toRecord(detail?.threadRead);
  return threadRead;
}

function timestampMillis(value: string | undefined): number {
  if (!value) {
    return Date.now();
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  return Date.now();
}

function findProvider(
  providers: unknown[],
  providerId: string,
): Record<string, unknown> | null {
  const normalizedProviderId = normalizeProviderIdentity(providerId);
  if (!normalizedProviderId) {
    return null;
  }
  return (
    (providers.find((provider) => {
      const record = toRecord(provider);
      const id = normalizeProviderIdentity(readString(record, "id"));
      const name = normalizeProviderIdentity(readString(record, "name"));
      return (
        record && (id === normalizedProviderId || name === normalizedProviderId)
      );
    }) as Record<string, unknown> | undefined) ?? null
  );
}

function normalizeProviderIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveCurrentDefaultProvider(
  value: unknown,
  providers: unknown[],
): string {
  if (typeof value !== "string") {
    return readString(providers.find(isConfiguredProvider), "id") ?? "";
  }
  const provider = value.trim();
  const configuredProvider = findProvider(providers, provider);
  if (configuredProvider && isConfiguredProvider(configuredProvider)) {
    return readString(configuredProvider, "id") ?? provider;
  }
  return readString(providers.find(isConfiguredProvider), "id") ?? "";
}

function isConfiguredProvider(
  provider: unknown,
): provider is Record<string, unknown> {
  const record = toRecord(provider);
  if (!record) {
    return false;
  }
  const enabled = record.enabled !== false;
  const apiKeyCount = record.api_key_count;
  return enabled && typeof apiKeyCount === "number" && apiKeyCount > 0;
}

function skillToLocalSkill(skill: unknown): Record<string, unknown> {
  const record = toRecord(skill) ?? {};
  const localDirectoryPath =
    readString(record, "local_directory_path") ??
    readString(record, "localDirectoryPath");
  const directory =
    readString(record, "directory") ??
    readString(record, "name") ??
    readString(record, "skill_name") ??
    "app-server-skill";
  const name =
    readString(record, "display_name") ??
    readString(record, "displayName") ??
    readString(record, "name") ??
    readString(record, "skill_name") ??
    directory;
  return {
    key: directory,
    name,
    description: readString(record, "description") ?? "",
    directory,
    localDirectoryPath,
    installed: true,
    sourceKind: "builtin",
    catalogSource: "project",
    metadata: {},
    allowedTools: [],
    resourceSummary: {
      hasScripts: false,
      hasReferences: false,
      hasAssets: false,
    },
    standardCompliance: {
      isStandard: true,
      validationErrors: [],
      deprecatedFields: [],
    },
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeExperimentalConfig(value: unknown): Record<string, unknown> {
  const record = toRecord(value) ?? {};
  const webmcp = toRecord(record.webmcp);
  return {
    ...record,
    webmcp: {
      ...webmcp,
      enabled: readBoolean(webmcp, "enabled") ?? false,
    },
  };
}

function normalizeExternalUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch (error) {
    throw new Error(
      `外部链接格式无效: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("外部链接只支持 http/https 地址");
  }
  return parsed.toString();
}

function normalizeSystemSettingsUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch (error) {
    throw new Error(
      `系统设置链接格式无效: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    parsed.protocol !== "x-apple.systempreferences:" &&
    parsed.protocol !== "ms-settings:"
  ) {
    throw new Error(
      "系统设置链接只支持 x-apple.systempreferences 或 ms-settings scheme",
    );
  }
  return parsed.toString();
}

function normalizeCallbackBridgeValue(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function buildOemCloudOAuthCallbackPayload(
  requestUrl: URL,
): Record<string, string | null> {
  const params = requestUrl.searchParams;
  return {
    sourcePath: requestUrl.pathname,
    tenantId: normalizeCallbackBridgeValue(
      params.get("tenantId") ?? params.get("tenant_id"),
    ),
    token: normalizeCallbackBridgeValue(params.get("token")),
    next: normalizeCallbackBridgeValue(params.get("next")),
    error: normalizeCallbackBridgeValue(params.get("error")),
    deviceCode: normalizeCallbackBridgeValue(
      params.get("deviceCode") ?? params.get("device_code"),
    ),
    status: normalizeCallbackBridgeValue(params.get("status")),
  };
}

function shouldEmitOemCloudOAuthCallback(
  payload: Record<string, string | null>,
): boolean {
  return Boolean(
    payload.tenantId ||
    payload.token ||
    payload.error ||
    payload.deviceCode ||
    payload.status,
  );
}

function buildDefaultConfig(): Record<string, unknown> {
  return {
    server: {
      host: "127.0.0.1",
      port: 8787,
      api_key: "",
      response_cache: {
        enabled: true,
        ttl_secs: 600,
        max_entries: 200,
        max_body_bytes: 1048576,
        cacheable_status_codes: [200],
      },
      tls: { enable: false, cert_path: null, key_path: null },
    },
    default_provider: "openai",
    remote_management: {
      allow_remote: false,
      secret_key: null,
      disable_control_panel: false,
    },
    quota_exceeded: {
      switch_project: true,
      switch_preview_model: false,
      cooldown_seconds: 60,
    },
    ampcode: {
      upstream_url: null,
      model_mappings: [],
      restrict_management_to_localhost: true,
    },
    proxy_url: null,
    minimize_to_tray: false,
    language: "zh-CN",
    experimental: { webmcp: { enabled: false } },
    tool_calling: {
      enabled: true,
      dynamic_filtering: true,
      native_input_examples: false,
    },
    automation: {
      enabled: false,
      poll_interval_secs: 30,
      enable_history: true,
    },
    workspace_preferences: {
      schema_version: 3,
      media_defaults: {},
      service_models: {},
    },
    navigation: { schema_version: 3, enabled_items: [] },
    crash_reporting: {
      enabled: true,
      dsn: null,
      environment: "development",
      sample_rate: 1,
      send_pii: false,
    },
  };
}

type ElectronHostLogMethod = "log" | "error";
const CLOSED_OUTPUT_STREAM_ERROR_HANDLER_INSTALLED = Symbol.for(
  "lime.electron.hostCommands.closedOutputStreamErrorHandlerInstalled",
);

type ElectronHostOutputStream = {
  [CLOSED_OUTPUT_STREAM_ERROR_HANDLER_INSTALLED]?: boolean;
  on?: (event: "error", listener: (error: unknown) => void) => unknown;
};

function safeWriteElectronHostLog(
  method: ElectronHostLogMethod,
  ...args: unknown[]
): void {
  try {
    console[method](...args);
  } catch (error) {
    if (!isClosedOutputStreamError(error)) {
      throw error;
    }
  }
}

function installClosedOutputStreamErrorHandler(stream: unknown): void {
  if (!stream || typeof stream !== "object") {
    return;
  }

  const outputStream = stream as ElectronHostOutputStream;
  if (
    outputStream[CLOSED_OUTPUT_STREAM_ERROR_HANDLER_INSTALLED] ||
    typeof outputStream.on !== "function"
  ) {
    return;
  }

  Object.defineProperty(
    outputStream,
    CLOSED_OUTPUT_STREAM_ERROR_HANDLER_INSTALLED,
    {
      value: true,
    },
  );
  outputStream.on("error", (error: unknown) => {
    if (!isClosedOutputStreamError(error)) {
      throw error;
    }
  });
}

function isClosedOutputStreamError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  return (
    code === "EPIPE" ||
    code === "ERR_STREAM_DESTROYED" ||
    code === "ERR_STREAM_WRITE_AFTER_END"
  );
}

installClosedOutputStreamErrorHandler(process.stdout);
installClosedOutputStreamErrorHandler(process.stderr);
