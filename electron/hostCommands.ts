import { app } from "electron";
import {
  METHOD_AGENT_APP_INSTALLED_LIST,
  METHOD_AGENT_SESSION_LIST,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AUTOMATION_JOB_LIST,
  METHOD_CAPABILITY_LIST,
  METHOD_EVIDENCE_EXPORT,
  METHOD_KNOWLEDGE_PACK_LIST,
  METHOD_MODEL_LIST,
  METHOD_MODEL_PREFERENCES_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_PROVIDER_CATALOG_LIST,
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_MODEL_SYNC_STATE_READ,
  METHOD_PROJECT_MEMORY_READ,
  METHOD_SKILL_LIST,
  METHOD_SKILL_READ,
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
  type AgentSessionListResponse,
  type AgentSessionOverview,
  type AgentSessionReadResponse,
  type AgentSessionStartResponse,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartResponse,
  type AgentAppInstalledListResponse,
  type ArtifactSummary,
  type AutomationJobListResponse,
  type CapabilityDescriptor,
  type CapabilityListResponse,
  type EvidenceExportResponse,
  type KnowledgeListPacksResponse,
  type ModelListResponse,
  type ModelPreferencesListResponse,
  type ModelProviderAliasListResponse,
  type ModelProviderAliasReadResponse,
  type ModelProviderCatalogListResponse,
  type ModelProviderListResponse,
  type ModelSyncStateReadResponse,
  type ProjectMemoryReadResponse,
  type SkillListResponse,
  type SkillReadResponse,
  type WorkspaceEnsureReadyResponse,
  type WorkspaceListResponse,
  type WorkspaceProjectPathResolveResponse,
  type WorkspaceProjectsRootReadResponse,
  type WorkspaceReadResponse,
  type WorkspaceSkillBindingsListResponse,
} from "app-server-client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ElectronAppServerHost } from "./appServerHost";

type HostArgs = Record<string, unknown> | null | undefined;
type AppServerParams = Record<string, unknown>;

const CONFIG_FILE = "config.json";

export class ElectronHostCommands {
  readonly #appServerHost: ElectronAppServerHost;
  readonly #userDataDir: string;

  constructor(
    appServerHost: ElectronAppServerHost,
    userDataDir = app.getPath("userData"),
  ) {
    this.#appServerHost = appServerHost;
    this.#userDataDir = userDataDir;
  }

  async invoke(command: string, args?: HostArgs): Promise<unknown> {
    switch (command) {
      case "get_config":
        return await this.#readConfig();
      case "save_config":
        return await this.#saveConfig(args);
      case "aster_agent_init":
        return await this.#initAgentRuntime();
      case "get_default_provider":
        return await this.#getDefaultProvider();
      case "get_provider_ui_state":
        return await this.#getProviderUiState(args);
      case "set_provider_ui_state":
        return await this.#setProviderUiState(args);
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
      case "get_api_key_providers":
        return await this.#listModelProviders();
      case "get_system_provider_catalog":
        return await this.#listModelProviderCatalog();
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
      case "fetch_provider_models_auto":
        return await this.#fetchProviderModelsAuto(args);
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
      case "list_executable_skills":
        return await this.#listExecutableSkills();
      case "get_local_skills_for_app":
        return await this.#listLocalSkillsForApp(args);
      case "get_skill_detail":
        return await this.#readSkillDetail(args);
      case "get_automation_scheduler_config":
        return await this.#getAutomationSchedulerConfig();
      case "get_automation_status":
        return this.#getAutomationStatus();
      case "get_automation_health":
        return await this.#getAutomationHealth();
      case "get_automation_jobs":
        return await this.#listAutomationJobs();
      case "project_memory_get":
        return await this.#readProjectMemory(args);
      case "agent_app_list_installed":
        return await this.#listAgentAppInstalled();
      case "agent_app_get_ui_runtime_status":
      case "agent_app_stop_ui_runtime":
        return this.#throwMissingAppServerMethod(command);
      case "agent_app_start_ui_runtime":
        return this.#throwMissingAppServerMethod(command);
      case "knowledge_list_packs":
        return await this.#listKnowledgePacks(args);
      case "report_frontend_debug_log":
        this.#reportFrontendDebugLog(args);
        return null;
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

  async #initAgentRuntime(): Promise<{
    initialized: true;
    provider_configured: boolean;
    provider_name?: string;
    provider_selector?: string;
    model_name?: string;
  }> {
    const [defaultProvider, providers, models] = await Promise.all([
      this.#getDefaultProvider().catch(() => ""),
      this.#listModelProviders().catch(() => []),
      this.#listModels().catch(() => []),
    ]);
    const selectedProvider =
      findProvider(providers, defaultProvider) ??
      providers.find(isConfiguredProvider);
    const selectedProviderId =
      readString(selectedProvider, "id") ?? defaultProvider;
    const selectedModel =
      models.find((model) => {
        const providerId =
          readString(model, "provider_id") ?? readString(model, "providerId");
        return providerId === selectedProviderId;
      }) ?? models[0];
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
    const config = await this.#readConfig();
    const defaultProvider = config.default_provider;
    return typeof defaultProvider === "string" && defaultProvider.trim()
      ? defaultProvider.trim()
      : "";
  }

  async #getProviderUiState(args: HostArgs): Promise<string | null> {
    const key = readString(args, "key") ?? readString(readRequest(args), "key");
    if (!key) {
      return null;
    }
    const state = toRecord((await this.#readConfig()).provider_ui_state);
    const value = state?.[key];
    return typeof value === "string" ? value : null;
  }

  async #setProviderUiState(args: HostArgs): Promise<void> {
    const request = readRequest(args);
    const key = readString(request, "key");
    if (!key) {
      throw new Error("set_provider_ui_state requires key");
    }
    const value = readString(request, "value") ?? "";
    const config = await this.#readConfig();
    const state = {
      ...(toRecord(config.provider_ui_state) ?? {}),
      [key]: value,
    };
    await this.#saveConfig({
      config: {
        ...config,
        provider_ui_state: state,
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
    await this.#appServerRequest<AgentSessionReadResponse>(
      METHOD_AGENT_SESSION_READ,
      { sessionId },
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

  async #listModelProviderCatalog(): Promise<unknown[]> {
    const response =
      await this.#appServerRequest<ModelProviderCatalogListResponse>(
        METHOD_MODEL_PROVIDER_CATALOG_LIST,
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

  async #fetchProviderModelsAuto(
    args: HostArgs,
  ): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const providerId =
      readString(request, "providerId") ?? readString(request, "provider_id");
    if (!providerId) {
      throw new Error("fetch_provider_models_auto requires providerId");
    }
    return {
      models: [],
      source: "Error",
      error: "实时 Provider 模型接口尚未迁入 App Server。",
      request_url: null,
      diagnostic_hint:
        "当前 Electron Desktop Host 不能把 App Server model/list 快照伪装成实时 /models 结果；请先手动添加模型 ID，后续应补 App Server Provider 实时探测方法。",
      error_kind: "other",
      should_prompt_error: true,
      from_cache: false,
    };
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

  async #listExecutableSkills(): Promise<unknown[]> {
    const response =
      await this.#appServerRequest<SkillListResponse>(METHOD_SKILL_LIST);
    return response.skills;
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

  async #readSkillDetail(args: HostArgs): Promise<unknown> {
    const request = readRequest(args);
    const skillName =
      readString(request, "skillName") ??
      readString(request, "skill_name") ??
      readString(args, "skillName") ??
      readString(args, "skill_name");
    if (!skillName) {
      throw new Error("get_skill_detail requires skillName");
    }
    const response = await this.#appServerRequest<SkillReadResponse>(
      METHOD_SKILL_READ,
      { skillName },
    );
    return response.skill;
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

  async #listAgentAppInstalled(): Promise<unknown> {
    return await this.#appServerRequest<AgentAppInstalledListResponse>(
      METHOD_AGENT_APP_INSTALLED_LIST,
    );
  }

  async #listKnowledgePacks(args: HostArgs): Promise<unknown> {
    const request = readRequest(args);
    const workingDir =
      readString(request, "workingDir") ??
      readString(request, "working_dir") ??
      readString(args, "workingDir") ??
      readString(args, "working_dir");
    if (!workingDir) {
      throw new Error("knowledge_list_packs requires workingDir");
    }
    return await this.#appServerRequest<KnowledgeListPacksResponse>(
      METHOD_KNOWLEDGE_PACK_LIST,
      {
        workingDir,
        includeArchived:
          readBoolean(request, "includeArchived") ??
          readBoolean(request, "include_archived") ??
          false,
      },
    );
  }

  async #listAutomationJobs(): Promise<unknown[]> {
    const response = await this.#appServerRequest<AutomationJobListResponse>(
      METHOD_AUTOMATION_JOB_LIST,
    );
    return response.jobs;
  }

  async #getAutomationSchedulerConfig(): Promise<Record<string, unknown>> {
    const config = await this.#readConfig();
    const automationConfig = toRecord(config.automation);
    return {
      enabled: readBoolean(automationConfig, "enabled") ?? false,
      poll_interval_secs:
        readNumber(automationConfig, "poll_interval_secs") ?? 30,
      enable_history: readBoolean(automationConfig, "enable_history") ?? true,
    };
  }

  #getAutomationStatus(): Record<string, unknown> {
    return {
      running: false,
      last_polled_at: null,
      next_poll_at: null,
      last_job_count: 0,
      total_executions: 0,
      active_job_id: null,
      active_job_name: null,
    };
  }

  async #getAutomationHealth(): Promise<Record<string, unknown>> {
    const jobs = await this.#listAutomationJobs();
    return {
      total_jobs: jobs.length,
      enabled_jobs: jobs.filter((job) => readBoolean(job, "enabled") ?? false)
        .length,
      pending_jobs: 0,
      running_jobs: jobs.filter(
        (job) => readString(job, "last_status") === "running",
      ).length,
      failed_jobs: jobs.filter((job) =>
        ["error", "timeout"].includes(readString(job, "last_status") ?? ""),
      ).length,
      cooldown_jobs: jobs.filter((job) =>
        Boolean(readString(job, "auto_disabled_until")),
      ).length,
      stale_running_jobs: 0,
      failed_last_24h: 0,
      failure_trend_24h: [],
      alerts: [],
      risky_jobs: [],
      generated_at: new Date().toISOString(),
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

  #throwMissingAppServerMethod(command: string): never {
    throw new Error(
      `${command} has no Electron current adapter because no App Server JSON-RPC method is defined for it yet. Electron Host must not return synthetic empty data.`,
    );
  }

  #reportFrontendDebugLog(args: HostArgs): void {
    const report = readRecord(args, "report");
    const level = readString(report, "level") ?? "info";
    const message = readString(report, "message") ?? "";
    console.log(`[electron-renderer:${level}] ${message}`);
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
    thread_read: null,
    todo_items: [],
    child_subagent_sessions: [],
  };
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
    observabilitySummary: pack?.observabilitySummary,
    completionAuditSummary: pack?.completionAuditSummary,
    artifacts:
      pack?.artifacts ??
      response.artifacts.map(artifactSummaryToEvidenceArtifact),
  };
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
  if (!providerId) {
    return null;
  }
  return (
    (providers.find((provider) => {
      const record = toRecord(provider);
      return (
        record &&
        (readString(record, "id") === providerId ||
          readString(record, "name") === providerId)
      );
    }) as Record<string, unknown> | undefined) ?? null
  );
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

function capabilitiesToToolInventory(
  capabilities: CapabilityDescriptor[],
  caller: string,
  surface: { workbench: boolean; browser_assist: boolean },
): Record<string, unknown> {
  const runtimeTools = capabilities.flatMap((capability) =>
    capability.methods.map((method) => ({
      name: method,
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
