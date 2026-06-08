import { describe, expect, it } from "vitest";

import {
  ELECTRON_APP_SERVER_COMMANDS,
  ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS,
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
} from "./ipcChannels";

describe("electron/ipcChannels", () => {
  it("Electron host command 白名单承接本地宿主与 App Server 桥接命令", () => {
    expect(isElectronHostCommand("app_server_handle_json_lines")).toBe(true);
    expect(isElectronHostCommand("agent_runtime_create_session")).toBe(true);
    expect(isElectronHostCommand("agent_runtime_submit_turn")).toBe(true);
    expect(isElectronHostCommand("agent_runtime_interrupt_turn")).toBe(true);
    expect(isElectronHostCommand("agent_runtime_update_session")).toBe(true);
    expect(isElectronHostCommand("agent_runtime_respond_action")).toBe(true);
    expect(isElectronHostCommand("agent_runtime_get_thread_read")).toBe(true);
    expect(isElectronHostCommand("agent_runtime_export_evidence_pack")).toBe(
      true,
    );
    expect(isElectronHostCommand("agent_runtime_get_tool_inventory")).toBe(
      true,
    );
    expect(isElectronHostCommand("agent_runtime_list_sessions")).toBe(true);
    expect(
      isElectronHostCommand("agent_runtime_list_workspace_skill_bindings"),
    ).toBe(true);
    expect(isElectronHostCommand("fetch_provider_models_auto")).toBe(false);
    expect(isElectronHostCommand("get_provider_ui_state")).toBe(false);
    expect(isElectronHostCommand("get_local_skills_for_app")).toBe(true);
    expect(isElectronHostCommand("get_automation_jobs")).toBe(false);
    expect(isElectronHostCommand("get_automation_scheduler_config")).toBe(
      false,
    );
    expect(isElectronHostCommand("get_automation_status")).toBe(false);
    expect(isElectronHostCommand("get_automation_health")).toBe(false);
    expect(isElectronHostCommand("project_memory_get")).toBe(true);
    expect(isElectronHostCommand("get_model_registry")).toBe(true);
    expect(isElectronHostCommand("get_api_key_providers")).toBe(false);
    expect(isElectronHostCommand("list_dir")).toBe(false);
    expect(isElectronHostCommand("read_file_preview_cmd")).toBe(false);
    expect(isElectronHostCommand("list_executable_skills")).toBe(false);
    expect(isElectronHostCommand("workspace_list")).toBe(true);
    expect(isElectronHostCommand("workspace_get_by_path")).toBe(true);
    expect(isElectronHostCommand("get_config")).toBe(true);
    expect(isElectronHostCommand("get_experimental_config")).toBe(true);
    expect(isElectronHostCommand("save_experimental_config")).toBe(true);
    expect(isElectronHostCommand("get_file_icon_data_url")).toBe(true);
    expect(isElectronHostCommand("get_file_manager_locations")).toBe(true);
    expect(isElectronHostCommand("get_home_dir")).toBe(true);
    expect(isElectronHostCommand("agent_app_list_installed")).toBe(false);
    expect(isElectronHostCommand("agent_app_select_directory")).toBe(true);
    expect(isElectronHostCommand("agent_app_launch_shell")).toBe(true);
    expect(isElectronHostCommand("agent_app_runtime_start_task")).toBe(true);
    expect(isElectronHostCommand("agent_app_runtime_cancel_task")).toBe(true);
    expect(isElectronHostCommand("agent_app_runtime_get_task")).toBe(true);
    expect(
      isElectronHostCommand("agent_app_runtime_submit_host_response"),
    ).toBe(true);
    expect(isElectronHostCommand("get_usage_stats")).toBe(true);
    expect(isElectronHostCommand("get_model_usage_ranking")).toBe(true);
    expect(isElectronHostCommand("get_daily_usage_trends")).toBe(true);
    expect(isElectronHostCommand("get_browser_connector_settings_cmd")).toBe(
      true,
    );
    expect(
      isElectronHostCommand("get_browser_connector_install_status_cmd"),
    ).toBe(true);
    expect(isElectronHostCommand("get_chrome_profile_sessions")).toBe(true);
    expect(isElectronHostCommand("get_chrome_bridge_endpoint_info")).toBe(true);
    expect(isElectronHostCommand("get_chrome_bridge_status")).toBe(true);
    expect(isElectronHostCommand("get_browser_backend_policy")).toBe(true);
    expect(isElectronHostCommand("get_browser_backends_status")).toBe(true);
    expect(isElectronHostCommand("get_voice_input_config")).toBe(true);
    expect(isElectronHostCommand("get_asr_credentials")).toBe(true);
    expect(isElectronHostCommand("get_voice_instructions")).toBe(true);
    expect(isElectronHostCommand("voice_models_get_install_state")).toBe(true);
    expect(isElectronHostCommand("get_environment_preview")).toBe(true);
    expect(isElectronHostCommand("unified_memory_stats")).toBe(true);
    expect(isElectronHostCommand("get_mcp_servers")).toBe(false);
    expect(isElectronHostCommand("mcp_list_servers_with_status")).toBe(false);
    expect(isElectronHostCommand("mcp_list_tools")).toBe(false);
    expect(isElectronHostCommand("mcp_list_prompts")).toBe(false);
    expect(isElectronHostCommand("mcp_list_resources")).toBe(false);
    for (const command of [
      "knowledge_list_packs",
      "knowledge_get_pack",
      "knowledge_import_source",
      "knowledge_compile_pack",
      "knowledge_set_default_pack",
      "knowledge_update_pack_status",
      "knowledge_resolve_context",
      "knowledge_validate_context_run",
    ]) {
      expect(isElectronHostCommand(command)).toBe(false);
    }
    expect(isElectronHostCommand("site_get_adapter_catalog_status")).toBe(true);
    expect(isElectronHostCommand("open_external_url")).toBe(true);
    expect(isElectronHostCommand("open_with_default_app")).toBe(true);
    expect(isElectronHostCommand("reveal_in_finder")).toBe(true);
    expect(isElectronHostCommand("start_oem_cloud_oauth_callback_bridge")).toBe(
      true,
    );
    expect(
      isElectronHostCommand("get_skill_package_file_association_status"),
    ).toBe(true);
    expect(
      isElectronHostCommand("set_skill_package_file_association_default"),
    ).toBe(true);
    expect(isElectronHostCommand("report_frontend_crash")).toBe(true);
    expect(isElectronHostCommand("sync_tray_model_shortcuts")).toBe(true);
    expect(
      isElectronHostCommand("take_pending_skill_package_open_requests"),
    ).toBe(true);
    expect(isElectronHostCommand("open_update_window")).toBe(true);
  });

  it("App Server 原始桥接命令只包含 JSONL sidecar 通道", () => {
    expect([...ELECTRON_APP_SERVER_COMMANDS].sort()).toEqual([
      "app_server_drain_events",
      "app_server_handle_json_lines",
    ]);
    expect(isElectronAppServerCommand("app_server_handle_json_lines")).toBe(
      true,
    );
    expect(isElectronAppServerCommand("agent_runtime_list_sessions")).toBe(
      false,
    );
    expect(isElectronAppServerCommand("sync_tray_model_shortcuts")).toBe(false);
    expect(
      isElectronAppServerCommand("take_pending_skill_package_open_requests"),
    ).toBe(false);
  });

  it("App Server truth bridge 命令由 Desktop Host 投影，不走原始 JSONL 通道", () => {
    expect([...ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS].sort()).toEqual([
      "agent_app_get_ui_runtime_status",
      "agent_app_runtime_cancel_task",
      "agent_app_runtime_get_task",
      "agent_app_runtime_start_task",
      "agent_app_runtime_submit_host_response",
      "agent_app_start_ui_runtime",
      "agent_app_stop_ui_runtime",
      "agent_runtime_create_session",
      "agent_runtime_export_evidence_pack",
      "agent_runtime_get_session",
      "agent_runtime_get_thread_read",
      "agent_runtime_get_tool_inventory",
      "agent_runtime_interrupt_turn",
      "agent_runtime_list_sessions",
      "agent_runtime_list_workspace_skill_bindings",
      "agent_runtime_respond_action",
      "agent_runtime_submit_turn",
      "agent_runtime_update_session",
      "aster_agent_init",
      "get_all_alias_configs",
      "get_default_provider",
      "get_local_skills_for_app",
      "get_model_preferences",
      "get_model_registry",
      "get_model_registry_provider_ids",
      "get_model_sync_state",
      "get_models_by_tier",
      "get_models_for_provider",
      "get_provider_alias_config",
      "project_memory_get",
      "workspace_ensure_default_ready",
      "workspace_ensure_ready",
      "workspace_get",
      "workspace_get_by_path",
      "workspace_get_default",
      "workspace_get_projects_root",
      "workspace_list",
      "workspace_resolve_project_path",
    ]);
    expect(
      ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS.every((command) =>
        isElectronHostCommand(command),
      ),
    ).toBe(true);
    expect(
      ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS.some((command) =>
        isElectronAppServerCommand(command),
      ),
    ).toBe(false);
    expect(
      ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS.includes(
        "start_oem_cloud_oauth_callback_bridge" as never,
      ),
    ).toBe(false);
    expect(
      ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS.includes(
        "get_file_icon_data_url" as never,
      ),
    ).toBe(false);
    expect(
      ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS.includes(
        "get_file_manager_locations" as never,
      ),
    ).toBe(false);
    expect(
      ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS.includes(
        "get_home_dir" as never,
      ),
    ).toBe(false);
  });

  it("IPC channel 命名保持 app 前缀，避免裸 ipcRenderer 通道扩散", () => {
    const channels = [
      IPC_INVOKE_CHANNEL,
      IPC_EMIT_CHANNEL,
      IPC_DIALOG_OPEN_CHANNEL,
      IPC_DIALOG_SAVE_CHANNEL,
      IPC_SHELL_OPEN_CHANNEL,
      IPC_WINDOW_COMMAND_CHANNEL,
      IPC_GLOBAL_SHORTCUT_COMMAND_CHANNEL,
      IPC_DEEP_LINK_GET_URLS_CHANNEL,
      IPC_DEEP_LINK_GET_CURRENT_CHANNEL,
    ];

    expect(channels).toHaveLength(new Set(channels).size);
    expect(channels.every((channel) => channel.startsWith("app:"))).toBe(true);
  });
});
