import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadGoal } from "@limecloud/app-server-client";
import type { AppServerEventBusSubscription } from "@/lib/api/appServerEventBus";
import { useAgentSessionThreadGoal } from "./useAgentSessionThreadGoal";

const initialGoal: ThreadGoal = {
  createdAt: 10,
  objective: "旧目标",
  status: "active",
  threadId: "thread-1",
  timeUsedSeconds: 1,
  tokenBudget: null,
  tokensUsed: 10,
  updatedAt: 10,
};

const updatedGoal: ThreadGoal = {
  ...initialGoal,
  objective: "通知中的新目标",
  tokensUsed: 20,
  updatedAt: 20,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useAgentSessionThreadGoal component", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("通知应胜过并发旧读取，thread 切换应立即清空旧 goal", async () => {
    const firstRead = deferred<ThreadGoal | null>();
    const secondRead = deferred<ThreadGoal | null>();
    const readGoal = vi
      .fn<(threadId: string) => Promise<ThreadGoal | null>>()
      .mockImplementation((threadId) =>
        threadId === "thread-1" ? firstRead.promise : secondRead.promise,
      );
    let subscription: AppServerEventBusSubscription | null = null;
    const subscribeNotifications = vi.fn(
      (nextSubscription: AppServerEventBusSubscription) => {
        subscription = nextSubscription;
        return vi.fn();
      },
    );
    let current: ReturnType<typeof useAgentSessionThreadGoal> | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    function TestComponent({ threadId }: { threadId: string }) {
      current = useAgentSessionThreadGoal({
        readGoal,
        subscribeNotifications,
        threadId,
      });
      return null;
    }

    try {
      await act(async () => {
        root.render(<TestComponent threadId="thread-1" />);
        await Promise.resolve();
      });
      expect(readGoal).toHaveBeenCalledWith("thread-1");

      await act(async () => {
        subscription?.onNotifications?.([
          {
            jsonrpc: "2.0",
            method: "thread/goal/updated",
            params: { threadId: "thread-1", goal: updatedGoal },
          },
        ]);
        await Promise.resolve();
      });
      expect(current?.goal).toEqual(updatedGoal);

      await act(async () => {
        firstRead.resolve(initialGoal);
        await firstRead.promise;
      });
      expect(current?.goal).toEqual(updatedGoal);

      await act(async () => {
        root.render(<TestComponent threadId="thread-2" />);
        await Promise.resolve();
      });
      expect(readGoal).toHaveBeenCalledWith("thread-2");
      expect(current).toMatchObject({ goal: null, loading: true });
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      secondRead.resolve(null);
    }
  });
});
