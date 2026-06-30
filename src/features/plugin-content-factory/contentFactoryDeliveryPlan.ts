import type { PluginContract } from "@/features/plugin";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleObjectStatus,
  WorkspaceArticleWorkspace,
  WorkspaceArticleWorkspaceLayoutState,
} from "@/components/agent/chat/workspace/workspaceArticleWorkspaceModel";
import { CONTENT_FACTORY_PLUGIN_ID } from "./contentFactoryPlugin";

export type ContentFactoryDeliveryStage =
  | "brief"
  | "draft"
  | "visual"
  | "video"
  | "review";

export interface ContentFactoryDeliveryPart {
  key: string;
  objectKind: string;
  artifactType: string;
  surfaceKind: string;
  outputArtifactKind?: string | null;
  title: string;
  stage: ContentFactoryDeliveryStage;
  required: boolean;
}

export interface BuildContentFactoryDeliveryArticleWorkspaceParams {
  contract: PluginContract;
  sessionId: string;
  workspaceId?: string | null;
  now?: string | null;
}

const DELIVERY_STAGES: Record<string, ContentFactoryDeliveryStage> = {
  contentBrief: "brief",
  articleDraft: "draft",
  imageGenerationSet: "visual",
  videoScript: "video",
  videoStoryboard: "video",
  deliveryChecklist: "review",
};

const REQUIRED_OBJECT_KINDS = new Set([
  "articleDraft",
  "imageGenerationSet",
  "videoStoryboard",
  "deliveryChecklist",
]);

const OBJECT_TITLES: Record<string, string> = {
  contentBrief: "内容简报",
  articleDraft: "文章草稿",
  imageGenerationSet: "图片生成组",
  videoScript: "视频脚本",
  videoStoryboard: "视频分镜",
  deliveryChecklist: "交付检查清单",
};

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function artifactTypeToObjectKind(artifactType: string): string {
  switch (artifactType) {
    case "content_brief":
      return "contentBrief";
    case "markdown_document":
      return "articleDraft";
    case "image_set":
      return "imageGenerationSet";
    case "video_script":
      return "videoScript";
    case "storyboard":
      return "videoStoryboard";
    case "delivery_checklist":
      return "deliveryChecklist";
    default:
      return artifactType;
  }
}

function objectTitle(objectKind: string, artifactType: string): string {
  return OBJECT_TITLES[objectKind] ?? OBJECT_TITLES[artifactType] ?? objectKind;
}

function buildDeliveryPart(
  renderer: PluginContract["artifactRenderers"][number],
): ContentFactoryDeliveryPart | null {
  const artifactType = normalizeString(renderer.artifactType);
  const surfaceKind = normalizeString(renderer.surfaceKind);
  if (!artifactType || !surfaceKind) {
    return null;
  }
  const objectKind = artifactTypeToObjectKind(artifactType);
  return {
    key: objectKind,
    objectKind,
    artifactType,
    surfaceKind,
    outputArtifactKind: normalizeString(renderer.outputArtifactKind),
    title: objectTitle(objectKind, artifactType),
    stage: DELIVERY_STAGES[objectKind] ?? "draft",
    required: REQUIRED_OBJECT_KINDS.has(objectKind),
  };
}

export function buildContentFactoryDeliveryParts(
  contract: PluginContract,
): ContentFactoryDeliveryPart[] {
  if (contract.id !== CONTENT_FACTORY_PLUGIN_ID) {
    return [];
  }

  const parts = contract.artifactRenderers
    .map(buildDeliveryPart)
    .filter((part): part is ContentFactoryDeliveryPart => Boolean(part));
  const seen = new Set<string>();
  return parts.filter((part) => {
    if (seen.has(part.objectKind)) {
      return false;
    }
    seen.add(part.objectKind);
    return true;
  });
}

function buildObjectStatus(
  part: ContentFactoryDeliveryPart,
): WorkspaceArticleObjectStatus {
  return part.required ? "draft" : "unknown";
}

function buildObjectSource(
  part: ContentFactoryDeliveryPart,
): Record<string, unknown> {
  if (part.objectKind === "deliveryChecklist") {
    return {
      artifactType: part.artifactType,
      surfaceKind: part.surfaceKind,
      outputArtifactKind: part.outputArtifactKind ?? null,
      items: [
        {
          id: "article-draft",
          title: "文章草稿可查看",
          status: "todo",
        },
        {
          id: "image-set",
          title: "配图组可查看",
          status: "todo",
        },
        {
          id: "video-storyboard",
          title: "视频分镜可查看",
          status: "todo",
        },
      ],
    };
  }

  return {
    artifactType: part.artifactType,
    surfaceKind: part.surfaceKind,
    outputArtifactKind: part.outputArtifactKind ?? null,
    documentText: "",
  };
}

function buildDeliveryObject(params: {
  appId: string;
  part: ContentFactoryDeliveryPart;
  sessionId: string;
}): WorkspaceArticleObject {
  const artifactId = `${params.sessionId}:${params.part.objectKind}`;
  return {
    ref: {
      appId: params.appId,
      kind: params.part.objectKind,
      id: params.part.key,
      sessionId: params.sessionId,
      artifactIds: [artifactId],
      sourceTurnId: null,
      sourceTaskId: null,
    },
    title: params.part.title,
    status: buildObjectStatus(params.part),
    summary: params.part.required ? "等待内容工厂生成后回填" : "可选交付内容",
    previewArtifactId: artifactId,
    source: buildObjectSource(params.part),
  };
}

function buildLayoutState(params: {
  contract: PluginContract;
  primaryPart: ContentFactoryDeliveryPart;
}): WorkspaceArticleWorkspaceLayoutState | null {
  const { contract, primaryPart } = params;
  const defaultTab =
    normalizeString(contract.rightSurface.defaultActiveTab) ??
    "articleWorkspace";
  return {
    activeTabKind: defaultTab,
    activePaneKind:
      normalizeString(primaryPart.surfaceKind) ??
      normalizeString(contract.rightSurface.panes[0]?.kind) ??
      defaultTab,
    openTabKinds: [defaultTab],
    splitMode: null,
  };
}

export function buildContentFactoryDeliveryArticleWorkspace({
  contract,
  now = null,
  sessionId,
  workspaceId = null,
}: BuildContentFactoryDeliveryArticleWorkspaceParams): WorkspaceArticleWorkspace | null {
  const normalizedSessionId = normalizeString(sessionId);
  if (!normalizedSessionId || contract.id !== CONTENT_FACTORY_PLUGIN_ID) {
    return null;
  }

  const parts = buildContentFactoryDeliveryParts(contract);
  if (parts.length === 0) {
    return null;
  }

  const objects = parts.map((part) =>
    buildDeliveryObject({
      appId: contract.id,
      part,
      sessionId: normalizedSessionId,
    }),
  );
  const primaryIndex = Math.max(
    0,
    objects.findIndex((object) => object.ref.kind === "articleDraft"),
  );
  const primary = objects[primaryIndex];
  const primaryPart = parts[primaryIndex];
  if (!primary || !primaryPart) {
    return null;
  }

  return {
    schemaVersion: "article-workspace.v1",
    appId: contract.id,
    sessionId: normalizedSessionId,
    workspaceId: normalizeString(workspaceId),
    source: "rightSurfacePending",
    objects,
    objectCount: objects.length,
    primaryObjectRef: primary.ref,
    selectedObjectRef: primary.ref,
    layoutState: buildLayoutState({ contract, primaryPart }),
    sourceArtifacts: [
      {
        source: "content_factory_delivery_plan",
        pluginId: contract.id,
        outputArtifactKind: primaryPart.outputArtifactKind ?? null,
        requiredObjectKinds: parts
          .filter((part) => part.required)
          .map((part) => part.objectKind),
      },
    ],
    actionHistory: [],
    workerEvidence: [],
    updatedAt: now,
  };
}
