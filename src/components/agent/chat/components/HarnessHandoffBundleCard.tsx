import type { AgentRuntimeHandoffBundle } from "@/lib/api/agentRuntime";
import { FolderOpen, HardDriveDownload, Loader2 } from "lucide-react";
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
  formatHandoffArtifactKindLabel,
  formatHandoffStatusLabel,
  formatIsoDateTime,
} from "./harnessStatusPanelViewModel";

interface HarnessHandoffBundleCardProps {
  currentSessionId: string;
  handoffBundle: AgentRuntimeHandoffBundle | null;
  handoffExporting: boolean;
  handoffExportError: string | null;
  handleExportHandoffBundle: () => void | Promise<void>;
  handleOpenPathValue: HandoffOpenPathHandler;
  openPreview: HandoffOpenPreviewHandler;
}

export function HarnessHandoffBundleCard({
  currentSessionId,
  handoffBundle,
  handoffExporting,
  handoffExportError,
  handleExportHandoffBundle,
  handleOpenPathValue,
  openPreview,
}: HarnessHandoffBundleCardProps) {
  return (
    <HarnessExportCardFrame
      className="border-sky-200/80 bg-sky-50/60"
      icon={<HardDriveDownload className="h-4 w-4 text-sky-600" />}
      title={agentText(
        "agentChat.harness.generated.eaca4f7907",
        "会话交接四件套",
      )}
      description={
        <>
          <div>
            {agentText(
              "agentChat.harness.generated.6e95623055",
              "把当前 session 的 plan / progress / handoff / review 摘要落到工作区 `.lime/harness/sessions` 下，便于下一次恢复和审查。",
            )}
          </div>
          <div className="mt-2">
            {agentText("agentChat.harness.generated.ce46eb8c00", "当前会话：")}
            {currentSessionId}
          </div>
        </>
      }
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant={handoffBundle ? "outline" : "default"}
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.aa38b7342e",
              "导出交接制品",
            )}
            disabled={handoffExporting}
            onClick={() => void handleExportHandoffBundle()}
          >
            {handoffExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HardDriveDownload className="h-4 w-4" />
            )}
            {handoffBundle ? "刷新导出" : "导出交接制品"}
          </Button>
          {handoffBundle ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              aria-label={agentText(
                "agentChat.harness.generated.f3571bab00",
                "打开交接目录",
              )}
              onClick={() =>
                void handleOpenPathValue(handoffBundle.bundle_absolute_root)
              }
            >
              <FolderOpen className="h-4 w-4" />
              {agentText("agentChat.harness.generated.031c105578", "打开目录")}
            </Button>
          ) : null}
        </>
      }
      error={handoffExportError}
      hasContent={Boolean(handoffBundle)}
      emptyMessage={agentText(
        "agentChat.harness.generated.8b54ad21d4",
        "尚未导出交接制品。建议在需要跨会话接手、准备审查或切换执行人前先导出一次。",
      )}
    >
      {handoffBundle ? (
        <>
          <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.2a36de35aa",
                "线程状态",
              )}
              value={formatHandoffStatusLabel(handoffBundle.thread_status)}
              hint={`最近导出 ${formatIsoDateTime(handoffBundle.exported_at)}`}
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.90cc62f7c2",
                "最新 Turn",
              )}
              value={formatHandoffStatusLabel(handoffBundle.latest_turn_status)}
              hint={`待处理请求 ${handoffBundle.pending_request_count} · 排队 ${handoffBundle.queued_turn_count}`}
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.fdebf66721",
                "Todo",
              )}
              value={`${handoffBundle.todo_completed}/${handoffBundle.todo_total}`}
              hint={`待开始 ${handoffBundle.todo_pending} · 进行中 ${handoffBundle.todo_in_progress}`}
            />
            <InventoryStatCard
              title={agentText(
                "agentChat.harness.generated.2a8ce33ff0",
                "子任务",
              )}
              value={`${handoffBundle.active_subagent_count}`}
              hint={`workspace ${handoffBundle.workspace_id || "未绑定"}`}
            />
          </div>

          <HarnessExportDirectoryCard
            title={agentText(
              "agentChat.harness.generated.f2d022980f",
              "导出目录",
            )}
            relativePath={handoffBundle.bundle_relative_root}
            absolutePath={handoffBundle.bundle_absolute_root}
            onOpenPath={handleOpenPathValue}
          />

          <HarnessExportArtifactList
            artifacts={handoffBundle.artifacts}
            formatKindLabel={formatHandoffArtifactKindLabel}
            previewDescriptionPrefix="交接制品"
            previewAriaLabelPrefix="预览交接制品"
            openAriaLabelPrefix="系统打开交接制品"
            onOpenPath={handleOpenPathValue}
            onOpenPreview={openPreview}
          />
        </>
      ) : null}
    </HarnessExportCardFrame>
  );
}
