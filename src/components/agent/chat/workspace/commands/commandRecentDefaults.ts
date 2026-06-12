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
import { parseGrowthWorkbenchCommand } from "../../utils/growthWorkbenchCommand";
import { parseVoiceWorkbenchCommand } from "../../utils/voiceWorkbenchCommand";
import type { ParsedLogoDecompositionWorkbenchCommand } from "../../utils/logoDecompositionWorkbenchCommand";
import {
  normalizeContentPostPlatform,
  type ContentPostPlatformType,
} from "../../utils/contentPostPlatform";

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
export type ParsedGrowthWorkbenchCommand = NonNullable<
  ReturnType<typeof parseGrowthWorkbenchCommand>
>;
export type ParsedVoiceWorkbenchCommand = NonNullable<
  ReturnType<typeof parseVoiceWorkbenchCommand>
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
    | ParsedComplianceWorkbenchCommand
    | ParsedLogoDecompositionWorkbenchCommand,
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
  const current = normalizeOptionalText(params.current);
  return (
    (current && current !== params.defaultValue ? current : undefined) ||
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
  switch (value) {
    case "pitch":
    case "pitch_deck":
      return "pitch_deck";
    case "sales":
    case "sales_deck":
      return "sales_deck";
    case "education":
    case "training":
    case "training_deck":
      return "training_deck";
    case "report":
    case "report_deck":
      return "report_deck";
    case "proposal":
    case "proposal_deck":
      return "proposal_deck";
    default:
      return undefined;
  }
}

export function normalizeRecentFormType(
  value?: string | null,
): ParsedFormWorkbenchCommand["formType"] | undefined {
  switch (value) {
    case "survey":
    case "survey_form":
      return "survey_form";
    case "lead":
    case "lead_form":
      return "lead_form";
    case "registration":
    case "registration_form":
      return "registration_form";
    case "feedback":
    case "feedback_form":
      return "feedback_form";
    case "application":
    case "application_form":
      return "application_form";
    default:
      return undefined;
  }
}

export function normalizeRecentWebpageType(
  value?: string | null,
): ParsedWebpageWorkbenchCommand["pageType"] | undefined {
  switch (value) {
    case "landing":
    case "landing_page":
      return "landing_page";
    case "home":
    case "homepage":
      return "homepage";
    case "campaign":
    case "campaign_page":
      return "campaign_page";
    case "product":
    case "product_page":
      return "product_page";
    case "documentation":
    case "docs":
    case "docs_page":
      return "docs_page";
    case "portfolio":
      return "portfolio";
    case "resume":
    case "resume_page":
      return "resume_page";
    default:
      return undefined;
  }
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
    targetPlatform: resolvePreferredRecentCommandText(
      params.parsedCommand.targetPlatform,
      slotValues.target_platform,
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
    prompt: resolvePreferredRecentCommandText(
      params.parsedCommand.prompt,
      slotValues.topic,
    ) ?? params.parsedCommand.prompt,
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
    audience: resolvePreferredRecentCommandText(
      params.parsedCommand.audience,
      slotValues.audience,
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
    prompt: resolvePreferredRecentCommandText(
      params.parsedCommand.prompt,
      slotValues.topic,
    ) ?? params.parsedCommand.prompt,
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
    audience: resolvePreferredRecentCommandText(
      params.parsedCommand.audience,
      slotValues.audience,
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
    prompt: resolvePreferredRecentCommandText(
      params.parsedCommand.prompt,
      slotValues.topic,
    ) ?? params.parsedCommand.prompt,
    pageType:
      params.parsedCommand.pageType ??
      normalizeRecentWebpageType(
        slotValues.page_type ?? slotValues.webpage_type,
      ),
    style: resolvePreferredRecentCommandText(
      params.parsedCommand.style,
      slotValues.style,
    ),
    techStack: resolvePreferredRecentCommandText(
      params.parsedCommand.techStack,
      slotValues.tech_stack,
    ),
  };
}

export function normalizeRecentPublishPlatform(params: {
  platformType?: string | null;
  platformLabel?: string | null;
}): {
  platformType: ContentPostPlatformType | undefined;
  platformLabel: string | undefined;
} {
  const normalized = normalizeContentPostPlatform(
    params.platformType ?? undefined,
  );
  const normalizedFromLabel =
    normalized.platformType || normalized.platformLabel
      ? {}
      : normalizeContentPostPlatform(params.platformLabel ?? undefined);
  if (normalized.platformType || normalized.platformLabel) {
    return {
      platformType: normalized.platformType,
      platformLabel:
        normalizeOptionalText(params.platformLabel) ??
        normalized.platformLabel,
    };
  }
  if (normalizedFromLabel.platformType || normalizedFromLabel.platformLabel) {
    return {
      platformType: normalizedFromLabel.platformType,
      platformLabel:
        normalizeOptionalText(params.platformLabel) ??
        normalizedFromLabel.platformLabel,
    };
  }
  return {
    platformType: undefined,
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
