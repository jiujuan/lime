import { getLimeI18n } from "@/i18n/createI18n";

const LIME_CREATE_TASK_RE = /\blime_create_([a-z0-9_]+?)_task\b/i;
const INTERNAL_RPC_ERROR_PAIR_RE =
  /(?:^|[^\d])-?\d{4,6}\s*:\s*-?\d{4,6}(?:\b|:)/;
const INTERNAL_TASK_FILE_RE =
  /(?:^|[\s"'`])\.lime[\\/]+tasks[\\/]+[a-z0-9_-]+[\\/]+/i;
const INTERNAL_TASK_ID_RE = /(?:任务\s*ID|task[_\s-]*id)\s*[:：]/i;
const FAILURE_CUE_RE =
  /(?:failed|failure|error|执行失败|开始失败|调用失败|生成失败|创建失败|未找到可执行|tool failed)/i;

export function normalizeLimeProtocolName(value?: string | null): string {
  return (value || "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

export function extractLimeCreateTaskKind(
  value?: string | null,
): string | null {
  const match = (value || "").match(LIME_CREATE_TASK_RE);
  return match?.[1]?.toLowerCase() || null;
}

function hasImageGenerationContext(value?: string | null): boolean {
  const normalized = normalizeLimeProtocolName(value);
  const taskKind = extractLimeCreateTaskKind(value);

  return Boolean(
    taskKind === "image_generation" ||
      normalized.includes("limecreateimagegenerationtask") ||
      normalized.includes("imagegeneration") ||
      normalized.includes("imagegenerate"),
  );
}

export function isImageGenerationToolContext(params: {
  toolName?: string | null;
  text?: string | null;
}): boolean {
  return (
    hasImageGenerationContext(params.toolName) ||
    hasImageGenerationContext(params.text)
  );
}

export function containsInternalLimeTaskProtocolNoise(
  value?: string | null,
): boolean {
  const text = value || "";
  if (!text.trim()) {
    return false;
  }

  return (
    INTERNAL_RPC_ERROR_PAIR_RE.test(text) ||
    LIME_CREATE_TASK_RE.test(text) ||
    INTERNAL_TASK_FILE_RE.test(text) ||
    INTERNAL_TASK_ID_RE.test(text)
  );
}

export function isImageGenerationProtocolFailure(params: {
  toolName?: string | null;
  text?: string | null;
}): boolean {
  const text = params.text || "";
  if (!text.trim()) {
    return false;
  }
  if (!isImageGenerationToolContext(params)) {
    return false;
  }

  return (
    containsInternalLimeTaskProtocolNoise(text) || FAILURE_CUE_RE.test(text)
  );
}

export function isImageGenerationProtocolFailureResidue(
  value?: string | null,
): boolean {
  return isImageGenerationProtocolFailure({ text: value });
}

export function resolveImageGenerationFailureDisplayText(): string {
  return getLimeI18n().t("agentChat.imageWorkbenchPreview.placeholder.failed", {
    ns: "agent",
    defaultValue: "生成失败",
  });
}
