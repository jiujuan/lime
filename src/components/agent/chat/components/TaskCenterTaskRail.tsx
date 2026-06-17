import React from "react";
import { Check, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfirmResponse } from "../types";
import { TaskCenterRunControlSurface } from "./TaskCenterRunControlSurface";
import type {
  GeneralWorkbenchTaskRailApprovalItem,
  GeneralWorkbenchTaskRailActivityItem,
  GeneralWorkbenchTaskRailItem,
  GeneralWorkbenchTaskRailContextItem,
  GeneralWorkbenchTaskRailPlanItem,
  GeneralWorkbenchTaskRailItemStatus,
  GeneralWorkbenchTaskRailProjection,
} from "./generalWorkbenchTaskRailViewModel";
import type { GeneralWorkbenchRunControlSurfaceProjection } from "./generalWorkbenchRunControlSurfaceViewModel";
import { agentText } from "./harnessPanelText";

interface TaskCenterTaskRailProps {
  projection: GeneralWorkbenchTaskRailProjection;
  runControlSurfaceProjection?: GeneralWorkbenchRunControlSurfaceProjection | null;
  onOpenOutput?: (path: string) => void | Promise<void>;
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
  importedRuntimeDetail?: {
    enabled: boolean;
    sessionId?: string | null;
  };
  t?: (key: string, options?: Record<string, unknown>) => unknown;
}

function translateTaskRailText(
  t: TaskCenterTaskRailProps["t"],
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  if (t) {
    return String(t(key, { defaultValue, ...options }));
  }
  return agentText(key, defaultValue, options);
}

function getStatusText(
  status: GeneralWorkbenchTaskRailItemStatus,
  t?: TaskCenterTaskRailProps["t"],
): string {
  switch (status) {
    case "running":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.status.running",
        "进行中",
      );
    case "failed":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.status.failed",
        "需处理",
      );
    case "completed":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.status.completed",
        "已完成",
      );
    case "pending":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.status.pending",
        "待处理",
      );
  }
}

function getStatusClassName(status: GeneralWorkbenchTaskRailItemStatus) {
  return cn(
    "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
    status === "running" && "border-sky-200 bg-sky-50 text-sky-700",
    status === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
    status === "completed" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "pending" &&
      "border-slate-200 bg-slate-50 text-slate-500",
  );
}

function getFileName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || path;
}

function getOutputTitle(item: GeneralWorkbenchTaskRailItem): string {
  if (item.artifactPath?.trim()) {
    return getFileName(item.artifactPath.trim());
  }
  if (item.kind === "artifact" && item.title.trim()) {
    return item.title.trim();
  }
  return item.title;
}

function TaskRailOutputRow({
  item,
  onOpenOutput,
  t,
}: {
  item: GeneralWorkbenchTaskRailItem;
  onOpenOutput?: TaskCenterTaskRailProps["onOpenOutput"];
  t?: TaskCenterTaskRailProps["t"];
}) {
  const shouldShowStatus = item.status === "running" || item.status === "failed";
  const outputTitle = getOutputTitle(item);
  const outputPath = item.artifactPath?.trim();
  const openOutput = outputPath && onOpenOutput ? onOpenOutput : null;
  const content = (
    <>
      <FileText className="h-3.5 w-3.5 shrink-0 text-[color:var(--lime-text-muted)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-[color:var(--lime-text-strong)]">
            {outputTitle}
          </div>
          {shouldShowStatus ? (
            <span className={getStatusClassName(item.status)}>
              {getStatusText(item.status, t)}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  if (openOutput && outputPath) {
    return (
      <button
        type="button"
        className="flex min-w-0 w-full items-center gap-2 rounded-xl py-1.5 text-left transition hover:bg-[color:var(--lime-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        data-testid="task-center-task-rail-item"
        data-kind={item.kind}
        data-status={item.status}
        title={translateTaskRailText(
          t,
          "generalWorkbench.taskRail.openOutputAria",
          "打开输出文件：{{title}}",
          { title: outputTitle },
        )}
        aria-label={translateTaskRailText(
          t,
          "generalWorkbench.taskRail.openOutputAria",
          "打开输出文件：{{title}}",
          { title: outputTitle },
        )}
        onClick={() => {
          void openOutput(outputPath);
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="flex min-w-0 items-center gap-2 py-1.5"
      data-testid="task-center-task-rail-item"
      data-kind={item.kind}
      data-status={item.status}
    >
      {content}
    </div>
  );
}

function TaskRailContextItem({
  item,
}: {
  item: GeneralWorkbenchTaskRailContextItem;
}) {
  const detailLabels = item.detailLabels?.filter(Boolean) ?? [];
  const hasDetails =
    detailLabels.length > 0 ||
    Boolean(item.detailOverflowLabel) ||
    Boolean(item.detailStatus);
  const statusClassName = cn(
    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4",
    item.detailStatus?.tone === "success" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    item.detailStatus?.tone === "warning" &&
      "border-amber-200 bg-amber-50 text-amber-700",
    (!item.detailStatus || item.detailStatus.tone === "muted") &&
      "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-muted)] text-[color:var(--lime-text-muted)]",
  );
  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <span
        className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-muted)] px-2 py-0.5 text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
        data-testid="task-center-task-rail-context-item"
        title={item.title || `${item.label} ${item.value}`}
      >
        <span className="shrink-0 text-[color:var(--lime-text-faint)]">
          {item.label}
        </span>
        <span className="min-w-0 truncate font-medium text-[color:var(--lime-text)]">
          {item.value}
        </span>
      </span>
      {hasDetails ? (
        <span
          className="flex max-w-full flex-wrap gap-1 pl-1"
          data-testid="task-center-task-rail-context-details"
        >
          {detailLabels.map((label) => (
            <span
              key={label}
              className="max-w-[108px] truncate rounded-md bg-[color:var(--lime-surface-muted)] px-1.5 py-0.5 text-[10px] leading-4 text-[color:var(--lime-text-muted)]"
              title={label}
            >
              {label}
            </span>
          ))}
          {item.detailOverflowLabel ? (
            <span className="rounded-md px-1.5 py-0.5 text-[10px] leading-4 text-[color:var(--lime-text-faint)]">
              {item.detailOverflowLabel}
            </span>
          ) : null}
          {item.detailStatus ? (
            <span className={statusClassName} title={item.detailStatus.title || undefined}>
              {item.detailStatus.label}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function TaskRailPlanItem({
  item,
  t,
}: {
  item: GeneralWorkbenchTaskRailPlanItem;
  t?: TaskCenterTaskRailProps["t"];
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid="task-center-task-rail-plan-item"
      data-status={item.status}
      title={item.title}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full border",
          item.status === "running" && "border-sky-400 bg-sky-400",
          item.status === "failed" && "border-rose-400 bg-rose-400",
          item.status === "completed" &&
            "border-emerald-400 bg-emerald-400",
          item.status === "pending" && "border-slate-300 bg-slate-100",
        )}
      />
      <span className="shrink-0 text-[10px] text-[color:var(--lime-text-faint)]">
        {item.meta}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[color:var(--lime-text)]">
        {item.title}
      </span>
      <span className={getStatusClassName(item.status)}>
        {getStatusText(item.status, t)}
      </span>
    </div>
  );
}

function TaskRailActivityItem({
  item,
  t,
}: {
  item: GeneralWorkbenchTaskRailActivityItem;
  t?: TaskCenterTaskRailProps["t"];
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid="task-center-task-rail-activity-item"
      data-kind={item.kind}
      data-status={item.status}
      title={item.title}
    >
      <span className={getStatusClassName(item.status)}>
        {getStatusText(item.status, t)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[color:var(--lime-text)]">
        {item.title}
      </span>
    </div>
  );
}

function getApprovalStatusText(
  status: GeneralWorkbenchTaskRailApprovalItem["status"],
  t?: TaskCenterTaskRailProps["t"],
): string {
  switch (status) {
    case "queued":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.approval.status.queued",
        "等待提交",
      );
    case "submitted":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.approval.status.submitted",
        "已提交",
      );
    case "approved":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.approval.status.approved",
        "已允许",
      );
    case "rejected":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.approval.status.rejected",
        "已拒绝",
      );
    case "answered":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.approval.status.answered",
        "已回答",
      );
    case "resolved":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.approval.status.resolved",
        "已处理",
      );
    case "pending":
    default:
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.approval.status.pending",
        "待确认",
      );
  }
}

function getApprovalStatusClassName(
  status: GeneralWorkbenchTaskRailApprovalItem["status"],
) {
  return cn(
    "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
    status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
    status === "queued" && "border-slate-200 bg-slate-50 text-slate-500",
    status === "submitted" && "border-sky-200 bg-sky-50 text-sky-700",
    (status === "approved" ||
      status === "answered" ||
      status === "resolved") &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "rejected" && "border-rose-200 bg-rose-50 text-rose-700",
  );
}

function TaskRailApprovalItem({
  item,
  onRespondToAction,
  t,
}: {
  item: GeneralWorkbenchTaskRailApprovalItem;
  onRespondToAction?: TaskCenterTaskRailProps["onRespondToAction"];
  t?: TaskCenterTaskRailProps["t"];
}) {
  const canRespond = item.canRespond && Boolean(onRespondToAction);
  const isResolved =
    item.status === "approved" ||
    item.status === "rejected" ||
    item.status === "answered" ||
    item.status === "resolved";
  return (
    <div
      className={cn(
        "rounded-xl border px-2.5 py-2",
        isResolved
          ? "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-muted)]"
          : "border-amber-200/80 bg-amber-50/70",
      )}
      data-testid="task-center-task-rail-approval-item"
      data-status={item.status}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className={getApprovalStatusClassName(item.status)}>
          {getApprovalStatusText(item.status, t)}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[11px] font-medium",
              isResolved
                ? "text-[color:var(--lime-text-strong)]"
                : "text-amber-950",
            )}
          >
            {item.title}
          </div>
          {item.detail ? (
            <div
              className={cn(
                "mt-0.5 truncate text-[10px]",
                isResolved
                  ? "text-[color:var(--lime-text-muted)]"
                  : "text-amber-700",
              )}
            >
              {item.detail}
            </div>
          ) : null}
        </div>
      </div>
      {canRespond ? (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-lg border border-slate-900 bg-slate-900 px-2 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={translateTaskRailText(
              t,
              "generalWorkbench.taskRail.approval.approveAria",
              "允许：{{title}}",
              { title: item.title },
            )}
            onClick={() => {
              void onRespondToAction?.({
                requestId: item.requestId,
                actionType: item.actionType,
                confirmed: true,
                response: "approved",
              });
            }}
          >
            <Check className="h-3 w-3" />
            {translateTaskRailText(
              t,
              "generalWorkbench.taskRail.approval.approve",
              "允许",
            )}
          </button>
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={translateTaskRailText(
              t,
              "generalWorkbench.taskRail.approval.rejectAria",
              "拒绝：{{title}}",
              { title: item.title },
            )}
            onClick={() => {
              void onRespondToAction?.({
                requestId: item.requestId,
                actionType: item.actionType,
                confirmed: false,
                response: "rejected",
              });
            }}
          >
            <X className="h-3 w-3" />
            {translateTaskRailText(
              t,
              "generalWorkbench.taskRail.approval.reject",
              "拒绝",
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TaskCenterTaskRail({
  projection,
  runControlSurfaceProjection,
  onOpenOutput,
  onRespondToAction,
  importedRuntimeDetail,
  t,
}: TaskCenterTaskRailProps) {
  const hasRunControlSurface = Boolean(runControlSurfaceProjection?.hasContent);
  const outputItems = projection.outputItems.slice(0, 4);
  const hasOutputs = outputItems.length > 0;
  const contextItems = projection.contextItems;
  const hasContext = contextItems.length > 0 && !hasRunControlSurface;
  const planItems = projection.planItems;
  const hasPlan = planItems.length > 0 && !hasRunControlSurface;
  const activityItems = projection.activityItems;
  const hasActivity = activityItems.length > 0 && !hasRunControlSurface;
  const approvalItems = projection.approvalItems;
  const hasApprovals = approvalItems.length > 0;
  const shouldShowProgress =
    projection.totalCount > 0 ||
    projection.activeStatus === "running" ||
    projection.activeStatus === "failed";

  if (
    !shouldShowProgress &&
    !hasRunControlSurface &&
    !hasOutputs &&
    !hasContext &&
    !hasPlan &&
    !hasActivity &&
    !hasApprovals
  ) {
    return null;
  }

  return (
    <div
      className="mt-4 border-t border-[color:var(--lime-surface-border)] pt-3"
      data-testid="task-center-task-rail"
    >
      {shouldShowProgress ? (
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-[color:var(--lime-text-muted)]">
                {translateTaskRailText(
                  t,
                  "generalWorkbench.taskRail.title",
                  "当前任务",
                )}
              </div>
              <div className="mt-1 truncate text-[12px] font-semibold text-[color:var(--lime-text-strong)]">
                {projection.activeTitle}
              </div>
            </div>
            <span className={getStatusClassName(projection.activeStatus)}>
              {getStatusText(projection.activeStatus, t)}
            </span>
          </div>
          {projection.totalCount > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                <span
                  className="block h-full rounded-full bg-sky-500/70"
                  style={{ width: `${projection.progressPercent}%` }}
                />
              </span>
              <span className="w-9 text-right text-[10px] text-[color:var(--lime-text-muted)]">
                {Math.round(projection.progressPercent)}%
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {runControlSurfaceProjection?.hasContent ? (
        <TaskCenterRunControlSurface
          projection={runControlSurfaceProjection}
          activityItems={projection.activityItems}
          outputItems={outputItems}
          onOpenOutput={onOpenOutput}
          importedRuntimeDetail={importedRuntimeDetail}
          t={t}
        />
      ) : null}

      {hasPlan ? (
        <div
          className="mt-2 space-y-1.5"
          data-testid="task-center-task-rail-plan"
        >
          {planItems.map((item) => (
            <TaskRailPlanItem key={item.id} item={item} t={t} />
          ))}
          {projection.planOverflowCount > 0 ? (
            <div
              className="text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
              data-testid="task-center-task-rail-plan-overflow"
            >
              {translateTaskRailText(
                t,
                "generalWorkbench.taskRail.planOverflow",
                "另有 {{count}} 步",
                { count: projection.planOverflowCount },
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasContext ? (
        <div
          className={cn(
            "flex flex-wrap gap-1.5",
            shouldShowProgress || hasPlan ? "mt-2" : "mt-0",
          )}
          data-testid="task-center-task-rail-context"
        >
          {contextItems.map((item) => (
            <TaskRailContextItem key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      {hasActivity ? (
        <div
          className="mt-3 border-t border-[color:var(--lime-surface-border)] pt-3"
          data-testid="task-center-task-rail-activity"
        >
          <div className="text-xs font-medium text-[color:var(--lime-text-muted)]">
            {translateTaskRailText(
              t,
              "generalWorkbench.taskRail.activityTitle",
              "执行",
            )}
          </div>
          <div className="mt-1.5 space-y-1.5">
            {activityItems.map((item) => (
              <TaskRailActivityItem key={item.id} item={item} t={t} />
            ))}
          </div>
          {projection.activityOverflowCount > 0 ? (
            <div
              className="mt-1 text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
              data-testid="task-center-task-rail-activity-overflow"
            >
              {translateTaskRailText(
                t,
                "generalWorkbench.taskRail.activityOverflow",
                "另有 {{count}} 项执行",
                { count: projection.activityOverflowCount },
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasApprovals ? (
        <div
          className="mt-3 border-t border-[color:var(--lime-surface-border)] pt-3"
          data-testid="task-center-task-rail-approvals"
        >
          <div className="text-xs font-medium text-[color:var(--lime-text-muted)]">
            {translateTaskRailText(
              t,
              "generalWorkbench.taskRail.approval.title",
              "确认",
            )}
          </div>
          <div className="mt-1.5 space-y-1.5">
            {approvalItems.map((item) => (
              <TaskRailApprovalItem
                key={item.id}
                item={item}
                onRespondToAction={onRespondToAction}
                t={t}
              />
            ))}
          </div>
          {projection.approvalOverflowCount > 0 ? (
            <div
              className="mt-1 text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
              data-testid="task-center-task-rail-approval-overflow"
            >
              {translateTaskRailText(
                t,
                "generalWorkbench.taskRail.approval.overflow",
                "另有 {{count}} 条确认",
                { count: projection.approvalOverflowCount },
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasOutputs && !hasRunControlSurface ? (
        <div
          className={cn(
            (shouldShowProgress ||
              hasPlan ||
              hasContext ||
              hasActivity ||
              hasApprovals) &&
              "mt-3 border-t border-[color:var(--lime-surface-border)] pt-3",
          )}
          data-testid="task-center-task-rail-outputs"
        >
          <div className="text-xs font-medium text-[color:var(--lime-text-muted)]">
            {translateTaskRailText(
              t,
              "generalWorkbench.taskRail.outputsTitle",
              "输出",
            )}
          </div>
          <div className="mt-1.5">
            {outputItems.map((item) => (
              <TaskRailOutputRow
                key={item.id}
                item={item}
                onOpenOutput={onOpenOutput}
                t={t}
              />
            ))}
          </div>
          {projection.outputOverflowCount > 0 ? (
            <div
              className="mt-1 text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
              data-testid="task-center-task-rail-output-overflow"
            >
              {translateTaskRailText(
                t,
                "generalWorkbench.taskRail.outputOverflow",
                "另有 {{count}} 个输出",
                { count: projection.outputOverflowCount },
              )}
            </div>
          ) : null}
        </div>
      ) : shouldShowProgress && !hasRunControlSurface ? (
        <div className="mt-2 text-[11px] leading-5 text-[color:var(--lime-text-muted)]">
          {projection.emptyText}
        </div>
      ) : null}
    </div>
  );
}
