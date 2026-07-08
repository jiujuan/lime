import type { safeListen } from "@/lib/api/bridgeEvents";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  PluginHostBridgeActionError,
  hasOwn,
  isRecord,
  readString,
} from "./hostBridgeCommon";
import {
  buildTaskEventsFromRuntimeEventPayload,
  hasArtifactPayload,
  hasWorkspacePatchPayload,
  isSuccessfulTerminalTaskValue,
  isTerminalTaskValue,
  readRuntimeEventNameFromPayload,
  readSessionIdFromPayload,
  readTaskEventsFromValue,
  readTaskIdFromPayload,
  shouldWaitForContentFactoryPatch,
  shouldWaitForImageArtifact,
  updateTaskSubscriptionProcess,
  type PluginTaskSubscription,
} from "./hostBridgeTaskReplay";
import {
  DEFAULT_TERMINAL_ARTIFACT_REPLAY_POLLS,
  buildTaskSubscriptionPollRequest,
  buildWorkflowSubscriptionPollRequest,
  readSubscriptionPollInterval,
  stopCapabilitySubscription,
  stopTaskSubscription,
  stopWorkflowSubscription,
  type PluginWorkflowSubscription,
} from "./hostBridgeSubscriptions";
import {
  PLUGIN_BRIDGE_PROTOCOL,
  PLUGIN_BRIDGE_VERSION,
  type LimePluginBridgeMessage,
} from "./hostBridgeSnapshot";

export interface PluginHostBridgeSubscriptionRuntimeOptions {
  appId: string;
  entryKey?: string;
  dispatchCapability?: (
    request: PluginHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  listenRuntimeEvent: typeof safeListen;
  now?: () => string;
  isDisposed: () => boolean;
  postToApp: (type: string, payload?: unknown, requestId?: string) => void;
  buildHostErrorPayload: (
    request: LimePluginBridgeMessage,
    error: unknown,
  ) => Record<string, unknown>;
}

export class PluginHostBridgeSubscriptionRuntime {
  private readonly appId: string;
  private readonly entryKey?: string;
  private readonly dispatchCapability?: (
    request: PluginHostBridgeCapabilityRequest,
  ) => Promise<unknown> | unknown;
  private readonly listenRuntimeEvent: typeof safeListen;
  private readonly now?: () => string;
  private readonly isDisposed: () => boolean;
  private readonly postToApp: (
    type: string,
    payload?: unknown,
    requestId?: string,
  ) => void;
  private readonly buildHostErrorPayload: (
    request: LimePluginBridgeMessage,
    error: unknown,
  ) => Record<string, unknown>;
  private readonly taskSubscriptions = new Map<
    string,
    PluginTaskSubscription
  >();
  private readonly workflowSubscriptions = new Map<
    string,
    PluginWorkflowSubscription
  >();
  private taskSubscriptionSequence = 0;

  constructor(options: PluginHostBridgeSubscriptionRuntimeOptions) {
    this.appId = options.appId;
    this.entryKey = options.entryKey;
    this.dispatchCapability = options.dispatchCapability;
    this.listenRuntimeEvent = options.listenRuntimeEvent;
    this.now = options.now;
    this.isDisposed = options.isDisposed;
    this.postToApp = options.postToApp;
    this.buildHostErrorPayload = options.buildHostErrorPayload;
  }

  dispose(): void {
    for (const subscriptionId of Array.from(this.taskSubscriptions.keys())) {
      stopTaskSubscription(this.taskSubscriptions, subscriptionId);
    }
    for (const subscriptionId of Array.from(
      this.workflowSubscriptions.keys(),
    )) {
      stopWorkflowSubscription(this.workflowSubscriptions, subscriptionId);
    }
  }

  async handleSubscribe(
    message: LimePluginBridgeMessage,
  ): Promise<Record<string, unknown>> {
    if (!this.dispatchCapability) {
      throw new PluginHostBridgeActionError(
        "CAPABILITY_BLOCKED",
        "Capability subscription is not enabled for this Plugin runtime.",
      );
    }
    if (!isRecord(message.payload)) {
      throw new PluginHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:subscribe requires a payload object.",
      );
    }
    const capability = readString(message.payload, "capability");
    const topic =
      readString(message.payload, "topic") ??
      readString(message.payload, "method");
    const taskId = readTaskIdFromPayload(message.payload);
    const sessionId = readSessionIdFromPayload(message.payload);
    if (capability === "lime.agent" && topic === "workflow") {
      return this.subscribeWorkflow(message.payload, capability, sessionId);
    }
    if (
      capability !== "lime.agent" ||
      !topic ||
      !topic.startsWith("task") ||
      !taskId
    ) {
      throw new PluginHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:subscribe currently requires lime.agent task payload.taskId or workflow payload.sessionId.",
      );
    }
    return this.subscribeTask(message.payload, capability, taskId, sessionId);
  }

  handleUnsubscribe(
    message: LimePluginBridgeMessage,
  ): Record<string, unknown> {
    if (!isRecord(message.payload)) {
      throw new PluginHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:unsubscribe requires a payload object.",
      );
    }
    const subscriptionId =
      readString(message.payload, "subscriptionId") ??
      (isRecord(message.payload.input)
        ? readString(message.payload.input, "subscriptionId")
        : undefined);
    if (!subscriptionId) {
      throw new PluginHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:unsubscribe requires payload.subscriptionId.",
      );
    }
    const unsubscribed = stopCapabilitySubscription(
      this.taskSubscriptions,
      this.workflowSubscriptions,
      subscriptionId,
    );
    return {
      subscriptionId,
      unsubscribed,
    };
  }

  private subscribeWorkflow(
    payload: Record<string, unknown>,
    capability: string,
    sessionId: string | undefined,
  ): Record<string, unknown> {
    if (!sessionId) {
      throw new PluginHostBridgeActionError(
        "INVALID_PAYLOAD",
        "capability:subscribe workflow requires lime.agent payload.sessionId.",
      );
    }
    const subscriptionId =
      readString(payload, "subscriptionId") ?? this.nextSubscriptionId();
    const pollIntervalMs = readSubscriptionPollInterval(
      payload.pollIntervalMs,
    );

    stopCapabilitySubscription(
      this.taskSubscriptions,
      this.workflowSubscriptions,
      subscriptionId,
    );
    this.workflowSubscriptions.set(subscriptionId, {
      subscriptionId,
      sessionId,
      pollIntervalMs,
      inFlight: false,
    });
    void this.pollWorkflowSubscription(subscriptionId);

    return {
      subscriptionId,
      capability,
      topic: "workflow",
      sessionId,
      pollIntervalMs,
    };
  }

  private subscribeTask(
    payload: Record<string, unknown>,
    capability: string,
    taskId: string,
    sessionId: string | undefined,
  ): Record<string, unknown> {
    const subscriptionId =
      readString(payload, "subscriptionId") ?? this.nextSubscriptionId();
    const pollIntervalMs = readSubscriptionPollInterval(payload.pollIntervalMs);
    const bridgeAction =
      readString(payload, "bridgeAction") ??
      (isRecord(payload.input)
        ? readString(payload.input, "bridgeAction")
        : undefined);
    const expectedOutput = hasOwn(payload, "expectedOutput")
      ? payload.expectedOutput
      : isRecord(payload.input) && hasOwn(payload.input, "expectedOutput")
        ? payload.input.expectedOutput
        : undefined;
    const runtimeEventName = readRuntimeEventNameFromPayload(
      this.appId,
      taskId,
      payload,
    );

    stopCapabilitySubscription(
      this.taskSubscriptions,
      this.workflowSubscriptions,
      subscriptionId,
    );
    this.taskSubscriptions.set(subscriptionId, {
      subscriptionId,
      taskId,
      sessionId,
      pollIntervalMs,
      bridgeAction,
      expectedOutput,
      runtimeEventName,
      inFlight: false,
      terminalArtifactReplayPolls: 0,
      events: [],
    });
    void this.attachRuntimeEventSubscription(subscriptionId);
    void this.pollTaskSubscription(subscriptionId);

    return {
      subscriptionId,
      capability,
      topic: "task",
      taskId,
      sessionId,
      pollIntervalMs,
      bridgeAction,
      runtimeEventName,
    };
  }

  private async attachRuntimeEventSubscription(
    subscriptionId: string,
  ): Promise<void> {
    const subscription = this.taskSubscriptions.get(subscriptionId);
    if (!subscription?.runtimeEventName || this.isDisposed()) {
      return;
    }
    try {
      const unlisten = await this.listenRuntimeEvent<unknown>(
        subscription.runtimeEventName,
        (event) => this.handleRuntimeTaskEvent(subscriptionId, event.payload),
      );
      const latest = this.taskSubscriptions.get(subscriptionId);
      if (
        !latest ||
        latest.runtimeEventName !== subscription.runtimeEventName
      ) {
        unlisten();
        return;
      }
      latest.runtimeEventUnlisten = unlisten;
    } catch (error) {
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "task",
        eventType: "task:eventStreamUnavailable",
        taskId: subscription.taskId,
        sessionId: subscription.sessionId,
        bridgeAction: subscription.bridgeAction,
        runtimeEventName: subscription.runtimeEventName,
        error: this.buildHostErrorPayload(
          {
            protocol: PLUGIN_BRIDGE_PROTOCOL,
            version: PLUGIN_BRIDGE_VERSION,
            type: "capability:subscribe",
            appId: this.appId,
            entryKey: this.entryKey,
          },
          error,
        ),
        emittedAt: this.currentTimestamp(),
      });
    }
  }

  private handleRuntimeTaskEvent(
    subscriptionId: string,
    payload: unknown,
  ): void {
    const subscription = this.taskSubscriptions.get(subscriptionId);
    if (!subscription || this.isDisposed()) {
      return;
    }
    const events = readTaskEventsFromValue(payload);
    const process = updateTaskSubscriptionProcess(
      subscription,
      payload,
      events.length ? events : buildTaskEventsFromRuntimeEventPayload(payload),
    );
    this.postToApp("capability:event", {
      subscriptionId,
      capability: "lime.agent",
      topic: "task",
      eventType: "task:runtimeEvent",
      taskId: subscription.taskId,
      sessionId: subscription.sessionId,
      bridgeAction: subscription.bridgeAction,
      runtimeEventName: subscription.runtimeEventName,
      runtimeEvent: payload,
      events: events.length
        ? events
        : buildTaskEventsFromRuntimeEventPayload(payload),
      runtimeProcess: process,
      process,
      emittedAt: this.currentTimestamp(),
    });
  }

  private async pollTaskSubscription(subscriptionId: string): Promise<void> {
    const subscription = this.taskSubscriptions.get(subscriptionId);
    if (
      !subscription ||
      subscription.inFlight ||
      this.isDisposed() ||
      !this.dispatchCapability
    ) {
      return;
    }
    subscription.inFlight = true;
    try {
      const result = await this.dispatchCapability(
        buildTaskSubscriptionPollRequest({
          appId: this.appId,
          entryKey: this.entryKey,
          subscription,
        }),
      );
      const events = readTaskEventsFromValue(result);
      const process = updateTaskSubscriptionProcess(
        subscription,
        result,
        events,
      );
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "task",
        eventType: "task:update",
        taskId: subscription.taskId,
        sessionId: subscription.sessionId,
        bridgeAction: subscription.bridgeAction,
        task: result,
        events,
        runtimeProcess: process,
        process,
        emittedAt: this.currentTimestamp(),
      });
      const shouldPollForTerminalArtifact =
        isSuccessfulTerminalTaskValue(result) &&
        ((shouldWaitForContentFactoryPatch(subscription) &&
          !hasWorkspacePatchPayload(result)) ||
          (shouldWaitForImageArtifact(subscription) &&
            !hasArtifactPayload(result)));
      if (shouldPollForTerminalArtifact) {
        subscription.terminalArtifactReplayPolls += 1;
      }
      if (
        isTerminalTaskValue(result) &&
        (!shouldPollForTerminalArtifact ||
          subscription.terminalArtifactReplayPolls >
            DEFAULT_TERMINAL_ARTIFACT_REPLAY_POLLS)
      ) {
        stopTaskSubscription(this.taskSubscriptions, subscriptionId);
        return;
      }
    } catch (error) {
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "task",
        eventType: "task:error",
        taskId: subscription.taskId,
        sessionId: subscription.sessionId,
        bridgeAction: subscription.bridgeAction,
        error: this.buildHostErrorPayload(
          {
            protocol: PLUGIN_BRIDGE_PROTOCOL,
            version: PLUGIN_BRIDGE_VERSION,
            type: "capability:invoke",
            appId: this.appId,
            entryKey: this.entryKey,
          },
          error,
        ),
        emittedAt: this.currentTimestamp(),
      });
      stopTaskSubscription(this.taskSubscriptions, subscriptionId);
      return;
    } finally {
      subscription.inFlight = false;
    }

    const latest = this.taskSubscriptions.get(subscriptionId);
    if (!latest || this.isDisposed()) {
      return;
    }
    latest.timerId = window.setTimeout(() => {
      void this.pollTaskSubscription(subscriptionId);
    }, latest.pollIntervalMs);
  }

  private async pollWorkflowSubscription(subscriptionId: string): Promise<void> {
    const subscription = this.workflowSubscriptions.get(subscriptionId);
    if (
      !subscription ||
      subscription.inFlight ||
      this.isDisposed() ||
      !this.dispatchCapability
    ) {
      return;
    }
    subscription.inFlight = true;
    try {
      const result = await this.dispatchCapability(
        buildWorkflowSubscriptionPollRequest({
          appId: this.appId,
          entryKey: this.entryKey,
          subscription,
        }),
      );
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "workflow",
        eventType: "workflow:readModel",
        sessionId: subscription.sessionId,
        workflowRead: result,
        workflow: isRecord(result) ? result.workflow : undefined,
        workflowRuns: isRecord(result) ? result.workflowRuns : undefined,
        workflowSteps: isRecord(result) ? result.workflowSteps : undefined,
        emittedAt: this.currentTimestamp(),
      });
    } catch (error) {
      this.postToApp("capability:event", {
        subscriptionId,
        capability: "lime.agent",
        topic: "workflow",
        eventType: "workflow:error",
        sessionId: subscription.sessionId,
        error: this.buildHostErrorPayload(
          {
            protocol: PLUGIN_BRIDGE_PROTOCOL,
            version: PLUGIN_BRIDGE_VERSION,
            type: "capability:invoke",
            appId: this.appId,
            entryKey: this.entryKey,
          },
          error,
        ),
        emittedAt: this.currentTimestamp(),
      });
      stopWorkflowSubscription(this.workflowSubscriptions, subscriptionId);
      return;
    } finally {
      subscription.inFlight = false;
    }

    const latest = this.workflowSubscriptions.get(subscriptionId);
    if (!latest || this.isDisposed()) {
      return;
    }
    latest.timerId = window.setTimeout(() => {
      void this.pollWorkflowSubscription(subscriptionId);
    }, latest.pollIntervalMs);
  }

  private nextSubscriptionId(): string {
    this.taskSubscriptionSequence += 1;
    return `plugin-subscription-${this.taskSubscriptionSequence}`;
  }

  private currentTimestamp(): string {
    return (this.now ?? (() => new Date().toISOString()))();
  }
}
