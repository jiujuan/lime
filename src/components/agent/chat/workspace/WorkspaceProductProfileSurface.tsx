import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  History,
  Image,
  ImagePlus,
  ListChecks,
  PackageCheck,
  PenLine,
  RefreshCcw,
  Sparkles,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Artifact } from "@/lib/artifact/types";
import type {
  WorkspaceProductProfileActionHistoryItem,
  WorkspaceProductProfileActionHistoryStatus,
} from "./workspaceProductProfileActionHistory";
import type {
  WorkspaceProductProfileWorkerEvidenceItem,
  WorkspaceProductProfileWorkerEvidenceStatus,
} from "./workspaceProductProfileWorkerEvidence";
import type {
  WorkspaceProductProfileActionIntent,
  WorkspaceProductProfileAction,
  WorkspaceProductObject,
  WorkspaceProductObjectStatus,
  WorkspaceProductProfile,
  WorkspaceProductProfileSurfaceLayout,
  WorkspaceProductProfileStructuredPreview,
} from "./workspaceProductProfileModel";
import { buildWorkspaceProductProfileViewModel } from "./workspaceProductProfileModel";
import { WorkspaceProductProfileImageCell } from "./WorkspaceProductProfileImageCell";
import { buildWorkspaceProductProfilePreviewArtifact } from "./workspaceProductProfilePreviewArtifact";
import {
  WorkspaceProductProfileRendererHostCard,
} from "./WorkspaceProductProfileRendererHost";
import { buildWorkspaceProductProfileRendererHost } from "./workspaceProductProfileRendererHostModel";
import {
  buildWorkspaceProductObjectKey,
  readWorkspaceProductProfileSelectedObjectKey,
  writeWorkspaceProductProfileSelectedObjectKey,
} from "./workspaceProductProfileSelection";
import type { WorkspaceProductProfileSelectionChange } from "./workspaceProductProfileSelectionWriteback";

interface WorkspaceProductProfileSurfaceProps {
  profile: WorkspaceProductProfile;
  actionsDisabled?: boolean;
  onActionIntent?: (intent: WorkspaceProductProfileActionIntent) => void;
  onOpenPreviewArtifact?: (artifact: Artifact) => void;
  onSelectedObjectChange?: (
    change: WorkspaceProductProfileSelectionChange,
  ) => void;
}

type WorkspaceDynamicTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

const STATUS_LABEL_KEYS: Record<WorkspaceProductObjectStatus, string> = {
  draft: "workspace.productProfile.status.draft",
  generating: "workspace.productProfile.status.generating",
  ready: "workspace.productProfile.status.ready",
  needs_review: "workspace.productProfile.status.needsReview",
  archived: "workspace.productProfile.status.archived",
  failed: "workspace.productProfile.status.failed",
  unknown: "workspace.productProfile.status.unknown",
};

const STATUS_FALLBACKS: Record<WorkspaceProductObjectStatus, string> = {
  draft: "草稿",
  generating: "生成中",
  ready: "已就绪",
  needs_review: "待复核",
  archived: "已归档",
  failed: "失败",
  unknown: "未知",
};

export function WorkspaceProductProfileSurface({
  actionsDisabled = false,
  onOpenPreviewArtifact,
  onSelectedObjectChange,
  profile,
  onActionIntent,
}: WorkspaceProductProfileSurfaceProps) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const [selectedObjectKey, setSelectedObjectKey] = useState<string | null>(
    null,
  );
  const [pendingActionConfirmKey, setPendingActionConfirmKey] = useState<
    string | null
  >(null);
  const profileSelectionSignature = useMemo(
    () =>
      [
        profile.workspaceId ?? "",
        profile.sessionId,
        profile.appId,
        profile.objects.map(buildWorkspaceProductObjectKey).join("|"),
      ].join("::"),
    [profile],
  );
  const persistedSelectedObjectKey = useMemo(
    () => readWorkspaceProductProfileSelectedObjectKey(profile),
    [profile],
  );
  useEffect(() => {
    setSelectedObjectKey(null);
  }, [profileSelectionSignature]);
  const activeProfile = useMemo(() => {
    const activeObjectKey = selectedObjectKey ?? persistedSelectedObjectKey;
    const selectedObject = activeObjectKey
      ? profile.objects.find((object) => objectKey(object) === activeObjectKey)
      : null;
    if (!selectedObject) {
      return profile;
    }
    return {
      ...profile,
      selectedObjectRef: selectedObject.ref,
    };
  }, [profile, persistedSelectedObjectKey, selectedObjectKey]);
  const viewModel = buildWorkspaceProductProfileViewModel(activeProfile);
  const previewArtifact = onOpenPreviewArtifact
    ? buildWorkspaceProductProfilePreviewArtifact({
        artifactIds: viewModel.selectedArtifactIds,
        layout: viewModel.selectedSurface.layout,
        object: viewModel.selectedObject,
        preview: viewModel.selectedPreview,
        profile: activeProfile,
      })
    : null;
  const canOpenPreviewArtifact = Boolean(
    onOpenPreviewArtifact && previewArtifact,
  );
  const hasProductActions = Boolean(
    onActionIntent && viewModel.selectedActions.length > 0,
  );
  const selectedProductObjectKey = objectKey(viewModel.selectedObject);
  useEffect(() => {
    setPendingActionConfirmKey(null);
  }, [selectedProductObjectKey]);

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)] text-[color:var(--lime-text)]"
      data-testid="workspace-product-profile-surface"
    >
      <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
            <PackageCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {t("workspace.productProfile.title")}
            </h2>
            <p className="mt-0.5 truncate text-xs text-[color:var(--lime-text-muted)]">
              {t("workspace.productProfile.subtitle", {
                count: viewModel.objectCount,
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-normal text-[color:var(--lime-text-muted)]">
                {t("workspace.productProfile.selectedObject")}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                {viewModel.selectedObject.title}
              </div>
              <div className="mt-0.5 text-xs text-[color:var(--lime-text-muted)]">
                {dynamicT(viewModel.selectedSurface.titleKey)}
              </div>
            </div>
            <StatusBadge status={viewModel.selectedObject.status} />
          </div>
          {viewModel.selectedObject.summary ? (
            <p className="mt-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
              {viewModel.selectedObject.summary}
            </p>
          ) : null}
          {canOpenPreviewArtifact || hasProductActions ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {onOpenPreviewArtifact && previewArtifact ? (
                <button
                  type="button"
                  className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 text-xs font-medium text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)]"
                  onClick={() => onOpenPreviewArtifact(previewArtifact)}
                  aria-label={t("workspace.productProfile.openPreviewAria", {
                    title: viewModel.selectedObject.title,
                  })}
                  data-testid="workspace-product-profile-open-preview"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {t("workspace.productProfile.openPreview")}
                  </span>
                </button>
              ) : null}
              {onActionIntent
                ? viewModel.selectedActions.map((action) => {
                    const actionConfirmKey = `${selectedProductObjectKey}:${action.key}`;
                    const confirmationPending =
                      action.risk === "write" &&
                      pendingActionConfirmKey === actionConfirmKey;
                    return (
                      <ProductProfileActionButton
                        key={action.key}
                        action={action}
                        confirmationPending={confirmationPending}
                        disabled={actionsDisabled}
                        onClick={() => {
                          if (
                            action.risk === "write" &&
                            pendingActionConfirmKey !== actionConfirmKey
                          ) {
                            setPendingActionConfirmKey(actionConfirmKey);
                            return;
                          }
                          setPendingActionConfirmKey(null);
                          const prompt = dynamicT(action.promptKey, {
                            objectTitle: viewModel.selectedObject.title,
                            objectKind: viewModel.selectedObject.ref.kind,
                            taskKind: action.taskKind ?? "",
                          });
                          onActionIntent({
                            action,
                            object: viewModel.selectedObject,
                            profile: activeProfile,
                            prompt,
                          });
                        }}
                      />
                    );
                  })
                : null}
            </div>
          ) : null}
        </div>

        <ProductProfileObjectPreview
          artifactIds={viewModel.selectedArtifactIds}
          layout={viewModel.selectedSurface.layout}
          object={viewModel.selectedObject}
          preview={viewModel.selectedPreview}
          statusCounts={viewModel.statusCounts}
        />

        {viewModel.latestSelectedAction ? (
          <ProductProfileActionHistoryCard
            actions={viewModel.selectedActionHistory}
            latestAction={viewModel.latestSelectedAction}
          />
        ) : null}

        {viewModel.latestWorkerEvidence ? (
          <ProductProfileWorkerEvidenceCard
            evidence={viewModel.workerEvidence}
            latestEvidence={viewModel.latestWorkerEvidence}
          />
        ) : null}

        <dl className="grid gap-2 text-xs">
          <MetaRow
            label={t("workspace.productProfile.app")}
            value={viewModel.appId}
          />
          <MetaRow
            label={t("workspace.productProfile.session")}
            value={viewModel.sessionId}
          />
          <MetaRow
            label={t("workspace.productProfile.workspace")}
            value={viewModel.workspaceId ?? ""}
          />
          <MetaRow
            label={t("workspace.productProfile.updatedAt")}
            value={viewModel.updatedAt ?? ""}
          />
        </dl>

        <div className="grid gap-2">
          {viewModel.objects.map((object) => (
            <ProductObjectRow
              key={objectKey(object)}
              object={object}
              selected={
                objectKey(object) === objectKey(viewModel.selectedObject)
              }
              onSelect={() => {
                const nextObjectKey = objectKey(object);
                setSelectedObjectKey(nextObjectKey);
                writeWorkspaceProductProfileSelectedObjectKey(
                  profile,
                  nextObjectKey,
                );
                onSelectedObjectChange?.({ profile, object });
              }}
            />
          ))}
        </div>

        {viewModel.sourceArtifacts.length > 0 ? (
          <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-xs text-[color:var(--lime-text-muted)]">
            {t("workspace.productProfile.sourceArtifacts", {
              count: viewModel.sourceArtifacts.length,
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const ACTION_HISTORY_STATUS_KEYS: Record<
  WorkspaceProductProfileActionHistoryStatus,
  string
> = {
  running: "workspace.productProfile.actionHistory.status.running",
  completed: "workspace.productProfile.actionHistory.status.completed",
  failed: "workspace.productProfile.actionHistory.status.failed",
  canceled: "workspace.productProfile.actionHistory.status.canceled",
  unknown: "workspace.productProfile.actionHistory.status.unknown",
};

const WORKER_EVIDENCE_STATUS_KEYS: Record<
  WorkspaceProductProfileWorkerEvidenceStatus,
  string
> = {
  completed: "workspace.productProfile.workerEvidence.status.completed",
  failed: "workspace.productProfile.workerEvidence.status.failed",
  unknown: "workspace.productProfile.workerEvidence.status.unknown",
};

function ProductProfileActionHistoryCard({
  actions,
  latestAction,
}: {
  actions: readonly WorkspaceProductProfileActionHistoryItem[];
  latestAction: WorkspaceProductProfileActionHistoryItem;
}) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const actionLabel = dynamicT(
    `workspace.productProfile.action.${snakeToCamel(latestAction.key)}`,
    { defaultValue: latestAction.key },
  );

  return (
    <div
      className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
      data-testid="workspace-product-profile-action-history"
    >
      <ProductProfilePreviewHeader
        icon={<History className="h-4 w-4" />}
        title={dynamicT("workspace.productProfile.actionHistory.title")}
        detail={dynamicT("workspace.productProfile.actionHistory.count", {
          count: actions.length,
        })}
      />
      <div className="mt-3 grid gap-2 text-xs">
        <MetaRow
          label={dynamicT("workspace.productProfile.actionHistory.latest")}
          value={actionLabel}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.actionHistory.status")}
          value={dynamicT(ACTION_HISTORY_STATUS_KEYS[latestAction.status])}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.actionHistory.turn")}
          value={latestAction.turnId}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.actionHistory.result")}
          value={formatActionResult(dynamicT, latestAction)}
        />
        {latestAction.errorMessage || latestAction.errorCode ? (
          <MetaRow
            label={dynamicT("workspace.productProfile.actionHistory.error")}
            value={
              latestAction.errorMessage ?? latestAction.errorCode ?? ""
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function formatActionResult(
  t: WorkspaceDynamicTranslation,
  action: WorkspaceProductProfileActionHistoryItem,
): string {
  const resultArtifacts = action.resultArtifacts ?? [];
  if (resultArtifacts.length === 0) {
    return t("workspace.productProfile.actionHistory.resultEmpty");
  }
  const firstArtifact = resultArtifacts[0];
  const firstTitle =
    firstArtifact.title || firstArtifact.artifactId || firstArtifact.artifactRef;
  if (resultArtifacts.length === 1) {
    return firstTitle;
  }
  return t("workspace.productProfile.actionHistory.resultCount", {
    count: resultArtifacts.length,
    title: firstTitle,
  });
}

function ProductProfileWorkerEvidenceCard({
  evidence,
  latestEvidence,
}: {
  evidence: readonly WorkspaceProductProfileWorkerEvidenceItem[];
  latestEvidence: WorkspaceProductProfileWorkerEvidenceItem;
}) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const statusLabel = dynamicT(
    WORKER_EVIDENCE_STATUS_KEYS[latestEvidence.status],
  );

  return (
    <div
      className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
      data-testid="workspace-product-profile-worker-evidence"
    >
      <ProductProfilePreviewHeader
        icon={<Activity className="h-4 w-4" />}
        title={dynamicT("workspace.productProfile.workerEvidence.title")}
        detail={dynamicT("workspace.productProfile.workerEvidence.count", {
          count: evidence.length,
        })}
      />
      <div className="mt-3 grid gap-2 text-xs">
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.status")}
          value={statusLabel}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.task")}
          value={latestEvidence.taskId ?? ""}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.taskKind")}
          value={latestEvidence.taskKind ?? ""}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.turn")}
          value={latestEvidence.turnId ?? ""}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.artifact")}
          value={latestEvidence.artifactRef ?? ""}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.event")}
          value={latestEvidence.eventType ?? latestEvidence.source}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.input")}
          value={latestEvidence.inputSummary ?? ""}
        />
        <MetaRow
          label={dynamicT("workspace.productProfile.workerEvidence.output")}
          value={formatWorkerOutput(dynamicT, latestEvidence)}
        />
        {latestEvidence.failureCategory ? (
          <MetaRow
            label={dynamicT(
              "workspace.productProfile.workerEvidence.failureCategory",
            )}
            value={latestEvidence.failureCategory}
          />
        ) : null}
        {latestEvidence.retryAdvice ? (
          <MetaRow
            label={dynamicT("workspace.productProfile.workerEvidence.retry")}
            value={formatWorkerRetry(dynamicT, latestEvidence)}
          />
        ) : null}
        {latestEvidence.workerEntrypoint ? (
          <MetaRow
            label={dynamicT(
              "workspace.productProfile.workerEvidence.entrypoint",
            )}
            value={latestEvidence.workerEntrypoint}
          />
        ) : null}
        {latestEvidence.errorMessage ? (
          <MetaRow
            label={dynamicT("workspace.productProfile.workerEvidence.error")}
            value={
              latestEvidence.errorCode
                ? `${latestEvidence.errorCode}: ${latestEvidence.errorMessage}`
                : latestEvidence.errorMessage
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function formatWorkerOutput(
  t: WorkspaceDynamicTranslation,
  evidence: WorkspaceProductProfileWorkerEvidenceItem,
): string {
  if (evidence.outputSummary) {
    return evidence.outputSummary;
  }
  if (typeof evidence.outputObjectCount === "number") {
    return t("workspace.productProfile.workerEvidence.outputObjectCount", {
      count: evidence.outputObjectCount,
    });
  }
  return "";
}

function formatWorkerRetry(
  t: WorkspaceDynamicTranslation,
  evidence: WorkspaceProductProfileWorkerEvidenceItem,
): string {
  const retryable = evidence.retryable
    ? t("workspace.productProfile.workerEvidence.retryable.yes")
    : t("workspace.productProfile.workerEvidence.retryable.no");
  const attempts =
    typeof evidence.retryAttempt === "number" &&
    typeof evidence.retryMaxAttempts === "number" &&
    evidence.retryMaxAttempts > 0
      ? ` ${evidence.retryAttempt}/${evidence.retryMaxAttempts}`
      : "";
  return [retryable, evidence.retryAdvice, attempts.trim()]
    .filter(Boolean)
    .join(" · ");
}

function ProductProfileObjectPreview({
  artifactIds,
  layout,
  object,
  preview,
  statusCounts,
}: {
  artifactIds: string[];
  layout: WorkspaceProductProfileSurfaceLayout;
  object: WorkspaceProductObject;
  preview: WorkspaceProductProfileStructuredPreview;
  statusCounts: Record<WorkspaceProductObjectStatus, number>;
}) {
  const { t } = useTranslation("workspace");
  const rendererHost = buildWorkspaceProductProfileRendererHost(object);
  if (rendererHost) {
    return (
      <WorkspaceProductProfileRendererHostCard
        artifactIds={artifactIds}
        rendererHost={rendererHost}
      />
    );
  }

  if (layout === "imageGrid") {
    const imageCells =
      preview.images.length > 0
        ? preview.images.slice(0, 6)
        : artifactIds.length > 0
          ? artifactIds.slice(0, 6).map((artifactId) => ({
              id: artifactId,
              title: artifactId,
              url: null,
              alt: null,
              prompt: null,
            }))
          : [
              {
                id: object.ref.id,
                title: t("workspace.productProfile.preview.waitingImage"),
                url: null,
                alt: null,
                prompt: null,
              },
            ];
    return (
      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
        <ProductProfilePreviewHeader
          icon={<ImagePlus className="h-4 w-4" />}
          title={t("workspace.productProfile.preview.imageGrid")}
          detail={t("workspace.productProfile.preview.artifactCount", {
            count: Math.max(artifactIds.length, preview.images.length),
          })}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {imageCells.map((image, index) => (
            <WorkspaceProductProfileImageCell
              key={`${image.id}:${index}`}
              image={image}
            />
          ))}
        </div>
      </div>
    );
  }

  if (layout === "storyboard") {
    const rows =
      preview.storyboard.length > 0
        ? preview.storyboard.slice(0, 4)
        : artifactIds.length > 0
          ? artifactIds.slice(0, 4).map((artifactId, index) => ({
              id: artifactId,
              title: artifactId,
              description: null,
              visualPrompt: null,
              duration: String(index + 1),
            }))
          : [
              {
                id: object.ref.id,
                title: t("workspace.productProfile.preview.waitingStoryboard"),
                description: null,
                visualPrompt: null,
                duration: "1",
              },
            ];
    return (
      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
        <ProductProfilePreviewHeader
          icon={<Video className="h-4 w-4" />}
          title={t("workspace.productProfile.preview.storyboard")}
          detail={
            object.summary ||
            t("workspace.productProfile.preview.storyboardEmpty")
          }
        />
        <div className="mt-3 grid gap-2">
          {rows.map((row, index) => (
            <div
              key={`${row.id}:${index}`}
              className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-2 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2"
              data-testid="workspace-product-profile-storyboard-row"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--lime-surface)] text-xs font-semibold text-[color:var(--lime-text-muted)]">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-[color:var(--lime-text-strong)]">
                  {row.title}
                </span>
                {row.description || row.visualPrompt ? (
                  <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-[color:var(--lime-text-muted)]">
                    {row.description ?? row.visualPrompt}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === "checklist") {
    return (
      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
        <ProductProfilePreviewHeader
          icon={<ClipboardCheck className="h-4 w-4" />}
          title={t("workspace.productProfile.preview.checklist")}
          detail={
            object.summary ||
            t("workspace.productProfile.preview.checklistEmpty")
          }
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <ChecklistMetric
            label={t("workspace.productProfile.status.ready")}
            value={statusCounts.ready}
          />
          <ChecklistMetric
            label={t("workspace.productProfile.status.needsReview")}
            value={statusCounts.needs_review}
          />
          <ChecklistMetric
            label={t("workspace.productProfile.status.failed")}
            value={statusCounts.failed}
          />
        </div>
        {preview.checklist.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {preview.checklist.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2"
                data-testid="workspace-product-profile-checklist-item"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-xs font-medium text-[color:var(--lime-text-strong)]">
                    {item.title}
                  </span>
                  {item.status ? (
                    <span className="shrink-0 rounded-full bg-[color:var(--lime-surface)] px-2 py-0.5 text-[10px] text-[color:var(--lime-text-muted)]">
                      {item.status}
                    </span>
                  ) : null}
                </div>
                {item.notes ? (
                  <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[color:var(--lime-text-muted)]">
                    {item.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (layout === "briefForm") {
    return (
      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
        <ProductProfilePreviewHeader
          icon={<Sparkles className="h-4 w-4" />}
          title={t("workspace.productProfile.preview.brief")}
          detail={
            object.summary || t("workspace.productProfile.preview.briefEmpty")
          }
        />
        {preview.briefFields.length > 0 ? (
          <dl className="mt-3 grid gap-2">
            {preview.briefFields.slice(0, 6).map((field) => (
              <div
                key={field.key}
                className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2"
              >
                <dt className="text-[11px] text-[color:var(--lime-text-muted)]">
                  {field.label}
                </dt>
                <dd className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-strong)]">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    );
  }

  const documentDetail =
    preview.documentText ||
    artifactIds[0] ||
    object.summary ||
    t("workspace.productProfile.preview.documentEmpty");
  return (
    <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
      <ProductProfilePreviewHeader
        icon={<FileText className="h-4 w-4" />}
        title={t(
          layout === "document"
            ? "workspace.productProfile.preview.document"
            : "workspace.productProfile.preview.generic",
        )}
        detail={documentDetail}
      />
      {preview.documentText ? (
        <div
          className="mt-3 max-h-44 overflow-hidden whitespace-pre-wrap rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-3 py-2 text-xs leading-5 text-[color:var(--lime-text)]"
          data-testid="workspace-product-profile-document-preview"
        >
          {preview.documentText}
        </div>
      ) : null}
      <ProductProfileWritingStructure preview={preview} />
    </div>
  );
}

function ProductProfileWritingStructure({
  preview,
}: {
  preview: WorkspaceProductProfileStructuredPreview;
}) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const sectionCount = [
    preview.researchRounds.length,
    preview.titleCandidates.length,
    preview.outline.length,
    preview.keyTakeaways.length,
    preview.citations.length,
    preview.imageSlots.length,
    preview.writingPlan.length,
    preview.reviewNotes.length,
  ].filter((count) => count > 0).length;

  if (sectionCount === 0) {
    return null;
  }

  return (
    <div
      className="mt-3 border-t border-[color:var(--lime-surface-border)] pt-3"
      data-testid="workspace-product-profile-writing-structure"
    >
      <ProductProfilePreviewHeader
        icon={<ListChecks className="h-4 w-4" />}
        title={dynamicT("workspace.productProfile.writingStructure.title")}
        detail={dynamicT("workspace.productProfile.writingStructure.detail", {
          count: sectionCount,
        })}
      />
      <div className="mt-3 grid gap-2">
        {preview.researchRounds.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.research",
            )}
            count={preview.researchRounds.length}
            testId="workspace-product-profile-writing-research"
          >
            {preview.researchRounds.slice(0, 3).map((round) => (
              <WritingPreviewItem
                key={round.id}
                title={round.title}
                meta={joinMetaParts([
                  round.query,
                  round.status,
                  round.citations.length > 0
                    ? dynamicT(
                        "workspace.productProfile.writingStructure.citationCount",
                        { count: round.citations.length },
                      )
                    : null,
                ])}
                detail={round.summary}
              />
            ))}
          </WritingPreviewSection>
        ) : null}

        {preview.outline.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.outline",
            )}
            count={preview.outline.length}
            testId="workspace-product-profile-writing-outline"
          >
            {preview.outline.slice(0, 4).map((section) => (
              <WritingPreviewItem
                key={section.id}
                title={section.title}
                meta={section.purpose}
                detail={section.points.slice(0, 2).join(" · ")}
              />
            ))}
          </WritingPreviewSection>
        ) : null}

        {preview.titleCandidates.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.titleCandidates",
            )}
            count={preview.titleCandidates.length}
            testId="workspace-product-profile-writing-title-candidates"
          >
            {preview.titleCandidates.slice(0, 3).map((candidate) => (
              <WritingPreviewItem
                key={candidate.id}
                title={candidate.title}
                meta={joinMetaParts([
                  candidate.angle,
                  typeof candidate.score === "number"
                    ? dynamicT(
                        "workspace.productProfile.writingStructure.score",
                        { score: candidate.score },
                      )
                    : null,
                ])}
              />
            ))}
          </WritingPreviewSection>
        ) : null}

        {preview.keyTakeaways.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.keyTakeaways",
            )}
            count={preview.keyTakeaways.length}
            testId="workspace-product-profile-writing-key-takeaways"
          >
            {preview.keyTakeaways.slice(0, 3).map((takeaway, index) => (
              <WritingPreviewItem
                key={`${takeaway}:${index}`}
                title={takeaway}
              />
            ))}
          </WritingPreviewSection>
        ) : null}

        {preview.citations.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.citations",
            )}
            count={preview.citations.length}
            testId="workspace-product-profile-writing-citations"
          >
            {preview.citations.slice(0, 4).map((citation) => (
              <WritingPreviewItem
                key={citation.id}
                title={citation.title}
                meta={joinMetaParts([
                  citation.sourceType,
                  citation.status,
                ])}
                detail={citation.summary}
              />
            ))}
          </WritingPreviewSection>
        ) : null}

        {preview.imageSlots.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.imageSlots",
            )}
            count={preview.imageSlots.length}
            testId="workspace-product-profile-writing-image-slots"
          >
            {preview.imageSlots.slice(0, 4).map((slot) => (
              <WritingPreviewItem
                key={slot.id}
                title={slot.title}
                meta={joinMetaParts([
                  slot.sectionId,
                  slot.status,
                  slot.purpose,
                ])}
                detail={slot.prompt}
              />
            ))}
          </WritingPreviewSection>
        ) : null}

        {preview.writingPlan.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.writingPlan",
            )}
            count={preview.writingPlan.length}
            testId="workspace-product-profile-writing-plan"
          >
            {preview.writingPlan.slice(0, 4).map((step) => (
              <WritingPreviewItem
                key={step.id}
                title={step.title}
                meta={joinMetaParts([
                  step.owner,
                  step.skillRef,
                  step.done === null || step.done === undefined
                    ? null
                    : dynamicT(
                        step.done
                          ? "workspace.productProfile.writingStructure.done"
                          : "workspace.productProfile.writingStructure.pending",
                      ),
                ])}
                detail={step.output ?? step.goal}
              />
            ))}
          </WritingPreviewSection>
        ) : null}

        {preview.reviewNotes.length > 0 ? (
          <WritingPreviewSection
            title={dynamicT(
              "workspace.productProfile.writingStructure.reviewNotes",
            )}
            count={preview.reviewNotes.length}
            testId="workspace-product-profile-writing-review-notes"
          >
            {preview.reviewNotes.slice(0, 3).map((note, index) => (
              <WritingPreviewItem key={`${note}:${index}`} title={note} />
            ))}
          </WritingPreviewSection>
        ) : null}
      </div>
    </div>
  );
}

function WritingPreviewSection({
  children,
  count,
  testId,
  title,
}: {
  children: ReactNode;
  count: number;
  testId: string;
  title: string;
}) {
  const { t } = useTranslation("workspace");
  return (
    <section
      className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2.5 py-2"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-xs font-medium text-[color:var(--lime-text-strong)]">
          {title}
        </h3>
        <span className="shrink-0 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 py-0.5 text-[10px] text-[color:var(--lime-text-muted)]">
          {t("workspace.productProfile.writingStructure.itemCount", {
            count,
          })}
        </span>
      </div>
      <div className="mt-2 grid gap-1.5">{children}</div>
    </section>
  );
}

function WritingPreviewItem({
  detail,
  meta,
  title,
}: {
  detail?: string | null;
  meta?: string | null;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-[color:var(--lime-surface)] px-2 py-1.5">
      <div className="truncate text-xs font-medium text-[color:var(--lime-text-strong)]">
        {title}
      </div>
      {meta ? (
        <div className="mt-0.5 truncate text-[11px] text-[color:var(--lime-text-muted)]">
          {meta}
        </div>
      ) : null}
      {detail ? (
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[color:var(--lime-text-muted)]">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function joinMetaParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function ProductProfilePreviewHeader({
  detail,
  icon,
  title,
}: {
  detail: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-[color:var(--lime-text-strong)]">
          {title}
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
          {detail}
        </div>
      </div>
    </div>
  );
}

function ChecklistMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2">
      <div className="text-[11px] text-[color:var(--lime-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[color:var(--lime-text-strong)]">
        {value}
      </div>
    </div>
  );
}

function ProductProfileActionButton({
  action,
  confirmationPending,
  disabled,
  onClick,
}: {
  action: WorkspaceProductProfileAction;
  confirmationPending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const actionLabel = dynamicT(action.labelKey);
  return (
    <button
      type="button"
      className={`inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        confirmationPending
          ? "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-strong)]"
          : "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-strong)] hover:bg-[color:var(--lime-surface-hover)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      aria-label={
        confirmationPending
          ? t("workspace.productProfile.actionConfirmAria", {
              action: actionLabel,
            })
          : actionLabel
      }
      data-confirmation-pending={confirmationPending ? "true" : "false"}
      data-testid={`workspace-product-profile-action-${action.key}`}
    >
      {confirmationPending ? (
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <ProductProfileActionIcon actionKey={action.key} />
      )}
      <span className="truncate">
        {confirmationPending
          ? t("workspace.productProfile.actionConfirm", {
              action: actionLabel,
            })
          : actionLabel}
      </span>
    </button>
  );
}

function ProductProfileActionIcon({ actionKey }: { actionKey: string }) {
  if (actionKey.includes("approve")) {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
  }
  if (actionKey.includes("regenerate")) {
    return <RefreshCcw className="h-3.5 w-3.5 shrink-0" />;
  }
  if (actionKey.includes("generate") || actionKey.includes("variant")) {
    return <Sparkles className="h-3.5 w-3.5 shrink-0" />;
  }
  return <PenLine className="h-3.5 w-3.5 shrink-0" />;
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function ProductObjectRow({
  object,
  onSelect,
  selected,
}: {
  object: WorkspaceProductObject;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition hover:bg-[color:var(--lime-surface-hover)] ${
        selected
          ? "border-emerald-300 bg-emerald-50"
          : "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]"
      }`}
      onClick={onSelect}
      data-testid={`workspace-product-profile-object-${object.ref.kind}`}
    >
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
        <ProductObjectIcon kind={object.ref.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[color:var(--lime-text-strong)]">
              {object.title}
            </div>
            <div className="mt-0.5 truncate text-xs text-[color:var(--lime-text-muted)]">
              {object.ref.kind}
            </div>
          </div>
          <StatusBadge status={object.status} />
        </div>
        {object.summary ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {object.summary}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function ProductObjectIcon({ kind }: { kind: string }) {
  if (kind.includes("image")) {
    return <Image className="h-4 w-4" />;
  }
  if (kind.includes("video") || kind.includes("storyboard")) {
    return <Video className="h-4 w-4" />;
  }
  if (kind.includes("checklist")) {
    return <ListChecks className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

function StatusBadge({ status }: { status: WorkspaceProductObjectStatus }) {
  const { t } = useTranslation("workspace");
  return (
    <span
      className="shrink-0 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-1 text-[11px] font-medium text-[color:var(--lime-text-muted)]"
      data-testid={`workspace-product-profile-status-${status}`}
    >
      {t(STATUS_LABEL_KEYS[status], { defaultValue: STATUS_FALLBACKS[status] })}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
      <dt className="text-[color:var(--lime-text-muted)]">{label}</dt>
      <dd
        className="min-w-0 break-all text-[color:var(--lime-text-strong)]"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function objectKey(object: WorkspaceProductObject): string {
  return buildWorkspaceProductObjectKey(object);
}
