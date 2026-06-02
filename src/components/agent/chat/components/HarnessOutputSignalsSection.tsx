import type { Dispatch, SetStateAction } from "react";
import { TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HarnessOutputSignal } from "../utils/harnessState";
import {
  DiffReviewMiniPanel,
  InteractiveText,
  PathTextLink,
  type AgentTranslation,
} from "./HarnessStatusPanelPrimitives";
import {
  SearchOutputBatchCard,
  SearchOutputCard,
} from "./HarnessSearchOutputCards";
import { agentText } from "./harnessPanelText";
import {
  buildOutputSignalDiffSummary,
  buildOutputStatusDescriptors,
  findFirstUrl,
  getOutputSignalPaths,
  getSignalPath,
  matchesOutputFilter,
  resolveFriendlyToolLabel,
  resolveOutputCardPresentation,
  resolveOutputPathLabelKey,
  type OutputFilterValue,
} from "./harnessStatusPanelViewModel";

interface OutputPreviewRequest {
  title: string;
  description?: string;
  path?: string;
  content?: string;
  preview?: string;
}

type GroupedOutputEntry =
  | { type: "single"; signal: HarnessOutputSignal }
  | { type: "search_batch"; signals: HarnessOutputSignal[] };

interface OutputFilterOption {
  value: OutputFilterValue;
  label: string;
}

interface HarnessOutputSignalsSectionProps {
  signals: HarnessOutputSignal[];
  filteredSignals: HarnessOutputSignal[];
  groupedEntries: GroupedOutputEntry[];
  filter: OutputFilterValue;
  filterOptions: OutputFilterOption[];
  setFilter: Dispatch<SetStateAction<OutputFilterValue>>;
  onOpenPreview: (request: OutputPreviewRequest) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  onOpenUrl: (url: string) => void | Promise<void>;
  translate: AgentTranslation;
}

export function HarnessOutputSignalsSection({
  signals,
  filteredSignals,
  groupedEntries,
  filter,
  filterOptions,
  setFilter,
  onOpenPreview,
  onOpenPath,
  onOpenUrl,
  translate,
}: HarnessOutputSignalsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => {
          const count =
            option.value === "all"
              ? signals.length
              : signals.filter((signal) =>
                  matchesOutputFilter(signal, option.value),
                ).length;
          const active = option.value === filter;

          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              onClick={() => setFilter(option.value)}
              aria-pressed={active}
              aria-label={`工具输出筛选：${option.label}`}
            >
              {option.label} {count}
            </button>
          );
        })}
      </div>
      {filteredSignals.length > 0 ? (
        groupedEntries.map((entry) => {
          if (entry.type === "search_batch") {
            if (entry.signals.length === 1) {
              const signal = entry.signals[0];
              return (
                <SearchOutputCard
                  key={signal.id}
                  signal={signal}
                  onOpenUrl={onOpenUrl}
                  onOpenDetail={() =>
                    void onOpenPreview({
                      title: signal.title,
                      description: signal.summary,
                      path: getSignalPath(signal),
                      content: signal.content,
                      preview: signal.preview,
                    })
                  }
                />
              );
            }

            return (
              <SearchOutputBatchCard
                key={entry.signals.map((signal) => signal.id).join("|")}
                signals={entry.signals}
                onOpenUrl={onOpenUrl}
                onOpenDetail={(signal) =>
                  void onOpenPreview({
                    title: signal.title,
                    description: signal.summary,
                    path: getSignalPath(signal),
                    content: signal.content,
                    preview: signal.preview,
                  })
                }
              />
            );
          }

          const signal = entry.signal;
          const signalPath = getSignalPath(signal);
          const signalUrl = findFirstUrl(
            signal.summary,
            signal.content,
            signal.preview,
            signal.title,
          );
          const canOpenPreview = Boolean(
            signalPath || signal.content || signal.preview,
          );
          const canOpenUrl = !canOpenPreview && Boolean(signalUrl);
          const outputStatusDescriptors = buildOutputStatusDescriptors(signal);
          const outputPaths = getOutputSignalPaths(signal);
          const diffSummary = buildOutputSignalDiffSummary(signal);
          const outputPresentation = resolveOutputCardPresentation(signal, {
            rawDetailsCollapsedHint: translate(
              "agentChat.harness.outputs.rawDetailsCollapsed",
            ),
          });

          return (
            <button
              key={signal.id}
              type="button"
              className={cn(
                "w-full rounded-[10px] border bg-background p-3 text-left transition-colors hover:bg-muted/60",
                outputPresentation.tone === "failed" &&
                  "border-amber-200 bg-amber-50/70 hover:bg-amber-50",
                !canOpenPreview && !canOpenUrl && "cursor-default",
              )}
              data-output-raw-details-collapsed={
                outputPresentation.rawDetailsCollapsed ? "true" : undefined
              }
              onClick={() =>
                canOpenPreview
                  ? void onOpenPreview({
                      title: signal.title,
                      description: signal.summary,
                      path: signalPath,
                      content: signal.content,
                      preview: signal.preview,
                    })
                  : signalUrl
                    ? void onOpenUrl(signalUrl)
                    : undefined
              }
              aria-label={`查看工具输出：${signal.title}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">
                      {signal.title}
                    </span>
                  </div>
                  <InteractiveText
                    text={outputPresentation.summary}
                    className="mt-1 text-xs text-muted-foreground"
                    stopPropagation={true}
                    onOpenUrl={onOpenUrl}
                  />
                  {outputStatusDescriptors.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {outputStatusDescriptors.map((descriptor) => (
                        <Badge
                          key={descriptor.key}
                          variant={descriptor.variant}
                        >
                          {translate(descriptor.labelKey, descriptor.values)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Badge variant="outline">
                  {resolveFriendlyToolLabel(signal.toolName) || signal.toolName}
                </Badge>
              </div>
              {outputPaths.length > 0 ? (
                <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">
                    {translate("agentChat.harness.outputs.paths.title")}
                  </div>
                  {outputPaths.map((item) => (
                    <div
                      key={`${item.key}:${item.path}`}
                      className="flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground"
                    >
                      <span>
                        {translate(resolveOutputPathLabelKey(item.key))}
                      </span>
                      <PathTextLink
                        path={item.path}
                        stopPropagation={true}
                        onOpenPath={onOpenPath}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              {diffSummary ? (
                <DiffReviewMiniPanel
                  summary={diffSummary}
                  translate={translate}
                  onOpenPath={onOpenPath}
                  stopPropagation={true}
                />
              ) : outputPresentation.preview ? (
                <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                  <InteractiveText
                    text={outputPresentation.preview}
                    mono={true}
                    stopPropagation={true}
                    onOpenUrl={onOpenUrl}
                  />
                </div>
              ) : outputPresentation.collapsedHint ? (
                <div className="mt-2 rounded-[8px] border border-amber-200 bg-white/75 px-2.5 py-2 text-xs text-amber-800">
                  {outputPresentation.collapsedHint}
                </div>
              ) : null}
            </button>
          );
        })
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {agentText(
            "agentChat.harness.generated.1146635328",
            "当前筛选条件下暂无记录。",
          )}
        </div>
      )}
    </div>
  );
}

export type { GroupedOutputEntry, OutputFilterOption };
