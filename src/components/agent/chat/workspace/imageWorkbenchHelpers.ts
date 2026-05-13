import type { CanvasStateUnion } from "@/lib/workspace/workbenchCanvas";
import type { PlatformType } from "@/lib/workspace/workbenchCanvas";
import type {
  CanvasImageInsertAnchorHint,
  CanvasImageTargetType,
} from "@/lib/canvasImageInsertBus";
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
  selectedOutputId: string | null;
  nextOutputIndex: number;
}

export function createInitialSessionImageWorkbenchState(): SessionImageWorkbenchState {
  return {
    active: false,
    viewport: { x: 0, y: 0, scale: 1 },
    tasks: [],
    outputs: [],
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
      actionLabel: "插入文稿",
      dispatchLabel: "已切回文稿，正在插入图片",
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
        actionLabel: "设为封面",
        successLabel: "已设为封面",
      };
    }
  }

  return buildDefaultCanvasImageApplyTarget(params);
}

export function resolveImageWorkbenchActionLabel(
  target: ImageWorkbenchApplyTarget | null | undefined,
): string {
  if (!target) {
    return "应用到画布";
  }
  return target.actionLabel;
}
