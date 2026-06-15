import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasWorkbenchDisplayedDiffLine } from "../../../utils/canvasWorkbenchDiff";
import { renderCanvasWorkbenchDiffCodeLine } from "./CanvasWorkbenchDiffCode";

interface CanvasWorkbenchDiffStateProps {
  diffLines: CanvasWorkbenchDisplayedDiffLine[];
  panelClassName: string;
  variant?: "inline" | "split";
  filePath?: string;
  beforeLabel?: string;
  afterLabel?: string;
  showWhitespace?: boolean;
  wordWrapEnabled?: boolean;
  omittedLabel?: (count: number) => string;
}

function formatDiffLineValue(value: string, showWhitespace: boolean): string {
  if (!showWhitespace) {
    return value;
  }
  return value.replace(/ /g, "·").replace(/\t/g, "→   ");
}

function resolveDisplayedLineNumber(
  explicitLineNumber: number | null | undefined,
  fallbackLineNumber: number | null,
): number | null {
  if (typeof explicitLineNumber === "number") {
    return explicitLineNumber;
  }
  return fallbackLineNumber;
}

export function CanvasWorkbenchDiffState({
  diffLines,
  panelClassName,
  variant = "inline",
  filePath,
  beforeLabel = "",
  afterLabel = "",
  showWhitespace = false,
  wordWrapEnabled = true,
  omittedLabel = (count) => `${count} unchanged lines hidden`,
}: CanvasWorkbenchDiffStateProps) {
  if (variant === "split") {
    let beforeLineNumber = 0;
    let afterLineNumber = 0;

    return (
      <div
        className={cn("h-full overflow-hidden", panelClassName)}
        data-testid="canvas-workbench-split-diff"
      >
        <div className="grid border-b border-slate-200/80 bg-slate-50 text-[11px] font-semibold text-slate-500 lg:grid-cols-2">
          <div
            className="border-b border-slate-200/80 px-3 py-2 lg:border-b-0 lg:border-r"
            data-testid="canvas-workbench-split-diff-before-header"
          >
            {beforeLabel}
          </div>
          <div
            className="px-3 py-2"
            data-testid="canvas-workbench-split-diff-after-header"
          >
            {afterLabel}
          </div>
        </div>
        <div className="max-h-[calc(100%-2.25rem)] overflow-auto">
          {diffLines.map((line, index) => {
            if (line.type === "omitted") {
              const beforeLine = resolveDisplayedLineNumber(
                line.oldLineNumber,
                beforeLineNumber + line.count,
              );
              const afterLine = resolveDisplayedLineNumber(
                line.newLineNumber,
                afterLineNumber + line.count,
              );
              beforeLineNumber += line.count;
              afterLineNumber += line.count;
              return (
                <div
                  key={`omitted-${index}`}
                  className="grid min-w-[720px] border-b border-slate-100 bg-slate-50/90 text-[11px] font-medium text-slate-400 lg:grid-cols-2"
                  data-testid="canvas-workbench-split-diff-omitted"
                >
                  <div className="grid grid-cols-[48px_1fr] border-r border-slate-100">
                    <span className="select-none border-r border-slate-100 px-2 py-2 text-right font-mono">
                      {beforeLine ?? ""}
                    </span>
                    <span className="px-3 py-2 text-center">
                      {omittedLabel(line.count)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[48px_1fr]">
                    <span className="select-none border-r border-slate-100 px-2 py-2 text-right font-mono">
                      {afterLine ?? ""}
                    </span>
                    <span className="px-3 py-2 text-center">
                      {omittedLabel(line.count)}
                    </span>
                  </div>
                </div>
              );
            }

            const beforeLine =
              line.type === "add"
                ? null
                : resolveDisplayedLineNumber(
                    line.oldLineNumber,
                    beforeLineNumber + 1,
                  );
            const afterLine =
              line.type === "remove"
                ? null
                : resolveDisplayedLineNumber(
                    line.newLineNumber,
                    afterLineNumber + 1,
                  );

            if (line.type !== "add") {
              beforeLineNumber += 1;
            }
            if (line.type !== "remove") {
              afterLineNumber += 1;
            }

            return (
              <div
                key={`${line.type}-${index}`}
                className="grid min-w-[720px] border-b border-slate-100 text-[12px] leading-6 lg:grid-cols-2"
              >
                <div
                  className={cn(
                    "grid grid-cols-[48px_1fr] border-r border-slate-100 font-mono",
                    line.type === "remove" && "bg-[#ffebe9] text-slate-950",
                    line.type === "add" && "bg-slate-50 text-slate-300",
                    line.type === "context" && "text-slate-600",
                  )}
                  data-testid="canvas-workbench-split-diff-before"
                >
                  <span
                    className={cn(
                      "select-none border-r border-slate-100 px-2 text-right text-[11px] text-slate-400",
                      line.type === "remove" && "bg-[#ffcecb] text-slate-700",
                    )}
                  >
                    {beforeLine ?? ""}
                  </span>
                  <span
                    className={cn(
                      "px-3 py-1.5",
                      wordWrapEnabled
                        ? "whitespace-pre-wrap break-all"
                        : "whitespace-pre",
                    )}
                  >
                    {line.type === "add"
                      ? " "
                      : renderCanvasWorkbenchDiffCodeLine(
                          formatDiffLineValue(line.value, showWhitespace),
                          filePath,
                        ) || " "}
                  </span>
                </div>
                <div
                  className={cn(
                    "grid grid-cols-[48px_1fr] font-mono",
                    line.type === "add" && "bg-[#dafbe1] text-slate-950",
                    line.type === "remove" && "bg-slate-50 text-slate-300",
                    line.type === "context" && "text-slate-600",
                  )}
                  data-testid="canvas-workbench-split-diff-after"
                >
                  <span
                    className={cn(
                      "select-none border-r border-slate-100 px-2 text-right text-[11px] text-slate-400",
                      line.type === "add" && "bg-[#aceebb] text-slate-700",
                    )}
                  >
                    {afterLine ?? ""}
                  </span>
                  <span
                    className={cn(
                      "px-3 py-1.5",
                      wordWrapEnabled
                        ? "whitespace-pre-wrap break-all"
                        : "whitespace-pre",
                    )}
                  >
                    {line.type === "remove"
                      ? " "
                      : renderCanvasWorkbenchDiffCodeLine(
                          formatDiffLineValue(line.value, showWhitespace),
                          filePath,
                        ) || " "}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  let lineNumber = 0;

  return (
    <div
      className={cn(
        "h-full overflow-hidden border border-slate-200 bg-white",
        panelClassName,
      )}
      data-testid="canvas-workbench-inline-diff"
    >
      <div className="h-full overflow-auto">
        {diffLines.map((line, index) => {
          if (line.type === "omitted") {
            const displayedLineNumber = resolveDisplayedLineNumber(
              line.newLineNumber ?? line.oldLineNumber,
              lineNumber + line.count,
            );
            lineNumber += line.count;
            return (
              <div
                key={`omitted-${index}`}
                className="grid min-w-[720px] grid-cols-[52px_28px_minmax(0,1fr)] border-b border-slate-100 bg-slate-100/80 text-[11px] font-medium text-slate-500"
                data-testid="canvas-workbench-diff-omitted"
              >
                <span className="px-2 py-2 text-right font-mono">
                  {displayedLineNumber}
                </span>
                <span className="flex items-center justify-center px-1 py-2 text-slate-400">
                  <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="px-3 py-2">{omittedLabel(line.count)}</span>
              </div>
            );
          }

          lineNumber += 1;
          const displayedLineNumber = resolveDisplayedLineNumber(
            line.newLineNumber ?? line.oldLineNumber,
            lineNumber,
          );
          return (
            <div
              key={`${line.type}-${index}`}
              className={cn(
                "grid min-w-[720px] grid-cols-[52px_28px_minmax(0,1fr)] border-b border-slate-100 border-l-2 font-mono text-[12px] leading-6",
                line.type === "add" &&
                  "border-l-emerald-500 bg-[#dafbe1] text-slate-950",
                line.type === "remove" &&
                  "border-l-rose-500 bg-[#ffebe9] text-slate-950",
                line.type === "context" &&
                  "border-l-transparent bg-white text-slate-600",
              )}
            >
              <span
                className={cn(
                  "select-none border-r border-slate-100 px-2 py-1.5 text-right text-[11px] text-slate-400",
                  line.type === "add" && "bg-[#aceebb] text-slate-700",
                  line.type === "remove" && "bg-[#ffcecb] text-slate-700",
                )}
              >
                {displayedLineNumber}
              </span>
              <span
                className={cn(
                  "select-none border-r border-slate-100 px-1 py-1.5 text-center font-semibold",
                  line.type === "add" && "text-emerald-700",
                  line.type === "remove" && "text-rose-700",
                  line.type === "context" && "text-slate-300",
                )}
              >
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </span>
              <span
                className={cn(
                  "px-3 py-1.5",
                  wordWrapEnabled
                    ? "whitespace-pre-wrap break-all"
                    : "whitespace-pre",
                )}
              >
                {renderCanvasWorkbenchDiffCodeLine(
                  formatDiffLineValue(line.value, showWhitespace),
                  filePath,
                ) || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
