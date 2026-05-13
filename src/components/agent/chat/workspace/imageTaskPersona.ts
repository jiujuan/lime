import { getLimeI18n } from "@/i18n/createI18n";
import type { MessageImageWorkbenchPreview } from "../types";
import {
  buildImageWorkbenchCaption,
  buildImageWorkbenchProcessLines,
  collapseImageWorkbenchWhitespace,
  resolveImageWorkbenchModelLabel,
} from "../utils/imageWorkbenchPresentation";

type ImageTaskMode = NonNullable<MessageImageWorkbenchPreview["mode"]>;

const IMAGE_TASK_PERSONA_ID = "lime_image_creator";
const IMAGE_TASK_PERSONA_VERSION = "lime-image-persona-v1";
const IMAGE_TASK_PRESENTATION_VERSION = "lime-image-chat-v1";
const IMAGE_TASK_TASTE_VERSION = "lime-image-taste-v1";

type ImageTaskPersonaKey =
  | "agentChat.imageTaskPersona.subject.fallback"
  | "agentChat.imageTaskPersona.intro.generateWithModel"
  | "agentChat.imageTaskPersona.intro.generate"
  | "agentChat.imageTaskPersona.intro.editWithModel"
  | "agentChat.imageTaskPersona.intro.edit"
  | "agentChat.imageTaskPersona.intro.variationWithModel"
  | "agentChat.imageTaskPersona.intro.variation";

function tImageTaskPersona(
  key: ImageTaskPersonaKey,
  options?: Record<string, unknown>,
): string {
  return getLimeI18n().t(key, {
    ns: "agent",
    ...(options || {}),
  });
}

function uniqueCompactStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = collapseImageWorkbenchWhitespace(value || "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeImageTaskDisplayTarget(value: string): string {
  const normalized = collapseImageWorkbenchWhitespace(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/^@\S+(?:\s+\S+)?\s*/u, "")
    .trim();

  if (normalized.length <= 72) {
    return normalized;
  }
  return `${normalized.slice(0, 72).trim()}...`;
}

function resolveImageTaskDisplayTarget(prompt: string): string {
  return (
    normalizeImageTaskDisplayTarget(prompt) ||
    tImageTaskPersona("agentChat.imageTaskPersona.subject.fallback")
  );
}

export function buildImageTaskAssistantContent(params: {
  prompt: string;
  mode?: ImageTaskMode;
  modelName?: string | null;
}): string {
  const modelLabel = resolveImageWorkbenchModelLabel(params.modelName);
  const target = resolveImageTaskDisplayTarget(params.prompt);

  const introKey: ImageTaskPersonaKey = (() => {
    if (params.mode === "edit") {
      return modelLabel
        ? "agentChat.imageTaskPersona.intro.editWithModel"
        : "agentChat.imageTaskPersona.intro.edit";
    }
    if (params.mode === "variation") {
      return modelLabel
        ? "agentChat.imageTaskPersona.intro.variationWithModel"
        : "agentChat.imageTaskPersona.intro.variation";
    }
    return modelLabel
      ? "agentChat.imageTaskPersona.intro.generateWithModel"
      : "agentChat.imageTaskPersona.intro.generate";
  })();

  return [
    tImageTaskPersona(introKey, { model: modelLabel, target }),
    ...buildImageWorkbenchProcessLines(),
  ].join("\n");
}

function buildImageTaskResultCaptions(prompt: string): Record<string, string> {
  return {
    complete:
      buildImageWorkbenchCaption({
        prompt,
        status: "complete",
        imageCount: 1,
      }) || "",
    partial:
      buildImageWorkbenchCaption({
        prompt,
        status: "partial",
        imageCount: 1,
      }) || "",
    failed:
      buildImageWorkbenchCaption({
        prompt,
        status: "failed",
      }) || "",
    cancelled:
      buildImageWorkbenchCaption({
        prompt,
        status: "cancelled",
      }) || "",
  };
}

export function buildImageTaskPersonaContext(): Record<string, unknown> {
  return {
    version: IMAGE_TASK_PERSONA_VERSION,
    persona_id: IMAGE_TASK_PERSONA_ID,
    surface: "generate_thread",
    role: "image_creator",
    tone: "natural_minimal",
    conversation_policy: {
      single_assistant_message: true,
      no_submission_summary: true,
      no_task_ids_in_chat: true,
      no_second_reply_after_tool_submit: true,
      no_internal_tool_names_in_chat: true,
    },
    opening_policy: {
      style: "short_ack_then_action",
      max_lines_before_tool: 3,
      use_presentation_contract_first: true,
    },
    result_policy: {
      complete_caption_max_lines: 2,
      invite_iteration: true,
      hide_runtime_details: true,
    },
  };
}

export function buildImageTaskPresentationContext(params: {
  prompt: string;
  mode: ImageTaskMode;
  modelId?: string;
}): Record<string, unknown> {
  const resultCaptions = buildImageTaskResultCaptions(params.prompt);
  return {
    version: IMAGE_TASK_PRESENTATION_VERSION,
    surface: "conversation",
    assistant_label: "Lime",
    persona_id: IMAGE_TASK_PERSONA_ID,
    assistant_intro: buildImageTaskAssistantContent({
      prompt: params.prompt,
      mode: params.mode,
      modelName: params.modelId || null,
    }),
    process_lines: buildImageWorkbenchProcessLines(),
    completion_caption: resultCaptions.complete,
    partial_caption: resultCaptions.partial,
    failed_caption: resultCaptions.failed,
    cancelled_caption: resultCaptions.cancelled,
    result_captions: resultCaptions,
    message_contract: {
      single_assistant_message: true,
      preserve_intro_during_stream: true,
      hide_runtime_details: true,
    },
    completion_caption_policy: {
      tone: "natural_minimal",
      max_lines: 2,
      invite_iteration: true,
      avoid_terms: [
        "任务 ID",
        "任务文件",
        "排队",
        "Image Workbench",
        "图片工作台",
      ],
    },
  };
}

export function buildImageTaskTasteContext(params: {
  prompt: string;
  referenceImageCount: number;
  entrySource?: string;
  targetOutputPrompt?: string | null;
  targetOutputModelName?: string | null;
  applyTargetKind?: string | null;
}): Record<string, unknown> {
  const referenceSummaries = uniqueCompactStrings([
    params.targetOutputPrompt,
    params.targetOutputModelName
      ? `model:${params.targetOutputModelName}`
      : undefined,
  ]);
  const memorySources = uniqueCompactStrings([
    "explicit_prompt",
    params.referenceImageCount > 0 ? "reference_images" : undefined,
    params.targetOutputPrompt ? "target_output" : undefined,
    params.applyTargetKind ? `apply_target:${params.applyTargetKind}` : undefined,
  ]);

  return {
    version: IMAGE_TASK_TASTE_VERSION,
    source: "taste_layer",
    entry_source: params.entrySource || "at_image_command",
    memory_sources: memorySources,
    prompt_intent: normalizeImageTaskDisplayTarget(params.prompt),
    reference_image_count: params.referenceImageCount,
    reference_summaries: referenceSummaries,
    style_keywords: [],
    avoid_keywords: [],
    cold_start_policy: "use_platform_baseline_without_explaining_it",
    tool_parameter_policy: "taste_only_changes_prompt_and_style_fields",
    chat_policy: "do_not_explain_taste_sources_in_conversation",
  };
}
