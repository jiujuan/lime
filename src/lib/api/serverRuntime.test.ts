import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  exportDiagnosticsTrace,
  exportSupportBundle,
  getLogStorageDiagnostics,
  getServerDiagnostics,
  getWindowsStartupDiagnostics,
  listDiagnosticsTraces,
  readDiagnosticsTrace,
} from "./serverRuntime";

const appServerMocks = vi.hoisted(() => ({
  readServerDiagnostics: vi.fn(),
  readLogStorageDiagnostics: vi.fn(),
  exportSupportBundle: vi.fn(),
  exportDiagnosticsTrace: vi.fn(),
  listDiagnosticsTraces: vi.fn(),
  readDiagnosticsTrace: vi.fn(),
  readWindowsStartupDiagnostics: vi.fn(),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("./appServer", () => ({
  createAppServerClient: () => appServerMocks,
}));

describe("serverRuntime API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 App Server current 读取 server diagnostics 并保留旧 API 返回形态", async () => {
    appServerMocks.readServerDiagnostics.mockResolvedValueOnce({
      result: {
        generatedAt: "2026-06-09T00:00:00Z",
        running: true,
        host: "127.0.0.1",
        port: 0,
        telemetrySummary: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          timeoutRequests: 0,
          successRate: 0,
          avgLatencyMs: 0,
          minLatencyMs: null,
          maxLatencyMs: null,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
        },
        capabilityRouting: {
          filterEvalTotal: 0,
          filterExcludedTotal: 0,
          filterExcludedToolsTotal: 0,
          filterExcludedVisionTotal: 0,
          filterExcludedContextTotal: 0,
          providerFallbackTotal: 0,
          modelFallbackTotal: 0,
          allCandidatesExcludedTotal: 0,
        },
        responseCache: {
          config: {
            enabled: false,
            ttlSecs: 0,
            maxEntries: 0,
            maxBodyBytes: 0,
            cacheableStatusCodes: [],
          },
          stats: { size: 0, hits: 0, misses: 0, evictions: 0 },
          hitRatePercent: 0,
        },
        requestDedup: {
          config: {
            enabled: false,
            ttlSecs: 0,
            waitTimeoutMs: 0,
          },
          stats: {},
          replayRatePercent: 0,
        },
        idempotency: {
          config: {
            enabled: false,
            ttlSecs: 0,
            headerName: "idempotency-key",
          },
          stats: {},
          replayRatePercent: 0,
        },
      },
    });

    await expect(getServerDiagnostics()).resolves.toEqual(
      expect.objectContaining({
        generated_at: "2026-06-09T00:00:00Z",
        running: true,
        host: "127.0.0.1",
        port: 0,
        telemetry_summary: expect.objectContaining({ total_requests: 0 }),
        response_cache: expect.objectContaining({
          config: expect.objectContaining({ ttl_secs: 0 }),
        }),
      }),
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 读取日志存储诊断并保留旧 API 返回形态", async () => {
    appServerMocks.readLogStorageDiagnostics.mockResolvedValueOnce({
      result: {
        logDirectory: "/tmp/logs",
        currentLogPath: "/tmp/logs/lime.log",
        currentLogExists: true,
        currentLogSizeBytes: 128,
        inMemoryLogCount: 0,
        relatedLogFiles: [
          {
            fileName: "lime.log",
            path: "/tmp/logs/lime.log",
            sizeBytes: 128,
            modifiedAt: "2026-06-09T00:00:00Z",
            compressed: false,
          },
        ],
        rawResponseFiles: [],
      },
    });

    await expect(getLogStorageDiagnostics()).resolves.toEqual({
      log_directory: "/tmp/logs",
      current_log_path: "/tmp/logs/lime.log",
      current_log_exists: true,
      current_log_size_bytes: 128,
      in_memory_log_count: 0,
      related_log_files: [
        {
          file_name: "lime.log",
          path: "/tmp/logs/lime.log",
          size_bytes: 128,
          modified_at: "2026-06-09T00:00:00Z",
          compressed: false,
        },
      ],
      raw_response_files: [],
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 导出支持包并保留旧 API 返回形态", async () => {
    appServerMocks.exportSupportBundle.mockResolvedValueOnce({
      result: {
        bundlePath: "/tmp/Lime-Support.zip",
        outputDirectory: "/tmp",
        generatedAt: "2026-06-09T00:00:00Z",
        platform: "darwin",
        includedSections: ["meta/manifest.json"],
        omittedSections: ["Windows 启动诊断（Desktop Host current 待迁移）"],
      },
    });

    await expect(exportSupportBundle()).resolves.toEqual({
      bundle_path: "/tmp/Lime-Support.zip",
      output_directory: "/tmp",
      generated_at: "2026-06-09T00:00:00Z",
      platform: "darwin",
      included_sections: ["meta/manifest.json"],
      omitted_sections: ["Windows 启动诊断（Desktop Host current 待迁移）"],
    });
    expect(appServerMocks.exportSupportBundle).toHaveBeenCalledWith();
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 导出可选附带 Trace 的支持包", async () => {
    appServerMocks.exportSupportBundle.mockResolvedValueOnce({
      result: {
        bundlePath: "/tmp/Lime-Support.zip",
        outputDirectory: "/tmp",
        generatedAt: "2026-06-09T00:00:00Z",
        platform: "darwin",
        includedSections: [
          "meta/manifest.json",
          "trace-export/claw-trace-session-a-trace-a.zip",
        ],
        omittedSections: ["raw trace event JSONL 原始字节"],
      },
    });

    await expect(
      exportSupportBundle({
        include_trace_export: {
          session_id: "session-a",
          trace_id: "trace-a",
        },
      }),
    ).resolves.toMatchObject({
      included_sections: [
        "meta/manifest.json",
        "trace-export/claw-trace-session-a-trace-a.zip",
      ],
    });
    expect(appServerMocks.exportSupportBundle).toHaveBeenCalledWith({
      includeTraceExport: {
        sessionId: "session-a",
        traceId: "trace-a",
      },
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 读取 summary-only Claw Trace 列表", async () => {
    appServerMocks.listDiagnosticsTraces.mockResolvedValueOnce({
      result: {
        available: true,
        traces: [
          {
            sessionId: "session-a",
            traceId: "trace-a",
            path: "sessions/session_session-a/trace_trace-a.jsonl",
            sizeBytes: 128,
            eventCount: 2,
            firstWallTimeUnixMs: 1780000000000,
            lastWallTimeUnixMs: 1780000000100,
            modifiedAt: "2026-06-27T00:00:00Z",
          },
        ],
        redaction: {
          mode: "summary_only",
          rawAgentEventPayload: false,
          promptText: false,
          providerPayload: false,
        },
      },
    });

    await expect(
      listDiagnosticsTraces({ session_id: "session-a", limit: 5 }),
    ).resolves.toEqual({
      available: true,
      trace_root: null,
      traces: [
        {
          session_id: "session-a",
          trace_id: "trace-a",
          path: "sessions/session_session-a/trace_trace-a.jsonl",
          size_bytes: 128,
          event_count: 2,
          first_wall_time_unix_ms: 1780000000000,
          last_wall_time_unix_ms: 1780000000100,
          modified_at: "2026-06-27T00:00:00Z",
        },
      ],
      redaction: {
        mode: "summary_only",
        raw_agent_event_payload: false,
        prompt_text: false,
        provider_payload: false,
      },
    });
    expect(appServerMocks.listDiagnosticsTraces).toHaveBeenCalledWith({
      sessionId: "session-a",
      limit: 5,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 读取 summary-only Claw Trace 事件", async () => {
    appServerMocks.readDiagnosticsTrace.mockResolvedValueOnce({
      result: {
        available: true,
        trace: {
          sessionId: "session-a",
          traceId: "trace-a",
          path: "sessions/session_session-a/trace_trace-a.jsonl",
          sizeBytes: 128,
          eventCount: 1,
        },
        events: [
          {
            schemaVersion: 1,
            seq: 1,
            wallTimeUnixMs: 1780000000000,
            traceId: "trace-a",
            sessionId: "session-a",
            eventId: "evt-a",
            eventSequence: 1,
            eventType: "message.delta",
            checkpoint: "app_server.message_delta.emitted",
            metrics: {
              text_chars: 4,
            },
            redaction: {
              mode: "summary_only",
              rawAgentEventPayload: false,
              promptText: false,
              providerPayload: false,
            },
          },
        ],
        redaction: {
          mode: "summary_only",
          rawAgentEventPayload: false,
          promptText: false,
          providerPayload: false,
        },
      },
    });

    await expect(
      readDiagnosticsTrace({
        session_id: "session-a",
        trace_id: "trace-a",
        max_events: 20,
      }),
    ).resolves.toMatchObject({
      available: true,
      trace: {
        session_id: "session-a",
        trace_id: "trace-a",
      },
      events: [
        {
          schema_version: 1,
          checkpoint: "app_server.message_delta.emitted",
          metrics: {
            text_chars: 4,
          },
          redaction: {
            raw_agent_event_payload: false,
            prompt_text: false,
            provider_payload: false,
          },
        },
      ],
    });
    expect(appServerMocks.readDiagnosticsTrace).toHaveBeenCalledWith({
      sessionId: "session-a",
      traceId: "trace-a",
      maxEvents: 20,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 显式导出 summary-only Claw Trace zip", async () => {
    appServerMocks.exportDiagnosticsTrace.mockResolvedValueOnce({
      result: {
        available: true,
        exported: true,
        trace: {
          sessionId: "session-a",
          traceId: "trace-a",
          path: "sessions/session_session-a/trace_trace-a.jsonl",
          sizeBytes: 128,
          eventCount: 1,
        },
        bundlePath: "/tmp/claw-trace-session-a-trace-a.zip",
        outputDirectory: "/tmp",
        generatedAt: "2026-06-27T00:00:00.000Z",
        includedSections: [
          "meta/manifest.json",
          "meta/trace-summary.json",
          "trace/events.jsonl",
          "README.txt",
        ],
        omittedSections: [
          "raw AgentEvent payload",
          "prompt text",
          "provider request/response payload",
          "assistant delta text",
          "unparsed raw JSONL bytes",
        ],
        redaction: {
          mode: "summary_only",
          rawAgentEventPayload: false,
          promptText: false,
          providerPayload: false,
        },
      },
    });

    await expect(
      exportDiagnosticsTrace({
        session_id: "session-a",
        trace_id: "trace-a",
      }),
    ).resolves.toEqual({
      available: true,
      exported: true,
      trace: {
        session_id: "session-a",
        trace_id: "trace-a",
        path: "sessions/session_session-a/trace_trace-a.jsonl",
        size_bytes: 128,
        event_count: 1,
      },
      bundle_path: "/tmp/claw-trace-session-a-trace-a.zip",
      output_directory: "/tmp",
      generated_at: "2026-06-27T00:00:00.000Z",
      included_sections: [
        "meta/manifest.json",
        "meta/trace-summary.json",
        "trace/events.jsonl",
        "README.txt",
      ],
      omitted_sections: [
        "raw AgentEvent payload",
        "prompt text",
        "provider request/response payload",
        "assistant delta text",
        "unparsed raw JSONL bytes",
      ],
      redaction: {
        mode: "summary_only",
        raw_agent_event_payload: false,
        prompt_text: false,
        provider_payload: false,
      },
    });
    expect(appServerMocks.exportDiagnosticsTrace).toHaveBeenCalledWith({
      sessionId: "session-a",
      traceId: "trace-a",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 读取 Windows 启动诊断并保留旧 API 返回形态", async () => {
    appServerMocks.readWindowsStartupDiagnostics.mockResolvedValueOnce({
      result: {
        platform: "darwin",
        appDataDir: "/tmp/data",
        legacyLimeDir: "/tmp/.lime",
        dbPath: "/tmp/data/lime.db",
        currentExe: "/Applications/Lime.app",
        currentDir: "/tmp",
        homeDir: "/Users/coso",
        shellEnv: "/bin/zsh",
        checks: [
          {
            key: "app_data_dir",
            status: "ok",
            message: "应用数据目录可写",
          },
        ],
        hasBlockingIssues: false,
        hasWarnings: false,
        summaryMessage: "App Server 启动环境自检通过。",
      },
    });

    await expect(getWindowsStartupDiagnostics()).resolves.toEqual({
      platform: "darwin",
      app_data_dir: "/tmp/data",
      legacy_lime_dir: "/tmp/.lime",
      db_path: "/tmp/data/lime.db",
      webview2_version: null,
      current_exe: "/Applications/Lime.app",
      current_dir: "/tmp",
      resource_dir: null,
      home_dir: "/Users/coso",
      shell_env: "/bin/zsh",
      comspec_env: null,
      resolved_terminal_shell: null,
      installation_kind_guess: null,
      checks: [
        {
          key: "app_data_dir",
          status: "ok",
          message: "应用数据目录可写",
          detail: null,
        },
      ],
      has_blocking_issues: false,
      has_warnings: false,
      summary_message: "App Server 启动环境自检通过。",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
