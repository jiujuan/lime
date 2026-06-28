import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HarnessOutputSignal } from "../utils/harnessState";
import {
  classifySearchQuerySemantic,
  summarizeSearchQuerySemantics,
} from "../utils/searchQueryGrouping";
import { SearchResultPreviewList } from "./SearchResultPreviewList";
import { InteractiveText } from "./HarnessStatusPanelPrimitives";
import { agentText } from "./harnessPanelText";
import { buildHarnessSearchOutputProjection } from "./harnessSearchOutputProjection";

export function SearchOutputCard({
  signal,
  onOpenUrl,
  onOpenDetail,
}: {
  signal: HarnessOutputSignal;
  onOpenUrl: (url: string) => void | Promise<void>;
  onOpenDetail: () => void;
}) {
  const [resultsExpanded, setResultsExpanded] = useState(true);
  const projection = useMemo(
    () =>
      buildHarnessSearchOutputProjection({
        content: signal.content,
        preview: signal.preview,
        summary: signal.summary,
      }),
    [signal.content, signal.preview, signal.summary],
  );
  const { items: results, resultCount } = projection;

  useEffect(() => {
    setResultsExpanded(true);
  }, [signal.id]);
  const semantic = useMemo(
    () => classifySearchQuerySemantic(signal.summary),
    [signal.summary],
  );

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-orange-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <Search className="h-3.5 w-3.5" />
            <span>
              {agentText("agentChat.harness.generated.3fd8a99317", "已搜索")}
            </span>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-foreground">
            {projection.query}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {signal.title}
            {resultCount > 0 ? ` · ${resultCount} 条结果` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{semantic.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {results.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              aria-label={
                resultsExpanded
                  ? `收起搜索结果：${projection.query}`
                  : `展开搜索结果：${projection.query}`
              }
              onClick={() => setResultsExpanded((prev) => !prev)}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  resultsExpanded && "rotate-180",
                )}
              />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            aria-label={`查看工具输出：${signal.title}`}
            onClick={onOpenDetail}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {results.length > 0 && resultsExpanded ? (
        <SearchResultPreviewList
          items={results}
          onOpenUrl={onOpenUrl}
          popoverSide="left"
          popoverAlign="start"
          className="mt-3"
        />
      ) : !results.length && projection.previewText ? (
        <div className="mt-3 rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
          <InteractiveText
            text={projection.previewText}
            onOpenUrl={onOpenUrl}
          />
        </div>
      ) : null}
    </div>
  );
}

export function SearchOutputBatchCard({
  signals,
  onOpenUrl,
  onOpenDetail,
}: {
  signals: HarnessOutputSignal[];
  onOpenUrl: (url: string) => void | Promise<void>;
  onOpenDetail: (signal: HarnessOutputSignal) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const semanticSummaries = useMemo(
    () =>
      summarizeSearchQuerySemantics(signals.map((signal) => signal.summary)),
    [signals],
  );
  const preview = signals
    .slice(0, 2)
    .map((signal) => signal.summary)
    .join(" · ");
  const hiddenCount = Math.max(signals.length - 2, 0);

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={expanded ? "收起搜索批次" : "展开搜索批次"}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-orange-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <Search className="h-3.5 w-3.5" />
            <span>
              {agentText("agentChat.harness.generated.3fd8a99317", "已搜索")}{" "}
              {signals.length}{" "}
              {agentText("agentChat.harness.generated.eea45025c0", "组查询")}
            </span>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-foreground">
            {preview}
            {hiddenCount > 0 ? ` 等 ${hiddenCount} 组` : ""}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {agentText(
              "agentChat.harness.generated.2ecb34de2f",
              "联网检索批次",
            )}
          </div>
        </div>
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          aria-hidden="true"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {semanticSummaries.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {semanticSummaries.map((item) => (
            <Badge key={item.key} variant="secondary">
              {item.label} {item.count}
            </Badge>
          ))}
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-3">
          {signals.map((signal) => (
            <SearchOutputCard
              key={signal.id}
              signal={signal}
              onOpenUrl={onOpenUrl}
              onOpenDetail={() => onOpenDetail(signal)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
