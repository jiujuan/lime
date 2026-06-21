import React from "react";
import { ChevronDown, FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { SkillInvocationContentInfo } from "./ToolCallDisplayViewModel";

interface ToolCallSkillContentButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export function ToolCallSkillContentButton({
  isExpanded,
  onToggle,
}: ToolCallSkillContentButtonProps) {
  const { t } = useTranslation("agent");

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        isExpanded
          ? "bg-emerald-50 text-emerald-800"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
      )}
      title={
        isExpanded
          ? t("agentChat.toolCall.skillContent.action.hide")
          : t("agentChat.toolCall.skillContent.action.view")
      }
      aria-label={
        isExpanded
          ? t("agentChat.toolCall.skillContent.action.hide")
          : t("agentChat.toolCall.skillContent.action.view")
      }
    >
      <FileText className="h-3.5 w-3.5" />
      <span>{t("agentChat.toolCall.skillContent.action.viewShort")}</span>
    </button>
  );
}

interface ToolCallSkillContentPanelProps {
  toolCallId: string;
  skillInvocationContentInfo: SkillInvocationContentInfo;
  sourceLabel: string;
  title: string;
  bodyExpanded: boolean;
  onToggleBodyExpanded: () => void;
  loading: boolean;
  error: string | null;
  content: string;
}

export function ToolCallSkillContentPanel({
  toolCallId,
  skillInvocationContentInfo,
  sourceLabel,
  title,
  bodyExpanded,
  onToggleBodyExpanded,
  loading,
  error,
  content,
}: ToolCallSkillContentPanelProps) {
  const { t } = useTranslation("agent");

  return (
    <div
      className="mb-2 ml-6 mt-1.5 rounded-[14px] border border-emerald-100 bg-emerald-50/60 p-3"
      data-testid="tool-call-skill-content-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-emerald-700">
            <span>{sourceLabel}</span>
            {skillInvocationContentInfo.displayName ? (
              <span>{skillInvocationContentInfo.displayName}</span>
            ) : null}
            {skillInvocationContentInfo.markdownContentBytes !== null ? (
              <span>
                {t("agentChat.toolCall.skillContent.meta.bytes", {
                  count: skillInvocationContentInfo.markdownContentBytes,
                })}
              </span>
            ) : null}
            {skillInvocationContentInfo.isSnapshotStandard === true ? (
              <span>{t("agentChat.toolCall.skillContent.meta.standard")}</span>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mt-3 flex w-full items-center justify-between rounded-[12px] border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-medium text-emerald-900 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
        aria-expanded={bodyExpanded}
        aria-controls={`tool-call-skill-content-body-${toolCallId}`}
        onClick={onToggleBodyExpanded}
      >
        <span>
          {bodyExpanded
            ? t("agentChat.toolCall.skillContent.action.collapseBody")
            : t("agentChat.toolCall.skillContent.action.expandBody")}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            bodyExpanded && "rotate-180",
          )}
        />
      </button>
      {bodyExpanded ? (
        <div
          id={`tool-call-skill-content-body-${toolCallId}`}
          className="mt-2 max-h-80 overflow-y-auto rounded-[12px] border border-slate-200 bg-white p-3"
          data-testid="tool-call-skill-content-body"
        >
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("agentChat.toolCall.skillContent.loading")}
            </div>
          ) : error ? (
            <div className="text-sm text-rose-700">{error}</div>
          ) : content.trim() ? (
            <MarkdownRenderer content={content} />
          ) : (
            <div className="text-sm text-slate-500">
              {t("agentChat.toolCall.skillContent.empty")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
