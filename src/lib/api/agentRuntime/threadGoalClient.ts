import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_THREAD_GOAL_CLEAR,
  METHOD_THREAD_GOAL_GET,
  METHOD_THREAD_GOAL_SET,
  type ThreadGoal,
  type ThreadGoalClearResponse,
  type ThreadGoalGetResponse,
  type ThreadGoalSetParams,
  type ThreadGoalSetResponse,
  type ThreadGoalStatus,
} from "@limecloud/app-server-client";

export type ThreadGoalAppServerClient = Pick<AppServerClient, "request">;

const THREAD_GOAL_STATUSES = new Set<ThreadGoal["status"]>([
  "active",
  "blocked",
  "budgetLimited",
  "complete",
  "paused",
  "usageLimited",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseThreadGoal(value: unknown): ThreadGoal | null {
  if (!isRecord(value)) {
    return null;
  }
  const threadId =
    typeof value.threadId === "string" ? value.threadId.trim() : "";
  const objective =
    typeof value.objective === "string" ? value.objective.trim() : "";
  const status = value.status;
  const tokenBudget = value.tokenBudget;
  if (
    !threadId ||
    !objective ||
    typeof status !== "string" ||
    !THREAD_GOAL_STATUSES.has(status as ThreadGoal["status"]) ||
    !isNonNegativeNumber(value.createdAt) ||
    !isNonNegativeNumber(value.timeUsedSeconds) ||
    !isNonNegativeNumber(value.tokensUsed) ||
    !isNonNegativeNumber(value.updatedAt) ||
    (tokenBudget !== undefined &&
      tokenBudget !== null &&
      !isNonNegativeNumber(tokenBudget))
  ) {
    return null;
  }
  return value as unknown as ThreadGoal;
}

export function createThreadGoalClient({
  appServerClient = new AppServerClient(),
}: {
  appServerClient?: ThreadGoalAppServerClient;
} = {}) {
  async function getThreadGoal(threadId: string): Promise<ThreadGoal | null> {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      throw new Error("threadId is required to read ThreadGoal");
    }
    const response = await appServerClient.request<ThreadGoalGetResponse>(
      METHOD_THREAD_GOAL_GET,
      { threadId: normalizedThreadId },
    );
    const goal = response.result.goal;
    if (goal === undefined || goal === null) {
      return null;
    }
    const parsed = parseThreadGoal(goal);
    if (!parsed || parsed.threadId !== normalizedThreadId) {
      throw new Error(
        "thread/goal/get did not return the requested canonical ThreadGoal",
      );
    }
    return parsed;
  }

  async function setThreadGoal(
    params: ThreadGoalSetParams,
  ): Promise<ThreadGoal> {
    const threadId = params.threadId.trim();
    const objective =
      typeof params.objective === "string"
        ? params.objective.trim()
        : undefined;
    const hasPatch =
      objective !== undefined ||
      params.status !== undefined ||
      params.tokenBudget !== undefined;
    if (!threadId || !hasPatch || objective === "") {
      throw new Error(
        "threadId and at least one valid ThreadGoal patch field are required",
      );
    }
    if (
      params.tokenBudget !== undefined &&
      params.tokenBudget !== null &&
      !isNonNegativeNumber(params.tokenBudget)
    ) {
      throw new Error("ThreadGoal tokenBudget must be null or non-negative");
    }
    const response = await appServerClient.request<ThreadGoalSetResponse>(
      METHOD_THREAD_GOAL_SET,
      {
        threadId,
        ...(objective !== undefined ? { objective } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
        ...(params.tokenBudget !== undefined
          ? { tokenBudget: params.tokenBudget }
          : {}),
      },
    );
    const goal = parseThreadGoal(response.result.goal);
    if (!goal || goal.threadId !== threadId) {
      throw new Error(
        "thread/goal/set did not return the requested canonical ThreadGoal",
      );
    }
    return goal;
  }

  async function setThreadGoalStatus(
    threadId: string,
    status: ThreadGoalStatus,
  ): Promise<ThreadGoal> {
    return setThreadGoal({ threadId, status });
  }

  async function clearThreadGoal(threadId: string): Promise<boolean> {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      throw new Error("threadId is required to clear ThreadGoal");
    }
    const response = await appServerClient.request<ThreadGoalClearResponse>(
      METHOD_THREAD_GOAL_CLEAR,
      { threadId: normalizedThreadId },
    );
    if (typeof response.result.cleared !== "boolean") {
      throw new Error(
        "thread/goal/clear did not return a canonical cleared result",
      );
    }
    return response.result.cleared;
  }

  return {
    clearThreadGoal,
    getThreadGoal,
    setThreadGoal,
    setThreadGoalStatus,
  };
}

export const {
  clearThreadGoal,
  getThreadGoal,
  setThreadGoal,
  setThreadGoalStatus,
} = createThreadGoalClient();
