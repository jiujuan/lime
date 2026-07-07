import type { AgentRuntimeDiagnosticProviderSafetyBufferingSample } from "@/lib/api/agentRuntime";
import type { AgentUiProjectionTranslation } from "../projection/agentUiProjectionSummary";

const DIAGNOSTIC_I18N_PREFIX = "agentChat.threadReliability.diagnostic.";

function tr(
  t: AgentUiProjectionTranslation,
  key: string,
  options?: Record<string, unknown>,
): string {
  return t(`${DIAGNOSTIC_I18N_PREFIX}${key}`, options);
}

function compactList(value?: string[] | null): string[] {
  return (value || []).map((item) => item.trim()).filter(Boolean);
}

export function formatProviderSafetyBufferingDiagnostic(
  sample:
    | AgentRuntimeDiagnosticProviderSafetyBufferingSample
    | null
    | undefined,
  t: AgentUiProjectionTranslation,
): string | null {
  if (!sample) {
    return null;
  }

  const unknownLabel = tr(t, "value.unknown");
  const noneLabel = tr(t, "value.nonePlain");
  const listSeparator = tr(t, "separator.list");
  const pipe = tr(t, "separator.pipe");
  const useCases = compactList(sample.use_cases).join(listSeparator);
  const reasons = compactList(sample.reasons).join(listSeparator);

  return [
    tr(t, "backend.providerSafetyBuffering.providerModel", {
      provider: sample.provider || unknownLabel,
      model: sample.model || unknownLabel,
    }),
    tr(t, "backend.providerSafetyBuffering.retryModel", {
      value: sample.retry_model || noneLabel,
    }),
    tr(t, "backend.providerSafetyBuffering.fallbackHeaderModel", {
      value: sample.fallback_header_model || noneLabel,
    }),
    tr(t, "backend.providerSafetyBuffering.showBufferingUi", {
      value: sample.show_buffering_ui ? tr(t, "value.yes") : tr(t, "value.no"),
    }),
    tr(t, "backend.providerSafetyBuffering.useCases", {
      value: useCases || noneLabel,
    }),
    tr(t, "backend.providerSafetyBuffering.reasons", {
      value: reasons || noneLabel,
    }),
    tr(t, "backend.providerSafetyBuffering.source", {
      value: sample.source || unknownLabel,
    }),
    tr(t, "backend.providerSafetyBuffering.backend", {
      value: sample.backend || unknownLabel,
    }),
  ].join(pipe);
}
