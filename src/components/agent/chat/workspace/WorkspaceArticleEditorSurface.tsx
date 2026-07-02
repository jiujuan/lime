import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  ImagePlus,
  ListChecks,
  PenLine,
  RefreshCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Artifact } from "@/lib/artifact/types";
import { formatDate } from "@/i18n/format";
import { ArticleTiptapCanvas } from "./ArticleTiptapCanvas";
import "./WorkspaceArticleEditorSurface.css";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleObjectStatus,
  WorkspaceArticleWorkspace,
  WorkspaceArticleWorkspaceAction,
  WorkspaceArticleWorkspaceActionIntent,
  WorkspaceArticleWorkspaceImageSlot,
  WorkspaceArticleWorkspaceImageSlotIntent,
  WorkspaceArticleWorkspaceStructuredPreview,
} from "./workspaceArticleWorkspaceModel";
import { buildWorkspaceArticleObjectKey } from "./workspaceArticleWorkspaceSelection";
import type { WorkspaceArticleMarkdownChange } from "./workspaceArticleWorkspaceEditedDraft";

interface WorkspaceArticleEditorSurfaceProps {
  actions: readonly WorkspaceArticleWorkspaceAction[];
  actionsDisabled?: boolean;
  artifactIds: readonly string[];
  compact?: boolean;
  object: WorkspaceArticleObject;
  objects: readonly WorkspaceArticleObject[];
  onActionIntent?: (intent: WorkspaceArticleWorkspaceActionIntent) => void;
  onArticleMarkdownChange?: (change: WorkspaceArticleMarkdownChange) => void;
  onImageSlotIntent?: (
    intent: WorkspaceArticleWorkspaceImageSlotIntent,
  ) => void;
  onOpenPreviewArtifact?: (artifact: Artifact) => void;
  onSelectObject?: (object: WorkspaceArticleObject) => void;
  preview: WorkspaceArticleWorkspaceStructuredPreview;
  previewArtifact?: Artifact | null;
  articleWorkspace: WorkspaceArticleWorkspace;
  selectedObjectKey: string;
  updatedAt?: string | null;
}

type WorkspaceDynamicTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function WorkspaceArticleEditorSurface({
  actions,
  actionsDisabled = false,
  artifactIds,
  compact = true,
  object,
  objects,
  onActionIntent,
  onArticleMarkdownChange,
  onImageSlotIntent,
  onOpenPreviewArtifact,
  onSelectObject,
  preview,
  previewArtifact,
  articleWorkspace,
  selectedObjectKey,
  updatedAt,
}: WorkspaceArticleEditorSurfaceProps) {
  const { i18n, t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const [pendingActionConfirmKey, setPendingActionConfirmKey] = useState<
    string | null
  >(null);
  const [editedMarkdown, setEditedMarkdown] = useState<string | null>(null);
  const isCompactLayout = compact;

  useEffect(() => {
    setPendingActionConfirmKey(null);
    setEditedMarkdown(null);
  }, [object.ref.id]);

  const articleStats = useMemo(
    () => [
      {
        key: "research",
        label: dynamicT("workspace.articleEditor.stat.research"),
        value: String(preview.researchRounds.length),
      },
      {
        key: "outline",
        label: dynamicT("workspace.articleEditor.stat.outline"),
        value: String(preview.outline.length),
      },
      {
        key: "citations",
        label: dynamicT("workspace.articleEditor.stat.citations"),
        value: String(preview.citations.length),
      },
      {
        key: "images",
        label: dynamicT("workspace.articleEditor.stat.images"),
        value: String(preview.imageSlots.length),
      },
    ],
    [
      dynamicT,
      preview.citations.length,
      preview.imageSlots.length,
      preview.outline.length,
      preview.researchRounds.length,
    ],
  );
  const articleCanvasContentKey = `${object.ref.appId}:${object.ref.kind}:${object.ref.id}`;
  const locale = i18n?.resolvedLanguage || i18n?.language || "zh-CN";
  const updatedAtLabel = useMemo(
    () =>
      updatedAt
        ? formatDate(updatedAt, {
            locale,
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
    [locale, updatedAt],
  );
  const renderActionButton = (action: WorkspaceArticleWorkspaceAction) => {
    const actionConfirmKey = `${selectedObjectKey}:${action.key}`;
    const confirmationPending =
      action.risk === "write" && pendingActionConfirmKey === actionConfirmKey;
    return (
      <ArticleEditorActionButton
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
            objectTitle: object.title,
            objectKind: object.ref.kind,
            taskKind: action.taskKind ?? "",
          });
          const currentArticleMarkdown =
            editedMarkdown ??
            (object.ref.kind === "articleDraft" ? preview.documentText : null);
          onActionIntent?.({
            action,
            editedMarkdown: currentArticleMarkdown,
            object,
            articleWorkspace,
            prompt,
          });
        }}
      />
    );
  };
  const resolveImageSlotAnchorSectionTitle = (
    slot: WorkspaceArticleWorkspaceImageSlot,
  ): string | null => {
    const sectionId = slot.sectionId?.trim();
    if (!sectionId) {
      return null;
    }
    return (
      preview.outline.find((section) => section.id === sectionId)?.title ?? null
    );
  };
  const buildImageSlotPrompt = (
    slot: WorkspaceArticleWorkspaceImageSlot,
  ): string =>
    [slot.prompt, slot.purpose, slot.title]
      .map((value) => value?.trim())
      .find((value): value is string => Boolean(value)) ?? "";
  const handleImageSlotIntent = (slot: WorkspaceArticleWorkspaceImageSlot) => {
    const prompt = buildImageSlotPrompt(slot);
    if (!prompt) {
      return;
    }
    const currentArticleMarkdown =
      editedMarkdown ??
      (object.ref.kind === "articleDraft" ? preview.documentText : null);
    onImageSlotIntent?.({
      anchorSectionTitle: resolveImageSlotAnchorSectionTitle(slot),
      anchorText: slot.title,
      articleWorkspace,
      editedMarkdown: currentArticleMarkdown,
      object,
      prompt,
      slot,
    });
  };

  return (
    <section
      className={`article-editor-root flex h-full min-h-0 w-full min-w-0 flex-col bg-[#eef3f8] text-[color:var(--lime-text)] ${
        isCompactLayout ? "article-editor-root-compact" : ""
      }`}
      data-layout="responsive"
      data-compact-layout={isCompactLayout ? "true" : "false"}
      data-testid="workspace-article-editor-surface"
    >
      <header className="article-editor-header shrink-0 border-b border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[color:var(--lime-text-muted)]">
                {dynamicT("workspace.articleEditor.title")}
              </div>
              <h2 className="mt-0.5 truncate text-[15px] font-semibold leading-5 text-[color:var(--lime-text-strong)]">
                {object.title}
              </h2>
              {!isCompactLayout ? (
                <p className="mt-0.5 truncate text-xs text-[color:var(--lime-text-muted)]">
                  {dynamicT("workspace.articleEditor.subtitle", {
                    count: artifactIds.length,
                  })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="article-editor-header-actions flex shrink-0 flex-wrap items-center justify-end gap-2">
            <ArticleStatusBadge status={object.status} />
            {onOpenPreviewArtifact && previewArtifact ? (
              <button
                type="button"
                className="article-editor-preview-button inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 text-xs font-medium text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)]"
                onClick={() => onOpenPreviewArtifact(previewArtifact)}
                data-testid="workspace-article-editor-open-preview"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="truncate">
                  {dynamicT("workspace.articleEditor.openPreview")}
                </span>
              </button>
            ) : null}
          </div>
        </div>
        {!isCompactLayout ? (
          <div
            className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5"
            data-testid="workspace-article-editor-stats"
          >
            {articleStats.map((stat) => (
              <span
                key={stat.key}
                className="inline-flex items-center gap-1 rounded-md border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-1 text-[11px] text-[color:var(--lime-text-muted)]"
              >
                <span>{stat.label}</span>
                <span className="font-semibold text-[color:var(--lime-text-strong)]">
                  {stat.value}
                </span>
              </span>
            ))}
            {updatedAtLabel ? (
              <span className="ml-auto min-w-0 truncate text-[11px] text-[color:var(--lime-text-muted)]">
                {dynamicT("workspace.articleEditor.updatedAt", {
                  value: updatedAtLabel,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <div
        className={`article-editor-workbench ${
          isCompactLayout ? "article-editor-workbench-compact" : ""
        }`}
        data-testid="workspace-article-editor-workbench"
      >
        <main
          className="article-editor-main-column"
          data-testid="workspace-article-editor-main-canvas"
        >
          {isCompactLayout && preview.imageSlots.length > 0 ? (
            <ArticleEditorImageSlotRail
              disabled={actionsDisabled || !onImageSlotIntent}
              imageSlots={preview.imageSlots}
              onGenerate={handleImageSlotIntent}
            />
          ) : null}
          <div className="article-editor-canvas-heading">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                {dynamicT("workspace.articleEditor.canvas.title")}
              </div>
              <div className="mt-0.5 truncate text-xs text-[color:var(--lime-text-muted)]">
                {dynamicT("workspace.articleEditor.canvas.detail")}
              </div>
            </div>
            {isCompactLayout && updatedAtLabel ? (
              <div className="article-editor-canvas-updated shrink-0 truncate text-[11px] text-[color:var(--lime-text-muted)]">
                {dynamicT("workspace.articleEditor.updatedAt", {
                  value: updatedAtLabel,
                })}
              </div>
            ) : null}
          </div>
          <div className="article-editor-canvas-shell">
            <ArticleTiptapCanvas
              contentKey={articleCanvasContentKey}
              onEditedMarkdownChange={(markdown) => {
                setEditedMarkdown(markdown);
                onArticleMarkdownChange?.({
                  articleWorkspace,
                  markdown,
                  object,
                });
              }}
              sourceText={preview.documentText ?? ""}
              placeholder={dynamicT("workspace.articleEditor.canvas.empty")}
              testId="workspace-article-editor-canvas"
            />
          </div>
        </main>

        <aside
          className={`article-editor-side-panel ${
            isCompactLayout ? "article-editor-side-panel-compact" : ""
          }`}
          data-testid="workspace-article-editor-side-panel"
        >
          {actions.length > 0 ? (
            <ArticleEditorSection
              icon={<PenLine className="h-4 w-4" />}
              title={dynamicT(
                "workspace.articleWorkspace.rendererHost.actions",
              )}
              detail={dynamicT("workspace.articleEditor.canvas.detail")}
              testId="workspace-article-editor-actions"
            >
              <div className="grid grid-cols-2 gap-2">
                {actions.map(renderActionButton)}
              </div>
            </ArticleEditorSection>
          ) : null}

          <ArticleEditorSection
            icon={<ListChecks className="h-4 w-4" />}
            title={dynamicT("workspace.articleEditor.outline.title")}
            detail={dynamicT("workspace.articleEditor.outline.detail", {
              count: preview.outline.length,
            })}
            testId="workspace-article-editor-outline"
          >
            {preview.outline.length > 0 ? (
              preview.outline.map((section, index) => (
                <ArticleEditorListItem
                  key={section.id}
                  prefix={String(index + 1)}
                  title={section.title}
                  meta={section.purpose}
                  detail={section.points.slice(0, 3).join(" · ")}
                />
              ))
            ) : (
              <ArticleEditorEmptyText>
                {dynamicT("workspace.articleEditor.outline.empty")}
              </ArticleEditorEmptyText>
            )}
          </ArticleEditorSection>

          <ArticleEditorSection
            icon={<Search className="h-4 w-4" />}
            title={dynamicT("workspace.articleEditor.research.title")}
            detail={dynamicT("workspace.articleEditor.research.detail", {
              count: preview.researchRounds.length,
            })}
            testId="workspace-article-editor-research"
          >
            {preview.researchRounds.length > 0 ? (
              preview.researchRounds.map((round) => (
                <ArticleEditorListItem
                  key={round.id}
                  title={round.title}
                  meta={[round.query, round.status].filter(Boolean).join(" · ")}
                  detail={round.summary}
                />
              ))
            ) : (
              <ArticleEditorEmptyText>
                {dynamicT("workspace.articleEditor.research.empty")}
              </ArticleEditorEmptyText>
            )}
          </ArticleEditorSection>

          <ArticleEditorSection
            icon={<ClipboardCheck className="h-4 w-4" />}
            title={dynamicT("workspace.articleEditor.citations.title")}
            detail={dynamicT("workspace.articleEditor.citations.detail", {
              count: preview.citations.length,
            })}
            testId="workspace-article-editor-citations"
          >
            {preview.citations.length > 0 ? (
              preview.citations.map((citation) => (
                <ArticleEditorListItem
                  key={citation.id}
                  title={citation.title}
                  meta={[citation.sourceType, citation.status]
                    .filter(Boolean)
                    .join(" · ")}
                  detail={citation.summary}
                />
              ))
            ) : (
              <ArticleEditorEmptyText>
                {dynamicT("workspace.articleEditor.citations.empty")}
              </ArticleEditorEmptyText>
            )}
          </ArticleEditorSection>

          <ArticleEditorSection
            icon={<ImagePlus className="h-4 w-4" />}
            title={dynamicT("workspace.articleEditor.images.title")}
            detail={dynamicT("workspace.articleEditor.images.detail", {
              count: preview.imageSlots.length,
            })}
            testId="workspace-article-editor-image-slots"
          >
            {preview.imageSlots.length > 0 ? (
              preview.imageSlots.map((slot) => (
                <ArticleEditorImageSlotItem
                  key={slot.id}
                  disabled={actionsDisabled || !onImageSlotIntent}
                  onGenerate={handleImageSlotIntent}
                  slot={slot}
                />
              ))
            ) : (
              <ArticleEditorEmptyText>
                {dynamicT("workspace.articleEditor.images.empty")}
              </ArticleEditorEmptyText>
            )}
          </ArticleEditorSection>

          <ArticleEditorSection
            icon={<Sparkles className="h-4 w-4" />}
            title={dynamicT("workspace.articleEditor.titleCandidates.title")}
            detail={dynamicT("workspace.articleEditor.titleCandidates.detail", {
              count: preview.titleCandidates.length,
            })}
            testId="workspace-article-editor-title-candidates"
          >
            {preview.titleCandidates.length > 0 ? (
              preview.titleCandidates.map((candidate) => (
                <ArticleEditorListItem
                  key={candidate.id}
                  title={candidate.title}
                  meta={[
                    candidate.angle,
                    candidate.score === null || candidate.score === undefined
                      ? null
                      : dynamicT(
                          "workspace.articleEditor.titleCandidates.score",
                          {
                            value: candidate.score,
                          },
                        ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))
            ) : (
              <ArticleEditorEmptyText>
                {dynamicT("workspace.articleEditor.titleCandidates.empty")}
              </ArticleEditorEmptyText>
            )}
          </ArticleEditorSection>

          <ArticleEditorSection
            icon={<CheckCircle2 className="h-4 w-4" />}
            title={dynamicT("workspace.articleEditor.takeaways.title")}
            detail={dynamicT("workspace.articleEditor.takeaways.detail", {
              count: preview.keyTakeaways.length,
            })}
            testId="workspace-article-editor-takeaways"
          >
            {preview.keyTakeaways.length > 0 ? (
              preview.keyTakeaways.map((takeaway, index) => (
                <ArticleEditorListItem
                  key={`${takeaway}:${index}`}
                  prefix={String(index + 1)}
                  title={takeaway}
                />
              ))
            ) : (
              <ArticleEditorEmptyText>
                {dynamicT("workspace.articleEditor.takeaways.empty")}
              </ArticleEditorEmptyText>
            )}
          </ArticleEditorSection>

          <ArticleEditorSection
            icon={<ListChecks className="h-4 w-4" />}
            title={dynamicT("workspace.articleEditor.writingPlan.title")}
            detail={dynamicT("workspace.articleEditor.writingPlan.detail", {
              count: preview.writingPlan.length,
            })}
            testId="workspace-article-editor-writing-plan"
          >
            {preview.writingPlan.length > 0 ? (
              preview.writingPlan.map((step, index) => (
                <ArticleEditorListItem
                  key={step.id}
                  prefix={String(index + 1)}
                  title={step.title}
                  meta={[
                    step.owner,
                    step.skillRef,
                    step.done === null || step.done === undefined
                      ? null
                      : dynamicT(
                          step.done
                            ? "workspace.articleEditor.writingPlan.done"
                            : "workspace.articleEditor.writingPlan.pending",
                        ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  detail={step.output ?? step.goal}
                />
              ))
            ) : (
              <ArticleEditorEmptyText>
                {dynamicT("workspace.articleEditor.writingPlan.empty")}
              </ArticleEditorEmptyText>
            )}
          </ArticleEditorSection>

          {preview.reviewNotes.length > 0 ? (
            <ArticleEditorSection
              icon={<CheckCircle2 className="h-4 w-4" />}
              title={dynamicT("workspace.articleEditor.review.title")}
              detail={dynamicT("workspace.articleEditor.review.detail", {
                count: preview.reviewNotes.length,
              })}
              testId="workspace-article-editor-review"
            >
              {preview.reviewNotes.map((note, index) => (
                <ArticleEditorListItem key={`${note}:${index}`} title={note} />
              ))}
            </ArticleEditorSection>
          ) : null}

          {objects.length > 1 ? (
            <ArticleEditorSection
              icon={<Sparkles className="h-4 w-4" />}
              title={dynamicT("workspace.articleEditor.related.title")}
              detail={dynamicT("workspace.articleEditor.related.detail", {
                count: objects.length,
              })}
              testId="workspace-article-editor-related-objects"
            >
              <div className="grid gap-2">
                {objects.map((item) => {
                  const itemKey = buildWorkspaceArticleObjectKey(item);
                  return (
                    <button
                      key={itemKey}
                      type="button"
                      className={`flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        itemKey === selectedObjectKey
                          ? "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-strong)]"
                          : "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text)] hover:bg-[color:var(--lime-surface-hover)]"
                      }`}
                      onClick={() => onSelectObject?.(item)}
                      data-testid={`workspace-article-editor-related-${item.ref.kind}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[color:var(--lime-text-muted)]">
                          {item.ref.kind}
                        </span>
                      </span>
                      <ArticleStatusBadge status={item.status} />
                    </button>
                  );
                })}
              </div>
            </ArticleEditorSection>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function ArticleEditorImageSlotRail({
  disabled,
  imageSlots,
  onGenerate,
}: {
  disabled: boolean;
  imageSlots: WorkspaceArticleWorkspaceImageSlot[];
  onGenerate: (slot: WorkspaceArticleWorkspaceImageSlot) => void;
}) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  return (
    <section
      className="mb-2 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-2"
      data-testid="workspace-article-editor-compact-image-slots"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-[color:var(--lime-text-strong)]">
            {dynamicT("workspace.articleEditor.images.title")}
          </span>
          <span className="block truncate text-[11px] text-[color:var(--lime-text-muted)]">
            {dynamicT("workspace.articleEditor.images.detail", {
              count: imageSlots.length,
            })}
          </span>
        </span>
      </div>
      <div className="mt-2 flex min-w-0 gap-2 overflow-x-auto pb-1">
        {imageSlots.map((slot) => (
          <button
            key={slot.id}
            type="button"
            className="grid min-w-[190px] max-w-[240px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2 text-left transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={() => onGenerate(slot)}
            aria-label={dynamicT(
              "workspace.articleEditor.images.generateSlotAria",
              { title: slot.title },
            )}
            data-testid="workspace-article-editor-compact-image-slot-generate"
            data-slot-id={slot.id}
          >
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-[color:var(--lime-text-strong)]">
                {slot.title}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-[color:var(--lime-text-muted)]">
                {[slot.purpose, slot.status].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 text-[11px] font-medium text-[color:var(--lime-text-strong)]">
              <ImagePlus className="h-3.5 w-3.5" />
              {dynamicT("workspace.articleEditor.images.generateSlot")}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ArticleEditorImageSlotItem({
  disabled,
  onGenerate,
  slot,
}: {
  disabled: boolean;
  onGenerate: (slot: WorkspaceArticleWorkspaceImageSlot) => void;
  slot: WorkspaceArticleWorkspaceImageSlot;
}) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-[color:var(--lime-text-strong)]">
          {slot.title}
        </span>
        {[slot.purpose, slot.status].filter(Boolean).length > 0 ? (
          <span className="mt-0.5 block truncate text-[11px] text-[color:var(--lime-text-muted)]">
            {[slot.purpose, slot.status].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        {slot.prompt ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--lime-text-muted)]">
            {slot.prompt}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 text-[11px] font-medium text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => onGenerate(slot)}
        aria-label={dynamicT(
          "workspace.articleEditor.images.generateSlotAria",
          { title: slot.title },
        )}
        data-testid="workspace-article-editor-image-slot-generate"
        data-slot-id={slot.id}
      >
        <ImagePlus className="h-3.5 w-3.5" />
        <span>{dynamicT("workspace.articleEditor.images.generateSlot")}</span>
      </button>
    </div>
  );
}

function ArticleEditorSection({
  children,
  detail,
  icon,
  testId,
  title,
}: {
  children: ReactNode;
  detail: string;
  icon: ReactNode;
  testId: string;
  title: string;
}) {
  return (
    <section
      className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
      data-testid={testId}
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[color:var(--lime-text-strong)]">
            {title}
          </div>
          <div className="mt-0.5 text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {detail}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

function ArticleEditorListItem({
  detail,
  meta,
  prefix,
  title,
}: {
  detail?: string | null;
  meta?: string | null;
  prefix?: string;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2">
      {prefix ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--lime-surface)] text-[11px] font-semibold text-[color:var(--lime-text-muted)]">
          {prefix}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-xs font-medium text-[color:var(--lime-text-strong)]">
          {title}
        </span>
        {meta ? (
          <span className="mt-0.5 block truncate text-[11px] text-[color:var(--lime-text-muted)]">
            {meta}
          </span>
        ) : null}
        {detail ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--lime-text-muted)]">
            {detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function ArticleEditorEmptyText({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-3 py-2 text-xs text-[color:var(--lime-text-muted)]">
      {children}
    </div>
  );
}

function ArticleEditorActionButton({
  action,
  confirmationPending,
  disabled,
  onClick,
}: {
  action: WorkspaceArticleWorkspaceAction;
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
          ? t("workspace.articleWorkspace.actionConfirmAria", {
              action: actionLabel,
            })
          : actionLabel
      }
      data-confirmation-pending={confirmationPending ? "true" : "false"}
      data-testid={`workspace-article-editor-action-${action.key}`}
    >
      {confirmationPending ? (
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <ArticleActionIcon actionKey={action.key} />
      )}
      <span className="truncate">
        {confirmationPending
          ? t("workspace.articleWorkspace.actionConfirm", {
              action: actionLabel,
            })
          : actionLabel}
      </span>
    </button>
  );
}

function ArticleActionIcon({ actionKey }: { actionKey: string }) {
  if (actionKey.includes("export")) {
    return <Download className="h-3.5 w-3.5 shrink-0" />;
  }
  if (actionKey.includes("generate")) {
    return <Sparkles className="h-3.5 w-3.5 shrink-0" />;
  }
  if (actionKey.includes("continue")) {
    return <RefreshCcw className="h-3.5 w-3.5 shrink-0" />;
  }
  return <PenLine className="h-3.5 w-3.5 shrink-0" />;
}

function ArticleStatusBadge({
  status,
}: {
  status: WorkspaceArticleObjectStatus;
}) {
  const { t } = useTranslation("workspace");
  const label = t(`workspace.articleWorkspace.status.${status}`, {
    defaultValue: status,
  });
  return (
    <span className="inline-flex shrink-0 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--lime-text-muted)]">
      {label}
    </span>
  );
}
