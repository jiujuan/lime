import type { AgentRuntimeReviewDecisionTemplate } from "@/lib/api/agentRuntime";
import {
  AlertCircle,
  FolderOpen,
  ListChecks,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { HarnessVerificationSummarySection } from "./HarnessVerificationSummarySection";
import { agentText } from "./harnessPanelText";
import {
  formatAnalysisArtifactKindLabel,
  formatHandoffStatusLabel,
  formatIsoDateTime,
  formatPermissionConfirmationStatusLabel,
  formatReviewDecisionArtifactKindLabel,
  formatReviewDecisionRiskLevelLabel,
  formatReviewDecisionStatusLabel,
  formatReviewLimitStatusLabel,
} from "./harnessStatusPanelViewModel";

interface HarnessReviewDecisionCardProps {
  reviewDecisionTemplate: AgentRuntimeReviewDecisionTemplate | null;
  reviewDecisionExporting: boolean;
  reviewDecisionSaving: boolean;
  reviewDecisionExportError: string | null;
  handleExportReviewDecisionTemplate: () => void | Promise<AgentRuntimeReviewDecisionTemplate | null>;
  handleOpenReviewDecisionEditor: () => void | Promise<void>;
  handleOpenPathValue: HandoffOpenPathHandler;
  openPreview: HandoffOpenPreviewHandler;
}

export function HarnessReviewDecisionCard({
  reviewDecisionTemplate,
  reviewDecisionExporting,
  reviewDecisionSaving,
  reviewDecisionExportError,
  handleExportReviewDecisionTemplate,
  handleOpenReviewDecisionEditor,
  handleOpenPathValue,
  openPreview,
}: HarnessReviewDecisionCardProps) {
  return (
    <HarnessExportCardFrame
      icon={<ListChecks className="h-4 w-4 text-emerald-600" />}
      title={agentText(
        "agentChat.harness.generated.4a50d21f62",
        "人工审核记录",
      )}
      description={agentText(
        "agentChat.harness.generated.97b53a81c7",
        "把外部 AI 的分析结论回挂为 `review-decision.md/json` 模板，固定接受、延后、拒绝与回归要求；最终决策仍由开发者审核，不是 Lime 自动闭环。",
      )}
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant={reviewDecisionTemplate ? "outline" : "default"}
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.955a9d2951",
              "导出人工审核记录",
            )}
            disabled={reviewDecisionExporting}
            onClick={() => void handleExportReviewDecisionTemplate()}
          >
            {reviewDecisionExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ListChecks className="h-4 w-4" />
            )}
            {reviewDecisionTemplate ? "刷新人工审核记录" : "导出人工审核记录"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            aria-label={agentText(
              "agentChat.harness.generated.1ced04d169",
              "填写人工审核结果",
            )}
            disabled={reviewDecisionExporting || reviewDecisionSaving}
            onClick={() => void handleOpenReviewDecisionEditor()}
          >
            <ShieldAlert className="h-4 w-4" />
            {agentText(
              "agentChat.harness.generated.1ced04d169",
              "填写人工审核结果",
            )}
          </Button>
          {reviewDecisionTemplate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              aria-label={agentText(
                "agentChat.harness.generated.265890359d",
                "打开人工审核目录",
              )}
              onClick={() =>
                void handleOpenPathValue(
                  reviewDecisionTemplate.review_absolute_root,
                )
              }
            >
              <FolderOpen className="h-4 w-4" />
              {agentText("agentChat.harness.generated.031c105578", "打开目录")}
            </Button>
          ) : null}
        </>
      }
      error={reviewDecisionExportError}
      hasContent={Boolean(reviewDecisionTemplate)}
      emptyMessage={agentText(
        "agentChat.harness.generated.fb2456e37b",
        "尚未导出人工审核记录。建议在外部 AI 完成诊断后立刻导出 `review-decision.md/json`，把接受、延后、拒绝和回归要求回挂到工作区， 而不是散落在聊天窗口或临时笔记里。",
      )}
    >
      {reviewDecisionTemplate ? (
        <ReviewDecisionContent
          reviewDecisionTemplate={reviewDecisionTemplate}
          handleOpenPathValue={handleOpenPathValue}
          openPreview={openPreview}
        />
      ) : null}
    </HarnessExportCardFrame>
  );
}

interface ReviewDecisionContentProps {
  reviewDecisionTemplate: AgentRuntimeReviewDecisionTemplate;
  handleOpenPathValue: HandoffOpenPathHandler;
  openPreview: HandoffOpenPreviewHandler;
}

function ReviewDecisionContent({
  reviewDecisionTemplate,
  handleOpenPathValue,
  openPreview,
}: ReviewDecisionContentProps) {
  const decisionStatus =
    reviewDecisionTemplate.decision.decision_status ||
    reviewDecisionTemplate.default_decision_status;

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.045859e792",
            "当前状态",
          )}
          value={formatReviewDecisionStatusLabel(decisionStatus)}
          hint={`最近写入 ${formatIsoDateTime(reviewDecisionTemplate.exported_at)}`}
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.2a36de35aa",
            "线程状态",
          )}
          value={formatHandoffStatusLabel(reviewDecisionTemplate.thread_status)}
          hint={`待处理请求 ${reviewDecisionTemplate.pending_request_count} · 排队 ${reviewDecisionTemplate.queued_turn_count}`}
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.a90f1e5591",
            "风险等级",
          )}
          value={formatReviewDecisionRiskLevelLabel(
            reviewDecisionTemplate.decision.risk_level,
          )}
          hint={
            reviewDecisionTemplate.decision.risk_tags.length > 0
              ? reviewDecisionTemplate.decision.risk_tags.join(" / ")
              : "尚未填写风险标签"
          }
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.302eda3ced",
            "权限确认",
          )}
          value={formatPermissionConfirmationStatusLabel(
            reviewDecisionTemplate.permission_confirmation_status,
          )}
          hint={
            reviewDecisionTemplate.permission_confirmation_summary ||
            reviewDecisionTemplate.permission_confirmation_request_id ||
            "未导出权限确认摘要"
          }
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.0c5a6323af",
            "模型锁定",
          )}
          value={formatReviewLimitStatusLabel(
            reviewDecisionTemplate.limit_status,
          )}
          hint={
            reviewDecisionTemplate.user_locked_capability_summary ||
            reviewDecisionTemplate.capability_gap ||
            "未导出模型锁定能力缺口"
          }
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.f8bd8bc1e8",
            "分析文件",
          )}
          value={`${reviewDecisionTemplate.analysis_artifacts.length}`}
          hint="沿用 analysis handoff 主链"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.7d5028f2c7",
            "审核文件",
          )}
          value={`${reviewDecisionTemplate.artifacts.length}`}
          hint="review-decision.md / json"
        />
      </div>

      <ReviewDecisionBoundaryCard />
      <ReviewDecisionBlockingCards template={reviewDecisionTemplate} />

      {reviewDecisionTemplate.verification_summary ? (
        <HarnessVerificationSummarySection
          summary={reviewDecisionTemplate.verification_summary}
        />
      ) : null}

      <ReviewDecisionSummaryCard
        reviewDecisionTemplate={reviewDecisionTemplate}
        decisionStatus={decisionStatus}
      />

      <HarnessExportDirectoryCard
        title={agentText("agentChat.harness.generated.b74ba0f7e8", "审核目录")}
        relativePath={reviewDecisionTemplate.review_relative_root}
        absolutePath={reviewDecisionTemplate.review_absolute_root}
        onOpenPath={handleOpenPathValue}
      />

      <div className="rounded-xl border border-border bg-background p-3">
        <div className="text-sm font-medium text-foreground">
          {agentText("agentChat.harness.generated.9a6c8cf2e8", "人工审核清单")}
        </div>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          {reviewDecisionTemplate.review_checklist.map((item) => (
            <div
              key={item}
              className="rounded-lg border border-dashed border-border px-3 py-2"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <HarnessExportArtifactList
        title={agentText(
          "agentChat.harness.generated.b7ba9e9504",
          "关联分析文件",
        )}
        artifacts={reviewDecisionTemplate.analysis_artifacts}
        formatKindLabel={formatAnalysisArtifactKindLabel}
        previewDescriptionPrefix="关联分析文件"
        previewAriaLabelPrefix="预览关联分析文件"
        openAriaLabelPrefix="系统打开关联分析文件"
        onOpenPath={handleOpenPathValue}
        onOpenPreview={openPreview}
      />

      <HarnessExportArtifactList
        title={agentText(
          "agentChat.harness.generated.d19ad31eb3",
          "审核记录模板文件",
        )}
        artifacts={reviewDecisionTemplate.artifacts}
        formatKindLabel={formatReviewDecisionArtifactKindLabel}
        previewDescriptionPrefix="人工审核记录"
        previewAriaLabelPrefix="预览人工审核文件"
        openAriaLabelPrefix="系统打开人工审核文件"
        onOpenPath={handleOpenPathValue}
        onOpenPreview={openPreview}
      />
    </>
  );
}

function ReviewDecisionBoundaryCard() {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-950">
        <ShieldAlert className="h-4 w-4 text-emerald-700" />
        <span>
          {agentText("agentChat.harness.generated.99b1a346a7", "职责边界")}
        </span>
      </div>
      <div className="mt-2 text-xs leading-5 text-emerald-900">
        {agentText(
          "agentChat.harness.generated.be6144aa41",
          "运行时事实继续以 aster-rust 的 session / thread / turn 为准，外部分析形状对齐 Codex 的交接习惯，但最终是否接受修复、补哪些回归，必须由开发者写入 review decision。",
        )}
      </div>
    </div>
  );
}

function ReviewDecisionBlockingCards({
  template,
}: {
  template: AgentRuntimeReviewDecisionTemplate;
}) {
  return (
    <>
      {template.permission_confirmation_status?.trim() === "denied" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>
              {agentText(
                "agentChat.harness.generated.3908997f9f",
                "权限确认已拒绝",
              )}
            </span>
          </div>
          <div className="mt-2 text-xs leading-5 text-destructive/90">
            {template.permission_confirmation_summary ||
              "当前 review decision 不能作为成功交付证据，请先处理真实权限确认。"}
          </div>
        </div>
      ) : null}

      {template.limit_status?.trim() === "user_locked_capability_gap" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>
              {agentText(
                "agentChat.harness.generated.41e558488a",
                "模型锁定能力缺口",
              )}
            </span>
          </div>
          <div className="mt-2 text-xs leading-5 text-destructive/90">
            {template.user_locked_capability_summary ||
              "当前显式用户模型锁定不满足 execution profile，不能作为成功交付证据。"}
          </div>
          {template.capability_gap ? (
            <div className="mt-1 font-mono text-[11px] text-destructive/80">
              {agentText(
                "agentChat.harness.generated.43400bb0f7",
                "capabilityGap=",
              )}
              {template.capability_gap}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

interface ReviewDecisionSummaryCardProps {
  reviewDecisionTemplate: AgentRuntimeReviewDecisionTemplate;
  decisionStatus: string;
}

function ReviewDecisionSummaryCard({
  reviewDecisionTemplate,
  decisionStatus,
}: ReviewDecisionSummaryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">
          {agentText(
            "agentChat.harness.generated.bbb8d9b533",
            "当前人工审核结论",
          )}
        </div>
        <Badge variant="outline">
          {formatReviewDecisionStatusLabel(decisionStatus)}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
        <div>
          {agentText("agentChat.harness.generated.8132b4b996", "审核人：")}
          <span className="ml-1 text-foreground">
            {reviewDecisionTemplate.decision.human_reviewer || "待填写"}
          </span>
        </div>
        <div>
          {agentText("agentChat.harness.generated.0c0f6228df", "审核时间：")}
          <span className="ml-1 text-foreground">
            {reviewDecisionTemplate.decision.reviewed_at
              ? formatIsoDateTime(reviewDecisionTemplate.decision.reviewed_at)
              : "待填写"}
          </span>
        </div>
        <div>
          {agentText("agentChat.harness.generated.7b48e37522", "风险等级：")}
          <span className="ml-1 text-foreground">
            {formatReviewDecisionRiskLevelLabel(
              reviewDecisionTemplate.decision.risk_level,
            )}
          </span>
        </div>
      </div>
      <div className="mt-3 space-y-3 text-xs leading-5 text-muted-foreground">
        <ReviewDecisionTextBlock
          title={agentText(
            "agentChat.harness.generated.8480d012ec",
            "决策摘要",
          )}
          value={
            reviewDecisionTemplate.decision.decision_summary ||
            "尚未填写决策摘要。"
          }
        />
        <ReviewDecisionTextBlock
          title={agentText(
            "agentChat.harness.generated.b0be2cde74",
            "采用的修复策略",
          )}
          value={
            reviewDecisionTemplate.decision.chosen_fix_strategy ||
            "尚未填写修复策略。"
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <ReviewDecisionListBlock
            title={agentText(
              "agentChat.harness.generated.30861463a7",
              "回归要求",
            )}
            items={reviewDecisionTemplate.decision.regression_requirements}
            emptyText={agentText(
              "agentChat.harness.generated.5702b85071",
              "尚未填写回归要求。",
            )}
          />
          <ReviewDecisionListBlock
            title={agentText(
              "agentChat.harness.generated.db26286d9f",
              "后续动作",
            )}
            items={reviewDecisionTemplate.decision.followup_actions}
            emptyText={agentText(
              "agentChat.harness.generated.84cf3cd090",
              "尚未填写后续动作。",
            )}
          />
        </div>
        {reviewDecisionTemplate.decision.notes ? (
          <ReviewDecisionTextBlock
            title={agentText(
              "agentChat.harness.generated.d7343a628d",
              "审核备注",
            )}
            value={reviewDecisionTemplate.decision.notes}
          />
        ) : null}
      </div>
    </div>
  );
}

function ReviewDecisionTextBlock({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div>
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-1 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function ReviewDecisionListBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: readonly string[];
  emptyText: string;
}) {
  return (
    <div>
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-1 space-y-1">
        {items.length > 0 ? (
          items.map((item) => <div key={item}>- {item}</div>)
        ) : (
          <div>{emptyText}</div>
        )}
      </div>
    </div>
  );
}
