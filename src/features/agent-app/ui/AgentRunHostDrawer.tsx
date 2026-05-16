import { Bot, PanelRightClose, X } from "lucide-react";
import { resolveUserFacingToolDisplayLabel } from "@/components/agent/chat/utils/toolDisplayInfo";
import type {
  AgentAppHostAgentRunUiMode,
  AgentAppHostAgentRunUiRequest,
} from "../runtime/hostBridge";

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
  const match = title.match(/^(?:工具|Tool)\s*·\s*(.+)$/);
  return match?.[1]?.trim() || null;
}

function resolveTimelineTitle(
  record: Record<string, unknown>,
  fallback: string,
): string {
  const title = readString(record.title) ?? fallback;
  if (readTimelineKind(record) !== "tool") {
    return title;
  }
  const toolName =
    readString(record.toolName) ?? extractToolNameFromTimelineTitle(title);
  if (!toolName) {
    return title;
  }
  const displayName = resolveUserFacingToolDisplayLabel(toolName);
  return displayName && displayName !== toolName
    ? title.replace(toolName, displayName)
    : title;
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
        {timeline.length ? (
          timeline.map((item, index) => {
            const record: Record<string, unknown> = isRecord(item) ? item : {};
            const kind = readTimelineKind(record);
            const title =
              resolveTimelineTitle(
                record,
                t("agentApp.apps.runtime.agentRun.timeline.event"),
              );
            const message = readString(record.message);
            const meta = readString(record.meta) ?? readString(record.statusText);
            const detail = readString(record.detail);
            const kindClassName = resolveTimelineKindClassName(kind);
            return (
              <article
                key={`${title}-${index}`}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2"
                data-agent-run-timeline-kind={kind}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kindClassName}`}
                      aria-hidden
                    />
                    <p className="min-w-0 text-sm font-semibold text-slate-900">
                      {title}
                    </p>
                  </div>
                  {meta ? (
                    <span className="min-w-[3.5rem] shrink-0 text-right text-[11px] text-slate-500">
                      {meta}
                    </span>
                  ) : null}
                </div>
                {message ? (
                  <p className="mt-1 text-xs leading-5 text-slate-600">{message}</p>
                ) : null}
                {detail ? (
                  <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-2 text-[11px] leading-5 text-slate-500">
                    {detail}
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
}: {
  title: string;
  text: unknown;
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
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-slate-100 p-3 text-xs leading-5 text-slate-600">
        {content}
      </pre>
    </details>
  );
}

export function AgentRunProcessPanel({
  run,
  process,
  taskId,
  t,
  className = "flex-1 space-y-3 overflow-auto p-4",
}: {
  run: AgentRunUiState;
  process: Record<string, unknown> | null;
  taskId: string | null;
  t: AgentRunTranslator;
  className?: string;
}) {
  return (
    <div className={className} data-testid="agent-run-process-panel">
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
      <AgentRunFactRail run={run} t={t} />
      <AgentRunTimeline process={process} t={t} />
      <AgentRunTextBlock
        title={t("agentApp.apps.runtime.agentRun.thinking")}
        text={process?.thinkingText}
      />
      <AgentRunTextBlock
        title={t("agentApp.apps.runtime.agentRun.execution")}
        text={process?.executionText}
      />
      <AgentRunTextBlock
        title={t("agentApp.apps.runtime.agentRun.output")}
        text={process?.streamText}
      />
    </div>
  );
}

export function AgentRunHostDrawer({
  run,
  displayName,
  expanded,
  onExpand,
  onCollapse,
  onClose,
  t,
}: {
  run: AgentRunUiState;
  displayName: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
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
        className="absolute right-4 top-4 z-20 flex w-[min(360px,calc(100%-2rem))] items-start gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-left shadow-xl shadow-slate-950/10 transition hover:border-emerald-300 hover:shadow-2xl hover:shadow-slate-950/15"
        data-testid="agent-app-host-agent-run-dock"
        onClick={onExpand}
        aria-label={t("agentApp.apps.runtime.agentRun.expand")}
      >
        <span className="mt-0.5 rounded-full bg-emerald-50 p-2 text-emerald-700">
          <Bot size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-emerald-700">
            {t("agentApp.apps.runtime.agentRun.badge", { app: displayName })}
          </span>
          <strong className="mt-1 block truncate text-sm font-semibold text-slate-950">
            {title}
          </strong>
          <span className="mt-1 block truncate text-xs text-slate-500">
            {terminal
              ? t("agentApp.apps.runtime.agentRun.timeline.collapsed")
              : t("agentApp.apps.runtime.agentRun.expand")}
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
              onClick={onClose}
              aria-label={t("agentApp.apps.runtime.agentRun.close")}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </header>
      <AgentRunProcessPanel run={run} process={process} taskId={taskId} t={t} />
    </aside>
  );
}
