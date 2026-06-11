import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import type {
  AgentRuntimeWebSearchMode,
  AutoContinueRequestPayload,
} from "@/lib/api/agentRuntime";
import type {
  ServiceModelPreferenceConfig,
  ServiceModelsConfig,
} from "@/lib/api/appConfigTypes";
import { logAgentDebug } from "@/lib/agentDebug";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import { useGlobalMediaGenerationDefaults } from "@/hooks/useGlobalMediaGenerationDefaults";
import { getOrCreateDefaultProject } from "@/lib/api/project";
import { normalizeMediaGenerationPreference } from "@/lib/mediaGeneration";
import {
  mergeServiceModelPrompt,
  resolveServiceModelExecutionPreference,
} from "@/lib/serviceModels";
import { parseAnalysisWorkbenchCommand } from "../utils/analysisWorkbenchCommand";
import { parseBrowserWorkbenchCommand } from "../utils/browserWorkbenchCommand";
import { parseBroadcastWorkbenchCommand } from "../utils/broadcastWorkbenchCommand";
import { parseChannelPreviewWorkbenchCommand } from "../utils/channelPreviewWorkbenchCommand";
import {
  parseComplianceWorkbenchCommand,
} from "../utils/complianceWorkbenchCommand";
import { parseCompetitorWorkbenchCommand } from "../utils/competitorWorkbenchCommand";
import { parseCoverWorkbenchCommand } from "../utils/coverWorkbenchCommand";
import { parseDeepSearchWorkbenchCommand } from "../utils/deepSearchWorkbenchCommand";
import { parseFileReadWorkbenchCommand } from "../utils/fileReadWorkbenchCommand";
import { parseFormWorkbenchCommand } from "../utils/formWorkbenchCommand";
import { parseGrowthWorkbenchCommand } from "../utils/growthWorkbenchCommand";
import { parseImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import { parseLogoDecompositionWorkbenchCommand } from "../utils/logoDecompositionWorkbenchCommand";
import { parsePdfWorkbenchCommand } from "../utils/pdfWorkbenchCommand";
import { parsePosterWorkbenchCommand } from "../utils/posterWorkbenchCommand";
import { parsePresentationWorkbenchCommand } from "../utils/presentationWorkbenchCommand";
import { parsePublishWorkbenchCommand } from "../utils/publishWorkbenchCommand";
import { parseReportWorkbenchCommand } from "../utils/reportWorkbenchCommand";
import { parseResourceSearchWorkbenchCommand } from "../utils/resourceSearchWorkbenchCommand";
import { parseSearchWorkbenchCommand } from "../utils/searchWorkbenchCommand";
import { parseSiteSearchWorkbenchCommand } from "../utils/siteSearchWorkbenchCommand";
import { parseSummaryWorkbenchCommand } from "../utils/summaryWorkbenchCommand";
import { parseTranslationWorkbenchCommand } from "../utils/translationWorkbenchCommand";
import {
  buildMentionCommandReplayText,
  resolveMentionCommandMergedPrefillReplayText,
  resolveMentionCommandPrefillReplayText,
} from "../utils/mentionCommandReplayText";
import {
  parseMentionCommand,
  resolveMentionCommandPrefixMatch,
} from "../utils/mentionCommandPrefixMatch";
import { parseTranscriptionWorkbenchCommand } from "../utils/transcriptionWorkbenchCommand";
import { parseTypesettingWorkbenchCommand } from "../utils/typesettingWorkbenchCommand";
import { parseUploadWorkbenchCommand } from "../utils/uploadWorkbenchCommand";
import {
  isUrlParseReadTrigger,
  isUrlParseScrapeTrigger,
  parseUrlParseWorkbenchCommand,
} from "../utils/urlParseWorkbenchCommand";
import { parseVideoWorkbenchCommand } from "../utils/videoWorkbenchCommand";
import { parseVoiceWorkbenchCommand } from "../utils/voiceWorkbenchCommand";
import { parseWritingWorkbenchCommand } from "../utils/writingWorkbenchCommand";
import { parseWebpageWorkbenchCommand } from "../utils/webpageWorkbenchCommand";
import {
  AGENT_FAST_RESPONSE_MODE_STORAGE_KEY,
  buildAgentFastResponseMetadata,
  buildAgentFastResponseSystemPrompt,
  resolveAgentFastResponseRouting,
  type AgentFastResponseRoutingDecision,
  type AgentFastResponseMode,
} from "../utils/fastResponseRouting";
import { resolvePlainInputIntentConfirmation } from "../utils/plainInputIntentConfirmation";
import { detectBrowserTaskRequirement } from "../utils/browserTaskRequirement";
import { isTeamRuntimeRecommendation } from "../utils/contextualRecommendations";
import {
  matchAutoLaunchSiteSkillFromText,
  type AutoMatchedSiteSkill,
} from "../service-skills/autoMatchSiteSkill";
import {
  saveChatToolPreferences,
  type ChatToolPreferences,
} from "../utils/chatToolPreferences";
import { buildImageTaskAssistantContent } from "./imageTaskPersona";
import type { HandleSendOptions } from "../hooks/handleSendTypes";
import { extractAgentUiPerformanceTraceMetadata } from "../hooks/agentStreamPerformanceMetrics";
import type { UseRuntimeTeamFormationResult } from "../hooks/useRuntimeTeamFormation";
import type { SendMessageFn } from "../hooks/agentChatShared";
import { normalizeExecutionStrategy } from "../hooks/agentChatCoreUtils";
import type {
  Message,
  MessageImage,
  MessageImageWorkbenchPreview,
} from "../types";
import type { TeamDefinition } from "../utils/teamDefinitions";
import type { AgentAccessMode } from "../hooks/agentChatStorage";
import {
  buildInitialDispatchPreviewMessages,
  buildRuntimeTeamDispatchPreview,
  buildRuntimeTeamDispatchPreviewMessages,
  buildSubmissionPreviewMessages,
  type GeneralWorkbenchSendBoundaryState,
  type InitialDispatchPreviewSnapshot,
  resolveRuntimeTeamDispatchPreviewState,
  type RuntimeTeamDispatchPreviewSnapshot,
  createSubmissionPreviewSnapshot,
  type SubmissionPreviewSnapshot,
  buildWorkspaceRequestMetadata,
  buildWorkspaceSendText,
  hasModelSkillLaunchRequestMetadata,
  hasServiceSkillLaunchRequestMetadata,
  primeBrowserAssistBeforeSend,
  type ContextWorkspaceSummary,
  type EnsureBrowserAssistCanvasOptions,
} from "./workspaceSendHelpers";
import { recordTeamFormationAgentUiProjection } from "../projection/teamFormationAgentUiProjection";
import type { Character } from "@/lib/api/memory";
import type { TeamMemorySnapshot } from "@/lib/teamMemorySync";
import type { ThemeType } from "@/lib/workspace/workbenchContract";
import type {
  ServiceSkillHomeItem,
  ServiceSkillSlotValues,
} from "../service-skills/types";
import type { ImageWorkbenchSkillRequest } from "./imageSkillLaunch";
import { MODEL_SKILL_LAUNCH_DESCRIPTORS } from "./modelSkillLaunchDescriptors";
import {
  attachSessionIdToRequestContext,
  attachSessionIdToScopedRequestContext,
  buildAnalysisSkillLaunchRequestContext,
  buildBroadcastSkillLaunchRequestContext,
  buildFormSkillLaunchRequestContext,
  buildPresentationSkillLaunchRequestContext,
  buildResourceSearchSkillLaunchRequestContext,
  buildSkillLaunchRequestMetadata,
  buildSummarySkillLaunchRequestContext,
  buildTranscriptionSkillLaunchRequestContext,
  buildTranslationSkillLaunchRequestContext,
  buildTypesettingSkillLaunchRequestContext,
  buildUrlParseSkillLaunchRequestContext,
  buildWebpageSkillLaunchRequestContext,
  extractBoundSessionRequestContext,
  resolveContractEntrySource,
  type PendingCommandSessionBinding,
} from "./workspaceModelSkillLaunchRequestContext";
import { buildBrowserControlLaunchRequestMetadata } from "./browserControlLaunch";
import {
  PDF_EXTRACT_DEFAULT_ENTRY_SOURCE,
  VOICE_GENERATION_DEFAULT_ENTRY_SOURCE,
  WEB_RESEARCH_DEFAULT_ENTRY_SOURCE,
  resolvePdfExtractRuntimeContractBinding,
  resolveTextTransformRuntimeContractBinding,
  resolveVoiceGenerationRuntimeContractBinding,
  resolveWebResearchRuntimeContractBinding,
} from "@/lib/governance/modalityRuntimeContracts";
import {
  buildServiceSceneLaunchRequestMetadata,
  parseRuntimeSceneCommand,
  RuntimeSceneLaunchValidationError,
  resolveRuntimeSceneLaunchRequest,
} from "./serviceSkillSceneLaunch";
import {
  resolveInputCapabilityDispatchContext,
  type CompletedInputCapabilitySlashUsage,
} from "./inputCapabilityRouting";
import type { RuntimeSceneGateRequest } from "./sceneSkillGate";
import {
  getMentionEntryUsageMap,
  getMentionEntryUsageRecordKey,
  recordMentionEntryUsage,
} from "../skill-selection/mentionEntryUsage";
import {
  parseCatalogExecutionStrategy,
  useRuntimeMentionCommandCatalog,
} from "../skill-selection/runtimeInputCapabilityCatalog";
import { recordServiceSkillUsage } from "../service-skills/storage";
import { composeServiceSkillPrompt } from "../service-skills/promptComposer";
import { recordSlashEntryUsage } from "../skill-selection/slashEntryUsage";
import { CONTENT_POST_SKILL_KEY } from "../utils/contentPostSkill";
import {
  installSkillFromPromptInstruction,
  parseSkillInstallPromptInstruction,
  type SkillInstallPromptInstruction,
} from "@/lib/skills/skillInstallPrompt";
import {
  normalizeOptionalText,
  resolvePreferredRecentCommandText,
  normalizeRecentSummaryLength,
  mergeSummaryCommandRecentDefaults,
  mergeTranslationCommandRecentDefaults,
  mergeAnalysisCommandRecentDefaults,
  resolvePreferredComplianceCommandText,
  mergeComplianceCommandRecentDefaults,
  normalizeRecentPositiveInteger,
  normalizeRecentPresentationDeckType,
  normalizeRecentFormType,
  normalizeRecentWebpageType,
  mergeTypesettingCommandRecentDefaults,
  mergePresentationCommandRecentDefaults,
  mergeFormCommandRecentDefaults,
  mergeWebpageCommandRecentDefaults,
  normalizeRecentPublishPlatform,
  mergePublishLikeCommandRecentDefaults,
} from "./commands/commandRecentDefaults";
import {
  buildPublishDispatchBody,
  buildChannelPreviewDispatchBody,
  buildUploadDispatchBody,
  buildWritingDispatchBody,
} from "./commands/dispatchBodyBuilders";
import {
  matchesVoiceCommandSkill,
  matchesGrowthCommandSkill,
  resolveGrowthCommandServiceSkill,
  resolveVoiceCommandServiceSkill,
  normalizeLocalServiceSkillExecutionKind,
} from "./commands/serviceSkillMatch";

type CurrentExecutionStrategy = "react";
type SetStringState = (value: string) => void;
type ParsedImageWorkbenchCommand = NonNullable<
  ReturnType<typeof parseImageWorkbenchCommand>
>;
type ParsedCoverWorkbenchCommand = NonNullable<
  ReturnType<typeof parseCoverWorkbenchCommand>
>;
type ParsedCompetitorWorkbenchCommand = NonNullable<
  ReturnType<typeof parseCompetitorWorkbenchCommand>
>;
type ParsedComplianceWorkbenchCommand = NonNullable<
  ReturnType<typeof parseComplianceWorkbenchCommand>
>;
type ParsedAnalysisWorkbenchCommand = NonNullable<
  ReturnType<typeof parseAnalysisWorkbenchCommand>
>;
type ParsedReportWorkbenchCommand = NonNullable<
  ReturnType<typeof parseReportWorkbenchCommand>
>;
type ParsedPdfWorkbenchCommand = NonNullable<
  ReturnType<typeof parsePdfWorkbenchCommand>
>;
type ParsedPresentationWorkbenchCommand = NonNullable<
  ReturnType<typeof parsePresentationWorkbenchCommand>
>;
type ParsedChannelPreviewWorkbenchCommand = NonNullable<
  ReturnType<typeof parseChannelPreviewWorkbenchCommand>
>;
type ParsedFormWorkbenchCommand = NonNullable<
  ReturnType<typeof parseFormWorkbenchCommand>
>;
type ParsedGrowthWorkbenchCommand = NonNullable<
  ReturnType<typeof parseGrowthWorkbenchCommand>
>;
type ParsedPublishWorkbenchCommand = NonNullable<
  ReturnType<typeof parsePublishWorkbenchCommand>
>;
type ParsedSearchWorkbenchCommand = NonNullable<
  ReturnType<typeof parseSearchWorkbenchCommand>
>;
type ParsedDeepSearchWorkbenchCommand = NonNullable<
  ReturnType<typeof parseDeepSearchWorkbenchCommand>
>;
type ParsedSiteSearchWorkbenchCommand = NonNullable<
  ReturnType<typeof parseSiteSearchWorkbenchCommand>
>;
type ParsedSummaryWorkbenchCommand = NonNullable<
  ReturnType<typeof parseSummaryWorkbenchCommand>
>;
type ParsedFileReadWorkbenchCommand = NonNullable<
  ReturnType<typeof parseFileReadWorkbenchCommand>
>;
type ParsedTranslationWorkbenchCommand = NonNullable<
  ReturnType<typeof parseTranslationWorkbenchCommand>
>;
type ParsedVideoWorkbenchCommand = NonNullable<
  ReturnType<typeof parseVideoWorkbenchCommand>
>;
type ParsedTypesettingWorkbenchCommand = NonNullable<
  ReturnType<typeof parseTypesettingWorkbenchCommand>
>;
type ParsedUploadWorkbenchCommand = NonNullable<
  ReturnType<typeof parseUploadWorkbenchCommand>
>;
type ParsedVoiceWorkbenchCommand = NonNullable<
  ReturnType<typeof parseVoiceWorkbenchCommand>
>;
type ParsedWritingWorkbenchCommand = NonNullable<
  ReturnType<typeof parseWritingWorkbenchCommand>
>;
type ParsedWebpageWorkbenchCommand = NonNullable<
  ReturnType<typeof parseWebpageWorkbenchCommand>
>;
type CompletedMentionUsage = {
  skillId: string;
  runnerType: ServiceSkillHomeItem["runnerType"];
  slotValues?: ServiceSkillSlotValues;
  launchUserInput?: string;
};
type CompletedMentionCommandUsage = {
  entryId: string;
  replayText?: string;
  slotValues?: ServiceSkillSlotValues;
};
type RewritePurpose = NonNullable<HandleSendOptions["purpose"]>;

const PROMPT_REWRITE_PURPOSES = new Set<RewritePurpose>([
  "content_review",
  "text_stylize",
  "style_rewrite",
  "style_audit",
]);

function waitForNextPaint(): Promise<void> {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

// normalizeOptionalText 已提取到 ./commands/commandRecentDefaults.ts

function hasHarnessLaunchRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  launchKey: "translation_skill_launch" | "resource_search_skill_launch",
): boolean {
  return Boolean(asRecord(asRecord(requestMetadata?.harness)?.[launchKey]));
}

function resolveServiceModelSendOverrides(params: {
  requestMetadata: Record<string, unknown> | undefined;
  purpose?: HandleSendOptions["purpose"];
  serviceModels?: ServiceModelsConfig;
}): Pick<HandleSendOptions, "providerOverride" | "modelOverride"> {
  const { requestMetadata, purpose, serviceModels } = params;

  const harnessMetadata = asRecord(requestMetadata?.harness);
  const serviceSceneLaunch =
    asRecord(harnessMetadata?.service_scene_launch) ??
    asRecord(harnessMetadata?.serviceSceneLaunch);
  const serviceSceneRun =
    asRecord(serviceSceneLaunch?.service_scene_run) ??
    asRecord(serviceSceneLaunch?.serviceSceneRun);

  let preference: ServiceModelPreferenceConfig | undefined;
  if (
    hasHarnessLaunchRequestMetadata(requestMetadata, "translation_skill_launch")
  ) {
    preference = serviceModels?.translation;
  } else if (
    hasHarnessLaunchRequestMetadata(
      requestMetadata,
      "resource_search_skill_launch",
    )
  ) {
    preference = serviceModels?.resource_prompt_rewrite;
  } else if (purpose && PROMPT_REWRITE_PURPOSES.has(purpose)) {
    preference = serviceModels?.prompt_rewrite;
  }

  const resolvedPreference = resolveServiceModelExecutionPreference(preference);
  const serviceScenePreferredProvider = normalizeOptionalText(
    typeof serviceSceneRun?.preferred_provider_id === "string"
      ? serviceSceneRun.preferred_provider_id
      : typeof serviceSceneRun?.preferredProviderId === "string"
        ? serviceSceneRun.preferredProviderId
        : undefined,
  );
  const serviceScenePreferredModel = normalizeOptionalText(
    typeof serviceSceneRun?.preferred_model_id === "string"
      ? serviceSceneRun.preferred_model_id
      : typeof serviceSceneRun?.preferredModelId === "string"
        ? serviceSceneRun.preferredModelId
        : typeof serviceSceneRun?.model === "string"
          ? serviceSceneRun.model
          : undefined,
  );

  return {
    providerOverride:
      resolvedPreference.providerOverride ??
      (serviceScenePreferredProvider && serviceScenePreferredModel
        ? serviceScenePreferredProvider
        : undefined),
    modelOverride:
      resolvedPreference.modelOverride ??
      (serviceScenePreferredProvider && serviceScenePreferredModel
        ? serviceScenePreferredModel
        : undefined),
  };
}

function readFastResponseMode(): AgentFastResponseMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  return window.localStorage.getItem(AGENT_FAST_RESPONSE_MODE_STORAGE_KEY) ===
    "off"
    ? "off"
    : "auto";
}

function withFastResponseMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  decision: AgentFastResponseRoutingDecision,
): Record<string, unknown> | undefined {
  const fastResponseMetadata = buildAgentFastResponseMetadata(decision);
  if (!fastResponseMetadata) {
    return requestMetadata;
  }

  const nextMetadata = { ...(requestMetadata || {}) };
  const harness = asRecord(nextMetadata.harness) || {};
  nextMetadata.harness = {
    ...harness,
    fast_response_routing: fastResponseMetadata,
  };
  return nextMetadata;
}

function shouldSkipBrowserAssistPrimeForPlainFirstTurn(params: {
  activeTheme: string;
  browserRequirementMatch: GeneralWorkbenchSendBoundaryState["browserRequirementMatch"];
  hasBoundSkillLaunch: boolean;
  imagesCount: number;
  messagesCount: number;
  sendOptions?: HandleSendOptions;
  sourceText: string;
}): boolean {
  if (
    params.activeTheme !== "general" ||
    params.browserRequirementMatch ||
    params.hasBoundSkillLaunch ||
    params.messagesCount > 0 ||
    params.imagesCount > 0 ||
    params.sendOptions?.purpose ||
    params.sendOptions?.skillRequest
  ) {
    return false;
  }

  const text = params.sourceText.trim();
  return Boolean(text && !text.startsWith("/") && !text.startsWith("@"));
}

function buildFastResponseAssistantDraft(
  decision: AgentFastResponseRoutingDecision,
): HandleSendOptions["assistantDraft"] {
  if (!decision.enabled) {
    return undefined;
  }

  const checkpoints = [
    "已启用短提示词快速响应",
    "仅当前轻量首轮请求生效",
    "复杂任务仍保留原模型与工具策略",
  ];

  return {
    initialRuntimeStatus: {
      phase: "routing",
      title: "快速响应已启用",
      detail: "这轮使用更短的系统提示降低首字等待。",
      checkpoints,
    },
    waitingRuntimeStatus: {
      phase: "routing",
      title: "快速响应处理中",
      detail: "已提交请求，正在等待首个模型事件。",
      checkpoints,
    },
  };
}

function readImageSkillLaunchContext(
  requestMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const harness = asRecord(requestMetadata?.harness);
  const launch =
    asRecord(harness?.image_skill_launch) ||
    asRecord(harness?.imageSkillLaunch);
  if (!launch) {
    return undefined;
  }

  return (
    asRecord(launch.image_task) ||
    asRecord(asRecord(launch.request_context)?.image_task) ||
    asRecord(asRecord(launch.requestContext)?.image_task)
  );
}

function readPositiveInteger(value: unknown): number | undefined {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.floor(numericValue)
    : undefined;
}

function normalizeImageWorkbenchMode(
  value: unknown,
): MessageImageWorkbenchPreview["mode"] {
  return value === "edit" || value === "variation" || value === "generate"
    ? value
    : "generate";
}

function buildImageWorkbenchAssistantDraft(
  requestMetadata: Record<string, unknown> | undefined,
): HandleSendOptions["assistantDraft"] {
  const imageTask = readImageSkillLaunchContext(requestMetadata);
  if (!imageTask) {
    return undefined;
  }

  const prompt =
    normalizeOptionalText(imageTask.prompt as string | undefined) ||
    normalizeOptionalText(imageTask.raw_text as string | undefined) ||
    normalizeOptionalText(imageTask.rawText as string | undefined);
  if (!prompt) {
    return undefined;
  }

  const modelName =
    normalizeOptionalText(imageTask.model as string | undefined) ||
    normalizeOptionalText(imageTask.model_name as string | undefined) ||
    normalizeOptionalText(imageTask.modelName as string | undefined) ||
    null;
  const expectedImageCount =
    readPositiveInteger(imageTask.count) ||
    readPositiveInteger(imageTask.image_count) ||
    1;
  const mode = normalizeImageWorkbenchMode(imageTask.mode);
  const layoutHint =
    normalizeOptionalText(imageTask.layout_hint as string | undefined) ||
    normalizeOptionalText(imageTask.layoutHint as string | undefined) ||
    null;
  const preview: MessageImageWorkbenchPreview = {
    taskId: `draft-image-${crypto.randomUUID()}`,
    prompt,
    mode,
    status: "running",
    projectId:
      normalizeOptionalText(imageTask.project_id as string | undefined) ||
      normalizeOptionalText(imageTask.projectId as string | undefined) ||
      null,
    contentId:
      normalizeOptionalText(imageTask.content_id as string | undefined) ||
      normalizeOptionalText(imageTask.contentId as string | undefined) ||
      null,
    providerName:
      normalizeOptionalText(imageTask.provider as string | undefined) ||
      normalizeOptionalText(imageTask.provider_name as string | undefined) ||
      normalizeOptionalText(imageTask.providerName as string | undefined) ||
      normalizeOptionalText(imageTask.provider_id as string | undefined) ||
      normalizeOptionalText(imageTask.providerId as string | undefined) ||
      null,
    modelName,
    imageCount: expectedImageCount,
    expectedImageCount,
    size:
      normalizeOptionalText(imageTask.size as string | undefined) || undefined,
    layoutHint,
    caption: null,
    phase: "preparing",
    statusMessage: null,
  };

  return {
    content: "",
    fallbackContent: buildImageTaskAssistantContent({
      prompt,
      mode,
      modelName,
    }),
    imageWorkbenchPreview: preview,
  };
}

function normalizeServiceSkillUsageSlotValue(
  value: unknown,
): string | undefined {
  if (typeof value === "string") {
    return normalizeOptionalText(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return undefined;
}

const MENTION_USAGE_REQUEST_FIELDS: Readonly<
  Record<string, readonly string[]>
> = {
  image_task: [
    "mode",
    "prompt",
    "count",
    "size",
    "aspect_ratio",
    "target_output_ref_id",
  ],
  cover_task: ["prompt", "title", "platform", "size", "style"],
  video_task: ["prompt", "duration", "aspect_ratio", "resolution"],
  broadcast_task: [
    "prompt",
    "content",
    "title",
    "audience",
    "tone",
    "duration_hint_minutes",
  ],
  resource_search_task: [
    "prompt",
    "title",
    "resource_type",
    "query",
    "usage",
    "count",
  ],
  transcription_task: [
    "prompt",
    "source_url",
    "source_path",
    "language",
    "output_format",
    "speaker_labels",
    "timestamps",
  ],
  research_request: [
    "prompt",
    "query",
    "site",
    "time_range",
    "depth",
    "focus",
    "output_format",
  ],
  deep_search_request: [
    "prompt",
    "query",
    "site",
    "time_range",
    "depth",
    "focus",
    "output_format",
  ],
  report_request: [
    "prompt",
    "query",
    "site",
    "time_range",
    "depth",
    "focus",
    "output_format",
  ],
  site_search_request: ["prompt", "site", "query", "limit"],
  pdf_read_request: [
    "prompt",
    "source_path",
    "source_url",
    "focus",
    "output_format",
  ],
  summary_request: [
    "prompt",
    "source_path",
    "content",
    "focus",
    "length",
    "style",
    "output_format",
  ],
  translation_request: [
    "prompt",
    "content",
    "source_language",
    "target_language",
    "style",
    "output_format",
  ],
  analysis_request: ["prompt", "content", "focus", "style", "output_format"],
  url_parse_task: ["prompt", "url", "extract_goal"],
  typesetting_task: ["prompt", "content", "target_platform"],
  presentation_request: [
    "prompt",
    "content",
    "deck_type",
    "style",
    "audience",
    "slide_count",
  ],
  form_request: [
    "prompt",
    "content",
    "form_type",
    "style",
    "audience",
    "field_count",
  ],
  webpage_request: ["prompt", "content", "page_type", "style", "tech_stack"],
  service_scene: [
    "user_input",
    "target_language",
    "voice_style",
    "platform",
    "account_list",
    "report_cadence",
    "alert_threshold",
  ],
  publish_command: [
    "prompt",
    "content",
    "platform_type",
    "platform_label",
    "intent",
  ],
};

function pickUsageSlotValues(
  record: Record<string, unknown>,
  fieldKeys: readonly string[],
): ServiceSkillSlotValues | undefined {
  const nextValues = Object.fromEntries(
    fieldKeys
      .map((fieldKey) => [
        fieldKey,
        normalizeServiceSkillUsageSlotValue(record[fieldKey]),
      ])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return Object.keys(nextValues).length > 0 ? nextValues : undefined;
}

function resolveLaunchScopedRequestContext(
  launchMetadata: Record<string, unknown>,
  requestContextKey: string,
): Record<string, unknown> | undefined {
  return (
    asRecord(launchMetadata[requestContextKey]) ||
    asRecord(asRecord(launchMetadata.request_context)?.[requestContextKey])
  );
}

function resolveMentionCommandUsageSlotValues(
  requestMetadata: Record<string, unknown> | undefined,
): ServiceSkillSlotValues | undefined {
  const harness = asRecord(requestMetadata?.harness);
  if (!harness) {
    return undefined;
  }

  const publishCommand = asRecord(harness.publish_command);
  if (publishCommand) {
    return pickUsageSlotValues(
      publishCommand,
      MENTION_USAGE_REQUEST_FIELDS.publish_command,
    );
  }

  const serviceSceneRun = asRecord(
    asRecord(harness.service_scene_launch)?.service_scene_run,
  );
  if (serviceSceneRun) {
    return pickUsageSlotValues(
      serviceSceneRun,
      MENTION_USAGE_REQUEST_FIELDS.service_scene,
    );
  }

  for (const launch of MODEL_SKILL_LAUNCH_DESCRIPTORS) {
    const launchMetadata = asRecord(harness[launch.launchKey]);
    if (!launchMetadata) {
      continue;
    }

    const scopedRequestContext = resolveLaunchScopedRequestContext(
      launchMetadata,
      launch.requestContextKey,
    );
    if (!scopedRequestContext) {
      continue;
    }

    return pickUsageSlotValues(
      scopedRequestContext,
      MENTION_USAGE_REQUEST_FIELDS[launch.requestContextKey],
    );
  }

  return undefined;
}

function resolveMentionCommandUsageLaunchUserInput(
  requestMetadata: Record<string, unknown> | undefined,
): string | undefined {
  const harness = asRecord(requestMetadata?.harness);
  if (!harness) {
    return undefined;
  }

  const publishCommand = asRecord(harness.publish_command);
  if (publishCommand) {
    return normalizeOptionalText(publishCommand.prompt as string | undefined);
  }

  const serviceSceneRun = asRecord(
    asRecord(harness.service_scene_launch)?.service_scene_run,
  );
  if (serviceSceneRun) {
    return normalizeOptionalText(
      serviceSceneRun.user_input as string | undefined,
    );
  }

  for (const launch of MODEL_SKILL_LAUNCH_DESCRIPTORS) {
    const launchMetadata = asRecord(harness[launch.launchKey]);
    if (!launchMetadata) {
      continue;
    }

    const scopedRequestContext = resolveLaunchScopedRequestContext(
      launchMetadata,
      launch.requestContextKey,
    );
    if (!scopedRequestContext) {
      continue;
    }

    return normalizeOptionalText(
      ((scopedRequestContext.user_input ?? scopedRequestContext.prompt) as
        | string
        | undefined) ?? undefined,
    );
  }

  return undefined;
}

function resolveImageMentionCommandKey(
  parsedCommand: ParsedImageWorkbenchCommand,
): string | null {
  return normalizeOptionalText(parsedCommand.commandKey) ?? null;
}

const MAX_MENTION_COMMAND_REPLAY_TEXT_LENGTH = 400;

function normalizeMentionCommandReplayText(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, MAX_MENTION_COMMAND_REPLAY_TEXT_LENGTH).trim();
}

function resolveMentionCommandReplayText(
  parsedCommand: {
    body: string;
  },
  commandKey?: string,
): string | undefined {
  return normalizeMentionCommandReplayText(
    buildMentionCommandReplayText({
      commandKey,
      parsedCommand,
    }),
  );
}

function resolveBareMentionCommandPrefillSourceText(
  rawText: string,
  mentionCommandPrefixKeyMap: Map<string, string>,
): string | undefined {
  const matched = resolveMentionCommandPrefixMatch(
    rawText,
    mentionCommandPrefixKeyMap,
  );
  if (!matched || matched.hasBody) {
    return undefined;
  }

  const recentRecord = getMentionEntryUsageMap().get(
    getMentionEntryUsageRecordKey("builtin_command", matched.commandKey),
  );
  if (!recentRecord) {
    return undefined;
  }

  const replayText = resolveMentionCommandPrefillReplayText({
    commandKey: matched.commandKey,
    replayText: recentRecord.replayText,
    slotValues: recentRecord.slotValues,
  });
  if (!replayText) {
    return undefined;
  }

  return `${matched.commandPrefix} ${replayText}`;
}

// 命令 recent defaults 合并函数已提取到 ./commands/commandRecentDefaults.ts

// build*DispatchBody 函数已提取到 ./commands/dispatchBodyBuilders.ts

function resolveMentionCommandUsage(params: {
  commandKey: string;
  serviceSkills: ServiceSkillHomeItem[];
  requestMetadata?: Record<string, unknown>;
  mentionCommandSkillIdMap: Map<string, string>;
}): CompletedMentionUsage | null {
  const normalizedCommandKey = params.commandKey.trim();
  if (!normalizedCommandKey) {
    return null;
  }

  const boundSkillId =
    params.mentionCommandSkillIdMap.get(normalizedCommandKey);
  if (!boundSkillId) {
    return null;
  }

  const matchedSkill = params.serviceSkills.find((skill) => {
    const normalizedSkillId = skill.id.trim();
    const normalizedSkillKey = skill.skillKey?.trim();
    return (
      normalizedSkillId === boundSkillId || normalizedSkillKey === boundSkillId
    );
  });

  if (!matchedSkill) {
    return null;
  }

  const slotValues = resolveMentionCommandUsageSlotValues(
    params.requestMetadata,
  );
  const launchUserInput = resolveMentionCommandUsageLaunchUserInput(
    params.requestMetadata,
  );

  return {
    skillId: matchedSkill.id,
    runnerType: matchedSkill.runnerType,
    ...(slotValues ? { slotValues } : {}),
    ...(launchUserInput ? { launchUserInput } : {}),
  };
}

function buildFileReadSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedFileReadWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const sourcePath = params.parsedCommand.sourcePath?.trim();
  if (!sourcePath) {
    toast.error("请先提供文件路径后再读取");
    return null;
  }

  const prompt =
    params.parsedCommand.prompt.trim() ||
    params.parsedCommand.focus?.trim() ||
    "请阅读这个文件并提炼关键信息";
  const runtimeContract = resolveTextTransformRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_file_read_command",
  );

  return {
    kind: "summary_request",
    summary_request: {
      raw_text: params.rawText,
      prompt,
      source_path: sourcePath,
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

function buildVideoSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedVideoWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> | null {
  if (!params.projectId) {
    toast.error("请先选择项目后再开始生成视频");
    return null;
  }

  const prompt = params.parsedCommand.prompt.trim();
  if (!prompt) {
    toast.error("请补充清晰的视频描述后再提交");
    return null;
  }

  return {
    kind: "video_task",
    video_task: {
      prompt,
      raw_text: params.rawText,
      duration: params.parsedCommand.duration,
      aspect_ratio: params.parsedCommand.aspectRatio,
      resolution: params.parsedCommand.resolution,
      project_id: params.projectId,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: "at_video_command",
    },
  };
}

function buildCoverSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedCoverWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> | null {
  const prompt =
    params.parsedCommand.prompt.trim() ||
    params.parsedCommand.title?.trim() ||
    "";
  if (!prompt) {
    toast.error("请补充封面主题或视觉描述后再提交");
    return null;
  }

  return {
    kind: "cover_task",
    cover_task: {
      raw_text: params.rawText,
      prompt,
      title: params.parsedCommand.title,
      platform: params.parsedCommand.platform,
      size: params.parsedCommand.size,
      style: params.parsedCommand.style,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: "at_cover_command",
    },
  };
}

function buildResearchSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedSearchWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的搜索主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    WEB_RESEARCH_DEFAULT_ENTRY_SOURCE,
  );

  return {
    kind: "research_request",
    research_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: params.parsedCommand.depth,
      focus: params.parsedCommand.focus,
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

function buildDeepSearchSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedDeepSearchWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的深搜主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_deep_search_command",
  );

  return {
    kind: "deep_search_request",
    deep_search_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: "deep",
      focus: params.parsedCommand.focus,
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

function buildReportSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedReportWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的研报主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_report_command",
  );

  return {
    kind: "report_request",
    report_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: "deep",
      focus: params.parsedCommand.focus,
      output_format: params.parsedCommand.outputFormat || "研究报告",
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

function buildCompetitorSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedCompetitorWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的竞品分析主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_competitor_command",
  );

  return {
    kind: "report_request",
    report_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: "deep",
      focus: params.parsedCommand.focus,
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

function buildSiteSearchSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedSiteSearchWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query && !params.parsedCommand.site?.trim()) {
    toast.error("请先补充站点和检索主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_site_search_command",
  );

  return {
    kind: "site_search_request",
    site_search_request: {
      raw_text: params.rawText,
      prompt: prompt || query || params.parsedCommand.site,
      site: params.parsedCommand.site,
      query: query || undefined,
      limit: params.parsedCommand.limit,
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

function buildPdfReadSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedPdfWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const sourcePath = params.parsedCommand.sourcePath?.trim();
  const sourceUrl = params.parsedCommand.sourceUrl?.trim();
  if (!sourcePath && !sourceUrl) {
    toast.error("请先提供 PDF 文件路径，或先把 PDF 导入工作区后再试");
    return null;
  }

  const prompt =
    params.parsedCommand.prompt.trim() ||
    params.parsedCommand.focus?.trim() ||
    "请阅读这份 PDF 并提炼关键信息";
  const runtimeContract = resolvePdfExtractRuntimeContractBinding();
  const entrySource =
    runtimeContract.boundEntrySources[0] || PDF_EXTRACT_DEFAULT_ENTRY_SOURCE;

  return {
    kind: "pdf_read_request",
    pdf_read_request: {
      raw_text: params.rawText,
      prompt,
      source_path: sourcePath || undefined,
      source_url: sourceUrl || undefined,
      focus: params.parsedCommand.focus,
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

// matchesVoice/GrowthCommandSkill + resolve*CommandServiceSkill 已提取到 ./commands/serviceSkillMatch.ts

interface VoiceSkillLaunchRequest {
  dispatchText: string;
  requestContext: Record<string, unknown>;
}

async function resolveGrowthSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedGrowthWorkbenchCommand;
  serviceSkills: ServiceSkillHomeItem[];
  projectId?: string | null;
  contentId?: string | null;
}): Promise<VoiceSkillLaunchRequest | null> {
  const skill = resolveGrowthCommandServiceSkill(params.serviceSkills);
  if (!skill) {
    toast.error("当前未安装可用的增长跟踪技能，请先同步技能目录后再试");
    return null;
  }

  const prompt = params.parsedCommand.prompt.trim();
  const slotValues: ServiceSkillSlotValues = {
    ...(params.parsedCommand.platformType
      ? {
          platform: params.parsedCommand.platformType,
        }
      : {}),
    ...(params.parsedCommand.accountList
      ? {
          account_list: params.parsedCommand.accountList,
        }
      : {}),
    ...(params.parsedCommand.reportCadence
      ? {
          report_cadence: params.parsedCommand.reportCadence,
        }
      : {}),
    ...(params.parsedCommand.alertThreshold
      ? {
          alert_threshold: params.parsedCommand.alertThreshold,
        }
      : {}),
  };

  if (!slotValues.account_list && !prompt) {
    toast.error("请至少补充目标账号或增长目标后再提交");
    return null;
  }

  let resolvedProjectId = normalizeOptionalText(params.projectId);
  if (!resolvedProjectId && skill.readinessRequirements?.requiresProject) {
    try {
      const defaultProject = await getOrCreateDefaultProject();
      resolvedProjectId = normalizeOptionalText(defaultProject?.id);
    } catch {
      resolvedProjectId = undefined;
    }
  }

  if (!resolvedProjectId && skill.readinessRequirements?.requiresProject) {
    toast.error("请先选择项目后再开始增长跟踪");
    return null;
  }

  return {
    dispatchText: composeServiceSkillPrompt({
      skill,
      slotValues,
      userInput: prompt || undefined,
    }),
    requestContext: {
      kind: "local_service_skill",
      service_scene_run: {
        raw_text: params.rawText,
        user_input: prompt || undefined,
        entry_id: "command:growth_runtime",
        scene_key: "growth_runtime",
        command_prefix: params.parsedCommand.trigger,
        linked_skill_id: skill.id,
        skill_id: skill.id,
        skill_key: skill.skillKey || undefined,
        skill_title: skill.title,
        skill_summary: skill.summary,
        runner_type: skill.runnerType,
        execution_kind: normalizeLocalServiceSkillExecutionKind(
          skill.defaultExecutorBinding,
        ),
        execution_location: "client_default",
        project_id: resolvedProjectId,
        content_id: normalizeOptionalText(params.contentId),
        entry_source: "at_growth_command",
        platform: params.parsedCommand.platformType,
        platform_label: params.parsedCommand.platformLabel,
        account_list: params.parsedCommand.accountList,
        report_cadence: params.parsedCommand.reportCadence,
        alert_threshold: params.parsedCommand.alertThreshold,
        slot_values:
          Object.keys(slotValues).length > 0 ? slotValues : undefined,
      },
    },
  };
}

async function resolveVoiceSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedVoiceWorkbenchCommand;
  serviceSkills: ServiceSkillHomeItem[];
  projectId?: string | null;
  contentId?: string | null;
  voicePreference?: {
    preferredProviderId?: string;
    preferredModelId?: string;
    allowFallback?: boolean;
  } | null;
}): Promise<VoiceSkillLaunchRequest | null> {
  const skill = resolveVoiceCommandServiceSkill(params.serviceSkills);
  if (!skill) {
    toast.error("当前未安装可用的配音技能，请先同步技能目录后再试");
    return null;
  }

  const prompt =
    params.parsedCommand.prompt.trim() || params.parsedCommand.body.trim();
  if (!prompt) {
    toast.error("请补充清晰的配音要求后再提交");
    return null;
  }

  let resolvedProjectId = normalizeOptionalText(params.projectId);
  if (!resolvedProjectId && skill.readinessRequirements?.requiresProject) {
    try {
      const defaultProject = await getOrCreateDefaultProject();
      resolvedProjectId = normalizeOptionalText(defaultProject?.id);
    } catch {
      resolvedProjectId = undefined;
    }
  }

  if (!resolvedProjectId && skill.readinessRequirements?.requiresProject) {
    toast.error("请先选择项目后再开始配音");
    return null;
  }

  const slotValues: ServiceSkillSlotValues = {
    ...(params.parsedCommand.targetLanguage
      ? {
          target_language: params.parsedCommand.targetLanguage,
        }
      : {}),
    ...(params.parsedCommand.voiceStyle
      ? {
          voice_style: params.parsedCommand.voiceStyle,
        }
      : {}),
  };
  const resolvedVoicePreference = normalizeMediaGenerationPreference(
    params.voicePreference,
  );
  const runtimeContract = resolveVoiceGenerationRuntimeContractBinding();
  const entrySource =
    runtimeContract.boundEntrySources[0] ||
    VOICE_GENERATION_DEFAULT_ENTRY_SOURCE;

  return {
    dispatchText: composeServiceSkillPrompt({
      skill,
      slotValues,
      userInput: prompt,
    }),
    requestContext: {
      kind: "local_service_skill",
      service_scene_run: {
        raw_text: params.rawText,
        user_input: prompt,
        entry_id: "command:voice_runtime",
        scene_key: "voice_runtime",
        command_prefix: params.parsedCommand.trigger,
        linked_skill_id: skill.id,
        skill_id: skill.id,
        skill_key: skill.skillKey || undefined,
        skill_title: skill.title,
        skill_summary: skill.summary,
        runner_type: skill.runnerType,
        execution_kind: normalizeLocalServiceSkillExecutionKind(
          skill.defaultExecutorBinding,
        ),
        execution_location: "client_default",
        project_id: resolvedProjectId,
        content_id: normalizeOptionalText(params.contentId),
        entry_source: entrySource,
        modality_contract_key: runtimeContract.contractKey,
        modality: runtimeContract.modality,
        required_capabilities: runtimeContract.requiredCapabilities,
        routing_slot: runtimeContract.routingSlot,
        runtime_contract: runtimeContract.runtimeContract,
        target_language: params.parsedCommand.targetLanguage,
        voice_style: params.parsedCommand.voiceStyle,
        slot_values:
          Object.keys(slotValues).length > 0 ? slotValues : undefined,
        preferred_provider_id: resolvedVoicePreference.preferredProviderId,
        preferred_model_id: resolvedVoicePreference.preferredModelId,
        allow_fallback: resolvedVoicePreference.allowFallback ?? true,
      },
    },
  };
}

interface UseWorkspaceSendActionsParams {
  input: string;
  setInput: SetStringState;
  mentionedCharacters: Character[];
  setMentionedCharacters: Dispatch<SetStateAction<Character[]>>;
  chatToolPreferences: ChatToolPreferences;
  setChatToolPreferences: Dispatch<SetStateAction<ChatToolPreferences>>;
  serviceSkills: ServiceSkillHomeItem[];
  activeTheme: string;
  mappedTheme: ThemeType;
  isThemeWorkbench: boolean;
  contextWorkspace: ContextWorkspaceSummary;
  projectId?: string | null;
  projectRootPath?: string | null;
  sessionId?: string | null;
  executionStrategy: CurrentExecutionStrategy;
  accessMode?: AgentAccessMode;
  providerType?: string | null;
  preferredTeamPresetId?: string | null;
  selectedTeam?: TeamDefinition | null;
  selectedTeamLabel?: string;
  selectedTeamSummary?: string;
  teamMemoryShadowSnapshot?: TeamMemorySnapshot | null;
  currentGateKey: string;
  themeWorkbenchActiveQueueTitle?: string;
  contentId?: string | null;
  browserAssistProfileKey?: string | null;
  browserAssistPreferredBackend?:
    | "aster_compat"
    | "lime_extension_bridge"
    | "cdp_direct"
    | null;
  browserAssistAutoLaunch?: boolean | null;
  workspaceRequestMetadataBase?: Record<string, unknown>;
  savedSoulArtifactVoiceGenerationBrief?: Record<string, unknown> | null;
  soulArtifactVoiceEnabledForTurn?: boolean;
  serviceModels?: ServiceModelsConfig;
  agentResponseLanguage?: string | null;
  messages: Message[];
  setChatMessages: Dispatch<SetStateAction<Message[]>>;
  bootstrapDispatchPreview?: InitialDispatchPreviewSnapshot | null;
  sendMessage: SendMessageFn;
  resolveSendBoundary: (input: {
    sourceText: string;
    sendOptions?: HandleSendOptions;
  }) => GeneralWorkbenchSendBoundaryState;
  finalizeAfterSendSuccess: (
    boundary: GeneralWorkbenchSendBoundaryState,
  ) => void;
  rollbackAfterSendFailure: (
    boundary: GeneralWorkbenchSendBoundaryState,
  ) => void;
  prepareRuntimeTeamBeforeSend: UseRuntimeTeamFormationResult["prepareRuntimeTeamBeforeSend"];
  ensureBrowserAssistCanvas: (
    target: string,
    options?: EnsureBrowserAssistCanvasOptions,
  ) => Promise<boolean>;
  handleAutoLaunchMatchedSiteSkill: (
    match: AutoMatchedSiteSkill<ServiceSkillHomeItem>,
  ) => Promise<void>;
  openRuntimeSceneGate?: (
    request: RuntimeSceneGateRequest,
  ) => Promise<void> | void;
  ensureSessionForCommandMetadata?: (options?: {
    skipSessionRestore?: boolean;
    skipSessionStartHooks?: boolean;
  }) => Promise<string | null>;
  resolveImageWorkbenchSkillRequest: (input: {
    rawText: string;
    parsedCommand: ParsedImageWorkbenchCommand;
    images: MessageImage[];
    sessionIdOverride?: string | null;
    entrySource?: string;
  }) => ImageWorkbenchSkillRequest | null;
}

interface WorkspaceResolvedSendState {
  sourceText: string;
  dispatchText: string;
  sendBoundary: GeneralWorkbenchSendBoundaryState;
  effectiveToolPreferences: ChatToolPreferences;
  effectiveWebSearch?: boolean;
  effectiveSearchMode?: AgentRuntimeWebSearchMode;
  submissionPreviewKey: string;
}

interface WorkspaceSendPlan extends WorkspaceResolvedSendState {
  text: string;
  images: MessageImage[];
  sendExecutionStrategy?: CurrentExecutionStrategy;
  autoContinuePayload?: AutoContinueRequestPayload;
  sendOptions?: HandleSendOptions;
  completedMentionCommandUsage: CompletedMentionCommandUsage | null;
  completedMentionUsage: CompletedMentionUsage | null;
  completedSlashUsage?: CompletedInputCapabilitySlashUsage | null;
}

interface WorkspaceLocalConfirmationPlan {
  sourceText: string;
  images: MessageImage[];
  sendBoundary: GeneralWorkbenchSendBoundaryState;
  submissionPreviewKey: string | null;
  confirmation: string;
  pendingIntent?: PendingPlainInputIntent;
}

interface PendingPlainInputIntent {
  commandKey: string;
  intentId: string;
  sourceText: string;
  images: MessageImage[];
}

type WorkspaceSendResolution =
  | {
      kind: "done";
      result: boolean;
    }
  | {
      kind: "local_confirmation";
      plan: WorkspaceLocalConfirmationPlan;
    }
  | {
      kind: "ready";
      plan: WorkspaceSendPlan;
    };

type AgentWorkspaceTranslator = (
  key: string,
  options?: Record<string, unknown>,
) => string;

async function resolveSkillInstallPromptConfirmation(
  instruction: SkillInstallPromptInstruction,
  translate: AgentWorkspaceTranslator,
): Promise<string> {
  try {
    const result = await installSkillFromPromptInstruction(instruction, "lime");
    return translate("agentChat.skillInstallPrompt.installedConfirmation", {
      skill: result.directory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|已存在/i.test(message)) {
      return translate(
        "agentChat.skillInstallPrompt.alreadyInstalledConfirmation",
        {
          skill: instruction.skillName,
        },
      );
    }
    return translate("agentChat.skillInstallPrompt.failedConfirmation", {
      skill: instruction.skillName,
      error: message,
    });
  }
}

function isImageGenerationPlainInputIntent(
  intent: Pick<PendingPlainInputIntent, "commandKey" | "intentId">,
): boolean {
  const commandKey = intent.commandKey.trim().toLowerCase();
  const intentId = intent.intentId.trim().toLowerCase();
  return commandKey.includes("image") || intentId.includes("image");
}

function isPlainInputIntentAffirmativeReply(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[。.!！?？,，\s]/g, "");
  if (!normalized || normalized.length > 32) {
    return false;
  }

  if (
    /^(是|是的|好|好的|可以|确认|确认生成|要|要的|嗯|嗯嗯|对|对的)$/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (/(调用画图|直接生成|现在生成|开始生成|开始画|画吧|生成吧)/.test(normalized)) {
    return true;
  }

  return /^(y|yes|ok|okay|sure|goahead|generate|create|createit|start)$/.test(
    normalized,
  );
}

export type WorkspaceHandleSend = (
  images?: MessageImage[],
  webSearch?: boolean,
  thinking?: boolean,
  textOverride?: string,
  sendExecutionStrategy?: CurrentExecutionStrategy,
  autoContinuePayload?: AutoContinueRequestPayload,
  sendOptions?: HandleSendOptions,
) => Promise<boolean>;

export function useWorkspaceSendActions({
  input,
  setInput,
  mentionedCharacters,
  setMentionedCharacters,
  chatToolPreferences,
  setChatToolPreferences,
  serviceSkills,
  activeTheme,
  mappedTheme,
  isThemeWorkbench,
  contextWorkspace,
  projectId,
  sessionId,
  executionStrategy,
  accessMode: _accessMode,
  providerType,
  preferredTeamPresetId,
  selectedTeam,
  selectedTeamLabel,
  selectedTeamSummary,
  teamMemoryShadowSnapshot,
  currentGateKey,
  themeWorkbenchActiveQueueTitle,
  contentId,
  browserAssistProfileKey,
  browserAssistPreferredBackend,
  browserAssistAutoLaunch,
  workspaceRequestMetadataBase,
  savedSoulArtifactVoiceGenerationBrief,
  soulArtifactVoiceEnabledForTurn,
  serviceModels,
  agentResponseLanguage,
  messages,
  setChatMessages,
  bootstrapDispatchPreview,
  sendMessage,
  resolveSendBoundary,
  finalizeAfterSendSuccess,
  rollbackAfterSendFailure,
  prepareRuntimeTeamBeforeSend: _prepareRuntimeTeamBeforeSend,
  ensureBrowserAssistCanvas,
  handleAutoLaunchMatchedSiteSkill,
  openRuntimeSceneGate,
  ensureSessionForCommandMetadata,
  resolveImageWorkbenchSkillRequest,
}: UseWorkspaceSendActionsParams) {
  const { t } = useTranslation("agent");
  const messagesCount = messages.length;
  const [runtimeTeamDispatchPreview, setRuntimeTeamDispatchPreview] =
    useState<RuntimeTeamDispatchPreviewSnapshot | null>(null);
  const [submissionPreview, setSubmissionPreview] =
    useState<SubmissionPreviewSnapshot | null>(null);
  const [isPreparingSend, setIsPreparingSend] = useState(false);
  const isPreparingSendRef = useRef(false);
  const pendingPlainInputIntentRef = useRef<PendingPlainInputIntent | null>(
    null,
  );
  const { mediaDefaults } = useGlobalMediaGenerationDefaults();
  const translateAgentWorkspace = useCallback<AgentWorkspaceTranslator>(
    (key, options) => {
      const translate = t as unknown as (
        key: string,
        options?: Record<string, unknown>,
      ) => string;
      return String(translate(key, options));
    },
    [t],
  );
  const {
    mentionAgentTurnRouteMap,
    mentionCommandSkillIdMap,
    mentionCommandPrefixKeyMap,
  } = useRuntimeMentionCommandCatalog();
  const clearRuntimeTeamDispatchPreview = useCallback(() => {
    setRuntimeTeamDispatchPreview(null);
  }, []);
  const teamDispatchPreviewState = useMemo(
    () => resolveRuntimeTeamDispatchPreviewState(runtimeTeamDispatchPreview),
    [runtimeTeamDispatchPreview],
  );
  const runtimeTeamDispatchPreviewMessages = useMemo(
    () =>
      runtimeTeamDispatchPreview
        ? buildRuntimeTeamDispatchPreviewMessages(runtimeTeamDispatchPreview)
        : [],
    [runtimeTeamDispatchPreview],
  );
  const resourcePromptRewritePreference =
    serviceModels?.resource_prompt_rewrite;
  const submissionPreviewMessages = useMemo(
    () =>
      messagesCount === 0 && submissionPreview
        ? buildSubmissionPreviewMessages(submissionPreview)
        : [],
    [messagesCount, submissionPreview],
  );
  const bootstrapDispatchPreviewMessages = useMemo(
    () =>
      bootstrapDispatchPreview
        ? buildInitialDispatchPreviewMessages(bootstrapDispatchPreview)
        : [],
    [bootstrapDispatchPreview],
  );
  const displayMessages = useMemo(() => {
    if (runtimeTeamDispatchPreviewMessages.length > 0) {
      return [...messages, ...runtimeTeamDispatchPreviewMessages];
    }

    if (submissionPreviewMessages.length > 0) {
      return submissionPreviewMessages;
    }

    if (messagesCount === 0 && bootstrapDispatchPreviewMessages.length > 0) {
      return bootstrapDispatchPreviewMessages;
    }

    return messages;
  }, [
    bootstrapDispatchPreviewMessages,
    messages,
    messagesCount,
    runtimeTeamDispatchPreviewMessages,
    submissionPreviewMessages,
  ]);

  useEffect(() => {
    clearRuntimeTeamDispatchPreview();
  }, [clearRuntimeTeamDispatchPreview, sessionId]);

  useEffect(() => {
    if (!runtimeTeamDispatchPreview) {
      return;
    }

    if (messagesCount > runtimeTeamDispatchPreview.baseMessageCount) {
      clearRuntimeTeamDispatchPreview();
    }
  }, [
    clearRuntimeTeamDispatchPreview,
    messagesCount,
    runtimeTeamDispatchPreview,
  ]);

  const resolveSendExecutionPlan = useCallback(
    async (
      images?: MessageImage[],
      _webSearch?: boolean,
      _thinking?: boolean,
      textOverride?: string,
      sendExecutionStrategy?: CurrentExecutionStrategy,
      autoContinuePayload?: AutoContinueRequestPayload,
      sendOptions?: HandleSendOptions,
    ): Promise<WorkspaceSendResolution> => {
      const planStartedAt = Date.now();
      const inputCapabilityDispatch = resolveInputCapabilityDispatchContext({
        sourceText: textOverride ?? input,
        capabilityRoute: sendOptions?.capabilityRoute,
        displayContent: sendOptions?.displayContent,
      });
      let effectiveSendExecutionStrategy = normalizeExecutionStrategy(
        sendExecutionStrategy ?? executionStrategy,
      );
      let sourceText = inputCapabilityDispatch.sourceText;
      const pendingPlainInputIntent = pendingPlainInputIntentRef.current;
      if (
        pendingPlainInputIntent &&
        !sendOptions?.purpose &&
        isImageGenerationPlainInputIntent(pendingPlainInputIntent)
      ) {
        if (isPlainInputIntentAffirmativeReply(sourceText)) {
          const confirmationText = sourceText;
          const pendingSourceText = pendingPlainInputIntent.sourceText.trim();
          sourceText = pendingSourceText
            ? `@配图 ${pendingSourceText}`
            : sourceText;
          images =
            images && images.length > 0
              ? images
              : pendingPlainInputIntent.images;
          sendOptions = {
            ...(sendOptions || {}),
            displayContent:
              sendOptions?.displayContent ?? confirmationText.trim(),
          };
          pendingPlainInputIntentRef.current = null;
        } else if (sourceText.trim()) {
          pendingPlainInputIntentRef.current = null;
        }
      }
      logAgentDebug("WorkspaceSend", "plan.start", {
        hasAutoContinue: Boolean(autoContinuePayload?.enabled),
        hasPurpose: Boolean(sendOptions?.purpose),
        imagesCount: images?.length ?? 0,
        messagesCount,
        sourceTextLength: sourceText.trim().length,
      });
      if (!sourceText.trim() && (!images || images.length === 0)) {
        logAgentDebug("WorkspaceSend", "plan.empty", {
          durationMs: Date.now() - planStartedAt,
        });
        return { kind: "done", result: false };
      }
      let effectiveImages = images || [];
      const sendBoundary = resolveSendBoundary({
        sourceText,
        sendOptions,
      });
      sourceText = sendBoundary.sourceText;
      sourceText =
        resolveBareMentionCommandPrefillSourceText(
          sourceText,
          mentionCommandPrefixKeyMap,
        ) || sourceText;
      const mentionUsageMap = getMentionEntryUsageMap();
      type MergeableMentionParsedCommand = Parameters<
        typeof resolveMentionCommandMergedPrefillReplayText
      >[0]["parsedCommand"];
      const maybeApplyMentionCommandRecentDefaults = <
        T extends MergeableMentionParsedCommand & {
          rawText: string;
        },
      >(params: {
        rawText: string;
        commandKey: string;
        parsedCommand: T;
        reparse: (rawText: string) => T | null;
      }): { rawText: string; parsedCommand: T } => {
        const recentRecord = mentionUsageMap.get(
          getMentionEntryUsageRecordKey("builtin_command", params.commandKey),
        );
        if (!recentRecord?.slotValues) {
          return {
            rawText: params.rawText,
            parsedCommand: params.parsedCommand,
          };
        }

        const nextReplayText = resolveMentionCommandMergedPrefillReplayText({
          commandKey: params.commandKey,
          parsedCommand: params.parsedCommand,
          slotValues: recentRecord.slotValues,
        });
        const currentReplayText = resolveMentionCommandReplayText(
          params.parsedCommand,
          params.commandKey,
        );
        if (!nextReplayText || nextReplayText === currentReplayText) {
          return {
            rawText: params.rawText,
            parsedCommand: params.parsedCommand,
          };
        }

        const commandPrefixMatch = resolveMentionCommandPrefixMatch(
          params.rawText,
          mentionCommandPrefixKeyMap,
        );
        if (!commandPrefixMatch) {
          return {
            rawText: params.rawText,
            parsedCommand: params.parsedCommand,
          };
        }

        const nextRawText = `${commandPrefixMatch.commandPrefix} ${nextReplayText}`;
        const reparsed = params.reparse(nextRawText);
        if (!reparsed) {
          return {
            rawText: params.rawText,
            parsedCommand: params.parsedCommand,
          };
        }

        return {
          rawText: nextRawText,
          parsedCommand: reparsed,
        };
      };
      let dispatchText = sourceText;

      let effectiveToolPreferences =
        sendOptions?.toolPreferencesOverride ?? chatToolPreferences;
      const { browserRequirementMatch } = sendBoundary;
      const mergedLaunchRequestMetadata = {
        ...(workspaceRequestMetadataBase || {}),
        ...(sendOptions?.requestMetadata || {}),
      };
      let hasBoundSkillLaunch =
        hasServiceSkillLaunchRequestMetadata(mergedLaunchRequestMetadata) ||
        hasModelSkillLaunchRequestMetadata(mergedLaunchRequestMetadata);
      let effectiveWebSearch =
        browserRequirementMatch &&
        browserRequirementMatch.requirement !== "optional"
          ? false
          : undefined;
      const effectiveSearchMode =
        browserRequirementMatch &&
        browserRequirementMatch.requirement !== "optional"
          ? "disabled"
          : sendOptions?.searchMode;

      const preparedActiveContextPrompt =
        contextWorkspace.enabled && !contextWorkspace.activeContextPrompt.trim()
          ? contextWorkspace.prepareActiveContextPrompt().then(
              (value) => ({
                ok: true as const,
                value,
              }),
              (error) => ({
                ok: false as const,
                error,
              }),
            )
          : null;

      let commandSessionId: string | null | undefined;
      let commandSessionPromise: Promise<string | null> | null = null;
      let pendingCommandSessionBinding: PendingCommandSessionBinding | null =
        extractBoundSessionRequestContext(mergedLaunchRequestMetadata);
      let completedMentionCommandUsage:
        | WorkspaceSendPlan["completedMentionCommandUsage"]
        | null = null;
      let completedMentionUsage: WorkspaceSendPlan["completedMentionUsage"] =
        null;
      let completedSlashUsage: WorkspaceSendPlan["completedSlashUsage"] =
        inputCapabilityDispatch.completedSlashUsage;
      sendOptions = inputCapabilityDispatch.capabilityRoute
        ? {
            ...(sendOptions || {}),
            capabilityRoute: inputCapabilityDispatch.capabilityRoute,
          }
        : sendOptions;
      let submissionPreviewKey: string | null = null;
      const ensureSubmissionPreview = (previewImages = effectiveImages) => {
        if (submissionPreviewKey) {
          return submissionPreviewKey;
        }

        submissionPreviewKey = crypto.randomUUID();
        setSubmissionPreview(
          createSubmissionPreviewSnapshot({
            key: submissionPreviewKey,
            prompt: sourceText,
            displayContent: sendOptions?.displayContent,
            inputCapabilityRoute: sendOptions?.capabilityRoute,
            images: previewImages,
            executionStrategy: effectiveSendExecutionStrategy,
          }),
        );
        return submissionPreviewKey;
      };
      const clearSubmissionPreview = () => {
        if (!submissionPreviewKey) {
          return;
        }
        const previewKey = submissionPreviewKey;
        setSubmissionPreview((current) =>
          current?.key === previewKey ? null : current,
        );
      };
      const resolveCommandSessionEnsureOptions = () => ({
        skipSessionRestore: sendOptions?.skipSessionRestore === true,
        skipSessionStartHooks: sendOptions?.skipSessionStartHooks === true,
      });
      const primeCommandSessionId = (
        reason = "unspecified",
        ensureOptions = resolveCommandSessionEnsureOptions(),
      ) => {
        if (commandSessionId !== undefined) {
          logAgentDebug("WorkspaceSend", "primeSession.reuseResolved", {
            reason,
            sessionId: commandSessionId,
            skipSessionRestore: ensureOptions.skipSessionRestore,
            skipSessionStartHooks: ensureOptions.skipSessionStartHooks,
          });
          return Promise.resolve(commandSessionId);
        }
        if (!commandSessionPromise) {
          const primeStartedAt = Date.now();
          logAgentDebug("WorkspaceSend", "primeSession.start", {
            reason,
            skipSessionRestore: ensureOptions.skipSessionRestore,
            skipSessionStartHooks: ensureOptions.skipSessionStartHooks,
          });
          commandSessionPromise = (async () => {
            try {
              const resolvedSessionId =
                await ensureSessionForCommandMetadata?.(ensureOptions);
              commandSessionId = resolvedSessionId?.trim() || null;
              logAgentDebug("WorkspaceSend", "primeSession.done", {
                durationMs: Date.now() - primeStartedAt,
                reason,
                sessionId: commandSessionId,
                skipSessionRestore: ensureOptions.skipSessionRestore,
                skipSessionStartHooks: ensureOptions.skipSessionStartHooks,
              });
              return commandSessionId;
            } catch (error) {
              logAgentDebug(
                "WorkspaceSend",
                "primeSession.error",
                {
                  durationMs: Date.now() - primeStartedAt,
                  error,
                  reason,
                  skipSessionRestore: ensureOptions.skipSessionRestore,
                  skipSessionStartHooks: ensureOptions.skipSessionStartHooks,
                },
                { level: "error" },
              );
              throw error;
            }
          })();
        } else {
          logAgentDebug("WorkspaceSend", "primeSession.reusePending", {
            reason,
          });
        }
        return commandSessionPromise;
      };
      const ensureCommandSessionId = async () => {
        return primeCommandSessionId(
          "await_binding",
          resolveCommandSessionEnsureOptions(),
        );
      };
      const markCompletedMentionCommand = (
        commandKey: string,
        replayText?: string,
      ) => {
        completedMentionCommandUsage = {
          entryId: commandKey,
          replayText: normalizeMentionCommandReplayText(replayText),
          slotValues: resolveMentionCommandUsageSlotValues(
            sendOptions?.requestMetadata,
          ),
        };
        completedMentionUsage = resolveMentionCommandUsage({
          commandKey,
          serviceSkills,
          requestMetadata: sendOptions?.requestMetadata,
          mentionCommandSkillIdMap,
        });
      };

      if (messagesCount === 0) {
        const previewStartedAt = Date.now();
        ensureSubmissionPreview();
        void waitForNextPaint().then(() => {
          logAgentDebug("WorkspaceSend", "initialPreview.paintDone", {
            durationMs: Date.now() - previewStartedAt,
            messagesCount,
          });
        });
      }

      const skillInstallPromptInstruction =
        !sendOptions?.purpose && !hasBoundSkillLaunch && sourceText.trim()
          ? parseSkillInstallPromptInstruction(sourceText)
          : null;
      if (skillInstallPromptInstruction) {
        const confirmation = await resolveSkillInstallPromptConfirmation(
          skillInstallPromptInstruction,
          translateAgentWorkspace,
        );
        return {
          kind: "local_confirmation",
          plan: {
            sourceText,
            images: effectiveImages,
            sendBoundary,
            submissionPreviewKey,
            confirmation,
          },
        };
      }

      const parsedImageWorkbenchCommand =
        !sendOptions?.purpose && !hasBoundSkillLaunch && sourceText.trim()
          ? parseImageWorkbenchCommand(sourceText)
          : null;
      if (parsedImageWorkbenchCommand) {
        const skillRequest = resolveImageWorkbenchSkillRequest({
          rawText: sourceText,
          parsedCommand: parsedImageWorkbenchCommand,
          images: effectiveImages,
          sessionIdOverride: commandSessionId,
          entrySource: parsedImageWorkbenchCommand.entrySource,
        });
        if (!skillRequest) {
          clearSubmissionPreview();
          return { kind: "done", result: false };
        }
        effectiveImages =
          skillRequest.images.length > 0
            ? skillRequest.images
            : effectiveImages;
        const mentionCommandKey = resolveImageMentionCommandKey(
          parsedImageWorkbenchCommand,
        );
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext: skillRequest.requestContext,
          requestContextKey: "image_task",
        };
        ensureSubmissionPreview(effectiveImages);
        void primeCommandSessionId(
          "image_skill_launch",
          resolveCommandSessionEnsureOptions(),
        ).catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "image",
            sendOptions?.requestMetadata,
            skillRequest.requestContext,
          ),
        };
        if (mentionCommandKey) {
          markCompletedMentionCommand(
            mentionCommandKey,
            resolveMentionCommandReplayText(
              parsedImageWorkbenchCommand,
              mentionCommandKey,
            ),
          );
        }
        hasBoundSkillLaunch = true;
      }

      const parsedPosterWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand
          ? parsePosterWorkbenchCommand(sourceText)
          : null;
      if (parsedPosterWorkbenchCommand) {
        const skillRequest = resolveImageWorkbenchSkillRequest({
          rawText: sourceText,
          parsedCommand: {
            rawText: parsedPosterWorkbenchCommand.rawText,
            commandKey: "poster_generate",
            trigger: "@配图",
            body: parsedPosterWorkbenchCommand.body,
            mode: "generate",
            prompt: parsedPosterWorkbenchCommand.prompt,
            count: 1,
            size: parsedPosterWorkbenchCommand.size,
            aspectRatio: parsedPosterWorkbenchCommand.aspectRatio,
            targetRef: undefined,
          },
          images: effectiveImages,
          sessionIdOverride: commandSessionId,
          entrySource: "at_poster_command",
        });
        if (!skillRequest) {
          clearSubmissionPreview();
          return { kind: "done", result: false };
        }
        effectiveImages =
          skillRequest.images.length > 0
            ? skillRequest.images
            : effectiveImages;
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext: skillRequest.requestContext,
          requestContextKey: "image_task",
        };
        ensureSubmissionPreview(effectiveImages);
        void primeCommandSessionId(
          "poster_skill_launch",
          resolveCommandSessionEnsureOptions(),
        ).catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "image",
            sendOptions?.requestMetadata,
            skillRequest.requestContext,
          ),
        };
        markCompletedMentionCommand(
          "poster_generate",
          resolveMentionCommandReplayText(
            parsedPosterWorkbenchCommand,
            "poster_generate",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const plainInputIntentConfirmation =
        !sendOptions?.purpose && !hasBoundSkillLaunch
          ? resolvePlainInputIntentConfirmation(sourceText)
          : null;
      if (plainInputIntentConfirmation) {
        return {
          kind: "local_confirmation",
          plan: {
            sourceText,
            images: effectiveImages,
            sendBoundary,
            submissionPreviewKey,
            confirmation: plainInputIntentConfirmation.confirmation,
            pendingIntent: {
              commandKey: plainInputIntentConfirmation.commandKey,
              intentId: plainInputIntentConfirmation.intentId,
              sourceText,
              images: effectiveImages,
            },
          },
        };
      }

      const parsedCoverWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedPosterWorkbenchCommand
          ? parseCoverWorkbenchCommand(sourceText)
          : null;
      if (parsedCoverWorkbenchCommand) {
        const requestContext = buildCoverSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedCoverWorkbenchCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          clearSubmissionPreview();
          return { kind: "done", result: false };
        }
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext,
          requestContextKey: "cover_task",
        };
        ensureSubmissionPreview();
        void primeCommandSessionId(
          "cover_skill_launch",
          resolveCommandSessionEnsureOptions(),
        ).catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "cover",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "cover_generate",
          resolveMentionCommandReplayText(
            parsedCoverWorkbenchCommand,
            "cover_generate",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedVideoWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand
          ? parseVideoWorkbenchCommand(sourceText)
          : null;
      if (parsedVideoWorkbenchCommand) {
        const requestContext = buildVideoSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedVideoWorkbenchCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          clearSubmissionPreview();
          return { kind: "done", result: false };
        }
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext,
          requestContextKey: "video_task",
        };
        ensureSubmissionPreview();
        void primeCommandSessionId(
          "video_skill_launch",
          resolveCommandSessionEnsureOptions(),
        ).catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "video",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "video_generate",
          resolveMentionCommandReplayText(
            parsedVideoWorkbenchCommand,
            "video_generate",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedBroadcastWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand
          ? parseBroadcastWorkbenchCommand(sourceText)
          : null;
      if (parsedBroadcastWorkbenchCommand) {
        const requestContext = buildBroadcastSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedBroadcastWorkbenchCommand,
          projectId,
          contentId,
        });
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext,
          requestContextKey: "broadcast_task",
        };
        ensureSubmissionPreview();
        void primeCommandSessionId(
          "broadcast_skill_launch",
          resolveCommandSessionEnsureOptions(),
        ).catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "broadcast",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "broadcast_generate",
          resolveMentionCommandReplayText(
            parsedBroadcastWorkbenchCommand,
            "broadcast_generate",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedResourceSearchWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand
          ? parseResourceSearchWorkbenchCommand(sourceText)
          : null;
      if (parsedResourceSearchWorkbenchCommand) {
        const resourceRewritePreference =
          resolveServiceModelExecutionPreference(
            resourcePromptRewritePreference,
          );
        const requestContext = buildResourceSearchSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedResourceSearchWorkbenchCommand,
          projectId,
          contentId,
          promptOverride: mergeServiceModelPrompt(
            resourceRewritePreference.customPrompt,
            parsedResourceSearchWorkbenchCommand.prompt,
          ),
        });
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext,
          requestContextKey: "resource_search_task",
        };
        ensureSubmissionPreview();
        void primeCommandSessionId(
          "resource_search_skill_launch",
          resolveCommandSessionEnsureOptions(),
        ).catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "resourceSearch",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "modal_resource_search",
          resolveMentionCommandReplayText(
            parsedResourceSearchWorkbenchCommand,
            "modal_resource_search",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedTranscriptionWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand
          ? parseTranscriptionWorkbenchCommand(sourceText)
          : null;
      if (parsedTranscriptionWorkbenchCommand) {
        const requestContext = buildTranscriptionSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedTranscriptionWorkbenchCommand,
          projectId,
          contentId,
        });
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext,
          requestContextKey: "transcription_task",
        };
        ensureSubmissionPreview();
        void primeCommandSessionId(
          "transcription_skill_launch",
          resolveCommandSessionEnsureOptions(),
        ).catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "transcription",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "transcription_generate",
          resolveMentionCommandReplayText(
            parsedTranscriptionWorkbenchCommand,
            "transcription_generate",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedSearchWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand
          ? parseSearchWorkbenchCommand(sourceText)
          : null;
      if (parsedSearchWorkbenchCommand) {
        const prefilledSearchCommand = maybeApplyMentionCommandRecentDefaults({
          rawText: sourceText,
          commandKey: "research",
          parsedCommand: parsedSearchWorkbenchCommand,
          reparse: parseSearchWorkbenchCommand,
        });
        sourceText = prefilledSearchCommand.rawText;
        dispatchText = sourceText;
        const requestContext = buildResearchSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: prefilledSearchCommand.parsedCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          return { kind: "done", result: false };
        }
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "research",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "research",
          resolveMentionCommandReplayText(
            prefilledSearchCommand.parsedCommand,
            "research",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedReportWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand
          ? parseReportWorkbenchCommand(sourceText)
          : null;
      if (parsedReportWorkbenchCommand) {
        const prefilledReportCommand = maybeApplyMentionCommandRecentDefaults({
          rawText: sourceText,
          commandKey: "research_report",
          parsedCommand: parsedReportWorkbenchCommand,
          reparse: parseReportWorkbenchCommand,
        });
        sourceText = prefilledReportCommand.rawText;
        dispatchText = sourceText;
        const requestContext = buildReportSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: prefilledReportCommand.parsedCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          return { kind: "done", result: false };
        }
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "report",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "research_report",
          resolveMentionCommandReplayText(
            prefilledReportCommand.parsedCommand,
            "research_report",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedCompetitorWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand
          ? parseCompetitorWorkbenchCommand(sourceText)
          : null;
      if (parsedCompetitorWorkbenchCommand) {
        const prefilledCompetitorCommand =
          maybeApplyMentionCommandRecentDefaults({
            rawText: sourceText,
            commandKey: "competitor_research",
            parsedCommand: parsedCompetitorWorkbenchCommand,
            reparse: parseCompetitorWorkbenchCommand,
          });
        sourceText = prefilledCompetitorCommand.rawText;
        dispatchText = sourceText;
        const requestContext = buildCompetitorSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: prefilledCompetitorCommand.parsedCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          return { kind: "done", result: false };
        }
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "report",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "competitor_research",
          resolveMentionCommandReplayText(
            prefilledCompetitorCommand.parsedCommand,
            "competitor_research",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedDeepSearchWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedCompetitorWorkbenchCommand
          ? parseDeepSearchWorkbenchCommand(sourceText)
          : null;
      if (parsedDeepSearchWorkbenchCommand) {
        const prefilledDeepSearchCommand =
          maybeApplyMentionCommandRecentDefaults({
            rawText: sourceText,
            commandKey: "deep_search",
            parsedCommand: parsedDeepSearchWorkbenchCommand,
            reparse: parseDeepSearchWorkbenchCommand,
          });
        sourceText = prefilledDeepSearchCommand.rawText;
        dispatchText = sourceText;
        const requestContext = buildDeepSearchSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: prefilledDeepSearchCommand.parsedCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          return { kind: "done", result: false };
        }
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "deepSearch",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "deep_search",
          resolveMentionCommandReplayText(
            prefilledDeepSearchCommand.parsedCommand,
            "deep_search",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedSiteSearchWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand
          ? parseSiteSearchWorkbenchCommand(sourceText)
          : null;
      if (parsedSiteSearchWorkbenchCommand) {
        const prefilledSiteSearchCommand =
          maybeApplyMentionCommandRecentDefaults({
            rawText: sourceText,
            commandKey: "site_search",
            parsedCommand: parsedSiteSearchWorkbenchCommand,
            reparse: parseSiteSearchWorkbenchCommand,
          });
        sourceText = prefilledSiteSearchCommand.rawText;
        dispatchText = sourceText;
        const requestContext = buildSiteSearchSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: prefilledSiteSearchCommand.parsedCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          return { kind: "done", result: false };
        }
        effectiveWebSearch = false;
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "siteSearch",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "site_search",
          resolveMentionCommandReplayText(
            prefilledSiteSearchCommand.parsedCommand,
            "site_search",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedPdfWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand
          ? parsePdfWorkbenchCommand(sourceText)
          : null;
      if (parsedPdfWorkbenchCommand) {
        const prefilledPdfCommand = maybeApplyMentionCommandRecentDefaults({
          rawText: sourceText,
          commandKey: "read_pdf",
          parsedCommand: parsedPdfWorkbenchCommand,
          reparse: parsePdfWorkbenchCommand,
        });
        sourceText = prefilledPdfCommand.rawText;
        dispatchText = sourceText;
        const requestContext = buildPdfReadSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: prefilledPdfCommand.parsedCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          return { kind: "done", result: false };
        }
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "pdfRead",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "read_pdf",
          resolveMentionCommandReplayText(
            prefilledPdfCommand.parsedCommand,
            "read_pdf",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedFileReadWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand
          ? parseFileReadWorkbenchCommand(sourceText)
          : null;
      if (parsedFileReadWorkbenchCommand) {
        const prefilledFileReadCommand = maybeApplyMentionCommandRecentDefaults(
          {
            rawText: sourceText,
            commandKey: "file_read_runtime",
            parsedCommand: parsedFileReadWorkbenchCommand,
            reparse: parseFileReadWorkbenchCommand,
          },
        );
        sourceText = prefilledFileReadCommand.rawText;
        dispatchText = sourceText;
        const requestContext = buildFileReadSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: prefilledFileReadCommand.parsedCommand,
          projectId,
          contentId,
        });
        if (!requestContext) {
          return { kind: "done", result: false };
        }
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "summary",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "file_read_runtime",
          resolveMentionCommandReplayText(
            prefilledFileReadCommand.parsedCommand,
            "file_read_runtime",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedSummaryWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedFileReadWorkbenchCommand
          ? parseSummaryWorkbenchCommand(sourceText)
          : null;
      if (parsedSummaryWorkbenchCommand) {
        const mergedSummaryCommand = mergeSummaryCommandRecentDefaults({
          parsedCommand: parsedSummaryWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "summary"),
          )?.slotValues,
        });
        const requestContext = buildSummarySkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedSummaryCommand,
          projectId,
          contentId,
        });
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "summary",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "summary",
          resolveMentionCommandReplayText(mergedSummaryCommand, "summary"),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedTranslationWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand
          ? parseTranslationWorkbenchCommand(sourceText)
          : null;
      if (parsedTranslationWorkbenchCommand) {
        const mergedTranslationCommand = mergeTranslationCommandRecentDefaults({
          parsedCommand: parsedTranslationWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "translation"),
          )?.slotValues,
        });
        const requestContext = buildTranslationSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedTranslationCommand,
          projectId,
          contentId,
        });
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "translation",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "translation",
          resolveMentionCommandReplayText(
            mergedTranslationCommand,
            "translation",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedComplianceWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand
          ? parseComplianceWorkbenchCommand(sourceText)
          : null;
      if (parsedComplianceWorkbenchCommand) {
        const mergedComplianceCommand = mergeComplianceCommandRecentDefaults({
          parsedCommand: parsedComplianceWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey(
              "builtin_command",
              "publish_compliance",
            ),
          )?.slotValues,
        });
        const requestContext = buildAnalysisSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedComplianceCommand,
          projectId,
          contentId,
          entrySource: "at_publish_compliance_command",
        });
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "analysis",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "publish_compliance",
          resolveMentionCommandReplayText(
            mergedComplianceCommand,
            "publish_compliance",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedLogoDecompositionWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedComplianceWorkbenchCommand
          ? parseLogoDecompositionWorkbenchCommand(sourceText)
          : null;
      if (parsedLogoDecompositionWorkbenchCommand) {
        const mergedLogoDecompositionCommand =
          mergeAnalysisCommandRecentDefaults({
            parsedCommand: parsedLogoDecompositionWorkbenchCommand,
            slotValues: mentionUsageMap.get(
              getMentionEntryUsageRecordKey(
                "builtin_command",
                "logo_decomposition",
              ),
            )?.slotValues,
          });
        const requestContext = buildAnalysisSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedLogoDecompositionCommand,
          projectId,
          contentId,
          entrySource: "at_logo_decomposition_command",
        });
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "analysis",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "logo_decomposition",
          resolveMentionCommandReplayText(
            mergedLogoDecompositionCommand,
            "logo_decomposition",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedAnalysisWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedComplianceWorkbenchCommand &&
        !parsedLogoDecompositionWorkbenchCommand
          ? parseAnalysisWorkbenchCommand(sourceText)
          : null;
      if (parsedAnalysisWorkbenchCommand) {
        const mergedAnalysisCommand = mergeAnalysisCommandRecentDefaults({
          parsedCommand: parsedAnalysisWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "analysis"),
          )?.slotValues,
        });
        const requestContext = buildAnalysisSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedAnalysisCommand,
          projectId,
          contentId,
        });
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "analysis",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "analysis",
          resolveMentionCommandReplayText(mergedAnalysisCommand, "analysis"),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedUrlParseWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedComplianceWorkbenchCommand
          ? parseUrlParseWorkbenchCommand(sourceText)
          : null;
      if (parsedUrlParseWorkbenchCommand) {
        const requestContext = buildUrlParseSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedUrlParseWorkbenchCommand,
          projectId,
          contentId,
        });
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext,
          requestContextKey: "url_parse_task",
        };
        ensureSubmissionPreview();
        void primeCommandSessionId().catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "urlParse",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          isUrlParseScrapeTrigger(parsedUrlParseWorkbenchCommand.trigger)
            ? "web_scrape"
            : isUrlParseReadTrigger(parsedUrlParseWorkbenchCommand.trigger)
              ? "webpage_read"
              : "url_parse",
          resolveMentionCommandReplayText(
            parsedUrlParseWorkbenchCommand,
            isUrlParseScrapeTrigger(parsedUrlParseWorkbenchCommand.trigger)
              ? "web_scrape"
              : isUrlParseReadTrigger(parsedUrlParseWorkbenchCommand.trigger)
                ? "webpage_read"
                : "url_parse",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedTypesettingWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand
          ? parseTypesettingWorkbenchCommand(sourceText)
          : null;
      if (parsedTypesettingWorkbenchCommand) {
        const mergedTypesettingCommand = mergeTypesettingCommandRecentDefaults({
          parsedCommand: parsedTypesettingWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "typesetting"),
          )?.slotValues,
        });
        const requestContext = buildTypesettingSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedTypesettingCommand,
          projectId,
          contentId,
        });
        pendingCommandSessionBinding = {
          kind: "request_context",
          requestContext,
          requestContextKey: "typesetting_task",
        };
        ensureSubmissionPreview();
        void primeCommandSessionId().catch(() => undefined);
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "typesetting",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "typesetting",
          resolveMentionCommandReplayText(
            mergedTypesettingCommand,
            "typesetting",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedPresentationWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand
          ? parsePresentationWorkbenchCommand(sourceText)
          : null;
      if (parsedPresentationWorkbenchCommand) {
        const mergedPresentationCommand =
          mergePresentationCommandRecentDefaults({
            parsedCommand: parsedPresentationWorkbenchCommand,
            slotValues: mentionUsageMap.get(
              getMentionEntryUsageRecordKey(
                "builtin_command",
                "presentation_generate",
              ),
            )?.slotValues,
          });
        const requestContext = buildPresentationSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedPresentationCommand,
          projectId,
          contentId,
        });
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "presentation",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "presentation_generate",
          resolveMentionCommandReplayText(
            mergedPresentationCommand,
            "presentation_generate",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedFormWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand &&
        !parsedPresentationWorkbenchCommand
          ? parseFormWorkbenchCommand(sourceText)
          : null;
      if (parsedFormWorkbenchCommand) {
        const mergedFormCommand = mergeFormCommandRecentDefaults({
          parsedCommand: parsedFormWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "form_generate"),
          )?.slotValues,
        });
        const requestContext = buildFormSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedFormCommand,
          projectId,
          contentId,
        });
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "form",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "form_generate",
          resolveMentionCommandReplayText(mergedFormCommand, "form_generate"),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedWebpageWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand &&
        !parsedPresentationWorkbenchCommand &&
        !parsedFormWorkbenchCommand
          ? parseWebpageWorkbenchCommand(sourceText)
          : null;
      if (parsedWebpageWorkbenchCommand) {
        const mergedWebpageCommand = mergeWebpageCommandRecentDefaults({
          parsedCommand: parsedWebpageWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey(
              "builtin_command",
              "webpage_generate",
            ),
          )?.slotValues,
        });
        const requestContext = buildWebpageSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: mergedWebpageCommand,
          projectId,
          contentId,
        });
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildSkillLaunchRequestMetadata(
            "webpage",
            sendOptions?.requestMetadata,
            requestContext,
          ),
        };
        markCompletedMentionCommand(
          "webpage_generate",
          resolveMentionCommandReplayText(
            mergedWebpageCommand,
            "webpage_generate",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedAgentTurnMentionShortcut =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand &&
        !parsedPresentationWorkbenchCommand &&
        !parsedFormWorkbenchCommand &&
        !parsedWebpageWorkbenchCommand
          ? parseMentionCommand(sourceText, mentionCommandPrefixKeyMap)
          : null;
      const agentTurnMentionRoute = parsedAgentTurnMentionShortcut
        ? mentionAgentTurnRouteMap.get(
            parsedAgentTurnMentionShortcut.commandKey,
          )
        : undefined;
      if (parsedAgentTurnMentionShortcut && agentTurnMentionRoute) {
        effectiveSendExecutionStrategy = normalizeExecutionStrategy(
          agentTurnMentionRoute.executionStrategy ??
            effectiveSendExecutionStrategy,
        );
        ensureSubmissionPreview();
        markCompletedMentionCommand(
          parsedAgentTurnMentionShortcut.commandKey,
          resolveMentionCommandReplayText(
            parsedAgentTurnMentionShortcut,
            parsedAgentTurnMentionShortcut.commandKey,
          ),
        );
      }

      const parsedWritingWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand &&
        !parsedPresentationWorkbenchCommand &&
        !parsedFormWorkbenchCommand &&
        !parsedWebpageWorkbenchCommand &&
        !agentTurnMentionRoute
          ? parseWritingWorkbenchCommand(sourceText)
          : null;
      if (parsedWritingWorkbenchCommand) {
        const mergedWritingCommand = mergePublishLikeCommandRecentDefaults({
          parsedCommand: parsedWritingWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "writing_runtime"),
          )?.slotValues,
        });
        const existingHarnessMetadata =
          asRecord(sendOptions?.requestMetadata?.harness) || {};
        const dispatchBody = buildWritingDispatchBody({
          prompt: mergedWritingCommand.prompt || mergedWritingCommand.body,
          platformLabel: mergedWritingCommand.platformLabel,
          draftKind: mergedWritingCommand.draftKind,
        });
        dispatchText = `/${CONTENT_POST_SKILL_KEY}${
          dispatchBody ? ` ${dispatchBody}` : ""
        }`;
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: {
            ...(sendOptions?.requestMetadata || {}),
            harness: {
              ...existingHarnessMetadata,
              publish_command: {
                prompt:
                  mergedWritingCommand.prompt || mergedWritingCommand.body,
                content: mergedWritingCommand.body,
                platform_type: mergedWritingCommand.platformType || undefined,
                platform_label: mergedWritingCommand.platformLabel || undefined,
                entry_source: "at_writing_command",
              },
            },
          },
        };
        markCompletedMentionCommand(
          "writing_runtime",
          resolveMentionCommandReplayText(
            mergedWritingCommand,
            "writing_runtime",
          ),
        );
      }

      const parsedChannelPreviewWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand &&
        !parsedPresentationWorkbenchCommand &&
        !parsedFormWorkbenchCommand &&
        !parsedWebpageWorkbenchCommand &&
        !agentTurnMentionRoute &&
        !parsedWritingWorkbenchCommand
          ? parseChannelPreviewWorkbenchCommand(sourceText)
          : null;
      if (parsedChannelPreviewWorkbenchCommand) {
        const mergedChannelPreviewCommand =
          mergePublishLikeCommandRecentDefaults({
            parsedCommand: parsedChannelPreviewWorkbenchCommand,
            slotValues: mentionUsageMap.get(
              getMentionEntryUsageRecordKey(
                "builtin_command",
                "channel_preview_runtime",
              ),
            )?.slotValues,
          });
        const existingHarnessMetadata =
          asRecord(sendOptions?.requestMetadata?.harness) || {};
        const dispatchBody = buildChannelPreviewDispatchBody({
          prompt:
            mergedChannelPreviewCommand.prompt ||
            mergedChannelPreviewCommand.body,
          platformLabel: mergedChannelPreviewCommand.platformLabel,
        });
        dispatchText = `/${CONTENT_POST_SKILL_KEY}${
          dispatchBody ? ` ${dispatchBody}` : ""
        }`;
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: {
            ...(sendOptions?.requestMetadata || {}),
            harness: {
              ...existingHarnessMetadata,
              publish_command: {
                prompt:
                  mergedChannelPreviewCommand.prompt ||
                  mergedChannelPreviewCommand.body,
                content: mergedChannelPreviewCommand.body,
                platform_type:
                  mergedChannelPreviewCommand.platformType || undefined,
                platform_label:
                  mergedChannelPreviewCommand.platformLabel || undefined,
                intent: "preview",
                entry_source: "at_channel_preview_command",
              },
            },
          },
        };
        markCompletedMentionCommand(
          "channel_preview_runtime",
          resolveMentionCommandReplayText(
            mergedChannelPreviewCommand,
            "channel_preview_runtime",
          ),
        );
      }

      const parsedUploadWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand &&
        !parsedPresentationWorkbenchCommand &&
        !parsedFormWorkbenchCommand &&
        !parsedWebpageWorkbenchCommand &&
        !agentTurnMentionRoute &&
        !parsedWritingWorkbenchCommand &&
        !parsedChannelPreviewWorkbenchCommand
          ? parseUploadWorkbenchCommand(sourceText)
          : null;
      if (parsedUploadWorkbenchCommand) {
        const mergedUploadCommand = mergePublishLikeCommandRecentDefaults({
          parsedCommand: parsedUploadWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "upload_runtime"),
          )?.slotValues,
        });
        const existingHarnessMetadata =
          asRecord(sendOptions?.requestMetadata?.harness) || {};
        const dispatchBody = buildUploadDispatchBody({
          prompt: mergedUploadCommand.prompt || mergedUploadCommand.body,
          platformLabel: mergedUploadCommand.platformLabel,
        });
        const uploadBrowserRequirementMatch = detectBrowserTaskRequirement(
          dispatchBody ||
            mergedUploadCommand.body ||
            mergedUploadCommand.prompt,
        );
        dispatchText = `/${CONTENT_POST_SKILL_KEY}${
          dispatchBody ? ` ${dispatchBody}` : ""
        }`;
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: {
            ...(sendOptions?.requestMetadata || {}),
            harness: {
              ...existingHarnessMetadata,
              ...(uploadBrowserRequirementMatch
                ? {
                    browser_requirement:
                      uploadBrowserRequirementMatch.requirement,
                    browser_requirement_reason:
                      uploadBrowserRequirementMatch.reason,
                    browser_launch_url: uploadBrowserRequirementMatch.launchUrl,
                  }
                : {}),
              publish_command: {
                prompt: mergedUploadCommand.prompt || mergedUploadCommand.body,
                content: mergedUploadCommand.body,
                platform_type: mergedUploadCommand.platformType || undefined,
                platform_label: mergedUploadCommand.platformLabel || undefined,
                intent: "upload",
                entry_source: "at_upload_command",
              },
            },
          },
        };
        markCompletedMentionCommand(
          "upload_runtime",
          resolveMentionCommandReplayText(
            mergedUploadCommand,
            "upload_runtime",
          ),
        );
      }

      const parsedPublishWorkbenchCommand =
        !sendOptions?.purpose &&
        sourceText.trim() &&
        !parsedImageWorkbenchCommand &&
        !parsedCoverWorkbenchCommand &&
        !parsedVideoWorkbenchCommand &&
        !parsedBroadcastWorkbenchCommand &&
        !parsedResourceSearchWorkbenchCommand &&
        !parsedTranscriptionWorkbenchCommand &&
        !parsedSearchWorkbenchCommand &&
        !parsedReportWorkbenchCommand &&
        !parsedDeepSearchWorkbenchCommand &&
        !parsedSiteSearchWorkbenchCommand &&
        !parsedPdfWorkbenchCommand &&
        !parsedSummaryWorkbenchCommand &&
        !parsedTranslationWorkbenchCommand &&
        !parsedUrlParseWorkbenchCommand &&
        !parsedTypesettingWorkbenchCommand &&
        !parsedPresentationWorkbenchCommand &&
        !parsedFormWorkbenchCommand &&
        !parsedWebpageWorkbenchCommand &&
        !agentTurnMentionRoute &&
        !parsedWritingWorkbenchCommand &&
        !parsedChannelPreviewWorkbenchCommand &&
        !parsedUploadWorkbenchCommand
          ? parsePublishWorkbenchCommand(sourceText)
          : null;
      if (parsedPublishWorkbenchCommand) {
        const mergedPublishCommand = mergePublishLikeCommandRecentDefaults({
          parsedCommand: parsedPublishWorkbenchCommand,
          slotValues: mentionUsageMap.get(
            getMentionEntryUsageRecordKey("builtin_command", "publish_runtime"),
          )?.slotValues,
        });
        const existingHarnessMetadata =
          asRecord(sendOptions?.requestMetadata?.harness) || {};
        const nextBody = buildPublishDispatchBody({
          prompt: mergedPublishCommand.prompt || mergedPublishCommand.body,
          platformLabel: mergedPublishCommand.platformLabel,
        });
        const publishBrowserRequirementMatch = detectBrowserTaskRequirement(
          nextBody || mergedPublishCommand.body || mergedPublishCommand.prompt,
        );
        dispatchText = `/${CONTENT_POST_SKILL_KEY}${nextBody ? ` ${nextBody}` : ""}`;
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: {
            ...(sendOptions?.requestMetadata || {}),
            harness: {
              ...existingHarnessMetadata,
              ...(publishBrowserRequirementMatch
                ? {
                    browser_requirement:
                      publishBrowserRequirementMatch.requirement,
                    browser_requirement_reason:
                      publishBrowserRequirementMatch.reason,
                    browser_launch_url:
                      publishBrowserRequirementMatch.launchUrl,
                  }
                : {}),
              publish_command: {
                prompt:
                  mergedPublishCommand.prompt || mergedPublishCommand.body,
                content: mergedPublishCommand.body,
                platform_type: mergedPublishCommand.platformType || undefined,
                platform_label: mergedPublishCommand.platformLabel || undefined,
                entry_source: "at_publish_command",
              },
            },
          },
        };
        markCompletedMentionCommand(
          "publish_runtime",
          resolveMentionCommandReplayText(
            mergedPublishCommand,
            "publish_runtime",
          ),
        );
      }

      const parsedVoiceWorkbenchCommand =
        !sendOptions?.purpose && sourceText.trim()
          ? parseVoiceWorkbenchCommand(sourceText)
          : null;
      if (parsedVoiceWorkbenchCommand) {
        const voiceSkillLaunch = await resolveVoiceSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedVoiceWorkbenchCommand,
          serviceSkills,
          projectId,
          contentId,
          voicePreference: mediaDefaults.voice,
        });
        if (!voiceSkillLaunch) {
          clearSubmissionPreview();
          return { kind: "done", result: false };
        }

        ensureSubmissionPreview();
        dispatchText = voiceSkillLaunch.dispatchText;
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildServiceSceneLaunchRequestMetadata(
            sendOptions?.requestMetadata,
            voiceSkillLaunch.requestContext,
          ),
        };
        markCompletedMentionCommand(
          "voice_runtime",
          resolveMentionCommandReplayText(
            parsedVoiceWorkbenchCommand,
            "voice_runtime",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedGrowthWorkbenchCommand =
        !sendOptions?.purpose && sourceText.trim()
          ? parseGrowthWorkbenchCommand(sourceText)
          : null;
      if (parsedGrowthWorkbenchCommand) {
        const growthSkillLaunch = await resolveGrowthSkillLaunchRequestContext({
          rawText: sourceText,
          parsedCommand: parsedGrowthWorkbenchCommand,
          serviceSkills,
          projectId,
          contentId,
        });
        if (!growthSkillLaunch) {
          clearSubmissionPreview();
          return { kind: "done", result: false };
        }

        ensureSubmissionPreview();
        dispatchText = growthSkillLaunch.dispatchText;
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildServiceSceneLaunchRequestMetadata(
            sendOptions?.requestMetadata,
            growthSkillLaunch.requestContext,
          ),
        };
        markCompletedMentionCommand(
          "growth_runtime",
          resolveMentionCommandReplayText(
            parsedGrowthWorkbenchCommand,
            "growth_runtime",
          ),
        );
        hasBoundSkillLaunch = true;
      }

      const parsedBrowserWorkbenchCommand =
        !sendOptions?.purpose && sourceText.trim()
          ? parseBrowserWorkbenchCommand(sourceText)
          : null;
      if (parsedBrowserWorkbenchCommand) {
        effectiveWebSearch = false;
        ensureSubmissionPreview();
        sendOptions = {
          ...(sendOptions || {}),
          requestMetadata: buildBrowserControlLaunchRequestMetadata(
            sendOptions?.requestMetadata,
            parsedBrowserWorkbenchCommand,
          ),
        };
        markCompletedMentionCommand(
          "browser_runtime",
          resolveMentionCommandReplayText(
            parsedBrowserWorkbenchCommand,
            "browser_runtime",
          ),
        );
      }

      if (
        !sendOptions?.purpose &&
        !sendOptions?.skipSceneCommandRouting &&
        sourceText.trim().startsWith("/")
      ) {
        ensureSubmissionPreview();
        let sceneLaunchRequest = null;
        try {
          sceneLaunchRequest = await resolveRuntimeSceneLaunchRequest({
            rawText: sourceText,
            serviceSkills,
            projectId,
            contentId,
          });
        } catch (error) {
          if (error instanceof RuntimeSceneLaunchValidationError) {
            if (error.gateRequest && openRuntimeSceneGate) {
              await openRuntimeSceneGate(error.gateRequest);
              clearSubmissionPreview();
              return { kind: "done", result: false };
            }
            toast.error(error.message);
            clearSubmissionPreview();
            return { kind: "done", result: false };
          }
          throw error;
        }
        if (sceneLaunchRequest) {
          const sceneRequestDefaults =
            sceneLaunchRequest.sceneEntry.requestDefaults ?? {};
          const sceneExecutionStrategy = parseCatalogExecutionStrategy(
            sceneRequestDefaults.executionStrategy ??
              sceneRequestDefaults.execution_strategy,
          );
          if (sceneExecutionStrategy) {
            effectiveSendExecutionStrategy =
              normalizeExecutionStrategy(sceneExecutionStrategy);
          }
          if (sceneLaunchRequest.dispatchText) {
            dispatchText = sceneLaunchRequest.dispatchText;
          }
          sendOptions = {
            ...(sendOptions || {}),
            requestMetadata: buildServiceSceneLaunchRequestMetadata(
              sendOptions?.requestMetadata,
              sceneLaunchRequest.requestContext,
            ),
          };
          hasBoundSkillLaunch = true;
          completedSlashUsage = {
            kind: "scene",
            entryId: sceneLaunchRequest.sceneEntry.sceneKey,
            replayText:
              completedSlashUsage?.replayText ??
              parseRuntimeSceneCommand(sourceText)?.userInput,
          };
        }
      }

      const trimmedSourceText = sourceText.trim();
      if (
        activeTheme === "general" &&
        !sendOptions?.purpose &&
        !hasBoundSkillLaunch &&
        !images?.length &&
        trimmedSourceText &&
        !trimmedSourceText.startsWith("/") &&
        !trimmedSourceText.startsWith("@")
      ) {
        const matchedSiteSkill = matchAutoLaunchSiteSkillFromText({
          inputText: trimmedSourceText,
          serviceSkills,
        });
        if (matchedSiteSkill) {
          clearSubmissionPreview();
          await handleAutoLaunchMatchedSiteSkill(matchedSiteSkill);
          return { kind: "done", result: true };
        }
      }

      const mergedRequestMetadataAfterLaunch = {
        ...(workspaceRequestMetadataBase || {}),
        ...(sendOptions?.requestMetadata || {}),
      };
      if (
        !projectId &&
        !hasServiceSkillLaunchRequestMetadata(mergedRequestMetadataAfterLaunch)
      ) {
        sendOptions?.observer?.onError?.("请先选择项目后再开始对话");
        toast.error("请先选择项目后再开始对话");
        clearSubmissionPreview();
        return { kind: "done", result: false };
      }

      const shouldPrimeSessionForInitialConversationSend =
        !sendOptions?.purpose &&
        !hasBoundSkillLaunch &&
        messagesCount === 0 &&
        sendOptions?.skipSessionRestore !== true &&
        sendOptions?.skipSessionStartHooks !== true &&
        Boolean(ensureSessionForCommandMetadata);

      const shouldSkipBrowserAssistPrime =
        shouldSkipBrowserAssistPrimeForPlainFirstTurn({
          activeTheme,
          browserRequirementMatch: sendBoundary.browserRequirementMatch,
          hasBoundSkillLaunch,
          imagesCount: images?.length ?? 0,
          messagesCount,
          sendOptions,
          sourceText,
        });

      if (!hasBoundSkillLaunch && !shouldSkipBrowserAssistPrime) {
        primeBrowserAssistBeforeSend({
          activeTheme,
          sourceText,
          browserRequirementMatch,
          ensureBrowserAssistCanvas,
        });
      }

      let text: string;
      try {
        const resolvedSubmissionPreviewKey = ensureSubmissionPreview();
        if (shouldPrimeSessionForInitialConversationSend) {
          void primeCommandSessionId(
            "initial_conversation_send",
            resolveCommandSessionEnsureOptions(),
          ).catch(() => undefined);
        } else if (
          !sendOptions?.purpose &&
          !hasBoundSkillLaunch &&
          messagesCount === 0 &&
          Boolean(ensureSessionForCommandMetadata)
        ) {
          logAgentDebug("WorkspaceSend", "primeSession.skipInitial", {
            reason: "initial_conversation_send",
            skipSessionRestore: sendOptions?.skipSessionRestore === true,
            skipSessionStartHooks: sendOptions?.skipSessionStartHooks === true,
          });
        }
        text = await buildWorkspaceSendText({
          sourceText: dispatchText,
          contextWorkspace,
          mentionedCharacters,
          sendOptions,
          preparedActiveContextPrompt,
        });
        if (pendingCommandSessionBinding) {
          const resolvedSessionId = await ensureCommandSessionId();
          if (pendingCommandSessionBinding.kind === "request_context") {
            attachSessionIdToRequestContext(
              pendingCommandSessionBinding.requestContext,
              pendingCommandSessionBinding.requestContextKey,
              resolvedSessionId,
            );
          } else {
            attachSessionIdToScopedRequestContext(
              pendingCommandSessionBinding.scopedRequestContext,
              resolvedSessionId,
            );
          }
        }
        submissionPreviewKey = resolvedSubmissionPreviewKey;
        const performanceTrace = extractAgentUiPerformanceTraceMetadata(
          sendOptions?.requestMetadata,
        );
        if (performanceTrace?.sessionId || performanceTrace?.requestId) {
          recordAgentUiPerformanceMetric("workspaceSend.plan.ready", {
            durationMs: Date.now() - planStartedAt,
            hasPendingSessionBinding: Boolean(pendingCommandSessionBinding),
            primedSessionId: commandSessionId ?? null,
            requestId: performanceTrace.requestId ?? null,
            sessionId: performanceTrace.sessionId ?? null,
            source: performanceTrace.source ?? "workspace-send",
            workspaceId: performanceTrace.workspaceId ?? null,
          });
        }
        logAgentDebug("WorkspaceSend", "plan.ready", {
          durationMs: Date.now() - planStartedAt,
          hasPendingSessionBinding: Boolean(pendingCommandSessionBinding),
          primedSessionId: commandSessionId ?? null,
          sourceTextLength: sourceText.trim().length,
        });
      } catch (error) {
        clearSubmissionPreview();
        throw error;
      }

      return {
        kind: "ready",
        plan: {
          sourceText,
          dispatchText,
          text,
          images: effectiveImages,
          sendBoundary,
          effectiveToolPreferences,
          effectiveWebSearch,
          effectiveSearchMode,
          submissionPreviewKey,
          sendExecutionStrategy: effectiveSendExecutionStrategy,
          autoContinuePayload,
          sendOptions,
          completedMentionCommandUsage,
          completedMentionUsage,
          completedSlashUsage,
        },
      };
    },
    [
      activeTheme,
      chatToolPreferences,
      contentId,
      contextWorkspace,
      ensureSessionForCommandMetadata,
      ensureBrowserAssistCanvas,
      executionStrategy,
      handleAutoLaunchMatchedSiteSkill,
      resolveImageWorkbenchSkillRequest,
      input,
      mediaDefaults.voice,
      messagesCount,
      mentionedCharacters,
      openRuntimeSceneGate,
      projectId,
      resolveSendBoundary,
      resourcePromptRewritePreference,
      serviceSkills,
      translateAgentWorkspace,
      mentionAgentTurnRouteMap,
      mentionCommandPrefixKeyMap,
      mentionCommandSkillIdMap,
      workspaceRequestMetadataBase,
    ],
  );

  const executeLocalConfirmationPlan = useCallback(
    async (plan: WorkspaceLocalConfirmationPlan): Promise<boolean> => {
      const { sourceText, images, sendBoundary, submissionPreviewKey } = plan;
      setRuntimeTeamDispatchPreview(null);
      setInput("");
      setMentionedCharacters([]);
      pendingPlainInputIntentRef.current = plan.pendingIntent ?? null;

      setChatMessages((previous) => {
        const timestamp = new Date();
        return [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: sourceText,
            images: images.length > 0 ? images : undefined,
            timestamp,
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: plan.confirmation,
            timestamp: new Date(),
          },
        ];
      });

      finalizeAfterSendSuccess(sendBoundary);
      setSubmissionPreview((current) =>
        current?.key === submissionPreviewKey ? null : current,
      );
      return true;
    },
    [
      finalizeAfterSendSuccess,
      setChatMessages,
      setInput,
      setMentionedCharacters,
      setRuntimeTeamDispatchPreview,
    ],
  );

  const executeSendPlan = useCallback(
    async (plan: WorkspaceSendPlan): Promise<boolean> => {
      const {
        sourceText,
        dispatchText,
        text,
        images,
        sendBoundary,
        effectiveWebSearch,
        effectiveSearchMode,
        submissionPreviewKey,
        sendExecutionStrategy,
        autoContinuePayload,
        sendOptions,
        completedMentionCommandUsage,
        completedMentionUsage,
      } = plan;

      const executeStartedAt = Date.now();
      logAgentDebug("WorkspaceSend", "execute.start", {
        imagesCount: images.length,
        messagesCount,
        sourceTextLength: sourceText.trim().length,
      });
      const effectiveToolPreferences = plan.effectiveToolPreferences;
      const effectivePreferredTeamPresetId = preferredTeamPresetId;
      setRuntimeTeamDispatchPreview(null);
      setInput("");
      setMentionedCharacters([]);

      try {
        const teamPrepareStartedAt = Date.now();
        const preparedRuntimeTeamState = await _prepareRuntimeTeamBeforeSend({
          input: sourceText,
          purpose: sendOptions?.purpose,
          subagentEnabled: effectiveToolPreferences.subagent,
        });
        logAgentDebug("WorkspaceSend", "runtimeTeam.prepareDone", {
          durationMs: Date.now() - teamPrepareStartedAt,
          hasPreparedRuntimeTeamState: Boolean(preparedRuntimeTeamState),
        });
        if (preparedRuntimeTeamState) {
          recordTeamFormationAgentUiProjection(preparedRuntimeTeamState, {
            sessionId,
          });
          setRuntimeTeamDispatchPreview(
            buildRuntimeTeamDispatchPreview(
              preparedRuntimeTeamState,
              sourceText,
              images,
              messagesCount,
            ),
          );
        }

        const nextRequestMetadata = buildWorkspaceRequestMetadata({
          workspaceRequestMetadataBase,
          savedSoulArtifactVoiceGenerationBrief,
          soulArtifactVoiceEnabledForTurn,
          sendOptions: {
            ...(sendOptions || {}),
            toolPreferencesOverride: effectiveToolPreferences,
          },
          currentProviderType: providerType,
          effectiveToolPreferences,
          mappedTheme,
          isThemeWorkbench,
          currentGateKey,
          themeWorkbenchActiveQueueTitle,
          contentId,
          browserRequirementMatch: sendBoundary.browserRequirementMatch,
          browserAssistProfileKey,
          browserAssistPreferredBackend,
          browserAssistAutoLaunch,
          preferredTeamPresetId: effectivePreferredTeamPresetId,
          selectedTeam,
          selectedTeamLabel,
          selectedTeamSummary,
          teamMemoryShadowSnapshot,
          agentResponseLanguage,
        });
        const serviceModelSendOverrides = resolveServiceModelSendOverrides({
          requestMetadata: nextRequestMetadata,
          purpose: sendOptions?.purpose,
          serviceModels,
        });
        const fastResponseDecision = resolveAgentFastResponseRouting({
          mode: readFastResponseMode(),
          mappedTheme,
          isThemeWorkbench,
          contentId,
          messageCount: messagesCount,
          sourceText,
          imagesCount: images.length,
          toolPreferences: effectiveToolPreferences,
          searchMode: effectiveSearchMode,
          effectiveWebSearch,
          hasExplicitProviderOverride: Boolean(
            sendOptions?.providerOverride?.trim(),
          ),
          hasExplicitModelOverride: Boolean(sendOptions?.modelOverride?.trim()),
          hasServiceModelOverride: Boolean(
            serviceModelSendOverrides.providerOverride ||
            serviceModelSendOverrides.modelOverride,
          ),
          hasCapabilityRoute: Boolean(
            sendOptions?.capabilityRoute ||
            sendBoundary.browserRequirementMatch,
          ),
          hasSkillRequest: Boolean(sendOptions?.skillRequest),
          hasSelectedTeam: Boolean(selectedTeam),
          hasMentionedCharacters: mentionedCharacters.length > 0,
          hasContextWorkspace: Boolean(
            contextWorkspace.enabled ||
            contextWorkspace.activeContextPrompt?.trim(),
          ),
          hasPurpose: Boolean(sendOptions?.purpose),
          hasAutoContinue: Boolean(autoContinuePayload?.enabled),
        });
        const nextAssistantDraft =
          sendOptions?.assistantDraft ??
          buildImageWorkbenchAssistantDraft(nextRequestMetadata) ??
          buildFastResponseAssistantDraft(fastResponseDecision);
        const nextSendOptions: HandleSendOptions = {
          ...(sendOptions || {}),
          displayContent:
            dispatchText !== sourceText
              ? (sendOptions?.displayContent ?? sourceText)
              : sendOptions?.displayContent,
          requestMetadata: withFastResponseMetadata(
            nextRequestMetadata,
            fastResponseDecision,
          ),
          ...(effectiveSearchMode ? { searchMode: effectiveSearchMode } : {}),
          providerOverride:
            sendOptions?.providerOverride ??
            serviceModelSendOverrides.providerOverride,
          modelOverride:
            sendOptions?.modelOverride ??
            serviceModelSendOverrides.modelOverride,
          systemPromptOverride:
            sendOptions?.systemPromptOverride ??
            (fastResponseDecision.enabled
              ? buildAgentFastResponseSystemPrompt(undefined, {
                  searchMode: fastResponseDecision.searchMode,
                })
              : undefined),
          assistantDraft: nextAssistantDraft,
        };

        logAgentDebug("WorkspaceSend", "sendMessage.start", {
          durationMs: Date.now() - executeStartedAt,
          fastResponseApplied: fastResponseDecision.enabled,
          modelOverride: nextSendOptions.modelOverride ?? null,
          providerOverride: nextSendOptions.providerOverride ?? null,
        });
        await sendMessage(
          text,
          images,
          effectiveWebSearch,
          undefined,
          false,
          sendExecutionStrategy,
          undefined,
          autoContinuePayload,
          nextSendOptions,
        );
        pendingPlainInputIntentRef.current = null;
        logAgentDebug("WorkspaceSend", "sendMessage.done", {
          durationMs: Date.now() - executeStartedAt,
        });

        if (completedMentionCommandUsage) {
          recordMentionEntryUsage({
            kind: "builtin_command",
            entryId: completedMentionCommandUsage.entryId,
            replayText: completedMentionCommandUsage.replayText,
            slotValues: completedMentionCommandUsage.slotValues,
          });
        }

        if (completedMentionUsage) {
          recordServiceSkillUsage(completedMentionUsage);
        }

        if (plan.completedSlashUsage) {
          recordSlashEntryUsage(plan.completedSlashUsage);
        }

        finalizeAfterSendSuccess(sendBoundary);
        return true;
      } catch (error) {
        rollbackAfterSendFailure(sendBoundary);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setRuntimeTeamDispatchPreview((current) =>
          current
            ? {
                ...current,
                status: "failed",
                failureMessage: errorMessage,
              }
            : null,
        );
        sendOptions?.observer?.onError?.(errorMessage);
        console.error("[AgentChat] 发送消息失败:", error);
        toast.error(`发送失败: ${errorMessage}`);
        setInput(sourceText);
        return false;
      } finally {
        setSubmissionPreview((current) =>
          current?.key === submissionPreviewKey ? null : current,
        );
      }
    },
    [
      _prepareRuntimeTeamBeforeSend,
      agentResponseLanguage,
      browserAssistAutoLaunch,
      browserAssistPreferredBackend,
      browserAssistProfileKey,
      contentId,
      contextWorkspace.activeContextPrompt,
      contextWorkspace.enabled,
      currentGateKey,
      finalizeAfterSendSuccess,
      isThemeWorkbench,
      mappedTheme,
      messagesCount,
      mentionedCharacters,
      preferredTeamPresetId,
      providerType,
      rollbackAfterSendFailure,
      selectedTeam,
      selectedTeamLabel,
      selectedTeamSummary,
      serviceModels,
      sessionId,
      teamMemoryShadowSnapshot,
      sendMessage,
      setInput,
      setMentionedCharacters,
      setRuntimeTeamDispatchPreview,
      themeWorkbenchActiveQueueTitle,
      workspaceRequestMetadataBase,
      savedSoulArtifactVoiceGenerationBrief,
      soulArtifactVoiceEnabledForTurn,
    ],
  );

  const handleSend = useCallback<WorkspaceHandleSend>(
    async (
      images,
      webSearch,
      thinking,
      textOverride,
      sendExecutionStrategy,
      autoContinuePayload,
      sendOptions,
    ) => {
      if (isPreparingSendRef.current) {
        return false;
      }

      isPreparingSendRef.current = true;
      setIsPreparingSend(true);

      try {
        const resolution = await resolveSendExecutionPlan(
          images,
          webSearch,
          thinking,
          textOverride,
          sendExecutionStrategy,
          autoContinuePayload,
          sendOptions,
        );
        if (resolution.kind === "done") {
          return resolution.result;
        }
        if (resolution.kind === "local_confirmation") {
          return executeLocalConfirmationPlan(resolution.plan);
        }
        return executeSendPlan(resolution.plan);
      } finally {
        isPreparingSendRef.current = false;
        setIsPreparingSend(false);
      }
    },
    [
      executeLocalConfirmationPlan,
      executeSendPlan,
      resolveSendExecutionPlan,
    ],
  );

  const handleRecommendationClick = useCallback(
    (shortLabel: string, fullPrompt: string) => {
      setInput(fullPrompt);

      if (
        activeTheme !== "general" ||
        !isTeamRuntimeRecommendation(shortLabel, fullPrompt)
      ) {
        return;
      }

      const nextToolPreferences = chatToolPreferences.subagent
        ? chatToolPreferences
        : {
            ...chatToolPreferences,
            subagent: true,
          };

      if (!chatToolPreferences.subagent) {
        setChatToolPreferences(nextToolPreferences);
      }
      saveChatToolPreferences(nextToolPreferences, activeTheme);
      void handleSend(
        [],
        undefined,
        undefined,
        fullPrompt,
        executionStrategy,
        undefined,
        {
          toolPreferencesOverride: nextToolPreferences,
        },
      );
    },
    [
      activeTheme,
      chatToolPreferences,
      executionStrategy,
      handleSend,
      setChatToolPreferences,
      setInput,
    ],
  );

  const handleSendRef = useRef(handleSend);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  return {
    handleSend,
    handleRecommendationClick,
    handleSendRef,
    isPreparingSend,
    displayMessages,
    teamDispatchPreviewState,
  };
}
