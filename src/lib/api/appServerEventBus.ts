import { AppServerClient } from "./appServerClient";
import { isAppServerJsonRpcNotification } from "./appServerResponse";
import type { AppServerJsonRpcNotification } from "./appServerTypes";

const DEFAULT_APP_SERVER_EVENT_DRAIN_LIMIT = 50;
const DEFAULT_APP_SERVER_EVENT_DRAIN_INTERVAL_MS = 250;

type AppServerEventDrainClient = {
  drainEvents: (limit?: number) => Promise<unknown[]> | unknown[];
};

export interface AppServerEventBusDrainOptions {
  intervalMs?: number;
  limit?: number;
}

export interface AppServerEventBusSubscription {
  getDrainOptions?: () => AppServerEventBusDrainOptions | undefined;
  onError?: (error: unknown) => void;
  onNotifications: (notifications: AppServerJsonRpcNotification[]) => void;
  shouldDrain?: () => boolean;
}

export class AppServerEventBus {
  readonly #appServerClient: AppServerEventDrainClient;
  readonly #subscriptions = new Map<number, AppServerEventBusSubscription>();
  #draining = false;
  #nextSubscriptionId = 1;

  constructor(appServerClient: AppServerEventDrainClient = new AppServerClient()) {
    this.#appServerClient = appServerClient;
  }

  subscribe(subscription: AppServerEventBusSubscription): () => void {
    const id = this.#nextSubscriptionId;
    this.#nextSubscriptionId += 1;
    this.#subscriptions.set(id, subscription);
    this.#startDrainLoop();

    return () => {
      this.#subscriptions.delete(id);
    };
  }

  reset(): void {
    this.#subscriptions.clear();
  }

  async #drainLoop(): Promise<void> {
    if (this.#draining) {
      return;
    }

    this.#draining = true;
    try {
      while (this.#subscriptions.size > 0) {
        const activeSubscriptions = this.#activeSubscriptions();
        if (activeSubscriptions.length === 0) {
          await waitForAppServerEventDrainInterval(
            DEFAULT_APP_SERVER_EVENT_DRAIN_INTERVAL_MS,
          );
          continue;
        }

        const drainOptions = resolveDrainOptions(activeSubscriptions);
        try {
          const drainedMessages = await Promise.resolve(
            this.#appServerClient.drainEvents(drainOptions.limit),
          );
          const notifications = readNotifications(drainedMessages);
          if (notifications.length > 0) {
            for (const subscription of activeSubscriptions) {
              subscription.onNotifications(notifications);
            }
          }
        } catch (error) {
          for (const subscription of activeSubscriptions) {
            subscription.onError?.(error);
          }
        }

        if (this.#subscriptions.size > 0) {
          await waitForAppServerEventDrainInterval(
            this.#resolveNextDrainIntervalMs(),
          );
        }
      }
    } finally {
      this.#draining = false;
      if (this.#subscriptions.size > 0) {
        this.#startDrainLoop();
      }
    }
  }

  #activeSubscriptions(): AppServerEventBusSubscription[] {
    return [...this.#subscriptions.values()].filter(
      (subscription) => subscription.shouldDrain?.() !== false,
    );
  }

  #startDrainLoop(): void {
    if (!this.#draining) {
      void this.#drainLoop();
    }
  }

  #resolveNextDrainIntervalMs(): number {
    const activeSubscriptions = this.#activeSubscriptions();
    if (activeSubscriptions.length === 0) {
      return DEFAULT_APP_SERVER_EVENT_DRAIN_INTERVAL_MS;
    }
    return resolveDrainOptions(activeSubscriptions).intervalMs;
  }
}

let defaultAppServerEventBus: AppServerEventBus | null = null;

export function getDefaultAppServerEventBus(
  appServerClient?: AppServerEventDrainClient,
): AppServerEventBus {
  if (!defaultAppServerEventBus) {
    defaultAppServerEventBus = new AppServerEventBus(
      appServerClient ?? new AppServerClient(),
    );
  }
  return defaultAppServerEventBus;
}

export function subscribeAppServerNotifications(
  subscription: AppServerEventBusSubscription,
  options: {
    appServerClient?: AppServerEventDrainClient;
    eventBus?: AppServerEventBus;
  } = {},
): () => void {
  const eventBus =
    options.eventBus ?? getDefaultAppServerEventBus(options.appServerClient);
  return eventBus.subscribe(subscription);
}

export function resetDefaultAppServerEventBusForTests(): void {
  defaultAppServerEventBus?.reset();
  defaultAppServerEventBus = null;
}

function resolveDrainOptions(
  subscriptions: AppServerEventBusSubscription[],
): Required<AppServerEventBusDrainOptions> {
  let hasFastFirstLimit = false;
  let intervalMs = DEFAULT_APP_SERVER_EVENT_DRAIN_INTERVAL_MS;
  let limit: number | undefined;

  for (const subscription of subscriptions) {
    const options = subscription.getDrainOptions?.();
    const nextLimit = normalizePositiveInteger(options?.limit);
    if (nextLimit !== undefined) {
      if (nextLimit <= 1) {
        hasFastFirstLimit = true;
      } else {
        limit = Math.max(limit ?? 0, nextLimit);
      }
    }

    const nextIntervalMs = normalizePositiveInteger(options?.intervalMs);
    if (nextIntervalMs !== undefined) {
      intervalMs = Math.min(intervalMs, nextIntervalMs);
    }
  }

  return {
    intervalMs,
    limit: hasFastFirstLimit
      ? 1
      : (limit ?? DEFAULT_APP_SERVER_EVENT_DRAIN_LIMIT),
  };
}

function readNotifications(
  messages: unknown[] | undefined,
): AppServerJsonRpcNotification[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.filter(isAppServerJsonRpcNotification);
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

async function waitForAppServerEventDrainInterval(
  intervalMs: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, intervalMs);
    const maybeUnref = (timer as { unref?: () => void } | undefined)?.unref;
    if (maybeUnref) {
      maybeUnref.call(timer);
    }
  });
}
