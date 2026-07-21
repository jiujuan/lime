import type { ChatToolPreferences } from "../../../utils/chatToolPreferences";
import { bindThreadGoalMetadataToSession } from "../../../utils/harnessRequestMetadata";

interface InputbarModeState {
  goalEnabled?: boolean;
  objectiveText?: string | null;
  planEnabled?: boolean;
  source?: string;
  subagentEnabled?: boolean;
  threadId?: string | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readStringField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
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
  objectiveText?: string | null,
): Record<string, unknown> {
  const existingSet = isPlainRecord(existing?.set)
    ? (existing.set as Record<string, unknown>)
    : {};
  const normalizedThreadId = threadId?.trim();
  const normalizedObjectiveText = objectiveText?.trim();

  return {
    ...(existing || {}),
    enabled: true,
    source,
    status: "active",
    set: {
      ...existingSet,
      ...(normalizedThreadId ? { threadId: normalizedThreadId } : {}),
      objective:
        normalizedObjectiveText ||
        (Object.prototype.hasOwnProperty.call(existingSet, "objective")
          ? existingSet.objective
          : null),
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
  const goalEnabled = Boolean(state.goalEnabled);
  if (!goalEnabled) {
    return base;
  }

  const source = state.source?.trim() || "inputbar";
  const threadId = state.threadId?.trim() || null;
  const { root, harness, preferences } = mergeHarness(base);

  if (goalEnabled) {
    const objectiveText = state.objectiveText?.trim();
    preferences.objective = true;
    preferences.goal = true;
    harness.goal_mode_enabled = true;
    harness.thread_goal = buildThreadGoalMetadata(
      isPlainRecord(harness.thread_goal)
        ? (harness.thread_goal as Record<string, unknown>)
        : undefined,
      source,
      threadId,
      objectiveText,
    );
    harness.goal = buildThreadGoalMetadata(
      isPlainRecord(harness.goal)
        ? (harness.goal as Record<string, unknown>)
        : undefined,
      source,
      threadId,
      objectiveText,
    );
    if (objectiveText) {
      harness.managed_objective = {
        ...(isPlainRecord(harness.managed_objective)
          ? (harness.managed_objective as Record<string, unknown>)
          : {}),
        objective_text: objectiveText,
        source,
      };
    }
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

export function extractInputbarManagedObjectiveText(
  requestMetadata?: Record<string, unknown>,
): string | null {
  const harness = isPlainRecord(requestMetadata?.harness)
    ? requestMetadata.harness
    : undefined;
  const managedObjective = isPlainRecord(harness?.managed_objective)
    ? harness.managed_objective
    : isPlainRecord(requestMetadata?.managed_objective)
      ? requestMetadata.managed_objective
      : undefined;

  return readStringField(managedObjective, [
    "objective_text",
    "objectiveText",
    "objective",
  ]);
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
