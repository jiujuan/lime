import { FALLBACK_LOCALE, normalizeLocale } from "@/i18n/locales";
import { resolveRequiredAgentChatCopy } from "./agentChatCopy";

export function resolveTaskPreviewLocale(): string {
  const documentLocale =
    typeof document !== "undefined" ? document.documentElement.lang : "";
  return normalizeLocale(documentLocale || FALLBACK_LOCALE);
}

export function resolveTaskPreviewDurationMsLabel(
  durationMs?: number,
): string | undefined {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return undefined;
  }
  if (durationMs < 60_000) {
    return resolveRequiredAgentChatCopy("taskPreview.duration.seconds", {
      seconds: Math.max(1, Math.round(durationMs / 1000)),
    });
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0
    ? resolveRequiredAgentChatCopy("taskPreview.duration.minutesSeconds", {
        minutes,
        seconds,
      })
    : resolveRequiredAgentChatCopy("taskPreview.duration.minutes", {
        minutes,
      });
}

export function resolveGenericTaskStatusMessage(
  kind: string,
  status: string,
): string {
  if (status === "cancelled") {
    return resolveRequiredAgentChatCopy("taskPreview.generic.status.cancelled");
  }

  const statusKey =
    status === "complete" || status === "partial"
      ? "complete"
      : status === "failed"
        ? "failed"
        : "running";
  return resolveRequiredAgentChatCopy(
    `taskPreview.generic.status.${statusKey}.${kind}`,
  );
}

export function resolveGenericTaskFallbackPrompt(): string {
  return resolveRequiredAgentChatCopy("taskPreview.generic.fallbackPrompt");
}

export function resolveGenericTaskCandidateCount(count: number): string {
  return resolveRequiredAgentChatCopy("taskPreview.generic.meta.candidates", {
    count,
  });
}

export function resolveGenericTaskDurationMinutes(minutes: number): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.generic.meta.durationMinutes",
    { minutes },
  );
}

export function resolveImageTaskFallbackPrompt(): string {
  return resolveRequiredAgentChatCopy("taskPreview.image.fallbackPrompt");
}

export function resolveImageTaskStatusMessage(params: {
  status: string;
  layoutHint?: string | null;
}): string {
  const isStoryboard = params.layoutHint === "storyboard_3x3";
  if (params.status === "complete") {
    return resolveRequiredAgentChatCopy(
      isStoryboard
        ? "taskPreview.image.status.complete.storyboard3x3"
        : "taskPreview.image.status.complete.default",
    );
  }
  if (params.status === "partial") {
    return resolveRequiredAgentChatCopy(
      isStoryboard
        ? "taskPreview.image.status.partial.storyboard3x3"
        : "taskPreview.image.status.partial.default",
    );
  }
  if (params.status === "failed") {
    return resolveRequiredAgentChatCopy("taskPreview.image.status.failed");
  }
  if (params.status === "cancelled") {
    return resolveRequiredAgentChatCopy("taskPreview.image.status.cancelled");
  }
  return resolveRequiredAgentChatCopy("taskPreview.image.status.running");
}

export function resolveVideoTaskFallbackPrompt(): string {
  return resolveRequiredAgentChatCopy("taskPreview.video.fallbackPrompt");
}

export function resolveVideoTaskStatusMessage(params: {
  status: string;
  phase?: string | null;
  hasVideoUrl: boolean;
  errorMessage?: string;
}): string {
  if (params.status === "complete") {
    return resolveRequiredAgentChatCopy(
      params.hasVideoUrl
        ? "taskPreview.video.status.complete.synced"
        : "taskPreview.video.status.complete.waitingResult",
    );
  }
  if (params.status === "partial") {
    return resolveRequiredAgentChatCopy(
      params.hasVideoUrl
        ? "taskPreview.video.status.partial.synced"
        : "taskPreview.video.status.partial.waitingResult",
    );
  }
  if (params.status === "failed") {
    return (
      params.errorMessage?.trim() ||
      resolveRequiredAgentChatCopy("taskPreview.video.status.failed")
    );
  }
  if (params.status === "cancelled") {
    return resolveRequiredAgentChatCopy("taskPreview.video.status.cancelled");
  }
  if (params.phase === "queued") {
    return resolveRequiredAgentChatCopy("taskPreview.video.status.queued");
  }
  return resolveRequiredAgentChatCopy("taskPreview.video.status.running");
}

export function resolveTaskPreviewArtifactStatus(status: string): string {
  return resolveRequiredAgentChatCopy(`taskPreview.artifact.status.${status}`, {
    status,
  });
}

export function resolveTaskPreviewArtifactVoice(voice: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.voice", { voice });
}

export function resolveTaskPreviewArtifactModel(model: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.model", { model });
}

export function resolveTaskPreviewArtifactDuration(duration: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.duration", {
    duration,
  });
}

export function resolveTaskPreviewArtifactErrorCode(errorCode: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.errorCode", {
    errorCode,
  });
}

export function resolveTaskPreviewArtifactErrorReason(reason: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.errorReason", {
    reason,
  });
}

export function resolveTaskPreviewArtifactLanguage(language: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.language", {
    language,
  });
}

export function resolveTaskPreviewArtifactFormat(format: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.format", {
    format,
  });
}

export function resolveTaskPreviewArtifactSegmentCount(count: number): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.segmentCount", {
    count,
  });
}

export function resolveTaskPreviewArtifactSpeakerCount(count: number): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.speakerCount", {
    count,
  });
}

export function resolveTaskPreviewArtifactWordCount(count: number): string {
  return resolveRequiredAgentChatCopy("taskPreview.artifact.wordCount", {
    count,
  });
}

export function resolveAudioTaskFallbackPrompt(): string {
  return resolveRequiredAgentChatCopy("taskPreview.audio.fallbackPrompt");
}

export function resolveAudioTaskArtifactTitle(): string {
  return resolveRequiredAgentChatCopy("taskPreview.audio.artifact.title");
}

export function resolveAudioTaskArtifactHeroEyebrow(): string {
  return resolveRequiredAgentChatCopy("taskPreview.audio.artifact.eyebrow");
}

export function resolveAudioTaskArtifactHeroSummary(): string {
  return resolveRequiredAgentChatCopy("taskPreview.audio.artifact.heroSummary");
}

export function resolveAudioTaskArtifactFallbackSummary(
  state: "running" | "default" = "default",
): string {
  return resolveRequiredAgentChatCopy(
    `taskPreview.audio.artifact.summary.${state}`,
  );
}

export function resolveAudioTaskArtifactSourceHeading(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.audio.artifact.sourceHeading",
  );
}

export function resolveAudioTaskArtifactCalloutTitle(params: {
  status: string;
  hasAudioUrl: boolean;
}): string {
  if (params.status === "failed") {
    return resolveRequiredAgentChatCopy(
      "taskPreview.audio.artifact.callout.failed",
    );
  }
  if (params.hasAudioUrl) {
    return resolveRequiredAgentChatCopy(
      "taskPreview.audio.artifact.callout.synced",
    );
  }
  return resolveRequiredAgentChatCopy(
    "taskPreview.audio.artifact.callout.waiting",
  );
}

export function resolveAudioTaskArtifactOutputPath(path: string): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.audio.artifact.outputPath",
    { path },
  );
}

export function resolveAudioTaskArtifactBody(params: {
  status: string;
  statusMessage?: string | null;
  audioUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): string {
  if (params.status === "failed") {
    return [
      params.statusMessage?.trim(),
      params.errorCode
        ? resolveTaskPreviewArtifactErrorCode(params.errorCode)
        : null,
      params.errorMessage
        ? resolveTaskPreviewArtifactErrorReason(params.errorMessage)
        : null,
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n");
  }
  if (params.audioUrl) {
    return resolveAudioTaskArtifactOutputPath(params.audioUrl);
  }
  return resolveRequiredAgentChatCopy("taskPreview.audio.artifact.body.waiting");
}

export function resolveAudioTaskPreviewFallbackText(): string {
  return resolveRequiredAgentChatCopy("taskPreview.audio.previewFallbackText");
}

export function resolveTranscriptionTaskFallbackPrompt(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.fallbackPrompt",
  );
}

export function resolveTranscriptionTaskArtifactTitle(): string {
  return resolveRequiredAgentChatCopy("taskPreview.transcription.artifact.title");
}

export function resolveTranscriptionTaskArtifactHeroEyebrow(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.eyebrow",
  );
}

export function resolveTranscriptionTaskArtifactHeroSummary(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.heroSummary",
  );
}

export function resolveTranscriptionTaskArtifactFallbackSummary(
  state: "running" | "default" = "default",
): string {
  return resolveRequiredAgentChatCopy(
    `taskPreview.transcription.artifact.summary.${state}`,
  );
}

export function resolveTranscriptionTaskArtifactSourceHeading(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.sourceHeading",
  );
}

export function resolveTranscriptionTaskArtifactSourceFallback(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.sourceFallback",
  );
}

export function resolveTranscriptionTaskArtifactCalloutTitle(params: {
  status: string;
  hasTranscriptPath: boolean;
}): string {
  if (params.status === "failed") {
    return resolveRequiredAgentChatCopy(
      "taskPreview.transcription.artifact.callout.failed",
    );
  }
  if (params.hasTranscriptPath) {
    return resolveRequiredAgentChatCopy(
      "taskPreview.transcription.artifact.callout.synced",
    );
  }
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.callout.waiting",
  );
}

export function resolveTranscriptionTaskArtifactOutputPath(path: string): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.outputPath",
    { path },
  );
}

export function resolveTranscriptionTaskArtifactLoadedBody(path: string): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.body.loaded",
    { path },
  );
}

export function resolveTranscriptionTaskArtifactBody(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.body.waiting",
  );
}

export function resolveTranscriptionTaskArtifactTextTitle(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.textTitle",
  );
}

export function resolveTranscriptionTaskArtifactTimelineTitle(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.timelineTitle",
  );
}

export function resolveTranscriptionTaskSegmentColumnTime(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.column.time",
  );
}

export function resolveTranscriptionTaskSegmentColumnSpeaker(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.column.speaker",
  );
}

export function resolveTranscriptionTaskSegmentColumnContent(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.column.content",
  );
}

export function resolveTranscriptionTaskSegmentSpeakerFallback(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.artifact.speakerFallback",
  );
}

export function resolveTranscriptionTaskPreviewFallbackText(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.transcription.previewFallbackText",
  );
}

export function resolveWebImageSearchProviderLabel(provider?: string): string {
  const normalized = (provider || "").trim();
  if (normalized.toLowerCase() === "pexels") {
    return "Pexels";
  }
  return (
    normalized ||
    resolveRequiredAgentChatCopy("taskPreview.webImageSearch.provider.generic")
  );
}

export function resolveWebImageSearchQueryLabel(
  query?: string,
  fallbackPrompt?: string,
): string {
  return (
    query?.trim() ||
    fallbackPrompt?.trim() ||
    resolveRequiredAgentChatCopy("taskPreview.webImageSearch.queryFallback")
  );
}

export function resolveWebImageCandidateLabel(index: number): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.candidateLabel",
    { index },
  );
}

export function resolveWebImageSearchTitle(providerLabel: string): string {
  return resolveRequiredAgentChatCopy("taskPreview.webImageSearch.title", {
    provider: providerLabel,
  });
}

export function resolveWebImageSearchStatusMessage(params: {
  providerLabel: string;
  returnedCount: number;
}): string {
  return resolveRequiredAgentChatCopy("taskPreview.webImageSearch.status", {
    count: params.returnedCount,
    provider: params.providerLabel,
  });
}

export function resolveWebImageSearchPreviewText(params: {
  providerLabel: string;
  returnedCount: number;
}): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.previewText",
    {
      count: params.returnedCount,
      provider: params.providerLabel,
    },
  );
}

export function resolveWebImageSearchCountMeta(returnedCount: number): string {
  return resolveRequiredAgentChatCopy("taskPreview.webImageSearch.countMeta", {
    count: returnedCount,
  });
}

export function resolveWebImageSearchSourceHighlight(
  providerLabel: string,
): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.highlight.source",
    { provider: providerLabel },
  );
}

export function resolveWebImageSearchCandidateHighlight(
  returnedCount: number,
): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.highlight.candidates",
    { count: returnedCount },
  );
}

export function resolveWebImageSearchAspectHighlight(aspect: string): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.highlight.aspect",
    { aspect },
  );
}

export function resolveWebImageSearchArtifactSummary(params: {
  queryLabel: string;
  returnedCount: number;
}): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.artifact.summary",
    {
      count: params.returnedCount,
      query: params.queryLabel,
    },
  );
}

export function resolveWebImageSearchArtifactHeroSummary(
  returnedCount: number,
): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.artifact.heroSummary",
    { count: returnedCount },
  );
}

export function resolveWebImageSearchArtifactEyebrow(): string {
  return resolveRequiredAgentChatCopy(
    "taskPreview.webImageSearch.artifact.eyebrow",
  );
}
