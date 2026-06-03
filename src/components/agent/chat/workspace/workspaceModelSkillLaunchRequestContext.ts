import type { ParsedAnalysisWorkbenchCommand } from "../utils/analysisWorkbenchCommand";
import type { ParsedBroadcastWorkbenchCommand } from "../utils/broadcastWorkbenchCommand";
import type { ParsedFormWorkbenchCommand } from "../utils/formWorkbenchCommand";
import type { ParsedPresentationWorkbenchCommand } from "../utils/presentationWorkbenchCommand";
import type { ParsedResourceSearchWorkbenchCommand } from "../utils/resourceSearchWorkbenchCommand";
import type { ParsedSummaryWorkbenchCommand } from "../utils/summaryWorkbenchCommand";
import type { ParsedTranscriptionWorkbenchCommand } from "../utils/transcriptionWorkbenchCommand";
import type { ParsedTranslationWorkbenchCommand } from "../utils/translationWorkbenchCommand";
import type { ParsedTypesettingWorkbenchCommand } from "../utils/typesettingWorkbenchCommand";
import {
  isUrlParseReadTrigger,
  isUrlParseScrapeTrigger,
  type ParsedUrlParseWorkbenchCommand,
} from "../utils/urlParseWorkbenchCommand";
import type { ParsedWebpageWorkbenchCommand } from "../utils/webpageWorkbenchCommand";
import {
  AUDIO_TRANSCRIPTION_DEFAULT_ENTRY_SOURCE,
  TEXT_TRANSFORM_DEFAULT_ENTRY_SOURCE,
  resolveAudioTranscriptionRuntimeContractBinding,
  resolveTextTransformRuntimeContractBinding,
} from "@/lib/governance/modalityRuntimeContracts";
import {
  buildModelSkillLaunchRequestMetadataFor,
  SESSION_BOUND_MODEL_SKILL_LAUNCHES,
  type ModelSkillLaunchId,
  type SessionBoundRequestContextKey,
} from "./modelSkillLaunchDescriptors";

export type PendingCommandSessionBinding =
  | {
      kind: "request_context";
      requestContext: Record<string, unknown>;
      requestContextKey: SessionBoundRequestContextKey;
    }
  | {
      kind: "scoped_request_context";
      scopedRequestContext: Record<string, unknown>;
    };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolveContractEntrySource(
  boundEntrySources: readonly string[] | undefined,
  preferredEntrySource: string,
): string {
  if (boundEntrySources?.includes(preferredEntrySource)) {
    return preferredEntrySource;
  }

  return boundEntrySources?.[0] || preferredEntrySource;
}

export function attachSessionIdToRequestContext(
  requestContext: Record<string, unknown>,
  requestContextKey: SessionBoundRequestContextKey,
  sessionId: string | null | undefined,
): void {
  const scopedRequestContext = asRecord(requestContext[requestContextKey]);
  if (!scopedRequestContext) {
    return;
  }

  const normalizedSessionId = sessionId?.trim();
  if (normalizedSessionId) {
    scopedRequestContext.session_id = normalizedSessionId;
    return;
  }

  delete scopedRequestContext.session_id;
}

export function attachSessionIdToScopedRequestContext(
  scopedRequestContext: Record<string, unknown>,
  sessionId: string | null | undefined,
): void {
  const normalizedSessionId = sessionId?.trim();
  if (normalizedSessionId) {
    scopedRequestContext.session_id = normalizedSessionId;
    return;
  }

  delete scopedRequestContext.session_id;
}

export function extractBoundSessionRequestContext(
  requestMetadata: Record<string, unknown> | undefined,
): PendingCommandSessionBinding | null {
  const harness = asRecord(requestMetadata?.harness);
  if (!harness) {
    return null;
  }

  for (const launch of SESSION_BOUND_MODEL_SKILL_LAUNCHES) {
    const launchMetadata = asRecord(harness[launch.launchKey]);
    if (!launchMetadata) {
      continue;
    }

    const scopedRequestContext =
      asRecord(launchMetadata[launch.requestContextKey]) ||
      asRecord(
        asRecord(launchMetadata.request_context)?.[launch.requestContextKey],
      );
    if (!scopedRequestContext) {
      continue;
    }

    return {
      kind: "scoped_request_context",
      scopedRequestContext,
    };
  }

  return null;
}

export function buildSkillLaunchRequestMetadata(
  launchId: ModelSkillLaunchId,
  existingMetadata: Record<string, unknown> | undefined,
  requestContext: Record<string, unknown>,
): Record<string, unknown> {
  return buildModelSkillLaunchRequestMetadataFor(
    launchId,
    existingMetadata,
    requestContext,
  );
}

export function buildBroadcastSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedBroadcastWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> {
  const content =
    params.parsedCommand.content?.trim() ||
    params.parsedCommand.prompt.trim() ||
    params.parsedCommand.body.trim();

  return {
    kind: "broadcast_task",
    broadcast_task: {
      raw_text: params.rawText,
      prompt: params.parsedCommand.prompt || undefined,
      content: content || undefined,
      title: params.parsedCommand.title,
      audience: params.parsedCommand.audience,
      tone: params.parsedCommand.tone,
      duration_hint_minutes: params.parsedCommand.durationHintMinutes,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: "at_broadcast_command",
    },
  };
}

export function buildResourceSearchSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedResourceSearchWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
  promptOverride?: string;
}): Record<string, unknown> {
  const prompt =
    normalizeOptionalText(params.promptOverride) ||
    normalizeOptionalText(params.parsedCommand.prompt);

  return {
    kind: "resource_search_task",
    resource_search_task: {
      raw_text: params.rawText,
      prompt,
      title: params.parsedCommand.title,
      resource_type: params.parsedCommand.resourceType,
      query: params.parsedCommand.query,
      usage: params.parsedCommand.usage,
      count: params.parsedCommand.count,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: "at_resource_search_command",
    },
  };
}

export function buildTranscriptionSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedTranscriptionWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> {
  const runtimeContract = resolveAudioTranscriptionRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    AUDIO_TRANSCRIPTION_DEFAULT_ENTRY_SOURCE,
  );

  return {
    kind: "transcription_task",
    transcription_task: {
      raw_text: params.rawText,
      prompt: params.parsedCommand.prompt || undefined,
      source_url: params.parsedCommand.sourceUrl,
      source_path: params.parsedCommand.sourcePath,
      language: params.parsedCommand.language,
      output_format: params.parsedCommand.outputFormat,
      speaker_labels: params.parsedCommand.speakerLabels,
      timestamps: params.parsedCommand.timestamps,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

export function buildSummarySkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedSummaryWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> {
  const prompt =
    params.parsedCommand.prompt.trim() || "请总结当前对话中的关键信息";
  const runtimeContract = resolveTextTransformRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    TEXT_TRANSFORM_DEFAULT_ENTRY_SOURCE,
  );

  return {
    kind: "summary_request",
    summary_request: {
      raw_text: params.rawText,
      prompt,
      content: params.parsedCommand.content,
      focus: params.parsedCommand.focus,
      length: params.parsedCommand.length,
      style: params.parsedCommand.style,
      output_format: params.parsedCommand.outputFormat,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

export function buildTranslationSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedTranslationWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> {
  const prompt =
    params.parsedCommand.prompt.trim() || "请翻译当前对话中最相关的内容";
  const runtimeContract = resolveTextTransformRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_translation_command",
  );

  return {
    kind: "translation_request",
    translation_request: {
      raw_text: params.rawText,
      prompt,
      content: params.parsedCommand.content,
      source_language: params.parsedCommand.sourceLanguage,
      target_language: params.parsedCommand.targetLanguage,
      style: params.parsedCommand.style,
      output_format: params.parsedCommand.outputFormat,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

export function buildAnalysisSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: Pick<
    ParsedAnalysisWorkbenchCommand,
    "prompt" | "content" | "focus" | "style" | "outputFormat"
  > & {
    analysisMode?: string;
  };
  projectId?: string | null;
  contentId?: string | null;
  entrySource?: string;
}): Record<string, unknown> {
  const prompt =
    params.parsedCommand.prompt.trim() || "请分析当前对话中最相关的内容";
  const runtimeContract = resolveTextTransformRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    params.entrySource || "at_analysis_command",
  );

  return {
    kind: "analysis_request",
    analysis_request: {
      raw_text: params.rawText,
      prompt,
      content: params.parsedCommand.content,
      focus: params.parsedCommand.focus,
      style: params.parsedCommand.style,
      output_format: params.parsedCommand.outputFormat,
      analysis_mode: params.parsedCommand.analysisMode,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

export function buildUrlParseSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedUrlParseWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> {
  const isScrapeEntry = isUrlParseScrapeTrigger(params.parsedCommand.trigger);
  const isReadEntry = isUrlParseReadTrigger(params.parsedCommand.trigger);

  return {
    kind: "url_parse_task",
    url_parse_task: {
      raw_text: params.rawText,
      prompt: params.parsedCommand.prompt || undefined,
      url: params.parsedCommand.url,
      extract_goal: params.parsedCommand.extractGoal,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: isScrapeEntry
        ? "at_web_scrape_command"
        : isReadEntry
          ? "at_webpage_read_command"
          : "at_url_parse_command",
    },
  };
}

export function buildTypesettingSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedTypesettingWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> {
  return {
    kind: "typesetting_task",
    typesetting_task: {
      raw_text: params.rawText,
      prompt: params.parsedCommand.prompt || undefined,
      content: params.parsedCommand.body || undefined,
      target_platform: params.parsedCommand.targetPlatform,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: "at_typesetting_command",
    },
  };
}

export function buildWebpageSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedWebpageWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> {
  const prompt =
    params.parsedCommand.prompt.trim() || "请生成一个可直接预览的网页";

  return {
    kind: "webpage_request",
    webpage_request: {
      raw_text: params.rawText,
      prompt,
      content: params.parsedCommand.body || undefined,
      page_type: params.parsedCommand.pageType,
      style: params.parsedCommand.style,
      tech_stack: params.parsedCommand.techStack,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: "at_webpage_command",
    },
  };
}

export function buildPresentationSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedPresentationWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> {
  const prompt =
    params.parsedCommand.prompt.trim() || "请生成一份可直接讲述的演示文稿草稿";

  return {
    kind: "presentation_request",
    presentation_request: {
      raw_text: params.rawText,
      prompt,
      content: params.parsedCommand.body || undefined,
      deck_type: params.parsedCommand.deckType,
      style: params.parsedCommand.style,
      audience: params.parsedCommand.audience,
      slide_count: params.parsedCommand.slideCount,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: "at_presentation_command",
    },
  };
}

export function buildFormSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedFormWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> {
  const prompt =
    params.parsedCommand.prompt.trim() ||
    "请生成一个可直接在聊天区渲染的 A2UI 表单";

  return {
    kind: "form_request",
    form_request: {
      raw_text: params.rawText,
      prompt,
      content: params.parsedCommand.body || undefined,
      form_type: params.parsedCommand.formType,
      style: params.parsedCommand.style,
      audience: params.parsedCommand.audience,
      field_count: params.parsedCommand.fieldCount,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: "at_form_command",
    },
  };
}
