import { extractArtifactProtocolPathsFromValue } from "@/lib/artifact-protocol";
import type {
  MessageGenericTaskPreview,
  MessageTaskPreview,
} from "../types";
import {
  buildAudioTaskPreviewFromToolResult,
  buildAudioToolResultArtifactFromToolResult,
  buildTranscriptionTaskPreviewFromToolResult,
  buildTranscriptionToolResultArtifactFromToolResult,
} from "./taskPreviewAudioTranscription";
import {
  resolveGenericTaskCandidateCount,
  resolveGenericTaskDurationMinutes,
  resolveGenericTaskFallbackPrompt,
  resolveGenericTaskStatusMessage,
} from "./taskPreviewCopy";
import {
  buildWebImageSearchArtifactFromToolResult,
  buildWebImageSearchTaskPreviewFromToolResult,
} from "./taskPreviewWebImageSearch";
import {
  asRecord,
  readMetadataPositiveNumber,
  readMetadataString,
  resolveTaskPreviewPhase,
  resolveTaskPreviewStatus,
  type ToolResultPreviewParams,
} from "./taskPreviewToolResultShared";
import { buildVideoTaskPreviewFromToolResult } from "./taskPreviewVideo";

export {
  buildAudioTaskArtifactDocument,
  buildTranscriptionTaskArtifactDocument,
} from "./taskPreviewAudioTranscriptionArtifact";
export { buildImageTaskPreviewFromToolResult } from "./taskPreviewImage";

const GENERIC_TASK_KINDS = new Set<MessageGenericTaskPreview["kind"]>([
  "broadcast_generate",
  "modal_resource_search",
  "url_parse",
  "typesetting",
]);

function extractGenericTaskArguments(toolArguments: string | undefined): {
  prompt?: string;
  title?: string;
  query?: string;
  resourceType?: string;
  usage?: string;
  count?: number;
  targetPlatform?: string;
  sourcePath?: string;
  sourceUrl?: string;
  language?: string;
  outputFormat?: string;
  sourceText?: string;
  voice?: string;
  voiceStyle?: string;
  targetLanguage?: string;
  audioPath?: string;
  mimeType?: string;
  durationMs?: number;
} {
  if (!toolArguments) {
    return {};
  }

  try {
    const parsed = JSON.parse(toolArguments) as Record<string, unknown>;
    return {
      prompt: readMetadataString([parsed], ["prompt", "content"]),
      title: readMetadataString([parsed], ["title"]),
      query: readMetadataString([parsed], ["query"]),
      resourceType: readMetadataString(
        [parsed],
        ["resource_type", "resourceType"],
      ),
      usage: readMetadataString([parsed], ["usage"]),
      count: readMetadataPositiveNumber([parsed], ["count"]),
      targetPlatform: readMetadataString(
        [parsed],
        ["target_platform", "targetPlatform"],
      ),
      sourcePath: readMetadataString([parsed], ["source_path", "sourcePath"]),
      sourceUrl: readMetadataString([parsed], ["source_url", "sourceUrl"]),
      language: readMetadataString(
        [parsed],
        ["language", "target_language", "targetLanguage"],
      ),
      outputFormat: readMetadataString(
        [parsed],
        ["output_format", "outputFormat", "format"],
      ),
      sourceText: readMetadataString(
        [parsed],
        ["source_text", "sourceText", "text"],
      ),
      voice: readMetadataString([parsed], ["voice"]),
      voiceStyle: readMetadataString([parsed], ["voice_style", "voiceStyle"]),
      targetLanguage: readMetadataString(
        [parsed],
        ["target_language", "targetLanguage"],
      ),
      audioPath: readMetadataString(
        [parsed],
        ["audio_path", "audioPath", "audio_url", "audioUrl"],
      ),
      mimeType: readMetadataString([parsed], ["mime_type", "mimeType"]),
      durationMs: readMetadataPositiveNumber(
        [parsed],
        ["duration_ms", "durationMs"],
      ),
    };
  } catch {
    return {};
  }
}

function buildGenericTaskMetaItems(
  kind: MessageGenericTaskPreview["kind"],
  taskArguments: ReturnType<typeof extractGenericTaskArguments>,
  candidates: Array<Record<string, unknown> | null | undefined>,
): string[] {
  const items = new Set<string>();
  const push = (value?: string | number) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      items.add(String(value));
      return;
    }
    if (typeof value === "string" && value.trim()) {
      items.add(value.trim());
    }
  };

  if (kind === "modal_resource_search") {
    push(taskArguments.resourceType);
    push(taskArguments.usage);
    if (taskArguments.count) {
      push(resolveGenericTaskCandidateCount(taskArguments.count));
    }
  } else if (kind === "broadcast_generate") {
    push(readMetadataString(candidates, ["audience", "tone"]));
    const durationMinutes = readMetadataPositiveNumber(candidates, [
      "duration_hint_minutes",
      "durationHintMinutes",
    ]);
    if (durationMinutes) {
      push(resolveGenericTaskDurationMinutes(durationMinutes));
    }
  } else if (kind === "url_parse") {
    push(taskArguments.sourceUrl || readMetadataString(candidates, ["url"]));
  } else if (kind === "typesetting") {
    push(taskArguments.targetPlatform);
  }

  return Array.from(items);
}


function buildGenericTaskPreviewFromToolResult(
  params: ToolResultPreviewParams,
): MessageGenericTaskPreview | null {
  const resultRecord = asRecord(params.toolResult);
  const metadata = asRecord(resultRecord?.metadata);
  const taskResult = asRecord(resultRecord?.result);
  const taskId = readMetadataString(
    [metadata, resultRecord, taskResult],
    ["task_id", "taskId", "id"],
  );
  const taskType = readMetadataString(
    [metadata, resultRecord, taskResult],
    ["task_type", "taskType"],
  );
  if (!taskId || !taskType) {
    return null;
  }

  const normalizedTaskType = taskType.trim().toLowerCase();
  if (
    !GENERIC_TASK_KINDS.has(
      normalizedTaskType as MessageGenericTaskPreview["kind"],
    )
  ) {
    return null;
  }

  const kind = normalizedTaskType as MessageGenericTaskPreview["kind"];
  const parsedArguments = extractGenericTaskArguments(params.toolArguments);
  const status = readMetadataString(
    [metadata, resultRecord, taskResult],
    ["status"],
  );
  const artifactPath =
    extractArtifactProtocolPathsFromValue(resultRecord)[0] ||
    extractArtifactProtocolPathsFromValue(taskResult)[0] ||
    extractArtifactProtocolPathsFromValue(metadata)[0] ||
    null;
  const taskFilePath =
    readMetadataString(
      [metadata, resultRecord, taskResult],
      ["artifact_path", "artifactPath"],
    ) ||
    readMetadataString(
      [metadata, resultRecord, taskResult],
      ["path", "absolute_path", "absolutePath"],
    ) ||
    artifactPath ||
    null;
  const prompt =
    parsedArguments.prompt ||
    parsedArguments.query ||
    parsedArguments.title ||
    readMetadataString(
      [metadata, resultRecord, taskResult],
      ["prompt", "query", "title"],
    ) ||
    params.fallbackPrompt.trim() ||
    resolveGenericTaskFallbackPrompt();
  const candidates = [metadata, resultRecord, taskResult];
  const metaItems = buildGenericTaskMetaItems(
    kind,
    parsedArguments,
    candidates,
  );

  return {
    kind,
    taskId,
    taskType: kind,
    prompt,
    title:
      parsedArguments.title ||
      readMetadataString([metadata, resultRecord, taskResult], ["title"]),
    status: resolveTaskPreviewStatus(status),
    projectId:
      readMetadataString(
        [metadata, resultRecord, taskResult],
        ["project_id", "projectId"],
      ) || null,
    contentId:
      readMetadataString(
      [metadata, resultRecord, taskResult],
      ["content_id", "contentId"],
    ) || null,
    artifactPath,
    providerId:
      readMetadataString(
        [metadata, resultRecord, taskResult],
        ["provider_id", "providerId", "provider"],
      ) || null,
    model:
      readMetadataString([metadata, resultRecord, taskResult], ["model"]) ||
      null,
    phase: resolveTaskPreviewPhase(status),
    statusMessage: resolveGenericTaskStatusMessage(
      kind,
      resolveTaskPreviewStatus(status),
    ),
    metaItems,
    imageCandidates: kind === "modal_resource_search" ? [] : undefined,
    taskFilePath,
  };
}

export function buildToolResultArtifactFromToolResult(
  params: ToolResultPreviewParams,
): {
  filePath: string;
  content: string;
  metadata: Record<string, unknown>;
} | null {
  return (
    buildAudioToolResultArtifactFromToolResult(params) ||
    buildTranscriptionToolResultArtifactFromToolResult(params) ||
    buildWebImageSearchArtifactFromToolResult(params)
  );
}

export function buildTaskPreviewFromToolResult(
  params: ToolResultPreviewParams,
): MessageTaskPreview | null {
  return (
    buildVideoTaskPreviewFromToolResult(params) ||
    buildAudioTaskPreviewFromToolResult(params) ||
    buildTranscriptionTaskPreviewFromToolResult(params) ||
    buildWebImageSearchTaskPreviewFromToolResult(params) ||
    buildGenericTaskPreviewFromToolResult(params)
  );
}
