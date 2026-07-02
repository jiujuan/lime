import { getLimeI18n } from "@/i18n/createI18n";
import {
  getCurrentSkillCatalogSnapshot,
  listSkillCatalogCommandEntries,
} from "@/lib/api/skillCatalog";
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

function resolveImageWorkbenchCatalogModelLabel(modelId: string): string {
  const normalizedModelId = modelId.trim().toLowerCase();
  if (!normalizedModelId) {
    return "";
  }

  const command = listSkillCatalogCommandEntries(
    getCurrentSkillCatalogSnapshot(),
  ).find((entry) => {
    const defaults = entry.binding?.requestDefaults;
    const defaultModel = (
      defaults?.model ||
      defaults?.modelId ||
      defaults?.model_id ||
      ""
    )
      .trim()
      .toLowerCase();
    return defaultModel === normalizedModelId;
  });
  return command?.title?.trim() || "";
}

export function collapseImageWorkbenchWhitespace(
  value: string | null | undefined,
): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeImageTaskPromptSubject(value: string): string {
  const normalized = collapseImageWorkbenchWhitespace(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^@\S+(?:\s+\S+)?\s*/u, "")
    .replace(
      /^(?:请|帮我|给我|麻烦你?)?\s*(?:生成|画|做|制作|创建|绘制|修|重绘|改|调整)\s*/u,
      "",
    )
    .replace(/^(?:一|这|那|每)?(?:张|幅|组|版|套|个|件|款|页)\s*/u, "")
    .replace(/^(?:这张|那张|这一张|那一张|这幅|那幅|这一幅|那一幅)\s*/u, "")
    .trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 72).trim()}...`;
}

export function resolveImageWorkbenchModelLabel(
  value: string | null | undefined,
): string {
  const rawModel = value?.trim();
  if (!rawModel) {
    return "";
  }

  const catalogLabel = resolveImageWorkbenchCatalogModelLabel(rawModel);
  if (catalogLabel) {
    return catalogLabel;
  }

  const tail = rawModel.split("/").filter(Boolean).at(-1) || rawModel;
  return titleCaseModelSegment(tail);
}

type ImageTaskMode = NonNullable<MessageImageWorkbenchPreview["mode"]>;

type ImageWorkbenchPresentationKey =
  | "agentChat.imageWorkbenchPresentation.caption.cancelled"
  | "agentChat.imageWorkbenchPresentation.caption.complete"
  | "agentChat.imageWorkbenchPresentation.caption.failedDefault"
  | "agentChat.imageWorkbenchPresentation.caption.partial"
  | "agentChat.imageWorkbenchPresentation.intro.edit"
  | "agentChat.imageWorkbenchPresentation.intro.edit.withModel"
  | "agentChat.imageWorkbenchPresentation.intro.generate"
  | "agentChat.imageWorkbenchPresentation.intro.generate.withModel"
  | "agentChat.imageWorkbenchPresentation.intro.variation"
  | "agentChat.imageWorkbenchPresentation.intro.variation.withModel"
  | "agentChat.imageWorkbenchPresentation.subjectFallback";

export function resolveImageWorkbenchPreviewModelLabel(
  preview: MessageImageWorkbenchPreview,
): string {
  return resolveImageWorkbenchModelLabel(
    preview.runtimeContract?.model || preview.modelName || null,
  );
}

function tImageWorkbenchPresentation(
  key: ImageWorkbenchPresentationKey,
  options?: Record<string, unknown>,
): string {
  return getLimeI18n().t(key, {
    ns: "agent",
    ...(options || {}),
  });
}

export function resolveImageTaskPromptSubject(value: string): string {
  const normalized = normalizeImageTaskPromptSubject(value);
  if (normalized) {
    return normalized;
  }

  return tImageWorkbenchPresentation(
    "agentChat.imageWorkbenchPresentation.subjectFallback",
  );
}

export function buildImageTaskAssistantContent(params: {
  prompt: string;
  mode?: ImageTaskMode;
  modelName?: string | null;
}): string {
  const prompt = resolveImageTaskPromptSubject(params.prompt);
  const mode = params.mode || "generate";
  const modelLabel = resolveImageWorkbenchModelLabel(params.modelName || null);
  if (modelLabel) {
    return tImageWorkbenchPresentation(
      `agentChat.imageWorkbenchPresentation.intro.${mode}.withModel`,
      {
        modelLabel,
        prompt,
      },
    );
  }

  return tImageWorkbenchPresentation(
    `agentChat.imageWorkbenchPresentation.intro.${mode}`,
    {
      prompt,
    },
  );
}

function buildImageTaskCompletionCaption(params: {
  prompt: string;
  status: "complete" | "partial";
}): string {
  return tImageWorkbenchPresentation(
    `agentChat.imageWorkbenchPresentation.caption.${params.status}`,
    {
      prompt: resolveImageTaskPromptSubject(params.prompt),
    },
  );
}

export function buildImageWorkbenchCaption(params: {
  prompt: string;
  status: MessageImageWorkbenchPreview["status"];
  imageCount?: number | null;
  statusMessage?: string | null;
}): string | null {
  switch (params.status) {
    case "complete":
      return buildImageTaskCompletionCaption({
        prompt: params.prompt,
        status: "complete",
      });
    case "partial":
      return buildImageTaskCompletionCaption({
        prompt: params.prompt,
        status: "partial",
      });
    case "failed":
      return tImageWorkbenchPresentation(
        "agentChat.imageWorkbenchPresentation.caption.failedDefault",
      );
    case "cancelled":
      return tImageWorkbenchPresentation(
        "agentChat.imageWorkbenchPresentation.caption.cancelled",
      );
    case "running":
    default:
      return null;
  }
}
