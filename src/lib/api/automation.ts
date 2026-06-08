import { AppServerClient } from "@/lib/api/appServer";
import type { AgentRun } from "@/lib/api/executionRun";
import type { BrowserStreamMode } from "@/lib/webview-api";
import type {
  AsterApprovalPolicy,
  AsterSandboxPolicy,
} from "@/lib/api/agentRuntime";
import {
  METHOD_AUTOMATION_JOB_CREATE,
  METHOD_AUTOMATION_JOB_DELETE,
  METHOD_AUTOMATION_JOB_HEALTH,
  METHOD_AUTOMATION_JOB_LIST,
  METHOD_AUTOMATION_JOB_READ,
  METHOD_AUTOMATION_JOB_RUN_HISTORY,
  METHOD_AUTOMATION_JOB_RUN_NOW,
  METHOD_AUTOMATION_JOB_UPDATE,
  METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
  METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
  METHOD_AUTOMATION_SCHEDULER_STATUS,
  METHOD_AUTOMATION_SCHEDULE_PREVIEW,
  METHOD_AUTOMATION_SCHEDULE_VALIDATE,
  type AutomationJobDeleteResponse as AppServerAutomationJobDeleteResponse,
  type AutomationJobHealthResponse as AppServerAutomationJobHealthResponse,
  type AutomationJobListResponse as AppServerAutomationJobListResponse,
  type AutomationJobReadResponse as AppServerAutomationJobReadResponse,
  type AutomationJobRunHistoryResponse as AppServerAutomationJobRunHistoryResponse,
  type AutomationJobRunNowResponse as AppServerAutomationJobRunNowResponse,
  type AutomationJobWriteResponse as AppServerAutomationJobWriteResponse,
  type AutomationSchedulePreviewResponse as AppServerAutomationSchedulePreviewResponse,
  type AutomationScheduleValidateResponse as AppServerAutomationScheduleValidateResponse,
  type AutomationSchedulerConfigReadResponse as AppServerAutomationSchedulerConfigReadResponse,
  type AutomationSchedulerConfigUpdateResponse as AppServerAutomationSchedulerConfigUpdateResponse,
  type AutomationSchedulerStatusResponse as AppServerAutomationSchedulerStatusResponse,
} from "../../../packages/app-server-client/src/protocol";

export type TaskSchedule =
  | { kind: "every"; every_secs: number }
  | { kind: "cron"; expr: string; tz?: string | null }
  | { kind: "at"; at: string };

export type AutomationExecutionMode = "intelligent" | "skill" | "log_only";

export type AutomationOutputFormat = "text" | "json";
export type AutomationOutputSchema =
  | "text"
  | "json"
  | "table"
  | "csv"
  | "links";
export type AutomationRequestMetadata = Record<string, unknown>;

export interface DeliveryConfig {
  mode: "none" | "announce";
  channel?:
    | "webhook"
    | "telegram"
    | "local_file"
    | "google_sheets"
    | string
    | null;
  target?: string | null;
  best_effort: boolean;
  output_schema?: AutomationOutputSchema | null;
  output_format?: AutomationOutputFormat | null;
}

export interface AutomationLastDeliveryRecord {
  success: boolean;
  message: string;
  channel?: string | null;
  target?: string | null;
  output_kind: string;
  output_schema: AutomationOutputSchema;
  output_format: AutomationOutputFormat;
  output_preview: string;
  delivery_attempt_id?: string | null;
  run_id?: string | null;
  execution_retry_count?: number | null;
  delivery_attempts?: number | null;
  attempted_at: string;
}

export interface AutomationSchedulerConfig {
  enabled: boolean;
  poll_interval_secs: number;
  enable_history: boolean;
}

export interface AutomationStatus {
  running: boolean;
  last_polled_at: string | null;
  next_poll_at: string | null;
  last_job_count: number;
  total_executions: number;
  active_job_id: string | null;
  active_job_name: string | null;
}

export interface AgentTurnAutomationPayload {
  kind: "agent_turn";
  prompt: string;
  system_prompt?: string | null;
  web_search: boolean;
  content_id?: string | null;
  approval_policy?: AsterApprovalPolicy | null;
  sandbox_policy?: AsterSandboxPolicy | null;
  request_metadata?: AutomationRequestMetadata | null;
}

export interface BrowserSessionAutomationPayload {
  kind: "browser_session";
  profile_id: string;
  profile_key?: string | null;
  url?: string | null;
  environment_preset_id?: string | null;
  target_id?: string | null;
  open_window: boolean;
  stream_mode: BrowserStreamMode;
}

export type AutomationPayload =
  | AgentTurnAutomationPayload
  | BrowserSessionAutomationPayload;

export interface AutomationJobRecord {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  workspace_id: string;
  execution_mode: AutomationExecutionMode;
  schedule: TaskSchedule;
  payload: AutomationPayload;
  delivery: DeliveryConfig;
  timeout_secs?: number | null;
  max_retries: number;
  next_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  last_run_at?: string | null;
  last_finished_at?: string | null;
  running_started_at?: string | null;
  consecutive_failures: number;
  last_retry_count: number;
  auto_disabled_until?: string | null;
  last_delivery?: AutomationLastDeliveryRecord | null;
  created_at: string;
  updated_at: string;
}

type AutomationAppServerClient = Pick<AppServerClient, "request">;

async function requestAutomationAppServer<T>(
  method: string,
  params: unknown,
  appServerClient: AutomationAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  return response.result;
}

function normalizeAutomationJobListResponse(
  response: AppServerAutomationJobListResponse | null | undefined,
): AutomationJobRecord[] {
  if (!response || typeof response !== "object") {
    throw new Error("App Server automationJob/list did not return jobs");
  }

  if (!Array.isArray(response.jobs)) {
    throw new Error("App Server automationJob/list did not return jobs");
  }

  return response.jobs as AutomationJobRecord[];
}

function normalizeAutomationSchedulerConfigResponse(
  response:
    | AppServerAutomationSchedulerConfigReadResponse
    | AppServerAutomationSchedulerConfigUpdateResponse
    | null
    | undefined,
  method: string,
): AutomationSchedulerConfig {
  if (!response || typeof response !== "object") {
    throw new Error(`App Server ${method} did not return config`);
  }

  const config = (response as { config?: unknown }).config;
  if (!config || typeof config !== "object") {
    throw new Error(`App Server ${method} did not return config`);
  }

  return config as AutomationSchedulerConfig;
}

function normalizeAutomationStatusResponse(
  response: AppServerAutomationSchedulerStatusResponse | null | undefined,
): AutomationStatus {
  if (!response || typeof response !== "object") {
    throw new Error("App Server automationScheduler/status did not return status");
  }

  const status = response.status;
  if (!status || typeof status !== "object") {
    throw new Error("App Server automationScheduler/status did not return status");
  }

  return status as AutomationStatus;
}

function normalizeAutomationJobReadResponse(
  response: AppServerAutomationJobReadResponse | null | undefined,
): AutomationJobRecord | null {
  if (!response || typeof response !== "object") {
    throw new Error("App Server automationJob/read did not return job");
  }

  return (response.job ?? null) as AutomationJobRecord | null;
}

function normalizeAutomationJobWriteResponse(
  response: AppServerAutomationJobWriteResponse | null | undefined,
  method: string,
): AutomationJobRecord {
  if (!response || typeof response !== "object") {
    throw new Error(automationJobWriteMissingJobMessage(method));
  }

  const job = response.job;
  if (!job || typeof job !== "object") {
    throw new Error(automationJobWriteMissingJobMessage(method));
  }

  return job as AutomationJobRecord;
}

function automationJobWriteMissingJobMessage(method: string): string {
  if (method === METHOD_AUTOMATION_JOB_CREATE) {
    return "App Server automationJob/create did not return job";
  }
  if (method === METHOD_AUTOMATION_JOB_UPDATE) {
    return "App Server automationJob/update did not return job";
  }
  return `App Server ${method} did not return job`;
}

function normalizeAutomationJobDeleteResponse(
  response: AppServerAutomationJobDeleteResponse | null | undefined,
): boolean {
  if (!response || typeof response.deleted !== "boolean") {
    throw new Error("App Server automationJob/delete did not return deleted");
  }

  return response.deleted;
}

function normalizeAutomationJobRunNowResponse(
  response: AppServerAutomationJobRunNowResponse | null | undefined,
): AutomationCycleResult {
  if (!response || typeof response !== "object") {
    throw new Error("App Server automationJob/runNow did not return result");
  }

  const result = response.result;
  if (!result || typeof result !== "object") {
    throw new Error("App Server automationJob/runNow did not return result");
  }

  return result as AutomationCycleResult;
}

function normalizeAutomationHealthResponse(
  response: AppServerAutomationJobHealthResponse | null | undefined,
): AutomationHealthResult {
  if (!response || typeof response !== "object") {
    throw new Error("App Server automationJob/health did not return health");
  }

  const health = response.health;
  if (!health || typeof health !== "object") {
    throw new Error("App Server automationJob/health did not return health");
  }

  return health as AutomationHealthResult;
}

function normalizeAutomationRunHistoryResponse(
  response: AppServerAutomationJobRunHistoryResponse | null | undefined,
): AgentRun[] {
  if (!response || !Array.isArray(response.runs)) {
    throw new Error("App Server automationJob/runHistory did not return runs");
  }

  return response.runs as AgentRun[];
}

function normalizeAutomationSchedulePreviewResponse(
  response: AppServerAutomationSchedulePreviewResponse | null | undefined,
): string | null {
  if (!response || typeof response !== "object") {
    throw new Error("App Server automationSchedule/preview did not return nextRunAt");
  }

  return response.nextRunAt ?? null;
}

function normalizeAutomationScheduleValidateResponse(
  response: AppServerAutomationScheduleValidateResponse | null | undefined,
): ScheduleValidationResult {
  if (!response || typeof response.valid !== "boolean") {
    throw new Error("App Server automationSchedule/validate did not return valid");
  }

  return {
    valid: response.valid,
    error: response.error ?? null,
  };
}

export interface AutomationJobRequest {
  name: string;
  description?: string | null;
  enabled?: boolean;
  workspace_id: string;
  execution_mode?: AutomationExecutionMode;
  schedule: TaskSchedule;
  payload: AutomationPayload;
  delivery?: DeliveryConfig;
  timeout_secs?: number | null;
  max_retries?: number;
}

export interface UpdateAutomationJobRequest {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  workspace_id?: string;
  execution_mode?: AutomationExecutionMode;
  schedule?: TaskSchedule;
  payload?: AutomationPayload;
  delivery?: DeliveryConfig;
  timeout_secs?: number | null;
  clear_timeout_secs?: boolean;
  max_retries?: number;
}

export interface AutomationHealthQuery {
  running_timeout_minutes?: number;
  top_limit?: number;
  cooldown_alert_threshold?: number;
  stale_running_alert_threshold?: number;
  failed_24h_alert_threshold?: number;
}

export interface AutomationFailureTrendPoint {
  bucket_start: string;
  label: string;
  error_count: number;
  timeout_count: number;
}

export interface AutomationHealthAlert {
  code: string;
  severity: string;
  message: string;
  current_value: number;
  threshold: number;
}

export interface AutomationRiskJobInfo {
  job_id: string;
  name: string;
  status: string;
  consecutive_failures: number;
  retry_count: number;
  detail_message?: string | null;
  auto_disabled_until?: string | null;
  updated_at: string;
}

export interface AutomationHealthResult {
  total_jobs: number;
  enabled_jobs: number;
  pending_jobs: number;
  running_jobs: number;
  failed_jobs: number;
  cooldown_jobs: number;
  stale_running_jobs: number;
  failed_last_24h: number;
  failure_trend_24h: AutomationFailureTrendPoint[];
  alerts: AutomationHealthAlert[];
  risky_jobs: AutomationRiskJobInfo[];
  generated_at: string;
}

export interface AutomationCycleResult {
  job_count: number;
  success_count: number;
  failed_count: number;
  timeout_count: number;
}

export interface ScheduleValidationResult {
  valid: boolean;
  error?: string | null;
}

export async function getAutomationSchedulerConfig(): Promise<AutomationSchedulerConfig> {
  const response =
    await requestAutomationAppServer<AppServerAutomationSchedulerConfigReadResponse>(
      METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
      {},
    );
  return normalizeAutomationSchedulerConfigResponse(
    response,
    METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
  );
}

export async function updateAutomationSchedulerConfig(
  config: AutomationSchedulerConfig,
): Promise<void> {
  const response =
    await requestAutomationAppServer<AppServerAutomationSchedulerConfigUpdateResponse>(
      METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
      { config },
    );
  normalizeAutomationSchedulerConfigResponse(
    response,
    METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
  );
}

export async function getAutomationStatus(): Promise<AutomationStatus> {
  const response =
    await requestAutomationAppServer<AppServerAutomationSchedulerStatusResponse>(
      METHOD_AUTOMATION_SCHEDULER_STATUS,
      {},
    );
  return normalizeAutomationStatusResponse(response);
}

export async function getAutomationJobs(): Promise<AutomationJobRecord[]> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobListResponse>(
      METHOD_AUTOMATION_JOB_LIST,
      {},
    );
  return normalizeAutomationJobListResponse(response);
}

export async function getAutomationJob(
  id: string,
): Promise<AutomationJobRecord | null> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobReadResponse>(
      METHOD_AUTOMATION_JOB_READ,
      { id },
    );
  return normalizeAutomationJobReadResponse(response);
}

export async function createAutomationJob(
  request: AutomationJobRequest,
): Promise<AutomationJobRecord> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobWriteResponse>(
      METHOD_AUTOMATION_JOB_CREATE,
      { request },
    );
  return normalizeAutomationJobWriteResponse(
    response,
    METHOD_AUTOMATION_JOB_CREATE,
  );
}

export async function updateAutomationJob(
  id: string,
  request: UpdateAutomationJobRequest,
): Promise<AutomationJobRecord> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobWriteResponse>(
      METHOD_AUTOMATION_JOB_UPDATE,
      { id, request },
    );
  return normalizeAutomationJobWriteResponse(
    response,
    METHOD_AUTOMATION_JOB_UPDATE,
  );
}

export async function deleteAutomationJob(id: string): Promise<boolean> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobDeleteResponse>(
      METHOD_AUTOMATION_JOB_DELETE,
      { id },
    );
  return normalizeAutomationJobDeleteResponse(response);
}

export async function runAutomationJobNow(
  id: string,
): Promise<AutomationCycleResult> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobRunNowResponse>(
      METHOD_AUTOMATION_JOB_RUN_NOW,
      { id },
    );
  return normalizeAutomationJobRunNowResponse(response);
}

export async function getAutomationHealth(
  query?: AutomationHealthQuery,
): Promise<AutomationHealthResult> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobHealthResponse>(
      METHOD_AUTOMATION_JOB_HEALTH,
      { query: query ?? null },
    );
  return normalizeAutomationHealthResponse(response);
}

export async function getAutomationRunHistory(
  id: string,
  limit: number = 20,
): Promise<AgentRun[]> {
  const response =
    await requestAutomationAppServer<AppServerAutomationJobRunHistoryResponse>(
      METHOD_AUTOMATION_JOB_RUN_HISTORY,
      { id, limit },
    );
  return normalizeAutomationRunHistoryResponse(response);
}

export async function previewAutomationSchedule(
  schedule: TaskSchedule,
): Promise<string | null> {
  const response =
    await requestAutomationAppServer<AppServerAutomationSchedulePreviewResponse>(
      METHOD_AUTOMATION_SCHEDULE_PREVIEW,
      { schedule },
    );
  return normalizeAutomationSchedulePreviewResponse(response);
}

export async function validateAutomationSchedule(
  schedule: TaskSchedule,
): Promise<ScheduleValidationResult> {
  const response =
    await requestAutomationAppServer<AppServerAutomationScheduleValidateResponse>(
      METHOD_AUTOMATION_SCHEDULE_VALIDATE,
      { schedule },
    );
  return normalizeAutomationScheduleValidateResponse(response);
}
