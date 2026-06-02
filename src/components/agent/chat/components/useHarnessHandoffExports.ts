import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeSaveReviewDecisionRequest,
} from "@/lib/api/agentRuntime";
import {
  exportAgentRuntimeAnalysisHandoff,
  exportAgentRuntimeEvidencePack,
  exportAgentRuntimeHandoffBundle,
  exportAgentRuntimeReplayCase,
  exportAgentRuntimeReviewDecisionTemplate,
  saveAgentRuntimeReviewDecision,
} from "@/lib/api/agentRuntime";
import {
  buildAgentUiEvidenceChangedEvent,
  buildAgentUiHandoffProjectionEvents,
  buildAgentUiReviewProjectionEvents,
} from "../projection/agentUiEventProjection";
import { recordAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import { recordTeamControlAgentUiProjection } from "../projection/teamControlAgentUiProjection";
import {
  buildReplayEvalCommand,
  buildReplayPromotionCommand,
  buildReplayTrendCommand,
  resolveReviewDecisionRegressionFacts,
} from "./harnessStatusPanelViewModel";

export function useHarnessHandoffExports(currentSessionId: string | null) {
  const [handoffBundle, setHandoffBundle] =
    useState<AgentRuntimeHandoffBundle | null>(null);
  const [handoffExporting, setHandoffExporting] = useState(false);
  const [handoffExportError, setHandoffExportError] = useState<string | null>(
    null,
  );
  const [evidencePack, setEvidencePack] =
    useState<AgentRuntimeEvidencePack | null>(null);
  const [evidenceExporting, setEvidenceExporting] = useState(false);
  const [evidenceExportError, setEvidenceExportError] = useState<string | null>(
    null,
  );
  const [replayCase, setReplayCase] = useState<AgentRuntimeReplayCase | null>(
    null,
  );
  const [replayExporting, setReplayExporting] = useState(false);
  const [replayExportError, setReplayExportError] = useState<string | null>(
    null,
  );
  const [analysisHandoff, setAnalysisHandoff] =
    useState<AgentRuntimeAnalysisHandoff | null>(null);
  const [analysisExporting, setAnalysisExporting] = useState(false);
  const [analysisExportError, setAnalysisExportError] = useState<string | null>(
    null,
  );
  const [reviewDecisionTemplate, setReviewDecisionTemplate] =
    useState<AgentRuntimeReviewDecisionTemplate | null>(null);
  const [reviewDecisionEditorOpen, setReviewDecisionEditorOpen] =
    useState(false);
  const [reviewDecisionExporting, setReviewDecisionExporting] = useState(false);
  const [reviewDecisionSaving, setReviewDecisionSaving] = useState(false);
  const [reviewDecisionExportError, setReviewDecisionExportError] = useState<
    string | null
  >(null);

  useEffect(() => {
    setHandoffBundle(null);
    setHandoffExportError(null);
    setHandoffExporting(false);
    setEvidencePack(null);
    setEvidenceExportError(null);
    setEvidenceExporting(false);
    setReplayCase(null);
    setReplayExportError(null);
    setReplayExporting(false);
    setAnalysisHandoff(null);
    setAnalysisExportError(null);
    setAnalysisExporting(false);
    setReviewDecisionTemplate(null);
    setReviewDecisionEditorOpen(false);
    setReviewDecisionExportError(null);
    setReviewDecisionExporting(false);
    setReviewDecisionSaving(false);
  }, [currentSessionId]);

  const handleExportHandoffBundle = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return;
    }

    setHandoffExporting(true);
    setHandoffExportError(null);
    try {
      const bundle = await exportAgentRuntimeHandoffBundle(currentSessionId);
      setHandoffBundle(bundle);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: bundle.bundle_relative_root,
            handoffId: bundle.bundle_relative_root,
            sessionId: bundle.session_id,
            threadId: bundle.thread_id,
            kind: "runtime_handoff_bundle",
            status: "handoff_requested",
            verdict: "complete",
            from: "lime_runtime",
            to: "specialist_runtime",
            reason: "handoff_bundle_exported",
            resumeTarget: bundle.bundle_relative_root,
            contextBoundary: bundle.workspace_root,
            summaryPreview: `已导出 ${bundle.artifacts.length} 个交接制品`,
            artifactPaths: bundle.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: bundle.artifacts.length,
          },
          {
            timestamp: bundle.exported_at,
            sessionId: bundle.session_id,
            threadId: bundle.thread_id,
          },
        ),
      );
      toast.success(`已导出 ${bundle.artifacts.length} 个交接制品`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出交接制品失败";
      setHandoffExportError(message);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: `handoff-bundle:${currentSessionId}`,
            handoffId: `handoff-bundle:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "runtime_handoff_bundle",
            status: "failed",
            verdict: "export_failed",
            from: "lime_runtime",
            to: "specialist_runtime",
            reason: "handoff_bundle_export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      );
      toast.error(message);
    } finally {
      setHandoffExporting(false);
    }
  }, [currentSessionId]);

  const handleExportEvidencePack = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return;
    }

    setEvidenceExporting(true);
    setEvidenceExportError(null);
    try {
      const pack = await exportAgentRuntimeEvidencePack(currentSessionId);
      setEvidencePack(pack);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: pack.pack_relative_root,
            sessionId: pack.session_id,
            threadId: pack.thread_id,
            kind: "evidence_pack",
            status: "ready",
            verdict: pack.known_gaps.length > 0 ? "gaps_present" : "complete",
            summaryPreview: `已导出 ${pack.artifacts.length} 个问题证据文件`,
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
      toast.success(`已导出 ${pack.artifacts.length} 个问题证据文件`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出问题证据包失败";
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

  const handleExportReplayCase = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return null;
    }

    setReplayExporting(true);
    setReplayExportError(null);
    try {
      const replay = await exportAgentRuntimeReplayCase(currentSessionId);
      setReplayCase(replay);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: replay.replay_relative_root,
            sessionId: replay.session_id,
            threadId: replay.thread_id,
            kind: "replay_case",
            status: "ready",
            verdict: "complete",
            summaryPreview: `已导出 ${replay.artifacts.length} 个 Replay 样本文件`,
            artifactPaths: replay.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: replay.artifacts.length,
          },
          {
            timestamp: replay.exported_at,
            sessionId: replay.session_id,
            threadId: replay.thread_id,
          },
        ),
      ]);
      toast.success(`已导出 ${replay.artifacts.length} 个 Replay 样本文件`);
      return replay;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出 Replay 样本失败";
      setReplayExportError(message);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: `replay-case:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "replay_case",
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
      return null;
    } finally {
      setReplayExporting(false);
    }
  }, [currentSessionId]);

  const handleExportAnalysisHandoff = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return null;
    }

    setAnalysisExporting(true);
    setAnalysisExportError(null);
    try {
      const analysis =
        await exportAgentRuntimeAnalysisHandoff(currentSessionId);
      setAnalysisHandoff(analysis);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: analysis.analysis_relative_root,
            handoffId: analysis.handoff_bundle_relative_root,
            sessionId: analysis.session_id,
            threadId: analysis.thread_id,
            kind: "analysis_handoff",
            status: "handoff_requested",
            verdict: "complete",
            from: "lime_harness",
            to: "external_reviewer",
            reason: "analysis_handoff_exported",
            resumeTarget: analysis.analysis_relative_root,
            contextBoundary: analysis.sanitized_workspace_root,
            summaryPreview: `已导出 ${analysis.artifacts.length} 个外部分析文件`,
            artifactPaths: analysis.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: analysis.artifacts.length,
          },
          {
            timestamp: analysis.exported_at,
            sessionId: analysis.session_id,
            threadId: analysis.thread_id,
          },
        ),
      );
      toast.success(`已导出 ${analysis.artifacts.length} 个外部分析文件`);
      return analysis;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出外部分析交接失败";
      setAnalysisExportError(message);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: `analysis-handoff:${currentSessionId}`,
            handoffId: `analysis-handoff:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "analysis_handoff",
            status: "failed",
            verdict: "export_failed",
            from: "lime_harness",
            to: "external_reviewer",
            reason: "analysis_handoff_export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      );
      toast.error(message);
      return null;
    } finally {
      setAnalysisExporting(false);
    }
  }, [currentSessionId]);

  const handleCopyAnalysisPrompt = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持剪贴板复制");
      return;
    }

    const analysis = analysisHandoff || (await handleExportAnalysisHandoff());
    if (!analysis?.copy_prompt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(analysis.copy_prompt);
      toast.success("已复制 AI 诊断与修复指令");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "复制 AI 诊断与修复指令失败",
      );
    }
  }, [analysisHandoff, handleExportAnalysisHandoff]);

  const handleCopyReplayPromotionCommand = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持剪贴板复制");
      return;
    }

    const replay = replayCase || (await handleExportReplayCase());
    if (!replay) {
      return;
    }

    const promoteCommand = buildReplayPromotionCommand({
      replayCase: replay,
      analysisTitle: analysisHandoff?.title,
      reviewTitle: reviewDecisionTemplate?.title,
    });
    const evalCommand = buildReplayEvalCommand();
    const trendCommand = buildReplayTrendCommand();

    try {
      await navigator.clipboard.writeText(
        `${promoteCommand}\n${evalCommand}\n${trendCommand}\n`,
      );
      toast.success("已复制回归沉淀、验证与趋势命令");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "复制回归沉淀、验证与趋势命令失败",
      );
    }
  }, [
    analysisHandoff?.title,
    handleExportReplayCase,
    replayCase,
    reviewDecisionTemplate?.title,
  ]);

  const handleExportReviewDecisionTemplate = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return null;
    }

    setReviewDecisionExporting(true);
    setReviewDecisionExportError(null);
    try {
      const template =
        await exportAgentRuntimeReviewDecisionTemplate(currentSessionId);
      const regressionFacts = resolveReviewDecisionRegressionFacts(
        template.verification_summary,
      );
      setReviewDecisionTemplate(template);
      recordAgentUiProjectionEvents(
        buildAgentUiReviewProjectionEvents(
          {
            reviewEvent: "requested",
            evidenceId: template.review_relative_root,
            reviewId: template.review_relative_root,
            sessionId: template.session_id,
            threadId: template.thread_id,
            kind: "review_decision",
            status: "ready",
            verdict: template.default_decision_status,
            decisionStatus: template.default_decision_status,
            riskLevel: template.decision.risk_level,
            checklistCount: template.review_checklist.length,
            ...regressionFacts,
            requestedFixes: template.decision.followup_actions,
            followupActions: template.decision.followup_actions,
            regressionRequirements: template.decision.regression_requirements,
            summaryPreview: `已导出 ${template.artifacts.length} 个人工审核文件`,
            artifactPaths: template.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: template.artifacts.length,
          },
          {
            timestamp: template.exported_at,
            sessionId: template.session_id,
            threadId: template.thread_id,
          },
        ),
      );
      recordTeamControlAgentUiProjection(
        {
          action: "request_review",
          requestedSessionIds: [],
          affectedSessionIds: [],
          reviewId: template.review_relative_root,
          workItemId: template.review_relative_root,
          runtimeEntity: "work_item",
          messagePreview: `已导出 ${template.artifacts.length} 个人工审核文件`,
          timestamp: template.exported_at,
        },
        {
          timestamp: template.exported_at,
          sessionId: template.session_id,
          threadId: template.thread_id,
        },
      );
      toast.success(`已导出 ${template.artifacts.length} 个人工审核文件`);
      return template;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出人工审核记录失败";
      setReviewDecisionExportError(message);
      recordAgentUiProjectionEvents(
        buildAgentUiReviewProjectionEvents(
          {
            reviewEvent: "completed",
            evidenceId: `review-decision:${currentSessionId}`,
            reviewId: `review-decision:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "review_decision",
            status: "failed",
            verdict: "export_failed",
            decisionStatus: "export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      );
      toast.error(message);
      return null;
    } finally {
      setReviewDecisionExporting(false);
    }
  }, [currentSessionId]);

  const handleOpenReviewDecisionEditor = useCallback(async () => {
    const template =
      reviewDecisionTemplate || (await handleExportReviewDecisionTemplate());
    if (!template) {
      return;
    }

    setReviewDecisionTemplate(template);
    setReviewDecisionEditorOpen(true);
  }, [handleExportReviewDecisionTemplate, reviewDecisionTemplate]);

  const handleSaveReviewDecision = useCallback(
    async (request: AgentRuntimeSaveReviewDecisionRequest) => {
      setReviewDecisionSaving(true);
      setReviewDecisionExportError(null);
      try {
        const template = await saveAgentRuntimeReviewDecision(request);
        const regressionFacts = resolveReviewDecisionRegressionFacts(
          template.verification_summary,
        );
        setReviewDecisionTemplate(template);
        setReviewDecisionEditorOpen(false);
        recordAgentUiProjectionEvents(
          buildAgentUiReviewProjectionEvents(
            {
              reviewEvent: "completed",
              evidenceId: template.review_relative_root,
              reviewId: template.review_relative_root,
              sessionId: template.session_id,
              threadId: template.thread_id,
              kind: "review_decision",
              status: "completed",
              verdict: template.decision.decision_status,
              decisionStatus: template.decision.decision_status,
              reviewer: template.decision.human_reviewer,
              riskLevel: template.decision.risk_level,
              followupActionCount: template.decision.followup_actions.length,
              regressionRequirementCount:
                template.decision.regression_requirements.length,
              checklistCount: template.review_checklist.length,
              ...regressionFacts,
              requestedFixes: template.decision.followup_actions,
              followupActions: template.decision.followup_actions,
              regressionRequirements: template.decision.regression_requirements,
              summaryPreview: template.decision.decision_summary,
              artifactPaths: template.artifacts.map(
                (artifact) => artifact.relative_path,
              ),
              itemCount: template.artifacts.length,
            },
            {
              timestamp: template.exported_at,
              sessionId: template.session_id,
              threadId: template.thread_id,
            },
          ),
        );
        toast.success("已保存人工审核结果");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "保存人工审核结果失败";
        setReviewDecisionExportError(message);
        recordAgentUiProjectionEvents(
          buildAgentUiReviewProjectionEvents(
            {
              reviewEvent: "completed",
              evidenceId: `review-decision:${request.session_id}`,
              reviewId: `review-decision:${request.session_id}`,
              sessionId: request.session_id,
              kind: "review_decision",
              status: "failed",
              verdict: "save_failed",
              decisionStatus: "save_failed",
              summaryPreview: message,
            },
            {
              timestamp: new Date().toISOString(),
              sessionId: request.session_id,
            },
          ),
        );
        toast.error(message);
      } finally {
        setReviewDecisionSaving(false);
      }
    },
    [],
  );

  return {
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
    reviewDecisionEditorOpen,
    reviewDecisionExporting,
    reviewDecisionSaving,
    reviewDecisionExportError,
    setReviewDecisionEditorOpen,
    handleExportHandoffBundle,
    handleExportEvidencePack,
    handleExportReplayCase,
    handleCopyReplayPromotionCommand,
    handleExportAnalysisHandoff,
    handleCopyAnalysisPrompt,
    handleExportReviewDecisionTemplate,
    handleOpenReviewDecisionEditor,
    handleSaveReviewDecision,
  };
}
