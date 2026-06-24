import { ShieldAlert } from "lucide-react";
import type { EmbeddedBrowserPermissionRequestEvent } from "@/lib/api/embeddedBrowser";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function CanvasWorkbenchBrowserPermissionBanner({
  permission,
  translateWorkbench,
}: {
  permission: EmbeddedBrowserPermissionRequestEvent;
  translateWorkbench: CanvasWorkbenchTranslation;
}) {
  const sourceUrl =
    permission.requestingUrl || permission.embeddingOrigin || permission.url;
  return (
    <div
      data-testid="canvas-workbench-browser-permission"
      className="absolute inset-x-4 top-4 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-950 shadow-sm shadow-amber-950/5"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <div className="font-medium">
            {translateWorkbench(
              "agentChat.canvasWorkbench.browser.permissionBlockedTitle",
              { permission: permission.permission },
            )}
          </div>
          <div className="mt-0.5 break-words text-amber-900/85">
            {translateWorkbench(
              "agentChat.canvasWorkbench.browser.permissionBlockedBody",
              { source: sourceUrl },
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
