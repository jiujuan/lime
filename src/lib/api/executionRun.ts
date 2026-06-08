import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export type AgentRunSource = "chat" | "skill" | "automation";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "success"
  | "error"
  | "canceled"
  | "timeout";

export interface AgentRun {
  id: string;
  source: AgentRunSource;
  source_ref: string | null;
  session_id: string | null;
  status: AgentRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneralWorkbenchRunTodoItem {
  run_id: string;
  execution_id?: string | null;
  session_id?: string | null;
  artifact_paths?: string[];
  title: string;
  gate_key?: "topic_select" | "write_mode" | "publish_confirm" | null;
  status: AgentRunStatus;
  source: AgentRunSource | string;
  source_ref: string | null;
  started_at: string;
}

export interface GeneralWorkbenchRunTerminalItem {
  run_id: string;
  execution_id?: string | null;
  session_id?: string | null;
  artifact_paths?: string[];
  title: string;
  gate_key?: "topic_select" | "write_mode" | "publish_confirm" | null;
  status: AgentRunStatus;
  source: AgentRunSource | string;
  source_ref: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface GeneralWorkbenchRunState {
  run_state: "idle" | "auto_running";
  current_gate_key?:
    | "idle"
    | "topic_select"
    | "write_mode"
    | "publish_confirm"
    | null;
  queue_items: GeneralWorkbenchRunTodoItem[];
  latest_terminal: GeneralWorkbenchRunTerminalItem | null;
  recent_terminals?: GeneralWorkbenchRunTerminalItem[] | null;
  updated_at: string;
}

export interface GeneralWorkbenchRunHistoryPage {
  items: GeneralWorkbenchRunTerminalItem[];
  has_more: boolean;
  next_offset: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isRequiredNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRequiredNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isAgentRunSource(value: unknown): value is AgentRunSource {
  return value === "chat" || value === "skill" || value === "automation";
}

function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "success" ||
    value === "error" ||
    value === "canceled" ||
    value === "timeout"
  );
}

function isAgentRun(value: unknown): value is AgentRun {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isAgentRunSource(value.source) &&
    isRequiredNullableString(value.source_ref) &&
    isRequiredNullableString(value.session_id) &&
    isAgentRunStatus(value.status) &&
    typeof value.started_at === "string" &&
    isRequiredNullableString(value.finished_at) &&
    isRequiredNullableNumber(value.duration_ms) &&
    isRequiredNullableString(value.error_code) &&
    isRequiredNullableString(value.error_message) &&
    isRequiredNullableString(value.metadata) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isWorkbenchGateKey(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "idle" ||
    value === "topic_select" ||
    value === "write_mode" ||
    value === "publish_confirm"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGeneralWorkbenchTodoItem(
  value: unknown,
): value is GeneralWorkbenchRunTodoItem {
  return (
    isRecord(value) &&
    typeof value.run_id === "string" &&
    isNullableString(value.execution_id) &&
    isNullableString(value.session_id) &&
    (value.artifact_paths === undefined || isStringArray(value.artifact_paths)) &&
    typeof value.title === "string" &&
    isWorkbenchGateKey(value.gate_key) &&
    isAgentRunStatus(value.status) &&
    typeof value.source === "string" &&
    isRequiredNullableString(value.source_ref) &&
    typeof value.started_at === "string"
  );
}

function isGeneralWorkbenchTerminalItem(
  value: unknown,
): value is GeneralWorkbenchRunTerminalItem {
  return (
    isGeneralWorkbenchTodoItem(value) &&
    isRecord(value) &&
    isRequiredNullableString(value.finished_at)
  );
}

function isGeneralWorkbenchRunState(
  value: unknown,
): value is GeneralWorkbenchRunState {
  return (
    isRecord(value) &&
    (value.run_state === "idle" || value.run_state === "auto_running") &&
    isWorkbenchGateKey(value.current_gate_key) &&
    Array.isArray(value.queue_items) &&
    value.queue_items.every(isGeneralWorkbenchTodoItem) &&
    (value.latest_terminal === null ||
      isGeneralWorkbenchTerminalItem(value.latest_terminal)) &&
    (value.recent_terminals === undefined ||
      value.recent_terminals === null ||
      (Array.isArray(value.recent_terminals) &&
        value.recent_terminals.every(isGeneralWorkbenchTerminalItem))) &&
    typeof value.updated_at === "string"
  );
}

function isGeneralWorkbenchRunHistoryPage(
  value: unknown,
): value is GeneralWorkbenchRunHistoryPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isGeneralWorkbenchTerminalItem) &&
    typeof value.has_more === "boolean" &&
    isRequiredNullableNumber(value.next_offset)
  );
}

function assertAgentRunList(
  command: string,
  value: unknown,
): asserts value is AgentRun[] {
  if (!Array.isArray(value) || !value.every(isAgentRun)) {
    throw new Error(`${command} did not return execution run list`);
  }
}

function assertAgentRunOrNull(
  command: string,
  value: unknown,
): asserts value is AgentRun | null {
  if (value !== null && !isAgentRun(value)) {
    throw new Error(`${command} did not return execution run`);
  }
}

function assertGeneralWorkbenchRunState(
  command: string,
  value: unknown,
): asserts value is GeneralWorkbenchRunState {
  if (!isGeneralWorkbenchRunState(value)) {
    throw new Error(`${command} did not return general workbench state`);
  }
}

function assertGeneralWorkbenchRunHistoryPage(
  command: string,
  value: unknown,
): asserts value is GeneralWorkbenchRunHistoryPage {
  if (!isGeneralWorkbenchRunHistoryPage(value)) {
    throw new Error(`${command} did not return general workbench history page`);
  }
}

export async function executionRunList(
  limit: number = 50,
  offset: number = 0,
): Promise<AgentRun[]> {
  const command = "execution_run_list";
  const result = await safeInvoke<unknown>(command, {
    limit,
    offset,
  });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Execution run current 通道",
  );
  assertAgentRunList(command, result);
  return result;
}

export async function executionRunGet(runId: string): Promise<AgentRun | null> {
  const command = "execution_run_get";
  const result = await safeInvoke<unknown>(command, {
    runId,
  });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Execution run current 通道",
  );
  assertAgentRunOrNull(command, result);
  return result;
}

export async function executionRunGetGeneralWorkbenchState(
  sessionId: string,
  limit: number = 3,
): Promise<GeneralWorkbenchRunState> {
  const command = "execution_run_get_general_workbench_state";
  const result = await safeInvoke<unknown>(command, {
    sessionId,
    session_id: sessionId,
    limit,
  });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Execution run current 通道",
  );
  assertGeneralWorkbenchRunState(command, result);
  return result;
}

export async function executionRunListGeneralWorkbenchHistory(
  sessionId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<GeneralWorkbenchRunHistoryPage> {
  const command = "execution_run_list_general_workbench_history";
  const result = await safeInvoke<unknown>(command, {
    sessionId,
    session_id: sessionId,
    limit,
    offset,
  });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Execution run current 通道",
  );
  assertGeneralWorkbenchRunHistoryPage(command, result);
  return result;
}
