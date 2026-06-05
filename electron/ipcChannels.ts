export const IPC_INVOKE_CHANNEL = "app:invoke";
export const IPC_EMIT_CHANNEL = "app:emit";
export const IPC_DIALOG_OPEN_CHANNEL = "app:dialog:open";
export const IPC_DIALOG_SAVE_CHANNEL = "app:dialog:save";
export const IPC_SHELL_OPEN_CHANNEL = "app:shell:open";
export const IPC_WINDOW_COMMAND_CHANNEL = "app:window:command";
export const IPC_GLOBAL_SHORTCUT_COMMAND_CHANNEL = "app:global-shortcut:command";
export const IPC_DEEP_LINK_GET_URLS_CHANNEL = "app:deep-link:get-urls";
export const IPC_DEEP_LINK_GET_CURRENT_CHANNEL = "app:deep-link:get-current";

export const ELECTRON_HOST_COMMANDS = [
  "app_server_handle_json_lines",
  "app_server_drain_events",
  "aster_agent_init",
  "agent_runtime_get_tool_inventory",
  "agent_runtime_list_sessions",
  "agent_runtime_get_session",
  "agent_runtime_list_workspace_skill_bindings",
  "agent_app_list_installed",
  "agent_app_get_ui_runtime_status",
  "agent_app_start_ui_runtime",
  "agent_app_stop_ui_runtime",
  "get_api_key_providers",
  "get_config",
  "get_default_provider",
  "get_all_alias_configs",
  "get_model_preferences",
  "get_model_registry",
  "get_model_registry_provider_ids",
  "get_model_sync_state",
  "get_models_by_tier",
  "get_models_for_provider",
  "get_or_create_default_project",
  "get_provider_alias_config",
  "get_system_provider_catalog",
  "get_skill_detail",
  "knowledge_list_packs",
  "list_executable_skills",
  "report_frontend_debug_log",
  "save_config",
  "workspace_ensure_default_ready",
  "workspace_ensure_ready",
  "workspace_get",
  "workspace_get_by_path",
  "workspace_get_default",
  "workspace_get_projects_root",
  "workspace_list",
  "workspace_resolve_project_path",
  "workspace_set_default",
  "check_for_updates",
  "close_update_window",
  "dismiss_update_notification",
  "download_update",
  "get_update_check_settings",
  "get_update_install_session",
  "get_update_notification_metrics",
  "record_update_notification_action",
  "remind_update_later",
  "set_update_check_settings",
  "skip_update_version",
  "start_update_install_session",
  "test_update_window",
] as const;

export type ElectronHostCommand = (typeof ELECTRON_HOST_COMMANDS)[number];

export const ELECTRON_APP_SERVER_COMMANDS = [
  "app_server_handle_json_lines",
  "app_server_drain_events",
] as const;

export type ElectronAppServerCommand =
  (typeof ELECTRON_APP_SERVER_COMMANDS)[number];

export const ELECTRON_APP_SERVER_TRUTH_ADAPTER_COMMANDS = [
  "aster_agent_init",
  "agent_runtime_get_tool_inventory",
  "agent_runtime_list_sessions",
  "agent_runtime_get_session",
  "agent_runtime_list_workspace_skill_bindings",
  "get_api_key_providers",
  "get_all_alias_configs",
  "get_default_provider",
  "get_model_preferences",
  "get_model_registry",
  "get_model_registry_provider_ids",
  "get_model_sync_state",
  "get_models_by_tier",
  "get_models_for_provider",
  "get_provider_alias_config",
  "get_system_provider_catalog",
  "get_skill_detail",
  "list_executable_skills",
  "workspace_ensure_default_ready",
  "workspace_ensure_ready",
  "workspace_get",
  "workspace_get_by_path",
  "workspace_get_default",
  "workspace_get_projects_root",
  "workspace_list",
  "workspace_resolve_project_path",
] as const;

export type ElectronAppServerTruthAdapterCommand =
  (typeof ELECTRON_APP_SERVER_TRUTH_ADAPTER_COMMANDS)[number];

export const ELECTRON_UPDATE_COMMANDS = [
  "check_for_updates",
  "close_update_window",
  "dismiss_update_notification",
  "download_update",
  "get_update_check_settings",
  "get_update_install_session",
  "get_update_notification_metrics",
  "record_update_notification_action",
  "remind_update_later",
  "set_update_check_settings",
  "skip_update_version",
  "start_update_install_session",
  "test_update_window",
] as const;

export type ElectronUpdateCommand = (typeof ELECTRON_UPDATE_COMMANDS)[number];

export function isElectronHostCommand(
  command: string,
): command is ElectronHostCommand {
  return ELECTRON_HOST_COMMANDS.includes(command as ElectronHostCommand);
}

export function isElectronAppServerCommand(
  command: string,
): command is ElectronAppServerCommand {
  return ELECTRON_APP_SERVER_COMMANDS.includes(
    command as ElectronAppServerCommand,
  );
}

export function isElectronUpdateCommand(
  command: string,
): command is ElectronUpdateCommand {
  return ELECTRON_UPDATE_COMMANDS.includes(command as ElectronUpdateCommand);
}

export type ElectronInvokeSuccess<T = unknown> = {
  ok: true;
  result: T;
};

export type ElectronInvokeFailure = {
  ok: false;
  error: {
    message: string;
    code?: string;
    data?: unknown;
  };
};

export type ElectronInvokeResponse<T = unknown> =
  | ElectronInvokeSuccess<T>
  | ElectronInvokeFailure;
