import {
  buildWorkspaceObjectCanvasBoard,
  type WorkspaceObjectCanvasBoardCapabilities,
  type WorkspaceObjectCanvasCandidate,
  type WorkspaceObjectCanvasObjectKind,
  type WorkspaceObjectCanvasObjectStage,
} from "./workspaceObjectCanvasModel";

export type WorkspaceObjectCanvasStage = WorkspaceObjectCanvasObjectStage;

export type WorkspaceObjectCanvasTranslationKey =
  | "workspace.browserAssistRenderer.titleFallback"
  | "workspace.browserAssistRenderer.objectCanvas.candidate"
  | "workspace.browserAssistRenderer.objectCanvas.url"
  | "workspace.browserAssistRenderer.objectCanvas.session"
  | "workspace.browserAssistRenderer.objectCanvas.profile"
  | "workspace.browserAssistRenderer.objectCanvas.target"
  | "workspace.browserAssistRenderer.objectCanvas.transport"
  | "workspace.browserAssistRenderer.objectCanvas.control"
  | "workspace.browserAssistRenderer.objectCanvas.status"
  | "workspace.browserAssistRenderer.objectCanvas.kind.browserSession"
  | `workspace.browserAssistRenderer.objectCanvas.stage.${WorkspaceObjectCanvasStage}`
  | `workspace.browserAssistRenderer.objectCanvas.summary.${WorkspaceObjectCanvasStage}.title`
  | `workspace.browserAssistRenderer.objectCanvas.summary.${WorkspaceObjectCanvasStage}.detail`
  | "workspace.browserAssistRenderer.objectCanvas.openRuntime";

export interface WorkspaceObjectCanvasMetaItem {
  key:
    | "candidate"
    | "status"
    | "url"
    | "session"
    | "profile"
    | "target"
    | "transport"
    | "control";
  labelKey: WorkspaceObjectCanvasTranslationKey;
  value: string;
}

export interface WorkspaceObjectCanvasAction {
  key: "openBrowserRuntime";
  labelKey: WorkspaceObjectCanvasTranslationKey;
}

export interface WorkspaceObjectCanvasViewModel {
  board: {
    id: string;
    revision: number;
    primaryObjectId: string;
    objectCount: number;
    edgeCount: number;
    capabilities: WorkspaceObjectCanvasBoardCapabilities;
  };
  object: {
    id: string;
    kind: WorkspaceObjectCanvasObjectKind;
    kindLabelKey: WorkspaceObjectCanvasTranslationKey;
    title: string | null;
    titleFallbackKey: WorkspaceObjectCanvasTranslationKey;
    stage: WorkspaceObjectCanvasStage;
    stageLabelKey: WorkspaceObjectCanvasTranslationKey;
    summaryTitleKey: WorkspaceObjectCanvasTranslationKey;
    summaryDetailKey: WorkspaceObjectCanvasTranslationKey;
    launching: boolean;
  };
  metadata: WorkspaceObjectCanvasMetaItem[];
  primaryAction: WorkspaceObjectCanvasAction | null;
}

const TITLE_FALLBACK_KEY = "workspace.browserAssistRenderer.titleFallback";
const OBJECT_CANVAS_KEY_PREFIX =
  "workspace.browserAssistRenderer.objectCanvas";

const META_LABEL_KEYS: Record<
  WorkspaceObjectCanvasMetaItem["key"],
  WorkspaceObjectCanvasTranslationKey
> = {
  candidate: `${OBJECT_CANVAS_KEY_PREFIX}.candidate`,
  status: `${OBJECT_CANVAS_KEY_PREFIX}.status`,
  url: `${OBJECT_CANVAS_KEY_PREFIX}.url`,
  session: `${OBJECT_CANVAS_KEY_PREFIX}.session`,
  profile: `${OBJECT_CANVAS_KEY_PREFIX}.profile`,
  target: `${OBJECT_CANVAS_KEY_PREFIX}.target`,
  transport: `${OBJECT_CANVAS_KEY_PREFIX}.transport`,
  control: `${OBJECT_CANVAS_KEY_PREFIX}.control`,
};

const STAGE_LABEL_KEYS: Record<
  WorkspaceObjectCanvasStage,
  WorkspaceObjectCanvasTranslationKey
> = {
  connecting: "workspace.browserAssistRenderer.objectCanvas.stage.connecting",
  ready: "workspace.browserAssistRenderer.objectCanvas.stage.ready",
  pending: "workspace.browserAssistRenderer.objectCanvas.stage.pending",
  failed: "workspace.browserAssistRenderer.objectCanvas.stage.failed",
};

const SUMMARY_TITLE_KEYS: Record<
  WorkspaceObjectCanvasStage,
  WorkspaceObjectCanvasTranslationKey
> = {
  connecting:
    "workspace.browserAssistRenderer.objectCanvas.summary.connecting.title",
  ready: "workspace.browserAssistRenderer.objectCanvas.summary.ready.title",
  pending:
    "workspace.browserAssistRenderer.objectCanvas.summary.pending.title",
  failed: "workspace.browserAssistRenderer.objectCanvas.summary.failed.title",
};

const SUMMARY_DETAIL_KEYS: Record<
  WorkspaceObjectCanvasStage,
  WorkspaceObjectCanvasTranslationKey
> = {
  connecting:
    "workspace.browserAssistRenderer.objectCanvas.summary.connecting.detail",
  ready: "workspace.browserAssistRenderer.objectCanvas.summary.ready.detail",
  pending:
    "workspace.browserAssistRenderer.objectCanvas.summary.pending.detail",
  failed: "workspace.browserAssistRenderer.objectCanvas.summary.failed.detail",
};

function createMetaItem(
  key: WorkspaceObjectCanvasMetaItem["key"],
  value?: string | null,
): WorkspaceObjectCanvasMetaItem | null {
  const normalized = value?.trim() || "";
  if (!normalized) {
    return null;
  }

  return {
    key,
    labelKey: META_LABEL_KEYS[key],
    value: normalized,
  };
}

export function buildWorkspaceObjectCanvasViewModel({
  candidate,
  hasOpenBrowserRuntimeAction = false,
}: {
  candidate?: WorkspaceObjectCanvasCandidate | null;
  hasOpenBrowserRuntimeAction?: boolean;
}): WorkspaceObjectCanvasViewModel {
  const board = buildWorkspaceObjectCanvasBoard({
    candidate,
    hasOpenBrowserRuntimeAction,
  });
  const object =
    board.objects.find((item) => item.id === board.primaryObjectId) ??
    board.objects[0];
  const metadata = [
    createMetaItem("candidate", object.facts.candidateId),
    createMetaItem("status", object.facts.lifecycleState),
    createMetaItem("url", object.facts.url),
    createMetaItem("session", object.facts.sessionId),
    createMetaItem("profile", object.facts.profileKey),
    createMetaItem("target", object.facts.targetId),
    createMetaItem("transport", object.facts.transportKind),
    createMetaItem("control", object.facts.controlMode),
  ].filter((item): item is WorkspaceObjectCanvasMetaItem => Boolean(item));

  return {
    board: {
      id: board.id,
      revision: board.revision,
      primaryObjectId: board.primaryObjectId,
      objectCount: board.objects.length,
      edgeCount: board.edges.length,
      capabilities: board.capabilities,
    },
    object: {
      id: object.id,
      kind: object.kind,
      kindLabelKey: `${OBJECT_CANVAS_KEY_PREFIX}.kind.browserSession`,
      title: object.title,
      titleFallbackKey: TITLE_FALLBACK_KEY,
      stage: object.stage,
      stageLabelKey: STAGE_LABEL_KEYS[object.stage],
      summaryTitleKey: SUMMARY_TITLE_KEYS[object.stage],
      summaryDetailKey: SUMMARY_DETAIL_KEYS[object.stage],
      launching: object.launching,
    },
    metadata,
    primaryAction: object.capabilities.openBrowserRuntime
      ? {
          key: "openBrowserRuntime",
          labelKey: `${OBJECT_CANVAS_KEY_PREFIX}.openRuntime`,
        }
      : null,
  };
}
