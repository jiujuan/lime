import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import { normalizeWorkspaceRightSurfaceKind } from "./right-surface";
import {
  applyWorkspaceArticleEditedDraft,
  readWorkspaceArticleEditedDraftFromUnknown,
  type WorkspaceArticleEditedDraft,
} from "./workspaceArticleWorkspaceEditedDraft";
import {
  filterWorkspaceArticleWorkspaceActionHistoryForObject,
  readWorkspaceArticleWorkspaceActionHistory,
  type WorkspaceArticleWorkspaceActionHistoryItem,
} from "./workspaceArticleWorkspaceActionHistory";
import {
  buildWorkspaceArticleWorkspaceWorkerEvidenceFromThreadRead,
  readWorkspaceArticleWorkspaceWorkerEvidence,
  type WorkspaceArticleWorkspaceWorkerEvidenceItem,
} from "./workspaceArticleWorkspaceWorkerEvidence";
import {
  readWorkspaceArticleWorkflowRunsFromThreadRead,
  readWorkspaceArticleWorkflowRunsFromUnknown,
  type WorkspaceArticleWorkflowRun,
} from "./workspaceArticleWorkspaceWorkflowFacts";
import {
  readWorkspaceArticlePatchRecordFromMetadata,
  readWorkspaceArticleRecordFromMetadata,
} from "./workspaceArticleWorkspaceMetadata";
import { resolveWorkspaceArticleObjectArtifactIds } from "./workspaceArticleWorkspaceObjectArtifacts";
import {
  buildWorkspaceArticleObjectStructuredPreview,
  readWorkspaceArticleDraftMarkdown,
} from "./workspaceArticleWorkspaceStructuredPreview";

export { buildWorkspaceArticleWorkspaceActionRequestMetadata } from "./workspaceArticleWorkspaceActionRequestMetadata";
export { buildWorkspaceArticleObjectStructuredPreview } from "./workspaceArticleWorkspaceStructuredPreview";

export type WorkspaceArticleWorkspaceSource =
  | "threadRead"
  | "rightSurfacePending";

export interface WorkspaceArticleObjectRef {
  appId: string;
  kind: string;
  id: string;
  sessionId: string;
  version?: string | null;
  artifactIds?: string[];
  sourceTurnId?: string | null;
  sourceTaskId?: string | null;
}

export type WorkspaceArticleObjectStatus =
  | "draft"
  | "generating"
  | "ready"
  | "needs_review"
  | "archived"
  | "failed"
  | "unknown";

export type WorkspaceArticleObjectSurfaceLayout =
  | "briefForm"
  | "document"
  | "imageGrid"
  | "storyboard"
  | "checklist"
  | "generic";

export type WorkspaceArticleWorkspaceActionRisk = "read" | "write";

export interface WorkspaceArticleWorkspaceAction {
  key: string;
  intent: string;
  labelKey: string;
  promptKey: string;
  risk: WorkspaceArticleWorkspaceActionRisk;
  taskKind?: string;
}

export interface WorkspaceArticleWorkspaceActionIntent {
  action: WorkspaceArticleWorkspaceAction;
  editedMarkdown?: string | null;
  object: WorkspaceArticleObject;
  articleWorkspace: WorkspaceArticleWorkspace;
  prompt: string;
}

export interface WorkspaceArticleWorkspaceImageSlotIntent {
  anchorSectionTitle?: string | null;
  anchorText?: string | null;
  articleWorkspace: WorkspaceArticleWorkspace;
  editedMarkdown?: string | null;
  object: WorkspaceArticleObject;
  prompt: string;
  slot: WorkspaceArticleWorkspaceImageSlot;
}

export interface WorkspaceArticleWorkspaceObjectSurface {
  layout: WorkspaceArticleObjectSurfaceLayout;
  titleKey: string;
}

export interface WorkspaceArticleWorkspacePreviewImage {
  id: string;
  title: string;
  url?: string | null;
  localPath?: string | null;
  filePath?: string | null;
  cachedPath?: string | null;
  alt?: string | null;
  prompt?: string | null;
}

export interface WorkspaceArticleWorkspacePreviewStoryboardRow {
  id: string;
  title: string;
  description?: string | null;
  visualPrompt?: string | null;
  duration?: string | null;
}

export interface WorkspaceArticleWorkspacePreviewChecklistItem {
  id: string;
  title: string;
  status?: string | null;
  notes?: string | null;
}

export interface WorkspaceArticleWorkspacePreviewField {
  key: string;
  label: string;
  value: string;
}

export interface WorkspaceArticleWorkspaceResearchRound {
  id: string;
  title: string;
  query?: string | null;
  status?: string | null;
  summary?: string | null;
  citations: string[];
}

export interface WorkspaceArticleWorkspaceTitleCandidate {
  id: string;
  title: string;
  angle?: string | null;
  score?: number | null;
}

export interface WorkspaceArticleWorkspaceOutlineSection {
  id: string;
  title: string;
  purpose?: string | null;
  points: string[];
  evidenceIds: string[];
}

export interface WorkspaceArticleWorkspaceImageSlot {
  id: string;
  title: string;
  sectionId?: string | null;
  purpose?: string | null;
  prompt?: string | null;
  status?: string | null;
}

export interface WorkspaceArticleWorkspaceCitation {
  id: string;
  title: string;
  sourceType?: string | null;
  summary?: string | null;
  status?: string | null;
}

export interface WorkspaceArticleWorkspaceWritingPlanStep {
  id: string;
  title: string;
  owner?: string | null;
  skillRef?: string | null;
  output?: string | null;
  goal?: string | null;
  done?: boolean | null;
}

export interface WorkspaceArticleWorkspaceStructuredPreview {
  processMarkdown: string | null;
  documentText: string | null;
  images: WorkspaceArticleWorkspacePreviewImage[];
  storyboard: WorkspaceArticleWorkspacePreviewStoryboardRow[];
  checklist: WorkspaceArticleWorkspacePreviewChecklistItem[];
  briefFields: WorkspaceArticleWorkspacePreviewField[];
  researchRounds: WorkspaceArticleWorkspaceResearchRound[];
  titleCandidates: WorkspaceArticleWorkspaceTitleCandidate[];
  outline: WorkspaceArticleWorkspaceOutlineSection[];
  keyTakeaways: string[];
  imageSlots: WorkspaceArticleWorkspaceImageSlot[];
  citations: WorkspaceArticleWorkspaceCitation[];
  writingPlan: WorkspaceArticleWorkspaceWritingPlanStep[];
  reviewNotes: string[];
}

export interface WorkspaceArticleObject {
  ref: WorkspaceArticleObjectRef;
  title: string;
  status: WorkspaceArticleObjectStatus;
  summary?: string | null;
  previewArtifactId?: string | null;
  source?: Record<string, unknown> | null;
}

export interface WorkspaceArticleWorkspaceLayoutState {
  activeTabKind?: string | null;
  activePaneKind?: string | null;
  openTabKinds?: string[];
  splitMode?: string | null;
}

export interface WorkspaceArticleWorkspace {
  schemaVersion: string;
  appId: string;
  sessionId: string;
  workspaceId?: string | null;
  source: WorkspaceArticleWorkspaceSource;
  objects: WorkspaceArticleObject[];
  objectCount: number;
  primaryObjectRef?: WorkspaceArticleObjectRef | null;
  selectedObjectRef?: WorkspaceArticleObjectRef | null;
  layoutState?: WorkspaceArticleWorkspaceLayoutState | null;
  sourceArtifacts?: Record<string, unknown>[];
  actionHistory: WorkspaceArticleWorkspaceActionHistoryItem[];
  workerEvidence?: WorkspaceArticleWorkspaceWorkerEvidenceItem[];
  workflowRuns?: WorkspaceArticleWorkflowRun[];
  editedDraft?: WorkspaceArticleEditedDraft | null;
  updatedAt?: string | null;
}

export interface WorkspaceArticleWorkspaceViewModel {
  appId: string;
  sessionId: string;
  workspaceId: string | null;
  objectCount: number;
  selectedObject: WorkspaceArticleObject;
  objects: WorkspaceArticleObject[];
  statusCounts: Record<WorkspaceArticleObjectStatus, number>;
  sourceArtifacts: Record<string, unknown>[];
  updatedAt: string | null;
  workerEvidence: WorkspaceArticleWorkspaceWorkerEvidenceItem[];
  workflowRuns: WorkspaceArticleWorkflowRun[];
  latestWorkerEvidence: WorkspaceArticleWorkspaceWorkerEvidenceItem | null;
  selectedSurface: WorkspaceArticleWorkspaceObjectSurface;
  selectedActions: WorkspaceArticleWorkspaceAction[];
  selectedActionHistory: WorkspaceArticleWorkspaceActionHistoryItem[];
  latestSelectedAction: WorkspaceArticleWorkspaceActionHistoryItem | null;
  selectedArtifactIds: string[];
  selectedPreview: WorkspaceArticleWorkspaceStructuredPreview;
}

const KNOWN_STATUSES = new Set<WorkspaceArticleObjectStatus>([
  "draft",
  "generating",
  "ready",
  "needs_review",
  "archived",
  "failed",
  "unknown",
]);

const EMPTY_STATUS_COUNTS: Record<WorkspaceArticleObjectStatus, number> = {
  draft: 0,
  generating: 0,
  ready: 0,
  needs_review: 0,
  archived: 0,
  failed: 0,
  unknown: 0,
};

export function buildWorkspaceArticleWorkspaceFromThreadRead(
  threadRead?: AgentRuntimeThreadReadModel | null,
): WorkspaceArticleWorkspace | null {
  if (!hasWorkspaceArticleWorkspaceThreadReadMetadata(threadRead)) {
    return null;
  }
  const record = asRecord(threadRead);
  if (!record) {
    return null;
  }
  const profile = buildWorkspaceArticleWorkspaceFromUnknown(
    firstRecord(record.articleWorkspace, record.article_workspace),
    "threadRead",
  );
  if (!profile) {
    return null;
  }
  return {
    ...profile,
    workerEvidence: buildWorkspaceArticleWorkspaceWorkerEvidenceFromThreadRead({
      articleWorkspace: firstRecord(
        record.articleWorkspace,
        record.article_workspace,
      ),
      sourceArtifacts: profile.sourceArtifacts,
      threadRead,
    }),
    workflowRuns: readWorkspaceArticleWorkflowRunsFromThreadRead(threadRead),
  };
}

export function hasWorkspaceArticleWorkspaceThreadReadMetadata(
  threadRead?: AgentRuntimeThreadReadModel | null,
): boolean {
  const record = asRecord(threadRead);
  return Boolean(
    record &&
    (asRecord(record.articleWorkspace) || asRecord(record.article_workspace)),
  );
}

export function buildWorkspaceArticleWorkspaceFromPendingRequests(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
): WorkspaceArticleWorkspace | null {
  for (const request of pendingRequests) {
    if (
      request.status !== "pending" ||
      normalizeWorkspaceRightSurfaceKind(request.surfaceKind) !==
        "articleWorkspace"
    ) {
      continue;
    }
    const metadata = asRecord(request.metadata);
    const artifact = asRecord(metadata?.artifact);
    const artifactMetadata = asRecord(artifact?.metadata);
    const profile = buildWorkspaceArticleWorkspaceFromUnknown(
      firstRecord(
        readWorkspaceArticleRecordFromMetadata(metadata),
        readWorkspaceArticlePatchRecordFromMetadata(metadata),
        readWorkspaceArticleRecordFromMetadata(artifactMetadata),
        readWorkspaceArticlePatchRecordFromMetadata(artifactMetadata),
        metadata,
      ),
      "rightSurfacePending",
    );
    if (!profile) {
      continue;
    }
    const sourceArtifacts =
      profile.sourceArtifacts && profile.sourceArtifacts.length > 0
        ? profile.sourceArtifacts
        : [
            {
              requestId: request.requestId,
              origin: request.origin,
              reason: request.reason,
              requestedAt: request.requestedAt,
              artifactRef: readString(
                artifact?.artifactId,
                artifact?.artifactRef,
              ),
              kind: readString(artifact?.kind, artifact?.artifactKind),
              path: readString(artifact?.path),
              title: readString(artifact?.title),
            },
          ];
    return {
      ...profile,
      workspaceId: profile.workspaceId ?? request.workspaceId ?? null,
      sessionId: profile.sessionId || request.sessionId || profile.sessionId,
      sourceArtifacts,
      workerEvidence:
        (profile.workerEvidence?.length ?? 0) > 0
          ? (profile.workerEvidence ?? [])
          : buildWorkspaceArticleWorkspaceWorkerEvidenceFromThreadRead({
              articleWorkspace: profile as unknown as Record<string, unknown>,
              sourceArtifacts,
            }),
      updatedAt: profile.updatedAt ?? request.requestedAt,
    };
  }
  return null;
}

export function buildWorkspaceArticleWorkspaceFromUnknown(
  value: unknown,
  source: WorkspaceArticleWorkspaceSource,
): WorkspaceArticleWorkspace | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const objects = readArray(record.objects)
    .map(readArticleObject)
    .filter((object): object is WorkspaceArticleObject => Boolean(object));
  if (objects.length === 0) {
    return null;
  }
  const firstObjectRef = objects[0]?.ref;
  const appId =
    readString(record.appId, record.app_id) ||
    firstObjectRef?.appId ||
    "plugin";
  const sessionId =
    readString(record.sessionId, record.session_id) ||
    firstObjectRef?.sessionId ||
    "session";
  const editedDraft = readWorkspaceArticleEditedDraftFromUnknown(
    firstRecord(record.editedDraft, record.edited_draft),
  );

  const workspace: WorkspaceArticleWorkspace = {
    schemaVersion:
      readString(record.schemaVersion, record.schema_version) ||
      "article-workspace.v1",
    appId,
    sessionId,
    workspaceId: readString(record.workspaceId, record.workspace_id) || null,
    source,
    objects,
    objectCount:
      readNumber(record.objectCount, record.object_count) ?? objects.length,
    primaryObjectRef: readObjectRef(
      firstRecord(record.primaryObjectRef, record.primary_object_ref),
    ),
    selectedObjectRef: readObjectRef(
      firstRecord(record.selectedObjectRef, record.selected_object_ref),
    ),
    layoutState: readLayoutState(
      firstRecord(record.layoutState, record.layout_state),
    ),
    sourceArtifacts: readArray(
      record.sourceArtifacts,
      record.source_artifacts,
    ).filter((item): item is Record<string, unknown> =>
      Boolean(asRecord(item)),
    ),
    actionHistory: readWorkspaceArticleWorkspaceActionHistory(
      readArray(record.actionHistory, record.action_history),
    ),
    workerEvidence: readWorkspaceArticleWorkspaceWorkerEvidence(
      readArray(record.workerEvidence, record.worker_evidence),
    ),
    workflowRuns: readWorkspaceArticleWorkflowRunsFromUnknown(record),
    editedDraft,
    updatedAt: readString(record.updatedAt, record.updated_at) || null,
  };
  return applyWorkspaceArticleEditedDraft(workspace, editedDraft) ?? workspace;
}

export function buildWorkspaceArticleWorkspaceViewModel(
  profile: WorkspaceArticleWorkspace,
): WorkspaceArticleWorkspaceViewModel {
  const selectedRefCandidate = findObjectByRef(
    profile.objects,
    profile.selectedObjectRef,
  );
  const primaryRefCandidate = findObjectByRef(
    profile.objects,
    profile.primaryObjectRef,
  );
  const editedDraftCandidate = findObjectByEditedDraft(
    profile.objects,
    profile.editedDraft,
  );
  const preferredArticleDraft = selectWorkspaceArticleDraftObject(
    profile.objects,
  );
  const selectedObject =
    (selectedRefCandidate?.ref.kind !== "articleDraft"
      ? selectedRefCandidate
      : null) ??
    editedDraftCandidate ??
    (selectedRefCandidate?.ref.kind === "articleDraft"
      ? selectWorkspaceArticleDraftObject(profile.objects, selectedRefCandidate)
      : selectedRefCandidate) ??
    (primaryRefCandidate?.ref.kind === "articleDraft"
      ? selectWorkspaceArticleDraftObject(profile.objects, primaryRefCandidate)
      : primaryRefCandidate) ??
    preferredArticleDraft ??
    profile.objects[0];
  if (!selectedObject) {
    throw new Error("articleWorkspace has no article object");
  }

  const statusCounts = { ...EMPTY_STATUS_COUNTS };
  for (const object of profile.objects) {
    statusCounts[object.status] += 1;
  }
  const selectedActionHistory =
    filterWorkspaceArticleWorkspaceActionHistoryForObject(
      profile.actionHistory,
      selectedObject,
    );

  return {
    appId: profile.appId,
    sessionId: profile.sessionId,
    workspaceId: profile.workspaceId ?? null,
    objectCount: profile.objectCount,
    selectedObject,
    objects: profile.objects,
    statusCounts,
    sourceArtifacts: profile.sourceArtifacts ?? [],
    updatedAt: profile.updatedAt ?? null,
    workerEvidence: profile.workerEvidence ?? [],
    workflowRuns: profile.workflowRuns ?? [],
    latestWorkerEvidence: profile.workerEvidence?.[0] ?? null,
    selectedSurface: resolveArticleObjectSurface(selectedObject.ref.kind),
    selectedActions: resolveArticleObjectActions(selectedObject.ref.kind),
    selectedActionHistory,
    latestSelectedAction: selectedActionHistory[0] ?? null,
    selectedArtifactIds:
      resolveWorkspaceArticleObjectArtifactIds(selectedObject),
    selectedPreview:
      buildWorkspaceArticleObjectStructuredPreview(selectedObject),
  };
}

function findObjectByEditedDraft(
  objects: readonly WorkspaceArticleObject[],
  editedDraft: WorkspaceArticleEditedDraft | null | undefined,
): WorkspaceArticleObject | null {
  const objectKey = editedDraft?.objectKey?.trim();
  if (!objectKey) {
    return null;
  }
  return (
    objects.find((object) => workspaceArticleObjectKey(object) === objectKey) ??
    null
  );
}

function workspaceArticleObjectKey(object: WorkspaceArticleObject): string {
  return `${object.ref.appId}:${object.ref.sessionId}:${object.ref.kind}:${object.ref.id}`;
}

export function selectWorkspaceArticleDraftObject(
  objects: readonly WorkspaceArticleObject[],
  fallback?: WorkspaceArticleObject | null,
): WorkspaceArticleObject | null {
  let selected: WorkspaceArticleObject | null =
    fallback?.ref.kind === "articleDraft" ? fallback : null;
  let selectedScore = selected ? scoreArticleDraftCompleteness(selected) : null;

  for (const object of objects) {
    if (object.ref.kind !== "articleDraft") {
      continue;
    }
    const score = scoreArticleDraftCompleteness(object);
    if (
      !selected ||
      !selectedScore ||
      compareArticleDraftScores(score, selectedScore) > 0
    ) {
      selected = object;
      selectedScore = score;
    }
  }

  return selected;
}

export function hasWorkspaceArticleFinalDocument(
  articleWorkspace: WorkspaceArticleWorkspace | null | undefined,
): boolean {
  if (!articleWorkspace) {
    return false;
  }
  const articleObject = selectWorkspaceArticleDraftObject(
    articleWorkspace.objects,
  );
  if (!articleObject) {
    return false;
  }
  return Boolean(
    buildWorkspaceArticleObjectStructuredPreview(articleObject).documentText,
  );
}

interface ArticleDraftCompletenessScore {
  researchRounds: number;
  outlineSections: number;
  imageSlots: number;
  citations: number;
  writingPlanSteps: number;
  titleCandidates: number;
  keyTakeaways: number;
  markdownLength: number;
  workerBacked: number;
  sourceUpdatedAt: number;
  refVersion: number;
}

function scoreArticleDraftCompleteness(
  object: WorkspaceArticleObject,
): ArticleDraftCompletenessScore {
  const source = object.source ?? {};
  const markdown = readWorkspaceArticleDraftMarkdown(source);
  return {
    researchRounds: readArray(source.researchRounds, source.research_rounds)
      .length,
    outlineSections: readArray(source.outline, source.sections).length,
    imageSlots: readArray(source.imageSlots, source.image_slots).length,
    citations: readArray(source.citations, source.references).length,
    writingPlanSteps: readArray(source.writingPlan, source.writing_plan).length,
    titleCandidates: readArray(source.titleCandidates, source.title_candidates)
      .length,
    keyTakeaways: readStringItems(
      source.keyTakeaways,
      source.key_takeaways,
      source.takeaways,
    ).length,
    markdownLength: markdown.length,
    workerBacked: readString(
      source.taskId,
      source.task_id,
      object.ref.sourceTaskId,
    )
      ? 1
      : 0,
    sourceUpdatedAt:
      readTimestamp(
        source.updatedAt,
        source.updated_at,
        source.completedAt,
        source.completed_at,
      ) ?? 0,
    refVersion: readVersionRank(object.ref.version),
  };
}

function compareArticleDraftScores(
  left: ArticleDraftCompletenessScore,
  right: ArticleDraftCompletenessScore,
): number {
  const fields: Array<keyof ArticleDraftCompletenessScore> = [
    "researchRounds",
    "outlineSections",
    "imageSlots",
    "citations",
    "writingPlanSteps",
    "titleCandidates",
    "keyTakeaways",
    "markdownLength",
    "workerBacked",
    "sourceUpdatedAt",
    "refVersion",
  ];
  for (const field of fields) {
    const diff = left[field] - right[field];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function resolveArticleObjectSurface(
  kind: string,
): WorkspaceArticleWorkspaceObjectSurface {
  switch (kind) {
    case "contentBrief":
      return {
        layout: "briefForm",
        titleKey: "workspace.articleWorkspace.surface.briefForm",
      };
    case "articleDraft":
    case "videoScript":
      return {
        layout: "document",
        titleKey: "workspace.articleWorkspace.surface.document",
      };
    case "imageGenerationSet":
      return {
        layout: "imageGrid",
        titleKey: "workspace.articleWorkspace.surface.imageGrid",
      };
    case "videoStoryboard":
      return {
        layout: "storyboard",
        titleKey: "workspace.articleWorkspace.surface.storyboard",
      };
    case "deliveryChecklist":
      return {
        layout: "checklist",
        titleKey: "workspace.articleWorkspace.surface.checklist",
      };
    default:
      return {
        layout: "generic",
        titleKey: "workspace.articleWorkspace.surface.generic",
      };
  }
}

function resolveArticleObjectActions(
  kind: string,
): WorkspaceArticleWorkspaceAction[] {
  switch (kind) {
    case "contentBrief":
      return [
        action("start_article", "custom", "write", "content.article.generate"),
      ];
    case "articleDraft":
      return [
        action("revise", "revise", "write", "content.article.generate"),
        action(
          "continue_writing",
          "custom",
          "write",
          "content.article.generate",
        ),
        action("generate_images", "custom", "write", "content.image.generate"),
        action("export_markdown", "export", "read"),
      ];
    case "imageGenerationSet":
      return [
        action("regenerate", "regenerate", "write", "content.image.generate"),
        action(
          "create_variant",
          "create_variant",
          "write",
          "content.image.generate",
        ),
        action(
          "apply_to_article",
          "custom",
          "write",
          "content.article.generate",
        ),
      ];
    case "videoScript":
      return [
        action("revise", "revise", "write", "content.video.script.generate"),
        action(
          "continue_writing",
          "custom",
          "write",
          "content.video.script.generate",
        ),
        action("export_markdown", "export", "read"),
      ];
    case "videoStoryboard":
      return [
        action(
          "rewrite_shot",
          "revise",
          "write",
          "content.video.storyboard.generate",
        ),
        action("export_storyboard", "export", "read"),
      ];
    case "deliveryChecklist":
      return [
        action("approve", "approve", "write"),
        action(
          "request_revision",
          "revise",
          "write",
          "content.delivery.review",
        ),
      ];
    default:
      return [];
  }
}

function action(
  key: string,
  intent: string,
  risk: WorkspaceArticleWorkspaceActionRisk,
  taskKind?: string,
): WorkspaceArticleWorkspaceAction {
  const camelKey = snakeToCamel(key);
  return {
    key,
    intent,
    risk,
    taskKind,
    labelKey: `workspace.articleWorkspace.action.${camelKey}`,
    promptKey: `workspace.articleWorkspace.actionPrompt.${camelKey}`,
  };
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function readArticleObject(value: unknown): WorkspaceArticleObject | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const ref = readObjectRef(firstRecord(record.ref, record.objectRef));
  if (!ref) {
    return null;
  }
  const title = readString(record.title, record.name) || ref.kind;
  const rawStatus = readString(record.status).replace(/-/g, "_");
  const status = KNOWN_STATUSES.has(rawStatus as WorkspaceArticleObjectStatus)
    ? (rawStatus as WorkspaceArticleObjectStatus)
    : "unknown";
  return {
    ref,
    title,
    status,
    summary: readString(record.summary, record.description) || null,
    previewArtifactId:
      readString(record.previewArtifactId, record.preview_artifact_id) || null,
    source: asRecord(record.source),
  };
}

function readObjectRef(value: unknown): WorkspaceArticleObjectRef | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const appId = readString(record.appId, record.app_id);
  const kind = readString(record.kind);
  const id = readString(record.id);
  const sessionId = readString(record.sessionId, record.session_id);
  if (!appId || !kind || !id || !sessionId) {
    return null;
  }
  return {
    appId,
    kind,
    id,
    sessionId,
    version: readString(record.version) || null,
    artifactIds: readArray(record.artifactIds, record.artifact_ids).filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    ),
    sourceTurnId:
      readString(record.sourceTurnId, record.source_turn_id) || null,
    sourceTaskId:
      readString(record.sourceTaskId, record.source_task_id) || null,
  };
}

function readLayoutState(
  value: unknown,
): WorkspaceArticleWorkspaceLayoutState | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    activeTabKind:
      readString(record.activeTabKind, record.active_tab_kind) || null,
    activePaneKind:
      readString(record.activePaneKind, record.active_pane_kind) || null,
    openTabKinds: readArray(record.openTabKinds, record.open_tab_kinds).filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    ),
    splitMode: readString(record.splitMode, record.split_mode) || null,
  };
}

function findObjectByRef(
  objects: readonly WorkspaceArticleObject[],
  ref?: WorkspaceArticleObjectRef | null,
): WorkspaceArticleObject | null {
  if (!ref) {
    return null;
  }
  return (
    objects.find(
      (object) =>
        object.ref.appId === ref.appId &&
        object.ref.sessionId === ref.sessionId &&
        object.ref.kind === ref.kind &&
        object.ref.id === ref.id,
    ) ?? null
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) {
      return record;
    }
  }
  return null;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readStringItems(...values: unknown[]): string[] {
  return readArray(...values).filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function readTimestamp(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const timestamp = Date.parse(normalized);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  return null;
}

function readVersionRank(version: string | null | undefined): number {
  if (!version) {
    return 0;
  }
  const matches = version.match(/\d+/g);
  if (!matches) {
    return 0;
  }
  return Number.parseInt(matches[matches.length - 1] ?? "0", 10) || 0;
}

function readArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}
