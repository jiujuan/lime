export interface WorkspaceObjectCanvasCandidate {
  candidateId: string;
  title?: string | null;
  url?: string | null;
  sessionId?: string | null;
  profileKey?: string | null;
  targetId?: string | null;
  lifecycleState?: string | null;
  controlMode?: string | null;
  transportKind?: string | null;
  launching?: boolean;
  sourceKind?: WorkspaceObjectCanvasSourceKind;
  sourceRequestId?: string | null;
}

export type WorkspaceObjectCanvasObjectKind = "browserSession";

export type WorkspaceObjectCanvasObjectStage =
  | "connecting"
  | "ready"
  | "pending"
  | "failed";

export type WorkspaceObjectCanvasSourceKind =
  | "browserAssist"
  | "rightSurfacePending"
  | "unknown";

export interface WorkspaceObjectCanvasObjectSource {
  kind: WorkspaceObjectCanvasSourceKind;
  candidateId: string;
  requestId: string | null;
}

export interface WorkspaceObjectCanvasObjectFacts {
  candidateId: string;
  lifecycleState: string | null;
  url: string | null;
  sessionId: string | null;
  profileKey: string | null;
  targetId: string | null;
  transportKind: string | null;
  controlMode: string | null;
}

export interface WorkspaceObjectCanvasObjectCapabilities {
  openBrowserRuntime: boolean;
}

export interface WorkspaceObjectCanvasObject {
  id: string;
  kind: WorkspaceObjectCanvasObjectKind;
  title: string | null;
  stage: WorkspaceObjectCanvasObjectStage;
  launching: boolean;
  source: WorkspaceObjectCanvasObjectSource;
  facts: WorkspaceObjectCanvasObjectFacts;
  capabilities: WorkspaceObjectCanvasObjectCapabilities;
}

export type WorkspaceObjectCanvasEdgeKind = "lineage" | "reference";

export interface WorkspaceObjectCanvasEdge {
  id: string;
  kind: WorkspaceObjectCanvasEdgeKind;
  fromObjectId: string;
  toObjectId: string;
}

export interface WorkspaceObjectCanvasBoardCapabilities {
  canEdit: boolean;
  canReplay: boolean;
  canPersist: boolean;
}

export type WorkspaceObjectCanvasBoardCapabilityKey =
  keyof WorkspaceObjectCanvasBoardCapabilities;

export type WorkspaceObjectCanvasEventKind =
  | "editRequested"
  | "replayRequested"
  | "persistRequested";

export type WorkspaceObjectCanvasEventOwner =
  | "renderer"
  | "appServer"
  | "runtime";

export type WorkspaceObjectCanvasEventRequestField =
  | "boardId"
  | "revision"
  | "objectId"
  | "objectKind"
  | "source"
  | "facts"
  | "patch"
  | "replayTarget"
  | "persistenceKey";

export type WorkspaceObjectCanvasEventCompletionSignal =
  | "boardRevisionAdvanced"
  | "runtimeReplayStarted"
  | "boardSnapshotPersisted";

export interface WorkspaceObjectCanvasEventRequestSchema {
  requiredFields: WorkspaceObjectCanvasEventRequestField[];
  optionalFields: WorkspaceObjectCanvasEventRequestField[];
}

export interface WorkspaceObjectCanvasEventExitCondition {
  signal: WorkspaceObjectCanvasEventCompletionSignal;
  updatesBoardRevision: boolean;
}

export interface WorkspaceObjectCanvasEventSchema {
  kind: WorkspaceObjectCanvasEventKind;
  capabilityKey: WorkspaceObjectCanvasBoardCapabilityKey;
  owner: WorkspaceObjectCanvasEventOwner;
  enabled: boolean;
  acceptedObjectKinds: WorkspaceObjectCanvasObjectKind[];
  request: WorkspaceObjectCanvasEventRequestSchema;
  exitCondition: WorkspaceObjectCanvasEventExitCondition;
}

export interface WorkspaceObjectCanvasBoard {
  id: string;
  revision: number;
  primaryObjectId: string;
  objects: WorkspaceObjectCanvasObject[];
  edges: WorkspaceObjectCanvasEdge[];
  capabilities: WorkspaceObjectCanvasBoardCapabilities;
  eventSchemas: WorkspaceObjectCanvasEventSchema[];
}

function normalizeText(value?: string | null): string {
  return value?.trim() || "";
}

function normalizeNullableText(value?: string | null): string | null {
  return normalizeText(value) || null;
}

function resolveWorkspaceObjectCanvasStage(
  candidate?: WorkspaceObjectCanvasCandidate | null,
): WorkspaceObjectCanvasObjectStage {
  if (candidate?.launching) {
    return "connecting";
  }

  const lifecycleState = normalizeText(candidate?.lifecycleState).toLowerCase();
  if (!lifecycleState) {
    return "pending";
  }

  if (
    lifecycleState.includes("fail") ||
    lifecycleState.includes("error") ||
    lifecycleState.includes("disconnect") ||
    lifecycleState.includes("closed")
  ) {
    return "failed";
  }

  if (
    lifecycleState.includes("running") ||
    lifecycleState.includes("ready") ||
    lifecycleState.includes("attached") ||
    lifecycleState.includes("connected") ||
    lifecycleState.includes("active") ||
    lifecycleState.includes("success")
  ) {
    return "ready";
  }

  return "pending";
}

const WORKSPACE_OBJECT_CANVAS_EVENT_SCHEMA_DEFINITIONS: Array<
  Omit<WorkspaceObjectCanvasEventSchema, "enabled">
> = [
  {
    kind: "editRequested",
    capabilityKey: "canEdit",
    owner: "renderer",
    acceptedObjectKinds: ["browserSession"],
    request: {
      requiredFields: ["boardId", "revision", "objectId", "patch"],
      optionalFields: ["objectKind", "source", "facts"],
    },
    exitCondition: {
      signal: "boardRevisionAdvanced",
      updatesBoardRevision: true,
    },
  },
  {
    kind: "replayRequested",
    capabilityKey: "canReplay",
    owner: "runtime",
    acceptedObjectKinds: ["browserSession"],
    request: {
      requiredFields: ["boardId", "revision", "objectId", "replayTarget"],
      optionalFields: ["objectKind", "source", "facts"],
    },
    exitCondition: {
      signal: "runtimeReplayStarted",
      updatesBoardRevision: false,
    },
  },
  {
    kind: "persistRequested",
    capabilityKey: "canPersist",
    owner: "appServer",
    acceptedObjectKinds: ["browserSession"],
    request: {
      requiredFields: ["boardId", "revision", "persistenceKey"],
      optionalFields: ["objectId", "objectKind", "source", "facts"],
    },
    exitCondition: {
      signal: "boardSnapshotPersisted",
      updatesBoardRevision: false,
    },
  },
];

function buildWorkspaceObjectCanvasEventSchemas(
  capabilities: WorkspaceObjectCanvasBoardCapabilities,
): WorkspaceObjectCanvasEventSchema[] {
  return WORKSPACE_OBJECT_CANVAS_EVENT_SCHEMA_DEFINITIONS.map((schema) => ({
    ...schema,
    enabled: capabilities[schema.capabilityKey],
    acceptedObjectKinds: [...schema.acceptedObjectKinds],
    request: {
      requiredFields: [...schema.request.requiredFields],
      optionalFields: [...schema.request.optionalFields],
    },
    exitCondition: { ...schema.exitCondition },
  }));
}

export function buildWorkspaceObjectCanvasBoard({
  candidate,
  hasOpenBrowserRuntimeAction = false,
}: {
  candidate?: WorkspaceObjectCanvasCandidate | null;
  hasOpenBrowserRuntimeAction?: boolean;
}): WorkspaceObjectCanvasBoard {
  const candidateId =
    normalizeText(candidate?.candidateId) || "object-canvas-candidate";
  const objectId = `browser-session:${candidateId}`;
  const object: WorkspaceObjectCanvasObject = {
    id: objectId,
    kind: "browserSession",
    title: normalizeNullableText(candidate?.title),
    stage: resolveWorkspaceObjectCanvasStage(candidate),
    launching: Boolean(candidate?.launching),
    source: {
      kind: candidate?.sourceKind ?? "unknown",
      candidateId,
      requestId: normalizeNullableText(candidate?.sourceRequestId),
    },
    facts: {
      candidateId,
      lifecycleState: normalizeNullableText(candidate?.lifecycleState),
      url: normalizeNullableText(candidate?.url),
      sessionId: normalizeNullableText(candidate?.sessionId),
      profileKey: normalizeNullableText(candidate?.profileKey),
      targetId: normalizeNullableText(candidate?.targetId),
      transportKind: normalizeNullableText(candidate?.transportKind),
      controlMode: normalizeNullableText(candidate?.controlMode),
    },
    capabilities: {
      openBrowserRuntime: Boolean(hasOpenBrowserRuntimeAction),
    },
  };
  const boardCapabilities: WorkspaceObjectCanvasBoardCapabilities = {
    canEdit: false,
    canReplay: false,
    canPersist: false,
  };

  return {
    id: `object-canvas-board:${candidateId}`,
    revision: 1,
    primaryObjectId: objectId,
    objects: [object],
    edges: [],
    capabilities: boardCapabilities,
    eventSchemas: buildWorkspaceObjectCanvasEventSchemas(boardCapabilities),
  };
}
