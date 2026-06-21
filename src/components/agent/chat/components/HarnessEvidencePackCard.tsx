import type {
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidencePack,
} from "@/lib/api/agentRuntime";
import { FolderOpen, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BrowserActionIndexSummarySection,
  LimeCorePolicyIndexSummarySection,
} from "./HarnessEvidenceSummarySections";
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
import { HarnessTaskIndexSection } from "./HarnessTaskIndexSection";
import { HarnessVerificationSummarySection } from "./HarnessVerificationSummarySection";
import { agentText } from "./harnessPanelText";
import {
  formatCompletionAuditDecisionLabel,
  formatEvidenceArtifactKindLabel,
  formatHandoffStatusLabel,
  formatIsoDateTime,
} from "./harnessStatusPanelViewModel";

interface HarnessEvidencePackCardProps {
  evidencePack: AgentRuntimeEvidencePack | null;
  evidenceExporting: boolean;
  evidenceExportError: string | null;
  handleExportEvidencePack: () => void | Promise<void>;
  handleOpenPathValue: HandoffOpenPathHandler;
  openPreview: HandoffOpenPreviewHandler;
  openBrowserReplayPreview: (
    pack: AgentRuntimeEvidencePack,
    index: AgentRuntimeEvidenceBrowserActionIndex,
  ) => void;
}

export function HarnessEvidencePackCard({
  evidencePack,
  evidenceExporting,
  evidenceExportError,
  handleExportEvidencePack,
  handleOpenPathValue,
  openPreview,
  openBrowserReplayPreview,
}: HarnessEvidencePackCardProps) {
  return (
    <HarnessExportCardFrame
      icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
      title={agentText("agentChat.harness.generated.153b1d0f0a", "问题证据包")}
      description={agentText(
        "agentChat.harness.generated.1a81e7e23f",
        "把当前 runtime、timeline、最近产物和已知缺口导出为最小证据包，为后续 replay、eval 和故障复盘提供输入。",
      )}
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant={evidencePack ? "outline" : "default"}
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.f1e4d07649",
              "导出问题证据包",
            )}
            disabled={evidenceExporting}
            onClick={() => void handleExportEvidencePack()}
          >
            {evidenceExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {evidencePack ? "刷新证据包" : "导出问题证据包"}
          </Button>
          {evidencePack ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              aria-label={agentText(
                "agentChat.harness.generated.d6913f073d",
                "打开问题证据目录",
              )}
              onClick={() =>
                void handleOpenPathValue(evidencePack.pack_absolute_root)
              }
            >
              <FolderOpen className="h-4 w-4" />
              {agentText("agentChat.harness.generated.031c105578", "打开目录")}
            </Button>
          ) : null}
        </>
      }
      error={evidenceExportError}
      hasContent={Boolean(evidencePack)}
      emptyMessage={agentText(
        "agentChat.harness.generated.913ad2f0a2",
        "尚未导出问题证据包。建议在出现阻塞、需要复盘失败链路，或准备把真实案例沉淀成 replay / eval 样本前导出一次。",
      )}
    >
      {evidencePack ? (
        <EvidencePackContent
          evidencePack={evidencePack}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
          openBrowserReplayPreview={openBrowserReplayPreview}
        />
      ) : null}
    </HarnessExportCardFrame>
  );
}

interface EvidencePackContentProps {
  evidencePack: AgentRuntimeEvidencePack;
  handleOpenPathValue: HandoffOpenPathHandler;
  openPreview: HandoffOpenPreviewHandler;
  openBrowserReplayPreview: (
    pack: AgentRuntimeEvidencePack,
    index: AgentRuntimeEvidenceBrowserActionIndex,
  ) => void;
}

function EvidencePackContent({
  evidencePack,
  handleOpenPathValue,
  openPreview,
  openBrowserReplayPreview,
}: EvidencePackContentProps) {
  const verificationSummary =
    evidencePack.observability_summary?.verification_summary;
  const failureFocus =
    verificationSummary?.focus_verification_failure_outcomes ?? [];
  const exportedSignals =
    evidencePack.observability_summary?.signal_coverage.filter(
      (entry) => entry.status === "exported",
    ).length ?? 0;
  const snapshotIndex =
    evidencePack.observability_summary?.modality_runtime_contracts
      ?.snapshot_index;
  const browserActionIndex = snapshotIndex?.browser_action_index;
  const skillInvocations =
    evidencePack.observability_summary?.skill_invocations ?? [];

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.2a36de35aa",
            "线程状态",
          )}
          value={formatHandoffStatusLabel(evidencePack.thread_status)}
          hint={`最近导出 ${formatIsoDateTime(evidencePack.exported_at)}`}
        />
        <InventoryStatCard
          title={agentText("agentChat.harness.generated.4f8ef92599", "时间线")}
          value={`${evidencePack.turn_count} / ${evidencePack.item_count}`}
          hint="turns / items"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.df85462148",
            "阻塞线索",
          )}
          value={`${evidencePack.pending_request_count} / ${evidencePack.queued_turn_count}`}
          hint="pending request / queued turn"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.0c7b23bb31",
            "已知缺口",
          )}
          value={`${evidencePack.known_gaps.length}`}
          hint={
            verificationSummary
              ? `验证焦点 ${failureFocus.length} · 已导出信号 ${exportedSignals}`
              : `最近产物 ${evidencePack.recent_artifact_count} 个`
          }
        />
      </div>

      {evidencePack.completion_audit_summary ? (
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldAlert className="h-4 w-4 text-emerald-600" />
                <span>
                  {agentText(
                    "agentChat.harness.generated.1c3af0bdc1",
                    "Completion Audit",
                  )}
                </span>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {agentText(
                  "agentChat.harness.generated.3bd3ec2245",
                  "基于 automation owner、Workspace Skill ToolCall 与 artifact / timeline evidence 的完成判定，不读取模型自报。",
                )}
              </div>
            </div>
            <Badge variant="outline">
              {formatCompletionAuditDecisionLabel(
                evidencePack.completion_audit_summary.decision,
              )}
            </Badge>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            <div>
              {agentText(
                "agentChat.harness.generated.feb6327847",
                "Owner success：",
              )}
              <span className="ml-1 font-mono text-foreground">
                {
                  evidencePack.completion_audit_summary
                    .successful_owner_run_count
                }
                /{evidencePack.completion_audit_summary.owner_run_count}
              </span>
            </div>
            <div>
              {agentText(
                "agentChat.harness.generated.085f91c13e",
                "Skill ToolCall：",
              )}
              <span className="ml-1 font-mono text-foreground">
                {
                  evidencePack.completion_audit_summary
                    .workspace_skill_tool_call_count
                }
              </span>
            </div>
            <div>
              {agentText(
                "agentChat.harness.generated.6245faf559",
                "Artifact evidence：",
              )}
              <span className="ml-1 font-mono text-foreground">
                {evidencePack.completion_audit_summary.artifact_count}
              </span>
            </div>
            <div>
              {agentText(
                "agentChat.harness.generated.aa4af1af73",
                "Blocking：",
              )}
              <span className="ml-1 text-foreground">
                {evidencePack.completion_audit_summary.blocking_reasons.length >
                0
                  ? evidencePack.completion_audit_summary.blocking_reasons.join(
                      "、",
                    )
                  : "无"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {skillInvocations.length > 0 ? (
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-sm font-medium text-foreground">
            {agentText(
              "agentChat.harness.generated.085f91c13e",
              "Skill ToolCall：",
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {skillInvocations.map((invocation, index) => (
              <Badge
                key={`${invocation.source_event_id || invocation.skill_name}-${index}`}
                variant="outline"
                className="font-mono"
              >
                {invocation.skill_name}
                {invocation.status ? ` · ${invocation.status}` : ""}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <HarnessExportDirectoryCard
        title={agentText("agentChat.harness.generated.101e014f74", "证据目录")}
        relativePath={evidencePack.pack_relative_root}
        absolutePath={evidencePack.pack_absolute_root}
        onOpenPath={handleOpenPathValue}
      />

      {browserActionIndex ? (
        <BrowserActionIndexSummarySection
          index={browserActionIndex}
          onOpenReplay={() =>
            openBrowserReplayPreview(evidencePack, browserActionIndex)
          }
        />
      ) : null}

      {snapshotIndex?.task_index ? (
        <HarnessTaskIndexSection index={snapshotIndex.task_index} />
      ) : null}

      {snapshotIndex?.limecore_policy_index ? (
        <LimeCorePolicyIndexSummarySection
          index={snapshotIndex.limecore_policy_index}
        />
      ) : null}

      {verificationSummary ? (
        <HarnessVerificationSummarySection summary={verificationSummary} />
      ) : null}

      {evidencePack.known_gaps.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
          <div className="text-sm font-medium text-amber-900">
            {agentText(
              "agentChat.harness.generated.1d2aef0cb3",
              "当前已知缺口",
            )}
          </div>
          <div className="mt-2 space-y-1 text-xs text-amber-800">
            {evidencePack.known_gaps.map((gap, index) => (
              <div key={`${gap}-${index}`}>{gap}</div>
            ))}
          </div>
        </div>
      ) : null}

      <HarnessExportArtifactList
        artifacts={evidencePack.artifacts}
        formatKindLabel={formatEvidenceArtifactKindLabel}
        previewDescriptionPrefix="问题证据"
        previewAriaLabelPrefix="预览问题证据"
        openAriaLabelPrefix="系统打开问题证据"
        onOpenPath={handleOpenPathValue}
        onOpenPreview={openPreview}
      />
    </>
  );
}
