import React from "react";
import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Artifact } from "@/lib/artifact/types";

interface ArtifactFrameProps {
  artifact: Artifact;
  title: string;
  rendererLabel: string;
  children: React.ReactNode;
  isStreaming?: boolean;
  onOpen?: () => void;
  footer?: React.ReactNode;
  frameKind?: string;
  testId?: string;
  streamingIcon?: React.ReactNode;
  leadingIcon?: React.ReactNode;
}

export function ArtifactFrame({
  artifact,
  title,
  rendererLabel,
  children,
  isStreaming = false,
  onOpen,
  footer,
  frameKind,
  testId,
  streamingIcon,
  leadingIcon,
}: ArtifactFrameProps) {
  const { t } = useTranslation("agent");

  return (
    <section
      data-testid={testId ?? "artifact-frame"}
      data-artifact-id={artifact.id}
      data-frame-kind={frameKind}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
    >
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-slate-100"
        aria-label={t("agentChat.messageList.artifactFrame.openAria", {
          title,
        })}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
            {isStreaming ? (
              streamingIcon ?? <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              leadingIcon ?? <FileText className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                {t("agentChat.messageList.artifactFrame.badge")}
              </span>
              <span className="inline-flex rounded-md border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">
                {rendererLabel}
              </span>
              {isStreaming ? (
                <span className="inline-flex rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  {t("agentChat.messageList.artifactFrame.streaming")}
                </span>
              ) : null}
            </span>
            <span className="mt-1 block truncate text-[13px] font-semibold leading-5 text-slate-900">
              {title}
            </span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
          {t("agentChat.messageList.artifactFrame.open")}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
      <div className="max-h-[520px] overflow-auto bg-white px-4 py-4">
        {children}
      </div>
      {footer ? (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
