import type { MessageGenericTaskPreview } from "../types";
import {
  extractTranscriptSegmentsFromRecords,
  normalizeTranscriptSegments,
  parseTranscriptContent,
} from "./transcriptSegments";
import {
  resolveAudioTaskArtifactTitle,
  resolveAudioTaskFallbackPrompt,
  resolveAudioTaskPreviewFallbackText,
  resolveGenericTaskStatusMessage,
  resolveTaskPreviewDurationMsLabel,
  resolveTranscriptionTaskFallbackPrompt,
  resolveTranscriptionTaskPreviewFallbackText,
} from "./taskPreviewCopy";
import {
  buildAudioTaskArtifactDocument,
  buildTranscriptionTaskArtifactDocument,
} from "./taskPreviewAudioTranscriptionArtifact";

interface ToolResultPreviewParams {
  toolId?: string;
  toolName: string;
  toolArguments: string | undefined;
  toolResult: Record<string, unknown> | undefined;
  fallbackPrompt: string;
}

const AUDIO_TASK_PREVIEW_ARTIFACT_ROOT = ".lime/runtime/audio-generate";
const TRANSCRIPTION_TASK_PREVIEW_ARTIFACT_ROOT =
  ".lime/runtime/transcription-generate";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readMetadataString(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return undefined;
}

function readMetadataPositiveNumber(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): number | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }
  return undefined;
}

function extractTaskArguments(toolArguments: string | undefined): {
  prompt?: string;
  title?: string;
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

function buildPreviewId(value: string | undefined, fallback: string): string {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildAudioTaskPreviewArtifactPath(taskId: string): string {
  return `${AUDIO_TASK_PREVIEW_ARTIFACT_ROOT}/${buildPreviewId(
    taskId,
    "audio-task",
  )}.md`;
}

function buildTranscriptionTaskPreviewArtifactPath(taskId: string): string {
  return `${TRANSCRIPTION_TASK_PREVIEW_ARTIFACT_ROOT}/${buildPreviewId(
    taskId,
    "transcription-task",
  )}.md`;
}

function resolveTaskPreviewStatus(
  status: string | undefined,
): MessageGenericTaskPreview["status"] {
  switch ((status || "").trim().toLowerCase()) {
    case "completed":
    case "success":
    case "succeeded":
      return "complete";
    case "partial":
      return "partial";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "running":
    case "processing":
    case "in_progress":
    case "queued":
    case "pending_submit":
    case "pending":
    default:
      return "running";
  }
}

function resolveTaskPreviewPhase(status: string | undefined): string {
  switch ((status || "").trim().toLowerCase()) {
    case "completed":
    case "success":
    case "succeeded":
      return "succeeded";
    case "partial":
      return "partial";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "queued":
    case "pending_submit":
    case "pending":
      return "queued";
    case "running":
    case "processing":
    case "in_progress":
      return "running";
    default:
      return "queued";
  }
}

function buildAudioTaskMetaItems(
  taskArguments: ReturnType<typeof extractTaskArguments>,
  candidates: Array<Record<string, unknown> | null | undefined>,
): string[] {
  const items = new Set<string>();
  const push = (value?: string | number | null) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      items.add(String(value));
      return;
    }
    if (typeof value === "string" && value.trim()) {
      items.add(value.trim());
    }
  };

  push(
    taskArguments.voice ||
      readMetadataString(candidates, ["voice", "voice_preset", "voicePreset"]),
  );
  push(
    taskArguments.voiceStyle ||
      readMetadataString(candidates, ["voice_style", "voiceStyle"]),
  );
  push(
    taskArguments.targetLanguage ||
      readMetadataString(candidates, ["target_language", "targetLanguage"]),
  );
  push(
    taskArguments.mimeType ||
      readMetadataString(candidates, ["mime_type", "mimeType"]),
  );
  const durationMs =
    taskArguments.durationMs ||
    readMetadataPositiveNumber(candidates, ["duration_ms", "durationMs"]);
  push(resolveTaskPreviewDurationMsLabel(durationMs));

  return Array.from(items);
}

function buildTranscriptionTaskMetaItems(
  taskArguments: ReturnType<typeof extractTaskArguments>,
  candidates: Array<Record<string, unknown> | null | undefined>,
): string[] {
  const items = new Set<string>();
  const push = (value?: string | null) => {
    if (typeof value === "string" && value.trim()) {
      items.add(value.trim());
    }
  };

  push(taskArguments.sourcePath || taskArguments.sourceUrl);
  push(
    taskArguments.language ||
      taskArguments.targetLanguage ||
      readMetadataString(candidates, ["language", "target_language"]),
  );
  push(
    taskArguments.outputFormat ||
      readMetadataString(candidates, ["output_format", "outputFormat", "format"]),
  );

  return Array.from(items);
}

export function buildAudioTaskPreviewFromToolResult(
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
    normalizedTaskType !== "audio_generate" &&
    normalizedTaskType !== "voice_generate" &&
    normalizedTaskType !== "voice"
  ) {
    return null;
  }

  const parsedArguments = extractTaskArguments(params.toolArguments);
  const status = readMetadataString(
    [metadata, resultRecord, taskResult],
    ["status"],
  );
  const previewStatus = resolveTaskPreviewStatus(status);
  const candidates = [metadata, resultRecord, taskResult];
  const sourceText =
    parsedArguments.sourceText ||
    readMetadataString(candidates, ["source_text", "sourceText", "prompt"]) ||
    params.fallbackPrompt.trim() ||
    resolveAudioTaskFallbackPrompt();
  const taskFilePath =
    readMetadataString(candidates, ["artifact_path", "artifactPath"]) ||
    readMetadataString(candidates, ["path", "absolute_path", "absolutePath"]) ||
    null;
  const audioUrl =
    parsedArguments.audioPath ||
    readMetadataString(candidates, [
      "audio_path",
      "audioPath",
      "audio_url",
      "audioUrl",
      "url",
      "result_url",
      "resultUrl",
    ]) ||
    null;
  const durationMs =
    parsedArguments.durationMs ||
    readMetadataPositiveNumber(candidates, ["duration_ms", "durationMs"]) ||
    null;
  const mimeType =
    parsedArguments.mimeType ||
    readMetadataString(candidates, ["mime_type", "mimeType"]) ||
    null;
  const voice =
    parsedArguments.voice || readMetadataString(candidates, ["voice"]) || null;

  return {
    kind: "audio_generate",
    taskId,
    taskType: "audio_generate",
    prompt: sourceText,
    title:
      parsedArguments.title ||
      readMetadataString(candidates, ["title"]) ||
      resolveAudioTaskArtifactTitle(),
    status: previewStatus,
    projectId:
      readMetadataString(candidates, ["project_id", "projectId"]) || null,
    contentId:
      readMetadataString(candidates, ["content_id", "contentId"]) || null,
    artifactPath: buildAudioTaskPreviewArtifactPath(taskId),
    taskFilePath,
    providerId:
      readMetadataString(candidates, [
        "provider_id",
        "providerId",
        "provider",
      ]) || null,
    model: readMetadataString(candidates, ["model"]) || null,
    phase: resolveTaskPreviewPhase(status),
    statusMessage: resolveGenericTaskStatusMessage(
      "audio_generate",
      previewStatus,
    ),
    metaItems: buildAudioTaskMetaItems(parsedArguments, candidates),
    audioUrl,
    mimeType,
    durationMs,
    sourceText,
    voice,
  };
}

export function buildTranscriptionTaskPreviewFromToolResult(
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
  if (normalizedTaskType !== "transcription_generate") {
    return null;
  }

  const parsedArguments = extractTaskArguments(params.toolArguments);
  const status = readMetadataString(
    [metadata, resultRecord, taskResult],
    ["status"],
  );
  const transcriptRecordCandidates = [
    metadata,
    resultRecord,
    taskResult,
    asRecord(metadata?.transcript),
    asRecord(resultRecord?.transcript),
    asRecord(taskResult?.transcript),
  ];
  const rawTranscriptText =
    readMetadataString(transcriptRecordCandidates, [
      "transcript_text",
      "transcriptText",
      "text",
    ]) || null;
  const parsedTranscript = parseTranscriptContent(rawTranscriptText);
  const extractedTranscriptSegments = extractTranscriptSegmentsFromRecords(
    transcriptRecordCandidates,
  );
  const transcriptSegments =
    extractedTranscriptSegments.length > 0
      ? extractedTranscriptSegments
      : parsedTranscript.segments;
  const candidates = [metadata, resultRecord, taskResult];

  return {
    kind: "transcription_generate",
    taskId,
    taskType: "transcription_generate",
    prompt:
      parsedArguments.prompt ||
      readMetadataString(candidates, ["prompt", "query", "title"]) ||
      params.fallbackPrompt.trim() ||
      resolveTranscriptionTaskFallbackPrompt(),
    title:
      parsedArguments.title ||
      readMetadataString(candidates, ["title"]) ||
      undefined,
    status: resolveTaskPreviewStatus(status),
    projectId:
      readMetadataString(candidates, ["project_id", "projectId"]) || null,
    contentId:
      readMetadataString(candidates, ["content_id", "contentId"]) || null,
    artifactPath: buildTranscriptionTaskPreviewArtifactPath(taskId),
    providerId:
      readMetadataString(candidates, [
        "provider_id",
        "providerId",
        "provider",
      ]) || null,
    model: readMetadataString(candidates, ["model"]) || null,
    phase: resolveTaskPreviewPhase(status),
    statusMessage: resolveGenericTaskStatusMessage(
      "transcription_generate",
      resolveTaskPreviewStatus(status),
    ),
    metaItems: buildTranscriptionTaskMetaItems(parsedArguments, candidates),
    taskFilePath:
      readMetadataString(candidates, ["artifact_path", "artifactPath"]) ||
      readMetadataString(candidates, ["path", "absolute_path", "absolutePath"]) ||
      null,
    sourcePath:
      parsedArguments.sourcePath ||
      readMetadataString(candidates, ["source_path", "sourcePath"]) ||
      null,
    sourceUrl:
      parsedArguments.sourceUrl ||
      readMetadataString(candidates, ["source_url", "sourceUrl"]) ||
      null,
    language:
      parsedArguments.language ||
      parsedArguments.targetLanguage ||
      readMetadataString(candidates, [
        "language",
        "target_language",
        "targetLanguage",
      ]) ||
      null,
    outputFormat:
      parsedArguments.outputFormat ||
      readMetadataString(candidates, ["output_format", "outputFormat", "format"]) ||
      null,
    transcriptPath:
      readMetadataString(candidates, ["transcript_path", "transcriptPath"]) ||
      null,
    transcriptText: parsedTranscript.text || rawTranscriptText || null,
    transcriptSegments: normalizeTranscriptSegments(transcriptSegments),
  };
}

export function buildAudioToolResultArtifactFromToolResult(
  params: ToolResultPreviewParams,
): {
  filePath: string;
  content: string;
  metadata: Record<string, unknown>;
} | null {
  const audioPreview = buildAudioTaskPreviewFromToolResult(params);
  if (!audioPreview) {
    return null;
  }

  const artifactPath =
    audioPreview.artifactPath ||
    buildAudioTaskPreviewArtifactPath(audioPreview.taskId);
  return {
    filePath: artifactPath,
    content: "",
    metadata: {
      artifactDocument: buildAudioTaskArtifactDocument(audioPreview),
      artifact_type: "document",
      previewText:
        audioPreview.statusMessage || resolveAudioTaskPreviewFallbackText(),
      taskId: audioPreview.taskId,
      taskType: "audio_generate",
      taskFilePath: audioPreview.taskFilePath || null,
      audioUrl: audioPreview.audioUrl || null,
      modalityContractKey: "voice_generation",
    },
  };
}

export function buildTranscriptionToolResultArtifactFromToolResult(
  params: ToolResultPreviewParams,
): {
  filePath: string;
  content: string;
  metadata: Record<string, unknown>;
} | null {
  const taskPreview = buildTranscriptionTaskPreviewFromToolResult(params);
  if (!taskPreview) {
    return null;
  }

  const artifactPath =
    taskPreview.artifactPath ||
    buildTranscriptionTaskPreviewArtifactPath(taskPreview.taskId);
  return {
    filePath: artifactPath,
    content: "",
    metadata: {
      artifactDocument: buildTranscriptionTaskArtifactDocument(taskPreview),
      artifact_type: "document",
      previewText:
        taskPreview.statusMessage ||
        resolveTranscriptionTaskPreviewFallbackText(),
      taskId: taskPreview.taskId,
      taskType: "transcription_generate",
      taskFilePath: taskPreview.taskFilePath || null,
      transcriptPath: taskPreview.transcriptPath || null,
      transcriptText: taskPreview.transcriptText || null,
      transcriptSegments: taskPreview.transcriptSegments || [],
      transcriptCorrectionEnabled: Boolean(
        taskPreview.transcriptText ||
          (taskPreview.transcriptSegments || []).length > 0,
      ),
      transcriptCorrectionStatus:
        taskPreview.transcriptText ||
        (taskPreview.transcriptSegments || []).length > 0
          ? "available"
          : "waiting_transcript",
      transcriptCorrectionSource: "artifact_document_version",
      transcriptCorrectionPatchKind: "artifact_document_version",
      transcriptCorrectionOriginalImmutable: true,
      sourcePath: taskPreview.sourcePath || null,
      sourceUrl: taskPreview.sourceUrl || null,
      language: taskPreview.language || null,
      outputFormat: taskPreview.outputFormat || null,
      modalityContractKey: "audio_transcription",
    },
  };
}
