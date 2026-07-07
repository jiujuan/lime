import type { Dispatch, SetStateAction } from "react";
import type { AgentRuntimeUpdateSessionRequest } from "@/lib/api/agentRuntime/types";
import type { Artifact } from "@/lib/artifact/types";
import { createPreviewArtifact } from "@/lib/artifact/previewArtifact";
import { isAbsoluteLocalFilePath } from "@/lib/api/fileSystem";
import {
  normalizeArtifactProtocolPath,
  resolveArtifactProtocolFilePath,
} from "@/lib/artifact-protocol";
import type { TaskCenterTabItem } from "../components/TaskCenterTabStrip";
import type { Message, MessagePreviewTarget } from "../types";
import { isHiddenInternalArtifactPath } from "../utils/internalArtifactVisibility";
import { shouldAutoSelectGeneralArtifact } from "./generalArtifactAutoSelection";
import { doesWorkspaceFileCandidateMatch } from "./workspaceFilePathMatch";
import { normalizeProjectId } from "../utils/topicProjectResolution";

type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export const GENERAL_BROWSER_ASSIST_PROFILE_KEY = "general_browser_assist";
export const BLANK_HOME_DEFERRED_LOAD_MS = 18_000;
export const RECENT_CONVERSATIONS_IDLE_DEFERRED_LOAD_MS = 0;
export const SESSION_ENTRY_RUNTIME_WARMUP_DEFERRED_LOAD_MS = 45_000;
export const SESSION_ENTRY_AUXILIARY_DEFERRED_LOAD_MS = 45_000;
export const SESSION_RECENT_METADATA_BACKGROUND_SYNC_DELAY_MS = 12_000;
export const SESSION_RECENT_METADATA_NAVIGATION_DEFER_MS = 45_000;
export const SESSION_RECENT_METADATA_BACKGROUND_SYNC_IDLE_TIMEOUT_MS = 20_000;
export const BROWSER_WORKSPACE_HOME_HINT_STORAGE_KEY =
  "lime.agent.browser-workspace-home-hint-shown";

export const FILE_MANAGER_NAV_COLLAPSE_BREAKPOINT_PX = 1180;
export const APP_SIDEBAR_COLLAPSE_EVENT = "lime:app-sidebar-collapse";
export const BROWSER_WORKSPACE_HOME_HINT_MESSAGE = "在这里切换或新建工作区";
export const BROWSER_WORKSPACE_HOME_HINT_AUTO_HIDE_MS = 5_500;
export const TASK_CENTER_DRAFT_SESSION_WARMUP_DELAY_MS = 120;
export const NOOP_SET_CHAT_MESSAGES: Dispatch<SetStateAction<Message[]>> = () =>
  undefined;

const FILE_MANAGER_SIDEBAR_OPEN_STORAGE_KEY = "lime.file-manager.sidebar-open";
const TASK_CENTER_DRAFT_TAB_PREFIX = "task-draft";

export interface TaskCenterDraftTab {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  status: TaskCenterTabItem["status"];
}

interface ResolveTaskCenterHomeSurfaceStateParams {
  agentEntry: string;
  draftSurfaceActive: boolean;
  shouldSuppressDraftContent: boolean;
  sessionSwitchPending: boolean;
  hasInitialSessionRoute?: boolean;
  hasConversationActivity: boolean;
  hasCurrentSessionActivity?: boolean;
  sessionId?: string | null;
  embeddedHomeSessionIds: ReadonlySet<string>;
  isAutoRestoringSession: boolean;
  isSessionHydrating: boolean;
}

export interface TaskCenterHomeSurfaceState {
  shouldRenderEmbeddedHome: boolean;
  shouldHideCurrentSessionContent: boolean;
  isRestoringSession: boolean;
  sceneSessionId: string | null;
}

export type SessionRecentMetadataSyncPriority = "immediate" | "background";

export interface SessionRecentMetadataSyncOptions {
  priority?: SessionRecentMetadataSyncPriority;
}

export type SessionRecentMetadataPatch = Pick<
  AgentRuntimeUpdateSessionRequest,
  "recent_preferences" | "recent_team_selection"
>;

export interface PendingSessionRecentMetadataSync {
  patch: SessionRecentMetadataPatch;
  priority: SessionRecentMetadataSyncPriority;
  cancel: (() => void) | null;
  resolvers: Array<() => void>;
  rejecters: Array<(error: unknown) => void>;
}

export function resolveRuntimeWorkspaceId(
  projectId: string | null | undefined,
): string {
  return normalizeProjectId(projectId) ?? "";
}

export function areStringArraysEqual(
  left: string[] | null,
  right: string[],
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

export function isTransientWorkspaceBridgeError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    message.includes("[DevBridge] 浏览器模式无法连接后端桥接") ||
    message.includes("Failed to fetch") ||
    normalized.includes("timeout") ||
    normalized.includes("aborterror") ||
    normalized.includes("bridge health check failed") ||
    normalized.includes("bridge cooldown active")
  );
}

export function shouldAutoRecoverWorkspacePathMissing(
  project:
    | {
        workspaceType?: string | null;
      }
    | null
    | undefined,
  workspacePathMissing: unknown,
): boolean {
  if (
    !workspacePathMissing ||
    typeof workspacePathMissing !== "object" ||
    Array.isArray(workspacePathMissing)
  ) {
    return false;
  }

  return project?.workspaceType === "temporary";
}

export function loadFileManagerSidebarOpen(): boolean {
  return false;
}

export function saveFileManagerSidebarOpen(open: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  if (open) {
    window.localStorage.removeItem(FILE_MANAGER_SIDEBAR_OPEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(FILE_MANAGER_SIDEBAR_OPEN_STORAGE_KEY, "false");
}

export function createTaskCenterDraftTabId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${TASK_CENTER_DRAFT_TAB_PREFIX}-${Date.now().toString(36)}-${random}`;
}

export function createLocalImageWorkbenchSessionKey(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `__local_image_workbench__:${Date.now().toString(36)}:${random}`;
}

export function isTaskCenterDraftTabId(value: string): boolean {
  return value.startsWith(`${TASK_CENTER_DRAFT_TAB_PREFIX}-`);
}

export function createTaskCenterDraftSendRequestId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `draft-send-${Date.now().toString(36)}-${random}`;
}

export function resolveTaskCenterDraftSendTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "新对话";
  }

  const preview = Array.from(normalized).slice(0, 18).join("");
  return normalized.length > preview.length ? `${preview}...` : preview;
}

export function isTaskCenterDraftSendPendingForLayout({
  hasDraftSendRequest,
  hasDisplayMessages,
  isSending,
  queuedTurnCount,
}: {
  hasDraftSendRequest: boolean;
  hasDisplayMessages: boolean;
  isSending: boolean;
  queuedTurnCount: number;
}): boolean {
  if (!hasDraftSendRequest) {
    return false;
  }

  return !hasDisplayMessages || isSending || queuedTurnCount > 0;
}

export function shouldBuildFullThreadTimeline({
  harnessPanelVisible,
  layoutMode,
}: {
  harnessPanelVisible: boolean;
  layoutMode: string;
}): boolean {
  return layoutMode !== "chat" || harnessPanelVisible;
}

export function shouldAutoRefreshWorkspaceRightSurfacePending({
  sessionId,
  workspaceId,
  workspaceRoot,
  sceneIsSending,
  sceneIsPreparingSend,
  sceneLayoutMode,
  manualRightSurfaceActive,
  pluginActivationActive,
}: {
  sessionId?: string | null;
  workspaceId?: string | null;
  workspaceRoot?: string | null;
  sceneIsSending: boolean;
  sceneIsPreparingSend: boolean;
  sceneLayoutMode: string;
  manualRightSurfaceActive: boolean;
  pluginActivationActive: boolean;
}): boolean {
  const hasPendingListScope = Boolean(
    sessionId?.trim() || workspaceId?.trim() || workspaceRoot?.trim(),
  );
  return (
    hasPendingListScope ||
    sceneIsSending ||
    sceneIsPreparingSend ||
    sceneLayoutMode !== "chat" ||
    manualRightSurfaceActive ||
    pluginActivationActive
  );
}

export function shouldSuppressTaskCenterDraftContentForLayout({
  draftSurfaceActive,
  draftSendInFlight,
  hasVisibleSessionActivity,
}: {
  draftSurfaceActive: boolean;
  draftSendInFlight: boolean;
  hasVisibleSessionActivity: boolean;
}): boolean {
  return draftSurfaceActive && !draftSendInFlight && !hasVisibleSessionActivity;
}

export function resolveTaskCenterHomeSurfaceState({
  agentEntry,
  draftSurfaceActive,
  shouldSuppressDraftContent,
  sessionSwitchPending,
  hasInitialSessionRoute = false,
  hasConversationActivity,
  hasCurrentSessionActivity = hasConversationActivity,
  sessionId,
  embeddedHomeSessionIds,
  isAutoRestoringSession,
  isSessionHydrating,
}: ResolveTaskCenterHomeSurfaceStateParams): TaskCenterHomeSurfaceState {
  const hasEmbeddedHomeSession = Boolean(
    sessionId && embeddedHomeSessionIds.has(sessionId),
  );
  const shouldProtectInitialSessionRoute =
    hasInitialSessionRoute && !draftSurfaceActive;
  const shouldRenderEmbeddedHome = Boolean(
    agentEntry === "claw" &&
    !sessionSwitchPending &&
    !shouldProtectInitialSessionRoute &&
    !hasConversationActivity &&
    !hasCurrentSessionActivity &&
    (draftSurfaceActive || hasEmbeddedHomeSession),
  );
  const isSessionRestorePending =
    isAutoRestoringSession || isSessionHydrating || sessionSwitchPending;
  const shouldKeepDraftHomeShell =
    shouldSuppressDraftContent &&
    !sessionSwitchPending &&
    !shouldProtectInitialSessionRoute &&
    !hasCurrentSessionActivity;
  const shouldHideCurrentSessionContent =
    sessionSwitchPending ||
    (shouldSuppressDraftContent &&
      !shouldProtectInitialSessionRoute &&
      !hasCurrentSessionActivity);

  return {
    shouldRenderEmbeddedHome,
    shouldHideCurrentSessionContent,
    isRestoringSession: isSessionRestorePending && !shouldKeepDraftHomeShell,
    sceneSessionId: shouldHideCurrentSessionContent
      ? null
      : (sessionId ?? null),
  };
}

export function scheduleAfterNextPaint(callback: () => void): () => void {
  if (typeof window === "undefined") {
    callback();
    return () => undefined;
  }

  if (typeof window.requestAnimationFrame !== "function") {
    const timeoutId = window.setTimeout(callback, 0);
    return () => window.clearTimeout(timeoutId);
  }

  let secondFrameId: number | null = null;
  const firstFrameId = window.requestAnimationFrame(() => {
    secondFrameId = window.requestAnimationFrame(callback);
  });

  return () => {
    window.cancelAnimationFrame(firstFrameId);
    if (secondFrameId !== null) {
      window.cancelAnimationFrame(secondFrameId);
    }
  };
}

export function mergeSessionRecentMetadataSyncPriority(
  current: SessionRecentMetadataSyncPriority,
  next?: SessionRecentMetadataSyncPriority,
): SessionRecentMetadataSyncPriority {
  if (current === "immediate" || next !== "background") {
    return "immediate";
  }

  return "background";
}

export function resolveDefaultSelectedArtifact(
  activeTheme: string,
  artifacts: Artifact[],
): Artifact | null {
  if (artifacts.length === 0) {
    return null;
  }

  if (activeTheme !== "general") {
    return artifacts[artifacts.length - 1] ?? null;
  }

  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    const candidate = artifacts[index];
    if (
      candidate.type !== "browser_assist" &&
      shouldAutoSelectGeneralArtifact(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

export function resolveVideoCanvasStatusFromPreview(
  target: Extract<MessagePreviewTarget, { kind: "task" }>,
): "idle" | "generating" | "success" | "error" {
  const preview = target.preview;
  if (preview.kind !== "video_generate") {
    return "idle";
  }
  if (
    (preview.status === "complete" || preview.status === "partial") &&
    preview.videoUrl
  ) {
    return "success";
  }
  if (preview.status === "failed" || preview.status === "cancelled") {
    return "error";
  }
  return "generating";
}

export function resolveTaskPreviewArtifact(
  message: Message,
  target: Extract<MessagePreviewTarget, { kind: "task" }>,
): Artifact | null {
  const normalizedArtifactPath = normalizeArtifactProtocolPath(
    target.preview.kind === "video_generate"
      ? null
      : target.preview.artifactPath || null,
  );
  const messageArtifacts = message.artifacts || [];
  if (normalizedArtifactPath) {
    const matchedArtifact = messageArtifacts.find(
      (artifact) =>
        !isHiddenInternalArtifactPath(
          resolveArtifactProtocolFilePath(artifact),
        ) &&
        doesWorkspaceFileCandidateMatch(
          resolveArtifactProtocolFilePath(artifact),
          normalizedArtifactPath,
        ),
    );
    if (matchedArtifact) {
      return matchedArtifact;
    }
  }

  const visibleArtifacts = messageArtifacts.filter(
    (artifact) =>
      !isHiddenInternalArtifactPath(resolveArtifactProtocolFilePath(artifact)),
  );
  return visibleArtifacts.length > 0
    ? (visibleArtifacts[visibleArtifacts.length - 1] ?? null)
    : null;
}

type MediaReferencePreviewSource =
  | {
      kind: "direct_uri" | "preview_url" | "source_uri";
      value: string;
    }
  | {
      kind: "source_path";
      value: string;
    };

function isDirectPreviewMediaUri(uri: string): boolean {
  return /^(https?|file|asset):/iu.test(uri) || uri.startsWith("//");
}

function isInlineMediaPayloadUri(uri?: string | null): boolean {
  return Boolean(uri?.trimStart().toLowerCase().startsWith("data:"));
}

function isMediaMimeType(mimeType?: string | null): boolean {
  const normalized = mimeType?.trim().toLowerCase() || "";
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/")
  );
}

function resolveMediaReferencePreviewSource(
  reference: Extract<
    MessagePreviewTarget,
    { kind: "media_reference" }
  >["reference"],
): MediaReferencePreviewSource | null {
  const previewUrl = reference.previewUrl?.trim();
  if (previewUrl && isDirectPreviewMediaUri(previewUrl)) {
    return { kind: "preview_url", value: previewUrl };
  }

  const sourcePath = reference.sourcePath?.trim();
  if (sourcePath && isAbsoluteLocalFilePath(sourcePath)) {
    return { kind: "source_path", value: sourcePath };
  }

  const sourceUri = reference.sourceUri?.trim();
  if (sourceUri && isDirectPreviewMediaUri(sourceUri)) {
    return { kind: "source_uri", value: sourceUri };
  }

  const uri = reference.uri.trim();
  if (uri && isDirectPreviewMediaUri(uri)) {
    return { kind: "direct_uri", value: uri };
  }

  return null;
}

function buildMediaReferenceFallbackMarkdown(params: {
  title: string;
  reference: Extract<
    MessagePreviewTarget,
    { kind: "media_reference" }
  >["reference"];
  t: Translate;
}): string {
  const { reference, t, title } = params;
  const lines = [
    `# ${title}`,
    "",
    t("agentChat.mediaReferencePreview.previewUnavailable"),
    "",
    t("agentChat.mediaReferencePreview.reference", {
      value: reference.uri,
    }),
  ];
  if (reference.kind) {
    lines.push(
      t("agentChat.mediaReferencePreview.kind", {
        value: reference.kind,
      }),
    );
  }
  if (reference.mimeType) {
    lines.push(
      t("agentChat.mediaReferencePreview.mime", {
        value: reference.mimeType,
      }),
    );
  }
  if (typeof reference.byteSize === "number") {
    lines.push(
      t("agentChat.mediaReferencePreview.byteSize", {
        value: reference.byteSize,
      }),
    );
  }
  if (reference.sha256) {
    lines.push(
      t("agentChat.mediaReferencePreview.sha256", {
        value: reference.sha256,
      }),
    );
  }
  return lines.join("\n");
}

export function createMediaReferencePreviewArtifact(params: {
  message: Message;
  target: Extract<MessagePreviewTarget, { kind: "media_reference" }>;
  t: Translate;
}): Artifact {
  const { message, target, t } = params;
  const reference = target.reference;
  const sourceRef =
    reference.uri.trim() || `${message.id}:media:${target.index}`;
  const title =
    reference.title?.trim() ||
    reference.caption?.trim() ||
    t("agentChat.mediaReferencePreview.fallbackTitle", {
      index: target.index + 1,
    });
  const resolvedPreviewSource = resolveMediaReferencePreviewSource(reference);
  const previewSource = isMediaMimeType(reference.mimeType)
    ? resolvedPreviewSource
    : null;
  const previewPath =
    previewSource?.kind === "source_path" ? previewSource.value : sourceRef;
  const previewUrl =
    previewSource && previewSource.kind !== "source_path"
      ? previewSource.value
      : undefined;
  const projection = createPreviewArtifact({
    source: "session_file",
    sourceRef,
    path: previewSource
      ? previewPath
      : `${message.id}-media-${target.index + 1}.md`,
    title,
    content: previewSource
      ? ""
      : buildMediaReferenceFallbackMarkdown({ title, reference, t }),
    isBinary: Boolean(previewSource),
    mimeType: previewSource ? reference.mimeType : "text/markdown",
    previewUrl,
    meta: {
      openedFrom: "message-media-reference",
      messageId: message.id,
      contentPartIndex: target.index,
      mediaKind: reference.kind,
      mediaUri: reference.uri,
      mediaSourceUri: isInlineMediaPayloadUri(reference.sourceUri)
        ? undefined
        : reference.sourceUri,
      mediaSourcePath: reference.sourcePath,
      mediaPreviewUrl:
        previewSource?.kind === "preview_url" ? previewSource.value : undefined,
      mediaPreviewSource: previewSource?.kind,
      mediaMimeType: reference.mimeType,
      mediaSha256: reference.sha256,
      mediaByteSize: reference.byteSize,
    },
  });
  return projection.artifact;
}

export function normalizeVideoAspectRatio(
  value?: string,
): "adaptive" | "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" {
  switch (value) {
    case "16:9":
    case "9:16":
    case "1:1":
    case "4:3":
    case "3:4":
    case "21:9":
      return value;
    default:
      return "adaptive";
  }
}

export function normalizeVideoResolution(
  value?: string,
): "480p" | "720p" | "1080p" {
  switch (value) {
    case "480p":
    case "1080p":
      return value;
    case "720p":
    default:
      return "720p";
  }
}

export function isUsableKnowledgeSourceText(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 24) {
    return false;
  }

  return !/请先.*(提供|补充).*(资料|素材|原文)|还没有.*(资料|素材|原文)|不能编造|无法.*沉淀/.test(
    normalized,
  );
}
