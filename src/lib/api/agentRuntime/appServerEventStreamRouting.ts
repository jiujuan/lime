import {
  AppServerRpcError,
  type AppServerAgentEvent,
  type AppServerDrainEventsRequest,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import {
  getDefaultAppServerEventBus,
  type AppServerEventBus,
} from "@/lib/api/appServerEventBus";
import { publishProcessedAgentRuntimeEvent } from "../agentRuntimeEvents";
import { projectAgentRuntimeSequenceGateNotifications } from "./eventSequenceGate";
import { projectAppServerAgentEventPayload } from "./appServerEventPayloadProjection";
import { readAppServerAgentEvent } from "./appServerEventPayloadUtils";

export const APP_SERVER_EVENT_DRAIN_LIMIT = 50;
export const APP_SERVER_EVENT_DRAIN_ACTIVE_INTERVAL_MS = 32;
export const APP_SERVER_EVENT_DRAIN_FAST_FIRST_LIMIT = 1;
export const APP_SERVER_EVENT_DRAIN_FAST_FIRST_INTERVAL_MS = 24;
export const APP_SERVER_EVENT_DRAIN_INTERVAL_MS = 96;
const APP_SERVER_EVENT_ROUTE_TTL_MS = 30 * 60 * 1000;

type AppServerEventDrainClient = {
  drainEvents: (
    request?: number | AppServerDrainEventsRequest,
  ) => Promise<unknown[]> | unknown[];
};
type AppServerEventBusLike = Pick<AppServerEventBus, "subscribe">;

export type AppServerAgentSessionEventRouteParams = {
  eventName?: string;
  sessionId?: string;
  turnId?: string;
};

type AppServerAgentSessionEventRoute = {
  eventName: string;
  expiresAt: number;
  hasPublishedEvent: boolean;
  registrationKey: string;
  requestedTurnId?: string;
  seenEventIds: Set<string>;
  sessionId: string;
  turnId?: string;
};

export class AppServerAgentSessionEventDrainRouter {
  readonly #closedRouteKeys = new Set<string>();
  readonly #eventBus: AppServerEventBusLike;
  readonly #routes = new Map<string, AppServerAgentSessionEventRoute>();
  #unsubscribeFromEventBus: (() => void) | null = null;

  constructor(
    appServerClient: AppServerEventDrainClient,
    eventBus: AppServerEventBusLike = getDefaultAppServerEventBus(
      appServerClient,
    ),
  ) {
    this.#eventBus = eventBus;
  }

  register(params: AppServerAgentSessionEventRouteParams): {
    publish: (notifications: AppServerJsonRpcNotification[]) => void;
  } | null {
    const eventName = params.eventName?.trim();
    const sessionId = params.sessionId?.trim();
    if (!eventName || !sessionId) {
      return null;
    }

    const route = {
      eventName,
      sessionId,
      requestedTurnId: params.turnId?.trim() || undefined,
      turnId: params.turnId?.trim() || undefined,
      seenEventIds: new Set(),
      expiresAt: Date.now() + APP_SERVER_EVENT_ROUTE_TTL_MS,
      hasPublishedEvent: false,
    } as Omit<AppServerAgentSessionEventRoute, "registrationKey">;
    const key = routeKey(route);
    const registeredRoute: AppServerAgentSessionEventRoute = {
      ...route,
      registrationKey: key,
    };
    this.#closedRouteKeys.delete(key);
    this.#routes.set(key, registeredRoute);
    this.#ensureEventBusSubscription();

    return {
      publish: (notifications) => {
        this.routeNotifications(notifications, eventName);
      },
    };
  }

  routeNotifications(
    notifications: AppServerJsonRpcNotification[] | undefined,
    fallbackEventName?: string,
  ): void {
    if (!notifications?.length) {
      return;
    }

    for (const notification of sortAppServerAgentSessionNotifications(
      notifications,
    )) {
      this.#routeNotification(notification, fallbackEventName);
    }
    this.#stopEventBusSubscriptionIfIdle();
  }

  #ensureEventBusSubscription(): void {
    if (this.#unsubscribeFromEventBus) {
      return;
    }

    this.#unsubscribeFromEventBus = this.#eventBus.subscribe({
      getDrainOptions: () => {
        this.#pruneExpiredRoutes();
        if (this.#hasRouteWaitingForFirstEvent()) {
          return {
            intervalMs: APP_SERVER_EVENT_DRAIN_FAST_FIRST_INTERVAL_MS,
            limit: APP_SERVER_EVENT_DRAIN_FAST_FIRST_LIMIT,
          };
        }
        return {
          activeIntervalMs: APP_SERVER_EVENT_DRAIN_ACTIVE_INTERVAL_MS,
          intervalMs: APP_SERVER_EVENT_DRAIN_INTERVAL_MS,
          limit: APP_SERVER_EVENT_DRAIN_LIMIT,
        };
      },
      onNotifications: (notifications) => {
        this.routeNotifications(notifications);
      },
    });
  }

  #routeNotification(
    notification: AppServerJsonRpcNotification,
    fallbackEventName?: string,
  ): void {
    const event = readAppServerAgentEvent(notification.params);
    if (!event) {
      if (fallbackEventName) {
        publishAppServerAgentSessionNotifications(fallbackEventName, [
          notification,
        ]);
      }
      return;
    }

    const matchedRoutes = this.#matchingRoutes(event);
    if (
      matchedRoutes.length === 0 &&
      fallbackEventName &&
      !this.#isClosedFallbackRoute(event, fallbackEventName)
    ) {
      publishAppServerAgentSessionNotifications(fallbackEventName, [
        notification,
      ]);
      return;
    }

    for (const route of matchedRoutes) {
      if (route.seenEventIds.has(event.eventId)) {
        continue;
      }
      route.seenEventIds.add(event.eventId);
      route.hasPublishedEvent = true;
      publishAppServerAgentSessionNotifications(route.eventName, [
        notification,
      ]);
      if (isTerminalAppServerAgentEvent(event)) {
        this.#closedRouteKeys.add(routeKey(route));
        if (route.requestedTurnId) {
          this.#closedRouteKeys.add(
            routeKey({
              eventName: route.eventName,
              sessionId: route.sessionId,
              turnId: route.requestedTurnId,
            }),
          );
        }
        this.#routes.delete(route.registrationKey);
      }
    }
  }

  #hasRouteWaitingForFirstEvent(): boolean {
    for (const route of this.#routes.values()) {
      if (!route.hasPublishedEvent) {
        return true;
      }
    }
    return false;
  }

  #isClosedFallbackRoute(
    event: AppServerAgentEvent,
    fallbackEventName: string,
  ): boolean {
    return (
      this.#closedRouteKeys.has(
        routeKey({
          eventName: fallbackEventName,
          sessionId: event.sessionId,
          turnId: event.turnId,
        }),
      ) ||
      this.#closedRouteKeys.has(
        routeKey({
          eventName: fallbackEventName,
          sessionId: event.sessionId,
        }),
      )
    );
  }

  #matchingRoutes(
    event: AppServerAgentEvent,
  ): AppServerAgentSessionEventRoute[] {
    const routes: AppServerAgentSessionEventRoute[] = [];
    for (const route of this.#routes.values()) {
      if (route.sessionId !== event.sessionId) {
        continue;
      }
      if (route.turnId && event.turnId && route.turnId !== event.turnId) {
        if (
          route.hasPublishedEvent ||
          this.#isClosedRouteForEvent(route, event)
        ) {
          continue;
        }
        route.turnId = event.turnId;
      }
      routes.push(route);
    }
    return routes;
  }

  #isClosedRouteForEvent(
    route: AppServerAgentSessionEventRoute,
    event: AppServerAgentEvent,
  ): boolean {
    return (
      this.#closedRouteKeys.has(
        routeKey({
          eventName: route.eventName,
          sessionId: route.sessionId,
          turnId: event.turnId,
        }),
      ) ||
      this.#closedRouteKeys.has(
        routeKey({
          eventName: route.eventName,
          sessionId: route.sessionId,
          turnId: route.requestedTurnId,
        }),
      )
    );
  }

  #pruneExpiredRoutes(): void {
    const now = Date.now();
    for (const [key, route] of this.#routes) {
      if (route.expiresAt <= now) {
        this.#routes.delete(key);
      }
    }
    this.#stopEventBusSubscriptionIfIdle();
  }

  #stopEventBusSubscriptionIfIdle(): void {
    if (this.#routes.size > 0 || !this.#unsubscribeFromEventBus) {
      return;
    }
    this.#unsubscribeFromEventBus();
    this.#unsubscribeFromEventBus = null;
  }
}

export function publishAppServerRpcErrorNotifications(
  error: unknown,
  routeParams: AppServerAgentSessionEventRouteParams,
): void {
  if (
    !(error instanceof AppServerRpcError) ||
    !error.notifications.length ||
    !routeParams.eventName
  ) {
    return;
  }

  for (const notification of error.notifications) {
    if (doesNotificationMatchRoute(notification, routeParams)) {
      publishAppServerAgentSessionNotifications(routeParams.eventName, [
        notification,
      ]);
    }
  }
}

function doesNotificationMatchRoute(
  notification: AppServerJsonRpcNotification,
  routeParams: AppServerAgentSessionEventRouteParams,
): boolean {
  const event = readAppServerAgentEvent(notification.params);
  if (!event) {
    return true;
  }
  if (routeParams.sessionId && event.sessionId !== routeParams.sessionId) {
    return false;
  }
  if (
    routeParams.turnId &&
    event.turnId &&
    routeParams.turnId !== event.turnId
  ) {
    return false;
  }
  return true;
}

function isTerminalAppServerAgentEvent(event: AppServerAgentEvent): boolean {
  return (
    event.type === "turn.completed" ||
    event.type === "turn.failed" ||
    event.type === "turn.canceled"
  );
}

function routeKey(route: AppServerAgentSessionEventRouteParams): string {
  return `${route.sessionId}\u0000${route.turnId ?? ""}\u0000${route.eventName}`;
}

export function sortAppServerAgentSessionNotifications(
  notifications: AppServerJsonRpcNotification[],
): AppServerJsonRpcNotification[] {
  if (notifications.length <= 1) {
    return notifications;
  }

  return notifications
    .map((notification, index) => ({
      notification,
      event: readAppServerAgentEvent(notification.params),
      index,
    }))
    .sort((left, right) => {
      const leftEvent = left.event;
      const rightEvent = right.event;
      if (!leftEvent || !rightEvent) {
        return left.index - right.index;
      }
      if (leftEvent.sessionId !== rightEvent.sessionId) {
        return left.index - right.index;
      }
      if ((leftEvent.turnId ?? "") !== (rightEvent.turnId ?? "")) {
        return left.index - right.index;
      }
      if (leftEvent.sequence !== rightEvent.sequence) {
        return leftEvent.sequence - rightEvent.sequence;
      }
      return left.index - right.index;
    })
    .map(({ notification }) => notification);
}

export function publishAppServerAgentSessionNotifications(
  eventName: string | undefined,
  notifications: AppServerJsonRpcNotification[] | undefined,
): void {
  if (!eventName || !notifications?.length) {
    return;
  }

  for (const notification of sortAppServerAgentSessionNotifications(
    notifications,
  )) {
    publishAppServerAgentSessionNotificationsFromPipeline(eventName, [
      notification,
    ]);
  }
}

export function publishAppServerAgentSessionNotificationsFromPipeline(
  eventName: string | undefined,
  notifications: AppServerJsonRpcNotification[] | undefined,
): void {
  if (!eventName || !notifications?.length) {
    return;
  }

  for (const notification of notifications) {
    const processedNotifications = projectAgentRuntimeSequenceGateNotifications(
      eventName,
      notification,
    );
    for (const processedNotification of processedNotifications) {
      const payload = projectAppServerAgentEventPayload(processedNotification);
      if (payload) {
        publishProcessedAgentRuntimeEvent(eventName, payload);
      }
    }
  }
}
