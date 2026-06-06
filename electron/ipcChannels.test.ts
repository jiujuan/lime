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
    expect(isElectronHostCommand("fetch_provider_models_auto")).toBe(true);
    expect(isElectronHostCommand("get_provider_ui_state")).toBe(true);
    expect(isElectronHostCommand("get_local_skills_for_app")).toBe(true);
    expect(isElectronHostCommand("get_automation_jobs")).toBe(true);
    expect(isElectronHostCommand("get_automation_scheduler_config")).toBe(true);
    expect(isElectronHostCommand("get_automation_status")).toBe(true);
    expect(isElectronHostCommand("get_automation_health")).toBe(true);
    expect(isElectronHostCommand("project_memory_get")).toBe(true);
    expect(isElectronHostCommand("get_model_registry")).toBe(true);
    expect(isElectronHostCommand("get_api_key_providers")).toBe(true);
    expect(isElectronHostCommand("list_executable_skills")).toBe(true);
    expect(isElectronHostCommand("workspace_list")).toBe(true);
    expect(isElectronHostCommand("workspace_get_by_path")).toBe(true);
    expect(isElectronHostCommand("get_config")).toBe(true);
    expect(isElectronHostCommand("agent_app_list_installed")).toBe(true);
    expect(isElectronHostCommand("sync_tray_model_shortcuts")).toBe(true);
    expect(
      isElectronHostCommand("take_pending_skill_package_open_requests"),
    ).toBe(true);
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
      "agent_app_list_installed",
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
      "fetch_provider_models_auto",
      "get_all_alias_configs",
      "get_api_key_providers",
      "get_automation_health",
      "get_automation_jobs",
      "get_automation_scheduler_config",
      "get_automation_status",
      "get_default_provider",
      "get_local_skills_for_app",
      "get_model_preferences",
      "get_model_registry",
      "get_model_registry_provider_ids",
      "get_model_sync_state",
      "get_models_by_tier",
      "get_models_for_provider",
      "get_provider_alias_config",
      "get_skill_detail",
      "get_system_provider_catalog",
      "knowledge_list_packs",
      "list_executable_skills",
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
