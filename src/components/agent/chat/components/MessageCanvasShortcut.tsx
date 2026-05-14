import React from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { SiteSavedContentTarget } from "../types";

interface MessageCanvasShortcutProps {
  target: SiteSavedContentTarget;
  title: string;
  path?: string | null;
  onOpenSavedSiteContent: (target: SiteSavedContentTarget) => void;
}

export function MessageCanvasShortcut({
  target,
  title,
  path,
  onOpenSavedSiteContent,
}: MessageCanvasShortcutProps) {
  return (
    <button
      type="button"
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-left transition-colors hover:bg-emerald-100/80"
      data-testid="message-canvas-shortcut"
      onClick={() => onOpenSavedSiteContent(target)}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-6 text-emerald-900">
          在画布中打开 {title}
        </span>
        {path ? (
          <span className="block truncate text-xs leading-5 text-emerald-700/80">
            {path}
          </span>
        ) : null}
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-emerald-700" />
    </button>
  );
}
