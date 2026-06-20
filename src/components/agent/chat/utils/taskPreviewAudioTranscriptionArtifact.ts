import { ARTIFACT_DOCUMENT_SCHEMA_VERSION } from "@/lib/artifact-document/types";
import type { MessageGenericTaskPreview } from "../types";
import {
  countTranscriptSpeakers,
  formatTranscriptSegmentRange,
  normalizeTranscriptSegments,
} from "./transcriptSegments";
import {
  resolveAudioTaskArtifactBody,
  resolveAudioTaskArtifactCalloutTitle,
  resolveAudioTaskArtifactFallbackSummary,
  resolveAudioTaskArtifactHeroEyebrow,
  resolveAudioTaskArtifactHeroSummary,
  resolveAudioTaskArtifactSourceHeading,
  resolveAudioTaskArtifactTitle,
  resolveAudioTaskFallbackPrompt,
  resolveTaskPreviewArtifactDuration,
  resolveTaskPreviewArtifactErrorCode,
  resolveTaskPreviewArtifactErrorReason,
  resolveTaskPreviewArtifactFormat,
  resolveTaskPreviewArtifactLanguage,
  resolveTaskPreviewArtifactModel,
  resolveTaskPreviewArtifactSegmentCount,
  resolveTaskPreviewArtifactSpeakerCount,
  resolveTaskPreviewArtifactStatus,
  resolveTaskPreviewArtifactVoice,
  resolveTaskPreviewArtifactWordCount,
  resolveTaskPreviewDurationMsLabel,
  resolveTaskPreviewLocale,
  resolveTranscriptionTaskArtifactBody,
  resolveTranscriptionTaskArtifactCalloutTitle,
  resolveTranscriptionTaskArtifactFallbackSummary,
  resolveTranscriptionTaskArtifactHeroEyebrow,
  resolveTranscriptionTaskArtifactHeroSummary,
  resolveTranscriptionTaskArtifactLoadedBody,
  resolveTranscriptionTaskArtifactOutputPath,
  resolveTranscriptionTaskArtifactSourceFallback,
  resolveTranscriptionTaskArtifactSourceHeading,
  resolveTranscriptionTaskArtifactTextTitle,
  resolveTranscriptionTaskArtifactTimelineTitle,
  resolveTranscriptionTaskArtifactTitle,
  resolveTranscriptionTaskFallbackPrompt,
  resolveTranscriptionTaskSegmentColumnContent,
  resolveTranscriptionTaskSegmentColumnSpeaker,
  resolveTranscriptionTaskSegmentColumnTime,
  resolveTranscriptionTaskSegmentSpeakerFallback,
} from "./taskPreviewCopy";

export function buildAudioTaskArtifactDocument(
  preview: MessageGenericTaskPreview,
) {
  const taskFilePath = preview.taskFilePath?.trim();
  const audioUrl = preview.audioUrl?.trim();
  const errorCode = preview.errorCode?.trim();
  const errorMessage = preview.errorMessage?.trim();
  const durationLabel = resolveTaskPreviewDurationMsLabel(
    preview.durationMs || undefined,
  );
  const highlights = [
    preview.status === "running"
      ? resolveTaskPreviewArtifactStatus("pending")
      : resolveTaskPreviewArtifactStatus(preview.status),
    preview.voice?.trim()
      ? resolveTaskPreviewArtifactVoice(preview.voice.trim())
      : null,
    preview.model?.trim()
      ? resolveTaskPreviewArtifactModel(preview.model.trim())
      : null,
    errorCode ? resolveTaskPreviewArtifactErrorCode(errorCode) : null,
    durationLabel ? resolveTaskPreviewArtifactDuration(durationLabel) : null,
  ].filter((item): item is string => Boolean(item));
  const audioOutputTone =
    preview.status === "failed"
      ? ("danger" as const)
      : audioUrl
        ? ("success" as const)
        : ("info" as const);
  const audioOutputBody = resolveAudioTaskArtifactBody({
    status: preview.status,
    statusMessage: preview.statusMessage,
    audioUrl,
    errorCode,
    errorMessage,
  });

  return {
    schemaVersion: ARTIFACT_DOCUMENT_SCHEMA_VERSION,
    artifactId: `audio-generate:${preview.taskId}`,
    kind: "brief" as const,
    title: preview.title?.trim() || resolveAudioTaskArtifactTitle(),
    status:
      preview.status === "failed"
        ? ("failed" as const)
        : preview.status === "complete" || preview.status === "partial"
          ? ("ready" as const)
          : ("streaming" as const),
    language: resolveTaskPreviewLocale(),
    summary:
      preview.status === "running"
        ? resolveAudioTaskArtifactFallbackSummary("running")
        : preview.statusMessage || resolveAudioTaskArtifactFallbackSummary(),
    blocks: [
      {
        id: "hero",
        type: "hero_summary" as const,
        eyebrow: resolveAudioTaskArtifactHeroEyebrow(),
        title: preview.prompt || resolveAudioTaskFallbackPrompt(),
        summary:
          preview.statusMessage || resolveAudioTaskArtifactHeroSummary(),
        highlights,
      },
      {
        id: "source-text",
        type: "rich_text" as const,
        contentFormat: "markdown" as const,
        content: preview.sourceText || preview.prompt,
        markdown: `### ${resolveAudioTaskArtifactSourceHeading()}\n\n${
          preview.sourceText || preview.prompt
        }`,
        text: preview.sourceText || preview.prompt,
      },
      {
        id: "audio-output",
        type: "callout" as const,
        tone: audioOutputTone,
        title: resolveAudioTaskArtifactCalloutTitle({
          status: preview.status,
          hasAudioUrl: Boolean(audioUrl),
        }),
        body: audioOutputBody,
      },
    ],
    sources: taskFilePath
      ? [
          {
            id: "audio-task-file",
            type: "file" as const,
            label: "audio_generate task file",
            locator: {
              path: taskFilePath,
            },
            reliability: "primary" as const,
          },
        ]
      : [],
    metadata: {
      generatedBy: "agent" as const,
      rendererHints: {
        density: "comfortable" as const,
      },
      taskId: preview.taskId,
      taskType: "audio_generate",
      taskFilePath,
      audioUrl: audioUrl || null,
      mimeType: preview.mimeType || null,
      durationMs: preview.durationMs || null,
      voice: preview.voice || null,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      modalityContractKey: "voice_generation",
    },
  };
}
export function buildTranscriptionTaskArtifactDocument(
  preview: MessageGenericTaskPreview,
) {
  const taskFilePath = preview.taskFilePath?.trim();
  const transcriptPath = preview.transcriptPath?.trim();
  const transcriptText =
    typeof preview.transcriptText === "string" && preview.transcriptText.trim()
      ? preview.transcriptText
      : null;
  const sourcePath = preview.sourcePath?.trim();
  const sourceUrl = preview.sourceUrl?.trim();
  const errorCode = preview.errorCode?.trim();
  const errorMessage = preview.errorMessage?.trim();
  const transcriptSegments = normalizeTranscriptSegments(
    preview.transcriptSegments || [],
  );
  const speakerCount = countTranscriptSpeakers(transcriptSegments);
  const highlights = [
    preview.status === "running"
      ? resolveTaskPreviewArtifactStatus("pending_transcription")
      : resolveTaskPreviewArtifactStatus(preview.status),
    preview.language?.trim()
      ? resolveTaskPreviewArtifactLanguage(preview.language.trim())
      : null,
    preview.outputFormat?.trim()
      ? resolveTaskPreviewArtifactFormat(preview.outputFormat.trim())
      : null,
    preview.model?.trim()
      ? resolveTaskPreviewArtifactModel(preview.model.trim())
      : null,
    transcriptSegments.length > 0
      ? resolveTaskPreviewArtifactSegmentCount(transcriptSegments.length)
      : null,
    speakerCount > 0
      ? resolveTaskPreviewArtifactSpeakerCount(speakerCount)
      : null,
    transcriptText
      ? resolveTaskPreviewArtifactWordCount(transcriptText.trim().length)
      : null,
    errorCode ? resolveTaskPreviewArtifactErrorCode(errorCode) : null,
  ].filter((item): item is string => Boolean(item));
  const sourceLabel =
    sourcePath ||
    sourceUrl ||
    preview.prompt ||
    resolveTranscriptionTaskArtifactSourceFallback();
  const transcriptTone =
    preview.status === "failed"
      ? ("danger" as const)
      : transcriptPath
        ? ("success" as const)
        : ("info" as const);
  const transcriptBody =
    preview.status === "failed"
      ? [
          preview.statusMessage?.trim(),
          errorCode ? resolveTaskPreviewArtifactErrorCode(errorCode) : null,
          errorMessage
            ? resolveTaskPreviewArtifactErrorReason(errorMessage)
            : null,
        ]
          .filter((item): item is string => Boolean(item))
          .join("\n")
      : transcriptPath
        ? transcriptText
          ? resolveTranscriptionTaskArtifactLoadedBody(transcriptPath)
          : resolveTranscriptionTaskArtifactOutputPath(transcriptPath)
        : resolveTranscriptionTaskArtifactBody();

  const transcriptBlocks = transcriptText
    ? [
        {
          id: "transcript-text",
          type: "code_block" as const,
          title: resolveTranscriptionTaskArtifactTextTitle(),
          language: "text",
          code: transcriptText,
        },
      ]
    : [];
  const segmentBlocks =
    transcriptSegments.length > 0
      ? [
          {
            id: "transcript-segments",
            type: "table" as const,
            title: resolveTranscriptionTaskArtifactTimelineTitle(),
            columns: [
              resolveTranscriptionTaskSegmentColumnTime(),
              resolveTranscriptionTaskSegmentColumnSpeaker(),
              resolveTranscriptionTaskSegmentColumnContent(),
            ],
            rows: transcriptSegments.map((segment) => [
              formatTranscriptSegmentRange(segment),
              segment.speaker?.trim() ||
                resolveTranscriptionTaskSegmentSpeakerFallback(),
              segment.text,
            ]),
          },
        ]
      : [];

  return {
    schemaVersion: ARTIFACT_DOCUMENT_SCHEMA_VERSION,
    artifactId: `transcription-generate:${preview.taskId}`,
    kind: "brief" as const,
    title: preview.title?.trim() || resolveTranscriptionTaskArtifactTitle(),
    status:
      preview.status === "failed"
        ? ("failed" as const)
        : preview.status === "complete" || preview.status === "partial"
          ? ("ready" as const)
          : ("streaming" as const),
    language: resolveTaskPreviewLocale(),
    summary:
      preview.status === "running"
        ? resolveTranscriptionTaskArtifactFallbackSummary("running")
        : preview.statusMessage ||
          resolveTranscriptionTaskArtifactFallbackSummary(),
    blocks: [
      {
        id: "hero",
        type: "hero_summary" as const,
        eyebrow: resolveTranscriptionTaskArtifactHeroEyebrow(),
        title: preview.prompt || resolveTranscriptionTaskFallbackPrompt(),
        summary:
          preview.statusMessage || resolveTranscriptionTaskArtifactHeroSummary(),
        highlights,
      },
      {
        id: "source",
        type: "rich_text" as const,
        contentFormat: "markdown" as const,
        content: sourceLabel,
        markdown: `### ${resolveTranscriptionTaskArtifactSourceHeading()}\n\n${sourceLabel}`,
        text: sourceLabel,
      },
      ...segmentBlocks,
      ...transcriptBlocks,
      {
        id: "transcript-output",
        type: "callout" as const,
        tone: transcriptTone,
        title: resolveTranscriptionTaskArtifactCalloutTitle({
          status: preview.status,
          hasTranscriptPath: Boolean(transcriptPath),
        }),
        body: transcriptBody,
      },
    ],
    sources: [
      taskFilePath
        ? {
            id: "transcription-task-file",
            type: "file" as const,
            label: "transcription_generate task file",
            locator: {
              path: taskFilePath,
            },
            reliability: "primary" as const,
          }
        : null,
      transcriptPath
        ? {
            id: "transcript-file",
            type: "file" as const,
            label: "transcript output",
            locator: {
              path: transcriptPath,
            },
            reliability: "primary" as const,
          }
        : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    metadata: {
      generatedBy: "agent" as const,
      rendererHints: {
        density: "comfortable" as const,
      },
      taskId: preview.taskId,
      taskType: "transcription_generate",
      taskFilePath,
      transcriptPath: transcriptPath || null,
      sourcePath: sourcePath || null,
      sourceUrl: sourceUrl || null,
      language: preview.language || null,
      outputFormat: preview.outputFormat || null,
      transcriptText: transcriptText || null,
      transcriptSegments,
      transcriptCorrectionEnabled: Boolean(
        transcriptText || transcriptSegments.length > 0,
      ),
      transcriptCorrectionStatus:
        transcriptText || transcriptSegments.length > 0
          ? "available"
          : "waiting_transcript",
      transcriptCorrectionSource: "artifact_document_version",
      transcriptCorrectionPatchKind: "artifact_document_version",
      transcriptCorrectionOriginalImmutable: true,
      providerId: preview.providerId || null,
      model: preview.model || null,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      modalityContractKey: "audio_transcription",
    },
  };
}
