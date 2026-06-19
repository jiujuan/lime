import type { MemoryCategory } from "./memoryReferenceTypes";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  identity: "风格",
  context: "参考",
  preference: "偏好",
  experience: "成果",
  activity: "收藏",
};

const INTERNAL_MEMORY_TAGS = new Set([
  "activity",
  "auto_analysis",
  "context",
  "experience",
  "identity",
  "preference",
]);

const AUTO_ANALYSIS_TITLE_PREFIX = /^自动分析提取（(?:用户表达|AI 响应)）：\s*/;
const RAW_TECHNICAL_DETAIL_PATTERN =
  /(?:^-\d{4,}:|^\s*\{|"task_id"|task_id|task_type|execution failed|ran into this error|traceback|api key|fetch failed)/i;
const INTERRUPTED_RUN_DETAIL_PATTERN =
  /(?:E2E\s*中断测试|中断测试第\s*(?:\d+|N)\s*行|停止请求|停止后恢复测试|上一回合已被用户停止|被用户停止|不要继续回答被停止)/i;

function normalizeOptionalText(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function stripInternalMemoryPrefix(value: string): string | undefined {
  return normalizeOptionalText(value.replace(AUTO_ANALYSIS_TITLE_PREFIX, ""));
}

export function getUserFacingMemoryCategoryLabel(
  category: MemoryCategory,
): string {
  return CATEGORY_LABELS[category];
}

export function getUserFacingMemoryFallbackTitle(
  category: MemoryCategory,
): string {
  return `未命名${getUserFacingMemoryCategoryLabel(category)}`;
}

export function containsRawMemoryTechnicalDetail(value: string): boolean {
  return RAW_TECHNICAL_DETAIL_PATTERN.test(value);
}

function containsInterruptedRunDetail(value: string): boolean {
  return INTERRUPTED_RUN_DETAIL_PATTERN.test(value);
}

export function normalizeUserFacingMemoryTitle(params: {
  value?: string | null;
  category: MemoryCategory;
}): string {
  const stripped = params.value
    ? stripInternalMemoryPrefix(params.value)
    : undefined;
  if (!stripped) {
    return getUserFacingMemoryFallbackTitle(params.category);
  }
  if (containsRawMemoryTechnicalDetail(stripped)) {
    return "运行异常记录";
  }
  if (containsInterruptedRunDetail(stripped)) {
    return "中断恢复记录";
  }

  return stripped;
}

export function normalizeUserFacingMemorySummary(
  value?: string | null,
): string {
  const stripped = value ? stripInternalMemoryPrefix(value) : undefined;
  if (!stripped) {
    return "等待补充摘要";
  }
  if (containsRawMemoryTechnicalDetail(stripped)) {
    return "这条参考来自一次执行异常，默认不展开技术细节。";
  }
  if (containsInterruptedRunDetail(stripped)) {
    return "这条灵感来自一次被停止的运行，默认不展开原始调试文本。";
  }

  return stripped;
}

export function isUserFacingMemoryTag(tag: string): boolean {
  const normalized = tag.toLowerCase();
  if (INTERNAL_MEMORY_TAGS.has(normalized)) {
    return false;
  }
  if (normalized.startsWith("fp:")) {
    return false;
  }
  if (tag.length > 24 || containsRawMemoryTechnicalDetail(tag)) {
    return false;
  }

  return !/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(normalized);
}

export function normalizeUserFacingMemoryTags(
  tags: string[],
  maxItems: number,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = normalizeOptionalText(tag);
    const key = normalized?.toLowerCase();
    if (!normalized || !key || seen.has(key)) {
      continue;
    }
    if (!isUserFacingMemoryTag(normalized)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}
