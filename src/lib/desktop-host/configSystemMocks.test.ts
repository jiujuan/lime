import { describe, expect, it } from "vitest";
import { configSystemMocks } from "./configSystemMocks";

describe("configSystemMocks", () => {
  it("不应保留已无生产入口的 endpoint providers 默认 mock", () => {
    expect(configSystemMocks).not.toHaveProperty("get_endpoint_providers");
  });

  it("不应保留 diagnostics 默认成功 mock", () => {
    expect(configSystemMocks).not.toHaveProperty("get_server_diagnostics");
    expect(configSystemMocks).not.toHaveProperty("get_log_storage_diagnostics");
    expect(configSystemMocks).not.toHaveProperty(
      "get_windows_startup_diagnostics",
    );
  });

  it("不应保留已无前端生产入口的 provider legacy 默认 mock", () => {
    expect(configSystemMocks).not.toHaveProperty("get_openai_custom_status");
    expect(configSystemMocks).not.toHaveProperty("set_openai_custom_config");
    expect(configSystemMocks).not.toHaveProperty("get_claude_custom_status");
    expect(configSystemMocks).not.toHaveProperty("set_claude_custom_config");
    expect(configSystemMocks).not.toHaveProperty("check_api_compatibility");
    expect(configSystemMocks).not.toHaveProperty("set_endpoint_provider");
    expect(configSystemMocks).not.toHaveProperty("get_providers");
    expect(configSystemMocks).not.toHaveProperty("get_credentials");
    expect(configSystemMocks).not.toHaveProperty("get_available_models");
  });

  it("不应保留已无前端生产入口的 telemetry legacy 默认 mock", () => {
    expect(configSystemMocks).not.toHaveProperty("get_request_logs");
    expect(configSystemMocks).not.toHaveProperty("get_request_log_detail");
    expect(configSystemMocks).not.toHaveProperty("clear_request_logs");
    expect(configSystemMocks).not.toHaveProperty("get_stats_summary");
    expect(configSystemMocks).not.toHaveProperty("get_stats_by_provider");
    expect(configSystemMocks).not.toHaveProperty("get_stats_by_model");
    expect(configSystemMocks).not.toHaveProperty("get_token_summary");
    expect(configSystemMocks).not.toHaveProperty("get_token_stats_by_provider");
    expect(configSystemMocks).not.toHaveProperty("get_token_stats_by_model");
    expect(configSystemMocks).not.toHaveProperty("get_token_stats_by_day");
  });

  it("不应保留已无前端生产入口的 window legacy 默认 mock", () => {
    expect(configSystemMocks).not.toHaveProperty("get_window_size");
    expect(configSystemMocks).not.toHaveProperty("set_window_size");
    expect(configSystemMocks).not.toHaveProperty("center_window");
    expect(configSystemMocks).not.toHaveProperty("toggle_fullscreen");
    expect(configSystemMocks).not.toHaveProperty("is_fullscreen");
  });

  it("不应保留已无前端生产入口的 injection legacy 默认 mock", () => {
    expect(configSystemMocks).not.toHaveProperty("get_injection_config");
    expect(configSystemMocks).not.toHaveProperty("set_injection_enabled");
    expect(configSystemMocks).not.toHaveProperty("get_injection_rules");
    expect(configSystemMocks).not.toHaveProperty("add_injection_rule");
    expect(configSystemMocks).not.toHaveProperty("remove_injection_rule");
    expect(configSystemMocks).not.toHaveProperty("update_injection_rule");
  });
});
