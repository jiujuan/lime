import type { CanvasStateUnion } from "@/lib/workspace/workbenchCanvas";
import type { PlatformType } from "@/lib/workspace/workbenchCanvas";
import type {
  CanvasImageInsertAnchorHint,
  CanvasImageTargetType,
} from "@/lib/canvasImageInsertBus";
import { getLimeI18n } from "@/i18n/createI18n";
import {
  normalizeSelectionAnchorText,
  resolveSectionTitleForSelection,
} from "@/components/workspace/document/utils/autoImageInsert";
import type {
  ImageWorkbenchOutputView,
  ImageWorkbenchTaskView,
  ImageWorkbenchViewport,
} from "../components/imageWorkbenchTypes";

export interface ImageWorkbenchTask extends ImageWorkbenchTaskView {
  sessionId: string;
  hookImageIds: string[];
  applyTarget: ImageWorkbenchApplyTarget | null;
  taskFilePath?: string | null;
  artifactPath?: string | null;
}

export interface ImageWorkbenchOutput extends ImageWorkbenchOutputView {
  hookImageId: string;
  applyTarget: ImageWorkbenchApplyTarget | null;
}

export type ImageWorkbenchApplyTarget =
  | {
      kind: "canvas-insert";
      canvasType: CanvasImageTargetType;
      anchorHint?: CanvasImageInsertAnchorHint;
      sectionTitle?: string | null;
      anchorText?: string | null;
      projectId?: string | null;
      contentId?: string | null;
      actionLabel: string;
      dispatchLabel: string;
    }
  | {
      kind: "document-cover";
      placeholder: string;
      actionLabel: string;
      successLabel: string;
    };

export interface SessionImageWorkbenchState {
  active: boolean;
  viewport: ImageWorkbenchViewport;
  tasks: ImageWorkbenchTask[];
  outputs: ImageWorkbenchOutput[];
  selectedTaskId?: string | null;
  selectedOutputId: string | null;
  nextOutputIndex: number;
}

export function createInitialSessionImageWorkbenchState(): SessionImageWorkbenchState {
  return {
    active: false,
    viewport: { x: 0, y: 0, scale: 1 },
    tasks: [],
    outputs: [],
    selectedTaskId: null,
    selectedOutputId: null,
    nextOutputIndex: 1,
  };
}

export function resolveImageWorkbenchAssistantMessageId(
  taskId: string,
): string {
  return `image-workbench:${taskId}:assistant`;
}

export function collapseWhitespace(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

type ImageWorkbenchActionCopyKey =
  | "agentChat.imageWorkbenchAction.apply.defaultLabel"
  | "agentChat.imageWorkbenchAction.apply.documentLabel"
  | "agentChat.imageWorkbenchAction.apply.documentDispatch"
  | "agentChat.imageWorkbenchAction.apply.coverLabel"
  | "agentChat.imageWorkbenchAction.apply.coverSuccess";

function tImageWorkbenchAction(
  key: ImageWorkbenchActionCopyKey,
  options?: Record<string, unknown>,
): string {
  return getLimeI18n().t(key, {
    ns: "agent",
    ...(options || {}),
  });
}

function extractImagePromptSnippet(content: string, maxLength = 120): string {
  const normalized = collapseWhitespace(
    content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/[#>*`~\-|]/g, " ")
      .replace(/\d+\.\s+/g, " ")
      .replace(/[^\S\r\n]+/g, " "),
  );

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function resolveDocumentPlatformLabel(platform: PlatformType): string {
  switch (platform) {
    case "wechat":
      return "微信";
    case "xiaohongshu":
      return "小红书";
    case "zhihu":
      return "知乎";
    case "markdown":
    default:
      return "文稿";
  }
}

export function resolveCoverAspectRatio(platform?: PlatformType): string {
  if (platform === "xiaohongshu") {
    return "1:1";
  }
  return "16:9";
}

export function buildImageWorkbenchCommandText(
  prompt: string,
  options?: {
    aspectRatio?: string;
    count?: number;
    layoutHint?: string | null;
  },
): string {
  const normalizedPrompt = collapseWhitespace(prompt) || "生成一张主题配图";
  const trigger =
    options?.layoutHint === "storyboard_3x3" ||
    (options?.count && options.count > 1)
      ? "@分镜"
      : "@配图";
  const layoutSuffix =
    options?.layoutHint === "storyboard_3x3" ? "，3x3 分镜" : "";
  const ratioSuffix = options?.aspectRatio?.trim()
    ? `，${options.aspectRatio.trim()}`
    : "";
  const countSuffix =
    options?.count && options.count > 1
      ? `，出 ${Math.trunc(options.count)} 张`
      : "";
  return `${trigger} 生成 ${normalizedPrompt}${layoutSuffix}${ratioSuffix}${countSuffix}`;
}

export function buildDocumentImageWorkbenchPrompt(params: {
  projectName?: string | null;
  platform: PlatformType;
  content: string;
}): string {
  const platformLabel = resolveDocumentPlatformLabel(params.platform);
  const subject =
    extractImagePromptSnippet(params.content) ||
    collapseWhitespace(params.projectName || "") ||
    "当前主题";
  return `为当前${platformLabel}文稿补一张主视觉配图，重点内容：${subject}`;
}

function findDocumentCoverPlaceholder(content: string): string | null {
  const match = content.match(
    /!\[[^\]]*]\((pending-cover:\/\/[^)\s]+|【img:[^】]+】|cover-generation-failed)\)/,
  );
  return match?.[1]?.trim() || null;
}

export function buildDefaultCanvasImageApplyTarget(params: {
  canvasState: CanvasStateUnion | null;
  projectId?: string | null;
  contentId?: string | null;
  selectedText?: string | null;
}): ImageWorkbenchApplyTarget | null {
  if (!params.canvasState) {
    return null;
  }

  if (params.canvasState.type === "document") {
    return {
      kind: "canvas-insert",
      canvasType: "document",
      anchorHint: "section_end",
      sectionTitle: resolveSectionTitleForSelection(
        params.canvasState.content,
        params.selectedText,
      ),
      anchorText: normalizeSelectionAnchorText(params.selectedText),
      projectId: params.projectId ?? null,
      contentId: params.contentId ?? null,
      actionLabel: tImageWorkbenchAction(
        "agentChat.imageWorkbenchAction.apply.documentLabel",
      ),
      dispatchLabel: tImageWorkbenchAction(
        "agentChat.imageWorkbenchAction.apply.documentDispatch",
      ),
    };
  }

  return null;
}

export function resolveScopedImageWorkbenchApplyTarget(params: {
  canvasState: CanvasStateUnion | null;
  projectId?: string | null;
  contentId?: string | null;
  requestedTarget?: "generate" | "cover";
  selectedText?: string | null;
}): ImageWorkbenchApplyTarget | null {
  if (
    params.requestedTarget === "cover" &&
    params.canvasState?.type === "document"
  ) {
    const placeholder = findDocumentCoverPlaceholder(
      params.canvasState.content,
    );
    if (placeholder) {
      return {
        kind: "document-cover",
        placeholder,
        actionLabel: tImageWorkbenchAction(
          "agentChat.imageWorkbenchAction.apply.coverLabel",
        ),
        successLabel: tImageWorkbenchAction(
          "agentChat.imageWorkbenchAction.apply.coverSuccess",
        ),
      };
    }
  }

  return buildDefaultCanvasImageApplyTarget(params);
}

export function resolveImageWorkbenchActionLabel(
  target: ImageWorkbenchApplyTarget | null | undefined,
): string {
  if (!target) {
    return tImageWorkbenchAction(
      "agentChat.imageWorkbenchAction.apply.defaultLabel",
    );
  }
  if (target.kind === "document-cover") {
    return tImageWorkbenchAction(
      "agentChat.imageWorkbenchAction.apply.coverLabel",
    );
  }
  return tImageWorkbenchAction(
    "agentChat.imageWorkbenchAction.apply.documentLabel",
  );
}

export function resolveImageWorkbenchApplyDispatchLabel(
  target: Extract<ImageWorkbenchApplyTarget, { kind: "canvas-insert" }>,
): string {
  return (
    tImageWorkbenchAction(
      "agentChat.imageWorkbenchAction.apply.documentDispatch",
    ) || target.dispatchLabel
  );
}

export function resolveImageWorkbenchCoverSuccessLabel(
  target: Extract<ImageWorkbenchApplyTarget, { kind: "document-cover" }>,
): string {
  return (
    tImageWorkbenchAction(
      "agentChat.imageWorkbenchAction.apply.coverSuccess",
    ) || target.successLabel
  );
}
