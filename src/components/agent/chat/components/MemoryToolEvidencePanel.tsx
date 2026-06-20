import { BookOpenCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MemoryToolEvidence } from "../utils/memoryToolEvidence";

interface MemoryToolEvidencePanelProps {
  evidence: MemoryToolEvidence;
}

export function MemoryToolEvidencePanel({
  evidence,
}: MemoryToolEvidencePanelProps) {
  const { t } = useTranslation("agent");

  return (
    <div
      className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2"
      data-testid="inline-tool-memory-evidence"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-emerald-900">
        <BookOpenCheck className="h-3.5 w-3.5 shrink-0" />
        <span>{t("agentChat.toolCall.memoryEvidence.title")}</span>
      </div>
      <div className="mt-1 text-xs leading-5 text-emerald-800">
        {evidence.summary}
      </div>
      {evidence.lines.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-5 text-emerald-700">
          {evidence.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
