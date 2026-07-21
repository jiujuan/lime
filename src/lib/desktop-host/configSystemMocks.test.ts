import { beforeEach, describe, expect, it } from "vitest";
import { clearMocks, invokeMockOnly } from "./core";

async function expectRetiredCommandsToFailClosed(commands: string[]) {
  for (const command of commands) {
    await expect(invokeMockOnly(command)).rejects.toSatisfy((error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      return message.includes(`未注册命令 "${command}"`);
    });
  }
}

describe("configSystemMocks", () => {
  beforeEach(() => {
    clearMocks();
  });

  it("不应保留已无生产入口的 endpoint providers 默认 mock", async () => {
    await expectRetiredCommandsToFailClosed(["get_endpoint_providers"]);
  });

  it("不应保留 diagnostics 默认成功 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_server_diagnostics",
      "get_log_storage_diagnostics",
      "get_windows_startup_diagnostics",
    ]);
  });

  it("不应保留已无前端生产入口的 provider legacy 默认 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_openai_custom_status",
      "set_openai_custom_config",
      "get_claude_custom_status",
      "set_claude_custom_config",
      "check_api_compatibility",
      "set_endpoint_provider",
      "get_providers",
      "get_credentials",
      "get_available_models",
    ]);
  });

  it("不应保留已无前端生产入口的 telemetry legacy 默认 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_request_logs",
      "get_request_log_detail",
      "clear_request_logs",
      "get_stats_summary",
      "get_stats_by_provider",
      "get_stats_by_model",
      "get_token_summary",
      "get_token_stats_by_provider",
      "get_token_stats_by_model",
      "get_token_stats_by_day",
    ]);
  });

  it("不应保留已无前端生产入口的 window legacy 默认 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_window_size",
      "set_window_size",
      "center_window",
      "toggle_fullscreen",
      "is_fullscreen",
    ]);
  });

  it("不应保留已无前端生产入口的 injection legacy 默认 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_injection_config",
      "set_injection_enabled",
      "get_injection_rules",
      "add_injection_rule",
      "remove_injection_rule",
      "update_injection_rule",
    ]);
  });

  it("不应保留前端崩溃上报默认成功 mock", async () => {
    await expectRetiredCommandsToFailClosed(["report_frontend_crash"]);
  });

  it("不应保留配置读写和默认 Provider 默认 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_config",
      "save_config",
      "get_default_provider",
      "set_default_provider",
    ]);
  });

  it("不应保留实验配置默认 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_experimental_config",
      "save_experimental_config",
    ]);
  });

  it("不应保留已下线 Prompt 管理默认成功 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_prompts",
      "upsert_prompt",
      "add_prompt",
      "update_prompt",
      "delete_prompt",
      "enable_prompt",
      "import_prompt_from_file",
      "get_current_prompt_file_content",
      "auto_import_prompt",
    ]);
  });

  it("不应保留已无生产入口的窗口尺寸默认 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_window_size_options",
      "set_window_size_by_option",
      "resize_for_flow_monitor",
      "restore_window_size",
      "toggle_window_size",
    ]);
  });

  it("不应保留提示路由默认空数组 mock", async () => {
    await expectRetiredCommandsToFailClosed(["get_hint_routes"]);
  });

  it("不应保留 sysinfo/session/intercept 旧默认成功 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "subscribe_sysinfo",
      "unsubscribe_sysinfo",
      "update_session",
      "add_flow_to_session",
      "remove_flow_from_session",
      "unarchive_session",
      "archive_session",
      "delete_session",
      "remove_bookmark",
      "intercept_config_set",
      "intercept_continue",
      "intercept_cancel",
      "delete_quick_filter",
    ]);
  });

  it("不应保留 Machine ID 旧默认成功 mock", async () => {
    await expectRetiredCommandsToFailClosed([
      "get_current_machine_id",
      "set_machine_id",
      "generate_random_machine_id",
      "validate_machine_id",
      "check_admin_privileges",
      "get_os_type",
      "backup_machine_id_to_file",
      "restore_machine_id_from_file",
      "format_machine_id",
      "detect_machine_id_format",
      "convert_machine_id_format",
      "get_machine_id_history",
      "clear_machine_id_override",
      "copy_machine_id_to_clipboard",
      "paste_machine_id_from_clipboard",
      "get_system_info",
    ]);
  });
});
