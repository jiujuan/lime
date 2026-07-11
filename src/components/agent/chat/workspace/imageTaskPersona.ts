import type { MessageImageWorkbenchPreview } from "../types";
import {
  collapseImageWorkbenchWhitespace,
  resolveImageTaskPromptSubject,
} from "../utils/imageWorkbenchPresentation";

type ImageTaskMode = NonNullable<MessageImageWorkbenchPreview["mode"]>;

const IMAGE_TASK_PERSONA_ID = "lime_image_creator";
const IMAGE_TASK_PERSONA_VERSION = "lime-image-persona-v1";
const IMAGE_TASK_PRESENTATION_VERSION = "lime-image-chat-v1";
const IMAGE_TASK_TASTE_VERSION = "lime-image-taste-v1";

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
      no_internal_tool_names_in_chat: true,
    },
    opening_policy: {
      style: "natural_contextual_ack_then_action",
      max_lines_before_tool: 2,
      use_model_stream_first: true,
      avoid_fixed_templates: true,
      no_visible_process_lines: true,
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
  const promptIntent = resolveImageTaskPromptSubject(params.prompt);
  return {
    version: IMAGE_TASK_PRESENTATION_VERSION,
    surface: "conversation",
    assistant_label: "Lime",
    persona_id: IMAGE_TASK_PERSONA_ID,
    opening_guidance: {
      source: "model_stream",
      tone: "natural_minimal",
      max_lines_before_tool: 2,
      avoid_fixed_templates: true,
      avoid_visible_process_lines: true,
    },
    assistant_intro_request: {
      source: "model_generated_before_tool",
      mode: params.mode,
      prompt_intent: promptIntent,
      max_lines: 2,
      avoid_fixed_templates: true,
      avoid_runtime_details: true,
    },
    completion_caption_request: {
      source: "model_generated_at_tool_call",
      mode: params.mode,
      prompt_intent: promptIntent,
      max_lines: 2,
      invite_iteration: true,
      avoid_fixed_templates: true,
      avoid_runtime_details: true,
    },
    message_contract: {
      single_assistant_message: true,
      preserve_intro_during_stream: true,
      prefer_model_stream_text: true,
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
    prompt_intent: resolveImageTaskPromptSubject(params.prompt),
    reference_image_count: params.referenceImageCount,
    reference_summaries: referenceSummaries,
    style_keywords: [],
    avoid_keywords: [],
    cold_start_policy: "use_platform_baseline_without_explaining_it",
    tool_parameter_policy: "taste_only_changes_prompt_and_style_fields",
    chat_policy: "do_not_explain_taste_sources_in_conversation",
  };
}
