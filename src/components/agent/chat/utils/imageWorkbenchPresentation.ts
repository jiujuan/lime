import type { MessageImageWorkbenchPreview } from "../types";

function titleCaseModelSegment(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => {
      if (/^gpt$/i.test(segment)) {
        return "GPT";
      }
      if (/^\d+$/.test(segment)) {
        return segment;
      }
      return `${segment.slice(0, 1).toUpperCase()}${segment
        .slice(1)
        .toLowerCase()}`;
    })
    .join(" ");
}

export function collapseImageWorkbenchWhitespace(
  value: string | null | undefined,
): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function resolveImageWorkbenchModelLabel(
  value: string | null | undefined,
): string {
  const rawModel = value?.trim();
  if (!rawModel) {
    return "";
  }

  const normalized = rawModel.toLowerCase();
  if (normalized.includes("nano-banana-pro")) {
    return "Nanobanana Pro";
  }
  if (
    normalized.includes("gpt-image-2") ||
    normalized.includes("gpt-images-2")
  ) {
    return "GPT Image 2";
  }

  const tail = rawModel.split("/").filter(Boolean).at(-1) || rawModel;
  return titleCaseModelSegment(tail);
}

export function resolveImageWorkbenchPreviewModelLabel(
  preview: MessageImageWorkbenchPreview,
): string {
  return resolveImageWorkbenchModelLabel(
    preview.modelName || preview.runtimeContract?.model || null,
  );
}

function stripLeadingImageIntent(value: string): string {
  return value
    .replace(/^@\S+(?:\s+\S+)?\s*/u, "")
    .replace(/^(?:请|麻烦你?|帮我|给我)?\s*(?:生成|画|绘制|做|制作|出)\s*/u, "")
    .trim();
}

function truncatePromptSnippet(value: string, maxLength = 72): string {
  const normalized = stripLeadingImageIntent(
    collapseImageWorkbenchWhitespace(value)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " "),
  );

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function resolveGeneratedSubject(params: {
  prompt: string;
  expectedImageCount?: number | null;
  layoutHint?: string | null;
}): string {
  const snippet = truncatePromptSnippet(params.prompt);
  if (!snippet) {
    return "这张图";
  }

  if (
    params.layoutHint === "storyboard_3x3" ||
    (params.expectedImageCount ?? 0) > 1
  ) {
    const groupSnippet = snippet.replace(
      /^一(?:张|幅|个|颗|只|位|款|片|座|条|枚|束|份|套|辆|间)\s*/u,
      "",
    );
    return /^一组|^这组|^\d+\s*张|^九张|^9张/u.test(snippet)
      ? snippet
      : `一组${groupSnippet || snippet}`;
  }

  return /^一(?:张|幅|组|个|颗|只|位|款|片|座|条|枚|束|份|套|辆|间)|^这张|^这幅|^从/u.test(
    snippet,
  )
    ? snippet
    : `一张${snippet}`;
}

function resolveImageActionIntro(params: {
  prompt: string;
  mode?: MessageImageWorkbenchPreview["mode"];
  modelName?: string | null;
  expectedImageCount?: number | null;
  layoutHint?: string | null;
}): string {
  const modelLabel = resolveImageWorkbenchModelLabel(params.modelName);
  const modelPrefix = modelLabel ? `用 ${modelLabel} ` : "";
  const subject = resolveGeneratedSubject({
    prompt: params.prompt,
    expectedImageCount: params.expectedImageCount,
    layoutHint: params.layoutHint,
  });

  switch (params.mode) {
    case "edit":
      return `好嘞，${modelPrefix}按你的要求处理${subject}`;
    case "variation":
      return `好嘞，${modelPrefix}按你的要求重绘${subject}`;
    case "generate":
    default:
      return `好嘞，${modelPrefix}给你生成${subject}`;
  }
}

export function buildImageWorkbenchAssistantContent(params: {
  prompt: string;
  mode?: MessageImageWorkbenchPreview["mode"];
  modelName?: string | null;
  expectedImageCount?: number | null;
  layoutHint?: string | null;
}): string {
  return [resolveImageActionIntro(params), "先获取下工具参数", "马上生成"].join(
    "\n",
  );
}

export function buildImageWorkbenchCaption(params: {
  prompt: string;
  status: MessageImageWorkbenchPreview["status"];
  imageCount?: number | null;
  statusMessage?: string | null;
}): string | null {
  const detail = truncatePromptSnippet(params.prompt, 42);

  switch (params.status) {
    case "complete":
      return detail
        ? `搞定，已生成${resolveGeneratedSubject({ prompt: detail })}。`
        : "搞定，图片已生成。";
    case "partial":
      return params.imageCount && params.imageCount > 0
        ? `先生成了 ${params.imageCount} 张结果。`
        : "先生成了部分结果。";
    case "failed":
      return params.statusMessage?.trim()
        ? `这次没有生成成功：${params.statusMessage.trim()}`
        : "这次没有生成成功。";
    case "cancelled":
      return "已停止生成。";
    case "running":
    default:
      return null;
  }
}
