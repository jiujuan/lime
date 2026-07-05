import { useEffect, useMemo, useState } from "react";
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
import {
  buildAgentTurnAutomationPayload,
  normalizeAutomationThreadLineage,
  type AutomationThreadLineage,
} from "./automationThreadLineage";

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
  payload_kind: AutomationJobRecord["payload"]["kind"];
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
type SettingsTranslate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

function buildAutomationAccessModeCopy(
  t: SettingsTranslate,
): AutomationAccessModeCopy {
  return {
    readOnly: t("settings.automation.jobDialog.accessMode.readOnly"),
    current: t("settings.automation.jobDialog.accessMode.current"),
    fullAccess: t("settings.automation.jobDialog.accessMode.fullAccess"),
    policyReadOnly: t(
      "settings.automation.jobDialog.accessMode.policy.readOnly",
    ),
    policyCurrent: t("settings.automation.jobDialog.accessMode.policy.current"),
    policyFullAccess: t(
      "settings.automation.jobDialog.accessMode.policy.fullAccess",
    ),
  };
}

function legacyBrowserAutomationMessage(t: SettingsTranslate): string {
  return t("settings.automation.jobDialog.legacy.message");
}

function translateWithValues(
  t: SettingsTranslate,
  key: string,
  values: Record<string, string | number | boolean>,
): string {
  const translated = t(key, values);
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
        t("settings.automation.jobDialog.validation.intervalMin"),
      );
    }
    return { kind: "every", every_secs };
  }

  if (form.schedule_kind === "cron") {
    if (!form.cron_expr.trim()) {
      throw new Error(
        t("settings.automation.jobDialog.validation.cronRequired"),
      );
    }
    return {
      kind: "cron",
      expr: form.cron_expr.trim(),
      tz: form.cron_tz.trim() || null,
    };
  }

  if (!form.at_local) {
    throw new Error(t("settings.automation.jobDialog.validation.atRequired"));
  }

  const date = new Date(form.at_local);
  if (Number.isNaN(date.getTime())) {
    throw new Error(t("settings.automation.jobDialog.validation.atInvalid"));
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
      return t("settings.automation.jobDialog.schedule.hint.fixed");
    }
    if (secs % 3600 === 0) {
      return translateWithValues(
        t,
        "settings.automation.jobDialog.schedule.hint.hours",
        { count: secs / 3600 },
      );
    }
    if (secs % 60 === 0) {
      return translateWithValues(
        t,
        "settings.automation.jobDialog.schedule.hint.minutes",
        { count: secs / 60 },
      );
    }
    return translateWithValues(
      t,
      "settings.automation.jobDialog.schedule.hint.seconds",
      { count: secs },
    );
  }
  if (form.schedule_kind === "cron") {
    return t("settings.automation.jobDialog.schedule.hint.cron");
  }
  return form.at_local
    ? t("settings.automation.jobDialog.schedule.hint.atReady")
    : t("settings.automation.jobDialog.schedule.hint.atSelect");
}

function buildLegacyBrowserPayloadSummary(
  t: SettingsTranslate,
  payload: BrowserSessionAutomationPayload,
): Array<{ label: string; value: string }> {
  const notSet = t("settings.automation.jobDialog.legacy.summary.notSet");
  return [
    {
      label: t("settings.automation.jobDialog.legacy.summary.profile"),
      value: payload.profile_key ?? payload.profile_id,
    },
    {
      label: t("settings.automation.jobDialog.legacy.summary.url"),
      value:
        payload.url?.trim() ||
        t("settings.automation.jobDialog.legacy.summary.defaultUrl"),
    },
    {
      label: t("settings.automation.jobDialog.legacy.summary.environment"),
      value: payload.environment_preset_id?.trim() || notSet,
    },
    {
      label: t("settings.automation.jobDialog.legacy.summary.targetId"),
      value: payload.target_id?.trim() || notSet,
    },
    {
      label: t("settings.automation.jobDialog.legacy.summary.window"),
      value: payload.open_window
        ? t("settings.automation.jobDialog.legacy.summary.windowOpen")
        : t("settings.automation.jobDialog.legacy.summary.windowClosed"),
    },
    {
      label: t("settings.automation.jobDialog.legacy.summary.streamMode"),
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
      return t("settings.automation.jobDialog.schedule.kind.every");
    case "cron":
      return t("settings.automation.jobDialog.schedule.kind.cron");
    case "at":
    default:
      return t("settings.automation.jobDialog.schedule.kind.at");
  }
}

function accessModeLabel(
  t: SettingsTranslate,
  accessMode: AgentAccessMode,
): string {
  switch (accessMode) {
    case "read-only":
      return t("settings.automation.jobDialog.accessMode.readOnly");
    case "current":
      return t("settings.automation.jobDialog.accessMode.current");
    case "full-access":
    default:
      return t("settings.automation.jobDialog.accessMode.fullAccess");
  }
}

function accessModePolicySummary(
  t: SettingsTranslate,
  accessMode: AgentAccessMode,
): string {
  switch (accessMode) {
    case "read-only":
      return t("settings.automation.jobDialog.accessMode.policy.readOnly");
    case "current":
      return t("settings.automation.jobDialog.accessMode.policy.current");
    case "full-access":
    default:
      return t("settings.automation.jobDialog.accessMode.policy.fullAccess");
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
      );
    case "google_sheets":
      return t(
        "settings.automation.jobDialog.delivery.target.placeholder.googleSheets",
      );
    case "local_file":
      return t(
        "settings.automation.jobDialog.delivery.target.placeholder.localFile",
      );
    case "webhook":
    default:
      return t(
        "settings.automation.jobDialog.delivery.target.placeholder.webhook",
      );
  }
}

function deliveryChannelDescription(
  t: SettingsTranslate,
  channel: AutomationJobFormState["delivery_channel"],
): string {
  switch (channel) {
    case "webhook":
      return t("settings.automation.jobDialog.delivery.description.webhook");
    case "google_sheets":
      return t(
        "settings.automation.jobDialog.delivery.description.googleSheets",
      );
    case "local_file":
      return t("settings.automation.jobDialog.delivery.description.localFile");
    case "telegram":
    default:
      return t("settings.automation.jobDialog.delivery.description.telegram");
  }
}

export function AutomationJobDialog({
  open,
  mode,
  job,
  workspaces,
  initialValues,
  threadLineage,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  job?: AutomationJobRecord | null;
  workspaces: Project[];
  initialValues?: AutomationJobDialogInitialValues | null;
  threadLineage?: AutomationThreadLineage | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AutomationJobDialogSubmit) => Promise<void>;
}) {
  const { t: rawT } = useTranslation("settings");
  const t = rawT as SettingsTranslate;
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
      t("settings.automation.jobDialog.workspace.none"),
    [form.workspace_id, t, workspaces],
  );
  const dialogTitle =
    mode === "create"
      ? t("settings.automation.jobDialog.title.create")
      : t("settings.automation.jobDialog.title.edit");
  const dialogSummary = isLegacyBrowserJob
    ? t("settings.automation.jobDialog.description.legacy")
    : t("settings.automation.jobDialog.description.create");
  const dialogTipContent = isLegacyBrowserJob
    ? t("settings.automation.jobDialog.tip.legacy")
    : t("settings.automation.jobDialog.tip.create");
  const scheduleLabel = scheduleKindLabel(t, form.schedule_kind);
  const accessLabel = accessModeLabel(t, form.agent_access_mode);
  const accessModeOptions = useMemo(
    () =>
      buildAutomationAccessModeOptions(buildAutomationAccessModeCopy(t)) ?? [],
    [t],
  );
  const effectiveThreadLineage = useMemo(() => {
    if (mode === "edit" && job?.payload.kind === "agent_turn") {
      return (
        normalizeAutomationThreadLineage({
          sessionId: job.payload.session_id,
          threadId: job.payload.thread_id,
        }) ?? normalizeAutomationThreadLineage(threadLineage)
      );
    }
    return normalizeAutomationThreadLineage(threadLineage);
  }, [job, mode, threadLineage]);

  async function handleSubmit() {
    try {
      setError(null);

      if (isLegacyBrowserJob) {
        throw new Error(legacyBrowserAutomationMessage(t));
      }

      if (!form.name.trim()) {
        throw new Error(
          t("settings.automation.jobDialog.validation.nameRequired"),
        );
      }
      if (!form.workspace_id.trim()) {
        throw new Error(
          t("settings.automation.jobDialog.validation.workspaceRequired"),
        );
      }

      const schedule = buildSchedule(form, t);
      if (!form.prompt.trim()) {
        throw new Error(
          t("settings.automation.jobDialog.validation.promptRequired"),
        );
      }
      const runtimePolicies = createRuntimePoliciesFromAccessMode(
        form.agent_access_mode,
      );
      const payload = buildAgentTurnAutomationPayload({
        prompt: form.prompt,
        systemPrompt: form.system_prompt,
        webSearch: form.web_search,
        contentId: form.agent_content_id,
        approvalPolicy: runtimePolicies.approvalPolicy,
        sandboxPolicy: runtimePolicies.sandboxPolicy,
        requestMetadata: omitLegacyAutomationAccessModeMetadata(
          form.agent_request_metadata,
        ),
        lineage: effectiveThreadLineage,
        missingLineageMessage: t(
          "settings.automation.jobDialog.validation.threadLineageRequired",
        ),
      });
      const timeout_secs = form.timeout_secs.trim()
        ? Number(form.timeout_secs)
        : null;
      const max_retries = Number(form.max_retries);

      if (
        timeout_secs !== null &&
        (!Number.isFinite(timeout_secs) || timeout_secs <= 0)
      ) {
        throw new Error(
          t("settings.automation.jobDialog.validation.timeoutPositive"),
        );
      }
      if (!Number.isFinite(max_retries) || max_retries < 1) {
        throw new Error(
          t("settings.automation.jobDialog.validation.maxRetriesMin"),
        );
      }
      if (form.delivery_mode === "announce" && !form.delivery_target.trim()) {
        throw new Error(
          t("settings.automation.jobDialog.validation.deliveryTargetRequired"),
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
          : t("settings.automation.jobDialog.validation.saveFailed"),
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
                  ariaLabel={t("settings.automation.jobDialog.tipAria")}
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
                    { workspace: workspaceLabel },
                  )}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {translateWithValues(
                    t,
                    "settings.automation.jobDialog.badge.schedule",
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
                    {
                      method: isLegacyBrowserJob
                        ? t(
                            "settings.automation.jobDialog.payload.browserSession",
                          )
                        : t("settings.automation.jobDialog.payload.agentTurn"),
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
                    {
                      status:
                        form.delivery_mode === "announce"
                          ? t(
                              "settings.automation.jobDialog.delivery.status.enabled",
                            )
                          : t(
                              "settings.automation.jobDialog.delivery.status.disabled",
                            ),
                    },
                  )}
                </span>
                {!isLegacyBrowserJob ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                    {translateWithValues(
                      t,
                      "settings.automation.jobDialog.badge.permission",
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
                    {
                      status: isLegacyBrowserJob
                        ? t("settings.automation.jobDialog.status.offline")
                        : form.enabled
                          ? t("settings.automation.jobDialog.status.enabled")
                          : t("settings.automation.jobDialog.status.disabled"),
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
                  {t("settings.automation.jobDialog.field.name.label")}
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
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t("settings.automation.jobDialog.field.workspace.label")}
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
                {t("settings.automation.jobDialog.field.description.label")}
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
                )}
                className="min-h-[90px]"
              />
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-4">
              <div className="space-y-2">
                <Label>
                  {t("settings.automation.jobDialog.field.startMethod.label")}
                </Label>
                <Select value={form.payload_kind} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent_turn">
                      {t("settings.automation.jobDialog.payload.agentTurn")}
                    </SelectItem>
                    {isLegacyBrowserJob ? (
                      <SelectItem value="browser_session">
                        {t(
                          "settings.automation.jobDialog.payload.browserSession",
                        )}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {t("settings.automation.jobDialog.field.executionMode.label")}
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
                      )}
                    </SelectItem>
                    <SelectItem value="skill">
                      {t("settings.automation.jobDialog.executionMode.skill")}
                    </SelectItem>
                    <SelectItem value="log_only">
                      {t("settings.automation.jobDialog.executionMode.logOnly")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {t("settings.automation.jobDialog.field.maxRetries.label")}
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
                  {t("settings.automation.jobDialog.field.timeout.label")}
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
                        {t("settings.automation.jobDialog.schedule.kind.every")}
                      </SelectItem>
                      <SelectItem value="cron">
                        {t("settings.automation.jobDialog.schedule.kind.cron")}
                      </SelectItem>
                      <SelectItem value="at">
                        {t("settings.automation.jobDialog.schedule.kind.at")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.schedule_kind === "every" ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label>
                      {t("settings.automation.jobDialog.field.interval.label")}
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
                        {t("settings.automation.jobDialog.field.cron.label")}
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
                      {t("settings.automation.jobDialog.field.at.label")}
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
                    {t("settings.automation.jobDialog.legacy.title")}
                  </div>
                  <div className="mt-2">
                    {legacyBrowserAutomationMessage(t)}
                  </div>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-4">
                  <div className="text-sm font-medium text-slate-900">
                    {t("settings.automation.jobDialog.legacy.snapshotTitle")}
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
                    {t("settings.automation.jobDialog.legacy.snapshotNote")}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-2">
                  <Label htmlFor="automation-job-prompt">
                    {t("settings.automation.jobDialog.field.prompt.label")}
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
                    )}
                    className="min-h-[120px] sm:min-h-[140px]"
                  />
                </div>

                <div className="mt-5 space-y-2">
                  <Label htmlFor="automation-job-system-prompt">
                    {t(
                      "settings.automation.jobDialog.field.systemPrompt.label",
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
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {t(
                          "settings.automation.jobDialog.toggle.enabled.description",
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
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {t(
                          "settings.automation.jobDialog.toggle.webSearch.description",
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
                      {t("settings.automation.jobDialog.accessMode.label")}
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
                        {t("settings.automation.jobDialog.delivery.mode.label")}
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
                            )}
                          </SelectItem>
                          <SelectItem value="announce">
                            {t(
                              "settings.automation.jobDialog.delivery.mode.announce",
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
                                )}
                              </SelectItem>
                              <SelectItem value="google_sheets">
                                {t(
                                  "settings.automation.jobDialog.delivery.channel.googleSheets",
                                )}
                              </SelectItem>
                              <SelectItem value="local_file">
                                {t(
                                  "settings.automation.jobDialog.delivery.channel.localFile",
                                )}
                              </SelectItem>
                              <SelectItem value="telegram">
                                {t(
                                  "settings.automation.jobDialog.delivery.channel.telegram",
                                )}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>
                            {t(
                              "settings.automation.jobDialog.delivery.schema.label",
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
                                )}
                              </SelectItem>
                              <SelectItem value="json">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.json",
                                )}
                              </SelectItem>
                              <SelectItem value="table">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.table",
                                )}
                              </SelectItem>
                              <SelectItem value="csv">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.csv",
                                )}
                              </SelectItem>
                              <SelectItem value="links">
                                {t(
                                  "settings.automation.jobDialog.delivery.schema.links",
                                )}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>
                            {t(
                              "settings.automation.jobDialog.delivery.format.label",
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
                                )}
                              </SelectItem>
                              <SelectItem value="json">
                                {t(
                                  "settings.automation.jobDialog.delivery.format.json",
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
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t(
                              "settings.automation.jobDialog.delivery.bestEffort.description",
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
              {t("settings.automation.jobDialog.footer.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || isLegacyBrowserJob}
            >
              {saving
                ? t("settings.automation.jobDialog.footer.saving")
                : isLegacyBrowserJob
                  ? t("settings.automation.jobDialog.footer.legacyDisabled")
                  : mode === "create"
                    ? t("settings.automation.jobDialog.footer.create")
                    : t("settings.automation.jobDialog.footer.save")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
