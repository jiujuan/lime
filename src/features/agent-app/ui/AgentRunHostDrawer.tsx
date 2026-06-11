import { Bot, PanelRightClose, X } from "lucide-react";
import {
  buildAgentRunProjectionViewModelFromState,
  buildAgentRunStandardProjectionStateFromState,
} from "../runtime/agentRunProjectionState";
import type {
  AgentAppHostAgentRunUiMode,
  AgentAppHostAgentRunUiRequest,
} from "../runtime/hostBridge";
import {
  AgentRunProjectionPanel,
  type AgentRunProjectionPanelLabels,
  type AgentRunProjectionPanelProps,
} from "./AgentRunProjectionPanel";
import { buildSharedProjectionInput } from "./AgentRunHostDrawerProjectionInput";

export type AgentRunTranslator = (
  key: string,
  params?: Record<string, unknown>,
) => string;

export interface AgentRunUiState extends AgentAppHostAgentRunUiRequest {
  mode: AgentAppHostAgentRunUiMode;
  openedAt: string;
  updatedAt: string;
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
  const sharedProjectionInput = buildSharedProjectionInput(run, t);
  const projectionView = buildAgentRunProjectionViewModelFromState(
    sharedProjectionInput,
  );
  const standardProjectionState =
    buildAgentRunStandardProjectionStateFromState(sharedProjectionInput);

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
      <AgentRunProjectionPanel
        view={projectionView}
        standardState={standardProjectionState}
        labels={buildProjectionPanelLabels(t)}
        onAction={onAction}
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
