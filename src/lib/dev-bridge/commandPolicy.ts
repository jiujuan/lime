import { isElectronHostCommandAvailable } from "@/lib/electron-host";

export type DevBridgeCommandTimeoutProfile =
  | "startup-truth"
  | "agent-session-get"
  | "agent-session-list"
  | "agent-session-patch"
  | "agent-session-create"
  | "app-server-turn-start"
  | "app-server-read"
  | "agent-runtime"
  | "agent-app-ui-runtime-start"
  | "agent-app-package"
  | "skill-execution"
  | "provider-probe"
  | "knowledge-compile"
  | "voice-model-download"
  | "layered-design-project"
  | "truth"
  | "default";

/**
 * 前端命令策略的唯一分类入口。
 *
 * current 主链命令必须走真实 Electron/Desktop Host 或 DevBridge；
 * 测试夹具只能通过 invokeMockOnly，不能由生产 invoke 自动回退 mock。
 */
const bridgeTruthCommands = new Set<string>([
  "aster_agent_init",
  "aster_agent_status",
  "open_external_url",
  "open_update_window",
  "start_oem_cloud_oauth_callback_bridge",
  "get_or_create_default_project",
  "workspace_list",
  "workspace_get_default",
  "workspace_get",
  "workspace_ensure_ready",
  "agent_runtime_submit_turn",
  "agent_runtime_interrupt_turn",
  "agent_runtime_export_evidence_pack",
  "agent_runtime_compact_session",
  "agent_runtime_resume_thread",
  "agent_runtime_replay_request",
  "agent_runtime_get_thread_read",
  "agent_runtime_get_objective",
  "agent_runtime_set_objective",
  "agent_runtime_update_objective_status",
  "agent_runtime_clear_objective",
  "agent_runtime_continue_objective",
  "agent_runtime_audit_objective",
  "agent_runtime_list_file_checkpoints",
  "agent_runtime_get_file_checkpoint",
  "agent_runtime_diff_file_checkpoint",
  "agent_runtime_restore_file_checkpoint",
  "agent_runtime_promote_queued_turn",
  "agent_runtime_remove_queued_turn",
  "agent_runtime_respond_action",
  "agent_app_start_ui_runtime",
  "agent_app_get_ui_runtime_status",
  "agent_app_stop_ui_runtime",
  "agent_app_select_directory",
  "agent_app_launch_shell",
  "agent_app_runtime_start_task",
  "agent_app_runtime_cancel_task",
  "agent_app_runtime_get_task",
  "agent_app_runtime_submit_host_response",
  "agent_runtime_create_session",
  "agent_runtime_list_sessions",
  "agent_runtime_get_session",
  "agent_runtime_update_session",
  "agent_runtime_delete_session",
  "agent_runtime_get_tool_inventory",
  "agent_runtime_spawn_subagent",
  "agent_runtime_send_subagent_input",
  "agent_runtime_wait_subagents",
  "agent_runtime_resume_subagent",
  "agent_runtime_close_subagent",
  "list_executable_skills",
  "get_skill_detail",
  "execute_skill",
  "gateway_channel_status",
  "wechat_channel_list_accounts",
  "get_default_provider",
  "get_provider_ui_state",
  "get_api_key_providers",
  "get_api_key_provider",
  "add_custom_api_key_provider",
  "update_api_key_provider",
  "delete_custom_api_key_provider",
  "add_api_key",
  "get_model_registry",
  "get_model_registry_provider_ids",
  "get_models_for_provider",
  "get_models_by_tier",
  "get_provider_alias_config",
  "get_all_alias_configs",
  "refresh_model_registry",
  "fetch_provider_models_auto",
  "create_image_generation_task_artifact",
  "create_audio_generation_task_artifact",
  "complete_audio_generation_task_artifact",
  "get_media_task_artifact",
  "list_media_task_artifacts",
  "cancel_media_task_artifact",
  "save_layered_design_project_export",
  "read_layered_design_project_export",
  "agent_app_inspect_local_package",
  "agent_app_fetch_cloud_package",
  "agent_app_save_installed_state",
  "agent_app_list_installed",
  "agent_app_set_disabled",
  "agent_app_uninstall_rehearsal",
  "agent_app_uninstall",
  "capability_draft_create",
  "capability_draft_list",
  "capability_draft_get",
  "capability_draft_verify",
  "capability_draft_register",
  "capability_draft_submit_approval_session_inputs",
  "capability_draft_execute_controlled_get",
  "agent_runtime_list_workspace_skill_bindings",
  "app_server_handle_json_lines",
  "app_server_drain_events",
  "get_skills_for_app",
  "get_local_skills_for_app",
  "install_skill_for_app",
  "uninstall_skill_for_app",
  "get_skill_repos",
  "add_skill_repo",
  "remove_skill_repo",
  "get_installed_lime_skills",
  "refresh_skill_cache",
  "inspect_local_skill_for_app",
  "inspect_local_skill_detail_for_app",
  "reveal_local_skill_for_app",
  "rename_local_skill_for_app",
  "replace_local_skill_package_for_app",
  "create_skill_scaffold_for_app",
  "import_local_skill_for_app",
  "inspect_local_skill_package_for_app",
  "install_local_skill_package_for_app",
  "export_local_skill_package_for_app",
  "take_pending_skill_package_open_requests",
  "get_skill_package_file_association_status",
  "set_skill_package_file_association_default",
  "install_marketplace_skill_for_app",
  "install_skill_from_download_url_for_app",
  "inspect_remote_skill",
  "knowledge_import_source",
  "knowledge_compile_pack",
  "knowledge_list_packs",
  "knowledge_get_pack",
  "knowledge_set_default_pack",
  "knowledge_update_pack_status",
  "knowledge_resolve_context",
  "knowledge_validate_context_run",
  "get_automation_jobs",
  "project_memory_get",
  "get_home_dir",
  "get_file_manager_locations",
  "get_file_icon_data_url",
  "create_file",
  "create_directory",
  "delete_file",
  "rename_file",
  "get_file_name",
  "reveal_in_finder",
  "open_with_default_app",
  "session_files_save_file",
  "session_files_resolve_file_path",
  "upload_material",
  "voice_models_download",
  "voice_models_delete",
  "voice_models_set_default",
  "voice_models_test_transcribe_file",
]);

const optionalLegacyUxCommands = new Set<string>([
  "get_hint_routes",
  "session_files_get_or_create",
  "session_files_list_files",
]);

const devBridgeProviderProbeCommands = new Set([
  "fetch_provider_models_auto",
  "test_api_key_provider_connection",
  "test_api_key_provider_chat",
]);

const devBridgeAgentAppUiRuntimeStartCommands = new Set([
  "agent_app_start_ui_runtime",
]);

const devBridgeAgentAppPackageCommands = new Set([
  "agent_app_inspect_local_package",
]);

const devBridgeSkillExecutionCommands = new Set(["execute_skill"]);

const devBridgeLayeredDesignProjectCommands = new Set([
  "save_layered_design_project_export",
  "read_layered_design_project_export",
]);

const devBridgeCooldownBypassCommands = new Set([
  "agent_runtime_get_session",
  "agent_runtime_list_sessions",
  "agent_runtime_submit_turn",
  "agent_runtime_create_session",
  "agent_runtime_send_subagent_input",
  "list_executable_skills",
  "get_skill_detail",
  "execute_skill",
  "get_or_create_default_project",
  "workspace_get",
  "workspace_get_default",
  "workspace_list",
  "workspace_ensure_ready",
  "workspace_ensure_default_ready",
]);

const devBridgeReadRetryCommands = new Set([
  "agent_runtime_get_session",
  "agent_runtime_list_sessions",
]);

const devBridgeStartupTruthCommands = new Set([
  "aster_agent_init",
  "workspace_ensure_ready",
  "workspace_ensure_default_ready",
]);

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const APP_SERVER_AGENT_SESSION_LIST_METHOD = "agentSession/list";
const APP_SERVER_AGENT_TURN_START_METHOD = "agentSession/turn/start";
const APP_SERVER_AGENT_APP_UI_RUNTIME_START_METHOD =
  "agentAppUiRuntime/start";
const APP_SERVER_READ_METHODS = new Set([
  "capability/list",
  "artifact/read",
  "fileSystem/listDirectory",
  "fileSystem/readFilePreview",
  "agentSession/read",
  "skill/list",
  "skill/read",
  "workspaceSkillBindings/list",
  "workspaceRegisteredSkills/list",
  "agentAppInstalled/list",
  "agentAppUiRuntime/status",
  "knowledgePack/list",
  "automationJob/list",
  "projectMemory/read",
  "model/list",
  "modelPreferences/list",
  "modelSyncState/read",
  "modelProvider/list",
  "modelProvider/catalog/list",
  "modelProviderAlias/read",
  "modelProviderAlias/list",
  "connectDeepLink/resolve",
  "connectOpenDeepLink/resolve",
]);
const APP_SERVER_STARTUP_TRUTH_METHODS = new Set([
  "workspace/default/read",
  "workspace/default/ensure",
  "workspace/list",
  "workspace/read",
  "workspace/byPath/read",
  "workspace/projectsRoot/read",
  "workspace/projectPath/resolve",
  "workspace/ensureReady",
]);

const bridgeTruthEventPrefixes = [
  "voice-model-download-progress",
  "aster_stream_",
  "agent_subagent_status:",
  "agent_subagent_stream:",
];

export function isBridgeTruthCommand(command: string): boolean {
  return bridgeTruthCommands.has(command);
}

export function isOptionalLegacyUxCommand(command: string): boolean {
  return optionalLegacyUxCommands.has(command);
}

export function isOptionalLegacyUxCommandAvailable(command: string): boolean {
  return (
    isOptionalLegacyUxCommand(command) &&
    isElectronHostCommandAvailable(command)
  );
}

export function areOptionalLegacyUxCommandsAvailable(
  commands: string[],
): boolean {
  return commands.every(isOptionalLegacyUxCommandAvailable);
}

export function isBridgeTruthEvent(eventName: string): boolean {
  const normalizedEventName = eventName.trim();
  if (!normalizedEventName) {
    return false;
  }
  return bridgeTruthEventPrefixes.some((prefix) =>
    normalizedEventName.startsWith(prefix),
  );
}

export function shouldBypassDevBridgeCooldown(command: string): boolean {
  return devBridgeCooldownBypassCommands.has(command);
}

export function shouldRetryDevBridgeReadCommand(command: string): boolean {
  return devBridgeReadRetryCommands.has(command);
}

export function resolveDevBridgeCommandTimeoutProfile(
  command: string,
  args?: unknown,
): DevBridgeCommandTimeoutProfile {
  if (devBridgeStartupTruthCommands.has(command)) {
    return "startup-truth";
  }
  if (command === "agent_runtime_get_session") {
    return "agent-session-get";
  }
  if (command === "agent_runtime_list_sessions") {
    return "agent-session-list";
  }
  if (command === "agent_runtime_update_session") {
    return "agent-session-patch";
  }
  if (command === "agent_runtime_create_session") {
    return "agent-session-create";
  }
  if (isAppServerAgentTurnStartCommand(command, args)) {
    return "app-server-turn-start";
  }
  if (isAppServerAgentAppUiRuntimeStartCommand(command, args)) {
    return "agent-app-ui-runtime-start";
  }
  if (isAppServerAgentSessionListCommand(command, args)) {
    return "agent-session-list";
  }
  if (isAppServerStartupTruthCommand(command, args)) {
    return "startup-truth";
  }
  if (isAppServerReadCommand(command, args)) {
    return "app-server-read";
  }
  if (
    command.startsWith("agent_app_runtime_") ||
    command.startsWith("agent_runtime_")
  ) {
    return "agent-runtime";
  }
  if (devBridgeAgentAppUiRuntimeStartCommands.has(command)) {
    return "agent-app-ui-runtime-start";
  }
  if (devBridgeAgentAppPackageCommands.has(command)) {
    return "agent-app-package";
  }
  if (devBridgeSkillExecutionCommands.has(command)) {
    return "skill-execution";
  }
  if (devBridgeProviderProbeCommands.has(command)) {
    return "provider-probe";
  }
  if (command === "knowledge_compile_pack") {
    return "knowledge-compile";
  }
  if (command === "voice_models_download") {
    return "voice-model-download";
  }
  if (devBridgeLayeredDesignProjectCommands.has(command)) {
    return "layered-design-project";
  }
  if (isBridgeTruthCommand(command)) {
    return "truth";
  }
  return "default";
}

function isAppServerAgentSessionListCommand(
  command: string,
  args: unknown,
): boolean {
  if (command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
    return false;
  }
  return extractAppServerJsonLines(args).some((line) =>
    jsonRpcLineHasMethod(line, APP_SERVER_AGENT_SESSION_LIST_METHOD),
  );
}

function isAppServerAgentTurnStartCommand(
  command: string,
  args: unknown,
): boolean {
  if (command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
    return false;
  }
  return extractAppServerJsonLines(args).some((line) =>
    jsonRpcLineHasMethod(line, APP_SERVER_AGENT_TURN_START_METHOD),
  );
}

function isAppServerAgentAppUiRuntimeStartCommand(
  command: string,
  args: unknown,
): boolean {
  if (command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
    return false;
  }
  return extractAppServerJsonLines(args).some((line) =>
    jsonRpcLineHasMethod(line, APP_SERVER_AGENT_APP_UI_RUNTIME_START_METHOD),
  );
}

function isAppServerStartupTruthCommand(
  command: string,
  args: unknown,
): boolean {
  if (command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
    return false;
  }
  return extractAppServerJsonLines(args).some((line) =>
    jsonRpcLineHasAnyMethod(line, APP_SERVER_STARTUP_TRUTH_METHODS),
  );
}

function isAppServerReadCommand(command: string, args: unknown): boolean {
  if (command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
    return false;
  }
  return extractAppServerJsonLines(args).some((line) =>
    jsonRpcLineHasAnyMethod(line, APP_SERVER_READ_METHODS),
  );
}

function extractAppServerJsonLines(args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return [];
  }
  const request = (args as { request?: unknown }).request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return [];
  }
  const lines = (request as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.filter((line): line is string => typeof line === "string");
}

function jsonRpcLineHasMethod(line: string, method: string): boolean {
  return jsonRpcLineHasAnyMethod(line, new Set([method]));
}

function jsonRpcLineHasAnyMethod(
  line: string,
  methods: ReadonlySet<string>,
): boolean {
  try {
    const parsed = JSON.parse(line.trim()) as { method?: unknown } | null;
    return Boolean(
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.method === "string" &&
      methods.has(parsed.method),
    );
  } catch {
    return false;
  }
}
