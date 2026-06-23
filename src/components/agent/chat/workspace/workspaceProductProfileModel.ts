import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import {
  filterWorkspaceProductProfileActionHistoryForObject,
  readWorkspaceProductProfileActionHistory,
  type WorkspaceProductProfileActionHistoryItem,
} from "./workspaceProductProfileActionHistory";

export type WorkspaceProductProfileSource =
  | "threadRead"
  | "rightSurfacePending";

export interface WorkspaceProductObjectRef {
  appId: string;
  kind: string;
  id: string;
  sessionId: string;
  version?: string | null;
  artifactIds?: string[];
  sourceTurnId?: string | null;
  sourceTaskId?: string | null;
}

export type WorkspaceProductObjectStatus =
  | "draft"
  | "generating"
  | "ready"
  | "needs_review"
  | "archived"
  | "failed"
  | "unknown";

export type WorkspaceProductProfileSurfaceLayout =
  | "briefForm"
  | "document"
  | "imageGrid"
  | "storyboard"
  | "checklist"
  | "generic";

export type WorkspaceProductProfileActionRisk = "read" | "write";

export interface WorkspaceProductProfileAction {
  key: string;
  intent: string;
  labelKey: string;
  promptKey: string;
  risk: WorkspaceProductProfileActionRisk;
  taskKind?: string;
}

export interface WorkspaceProductProfileActionIntent {
  action: WorkspaceProductProfileAction;
  object: WorkspaceProductObject;
  profile: WorkspaceProductProfile;
  prompt: string;
}

export interface WorkspaceProductProfileObjectSurface {
  layout: WorkspaceProductProfileSurfaceLayout;
  titleKey: string;
}

export interface WorkspaceProductProfilePreviewImage {
  id: string;
  title: string;
  url?: string | null;
  alt?: string | null;
  prompt?: string | null;
}

export interface WorkspaceProductProfilePreviewStoryboardRow {
  id: string;
  title: string;
  description?: string | null;
  visualPrompt?: string | null;
  duration?: string | null;
}

export interface WorkspaceProductProfilePreviewChecklistItem {
  id: string;
  title: string;
  status?: string | null;
  notes?: string | null;
}

export interface WorkspaceProductProfilePreviewField {
  key: string;
  label: string;
  value: string;
}

export interface WorkspaceProductProfileStructuredPreview {
  documentText: string | null;
  images: WorkspaceProductProfilePreviewImage[];
  storyboard: WorkspaceProductProfilePreviewStoryboardRow[];
  checklist: WorkspaceProductProfilePreviewChecklistItem[];
  briefFields: WorkspaceProductProfilePreviewField[];
}

export interface WorkspaceProductObject {
  ref: WorkspaceProductObjectRef;
  title: string;
  status: WorkspaceProductObjectStatus;
  summary?: string | null;
  previewArtifactId?: string | null;
  source?: Record<string, unknown> | null;
}

export interface WorkspaceProductProfileLayoutState {
  activeTabKind?: string | null;
  activePaneKind?: string | null;
  openTabKinds?: string[];
  splitMode?: string | null;
}

export interface WorkspaceProductProfile {
  schemaVersion: string;
  appId: string;
  sessionId: string;
  workspaceId?: string | null;
  source: WorkspaceProductProfileSource;
  objects: WorkspaceProductObject[];
  objectCount: number;
  primaryObjectRef?: WorkspaceProductObjectRef | null;
  selectedObjectRef?: WorkspaceProductObjectRef | null;
  layoutState?: WorkspaceProductProfileLayoutState | null;
  sourceArtifacts?: Record<string, unknown>[];
  actionHistory: WorkspaceProductProfileActionHistoryItem[];
  updatedAt?: string | null;
}

export interface WorkspaceProductProfileViewModel {
  appId: string;
  sessionId: string;
  workspaceId: string | null;
  objectCount: number;
  selectedObject: WorkspaceProductObject;
  objects: WorkspaceProductObject[];
  statusCounts: Record<WorkspaceProductObjectStatus, number>;
  sourceArtifacts: Record<string, unknown>[];
  updatedAt: string | null;
  selectedSurface: WorkspaceProductProfileObjectSurface;
  selectedActions: WorkspaceProductProfileAction[];
  selectedActionHistory: WorkspaceProductProfileActionHistoryItem[];
  latestSelectedAction: WorkspaceProductProfileActionHistoryItem | null;
  selectedArtifactIds: string[];
  selectedPreview: WorkspaceProductProfileStructuredPreview;
}

const KNOWN_STATUSES = new Set<WorkspaceProductObjectStatus>([
  "draft",
  "generating",
  "ready",
  "needs_review",
  "archived",
  "failed",
  "unknown",
]);

const EMPTY_STATUS_COUNTS: Record<WorkspaceProductObjectStatus, number> = {
  draft: 0,
  generating: 0,
  ready: 0,
  needs_review: 0,
  archived: 0,
  failed: 0,
  unknown: 0,
};

export function buildWorkspaceProductProfileFromThreadRead(
  threadRead?: AgentRuntimeThreadReadModel | null,
): WorkspaceProductProfile | null {
  const record = asRecord(threadRead);
  if (!record) {
    return null;
  }
  return buildWorkspaceProductProfileFromUnknown(
    firstRecord(record.productWorkspace, record.product_workspace),
    "threadRead",
  );
}

export function buildWorkspaceProductProfileFromPendingRequests(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
): WorkspaceProductProfile | null {
  for (const request of pendingRequests) {
    if (
      request.status !== "pending" ||
      request.surfaceKind !== "productProfile"
    ) {
      continue;
    }
    const metadata = asRecord(request.metadata);
    const profile = buildWorkspaceProductProfileFromUnknown(
      firstRecord(
        metadata?.productWorkspace,
        metadata?.product_workspace,
        metadata?.workspacePatch,
        metadata?.workspace_patch,
        metadata?.contentFactoryWorkspacePatch,
        metadata,
      ),
      "rightSurfacePending",
    );
    if (!profile) {
      continue;
    }
    return {
      ...profile,
      workspaceId: profile.workspaceId ?? request.workspaceId ?? null,
      sessionId: profile.sessionId || request.sessionId || profile.sessionId,
      sourceArtifacts:
        profile.sourceArtifacts && profile.sourceArtifacts.length > 0
          ? profile.sourceArtifacts
          : [
              {
                requestId: request.requestId,
                origin: request.origin,
                reason: request.reason,
                requestedAt: request.requestedAt,
              },
            ],
      updatedAt: profile.updatedAt ?? request.requestedAt,
    };
  }
  return null;
}

export function buildWorkspaceProductProfileFromUnknown(
  value: unknown,
  source: WorkspaceProductProfileSource,
): WorkspaceProductProfile | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const objects = readArray(record.objects)
    .map(readProductObject)
    .filter((object): object is WorkspaceProductObject => Boolean(object));
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

  return {
    schemaVersion:
      readString(record.schemaVersion, record.schema_version) ||
      "product-workspace.v1",
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
    actionHistory: readWorkspaceProductProfileActionHistory(
      readArray(record.actionHistory, record.action_history),
    ),
    updatedAt: readString(record.updatedAt, record.updated_at) || null,
  };
}

export function buildWorkspaceProductProfileViewModel(
  profile: WorkspaceProductProfile,
): WorkspaceProductProfileViewModel {
  const selectedObject =
    findObjectByRef(profile.objects, profile.selectedObjectRef) ??
    findObjectByRef(profile.objects, profile.primaryObjectRef) ??
    profile.objects[0];
  if (!selectedObject) {
    throw new Error("productProfile has no product object");
  }

  const statusCounts = { ...EMPTY_STATUS_COUNTS };
  for (const object of profile.objects) {
    statusCounts[object.status] += 1;
  }
  const selectedActionHistory =
    filterWorkspaceProductProfileActionHistoryForObject(
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
    selectedSurface: resolveProductObjectSurface(selectedObject.ref.kind),
    selectedActions: resolveProductObjectActions(selectedObject.ref.kind),
    selectedActionHistory,
    latestSelectedAction: selectedActionHistory[0] ?? null,
    selectedArtifactIds: resolveProductObjectArtifactIds(selectedObject),
    selectedPreview:
      buildWorkspaceProductObjectStructuredPreview(selectedObject),
  };
}

export function buildWorkspaceProductProfileActionRequestMetadata(
  intent: WorkspaceProductProfileActionIntent,
): Record<string, unknown> {
  const artifactIds = resolveProductObjectArtifactIds(intent.object);
  return {
    agent_app: {
      source: "right_surface_product_profile",
      app_id: intent.profile.appId,
      session_id: intent.profile.sessionId,
      workspace_id: intent.profile.workspaceId ?? null,
      product_profile_action: {
        key: intent.action.key,
        intent: intent.action.intent,
        risk: intent.action.risk,
        task_kind: intent.action.taskKind ?? null,
        prompt: intent.prompt,
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
      surface_kind: "productProfile",
      source: intent.profile.source,
      action_key: intent.action.key,
    },
  };
}

function resolveProductObjectSurface(
  kind: string,
): WorkspaceProductProfileObjectSurface {
  switch (kind) {
    case "contentBrief":
      return {
        layout: "briefForm",
        titleKey: "workspace.productProfile.surface.briefForm",
      };
    case "articleDraft":
    case "videoScript":
      return {
        layout: "document",
        titleKey: "workspace.productProfile.surface.document",
      };
    case "imageGenerationSet":
      return {
        layout: "imageGrid",
        titleKey: "workspace.productProfile.surface.imageGrid",
      };
    case "videoStoryboard":
      return {
        layout: "storyboard",
        titleKey: "workspace.productProfile.surface.storyboard",
      };
    case "deliveryChecklist":
      return {
        layout: "checklist",
        titleKey: "workspace.productProfile.surface.checklist",
      };
    default:
      return {
        layout: "generic",
        titleKey: "workspace.productProfile.surface.generic",
      };
  }
}

function resolveProductObjectActions(
  kind: string,
): WorkspaceProductProfileAction[] {
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
  risk: WorkspaceProductProfileActionRisk,
  taskKind?: string,
): WorkspaceProductProfileAction {
  const camelKey = snakeToCamel(key);
  return {
    key,
    intent,
    risk,
    taskKind,
    labelKey: `workspace.productProfile.action.${camelKey}`,
    promptKey: `workspace.productProfile.actionPrompt.${camelKey}`,
  };
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function resolveProductObjectArtifactIds(
  object: WorkspaceProductObject,
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

export function buildWorkspaceProductObjectStructuredPreview(
  object: WorkspaceProductObject,
): WorkspaceProductProfileStructuredPreview {
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
      .filter((item): item is WorkspaceProductProfilePreviewImage =>
        Boolean(item),
      ),
    storyboard: readArray(source.shots, source.storyboard, source.scenes)
      .map(readStoryboardRow)
      .filter((item): item is WorkspaceProductProfilePreviewStoryboardRow =>
        Boolean(item),
      ),
    checklist: readArray(
      source.items,
      source.checklist,
      source.checklistItems,
      source.checklist_items,
    )
      .map(readChecklistItem)
      .filter((item): item is WorkspaceProductProfilePreviewChecklistItem =>
        Boolean(item),
      ),
    briefFields: readPreviewFields(source),
  };
}

function readPreviewImage(
  value: unknown,
  index: number,
): WorkspaceProductProfilePreviewImage | null {
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
  const id =
    readString(record.id, record.artifactId, record.artifact_id, url) ||
    `image-${index + 1}`;
  return {
    id,
    title: readString(record.title, record.name, record.alt, id) || id,
    url: url || null,
    alt: readString(record.alt, record.description) || null,
    prompt:
      readString(record.prompt, record.imagePrompt, record.image_prompt) ||
      null,
  };
}

function readStoryboardRow(
  value: unknown,
  index: number,
): WorkspaceProductProfilePreviewStoryboardRow | null {
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
): WorkspaceProductProfilePreviewChecklistItem | null {
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
): WorkspaceProductProfilePreviewField[] {
  const fields = readArray(
    source.fields,
    source.briefFields,
    source.brief_fields,
  )
    .map(readPreviewField)
    .filter((item): item is WorkspaceProductProfilePreviewField =>
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
    .filter((item): item is WorkspaceProductProfilePreviewField =>
      Boolean(item),
    );
}

function readPreviewField(
  value: unknown,
  index: number,
): WorkspaceProductProfilePreviewField | null {
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

function readProductObject(value: unknown): WorkspaceProductObject | null {
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
  const status = KNOWN_STATUSES.has(rawStatus as WorkspaceProductObjectStatus)
    ? (rawStatus as WorkspaceProductObjectStatus)
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

function readObjectRef(value: unknown): WorkspaceProductObjectRef | null {
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
): WorkspaceProductProfileLayoutState | null {
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
  objects: readonly WorkspaceProductObject[],
  ref?: WorkspaceProductObjectRef | null,
): WorkspaceProductObject | null {
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

function readArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}
