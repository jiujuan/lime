import { Bot, PanelRightClose, X } from "lucide-react";
import { InlineToolProcessStep } from "@/components/agent/chat/components/InlineToolProcessStep";
import { MarkdownRenderer } from "@/components/agent/chat/components/MarkdownRenderer";
import { ThinkingBlock } from "@/components/agent/chat/components/ThinkingBlock";
import { resolveUserFacingToolDisplayLabel } from "@/components/agent/chat/utils/toolDisplayInfo";
import { resolveToolProcessNarrative } from "@/components/agent/chat/utils/toolProcessSummary";
import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import { buildAgentRunProjectionViewModelFromState } from "../runtime/agentRunProjectionState";
import type {
  AgentAppHostAgentRunUiMode,
  AgentAppHostAgentRunUiRequest,
} from "../runtime/hostBridge";
import {
  AgentRunProjectionPanel,
  type AgentRunProjectionPanelLabels,
  type AgentRunProjectionPanelProps,
} from "./AgentRunProjectionPanel";

export type AgentRunTranslator = (
  key: string,
  params?: Record<string, unknown>,
) => string;

export interface AgentRunUiState extends AgentAppHostAgentRunUiRequest {
  mode: AgentAppHostAgentRunUiMode;
  openedAt: string;
  updatedAt: string;
}

interface AgentRunFactItem {
  title: string;
  meta: string | null;
}

interface AgentRunTimelineGroup {
  key: string;
  kind: string;
  title: string;
  message: string | null;
  meta: string | null;
  detail: string | null;
  count: number;
  toolCall: AgentToolCallState | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRuntimeProcess(run: AgentRunUiState): Record<string, unknown> | null {
  const candidates = [
    run.runtimeProcess,
    isRecord(run.task) ? run.task.runtimeProcess ?? run.task.process : null,
    isRecord(run.snapshot)
      ? run.snapshot.runtimeProcess ?? run.snapshot.process
      : null,
  ];
  return candidates.find(isRecord) ?? null;
}

function readRunTaskId(run: AgentRunUiState): string | null {
  return (
    readString(run.taskId) ??
    (isRecord(run.task) ? readString(run.task.taskId) : null) ??
    (isRecord(run.snapshot) ? readString(run.snapshot.taskId) : null)
  );
}

function formatTokenUsage(process: Record<string, unknown> | null): string | null {
  const usage = isRecord(process?.usage) ? process.usage : null;
  const total = readNumber(usage?.totalTokens);
  if (total !== null) {
    return total.toLocaleString();
  }
  const input = readNumber(usage?.inputTokens);
  const output = readNumber(usage?.outputTokens);
  if (input !== null || output !== null) {
    return `${input ?? 0}/${output ?? 0}`;
  }
  return null;
}

function formatCost(process: Record<string, unknown> | null): string | null {
  const cost = isRecord(process?.cost) ? process.cost : null;
  const amount = readNumber(cost?.estimatedTotalCost);
  const costClass = readString(cost?.estimatedCostClass);
  if (amount !== null) {
    const currency = readString(cost?.currency) ?? "USD";
    return `${currency} ${amount.toFixed(4)}`;
  }
  return costClass;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

function readEventRecords(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) {
    return [];
  }
  return [
    ...(Array.isArray(value.events) ? value.events : []),
    ...(Array.isArray(value.taskEvents) ? value.taskEvents : []),
  ].filter(isRecord);
}

function collectRunEvents(run: AgentRunUiState): Record<string, unknown>[] {
  return [
    ...(Array.isArray(run.events) ? run.events : []),
    ...readEventRecords(run.runtimeFacts),
    ...readEventRecords(run.task),
    ...readEventRecords(run.snapshot),
  ].filter(isRecord);
}

function readEventType(event: Record<string, unknown>): string {
  return (
    readString(event.eventType) ??
    readString(event.type) ??
    readString(event.kind) ??
    ""
  );
}

function readEventRefs(event: Record<string, unknown>): string[] {
  const payload = isRecord(event.payload) ? event.payload : {};
  return [
    ...readStringArray(event.refs),
    ...readStringArray(payload.refs),
    readString(event.artifactRef),
    readString(event.evidenceRef),
    readString(event.evidenceId),
    readString(payload.artifactRef),
    readString(payload.evidenceRef),
    readString(payload.evidenceId),
  ].filter((item): item is string => Boolean(item));
}

function readEventMessage(event: Record<string, unknown>, fallback: string): string {
  const payload = isRecord(event.payload) ? event.payload : {};
  const artifact = isRecord(payload.artifact) ? payload.artifact : {};
  return (
    readString(event.message) ??
    readString(event.title) ??
    readString(payload.message) ??
    readString(payload.title) ??
    readString(artifact.title) ??
    readString(event.status) ??
    fallback
  );
}

function readTimelineKind(record: Record<string, unknown>): string {
  return readString(record.kind) ?? "progress";
}

function resolveTimelineKindClassName(kind: string): string {
  switch (kind) {
    case "thinking":
      return "bg-sky-500";
    case "output":
      return "bg-emerald-500";
    case "execution":
    case "tool":
    case "skill":
      return "bg-indigo-500";
    case "routing":
    case "metrics":
      return "bg-amber-500";
    case "artifact":
    case "completed":
      return "bg-emerald-500";
    case "blocked":
    case "warning":
      return "bg-rose-500";
    default:
      return "bg-slate-300";
  }
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
    extractToolNameFromTimelineTitle(readString(record.title) ?? fallbackTitle ?? "")
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

function resolveTimelineToolSummary(toolCall: AgentToolCallState | null): string | null {
  if (!toolCall) {
    return null;
  }
  return resolveToolProcessNarrative(toolCall).summary;
}

function buildTimelineGroups(
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
      kind === "tool" || kind === "skill" ? buildToolCallFromTimeline(record) : null;
    const toolSummary = resolveTimelineToolSummary(toolCall);
    const message = toolSummary ?? rawMessage;
    const detail = [
      toolSummary && rawMessage && toolSummary !== rawMessage ? rawMessage : null,
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

function readFactRecordArray(value: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return [];
  }
  return value[key].filter(isRecord);
}

function toFactItem(
  record: Record<string, unknown>,
  fallback: string,
): AgentRunFactItem {
  const refs = readEventRefs(record);
  return {
    title: readEventMessage(record, fallback),
    meta:
      readString(record.requestId) ??
      readString(record.status) ??
      refs[0] ??
      readString(record.id) ??
      null,
  };
}

function collectRuntimeFactItems(
  run: AgentRunUiState,
  key: string,
  fallback: string,
): AgentRunFactItem[] {
  return readFactRecordArray(run.runtimeFacts, key).map((record) =>
    toFactItem(record, fallback),
  );
}

function mergeFactItems(items: AgentRunFactItem[]): AgentRunFactItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title}|${item.meta ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildRunFactSections(run: AgentRunUiState, t: AgentRunTranslator) {
  const events = collectRunEvents(run);
  const toItems = (
    predicate: (event: Record<string, unknown>, eventType: string) => boolean,
    fallback: string,
  ) =>
    events
      .filter((event) => predicate(event, readEventType(event)))
      .map((event) => toFactItem(event, fallback));
  const confirmationFallback = t(
    "agentApp.apps.runtime.agentRun.facts.confirmations.itemFallback",
  );
  const artifactFallback = t(
    "agentApp.apps.runtime.agentRun.facts.artifacts.itemFallback",
  );
  const evidenceFallback = t(
    "agentApp.apps.runtime.agentRun.facts.evidence.itemFallback",
  );

  return [
    {
      key: "confirmations",
      title: t("agentApp.apps.runtime.agentRun.facts.confirmations"),
      empty: t("agentApp.apps.runtime.agentRun.facts.confirmations.empty"),
      items: mergeFactItems([
        ...toItems(
          (event, type) =>
            type === "task:missingContextRequested" ||
            type === "task:reviewRequested" ||
            type === "task:blocked" ||
            Boolean(readString(event.requestId)),
          confirmationFallback,
        ),
        ...collectRuntimeFactItems(run, "confirmations", confirmationFallback),
      ]),
    },
    {
      key: "artifacts",
      title: t("agentApp.apps.runtime.agentRun.facts.artifacts"),
      empty: t("agentApp.apps.runtime.agentRun.facts.artifacts.empty"),
      items: mergeFactItems([
        ...toItems(
          (_event, type) => type === "artifact:created" || type === "artifact",
          artifactFallback,
        ),
        ...collectRuntimeFactItems(run, "artifacts", artifactFallback),
      ]),
    },
    {
      key: "evidence",
      title: t("agentApp.apps.runtime.agentRun.facts.evidence"),
      empty: t("agentApp.apps.runtime.agentRun.facts.evidence.empty"),
      items: mergeFactItems([
        ...toItems(
          (_event, type) => type.startsWith("evidence:"),
          evidenceFallback,
        ),
        ...collectRuntimeFactItems(run, "evidence", evidenceFallback),
      ]),
    },
  ];
}

function AgentRunFactRail({
  run,
  t,
}: {
  run: AgentRunUiState;
  t: AgentRunTranslator;
}) {
  const sections = buildRunFactSections(run, t);
  return (
    <div className="grid gap-2">
      {sections.map((section) => (
        <section
          key={section.key}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-2"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-slate-700">
              {section.title}
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {section.items.length}
            </span>
          </div>
          {section.items.length ? (
            <div className="mt-2 space-y-1.5">
              {section.items.slice(0, 3).map((item, index) => (
                <div
                  key={`${section.key}-${item.title}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-2.5 py-2"
                >
                  <span className="min-w-0 text-xs leading-5 text-slate-700">
                    {item.title}
                  </span>
                  {item.meta ? (
                    <span className="max-w-28 shrink-0 truncate text-[11px] leading-5 text-slate-500">
                      {item.meta}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {section.empty}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function AgentRunMetricCards({
  process,
  t,
}: {
  process: Record<string, unknown> | null;
  t: AgentRunTranslator;
}) {
  const model = isRecord(process?.model) ? process.model : null;
  const skillNames = [
    ...readStringArray(process?.skillNames),
    ...readStringArray(process?.invokedSkillNames),
  ];
  const modelFromParts = [readString(model?.provider), readString(model?.model)]
    .filter(Boolean)
    .join(" / ");
  const cards = [
    {
      label: t("agentApp.apps.runtime.agentRun.metric.model"),
      value:
        readString(model?.label) ??
        (modelFromParts || null) ??
        t("agentApp.apps.runtime.agentRun.emptyValue"),
    },
    {
      label: t("agentApp.apps.runtime.agentRun.metric.tokens"),
      value: formatTokenUsage(process) ?? t("agentApp.apps.runtime.agentRun.emptyValue"),
    },
    {
      label: t("agentApp.apps.runtime.agentRun.metric.cost"),
      value: formatCost(process) ?? t("agentApp.apps.runtime.agentRun.emptyValue"),
    },
    {
      label: t("agentApp.apps.runtime.agentRun.metric.skills"),
      value: skillNames.length
        ? Array.from(new Set(skillNames)).slice(0, 3).join(", ")
        : t("agentApp.apps.runtime.agentRun.emptyValue"),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <p className="text-[11px] font-medium text-slate-500">{card.label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function AgentRunTimeline({
  process,
  t,
}: {
  process: Record<string, unknown> | null;
  t: AgentRunTranslator;
}) {
  const timeline = Array.isArray(process?.timeline) ? process.timeline : [];
  const terminal = process?.terminal === true;
  const groups = buildTimelineGroups(
    timeline,
    t("agentApp.apps.runtime.agentRun.timeline.event"),
  );
  return (
    <details
      className="rounded-2xl border border-slate-200 bg-white"
      open={!terminal}
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">
        {terminal
          ? t("agentApp.apps.runtime.agentRun.timeline.collapsed")
          : t("agentApp.apps.runtime.agentRun.timeline.running")}
      </summary>
      <div className="max-h-72 space-y-2 overflow-auto border-t border-slate-100 p-3">
        {groups.length ? (
          groups.map((group) => {
            const kindClassName = resolveTimelineKindClassName(group.kind);
            const meta =
              group.count > 1
                ? [group.meta, `×${group.count}`].filter(Boolean).join(" ")
                : group.meta;
            return (
              <article
                key={group.key}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2"
                data-agent-run-timeline-kind={group.kind}
                data-agent-run-timeline-group={group.key}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kindClassName}`}
                      aria-hidden
                    />
                    <p className="min-w-0 text-sm font-semibold text-slate-900">
                      {group.title}
                    </p>
                  </div>
                  {meta ? (
                    <span className="min-w-[3.5rem] shrink-0 text-right text-[11px] text-slate-500">
                      {meta}
                    </span>
                  ) : null}
                </div>
                {group.toolCall ? (
                  <div className="mt-2 rounded-xl bg-white px-2 py-1">
                    <InlineToolProcessStep
                      toolCall={group.toolCall}
                      isMessageStreaming={!terminal}
                    />
                  </div>
                ) : group.message ? (
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {group.message}
                  </p>
                ) : null}
                {group.detail ? (
                  <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-2 text-[11px] leading-5 text-slate-500">
                    {group.detail}
                  </pre>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="text-sm text-slate-500">
            {t("agentApp.apps.runtime.agentRun.timeline.empty")}
          </p>
        )}
      </div>
    </details>
  );
}

function AgentRunTextBlock({
  title,
  text,
  renderMarkdown = false,
  markdownTestId = "agent-run-markdown-output",
}: {
  title: string;
  text: unknown;
  renderMarkdown?: boolean;
  markdownTestId?: string;
}) {
  const content = readString(text);
  if (!content) {
    return null;
  }
  return (
    <details className="rounded-2xl border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">
        {title}
      </summary>
      {renderMarkdown ? (
        <div
          className="max-h-56 overflow-auto border-t border-slate-100 p-3 text-sm leading-6 text-slate-700"
          data-testid={markdownTestId}
        >
          <MarkdownRenderer content={content} />
        </div>
      ) : (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-slate-100 p-3 text-xs leading-5 text-slate-600">
          {content}
        </pre>
      )}
    </details>
  );
}

function AgentRunThinkingBlock({
  text,
  terminal,
}: {
  text: unknown;
  terminal: boolean;
}) {
  const content = readString(text);
  if (!content) {
    return null;
  }
  return (
    <ThinkingBlock
      content={content}
      defaultExpanded={!terminal}
      isStreaming={!terminal}
    />
  );
}

function buildProjectionPanelLabels(
  t: AgentRunTranslator,
): AgentRunProjectionPanelLabels {
  const runtimeEvent = t("agentApp.apps.runtime.agentRun.timeline.event");
  return {
    parts: {
      status: runtimeEvent,
      queue: runtimeEvent,
      answer: t("agentApp.apps.runtime.agentRun.output"),
      reasoning: t("agentApp.apps.runtime.agentRun.thinking"),
      tool: runtimeEvent,
      actionRequired: t(
        "agentApp.apps.runtime.agentRun.facts.confirmations.itemFallback",
      ),
      actionResolved: t("agentApp.apps.runtime.agentRun.facts.confirmations"),
      artifact: t(
        "agentApp.apps.runtime.agentRun.facts.artifacts.itemFallback",
      ),
      evidence: t("agentApp.apps.runtime.agentRun.facts.evidence.itemFallback"),
      diagnostic: runtimeEvent,
    },
    summary: {
      status: runtimeEvent,
      pendingActions: t("agentApp.apps.runtime.agentRun.facts.confirmations"),
      tools: t("agentApp.apps.runtime.agentRun.metric.skills"),
      artifacts: t("agentApp.apps.runtime.agentRun.facts.artifacts"),
      evidence: t("agentApp.apps.runtime.agentRun.facts.evidence"),
      queue: t("agentApp.apps.runtime.agentRun.timeline.running"),
    },
    actionControls: {
      approve: t("agentApp.apps.runtime.agentRun.action.approve"),
      reject: t("agentApp.apps.runtime.agentRun.action.reject"),
      answer: t("agentApp.apps.runtime.agentRun.action.answer"),
      edit: t("agentApp.apps.runtime.agentRun.action.edit"),
      retry: t("agentApp.apps.runtime.agentRun.action.retry"),
      interrupt: t("agentApp.apps.runtime.agentRun.action.interrupt"),
      stop: t("agentApp.apps.runtime.agentRun.action.stop"),
    },
    empty: t("agentApp.apps.runtime.agentRun.timeline.empty"),
  };
}

function hasProjectionContent(
  view: ReturnType<typeof buildAgentRunProjectionViewModelFromState>,
): boolean {
  return (
    view.orderedParts.length > 0 ||
    view.actions.length > 0 ||
    view.artifacts.length > 0 ||
    view.evidence.length > 0 ||
    view.diagnostics.length > 0
  );
}

export interface AgentRunRendererProps {
  run: AgentRunUiState;
  process: Record<string, unknown> | null;
  taskId: string | null;
  t: AgentRunTranslator;
  className?: string;
  onAction?: AgentRunProjectionPanelProps["onAction"];
}

export function AgentRunRenderer({
  run,
  process,
  taskId,
  t,
  className = "min-h-0 flex-1 overscroll-contain [scrollbar-gutter:stable] space-y-3 overflow-auto p-4",
  onAction,
}: AgentRunRendererProps) {
  const projectionView = buildAgentRunProjectionViewModelFromState(run);
  const shouldRenderProjection = hasProjectionContent(projectionView);

  return (
    <div
      className={className}
      data-testid="agent-run-process-panel"
      data-agent-run-renderer="host-shared"
    >
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-500">
        <div className="flex justify-between gap-3">
          <span>{t("agentApp.apps.runtime.agentRun.taskId")}</span>
          <strong className="truncate text-slate-700">
            {taskId ?? t("agentApp.apps.runtime.agentRun.emptyValue")}
          </strong>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <span>{t("agentApp.apps.runtime.agentRun.bridgeAction")}</span>
          <strong className="truncate text-slate-700">
            {run.bridgeAction ?? t("agentApp.apps.runtime.agentRun.emptyValue")}
          </strong>
        </div>
      </div>
      <AgentRunMetricCards process={process} t={t} />
      {shouldRenderProjection ? (
        <AgentRunProjectionPanel
          view={projectionView}
          labels={buildProjectionPanelLabels(t)}
          onAction={onAction}
        />
      ) : (
        <AgentRunFactRail run={run} t={t} />
      )}
      <AgentRunTimeline process={process} t={t} />
      <AgentRunThinkingBlock
        text={process?.thinkingText}
        terminal={process?.terminal === true}
      />
      <AgentRunTextBlock
        title={t("agentApp.apps.runtime.agentRun.execution")}
        text={process?.executionText}
        renderMarkdown
        markdownTestId="agent-run-markdown-execution"
      />
      <AgentRunTextBlock
        title={t("agentApp.apps.runtime.agentRun.output")}
        text={process?.streamText}
        renderMarkdown
      />
    </div>
  );
}

export function AgentRunProcessPanel(props: AgentRunRendererProps) {
  return <AgentRunRenderer {...props} />;
}

export function AgentRunHostDrawer({
  run,
  displayName,
  expanded,
  onExpand,
  onCollapse,
  onClose,
  onAction,
  t,
}: {
  run: AgentRunUiState;
  displayName: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onAction?: AgentRunProjectionPanelProps["onAction"];
  t: AgentRunTranslator;
}) {
  const process = readRuntimeProcess(run);
  const taskId = readRunTaskId(run);
  const terminal = process?.terminal === true;
  const title = run.title ?? t("agentApp.apps.runtime.agentRun.titleFallback");

  if (!expanded) {
    return (
      <button
        type="button"
        className="absolute right-3 top-3 z-20 inline-flex max-w-[180px] items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-left shadow-lg shadow-slate-950/10 transition hover:border-emerald-300 hover:shadow-xl hover:shadow-slate-950/15"
        data-testid="agent-app-host-agent-run-dock"
        onClick={onExpand}
        aria-label={t("agentApp.apps.runtime.agentRun.expand")}
        title={`${t("agentApp.apps.runtime.agentRun.expand")} · ${title}`}
      >
        <span className="rounded-full bg-emerald-50 p-1.5 text-emerald-700">
          <Bot size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="sr-only">
            {t("agentApp.apps.runtime.agentRun.badge", { app: displayName })} · {title} ·{" "}
            {terminal
              ? t("agentApp.apps.runtime.agentRun.timeline.collapsed")
              : t("agentApp.apps.runtime.agentRun.expand")}
          </span>
          <span className="block truncate text-xs font-semibold text-emerald-700">
            {t("agentApp.apps.runtime.agentRun.expand")}
          </span>
        </span>
      </button>
    );
  }

  return (
    <aside
      className="absolute bottom-4 right-4 top-4 z-20 flex w-[min(420px,calc(100%-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15"
      data-testid="agent-app-host-agent-run-drawer"
      aria-label={t("agentApp.apps.runtime.agentRun.aria")}
    >
      <header className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <Bot size={14} />
              {t("agentApp.apps.runtime.agentRun.badge", { app: displayName })}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-slate-950">
              {title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("agentApp.apps.runtime.agentRun.subtitle")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              onClick={onCollapse}
              aria-label={t("agentApp.apps.runtime.agentRun.collapse")}
            >
              <PanelRightClose size={16} />
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
              data-testid="agent-app-host-agent-run-close"
              aria-label={t("agentApp.apps.runtime.agentRun.close")}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </header>
      <AgentRunRenderer
        run={run}
        process={process}
        taskId={taskId}
        t={t}
        onAction={onAction}
      />
    </aside>
  );
}
