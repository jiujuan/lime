import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AgentRuntimeEvidencePack } from "@/lib/api/agentRuntime/evidenceTypes";
import { exportAgentRuntimeEvidencePack } from "@/lib/api/agentRuntime/exportClient";
import { buildAgentUiEvidenceChangedEvent } from "../projection/agentUiEventProjection";
import { recordAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import { recordHarnessEvidencePack } from "./harnessEvidencePackStore";
import { agentText } from "./harnessPanelText";

export function useHarnessEvidencePackExport(currentSessionId: string | null) {
  const [evidencePack, setEvidencePack] =
    useState<AgentRuntimeEvidencePack | null>(null);
  const [evidenceExporting, setEvidenceExporting] = useState(false);
  const [evidenceExportError, setEvidenceExportError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setEvidencePack(null);
    setEvidenceExportError(null);
    setEvidenceExporting(false);
  }, [currentSessionId]);

  const handleExportEvidencePack = useCallback(async () => {
    if (!currentSessionId) {
      toast.error(
        agentText(
          "agentChat.harness.export.toast.noSession",
          "当前没有可导出的会话上下文",
        ),
      );
      return;
    }

    setEvidenceExporting(true);
    setEvidenceExportError(null);
    try {
      const pack = await exportAgentRuntimeEvidencePack(currentSessionId);
      setEvidencePack(pack);
      recordHarnessEvidencePack(pack);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: pack.pack_relative_root,
            sessionId: pack.session_id,
            threadId: pack.thread_id,
            kind: "evidence_pack",
            status: "ready",
            verdict: pack.known_gaps.length > 0 ? "gaps_present" : "complete",
            summaryPreview: agentText(
              "agentChat.harness.evidence.projection.summaryPreview",
              "已导出 {{count}} 个问题证据文件",
              { count: pack.artifacts.length },
            ),
            artifactPaths: pack.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: pack.item_count,
          },
          {
            timestamp: pack.exported_at,
            sessionId: pack.session_id,
            threadId: pack.thread_id,
          },
        ),
      ]);
      toast.success(
        agentText(
          "agentChat.harness.evidence.toast.exported",
          "已导出 {{count}} 个问题证据文件",
          { count: pack.artifacts.length },
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : agentText(
              "agentChat.harness.evidence.toast.exportFailed",
              "导出问题证据包失败",
            );
      setEvidenceExportError(message);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: `evidence-pack:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "evidence_pack",
            status: "failed",
            verdict: "export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      ]);
      toast.error(message);
    } finally {
      setEvidenceExporting(false);
    }
  }, [currentSessionId]);

  return {
    evidencePack,
    evidenceExporting,
    evidenceExportError,
    handleExportEvidencePack,
  };
}
