import React, { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { StreamingMarkdownContent } from "./StreamingMarkdownContent";
import { resolveThinkingDisplayParts } from "./thinkingBlockDisplay";

const DEFAULT_AUTO_COLLAPSE_VIEWPORT_RATIO = 0.35;
const DEFAULT_AUTO_COLLAPSE_MIN_HEIGHT = 280;

interface ThinkingBlockProps {
  content: string;
  defaultExpanded?: boolean;
  grouped?: boolean;
  groupMarker?: string;
  isStreaming?: boolean;
  hideSummary?: boolean;
  preserveSourceText?: boolean;
  autoCollapseEligible?: boolean;
  autoCollapseWhenOverflow?: boolean;
  autoCollapseViewportRatio?: number;
  autoCollapseMinHeight?: number;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  defaultExpanded = false,
  grouped = false,
  groupMarker = "•",
  isStreaming = false,
  hideSummary = false,
  preserveSourceText = false,
  autoCollapseEligible = false,
  autoCollapseWhenOverflow = false,
  autoCollapseViewportRatio = DEFAULT_AUTO_COLLAPSE_VIEWPORT_RATIO,
  autoCollapseMinHeight = DEFAULT_AUTO_COLLAPSE_MIN_HEIGHT,
}) => {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const userToggledRef = React.useRef(false);
  const previousDefaultExpandedRef = React.useRef(defaultExpanded);
  const previousStreamingRef = React.useRef(isStreaming);
  const thinkingDisplay = useMemo(
    () =>
      resolveThinkingDisplayParts(content, isStreaming, {
        preserveSourceText,
        labels: {
          completed: t("agentChat.thinkingBlock.status.completed", {
            defaultValue: "已完成思考",
          }),
          running: t("agentChat.thinkingBlock.status.running", {
            defaultValue: "思考中",
          }),
          structuredFallback: t("agentChat.thinkingBlock.preview.structured", {
            defaultValue: "在整理结构化内容",
          }),
        },
      }),
    [content, isStreaming, preserveSourceText, t],
  );
  const hasBody = thinkingDisplay.body.length > 0;
  const shouldDeferMarkdown = isStreaming && !preserveSourceText;

  const renderThinkingBody = React.useCallback(
    () => (
      <StreamingMarkdownContent
        content={thinkingDisplay.body}
        isStreaming={isStreaming}
        deferMarkdownUntilComplete={shouldDeferMarkdown}
        pendingTailClassName="block text-sm leading-6 text-slate-700"
        renderMarkdown={(markdown) => (
          <MarkdownRenderer content={markdown} isStreaming={isStreaming} />
        )}
      />
    ),
    [isStreaming, shouldDeferMarkdown, thinkingDisplay.body],
  );

  React.useEffect(() => {
    if (previousDefaultExpandedRef.current !== defaultExpanded) {
      const isStreamingCompletionCollapse =
        !defaultExpanded && !isStreaming && previousStreamingRef.current;
      previousDefaultExpandedRef.current = defaultExpanded;
      if (isStreamingCompletionCollapse) {
        return;
      }
      userToggledRef.current = false;
      setExpanded(defaultExpanded);
    }
  }, [defaultExpanded, isStreaming]);

  React.useEffect(() => {
    if (previousStreamingRef.current === isStreaming) {
      return;
    }

    previousStreamingRef.current = isStreaming;
    if (isStreaming) {
      userToggledRef.current = false;
      setExpanded(true);
    }
  }, [isStreaming]);

  const collapseIfOverflowing = React.useCallback(() => {
    if (
      !autoCollapseEligible ||
      !autoCollapseWhenOverflow ||
      !expanded ||
      userToggledRef.current
    ) {
      return;
    }

    const body = bodyRef.current;
    if (!body) {
      return;
    }

    const viewportHeight =
      typeof window !== "undefined"
        ? window.innerHeight || document.documentElement.clientHeight || 0
        : 0;
    const threshold = Math.max(
      autoCollapseMinHeight,
      viewportHeight * autoCollapseViewportRatio,
    );
    const bodyHeight = Math.max(
      body.getBoundingClientRect().height,
      body.scrollHeight,
    );

    if (bodyHeight > threshold) {
      setExpanded(false);
    }
  }, [
    autoCollapseEligible,
    autoCollapseMinHeight,
    autoCollapseViewportRatio,
    autoCollapseWhenOverflow,
    expanded,
  ]);

  React.useEffect(() => {
    if (!expanded || hideSummary) {
      return;
    }

    collapseIfOverflowing();

    const body = bodyRef.current;
    if (!body) {
      return;
    }

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => collapseIfOverflowing());
      observer.observe(body);
    }

    const timeoutId =
      typeof window !== "undefined"
        ? window.setTimeout(collapseIfOverflowing, 0)
        : undefined;

    return () => {
      observer?.disconnect();
      if (typeof timeoutId === "number" && typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
      }
    };
  }, [collapseIfOverflowing, expanded, hideSummary, thinkingDisplay.body]);

  if (!content) return null;

  return (
    <div
      className={cn(grouped ? "flex items-start gap-2 py-1.5" : "py-0.5")}
      data-testid="thinking-block"
      data-visual-style={grouped ? "grouped-inline" : "card"}
    >
      {grouped ? (
        <span className="pt-0.5 font-mono text-xs text-slate-400">
          {groupMarker}
        </span>
      ) : null}
      {hideSummary ? (
        <div className="min-w-0 flex-1">
          {hasBody ? renderThinkingBody() : null}
        </div>
      ) : (
        <details
          className={cn(
            "min-w-0 flex-1",
            grouped
              ? "rounded-none border-0 bg-transparent px-0 py-0"
              : "rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-950/5",
          )}
          open={expanded}
          onToggle={(event) =>
            setExpanded((event.target as HTMLDetailsElement).open)
          }
        >
          <summary
            className={cn(
              "list-none select-none rounded-xl transition-colors",
              hasBody ? "cursor-pointer" : "cursor-default",
              grouped && hasBody && "hover:bg-slate-50",
            )}
            onClick={(event) => {
              if (!hasBody) {
                event.preventDefault();
                return;
              }
              userToggledRef.current = true;
            }}
          >
            <div
              className={cn("flex items-start", grouped ? "gap-2.5" : "gap-3")}
            >
              <span
                className={cn(
                  "shrink-0 rounded-full",
                  grouped ? "mt-2 h-2 w-2" : "mt-1.5 h-2.5 w-2.5",
                  isStreaming
                    ? "animate-pulse bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.14)]"
                    : "bg-slate-400 shadow-[0_0_0_4px_rgba(148,163,184,0.14)]",
                )}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[13px] font-normal leading-6",
                    grouped ? "text-slate-700" : "text-slate-800",
                  )}
                >
                  {thinkingDisplay.statusLabel}
                </div>
                {!expanded && thinkingDisplay.preview ? (
                  <div
                    className={cn(
                      "text-sm leading-6 text-slate-600",
                      grouped ? "mt-0.5 line-clamp-2" : "mt-1 line-clamp-3",
                    )}
                  >
                    {thinkingDisplay.preview}
                  </div>
                ) : null}
              </div>
              {hasBody ? (
                <ChevronDown
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                    expanded && "rotate-180",
                  )}
                />
              ) : null}
            </div>
          </summary>
          {hasBody && expanded ? (
            <div
              ref={bodyRef}
              className={cn(
                "min-w-0",
                grouped ? "mt-1.5 pl-[18px]" : "mt-2.5 pl-[22px]",
              )}
            >
              <div className="min-w-0">{renderThinkingBody()}</div>
            </div>
          ) : null}
        </details>
      )}
    </div>
  );
};
