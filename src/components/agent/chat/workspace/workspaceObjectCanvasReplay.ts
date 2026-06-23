import {
  requestWorkspaceRightSurface,
  type WorkspaceRightSurfaceClientDeps,
  type WorkspaceRightSurfaceRequestParams,
  type WorkspaceRightSurfaceRequestResponse,
} from "@/lib/api/workspaceRightSurface";
import type {
  WorkspaceObjectCanvasBoard,
  WorkspaceObjectCanvasEventSchema,
  WorkspaceObjectCanvasObject,
} from "./workspaceObjectCanvasModel";

export const WORKSPACE_OBJECT_CANVAS_REPLAY_REASON =
  "object_canvas_replay_requested";
export const WORKSPACE_OBJECT_CANVAS_REPLAY_SCHEMA_VERSION =
  "object-canvas.replay.v1";

export type WorkspaceObjectCanvasReplayOrigin =
  | "runtime"
  | "skill"
  | "mcpTool";

export type WorkspaceObjectCanvasReplayTarget =
  | "browserSession"
  | "rightSurface"
  | "runtimeSession";

export interface WorkspaceObjectCanvasReplayContext {
  workspaceId?: string | null;
  workspaceRoot?: string | null;
  sessionId?: string | null;
  origin?: WorkspaceObjectCanvasReplayOrigin;
  priority?: "normal" | "foreground";
  ttlMs?: number | null;
  replayTarget?: WorkspaceObjectCanvasReplayTarget | string | null;
}

export interface WorkspaceObjectCanvasReplayEventMetadata {
  source: "objectCanvas";
  schemaVersion: typeof WORKSPACE_OBJECT_CANVAS_REPLAY_SCHEMA_VERSION;
  candidateId: string;
  title: string | null;
  url: string | null;
  sessionId: string | null;
  profileKey: string | null;
  targetId: string | null;
  lifecycleState: string | null;
  controlMode: string | null;
  transportKind: string | null;
  objectCanvas: {
    board: {
      id: string;
      revision: number;
      primaryObjectId: string;
      capabilities: WorkspaceObjectCanvasBoard["capabilities"];
      objectCount: number;
      edgeCount: number;
    };
    snapshot: WorkspaceObjectCanvasBoard;
    event: {
      kind: "replayRequested";
      owner: "runtime";
      capabilityKey: "canReplay";
      enabled: boolean;
      request: {
        boardId: string;
        revision: number;
        replayTarget: string;
        objectId: string;
        objectKind: WorkspaceObjectCanvasObject["kind"];
        source: WorkspaceObjectCanvasObject["source"];
        facts: WorkspaceObjectCanvasObject["facts"];
      };
      schema: WorkspaceObjectCanvasEventSchema;
    };
  };
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeFinitePositive(value?: number | null): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function findPrimaryObject(
  board: WorkspaceObjectCanvasBoard,
): WorkspaceObjectCanvasObject {
  const object =
    board.objects.find((item) => item.id === board.primaryObjectId) ??
    board.objects[0];
  if (!object) {
    throw new Error("objectCanvas board has no primary object to replay");
  }
  return object;
}

function findReplaySchema(
  board: WorkspaceObjectCanvasBoard,
): WorkspaceObjectCanvasEventSchema {
  const schema = board.eventSchemas.find(
    (item): item is WorkspaceObjectCanvasEventSchema & {
      kind: "replayRequested";
      owner: "runtime";
      capabilityKey: "canReplay";
    } =>
      item.kind === "replayRequested" &&
      item.owner === "runtime" &&
      item.capabilityKey === "canReplay",
  );
  if (!schema) {
    throw new Error("objectCanvas board is missing replayRequested schema");
  }
  return schema;
}

export function buildWorkspaceObjectCanvasReplayMetadata({
  board,
  replayTarget,
}: {
  board: WorkspaceObjectCanvasBoard;
  replayTarget?: WorkspaceObjectCanvasReplayTarget | string | null;
}): WorkspaceObjectCanvasReplayEventMetadata {
  const object = findPrimaryObject(board);
  const schema = findReplaySchema(board);
  const normalizedReplayTarget =
    normalizeText(replayTarget) ?? object.kind;

  return {
    source: "objectCanvas",
    schemaVersion: WORKSPACE_OBJECT_CANVAS_REPLAY_SCHEMA_VERSION,
    candidateId: object.facts.candidateId,
    title: object.title,
    url: object.facts.url,
    sessionId: object.facts.sessionId,
    profileKey: object.facts.profileKey,
    targetId: object.facts.targetId,
    lifecycleState: object.facts.lifecycleState,
    controlMode: object.facts.controlMode,
    transportKind: object.facts.transportKind,
    objectCanvas: {
      board: {
        id: board.id,
        revision: board.revision,
        primaryObjectId: board.primaryObjectId,
        capabilities: board.capabilities,
        objectCount: board.objects.length,
        edgeCount: board.edges.length,
      },
      snapshot: board,
      event: {
        kind: "replayRequested",
        owner: "runtime",
        capabilityKey: "canReplay",
        enabled: schema.enabled,
        request: {
          boardId: board.id,
          revision: board.revision,
          replayTarget: normalizedReplayTarget,
          objectId: object.id,
          objectKind: object.kind,
          source: object.source,
          facts: object.facts,
        },
        schema,
      },
    },
  };
}

export function buildWorkspaceObjectCanvasReplayRequestParams({
  board,
  context = {},
}: {
  board: WorkspaceObjectCanvasBoard;
  context?: WorkspaceObjectCanvasReplayContext;
}): WorkspaceRightSurfaceRequestParams {
  const metadata = buildWorkspaceObjectCanvasReplayMetadata({
    board,
    replayTarget: context.replayTarget,
  });
  const params: WorkspaceRightSurfaceRequestParams = {
    surfaceKind: "objectCanvas",
    origin: context.origin ?? "runtime",
    priority: context.priority ?? "normal",
    reason: WORKSPACE_OBJECT_CANVAS_REPLAY_REASON,
    candidateId: metadata.candidateId,
    metadata,
  };
  const workspaceId = normalizeText(context.workspaceId);
  const workspaceRoot = normalizeText(context.workspaceRoot);
  const sessionId = normalizeText(context.sessionId ?? metadata.sessionId);
  const ttlMs = normalizeFinitePositive(context.ttlMs);

  if (workspaceId) {
    params.workspaceId = workspaceId;
  }
  if (workspaceRoot) {
    params.workspaceRoot = workspaceRoot;
  }
  if (sessionId) {
    params.sessionId = sessionId;
  }
  if (ttlMs !== undefined) {
    params.ttlMs = ttlMs;
  }

  return params;
}

export async function requestWorkspaceObjectCanvasReplay(
  input: {
    board: WorkspaceObjectCanvasBoard;
    context?: WorkspaceObjectCanvasReplayContext;
  },
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<WorkspaceRightSurfaceRequestResponse> {
  return requestWorkspaceRightSurface(
    buildWorkspaceObjectCanvasReplayRequestParams(input),
    deps,
  );
}
