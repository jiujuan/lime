import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  FileText,
  PenLine,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Artifact } from "@/lib/artifact/types";
import { formatDate } from "@/i18n/format";
import { ArticleTiptapCanvas } from "./ArticleTiptapCanvas";
import { WorkspaceArticleWorkflowDetailPanel } from "./WorkspaceArticleWorkflowDetailPanel";
import "./WorkspaceArticleEditorSurface.css";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleObjectStatus,
  WorkspaceArticleWorkspace,
  WorkspaceArticleWorkspaceAction,
  WorkspaceArticleWorkspaceActionIntent,
  WorkspaceArticleWorkspaceStructuredPreview,
} from "./workspaceArticleWorkspaceModel";
import { buildWorkspaceArticleObjectKey } from "./workspaceArticleWorkspaceSelection";
import type { WorkspaceArticleMarkdownChange } from "./workspaceArticleWorkspaceEditedDraft";
import { isFixtureOnlyHostGenerationArticle } from "./workspaceArticleInlineHostCommandSync";

interface WorkspaceArticleEditorSurfaceProps {
  actions: readonly WorkspaceArticleWorkspaceAction[];
  actionsDisabled?: boolean;
  artifactIds: readonly string[];
  compact?: boolean;
  object: WorkspaceArticleObject;
  objects: readonly WorkspaceArticleObject[];
  onActionIntent?: (intent: WorkspaceArticleWorkspaceActionIntent) => void;
  onArticleMarkdownChange?: (change: WorkspaceArticleMarkdownChange) => void;
  onOpenPreviewArtifact?: (artifact: Artifact) => void;
  onSelectObject?: (object: WorkspaceArticleObject) => void;
  preview: WorkspaceArticleWorkspaceStructuredPreview;
  previewArtifact?: Artifact | null;
  articleWorkspace: WorkspaceArticleWorkspace;
  workflowReadModelLoading?: boolean;
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
  onOpenPreviewArtifact,
  onSelectObject,
  preview,
  previewArtifact,
  articleWorkspace,
  workflowReadModelLoading = false,
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

  const articleCanvasContentKey = `${object.ref.appId}:${object.ref.kind}:${object.ref.id}`;
  const locale = i18n?.resolvedLanguage || i18n?.language || "zh-CN";
  const fixtureOnlyHostGeneration = isFixtureOnlyHostGenerationArticle(
    preview.documentText,
  );
  const visibleDocumentText = fixtureOnlyHostGeneration
    ? ""
    : (preview.documentText ?? "");
  const articleDocumentText = visibleDocumentText;
  const canvasPlaceholder = fixtureOnlyHostGeneration
    ? dynamicT("workspace.articleEditor.canvas.fixtureOnlyPlaceholder")
    : dynamicT("workspace.articleEditor.canvas.empty");
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
            (object.ref.kind === "articleDraft" && !fixtureOnlyHostGeneration
              ? preview.documentText
              : null);
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
            {onOpenPreviewArtifact &&
            previewArtifact &&
            !fixtureOnlyHostGeneration ? (
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
        {!isCompactLayout && updatedAtLabel ? (
          <div
            className="mt-3 flex min-w-0 justify-end"
            data-testid="workspace-article-editor-updated-at"
          >
            <span className="min-w-0 truncate text-[11px] text-[color:var(--lime-text-muted)]">
              {dynamicT("workspace.articleEditor.updatedAt", {
                value: updatedAtLabel,
              })}
            </span>
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
          {fixtureOnlyHostGeneration ? (
            <div
              className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
              data-testid="workspace-article-editor-fixture-only"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {dynamicT("workspace.articleEditor.canvas.fixtureOnlyNotice")}
              </span>
            </div>
          ) : null}
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
              sourceText={articleDocumentText}
              placeholder={canvasPlaceholder}
              syncedStatusLabelKey={
                fixtureOnlyHostGeneration
                  ? "workspace.articleEditor.canvas.status.fixtureOnlyHidden"
                  : undefined
              }
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
          <WorkspaceArticleWorkflowDetailPanel
            loading={workflowReadModelLoading}
            workflowRuns={articleWorkspace.workflowRuns ?? []}
            translate={dynamicT}
          />

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
