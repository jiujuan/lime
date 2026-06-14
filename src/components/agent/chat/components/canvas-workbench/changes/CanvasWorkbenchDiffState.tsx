import { cn } from "@/lib/utils";
import type { CanvasWorkbenchDisplayedDiffLine } from "../../../utils/canvasWorkbenchDiff";

interface CanvasWorkbenchDiffStateProps {
  diffLines: CanvasWorkbenchDisplayedDiffLine[];
  panelClassName: string;
  variant?: "inline" | "split";
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

export function CanvasWorkbenchDiffState({
  diffLines,
  panelClassName,
  variant = "inline",
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
              beforeLineNumber += line.count;
              afterLineNumber += line.count;
              return (
                <div
                  key={`omitted-${index}`}
                  className="grid min-w-[720px] border-b border-slate-100 bg-slate-50/80 text-[11px] font-medium text-slate-400 lg:grid-cols-2"
                  data-testid="canvas-workbench-split-diff-omitted"
                >
                  <div className="border-r border-slate-100 px-3 py-2 text-center">
                    {omittedLabel(line.count)}
                  </div>
                  <div className="px-3 py-2 text-center">
                    {omittedLabel(line.count)}
                  </div>
                </div>
              );
            }

            const beforeLine =
              line.type === "add" ? null : beforeLineNumber + 1;
            const afterLine =
              line.type === "remove" ? null : afterLineNumber + 1;

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
                    "grid grid-cols-[44px_1fr] border-r border-slate-100 font-mono",
                    line.type === "remove" && "bg-rose-50 text-rose-900",
                    line.type === "add" && "bg-slate-50 text-slate-300",
                    line.type === "context" && "text-slate-600",
                  )}
                  data-testid="canvas-workbench-split-diff-before"
                >
                  <span className="select-none border-r border-slate-100 px-2 text-right text-[11px] text-slate-400">
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
                      : formatDiffLineValue(line.value, showWhitespace) || " "}
                  </span>
                </div>
                <div
                  className={cn(
                    "grid grid-cols-[44px_1fr] font-mono",
                    line.type === "add" && "bg-emerald-50 text-emerald-900",
                    line.type === "remove" && "bg-slate-50 text-slate-300",
                    line.type === "context" && "text-slate-600",
                  )}
                  data-testid="canvas-workbench-split-diff-after"
                >
                  <span className="select-none border-r border-slate-100 px-2 text-right text-[11px] text-slate-400">
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
                      : formatDiffLineValue(line.value, showWhitespace) || " "}
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
            lineNumber += line.count;
            return (
              <div
                key={`omitted-${index}`}
                className="grid min-w-[720px] grid-cols-[52px_28px_minmax(0,1fr)] border-b border-slate-100 bg-slate-50/90 text-[11px] font-medium text-slate-400"
                data-testid="canvas-workbench-diff-omitted"
              >
                <span className="px-2 py-2 text-right font-mono">
                  {lineNumber}
                </span>
                <span className="px-1 py-2 text-center">...</span>
                <span className="px-3 py-2">{omittedLabel(line.count)}</span>
              </div>
            );
          }

          lineNumber += 1;
          return (
            <div
              key={`${line.type}-${index}`}
              className={cn(
                "grid min-w-[720px] grid-cols-[52px_28px_minmax(0,1fr)] border-b border-slate-100 font-mono text-[12px] leading-6",
                line.type === "add" && "bg-emerald-50 text-emerald-950",
                line.type === "remove" && "bg-rose-50 text-rose-950",
                line.type === "context" && "bg-white text-slate-600",
              )}
            >
              <span className="select-none border-r border-slate-100 px-2 py-1.5 text-right text-[11px] text-slate-400">
                {lineNumber}
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
                {formatDiffLineValue(line.value, showWhitespace) || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
