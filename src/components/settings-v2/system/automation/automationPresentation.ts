import type {
  AutomationJobRecord,
  AutomationLastDeliveryRecord,
  AutomationOutputFormat,
  AutomationOutputSchema,
  AutomationPayload,
} from "@/lib/api/automation";
import type { AgentRun } from "@/lib/api/executionRun";
import { formatDate } from "@/i18n/format";
import {
  defaultAutomationServiceSkillContextCopy,
  mergeAutomationServiceSkillContexts,
  resolveServiceSkillContextFromMetadataRecord,
  type AutomationServiceSkillContextCopy,
  type AutomationServiceSkillContext,
} from "./serviceSkillContext";
import {
  automationAccessModeLabelWithCopy,
  type AutomationAccessModeCopy,
  resolveAgentTurnAutomationAccessMode,
} from "./automationAccessMode";

type AutomationBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export interface AutomationPresentationCopy {
  legacyBrowserAutomationNotice: string;
  legacyBrowserAutomationStatus: string;
  scheduleHours: (count: number) => string;
  scheduleMinutes: (count: number) => string;
  scheduleSeconds: (count: number) => string;
  scheduleCron: (expr: string) => string;
  scheduleAt: (time: string) => string;
  executionModeIntelligent: string;
  executionModeSkill: string;
  executionModeLogOnly: string;
  payloadBrowserSession: string;
  payloadAgentTurn: string;
  legacyPayloadProfile: (profile: string) => string;
  legacyPayloadEnvironment: (environment: string) => string;
  legacyPayloadUrl: (url: string) => string;
  legacyPayloadTargetId: (targetId: string) => string;
  legacyPayloadWindow: (status: string) => string;
  legacyPayloadWindowOpen: string;
  legacyPayloadWindowClosed: string;
  legacyPayloadStreamMode: (streamMode: string) => string;
  statusQueued: string;
  statusSuccess: string;
  statusRunning: string;
  statusWaitingForHuman: string;
  statusHumanControlling: string;
  statusAgentResuming: string;
  statusError: string;
  statusTimeout: string;
  statusPending: string;
  statusDetailBlocking: string;
  statusDetailResume: string;
  statusDetailLastError: string;
  statusDetailRunning: string;
  deliveryModeAnnounce: string;
  deliveryModeNone: string;
  deliveryChannelLocalFile: string;
  outputSchemaJson: string;
  outputSchemaTable: string;
  outputSchemaCsv: string;
  outputSchemaLinks: string;
  outputSchemaText: string;
  outputFormatJson: string;
  outputFormatText: string;
  serviceSkillTaskLine: (title: string) => string;
  serviceSkillMoreItems: (count: number) => string;
  serviceSkillContextCopy: AutomationServiceSkillContextCopy;
  accessModeCopy?: AutomationAccessModeCopy;
}

export const defaultAutomationPresentationCopy: AutomationPresentationCopy = {
  legacyBrowserAutomationNotice:
    "浏览器自动化已下线，系统不会再自动启动 Chrome。请删除旧流程，并改建为 Agent 对话持续流程。",
  legacyBrowserAutomationStatus: "已下线",
  scheduleHours: (count) => `每 ${count} 小时`,
  scheduleMinutes: (count) => `每 ${count} 分钟`,
  scheduleSeconds: (count) => `每 ${count} 秒`,
  scheduleCron: (expr) => `Cron: ${expr}`,
  scheduleAt: (time) => `一次性: ${time}`,
  executionModeIntelligent: "智能执行",
  executionModeSkill: "技能执行",
  executionModeLogOnly: "只记录",
  payloadBrowserSession: "浏览器自动化",
  payloadAgentTurn: "Agent 对话",
  legacyPayloadProfile: (profile) => `资料: ${profile}`,
  legacyPayloadEnvironment: (environment) => `环境预设: ${environment}`,
  legacyPayloadUrl: (url) => `启动地址: ${url}`,
  legacyPayloadTargetId: (targetId) => `Target ID: ${targetId}`,
  legacyPayloadWindow: (status) => `调试窗口: ${status}`,
  legacyPayloadWindowOpen: "打开",
  legacyPayloadWindowClosed: "关闭",
  legacyPayloadStreamMode: (streamMode) => `流模式: ${streamMode}`,
  statusQueued: "排队中",
  statusSuccess: "成功",
  statusRunning: "运行中",
  statusWaitingForHuman: "等待人工处理",
  statusHumanControlling: "人工接管中",
  statusAgentResuming: "恢复给 Agent",
  statusError: "失败",
  statusTimeout: "超时",
  statusPending: "待执行",
  statusDetailBlocking: "当前阻塞",
  statusDetailResume: "恢复说明",
  statusDetailLastError: "最近异常",
  statusDetailRunning: "运行说明",
  deliveryModeAnnounce: "运行完成后投递",
  deliveryModeNone: "关闭",
  deliveryChannelLocalFile: "本地文件",
  outputSchemaJson: "JSON 对象",
  outputSchemaTable: "表格",
  outputSchemaCsv: "CSV",
  outputSchemaLinks: "链接列表",
  outputSchemaText: "文本摘要",
  outputFormatJson: "JSON 编码",
  outputFormatText: "文本编码",
  serviceSkillTaskLine: (title) => `技能：${title}`,
  serviceSkillMoreItems: (count) => ` 等 ${count} 项`,
  serviceSkillContextCopy: defaultAutomationServiceSkillContextCopy,
};

export function formatTime(value?: string | null, locale?: string): string {
  if (!value) {
    return "-";
  }
  return (
    formatDate(value, {
      locale,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) || value
  );
}

export function describeSchedule(
  job: AutomationJobRecord,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
  locale?: string,
): string {
  if (job.schedule.kind === "every") {
    const secs = job.schedule.every_secs;
    if (secs % 3600 === 0) {
      return copy.scheduleHours(secs / 3600);
    }
    if (secs % 60 === 0) {
      return copy.scheduleMinutes(secs / 60);
    }
    return copy.scheduleSeconds(secs);
  }
  if (job.schedule.kind === "cron") {
    return copy.scheduleCron(job.schedule.expr);
  }
  return copy.scheduleAt(formatTime(job.schedule.at, locale));
}

export function executionModeLabel(
  mode: AutomationJobRecord["execution_mode"],
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  switch (mode) {
    case "intelligent":
      return copy.executionModeIntelligent;
    case "skill":
      return copy.executionModeSkill;
    case "log_only":
      return copy.executionModeLogOnly;
    default:
      return mode;
  }
}

export function payloadKindLabel(
  kind: AutomationPayload["kind"],
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  return kind === "browser_session"
    ? copy.payloadBrowserSession
    : copy.payloadAgentTurn;
}

export function describePayload(
  payload: AutomationPayload,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  if (payload.kind === "agent_turn") {
    return payload.prompt;
  }

  const lines = [copy.legacyBrowserAutomationNotice];
  lines.push(
    copy.legacyPayloadProfile(payload.profile_key ?? payload.profile_id),
  );
  if (payload.environment_preset_id) {
    lines.push(copy.legacyPayloadEnvironment(payload.environment_preset_id));
  }
  if (payload.url) {
    lines.push(copy.legacyPayloadUrl(payload.url));
  }
  if (payload.target_id) {
    lines.push(copy.legacyPayloadTargetId(payload.target_id));
  }
  lines.push(
    copy.legacyPayloadWindow(
      payload.open_window
        ? copy.legacyPayloadWindowOpen
        : copy.legacyPayloadWindowClosed,
    ),
  );
  lines.push(copy.legacyPayloadStreamMode(payload.stream_mode));
  return lines.join("\n");
}

export function describeAgentTurnAccessMode(
  payload: AutomationPayload,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  if (payload.kind !== "agent_turn") {
    return "-";
  }

  return copy.accessModeCopy
    ? automationAccessModeLabelWithCopy(
        resolveAgentTurnAutomationAccessMode(payload),
        copy.accessModeCopy,
      )
    : automationAccessModeLabelWithCopy(
        resolveAgentTurnAutomationAccessMode(payload),
        {
          readOnly: "只读",
          current: "按需确认",
          fullAccess: "完全访问",
          policyReadOnly: "正式策略会写成 on-request + read-only。",
          policyCurrent: "正式策略会写成 on-request + workspace-write。",
          policyFullAccess: "正式策略会写成 never + danger-full-access。",
        },
      );
}

export function isLegacyBrowserAutomation(
  job?: AutomationJobRecord | null,
): boolean {
  return job?.payload.kind === "browser_session";
}

function parseRunMetadata(run: AgentRun): Record<string, unknown> | null {
  if (!run.metadata) {
    return null;
  }
  try {
    const parsed = JSON.parse(run.metadata);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function resolveRunSessionId(run: AgentRun): string | null {
  if (run.session_id) {
    return run.session_id;
  }
  const metadata = parseRunMetadata(run);
  const metadataSessionId = metadata?.session_id;
  return typeof metadataSessionId === "string" && metadataSessionId.trim()
    ? metadataSessionId
    : null;
}

function resolveBrowserLifecycleStatus(run: AgentRun): string | null {
  const metadata = parseRunMetadata(run);
  const lifecycle = metadata?.browser_lifecycle_state;
  return typeof lifecycle === "string" && lifecycle.trim() ? lifecycle : null;
}

function resolveRunHumanReason(run: AgentRun): string | null {
  const metadata = parseRunMetadata(run);
  const reason = metadata?.human_reason;
  return typeof reason === "string" && reason.trim() ? reason : null;
}

export function resolveRunInfoMessage(run: AgentRun): string | null {
  const reason = resolveRunHumanReason(run);
  if (!reason) {
    return null;
  }
  if (run.error_message && run.error_message.trim() === reason) {
    return null;
  }
  return reason;
}

export function resolveRunDelivery(
  run: AgentRun,
): AutomationLastDeliveryRecord | null {
  const metadata = parseRunMetadata(run);
  const delivery = metadata?.delivery;
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return null;
  }

  const deliveryRecord = delivery as Record<string, unknown>;
  const success = deliveryRecord.success;
  const message = deliveryRecord.message;
  const outputKind = deliveryRecord.output_kind;
  const outputSchema = deliveryRecord.output_schema;
  const outputFormat = deliveryRecord.output_format;
  const outputPreview = deliveryRecord.output_preview;
  const attemptedAt = deliveryRecord.attempted_at;
  if (
    typeof success !== "boolean" ||
    typeof message !== "string" ||
    typeof outputKind !== "string" ||
    typeof outputSchema !== "string" ||
    typeof outputFormat !== "string" ||
    typeof outputPreview !== "string" ||
    typeof attemptedAt !== "string"
  ) {
    return null;
  }

  return {
    success,
    message,
    channel:
      typeof deliveryRecord.channel === "string"
        ? deliveryRecord.channel
        : null,
    target:
      typeof deliveryRecord.target === "string" ? deliveryRecord.target : null,
    output_kind: outputKind,
    output_schema:
      outputSchema === "json" ||
      outputSchema === "table" ||
      outputSchema === "csv" ||
      outputSchema === "links"
        ? outputSchema
        : "text",
    output_format: outputFormat === "json" ? "json" : "text",
    output_preview: outputPreview,
    delivery_attempt_id:
      typeof deliveryRecord.delivery_attempt_id === "string"
        ? deliveryRecord.delivery_attempt_id
        : null,
    run_id:
      typeof deliveryRecord.run_id === "string" ? deliveryRecord.run_id : null,
    execution_retry_count:
      typeof deliveryRecord.execution_retry_count === "number"
        ? deliveryRecord.execution_retry_count
        : null,
    delivery_attempts:
      typeof deliveryRecord.delivery_attempts === "number"
        ? deliveryRecord.delivery_attempts
        : null,
    attempted_at: attemptedAt,
  };
}

export function statusLabel(
  status?: string | null,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  switch (status) {
    case "queued":
      return copy.statusQueued;
    case "success":
      return copy.statusSuccess;
    case "running":
      return copy.statusRunning;
    case "waiting_for_human":
      return copy.statusWaitingForHuman;
    case "human_controlling":
      return copy.statusHumanControlling;
    case "agent_resuming":
      return copy.statusAgentResuming;
    case "error":
      return copy.statusError;
    case "timeout":
      return copy.statusTimeout;
    default:
      return copy.statusPending;
  }
}

export function statusVariant(status?: string | null): AutomationBadgeVariant {
  if (status === "success") {
    return "default";
  }
  if (
    status === "queued" ||
    status === "running" ||
    status === "agent_resuming"
  ) {
    return "secondary";
  }
  if (status === "waiting_for_human" || status === "human_controlling") {
    return "outline";
  }
  if (status === "error" || status === "timeout") {
    return "destructive";
  }
  return "outline";
}

export function runDisplayStatus(run: AgentRun): string {
  if (run.status === "running") {
    const lifecycleStatus = resolveBrowserLifecycleStatus(run);
    if (lifecycleStatus) {
      return lifecycleStatus;
    }
  }
  return run.status;
}

export function runStatusVariant(run: AgentRun): AutomationBadgeVariant {
  return statusVariant(runDisplayStatus(run));
}

export function runInfoToneClass(run: AgentRun): string {
  switch (runDisplayStatus(run)) {
    case "waiting_for_human":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "human_controlling":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "agent_resuming":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200/80 bg-white text-slate-600";
  }
}

export function statusDetailToneClass(status?: string | null): string {
  switch (status) {
    case "waiting_for_human":
      return "text-orange-700";
    case "human_controlling":
      return "text-amber-700";
    case "agent_resuming":
      return "text-sky-700";
    case "error":
    case "timeout":
      return "text-rose-700";
    default:
      return "text-slate-500";
  }
}

export function statusDetailPrefix(
  status?: string | null,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  switch (status) {
    case "waiting_for_human":
    case "human_controlling":
      return copy.statusDetailBlocking;
    case "agent_resuming":
      return copy.statusDetailResume;
    case "error":
    case "timeout":
      return copy.statusDetailLastError;
    default:
      return copy.statusDetailRunning;
  }
}

export function resolveDeliveryOutputFormat(
  format?: AutomationOutputFormat | null,
): AutomationOutputFormat {
  return format === "json" ? "json" : "text";
}

export function resolveDeliveryOutputSchema(
  job: AutomationJobRecord,
): AutomationOutputSchema {
  switch (job.delivery.output_schema) {
    case "json":
    case "table":
    case "csv":
    case "links":
    case "text":
      return job.delivery.output_schema;
    default:
      return resolveDeliveryOutputFormat(job.delivery.output_format) === "json"
        ? "json"
        : "text";
  }
}

export function deliveryModeLabel(
  job: AutomationJobRecord,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  return job.delivery.mode === "announce"
    ? copy.deliveryModeAnnounce
    : copy.deliveryModeNone;
}

export function deliveryChannelLabel(
  channel?: string | null,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  switch (channel) {
    case "webhook":
      return "Webhook";
    case "google_sheets":
      return "Google Sheets";
    case "local_file":
      return copy.deliveryChannelLocalFile;
    case "telegram":
      return "Telegram";
    default:
      return channel?.trim() ? channel : "-";
  }
}

export function outputSchemaLabel(
  schema: AutomationOutputSchema,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  switch (schema) {
    case "json":
      return copy.outputSchemaJson;
    case "table":
      return copy.outputSchemaTable;
    case "csv":
      return copy.outputSchemaCsv;
    case "links":
      return copy.outputSchemaLinks;
    default:
      return copy.outputSchemaText;
  }
}

export function outputFormatLabel(
  format: AutomationOutputFormat,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  return format === "json" ? copy.outputFormatJson : copy.outputFormatText;
}

export function deliveryStatusVariant(
  success: boolean,
): AutomationBadgeVariant {
  return success ? "default" : "destructive";
}

export function deliveryToneClass(
  delivery: AutomationLastDeliveryRecord | null | undefined,
): string {
  if (!delivery) {
    return "border-slate-200/80 bg-slate-50 text-slate-500";
  }
  return delivery.success
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

export function describeServiceSkillTaskLine(
  serviceSkillContext: AutomationServiceSkillContext,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string {
  return copy.serviceSkillTaskLine(serviceSkillContext.title);
}

export function describeServiceSkillSlotPreview(
  serviceSkillContext: AutomationServiceSkillContext,
  limit: number = 2,
  copy: AutomationPresentationCopy = defaultAutomationPresentationCopy,
): string | null {
  const preview = serviceSkillContext.slotSummary
    .slice(0, limit)
    .map((item) => `${item.label}: ${item.value}`);
  if (preview.length > 0) {
    const suffix =
      serviceSkillContext.slotSummary.length > limit
        ? copy.serviceSkillMoreItems(serviceSkillContext.slotSummary.length)
        : "";
    return `${preview.join(" · ")}${suffix}`;
  }

  if (serviceSkillContext.userInput) {
    return serviceSkillContext.userInput;
  }

  return null;
}

export function resolveRunServiceSkillContext(
  run: AgentRun,
  fallbackContext: AutomationServiceSkillContext | null,
  copy: AutomationServiceSkillContextCopy = defaultAutomationServiceSkillContextCopy,
): AutomationServiceSkillContext | null {
  const metadata = parseRunMetadata(run);
  const runContext = metadata
    ? resolveServiceSkillContextFromMetadataRecord(metadata, { copy })
    : null;
  return mergeAutomationServiceSkillContexts(runContext, fallbackContext, copy);
}
