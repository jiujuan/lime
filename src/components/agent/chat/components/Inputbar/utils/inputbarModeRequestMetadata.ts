import type { ChatToolPreferences } from "../../../utils/chatToolPreferences";
import { bindThreadGoalMetadataToSession } from "../../../utils/harnessRequestMetadata";

interface InputbarModeState {
  goalEnabled?: boolean;
  planEnabled?: boolean;
  source?: string;
  subagentEnabled?: boolean;
  threadId?: string | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeHarness(base: Record<string, unknown> | undefined): {
  root: Record<string, unknown>;
  harness: Record<string, unknown>;
  preferences: Record<string, unknown>;
} {
  const root = { ...(base || {}) };
  const harness = {
    ...(isPlainRecord(root.harness)
      ? (root.harness as Record<string, unknown>)
      : {}),
  };
  const preferences = {
    ...(isPlainRecord(harness.preferences)
      ? (harness.preferences as Record<string, unknown>)
      : {}),
  };

  return { root, harness, preferences };
}

function buildThreadGoalMetadata(
  existing: Record<string, unknown> | undefined,
  source: string,
  threadId?: string | null,
): Record<string, unknown> {
  const existingSet = isPlainRecord(existing?.set)
    ? (existing.set as Record<string, unknown>)
    : {};
  const normalizedThreadId = threadId?.trim();

  return {
    ...(existing || {}),
    enabled: true,
    source,
    status: "active",
    set: {
      ...existingSet,
      ...(normalizedThreadId ? { threadId: normalizedThreadId } : {}),
      objective: Object.prototype.hasOwnProperty.call(existingSet, "objective")
        ? existingSet.objective
        : null,
      status: "active",
      tokenBudget: Object.prototype.hasOwnProperty.call(
        existingSet,
        "tokenBudget",
      )
        ? existingSet.tokenBudget
        : null,
    },
  };
}

export function buildInputbarModeRequestMetadata(
  base: Record<string, unknown> | undefined,
  state: InputbarModeState,
): Record<string, unknown> | undefined {
  const planEnabled = Boolean(state.planEnabled);
  const goalEnabled = Boolean(state.goalEnabled);
  if (!planEnabled && !goalEnabled) {
    return base;
  }

  const source = state.source?.trim() || "inputbar";
  const threadId = state.threadId?.trim() || null;
  const { root, harness, preferences } = mergeHarness(base);

  if (planEnabled) {
    preferences.task = true;
    preferences.task_mode = true;
    harness.task_mode_enabled = true;
    harness.collaboration_mode = {
      ...(isPlainRecord(harness.collaboration_mode)
        ? (harness.collaboration_mode as Record<string, unknown>)
        : {}),
      mode: "plan",
      source,
    };
  }

  if (goalEnabled) {
    preferences.objective = true;
    preferences.goal = true;
    harness.goal_mode_enabled = true;
    harness.thread_goal = buildThreadGoalMetadata(
      isPlainRecord(harness.thread_goal)
        ? (harness.thread_goal as Record<string, unknown>)
        : undefined,
      source,
      threadId,
    );
    harness.goal = buildThreadGoalMetadata(
      isPlainRecord(harness.goal)
        ? (harness.goal as Record<string, unknown>)
        : undefined,
      source,
      threadId,
    );
  }

  root.harness = {
    ...harness,
    preferences,
  };

  return root;
}

export function bindInputbarThreadGoalMetadata(
  base: Record<string, unknown> | undefined,
  threadId?: string | null,
): Record<string, unknown> | undefined {
  return bindThreadGoalMetadataToSession(base, threadId);
}

export function buildInputbarToolPreferencesOverride(
  state: InputbarModeState,
): ChatToolPreferences | undefined {
  if (!state.planEnabled) {
    return undefined;
  }

  return {
    task: true,
    subagent: Boolean(state.subagentEnabled),
  };
}
