import type {
  AppServerConfigWarningNotification,
  AppServerRequestId,
} from "./appServerTypes";

export type AppServerConfigWarningPhase = "response" | "error";

export type AppServerConfigWarningContext = {
  method: string;
  phase: AppServerConfigWarningPhase;
  requestId: AppServerRequestId;
};

export type AppServerConfigWarningSubscriber = (
  warnings: readonly AppServerConfigWarningNotification[],
  context: AppServerConfigWarningContext,
) => void;

const configWarningSubscribers = new Set<AppServerConfigWarningSubscriber>();

export function subscribeAppServerConfigWarnings(
  subscriber: AppServerConfigWarningSubscriber,
): () => void {
  configWarningSubscribers.add(subscriber);
  return () => {
    configWarningSubscribers.delete(subscriber);
  };
}

export function publishAppServerConfigWarnings(
  warnings: readonly AppServerConfigWarningNotification[] | undefined,
  context: AppServerConfigWarningContext,
): void {
  if (!warnings?.length || configWarningSubscribers.size === 0) {
    return;
  }

  const warningBatch = [...warnings];
  for (const subscriber of configWarningSubscribers) {
    try {
      subscriber(warningBatch, context);
    } catch (error) {
      console.warn("[AppServer] config warning subscriber failed", error);
    }
  }
}

export function resetAppServerConfigWarningSubscribersForTests(): void {
  configWarningSubscribers.clear();
}
