import { RefreshCw } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  AutomationJobRecord,
  AutomationPayload,
} from "@/lib/api/automation";
import type { AgentRun } from "@/lib/api/executionRun";
import type {
  SceneAppAutomationWorkspaceCardViewModel,
  SceneAppRunDetailViewModel,
} from "@/lib/sceneapp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/i18n/format";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { SceneAppRunDetailPanel } from "@/components/sceneapps/SceneAppRunDetailPanel";
import {
  buildSceneAppExecutionFollowupDestinations,
  type SceneAppExecutionFollowupDestination,
} from "@/components/sceneapps/sceneAppExecutionFollowupDestinations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type AutomationServiceSkillContext,
} from "./serviceSkillContext";
import {
  defaultAutomationPresentationCopy,
  deliveryStatusVariant,
  deliveryToneClass,
  isLegacyBrowserAutomation,
  resolveDeliveryOutputFormat,
  resolveDeliveryOutputSchema,
  resolveRunDelivery,
  resolveRunInfoMessage,
  resolveRunServiceSkillContext,
  resolveRunSessionId,
  runDisplayStatus,
  runInfoToneClass,
  runStatusVariant,
  statusVariant,
  type AutomationPresentationCopy,
} from "./automationPresentation";
import {
  automationAccessModeLabelWithCopy,
  resolveAgentTurnAutomationAccessMode,
} from "./automationAccessMode";

type SettingsTranslate = TFunction<"settings">;

function detailsText(
  t: SettingsTranslate,
  key: string,
  defaultValue: string,
  values: Record<string, string | number | boolean> = {},
): string {
  const translated = String(
    t(key as never, { ...values, defaultValue } as never),
  );
  return Object.entries(values).reduce((text, [name, value]) => {
    const replacement = String(value);
    return text
      .split(`{{${name}}}`)
      .join(replacement)
      .split(`{{ ${name} }}`)
      .join(replacement);
  }, translated);
}

function buildDetailsPresentationCopy(
  t: SettingsTranslate,
): AutomationPresentationCopy {
  return {
    ...defaultAutomationPresentationCopy,
    legacyBrowserAutomationNotice: detailsText(
      t,
      "settings.automation.details.legacy.message",
      "浏览器自动化已下线，系统不会再自动启动 Chrome。请删除旧流程，并改建为 Agent 对话持续流程。",
    ),
    legacyBrowserAutomationStatus: detailsText(
      t,
      "settings.automation.details.status.offline",
      "已下线",
    ),
    scheduleHours: (count) =>
      detailsText(
        t,
        "settings.automation.details.schedule.hours",
        "每 {{count}} 小时",
        { count },
      ),
    scheduleMinutes: (count) =>
      detailsText(
        t,
        "settings.automation.details.schedule.minutes",
        "每 {{count}} 分钟",
        { count },
      ),
    scheduleSeconds: (count) =>
      detailsText(
        t,
        "settings.automation.details.schedule.seconds",
        "每 {{count}} 秒",
        { count },
      ),
    scheduleCron: (expr) =>
      detailsText(
        t,
        "settings.automation.details.schedule.cron",
        "Cron: {{expr}}",
        { expr },
      ),
    scheduleAt: (time) =>
      detailsText(
        t,
        "settings.automation.details.schedule.at",
        "一次性: {{time}}",
        { time },
      ),
    payloadBrowserSession: detailsText(
      t,
      "settings.automation.details.payload.browserSession",
      "浏览器自动化",
    ),
    payloadAgentTurn: detailsText(
      t,
      "settings.automation.details.payload.agentTurn",
      "Agent 对话",
    ),
    legacyPayloadProfile: (profile) =>
      detailsText(
        t,
        "settings.automation.details.legacy.payload.profile",
        "资料: {{profile}}",
        { profile },
      ),
    legacyPayloadEnvironment: (environment) =>
      detailsText(
        t,
        "settings.automation.details.legacy.payload.environment",
        "环境预设: {{environment}}",
        { environment },
      ),
    legacyPayloadUrl: (url) =>
      detailsText(
        t,
        "settings.automation.details.legacy.payload.url",
        "启动地址: {{url}}",
        { url },
      ),
    legacyPayloadTargetId: (targetId) =>
      detailsText(
        t,
        "settings.automation.details.legacy.payload.targetId",
        "Target ID: {{targetId}}",
        { targetId },
      ),
    legacyPayloadWindow: (status) =>
      detailsText(
        t,
        "settings.automation.details.legacy.payload.window",
        "调试窗口: {{status}}",
        { status },
      ),
    legacyPayloadWindowOpen: detailsText(
      t,
      "settings.automation.details.legacy.payload.windowOpen",
      "打开",
    ),
    legacyPayloadWindowClosed: detailsText(
      t,
      "settings.automation.details.legacy.payload.windowClosed",
      "关闭",
    ),
    legacyPayloadStreamMode: (streamMode) =>
      detailsText(
        t,
        "settings.automation.details.legacy.payload.streamMode",
        "流模式: {{streamMode}}",
        { streamMode },
      ),
    statusQueued: detailsText(
      t,
      "settings.automation.details.status.queued",
      "排队中",
    ),
    statusSuccess: detailsText(
      t,
      "settings.automation.details.status.success",
      "成功",
    ),
    statusRunning: detailsText(
      t,
      "settings.automation.details.status.running",
      "运行中",
    ),
    statusWaitingForHuman: detailsText(
      t,
      "settings.automation.details.status.waitingForHuman",
      "等待人工处理",
    ),
    statusHumanControlling: detailsText(
      t,
      "settings.automation.details.status.humanControlling",
      "人工接管中",
    ),
    statusAgentResuming: detailsText(
      t,
      "settings.automation.details.status.agentResuming",
      "恢复给 Agent",
    ),
    statusError: detailsText(
      t,
      "settings.automation.details.status.error",
      "失败",
    ),
    statusTimeout: detailsText(
      t,
      "settings.automation.details.status.timeout",
      "超时",
    ),
    statusPending: detailsText(
      t,
      "settings.automation.details.status.pending",
      "待执行",
    ),
    deliveryModeAnnounce: detailsText(
      t,
      "settings.automation.details.delivery.mode.announce",
      "运行完成后投递",
    ),
    deliveryModeNone: detailsText(
      t,
      "settings.automation.details.delivery.mode.none",
      "未启用",
    ),
    deliveryChannelLocalFile: detailsText(
      t,
      "settings.automation.details.delivery.channel.localFile",
      "本地文件",
    ),
    outputSchemaJson: detailsText(
      t,
      "settings.automation.details.delivery.schema.json",
      "JSON 对象",
    ),
    outputSchemaTable: detailsText(
      t,
      "settings.automation.details.delivery.schema.table",
      "表格",
    ),
    outputSchemaCsv: detailsText(
      t,
      "settings.automation.details.delivery.schema.csv",
      "CSV",
    ),
    outputSchemaLinks: detailsText(
      t,
      "settings.automation.details.delivery.schema.links",
      "链接列表",
    ),
    outputSchemaText: detailsText(
      t,
      "settings.automation.details.delivery.schema.text",
      "文本摘要",
    ),
    outputFormatJson: detailsText(
      t,
      "settings.automation.details.delivery.format.json",
      "JSON 编码",
    ),
    outputFormatText: detailsText(
      t,
      "settings.automation.details.delivery.format.text",
      "文本编码",
    ),
    serviceSkillTaskLine: (title) =>
      detailsText(
        t,
        "settings.automation.details.serviceSkill.taskLine",
        "技能：{{title}}",
        { title },
      ),
    serviceSkillMoreItems: (count) =>
      detailsText(
        t,
        "settings.automation.details.serviceSkill.moreItems",
        " 等 {{count}} 项",
        { count },
      ),
  };
}

function formatDetailsTime(value?: string | null, locale?: string): string {
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

function detailsStatusLabel(
  t: SettingsTranslate,
  status?: string | null,
): string {
  switch (status) {
    case "queued":
      return detailsText(
        t,
        "settings.automation.details.status.queued",
        "排队中",
      );
    case "success":
      return detailsText(
        t,
        "settings.automation.details.status.success",
        "成功",
      );
    case "running":
      return detailsText(
        t,
        "settings.automation.details.status.running",
        "运行中",
      );
    case "waiting_for_human":
      return detailsText(
        t,
        "settings.automation.details.status.waitingForHuman",
        "等待人工处理",
      );
    case "human_controlling":
      return detailsText(
        t,
        "settings.automation.details.status.humanControlling",
        "人工接管中",
      );
    case "agent_resuming":
      return detailsText(
        t,
        "settings.automation.details.status.agentResuming",
        "恢复给 Agent",
      );
    case "error":
      return detailsText(t, "settings.automation.details.status.error", "失败");
    case "timeout":
      return detailsText(
        t,
        "settings.automation.details.status.timeout",
        "超时",
      );
    default:
      return (
        status ||
        detailsText(t, "settings.automation.details.status.pending", "待执行")
      );
  }
}

function detailsPayloadKindLabel(
  t: SettingsTranslate,
  kind: AutomationPayload["kind"],
): string {
  return kind === "browser_session"
    ? detailsText(
        t,
        "settings.automation.details.payload.browserSession",
        "浏览器自动化",
      )
    : detailsText(
        t,
        "settings.automation.details.payload.agentTurn",
        "Agent 对话",
      );
}

function detailsAccessModeLabel(
  t: SettingsTranslate,
  payload: AutomationPayload,
): string {
  if (payload.kind !== "agent_turn") {
    return "-";
  }

  return automationAccessModeLabelWithCopy(
    resolveAgentTurnAutomationAccessMode(payload),
    {
      readOnly: detailsText(
        t,
        "settings.automation.details.accessMode.readOnly",
        "只读",
      ),
      current: detailsText(
        t,
        "settings.automation.details.accessMode.current",
        "按需确认",
      ),
      fullAccess: detailsText(
        t,
        "settings.automation.details.accessMode.fullAccess",
        "完全访问",
      ),
      policyReadOnly: "",
      policyCurrent: "",
      policyFullAccess: "",
    },
  );
}

function detailsScheduleLabel(
  t: SettingsTranslate,
  job: AutomationJobRecord,
  locale?: string,
): string {
  if (job.schedule.kind === "every") {
    const secs = job.schedule.every_secs;
    if (secs % 3600 === 0) {
      return detailsText(
        t,
        "settings.automation.details.schedule.hours",
        "每 {{count}} 小时",
        { count: secs / 3600 },
      );
    }
    if (secs % 60 === 0) {
      return detailsText(
        t,
        "settings.automation.details.schedule.minutes",
        "每 {{count}} 分钟",
        { count: secs / 60 },
      );
    }
    return detailsText(
      t,
      "settings.automation.details.schedule.seconds",
      "每 {{count}} 秒",
      { count: secs },
    );
  }
  if (job.schedule.kind === "cron") {
    return detailsText(
      t,
      "settings.automation.details.schedule.cron",
      "Cron: {{expr}}",
      { expr: job.schedule.expr },
    );
  }
  return detailsText(
    t,
    "settings.automation.details.schedule.at",
    "一次性: {{time}}",
    { time: formatDetailsTime(job.schedule.at, locale) },
  );
}

function detailsDeliveryModeLabel(
  t: SettingsTranslate,
  job: AutomationJobRecord,
): string {
  return job.delivery.mode === "announce"
    ? detailsText(
        t,
        "settings.automation.details.delivery.mode.announce",
        "运行完成后投递",
      )
    : detailsText(
        t,
        "settings.automation.details.delivery.mode.none",
        "未启用",
      );
}

function detailsDeliveryChannelLabel(
  t: SettingsTranslate,
  channel?: string | null,
): string {
  switch (channel) {
    case "webhook":
      return detailsText(
        t,
        "settings.automation.details.delivery.channel.webhook",
        "Webhook",
      );
    case "telegram":
      return detailsText(
        t,
        "settings.automation.details.delivery.channel.telegram",
        "Telegram",
      );
    case "local_file":
      return detailsText(
        t,
        "settings.automation.details.delivery.channel.localFile",
        "本地文件",
      );
    case "google_sheets":
      return detailsText(
        t,
        "settings.automation.details.delivery.channel.googleSheets",
        "Google Sheets",
      );
    default:
      return "-";
  }
}

function detailsOutputSchemaLabel(
  t: SettingsTranslate,
  schema?: string | null,
): string {
  switch (schema) {
    case "json":
      return detailsText(
        t,
        "settings.automation.details.delivery.schema.json",
        "JSON 对象",
      );
    case "table":
      return detailsText(
        t,
        "settings.automation.details.delivery.schema.table",
        "表格",
      );
    case "csv":
      return detailsText(
        t,
        "settings.automation.details.delivery.schema.csv",
        "CSV",
      );
    case "links":
      return detailsText(
        t,
        "settings.automation.details.delivery.schema.links",
        "链接列表",
      );
    case "text":
    default:
      return detailsText(
        t,
        "settings.automation.details.delivery.schema.text",
        "文本摘要",
      );
  }
}

function detailsOutputFormatLabel(
  t: SettingsTranslate,
  format?: string | null,
): string {
  return format === "json"
    ? detailsText(
        t,
        "settings.automation.details.delivery.format.json",
        "JSON 编码",
      )
    : detailsText(
        t,
        "settings.automation.details.delivery.format.text",
        "文本编码",
      );
}

function detailsPayloadDescription(
  t: SettingsTranslate,
  payload: AutomationPayload,
): string {
  if (payload.kind === "agent_turn") {
    return payload.prompt;
  }

  const lines = [
    detailsText(
      t,
      "settings.automation.details.legacy.message",
      "浏览器自动化已下线，系统不会再自动启动 Chrome。请删除旧流程，并改建为 Agent 对话持续流程。",
    ),
    detailsText(
      t,
      "settings.automation.details.legacy.payload.profile",
      "资料: {{profile}}",
      { profile: payload.profile_key ?? payload.profile_id },
    ),
  ];
  if (payload.environment_preset_id) {
    lines.push(
      detailsText(
        t,
        "settings.automation.details.legacy.payload.environment",
        "环境预设: {{environment}}",
        { environment: payload.environment_preset_id },
      ),
    );
  }
  if (payload.url) {
    lines.push(
      detailsText(
        t,
        "settings.automation.details.legacy.payload.url",
        "启动地址: {{url}}",
        { url: payload.url },
      ),
    );
  }
  if (payload.target_id) {
    lines.push(
      detailsText(
        t,
        "settings.automation.details.legacy.payload.targetId",
        "Target ID: {{targetId}}",
        { targetId: payload.target_id },
      ),
    );
  }
  lines.push(
    detailsText(
      t,
      "settings.automation.details.legacy.payload.window",
      "调试窗口: {{status}}",
      {
        status: payload.open_window
          ? detailsText(
              t,
              "settings.automation.details.legacy.payload.windowOpen",
              "打开",
            )
          : detailsText(
              t,
              "settings.automation.details.legacy.payload.windowClosed",
              "关闭",
            ),
      },
    ),
  );
  lines.push(
    detailsText(
      t,
      "settings.automation.details.legacy.payload.streamMode",
      "流模式: {{streamMode}}",
      { streamMode: payload.stream_mode },
    ),
  );
  return lines.join("\n");
}

function detailsServiceSkillTaskLine(
  t: SettingsTranslate,
  serviceSkillContext: AutomationServiceSkillContext,
): string {
  return buildDetailsPresentationCopy(t).serviceSkillTaskLine(
    serviceSkillContext.title,
  );
}

function detailsServiceSkillSlotPreview(
  t: SettingsTranslate,
  serviceSkillContext: AutomationServiceSkillContext,
  limit: number = 2,
): string | null {
  const preview = serviceSkillContext.slotSummary
    .slice(0, limit)
    .map((item) => `${item.label}: ${item.value}`);
  if (preview.length > 0) {
    const copy = buildDetailsPresentationCopy(t);
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

interface AutomationJobDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: AutomationJobRecord | null;
  workspaceName: string | null;
  serviceSkillContext: AutomationServiceSkillContext | null;
  jobRuns: AgentRun[];
  historyLoading: boolean;
  sceneAppSummaryCard?: SceneAppAutomationWorkspaceCardViewModel | null;
  sceneAppRunDetailView?: SceneAppRunDetailViewModel | null;
  sceneAppLoading?: boolean;
  sceneAppError?: string | null;
  onOpenSceneAppDetail?: () => void;
  onOpenSceneAppGovernance?: () => void;
  onReviewCurrentProject?: () => void;
  sceneAppSavedAsInspiration?: boolean;
  onSaveSceneAppAsInspiration?: () => void;
  onOpenInspirationLibrary?: () => void;
  onSceneAppDeliveryArtifactAction?: (
    action: SceneAppRunDetailViewModel["deliveryArtifactEntries"][number],
  ) => void;
  onSceneAppGovernanceAction?: (
    action: SceneAppRunDetailViewModel["governanceActionEntries"][number],
  ) => void;
  onSceneAppGovernanceArtifactAction?: (
    action: SceneAppRunDetailViewModel["governanceArtifactEntries"][number],
  ) => void;
  onSceneAppEntryAction?: (
    action: NonNullable<SceneAppRunDetailViewModel["entryAction"]>,
  ) => void;
  onRefreshHistory: (jobId: string) => Promise<void> | void;
}

export function AutomationJobDetailsDialog({
  open,
  onOpenChange,
  job,
  workspaceName,
  serviceSkillContext,
  jobRuns,
  historyLoading,
  sceneAppSummaryCard = null,
  sceneAppRunDetailView = null,
  sceneAppLoading = false,
  sceneAppError = null,
  onOpenSceneAppDetail,
  onOpenSceneAppGovernance,
  onReviewCurrentProject,
  sceneAppSavedAsInspiration = false,
  onSaveSceneAppAsInspiration,
  onOpenInspirationLibrary,
  onSceneAppDeliveryArtifactAction,
  onSceneAppGovernanceAction,
  onSceneAppGovernanceArtifactAction,
  onSceneAppEntryAction,
  onRefreshHistory,
}: AutomationJobDetailsDialogProps) {
  const { i18n, t } = useTranslation("settings");
  const presentationCopy = buildDetailsPresentationCopy(t);
  const serviceSkillExecutionCompatLabel = detailsText(
    t,
    "settings.automation.tasks.list.badge.serviceSkillLegacyCompat",
    "旧目录兼容",
  );
  const serviceSkillExecutionCompatNote = detailsText(
    t,
    "settings.automation.details.serviceSkill.executionCompatNote",
    "沿用旧目录兼容标记，实际仍在客户端执行。",
  );
  const followupDestinations = sceneAppRunDetailView
    ? buildSceneAppExecutionFollowupDestinations(sceneAppRunDetailView)
    : [];
  const resolveFollowupDestinationAction = (
    destination: SceneAppExecutionFollowupDestination,
  ): { label: string; onClick: () => void } | null => {
    const action = destination.action;
    if (!action) {
      return null;
    }

    switch (action.kind) {
      case "review_current_project":
        return onReviewCurrentProject
          ? {
              label: action.label,
              onClick: onReviewCurrentProject,
            }
          : null;
      case "governance_action":
        return onSceneAppGovernanceAction
          ? {
              label: action.label,
              onClick: () => onSceneAppGovernanceAction(action.entry),
            }
          : null;
      case "governance_artifact":
        return onSceneAppGovernanceArtifactAction
          ? {
              label: action.label,
              onClick: () => onSceneAppGovernanceArtifactAction(action.entry),
            }
          : null;
      case "entry_action":
        return onSceneAppEntryAction
          ? {
              label: action.label,
              onClick: () => onSceneAppEntryAction(action.entry),
            }
          : null;
      case "delivery_artifact":
        return onSceneAppDeliveryArtifactAction
          ? {
              label: action.label,
              onClick: () => onSceneAppDeliveryArtifactAction(action.entry),
            }
          : null;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open && Boolean(job)} onOpenChange={onOpenChange}>
      <DialogContent
        maxWidth="max-w-[1120px]"
        className="lime-workbench-theme-scope max-h-[calc(100vh-32px)] overflow-hidden rounded-[28px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0"
      >
        {job ? (
          <div
            data-testid="automation-job-details-dialog"
            className="flex max-h-[calc(100vh-32px)] flex-col rounded-[28px] bg-white"
          >
            <DialogHeader className="shrink-0 border-b border-slate-200/70 bg-white px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-[22px] font-semibold tracking-tight text-slate-900">
                    {detailsText(
                      t,
                      "settings.automation.details.title",
                      "持续流程详情",
                    )}
                  </DialogTitle>
                  <WorkbenchInfoTip
                    ariaLabel={detailsText(
                      t,
                      "settings.automation.details.tipAria",
                      "持续流程详情说明",
                    )}
                    content={detailsText(
                      t,
                      "settings.automation.details.tip",
                      "查看这条持续流程的状态、输出去向和最近运行；需要迁移旧浏览器流程时，也在这里确认遗留配置和风险提示。",
                    )}
                    tone="mint"
                  />
                </div>
                <DialogDescription className="text-sm text-slate-500">
                  {detailsText(
                    t,
                    "settings.automation.details.description",
                    "查看这条持续流程的状态、输出去向和最近运行。",
                  )}
                </DialogDescription>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {detailsText(
                      t,
                      "settings.automation.details.badge.job",
                      "这条：{{name}}",
                      { name: job.name },
                    )}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {detailsText(
                      t,
                      "settings.automation.details.badge.workspace",
                      "归属：{{workspace}}",
                      { workspace: workspaceName ?? job.workspace_id },
                    )}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {detailsText(
                      t,
                      "settings.automation.details.badge.schedule",
                      "调度：{{schedule}}",
                      {
                        schedule: detailsScheduleLabel(t, job, i18n.language),
                      },
                    )}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
                    {detailsText(
                      t,
                      "settings.automation.details.badge.payload",
                      "方式：{{payload}}",
                      {
                        payload: detailsPayloadKindLabel(t, job.payload.kind),
                      },
                    )}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      isLegacyBrowserAutomation(job)
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {detailsText(
                      t,
                      "settings.automation.details.badge.status",
                      "当前状态：{{status}}",
                      { status: detailsStatusLabel(t, job.last_status) },
                    )}
                  </span>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
              <div className="space-y-5">
                <div className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        {job.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {workspaceName ?? job.workspace_id}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusVariant(job.last_status)}>
                        {detailsStatusLabel(t, job.last_status)}
                      </Badge>
                      {isLegacyBrowserAutomation(job) ? (
                        <Badge variant="outline">
                          {detailsText(
                            t,
                            "settings.automation.details.status.offline",
                            "已下线",
                          )}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      {detailsText(
                        t,
                        "settings.automation.details.meta.startMethod",
                        "开始方式: {{payload}}",
                        {
                          payload: detailsPayloadKindLabel(t, job.payload.kind),
                        },
                      )}
                    </div>
                    {!isLegacyBrowserAutomation(job) ? (
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.meta.accessMode",
                          "权限模式: {{accessMode}}",
                          {
                            accessMode: detailsAccessModeLabel(t, job.payload),
                          },
                        )}
                      </div>
                    ) : null}
                    <div>
                      {detailsText(
                        t,
                        "settings.automation.details.meta.schedule",
                        "调度: {{schedule}}",
                        {
                          schedule: detailsScheduleLabel(t, job, i18n.language),
                        },
                      )}
                    </div>
                    <div>
                      {detailsText(
                        t,
                        "settings.automation.details.meta.nextRun",
                        "下次执行: {{time}}",
                        {
                          time: formatDetailsTime(
                            job.next_run_at,
                            i18n.language,
                          ),
                        },
                      )}
                    </div>
                    <div>
                      {detailsText(
                        t,
                        "settings.automation.details.meta.lastRun",
                        "最近执行: {{time}}",
                        {
                          time: formatDetailsTime(
                            job.last_run_at,
                            i18n.language,
                          ),
                        },
                      )}
                    </div>
                    <div className="md:col-span-2 xl:col-span-2">
                      {detailsText(
                        t,
                        "settings.automation.details.meta.lastError",
                        "最后错误: {{error}}",
                        { error: job.last_error || "-" },
                      )}
                    </div>
                  </div>
                  {isLegacyBrowserAutomation(job) ? (
                    <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                      <div className="font-medium text-amber-900">
                        {detailsText(
                          t,
                          "settings.automation.details.legacy.title",
                          "浏览器自动化已下线",
                        )}
                      </div>
                      <div className="mt-2">
                        {detailsText(
                          t,
                          "settings.automation.details.legacy.message",
                          "浏览器自动化已下线，系统不会再自动启动 Chrome。请删除旧流程，并改建为 Agent 对话持续流程。",
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                {serviceSkillContext ? (
                  <div className="rounded-[22px] border border-sky-200/80 bg-sky-50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.title",
                          "技能流程上下文",
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {serviceSkillContext.runnerLabel}
                        </Badge>
                        <Badge variant="outline">
                          {serviceSkillContext.executionLocationLabel}
                        </Badge>
                        {serviceSkillContext.executionLocationLegacyCompat ? (
                          <Badge variant="outline">
                            {serviceSkillExecutionCompatLabel}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.skill",
                          "技能: {{title}}",
                          { title: serviceSkillContext.title },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.source",
                          "目录来源: {{source}}",
                          { source: serviceSkillContext.sourceLabel },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.theme",
                          "主题: {{theme}}",
                          { theme: serviceSkillContext.theme || "-" },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.content",
                          "主稿绑定: {{content}}",
                          { content: serviceSkillContext.contentId || "-" },
                        )}
                      </div>
                    </div>
                    {serviceSkillContext.executionLocationLegacyCompat ? (
                      <div className="mt-3 text-xs leading-5 text-sky-700">
                        {serviceSkillExecutionCompatNote}
                      </div>
                    ) : null}
                    {serviceSkillContext.slotSummary.length ? (
                      <div className="mt-3 rounded-[16px] border border-slate-200/80 bg-white px-3 py-3">
                        <div className="text-xs font-medium text-slate-700">
                          {detailsText(
                            t,
                            "settings.automation.details.serviceSkill.slotSummary",
                            "参数摘要",
                          )}
                        </div>
                        <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
                          {serviceSkillContext.slotSummary.map((item) => (
                            <div key={item.key}>
                              <span className="font-medium text-slate-700">
                                {item.label}
                              </span>
                              : {item.value}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {serviceSkillContext.userInput ? (
                      <div className="mt-3 rounded-[16px] border border-slate-200/80 bg-white px-3 py-3 text-sm leading-6 text-slate-600">
                        <div className="text-xs font-medium text-slate-700">
                          {detailsText(
                            t,
                            "settings.automation.details.serviceSkill.userInput",
                            "补充要求",
                          )}
                        </div>
                        <div className="mt-1">
                          {serviceSkillContext.userInput}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {sceneAppSummaryCard ||
                sceneAppRunDetailView ||
                sceneAppLoading ||
                sceneAppError ? (
                  <div className="space-y-4">
                    <div className="rounded-[22px] border border-lime-200/80 bg-lime-50/70 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {detailsText(
                              t,
                              "settings.automation.details.sceneApp.title",
                              "接回生成",
                            )}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-slate-600">
                            {detailsText(
                              t,
                              "settings.automation.details.sceneApp.description",
                              "这条持续流程已经接回生成；除了调度状态，还会继续回流这轮结果、结果材料和下一步判断。",
                            )}
                          </div>
                        </div>
                        {sceneAppSummaryCard ? (
                          <Badge variant="secondary">
                            {sceneAppSummaryCard.statusLabel}
                          </Badge>
                        ) : null}
                      </div>

                      {sceneAppLoading && !sceneAppSummaryCard ? (
                        <div className="mt-4 rounded-[18px] border border-dashed border-lime-200 bg-white/80 px-4 py-4 text-sm text-slate-600">
                          {detailsText(
                            t,
                            "settings.automation.details.sceneApp.loading",
                            "正在回流这条持续流程对应的做法摘要…",
                          )}
                        </div>
                      ) : null}

                      {sceneAppSummaryCard ? (
                        <>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-slate-700">
                              {sceneAppSummaryCard.title}
                            </span>
                          </div>

                          <div className="mt-4 rounded-[18px] border border-white bg-white/90 px-4 py-4">
                            <div className="text-sm leading-7 text-slate-800">
                              {sceneAppSummaryCard.summary}
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-600">
                              {detailsText(
                                t,
                                "settings.automation.details.sceneApp.nextAction",
                                "先做：{{action}}",
                                { action: sceneAppSummaryCard.nextAction },
                              )}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-[18px] border border-white bg-white/90 px-4 py-3">
                              <div className="text-xs font-medium text-slate-500">
                                {detailsText(
                                  t,
                                  "settings.automation.details.sceneApp.overview",
                                  "持续流程概览",
                                )}
                              </div>
                              <div className="mt-2 text-sm font-medium text-slate-900">
                                {sceneAppSummaryCard.automationSummary}
                              </div>
                            </div>
                            <div className="rounded-[18px] border border-white bg-white/90 px-4 py-3">
                              <div className="text-xs font-medium text-slate-500">
                                {detailsText(
                                  t,
                                  "settings.automation.details.sceneApp.recentResult",
                                  "最近结果",
                                )}
                              </div>
                              <div className="mt-2 text-sm font-medium text-slate-900">
                                {sceneAppSummaryCard.latestAutomationLabel}
                              </div>
                            </div>
                          </div>

                          {sceneAppSummaryCard.scorecardAggregate ? (
                            <div
                              className="mt-4 rounded-[18px] border border-white bg-white/90 px-4 py-4"
                              data-testid="automation-sceneapp-scorecard-aggregate"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xs font-medium text-slate-500">
                                  {detailsText(
                                    t,
                                    "settings.automation.details.sceneApp.scorecard",
                                    "这轮判断",
                                  )}
                                </div>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                                  {
                                    sceneAppSummaryCard.scorecardAggregate
                                      .statusLabel
                                  }
                                </span>
                                {sceneAppSummaryCard.scorecardAggregate
                                  .actionLabel ? (
                                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                    {
                                      sceneAppSummaryCard.scorecardAggregate
                                        .actionLabel
                                    }
                                  </span>
                                ) : null}
                                {sceneAppSummaryCard.scorecardAggregate
                                  .topFailureSignalLabel ? (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                                    {
                                      sceneAppSummaryCard.scorecardAggregate
                                        .topFailureSignalLabel
                                    }
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-3 text-sm leading-6 text-slate-800">
                                {sceneAppSummaryCard.scorecardAggregate.summary}
                              </div>
                              <div className="mt-2 text-sm leading-6 text-slate-600">
                                {detailsText(
                                  t,
                                  "settings.automation.details.sceneApp.nextAction",
                                  "先做：{{action}}",
                                  {
                                    action:
                                      sceneAppSummaryCard.scorecardAggregate
                                        .nextAction,
                                  },
                                )}
                              </div>
                              {followupDestinations.length ? (
                                <div
                                  className="mt-4 grid gap-3 md:grid-cols-2"
                                  data-testid="automation-sceneapp-destination-actions"
                                >
                                  {followupDestinations.map((destination) => {
                                    const destinationAction =
                                      resolveFollowupDestinationAction(
                                        destination,
                                      );

                                    return (
                                      <article
                                        key={destination.key}
                                        className="rounded-[16px] border border-slate-200/80 bg-slate-50/70 px-3 py-3"
                                      >
                                        <div className="text-sm font-medium text-slate-900">
                                          {destination.label}
                                        </div>
                                        <div className="mt-2 text-xs leading-5 text-slate-600">
                                          {destination.description}
                                        </div>
                                        {destinationAction ? (
                                          <div className="mt-3">
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              data-testid={`automation-sceneapp-destination-action-${destination.key}`}
                                              onClick={
                                                destinationAction.onClick
                                              }
                                            >
                                              {destinationAction.label}
                                            </Button>
                                          </div>
                                        ) : destination.key ===
                                          "automation-job" ? (
                                          <div className="mt-3 text-xs leading-5 text-slate-500">
                                            {detailsText(
                                              t,
                                              "settings.automation.details.sceneApp.currentJobHint",
                                              "当前就在这条持续流程里，无需再跳转一次。",
                                            )}
                                          </div>
                                        ) : null}
                                      </article>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={onOpenSceneAppDetail}
                            >
                              {detailsText(
                                t,
                                "settings.automation.details.sceneApp.action.openDetail",
                                "回补这轮信息",
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={onOpenSceneAppGovernance}
                            >
                              {detailsText(
                                t,
                                "settings.automation.details.sceneApp.action.openGovernance",
                                "看这轮结果",
                              )}
                            </Button>
                          </div>
                        </>
                      ) : null}

                      {sceneAppError && !sceneAppRunDetailView ? (
                        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
                          {sceneAppError}
                        </div>
                      ) : null}
                    </div>

                    <SceneAppRunDetailPanel
                      hasSelectedSceneApp={
                        Boolean(sceneAppSummaryCard) ||
                        sceneAppLoading ||
                        Boolean(sceneAppError)
                      }
                      runDetailView={sceneAppRunDetailView}
                      loading={sceneAppLoading}
                      error={sceneAppError}
                      savedAsInspiration={sceneAppSavedAsInspiration}
                      onSaveAsInspiration={onSaveSceneAppAsInspiration}
                      onOpenInspirationLibrary={onOpenInspirationLibrary}
                      onDeliveryArtifactAction={
                        onSceneAppDeliveryArtifactAction
                      }
                      onGovernanceAction={onSceneAppGovernanceAction}
                      onGovernanceArtifactAction={
                        onSceneAppGovernanceArtifactAction
                      }
                    />
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                  <div className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.contractTitle",
                          "输出契约",
                        )}
                      </div>
                      <Badge
                        variant={
                          job.delivery.mode === "announce"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {detailsDeliveryModeLabel(t, job)}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-500">
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.target",
                          "输出目标: {{target}}",
                          {
                            target:
                              job.delivery.mode === "announce"
                                ? detailsDeliveryChannelLabel(
                                    t,
                                    job.delivery.channel,
                                  )
                                : "-",
                          },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.schema",
                          "输出契约: {{schema}}",
                          {
                            schema: detailsOutputSchemaLabel(
                              t,
                              resolveDeliveryOutputSchema(job),
                            ),
                          },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.format",
                          "投递编码: {{format}}",
                          {
                            format: detailsOutputFormatLabel(
                              t,
                              resolveDeliveryOutputFormat(
                                job.delivery.output_format,
                              ),
                            ),
                          },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.address",
                          "目标地址: {{address}}",
                          {
                            address:
                              job.delivery.mode === "announce"
                                ? job.delivery.target || "-"
                                : "-",
                          },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.failurePolicy",
                          "失败策略: {{policy}}",
                          {
                            policy:
                              job.delivery.mode !== "announce"
                                ? detailsText(
                                    t,
                                    "settings.automation.details.delivery.policy.disabled",
                                    "未启用",
                                  )
                                : job.delivery.best_effort
                                  ? detailsText(
                                      t,
                                      "settings.automation.details.delivery.policy.bestEffort",
                                      "投递失败不阻塞本轮",
                                    )
                                  : detailsText(
                                      t,
                                      "settings.automation.details.delivery.policy.strict",
                                      "投递失败记为本轮失败",
                                    ),
                          },
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`rounded-[18px] border px-4 py-3 ${deliveryToneClass(
                      job.last_delivery,
                    )}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.lastTitle",
                          "最近一次投递结果",
                        )}
                      </div>
                      <Badge
                        variant={
                          job.last_delivery
                            ? deliveryStatusVariant(job.last_delivery.success)
                            : "outline"
                        }
                      >
                        {job.last_delivery
                          ? job.last_delivery.success
                            ? detailsText(
                                t,
                                "settings.automation.details.delivery.status.success",
                                "投递成功",
                              )
                            : detailsText(
                                t,
                                "settings.automation.details.delivery.status.failed",
                                "投递失败",
                              )
                          : detailsText(
                              t,
                              "settings.automation.details.delivery.status.empty",
                              "暂无记录",
                            )}
                      </Badge>
                    </div>
                    {job.last_delivery ? (
                      <>
                        <div className="mt-3 space-y-2 text-sm">
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.attemptedAt",
                              "时间: {{time}}",
                              {
                                time: formatDetailsTime(
                                  job.last_delivery.attempted_at,
                                  i18n.language,
                                ),
                              },
                            )}
                          </div>
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.channel",
                              "渠道: {{channel}}",
                              {
                                channel: detailsDeliveryChannelLabel(
                                  t,
                                  job.last_delivery.channel,
                                ),
                              },
                            )}
                          </div>
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.target",
                              "目标: {{target}}",
                              { target: job.last_delivery.target || "-" },
                            )}
                          </div>
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.contract",
                              "契约: {{schema}} / {{format}}",
                              {
                                schema: detailsOutputSchemaLabel(
                                  t,
                                  job.last_delivery.output_schema,
                                ),
                                format: detailsOutputFormatLabel(
                                  t,
                                  job.last_delivery.output_format,
                                ),
                              },
                            )}
                          </div>
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.attemptId",
                              "投递键: {{id}}",
                              {
                                id:
                                  job.last_delivery.delivery_attempt_id || "-",
                              },
                            )}
                          </div>
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.retry",
                              "执行重试: {{executionRetry}} / 投递尝试: {{deliveryAttempts}}",
                              {
                                executionRetry:
                                  job.last_delivery.execution_retry_count ?? 0,
                                deliveryAttempts:
                                  job.last_delivery.delivery_attempts ?? 0,
                              },
                            )}
                          </div>
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.result",
                              "结果: {{message}}",
                              { message: job.last_delivery.message },
                            )}
                          </div>
                        </div>
                        <div className="mt-3 whitespace-pre-wrap rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                          {job.last_delivery.output_preview ||
                            detailsText(
                              t,
                              "settings.automation.details.delivery.last.noPreview",
                              "无输出预览",
                            )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-sm leading-6">
                        {job.delivery.mode === "announce"
                          ? detailsText(
                              t,
                              "settings.automation.details.delivery.last.emptyAnnounce",
                              "这条持续流程还没产生投递记录。",
                            )
                          : detailsText(
                              t,
                              "settings.automation.details.delivery.last.emptyDisabled",
                              "这条持续流程当前未启用输出投递。",
                            )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-3">
                  <div className="text-sm font-medium text-slate-900">
                    {detailsText(
                      t,
                      "settings.automation.details.payload.currentTitle",
                      "当前起手内容",
                    )}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap rounded-[14px] border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
                    {detailsPayloadDescription(t, job.payload)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">
                      {t("settings.automation.history.title", "最近运行")}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onRefreshHistory(job.id)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {t("settings.automation.history.action.refresh", "刷新")}
                    </Button>
                  </div>

                  {historyLoading ? (
                    <div className="flex h-28 items-center justify-center rounded-[22px] border border-slate-200/80 bg-slate-50">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : jobRuns.length ? (
                    jobRuns.map((run) => {
                      const infoMessage = resolveRunInfoMessage(run);
                      const delivery = resolveRunDelivery(run);
                      const runServiceSkillContext =
                        resolveRunServiceSkillContext(
                          run,
                          serviceSkillContext,
                          presentationCopy.serviceSkillContextCopy,
                        );
                      const runServiceSkillTaskLine = runServiceSkillContext
                        ? detailsServiceSkillTaskLine(t, runServiceSkillContext)
                        : null;
                      const runServiceSkillSlotPreview = runServiceSkillContext
                        ? detailsServiceSkillSlotPreview(
                            t,
                            runServiceSkillContext,
                          )
                        : null;

                      return (
                        <div
                          key={run.id}
                          className="rounded-[20px] border border-slate-200/80 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm text-slate-900">
                              {formatDetailsTime(run.started_at, i18n.language)}
                            </div>
                            <Badge variant={runStatusVariant(run)}>
                              {detailsStatusLabel(t, runDisplayStatus(run))}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>
                              {t("settings.automation.history.meta.id", {
                                id: run.id,
                                defaultValue: "ID: {{id}}",
                              })}
                            </span>
                            <span>
                              {t("settings.automation.history.meta.session", {
                                session: resolveRunSessionId(run) ?? "-",
                                defaultValue: "Session: {{session}}",
                              })}
                            </span>
                            <span>
                              {t("settings.automation.history.meta.finished", {
                                time: formatDetailsTime(
                                  run.finished_at,
                                  i18n.language,
                                ),
                                defaultValue: "完成: {{time}}",
                              })}
                            </span>
                          </div>
                          {infoMessage ? (
                            <div
                              className={`mt-3 rounded-[16px] border px-3 py-2 text-xs leading-5 ${runInfoToneClass(
                                run,
                              )}`}
                            >
                              {infoMessage}
                            </div>
                          ) : null}
                          {runServiceSkillContext ? (
                            <div
                              data-testid={`automation-run-service-skill-summary-${run.id}`}
                              className="mt-3 rounded-[16px] border border-sky-200/80 bg-sky-50 px-3 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xs font-medium text-slate-900">
                                  {t(
                                    "settings.automation.history.serviceSkill.title",
                                    "技能流程运行上下文",
                                  )}
                                </div>
                                <Badge variant="outline">
                                  {runServiceSkillContext.runnerLabel}
                                </Badge>
                                <Badge variant="outline">
                                  {
                                    runServiceSkillContext.executionLocationLabel
                                  }
                                </Badge>
                                {runServiceSkillContext.executionLocationLegacyCompat ? (
                                  <Badge variant="outline">
                                    {
                                      serviceSkillExecutionCompatLabel
                                    }
                                  </Badge>
                                ) : null}
                              </div>
                              {runServiceSkillTaskLine ? (
                                <div className="mt-2 text-xs leading-5 text-slate-700">
                                  {runServiceSkillTaskLine}
                                </div>
                              ) : null}
                              {runServiceSkillContext.executionLocationLegacyCompat ? (
                                <div className="mt-1 text-xs leading-5 text-sky-700">
                                  {serviceSkillExecutionCompatNote}
                                </div>
                              ) : null}
                              {runServiceSkillSlotPreview ? (
                                <div className="mt-1 text-xs leading-5 text-slate-600">
                                  {t(
                                    "settings.automation.history.serviceSkill.slotPreview",
                                    {
                                      summary: runServiceSkillSlotPreview,
                                      defaultValue: "参数摘要: {{summary}}",
                                    },
                                  )}
                                </div>
                              ) : null}
                              {runServiceSkillContext.userInput ? (
                                <div className="mt-1 text-xs leading-5 text-slate-500">
                                  {t(
                                    "settings.automation.history.serviceSkill.userInput",
                                    {
                                      input: runServiceSkillContext.userInput,
                                      defaultValue: "补充要求: {{input}}",
                                    },
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {delivery ? (
                            <div
                              className={`mt-3 rounded-[16px] border px-3 py-2 ${deliveryToneClass(
                                delivery,
                              )}`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
                                <span>
                                  {t(
                                    "settings.automation.history.delivery.title",
                                    {
                                      channel: detailsDeliveryChannelLabel(
                                        t,
                                        delivery.channel,
                                      ),
                                      defaultValue: "输出投递 / {{channel}}",
                                    },
                                  )}
                                </span>
                                <Badge
                                  variant={deliveryStatusVariant(
                                    delivery.success,
                                  )}
                                >
                                  {delivery.success
                                    ? t(
                                        "settings.automation.history.delivery.success",
                                        "成功",
                                      )
                                    : t(
                                        "settings.automation.history.delivery.failed",
                                        "失败",
                                      )}
                                </Badge>
                              </div>
                              <div className="mt-2 text-xs leading-5">
                                {delivery.message}
                              </div>
                            </div>
                          ) : null}
                          {run.error_message ? (
                            <div className="mt-3 rounded-[16px] border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-600">
                              <div className="font-medium">
                                {t(
                                  "settings.automation.history.errorReason",
                                  "失败原因",
                                )}
                              </div>
                              <div className="mt-1">{run.error_message}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                      {t(
                        "settings.automation.history.empty",
                        "还没有运行记录。",
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
