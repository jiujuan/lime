import type {
  PluginHostAgentRunUiRequest,
} from "../runtime/hostBridge";
import type {
  PluginRunProjectionActionControl,
} from "../runtime/agentUiProjectionViewModel";
import type { PluginTaskHostResponseActionType } from "../types";
import type { AgentRunUiState } from "./AgentRunHostDrawer";

const NEGATIVE_AGENT_RUN_ACTION_CONTROLS =
  new Set<PluginRunProjectionActionControl>(["reject", "interrupt", "stop"]);
const AGENT_RUN_UI_STORAGE_PREFIX = "lime.plugin.hostAgentRunUi.v1";

export interface AgentRunDismissalKey {
  taskId: string | null;
  bridgeAction: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readAgentRunTaskId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  return (
    readString(value.taskId) ??
    (isRecord(value.task) ? readString(value.task.taskId) : null) ??
    (isRecord(value.snapshot) ? readString(value.snapshot.taskId) : null)
  );
}

export function normalizeAgentRunActionType(
  value: string | undefined,
): PluginTaskHostResponseActionType {
  if (
    value === "tool_confirmation" ||
    value === "ask_user" ||
    value === "elicitation"
  ) {
    return value;
  }
  return "ask_user";
}

export function buildAgentRunActionResponse(
  control: PluginRunProjectionActionControl,
) {
  return {
    confirmed: !NEGATIVE_AGENT_RUN_ACTION_CONTROLS.has(control),
    response: control,
  };
}

export function buildAgentRunUiStorageKey(
  appId: string | undefined,
  entryKey: string | undefined,
): string | null {
  if (!appId || !entryKey) {
    return null;
  }
  return `${AGENT_RUN_UI_STORAGE_PREFIX}:${appId}:${entryKey}`;
}

export function readStoredAgentRunUi(
  storageKey: string | null,
): AgentRunUiState | null {
  if (!storageKey || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    return {
      ...parsed,
      mode:
        parsed.mode === "modal" || parsed.mode === "page"
          ? parsed.mode
          : "drawer",
    } as AgentRunUiState;
  } catch {
    return null;
  }
}

export function persistAgentRunUi(
  storageKey: string | null,
  run: AgentRunUiState | null,
) {
  if (!storageKey || typeof window === "undefined") {
    return;
  }
  try {
    if (!run) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(run));
  } catch {
    // sessionStorage can be unavailable in hardened WebViews; UI state remains in memory.
  }
}

function readAgentRunItemKey(item: unknown, index: number): string {
  if (!isRecord(item)) {
    return `${index}:${String(item).slice(0, 80)}`;
  }
  return [
    readString(item.eventId) ?? readString(item.id),
    readString(item.eventType) ??
      readString(item.type) ??
      readString(item.kind),
    readString(item.status) ?? readString(item.statusText),
    readString(item.message) ?? readString(item.title),
    readString(item.occurredAt) ??
      readString(item.at) ??
      readString(item.createdAt),
  ]
    .filter(Boolean)
    .join("|");
}

function mergeAgentRunItems(
  previous: unknown,
  next: unknown,
  limit = 40,
): unknown[] | undefined {
  const previousItems = Array.isArray(previous) ? previous : [];
  const nextItems = Array.isArray(next) ? next : [];
  if (!previousItems.length && !nextItems.length) {
    return undefined;
  }
  const merged: unknown[] = [];
  const indexByKey = new Map<string, number>();
  [...previousItems, ...nextItems].forEach((item, index) => {
    const key = readAgentRunItemKey(item, index);
    const stableKey = key || `${index}`;
    const existingIndex = indexByKey.get(stableKey);
    if (existingIndex === undefined) {
      indexByKey.set(stableKey, merged.length);
      merged.push(item);
      return;
    }
    merged[existingIndex] = item;
  });
  return merged.slice(-limit);
}

function mergeStringArray(
  previous: unknown,
  next: unknown,
): unknown[] | undefined {
  const merged = mergeAgentRunItems(previous, next);
  return merged?.length ? merged : undefined;
}

function mergeAgentRunProcess(previous: unknown, next: unknown): unknown {
  if (!isRecord(previous)) {
    return next ?? previous;
  }
  if (!isRecord(next)) {
    return previous;
  }
  const merged: Record<string, unknown> = {
    ...previous,
    ...next,
  };
  const timeline = mergeAgentRunItems(previous.timeline, next.timeline, 60);
  if (timeline) {
    merged.timeline = timeline;
  }
  const skillNames = mergeStringArray(previous.skillNames, next.skillNames);
  if (skillNames) {
    merged.skillNames = skillNames;
  }
  const invokedSkillNames = mergeStringArray(
    previous.invokedSkillNames,
    next.invokedSkillNames,
  );
  if (invokedSkillNames) {
    merged.invokedSkillNames = invokedSkillNames;
  }
  for (const key of ["streamText", "thinkingText", "executionText"]) {
    if (!readString(merged[key]) && readString(previous[key])) {
      merged[key] = previous[key];
    }
  }
  return merged;
}

function mergeAgentRunPayload(previous: unknown, next: unknown): unknown {
  if (next === null || next === undefined) {
    return previous;
  }
  if (!isRecord(previous) || !isRecord(next)) {
    return next;
  }
  return {
    ...previous,
    ...next,
    events: mergeAgentRunItems(previous.events, next.events, 80),
    taskEvents: mergeAgentRunItems(previous.taskEvents, next.taskEvents, 80),
    runtimeProcess: mergeAgentRunProcess(
      previous.runtimeProcess,
      next.runtimeProcess,
    ),
    process: mergeAgentRunProcess(previous.process, next.process),
  };
}

function shouldMergeAgentRunUi(
  previous: AgentRunUiState | null,
  request: PluginHostAgentRunUiRequest,
): previous is AgentRunUiState {
  if (!previous) {
    return false;
  }
  const previousTaskId = readAgentRunTaskId(previous);
  const nextTaskId = readAgentRunTaskId(request);
  if (previousTaskId && nextTaskId && previousTaskId !== nextTaskId) {
    return false;
  }
  if (
    previous.bridgeAction &&
    request.bridgeAction &&
    previous.bridgeAction !== request.bridgeAction
  ) {
    return false;
  }
  return true;
}

export function buildAgentRunDismissalKey(
  value: unknown,
): AgentRunDismissalKey {
  return {
    taskId: readAgentRunTaskId(value),
    bridgeAction: isRecord(value) ? readString(value.bridgeAction) : null,
  };
}

function hasAgentRunDismissalKey(key: AgentRunDismissalKey): boolean {
  return Boolean(key.taskId || key.bridgeAction);
}

export function mergeAgentRunDismissalKey(
  requestKey: AgentRunDismissalKey,
  previousKey: AgentRunDismissalKey,
): AgentRunDismissalKey {
  return {
    taskId: requestKey.taskId ?? previousKey.taskId,
    bridgeAction: requestKey.bridgeAction ?? previousKey.bridgeAction,
  };
}

export function matchesDismissedAgentRun(
  dismissed: AgentRunDismissalKey | null,
  request: PluginHostAgentRunUiRequest,
): boolean {
  if (!dismissed) {
    return false;
  }
  const next = buildAgentRunDismissalKey(request);
  let compared = false;
  if (dismissed.taskId && next.taskId) {
    compared = true;
    if (dismissed.taskId === next.taskId) {
      return true;
    }
  }
  if (dismissed.bridgeAction && next.bridgeAction) {
    compared = true;
    if (dismissed.bridgeAction === next.bridgeAction) {
      return true;
    }
  }
  return (
    !compared &&
    !hasAgentRunDismissalKey(dismissed) &&
    !hasAgentRunDismissalKey(next)
  );
}

export function shouldCloseAgentRunUi(
  previous: AgentRunUiState,
  request: Pick<PluginHostAgentRunUiRequest, "taskId" | "bridgeAction">,
): boolean {
  const previousKey = buildAgentRunDismissalKey(previous);
  const requestKey = buildAgentRunDismissalKey(request);
  const sameTask =
    !requestKey.taskId ||
    !previousKey.taskId ||
    previousKey.taskId === requestKey.taskId;
  const sameBridgeAction =
    !requestKey.bridgeAction ||
    !previousKey.bridgeAction ||
    previousKey.bridgeAction === requestKey.bridgeAction;
  return sameTask && sameBridgeAction;
}

export function mergeAgentRunUiState(
  previous: AgentRunUiState | null,
  request: PluginHostAgentRunUiRequest,
  now: string,
  fallbackMode: AgentRunUiState["mode"],
): AgentRunUiState {
  const base = shouldMergeAgentRunUi(previous, request) ? previous : null;
  return {
    ...base,
    ...request,
    taskId: request.taskId ?? base?.taskId,
    bridgeAction: request.bridgeAction ?? base?.bridgeAction,
    title: request.title ?? base?.title,
    mode: request.mode ?? base?.mode ?? fallbackMode,
    expectedOutput: request.expectedOutput ?? base?.expectedOutput,
    runtimeFacts: request.runtimeFacts ?? base?.runtimeFacts,
    task: mergeAgentRunPayload(base?.task, request.task),
    snapshot: mergeAgentRunPayload(base?.snapshot, request.snapshot),
    runtimeProcess: mergeAgentRunProcess(
      base?.runtimeProcess,
      request.runtimeProcess,
    ),
    events: mergeAgentRunItems(base?.events, request.events, 100),
    openedAt: base?.openedAt ?? now,
    updatedAt: now,
  };
}
