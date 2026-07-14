import type {
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidencePack,
} from "@/lib/api/agentRuntime/evidenceTypes";
import { HarnessEvidencePackCard } from "./HarnessEvidencePackCard";
import type { HandoffPreviewRequest } from "./HarnessHandoffExportTypes";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";

interface HarnessHandoffExportSectionProps {
  evidencePack: AgentRuntimeEvidencePack | null;
  evidenceExporting: boolean;
  evidenceExportError: string | null;
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  handleExportEvidencePack: () => void | Promise<void>;
  handleOpenPathValue: (path: string) => void | Promise<void>;
  openPreview: (request: HandoffPreviewRequest) => void | Promise<void>;
  openBrowserReplayPreview: (
    pack: AgentRuntimeEvidencePack,
    index: AgentRuntimeEvidenceBrowserActionIndex,
  ) => void;
}

export function HarnessHandoffExportSection({
  evidencePack,
  evidenceExporting,
  evidenceExportError,
  registerSectionRef,
  handleExportEvidencePack,
  handleOpenPathValue,
  openPreview,
  openBrowserReplayPreview,
}: HarnessHandoffExportSectionProps) {
  return (
    <Section
      sectionKey="handoff"
      title={agentText("agentChat.harness.evidence.title", "问题证据包")}
      badge={
        evidencePack
          ? agentText(
              "agentChat.harness.evidence.badge.exported",
              "已导出 {{count}} 个文件",
              { count: evidencePack.artifacts.length },
            )
          : agentText("agentChat.harness.evidence.badge.pending", "待导出")
      }
      registerRef={registerSectionRef}
    >
      <div className="space-y-3">
        <HarnessEvidencePackCard
          evidencePack={evidencePack}
          evidenceExporting={evidenceExporting}
          evidenceExportError={evidenceExportError}
          handleExportEvidencePack={handleExportEvidencePack}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
          openBrowserReplayPreview={openBrowserReplayPreview}
        />
      </div>
    </Section>
  );
}
