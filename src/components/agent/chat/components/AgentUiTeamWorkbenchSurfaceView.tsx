import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AgentUiProjectionEvent } from "../projection/agentUiEventProjection";
import {
  buildAgentUiTeamWorkbenchViewModel,
  type AgentUiTeamWorkbenchViewItem,
} from "../projection/agentUiTeamWorkbenchViewModel";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/lib/utils";

interface AgentUiTeamWorkbenchSurfaceViewProps {
  events: AgentUiProjectionEvent[];
  latestLimit?: number;
  className?: string;
  onAction?: (item: AgentUiTeamWorkbenchViewItem) => void;
}

function renderItemAction(
  item: AgentUiTeamWorkbenchViewItem,
  label: string,
  ariaLabel: string,
  onAction?: (item: AgentUiTeamWorkbenchViewItem) => void,
) {
  if (!item.action) {
    return null;
  }

  const className =
    "rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700";

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
      aria-label={ariaLabel}
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
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
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
            {t("agentChat.teamWorkbenchSurface.title")}
          </div>
          <div className="mt-1 text-[10px] leading-4 text-slate-500">
            {t("agentChat.teamWorkbenchSurface.description")}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
            {t("agentChat.teamWorkbenchSurface.totalBadge", {
              countLabel: formatNumber(model.total, { locale }),
            })}
          </span>
          {model.attentionCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {t("agentChat.teamWorkbenchSurface.attentionBadge", {
                countLabel: formatNumber(model.attentionCount, { locale }),
              })}
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
                  {formatNumber(section.total, { locale })}
                </span>
                {section.attentionCount > 0 ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                    {t("agentChat.teamWorkbenchSurface.attentionBadge", {
                      countLabel: formatNumber(section.attentionCount, {
                        locale,
                      }),
                    })}
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
                    {item.action
                      ? renderItemAction(
                          item,
                          t("agentChat.teamWorkbenchSurface.actionTarget", {
                            label: item.action.label,
                            targetId: item.action.targetId,
                          }),
                          t("agentChat.teamWorkbenchSurface.actionAria", {
                            label: t(
                              "agentChat.teamWorkbenchSurface.actionTarget",
                              {
                                label: item.action.label,
                                targetId: item.action.targetId,
                              },
                            ),
                          }),
                          onAction,
                        )
                      : null}
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
