import {
  createWorkspaceRightSurfaceOpenIntent,
  type WorkspaceRightSurfaceIntent,
} from "./rightSurfaceIntentQueue";
import type { WorkspaceRightSurfaceCommandOrigin } from "./rightSurfaceCommand";
import type { WorkspaceRightSurfaceRequestPriority } from "./rightSurfaceScheduler";
import type { WorkspaceRightSurfaceKind } from "./rightSurfaceTypes";

export interface WorkspaceRightSurfaceRuntimeOpenSignal {
  id: string;
  kind: WorkspaceRightSurfaceKind;
  origin: Extract<
    WorkspaceRightSurfaceCommandOrigin,
    "runtime" | "skill" | "mcpTool"
  >;
  createdAt: number;
  priority?: WorkspaceRightSurfaceRequestPriority;
  ttlMs?: number;
  reason?: string;
}

export interface WorkspaceRightSurfaceHarnessPendingInput {
  enabled: boolean;
  pendingCount: number;
  createdAt: number;
  ttlMs?: number;
}

export interface WorkspaceRightSurfaceFilePreviewInput {
  enabled: boolean;
  relativePath?: string | null;
  createdAt: number;
  origin?: Extract<
    WorkspaceRightSurfaceCommandOrigin,
    "runtime" | "skill" | "mcpTool"
  >;
  ttlMs?: number;
}

export interface WorkspaceRightSurfaceMcpShellOutputInput {
  enabled: boolean;
  outputId?: string | null;
  createdAt: number;
  priority?: WorkspaceRightSurfaceRequestPriority;
  ttlMs?: number;
}

export interface WorkspaceRightSurfaceObjectCanvasCandidateInput {
  enabled: boolean;
  candidateId?: string | null;
  createdAt: number;
  origin?: Extract<
    WorkspaceRightSurfaceCommandOrigin,
    "runtime" | "skill" | "mcpTool"
  >;
  ttlMs?: number;
}

const DEFAULT_RUNTIME_PENDING_INTENT_TTL_MS = 60_000;

export function buildWorkspaceRightSurfaceRuntimeOpenIntents(
  signals: readonly WorkspaceRightSurfaceRuntimeOpenSignal[],
): WorkspaceRightSurfaceIntent[] {
  return signals.map((signal) =>
    createWorkspaceRightSurfaceOpenIntent({
      id: signal.id,
      kind: signal.kind,
      origin: signal.origin,
      createdAt: signal.createdAt,
      priority: signal.priority ?? "background",
      ttlMs: signal.ttlMs,
      reason: signal.reason,
    }),
  );
}

export function buildWorkspaceRightSurfaceHarnessPendingIntents({
  enabled,
  pendingCount,
  createdAt,
  ttlMs = DEFAULT_RUNTIME_PENDING_INTENT_TTL_MS,
}: WorkspaceRightSurfaceHarnessPendingInput): WorkspaceRightSurfaceIntent[] {
  if (!enabled || pendingCount <= 0) {
    return [];
  }

  const normalizedPendingCount = Math.floor(pendingCount);
  return Array.from({ length: normalizedPendingCount }, (_, index) =>
    createWorkspaceRightSurfaceOpenIntent({
      id: `runtime:harness:pending:${index + 1}`,
      kind: "harness",
      origin: "runtime",
      createdAt,
      priority: "background",
      ttlMs,
      reason: "harness_pending_approval",
    }),
  );
}

export function buildWorkspaceRightSurfaceFilePreviewIntents({
  enabled,
  relativePath,
  createdAt,
  origin = "runtime",
  ttlMs = DEFAULT_RUNTIME_PENDING_INTENT_TTL_MS,
}: WorkspaceRightSurfaceFilePreviewInput): WorkspaceRightSurfaceIntent[] {
  const normalizedPath = normalizePreviewPath(relativePath);
  if (!enabled || !normalizedPath) {
    return [];
  }

  return buildWorkspaceRightSurfaceRuntimeOpenIntents([
    {
      id: `runtime:file-preview:${normalizedPath}`,
      kind: "files",
      origin,
      createdAt,
      priority: "background",
      ttlMs,
      reason: "file_preview_ready",
    },
  ]);
}

export function buildWorkspaceRightSurfaceMcpShellOutputIntents({
  enabled,
  outputId,
  createdAt,
  priority = "background",
  ttlMs = DEFAULT_RUNTIME_PENDING_INTENT_TTL_MS,
}: WorkspaceRightSurfaceMcpShellOutputInput): WorkspaceRightSurfaceIntent[] {
  const normalizedOutputId = normalizeIntentKey(outputId);
  if (!enabled || !normalizedOutputId) {
    return [];
  }

  return buildWorkspaceRightSurfaceRuntimeOpenIntents([
    {
      id: `mcp:shell-output:${normalizedOutputId}`,
      kind: "shell",
      origin: "mcpTool",
      createdAt,
      priority,
      ttlMs,
      reason: "mcp_shell_output_ready",
    },
  ]);
}

export function buildWorkspaceRightSurfaceObjectCanvasCandidateIntents({
  enabled,
  candidateId,
  createdAt,
  origin = "runtime",
  ttlMs = DEFAULT_RUNTIME_PENDING_INTENT_TTL_MS,
}: WorkspaceRightSurfaceObjectCanvasCandidateInput): WorkspaceRightSurfaceIntent[] {
  const normalizedCandidateId = normalizeIntentKey(candidateId);
  if (!enabled || !normalizedCandidateId) {
    return [];
  }

  return buildWorkspaceRightSurfaceRuntimeOpenIntents([
    {
      id: `${origin}:object-canvas:${normalizedCandidateId}`,
      kind: "objectCanvas",
      origin,
      createdAt,
      priority: "background",
      ttlMs,
      reason: "object_canvas_candidate_ready",
    },
  ]);
}

function normalizePreviewPath(value?: string | null): string {
  return (value || "").trim().replace(/\\/g, "/");
}

function normalizeIntentKey(value?: string | null): string {
  return (value || "").trim().replace(/\s+/g, "-");
}
