import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
} from "@/lib/api/agentRuntime";
import { HarnessAnalysisHandoffCard } from "./HarnessAnalysisHandoffCard";
import { HarnessEvidencePackCard } from "./HarnessEvidencePackCard";
import { HarnessHandoffBundleCard } from "./HarnessHandoffBundleCard";
import { HarnessReplayCaseCard } from "./HarnessReplayCaseCard";
import { HarnessReviewDecisionCard } from "./HarnessReviewDecisionCard";
import type { HandoffPreviewRequest } from "./HarnessHandoffExportTypes";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";

interface HarnessHandoffExportSectionProps {
  currentSessionId: string;
  handoffBundle: AgentRuntimeHandoffBundle | null;
  handoffExporting: boolean;
  handoffExportError: string | null;
  evidencePack: AgentRuntimeEvidencePack | null;
  evidenceExporting: boolean;
  evidenceExportError: string | null;
  replayCase: AgentRuntimeReplayCase | null;
  replayExporting: boolean;
  replayExportError: string | null;
  analysisHandoff: AgentRuntimeAnalysisHandoff | null;
  analysisExporting: boolean;
  analysisExportError: string | null;
  reviewDecisionTemplate: AgentRuntimeReviewDecisionTemplate | null;
  reviewDecisionExporting: boolean;
  reviewDecisionSaving: boolean;
  reviewDecisionExportError: string | null;
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  handleExportHandoffBundle: () => void | Promise<void>;
  handleExportEvidencePack: () => void | Promise<void>;
  handleExportReplayCase: () => void | Promise<AgentRuntimeReplayCase | null>;
  handleCopyReplayPromotionCommand: () => void | Promise<void>;
  handleExportAnalysisHandoff: () => void | Promise<AgentRuntimeAnalysisHandoff | null>;
  handleCopyAnalysisPrompt: () => void | Promise<void>;
  handleExportReviewDecisionTemplate: () => void | Promise<AgentRuntimeReviewDecisionTemplate | null>;
  handleOpenReviewDecisionEditor: () => void | Promise<void>;
  handleOpenPathValue: (path: string) => void | Promise<void>;
  openPreview: (request: HandoffPreviewRequest) => void | Promise<void>;
  openBrowserReplayPreview: (
    pack: AgentRuntimeEvidencePack,
    index: AgentRuntimeEvidenceBrowserActionIndex,
  ) => void;
}

export function HarnessHandoffExportSection({
  currentSessionId,
  handoffBundle,
  handoffExporting,
  handoffExportError,
  evidencePack,
  evidenceExporting,
  evidenceExportError,
  replayCase,
  replayExporting,
  replayExportError,
  analysisHandoff,
  analysisExporting,
  analysisExportError,
  reviewDecisionTemplate,
  reviewDecisionExporting,
  reviewDecisionSaving,
  reviewDecisionExportError,
  registerSectionRef,
  handleExportHandoffBundle,
  handleExportEvidencePack,
  handleExportReplayCase,
  handleCopyReplayPromotionCommand,
  handleExportAnalysisHandoff,
  handleCopyAnalysisPrompt,
  handleExportReviewDecisionTemplate,
  handleOpenReviewDecisionEditor,
  handleOpenPathValue,
  openPreview,
  openBrowserReplayPreview,
}: HarnessHandoffExportSectionProps) {
  return (
    <Section
      sectionKey="handoff"
      title={agentText("agentChat.harness.generated.8d0323ba12", "交接制品")}
      badge={
        handoffBundle
          ? `已导出 ${handoffBundle.artifacts.length} 个文件`
          : "待导出"
      }
      registerRef={registerSectionRef}
    >
      <div className="space-y-3">
        <HarnessHandoffBundleCard
          currentSessionId={currentSessionId}
          handoffBundle={handoffBundle}
          handoffExporting={handoffExporting}
          handoffExportError={handoffExportError}
          handleExportHandoffBundle={handleExportHandoffBundle}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
        />

        <HarnessEvidencePackCard
          evidencePack={evidencePack}
          evidenceExporting={evidenceExporting}
          evidenceExportError={evidenceExportError}
          handleExportEvidencePack={handleExportEvidencePack}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
          openBrowserReplayPreview={openBrowserReplayPreview}
        />

        <HarnessReplayCaseCard
          replayCase={replayCase}
          replayExporting={replayExporting}
          replayExportError={replayExportError}
          analysisHandoff={analysisHandoff}
          reviewDecisionTemplate={reviewDecisionTemplate}
          handleExportReplayCase={handleExportReplayCase}
          handleCopyReplayPromotionCommand={handleCopyReplayPromotionCommand}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
        />

        <HarnessAnalysisHandoffCard
          analysisHandoff={analysisHandoff}
          analysisExporting={analysisExporting}
          analysisExportError={analysisExportError}
          handleExportAnalysisHandoff={handleExportAnalysisHandoff}
          handleCopyAnalysisPrompt={handleCopyAnalysisPrompt}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
        />

        <HarnessReviewDecisionCard
          reviewDecisionTemplate={reviewDecisionTemplate}
          reviewDecisionExporting={reviewDecisionExporting}
          reviewDecisionSaving={reviewDecisionSaving}
          reviewDecisionExportError={reviewDecisionExportError}
          handleExportReviewDecisionTemplate={
            handleExportReviewDecisionTemplate
          }
          handleOpenReviewDecisionEditor={handleOpenReviewDecisionEditor}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
        />
      </div>
    </Section>
  );
}
