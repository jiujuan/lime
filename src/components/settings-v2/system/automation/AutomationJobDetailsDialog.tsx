import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AutomationJobRecord,
  AutomationPayload,
} from "@/lib/api/automation";
import type { AgentRun } from "@/lib/api/executionRun";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/i18n/format";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type AutomationServiceSkillContext } from "./serviceSkillContext";
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

type SettingsTranslate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

function detailsText(
  t: SettingsTranslate,
  key: string,
  values: Record<string, string | number | boolean> = {},
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

function buildDetailsPresentationCopy(
  t: SettingsTranslate,
): AutomationPresentationCopy {
  return {
    ...defaultAutomationPresentationCopy,
    legacyBrowserAutomationNotice: detailsText(
      t,
      "settings.automation.details.legacy.message",
    ),
    legacyBrowserAutomationStatus: detailsText(
      t,
      "settings.automation.details.status.offline",
    ),
    scheduleHours: (count) =>
      detailsText(t, "settings.automation.details.schedule.hours", { count }),
    scheduleMinutes: (count) =>
      detailsText(t, "settings.automation.details.schedule.minutes", { count }),
    scheduleSeconds: (count) =>
      detailsText(t, "settings.automation.details.schedule.seconds", { count }),
    scheduleCron: (expr) =>
      detailsText(t, "settings.automation.details.schedule.cron", { expr }),
    scheduleAt: (time) =>
      detailsText(t, "settings.automation.details.schedule.at", { time }),
    payloadBrowserSession: detailsText(
      t,
      "settings.automation.details.payload.browserSession",
    ),
    payloadAgentTurn: detailsText(
      t,
      "settings.automation.details.payload.agentTurn",
    ),
    legacyPayloadProfile: (profile) =>
      detailsText(t, "settings.automation.details.legacy.payload.profile", {
        profile,
      }),
    legacyPayloadEnvironment: (environment) =>
      detailsText(t, "settings.automation.details.legacy.payload.environment", {
        environment,
      }),
    legacyPayloadUrl: (url) =>
      detailsText(t, "settings.automation.details.legacy.payload.url", { url }),
    legacyPayloadTargetId: (targetId) =>
      detailsText(t, "settings.automation.details.legacy.payload.targetId", {
        targetId,
      }),
    legacyPayloadWindow: (status) =>
      detailsText(t, "settings.automation.details.legacy.payload.window", {
        status,
      }),
    legacyPayloadWindowOpen: detailsText(
      t,
      "settings.automation.details.legacy.payload.windowOpen",
    ),
    legacyPayloadWindowClosed: detailsText(
      t,
      "settings.automation.details.legacy.payload.windowClosed",
    ),
    legacyPayloadStreamMode: (streamMode) =>
      detailsText(t, "settings.automation.details.legacy.payload.streamMode", {
        streamMode,
      }),
    statusQueued: detailsText(t, "settings.automation.details.status.queued"),
    statusSuccess: detailsText(t, "settings.automation.details.status.success"),
    statusRunning: detailsText(t, "settings.automation.details.status.running"),
    statusWaitingForHuman: detailsText(
      t,
      "settings.automation.details.status.waitingForHuman",
    ),
    statusHumanControlling: detailsText(
      t,
      "settings.automation.details.status.humanControlling",
    ),
    statusAgentResuming: detailsText(
      t,
      "settings.automation.details.status.agentResuming",
    ),
    statusError: detailsText(t, "settings.automation.details.status.error"),
    statusTimeout: detailsText(t, "settings.automation.details.status.timeout"),
    statusPending: detailsText(t, "settings.automation.details.status.pending"),
    deliveryModeAnnounce: detailsText(
      t,
      "settings.automation.details.delivery.mode.announce",
    ),
    deliveryModeNone: detailsText(
      t,
      "settings.automation.details.delivery.mode.none",
    ),
    deliveryChannelLocalFile: detailsText(
      t,
      "settings.automation.details.delivery.channel.localFile",
    ),
    outputSchemaJson: detailsText(
      t,
      "settings.automation.details.delivery.schema.json",
    ),
    outputSchemaTable: detailsText(
      t,
      "settings.automation.details.delivery.schema.table",
    ),
    outputSchemaCsv: detailsText(
      t,
      "settings.automation.details.delivery.schema.csv",
    ),
    outputSchemaLinks: detailsText(
      t,
      "settings.automation.details.delivery.schema.links",
    ),
    outputSchemaText: detailsText(
      t,
      "settings.automation.details.delivery.schema.text",
    ),
    outputFormatJson: detailsText(
      t,
      "settings.automation.details.delivery.format.json",
    ),
    outputFormatText: detailsText(
      t,
      "settings.automation.details.delivery.format.text",
    ),
    serviceSkillTaskLine: (title) =>
      detailsText(t, "settings.automation.details.serviceSkill.taskLine", {
        title,
      }),
    serviceSkillMoreItems: (count) =>
      detailsText(t, "settings.automation.details.serviceSkill.moreItems", {
        count,
      }),
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
      return detailsText(t, "settings.automation.details.status.queued");
    case "success":
      return detailsText(t, "settings.automation.details.status.success");
    case "running":
      return detailsText(t, "settings.automation.details.status.running");
    case "waiting_for_human":
      return detailsText(
        t,
        "settings.automation.details.status.waitingForHuman",
      );
    case "human_controlling":
      return detailsText(
        t,
        "settings.automation.details.status.humanControlling",
      );
    case "agent_resuming":
      return detailsText(t, "settings.automation.details.status.agentResuming");
    case "error":
      return detailsText(t, "settings.automation.details.status.error");
    case "timeout":
      return detailsText(t, "settings.automation.details.status.timeout");
    default:
      return (
        status || detailsText(t, "settings.automation.details.status.pending")
      );
  }
}

function detailsPayloadKindLabel(
  t: SettingsTranslate,
  kind: AutomationPayload["kind"],
): string {
  return kind === "browser_session"
    ? detailsText(t, "settings.automation.details.payload.browserSession")
    : detailsText(t, "settings.automation.details.payload.agentTurn");
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
      ),
      current: detailsText(t, "settings.automation.details.accessMode.current"),
      fullAccess: detailsText(
        t,
        "settings.automation.details.accessMode.fullAccess",
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
      return detailsText(t, "settings.automation.details.schedule.hours", {
        count: secs / 3600,
      });
    }
    if (secs % 60 === 0) {
      return detailsText(t, "settings.automation.details.schedule.minutes", {
        count: secs / 60,
      });
    }
    return detailsText(t, "settings.automation.details.schedule.seconds", {
      count: secs,
    });
  }
  if (job.schedule.kind === "cron") {
    return detailsText(t, "settings.automation.details.schedule.cron", {
      expr: job.schedule.expr,
    });
  }
  return detailsText(t, "settings.automation.details.schedule.at", {
    time: formatDetailsTime(job.schedule.at, locale),
  });
}

function detailsDeliveryModeLabel(
  t: SettingsTranslate,
  job: AutomationJobRecord,
): string {
  return job.delivery.mode === "announce"
    ? detailsText(t, "settings.automation.details.delivery.mode.announce")
    : detailsText(t, "settings.automation.details.delivery.mode.none");
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
      );
    case "telegram":
      return detailsText(
        t,
        "settings.automation.details.delivery.channel.telegram",
      );
    case "local_file":
      return detailsText(
        t,
        "settings.automation.details.delivery.channel.localFile",
      );
    case "google_sheets":
      return detailsText(
        t,
        "settings.automation.details.delivery.channel.googleSheets",
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
      return detailsText(t, "settings.automation.details.delivery.schema.json");
    case "table":
      return detailsText(
        t,
        "settings.automation.details.delivery.schema.table",
      );
    case "csv":
      return detailsText(t, "settings.automation.details.delivery.schema.csv");
    case "links":
      return detailsText(
        t,
        "settings.automation.details.delivery.schema.links",
      );
    case "text":
    default:
      return detailsText(t, "settings.automation.details.delivery.schema.text");
  }
}

function detailsOutputFormatLabel(
  t: SettingsTranslate,
  format?: string | null,
): string {
  return format === "json"
    ? detailsText(t, "settings.automation.details.delivery.format.json")
    : detailsText(t, "settings.automation.details.delivery.format.text");
}

function detailsPayloadDescription(
  t: SettingsTranslate,
  payload: AutomationPayload,
): string {
  if (payload.kind === "agent_turn") {
    return payload.prompt;
  }

  const lines = [
    detailsText(t, "settings.automation.details.legacy.message"),
    detailsText(t, "settings.automation.details.legacy.payload.profile", {
      profile: payload.profile_key ?? payload.profile_id,
    }),
  ];
  if (payload.environment_preset_id) {
    lines.push(
      detailsText(t, "settings.automation.details.legacy.payload.environment", {
        environment: payload.environment_preset_id,
      }),
    );
  }
  if (payload.url) {
    lines.push(
      detailsText(t, "settings.automation.details.legacy.payload.url", {
        url: payload.url,
      }),
    );
  }
  if (payload.target_id) {
    lines.push(
      detailsText(t, "settings.automation.details.legacy.payload.targetId", {
        targetId: payload.target_id,
      }),
    );
  }
  lines.push(
    detailsText(t, "settings.automation.details.legacy.payload.window", {
      status: payload.open_window
        ? detailsText(
            t,
            "settings.automation.details.legacy.payload.windowOpen",
          )
        : detailsText(
            t,
            "settings.automation.details.legacy.payload.windowClosed",
          ),
    }),
  );
  lines.push(
    detailsText(t, "settings.automation.details.legacy.payload.streamMode", {
      streamMode: payload.stream_mode,
    }),
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
  retiredSceneAppMessage?: string | null;
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
  retiredSceneAppMessage = null,
  onRefreshHistory,
}: AutomationJobDetailsDialogProps) {
  const { i18n, t: rawT } = useTranslation("settings");
  const t = rawT as SettingsTranslate;
  const presentationCopy = buildDetailsPresentationCopy(t);
  const serviceSkillExecutionCompatLabel = detailsText(
    t,
    "settings.automation.tasks.list.badge.serviceSkillLegacyCompat",
  );
  const serviceSkillExecutionCompatNote = detailsText(
    t,
    "settings.automation.details.serviceSkill.executionCompatNote",
  );
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
                    {detailsText(t, "settings.automation.details.title")}
                  </DialogTitle>
                  <WorkbenchInfoTip
                    ariaLabel={detailsText(
                      t,
                      "settings.automation.details.tipAria",
                    )}
                    content={detailsText(t, "settings.automation.details.tip")}
                    tone="mint"
                  />
                </div>
                <DialogDescription className="text-sm text-slate-500">
                  {detailsText(t, "settings.automation.details.description")}
                </DialogDescription>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {detailsText(t, "settings.automation.details.badge.job", {
                      name: job.name,
                    })}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {detailsText(
                      t,
                      "settings.automation.details.badge.workspace",
                      { workspace: workspaceName ?? job.workspace_id },
                    )}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {detailsText(
                      t,
                      "settings.automation.details.badge.schedule",
                      {
                        schedule: detailsScheduleLabel(t, job, i18n.language),
                      },
                    )}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
                    {detailsText(
                      t,
                      "settings.automation.details.badge.payload",
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
                        {
                          schedule: detailsScheduleLabel(t, job, i18n.language),
                        },
                      )}
                    </div>
                    <div>
                      {detailsText(
                        t,
                        "settings.automation.details.meta.nextRun",
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
                        )}
                      </div>
                      <div className="mt-2">
                        {detailsText(
                          t,
                          "settings.automation.details.legacy.message",
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
                          { title: serviceSkillContext.title },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.source",
                          { source: serviceSkillContext.sourceLabel },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.theme",
                          { theme: serviceSkillContext.theme || "-" },
                        )}
                      </div>
                      <div>
                        {detailsText(
                          t,
                          "settings.automation.details.serviceSkill.content",
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
                          )}
                        </div>
                        <div className="mt-1">
                          {serviceSkillContext.userInput}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {retiredSceneAppMessage ? (
                  <div className="rounded-[22px] border border-lime-200/80 bg-lime-50/70 px-4 py-4">
                    <div className="text-sm font-medium text-slate-900">
                      {detailsText(
                        t,
                        "settings.automation.details.sceneApp.retired.title",
                      )}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">
                      {retiredSceneAppMessage}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                  <div className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">
                        {detailsText(
                          t,
                          "settings.automation.details.delivery.contractTitle",
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
                          {
                            policy:
                              job.delivery.mode !== "announce"
                                ? detailsText(
                                    t,
                                    "settings.automation.details.delivery.policy.disabled",
                                  )
                                : job.delivery.best_effort
                                  ? detailsText(
                                      t,
                                      "settings.automation.details.delivery.policy.bestEffort",
                                    )
                                  : detailsText(
                                      t,
                                      "settings.automation.details.delivery.policy.strict",
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
                              )
                            : detailsText(
                                t,
                                "settings.automation.details.delivery.status.failed",
                              )
                          : detailsText(
                              t,
                              "settings.automation.details.delivery.status.empty",
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
                              { target: job.last_delivery.target || "-" },
                            )}
                          </div>
                          <div>
                            {detailsText(
                              t,
                              "settings.automation.details.delivery.last.contract",
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
                              { message: job.last_delivery.message },
                            )}
                          </div>
                        </div>
                        <div className="mt-3 whitespace-pre-wrap rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                          {job.last_delivery.output_preview ||
                            detailsText(
                              t,
                              "settings.automation.details.delivery.last.noPreview",
                            )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-sm leading-6">
                        {job.delivery.mode === "announce"
                          ? detailsText(
                              t,
                              "settings.automation.details.delivery.last.emptyAnnounce",
                            )
                          : detailsText(
                              t,
                              "settings.automation.details.delivery.last.emptyDisabled",
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
                    )}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap rounded-[14px] border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
                    {detailsPayloadDescription(t, job.payload)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">
                      {t("settings.automation.history.title")}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onRefreshHistory(job.id)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {t("settings.automation.history.action.refresh")}
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
                              })}
                            </span>
                            <span>
                              {t("settings.automation.history.meta.session", {
                                session: resolveRunSessionId(run) ?? "-",
                              })}
                            </span>
                            <span>
                              {t("settings.automation.history.meta.finished", {
                                time: formatDetailsTime(
                                  run.finished_at,
                                  i18n.language,
                                ),
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
                                    {serviceSkillExecutionCompatLabel}
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
                                      )
                                    : t(
                                        "settings.automation.history.delivery.failed",
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
                                {t("settings.automation.history.errorReason")}
                              </div>
                              <div className="mt-1">{run.error_message}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                      {t("settings.automation.history.empty")}
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
