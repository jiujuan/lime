import React, { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { resolveThinkingDisplayParts } from "./thinkingBlockDisplay";

interface ThinkingBlockProps {
  content: string;
  defaultExpanded?: boolean;
  grouped?: boolean;
  groupMarker?: string;
  isStreaming?: boolean;
  hideSummary?: boolean;
  preserveSourceText?: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  defaultExpanded = false,
  grouped = false,
  groupMarker = "•",
  isStreaming = false,
  hideSummary = false,
  preserveSourceText = false,
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const previousDefaultExpandedRef = React.useRef(defaultExpanded);
  const thinkingDisplay = useMemo(
    () =>
      resolveThinkingDisplayParts(content, isStreaming, {
        preserveSourceText,
      }),
    [content, isStreaming, preserveSourceText],
  );
  const hasBody = thinkingDisplay.body.length > 0;

  React.useEffect(() => {
    if (previousDefaultExpandedRef.current !== defaultExpanded) {
      previousDefaultExpandedRef.current = defaultExpanded;
      setExpanded(defaultExpanded);
    }
  }, [defaultExpanded]);

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
          {hasBody ? <MarkdownRenderer content={thinkingDisplay.body} /> : null}
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
              }
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
              className={cn(
                "min-w-0",
                grouped ? "mt-1.5 pl-[18px]" : "mt-2.5 pl-[22px]",
              )}
            >
              <div className="min-w-0">
                <MarkdownRenderer content={thinkingDisplay.body} />
              </div>
            </div>
          ) : null}
        </details>
      )}
    </div>
  );
};
