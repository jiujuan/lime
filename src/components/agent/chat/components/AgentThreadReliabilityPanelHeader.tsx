import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ThreadReliabilityTone } from "../utils/threadReliabilityView";
import { resolveToneClassName } from "./AgentThreadReliabilityPanelViewModel";

interface AgentThreadReliabilityPanelHeaderProps {
  activeTurnLabel?: string | null;
  copyDiagnosticLabel: string;
  copyJsonDebugLabel: string;
  interruptStateLabel?: string | null;
  lastUpdatedLabel?: string | null;
  quickDiagnosticLabel: string;
  statusLabel: string;
  statusTone: ThreadReliabilityTone;
  summary: string;
  title: string;
  onCopyDiagnostic: () => void;
  onCopyRawJson: () => void;
}

export function AgentThreadReliabilityPanelHeader({
  activeTurnLabel,
  copyDiagnosticLabel,
  copyJsonDebugLabel,
  interruptStateLabel,
  lastUpdatedLabel,
  quickDiagnosticLabel,
  statusLabel,
  statusTone,
  summary,
  title,
  onCopyDiagnostic,
  onCopyRawJson,
}: AgentThreadReliabilityPanelHeaderProps) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div
        className="min-w-[min(100%,18rem)] flex-[1_1_24rem]"
        data-testid="agent-thread-reliability-header-main"
      >
        <div className="text-xs font-medium tracking-wide text-muted-foreground">
          {title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-700"
          >
            {quickDiagnosticLabel}
          </Badge>
          <Badge variant="outline" className={resolveToneClassName(statusTone)}>
            {statusLabel}
          </Badge>
          {activeTurnLabel ? (
            <span className="text-sm font-medium text-foreground">
              {activeTurnLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          {summary}
        </div>
      </div>

      <div
        className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 text-xs text-muted-foreground lg:w-auto lg:justify-end"
        data-testid="agent-thread-reliability-header-actions"
      >
        {lastUpdatedLabel ? (
          <span className="whitespace-nowrap">{lastUpdatedLabel}</span>
        ) : null}
        {interruptStateLabel ? (
          <Badge
            variant="outline"
            className="border-slate-200 bg-slate-50 text-slate-700"
          >
            {interruptStateLabel}
          </Badge>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopyDiagnostic}
          className="h-8 rounded-full whitespace-nowrap"
          data-testid="agent-thread-reliability-copy"
        >
          <Copy className="mr-2 h-3.5 w-3.5" />
          {copyDiagnosticLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopyRawJson}
          className="h-8 rounded-full whitespace-nowrap"
          data-testid="agent-thread-reliability-copy-json"
        >
          <Copy className="mr-2 h-3.5 w-3.5" />
          {copyJsonDebugLabel}
        </Button>
      </div>
    </div>
  );
}
