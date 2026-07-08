import { InlineToolProcessStep } from "@/components/agent/chat/components/InlineToolProcessStep";
import { MarkdownRenderer } from "@/components/agent/chat/components/MarkdownRenderer";
import { ThinkingBlock } from "@/components/agent/chat/components/ThinkingBlock";
import type { AgentRunTranslator, AgentRunUiState } from "./AgentRunHostDrawer";
import {
  buildTimelineGroups,
  isRecord,
  readString,
  readStringArray,
} from "./AgentRunHostDrawerProjectionInput";

interface AgentRunFactItem {
  title: string;
  meta: string | null;
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

function readEventMessage(
  event: Record<string, unknown>,
  fallback: string,
): string {
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

function readFactRecordArray(
  value: unknown,
  key: string,
): Record<string, unknown>[] {
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
    "plugin.apps.runtime.agentRun.facts.confirmations.itemFallback",
  );
  const artifactFallback = t(
    "plugin.apps.runtime.agentRun.facts.artifacts.itemFallback",
  );
  const evidenceFallback = t(
    "plugin.apps.runtime.agentRun.facts.evidence.itemFallback",
  );

  return [
    {
      key: "confirmations",
      title: t("plugin.apps.runtime.agentRun.facts.confirmations"),
      empty: t("plugin.apps.runtime.agentRun.facts.confirmations.empty"),
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
      title: t("plugin.apps.runtime.agentRun.facts.artifacts"),
      empty: t("plugin.apps.runtime.agentRun.facts.artifacts.empty"),
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
      title: t("plugin.apps.runtime.agentRun.facts.evidence"),
      empty: t("plugin.apps.runtime.agentRun.facts.evidence.empty"),
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

export function AgentRunFactRail({
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
    t("plugin.apps.runtime.agentRun.timeline.event"),
  );
  return (
    <details
      className="rounded-2xl border border-slate-200 bg-white"
      open={!terminal}
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">
        {terminal
          ? t("plugin.apps.runtime.agentRun.timeline.collapsed")
          : t("plugin.apps.runtime.agentRun.timeline.running")}
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
                data-soul-surface={group.soulSurface ?? undefined}
                data-soul-phase={group.soulPhase ?? undefined}
                data-soul-style-level={group.styleLevel ?? undefined}
                data-soul-risk-level={group.riskLevel ?? undefined}
                data-soul-tone-variant={group.toneVariant ?? undefined}
                data-soul-profile-id={group.profileId ?? undefined}
                data-soul-pack-id={group.packId ?? undefined}
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
            {t("plugin.apps.runtime.agentRun.timeline.empty")}
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

export function AgentRunLocalProcessFallback({
  process,
  t,
}: {
  process: Record<string, unknown> | null;
  t: AgentRunTranslator;
}) {
  return (
    <>
      <AgentRunTimeline process={process} t={t} />
      <AgentRunThinkingBlock
        text={process?.thinkingText}
        terminal={process?.terminal === true}
      />
      <AgentRunTextBlock
        title={t("plugin.apps.runtime.agentRun.execution")}
        text={process?.executionText}
        renderMarkdown
        markdownTestId="agent-run-markdown-execution"
      />
      <AgentRunTextBlock
        title={t("plugin.apps.runtime.agentRun.output")}
        text={process?.streamText}
        renderMarkdown
      />
    </>
  );
}
