import { createAppServerClient } from "./appServer";
import {
  assertDiagnosticsTraceExportResult,
  assertDiagnosticsTraceListResult,
  assertDiagnosticsTraceReadResult,
  assertLogStorageDiagnostics,
  assertNotMockSupportBundle,
  assertNotMockWindowsStartup,
  assertServerDiagnostics,
  assertSupportBundleExportResult,
  assertWindowsStartupDiagnostics,
} from "./serverRuntimeGuards";
import {
  projectDiagnosticsTraceExport,
  projectDiagnosticsTraceList,
  projectDiagnosticsTraceRead,
  projectLogStorageDiagnostics,
  projectServerDiagnostics,
  projectSupportBundleExport,
  projectSupportBundleExportParams,
  projectWindowsStartupDiagnostics,
} from "./serverRuntimeProjection";
import type {
  DiagnosticsTraceExportParams,
  DiagnosticsTraceExportResult,
  DiagnosticsTraceListParams,
  DiagnosticsTraceListResult,
  DiagnosticsTraceReadParams,
  DiagnosticsTraceReadResult,
  LogStorageDiagnostics,
  ServerDiagnostics,
  SupportBundleExportParams,
  SupportBundleExportResult,
  WindowsStartupDiagnostics,
} from "./serverRuntimeTypes";

export type {
  CapabilityRoutingMetricsSnapshot,
  ResponseCacheConfig,
  ResponseCacheStats,
  RequestDedupStats,
  IdempotencyStats,
  TelemetrySummary,
  ResponseCacheDiagnostics,
  RequestDedupConfig,
  RequestDedupDiagnostics,
  IdempotencyConfig,
  IdempotencyDiagnostics,
  ServerDiagnostics,
  LogArtifactEntry,
  LogStorageDiagnostics,
  SupportBundleExportResult,
  SupportBundleTraceExportSelection,
  SupportBundleExportParams,
  DiagnosticsTraceListParams,
  DiagnosticsTraceReadParams,
  DiagnosticsTraceExportParams,
  DiagnosticsTraceRedactionPolicy,
  DiagnosticsTraceSummary,
  DiagnosticsTraceEvent,
  DiagnosticsTraceListResult,
  DiagnosticsTraceReadResult,
  DiagnosticsTraceExportResult,
  WindowsStartupCheck,
  WindowsStartupDiagnostics,
} from "./serverRuntimeTypes";

export async function getServerDiagnostics(): Promise<ServerDiagnostics> {
  const response = await createAppServerClient().readServerDiagnostics();
  const result = projectServerDiagnostics(response.result);
  assertServerDiagnostics(result);
  return result;
}

export async function getLogStorageDiagnostics(): Promise<LogStorageDiagnostics> {
  const response = await createAppServerClient().readLogStorageDiagnostics();
  const result = projectLogStorageDiagnostics(response.result);
  assertLogStorageDiagnostics(result);
  return result;
}

export async function exportSupportBundle(
  params: SupportBundleExportParams = {},
): Promise<SupportBundleExportResult> {
  const requestParams = projectSupportBundleExportParams(params);
  const response = requestParams
    ? await createAppServerClient().exportSupportBundle(requestParams)
    : await createAppServerClient().exportSupportBundle();
  const result = projectSupportBundleExport(response.result);
  assertSupportBundleExportResult(result);
  assertNotMockSupportBundle(result);
  return result;
}

export async function listDiagnosticsTraces(
  params: DiagnosticsTraceListParams = {},
): Promise<DiagnosticsTraceListResult> {
  const response = await createAppServerClient().listDiagnosticsTraces({
    ...(params.session_id ? { sessionId: params.session_id } : {}),
    ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
  });
  const result = projectDiagnosticsTraceList(response.result);
  assertDiagnosticsTraceListResult(result);
  return result;
}

export async function readDiagnosticsTrace(
  params: DiagnosticsTraceReadParams,
): Promise<DiagnosticsTraceReadResult> {
  const response = await createAppServerClient().readDiagnosticsTrace({
    sessionId: params.session_id,
    traceId: params.trace_id,
    ...(typeof params.max_events === "number"
      ? { maxEvents: params.max_events }
      : {}),
  });
  const result = projectDiagnosticsTraceRead(response.result);
  assertDiagnosticsTraceReadResult(result);
  return result;
}

export async function exportDiagnosticsTrace(
  params: DiagnosticsTraceExportParams,
): Promise<DiagnosticsTraceExportResult> {
  const response = await createAppServerClient().exportDiagnosticsTrace({
    sessionId: params.session_id,
    traceId: params.trace_id,
  });
  const result = projectDiagnosticsTraceExport(response.result);
  assertDiagnosticsTraceExportResult(result);
  return result;
}

export async function getWindowsStartupDiagnostics(): Promise<WindowsStartupDiagnostics> {
  const response =
    await createAppServerClient().readWindowsStartupDiagnostics();
  const result = projectWindowsStartupDiagnostics(response.result);
  assertWindowsStartupDiagnostics(result);
  assertNotMockWindowsStartup(result);
  return result;
}
