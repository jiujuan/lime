import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { SiteSavedContentTarget } from "../types";
import { extractSearchQueryLabel as extractSearchQueryLabelFromInfo } from "../utils/toolDisplayInfo";
import {
  buildToolCallDisplayGroups,
  buildToolGroupHeadline,
  buildToolGroupPreview,
} from "./ToolCallDisplayViewModel";
import { ToolCallDisplay } from "./ToolCallDisplay";

export interface ToolCallListProps {
  toolCalls: ToolCallState[];
  /** 当前 assistant 消息是否仍在流式输出 */
  isMessageStreaming?: boolean;
  /** 文件点击回调 - 用于打开右边栏显示文件内容 */
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
}

export const ToolCallList: React.FC<ToolCallListProps> = ({
  toolCalls,
  isMessageStreaming = false,
  onFileClick,
  onOpenSavedSiteContent,
}) => {
  if (!toolCalls || toolCalls.length === 0) return null;

  const groups = buildToolCallDisplayGroups(toolCalls);

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => {
        if (group.type === "single") {
          return (
            <ToolCallDisplay
              key={group.id}
              toolCall={group.item}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
            />
          );
        }

        if (group.type === "work") {
          if (group.items.length === 1) {
            return (
              <ToolCallDisplay
                key={group.id}
                toolCall={group.items[0]!}
                isMessageStreaming={isMessageStreaming}
                onFileClick={onFileClick}
                onOpenSavedSiteContent={onOpenSavedSiteContent}
              />
            );
          }

          return (
            <WorkToolCallGroup
              key={group.id}
              toolCalls={group.items}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
            />
          );
        }

        return (
          <SearchToolCallGroup
            key={group.id}
            toolCalls={group.items}
            isMessageStreaming={isMessageStreaming}
            onFileClick={onFileClick}
            onOpenSavedSiteContent={onOpenSavedSiteContent}
          />
        );
      })}
    </div>
  );
};

function WorkToolCallGroup({
  toolCalls,
  isMessageStreaming,
  onFileClick,
  onOpenSavedSiteContent,
}: {
  toolCalls: ToolCallState[];
  isMessageStreaming: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
}) {
  const { t } = useTranslation("agent");
  const hasRunning = toolCalls.some((item) => item.status === "running");
  const hasFailed = toolCalls.some((item) => item.status === "failed");
  const [expanded, setExpanded] = useState(hasRunning || hasFailed);
  const headline = buildToolGroupHeadline(toolCalls);
  const preview = buildToolGroupPreview(toolCalls, (count) =>
    t("agentChat.toolCall.group.hiddenItems", { count }),
  );

  useEffect(() => {
    if (hasRunning || hasFailed) {
      setExpanded(true);
    }
  }, [hasFailed, hasRunning]);

  return (
    <div className="py-0.5" data-testid="tool-call-work-group">
      <button
        type="button"
        className="flex w-full items-start gap-2.5 py-1.5 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={
          expanded
            ? t("agentChat.toolCall.group.collapseWork")
            : t("agentChat.toolCall.group.expandWork")
        }
      >
        <span className="pt-0.5 text-sm text-slate-400">•</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-900">
            {headline}
          </span>
          {!expanded && preview ? (
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {preview}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 text-slate-500 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div className="ml-6 space-y-1">
          {toolCalls.map((toolCall, index) => (
            <ToolCallDisplay
              key={toolCall.id}
              toolCall={toolCall}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
              grouped={true}
              groupMarker={index === 0 ? "└" : "·"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchToolCallGroup({
  toolCalls,
  isMessageStreaming,
  onFileClick,
  onOpenSavedSiteContent,
}: {
  toolCalls: ToolCallState[];
  isMessageStreaming: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
}) {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = useState(true);
  const headline = buildToolGroupHeadline(toolCalls);
  const queryPreview = toolCalls
    .slice(0, 2)
    .map(extractSearchQueryLabelFromInfo)
    .join(" · ");
  const hiddenCount = Math.max(toolCalls.length - 2, 0);

  return (
    <div className="py-0.5">
      <button
        type="button"
        className="flex w-full items-start gap-2.5 py-1.5 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={
          expanded
            ? t("agentChat.toolCall.group.collapseSearch")
            : t("agentChat.toolCall.group.expandSearch")
        }
      >
        <span className="pt-0.5 text-sm text-slate-400">•</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-900">
            {headline}
          </span>
          {!expanded ? (
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {queryPreview}
              {hiddenCount > 0
                ? t("agentChat.toolCall.group.hiddenSearchGroups", {
                    count: hiddenCount,
                  })
                : ""}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 text-slate-500 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div className="ml-6 space-y-1">
          {toolCalls.map((toolCall, index) => (
            <ToolCallDisplay
              key={toolCall.id}
              toolCall={toolCall}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
              grouped={true}
              groupMarker={index === 0 ? "└" : "·"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
