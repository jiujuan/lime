import { useEffect, useState } from "react";
import type { ThreadGoal } from "@limecloud/app-server-client";
import type { AppServerJsonRpcNotification } from "@/lib/api/appServer";
import {
  subscribeAppServerNotifications,
  type AppServerEventBusSubscription,
} from "@/lib/api/appServerEventBus";
import {
  getThreadGoal,
  parseThreadGoal,
} from "@/lib/api/agentRuntime/threadGoalClient";

export type ScopedThreadGoalNotification =
  | { kind: "cleared" }
  | { kind: "updated"; goal: ThreadGoal };

type ThreadGoalReader = (threadId: string) => Promise<ThreadGoal | null>;
type ThreadGoalSubscriber = (
  subscription: AppServerEventBusSubscription,
) => () => void;

interface ThreadGoalState {
  error: unknown;
  goal: ThreadGoal | null;
  loading: boolean;
  threadId: string | null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readScopedThreadGoalNotification(
  notification: AppServerJsonRpcNotification,
  currentThreadId: string,
): ScopedThreadGoalNotification | null {
  const params = readRecord(notification.params);
  const notificationThreadId =
    typeof params?.threadId === "string" ? params.threadId.trim() : "";
  if (!notificationThreadId || notificationThreadId !== currentThreadId) {
    return null;
  }
  if (notification.method === "thread/goal/cleared") {
    return { kind: "cleared" };
  }
  if (notification.method !== "thread/goal/updated") {
    return null;
  }
  const goal = parseThreadGoal(params?.goal);
  return goal?.threadId === currentThreadId ? { kind: "updated", goal } : null;
}

export function useAgentSessionThreadGoal(params: {
  readGoal?: ThreadGoalReader;
  subscribeNotifications?: ThreadGoalSubscriber;
  threadId?: string | null;
}): Omit<ThreadGoalState, "threadId"> {
  const readGoal = params.readGoal ?? getThreadGoal;
  const subscribeNotifications =
    params.subscribeNotifications ?? subscribeAppServerNotifications;
  const threadId = params.threadId?.trim() || null;
  const [state, setState] = useState<ThreadGoalState>({
    error: null,
    goal: null,
    loading: false,
    threadId: null,
  });

  useEffect(() => {
    if (!threadId) {
      setState({ error: null, goal: null, loading: false, threadId: null });
      return;
    }

    let active = true;
    let notificationRevision = 0;
    setState({ error: null, goal: null, loading: true, threadId });
    const unsubscribe = subscribeNotifications({
      onError: (error) => {
        if (!active) {
          return;
        }
        setState((current) =>
          current.threadId === threadId ? { ...current, error } : current,
        );
      },
      onNotifications: (notifications) => {
        if (!active) {
          return;
        }
        for (const notification of notifications) {
          const scoped = readScopedThreadGoalNotification(
            notification,
            threadId,
          );
          if (!scoped) {
            continue;
          }
          notificationRevision += 1;
          setState({
            error: null,
            goal: scoped.kind === "updated" ? scoped.goal : null,
            loading: false,
            threadId,
          });
        }
      },
    });
    const readRevision = notificationRevision;
    void readGoal(threadId).then(
      (goal) => {
        if (!active || notificationRevision !== readRevision) {
          return;
        }
        setState({ error: null, goal, loading: false, threadId });
      },
      (error) => {
        if (!active || notificationRevision !== readRevision) {
          return;
        }
        setState({ error, goal: null, loading: false, threadId });
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [readGoal, subscribeNotifications, threadId]);

  if (state.threadId !== threadId) {
    return { error: null, goal: null, loading: Boolean(threadId) };
  }
  return { error: state.error, goal: state.goal, loading: state.loading };
}
