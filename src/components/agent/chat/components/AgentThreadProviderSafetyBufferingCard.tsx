import { Badge } from "@/components/ui/badge";
import type {
  AgentRuntimeDiagnosticProviderSafetyBufferingSample,
  AgentRuntimeThreadReadModel,
} from "@/lib/api/agentRuntime";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AgentThreadProviderSafetyBufferingCardProps {
  threadRead?: AgentRuntimeThreadReadModel | null;
}

function compactList(value?: string[] | null): string {
  return (value || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" · ");
}

function factValue(value: string | null | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

function SafetyBufferingFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-sky-200/80 bg-white px-3 py-2">
      <div className="text-[11px] font-medium text-sky-700">{label}</div>
      <div className="mt-1 truncate text-sm text-slate-900" title={value}>
        {value}
      </div>
    </div>
  );
}

export function AgentThreadProviderSafetyBufferingCard({
  threadRead,
}: AgentThreadProviderSafetyBufferingCardProps) {
  const { t } = useTranslation("agent");
  const text = (key: string, options?: Record<string, unknown>) =>
    String(
      t(`agentChat.threadReliability.panel.providerSafetyBuffering.${key}`, {
        ...options,
      }),
    );
  const sample = threadRead?.diagnostics?.latest_provider_safety_buffering as
    | AgentRuntimeDiagnosticProviderSafetyBufferingSample
    | null
    | undefined;
  if (!sample) {
    return null;
  }

  const unknown = String(t("agentChat.threadReliability.panel.unknown"));
  const none = text("none");
  const count = threadRead?.diagnostics?.provider_safety_buffering_count ?? 1;
  const providerModel = `${factValue(sample.provider, unknown)} / ${factValue(
    sample.model,
    unknown,
  )}`;
  const useCases = compactList(sample.use_cases) || none;
  const reasons = compactList(sample.reasons) || none;

  return (
    <div
      className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3"
      data-testid="agent-thread-provider-safety-buffering"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-sky-900">
          <ShieldCheck className="h-4 w-4" />
          <span>{text("title")}</span>
        </div>
        <Badge
          variant="outline"
          className="border-sky-300 bg-white text-sky-700"
        >
          {text("count", { count })}
        </Badge>
        <Badge
          variant="outline"
          className={
            sample.show_buffering_ui
              ? "border-emerald-300 bg-white text-emerald-700"
              : "border-slate-200 bg-white text-slate-700"
          }
        >
          {sample.show_buffering_ui
            ? text("bufferingUiOn")
            : text("recordedOnly")}
        </Badge>
      </div>
      <div className="mt-2 text-sm leading-6 text-sky-950">
        {text("description")}
      </div>
      <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
        <SafetyBufferingFact
          label={text("providerModel")}
          value={providerModel}
        />
        <SafetyBufferingFact
          label={text("retryModel")}
          value={factValue(sample.retry_model, none)}
        />
        <SafetyBufferingFact
          label={text("fallbackHeaderModel")}
          value={factValue(sample.fallback_header_model, none)}
        />
        <SafetyBufferingFact label={text("useCases")} value={useCases} />
        <SafetyBufferingFact label={text("reasons")} value={reasons} />
        <SafetyBufferingFact
          label={text("source")}
          value={factValue(sample.source, unknown)}
        />
      </div>
    </div>
  );
}
