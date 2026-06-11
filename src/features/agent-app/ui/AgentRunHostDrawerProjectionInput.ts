import { resolveUserFacingToolDisplayLabel } from "@/components/agent/chat/utils/toolDisplayInfo";
import { resolveToolProcessNarrative } from "@/components/agent/chat/utils/toolProcessSummary";
import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import type { AgentRunTranslator, AgentRunUiState } from "./AgentRunHostDrawer";

export interface AgentRunTimelineGroup {
  key: string;
  kind: string;
  title: string;
  message: string | null;
  meta: string | null;
  detail: string | null;
  count: number;
  toolCall: AgentToolCallState | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

function readTimelineKind(record: Record<string, unknown>): string {
  return readString(record.kind) ?? "progress";
}

function extractToolNameFromTimelineTitle(title: string): string | null {
  const match = title.match(/^(?:工具|Tool|技能|Skill)\s*·\s*(.+)$/);
  return match?.[1]?.trim() || null;
}

function readTimelineToolName(
  record: Record<string, unknown>,
  fallbackTitle?: string,
): string | null {
  return (
    readString(record.toolName) ??
    readString(record.tool_name) ??
    readString(record.name) ??
    readString(record.tool) ??
    extractToolNameFromTimelineTitle(
      readString(record.title) ?? fallbackTitle ?? "",
    )
  );
}

function resolveTimelineTitle(
  record: Record<string, unknown>,
  fallback: string,
): string {
  const title = readString(record.title) ?? fallback;
  if (readTimelineKind(record) !== "tool") {
    return title;
  }
  const toolName = readTimelineToolName(record, title);
  if (!toolName) {
    return title;
  }
  const displayName = resolveUserFacingToolDisplayLabel(toolName);
  return displayName && displayName !== toolName
    ? title.replace(toolName, displayName)
    : title;
}

function stringifyToolArguments(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function readToolStatus(
  record: Record<string, unknown>,
): AgentToolCallState["status"] {
  const status =
    readString(record.status) ??
    readString(record.statusText) ??
    readString(record.state) ??
    "";
  const normalized = status.toLowerCase();
  if (/fail|error|errored|blocked|失败|错误|中断/.test(normalized)) {
    return "failed";
  }
  if (
    /complete|completed|done|success|succeeded|已完成|完成|成功|已查看|已拿到|已记录|已保存|已更新|已执行/.test(
      normalized,
    )
  ) {
    return "completed";
  }
  return "running";
}

function buildToolCallFromTimeline(
  record: Record<string, unknown>,
): AgentToolCallState | null {
  const title = readString(record.title) ?? undefined;
  const kind = readTimelineKind(record);
  const timelineToolName = readTimelineToolName(record, title);
  if (!timelineToolName) {
    return null;
  }
  const toolName = kind === "skill" ? "Skill" : timelineToolName;
  const fallbackArguments =
    kind === "skill"
      ? {
          skill: timelineToolName,
          skill_title: timelineToolName,
        }
      : undefined;

  const result = isRecord(record.result) ? record.result : null;
  const output =
    readString(record.output) ??
    readString(record.result) ??
    readString(result?.output);
  const error = readString(record.error) ?? readString(result?.error);
  const metadata = isRecord(record.metadata)
    ? record.metadata
    : isRecord(result?.metadata)
      ? result.metadata
      : undefined;
  const hasResult = Boolean(output || error || metadata);

  return {
    id:
      readString(record.id) ??
      readString(record.toolCallId) ??
      readString(record.callId) ??
      toolName,
    name: toolName,
    arguments: stringifyToolArguments(
      record.arguments ?? record.args ?? record.input ?? fallbackArguments,
    ),
    status: readToolStatus(record),
    startTime: new Date(0),
    result: hasResult
      ? {
          success: !error,
          output: output ?? "",
          ...(error ? { error } : {}),
          ...(metadata || kind === "skill"
            ? {
                metadata: {
                  ...(metadata ?? {}),
                  ...(kind === "skill"
                    ? {
                        tool_family: "skill",
                        skill_name: timelineToolName,
                        skill_title: timelineToolName,
                      }
                    : {}),
                },
              }
            : {}),
        }
      : undefined,
  };
}

function resolveTimelineToolSummary(
  toolCall: AgentToolCallState | null,
): string | null {
  if (!toolCall) {
    return null;
  }
  return resolveToolProcessNarrative(toolCall).summary;
}

export function buildTimelineGroups(
  timeline: unknown[],
  fallbackTitle: string,
): AgentRunTimelineGroup[] {
  const groups: AgentRunTimelineGroup[] = [];
  const groupedByCollapseKey = new Map<string, AgentRunTimelineGroup>();

  timeline.forEach((item, index) => {
    const record: Record<string, unknown> = isRecord(item) ? item : {};
    const collapseKey = readString(record.collapseKey);
    const groupKey = collapseKey ? `collapse:${collapseKey}` : `item:${index}`;
    const existing = collapseKey ? groupedByCollapseKey.get(groupKey) : null;
    const kind = readTimelineKind(record);
    const rawMessage = readString(record.message);
    const toolCall =
      kind === "tool" || kind === "skill"
        ? buildToolCallFromTimeline(record)
        : null;
    const toolSummary = resolveTimelineToolSummary(toolCall);
    const message = toolSummary ?? rawMessage;
    const detail = [
      toolSummary && rawMessage && toolSummary !== rawMessage
        ? rawMessage
        : null,
      readString(record.detail),
    ]
      .filter(Boolean)
      .join("\n");
    const nextDetail = [message, detail].filter(Boolean).join("\n");

    if (existing) {
      existing.count += 1;
      existing.detail = [existing.detail, nextDetail].filter(Boolean).join("\n");
      if (!existing.message && message) {
        existing.message = message;
      }
      return;
    }

    const group: AgentRunTimelineGroup = {
      key: groupKey,
      kind,
      title: resolveTimelineTitle(record, fallbackTitle),
      message,
      meta: readString(record.meta) ?? readString(record.statusText),
      detail: detail || null,
      count: 1,
      toolCall,
    };
    groups.push(group);
    if (collapseKey) {
      groupedByCollapseKey.set(groupKey, group);
    }
  });

  return groups;
}

function enrichTimelineRecordForProjection(
  item: unknown,
  fallbackTitle: string,
): unknown {
  if (!isRecord(item)) {
    return item;
  }
  const kind = readTimelineKind(item);
  const toolCall =
    kind === "tool" || kind === "skill" ? buildToolCallFromTimeline(item) : null;
  const rawMessage = readString(item.message);
  const toolSummary = resolveTimelineToolSummary(toolCall);
  const displayMessage = [toolSummary, rawMessage]
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
    .join("\n");
  return {
    ...item,
    displayTitle: resolveTimelineTitle(item, fallbackTitle),
    ...(displayMessage ? { displayMessage } : {}),
  };
}

function enrichRuntimeProcessForProjection(
  value: unknown,
  fallbackTitle: string,
): unknown {
  if (!isRecord(value) || !Array.isArray(value.timeline)) {
    return value;
  }
  return {
    ...value,
    timeline: value.timeline.map((item) =>
      enrichTimelineRecordForProjection(item, fallbackTitle),
    ),
  };
}

function enrichProjectionContainer(
  value: unknown,
  fallbackTitle: string,
): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return {
    ...value,
    runtimeProcess: enrichRuntimeProcessForProjection(
      value.runtimeProcess,
      fallbackTitle,
    ),
    process: enrichRuntimeProcessForProjection(value.process, fallbackTitle),
  };
}

export function buildSharedProjectionInput(
  run: AgentRunUiState,
  t: AgentRunTranslator,
): AgentRunUiState {
  const fallbackTitle = t("agentApp.apps.runtime.agentRun.timeline.event");
  return {
    ...run,
    runtimeProcess: enrichRuntimeProcessForProjection(
      run.runtimeProcess,
      fallbackTitle,
    ),
    task: enrichProjectionContainer(run.task, fallbackTitle),
    snapshot: enrichProjectionContainer(run.snapshot, fallbackTitle),
  };
}
