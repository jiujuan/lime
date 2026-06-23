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

export const WORKSPACE_OBJECT_CANVAS_PERSIST_REASON =
  "object_canvas_persist_requested";
export const WORKSPACE_OBJECT_CANVAS_PERSIST_SCHEMA_VERSION =
  "object-canvas.persist.v1";

export type WorkspaceObjectCanvasPersistOrigin =
  | "runtime"
  | "skill"
  | "mcpTool";

export interface WorkspaceObjectCanvasPersistContext {
  workspaceId?: string | null;
  workspaceRoot?: string | null;
  sessionId?: string | null;
  origin?: WorkspaceObjectCanvasPersistOrigin;
  priority?: "normal" | "foreground";
  ttlMs?: number | null;
  persistenceKey?: string | null;
}

export interface WorkspaceObjectCanvasPersistEventMetadata {
  source: "objectCanvas";
  schemaVersion: typeof WORKSPACE_OBJECT_CANVAS_PERSIST_SCHEMA_VERSION;
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
      kind: "persistRequested";
      owner: "appServer";
      capabilityKey: "canPersist";
      enabled: boolean;
      request: {
        boardId: string;
        revision: number;
        persistenceKey: string;
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
    throw new Error("objectCanvas board has no primary object to persist");
  }
  return object;
}

function findPersistSchema(
  board: WorkspaceObjectCanvasBoard,
): WorkspaceObjectCanvasEventSchema {
  const schema = board.eventSchemas.find(
    (item): item is WorkspaceObjectCanvasEventSchema & {
      kind: "persistRequested";
      owner: "appServer";
      capabilityKey: "canPersist";
    } =>
      item.kind === "persistRequested" &&
      item.owner === "appServer" &&
      item.capabilityKey === "canPersist",
  );
  if (!schema) {
    throw new Error("objectCanvas board is missing persistRequested schema");
  }
  return schema;
}

export function buildWorkspaceObjectCanvasPersistMetadata({
  board,
  persistenceKey,
}: {
  board: WorkspaceObjectCanvasBoard;
  persistenceKey?: string | null;
}): WorkspaceObjectCanvasPersistEventMetadata {
  const object = findPrimaryObject(board);
  const schema = findPersistSchema(board);
  const normalizedPersistenceKey =
    normalizeText(persistenceKey) ?? `${board.id}:revision:${board.revision}`;

  return {
    source: "objectCanvas",
    schemaVersion: WORKSPACE_OBJECT_CANVAS_PERSIST_SCHEMA_VERSION,
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
        kind: "persistRequested",
        owner: "appServer",
        capabilityKey: "canPersist",
        enabled: schema.enabled,
        request: {
          boardId: board.id,
          revision: board.revision,
          persistenceKey: normalizedPersistenceKey,
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

export function buildWorkspaceObjectCanvasPersistRequestParams({
  board,
  context = {},
}: {
  board: WorkspaceObjectCanvasBoard;
  context?: WorkspaceObjectCanvasPersistContext;
}): WorkspaceRightSurfaceRequestParams {
  const metadata = buildWorkspaceObjectCanvasPersistMetadata({
    board,
    persistenceKey: context.persistenceKey,
  });
  const params: WorkspaceRightSurfaceRequestParams = {
    surfaceKind: "objectCanvas",
    origin: context.origin ?? "runtime",
    priority: context.priority ?? "normal",
    reason: WORKSPACE_OBJECT_CANVAS_PERSIST_REASON,
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

export async function requestWorkspaceObjectCanvasPersist(
  input: {
    board: WorkspaceObjectCanvasBoard;
    context?: WorkspaceObjectCanvasPersistContext;
  },
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<WorkspaceRightSurfaceRequestResponse> {
  return requestWorkspaceRightSurface(
    buildWorkspaceObjectCanvasPersistRequestParams(input),
    deps,
  );
}
