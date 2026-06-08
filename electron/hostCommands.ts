/* global Buffer, process */
import { app, BrowserWindow, dialog, shell } from "./electronRuntime";
import {
  AppServerRequestError,
  ERROR_CODES,
  METHOD_AGENT_APP_SHELL_PREPARE,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  METHOD_AGENT_SESSION_LIST,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AGENT_SESSION_UPDATE,
  METHOD_CAPABILITY_LIST,
  METHOD_EVIDENCE_EXPORT,
  METHOD_MODEL_LIST,
  METHOD_MODEL_PREFERENCES_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_PROVIDER_CATALOG_LIST,
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_MODEL_SYNC_STATE_READ,
  METHOD_PROJECT_MEMORY_READ,
  METHOD_SKILL_LIST,
  METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
  METHOD_USAGE_STATS_MODEL_RANKING_LIST,
  METHOD_USAGE_STATS_READ,
  METHOD_WORKSPACE_BY_PATH_READ,
  METHOD_WORKSPACE_DEFAULT_ENSURE,
  METHOD_WORKSPACE_DEFAULT_READ,
  METHOD_WORKSPACE_ENSURE_READY,
  METHOD_WORKSPACE_LIST,
  METHOD_WORKSPACE_PROJECTS_ROOT_READ,
  METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
  METHOD_WORKSPACE_READ,
  METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
  type AgentAttachment,
  type AgentSessionActionRespondResponse,
  type AgentSessionListResponse,
  type AgentSessionOverview,
  type AgentSessionReadResponse,
  type AgentSessionStartResponse,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartResponse,
  type AgentSessionUpdateResponse,
  type AgentAppShellPrepareResponse,
  type AgentAppUiRuntimeStartParams,
  type AgentAppUiRuntimeStatusParams,
  type AgentAppUiRuntimeStatusResponse,
  type AgentAppUiRuntimeStopParams,
  type ArtifactSummary,
  type CapabilityDescriptor,
  type CapabilityListResponse,
  type EvidenceExportResponse,
  type ModelListResponse,
  type ModelPreferencesListResponse,
  type ModelProviderAliasListResponse,
  type ModelProviderAliasReadResponse,
  type ModelProviderCatalogListResponse,
  type ModelProviderListResponse,
  type ModelSyncStateReadResponse,
  type ProjectMemoryReadResponse,
  type SkillListResponse,
  type UsageStatsDailyTrendsListResponse,
  type UsageStatsModelRankingListResponse,
  type UsageStatsRangeParams,
  type UsageStatsReadResponse,
  type WorkspaceEnsureReadyResponse,
  type WorkspaceListResponse,
  type WorkspaceProjectPathResolveResponse,
  type WorkspaceProjectsRootReadResponse,
  type WorkspaceReadResponse,
  type WorkspaceSkillBindingsListResponse,
} from "app-server-client";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import type { ElectronAppServerHost } from "./appServerHost";

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
type UsageStatsSummaryWire = UsageStatsReadResponse["stats"];
type UsageStatsModelUsageWire =
  UsageStatsModelRankingListResponse["ranking"][number];
type UsageStatsDailyUsageWire =
  UsageStatsDailyTrendsListResponse["trends"][number];
type AgentAppShellPrepareFields = {
  descriptorVersion?: number;
  appId: string;
  installMode: string;
  shellKind: string;
  entryKey: string;
  windowTitle: string;
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

const CONFIG_FILE = "config.json";
const OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_EVENT = "oem-cloud-oauth-callback";
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
      case "reveal_in_finder":
        return this.#revealInFinder(args);
      case "open_with_default_app":
        return await this.#openWithDefaultApp(args);
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
      case "agent_runtime_list_sessions":
        return await this.#listAgentRuntimeSessions(args);
      case "agent_runtime_get_session":
        return await this.#getAgentRuntimeSession(args);
      case "agent_runtime_create_session":
        return await this.#createAgentRuntimeSession(args);
      case "agent_runtime_submit_turn":
        return await this.#submitAgentRuntimeTurn(args);
      case "agent_runtime_interrupt_turn":
        return await this.#interruptAgentRuntimeTurn(args);
      case "agent_runtime_update_session":
        return await this.#updateAgentRuntimeSession(args);
      case "agent_runtime_respond_action":
        return await this.#respondAgentRuntimeAction(args);
      case "agent_runtime_get_thread_read":
        return await this.#getAgentRuntimeThreadRead(args);
      case "agent_runtime_export_evidence_pack":
        return await this.#exportAgentRuntimeEvidencePack(args);
      case "agent_runtime_get_tool_inventory":
        return await this.#getAgentRuntimeToolInventory(args);
      case "agent_runtime_list_workspace_skill_bindings":
        return await this.#listWorkspaceSkillBindings(args);
      case "get_model_registry":
        return await this.#listModels();
      case "get_model_preferences":
        return await this.#listModelPreferences();
      case "get_model_sync_state":
        return await this.#readModelSyncState();
      case "get_model_registry_provider_ids":
        return await this.#listModelRegistryProviderIds();
      case "get_models_for_provider":
        return await this.#listModelsForProvider(args);
      case "get_models_by_tier":
        return await this.#listModelsByTier(args);
      case "get_provider_alias_config":
        return await this.#readProviderAliasConfig(args);
      case "get_all_alias_configs":
        return await this.#listProviderAliasConfigs();
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
      case "workspace_set_default":
        throw new Error(
          "workspace_set_default is not available in the Electron App Server adapter",
        );
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
      case "get_usage_stats":
        return await this.#getUsageStats(args);
      case "get_model_usage_ranking":
        return await this.#getModelUsageRanking(args);
      case "get_daily_usage_trends":
        return await this.#getDailyUsageTrends(args);
      case "get_voice_input_config":
        return this.#getVoiceInputConfig();
      case "get_voice_shortcut_runtime_status":
        return this.#getVoiceShortcutRuntimeStatus();
      case "get_asr_credentials":
        return this.#getAsrCredentials();
      case "list_audio_devices":
        return this.#emptyDiagnosticList("list_audio_devices");
      case "get_voice_instructions":
        return this.#getVoiceInstructions();
      case "voice_models_list_catalog":
        return this.#emptyDiagnosticList("voice_models_list_catalog");
      case "voice_models_get_install_state":
        return this.#getVoiceModelInstallState(args);
      case "get_environment_preview":
        return await this.#getEnvironmentPreview();
      case "unified_memory_stats":
        return this.#getUnifiedMemoryStats();
      case "site_get_adapter_catalog_status":
        return this.#getSiteAdapterCatalogStatus();
      case "site_list_adapters":
        return this.#emptyDiagnosticList("site_list_adapters");
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
      case "project_memory_get":
        return await this.#readProjectMemory(args);
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
    return buildAgentAppShellLaunchResult({
      fields,
      status: "launched",
      blockerCodes: [],
      message: "Agent App dev shell 已复用 current UI runtime 并打开独立窗口。",
      packageMount,
      runtimeStatus,
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
      submittedAt: new Date().toISOString(),
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

  async #saveExperimentalConfig(args: HostArgs): Promise<{ success: true }> {
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

  async #listAgentRuntimeSessions(args: HostArgs): Promise<unknown[]> {
    const request = readRequest(args);
    const params: AppServerParams = {
      ...readBooleanParam(request, "include_archived", "includeArchived"),
      ...readBooleanParam(request, "archived_only", "archivedOnly"),
      ...readStringParam(request, "workspace_id", "workspaceId"),
      ...readNumberParam(request, "limit", "limit"),
    };
    const response = await this.#appServerRequest<AgentSessionListResponse>(
      METHOD_AGENT_SESSION_LIST,
      params,
    );
    return response.sessions.map(sessionOverviewToLegacy);
  }

  async #getAgentRuntimeSession(args: HostArgs): Promise<unknown> {
    const request = readRequest(args);
    const sessionId =
      readString(request, "sessionId") ?? readString(request, "session_id");
    if (!sessionId) {
      throw new Error("agent_runtime_get_session requires sessionId");
    }
    const response = await this.#appServerRequest<AgentSessionReadResponse>(
      METHOD_AGENT_SESSION_READ,
      {
        sessionId,
        ...readNumberParam(request, "historyLimit", "historyLimit"),
        ...readNumberParam(request, "history_limit", "historyLimit"),
        ...readNumberParam(request, "historyOffset", "historyOffset"),
        ...readNumberParam(request, "history_offset", "historyOffset"),
        ...readNumberParam(
          request,
          "historyBeforeMessageId",
          "historyBeforeMessageId",
        ),
        ...readNumberParam(
          request,
          "history_before_message_id",
          "historyBeforeMessageId",
        ),
      },
    );
    return response.detail ?? sessionReadToLegacy(response);
  }

  async #createAgentRuntimeSession(args: HostArgs): Promise<string> {
    const request = readRequest(args);
    const workspaceId =
      readString(request, "workspaceId") ?? readString(request, "workspace_id");
    if (!workspaceId) {
      throw new Error("agent_runtime_create_session requires workspaceId");
    }
    const name = readString(request, "name") ?? "新对话";
    const optionMetadata = readRecord(request, "metadata") ?? {};
    const executionStrategy =
      readString(request, "executionStrategy") ??
      readString(request, "execution_strategy") ??
      undefined;
    const response = await this.#appServerRequest<AgentSessionStartResponse>(
      METHOD_AGENT_SESSION_START,
      {
        appId: "desktop",
        workspaceId,
        businessObjectRef: {
          kind: "agent.session",
          id: `agent-session:${workspaceId}:${Date.now()}`,
          title: name,
          metadata: {
            ...optionMetadata,
            title: name,
            executionStrategy,
            ...(readBoolean(request, "runStartHooks") === false
              ? { runStartHooks: false }
              : {}),
          },
        },
      },
    );
    return response.session.sessionId;
  }

  async #submitAgentRuntimeTurn(args: HostArgs): Promise<void> {
    const request = readRequest(args);
    const sessionId =
      readString(request, "session_id") ?? readString(request, "sessionId");
    const message = readString(request, "message") ?? "";
    if (!sessionId) {
      throw new Error("agent_runtime_submit_turn requires session_id");
    }
    if (!message.trim()) {
      throw new Error("agent_runtime_submit_turn requires message");
    }

    const turnConfig =
      readRecord(request, "turn_config") ?? readRecord(request, "turnConfig");
    const metadata = readRecord(turnConfig, "metadata") ?? undefined;
    const providerPreference =
      readString(turnConfig, "provider_preference") ??
      readString(turnConfig, "providerPreference") ??
      undefined;
    const modelPreference =
      readString(turnConfig, "model_preference") ??
      readString(turnConfig, "modelPreference") ??
      undefined;
    const asterChatRequest = buildAgentRuntimeAsterChatRequest({
      request,
      sessionId,
      message,
      turnConfig,
      providerPreference,
      modelPreference,
    });
    await this.#appServerRequest<AgentSessionTurnStartResponse>(
      METHOD_AGENT_SESSION_TURN_START,
      {
        sessionId,
        ...readStringParam(request, "turn_id", "turnId"),
        ...readStringParam(request, "turnId", "turnId"),
        input: {
          text: message,
          attachments: normalizeAgentAttachments(readArray(request, "images")),
        },
        runtimeOptions: {
          stream: true,
          eventName:
            readString(request, "event_name") ??
            readString(request, "eventName") ??
            `agentSession/event/${sessionId}`,
          providerPreference,
          modelPreference,
          metadata,
          queuedTurnId:
            readString(request, "queued_turn_id") ??
            readString(request, "queuedTurnId") ??
            undefined,
          hostOptions: {
            asterChatRequest,
            agentRuntimeSubmitTurnRequest: request,
          },
        },
        queueIfBusy:
          readBoolean(request, "queue_if_busy") ??
          readBoolean(request, "queueIfBusy") ??
          false,
        skipPreSubmitResume:
          readBoolean(request, "skip_pre_submit_resume") ??
          readBoolean(request, "skipPreSubmitResume") ??
          false,
      },
    );
  }

  async #interruptAgentRuntimeTurn(args: HostArgs): Promise<boolean> {
    const request = readRequest(args);
    const sessionId =
      readString(request, "session_id") ?? readString(request, "sessionId");
    const turnId =
      readString(request, "turn_id") ?? readString(request, "turnId");
    if (!sessionId || !turnId) {
      throw new Error(
        "agent_runtime_interrupt_turn requires session_id and turn_id",
      );
    }
    await this.#appServerRequest<AgentSessionTurnCancelResponse>(
      METHOD_AGENT_SESSION_TURN_CANCEL,
      { sessionId, turnId },
    );
    return true;
  }

  async #updateAgentRuntimeSession(args: HostArgs): Promise<void> {
    const request = readRequest(args);
    const sessionId =
      readString(request, "session_id") ?? readString(request, "sessionId");
    if (!sessionId) {
      throw new Error("agent_runtime_update_session requires session_id");
    }
    await this.#appServerRequest<AgentSessionUpdateResponse>(
      METHOD_AGENT_SESSION_UPDATE,
      {
        sessionId,
        ...readStringParam(request, "name", "title"),
        ...readStringParam(request, "title", "title"),
        ...readBooleanParam(request, "archived", "archived"),
        ...readBooleanParam(request, "isArchived", "archived"),
        ...readStringParam(request, "provider_selector", "providerSelector"),
        ...readStringParam(request, "providerSelector", "providerSelector"),
        ...readStringParam(request, "provider_name", "providerName"),
        ...readStringParam(request, "providerName", "providerName"),
        ...readStringParam(request, "model_name", "modelName"),
        ...readStringParam(request, "modelName", "modelName"),
        ...readStringParam(request, "execution_strategy", "executionStrategy"),
        ...readStringParam(request, "executionStrategy", "executionStrategy"),
        ...readStringParam(request, "recent_access_mode", "recentAccessMode"),
        ...readStringParam(request, "recentAccessMode", "recentAccessMode"),
        ...readValueParam(request, "recent_preferences", "recentPreferences"),
        ...readValueParam(request, "recentPreferences", "recentPreferences"),
        ...readValueParam(
          request,
          "recent_team_selection",
          "recentTeamSelection",
        ),
        ...readValueParam(
          request,
          "recentTeamSelection",
          "recentTeamSelection",
        ),
      },
    );
  }

  async #respondAgentRuntimeAction(args: HostArgs): Promise<void> {
    const request = readRequest(args);
    const sessionId =
      readString(request, "session_id") ?? readString(request, "sessionId");
    const requestId =
      readString(request, "request_id") ?? readString(request, "requestId");
    const actionType =
      readString(request, "action_type") ??
      readString(request, "actionType") ??
      "tool_confirmation";
    if (!sessionId || !requestId) {
      throw new Error(
        "agent_runtime_respond_action requires session_id and request_id",
      );
    }
    await this.#appServerRequest(METHOD_AGENT_SESSION_ACTION_RESPOND, {
      sessionId,
      requestId,
      actionType,
      confirmed: readBoolean(request, "confirmed") ?? false,
      ...readStringParam(request, "response", "response"),
      userData: request.user_data ?? request.userData,
      metadata: request.metadata,
      ...readStringParam(request, "event_name", "eventName"),
      ...readStringParam(request, "eventName", "eventName"),
      actionScope: request.action_scope ?? request.actionScope,
    });
  }

  async #getAgentRuntimeThreadRead(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const sessionId =
      readString(request, "sessionId") ?? readString(request, "session_id");
    if (!sessionId) {
      throw new Error("agent_runtime_get_thread_read requires sessionId");
    }
    const response = await this.#appServerRequest<AgentSessionReadResponse>(
      METHOD_AGENT_SESSION_READ,
      { sessionId },
    );
    const threadRead = threadReadFromAgentSessionRead(response);
    if (threadRead) {
      return threadRead;
    }
    return {
      session_id: response.session.sessionId,
      thread_id: response.session.threadId,
      turns: response.turns,
      pending_requests: [],
      queued_turns: [],
      diagnostics: null,
    };
  }

  async #exportAgentRuntimeEvidencePack(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const sessionId =
      readString(request, "sessionId") ?? readString(request, "session_id");
    if (!sessionId) {
      throw new Error("agent_runtime_export_evidence_pack requires sessionId");
    }
    const turnId =
      readString(request, "turnId") ?? readString(request, "turn_id");
    const response = await this.#appServerRequest<EvidenceExportResponse>(
      METHOD_EVIDENCE_EXPORT,
      {
        sessionId,
        ...(turnId ? { turnId } : {}),
        includeEvents: true,
        includeArtifacts: true,
        includeEvidencePack: true,
      },
    );
    return evidenceExportToLegacy(response);
  }

  async #listModelProviders(): Promise<unknown[]> {
    const response = await this.#appServerRequest<ModelProviderListResponse>(
      METHOD_MODEL_PROVIDER_LIST,
    );
    return response.providers;
  }

  async #listModels(params: AppServerParams = {}): Promise<unknown[]> {
    const response = await this.#appServerRequest<ModelListResponse>(
      METHOD_MODEL_LIST,
      params,
    );
    return response.models;
  }

  async #listModelPreferences(): Promise<unknown[]> {
    const response = await this.#appServerRequest<ModelPreferencesListResponse>(
      METHOD_MODEL_PREFERENCES_LIST,
    );
    return response.preferences;
  }

  async #readModelSyncState(): Promise<unknown> {
    const response = await this.#appServerRequest<ModelSyncStateReadResponse>(
      METHOD_MODEL_SYNC_STATE_READ,
    );
    return response.syncState;
  }

  async #listModelRegistryProviderIds(): Promise<string[]> {
    await this.#appServerRequest<ModelProviderCatalogListResponse>(
      METHOD_MODEL_PROVIDER_CATALOG_LIST,
    );
    return [];
  }

  async #listModelsForProvider(args: HostArgs): Promise<unknown[]> {
    const request = readRequest(args);
    const providerId =
      readString(request, "providerId") ?? readString(request, "provider_id");
    if (!providerId) {
      return [];
    }
    return await this.#listModels({ providerId });
  }

  async #listModelsByTier(args: HostArgs): Promise<unknown[]> {
    const request = readRequest(args);
    const tier = readString(request, "tier");
    if (!tier) {
      return [];
    }
    return await this.#listModels({ tier });
  }

  async #readProviderAliasConfig(args: HostArgs): Promise<unknown | null> {
    const request = readRequest(args);
    const provider = readString(request, "provider");
    if (!provider) {
      return null;
    }
    const response =
      await this.#appServerRequest<ModelProviderAliasReadResponse>(
        METHOD_MODEL_PROVIDER_ALIAS_READ,
        { provider },
      );
    return response.config ?? null;
  }

  async #listProviderAliasConfigs(): Promise<Record<string, unknown>> {
    const response =
      await this.#appServerRequest<ModelProviderAliasListResponse>(
        METHOD_MODEL_PROVIDER_ALIAS_LIST,
      );
    return response.configs;
  }

  async #getAgentRuntimeToolInventory(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const caller = readString(request, "caller") ?? "assistant";
    const surface = {
      workbench: readBoolean(request, "workbench") ?? false,
      browser_assist:
        readBoolean(request, "browserAssist") ??
        readBoolean(request, "browser_assist") ??
        false,
    };
    const response = await this.#appServerRequest<CapabilityListResponse>(
      METHOD_CAPABILITY_LIST,
      {
        ...readStringParam(request, "appId", "appId"),
        ...readStringParam(request, "app_id", "appId"),
        ...readStringParam(request, "workspaceId", "workspaceId"),
        ...readStringParam(request, "workspace_id", "workspaceId"),
        ...readStringParam(request, "sessionId", "sessionId"),
        ...readStringParam(request, "session_id", "sessionId"),
      },
    );
    return capabilitiesToToolInventory(response.capabilities, caller, surface);
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

  async #listWorkspaceSkillBindings(args: HostArgs): Promise<unknown> {
    const request = readRequest(args);
    const workspaceRoot =
      readString(request, "workspaceRoot") ??
      readString(request, "workspace_root") ??
      readString(args, "workspaceRoot") ??
      readString(args, "workspace_root");
    if (!workspaceRoot) {
      throw new Error(
        "agent_runtime_list_workspace_skill_bindings requires workspaceRoot",
      );
    }
    const response =
      await this.#appServerRequest<WorkspaceSkillBindingsListResponse>(
        METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
        {
          workspaceRoot,
          ...readStringParam(request, "caller", "caller"),
          ...readBooleanParam(request, "workbench", "workbench"),
          ...readBooleanParam(request, "browserAssist", "browserAssist"),
          ...readBooleanParam(request, "browser_assist", "browserAssist"),
        },
      );
    return response.bindings;
  }

  async #getUsageStats(args: HostArgs): Promise<Record<string, unknown>> {
    const response = await this.#appServerRequest<UsageStatsReadResponse>(
      METHOD_USAGE_STATS_READ,
      readUsageStatsParams(args),
    );
    return toLegacyUsageStats(response.stats);
  }

  async #getModelUsageRanking(args: HostArgs): Promise<unknown[]> {
    const response =
      await this.#appServerRequest<UsageStatsModelRankingListResponse>(
        METHOD_USAGE_STATS_MODEL_RANKING_LIST,
        readUsageStatsParams(args),
      );
    return response.ranking.map(toLegacyModelUsage);
  }

  async #getDailyUsageTrends(args: HostArgs): Promise<unknown[]> {
    const response =
      await this.#appServerRequest<UsageStatsDailyTrendsListResponse>(
        METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
        readUsageStatsParams(args),
      );
    return response.trends.map(toLegacyDailyUsage);
  }

  #getVoiceInputConfig(): Record<string, unknown> {
    const instructions = this.#getVoiceInstructions();
    return {
      enabled: false,
      shortcut: "CommandOrControl+Shift+V",
      processor: {
        polish_enabled: true,
        polish_provider: "openai",
        polish_model: "gpt-4.1-mini",
        default_instruction_id: "default",
      },
      output: {
        mode: "type",
        type_delay_ms: 10,
      },
      instructions,
      selected_device_id: undefined,
      sound_enabled: true,
      translate_instruction_id: "translate_en",
      diagnostic: this.#diagnosticMeta("get_voice_input_config"),
    };
  }

  #getVoiceShortcutRuntimeStatus(): Record<string, unknown> {
    return {
      shortcut_registered: false,
      registered_shortcut: null,
      fn_supported: process.platform === "darwin",
      fn_registered: false,
      fn_fallback_shortcut: "CommandOrControl+Shift+V",
      fn_note:
        "Electron current 语音快捷键运行时尚未接入；当前使用普通语音快捷键回退。",
      diagnostic: this.#diagnosticMeta("get_voice_shortcut_runtime_status"),
    };
  }

  #getAsrCredentials(): Array<Record<string, unknown>> {
    return this.#emptyDiagnosticList("get_asr_credentials");
  }

  #getVoiceInstructions(): Array<Record<string, unknown>> {
    return [
      {
        id: "default",
        name: "默认润色",
        prompt: "{{text}}",
        is_preset: true,
      },
      {
        id: "translate_en",
        name: "翻译为英文",
        prompt: "{{text}}",
        is_preset: true,
      },
      {
        id: "raw",
        name: "原始输出",
        prompt: "{{text}}",
        is_preset: true,
      },
    ];
  }

  #getVoiceModelInstallState(args: HostArgs): Record<string, unknown> {
    const request = readRequest(args);
    const modelId =
      readString(request, "modelId") ??
      readString(request, "model_id") ??
      "sensevoice-small-int8-2024-07-17";
    const installDir = path.join(this.#userDataDir, "models", "voice", modelId);
    return {
      model_id: modelId,
      installed: false,
      installing: false,
      install_dir: installDir,
      model_file: null,
      tokens_file: null,
      vad_file: null,
      installed_bytes: 0,
      last_verified_at: Math.floor(Date.now() / 1000),
      missing_files: ["model.int8.onnx", "tokens.txt", "silero_vad.onnx"],
      default_credential_id: null,
      diagnostic: this.#diagnosticMeta("voice_models_get_install_state"),
    };
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
        diagnostic: this.#diagnosticMeta("get_environment_preview"),
      },
      entries,
      diagnostic: this.#diagnosticMeta("get_environment_preview"),
    };
  }

  #getUnifiedMemoryStats(): Record<string, unknown> {
    return {
      total_entries: 0,
      storage_used: 0,
      memory_count: 0,
      categories: [
        { category: "identity", count: 0 },
        { category: "context", count: 0 },
        { category: "preference", count: 0 },
        { category: "experience", count: 0 },
        { category: "activity", count: 0 },
      ],
      diagnostic: this.#diagnosticMeta("unified_memory_stats"),
    };
  }

  #getSiteAdapterCatalogStatus(): Record<string, unknown> {
    return {
      exists: false,
      source_kind: "bundled",
      registry_version: 1,
      directory: path.join(this.#userDataDir, "site-adapters", "server-synced"),
      adapter_count: 0,
      diagnostic: this.#diagnosticMeta("site_get_adapter_catalog_status"),
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

  async #readProjectMemory(args: HostArgs): Promise<unknown> {
    const request = readRequest(args);
    const projectId =
      readString(request, "projectId") ??
      readString(request, "project_id") ??
      readString(args, "projectId") ??
      readString(args, "project_id");
    if (!projectId) {
      throw new Error("project_memory_get requires projectId");
    }
    const response = await this.#appServerRequest<ProjectMemoryReadResponse>(
      METHOD_PROJECT_MEMORY_READ,
      { projectId },
    );
    return response.memory;
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

  async #saveConfig(args: HostArgs): Promise<{ success: true }> {
    const config = readRecord(args, "config") ?? args ?? {};
    await mkdir(this.#userDataDir, { recursive: true });
    await writeFile(
      this.#configPath(),
      JSON.stringify(config, null, 2),
      "utf8",
    );
    return { success: true };
  }

  #reportFrontendDebugLog(args: HostArgs): void {
    const report = readRecord(args, "report");
    const level = readString(report, "level") ?? "info";
    const message = readString(report, "message") ?? "";
    console.log(`[electron-renderer:${level}] ${message}`);
  }

  #reportFrontendCrash(args: HostArgs): void {
    const report = readRecord(args, "report") ?? {};
    const message = readString(report, "message") ?? "renderer crash report";
    console.error("[electron-renderer:crash]", message, report);
  }

  #configPath(): string {
    return path.join(this.#userDataDir, CONFIG_FILE);
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
    shellWindow: params.shellWindow,
    launchedAt: params.launchedAt,
  };
}

function readUsageStatsParams(args: HostArgs): UsageStatsRangeParams {
  const request = readRequest(args);
  const timeRange =
    readString(request, "timeRange") ??
    readString(request, "time_range") ??
    readString(args, "timeRange") ??
    readString(args, "time_range") ??
    "month";
  return { timeRange };
}

function toLegacyUsageStats(
  stats: UsageStatsSummaryWire,
): Record<string, unknown> {
  return {
    total_conversations: stats.totalConversations,
    total_messages: stats.totalMessages,
    total_tokens: stats.totalTokens,
    total_time_minutes: stats.totalTimeMinutes,
    monthly_conversations: stats.monthlyConversations,
    monthly_messages: stats.monthlyMessages,
    monthly_tokens: stats.monthlyTokens,
    today_conversations: stats.todayConversations,
    today_messages: stats.todayMessages,
    today_tokens: stats.todayTokens,
  };
}

function toLegacyModelUsage(
  item: UsageStatsModelUsageWire,
): Record<string, unknown> {
  return {
    model: item.model,
    conversations: item.conversations,
    tokens: item.tokens,
    percentage: item.percentage,
  };
}

function toLegacyDailyUsage(
  item: UsageStatsDailyUsageWire,
): Record<string, unknown> {
  return {
    date: item.date,
    conversations: item.conversations,
    tokens: item.tokens,
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

function readRequiredString(value: unknown, key: string): string {
  const next = readString(value, key);
  if (!next) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
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

function readBooleanParam(
  value: unknown,
  inputKey: string,
  outputKey: string,
): AppServerParams {
  const record = toRecord(value);
  if (!record || typeof record[inputKey] !== "boolean") {
    return {};
  }
  return { [outputKey]: record[inputKey] };
}

function readStringParam(
  value: unknown,
  inputKey: string,
  outputKey: string,
): AppServerParams {
  const next = readString(value, inputKey);
  return next ? { [outputKey]: next } : {};
}

function readNumberParam(
  value: unknown,
  inputKey: string,
  outputKey: string,
): AppServerParams {
  const record = toRecord(value);
  if (!record) {
    return {};
  }
  const next = record[inputKey];
  if (typeof next !== "number" || !Number.isFinite(next) || next < 0) {
    return {};
  }
  return { [outputKey]: Math.trunc(next) };
}

function readValueParam(
  value: unknown,
  inputKey: string,
  outputKey: string,
): AppServerParams {
  const record = toRecord(value);
  if (!record || record[inputKey] === undefined) {
    return {};
  }
  return { [outputKey]: record[inputKey] };
}

function buildAgentRuntimeAsterChatRequest(params: {
  request: Record<string, unknown>;
  sessionId: string;
  message: string;
  turnConfig: Record<string, unknown> | null;
  providerPreference?: string;
  modelPreference?: string;
}): Record<string, unknown> {
  const { request, sessionId, message, turnConfig } = params;
  const eventName =
    readString(request, "event_name") ??
    readString(request, "eventName") ??
    `agentSession/event/${sessionId}`;
  return {
    message,
    session_id: sessionId,
    event_name: eventName,
    images: readArray(request, "images") ?? null,
    provider_config:
      turnConfig?.provider_config ?? turnConfig?.providerConfig ?? null,
    provider_preference: params.providerPreference,
    model_preference: params.modelPreference,
    reasoning_effort:
      turnConfig?.reasoning_effort ?? turnConfig?.reasoningEffort ?? null,
    thinking_enabled:
      turnConfig?.thinking_enabled ?? turnConfig?.thinkingEnabled ?? null,
    approval_policy:
      turnConfig?.approval_policy ?? turnConfig?.approvalPolicy ?? null,
    sandbox_policy:
      turnConfig?.sandbox_policy ?? turnConfig?.sandboxPolicy ?? null,
    workspace_id:
      readString(request, "workspace_id") ??
      readString(request, "workspaceId") ??
      "",
    web_search: turnConfig?.web_search ?? turnConfig?.webSearch ?? null,
    search_mode: turnConfig?.search_mode ?? turnConfig?.searchMode ?? null,
    execution_strategy:
      turnConfig?.execution_strategy ?? turnConfig?.executionStrategy ?? null,
    auto_continue:
      turnConfig?.auto_continue ?? turnConfig?.autoContinue ?? null,
    system_prompt:
      turnConfig?.system_prompt ?? turnConfig?.systemPrompt ?? null,
    metadata: turnConfig?.metadata ?? null,
    turn_id: readString(request, "turn_id") ?? readString(request, "turnId"),
    queue_if_busy:
      readBoolean(request, "queue_if_busy") ??
      readBoolean(request, "queueIfBusy") ??
      false,
    queued_turn_id:
      readString(request, "queued_turn_id") ??
      readString(request, "queuedTurnId") ??
      null,
    turn_config: turnConfig,
  };
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

function sessionOverviewToLegacy(
  session: AgentSessionOverview,
): Record<string, unknown> {
  return {
    id: session.sessionId,
    thread_id: session.threadId ?? session.sessionId,
    name: session.title ?? undefined,
    created_at: timestampMillis(session.createdAt),
    updated_at: timestampMillis(session.updatedAt),
    archived_at: session.archivedAt
      ? timestampMillis(session.archivedAt)
      : null,
    model: session.model,
    workspace_id: session.workspaceId,
    working_dir: session.workingDir,
    execution_strategy: session.executionStrategy,
    messages_count: session.messagesCount,
  };
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

function normalizeAgentAttachments(
  images?: unknown[],
): AgentAttachment[] | undefined {
  if (!images?.length) {
    return undefined;
  }

  const attachments = images
    .map((image, index): AgentAttachment | null => {
      const record = toRecord(image);
      if (!record) {
        return null;
      }
      const uri = readString(record, "data") ?? readString(record, "uri");
      if (!uri) {
        return null;
      }
      return {
        kind: "image",
        uri,
        metadata: {
          mediaType:
            readString(record, "media_type") ?? readString(record, "mediaType"),
          index,
        },
      };
    })
    .filter((attachment): attachment is AgentAttachment => attachment !== null);

  return attachments.length > 0 ? attachments : undefined;
}

function evidenceExportToLegacy(
  response: EvidenceExportResponse,
): Record<string, unknown> {
  const pack = response.evidencePack;
  const latestTurn =
    response.turns.length > 0
      ? response.turns[response.turns.length - 1]
      : undefined;
  const observabilitySummary =
    pack?.observabilitySummary ??
    observabilitySummaryFromEvidenceEvents(response.events);
  const workspaceRoot =
    readString(
      toRecord(response.session.businessObjectRef?.metadata),
      "workspaceRoot",
    ) ??
    readString(
      toRecord(response.session.businessObjectRef?.metadata),
      "workspace_root",
    ) ??
    "";

  return {
    sessionId: response.session.sessionId,
    threadId: response.session.threadId,
    workspaceId: response.session.workspaceId,
    workspaceRoot,
    packRelativeRoot: pack?.packRelativeRoot ?? "",
    packAbsoluteRoot: pack?.packAbsoluteRoot ?? "",
    exportedAt: pack?.exportedAt ?? response.exportedAt,
    threadStatus: pack?.threadStatus ?? response.session.status,
    latestTurnStatus: pack?.latestTurnStatus ?? latestTurn?.status,
    turnCount: pack?.turnCount ?? response.turns.length,
    itemCount: pack?.itemCount ?? response.events.length,
    pendingRequestCount: pack?.pendingRequestCount ?? 0,
    queuedTurnCount:
      pack?.queuedTurnCount ??
      response.turns.filter((turn) => turn.status === "queued").length,
    recentArtifactCount: pack?.recentArtifactCount ?? response.artifacts.length,
    knownGaps: pack?.knownGaps ?? [],
    observabilitySummary,
    completionAuditSummary: pack?.completionAuditSummary,
    artifacts:
      pack?.artifacts ??
      response.artifacts.map(artifactSummaryToEvidenceArtifact),
  };
}

function observabilitySummaryFromEvidenceEvents(
  events: EvidenceExportResponse["events"],
): Record<string, unknown> | undefined {
  const toolCalls = toolCallsFromEvidenceEvents(events);
  if (toolCalls.length === 0) {
    return undefined;
  }

  return {
    schemaVersion: "runtime-evidence-observability.v1",
    toolCalls,
  };
}

function toolCallsFromEvidenceEvents(
  events: EvidenceExportResponse["events"],
): Array<Record<string, unknown>> {
  const calls: Array<Record<string, unknown>> = [];
  for (const event of events) {
    for (const next of toolCallProjectionsFromEvidenceEvent(event)) {
      mergeToolCallProjection(calls, next);
    }
  }
  return calls;
}

function toolCallProjectionsFromEvidenceEvent(
  event: EvidenceExportResponse["events"][number],
): Array<Record<string, unknown>> {
  const type = String(event.type || "");
  const payload = toRecord(event.payload) ?? {};
  const runtimeEvent = toRecord(payload.runtimeEvent);
  const item = toRecord(payload.item) ?? toRecord(runtimeEvent?.item);
  const result = toRecord(payload.result) ?? toRecord(runtimeEvent?.result);
  const projections: Array<Record<string, unknown>> = [];
  const status = toolCallStatusFromEvidenceEvent(type, item);

  if (status) {
    const success =
      readBoolean(payload, "success") ??
      readBoolean(runtimeEvent, "success") ??
      readBoolean(item, "success") ??
      readBoolean(result, "success") ??
      (status === "failed" ? false : undefined);
    projections.push(
      omitNullishRecord({
        id:
          readToolCallId(payload) ??
          readToolCallId(runtimeEvent) ??
          readToolCallId(item) ??
          readToolCallId(result),
        toolName:
          readToolName(payload) ??
          readToolName(runtimeEvent) ??
          readToolName(item) ??
          readToolName(result),
        status,
        success,
        output:
          readToolOutput(item) ??
          readToolOutput(result) ??
          readToolOutput(payload) ??
          readToolOutput(runtimeEvent),
        error:
          payload.error ?? runtimeEvent?.error ?? item?.error ?? result?.error,
        eventId: event.eventId,
        turnId: event.turnId,
        timestamp: event.timestamp,
      }),
    );
  }

  for (const content of toolMessageContentRecords(payload, runtimeEvent)) {
    const contentType = readString(content, "type");
    if (contentType !== "tool_request" && contentType !== "tool_response") {
      continue;
    }
    projections.push(
      omitNullishRecord({
        id: readToolCallId(content),
        toolName: readToolName(content),
        status: contentType === "tool_response" ? "completed" : "running",
        success: readBoolean(content, "success"),
        output: readToolOutput(content),
        error: content.error,
        eventId: event.eventId,
        turnId: event.turnId,
        timestamp: event.timestamp,
      }),
    );
  }

  return projections;
}

function toolCallStatusFromEvidenceEvent(
  type: string,
  item: Record<string, unknown> | null,
): string | null {
  if (type === "tool.started") {
    return "running";
  }
  if (type === "tool.result") {
    return "completed";
  }
  if (type === "tool.failed") {
    return "failed";
  }
  if (item && readString(item, "type") === "tool_call") {
    if (type === "item.started") {
      return "running";
    }
    if (type === "item.completed") {
      return readString(item, "status") ?? "completed";
    }
  }
  return null;
}

function mergeToolCallProjection(
  calls: Array<Record<string, unknown>>,
  next: Record<string, unknown>,
): void {
  const id = readString(next, "id");
  const toolName = readString(next, "toolName");
  const existing = calls.find((call) => {
    if (id && readString(call, "id") === id) {
      return true;
    }
    return (
      !id &&
      Boolean(toolName) &&
      readString(call, "toolName") === toolName &&
      readString(call, "turnId") === readString(next, "turnId")
    );
  });
  const normalizedNext = omitNullishRecord({
    id: id ?? existing?.id ?? readString(next, "eventId"),
    ...next,
  });
  if (existing) {
    Object.assign(existing, normalizedNext);
  } else {
    calls.push(normalizedNext);
  }
}

function readToolCallId(record: Record<string, unknown> | null): string | null {
  return (
    readString(record, "id") ??
    readString(record, "tool_call_id") ??
    readString(record, "toolCallId") ??
    readString(record, "toolId") ??
    readString(record, "tool_id")
  );
}

function readToolName(record: Record<string, unknown> | null): string | null {
  return (
    readString(record, "tool_name") ??
    readString(record, "toolName") ??
    readString(record, "name")
  );
}

function readToolOutput(record: Record<string, unknown> | null): unknown {
  if (!record) {
    return undefined;
  }
  return (
    readString(record, "output") ??
    readString(record, "output_preview") ??
    readString(record, "outputPreview") ??
    readString(record, "text") ??
    readString(record, "content") ??
    readString(record, "result") ??
    record.output ??
    record.output_preview ??
    record.outputPreview ??
    record.text ??
    record.content ??
    record.result
  );
}

function toolMessageContentRecords(
  payload: Record<string, unknown>,
  runtimeEvent: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  const content =
    readArray(readRecord(payload, "message"), "content") ??
    readArray(readRecord(runtimeEvent, "message"), "content") ??
    [];
  return content
    .map((entry) => toRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function omitNullishRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}

function artifactSummaryToEvidenceArtifact(
  artifact: ArtifactSummary,
): Record<string, unknown> {
  const relativePath = artifact.path ?? artifact.artifactRef;
  return {
    kind: artifact.kind ?? "artifacts",
    title: artifact.title ?? artifact.artifactId ?? artifact.artifactRef,
    relativePath,
    absolutePath: "",
    bytes:
      typeof artifact.content === "string"
        ? Buffer.byteLength(artifact.content)
        : 0,
  };
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

function capabilitiesToToolInventory(
  capabilities: CapabilityDescriptor[],
  caller: string,
  surface: { workbench: boolean; browser_assist: boolean },
): Record<string, unknown> {
  const runtimeTools = capabilities.flatMap((capability) =>
    capabilityRuntimeToolNames(capability).map((name) => ({
      name,
      description: capability.description ?? capability.title,
      source_kind: "current_surface",
      source_label: capability.id,
      status: "available",
      deferred_loading: false,
      always_visible: true,
      allowed_callers: [caller],
      tags: [capability.id],
      input_examples_count: 0,
      caller_allowed: true,
      visible_in_context: true,
    })),
  );
  const defaultAllowedTools = runtimeTools.map((entry) => entry.name).sort();

  return {
    request: {
      caller,
      surface,
    },
    agent_initialized: true,
    warnings: [
      "当前工具库存来自 App Server capability/list；细粒度工具权限 catalog 尚未迁入 App Server protocol。",
    ],
    mcp_servers: [],
    default_allowed_tools: defaultAllowedTools,
    counts: {
      catalog_total: 0,
      catalog_current_total: 0,
      catalog_compat_total: 0,
      catalog_deprecated_total: 0,
      default_allowed_total: defaultAllowedTools.length,
      runtime_total: runtimeTools.length,
      runtime_visible_total: runtimeTools.length,
      registry_total: 0,
      registry_visible_total: 0,
      registry_catalog_unmapped_total: 0,
      extension_surface_total: 0,
      extension_mcp_bridge_total: 0,
      extension_runtime_total: 0,
      extension_tool_total: 0,
      extension_tool_visible_total: 0,
      mcp_server_total: 0,
      mcp_tool_total: 0,
      mcp_tool_visible_total: 0,
    },
    catalog_tools: [],
    registry_tools: [],
    runtime_tools: runtimeTools,
    extension_surfaces: [],
    extension_tools: [],
    mcp_tools: [],
  };
}

function capabilityRuntimeToolNames(
  capability: CapabilityDescriptor,
): string[] {
  const toolName = capabilityToolName(capability);
  if (toolName) {
    return [toolName];
  }
  return capability.methods;
}

function capabilityToolName(capability: CapabilityDescriptor): string | null {
  const id = capability.id.trim();
  if (!id.startsWith("tool.")) {
    return null;
  }
  const title = capability.title.trim();
  if (title) {
    return title;
  }
  return id.slice("tool.".length).trim() || null;
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
      companion_defaults: {},
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
