import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ListChecks,
  MessageSquare,
  RefreshCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  WorkspaceArticleWorkflowRun,
  WorkspaceArticleWorkflowStep,
} from "./workspaceArticleWorkspaceWorkflowFacts";

type WorkspaceArticleWorkflowDetailTranslate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface WorkspaceArticleWorkflowDetailPanelProps {
  loading?: boolean;
  workflowRuns: readonly WorkspaceArticleWorkflowRun[];
  translate: WorkspaceArticleWorkflowDetailTranslate;
}

export function WorkspaceArticleWorkflowDetailPanel({
  loading = false,
  workflowRuns,
  translate,
}: WorkspaceArticleWorkflowDetailPanelProps) {
  const run = workflowRuns[0] ?? null;
  if (!run && !loading) {
    return null;
  }

  const workflowLabel =
    run?.workflowTitle ?? run?.workflowKey ?? translate("workspace.articleEditor.workflow.fallback");
  const steps = run?.steps ?? [];

  return (
    <section
      className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
      data-testid="workspace-article-editor-workflow-detail"
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
          <ListChecks className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[color:var(--lime-text-strong)]">
            {translate("workspace.articleEditor.workflow.title")}
          </div>
          <div className="mt-0.5 text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {loading
              ? translate("workspace.articleEditor.workflow.loading")
              : translate("workspace.articleEditor.workflow.detail", {
                  count: steps.length,
                  workflow: workflowLabel,
                })}
          </div>
        </div>
      </div>
      {run ? (
        <div className="mt-3 grid gap-2">
          {steps.map((step) => (
            <WorkflowStepRow
              key={`${run.workflowRunId}:${step.id}`}
              step={step}
              translate={translate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function WorkflowStepRow({
  step,
  translate,
}: {
  step: WorkspaceArticleWorkflowStep;
  translate: WorkspaceArticleWorkflowDetailTranslate;
}) {
  const status = normalizeStatus(step.status);
  const failureText = readRecordString(step.failure, [
    "message",
    "errorMessage",
    "reason",
    "reasonCode",
  ]);
  const retryText = step.retry
    ? readRecordString(step.retry, [
        "rescheduledTurnId",
        "rescheduled_turn_id",
        "sourceTurnId",
        "source_turn_id",
      ]) ?? translate("workspace.articleEditor.workflow.retryLinked")
    : null;
  const waitingText =
    step.requestId || step.agentActionType
      ? step.agentActionType ?? step.requestId
      : null;

  return (
    <div
      className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-3 py-2"
      data-testid="workspace-article-editor-workflow-step"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-[color:var(--lime-text-strong)]">
            {step.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[color:var(--lime-text-muted)]">
            <StatusBadge status={status} translate={translate} />
            {step.attempt ? (
              <span data-testid="workspace-article-editor-workflow-attempt">
                {translate("workspace.articleEditor.workflow.attempt", {
                  count: step.attempt,
                })}
              </span>
            ) : null}
          </div>
        </div>
        {getStatusIcon(status)}
      </div>
      {failureText ? (
        <WorkflowStepNote
          icon={<AlertCircle className="h-3 w-3" />}
          testId="workspace-article-editor-workflow-failure"
          text={translate("workspace.articleEditor.workflow.failure", {
            message: failureText,
          })}
        />
      ) : null}
      {retryText ? (
        <WorkflowStepNote
          icon={<RefreshCcw className="h-3 w-3" />}
          testId="workspace-article-editor-workflow-retry"
          text={translate("workspace.articleEditor.workflow.retry", {
            value: retryText,
          })}
        />
      ) : null}
      {waitingText ? (
        <WorkflowStepNote
          icon={<MessageSquare className="h-3 w-3" />}
          testId="workspace-article-editor-workflow-action"
          text={translate("workspace.articleEditor.workflow.waitingAction", {
            value: waitingText,
          })}
        />
      ) : null}
    </div>
  );
}

function WorkflowStepNote({
  icon,
  testId,
  text,
}: {
  icon: ReactNode;
  testId: string;
  text: string;
}) {
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-4 text-[color:var(--lime-text-muted)]"
      data-testid={testId}
    >
      {icon}
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

function StatusBadge({
  status,
  translate,
}: {
  status: string;
  translate: WorkspaceArticleWorkflowDetailTranslate;
}) {
  return (
    <span className="inline-flex rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-1.5 py-0.5">
      {translate(`workspace.articleEditor.workflow.status.${status || "unknown"}`)}
    </span>
  );
}

function getStatusIcon(status: string) {
  if (status === "completed" || status === "success") {
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />;
  }
  if (status === "failed" || status === "error") {
    return <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-rose-600" />;
  }
  return <Clock3 className="mt-0.5 h-3.5 w-3.5 text-sky-600" />;
}

function normalizeStatus(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "unknown";
}

function readRecordString(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}
