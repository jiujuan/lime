import { useMemo, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  FileText,
  GitCompare,
  ShieldAlert,
  TerminalSquare,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentI18nKey } from "@/i18n/agentResources";
import { cn } from "@/lib/utils";

export type CodeWorkbenchGuideTarget =
  | "runtime"
  | "approvals"
  | "writes"
  | "outputs"
  | "file_review";

type CodeWorkbenchGuideStage =
  | "approval"
  | "writing"
  | "review"
  | "outputs"
  | "ready";

interface CodeWorkbenchGuideProps {
  pendingApprovalsCount: number;
  activeWriteCount: number;
  outputSignalCount: number;
  pendingFileChangeCount: number;
  totalFileChangeCount: number;
  latestFileName?: string | null;
  hasRuntimeStatus: boolean;
  hasFileCheckpoints: boolean;
  onOpenSection: (target: CodeWorkbenchGuideTarget) => void;
}

interface CodeWorkbenchGuidePresentation {
  stage: CodeWorkbenchGuideStage;
  titleKey: AgentI18nKey;
  descriptionKey: AgentI18nKey;
  actionKey: AgentI18nKey;
  target: CodeWorkbenchGuideTarget;
  icon: ComponentType<{ className?: string }>;
  toneClassName: string;
  showCheckpointMetric: boolean;
}

const GUIDE_BY_STAGE: Record<
  CodeWorkbenchGuideStage,
  CodeWorkbenchGuidePresentation
> = {
  approval: {
    stage: "approval",
    titleKey: "agentChat.harness.codeWorkbench.stage.approval.title",
    descriptionKey:
      "agentChat.harness.codeWorkbench.stage.approval.description",
    actionKey: "agentChat.harness.codeWorkbench.stage.approval.action",
    target: "approvals",
    icon: ShieldAlert,
    toneClassName: "border-amber-200 bg-amber-50 text-amber-950",
    showCheckpointMetric: false,
  },
  writing: {
    stage: "writing",
    titleKey: "agentChat.harness.codeWorkbench.stage.writing.title",
    descriptionKey:
      "agentChat.harness.codeWorkbench.stage.writing.description",
    actionKey: "agentChat.harness.codeWorkbench.stage.writing.action",
    target: "writes",
    icon: FileText,
    toneClassName: "border-sky-200 bg-sky-50 text-sky-950",
    showCheckpointMetric: false,
  },
  review: {
    stage: "review",
    titleKey: "agentChat.harness.codeWorkbench.stage.review.title",
    descriptionKey:
      "agentChat.harness.codeWorkbench.stage.review.description",
    actionKey: "agentChat.harness.codeWorkbench.stage.review.action",
    target: "file_review",
    icon: GitCompare,
    toneClassName: "border-sky-200 bg-sky-50 text-sky-950",
    showCheckpointMetric: true,
  },
  outputs: {
    stage: "outputs",
    titleKey: "agentChat.harness.codeWorkbench.stage.outputs.title",
    descriptionKey:
      "agentChat.harness.codeWorkbench.stage.outputs.description",
    actionKey: "agentChat.harness.codeWorkbench.stage.outputs.action",
    target: "outputs",
    icon: TerminalSquare,
    toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-950",
    showCheckpointMetric: true,
  },
  ready: {
    stage: "ready",
    titleKey: "agentChat.harness.codeWorkbench.stage.ready.title",
    descriptionKey:
      "agentChat.harness.codeWorkbench.stage.ready.description",
    actionKey: "agentChat.harness.codeWorkbench.stage.ready.action",
    target: "runtime",
    icon: Workflow,
    toneClassName: "border-slate-200 bg-slate-50 text-slate-950",
    showCheckpointMetric: false,
  },
};

function resolveGuideStage({
  pendingApprovalsCount,
  activeWriteCount,
  pendingFileChangeCount,
  outputSignalCount,
}: Pick<
  CodeWorkbenchGuideProps,
  | "pendingApprovalsCount"
  | "activeWriteCount"
  | "pendingFileChangeCount"
  | "outputSignalCount"
>): CodeWorkbenchGuideStage {
  if (pendingApprovalsCount > 0) {
    return "approval";
  }
  if (activeWriteCount > 0) {
    return "writing";
  }
  if (pendingFileChangeCount > 0) {
    return "review";
  }
  if (outputSignalCount > 0) {
    return "outputs";
  }
  return "ready";
}

export function CodeWorkbenchGuide({
  pendingApprovalsCount,
  activeWriteCount,
  outputSignalCount,
  pendingFileChangeCount,
  totalFileChangeCount,
  latestFileName,
  hasRuntimeStatus,
  hasFileCheckpoints,
  onOpenSection,
}: CodeWorkbenchGuideProps) {
  const { t } = useTranslation("agent");
  const stage = resolveGuideStage({
    pendingApprovalsCount,
    activeWriteCount,
    pendingFileChangeCount,
    outputSignalCount,
  });
  const presentation = GUIDE_BY_STAGE[stage];
  const Icon = presentation.icon;
  const description = t(presentation.descriptionKey, {
    approvals: pendingApprovalsCount,
    writes: activeWriteCount,
    outputs: outputSignalCount,
    pending: pendingFileChangeCount,
    total: totalFileChangeCount,
    file: latestFileName || t("agentChat.harness.codeWorkbench.fileFallback"),
  });
  const metricItems = useMemo(
    () => [
      {
        key: "approvals",
        label: t("agentChat.harness.codeWorkbench.metric.approvals", {
          count: pendingApprovalsCount,
        }),
        active: pendingApprovalsCount > 0,
      },
      {
        key: "writes",
        label: t("agentChat.harness.codeWorkbench.metric.writes", {
          count: activeWriteCount,
        }),
        active: activeWriteCount > 0,
      },
      {
        key: "outputs",
        label: t("agentChat.harness.codeWorkbench.metric.outputs", {
          count: outputSignalCount,
        }),
        active: outputSignalCount > 0,
      },
      {
        key: "file_changes",
        label: t("agentChat.harness.codeWorkbench.metric.fileChanges", {
          pending: pendingFileChangeCount,
          total: totalFileChangeCount,
        }),
        active: pendingFileChangeCount > 0,
      },
    ],
    [
      activeWriteCount,
      outputSignalCount,
      pendingApprovalsCount,
      pendingFileChangeCount,
      t,
      totalFileChangeCount,
    ],
  );
  const canOpenTarget = presentation.target !== "runtime" || hasRuntimeStatus;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        presentation.toneClassName,
      )}
      data-testid="code-workbench-guide"
      data-stage={presentation.stage}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/15 bg-white/70">
              <Icon className="h-4 w-4" />
            </span>
            <div className="text-sm font-semibold">
              {t("agentChat.harness.codeWorkbench.title")}
            </div>
            <Badge
              variant="outline"
              className="border-current/20 bg-white/70 text-current"
            >
              {t("agentChat.harness.codeWorkbench.badge")}
            </Badge>
          </div>
          <div className="mt-2 text-sm font-medium">
            {t(presentation.titleKey)}
          </div>
          <p className="mt-1 text-xs leading-5 text-current/80">
            {description}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 border-current/20 bg-white/80 text-current hover:bg-white"
          disabled={!canOpenTarget}
          onClick={() => onOpenSection(presentation.target)}
          data-testid="code-workbench-guide-primary-action"
        >
          {t(presentation.actionKey)}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {metricItems.map((item) => (
          <span
            key={item.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
              item.active
                ? "border-current/25 bg-white/80 text-current"
                : "border-current/10 bg-white/50 text-current/60",
            )}
            data-testid={`code-workbench-guide-metric-${item.key}`}
            data-active={String(item.active)}
          >
            {item.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            {item.label}
          </span>
        ))}
        {hasFileCheckpoints && presentation.showCheckpointMetric ? (
          <span
            className="inline-flex items-center rounded-full border border-current/10 bg-white/50 px-2.5 py-1 text-xs text-current/70"
            data-testid="code-workbench-guide-metric-checkpoints"
          >
            {t("agentChat.harness.codeWorkbench.metric.checkpoints")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
