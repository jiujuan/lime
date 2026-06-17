import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface AgentPlanBlockProps {
  content: string;
  isComplete?: boolean;
}

const COLLAPSED_PLAN_PREVIEW_MAX_CHARS = 420;

function shouldCollapsePlanByDefault(content: string): boolean {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }
  const lineCount = normalized.split(/\r?\n/).filter(Boolean).length;
  return lineCount > 6 || normalized.length > COLLAPSED_PLAN_PREVIEW_MAX_CHARS;
}

function downloadPlanMarkdown(content: string) {
  if (typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plan.md";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyPlanMarkdown(content: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }

  await navigator.clipboard.writeText(content);
  return true;
}

export const AgentPlanBlock: React.FC<AgentPlanBlockProps> = ({
  content,
  isComplete = true,
}) => {
  const { t } = useTranslation("agent");
  const normalizedContent = content.trim();
  const shouldCollapse = useMemo(
    () => shouldCollapsePlanByDefault(normalizedContent),
    [normalizedContent],
  );
  const [expanded, setExpanded] = useState(!shouldCollapse);
  const [copied, setCopied] = useState(false);
  const collapsed = shouldCollapse && !expanded;

  if (!normalizedContent) {
    return null;
  }

  const handleCopy = async () => {
    const copiedSuccessfully = await copyPlanMarkdown(normalizedContent);
    if (!copiedSuccessfully) {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section
      className="group relative my-3 w-full max-w-[760px] overflow-hidden rounded-md bg-slate-50 px-4 pb-4 pt-3 text-slate-950"
      data-testid="agent-plan-block"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-5 text-slate-950">
            {t("agentChat.agentPlanBlock.label")}
          </div>
          {!isComplete ? (
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("agentChat.agentPlanBlock.streaming")}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white/90 px-1.5 py-1 shadow-sm shadow-slate-950/5">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label={t("agentChat.agentPlanBlock.download")}
            title={t("agentChat.agentPlanBlock.download")}
            onClick={() => downloadPlanMarkdown(normalizedContent)}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label={t("agentChat.agentPlanBlock.copy")}
            title={
              copied
                ? t("agentChat.agentPlanBlock.copied")
                : t("agentChat.agentPlanBlock.copy")
            }
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("agentChat.agentPlanBlock.collapse")
                : t("agentChat.agentPlanBlock.expand")
            }
            title={
              expanded
                ? t("agentChat.agentPlanBlock.collapse")
                : t("agentChat.agentPlanBlock.expand")
            }
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <div
        className={cn(
          "relative text-[15px] leading-7 text-slate-900 transition-[max-height] duration-200",
          collapsed && "max-h-[330px] overflow-hidden",
        )}
      >
        <MarkdownRenderer content={normalizedContent} />
        {collapsed ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-slate-50/0 to-slate-50"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {collapsed ? (
        <div className="relative z-10 -mt-10 flex justify-center pt-12">
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm shadow-slate-950/20 transition hover:bg-slate-800"
            onClick={() => setExpanded(true)}
          >
            {t("agentChat.agentPlanBlock.expand")}
          </button>
        </div>
      ) : null}
    </section>
  );
};
