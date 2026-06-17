import React from "react";
import {
  GitBranch,
  LayoutPanelTop,
  ListChecks,
  Network,
  PlayCircle,
  ShieldCheck,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneralWorkbenchRunControlSurfaceProjection } from "./generalWorkbenchRunControlSurfaceViewModel";
import type {
  GeneralWorkbenchTaskRailContextItem,
  GeneralWorkbenchTaskRailItem,
  GeneralWorkbenchTaskRailItemStatus,
  GeneralWorkbenchTaskRailPlanItem,
  GeneralWorkbenchTaskRailActivityItem,
} from "./generalWorkbenchTaskRailViewModel";
import {
  createFallbackWorkflowTranslate,
  translateTaskRailText,
} from "./generalWorkbenchTaskRailText";
import { ImportedRuntimeEventDetailPanel } from "./ImportedRuntimeEventDetailPanel";

type TaskRailTranslate = (key: string, options?: Record<string, unknown>) => unknown;

interface TaskCenterRunControlSurfaceProps {
  projection: GeneralWorkbenchRunControlSurfaceProjection;
  activityItems?: readonly GeneralWorkbenchTaskRailActivityItem[];
  outputItems?: readonly GeneralWorkbenchTaskRailItem[];
  onOpenOutput?: (path: string) => void | Promise<void>;
  importedRuntimeDetail?: {
    enabled: boolean;
    sessionId?: string | null;
  };
  t?: TaskRailTranslate;
}

const fallbackTaskRailTranslate = createFallbackWorkflowTranslate();

function taskRailText(
  t: TaskRailTranslate | undefined,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return translateTaskRailText(t ?? fallbackTaskRailTranslate, key, defaultValue, options);
}

function getStatusClassName(status: GeneralWorkbenchTaskRailItemStatus) {
  return cn(
    "inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
    status === "running" && "border-sky-200 bg-sky-50 text-sky-700",
    status === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
    status === "completed" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "pending" &&
      "border-slate-200 bg-slate-50 text-slate-500",
  );
}

function getStatusText(
  status: GeneralWorkbenchTaskRailItemStatus,
  t?: TaskRailTranslate,
): string {
  switch (status) {
    case "running":
      return translateTaskRailText(
        t ?? fallbackTaskRailTranslate,
        "generalWorkbench.taskRail.status.running",
        "进行中",
      );
    case "failed":
      return translateTaskRailText(
        t ?? fallbackTaskRailTranslate,
        "generalWorkbench.taskRail.status.failed",
        "需处理",
      );
    case "completed":
      return translateTaskRailText(
        t ?? fallbackTaskRailTranslate,
        "generalWorkbench.taskRail.status.completed",
        "已完成",
      );
    case "pending":
      return translateTaskRailText(
        t ?? fallbackTaskRailTranslate,
        "generalWorkbench.taskRail.status.pending",
        "待处理",
      );
  }
}

function getFileName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || path;
}

function getOutputTitle(item: GeneralWorkbenchTaskRailItem): string {
  const artifactPath = item.artifactPath?.trim();
  if (artifactPath) {
    return getFileName(artifactPath);
  }
  return item.title;
}

function SurfaceFactList({
  items,
  testId,
}: {
  items: readonly GeneralWorkbenchTaskRailContextItem[];
  testId: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1" data-testid={testId}>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 items-center justify-between gap-2 text-[11px] leading-5"
          data-testid="task-center-run-control-fact"
          data-fact-id={item.id}
          title={item.title || `${item.label} ${item.value}`}
        >
          <span className="shrink-0 text-[color:var(--lime-text-faint)]">
            {item.label}
          </span>
          <span className="min-w-0 truncate font-medium text-[color:var(--lime-text)]">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function SurfaceContextRow({
  item,
  testId,
}: {
  item: GeneralWorkbenchTaskRailContextItem | null;
  testId: string;
}) {
  if (!item) {
    return null;
  }

  const detailLabels = item.detailLabels?.filter(Boolean) ?? [];

  return (
    <div
      className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-muted)] px-2.5 py-2"
      data-testid={testId}
      title={item.title || `${item.label} ${item.value}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] leading-5">
        <span className="shrink-0 text-[color:var(--lime-text-faint)]">
          {item.label}
        </span>
        <span className="min-w-0 truncate font-medium text-[color:var(--lime-text)]">
          {item.value}
        </span>
      </div>
      {detailLabels.length > 0 ||
      item.detailOverflowLabel ||
      item.detailStatus ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {detailLabels.map((label) => (
            <span
              key={label}
              className="max-w-[108px] truncate rounded-md bg-white px-1.5 py-0.5 text-[10px] leading-4 text-[color:var(--lime-text-muted)]"
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
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4",
                item.detailStatus.tone === "success" &&
                  "border-emerald-200 bg-emerald-50 text-emerald-700",
                item.detailStatus.tone === "warning" &&
                  "border-amber-200 bg-amber-50 text-amber-700",
                item.detailStatus.tone === "muted" &&
                  "border-[color:var(--lime-surface-border)] bg-white text-[color:var(--lime-text-muted)]",
              )}
              title={item.detailStatus.title || undefined}
            >
              {item.detailStatus.label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SurfaceSection({
  title,
  testId,
  icon,
  visible = true,
  children,
}: {
  title: string;
  testId: string;
  icon: React.ReactNode;
  visible?: boolean;
  children: React.ReactNode;
}) {
  if (!visible) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2.5"
      data-testid={testId}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--lime-text-muted)]">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

function PlanList({
  items,
  overflowCount,
  t,
}: {
  items: readonly GeneralWorkbenchTaskRailPlanItem[];
  overflowCount: number;
  t?: TaskRailTranslate;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 items-center gap-2"
          data-testid="task-center-run-control-plan-item"
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
      ))}
      {overflowCount > 0 ? (
        <div
          className="text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
          data-testid="task-center-run-control-plan-overflow"
        >
          {taskRailText(
            t,
            "generalWorkbench.taskRail.planOverflow",
            "另有 {{count}} 步",
            { count: overflowCount },
          )}
        </div>
      ) : null}
    </div>
  );
}

function SurfaceActivityList({
  items,
  t,
}: {
  items: readonly GeneralWorkbenchTaskRailActivityItem[];
  t?: TaskRailTranslate;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 items-center gap-2"
          data-testid="task-center-task-rail-activity-item"
          data-kind={item.kind}
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
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[color:var(--lime-text)]">
            {item.title}
          </span>
          <span className={getStatusClassName(item.status)}>
            {getStatusText(item.status, t)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SurfaceOutputList({
  items,
  overflowCount,
  onOpenOutput,
  t,
}: {
  items: readonly GeneralWorkbenchTaskRailItem[];
  overflowCount: number;
  onOpenOutput?: (path: string) => void | Promise<void>;
  t?: TaskRailTranslate;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1">
      {items.map((item) => {
        const outputPath = item.artifactPath?.trim();
        const outputTitle = getOutputTitle(item);
        const openOutput = outputPath && onOpenOutput ? onOpenOutput : null;
        const content = (
          <>
            <LayoutPanelTop className="h-3.5 w-3.5 shrink-0 text-[color:var(--lime-text-muted)]" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[color:var(--lime-text)]">
              {outputTitle}
            </span>
            {item.status === "running" || item.status === "failed" ? (
              <span className={getStatusClassName(item.status)}>
                {getStatusText(item.status, t)}
              </span>
            ) : null}
          </>
        );

        if (openOutput && outputPath) {
          return (
            <button
              key={item.id}
              type="button"
              className="flex min-w-0 w-full items-center gap-2 rounded-lg py-1 text-left transition hover:bg-[color:var(--lime-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              data-testid="task-center-task-rail-item"
              data-kind={item.kind}
              data-status={item.status}
              title={taskRailText(
                t,
                "generalWorkbench.taskRail.openOutputAria",
                "打开输出文件：{{title}}",
                { title: outputTitle },
              )}
              aria-label={taskRailText(
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
            key={item.id}
            className="flex min-w-0 items-center gap-2 py-1"
            data-testid="task-center-task-rail-item"
            data-kind={item.kind}
            data-status={item.status}
            title={outputTitle}
          >
            {content}
          </div>
        );
      })}
      {overflowCount > 0 ? (
        <div
          className="text-[11px] leading-5 text-[color:var(--lime-text-muted)]"
          data-testid="task-center-task-rail-output-overflow"
        >
          {taskRailText(
            t,
            "generalWorkbench.taskRail.outputOverflow",
            "另有 {{count}} 个输出",
            { count: overflowCount },
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TaskCenterRunControlSurface({
  projection,
  activityItems = [],
  outputItems = [],
  onOpenOutput,
  importedRuntimeDetail,
  t,
}: TaskCenterRunControlSurfaceProps) {
  if (!projection.hasContent) {
    return null;
  }

  const runItems = [...projection.runItems, ...projection.controlItems];
  const summaryItems = [
    projection.activitySummary,
    projection.approvalSummary,
    projection.outputSummary,
    projection.splitLaneItem,
  ].filter(
    (item): item is GeneralWorkbenchTaskRailContextItem => Boolean(item),
  );
  const shouldShowSourceSection =
    Boolean(projection.sourceItem) || Boolean(importedRuntimeDetail?.enabled);

  return (
    <div
      className="mt-3 space-y-2"
      data-testid="task-center-run-control-surface"
    >
      <SurfaceSection
        title={taskRailText(
          t,
          "generalWorkbench.taskRail.surface.environmentTitle",
          "环境",
        )}
        testId="task-center-run-control-environment"
        icon={<GitBranch className="h-3.5 w-3.5" />}
        visible={projection.environmentItems.length > 0}
      >
        <SurfaceFactList
          items={projection.environmentItems}
          testId="task-center-run-control-environment-facts"
        />
      </SurfaceSection>

      <SurfaceSection
        title={taskRailText(
          t,
          "generalWorkbench.taskRail.surface.runTitle",
          "运行",
        )}
        testId="task-center-run-control-controls"
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
        visible={runItems.length > 0}
      >
        <SurfaceFactList
          items={runItems}
          testId="task-center-run-control-run-facts"
        />
      </SurfaceSection>

      <SurfaceSection
        title={taskRailText(
          t,
          "generalWorkbench.taskRail.surface.planTitle",
          "计划",
        )}
        testId="task-center-run-control-plan"
        icon={<ListChecks className="h-3.5 w-3.5" />}
        visible={projection.planItems.length > 0}
      >
        <PlanList
          items={projection.planItems}
          overflowCount={projection.planOverflowCount}
          t={t}
        />
      </SurfaceSection>

      <SurfaceSection
        title={taskRailText(
          t,
          "generalWorkbench.taskRail.surface.goalTitle",
          "目标",
        )}
        testId="task-center-run-control-goal"
        icon={<Target className="h-3.5 w-3.5" />}
        visible={Boolean(projection.goalItem)}
      >
        <SurfaceContextRow
          item={projection.goalItem}
          testId="task-center-run-control-goal-row"
        />
      </SurfaceSection>

      <SurfaceSection
        title={taskRailText(
          t,
          "generalWorkbench.taskRail.surface.provenanceTitle",
          "来源",
        )}
        testId="task-center-run-control-sources"
        icon={<Network className="h-3.5 w-3.5" />}
        visible={shouldShowSourceSection}
      >
        <SurfaceContextRow
          item={projection.sourceItem}
          testId="task-center-run-control-source-row"
        />
        <ImportedRuntimeEventDetailPanel
          enabled={Boolean(importedRuntimeDetail?.enabled)}
          sessionId={importedRuntimeDetail?.sessionId}
          t={t}
        />
      </SurfaceSection>

      <SurfaceSection
        title={taskRailText(
          t,
          "generalWorkbench.taskRail.surface.participantsTitle",
          "参与",
        )}
        testId="task-center-run-control-subagents"
        icon={<PlayCircle className="h-3.5 w-3.5" />}
        visible={Boolean(projection.participantItem)}
      >
        <SurfaceContextRow
          item={projection.participantItem}
          testId="task-center-run-control-subagents-row"
        />
      </SurfaceSection>

      <SurfaceSection
        title={taskRailText(
          t,
          "generalWorkbench.taskRail.surface.outputsTitle",
          "结果",
        )}
        testId="task-center-run-control-outputs"
        icon={<LayoutPanelTop className="h-3.5 w-3.5" />}
        visible={summaryItems.length > 0}
      >
        <SurfaceFactList
          items={summaryItems}
          testId="task-center-run-control-output-facts"
        />
        <SurfaceActivityList items={activityItems} t={t} />
        <SurfaceOutputList
          items={outputItems}
          overflowCount={projection.outputOverflowCount}
          onOpenOutput={onOpenOutput}
          t={t}
        />
      </SurfaceSection>
    </div>
  );
}
