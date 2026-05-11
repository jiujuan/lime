import { useMemo } from "react";
import type { AgentUiProjectionEvent } from "../projection/agentUiEventProjection";
import {
  buildAgentUiTeamWorkbenchViewModel,
  type AgentUiTeamWorkbenchViewItem,
} from "../projection/agentUiTeamWorkbenchViewModel";
import { cn } from "@/lib/utils";

interface AgentUiTeamWorkbenchSurfaceViewProps {
  events: AgentUiProjectionEvent[];
  latestLimit?: number;
  className?: string;
  onAction?: (item: AgentUiTeamWorkbenchViewItem) => void;
}

function renderItemAction(
  item: AgentUiTeamWorkbenchViewItem,
  onAction?: (item: AgentUiTeamWorkbenchViewItem) => void,
) {
  if (!item.action) {
    return null;
  }

  const className =
    "rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700";
  const label = `${item.action.label} · 目标 ${item.action.targetId}`;

  if (!onAction) {
    return <span className={className}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={cn(
        className,
        "transition hover:border-sky-300 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
      )}
      aria-label={`定位工作台操作：${label}`}
      data-agentui-action-target={item.action.targetId}
      onClick={() => onAction(item)}
    >
      {label}
    </button>
  );
}

export function AgentUiTeamWorkbenchSurfaceView({
  events,
  latestLimit = 2,
  className,
  onAction,
}: AgentUiTeamWorkbenchSurfaceViewProps) {
  const model = useMemo(
    () => buildAgentUiTeamWorkbenchViewModel(events, { latestLimit }),
    [events, latestLimit],
  );

  if (model.total === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-900">
            工作台操作视图
          </div>
          <div className="mt-1 text-[10px] leading-4 text-slate-500">
            按 Agent UI v0.6 工作区展示可操作目标，避免在组件内重新推断队友状态。
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
            {model.total} 项
          </span>
          {model.attentionCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              注意 {model.attentionCount}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 xl:grid-cols-2">
        {model.sections.map((section) => (
          <section
            key={`agentui-team-workbench-section-${section.surface}`}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {section.label}
                </div>
                <div className="mt-1 text-[10px] leading-4 text-slate-500">
                  {section.description}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                  {section.total}
                </span>
                {section.attentionCount > 0 ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                    注意 {section.attentionCount}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-2 space-y-1.5">
              {section.latestItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border px-2 py-1.5",
                    item.attention
                      ? "border-amber-200 bg-amber-50/70"
                      : "border-slate-200 bg-slate-50",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="font-semibold text-slate-800">
                      {item.title}
                    </span>
                    <span className="text-slate-500">{item.phaseLabel}</span>
                    {renderItemAction(item, onAction)}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-500">
                    {item.subtitle}
                  </div>
                  {item.auxiliaryDetail ? (
                    <div className="mt-0.5 truncate text-[10px] text-slate-400">
                      {item.auxiliaryDetail}
                    </div>
                  ) : null}
                  {item.chips.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.chips.slice(0, 5).map((chip) => (
                        <span
                          key={`${item.id}-${chip}`}
                          className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
