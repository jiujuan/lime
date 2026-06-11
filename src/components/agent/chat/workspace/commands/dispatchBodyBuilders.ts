/**
 * 发布/写作类命令 dispatch body 构建函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于构建发送给 AI 的 prompt 文本。
 *
 * @module dispatchBodyBuilders
 */

import {
  normalizeOptionalText,
  type ParsedWritingWorkbenchCommand,
} from "./commandRecentDefaults";

export function buildPublishDispatchBody(params: {
  prompt?: string | null;
  platformLabel?: string | null;
}): string {
  return [
    normalizeOptionalText(params.platformLabel)
      ? `平台:${normalizeOptionalText(params.platformLabel)}`
      : undefined,
    normalizeOptionalText(params.prompt),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function buildChannelPreviewDispatchBody(params: {
  prompt?: string | null;
  platformLabel?: string | null;
}): string {
  const normalizedPlatformLabel = normalizeOptionalText(params.platformLabel);
  const normalizedPrompt = normalizeOptionalText(params.prompt);
  const previewInstruction = normalizedPlatformLabel
    ? `请基于当前内容生成一份适用于${normalizedPlatformLabel}的渠道预览稿，突出标题、首屏摘要、排版层级和封面建议`
    : "请基于当前内容生成一份渠道预览稿，突出标题、首屏摘要、排版层级和封面建议";

  return [
    normalizedPlatformLabel ? `平台:${normalizedPlatformLabel}` : undefined,
    previewInstruction,
    normalizedPrompt,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function buildUploadDispatchBody(params: {
  prompt?: string | null;
  platformLabel?: string | null;
}): string {
  const normalizedPlatformLabel = normalizeOptionalText(params.platformLabel);
  const normalizedPrompt = normalizeOptionalText(params.prompt);
  const uploadInstruction = normalizedPlatformLabel
    ? `请基于当前内容整理一份适用于${normalizedPlatformLabel}直接上传的上传稿与素材清单，优先输出标题、正文、封面说明、标签建议和上传前检查`
    : "请基于当前内容整理一份可直接上传的上传稿与素材清单，优先输出标题、正文、封面说明、标签建议和上传前检查";

  return [
    normalizedPlatformLabel ? `平台:${normalizedPlatformLabel}` : undefined,
    uploadInstruction,
    normalizedPrompt,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function buildWritingDispatchBody(params: {
  prompt?: string | null;
  platformLabel?: string | null;
  draftKind?: ParsedWritingWorkbenchCommand["draftKind"] | null;
}): string {
  const normalizedPlatformLabel = normalizeOptionalText(params.platformLabel);
  const normalizedPrompt = normalizeOptionalText(params.prompt);
  const writingInstruction =
    params.draftKind === "newsletter"
      ? normalizedPlatformLabel
        ? `请基于当前内容生成一版适用于${normalizedPlatformLabel}的 Newsletter / 简报主稿，优先输出标题、开场摘要、分节要点和结尾行动建议`
        : "请基于当前内容生成一版 Newsletter / 简报主稿，优先输出标题、开场摘要、分节要点和结尾行动建议"
      : params.draftKind === "blog"
        ? normalizedPlatformLabel
          ? `请基于当前内容生成一篇适用于${normalizedPlatformLabel}发布的 Blog 文章主稿，优先输出标题、导语、小标题结构、正文和结尾行动建议`
          : "请基于当前内容生成一篇 Blog 文章主稿，优先输出标题、导语、小标题结构、正文和结尾行动建议"
        : normalizedPlatformLabel
          ? `请基于当前内容生成一版适用于${normalizedPlatformLabel}的写作主稿，优先输出标题、结构、正文和结尾行动建议`
          : "请基于当前内容生成一版可继续修改的写作主稿，优先输出标题、结构、正文和结尾行动建议";

  return [
    normalizedPlatformLabel ? `平台:${normalizedPlatformLabel}` : undefined,
    writingInstruction,
    normalizedPrompt,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}
