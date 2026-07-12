import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeViaHttp: vi.fn(),
  isDevBridgeAvailable: vi.fn(),
  normalizeDevBridgeError: vi.fn((cmd: string, error: unknown) => {
    if (error instanceof Error) {
      return new Error(`[${cmd}] ${error.message}`);
    }
    return new Error(`[${cmd}] ${String(error)}`);
  }),
}));

vi.mock("../dev-bridge/http-client", () => ({
  invokeViaHttp: mocks.invokeViaHttp,
  isDevBridgeAvailable: mocks.isDevBridgeAvailable,
  normalizeDevBridgeError: mocks.normalizeDevBridgeError,
}));

import { clearMocks, invokeMockOnly, mockCommand } from "./core";

describe("desktop-host/core 未注册 mock command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMocks();
  });

  it("显式 mock 入口遇到未注册命令时 fail closed", async () => {
    await expect(invokeMockOnly("legacy_command_removed")).rejects.toThrow(
      '未注册命令 "legacy_command_removed"',
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Plugin uninstall / shell 默认 mock 被清理后不再伪造成功", async () => {
    for (const command of ["plugin_uninstall", "plugin_launch_shell"]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("快捷键校验默认 mock 被清理后不再伪造成功", async () => {
    await expect(
      invokeMockOnly("validate_shortcut", {
        shortcutStr: "CommandOrControl+Shift+V",
      }),
    ).rejects.toThrow('未注册命令 "validate_shortcut"');

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("前端崩溃上报默认 mock 被清理后不再伪造成功", async () => {
    await expect(
      invokeMockOnly("report_frontend_crash", {
        report: { message: "boom" },
      }),
    ).rejects.toThrow('未注册命令 "report_frontend_crash"');

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("配置读写和默认 Provider 默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
      "get_config",
      "save_config",
      "get_default_provider",
      "set_default_provider",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Agent Runtime session update / delete 默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
      "agent_runtime_update_session",
      "agent_runtime_delete_session",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Agent Runtime evidence pack 默认 mock 被清理后不再伪造导出成功", async () => {
    await expect(
      invokeMockOnly("agent_runtime_export_evidence_pack", {
        sessionId: "mock-session",
      }),
    ).rejects.toThrow('未注册命令 "agent_runtime_export_evidence_pack"');

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Agent Runtime process / Agent residual 默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
      "agent_get_process_status",
      "agent_start_process",
      "agent_stop_process",
      "agent_init",
      "agent_status",
      "agent_configure_provider",
      "agent_reset",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Capability Draft 默认 mock 被清理后不再伪造草案成功", async () => {
    for (const command of [
      "capability_draft_create",
      "capability_draft_list",
      "capability_draft_get",
      "capability_draft_verify",
      "capability_draft_register",
      "capability_draft_submit_approval_session_inputs",
      "capability_draft_execute_controlled_get",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("实验配置默认 mock 被清理后不再伪造配置读写成功", async () => {
    for (const command of [
      "get_experimental_config",
      "save_experimental_config",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Prompt 管理默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
      "get_prompts",
      "upsert_prompt",
      "add_prompt",
      "update_prompt",
      "delete_prompt",
      "enable_prompt",
      "import_prompt_from_file",
      "get_current_prompt_file_content",
      "auto_import_prompt",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("窗口尺寸默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
      "get_window_size_options",
      "set_window_size_by_option",
      "resize_for_flow_monitor",
      "restore_window_size",
      "toggle_window_size",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("sysinfo/session/intercept 旧默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
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
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Machine ID 旧默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
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
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("提示路由旧默认 mock 被清理后不再伪造空列表", async () => {
    await expect(invokeMockOnly("get_hint_routes")).rejects.toThrow(
      '未注册命令 "get_hint_routes"',
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("模型 Provider id 默认 mock 被清理后不再伪造空列表", async () => {
    await expect(
      invokeMockOnly("get_model_registry_provider_ids"),
    ).rejects.toThrow('未注册命令 "get_model_registry_provider_ids"');

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("模型 residual 默认 mock 被清理后不再伪造成功", async () => {
    for (const command of [
      "refresh_model_registry",
      "search_models",
      "toggle_model_favorite",
      "hide_model",
      "record_model_usage",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("测试显式注册的 mock command 仍可使用", async () => {
    mockCommand("test_only_current_fixture", () => ({ ok: true }));

    await expect(invokeMockOnly("test_only_current_fixture")).resolves.toEqual({
      ok: true,
    });
  });
});
