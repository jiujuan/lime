import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AutomationExecutionMode,
  AutomationJobRecord,
  AutomationJobRequest,
  AutomationOutputFormat,
  AutomationOutputSchema,
  AutomationPayload,
  BrowserSessionAutomationPayload,
  TaskSchedule,
  UpdateAutomationJobRequest,
  type DeliveryConfig,
} from "@/lib/api/automation";
import type { Project } from "@/lib/api/project";
import { createRuntimePoliciesFromAccessMode } from "@/components/agent/chat/utils/accessModeRuntime";
import {
  DEFAULT_AGENT_ACCESS_MODE,
  type AgentAccessMode,
} from "@/components/agent/chat/hooks/agentChatStorage";
import {
  buildAutomationAccessModeOptions,
  type AutomationAccessModeCopy,
  omitLegacyAutomationAccessModeMetadata,
  resolveAgentTurnAutomationAccessMode,
} from "./automationAccessMode";

export type AutomationJobDialogSubmit =
  | { mode: "create"; request: AutomationJobRequest }
  | { mode: "edit"; id: string; request: UpdateAutomationJobRequest };

type ScheduleKind = TaskSchedule["kind"];

type AutomationJobFormState = {
  name: string;
  description: string;
  enabled: boolean;
  workspace_id: string;
  execution_mode: AutomationExecutionMode;
  payload_kind: AutomationPayload["kind"];
  schedule_kind: ScheduleKind;
  every_secs: string;
  cron_expr: string;
  cron_tz: string;
  at_local: string;
  prompt: string;
  system_prompt: string;
  web_search: boolean;
  agent_content_id: string;
  agent_access_mode: AgentAccessMode;
  agent_request_metadata: Record<string, unknown> | null;
  timeout_secs: string;
  max_retries: string;
  delivery_mode: "none" | "announce";
  delivery_channel: "webhook" | "telegram" | "local_file" | "google_sheets";
  delivery_target: string;
  delivery_output_schema: AutomationOutputSchema;
  delivery_output_format: AutomationOutputFormat;
  best_effort: boolean;
};

export type AutomationJobDialogInitialValues = Partial<AutomationJobFormState>;

const TEXT_ONLY_DELIVERY_CHANNEL = "telegram";
type SettingsTranslate = TFunction<"settings">;

function buildAutomationAccessModeCopy(
  t: SettingsTranslate,
): AutomationAccessModeCopy {
  return {
    readOnly: t(
      "settings.automation.jobDialog.accessMode.readOnly",
      "只读",
    ),
    current: t(
      "settings.automation.jobDialog.accessMode.current",
      "按需确认",
    ),
    fullAccess: t(
      "settings.automation.jobDialog.accessMode.fullAccess",
      "完全访问",
    ),
    policyReadOnly: t(
      "settings.automation.jobDialog.accessMode.policy.readOnly",
      "正式策略会写成 on-request + read-only。",
    ),
    policyCurrent: t(
      "settings.automation.jobDialog.accessMode.policy.current",
      "正式策略会写成 on-request + workspace-write。",
    ),
    policyFullAccess: t(
      "settings.automation.jobDialog.accessMode.policy.fullAccess",
      "正式策略会写成 never + danger-full-access。",
    ),
  };
}

function legacyBrowserAutomationMessage(t: SettingsTranslate): string {
  return t(
    "settings.automation.jobDialog.legacy.message",
    "浏览器自动化已下线，系统不会再自动启动 Chrome。请删除这条旧流程，并改用 Agent 对话持续流程重建。",
  );
}

function translateWithValues(
  t: SettingsTranslate,
  key: string,
  defaultValue: string,
  values: Record<string, string | number | boolean>,
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
function toDateTimeLocal(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function createDefaultForm(workspaces: Project[]): AutomationJobFormState {
  return {
    name: "",
    description: "",
    enabled: true,
    workspace_id: workspaces[0]?.id ?? "",
    execution_mode: "intelligent",
    payload_kind: "agent_turn",
    schedule_kind: "every",
    every_secs: "300",
    cron_expr: "0 9 * * *",
    cron_tz: "Asia/Shanghai",
    at_local: "",
    prompt: "",
    system_prompt: "",
    web_search: false,
    agent_content_id: "",
    agent_access_mode: DEFAULT_AGENT_ACCESS_MODE,
    agent_request_metadata: null,
    timeout_secs: "",
    max_retries: "3",
    delivery_mode: "none",
    delivery_channel: "webhook",
    delivery_target: "",
    delivery_output_schema: "text",
    delivery_output_format: "text",
    best_effort: true,
  };
}

function createCreateForm(
  workspaces: Project[],
  initialValues?: AutomationJobDialogInitialValues | null,
): AutomationJobFormState {
  return {
    ...createDefaultForm(workspaces),
    ...(initialValues ?? {}),
    payload_kind: "agent_turn",
  };
}

function normalizeDeliveryOutputSchema(
  schema?: string | null,
  format?: AutomationOutputFormat | null,
): AutomationOutputSchema {
  switch (schema) {
    case "json":
    case "table":
    case "csv":
    case "links":
    case "text":
      return schema;
    default:
      return format === "json" ? "json" : "text";
  }
}

function normalizeDeliveryOutputContract(
  channel: AutomationJobFormState["delivery_channel"],
  outputSchema: AutomationOutputSchema,
  outputFormat: AutomationOutputFormat,
): {
  outputSchema: AutomationOutputSchema;
  outputFormat: AutomationOutputFormat;
} {
  if (channel === TEXT_ONLY_DELIVERY_CHANNEL) {
    return {
      outputSchema: "text",
      outputFormat: "text",
    };
  }
  return {
    outputSchema,
    outputFormat,
  };
}

function buildDeliveryConfig(form: AutomationJobFormState): DeliveryConfig {
  if (form.delivery_mode !== "announce") {
    return {
      mode: "none",
      channel: null,
      target: null,
      best_effort: true,
      output_schema: "text",
      output_format: "text",
    };
  }

  const contract = normalizeDeliveryOutputContract(
    form.delivery_channel,
    form.delivery_output_schema,
    form.delivery_output_format,
  );

  return {
    mode: "announce",
    channel: form.delivery_channel,
    target: form.delivery_target.trim() || null,
    best_effort: form.best_effort,
    output_schema: contract.outputSchema,
    output_format: contract.outputFormat,
  };
}

function createFormFromJob(
  job: AutomationJobRecord,
  workspaces: Project[],
): AutomationJobFormState {
  const form = createDefaultForm(workspaces);
  form.name = job.name;
  form.description = job.description ?? "";
  form.enabled = job.enabled;
  form.workspace_id = job.workspace_id;
  form.execution_mode = job.execution_mode;
  form.payload_kind = job.payload.kind;
  if (job.payload.kind === "agent_turn") {
    form.prompt = job.payload.prompt;
    form.system_prompt = job.payload.system_prompt ?? "";
    form.web_search = job.payload.web_search;
    form.agent_content_id = job.payload.content_id ?? "";
    form.agent_access_mode = resolveAgentTurnAutomationAccessMode(job.payload);
    form.agent_request_metadata = job.payload.request_metadata ?? null;
  }
  form.timeout_secs = job.timeout_secs ? String(job.timeout_secs) : "";
  form.max_retries = String(job.max_retries);
  form.delivery_mode = job.delivery.mode === "announce" ? "announce" : "none";
  form.delivery_channel =
    job.delivery.channel === "telegram"
      ? "telegram"
      : job.delivery.channel === "google_sheets"
        ? "google_sheets"
        : job.delivery.channel === "local_file"
          ? "local_file"
          : "webhook";
  form.delivery_target = job.delivery.target ?? "";
  const deliveryOutputContract = normalizeDeliveryOutputContract(
    form.delivery_channel,
    normalizeDeliveryOutputSchema(
      job.delivery.output_schema,
      job.delivery.output_format,
    ),
    job.delivery.output_format === "json" ? "json" : "text",
  );
  form.delivery_output_schema = deliveryOutputContract.outputSchema;
  form.delivery_output_format = deliveryOutputContract.outputFormat;
  form.best_effort = job.delivery.best_effort;

  if (job.schedule.kind === "every") {
    form.schedule_kind = "every";
    form.every_secs = String(job.schedule.every_secs);
  } else if (job.schedule.kind === "cron") {
    form.schedule_kind = "cron";
    form.cron_expr = job.schedule.expr;
    form.cron_tz = job.schedule.tz ?? "";
  } else {
    form.schedule_kind = "at";
    form.at_local = toDateTimeLocal(job.schedule.at);
  }

  return form;
}

function buildSchedule(
  form: AutomationJobFormState,
  t: SettingsTranslate,
): TaskSchedule {
  if (form.schedule_kind === "every") {
    const every_secs = Number(form.every_secs);
    if (!Number.isFinite(every_secs) || every_secs < 60) {
      throw new Error(
        t(
          "settings.automation.jobDialog.validation.intervalMin",
          "轮询间隔不能小于 60 秒",
        ),
      );
    }
    return { kind: "every", every_secs };
  }

  if (form.schedule_kind === "cron") {
    if (!form.cron_expr.trim()) {
      throw new Error(
        t(
          "settings.automation.jobDialog.validation.cronRequired",
          "Cron 表达式不能为空",
        ),
      );
    }
    return {
      kind: "cron",
      expr: form.cron_expr.trim(),
      tz: form.cron_tz.trim() || null,
    };
  }

  if (!form.at_local) {
    throw new Error(
      t(
        "settings.automation.jobDialog.validation.atRequired",
        "一次性触发时间不能为空",
      ),
    );
  }

  const date = new Date(form.at_local);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      t(
        "settings.automation.jobDialog.validation.atInvalid",
        "一次性触发时间格式无效",
      ),
    );
  }

  return {
    kind: "at",
    at: date.toISOString(),
  };
}

function scheduleHint(
  form: AutomationJobFormState,
  t: SettingsTranslate,
): string {
  if (form.schedule_kind === "every") {
    const secs = Number(form.every_secs);
    if (!Number.isFinite(secs) || secs <= 0) {
      return t(
        "settings.automation.jobDialog.schedule.hint.fixed",
        "按固定秒级间隔轮询。",
      );
    }
    if (secs % 3600 === 0) {
      return translateWithValues(
        t,
        "settings.automation.jobDialog.schedule.hint.hours",
        "每 {{count}} 小时执行一次",
        { count: secs / 3600 },
      );
    }
    if (secs % 60 === 0) {
      return translateWithValues(
        t,
        "settings.automation.jobDialog.schedule.hint.minutes",
        "每 {{count}} 分钟执行一次",
        { count: secs / 60 },
      );
    }
    return translateWithValues(
      t,
      "settings.automation.jobDialog.schedule.hint.seconds",
      "每 {{count}} 秒执行一次",
      { count: secs },
    );
  }
  if (form.schedule_kind === "cron") {
    return t(
      "settings.automation.jobDialog.schedule.hint.cron",
      "使用 Cron 表达式驱动执行。",
    );
  }
  return form.at_local
    ? t(
        "settings.automation.jobDialog.schedule.hint.atReady",
        "一次性触发，到点后自动停用。",
      )
    : t(
        "settings.automation.jobDialog.schedule.hint.atSelect",
        "选择一次性触发时间。",
      );
}

function buildLegacyBrowserPayloadSummary(
  t: SettingsTranslate,
  payload: BrowserSessionAutomationPayload,
): Array<{ label: string; value: string }> {
  const notSet = t(
    "settings.automation.jobDialog.legacy.summary.notSet",
    "未设置",
  );
  return [
    {
      label: t(
        "settings.automation.jobDialog.legacy.summary.profile",
        "浏览器资料",
      ),
      value: payload.profile_key ?? payload.profile_id,
    },
    {
      label: t("settings.automation.jobDialog.legacy.summary.url", "启动地址"),
      value:
        payload.url?.trim() ||
        t(
          "settings.automation.jobDialog.legacy.summary.defaultUrl",
          "使用资料默认启动地址",
        ),
    },
    {
      label: t(
        "settings.automation.jobDialog.legacy.summary.environment",
        "环境预设",
      ),
      value: payload.environment_preset_id?.trim() || notSet,
    },
    {
      label: t(
        "settings.automation.jobDialog.legacy.summary.targetId",
        "Target ID",
      ),
      value: payload.target_id?.trim() || notSet,
    },
    {
      label: t(
        "settings.automation.jobDialog.legacy.summary.window",
        "调试窗口",
      ),
      value: payload.open_window
        ? t("settings.automation.jobDialog.legacy.summary.windowOpen", "打开")
        : t(
            "settings.automation.jobDialog.legacy.summary.windowClosed",
            "关闭",
          ),
    },
    {
      label: t(
        "settings.automation.jobDialog.legacy.summary.streamMode",
        "流模式",
      ),
      value: payload.stream_mode,
    },
  ];
}

function scheduleKindLabel(
  t: SettingsTranslate,
  scheduleKind: ScheduleKind,
): string {
  switch (scheduleKind) {
    case "every":
      return t("settings.automation.jobDialog.schedule.kind.every", "固定间隔");
    case "cron":
      return t("settings.automation.jobDialog.schedule.kind.cron", "Cron");
    case "at":
    default:
      return t("settings.automation.jobDialog.schedule.kind.at", "一次性");
  }
}

function accessModeLabel(
  t: SettingsTranslate,
  accessMode: AgentAccessMode,
): string {
  switch (accessMode) {
    case "read-only":
      return t("settings.automation.jobDialog.accessMode.readOnly", "只读");
    case "current":
      return t("settings.automation.jobDialog.accessMode.current", "按需确认");
    case "full-access":
    default:
      return t(
        "settings.automation.jobDialog.accessMode.fullAccess",
        "完全访问",
      );
  }
}

function accessModePolicySummary(
  t: SettingsTranslate,
  accessMode: AgentAccessMode,
): string {
  switch (accessMode) {
    case "read-only":
      return t(
        "settings.automation.jobDialog.accessMode.policy.readOnly",
        "正式策略会写成 on-request + read-only。",
      );
    case "current":
      return t(
        "settings.automation.jobDialog.accessMode.policy.current",
        "正式策略会写成 on-request + workspace-write。",
      );
    case "full-access":
    default:
      return t(
        "settings.automation.jobDialog.accessMode.policy.fullAccess",
        "正式策略会写成 never + danger-full-access。",
      );
  }
}

function deliveryTargetPlaceholder(
  t: SettingsTranslate,
  channel: AutomationJobFormState["delivery_channel"],
): string {
  switch (channel) {
    case "telegram":
      return t(
        "settings.automation.jobDialog.delivery.target.placeholder.telegram",
        "bot_token:chat_id",
      );
    case "google_sheets":
      return t(
        "settings.automation.jobDialog.delivery.target.placeholder.googleSheets",
        "spreadsheet_id=...;sheet=AgentOutput;credentials_file=ABSOLUTE_PATH_TO_SERVICE_ACCOUNT.json",
      );
    case "local_file":
      return t(
        "settings.automation.jobDialog.delivery.target.placeholder.localFile",
        "输入输出文件绝对路径",
      );
    case "webhook":
    default:
      return t(
        "settings.automation.jobDialog.delivery.target.placeholder.webhook",
        "https://example.com/webhook",
      );
  }
}

function deliveryChannelDescription(
  t: SettingsTranslate,
  channel: AutomationJobFormState["delivery_channel"],
): string {
  switch (channel) {
    case "webhook":
      return t(
        "settings.automation.jobDialog.delivery.description.webhook",
        "Webhook 适合系统对接；当前会携带 output_schema、output_format、结构化 output_data，以及稳定的 delivery_attempt_id 幂等键。",
      );
    case "google_sheets":
      return t(
        "settings.automation.jobDialog.delivery.description.googleSheets",
        "Google Sheets 使用 service account 直连，目标格式为 spreadsheet_id=...;sheet=...;credentials_file=绝对路径，可选 include_header=true 和 value_input_option=USER_ENTERED；追加行会自动带 delivery_attempt_id 等元数据列。",
      );
    case "local_file":
      return t(
        "settings.automation.jobDialog.delivery.description.localFile",
        "本地文件适合先落最小输出闭环；text 会按契约渲染，json 会写入结构化结果。",
      );
    case "telegram":
    default:
      return t(
        "settings.automation.jobDialog.delivery.description.telegram",
        "Telegram 继续作为兼容通知通道，只发送文本提醒，不承诺结构化输出契约。",
      );
  }
}

export function AutomationJobDialog({
  open,
  mode,
  job,
  workspaces,
  initialValues,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  job?: AutomationJobRecord | null;
  workspaces: Project[];
  initialValues?: AutomationJobDialogInitialValues | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AutomationJobDialogSubmit) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [form, setForm] = useState<AutomationJobFormState>(() =>
    createCreateForm(workspaces, initialValues),
  );
  const [error, setError] = useState<string | null>(null);
  const isLegacyBrowserJob =
    mode === "edit" && job?.payload.kind === "browser_session";
  const legacyBrowserPayload =
    isLegacyBrowserJob && job?.payload.kind === "browser_session"
      ? job.payload
      : null;
  const legacyBrowserSummary = useMemo(
    () =>
      legacyBrowserPayload
        ? buildLegacyBrowserPayloadSummary(t, legacyBrowserPayload)
        : [],
    [legacyBrowserPayload, t],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setForm(
      mode === "edit" && job
        ? createFormFromJob(job, workspaces)
        : createCreateForm(workspaces, initialValues),
    );
  }, [initialValues, job, mode, open, workspaces]);

  const scheduleSummary = useMemo(() => scheduleHint(form, t), [form, t]);
  const isTextOnlyDelivery =
    form.delivery_channel === TEXT_ONLY_DELIVERY_CHANNEL;
  const workspaceLabel = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === form.workspace_id)
        ?.name ??
      form.workspace_id ??
      t("settings.automation.jobDialog.workspace.none", "未选择"),
    [form.workspace_id, t, workspaces],
  );
  const dialogTitle =
    mode === "create"
      ? t("settings.automation.jobDialog.title.create", "新建持续流程")
      : t("settings.automation.jobDialog.title.edit", "调整持续流程");
  const dialogSummary = isLegacyBrowserJob
    ? t(
        "settings.automation.jobDialog.description.legacy",
        "查看历史配置快照并迁移到 Agent 对话持续流程。",
      )
    : t(
        "settings.automation.jobDialog.description.create",
        "配置流程名称、节奏、启动提示和输出去向。",
      );
  const dialogTipContent = isLegacyBrowserJob
    ? t(
        "settings.automation.jobDialog.tip.legacy",
        "浏览器自动化已下线，当前弹窗只保留历史配置展示与迁移参考，不允许继续保存。",
      )
    : t(
        "settings.automation.jobDialog.tip.create",
        "用这条持续流程承接 Agent 对话里已经跑顺的做法，统一管理节奏、归属位置、输出去向和运行历史。",
      );
  const scheduleLabel = scheduleKindLabel(t, form.schedule_kind);
  const accessLabel = accessModeLabel(t, form.agent_access_mode);
  const accessModeOptions = useMemo(
    () =>
      buildAutomationAccessModeOptions(buildAutomationAccessModeCopy(t)) ?? [],
    [t],
  );

  async function handleSubmit() {
    try {
      setError(null);

      if (isLegacyBrowserJob) {
        throw new Error(legacyBrowserAutomationMessage(t));
      }

      if (!form.name.trim()) {
        throw new Error(
          t(
            "settings.automation.jobDialog.validation.nameRequired",
            "流程名称不能为空",
          ),
        );
      }
      if (!form.workspace_id.trim()) {
        throw new Error(
          t(
            "settings.automation.jobDialog.validation.workspaceRequired",
            "请选择归属位置",
          ),
        );
      }

      const schedule = buildSchedule(form, t);
      if (!form.prompt.trim()) {
        throw new Error(
          t(
            "settings.automation.jobDialog.validation.promptRequired",
            "启动提示不能为空",
          ),
        );
      }
      const runtimePolicies = createRuntimePoliciesFromAccessMode(
        form.agent_access_mode,
      );
      const payload: AutomationPayload = {
        kind: "agent_turn",
        prompt: form.prompt.trim(),
        system_prompt: form.system_prompt.trim() || null,
        web_search: form.web_search,
        content_id: form.agent_content_id.trim() || null,
        approval_policy: runtimePolicies.approvalPolicy,
        sandbox_policy: runtimePolicies.sandboxPolicy,
        request_metadata: omitLegacyAutomationAccessModeMetadata(
          form.agent_request_metadata,
        ),
      };
      const timeout_secs = form.timeout_secs.trim()
        ? Number(form.timeout_secs)
        : null;
      const max_retries = Number(form.max_retries);

      if (
        timeout_secs !== null &&
        (!Number.isFinite(timeout_secs) || timeout_secs <= 0)
      ) {
        throw new Error(
          t(
            "settings.automation.jobDialog.validation.timeoutPositive",
            "超时时间必须为正整数",
          ),
        );
      }
      if (!Number.isFinite(max_retries) || max_retries < 1) {
        throw new Error(
          t(
            "settings.automation.jobDialog.validation.maxRetriesMin",
            "最大重试次数不能小于 1",
          ),
        );
      }
      if (form.delivery_mode === "announce" && !form.delivery_target.trim()) {
        throw new Error(
          t(
            "settings.automation.jobDialog.validation.deliveryTargetRequired",
            "请输入输出目标",
          ),
        );
      }
      const delivery = buildDeliveryConfig(form);

      if (mode === "create") {
        await onSubmit({
          mode: "create",
          request: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            enabled: form.enabled,
            workspace_id: form.workspace_id,
            execution_mode: form.execution_mode,
            schedule,
            payload,
            delivery,
            timeout_secs,
            max_retries,
          },
        });
      } else if (job) {
        await onSubmit({
          mode: "edit",
          id: job.id,
          request: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            enabled: form.enabled,
            workspace_id: form.workspace_id,
            execution_mode: form.execution_mode,
            schedule,
            payload,
            delivery,
            timeout_secs: timeout_secs ?? undefined,
            clear_timeout_secs: timeout_secs === null,
            max_retries,
          },
        });
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t(
              "settings.automation.jobDialog.validation.saveFailed",
              "保存持续流程失败",
            ),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        maxWidth="max-w-[820px]"
        className="lime-workbench-theme-scope max-h-[calc(100vh-32px)] overflow-hidden rounded-[28px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0"
      >
        <div className="flex max-h-[calc(100vh-32px)] flex-col rounded-[28px] bg-white">
          <DialogHeader className="shrink-0 border-b border-slate-200/70 bg-white px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-[22px] font-semibold tracking-tight text-slate-900">
                  {dialogTitle}
                </DialogTitle>
                <WorkbenchInfoTip
                  ariaLabel={t(
                    "settings.automation.jobDialog.tipAria",
                    "持续流程弹窗说明",
                  )}
                  content={dialogTipContent}
                  tone="mint"
                />
              </div>
              <DialogDescription className="text-sm text-slate-500">
                {dialogSummary}
              </DialogDescription>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {translateWithValues(
                    t,
                    "settings.automation.jobDialog.badge.workspace",
                    "归属：{{workspace}}",
                    { workspace: workspaceLabel },
                  )}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {translateWithValues(
                    t,
                    "settings.automation.jobDialog.badge.schedule",
                    "调度：{{schedule}}",
                    { schedule: scheduleLabel },
                  )}
                </span>
                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    isLegacyBrowserJob
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  {translateWithValues(
                    t,
                    "settings.automation.jobDialog.badge.startMethod",
                    "开始方式：{{method}}",
                    {
                      method: isLegacyBrowserJob
                        ? t(
                            "settings.automation.jobDialog.payload.browserSession",
                            "浏览器自动化",
                          )
                        : t(
                            "settings.automation.jobDialog.payload.agentTurn",
                            "Agent 对话",
                          ),
                    },
                  )}
                </span>
                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    form.delivery_mode === "announce"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  {translateWithValues(
                    t,
                    "settings.automation.jobDialog.badge.delivery",
                    "输出投递：{{status}}",
                    {
                      status:
                        form.delivery_mode === "announce"
                          ? t(
                              "settings.automation.jobDialog.delivery.status.enabled",
                              "已启用",
                            )
                          : t(
                              "settings.automation.jobDialog.delivery.status.disabled",
                              "未启用",
                            ),
                    },
                  )}
                </span>
                {!isLegacyBrowserJob ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                    {translateWithValues(
                      t,
                      "settings.automation.jobDialog.badge.permission",
                      "权限：{{accessMode}}",
                      { accessMode: accessLabel },
                    )}
                  </span>
                ) : null}
                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    isLegacyBrowserJob
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : form.enabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  {translateWithValues(
                    t,
                    "settings.automation.jobDialog.badge.status",
                    "当前状态：{{status}}",
                    {
                      status: isLegacyBrowserJob
                        ? t(
                            "settings.automation.jobDialog.status.offline",
                            "已下线",
                          )
                        : form.enabled
                          ? t(
                              "settings.automation.jobDialog.status.enabled",
                              "已启用",
                            )
                          : t(
                              "settings.automation.jobDialog.status.disabled",
                              "已停用",
                            ),
                    },
                  )}
                </span>
              </div>
            </div>
          </DialogHeader>

          <div
            data-testid="automation-job-dialog-scroll-area"
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="automation-job-name">
                  {t(
                    "settings.automation.jobDialog.field.name.label",
                    "流程名称",
                  )}
                </Label>
                <Input
                  id="automation-job-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder={t(
                    "settings.automation.jobDialog.field.name.placeholder",
                    "例如：每日品牌线索巡检",
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t(
                    "settings.automation.jobDialog.field.workspace.label",
                    "归属位置",
                  )}
                </Label>
                <Select
                  value={form.workspace_id}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, workspace_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "settings.automation.jobDialog.field.workspace.placeholder",
                        "选择归属位置",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <Label htmlFor="automation-job-description">
                {t(
                  "settings.automation.jobDialog.field.description.label",
                  "流程说明",
                )}
              </Label>
              <Textarea
                id="automation-job-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder={t(
                  "settings.automation.jobDialog.field.description.placeholder",
                  "说明这条持续流程跑起来后希望得到什么结果",
                )}
                className="min-h-[90px]"
              />
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-4">
              <div className="space-y-2">
                <Label>
                  {t(
                    "settings.automation.jobDialog.field.startMethod.label",
                    "开始方式",
                  )}
                </Label>
                <Select value={form.payload_kind} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent_turn">
                      {t(
                        "settings.automation.jobDialog.payload.agentTurn",
                        "Agent 对话",
                      )}
                    </SelectItem>
                    {isLegacyBrowserJob ? (
                      <SelectItem value="browser_session">
                        {t(
                          "settings.automation.jobDialog.payload.browserSession",
                          "浏览器自动化",
                        )}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {t(
                    "settings.automation.jobDialog.field.executionMode.label",
                    "执行模式",
                  )}
                </Label>
                <Select
                  value={form.execution_mode}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      execution_mode: value as AutomationExecutionMode,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intelligent">
                      {t(
                        "settings.automation.jobDialog.executionMode.intelligent",
                        "智能执行",
                      )}
                    </SelectItem>
                    <SelectItem value="skill">
                      {t(
                        "settings.automation.jobDialog.executionMode.skill",
                        "技能执行",
                      )}
                    </SelectItem>
                    <SelectItem value="log_only">
                      {t(
                        "settings.automation.jobDialog.executionMode.logOnly",
                        "只记录",
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {t(
                    "settings.automation.jobDialog.field.maxRetries.label",
                    "最大重试",
                  )}
                </Label>
                <Input
                  value={form.max_retries}
                  type="number"
                  min={1}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      max_retries: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t(
                    "settings.automation.jobDialog.field.timeout.label",
                    "超时秒数",
                  )}
                </Label>
                <Input
                  value={form.timeout_secs}
                  type="number"
                  min={1}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      timeout_secs: event.target.value,
                    }))
                  }
                  placeholder={t(
                    "settings.automation.jobDialog.field.timeout.placeholder",
                    "留空表示不限制",
                  )}
                />
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
              <div className="grid gap-5 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>
                    {t(
                      "settings.automation.jobDialog.field.scheduleKind.label",
                      "调度方式",
                    )}
                  </Label>
                  <Select
                    value={form.schedule_kind}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        schedule_kind: value as ScheduleKind,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="every">
                        {t(
                          "settings.automation.jobDialog.schedule.kind.every",
                          "固定间隔",
                        )}
                      </SelectItem>
                      <SelectItem value="cron">
                        {t(
                          "settings.automation.jobDialog.schedule.kind.cron",
                          "Cron",
                        )}
                      </SelectItem>
                      <SelectItem value="at">
                        {t(
                          "settings.automation.jobDialog.schedule.kind.at",
                          "一次性",
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.schedule_kind === "every" ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label>
                      {t(
                        "settings.automation.jobDialog.field.interval.label",
                        "间隔秒数",
                      )}
                    </Label>
                    <Input
                      value={form.every_secs}
                      type="number"
                      min={60}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          every_secs: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                {form.schedule_kind === "cron" ? (
                  <>
                    <div className="space-y-2 md:col-span-2">
                      <Label>
                        {t(
                          "settings.automation.jobDialog.field.cron.label",
                          "Cron 表达式",
                        )}
                      </Label>
                      <Input
                        value={form.cron_expr}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            cron_expr: event.target.value,
                          }))
                        }
                        placeholder="0 9 * * *"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {t(
                          "settings.automation.jobDialog.field.timezone.label",
                          "时区",
                        )}
                      </Label>
                      <Input
                        value={form.cron_tz}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            cron_tz: event.target.value,
                          }))
                        }
                        placeholder="Asia/Shanghai"
                      />
                    </div>
                  </>
                ) : null}

                {form.schedule_kind === "at" ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label>
                      {t(
                        "settings.automation.jobDialog.field.at.label",
                        "触发时间",
                      )}
                    </Label>
                    <Input
                      value={form.at_local}
                      type="datetime-local"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          at_local: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </div>

              <div className="mt-3 text-xs text-slate-500">
                {scheduleSummary}
              </div>
            </div>

            {isLegacyBrowserJob && legacyBrowserPayload ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
                  <div className="font-medium text-amber-900">
                    {t(
                      "settings.automation.jobDialog.legacy.title",
                      "浏览器自动化已下线",
                    )}
                  </div>
                  <div className="mt-2">
                    {legacyBrowserAutomationMessage(t)}
                  </div>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-4">
                  <div className="text-sm font-medium text-slate-900">
                    {t(
                      "settings.automation.jobDialog.legacy.snapshotTitle",
                      "历史配置快照",
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    {legacyBrowserSummary.map((item) => (
                      <div key={item.label}>
                        <span className="font-medium text-slate-900">
                          {item.label}
                        </span>
                        : {item.value}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs leading-5 text-slate-500">
                    {t(
                      "settings.automation.jobDialog.legacy.snapshotNote",
                      "这份配置只保留展示，不允许继续保存或执行。",
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-2">
                  <Label htmlFor="automation-job-prompt">
                    {t(
                      "settings.automation.jobDialog.field.prompt.label",
                      "启动提示",
                    )}
                  </Label>
                  <Textarea
                    id="automation-job-prompt"
                    value={form.prompt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        prompt: event.target.value,
                      }))
                    }
                    placeholder={t(
                      "settings.automation.jobDialog.field.prompt.placeholder",
                      "描述这条持续流程每次启动时要做什么",
                    )}
                    className="min-h-[120px] sm:min-h-[140px]"
                  />
                </div>

                <div className="mt-5 space-y-2">
                  <Label htmlFor="automation-job-system-prompt">
                    {t(
                      "settings.automation.jobDialog.field.systemPrompt.label",
                      "附加系统指令",
                    )}
                  </Label>
                  <Textarea
                    id="automation-job-system-prompt"
                    value={form.system_prompt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        system_prompt: event.target.value,
                      }))
                    }
                    placeholder={t(
                      "settings.automation.jobDialog.field.systemPrompt.placeholder",
                      "可选，控制这条持续流程的执行风格",
                    )}
                    className="min-h-[96px] sm:min-h-[110px]"
                  />
                </div>
                <div className="mt-5 grid gap-4 rounded-[24px] border border-slate-200/80 bg-white/80 p-4 md:grid-cols-3">
                  <div className="flex items-center justify-between rounded-[18px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {t(
                          "settings.automation.jobDialog.toggle.enabled.label",
                          "启用这条",
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {t(
                          "settings.automation.jobDialog.toggle.enabled.description",
                          "关闭后这条持续流程不再参与轮询",
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={form.enabled}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, enabled: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-[18px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {t(
                          "settings.automation.jobDialog.toggle.webSearch.label",
                          "允许 Web 搜索",
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {t(
                          "settings.automation.jobDialog.toggle.webSearch.description",
                          "为这条持续流程单独开启搜索能力",
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={form.web_search}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          web_search: checked,
                        }))
                      }
                    />
                  </div>
                  <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">
                      {t(
                        "settings.automation.jobDialog.accessMode.label",
                        "权限模式",
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {accessModePolicySummary(t, form.agent_access_mode)}
                    </div>
                    <div className="mt-3">
                      <Select
                        value={form.agent_access_mode}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            agent_access_mode: value as AgentAccessMode,
                          }))
                        }
                      >
                        <SelectTrigger
                          aria-label={t(
                            "settings.automation.jobDialog.accessMode.aria",
                            "自动化权限模式",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {accessModeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {accessModeLabel(t, option.value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
                  <div className="grid gap-5 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>
                        {t(
                          "settings.automation.jobDialog.delivery.mode.label",
                          "输出模式",
                        )}
                      </Label>
                      <Select
                        value={form.delivery_mode}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            delivery_mode: value as "none" | "announce",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {t(
                              "settings.automation.jobDialog.delivery.mode.none",
                              "关闭",
                            )}
                          </SelectItem>
                          <SelectItem value="announce">
                            {t(
                              "settings.automation.jobDialog.delivery.mode.announce",
                              "运行完成后投递",
                            )}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {form.delivery_mode === "announce" ? (
                      <>
                        <div className="space-y-2">
                          <Label>
                            {t(
                              "settings.automation.jobDialog.delivery.channel.label",
                              "输出目标",
                            )}
                          </Label>
                          <Select
                            value={form.delivery_channel}
                            onValueChange={(value) =>
                              setForm((current) => {
                                const deliveryChannel = value as
                                  | "webhook"
                                  | "telegram"
                                  | "local_file"
                                  | "google_sheets";
                                const contract =
                                  normalizeDeliveryOutputContract(
                                    deliveryChannel,
                                    current.delivery_output_schema,
                                    current.delivery_output_format,
                                  );
                                return {
                                  ...current,
                                  delivery_channel: deliveryChannel,
                                  delivery_output_schema: contract.outputSchema,
                                  delivery_output_format: contract.outputFormat,
                                };
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="webhook">
                                {t(
                                  "settings.automation.jobDialog.delivery.channel.webhook",
                                  "Webhook",
                                )}
                              </SelectItem>
                              <SelectItem value="google_sheets">
                                {t(
                                  "settings.automation.jobDialog.delivery.channel.googleSheets",
                                  "Google Sheets",
                                )}
                              </SelectItem>
                              <SelectItem value="local_file">
                                {t(
                                  "settings.automation.jobDialog.delivery.channel.localFile",
                                  "本地文件",
                                )}
                              </SelectItem>
                              <SelectItem value="telegram">
                                {t(
                                  "settings.automation.jobDialog.delivery.channel.telegram",
                                  "Telegram",
                                )}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>
                            {t(
                              "settings.automation.jobDialog.delivery.schema.label",
                              "输出契约",
                            )}
                          </Label>
                          <Select
                            disabled={isTextOnlyDelivery}
                            value={form.delivery_output_schema}
                            onValueChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                delivery_output_schema:
                                  value as AutomationOutputSchema,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.text",
                                  "文本摘要",
                                )}
                              </SelectItem>
                              <SelectItem value="json">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.json",
                                  "JSON 对象",
                                )}
                              </SelectItem>
                              <SelectItem value="table">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.table",
                                  "表格",
                                )}
                              </SelectItem>
                              <SelectItem value="csv">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.csv",
                                  "CSV",
                                )}
                              </SelectItem>
                              <SelectItem value="links">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.links",
                                  "链接列表",
                                )}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>
                            {t(
                              "settings.automation.jobDialog.delivery.format.label",
                              "输出格式",
                            )}
                          </Label>
                          <Select
                            disabled={isTextOnlyDelivery}
                            value={form.delivery_output_format}
                            onValueChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                delivery_output_format:
                                  value as AutomationOutputFormat,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">
                                {t(
                                  "settings.automation.jobDialog.delivery.format.text",
                                  "文本摘要",
                                )}
                              </SelectItem>
                              <SelectItem value="json">
                                {t(
                                  "settings.automation.jobDialog.delivery.format.json",
                                  "结构化 JSON",
                                )}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {form.delivery_mode === "announce" ? (
                    <>
                      <div className="mt-4 space-y-2">
                        <Label>
                          {t(
                            "settings.automation.jobDialog.delivery.target.label",
                            "目标地址",
                          )}
                        </Label>
                        <Input
                          value={form.delivery_target}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              delivery_target: event.target.value,
                            }))
                          }
                          placeholder={deliveryTargetPlaceholder(
                            t,
                            form.delivery_channel,
                          )}
                        />
                      </div>
                      <div className="mt-4 flex items-center justify-between rounded-[18px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {t(
                              "settings.automation.jobDialog.delivery.bestEffort.label",
                              "投递失败不阻塞本轮",
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t(
                              "settings.automation.jobDialog.delivery.bestEffort.description",
                              "关闭后投递失败也会记为本轮运行失败",
                            )}
                          </div>
                        </div>
                        <Switch
                          checked={form.best_effort}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              best_effort: checked,
                            }))
                          }
                        />
                      </div>
                      <div className="mt-4 rounded-[18px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs leading-5 text-slate-500">
                        {deliveryChannelDescription(t, form.delivery_channel)}
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            )}

            {error ? (
              <div className="mt-5 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {error}
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-200/70 bg-white/92 px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("settings.automation.jobDialog.footer.cancel", "取消")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || isLegacyBrowserJob}
            >
              {saving
                ? t("settings.automation.jobDialog.footer.saving", "保存中...")
                : isLegacyBrowserJob
                  ? t(
                      "settings.automation.jobDialog.footer.legacyDisabled",
                      "该类型不可保存",
                    )
                  : mode === "create"
                    ? t(
                        "settings.automation.jobDialog.footer.create",
                        "创建持续流程",
                      )
                    : t(
                        "settings.automation.jobDialog.footer.save",
                        "保存修改",
                      )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
