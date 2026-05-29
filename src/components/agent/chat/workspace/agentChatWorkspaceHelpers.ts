import type { Dispatch, SetStateAction } from "react";
import type { AgentRuntimeUpdateSessionRequest } from "@/lib/api/agentRuntime/types";
import type { Artifact } from "@/lib/artifact/types";
import {
  normalizeArtifactProtocolPath,
  resolveArtifactProtocolFilePath,
} from "@/lib/artifact-protocol";
import type { TaskCenterTabItem } from "../components/TaskCenterTabStrip";
import type { Message, MessagePreviewTarget } from "../types";
import { isHiddenInternalArtifactPath } from "../utils/internalArtifactVisibility";
import { asRecord } from "./browserAssistArtifact";
import { shouldAutoSelectGeneralArtifact } from "./generalArtifactAutoSelection";
import { doesWorkspaceFileCandidateMatch } from "./workspaceFilePathMatch";

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
  hasConversationActivity: boolean;
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

export function areStringArraysEqual(
  left: string[] | null,
  right: string[],
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

export function mergeExpertSkillRefsIntoRequestMetadata(
  metadata: Record<string, unknown> | null | undefined,
  skillRefs: string[] | null,
): Record<string, unknown> | null {
  if (!metadata || !skillRefs) {
    return metadata ?? null;
  }

  const root: Record<string, unknown> = { ...metadata };
  const expert = asRecord(root.expert);
  const harness = asRecord(root.harness);
  const harnessExpert = asRecord(harness?.expert);

  if (expert) {
    root.expert = {
      ...expert,
      skillRefs: [...skillRefs],
    };
  }

  if (harness || harnessExpert) {
    root.harness = {
      ...(harness ?? {}),
      expert: {
        ...(harnessExpert ?? {}),
        skill_refs: [...skillRefs],
      },
    };
  }

  return root;
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

export function resolveTaskCenterHomeSurfaceState({
  agentEntry,
  draftSurfaceActive,
  shouldSuppressDraftContent,
  sessionSwitchPending,
  hasConversationActivity,
  sessionId,
  embeddedHomeSessionIds,
  isAutoRestoringSession,
  isSessionHydrating,
}: ResolveTaskCenterHomeSurfaceStateParams): TaskCenterHomeSurfaceState {
  const hasEmbeddedHomeSession = Boolean(
    sessionId && embeddedHomeSessionIds.has(sessionId),
  );
  const shouldRenderEmbeddedHome = Boolean(
    agentEntry === "claw" &&
      !sessionSwitchPending &&
      !hasConversationActivity &&
      (draftSurfaceActive || hasEmbeddedHomeSession),
  );
  const shouldHideCurrentSessionContent =
    sessionSwitchPending || shouldSuppressDraftContent;

  return {
    shouldRenderEmbeddedHome,
    shouldHideCurrentSessionContent,
    isRestoringSession:
      !shouldSuppressDraftContent &&
      (isAutoRestoringSession || isSessionHydrating || sessionSwitchPending),
    sceneSessionId: shouldHideCurrentSessionContent ? null : (sessionId ?? null),
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
