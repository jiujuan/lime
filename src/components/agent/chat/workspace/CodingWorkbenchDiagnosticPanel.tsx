import type { AgentUiDiagnosticView } from "@limecloud/agent-ui-contracts";
import { useTranslation } from "react-i18next";
import { CodingStatusBadge } from "./codingWorkbenchStatus";
import { statusLabelKey } from "./codingWorkbenchStatusModel";

interface CodingWorkbenchDiagnosticPanelProps {
  diagnostics: readonly AgentUiDiagnosticView[];
}

export function CodingWorkbenchDiagnosticPanel({
  diagnostics,
}: CodingWorkbenchDiagnosticPanelProps) {
  const { t } = useTranslation("agent");

  if (diagnostics.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="coding-workbench-diagnostics">
      <h3 className="text-xs font-semibold text-slate-500">
        {t("agentChat.canvasWorkbench.coding.outputs.diagnostics")}
      </h3>
      <div className="space-y-2">
        {diagnostics.map((diagnostic) => (
          <article
            key={diagnostic.id}
            data-testid="coding-workbench-diagnostic"
            data-diagnostic-id={diagnostic.id}
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{diagnostic.title}</div>
                {diagnostic.detail ? (
                  <div className="mt-1 text-xs text-rose-700">
                    {diagnostic.detail}
                  </div>
                ) : null}
              </div>
              <CodingStatusBadge
                status={diagnostic.status}
                label={t(statusLabelKey(diagnostic.status))}
              />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-md border border-rose-100 bg-white px-3 py-2">
                <div className="text-[11px] font-medium text-rose-950">
                  {t("agentChat.canvasWorkbench.coding.diagnostics.policy")}
                </div>
                <div className="mt-1 text-xs text-rose-700">
                  {t("agentChat.canvasWorkbench.coding.diagnostics.failClosed")}
                </div>
              </div>
              <div className="rounded-md border border-rose-100 bg-white px-3 py-2">
                <div className="text-[11px] font-medium text-rose-950">
                  {t("agentChat.canvasWorkbench.coding.diagnostics.evidence")}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-rose-700">
                  {diagnostic.sourceEventId}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
