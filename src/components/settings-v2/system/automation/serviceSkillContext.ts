import type { AutomationPayload } from "@/lib/api/automation";
import { resolveServiceSkillExecutionLocationPresentation } from "@/lib/api/serviceSkills";

export interface AutomationServiceSkillSummaryItem {
  key: string;
  label: string;
  value: string;
}

export interface AutomationServiceSkillContext {
  id: string | null;
  title: string;
  runnerLabel: string;
  executionLocationLabel: string;
  executionLocationLegacyCompat: boolean;
  sourceLabel: string;
  theme: string | null;
  contentId: string | null;
  slotSummary: AutomationServiceSkillSummaryItem[];
  userInput: string | null;
}

export interface AutomationServiceSkillContextCopy {
  defaultTitle: string;
  unknownLabel: string;
  runnerInstant: string;
  runnerScheduled: string;
  runnerManaged: string;
  executionLocationClient: string;
  sourceCloudCatalog: string;
  sourceLocalCustom: string;
  slotFallbackLabel: (index: number) => string;
}

export const defaultAutomationServiceSkillContextCopy: AutomationServiceSkillContextCopy =
  {
    defaultTitle: "技能流程",
    unknownLabel: "未标记",
    runnerInstant: "一次性交付",
    runnerScheduled: "定时运行",
    runnerManaged: "持续跟踪",
    executionLocationClient: "客户端执行",
    sourceCloudCatalog: "云目录",
    sourceLocalCustom: "本地自定义",
    slotFallbackLabel: (index) => `参数 ${index + 1}`,
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function resolveRunnerLabel(
  value: unknown,
  copy: AutomationServiceSkillContextCopy,
): string {
  switch (value) {
    case "instant":
      return copy.runnerInstant;
    case "scheduled":
      return copy.runnerScheduled;
    case "managed":
      return copy.runnerManaged;
    default:
      return copy.unknownLabel;
  }
}

function resolveExecutionLocationLabel(
  value: unknown,
  copy: AutomationServiceSkillContextCopy,
): string {
  return resolveServiceSkillExecutionLocationPresentation(value)
    ? copy.executionLocationClient
    : copy.unknownLabel;
}

function resolveExecutionLocationLegacyCompat(value: unknown): boolean {
  return (
    resolveServiceSkillExecutionLocationPresentation(value)?.legacyCompat ??
    false
  );
}

function resolveSourceLabel(
  value: unknown,
  copy: AutomationServiceSkillContextCopy,
): string {
  switch (value) {
    case "cloud_catalog":
      return copy.sourceCloudCatalog;
    case "local_custom":
      return copy.sourceLocalCustom;
    default:
      return copy.unknownLabel;
  }
}

function parseSlotSummaryEntries(
  value: unknown,
  copy: AutomationServiceSkillContextCopy,
): AutomationServiceSkillSummaryItem[] {
  if (Array.isArray(value)) {
    const structured = value
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        const key = normalizeOptionalText(item.key);
        const label = normalizeOptionalText(item.label);
        const summaryValue = normalizeOptionalText(item.value);
        if (!label || !summaryValue) {
          return null;
        }

        return {
          key: key || label,
          label,
          value: summaryValue,
        };
      })
      .filter((item): item is AutomationServiceSkillSummaryItem =>
        Boolean(item),
      );

    if (structured.length > 0) {
      return structured;
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const summaryLine = normalizeOptionalText(item);
      if (!summaryLine) {
        return null;
      }

      const separatorIndex = summaryLine.search(/[:：]/);
      if (separatorIndex <= 0) {
        return {
          key: `slot-${index + 1}`,
          label: copy.slotFallbackLabel(index),
          value: summaryLine,
        };
      }

      return {
        key: `slot-${index + 1}`,
        label: summaryLine.slice(0, separatorIndex).trim(),
        value: summaryLine.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((item): item is AutomationServiceSkillSummaryItem => Boolean(item));
}

function resolveServiceSkillContextFromRecord(
  record: Record<string, unknown>,
  copy: AutomationServiceSkillContextCopy,
  explicitContentId?: string | null,
): AutomationServiceSkillContext | null {
  const serviceSkillValue = record.service_skill ?? record.serviceSkill;
  if (!isRecord(serviceSkillValue)) {
    return null;
  }

  const harnessValue = isRecord(record.harness) ? record.harness : null;
  const id = normalizeOptionalText(serviceSkillValue.id);
  const title =
    normalizeOptionalText(serviceSkillValue.title) || id || copy.defaultTitle;

  return {
    id,
    title,
    runnerLabel: resolveRunnerLabel(serviceSkillValue.runner_type, copy),
    executionLocationLabel: resolveExecutionLocationLabel(
      serviceSkillValue.execution_location,
      copy,
    ),
    executionLocationLegacyCompat: resolveExecutionLocationLegacyCompat(
      serviceSkillValue.execution_location,
    ),
    sourceLabel: resolveSourceLabel(serviceSkillValue.source, copy),
    theme: normalizeOptionalText(harnessValue?.theme),
    contentId:
      normalizeOptionalText(explicitContentId) ||
      normalizeOptionalText(record.content_id) ||
      normalizeOptionalText(harnessValue?.content_id),
    slotSummary: parseSlotSummaryEntries(
      serviceSkillValue.slot_values ?? serviceSkillValue.slot_summary,
      copy,
    ),
    userInput:
      normalizeOptionalText(serviceSkillValue.user_input) ||
      normalizeOptionalText(serviceSkillValue.userInput),
  };
}

function shouldUseFallbackLabel(
  value: string,
  copy: AutomationServiceSkillContextCopy,
): boolean {
  return value === copy.unknownLabel;
}

function shouldUseFallbackTitle(
  value: string,
  copy: AutomationServiceSkillContextCopy,
): boolean {
  return value === copy.defaultTitle;
}

export function mergeAutomationServiceSkillContexts(
  primary: AutomationServiceSkillContext | null,
  fallback: AutomationServiceSkillContext | null,
  copy: AutomationServiceSkillContextCopy = defaultAutomationServiceSkillContextCopy,
): AutomationServiceSkillContext | null {
  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }

  return {
    id: primary.id || fallback.id,
    title: shouldUseFallbackTitle(primary.title, copy)
      ? fallback.title
      : primary.title,
    runnerLabel: shouldUseFallbackLabel(primary.runnerLabel, copy)
      ? fallback.runnerLabel
      : primary.runnerLabel,
    executionLocationLabel: shouldUseFallbackLabel(
      primary.executionLocationLabel,
      copy,
    )
      ? fallback.executionLocationLabel
      : primary.executionLocationLabel,
    executionLocationLegacyCompat:
      primary.executionLocationLegacyCompat ||
      fallback.executionLocationLegacyCompat,
    sourceLabel: shouldUseFallbackLabel(primary.sourceLabel, copy)
      ? fallback.sourceLabel
      : primary.sourceLabel,
    theme: primary.theme || fallback.theme,
    contentId: primary.contentId || fallback.contentId,
    slotSummary: primary.slotSummary.length
      ? primary.slotSummary
      : fallback.slotSummary,
    userInput: primary.userInput || fallback.userInput,
  };
}

export function resolveServiceSkillContextFromMetadataRecord(
  metadata: Record<string, unknown>,
  options?: {
    contentId?: string | null;
    copy?: AutomationServiceSkillContextCopy;
  },
): AutomationServiceSkillContext | null {
  const nestedRequestMetadata = isRecord(metadata.request_metadata)
    ? metadata.request_metadata
    : null;
  const explicitContentId = normalizeOptionalText(options?.contentId);
  const copy = options?.copy ?? defaultAutomationServiceSkillContextCopy;

  return (
    resolveServiceSkillContextFromRecord(metadata, copy, explicitContentId) ||
    (nestedRequestMetadata
      ? resolveServiceSkillContextFromRecord(
          nestedRequestMetadata,
          copy,
          explicitContentId,
        )
      : null)
  );
}

export function resolveServiceSkillAutomationContext(
  payload: AutomationPayload,
  copy: AutomationServiceSkillContextCopy = defaultAutomationServiceSkillContextCopy,
): AutomationServiceSkillContext | null {
  if (payload.kind !== "agent_turn" || !isRecord(payload.request_metadata)) {
    return null;
  }
  return resolveServiceSkillContextFromRecord(
    payload.request_metadata,
    copy,
    payload.content_id,
  );
}
