import type {
  AgentUiControl,
  AgentUiEventClass,
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";

import {
  type AgentUiProjectionBase,
  buildAgentUiProjectionBase,
} from "./envelope.js";
import { extractArtifactRefs } from "./refs.js";
import {
  compactProjectionFields,
  metadataKeys,
  readRecord,
  readStringArrayField,
  readStringField,
  truncateText,
} from "./normalization.js";
import { extractAgentUiToolLifecyclePayloadMetadata } from "./toolLifecycleMetadata.js";

export interface AgentUiThreadItemProjectionInput {
  id: string;
  thread_id: string;
  turn_id: string;
  type: string;
  status: "in_progress" | "completed" | "failed" | string;
  text?: string;
  summary?: string | readonly string[];
  tool_name?: string;
  status_label?: string;
  title?: string;
  role?: string;
  model?: string;
  session_id?: string;
  output?: string;
  success?: boolean;
  error?: string;
  metadata?: unknown;
  command?: string;
  cwd?: string;
  aggregated_output?: string;
  exit_code?: number;
  query?: string;
  action?: string;
  action_data?: unknown;
  results?: readonly unknown[] | null;
  request_id?: string;
  action_type?: string;
  prompt?: string;
  questions?: readonly unknown[] | null;
  response?: unknown;
  path?: string;
  source?: string;
  content?: string | readonly string[];
  stage?: string;
  trigger?: string;
  detail?: string;
  message?: string;
  code?: string;
  contentParts?: readonly unknown[] | null;
}

export interface AgentUiTaskOwnerChangeProjectionInput {
  toolName: string;
  status?: string;
  success?: boolean;
  metadata?: unknown;
}

export interface AgentUiTaskOwnerChangeProjection {
  action: "assign" | "reassign";
  taskId: string;
  previousAssigneeId?: string;
  nextAssigneeId: string;
  sourceTaskListId?: string;
  sourceToolName: string;
  reassignmentReason: string;
}

export function normalizeAgentUiProjectionToolName(toolName: string): string {
  return toolName.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isAgentUiTaskUpdateToolName(toolName: string): boolean {
  const normalized = normalizeAgentUiProjectionToolName(toolName);
  return normalized === "taskupdate" || normalized === "taskupdatetool";
}

export function extractAgentUiTaskOwnerChangeProjection(
  input: AgentUiTaskOwnerChangeProjectionInput,
): AgentUiTaskOwnerChangeProjection | null {
  if (
    input.status !== "completed" ||
    input.success === false ||
    !isAgentUiTaskUpdateToolName(input.toolName)
  ) {
    return null;
  }

  const metadata = readRecord(input.metadata);
  const updatedFields = readStringArrayField(metadata, [
    "updated_fields",
    "updatedFields",
  ]).map((field) => field.toLowerCase());
  if (!updatedFields.includes("owner")) {
    return null;
  }

  const task = readRecord(metadata?.task);
  const ownerChange = readRecord(
    metadata?.owner_change ?? metadata?.ownerChange,
  );
  const taskId =
    readStringField(metadata, ["task_id", "taskId"]) ??
    readStringField(task, ["id", "taskId"]);
  const nextAssigneeId =
    readStringField(ownerChange, ["to", "next", "nextOwner"]) ??
    readStringField(task, ["owner", "ownerName"]);
  if (!taskId || !nextAssigneeId) {
    return null;
  }

  const previousAssigneeId = readStringField(ownerChange, [
    "from",
    "previous",
    "previousOwner",
  ]);
  const sourceTaskListId = readStringField(metadata, [
    "task_list_id",
    "taskListId",
  ]);

  return {
    action: previousAssigneeId ? "reassign" : "assign",
    taskId,
    previousAssigneeId,
    nextAssigneeId,
    sourceTaskListId,
    sourceToolName: input.toolName,
    reassignmentReason: `${input.toolName} owner change`,
  };
}

export function resolveAgentUiThreadItemPhase(
  item: Pick<AgentUiThreadItemProjectionInput, "status">,
): AgentUiPhase {
  if (item.status === "failed") {
    return "failed";
  }
  if (item.status === "completed") {
    return "completed";
  }
  return "acting";
}

export function resolveAgentUiThreadItemToolResultType(
  item: Pick<AgentUiThreadItemProjectionInput, "exit_code" | "status" | "type">,
): AgentUiEventClass {
  if (item.status === "failed") {
    return "tool.failed";
  }
  if (
    item.type === "command_execution" &&
    typeof item.exit_code === "number" &&
    item.exit_code !== 0
  ) {
    return "tool.failed";
  }
  if (item.status === "completed") {
    return "tool.result";
  }
  return "tool.progress";
}

export function resolveAgentUiThreadItemToolPhase(
  item: Pick<AgentUiThreadItemProjectionInput, "exit_code" | "status" | "type">,
): AgentUiPhase {
  if (resolveAgentUiThreadItemToolResultType(item) === "tool.failed") {
    return "failed";
  }
  return resolveAgentUiThreadItemPhase(item);
}

export function resolveAgentUiThreadItemSubagentRuntimeStatus(
  item: Pick<AgentUiThreadItemProjectionInput, "status_label">,
): AgentUiRuntimeStatus {
  switch (item.status_label?.trim().toLowerCase()) {
    case "started":
    case "interacted":
      return "running";
    case "interrupted":
      return "cancelled";
    default:
      return "unknown";
  }
}

function resolveAgentUiThreadItemSubagentPhase(
  item: Pick<AgentUiThreadItemProjectionInput, "status_label">,
): AgentUiPhase {
  return item.status_label?.trim().toLowerCase() === "interrupted"
    ? "interrupted"
    : item.status_label?.trim().toLowerCase() === "started" ||
        item.status_label?.trim().toLowerCase() === "interacted"
      ? "acting"
      : "unknown";
}

export function buildAgentUiThreadItemBase(
  sourceType: AgentUiProjectionSourceType | string,
  item: Pick<AgentUiThreadItemProjectionInput, "id" | "thread_id" | "turn_id">,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionBase {
  return {
    ...buildAgentUiProjectionBase({ sourceType }, context),
    threadId: item.thread_id,
    turnId: item.turn_id,
    partId: item.id,
  };
}

function isInlineMediaReference(uri: string): boolean {
  return uri.trimStart().toLowerCase().startsWith("data:");
}

function pushUnique(values: string[], value: string | undefined): void {
  const normalized = value?.trim();
  if (!normalized || values.includes(normalized)) {
    return;
  }
  values.push(normalized);
}

function summarizeAgentMessageContentParts(
  contentParts: readonly unknown[] | null | undefined,
): {
  contentPartCount: number;
  mediaKinds: string[];
  referenceUris: string[];
} {
  if (!Array.isArray(contentParts)) {
    return {
      contentPartCount: 0,
      mediaKinds: [],
      referenceUris: [],
    };
  }

  const mediaKinds: string[] = [];
  const referenceUris: string[] = [];
  for (const part of contentParts) {
    const record = readRecord(part);
    if (readStringField(record, ["type"]) !== "media") {
      continue;
    }
    pushUnique(mediaKinds, readStringField(record, ["kind"]));
    const reference = readRecord(record?.reference);
    const uri = readStringField(reference, ["uri"]);
    if (uri && !isInlineMediaReference(uri)) {
      pushUnique(referenceUris, uri);
    }
  }

  return {
    contentPartCount: contentParts.length,
    mediaKinds,
    referenceUris,
  };
}

function extractCanonicalToolItemPayload(
  metadata: unknown,
): Record<string, unknown> {
  const record = readRecord(metadata);
  const canonicalType = readStringField(record, ["canonical_type"]);
  if (!canonicalType) {
    return {};
  }
  if (canonicalType === "mcpToolCall") {
    return compactProjectionFields({
      canonicalType,
      mcpServer: readStringField(record, ["server"]),
      mcpAppContext: readRecord(record?.app_context),
      mcpPluginId: readStringField(record, ["plugin_id"]),
      mcpResultContent: Array.isArray(record?.result_content)
        ? record.result_content
        : undefined,
      mcpResultMeta: record?.result_meta,
    });
  }
  if (canonicalType === "dynamicToolCall") {
    return compactProjectionFields({
      canonicalType,
      namespace: readStringField(record, ["namespace"]),
      contentItems: Array.isArray(record?.content_items)
        ? record.content_items
        : undefined,
    });
  }
  if (canonicalType === "collabAgentToolCall") {
    return compactProjectionFields({
      canonicalType,
      senderThreadId: readStringField(record, ["sender_thread_id"]),
      receiverThreadIds: readStringArrayField(record, ["receiver_thread_ids"]),
      prompt: readStringField(record, ["prompt"]),
      model: readStringField(record, ["model"]),
      reasoningEffort: readStringField(record, ["reasoning_effort"]),
      agentsStates: readRecord(record?.agents_states),
    });
  }
  return { canonicalType };
}

export function buildAgentUiThreadItemSubagentActivityEvent(
  sourceType: AgentUiProjectionSourceType | string,
  item: AgentUiThreadItemProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | null {
  if (item.type !== "subagent_activity") {
    return null;
  }

  const runtimeStatus = resolveAgentUiThreadItemSubagentRuntimeStatus(item);
  return {
    ...buildAgentUiThreadItemBase(sourceType, item, context),
    type: "agent.changed",
    taskId: item.session_id,
    agentId: item.session_id,
    owner: "task",
    scope: "agent",
    phase: resolveAgentUiThreadItemSubagentPhase(item),
    surface: "task_capsule",
    persistence: "archive",
    runtimeEntity: "subagent_turn",
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
    topology: "coordinator_team",
    payload: {
      runtimeEntity: "subagent_turn",
      statusLabel: item.status_label,
      title: item.title,
      role: item.role,
      model: item.model,
      childSessionId: item.session_id,
    },
  };
}

export function resolveAgentUiThreadItemActionControl(
  item: Pick<AgentUiThreadItemProjectionInput, "type">,
): AgentUiControl | undefined {
  if (item.type === "request_user_input") {
    return "answer";
  }
  if (item.type === "approval_request") {
    return "approve";
  }
  return undefined;
}

export function buildAgentUiThreadItemActionEvent(
  sourceType: AgentUiProjectionSourceType | string,
  item: AgentUiThreadItemProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | null {
  if (item.type !== "approval_request" && item.type !== "request_user_input") {
    return null;
  }

  const base = buildAgentUiThreadItemBase(sourceType, item, context);
  const hasResponse = Boolean(item.response);
  return {
    ...base,
    type: hasResponse ? "action.resolved" : "action.required",
    actionId: item.request_id,
    owner: "action",
    scope: "action_request",
    phase: hasResponse ? "completed" : "waiting",
    surface: "hitl",
    persistence: "archive",
    control: resolveAgentUiThreadItemActionControl(item),
    payload: {
      actionType: item.action_type,
      promptPreview: truncateText(item.prompt),
      questionCount:
        item.type === "request_user_input" ? (item.questions?.length ?? 0) : 0,
      hasResponse,
    },
  };
}

export function buildAgentUiThreadItemEvent(
  sourceType: AgentUiProjectionSourceType | string,
  item: AgentUiThreadItemProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | null {
  const base = buildAgentUiThreadItemBase(sourceType, item, context);

  switch (item.type) {
    case "approval_request":
    case "request_user_input":
      return buildAgentUiThreadItemActionEvent(sourceType, item, context);
    case "subagent_activity":
      return buildAgentUiThreadItemSubagentActivityEvent(
        sourceType,
        item,
        context,
      );
    case "agent_message": {
      const contentSummary = summarizeAgentMessageContentParts(
        item.contentParts,
      );
      return {
        ...base,
        type: item.status === "completed" ? "messages.snapshot" : "text.delta",
        owner: "model",
        scope: "part",
        phase: resolveAgentUiThreadItemPhase(item),
        surface: "conversation",
        persistence: "transcript",
        payload: {
          textLength: item.text?.length ?? 0,
          preview: truncateText(item.text),
          ...contentSummary,
        },
      };
    }
    case "plan":
      return {
        ...base,
        type: item.status === "completed" ? "plan.final" : "plan.delta",
        owner: "model",
        scope: "part",
        phase: item.status === "completed" ? "completed" : "planning",
        surface: "inline_process",
        persistence: "archive",
        payload: {
          textLength: item.text?.length ?? 0,
          preview: truncateText(item.text),
        },
      };
    case "reasoning":
      return {
        ...base,
        type:
          item.status === "completed" ? "reasoning.summary" : "reasoning.delta",
        owner: "model",
        scope: "part",
        phase: item.status === "completed" ? "completed" : "reasoning",
        surface: "inline_process",
        persistence: "archive",
        payload: {
          textLength: item.text?.length ?? 0,
          summaryCount: Array.isArray(item.summary) ? item.summary.length : 0,
          preview: truncateText(
            readThreadItemSummaryText(item.summary) ?? item.text,
          ),
        },
      };
    case "tool_call":
      return {
        ...base,
        type:
          item.status === "failed" || item.success === false
            ? "tool.failed"
            : item.status === "completed"
              ? "tool.result"
              : "tool.progress",
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: resolveAgentUiThreadItemPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: item.tool_name,
          success: item.success,
          outputPreview: truncateText(item.output),
          errorPreview: truncateText(item.error),
          metadataKeys: metadataKeys(item.metadata),
          ...extractCanonicalToolItemPayload(item.metadata),
          ...extractAgentUiToolLifecyclePayloadMetadata(item.metadata),
        },
        refs: extractArtifactRefs(item.metadata),
      };
    case "command_execution":
      return {
        ...base,
        type: resolveAgentUiThreadItemToolResultType(item),
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: resolveAgentUiThreadItemToolPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: "command_execution",
          commandPreview: truncateText(item.command),
          cwd: item.cwd,
          exitCode: item.exit_code,
          outputPreview: truncateText(item.aggregated_output),
          errorPreview: truncateText(item.error),
        },
      };
    case "web_search":
      return {
        ...base,
        type: resolveAgentUiThreadItemToolResultType(item),
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: resolveAgentUiThreadItemToolPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: "web_search",
          queryPreview: truncateText(item.query),
          action: item.action,
          actionData: item.action_data,
          results: Array.isArray(item.results) ? item.results : undefined,
          resultCount: Array.isArray(item.results)
            ? item.results.length
            : undefined,
          outputPreview: truncateText(item.output),
        },
      };
    case "file_artifact":
      return {
        ...base,
        type:
          item.status === "completed"
            ? "artifact.preview.ready"
            : "artifact.updated",
        artifactId: item.id,
        owner: "artifact",
        scope: "artifact",
        phase: item.status === "completed" ? "completed" : "producing",
        surface: "artifact_workspace",
        persistence: "artifact_store",
        payload: {
          filePath: item.path,
          source: item.source,
          contentLength: item.content?.length ?? 0,
          metadataKeys: metadataKeys(item.metadata),
        },
        refs: {
          artifactIds: [item.id],
          artifactPaths: item.path ? [item.path] : [],
        },
      };
    case "context_compaction":
      return {
        ...base,
        type:
          item.stage === "completed"
            ? "context.compaction.completed"
            : "context.compaction.started",
        owner: "context",
        scope: "turn",
        phase: item.stage === "completed" ? "completed" : "preparing",
        surface: "timeline_evidence",
        persistence: "archive",
        payload: {
          stage: item.stage,
          trigger: item.trigger,
          detailPreview: truncateText(item.detail),
        },
      };
    case "turn_summary":
      return {
        ...base,
        type: "state.snapshot",
        owner: "session",
        scope: "turn",
        phase: "archived",
        surface: "timeline_evidence",
        persistence: "archive",
        payload: {
          textLength: item.text?.length ?? 0,
          preview: truncateText(item.text),
        },
      };
    case "warning":
    case "error":
      return {
        ...base,
        type: "diagnostic.changed",
        owner: "diagnostics",
        scope: "turn",
        phase:
          item.type === "error"
            ? "failed"
            : resolveAgentUiThreadItemPhase(item),
        surface: "diagnostics",
        persistence: "diagnostics_log",
        payload: {
          code: item.type === "warning" ? item.code : undefined,
          messagePreview: truncateText(item.message),
        },
      };
    default:
      return null;
  }
}

function readThreadItemSummaryText(
  summary: string | readonly string[] | undefined,
): string | undefined {
  if (typeof summary === "string") {
    return summary;
  }
  return summary?.[0];
}
