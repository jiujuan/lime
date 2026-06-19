import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchResultPreviewList } from "./SearchResultPreviewList";
import { resolveThinkingDisplayParts } from "./thinkingBlockDisplay";
import {
  summarizeStreamingToolBatch,
  type ToolBatchSummaryDescriptor,
} from "../utils/toolBatchGrouping";
import {
  isUnifiedWebSearchToolName,
  resolveSearchResultPreviewItemsFromText,
  type SearchResultPreviewItem,
} from "../utils/searchResultPreview";
import { attachUrlPreviewSnapshotsToSearchResults } from "../utils/urlPreviewSnapshot";
import {
  buildToolGroupHeadline,
  getToolDisplayInfo,
} from "../utils/toolDisplayInfo";
import { resolveToolProcessNarrative } from "../utils/toolProcessSummary";
import {
  isImportedProcessMetadata,
  isImportedToolCall,
  type StreamingProcessEntry,
} from "./StreamingProcessGroupModel";

interface StreamingProcessSummaryCopy {
  formatImportedSourceCommandRecord: (count?: number) => string;
  completedThinking: () => string;
  importedSteps: (count: number) => string;
  failedSteps: (count: number) => string;
  runningSteps: (count: number) => string;
  completedSteps: (count: number) => string;
  thinking: () => string;
  toolCalls: (count: number) => string;
  processMessages: (count: number) => string;
  thinkingNotes: (count: number) => string;
  separator: () => string;
}

function joinSummaryParts(
  parts: Array<string | null | undefined>,
  separator: string,
): string {
  return parts.filter(Boolean).join(separator);
}

function buildStreamingProcessSummary(
  entries: StreamingProcessEntry[],
  copy: StreamingProcessSummaryCopy,
): {
  summaryText: string;
  descriptor: ToolBatchSummaryDescriptor | null;
  metaText: string | null;
} {
  const toolEntries = entries.filter(
    (entry): entry is Extract<StreamingProcessEntry, { kind: "tool" }> =>
      entry.kind === "tool",
  );
  const thinkingCount = entries.filter(
    (entry) => entry.kind === "thinking",
  ).length;
  const importedToolCount = toolEntries.filter((entry) =>
    isImportedToolCall(entry.toolCall),
  ).length;
  const hasImportedThinking =
    entries.some(
      (entry) =>
        entry.kind === "thinking" && isImportedProcessMetadata(entry.metadata),
    ) ||
    (importedToolCount > 0 && thinkingCount > 0);
  const batchDescriptor =
    toolEntries.length > 1 && importedToolCount === 0
      ? summarizeStreamingToolBatch(toolEntries.map((entry) => entry.toolCall))
      : null;
  if (batchDescriptor) {
    return {
      summaryText: batchDescriptor.title,
      descriptor: batchDescriptor,
      metaText: null,
    };
  }

  const toolCount = toolEntries.length;
  if (toolCount > 0) {
    if (importedToolCount > 0) {
      return {
        summaryText: copy.formatImportedSourceCommandRecord(importedToolCount),
        descriptor: null,
        metaText:
          joinSummaryParts(
            [
              hasImportedThinking ? copy.completedThinking() : null,
              toolCount > 1 ? copy.importedSteps(toolCount) : null,
            ],
            copy.separator(),
          ) || null,
      };
    }

    const toolCalls = toolEntries.map((entry) => entry.toolCall);
    const families = new Set(
      toolCalls.map(
        (toolCall) => getToolDisplayInfo(toolCall.name, toolCall.status).family,
      ),
    );
    if (families.size === 1) {
      return {
        summaryText: buildToolGroupHeadline(
          toolCalls,
          copy.formatImportedSourceCommandRecord,
        ),
        descriptor: null,
        metaText: null,
      };
    }

    const failed = toolCalls.some((toolCall) => toolCall.status === "failed");
    const running = toolCalls.some((toolCall) => toolCall.status === "running");
    return {
      summaryText: failed
        ? copy.failedSteps(toolCount)
        : running
          ? copy.runningSteps(toolCount)
          : copy.completedSteps(toolCount),
      descriptor: null,
      metaText: null,
    };
  }

  const messageCount = entries.length - toolCount;
  const primarySummary = (() => {
    for (const entry of entries) {
      if (entry.kind === "thinking") {
        const preview = resolveThinkingDisplayParts(
          entry.text,
          entry.defaultExpanded === true,
        ).preview;
        if (preview) {
          return preview;
        }
        continue;
      }

      if (entry.kind === "tool") {
        const narrative = resolveToolProcessNarrative(entry.toolCall);
        if (narrative.preSummary || narrative.summary) {
          return narrative.preSummary || narrative.summary;
        }
        continue;
      }

      const prompt = entry.actionRequired.prompt?.trim();
      if (prompt) {
        return prompt.length <= 72
          ? prompt
          : `${prompt.slice(0, 71).trimEnd()}…`;
      }
    }

    return null;
  })();

  if (!primarySummary) {
    const summaryParts: string[] = [];
    if (thinkingCount > 0) {
      summaryParts.push(copy.thinking());
    }
    if (toolCount > 0) {
      summaryParts.push(copy.toolCalls(toolCount));
    }
    if (messageCount > thinkingCount) {
      summaryParts.push(copy.processMessages(messageCount));
    }
    return {
      summaryText: summaryParts.join(copy.separator()),
      descriptor: null,
      metaText: null,
    };
  }

  if (toolCount === 0) {
    if (thinkingCount > 0) {
      const firstThinking = entries.find((entry) => entry.kind === "thinking");
      const thinkingDisplay =
        firstThinking?.kind === "thinking"
          ? resolveThinkingDisplayParts(
              firstThinking.text,
              firstThinking.defaultExpanded === true,
            )
          : null;
      const summaryText =
        hasImportedThinking && thinkingDisplay?.preview
          ? thinkingDisplay.preview
          : thinkingDisplay?.statusLabel || copy.completedThinking();
      return {
        summaryText,
        descriptor: null,
        metaText: thinkingCount > 1 ? copy.thinkingNotes(thinkingCount) : null,
      };
    }

    return {
      summaryText: primarySummary,
      descriptor: null,
      metaText: thinkingCount > 1 ? copy.thinkingNotes(thinkingCount) : null,
    };
  }

  return {
    summaryText: primarySummary,
    descriptor: null,
    metaText:
      entries.length > 1
        ? joinSummaryParts(
            [
              thinkingCount > 0 ? copy.thinkingNotes(thinkingCount) : null,
              copy.toolCalls(toolCount),
            ],
            copy.separator(),
          )
        : null,
  };
}

export const GroupedProcessShell: React.FC<{
  groupMarker: string;
  children: React.ReactNode;
}> = ({ groupMarker, children }) => (
  <div className="flex items-start gap-2 py-1.5">
    <span className="pt-0.5 text-xs text-slate-300">{groupMarker}</span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export const StreamingProcessGroup: React.FC<{
  entries: StreamingProcessEntry[];
  defaultExpanded?: boolean;
  onOpenUrlPreview?: (item: SearchResultPreviewItem) => void;
  renderEntry: (
    entry: StreamingProcessEntry,
    grouped: boolean,
    groupMarker: string,
    entries: StreamingProcessEntry[],
  ) => React.ReactNode;
}> = ({ entries, defaultExpanded = false, onOpenUrlPreview, renderEntry }) => {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const previousDefaultExpandedRef = useRef(defaultExpanded);
  const toolCalls = useMemo(
    () =>
      entries
        .filter(
          (entry): entry is Extract<StreamingProcessEntry, { kind: "tool" }> =>
            entry.kind === "tool",
        )
        .map((entry) => entry.toolCall),
    [entries],
  );
  const { summaryText, descriptor, metaText } = useMemo(
    () =>
      buildStreamingProcessSummary(entries, {
        formatImportedSourceCommandRecord: (count?: number) =>
          t("agentChat.toolCall.importedCommandRecord.groupTitle", {
            count,
          }),
        completedThinking: () =>
          t("agentChat.processGroup.completedThinking", "Reasoning completed"),
        importedSteps: (count: number) =>
          t("agentChat.processGroup.importedSteps", {
            count,
            defaultValue: "Imported process, {{count}} steps",
          }),
        failedSteps: (count: number) =>
          t("agentChat.processGroup.failedSteps", {
            count,
            defaultValue: "{{count}} steps failed",
          }),
        runningSteps: (count: number) =>
          t("agentChat.processGroup.runningSteps", {
            count,
            defaultValue: "{{count}} steps running",
          }),
        completedSteps: (count: number) =>
          t("agentChat.processGroup.completedSteps", {
            count,
            defaultValue: "{{count}} steps completed",
          }),
        thinking: () => t("agentChat.processGroup.thinking", "Reasoning"),
        toolCalls: (count: number) =>
          t("agentChat.processGroup.toolCalls", {
            count,
            defaultValue: "{{count}} tool calls",
          }),
        processMessages: (count: number) =>
          t("agentChat.processGroup.processMessages", {
            count,
            defaultValue: "{{count}} process messages",
          }),
        thinkingNotes: (count: number) =>
          t("agentChat.processGroup.thinkingNotes", {
            count,
            defaultValue: "{{count}} reasoning notes",
          }),
        separator: () => t("agentChat.processGroup.separator", ", "),
      }),
    [entries, t],
  );
  const webSearchPreviewItems = useMemo(() => {
    const seenUrls = new Set<string>();
    const items = toolCalls.flatMap((toolCall) => {
      if (!isUnifiedWebSearchToolName(toolCall.name)) {
        return [];
      }
      return resolveSearchResultPreviewItemsFromText(toolCall.result?.output);
    });
    const uniqueItems = items.filter((item) => {
      if (seenUrls.has(item.url)) {
        return false;
      }
      seenUrls.add(item.url);
      return true;
    });
    return attachUrlPreviewSnapshotsToSearchResults({
      items: uniqueItems,
      toolCalls,
    });
  }, [toolCalls]);
  const hasNonToolEntries = entries.some((entry) => entry.kind !== "tool");

  React.useEffect(() => {
    if (previousDefaultExpandedRef.current !== defaultExpanded) {
      previousDefaultExpandedRef.current = defaultExpanded;
      setExpanded(defaultExpanded);
    }
  }, [defaultExpanded]);

  return (
    <div
      className="py-0.5"
      data-testid="streaming-process-group"
      data-visual-tone="neutral"
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 rounded-lg py-1.5 text-left transition-colors hover:bg-slate-50/70"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            "mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
        <span className="min-w-0 flex-1 text-[13px] font-normal leading-6 text-slate-600">
          <span className="block break-words">{summaryText}</span>
          {metaText ? (
            <span className="mt-0.5 block text-xs font-normal leading-5 text-slate-500">
              {metaText}
            </span>
          ) : null}
          {!hasNonToolEntries && descriptor?.supportingLines?.length ? (
            <span className="mt-0.5 block space-y-0.5">
              {descriptor.supportingLines.slice(0, 5).map((line) => (
                <span
                  key={line}
                  className="block text-xs font-normal leading-5 text-slate-500"
                >
                  {line}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <div className="ml-2">
          {descriptor?.kind === "web_search" && hasNonToolEntries ? (
            entries.map((entry, index) => (
              <React.Fragment key={entry.id}>
                {renderEntry(entry, true, index === 0 ? "└" : "·", entries)}
              </React.Fragment>
            ))
          ) : descriptor?.kind === "web_search" &&
            onOpenUrlPreview &&
            webSearchPreviewItems.length > 0 ? (
            <GroupedProcessShell groupMarker="└">
              <SearchResultPreviewList
                items={webSearchPreviewItems}
                onOpenItem={onOpenUrlPreview}
                popoverSide="bottom"
                popoverAlign="start"
                className="max-w-2xl"
              />
            </GroupedProcessShell>
          ) : descriptor?.kind === "web_search" &&
            descriptor.supportingLines.length > 0 ? (
            descriptor.supportingLines.slice(0, 10).map((line, index) => (
              <GroupedProcessShell
                key={`web-search-source-${index}-${line}`}
                groupMarker={index === 0 ? "└" : "·"}
              >
                <div className="text-xs leading-5 text-slate-500">{line}</div>
              </GroupedProcessShell>
            ))
          ) : (
            entries.map((entry, index) => (
              <React.Fragment key={entry.id}>
                {renderEntry(entry, true, index === 0 ? "└" : "·", entries)}
              </React.Fragment>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};
