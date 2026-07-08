import { isFiniteNumber, isRecord } from "./serverRuntimeGuards";
import type {
  ServerDiagnostics,
  LogArtifactEntry,
  LogStorageDiagnostics,
  SupportBundleExportResult,
  SupportBundleExportParams,
  DiagnosticsTraceRedactionPolicy,
  DiagnosticsTraceSummary,
  DiagnosticsTraceEvent,
  DiagnosticsTraceListResult,
  DiagnosticsTraceReadResult,
  DiagnosticsTraceExportResult,
  WindowsStartupDiagnostics,
} from "./serverRuntimeTypes";

function projectLogArtifactEntry(value: {
  fileName: string;
  path: string;
  sizeBytes: number;
  modifiedAt?: string;
  compressed: boolean;
}): LogArtifactEntry {
  return {
    file_name: value.fileName,
    path: value.path,
    size_bytes: value.sizeBytes,
    ...(value.modifiedAt ? { modified_at: value.modifiedAt } : {}),
    compressed: value.compressed,
  };
}

export function projectLogStorageDiagnostics(value: {
  logDirectory?: string;
  currentLogPath?: string;
  currentLogExists: boolean;
  currentLogSizeBytes?: number;
  inMemoryLogCount: number;
  relatedLogFiles: Array<{
    fileName: string;
    path: string;
    sizeBytes: number;
    modifiedAt?: string;
    compressed: boolean;
  }>;
  rawResponseFiles: Array<{
    fileName: string;
    path: string;
    sizeBytes: number;
    modifiedAt?: string;
    compressed: boolean;
  }>;
}): LogStorageDiagnostics {
  return {
    ...(value.logDirectory ? { log_directory: value.logDirectory } : {}),
    ...(value.currentLogPath ? { current_log_path: value.currentLogPath } : {}),
    current_log_exists: value.currentLogExists,
    ...(typeof value.currentLogSizeBytes === "number"
      ? { current_log_size_bytes: value.currentLogSizeBytes }
      : {}),
    in_memory_log_count: value.inMemoryLogCount,
    related_log_files: value.relatedLogFiles.map(projectLogArtifactEntry),
    raw_response_files: value.rawResponseFiles.map(projectLogArtifactEntry),
  };
}

export function projectServerDiagnostics(value: {
  generatedAt: string;
  running: boolean;
  host: string;
  port: number;
  telemetrySummary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    timeoutRequests: number;
    successRate: number;
    avgLatencyMs: number;
    minLatencyMs?: number | null;
    maxLatencyMs?: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  capabilityRouting: {
    filterEvalTotal: number;
    filterExcludedTotal: number;
    filterExcludedToolsTotal: number;
    filterExcludedVisionTotal: number;
    filterExcludedContextTotal: number;
    providerFallbackTotal: number;
    modelFallbackTotal: number;
    allCandidatesExcludedTotal: number;
  };
  responseCache: {
    config: {
      enabled: boolean;
      ttlSecs: number;
      maxEntries?: number;
      maxBodyBytes?: number;
      cacheableStatusCodes: number[];
    };
    stats: unknown;
    hitRatePercent: number;
  };
  requestDedup: {
    config: {
      enabled: boolean;
      ttlSecs: number;
      waitTimeoutMs?: number;
    };
    stats: unknown;
    replayRatePercent: number;
  };
  idempotency: {
    config: {
      enabled: boolean;
      ttlSecs: number;
      headerName?: string;
    };
    stats: unknown;
    replayRatePercent: number;
  };
}): ServerDiagnostics {
  const responseCacheStats = isRecord(value.responseCache.stats)
    ? value.responseCache.stats
    : {};
  const requestDedupStats = isRecord(value.requestDedup.stats)
    ? value.requestDedup.stats
    : {};
  const idempotencyStats = isRecord(value.idempotency.stats)
    ? value.idempotency.stats
    : {};
  const numberFromStats = (
    stats: Record<string, unknown>,
    key: string,
  ): number => (isFiniteNumber(stats[key]) ? stats[key] : 0);

  return {
    generated_at: value.generatedAt,
    running: value.running,
    host: value.host,
    port: value.port,
    telemetry_summary: {
      total_requests: value.telemetrySummary.totalRequests,
      successful_requests: value.telemetrySummary.successfulRequests,
      failed_requests: value.telemetrySummary.failedRequests,
      timeout_requests: value.telemetrySummary.timeoutRequests,
      success_rate: value.telemetrySummary.successRate,
      avg_latency_ms: value.telemetrySummary.avgLatencyMs,
      min_latency_ms: value.telemetrySummary.minLatencyMs ?? null,
      max_latency_ms: value.telemetrySummary.maxLatencyMs ?? null,
      total_input_tokens: value.telemetrySummary.totalInputTokens,
      total_output_tokens: value.telemetrySummary.totalOutputTokens,
      total_tokens: value.telemetrySummary.totalTokens,
    },
    capability_routing: {
      filter_eval_total: value.capabilityRouting.filterEvalTotal,
      filter_excluded_total: value.capabilityRouting.filterExcludedTotal,
      filter_excluded_tools_total:
        value.capabilityRouting.filterExcludedToolsTotal,
      filter_excluded_vision_total:
        value.capabilityRouting.filterExcludedVisionTotal,
      filter_excluded_context_total:
        value.capabilityRouting.filterExcludedContextTotal,
      provider_fallback_total: value.capabilityRouting.providerFallbackTotal,
      model_fallback_total: value.capabilityRouting.modelFallbackTotal,
      all_candidates_excluded_total:
        value.capabilityRouting.allCandidatesExcludedTotal,
    },
    response_cache: {
      config: {
        enabled: value.responseCache.config.enabled,
        ttl_secs: value.responseCache.config.ttlSecs,
        max_entries: value.responseCache.config.maxEntries ?? 0,
        max_body_bytes: value.responseCache.config.maxBodyBytes ?? 0,
        cacheable_status_codes:
          value.responseCache.config.cacheableStatusCodes ?? [],
      },
      stats: {
        size: numberFromStats(responseCacheStats, "size"),
        hits: numberFromStats(responseCacheStats, "hits"),
        misses: numberFromStats(responseCacheStats, "misses"),
        evictions: numberFromStats(responseCacheStats, "evictions"),
      },
      hit_rate_percent: value.responseCache.hitRatePercent,
    },
    request_dedup: {
      config: {
        enabled: value.requestDedup.config.enabled,
        ttl_secs: value.requestDedup.config.ttlSecs,
        wait_timeout_ms: value.requestDedup.config.waitTimeoutMs ?? 0,
      },
      stats: {
        inflight_size: numberFromStats(requestDedupStats, "inflight_size"),
        completed_size: numberFromStats(requestDedupStats, "completed_size"),
        check_new_total: numberFromStats(requestDedupStats, "check_new_total"),
        check_in_progress_total: numberFromStats(
          requestDedupStats,
          "check_in_progress_total",
        ),
        check_completed_total: numberFromStats(
          requestDedupStats,
          "check_completed_total",
        ),
        wait_success_total: numberFromStats(
          requestDedupStats,
          "wait_success_total",
        ),
        wait_timeout_total: numberFromStats(
          requestDedupStats,
          "wait_timeout_total",
        ),
        wait_no_result_total: numberFromStats(
          requestDedupStats,
          "wait_no_result_total",
        ),
        complete_total: numberFromStats(requestDedupStats, "complete_total"),
        remove_total: numberFromStats(requestDedupStats, "remove_total"),
      },
      replay_rate_percent: value.requestDedup.replayRatePercent,
    },
    idempotency: {
      config: {
        enabled: value.idempotency.config.enabled,
        ttl_secs: value.idempotency.config.ttlSecs,
        header_name: value.idempotency.config.headerName ?? "idempotency-key",
      },
      stats: {
        entries_size: numberFromStats(idempotencyStats, "entries_size"),
        in_progress_size: numberFromStats(idempotencyStats, "in_progress_size"),
        completed_size: numberFromStats(idempotencyStats, "completed_size"),
        check_new_total: numberFromStats(idempotencyStats, "check_new_total"),
        check_in_progress_total: numberFromStats(
          idempotencyStats,
          "check_in_progress_total",
        ),
        check_completed_total: numberFromStats(
          idempotencyStats,
          "check_completed_total",
        ),
        complete_total: numberFromStats(idempotencyStats, "complete_total"),
        remove_total: numberFromStats(idempotencyStats, "remove_total"),
      },
      replay_rate_percent: value.idempotency.replayRatePercent,
    },
  };
}

export function projectSupportBundleExport(value: {
  bundlePath: string;
  outputDirectory: string;
  generatedAt: string;
  platform: string;
  includedSections: string[];
  omittedSections: string[];
}): SupportBundleExportResult {
  return {
    bundle_path: value.bundlePath,
    output_directory: value.outputDirectory,
    generated_at: value.generatedAt,
    platform: value.platform,
    included_sections: value.includedSections,
    omitted_sections: value.omittedSections,
  };
}

export function projectSupportBundleExportParams(
  params: SupportBundleExportParams,
): { includeTraceExport?: { sessionId: string; traceId: string } } | undefined {
  const selection = params.include_trace_export;
  if (!selection) {
    return undefined;
  }
  return {
    includeTraceExport: {
      sessionId: selection.session_id,
      traceId: selection.trace_id,
    },
  };
}

function projectTraceRedactionPolicy(value: {
  mode: string;
  rawAgentEventPayload: boolean;
  promptText: boolean;
  providerPayload: boolean;
}): DiagnosticsTraceRedactionPolicy {
  return {
    mode: value.mode,
    raw_agent_event_payload: value.rawAgentEventPayload,
    prompt_text: value.promptText,
    provider_payload: value.providerPayload,
  };
}

function projectTraceSummary(value: {
  sessionId: string;
  traceId: string;
  path: string;
  sizeBytes: number;
  eventCount: number;
  firstWallTimeUnixMs?: number | null;
  lastWallTimeUnixMs?: number | null;
  modifiedAt?: string | null;
}): DiagnosticsTraceSummary {
  return {
    session_id: value.sessionId,
    trace_id: value.traceId,
    path: value.path,
    size_bytes: value.sizeBytes,
    event_count: value.eventCount,
    ...(typeof value.firstWallTimeUnixMs === "number"
      ? { first_wall_time_unix_ms: value.firstWallTimeUnixMs }
      : {}),
    ...(typeof value.lastWallTimeUnixMs === "number"
      ? { last_wall_time_unix_ms: value.lastWallTimeUnixMs }
      : {}),
    ...(value.modifiedAt ? { modified_at: value.modifiedAt } : {}),
  };
}

function projectTraceEvent(value: {
  schemaVersion: number;
  seq: number;
  wallTimeUnixMs: number;
  traceId: string;
  runId?: string | null;
  requestId?: string | null;
  sessionId: string;
  threadId?: string | null;
  turnId?: string | null;
  eventId: string;
  eventSequence: number;
  eventType: string;
  checkpoint: string;
  metrics?: Record<string, unknown>;
  redaction: {
    mode: string;
    rawAgentEventPayload: boolean;
    promptText: boolean;
    providerPayload: boolean;
  };
}): DiagnosticsTraceEvent {
  return {
    schema_version: value.schemaVersion,
    seq: value.seq,
    wall_time_unix_ms: value.wallTimeUnixMs,
    trace_id: value.traceId,
    run_id: value.runId ?? null,
    request_id: value.requestId ?? null,
    session_id: value.sessionId,
    thread_id: value.threadId ?? null,
    turn_id: value.turnId ?? null,
    event_id: value.eventId,
    event_sequence: value.eventSequence,
    event_type: value.eventType,
    checkpoint: value.checkpoint,
    metrics: isRecord(value.metrics) ? value.metrics : {},
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

export function projectDiagnosticsTraceList(value: {
  available: boolean;
  traceRoot?: string | null;
  traces?: Array<Parameters<typeof projectTraceSummary>[0]>;
  redaction: Parameters<typeof projectTraceRedactionPolicy>[0];
}): DiagnosticsTraceListResult {
  return {
    available: value.available,
    trace_root: value.traceRoot ?? null,
    traces: (value.traces ?? []).map(projectTraceSummary),
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

export function projectDiagnosticsTraceRead(value: {
  available: boolean;
  trace?: Parameters<typeof projectTraceSummary>[0] | null;
  events?: Array<Parameters<typeof projectTraceEvent>[0]>;
  redaction: Parameters<typeof projectTraceRedactionPolicy>[0];
}): DiagnosticsTraceReadResult {
  return {
    available: value.available,
    trace: value.trace ? projectTraceSummary(value.trace) : null,
    events: (value.events ?? []).map(projectTraceEvent),
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

export function projectDiagnosticsTraceExport(value: {
  available: boolean;
  exported: boolean;
  trace?: Parameters<typeof projectTraceSummary>[0] | null;
  bundlePath?: string | null;
  outputDirectory?: string | null;
  generatedAt?: string | null;
  includedSections?: string[];
  omittedSections?: string[];
  redaction: Parameters<typeof projectTraceRedactionPolicy>[0];
}): DiagnosticsTraceExportResult {
  return {
    available: value.available,
    exported: value.exported,
    trace: value.trace ? projectTraceSummary(value.trace) : null,
    bundle_path: value.bundlePath ?? null,
    output_directory: value.outputDirectory ?? null,
    generated_at: value.generatedAt ?? null,
    included_sections: value.includedSections ?? [],
    omitted_sections: value.omittedSections ?? [],
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

export function projectWindowsStartupDiagnostics(value: {
  platform: string;
  appDataDir?: string | null;
  legacyLimeDir?: string | null;
  dbPath?: string | null;
  webview2Version?: string | null;
  currentExe?: string | null;
  currentDir?: string | null;
  resourceDir?: string | null;
  homeDir?: string | null;
  shellEnv?: string | null;
  comspecEnv?: string | null;
  resolvedTerminalShell?: string | null;
  installationKindGuess?: string | null;
  checks: Array<{
    key: string;
    status: string;
    message: string;
    detail?: string | null;
  }>;
  hasBlockingIssues: boolean;
  hasWarnings: boolean;
  summaryMessage?: string | null;
}): WindowsStartupDiagnostics {
  const projectStatus = (status: string): "ok" | "warning" | "error" => {
    if (status === "ok" || status === "warning" || status === "error") {
      return status;
    }
    return "warning";
  };

  return {
    platform: value.platform,
    app_data_dir: value.appDataDir ?? null,
    legacy_lime_dir: value.legacyLimeDir ?? null,
    db_path: value.dbPath ?? null,
    webview2_version: value.webview2Version ?? null,
    current_exe: value.currentExe ?? null,
    current_dir: value.currentDir ?? null,
    resource_dir: value.resourceDir ?? null,
    home_dir: value.homeDir ?? null,
    shell_env: value.shellEnv ?? null,
    comspec_env: value.comspecEnv ?? null,
    resolved_terminal_shell: value.resolvedTerminalShell ?? null,
    installation_kind_guess: value.installationKindGuess ?? null,
    checks: value.checks.map((check) => ({
      key: check.key,
      status: projectStatus(check.status),
      message: check.message,
      detail: check.detail ?? null,
    })),
    has_blocking_issues: value.hasBlockingIssues,
    has_warnings: value.hasWarnings,
    summary_message: value.summaryMessage ?? null,
  };
}
