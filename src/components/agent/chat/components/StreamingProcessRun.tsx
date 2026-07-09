import React, { memo, useCallback } from "react";
import { ActionRequestA2UIPreviewCard } from "./ActionRequestA2UIPreviewCard";
import { ApprovalRecordCard } from "./ApprovalRecordCard";
import { DecisionPanel } from "./DecisionPanel";
import { InlineToolProcessStep } from "./InlineToolProcessStep";
import {
  GroupedProcessShell,
  StreamingProcessGroup,
} from "./StreamingProcessGroup";
import {
  coalesceAdjacentThinkingProcessEntries,
  isImportedProcessMetadata,
  isImportedToolCall,
  isWebRetrievalToolCall,
  shouldAutoExpandProcessEntries,
  type StreamingProcessEntry,
} from "./StreamingProcessGroupModel";
import { ThinkingBlock } from "./ThinkingBlock";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type {
  ActionRequired,
  ConfirmResponse,
  SiteSavedContentTarget,
} from "../types";
import type { SearchResultPreviewItem } from "../utils/searchResultPreview";
import {
  buildActionRequestSubmissionPayload,
  isActionRequestA2UICompatible,
} from "../utils/actionRequestA2UI";
import { toApprovalRecordFromActionRequired } from "./timeline-utils";

interface StreamingProcessRunProps {
  entries: StreamingProcessEntry[];
  forceGroup?: boolean;
  isStreaming: boolean;
  processIsActive: boolean;
  shouldKeepProcessOpenForFinalAnswer: boolean;
  promoteActionRequestsToA2UI: boolean;
  readOnlyActionRequests: boolean;
  onPermissionResponse?: (response: ConfirmResponse) => void;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  onOpenUrlPreview?: (item: SearchResultPreviewItem) => void;
}

export const StreamingProcessRun: React.FC<StreamingProcessRunProps> = memo(
  ({
    entries,
    forceGroup = false,
    isStreaming,
    processIsActive,
    shouldKeepProcessOpenForFinalAnswer,
    promoteActionRequestsToA2UI,
    readOnlyActionRequests,
    onPermissionResponse,
    onFileClick,
    onOpenSavedSiteContent,
    onOpenUrlPreview,
  }) => {
    const renderActionRequestNode = useCallback(
      (request: ActionRequired) => {
        if (request.actionType === "tool_confirmation") {
          if (request.status !== "submitted") {
            return null;
          }
          const approvalRecord = toApprovalRecordFromActionRequired(request);
          return approvalRecord ? (
            <ApprovalRecordCard record={approvalRecord} />
          ) : null;
        }

        const shouldRenderA2UICard =
          isActionRequestA2UICompatible(request) &&
          (readOnlyActionRequests ||
            request.status === "submitted" ||
            request.status === "queued" ||
            (promoteActionRequestsToA2UI && request.status === "pending"));
        if (shouldRenderA2UICard) {
          const isReadOnly =
            readOnlyActionRequests ||
            request.status === "submitted" ||
            request.status === "queued" ||
            !onPermissionResponse;
          return (
            <ActionRequestA2UIPreviewCard
              request={request}
              compact={true}
              context="chat"
              readOnly={isReadOnly}
              onSubmit={
                isReadOnly
                  ? undefined
                  : (formData) => {
                      const payload = buildActionRequestSubmissionPayload(
                        request,
                        formData,
                      );
                      onPermissionResponse({
                        requestId: request.requestId,
                        confirmed: true,
                        actionType: request.actionType,
                        response: payload.responseText,
                        userData: payload.userData,
                      });
                    }
              }
            />
          );
        }
        return (
          <DecisionPanel
            request={request}
            onSubmit={onPermissionResponse || (() => {})}
          />
        );
      },
      [
        onPermissionResponse,
        promoteActionRequestsToA2UI,
        readOnlyActionRequests,
      ],
    );

    const renderProcessEntry = useCallback(
      (
        entry: StreamingProcessEntry,
        grouped: boolean,
        groupMarker: string,
        processEntries: StreamingProcessEntry[],
      ) => {
        if (entry.kind === "thinking") {
          const preserveThinkingSourceText =
            entry.preserveSourceText ||
            isImportedProcessMetadata(entry.metadata);
          const isThinkingStreaming =
            Boolean(entry.isActive ?? isStreaming) &&
            isStreaming &&
            !preserveThinkingSourceText;
          return (
            <ThinkingBlock
              key={entry.id}
              content={entry.text}
              defaultExpanded={Boolean(entry.defaultExpanded)}
              grouped={grouped}
              groupMarker={groupMarker}
              hideSummary={grouped}
              isStreaming={isThinkingStreaming}
              preserveSourceText={preserveThinkingSourceText}
              autoCollapseEligible={Boolean(entry.autoCollapseEligible)}
              autoCollapseWhenOverflow={true}
            />
          );
        }

        if (entry.kind === "tool") {
          const siblingToolCalls = processEntries
            .filter(
              (
                candidate,
              ): candidate is Extract<
                StreamingProcessEntry,
                { kind: "tool" }
              > => candidate.kind === "tool",
            )
            .map((candidate) => candidate.toolCall);
          return (
            <InlineToolProcessStep
              key={entry.id}
              toolCall={entry.toolCall}
              isActiveProcess={shouldKeepProcessOpenForFinalAnswer}
              isMessageStreaming={isStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
              onOpenUrlPreview={onOpenUrlPreview}
              urlPreviewToolCalls={siblingToolCalls}
              grouped={grouped}
              groupMarker={groupMarker}
            />
          );
        }

        const actionNode = renderActionRequestNode(entry.actionRequired);
        if (!grouped) {
          return <React.Fragment key={entry.id}>{actionNode}</React.Fragment>;
        }

        return (
          <GroupedProcessShell key={entry.id} groupMarker={groupMarker}>
            {actionNode}
          </GroupedProcessShell>
        );
      },
      [
        isStreaming,
        onFileClick,
        onOpenSavedSiteContent,
        onOpenUrlPreview,
        renderActionRequestNode,
        shouldKeepProcessOpenForFinalAnswer,
      ],
    );

    if (entries.length === 0) {
      return null;
    }

    const coalescedEntries = coalesceAdjacentThinkingProcessEntries(entries);
    const toolCount = coalescedEntries.filter(
      (entry) => entry.kind === "tool",
    ).length;
    const hasImportedProcess = coalescedEntries.some(
      (entry) =>
        (entry.kind === "thinking" &&
          isImportedProcessMetadata(entry.metadata)) ||
        (entry.kind === "tool" && isImportedToolCall(entry.toolCall)),
    );
    const processEntries = hasImportedProcess
      ? coalescedEntries.map((entry) =>
          entry.kind === "thinking"
            ? {
                ...entry,
                defaultExpanded: entry.defaultExpanded ?? true,
                preserveSourceText: true,
              }
            : entry,
        )
      : coalescedEntries;
    const toolEntries = processEntries.filter(
      (entry): entry is Extract<StreamingProcessEntry, { kind: "tool" }> =>
        entry.kind === "tool",
    );
    const shouldRenderGroupedTimeline =
      toolEntries.length > 0 &&
      toolEntries.every((entry) => isWebRetrievalToolCall(entry.toolCall));

    if (
      shouldRenderGroupedTimeline &&
      (forceGroup || (toolCount > 0 && processEntries.length > 1))
    ) {
      return (
        <StreamingProcessGroup
          entries={processEntries}
          defaultExpanded={shouldAutoExpandProcessEntries(
            processEntries,
            processIsActive,
          )}
          onOpenUrlPreview={onOpenUrlPreview}
          renderEntry={renderProcessEntry}
        />
      );
    }

    return (
      <>
        {processEntries.map((entry) => (
          <React.Fragment key={entry.id}>
            {renderProcessEntry(entry, false, "•", processEntries)}
          </React.Fragment>
        ))}
      </>
    );
  },
);

StreamingProcessRun.displayName = "StreamingProcessRun";

export type { StreamingProcessEntry, ToolCallState };
