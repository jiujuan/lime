import type { AgentRuntimeLifecycleNotification } from "@limecloud/app-server-client";
import {
  AgentRuntimeEventSequenceGate,
  type AgentRuntimeSequenceVerifierLike,
  type AgentRuntimeSequenceVerifierMode,
} from "./eventVerifier.js";

export interface AgentRuntimeEventPipelineContext {
  notification: AgentRuntimeLifecycleNotification;
  event: AgentRuntimeLifecycleNotification;
}

export type AgentRuntimeEventMiddlewareResult =
  | AgentRuntimeLifecycleNotification
  | readonly AgentRuntimeLifecycleNotification[]
  | undefined
  | null
  | false
  | void;

export interface AgentRuntimeEventMiddleware {
  transform(
    context: AgentRuntimeEventPipelineContext,
  ): AgentRuntimeEventMiddlewareResult | Promise<AgentRuntimeEventMiddlewareResult>;
  flush?(): AgentRuntimeEventMiddlewareResult | Promise<AgentRuntimeEventMiddlewareResult>;
}

export type AgentRuntimeEventMiddlewareFunction = (
  context: AgentRuntimeEventPipelineContext,
) => AgentRuntimeEventMiddlewareResult | Promise<AgentRuntimeEventMiddlewareResult>;

export type AgentRuntimeEventPipelineMiddleware =
  | AgentRuntimeEventMiddleware
  | AgentRuntimeEventMiddlewareFunction;

export type AgentRuntimeEventAdapter = AgentRuntimeEventPipelineMiddleware;

export interface AgentRuntimeEventPipelineOptions {
  sequenceVerifier?: AgentRuntimeSequenceVerifierLike;
  sequenceVerifierMode?: AgentRuntimeSequenceVerifierMode;
  middlewares?: readonly AgentRuntimeEventPipelineMiddleware[];
  adapters?: readonly AgentRuntimeEventAdapter[];
}

export interface AgentRuntimeEventPipelineAcceptedResult {
  accepted: true;
  notifications: AgentRuntimeLifecycleNotification[];
  notification: AgentRuntimeLifecycleNotification;
}

export interface AgentRuntimeEventPipelineRejectedResult {
  accepted: false;
  reason: "dropped" | "sequence_violation";
  notification?: AgentRuntimeLifecycleNotification;
}

export type AgentRuntimeEventPipelineResult =
  | AgentRuntimeEventPipelineAcceptedResult
  | AgentRuntimeEventPipelineRejectedResult;

export class AgentRuntimeEventPipeline {
  readonly #sequenceGate: AgentRuntimeEventSequenceGate;
  readonly #middlewares: readonly AgentRuntimeEventPipelineMiddleware[];

  constructor(options: AgentRuntimeEventPipelineOptions = {}) {
    this.#sequenceGate = new AgentRuntimeEventSequenceGate({
      verifier: options.sequenceVerifier,
      mode: options.sequenceVerifierMode,
    });
    this.#middlewares = [
      ...(options.adapters ?? []),
      ...(options.middlewares ?? []),
    ];
  }

  async process(
    notification: AgentRuntimeLifecycleNotification,
  ): Promise<AgentRuntimeEventPipelineResult> {
    return await this.#processFrom(0, [notification]);
  }

  processSync(
    notification: AgentRuntimeLifecycleNotification,
  ): AgentRuntimeEventPipelineResult {
    return this.#processFromSync(0, [notification]);
  }

  async flush(): Promise<AgentRuntimeEventPipelineResult> {
    const accepted: AgentRuntimeLifecycleNotification[] = [];
    for (let index = 0; index < this.#middlewares.length; index += 1) {
      const result = await runFlush(this.#middlewares[index]);
      const flushed = normalizeFlushResult(result);
      if (flushed.length === 0) {
        continue;
      }
      const processed = await this.#processFrom(index + 1, flushed);
      if (!processed.accepted) {
        if (processed.reason === "sequence_violation") {
          return processed;
        }
        continue;
      }
      accepted.push(...processed.notifications);
    }
    return acceptedNotificationsResult(accepted);
  }

  flushSync(): AgentRuntimeEventPipelineResult {
    const accepted: AgentRuntimeLifecycleNotification[] = [];
    for (let index = 0; index < this.#middlewares.length; index += 1) {
      const result = runFlushSync(this.#middlewares[index]);
      const flushed = normalizeFlushResult(result);
      if (flushed.length === 0) {
        continue;
      }
      const processed = this.#processFromSync(index + 1, flushed);
      if (!processed.accepted) {
        if (processed.reason === "sequence_violation") {
          return processed;
        }
        continue;
      }
      accepted.push(...processed.notifications);
    }
    return acceptedNotificationsResult(accepted);
  }

  async #processFrom(
    startIndex: number,
    notifications: readonly AgentRuntimeLifecycleNotification[],
  ): Promise<AgentRuntimeEventPipelineResult> {
    let current = [...notifications];
    for (let index = startIndex; index < this.#middlewares.length; index += 1) {
      const next: AgentRuntimeLifecycleNotification[] = [];
      for (const notification of current) {
        const result = await runMiddleware(this.#middlewares[index], {
          notification,
          event: notification,
        });
        next.push(...normalizeMiddlewareResult(result, notification));
      }
      current = next;
      if (current.length === 0) {
        return { accepted: false, reason: "dropped" };
      }
    }
    return this.#verifyNotifications(current);
  }

  #processFromSync(
    startIndex: number,
    notifications: readonly AgentRuntimeLifecycleNotification[],
  ): AgentRuntimeEventPipelineResult {
    let current = [...notifications];
    for (let index = startIndex; index < this.#middlewares.length; index += 1) {
      const next: AgentRuntimeLifecycleNotification[] = [];
      for (const notification of current) {
        const result = runMiddlewareSync(this.#middlewares[index], {
          notification,
          event: notification,
        });
        next.push(...normalizeMiddlewareResult(result, notification));
      }
      current = next;
      if (current.length === 0) {
        return { accepted: false, reason: "dropped" };
      }
    }
    return this.#verifyNotifications(current);
  }

  #verifyNotifications(
    notifications: readonly AgentRuntimeLifecycleNotification[],
  ): AgentRuntimeEventPipelineResult {
    const accepted: AgentRuntimeLifecycleNotification[] = [];
    for (const notification of notifications) {
      const verification = this.#sequenceGate.verify(notification);
      if (!verification.accepted) {
        return {
          accepted: false,
          reason: "sequence_violation",
          notification,
        };
      }
      accepted.push(notification);
    }
    return acceptedNotificationsResult(accepted);
  }

  sequenceViolationError() {
    return this.#sequenceGate.sequenceViolationError();
  }

  getViolations() {
    return this.#sequenceGate.getViolations();
  }
}

function acceptedNotificationsResult(
  notifications: readonly AgentRuntimeLifecycleNotification[],
): AgentRuntimeEventPipelineResult {
  if (notifications.length === 0) {
    return { accepted: false, reason: "dropped" };
  }
  return {
    accepted: true,
    notification: notifications[0],
    notifications: [...notifications],
  };
}

function normalizeMiddlewareResult(
  result: AgentRuntimeEventMiddlewareResult,
  original: AgentRuntimeLifecycleNotification,
): AgentRuntimeLifecycleNotification[] {
  if (result === false || result === null) {
    return [];
  }
  if (result === undefined) {
    return [original];
  }
  return normalizeFlushResult(result);
}

function normalizeFlushResult(
  result: AgentRuntimeEventMiddlewareResult,
): AgentRuntimeLifecycleNotification[] {
  if (result === false || result === null || result === undefined) {
    return [];
  }
  if (isNotificationArray(result)) {
    return [...result];
  }
  return [result];
}

async function runMiddleware(
  middleware: AgentRuntimeEventPipelineMiddleware,
  context: AgentRuntimeEventPipelineContext,
): Promise<AgentRuntimeEventMiddlewareResult> {
  if (typeof middleware === "function") {
    return await middleware(context);
  }
  return await middleware.transform(context);
}

function runMiddlewareSync(
  middleware: AgentRuntimeEventPipelineMiddleware,
  context: AgentRuntimeEventPipelineContext,
): AgentRuntimeEventMiddlewareResult {
  const result = typeof middleware === "function"
    ? middleware(context)
    : middleware.transform(context);
  if (isPromiseLike(result)) {
    throw new Error(
      "AgentRuntimeEventPipeline.processSync cannot run async middleware.",
    );
  }
  return result;
}

async function runFlush(
  middleware: AgentRuntimeEventPipelineMiddleware,
): Promise<AgentRuntimeEventMiddlewareResult> {
  if (typeof middleware === "function") {
    return undefined;
  }
  return await middleware.flush?.();
}

function runFlushSync(
  middleware: AgentRuntimeEventPipelineMiddleware,
): AgentRuntimeEventMiddlewareResult {
  if (typeof middleware === "function") {
    return undefined;
  }
  const result = middleware.flush?.();
  if (isPromiseLike(result)) {
    throw new Error(
      "AgentRuntimeEventPipeline.flushSync cannot run async middleware.",
    );
  }
  return result;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    Boolean(value) &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function isNotificationArray(
  value: AgentRuntimeEventMiddlewareResult,
): value is readonly AgentRuntimeLifecycleNotification[] {
  return Array.isArray(value);
}
