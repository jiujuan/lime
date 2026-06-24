import { Download } from "lucide-react";
import type { EmbeddedBrowserDownloadEvent } from "@/lib/api/embeddedBrowser";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface CanvasWorkbenchBrowserDownloadShelfProps {
  download: EmbeddedBrowserDownloadEvent;
  translateWorkbench: CanvasWorkbenchTranslation;
}

export function CanvasWorkbenchBrowserDownloadShelf({
  download,
  translateWorkbench,
}: CanvasWorkbenchBrowserDownloadShelfProps) {
  return (
    <div
      data-testid="canvas-workbench-browser-download"
      className="pointer-events-none absolute inset-x-4 bottom-4 max-w-[420px] rounded-[10px] border border-slate-200 bg-white/95 px-3 py-2 text-[12px] leading-5 text-slate-700 shadow-lg shadow-slate-950/10 backdrop-blur"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Download className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate font-medium">
          {resolveBrowserDownloadLabel(download, translateWorkbench)}
        </span>
      </div>
      {download.state === "started" || download.state === "progressing" ? (
        <div
          aria-hidden="true"
          className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
            style={{
              width: `${Math.max(
                download.totalBytes ? 6 : 14,
                formatBrowserDownloadPercent(download),
              )}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatBrowserDownloadPercent(
  event: EmbeddedBrowserDownloadEvent,
): number {
  if (!event.totalBytes || event.totalBytes <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(100, Math.round((event.receivedBytes / event.totalBytes) * 100)),
  );
}

function resolveBrowserDownloadLabel(
  event: EmbeddedBrowserDownloadEvent,
  translateWorkbench: CanvasWorkbenchTranslation,
): string {
  if (event.state === "completed") {
    return translateWorkbench(
      "agentChat.canvasWorkbench.browser.downloadComplete",
      {
        filename: event.filename,
      },
    );
  }
  if (event.state === "cancelled") {
    return translateWorkbench(
      "agentChat.canvasWorkbench.browser.downloadCancelled",
      {
        filename: event.filename,
      },
    );
  }
  if (event.state === "interrupted") {
    return translateWorkbench(
      "agentChat.canvasWorkbench.browser.downloadInterrupted",
      {
        filename: event.filename,
      },
    );
  }
  return translateWorkbench(
    "agentChat.canvasWorkbench.browser.downloadProgress",
    {
      filename: event.filename,
      percent: formatBrowserDownloadPercent(event),
    },
  );
}
