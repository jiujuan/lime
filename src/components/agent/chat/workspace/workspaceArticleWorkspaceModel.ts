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
import { buildWorkspacePluginPaneActionRequestMetadata } from "./workspacePluginPaneAction";

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
        metadata?.articleWorkspace,
        metadata?.article_workspace,
        metadata?.articleWorkspace,
        metadata?.article_workspace,
        metadata?.workspacePatch,
        metadata?.workspace_patch,
        metadata?.contentFactoryWorkspacePatch,
        artifactMetadata?.articleWorkspace,
        artifactMetadata?.article_workspace,
        artifactMetadata?.articleWorkspace,
        artifactMetadata?.article_workspace,
        artifactMetadata?.workspacePatch,
        artifactMetadata?.workspace_patch,
        artifactMetadata?.contentFactoryWorkspacePatch,
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
    "agent-app";
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
  const preferredArticleDraft = selectWorkspaceArticleDraftObject(
    profile.objects,
  );
  const selectedObject =
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
    latestWorkerEvidence: profile.workerEvidence?.[0] ?? null,
    selectedSurface: resolveArticleObjectSurface(selectedObject.ref.kind),
    selectedActions: resolveArticleObjectActions(selectedObject.ref.kind),
    selectedActionHistory,
    latestSelectedAction: selectedActionHistory[0] ?? null,
    selectedArtifactIds: resolveArticleObjectArtifactIds(selectedObject),
    selectedPreview:
      buildWorkspaceArticleObjectStructuredPreview(selectedObject),
  };
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
  const markdown = readString(
    source.markdown,
    source.documentText,
    source.document_text,
    source.body,
    source.content,
    source.text,
    source.excerpt,
  );
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

function readOutputArtifactKindFromRecord(
  record: Record<string, unknown> | null | undefined,
): string {
  if (!record) {
    return "";
  }
  return readString(
    record.outputArtifactKind,
    record.output_artifact_kind,
    record.workerOutputArtifactKind,
    record.worker_output_artifact_kind,
    record.artifactKind,
    record.artifact_kind,
  );
}

export function resolveWorkspaceArticleWorkspaceActionOutputArtifactKind(
  intent: WorkspaceArticleWorkspaceActionIntent,
): string | null {
  const objectSourceOutput = readOutputArtifactKindFromRecord(
    asRecord(intent.object.source),
  );
  if (objectSourceOutput) {
    return objectSourceOutput;
  }

  for (const artifact of intent.articleWorkspace.sourceArtifacts ?? []) {
    const output = readOutputArtifactKindFromRecord(asRecord(artifact));
    if (output) {
      return output;
    }
  }

  for (const evidence of intent.articleWorkspace.workerEvidence ?? []) {
    const output = evidence.artifactKind?.trim();
    if (output) {
      return output;
    }
  }

  return null;
}

export function buildWorkspaceArticleWorkspaceActionRequestMetadata(
  intent: WorkspaceArticleWorkspaceActionIntent,
): Record<string, unknown> {
  const artifactIds = resolveArticleObjectArtifactIds(intent.object);
  const editedMarkdown = intent.editedMarkdown?.trim() || null;
  const outputArtifactKind =
    resolveWorkspaceArticleWorkspaceActionOutputArtifactKind(intent);
  const paneActionMetadata = buildWorkspacePluginPaneActionRequestMetadata({
    action: intent.action,
    appId: intent.articleWorkspace.appId,
    sessionId: intent.articleWorkspace.sessionId,
    workspaceId: intent.articleWorkspace.workspaceId ?? null,
    prompt: intent.prompt,
    outputArtifactKind,
    paneKind: intent.object.ref.kind,
    surfaceKind: "articleWorkspace",
    source: "right_surface_article_workspace",
    sourceArtifactIds: artifactIds,
    object: {
      app_id: intent.object.ref.appId,
      kind: intent.object.ref.kind,
      id: intent.object.ref.id,
      session_id: intent.object.ref.sessionId,
      version: intent.object.ref.version ?? null,
      title: intent.object.title,
      status: intent.object.status,
      artifact_ids: artifactIds,
      preview_artifact_id: intent.object.previewArtifactId ?? null,
      source_turn_id: intent.object.ref.sourceTurnId ?? null,
      source_task_id: intent.object.ref.sourceTaskId ?? null,
    },
  });
  const paneAgentApp =
    typeof paneActionMetadata.agent_app === "object" &&
    paneActionMetadata.agent_app !== null
      ? (paneActionMetadata.agent_app as Record<string, unknown>)
      : {};
  return {
    agent_app: {
      ...paneAgentApp,
      source: "right_surface_article_workspace",
      app_id: intent.articleWorkspace.appId,
      session_id: intent.articleWorkspace.sessionId,
      workspace_id: intent.articleWorkspace.workspaceId ?? null,
      article_workspace_action: {
        key: intent.action.key,
        intent: intent.action.intent,
        risk: intent.action.risk,
        task_kind: intent.action.taskKind ?? null,
        output_artifact_kind: outputArtifactKind,
        prompt: intent.prompt,
        edited_markdown: editedMarkdown,
        object: {
          app_id: intent.object.ref.appId,
          kind: intent.object.ref.kind,
          id: intent.object.ref.id,
          session_id: intent.object.ref.sessionId,
          version: intent.object.ref.version ?? null,
          title: intent.object.title,
          status: intent.object.status,
          artifact_ids: artifactIds,
          preview_artifact_id: intent.object.previewArtifactId ?? null,
          source_turn_id: intent.object.ref.sourceTurnId ?? null,
          source_task_id: intent.object.ref.sourceTaskId ?? null,
        },
      },
    },
    right_surface: {
      surface_kind: "articleWorkspace",
      pane_kind: intent.object.ref.kind,
      source: intent.articleWorkspace.source,
      action_key: intent.action.key,
    },
  };
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

function resolveArticleObjectArtifactIds(
  object: WorkspaceArticleObject,
): string[] {
  const ids = new Set<string>();
  for (const artifactId of object.ref.artifactIds ?? []) {
    const normalized = artifactId.trim();
    if (normalized) {
      ids.add(normalized);
    }
  }
  const previewArtifactId = object.previewArtifactId?.trim();
  if (previewArtifactId) {
    ids.add(previewArtifactId);
  }
  const sourceArtifactIds = readArray(object.source?.artifactIds).filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
  for (const artifactId of sourceArtifactIds) {
    ids.add(artifactId.trim());
  }
  return Array.from(ids);
}

export function buildWorkspaceArticleObjectStructuredPreview(
  object: WorkspaceArticleObject,
): WorkspaceArticleWorkspaceStructuredPreview {
  const source = object.source ?? {};
  return {
    documentText:
      readString(
        source.markdown,
        source.documentText,
        source.document_text,
        source.body,
        source.content,
        source.text,
        source.excerpt,
      ) || null,
    images: readArray(
      source.images,
      source.imageItems,
      source.image_items,
      source.imageUrls,
      source.image_urls,
    )
      .map(readPreviewImage)
      .filter((item): item is WorkspaceArticleWorkspacePreviewImage =>
        Boolean(item),
      ),
    storyboard: readArray(source.shots, source.storyboard, source.scenes)
      .map(readStoryboardRow)
      .filter((item): item is WorkspaceArticleWorkspacePreviewStoryboardRow =>
        Boolean(item),
      ),
    checklist: readArray(
      source.items,
      source.checklist,
      source.checklistItems,
      source.checklist_items,
    )
      .map(readChecklistItem)
      .filter((item): item is WorkspaceArticleWorkspacePreviewChecklistItem =>
        Boolean(item),
      ),
    briefFields: readPreviewFields(source),
    researchRounds: readArray(source.researchRounds, source.research_rounds)
      .map(readResearchRound)
      .filter((item): item is WorkspaceArticleWorkspaceResearchRound =>
        Boolean(item),
      ),
    titleCandidates: readArray(source.titleCandidates, source.title_candidates)
      .map(readTitleCandidate)
      .filter((item): item is WorkspaceArticleWorkspaceTitleCandidate =>
        Boolean(item),
      ),
    outline: readArray(source.outline, source.sections)
      .map(readOutlineSection)
      .filter((item): item is WorkspaceArticleWorkspaceOutlineSection =>
        Boolean(item),
      ),
    keyTakeaways: readStringItems(
      source.keyTakeaways,
      source.key_takeaways,
      source.takeaways,
    ),
    imageSlots: readArray(source.imageSlots, source.image_slots)
      .map(readImageSlot)
      .filter((item): item is WorkspaceArticleWorkspaceImageSlot =>
        Boolean(item),
      ),
    citations: readArray(source.citations, source.references)
      .map(readCitation)
      .filter((item): item is WorkspaceArticleWorkspaceCitation =>
        Boolean(item),
      ),
    writingPlan: readArray(source.writingPlan, source.writing_plan)
      .map(readWritingPlanStep)
      .filter((item): item is WorkspaceArticleWorkspaceWritingPlanStep =>
        Boolean(item),
      ),
    reviewNotes: readStringItems(
      source.reviewNotes,
      source.review_notes,
      source.risks,
    ),
  };
}

function readStringItems(...values: unknown[]): string[] {
  return readArray(...values).filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function readNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readResearchRound(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceResearchRound | null {
  const fallbackId = `research-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: fallbackId,
          title: normalized,
          summary: normalized,
          citations: [],
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.query);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    query: readString(record.query, record.keyword) || null,
    status: readString(record.status, record.state) || null,
    summary:
      readString(record.summary, record.description, record.result) || null,
    citations: readStringItems(record.citations, record.references),
  };
}

function readTitleCandidate(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceTitleCandidate | null {
  const fallbackId = `title-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? { id: fallbackId, title: normalized } : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.text);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    angle: readString(record.angle, record.reason, record.description) || null,
    score: readNumberValue(record.score),
  };
}

function readOutlineSection(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceOutlineSection | null {
  const fallbackId = `section-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? { id: fallbackId, title: normalized, points: [], evidenceIds: [] }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.heading);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    purpose:
      readString(record.purpose, record.summary, record.description) || null,
    points: readStringItems(record.points, record.bullets),
    evidenceIds: readStringItems(record.evidenceIds, record.evidence_ids),
  };
}

function readImageSlot(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceImageSlot | null {
  const fallbackId = `image-slot-${index + 1}`;
  const record = asRecord(value);
  if (!record) {
    return typeof value === "string" && value.trim()
      ? { id: fallbackId, title: value.trim() }
      : null;
  }
  const title = readString(record.title, record.name, record.id);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    sectionId: readString(record.sectionId, record.section_id) || null,
    purpose: readString(record.purpose, record.description) || null,
    prompt:
      readString(record.prompt, record.imagePrompt, record.image_prompt) ||
      null,
    status: readString(record.status, record.state) || null,
  };
}

function readCitation(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceCitation | null {
  const fallbackId = `citation-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? { id: fallbackId, title: normalized } : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.url, record.id);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    sourceType:
      readString(record.sourceType, record.source_type, record.type) || null,
    summary:
      readString(record.summary, record.description, record.notes) || null,
    status: readString(record.status, record.state) || null,
  };
}

function readWritingPlanStep(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceWritingPlanStep | null {
  const fallbackId = `plan-${index + 1}`;
  const record = asRecord(value);
  if (!record) {
    return typeof value === "string" && value.trim()
      ? { id: fallbackId, title: value.trim() }
      : null;
  }
  const title = readString(record.title, record.name, record.id);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    owner: readString(record.owner, record.subagent) || null,
    skillRef: readString(record.skillRef, record.skill_ref) || null,
    output:
      readString(
        record.output,
        record.expectedOutput,
        record.expected_output,
      ) || null,
    goal: readString(record.goal) || null,
    done: typeof record.done === "boolean" ? record.done : null,
  };
}

function readPreviewImage(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewImage | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: normalized,
          title: normalized,
          url: normalized,
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const url = readString(record.url, record.src, record.thumbnailUrl);
  const localPath = readString(
    record.localPath,
    record.local_path,
    record.filePath,
    record.file_path,
    record.path,
    record.cachedPath,
    record.cached_path,
    record.assetPath,
    record.asset_path,
  );
  const id =
    readString(
      record.id,
      record.artifactId,
      record.artifact_id,
      url,
      localPath,
    ) || `image-${index + 1}`;
  return {
    id,
    title: readString(record.title, record.name, record.alt, id) || id,
    url: url || null,
    localPath: localPath || null,
    filePath: readString(record.filePath, record.file_path) || null,
    cachedPath: readString(record.cachedPath, record.cached_path) || null,
    alt: readString(record.alt, record.description) || null,
    prompt:
      readString(record.prompt, record.imagePrompt, record.image_prompt) ||
      null,
  };
}

function readStoryboardRow(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewStoryboardRow | null {
  const fallbackId = `shot-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: fallbackId,
          title: normalized,
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id, record.shotId, record.shot_id) || fallbackId;
  const title =
    readString(record.title, record.name, record.scene, record.summary) ||
    `${index + 1}`;
  return {
    id,
    title,
    description:
      readString(
        record.description,
        record.action,
        record.camera,
        record.notes,
      ) || null,
    visualPrompt:
      readString(record.visualPrompt, record.visual_prompt, record.prompt) ||
      null,
    duration: readString(record.duration, record.time, record.seconds) || null,
  };
}

function readChecklistItem(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewChecklistItem | null {
  const fallbackId = `item-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: fallbackId,
          title: normalized,
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.label, record.name);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    status: readString(record.status, record.state) || null,
    notes: readString(record.notes, record.description, record.reason) || null,
  };
}

function readPreviewFields(
  source: Record<string, unknown>,
): WorkspaceArticleWorkspacePreviewField[] {
  const fields = readArray(
    source.fields,
    source.briefFields,
    source.brief_fields,
  )
    .map(readPreviewField)
    .filter((item): item is WorkspaceArticleWorkspacePreviewField =>
      Boolean(item),
    );
  if (fields.length > 0) {
    return fields;
  }

  const brief = asRecord(source.brief);
  if (!brief) {
    return [];
  }
  return Object.entries(brief)
    .map(([key, value]) => {
      const normalized = readString(value);
      return normalized
        ? {
            key,
            label: key,
            value: normalized,
          }
        : null;
    })
    .filter((item): item is WorkspaceArticleWorkspacePreviewField =>
      Boolean(item),
    );
}

function readPreviewField(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewField | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const key = readString(record.key, record.id) || `field-${index + 1}`;
  const label = readString(record.label, record.title, record.name, key);
  const fieldValue = readString(record.value, record.text, record.content);
  if (!fieldValue) {
    return null;
  }
  return {
    key,
    label,
    value: fieldValue,
  };
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
