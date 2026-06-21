import { resolveRequiredAgentChatCopy } from "./agentChatCopy";
import { shorten } from "./toolProcessSummaryText";

export function normalizeNarrativeSubject(
  subject: string | null,
  placeholders: string[] = [],
): string | null {
  const normalized = shorten(subject, 48);
  if (!normalized) {
    return null;
  }

  return placeholders.includes(normalized) ? null : normalized;
}

export function resolveProcessSummaryCopy(
  key: string,
  subject: string | null,
): string {
  return subject
    ? resolveRequiredAgentChatCopy(`${key}WithSubject`, { subject })
    : resolveRequiredAgentChatCopy(key);
}

export function resolvePhasedProcessSummaryCopy(
  baseKey: string,
  phase: "pre" | "post",
  subject: string | null,
  values: Record<string, unknown> = {},
): string {
  const phaseKey = phase === "pre" ? "pre" : "post";
  return subject
    ? resolveRequiredAgentChatCopy(`${baseKey}.${phaseKey}WithSubject`, {
        ...values,
        subject,
      })
    : resolveRequiredAgentChatCopy(`${baseKey}.${phaseKey}`, values);
}

export function buildVisionToolSummary(
  phase: "pre" | "post",
  normalizedName: string,
  subject: string | null,
): string | null {
  const normalizedSubject = normalizeNarrativeSubject(subject);
  const key =
    normalizedName === "viewimage"
      ? "toolCall.processSummary.vision.view"
      : "toolCall.processSummary.vision.analyze";

  return resolvePhasedProcessSummaryCopy(key, phase, normalizedSubject);
}
