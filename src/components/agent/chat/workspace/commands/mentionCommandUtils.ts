/**
 * Mention 命令工具函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于处理 mention 命令的 replay text 和 slot 值。
 *
 * @module mentionCommandUtils
 */

import type {
  ServiceSkillHomeItem,
  ServiceSkillSlotValues,
} from "../../service-skills/types";

export type CompletedMentionUsage = {
  skillId: string;
  runnerType: ServiceSkillHomeItem["runnerType"];
  slotValues?: ServiceSkillSlotValues;
  launchUserInput?: string;
};
import {
  buildMentionCommandReplayText,
  resolveMentionCommandPrefillReplayText,
} from "../../utils/mentionCommandReplayText";
import {
  resolveMentionCommandPrefixMatch,
} from "../../utils/mentionCommandPrefixMatch";
import {
  getMentionEntryUsageMap,
  getMentionEntryUsageRecordKey,
} from "../../skill-selection/mentionEntryUsage";
import {
  normalizeOptionalText,
} from "./commandRecentDefaults";
import {
  asRecord,
  pickUsageSlotValues,
  resolveLaunchScopedRequestContext,
} from "./skillSlotUtils";
import { MODEL_SKILL_LAUNCH_DESCRIPTORS } from "../modelSkillLaunchDescriptors";

export const MENTION_USAGE_REQUEST_FIELDS: Readonly<
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
    "title",
    "audience",
    "tone",
    "platform",
    "length_hint",
  ],
  channel_preview_task: ["prompt", "platform_label", "content"],
  upload_task: [
    "prompt",
    "platform_type",
    "platform_label",
    "content",
    "intent",
  ],
  writing_task: [
    "prompt",
    "platform_label",
    "draft_kind",
    "content",
    "intent",
  ],
  growth_task: [
    "prompt",
    "platform",
    "account_list",
    "report_cadence",
    "alert_threshold",
  ],
  file_read_task: [
    "source_path",
    "prompt",
    "focus",
    "length",
    "style",
    "output_format",
  ],
  cover_skill_launch: [
    "prompt",
    "title",
    "platform",
    "size",
    "style",
    "layout_hint",
  ],
  video_skill_launch: [
    "prompt",
    "duration",
    "aspect_ratio",
    "resolution",
    "style",
  ],
  pdf_extract: [
    "source_path",
    "source_url",
    "prompt",
    "focus",
    "output_format",
  ],
  web_research: [
    "prompt",
    "query",
    "site",
    "time_range",
    "depth",
    "focus",
    "output_format",
  ],
  voice_generation: [
    "prompt",
    "source_text",
    "target_language",
    "voice_style",
    "reference_video",
  ],
  compliance_review: [
    "prompt",
    "content",
    "focus",
    "style",
    "output_format",
  ],
  competitor_analysis: [
    "prompt",
    "competitor_url",
    "focus",
    "depth",
    "output_format",
  ],
  search: ["prompt", "query", "site", "time_range", "depth", "output_format"],
  content_post: [
    "prompt",
    "content",
    "platform_type",
    "platform_label",
    "intent",
  ],
  query: [
    "prompt",
    "query",
    "usage",
    "count",
  ],
  resource_search_task: [
    "prompt",
    "query",
    "usage",
    "count",
    "resource_type",
    "title",
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

export function resolveMentionCommandUsageSlotValues(
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

export function resolveMentionCommandUsageLaunchUserInput(
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

export function resolveImageMentionCommandKey(
  parsedCommand: { commandKey?: string | null },
): string | null {
  return normalizeOptionalText(parsedCommand.commandKey) ?? null;
}

const MAX_MENTION_COMMAND_REPLAY_TEXT_LENGTH = 400;

export function normalizeMentionCommandReplayText(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, MAX_MENTION_COMMAND_REPLAY_TEXT_LENGTH).trim();
}

export function resolveMentionCommandReplayText(
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

export function resolveBareMentionCommandPrefillSourceText(
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

export function resolveMentionCommandUsage(params: {
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
