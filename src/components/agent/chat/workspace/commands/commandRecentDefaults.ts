/**
 * 命令 recent defaults 合并函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于将用户最近使用的命令参数与当前解析结果合并。
 *
 * @module commandRecentDefaults
 */

import type { ServiceSkillSlotValues } from "../../service-skills/types";
import { parseSummaryWorkbenchCommand } from "../../utils/summaryWorkbenchCommand";
import { parseTranslationWorkbenchCommand } from "../../utils/translationWorkbenchCommand";
import { parseAnalysisWorkbenchCommand } from "../../utils/analysisWorkbenchCommand";
import {
  DEFAULT_COMPLIANCE_FOCUS,
  DEFAULT_COMPLIANCE_OUTPUT_FORMAT,
  DEFAULT_COMPLIANCE_STYLE,
  parseComplianceWorkbenchCommand,
} from "../../utils/complianceWorkbenchCommand";
import { parseTypesettingWorkbenchCommand } from "../../utils/typesettingWorkbenchCommand";
import { parsePresentationWorkbenchCommand } from "../../utils/presentationWorkbenchCommand";
import { parseFormWorkbenchCommand } from "../../utils/formWorkbenchCommand";
import { parseWebpageWorkbenchCommand } from "../../utils/webpageWorkbenchCommand";
import { parseChannelPreviewWorkbenchCommand } from "../../utils/channelPreviewWorkbenchCommand";
import { parseUploadWorkbenchCommand } from "../../utils/uploadWorkbenchCommand";
import { parsePublishWorkbenchCommand } from "../../utils/publishWorkbenchCommand";
import { parseWritingWorkbenchCommand } from "../../utils/writingWorkbenchCommand";
import { normalizeContentPostPlatform } from "../../utils/contentPostPlatform";

// --- 类型别名（从 useWorkspaceSendActions.ts 提取） ---

export type ParsedSummaryWorkbenchCommand = NonNullable<
  ReturnType<typeof parseSummaryWorkbenchCommand>
>;
export type ParsedTranslationWorkbenchCommand = NonNullable<
  ReturnType<typeof parseTranslationWorkbenchCommand>
>;
export type ParsedAnalysisWorkbenchCommand = NonNullable<
  ReturnType<typeof parseAnalysisWorkbenchCommand>
>;
export type ParsedComplianceWorkbenchCommand = NonNullable<
  ReturnType<typeof parseComplianceWorkbenchCommand>
>;
export type ParsedTypesettingWorkbenchCommand = NonNullable<
  ReturnType<typeof parseTypesettingWorkbenchCommand>
>;
export type ParsedPresentationWorkbenchCommand = NonNullable<
  ReturnType<typeof parsePresentationWorkbenchCommand>
>;
export type ParsedFormWorkbenchCommand = NonNullable<
  ReturnType<typeof parseFormWorkbenchCommand>
>;
export type ParsedWebpageWorkbenchCommand = NonNullable<
  ReturnType<typeof parseWebpageWorkbenchCommand>
>;
export type ParsedChannelPreviewWorkbenchCommand = NonNullable<
  ReturnType<typeof parseChannelPreviewWorkbenchCommand>
>;
export type ParsedUploadWorkbenchCommand = NonNullable<
  ReturnType<typeof parseUploadWorkbenchCommand>
>;
export type ParsedPublishWorkbenchCommand = NonNullable<
  ReturnType<typeof parsePublishWorkbenchCommand>
>;
export type ParsedWritingWorkbenchCommand = NonNullable<
  ReturnType<typeof parseWritingWorkbenchCommand>
>;

export type ParsedPublishLikeWorkbenchCommand =
  | ParsedChannelPreviewWorkbenchCommand
  | ParsedUploadWorkbenchCommand
  | ParsedPublishWorkbenchCommand
  | ParsedWritingWorkbenchCommand;

// --- 工具函数 ---

export function normalizeOptionalText(
  value?: string | null,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

// --- 命令 recent defaults 合并函数 ---

export function resolvePreferredRecentCommandText(
  current?: string | null,
  fallback?: string | null,
): string | undefined {
  return normalizeOptionalText(current) || normalizeOptionalText(fallback);
}

export function normalizeRecentSummaryLength(
  value?: string | null,
): ParsedSummaryWorkbenchCommand["length"] | undefined {
  if (value === "short" || value === "medium" || value === "long") {
    return value;
  }
  return undefined;
}

export function mergeSummaryCommandRecentDefaults(params: {
  parsedCommand: ParsedSummaryWorkbenchCommand;
  slotValues?: ServiceSkillSlotValues;
}): ParsedSummaryWorkbenchCommand {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    focus: resolvePreferredRecentCommandText(
      params.parsedCommand.focus,
      slotValues.focus,
    ),
    length:
      params.parsedCommand.length ??
      normalizeRecentSummaryLength(slotValues.length),
    style: resolvePreferredRecentCommandText(
      params.parsedCommand.style,
      slotValues.style,
    ),
    outputFormat: resolvePreferredRecentCommandText(
      params.parsedCommand.outputFormat,
      slotValues.output_format,
    ),
  };
}

export function mergeTranslationCommandRecentDefaults(params: {
  parsedCommand: ParsedTranslationWorkbenchCommand;
  slotValues?: ServiceSkillSlotValues;
}): ParsedTranslationWorkbenchCommand {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    sourceLanguage: resolvePreferredRecentCommandText(
      params.parsedCommand.sourceLanguage,
      slotValues.source_language,
    ),
    targetLanguage: resolvePreferredRecentCommandText(
      params.parsedCommand.targetLanguage,
      slotValues.target_language,
    ),
    style: resolvePreferredRecentCommandText(
      params.parsedCommand.style,
      slotValues.style,
    ),
    outputFormat: resolvePreferredRecentCommandText(
      params.parsedCommand.outputFormat,
      slotValues.output_format,
    ),
  };
}

export function mergeAnalysisCommandRecentDefaults<
  T extends
    | ParsedAnalysisWorkbenchCommand
    | ParsedComplianceWorkbenchCommand,
>(params: { parsedCommand: T; slotValues?: ServiceSkillSlotValues }): T {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    focus: resolvePreferredRecentCommandText(
      params.parsedCommand.focus,
      slotValues.focus,
    ),
    style: resolvePreferredRecentCommandText(
      params.parsedCommand.style,
      slotValues.style,
    ),
    outputFormat: resolvePreferredRecentCommandText(
      params.parsedCommand.outputFormat,
      slotValues.output_format,
    ),
  };
}

export function resolvePreferredComplianceCommandText(params: {
  current?: string | null;
  fallback?: string | null;
  defaultValue: string;
}): string {
  return (
    normalizeOptionalText(params.current) ||
    normalizeOptionalText(params.fallback) ||
    params.defaultValue
  );
}

export function mergeComplianceCommandRecentDefaults(params: {
  parsedCommand: ParsedComplianceWorkbenchCommand;
  slotValues?: ServiceSkillSlotValues;
}): ParsedComplianceWorkbenchCommand {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    focus: resolvePreferredComplianceCommandText({
      current: params.parsedCommand.focus,
      fallback: slotValues.focus,
      defaultValue: DEFAULT_COMPLIANCE_FOCUS,
    }),
    style: resolvePreferredComplianceCommandText({
      current: params.parsedCommand.style,
      fallback: slotValues.style,
      defaultValue: DEFAULT_COMPLIANCE_STYLE,
    }),
    outputFormat: resolvePreferredComplianceCommandText({
      current: params.parsedCommand.outputFormat,
      fallback: slotValues.output_format,
      defaultValue: DEFAULT_COMPLIANCE_OUTPUT_FORMAT,
    }),
  };
}

export function normalizeRecentPositiveInteger(
  value?: string | null,
): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

export function normalizeRecentPresentationDeckType(
  value?: string | null,
): ParsedPresentationWorkbenchCommand["deckType"] | undefined {
  if (
    value === "general" ||
    value === "pitch" ||
    value === "report" ||
    value === "education"
  ) {
    return value;
  }
  return undefined;
}

export function normalizeRecentFormType(
  value?: string | null,
): ParsedFormWorkbenchCommand["formType"] | undefined {
  if (
    value === "survey" ||
    value === "registration" ||
    value === "feedback" ||
    value === "application" ||
    value === "order"
  ) {
    return value;
  }
  return undefined;
}

export function normalizeRecentWebpageType(
  value?: string | null,
): ParsedWebpageWorkbenchCommand["webpageType"] | undefined {
  if (
    value === "landing" ||
    value === "blog" ||
    value === "product" ||
    value === "portfolio" ||
    value === "documentation"
  ) {
    return value;
  }
  return undefined;
}

export function mergeTypesettingCommandRecentDefaults(params: {
  parsedCommand: ParsedTypesettingWorkbenchCommand;
  slotValues?: ServiceSkillSlotValues;
}): ParsedTypesettingWorkbenchCommand {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    typesettingStyle: resolvePreferredRecentCommandText(
      params.parsedCommand.typesettingStyle,
      slotValues.style,
    ),
    outputFormat: resolvePreferredRecentCommandText(
      params.parsedCommand.outputFormat,
      slotValues.output_format,
    ),
  };
}

export function mergePresentationCommandRecentDefaults(params: {
  parsedCommand: ParsedPresentationWorkbenchCommand;
  slotValues?: ServiceSkillSlotValues;
}): ParsedPresentationWorkbenchCommand {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    topic: resolvePreferredRecentCommandText(
      params.parsedCommand.topic,
      slotValues.topic,
    ),
    slideCount:
      params.parsedCommand.slideCount ??
      normalizeRecentPositiveInteger(slotValues.slide_count),
    deckType:
      params.parsedCommand.deckType ??
      normalizeRecentPresentationDeckType(slotValues.deck_type),
    style: resolvePreferredRecentCommandText(
      params.parsedCommand.style,
      slotValues.style,
    ),
    outputFormat: resolvePreferredRecentCommandText(
      params.parsedCommand.outputFormat,
      slotValues.output_format,
    ),
  };
}

export function mergeFormCommandRecentDefaults(params: {
  parsedCommand: ParsedFormWorkbenchCommand;
  slotValues?: ServiceSkillSlotValues;
}): ParsedFormWorkbenchCommand {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    topic: resolvePreferredRecentCommandText(
      params.parsedCommand.topic,
      slotValues.topic,
    ),
    formType:
      params.parsedCommand.formType ??
      normalizeRecentFormType(slotValues.form_type),
    fieldCount:
      params.parsedCommand.fieldCount ??
      normalizeRecentPositiveInteger(slotValues.field_count),
    style: resolvePreferredRecentCommandText(
      params.parsedCommand.style,
      slotValues.style,
    ),
    outputFormat: resolvePreferredRecentCommandText(
      params.parsedCommand.outputFormat,
      slotValues.output_format,
    ),
  };
}

export function mergeWebpageCommandRecentDefaults(params: {
  parsedCommand: ParsedWebpageWorkbenchCommand;
  slotValues?: ServiceSkillSlotValues;
}): ParsedWebpageWorkbenchCommand {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  return {
    ...params.parsedCommand,
    topic: resolvePreferredRecentCommandText(
      params.parsedCommand.topic,
      slotValues.topic,
    ),
    webpageType:
      params.parsedCommand.webpageType ??
      normalizeRecentWebpageType(slotValues.webpage_type),
    style: resolvePreferredRecentCommandText(
      params.parsedCommand.style,
      slotValues.style,
    ),
    outputFormat: resolvePreferredRecentCommandText(
      params.parsedCommand.outputFormat,
      slotValues.output_format,
    ),
  };
}

export function normalizeRecentPublishPlatform(params: {
  platformType?: string | null;
  platformLabel?: string | null;
}): {
  platformType: string | undefined;
  platformLabel: string | undefined;
} {
  const normalized = normalizeContentPostPlatform(
    params.platformType ?? undefined,
  );
  if (normalized) {
    return {
      platformType: normalized,
      platformLabel:
        normalizeOptionalText(params.platformLabel) ?? normalized,
    };
  }
  return {
    platformType: normalizeOptionalText(params.platformType),
    platformLabel: normalizeOptionalText(params.platformLabel),
  };
}

export function mergePublishLikeCommandRecentDefaults<
  T extends ParsedPublishLikeWorkbenchCommand,
>(params: { parsedCommand: T; slotValues?: ServiceSkillSlotValues }): T {
  const slotValues = params.slotValues;
  if (!slotValues) {
    return params.parsedCommand;
  }

  const currentPlatform = normalizeRecentPublishPlatform({
    platformType: params.parsedCommand.platformType,
    platformLabel: params.parsedCommand.platformLabel,
  });
  const fallbackPlatform = normalizeRecentPublishPlatform({
    platformType: slotValues.platform_type,
    platformLabel: slotValues.platform_label,
  });

  return {
    ...params.parsedCommand,
    platformType: currentPlatform.platformType ?? fallbackPlatform.platformType,
    platformLabel:
      currentPlatform.platformLabel ?? fallbackPlatform.platformLabel,
  };
}
