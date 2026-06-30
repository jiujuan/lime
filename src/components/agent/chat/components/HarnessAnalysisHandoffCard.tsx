import type { AgentRuntimeAnalysisHandoff } from "@/lib/api/agentRuntime";
import { Copy, FolderOpen, Loader2, Sparkles } from "lucide-react";
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
  formatAnalysisArtifactKindLabel,
  formatHandoffStatusLabel,
  formatIsoDateTime,
} from "./harnessStatusPanelViewModel";

interface HarnessAnalysisHandoffCardProps {
  analysisHandoff: AgentRuntimeAnalysisHandoff | null;
  analysisExporting: boolean;
  analysisExportError: string | null;
  handleExportAnalysisHandoff: () => void | Promise<AgentRuntimeAnalysisHandoff | null>;
  handleCopyAnalysisPrompt: () => void | Promise<void>;
  handleOpenPathValue: HandoffOpenPathHandler;
  openPreview: HandoffOpenPreviewHandler;
}

export function HarnessAnalysisHandoffCard({
  analysisHandoff,
  analysisExporting,
  analysisExportError,
  handleExportAnalysisHandoff,
  handleCopyAnalysisPrompt,
  handleOpenPathValue,
  openPreview,
}: HarnessAnalysisHandoffCardProps) {
  return (
    <HarnessExportCardFrame
      icon={<Sparkles className="h-4 w-4 text-violet-600" />}
      title={agentText(
        "agentChat.harness.generated.d182d6ca5e",
        "外部分析交接",
      )}
      description={agentText(
        "agentChat.harness.generated.d3e119bf04",
        "把 handoff / evidence / replay 主链重新包装成外部 AI 可直接消费的分析交接；复制后可直接粘贴给 AI， 不需要你再手写补充 prompt。",
      )}
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant={analysisHandoff ? "outline" : "default"}
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.6ee9d41fc9",
              "导出外部分析交接",
            )}
            disabled={analysisExporting}
            onClick={() => void handleExportAnalysisHandoff()}
          >
            {analysisExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analysisHandoff ? "刷新分析交接" : "导出分析交接"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.29ae25dba3",
              "一键复制给 AI",
            )}
            disabled={analysisExporting}
            onClick={() => void handleCopyAnalysisPrompt()}
          >
            {analysisExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {agentText(
              "agentChat.harness.generated.29ae25dba3",
              "一键复制给 AI",
            )}
          </Button>
          {analysisHandoff ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              aria-label={agentText(
                "agentChat.harness.generated.dbf50b71fe",
                "打开外部分析目录",
              )}
              onClick={() =>
                void handleOpenPathValue(analysisHandoff.analysis_absolute_root)
              }
            >
              <FolderOpen className="h-4 w-4" />
              {agentText("agentChat.harness.generated.031c105578", "打开目录")}
            </Button>
          ) : null}
        </>
      }
      error={analysisExportError}
      hasContent={Boolean(analysisHandoff)}
      emptyMessage={agentText(
        "agentChat.harness.generated.f48629deea",
        "尚未导出外部分析交接。点击“一键复制给 AI”时会自动先导出再复制， 用于把当前 Lime 证据链直接交给外部 AI 做诊断与最小修复。",
      )}
    >
      {analysisHandoff ? (
        <>
          <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.2a36de35aa",
                "线程状态",
              )}
              value={formatHandoffStatusLabel(analysisHandoff.thread_status)}
              hint={`最近导出 ${formatIsoDateTime(analysisHandoff.exported_at)}`}
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.90cc62f7c2",
                "最新 Turn",
              )}
              value={formatHandoffStatusLabel(
                analysisHandoff.latest_turn_status,
              )}
              hint={`待处理请求 ${analysisHandoff.pending_request_count} · 排队 ${analysisHandoff.queued_turn_count}`}
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.9f052ffbf5",
                "分析标题",
              )}
              value={analysisHandoff.title || "未命名"}
              hint={`工作区 ${analysisHandoff.workspace_id || "未绑定"}`}
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.f8bd8bc1e8",
                "分析文件",
              )}
              value={`${analysisHandoff.artifacts.length}`}
              hint="analysis brief / context"
            />
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-950">
              <Copy className="h-4 w-4 text-violet-700" />
              <span>
                {agentText(
                  "agentChat.harness.generated.fb7e40eb5b",
                  "复制说明",
                )}
              </span>
            </div>
            <div className="mt-2 text-xs leading-5 text-violet-900">
              {agentText(
                "agentChat.harness.generated.00423f2e35",
                "复制内容来自后端导出的 `copy_prompt`，已经包含分析入口文件、关联目录和输出要求； 外部 AI 可直接开始诊断，证据足够明确时也可直接实施最小修复。",
              )}
            </div>
          </div>

          <HarnessExportDirectoryCard
            title={agentText(
              "agentChat.harness.generated.0da0f10ea9",
              "分析目录",
            )}
            relativePath={analysisHandoff.analysis_relative_root}
            absolutePath={analysisHandoff.analysis_absolute_root}
            onOpenPath={handleOpenPathValue}
          />

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-sm font-medium text-foreground">
              {agentText(
                "agentChat.harness.generated.3d4597d82b",
                "关联主链目录",
              )}
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div>
                {agentText(
                  "agentChat.harness.generated.0788808854",
                  "handoff：",
                )}
                <span className="ml-1 break-all font-mono text-foreground">
                  {analysisHandoff.handoff_bundle_relative_root}
                </span>
              </div>
              <div>
                {agentText(
                  "agentChat.harness.generated.d50a6b5d6c",
                  "evidence：",
                )}
                <span className="ml-1 break-all font-mono text-foreground">
                  {analysisHandoff.evidence_pack_relative_root}
                </span>
              </div>
              <div>
                {agentText(
                  "agentChat.harness.generated.498f3b30f7",
                  "replay：",
                )}
                <span className="ml-1 break-all font-mono text-foreground">
                  {analysisHandoff.replay_case_relative_root}
                </span>
              </div>
              <div>
                {agentText(
                  "agentChat.harness.generated.b140ad22fb",
                  "路径占位根：",
                )}
                <span className="ml-1 break-all font-mono text-foreground">
                  {analysisHandoff.sanitized_workspace_root}
                </span>
              </div>
            </div>
          </div>

          <HarnessExportArtifactList
            artifacts={analysisHandoff.artifacts}
            formatKindLabel={formatAnalysisArtifactKindLabel}
            previewDescriptionPrefix="外部分析交接"
            previewAriaLabelPrefix="预览外部分析文件"
            openAriaLabelPrefix="系统打开外部分析文件"
            onOpenPath={handleOpenPathValue}
            onOpenPreview={openPreview}
          />
        </>
      ) : null}
    </HarnessExportCardFrame>
  );
}
