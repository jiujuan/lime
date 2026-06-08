import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  exportSupportBundle,
  getLogStorageDiagnostics,
  getServerDiagnostics,
  getWindowsStartupDiagnostics,
} from "./serverRuntime";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

const telemetrySummary = {
  total_requests: 0,
  successful_requests: 0,
  failed_requests: 0,
  timeout_requests: 0,
  success_rate: 0,
  avg_latency_ms: 0,
  min_latency_ms: null,
  max_latency_ms: null,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_tokens: 0,
};

const capabilityRouting = {
  filter_eval_total: 0,
  filter_excluded_total: 0,
  filter_excluded_tools_total: 0,
  filter_excluded_vision_total: 0,
  filter_excluded_context_total: 0,
  provider_fallback_total: 0,
  model_fallback_total: 0,
  all_candidates_excluded_total: 0,
};

const responseCache = {
  config: {
    enabled: true,
    ttl_secs: 600,
    max_entries: 200,
    max_body_bytes: 1048576,
    cacheable_status_codes: [200],
  },
  stats: {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
  },
  hit_rate_percent: 0,
};

const requestDedup = {
  config: {
    enabled: true,
    ttl_secs: 30,
    wait_timeout_ms: 3000,
  },
  stats: {
    inflight_size: 0,
    completed_size: 0,
    check_new_total: 0,
    check_in_progress_total: 0,
    check_completed_total: 0,
    wait_success_total: 0,
    wait_timeout_total: 0,
    wait_no_result_total: 0,
    complete_total: 0,
    remove_total: 0,
  },
  replay_rate_percent: 0,
};

const idempotency = {
  config: {
    enabled: true,
    ttl_secs: 300,
    header_name: "idempotency-key",
  },
  stats: {
    entries_size: 0,
    in_progress_size: 0,
    completed_size: 0,
    check_new_total: 0,
    check_in_progress_total: 0,
    check_completed_total: 0,
    complete_total: 0,
    remove_total: 0,
  },
  replay_rate_percent: 0,
};

describe("serverRuntime API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理诊断类命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        generated_at: "now",
        running: true,
        host: "127.0.0.1",
        port: 17333,
        telemetry_summary: telemetrySummary,
        capability_routing: capabilityRouting,
        response_cache: responseCache,
        request_dedup: requestDedup,
        idempotency,
      })
      .mockResolvedValueOnce({
        current_log_exists: true,
        in_memory_log_count: 0,
        related_log_files: [],
        raw_response_files: [],
      })
      .mockResolvedValueOnce({
        bundle_path: "/tmp/a.zip",
        output_directory: "/tmp",
        generated_at: "now",
        platform: "darwin",
        included_sections: ["meta/manifest.json"],
        omitted_sections: [],
      })
      .mockResolvedValueOnce({
        platform: "windows",
        checks: [],
        has_blocking_issues: false,
        has_warnings: false,
      });

    await expect(getServerDiagnostics()).resolves.toEqual(
      expect.objectContaining({ running: true }),
    );
    await expect(getLogStorageDiagnostics()).resolves.toEqual(
      expect.objectContaining({ current_log_exists: true }),
    );
    await expect(exportSupportBundle()).resolves.toEqual(
      expect.objectContaining({ bundle_path: "/tmp/a.zip" }),
    );
    await expect(getWindowsStartupDiagnostics()).resolves.toEqual(
      expect.objectContaining({ platform: "windows" }),
    );
  });

  it("诊断命令遇到 degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      generated_at: "now",
      running: false,
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "get_server_diagnostics",
        status: "degraded",
      },
    });

    await expect(getServerDiagnostics()).rejects.toThrow(
      "get_server_diagnostics 尚未接入真实诊断 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("诊断命令遇到非诊断结果形状时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        current_log_exists: true,
        in_memory_log_count: 0,
      })
      .mockResolvedValueOnce({ bundle_path: "/tmp/a.zip" })
      .mockResolvedValueOnce({
        platform: "windows",
        checks: [],
        has_blocking_issues: false,
      });

    await expect(getServerDiagnostics()).rejects.toThrow(
      "get_server_diagnostics did not return diagnostics",
    );
    await expect(getLogStorageDiagnostics()).rejects.toThrow(
      "get_log_storage_diagnostics did not return log diagnostics",
    );
    await expect(exportSupportBundle()).rejects.toThrow(
      "export_support_bundle did not return support bundle",
    );
    await expect(getWindowsStartupDiagnostics()).rejects.toThrow(
      "get_windows_startup_diagnostics did not return startup diagnostics",
    );
  });

  it("server diagnostics nested DTO 为空对象时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      generated_at: "now",
      running: true,
      host: "127.0.0.1",
      port: 17333,
      telemetry_summary: {},
      capability_routing: capabilityRouting,
      response_cache: responseCache,
      request_dedup: requestDedup,
      idempotency,
    });

    await expect(getServerDiagnostics()).rejects.toThrow(
      "get_server_diagnostics did not return diagnostics",
    );
  });

  it("support bundle 遇到 desktop-host mock marker 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      bundle_path: "mock://Lime-Support.zip",
      output_directory: "mock://",
      generated_at: "now",
      platform: "mock-web",
      included_sections: ["meta/manifest.json"],
      omitted_sections: [],
    });

    await expect(exportSupportBundle()).rejects.toThrow(
      "export_support_bundle 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  });

  it("Windows 启动诊断遇到 desktop-host mock marker 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      platform: "mock-web",
      checks: [],
      has_blocking_issues: false,
      has_warnings: false,
    });

    await expect(getWindowsStartupDiagnostics()).rejects.toThrow(
      "get_windows_startup_diagnostics 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  });
});
