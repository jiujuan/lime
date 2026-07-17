import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConversationImportJob } from "@/lib/api/conversationImport";
import {
  resolveImportJobPercent,
  resolveImportJobPhaseLabel,
} from "./conversationImportDialogViewModel";

interface AppSidebarConversationImportProgressProps {
  job: ConversationImportJob;
  currentThread: number;
  totalThreads: number;
}

export function AppSidebarConversationImportProgress({
  job,
  currentThread,
  totalThreads,
}: AppSidebarConversationImportProgressProps) {
  const { t } = useTranslation("navigation");
  const percent = resolveImportJobPercent(job);
  const phase = resolveImportJobPhaseLabel(job.progress.phase, t);

  return (
    <div
      className="w-full border-b border-slate-200 px-5 py-3"
      data-testid="app-sidebar-conversation-import-progress"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-slate-700">
          {job.status === "queued" || job.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-emerald-700" />
          ) : null}
          <span className="truncate">{phase}</span>
        </span>
        <span className="flex-shrink-0 tabular-nums text-slate-500">
          {t("navigation.sidebar.importDialog.progress.thread", {
            current: currentThread,
            total: totalThreads,
            percent,
            defaultValue: "{{current}}/{{total}} · {{percent}}%",
          })}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
