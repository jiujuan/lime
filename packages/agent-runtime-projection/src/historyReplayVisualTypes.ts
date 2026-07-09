export type AgentUiHistoryReplayVisualItemKind =
  | "user"
  | "assistant"
  | "reasoning"
  | "mcp_tool_call"
  | "tool_call"
  | "unknown";

export type AgentUiHistoryReplayVisualItemStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "unknown";

export type AgentUiHistoryReplayVisualIssueCode =
  | "missing_replayed_items"
  | "missing_hydrated_items"
  | "missing_visual_rows"
  | "hydrate_item_missing"
  | "visual_row_missing"
  | "item_identity_drift"
  | "item_order_drift"
  | "user_text_elements_lost"
  | "user_image_refs_lost"
  | "legacy_image_placeholder_only"
  | "mcp_in_progress_not_active"
  | "mcp_active_rendered_as_completed_history"
  | "reasoning_summary_duplicated"
  | "common_renderer_owner_missing"
  | "live_hydrate_renderer_split"
  | "page_text_only_oracle";

export interface AgentUiHistoryReplayVisualIssue {
  code: AgentUiHistoryReplayVisualIssueCode;
  path: string;
  message: string;
}

export interface AgentUiHistoryReplayVisualProjectionInput {
  threadId?: string | null;
  turnId?: string | null;
  replayedItems?: unknown;
  hydratedItems?: unknown;
  readModelItems?: unknown;
  threadItems?: unknown;
  visualRows?: unknown;
  renderedRows?: unknown;
  transcriptRows?: unknown;
  liveRendererOwner?: string | null;
  hydrateRendererOwner?: string | null;
  rendererOwner?: string | null;
  rendererOwners?: unknown;
  pageTextOracle?: unknown;
  timestamp?: string | null;
}

export interface AgentUiHistoryReplayVisualItemSnapshot {
  source: "replayed" | "hydrated";
  index: number;
  id: string;
  turnId?: string;
  kind: AgentUiHistoryReplayVisualItemKind;
  status: AgentUiHistoryReplayVisualItemStatus;
  sequence?: number;
  textPreview?: string;
  textElementCount: number;
  localImageRefs: string[];
  remoteImageRefs: string[];
  summaryTexts: string[];
}

export interface AgentUiHistoryReplayVisualRowSnapshot {
  index: number;
  rowId?: string;
  itemId: string;
  turnId?: string;
  kind: AgentUiHistoryReplayVisualItemKind;
  status: AgentUiHistoryReplayVisualItemStatus;
  active: boolean;
  rendererOwner?: string;
  textPreview?: string;
  textElementCount: number;
  localImageRefs: string[];
  remoteImageRefs: string[];
  summaryRenderCount: number;
  pageTextOnly: boolean;
}

export interface AgentUiHistoryReplayVisualSnapshot {
  threadId?: string;
  turnId?: string;
  replayedItems: AgentUiHistoryReplayVisualItemSnapshot[];
  hydratedItems: AgentUiHistoryReplayVisualItemSnapshot[];
  visualRows: AgentUiHistoryReplayVisualRowSnapshot[];
  rendererOwners: string[];
  replayedItemIds: string[];
  hydratedItemIds: string[];
  visualItemIds: string[];
  itemIdentityStable: boolean;
  itemOrderStable: boolean;
  userRichContentPreserved: boolean;
  mcpActivePreserved: boolean;
  reasoningSummaryDeduped: boolean;
  rendererSingleOwner: boolean;
  pageTextOnlyRejected: boolean;
  validationIssues: AgentUiHistoryReplayVisualIssue[];
}
