import { AlertTriangle, ArrowRight, FileWarning, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type {
  CodingWorkbenchRecoveryContext,
  CodingWorkbenchRecoverySignalKind,
  CodingWorkbenchRecoveryView,
} from "./codingWorkbenchRecovery";

function signalLabelKey(kind: CodingWorkbenchRecoverySignalKind) {
  if (kind === "command") {
    return "agentChat.canvasWorkbench.coding.recovery.failedCommand";
  }
  if (kind === "test") {
    return "agentChat.canvasWorkbench.coding.recovery.failedTest";
  }
  if (kind === "patch") {
    return "agentChat.canvasWorkbench.coding.recovery.failedPatch";
  }
  return "agentChat.canvasWorkbench.coding.recovery.diagnostic";
}

interface CodingWorkbenchRecoveryPanelProps {
  recoveryView: CodingWorkbenchRecoveryView;
  onSubmitRecoveryPrompt?: (
    prompt: string,
    context?: CodingWorkbenchRecoveryContext,
  ) => void | Promise<boolean> | boolean;
}

export function CodingWorkbenchRecoveryPanel({
  recoveryView,
  onSubmitRecoveryPrompt,
}: CodingWorkbenchRecoveryPanelProps) {
  const { t } = useTranslation("agent");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!onSubmitRecoveryPrompt || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitRecoveryPrompt(recoveryView.prompt, recoveryView.context);
    } catch {
      return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
      data-testid="coding-workbench-recovery"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{t("agentChat.canvasWorkbench.coding.recovery.title")}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-rose-700">
            {t("agentChat.canvasWorkbench.coding.recovery.description")}
          </p>
        </div>
        {onSubmitRecoveryPrompt ? (
          <Button
            type="button"
            size="sm"
            data-testid="coding-workbench-recovery-submit"
            disabled={submitting}
            className="border-slate-900 bg-slate-900 text-white shadow-sm shadow-slate-950/10 hover:bg-slate-800 hover:opacity-100"
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-1 h-4 w-4" />
            )}
            {t(
              submitting
                ? "agentChat.canvasWorkbench.coding.recovery.submitting"
                : "agentChat.canvasWorkbench.coding.recovery.action",
            )}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {recoveryView.signals.map((signal) => (
          <div
            key={`${signal.kind}:${signal.id}`}
            className="rounded-md border border-rose-100 bg-white px-3 py-2"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-950">
              <FileWarning className="h-3.5 w-3.5" />
              {t(signalLabelKey(signal.kind))}
            </div>
            <div className="mt-1 break-words text-xs font-medium text-rose-900">
              {signal.title}
            </div>
            {signal.summary ? (
              <div className="mt-1 break-words font-mono text-[11px] text-rose-700">
                {signal.summary}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {recoveryView.relatedFiles.length > 0 ? (
        <div className="mt-3 text-xs text-rose-700">
          <span className="font-medium text-rose-900">
            {t("agentChat.canvasWorkbench.coding.recovery.files")}:
          </span>{" "}
          {recoveryView.relatedFiles.slice(0, 4).join(", ")}
          {recoveryView.relatedFiles.length > 4
            ? `, +${recoveryView.relatedFiles.length - 4}`
            : ""}
        </div>
      ) : null}
    </section>
  );
}
