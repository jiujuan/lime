import { Globe2 } from "lucide-react";
import type {
  BrowserErrorDisplay,
  CanvasWorkbenchTranslation,
} from "./CanvasWorkbenchBrowserStatusDisplay";

export function CanvasWorkbenchBrowserHostUnavailable({
  translateWorkbench,
}: {
  translateWorkbench: CanvasWorkbenchTranslation;
}) {
  return (
    <div
      data-testid="canvas-workbench-browser-host-unavailable"
      className="absolute inset-0 flex items-center justify-center p-6"
    >
      <div className="max-w-[380px] text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-amber-200 bg-amber-50 text-amber-700 shadow-sm shadow-amber-950/5">
          <Globe2 className="h-5 w-5" />
        </div>
        <div className="text-[15px] font-semibold text-slate-900">
          {translateWorkbench(
            "agentChat.canvasWorkbench.browser.hostUnavailableTitle",
          )}
        </div>
        <div className="mt-1 text-[13px] leading-5 text-slate-500">
          {translateWorkbench(
            "agentChat.canvasWorkbench.browser.hostUnavailableBody",
          )}
        </div>
      </div>
    </div>
  );
}

export function CanvasWorkbenchBrowserLoading({
  translateWorkbench,
}: {
  translateWorkbench: CanvasWorkbenchTranslation;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-[360px] text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-500 shadow-sm shadow-slate-950/5">
          <Globe2 className="h-5 w-5" />
        </div>
        <div className="text-[15px] font-semibold text-slate-900">
          {translateWorkbench("agentChat.canvasWorkbench.browser.title")}
        </div>
        <div className="mt-1 text-[13px] leading-5 text-slate-500">
          {translateWorkbench("agentChat.canvasWorkbench.browser.loading")}
        </div>
      </div>
    </div>
  );
}

export function CanvasWorkbenchBrowserErrorBanner({
  error,
}: {
  error: BrowserErrorDisplay;
}) {
  return (
    <div
      data-testid="canvas-workbench-browser-error"
      className="absolute inset-x-4 top-4 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] leading-5 text-rose-900 shadow-sm shadow-rose-950/5"
    >
      <div className="font-medium">{error.title}</div>
      <div className="mt-0.5 text-rose-800/90">{error.body}</div>
    </div>
  );
}
