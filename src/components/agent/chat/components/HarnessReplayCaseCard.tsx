import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
} from "@/lib/api/agentRuntime";
import { Copy, FileCode2, FolderOpen, Loader2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HarnessExportArtifactList,
  HarnessExportCardFrame,
  HarnessExportDirectoryCard,
  InventoryStatCard,
} from "./HarnessHandoffExportShared";
import type {
  HandoffOpenPathHandler,
  HandoffOpenPreviewHandler,
} from "./HarnessHandoffExportTypes";
import { agentText } from "./harnessPanelText";
import {
  buildReplayPromotionContext,
  formatHandoffStatusLabel,
  formatIsoDateTime,
  formatReplayArtifactKindLabel,
} from "./harnessStatusPanelViewModel";

interface HarnessReplayCaseCardProps {
  replayCase: AgentRuntimeReplayCase | null;
  replayExporting: boolean;
  replayExportError: string | null;
  analysisHandoff: AgentRuntimeAnalysisHandoff | null;
  reviewDecisionTemplate: AgentRuntimeReviewDecisionTemplate | null;
  handleExportReplayCase: () => void | Promise<AgentRuntimeReplayCase | null>;
  handleCopyReplayPromotionCommand: () => void | Promise<void>;
  handleOpenPathValue: HandoffOpenPathHandler;
  openPreview: HandoffOpenPreviewHandler;
}

export function HarnessReplayCaseCard({
  replayCase,
  replayExporting,
  replayExportError,
  analysisHandoff,
  reviewDecisionTemplate,
  handleExportReplayCase,
  handleCopyReplayPromotionCommand,
  handleOpenPathValue,
  openPreview,
}: HarnessReplayCaseCardProps) {
  return (
    <HarnessExportCardFrame
      icon={<FileCode2 className="h-4 w-4 text-emerald-600" />}
      title={agentText("agentChat.harness.generated.55d5260546", "Replay 样本")}
      description={agentText(
        "agentChat.harness.generated.4222677beb",
        "基于当前 session 复用 handoff bundle 与 evidence pack，导出 `input / expected / grader / evidence-links` 四件套，把真实失败转成可回放、可评分、可回归的最小样本。",
      )}
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant={replayCase ? "outline" : "default"}
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.0a671912df",
              "导出 Replay 样本",
            )}
            disabled={replayExporting}
            onClick={() => void handleExportReplayCase()}
          >
            {replayExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCode2 className="h-4 w-4" />
            )}
            {replayCase ? "刷新 Replay 样本" : "导出 Replay 样本"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.0532c40ed4",
              "复制回归沉淀与验证命令",
            )}
            disabled={replayExporting}
            onClick={() => void handleCopyReplayPromotionCommand()}
          >
            {replayExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {agentText(
              "agentChat.harness.generated.d79b117468",
              "复制回归命令",
            )}
          </Button>
          {replayCase ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              aria-label={agentText(
                "agentChat.harness.generated.30fbb13bf7",
                "打开 Replay 样本目录",
              )}
              onClick={() =>
                void handleOpenPathValue(replayCase.replay_absolute_root)
              }
            >
              <FolderOpen className="h-4 w-4" />
              {agentText("agentChat.harness.generated.031c105578", "打开目录")}
            </Button>
          ) : null}
        </>
      }
      error={replayExportError}
      hasContent={Boolean(replayCase)}
      emptyMessage={agentText(
        "agentChat.harness.generated.dc204bc209",
        "尚未导出 Replay 样本。建议在 handoff 和 evidence 都稳定后，再把真实失败沉淀成 `input / expected / grader / evidence-links` 四件套。",
      )}
    >
      {replayCase ? (
        <>
          <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.2a36de35aa",
                "线程状态",
              )}
              value={formatHandoffStatusLabel(replayCase.thread_status)}
              hint={`最近导出 ${formatIsoDateTime(replayCase.exported_at)}`}
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.df85462148",
                "阻塞线索",
              )}
              value={`${replayCase.pending_request_count} / ${replayCase.queued_turn_count}`}
              hint="pending request / queued turn"
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.6d61c09b06",
                "关联证据",
              )}
              value={`${replayCase.linked_handoff_artifact_count} / ${replayCase.linked_evidence_artifact_count}`}
              hint="handoff / evidence"
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.818507effc",
                "最近产物",
              )}
              value={`${replayCase.recent_artifact_count}`}
              hint={`workspace ${replayCase.workspace_id || "未绑定"}`}
            />
          </div>

          <HarnessExportDirectoryCard
            title={agentText(
              "agentChat.harness.generated.3c1180e2c6",
              "Replay 目录",
            )}
            relativePath={replayCase.replay_relative_root}
            absolutePath={replayCase.replay_absolute_root}
            onOpenPath={handleOpenPathValue}
          />

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <div className="text-sm font-medium text-emerald-900">
              {agentText(
                "agentChat.harness.generated.16429e5f71",
                "关联证据主链",
              )}
            </div>
            <div className="mt-2 space-y-1 text-xs text-emerald-800">
              <div>
                {agentText(
                  "agentChat.harness.generated.0788808854",
                  "handoff：",
                )}
                <span className="ml-1 break-all font-mono text-emerald-950">
                  {replayCase.handoff_bundle_relative_root}
                </span>
              </div>
              <div>
                {agentText(
                  "agentChat.harness.generated.d50a6b5d6c",
                  "evidence：",
                )}
                <span className="ml-1 break-all font-mono text-emerald-950">
                  {replayCase.evidence_pack_relative_root}
                </span>
              </div>
            </div>
          </div>

          <ReplayPromotionCard
            replayCase={replayCase}
            analysisTitle={analysisHandoff?.title}
            reviewTitle={reviewDecisionTemplate?.title}
          />

          <HarnessExportArtifactList
            artifacts={replayCase.artifacts}
            formatKindLabel={formatReplayArtifactKindLabel}
            previewDescriptionPrefix="Replay 样本"
            previewAriaLabelPrefix="预览 Replay 样本"
            openAriaLabelPrefix="系统打开 Replay 样本"
            onOpenPath={handleOpenPathValue}
            onOpenPreview={openPreview}
          />
        </>
      ) : null}
    </HarnessExportCardFrame>
  );
}

interface ReplayPromotionCardProps {
  replayCase: AgentRuntimeReplayCase;
  analysisTitle?: string;
  reviewTitle?: string;
}

function ReplayPromotionCard({
  replayCase,
  analysisTitle,
  reviewTitle,
}: ReplayPromotionCardProps) {
  const promotionContext = buildReplayPromotionContext({
    replayCase,
    analysisTitle,
    reviewTitle,
  });

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-sky-950">
        <Workflow className="h-4 w-4 text-sky-700" />
        <span>
          {agentText("agentChat.harness.generated.349f37479e", "回归资产沉淀")}
        </span>
      </div>
      <div className="mt-2 text-xs leading-5 text-sky-900">
        {agentText(
          "agentChat.harness.generated.75c0a945e1",
          "这一步直接复用仓库已有的 `harness:eval:promote` 与 `harness:eval` 主命令，把当前 replay case 提升为仓库 current 样本，并立即跑一次统一摘要验证； 点击“复制回归命令”后不需要你再手写参数。",
        )}
      </div>
      <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.b14686a384",
            "目标 Suite",
          )}
          value={promotionContext.suiteId}
          hint="仓库 current 样本集"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.7d69461cc6",
            "建议 Slug",
          )}
          value={promotionContext.slug}
          hint="promotion 目录名"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.1781d59f60",
            "后续验证",
          )}
          value="eval + trend"
          hint="统一摘要与趋势入口"
        />
      </div>
    </div>
  );
}
