import { useTranslation } from "react-i18next";
import type { A2UIFormData, A2UIResponse } from "@/lib/workspace/a2ui";
import { CHAT_A2UI_TASK_CARD_PRESET } from "@/lib/workspace/a2ui";
import { A2UITaskCard } from "../components/A2UITaskCard";
import {
  A2UISubmissionNotice,
  type A2UISubmissionNoticeData,
} from "./A2UISubmissionNotice";
import { useA2UISubmissionNotice } from "./useA2UISubmissionNotice";
import { useStickyA2UIForm } from "./useStickyA2UIForm";
import { readProgressiveA2UIProgressMeta } from "../utils/progressivePendingA2UI";

interface WorkspacePendingA2UIPanelProps {
  pendingA2UIForm?: A2UIResponse | null;
  onA2UISubmit?: (formData: A2UIFormData) => void;
  a2uiSubmissionNotice?: A2UISubmissionNoticeData | null;
  placement?: "dock" | "message";
}

export function WorkspacePendingA2UIPanel({
  pendingA2UIForm = null,
  onA2UISubmit,
  a2uiSubmissionNotice = null,
  placement = "dock",
}: WorkspacePendingA2UIPanelProps) {
  const { t } = useTranslation("workspace");
  const { visibleForm, isStale } = useStickyA2UIForm({
    form: pendingA2UIForm,
    clearImmediately: Boolean(a2uiSubmissionNotice),
  });
  const { visibleNotice, isVisible: isSubmissionNoticeVisible } =
    useA2UISubmissionNotice({
      notice: a2uiSubmissionNotice,
      enabled: Boolean(a2uiSubmissionNotice),
    });
  const shouldRender =
    Boolean(visibleNotice) || Boolean(visibleForm && onA2UISubmit);
  const toneClassName = visibleForm
    ? "border-slate-200 bg-white"
    : "border-emerald-200 bg-emerald-50";
  const shellClassName =
    placement === "message"
      ? `w-full max-w-[432px] space-y-2 rounded-[12px] border px-3 py-3 shadow-none ${toneClassName}`
      : `mx-4 mb-3 max-w-[432px] shrink-0 space-y-2 rounded-[12px] border px-3 py-3 shadow-none ${toneClassName}`;
  const scrollAreaClassName =
    placement === "message"
      ? "min-h-0 max-h-[min(72vh,760px)] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]"
      : "min-h-0 max-h-[min(44vh,420px)] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]";
  const progressMeta = readProgressiveA2UIProgressMeta(visibleForm);
  const statusLabel = isStale
    ? t("workspace.pendingA2UI.status.stale")
    : progressMeta
      ? t("workspace.pendingA2UI.status.progressStep", {
          currentStep: progressMeta.currentStep,
          totalSteps: progressMeta.totalSteps,
        })
      : undefined;
  const footerText = isStale
    ? t("workspace.pendingA2UI.footer.stale")
    : progressMeta && !progressMeta.isFinalStep
      ? t("workspace.pendingA2UI.footer.progressStep")
      : undefined;

  if (!shouldRender) {
    return null;
  }

  return (
    <section
      data-testid="workspace-pending-a2ui-panel"
      data-placement={placement}
      className={shellClassName}
    >
      {visibleNotice ? (
        <div className="rounded-[10px] border border-emerald-200 bg-white px-2 py-2">
          <A2UISubmissionNotice
            notice={visibleNotice}
            visible={isSubmissionNoticeVisible}
          />
        </div>
      ) : null}

      {visibleForm && onA2UISubmit ? (
        <div
          data-testid="workspace-pending-a2ui-scroll-area"
          className={scrollAreaClassName}
        >
          <A2UITaskCard
            response={visibleForm}
            onSubmit={onA2UISubmit}
            submitDisabled={isStale}
            preset={CHAT_A2UI_TASK_CARD_PRESET}
            statusLabel={statusLabel}
            footerText={footerText}
            compact={true}
            surface="embedded"
            className="m-0"
          />
        </div>
      ) : null}
    </section>
  );
}
