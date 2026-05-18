import { describe, expect, it, vi } from "vitest";
import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppStorageEntry,
  AgentAppTaskHostResponseResult,
  AgentAppTaskRecord,
  AgentAppTaskStreamEvent,
} from "../types";
import {
  buildLimeCapabilityInvokeProvenance,
  buildLimeCapabilityInvokeRequest,
} from "./capabilityContract";
import {
  createLimeCoreCapabilityAdapters,
  LimeCapabilityAdapterError,
} from "./capabilityAdapters";
import {
  createLimeHostBridgeCapabilityInvoker,
  LIME_AGENT_APP_BRIDGE_PROTOCOL,
  LIME_AGENT_APP_BRIDGE_VERSION,
  type LimeAgentAppBridgeClientMessage,
} from "./hostBridgeClient";

const provenance = buildLimeCapabilityInvokeProvenance({
  sourceKind: "agent_app",
  appId: "content-factory-app",
  appVersion: "1.0.0",
  packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  manifestHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  entryKey: "dashboard",
  workflowRunId: "run-1",
});

function buildTaskRecord(
  overrides: Partial<AgentAppTaskRecord> = {},
): AgentAppTaskRecord {
  return {
    taskId: overrides.taskId ?? "task-1",
    traceId: overrides.traceId ?? "trace-1",
    appId: "content-factory-app",
    entryKey: "dashboard",
    title: overrides.title ?? "生成内容策略",
    prompt: overrides.prompt ?? "生成内容策略",
    taskKind: overrides.taskKind ?? "content.copy.generate",
    idempotencyKey: overrides.idempotencyKey ?? "dashboard:copy",
    input: overrides.input,
    knowledge: [],
    tools: [],
    files: [],
    secrets: [],
    humanReview: true,
    status: overrides.status ?? "running",
    startedAt: "2026-05-16T00:00:00.000Z",
    trace: [],
    events: [],
    provenance: {
      sourceKind: "agent_app",
      appId: "content-factory-app",
      appVersion: "1.0.0",
      packageHash: provenance.packageHash,
      manifestHash: provenance.manifestHash,
      entryKey: "dashboard",
    },
  };
}

class FakeBridgeWindow {
  readonly parent = {
    postMessage: vi.fn(
      (message: LimeAgentAppBridgeClientMessage, targetOrigin: string) => {
        this.posts.push({ message, targetOrigin });
      },
    ),
  };
  readonly self = {};
  readonly posts: Array<{
    message: LimeAgentAppBridgeClientMessage;
    targetOrigin: string;
  }> = [];
  private readonly listeners = new Set<(event: {
    data: unknown;
    origin: string;
    source: unknown;
  }) => void>();
  private readonly timers = new Map<number, () => void>();
  private timerSequence = 0;

  readonly windowRef = {
    parent: this.parent,
    self: this.self,
    addEventListener: (
      type: "message",
      listener: (event: { data: unknown; origin: string; source: unknown }) => void,
    ) => {
      if (type === "message") {
        this.listeners.add(listener);
      }
    },
    removeEventListener: (
      type: "message",
      listener: (event: { data: unknown; origin: string; source: unknown }) => void,
    ) => {
      if (type === "message") {
        this.listeners.delete(listener);
      }
    },
    setTimeout: (handler: () => void) => {
      this.timerSequence += 1;
      this.timers.set(this.timerSequence, handler);
      return this.timerSequence;
    },
    clearTimeout: (timerId: number) => {
      this.timers.delete(timerId);
    },
  };

  emit(
    data: LimeAgentAppBridgeClientMessage,
    origin = "https://lime.host",
    source: unknown = this.parent,
  ): void {
    for (const listener of this.listeners) {
      listener({ data, origin, source });
    }
  }

  runNextTimer(): void {
    const next = this.timers.entries().next();
    if (next.done) {
      throw new Error("No pending fake timer.");
    }
    const [timerId, handler] = next.value;
    this.timers.delete(timerId);
    handler();
  }
}

function hostResponse(
  request: LimeAgentAppBridgeClientMessage,
  payload: unknown,
): LimeAgentAppBridgeClientMessage {
  return {
    protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
    version: LIME_AGENT_APP_BRIDGE_VERSION,
    type: "host:response",
    requestId: request.requestId,
    appId: request.appId,
    entryKey: request.entryKey,
    payload,
  };
}

function hostError(
  request: LimeAgentAppBridgeClientMessage,
  payload: unknown,
): LimeAgentAppBridgeClientMessage {
  return {
    ...hostResponse(request, payload),
    type: "host:error",
  };
}

function latestBridgeRequest(fake: FakeBridgeWindow): LimeAgentAppBridgeClientMessage {
  const latest = fake.posts.at(-1)?.message;
  if (!latest) {
    throw new Error("No bridge request was posted.");
  }
  return latest;
}

function bridgeCallNames(fake: FakeBridgeWindow): string[] {
  return fake.posts.map((post) => {
    const payload = post.message.payload as { capability?: string; method?: string };
    return `${payload.capability}.${payload.method}`;
  });
}

describe("P18.5 Host Bridge SDK client", () => {
  it("应把标准 SDK facade 调用转成 Host Bridge v1 capability invoke envelope", async () => {
    const fake = new FakeBridgeWindow();
    const invoker = createLimeHostBridgeCapabilityInvoker({
      appId: "content-factory-app",
      entryKey: "dashboard",
      windowRef: fake.windowRef,
      trustedHostOrigin: "https://lime.host",
      requestIdPrefix: "content-factory",
    });
    const lime = createLimeCoreCapabilityAdapters({
      invoker,
      provenance,
      storageNamespace: "content-factory-app",
    });

    const taskPromise = lime.agent.startTask({
      title: "生成内容策略",
      taskKind: "content.copy.generate",
      idempotencyKey: "dashboard:copy",
      expectedOutput: { artifactKind: "content_batch" },
    });

    expect(fake.posts).toHaveLength(1);
    const posted = fake.posts[0];
    expect(posted.targetOrigin).toBe("https://lime.host");
    expect(posted.message).toMatchObject({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "capability:invoke",
      appId: "content-factory-app",
      entryKey: "dashboard",
      payload: {
        capability: "lime.agent",
        method: "startTask",
        input: {
          title: "生成内容策略",
          taskKind: "content.copy.generate",
          idempotencyKey: "dashboard:copy",
          expectedOutput: { artifactKind: "content_batch" },
        },
        provenance,
      },
    });

    fake.emit(
      hostResponse(posted.message, {
        ok: true,
        value: buildTaskRecord({ title: "生成内容策略" }),
      }),
    );

    await expect(taskPromise).resolves.toMatchObject({
      taskId: "task-1",
      traceId: "trace-1",
      title: "生成内容策略",
    });
    expect(invoker.pendingRequestCount).toBe(0);
    invoker.dispose();
  });

  it("应忽略非信任来源并把 host:error 映射成 stable SDK error", async () => {
    const fake = new FakeBridgeWindow();
    const invoker = createLimeHostBridgeCapabilityInvoker({
      appId: "content-factory-app",
      entryKey: "dashboard",
      windowRef: fake.windowRef,
      trustedHostOrigin: "https://lime.host",
    });
    const lime = createLimeCoreCapabilityAdapters({ invoker, provenance });

    const writePromise = lime.storage.set({
      key: "projects/project-1/content-batches/batch-1",
      value: { title: "内容批次" },
    });
    const request = fake.posts[0].message;
    fake.emit(
      hostError(request, {
        code: "PERMISSION_DENIED",
        message: "Storage write is denied.",
      }),
      "https://evil.example",
    );
    expect(invoker.pendingRequestCount).toBe(1);
    fake.emit(
      hostError(request, {
        code: "PERMISSION_DENIED",
        message: "Storage write is denied.",
      }),
    );

    await expect(writePromise).rejects.toMatchObject({
      code: "permission_denied",
      capability: "lime.storage",
      method: "set",
    } satisfies Partial<LimeCapabilityAdapterError>);
    expect(invoker.pendingRequestCount).toBe(0);
    invoker.dispose();
  });

  it("应在 Host 无响应时返回 timeout stable error 并清理 pending request", async () => {
    const fake = new FakeBridgeWindow();
    const invoker = createLimeHostBridgeCapabilityInvoker({
      appId: "content-factory-app",
      entryKey: "dashboard",
      windowRef: fake.windowRef,
      trustedHostOrigin: "https://lime.host",
      requestTimeoutMs: 50,
    });

    const responsePromise = invoker.call(
      buildLimeCapabilityInvokeRequest({
        capability: "lime.agent",
        method: "getTask",
        args: { taskId: "task-timeout" },
        provenance,
      }),
    );
    expect(invoker.pendingRequestCount).toBe(1);
    fake.runNextTimer();

    await expect(responsePromise).resolves.toMatchObject({
      ok: false,
      error: {
        code: "timeout",
        capability: "lime.agent",
        method: "getTask",
      },
    });
    expect(invoker.pendingRequestCount).toBe(0);
    invoker.dispose();
  });

  it("应支持 app ready、snapshot、theme、visibility 和 Host action", async () => {
    const fake = new FakeBridgeWindow();
    const invoker = createLimeHostBridgeCapabilityInvoker({
      appId: "content-factory-app",
      entryKey: "dashboard",
      windowRef: fake.windowRef,
      trustedHostOrigin: "https://lime.host",
      requestIdPrefix: "content-factory",
    });
    const snapshots: unknown[] = [];
    const themes: unknown[] = [];
    const visibilityEvents: unknown[] = [];
    invoker.onHostSnapshot((payload) => snapshots.push(payload));
    invoker.onThemeUpdate((payload) => themes.push(payload));
    invoker.onVisibilityChange((payload) => visibilityEvents.push(payload));

    invoker.sendReady();
    expect(latestBridgeRequest(fake)).toMatchObject({
      type: "app:ready",
      appId: "content-factory-app",
      entryKey: "dashboard",
    });

    const snapshotPromise = invoker.getHostSnapshot();
    const snapshotRequest = latestBridgeRequest(fake);
    expect(snapshotRequest).toMatchObject({
      type: "host:getSnapshot",
      appId: "content-factory-app",
      entryKey: "dashboard",
    });
    fake.emit({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "host:snapshot",
      requestId: snapshotRequest.requestId,
      appId: "content-factory-app",
      entryKey: "dashboard",
      payload: {
        app: { appId: "content-factory-app", entryKey: "dashboard" },
        host: { locale: "zh-CN" },
      },
    });
    await expect(snapshotPromise).resolves.toMatchObject({
      ok: true,
      value: {
        app: { appId: "content-factory-app", entryKey: "dashboard" },
      },
    });
    expect(snapshots).toHaveLength(1);

    fake.emit({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "theme:update",
      appId: "content-factory-app",
      entryKey: "dashboard",
      payload: { effectiveThemeMode: "dark" },
    });
    fake.emit({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "host:visibility",
      appId: "content-factory-app",
      entryKey: "dashboard",
      payload: { visibilityState: "visible" },
    });
    expect(themes).toEqual([{ effectiveThemeMode: "dark" }]);
    expect(visibilityEvents).toEqual([{ visibilityState: "visible" }]);

    const notifyPromise = invoker.notifyHost({
      message: "内容工厂任务已完成。",
      level: "success",
    });
    const notifyRequest = latestBridgeRequest(fake);
    expect(notifyRequest).toMatchObject({
      type: "host:toast",
      payload: {
        message: "内容工厂任务已完成。",
        level: "success",
      },
    });
    fake.emit(hostResponse(notifyRequest, { accepted: true }));
    await expect(notifyPromise).resolves.toMatchObject({
      ok: true,
      value: { accepted: true },
    });

    const navigatePromise = invoker.navigateHost({ route: "/reports" });
    const navigateRequest = latestBridgeRequest(fake);
    expect(navigateRequest).toMatchObject({
      type: "host:navigate",
      payload: { route: "/reports" },
    });
    fake.emit(hostResponse(navigateRequest, { navigatedTo: "/reports" }));
    await expect(navigatePromise).resolves.toMatchObject({
      ok: true,
      value: { navigatedTo: "/reports" },
    });

    const openExternalPromise = invoker.openExternalHost({
      url: "https://limeai.run/docs",
    });
    const openExternalRequest = latestBridgeRequest(fake);
    expect(openExternalRequest).toMatchObject({
      type: "host:openExternal",
      payload: { url: "https://limeai.run/docs" },
    });
    fake.emit(hostResponse(openExternalRequest, { opened: true }));
    await expect(openExternalPromise).resolves.toMatchObject({
      ok: true,
      value: { opened: true },
    });

    const selectDirectoryPromise = invoker.selectDirectoryHost({
      title: "选择应用目录",
    });
    const selectDirectoryRequest = latestBridgeRequest(fake);
    expect(selectDirectoryRequest).toMatchObject({
      type: "capability:invoke",
      payload: {
        capability: "lime.ui",
        method: "selectDirectory",
        input: { title: "选择应用目录" },
      },
    });
    fake.emit(
      hostResponse(selectDirectoryRequest, {
        ok: true,
        value: { path: "/Users/example/agent-app", cancelled: false },
      }),
    );
    await expect(selectDirectoryPromise).resolves.toMatchObject({
      ok: true,
      value: { path: "/Users/example/agent-app", cancelled: false },
    });

    const downloadPromise = invoker.downloadHost({
      url: "/exports/content-batch.csv",
      fileName: "content-batch.csv",
    });
    const downloadRequest = latestBridgeRequest(fake);
    expect(downloadRequest).toMatchObject({
      type: "host:download",
      payload: {
        url: "/exports/content-batch.csv",
        fileName: "content-batch.csv",
      },
    });
    fake.emit(hostResponse(downloadRequest, { downloaded: true }));
    await expect(downloadPromise).resolves.toMatchObject({
      ok: true,
      value: { downloaded: true },
    });

    expect(invoker.pendingRequestCount).toBe(0);
    invoker.dispose();
  });

  it("应支持 capability subscription 事件分发与 unsubscribe 清理", async () => {
    const fake = new FakeBridgeWindow();
    const invoker = createLimeHostBridgeCapabilityInvoker({
      appId: "content-factory-app",
      entryKey: "dashboard",
      windowRef: fake.windowRef,
      trustedHostOrigin: "https://lime.host",
      requestIdPrefix: "content-factory",
    });
    const receivedEvents: unknown[] = [];

    const subscribePromise = invoker.subscribeCapability(
      {
        capability: "lime.agent",
        topic: "task",
        input: { taskId: "task-1" },
        pollIntervalMs: 700,
        bridgeAction: "runHostAgentTask",
      },
      (event) => {
        receivedEvents.push(event);
      },
    );
    const subscribeRequest = latestBridgeRequest(fake);
    expect(subscribeRequest).toMatchObject({
      type: "capability:subscribe",
      payload: {
        capability: "lime.agent",
        topic: "task",
        input: { taskId: "task-1" },
        pollIntervalMs: 700,
        bridgeAction: "runHostAgentTask",
      },
    });
    fake.emit(
      hostResponse(subscribeRequest, {
        ok: true,
        value: {
          subscriptionId: "sub-task-1",
          capability: "lime.agent",
          topic: "task",
          taskId: "task-1",
          pollIntervalMs: 700,
          bridgeAction: "runHostAgentTask",
        },
      }),
    );
    await expect(subscribePromise).resolves.toMatchObject({
      ok: true,
      value: {
        subscriptionId: "sub-task-1",
        capability: "lime.agent",
        topic: "task",
      },
    });

    fake.emit({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "capability:event",
      appId: "content-factory-app",
      entryKey: "dashboard",
      payload: {
        subscriptionId: "sub-task-1",
        capability: "lime.agent",
        topic: "task",
        eventType: "task:update",
        taskId: "task-1",
        task: { taskId: "task-1", status: "running" },
        events: [{ type: "task:progress", message: "正在生成内容。" }],
      },
    });
    expect(receivedEvents).toEqual([
      expect.objectContaining({
        subscriptionId: "sub-task-1",
        eventType: "task:update",
        taskId: "task-1",
      }),
    ]);

    const unsubscribePromise = invoker.unsubscribeCapability("sub-task-1");
    const unsubscribeRequest = latestBridgeRequest(fake);
    expect(unsubscribeRequest).toMatchObject({
      type: "capability:unsubscribe",
      payload: { subscriptionId: "sub-task-1" },
    });
    fake.emit(
      hostResponse(unsubscribeRequest, {
        ok: true,
        value: { subscriptionId: "sub-task-1", unsubscribed: true },
      }),
    );
    await expect(unsubscribePromise).resolves.toMatchObject({
      ok: true,
      value: { subscriptionId: "sub-task-1", unsubscribed: true },
    });

    fake.emit({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "capability:event",
      appId: "content-factory-app",
      entryKey: "dashboard",
      payload: {
        subscriptionId: "sub-task-1",
        capability: "lime.agent",
        topic: "task",
        eventType: "task:update",
        taskId: "task-1",
      },
    });
    expect(receivedEvents).toHaveLength(1);
    invoker.dispose();
  });

  it("应兼容内容工厂现有 Host Bridge facade 并保留回调与调用日志", async () => {
    const fake = new FakeBridgeWindow();
    const snapshots: unknown[] = [];
    const capabilityEvents: unknown[] = [];
    const invoker = createLimeHostBridgeCapabilityInvoker({
      appId: "content-factory-app",
      entryKey: "dashboard",
      windowRef: fake.windowRef,
      trustedHostOrigin: "https://lime.host",
      requestIdPrefix: "content-factory",
      onSnapshot: (payload) => snapshots.push(payload),
      onCapabilityEvent: (event) => capabilityEvents.push(event),
    });

    const send = invoker.send;
    send("host:toast", { message: "手动消息" }, "manual-toast");
    expect(latestBridgeRequest(fake)).toMatchObject({
      type: "host:toast",
      requestId: "manual-toast",
      payload: { message: "手动消息" },
    });

    invoker.ready();
    expect(latestBridgeRequest(fake)).toMatchObject({ type: "app:ready" });

    const getSnapshot = invoker.getSnapshot;
    getSnapshot();
    const snapshotRequest = latestBridgeRequest(fake);
    expect(snapshotRequest).toMatchObject({
      type: "host:getSnapshot",
      requestId: undefined,
    });
    fake.emit({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "host:snapshot",
      appId: "content-factory-app",
      entryKey: "dashboard",
      payload: {
        app: { appId: "content-factory-app", entryKey: "deliver" },
        host: { locale: "zh-CN" },
      },
    });
    expect(snapshots).toHaveLength(1);

    const invokePromise = invoker.invoke(
      {
        capability: "lime.agent",
        method: "startTask",
        args: { title: "生成内容批次" },
        provenance,
      },
      { requestId: "legacy-invoke" },
    );
    const invokeRequest = latestBridgeRequest(fake);
    expect(invokeRequest).toMatchObject({
      type: "capability:invoke",
      requestId: "legacy-invoke",
      entryKey: "deliver",
      payload: {
        capability: "lime.agent",
        method: "startTask",
        input: { title: "生成内容批次" },
      },
    });
    fake.emit(hostResponse(invokeRequest, { result: buildTaskRecord() }));
    await expect(invokePromise).resolves.toMatchObject({ taskId: "task-1" });

    const subscribePromise = invoker.subscribe(
      {
        capability: "lime.agent",
        topic: "task",
        input: { taskId: "task-1" },
        pollIntervalMs: 700,
      },
      { requestId: "legacy-subscribe" },
    );
    const subscribeRequest = latestBridgeRequest(fake);
    expect(subscribeRequest).toMatchObject({
      type: "capability:subscribe",
      requestId: "legacy-subscribe",
    });
    fake.emit(
      hostResponse(subscribeRequest, {
        result: { subscriptionId: "sub-task-1", topic: "task" },
      }),
    );
    await expect(subscribePromise).resolves.toMatchObject({
      subscriptionId: "sub-task-1",
    });

    fake.emit({
      protocol: LIME_AGENT_APP_BRIDGE_PROTOCOL,
      version: LIME_AGENT_APP_BRIDGE_VERSION,
      type: "capability:event",
      appId: "content-factory-app",
      entryKey: "deliver",
      payload: {
        subscriptionId: "sub-task-1",
        capability: "lime.agent",
        eventType: "task:update",
        taskId: "task-1",
      },
    });
    expect(capabilityEvents).toEqual([
      expect.objectContaining({
        subscriptionId: "sub-task-1",
        eventType: "task:update",
      }),
    ]);

    const unsubscribePromise = invoker.unsubscribe("sub-task-1", {
      requestId: "legacy-unsubscribe",
    });
    const unsubscribeRequest = latestBridgeRequest(fake);
    fake.emit(
      hostResponse(unsubscribeRequest, {
        result: { subscriptionId: "sub-task-1", unsubscribed: true },
      }),
    );
    await expect(unsubscribePromise).resolves.toMatchObject({
      unsubscribed: true,
    });

    const requestPromise = invoker.request(
      "host:download",
      { url: "/exports/content.csv" },
      { requestId: "legacy-request" },
    );
    const request = latestBridgeRequest(fake);
    fake.emit(hostResponse(request, { result: { downloaded: true } }));
    await expect(requestPromise).resolves.toEqual({ downloaded: true });

    const downloadPromise = invoker.download(
      "/exports/content.csv",
      "content.csv",
      { requestId: "legacy-download" },
    );
    const downloadRequest = latestBridgeRequest(fake);
    fake.emit(hostResponse(downloadRequest, { result: { downloaded: true } }));
    await expect(downloadPromise).resolves.toEqual({ downloaded: true });

    const getCallLog = invoker.getCallLog;
    expect(getCallLog()).toEqual([
      {
        capability: "lime.agent",
        method: "startTask",
        args: { title: "生成内容批次" },
      },
    ]);
    expect(invoker.pendingRequestCount).toBe(0);
    invoker.dispose();
  });

  it("内容工厂主链应能通过标准 Host Bridge SDK client 完成 task 与写回", async () => {
    const fake = new FakeBridgeWindow();
    const invoker = createLimeHostBridgeCapabilityInvoker({
      appId: "content-factory-app",
      entryKey: "dashboard",
      windowRef: fake.windowRef,
      trustedHostOrigin: "https://lime.host",
      requestIdPrefix: "content-factory",
    });
    const lime = createLimeCoreCapabilityAdapters({
      invoker,
      provenance,
      storageNamespace: "content-factory-app",
    });
    const task = buildTaskRecord({
      taskId: "task-content-1",
      traceId: "trace-content-1",
      title: "生成内容批次",
      taskKind: "content.copy.generate",
      input: { projectId: "project-1", channel: "gongzhonghao" },
    });
    const taskEvents: AgentAppTaskStreamEvent[] = [
      {
        eventId: "event-missing-context",
        taskId: task.taskId,
        traceId: task.traceId,
        type: "task:missingContextRequested",
        at: "2026-05-16T00:00:01.000Z",
        status: "running",
        message: "需要确认项目定位。",
        payload: { requestId: "missing-context-1" },
      },
      {
        eventId: "event-artifact-created",
        taskId: task.taskId,
        traceId: task.traceId,
        type: "artifact:created",
        at: "2026-05-16T00:00:02.000Z",
        status: "running",
        message: "内容批次已创建。",
        refs: ["artifact-content-1"],
        payload: {
          workspacePatch: { kind: "content_batch", count: 20 },
          contentFactoryWorkspacePatch: { kind: "content_batch", count: 20 },
        },
      },
      {
        eventId: "event-evidence-recorded",
        taskId: task.taskId,
        traceId: task.traceId,
        type: "evidence:recorded",
        at: "2026-05-16T00:00:03.000Z",
        status: "running",
        message: "Fact grounding 已记录。",
        refs: ["evidence-content-1"],
      },
    ];

    const startPromise = lime.agent.startTask({
      title: task.title,
      taskKind: task.taskKind,
      idempotencyKey: task.idempotencyKey,
      input: task.input,
      expectedOutput: {
        artifactKind: "content_batch",
        workspacePatch: "contentFactoryWorkspacePatch",
      },
      humanReview: true,
    });
    fake.emit(hostResponse(latestBridgeRequest(fake), { ok: true, value: task }));
    await expect(startPromise).resolves.toMatchObject({
      taskId: "task-content-1",
      traceId: "trace-content-1",
    });

    const streamPromise = lime.agent.streamTask({ taskId: task.taskId });
    fake.emit(
      hostResponse(latestBridgeRequest(fake), {
        ok: true,
        value: taskEvents,
      }),
    );
    await expect(streamPromise).resolves.toContainEqual(
      expect.objectContaining({
        type: "artifact:created",
        payload: expect.objectContaining({
          contentFactoryWorkspacePatch: { kind: "content_batch", count: 20 },
        }),
      }),
    );

    const getPromise = lime.agent.getTask({ taskId: task.taskId });
    fake.emit(
      hostResponse(latestBridgeRequest(fake), {
        ok: true,
        value: { ...task, events: taskEvents },
      }),
    );
    await expect(getPromise).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ type: "task:missingContextRequested" }),
      ]),
    });

    const hostResponsePromise = lime.agent.submitHostResponse({
      taskId: task.taskId,
      requestId: "missing-context-1",
      actionType: "ask_user",
      confirmed: true,
      response: "已确认项目定位，请继续生成。",
      userData: { projectId: "project-1", positioning: "Founder IP" },
    });
    fake.emit(
      hostResponse(latestBridgeRequest(fake), {
        ok: true,
        value: {
          taskId: task.taskId,
          requestId: "missing-context-1",
          status: "submitted",
          submittedAt: "2026-05-16T00:00:04.000Z",
        } satisfies AgentAppTaskHostResponseResult,
      }),
    );
    await expect(hostResponsePromise).resolves.toMatchObject({
      requestId: "missing-context-1",
      status: "submitted",
    });

    const storagePromise = lime.storage.set({
      key: "projects/project-1/content-batches/batch-1",
      value: { count: 20, status: "ready" },
    });
    fake.emit(
      hostResponse(latestBridgeRequest(fake), {
        ok: true,
        value: {
          appId: "content-factory-app",
          key: "projects/project-1/content-batches/batch-1",
          value: { count: 20, status: "ready" },
          updatedAt: "2026-05-16T00:00:05.000Z",
          provenance: {
            sourceKind: "agent_app",
            appId: "content-factory-app",
            appVersion: "1.0.0",
            packageHash: provenance.packageHash,
            manifestHash: provenance.manifestHash,
            entryKey: "dashboard",
          },
        } satisfies AgentAppStorageEntry,
      }),
    );
    await expect(storagePromise).resolves.toMatchObject({
      appId: "content-factory-app",
      key: "projects/project-1/content-batches/batch-1",
    });

    const artifactPromise = lime.artifacts.create({
      kind: "content_batch",
      title: "项目内容批次",
      content: { taskId: task.taskId, count: 20 },
    });
    fake.emit(
      hostResponse(latestBridgeRequest(fake), {
        ok: true,
        value: {
          id: "artifact-content-1",
          appId: "content-factory-app",
          entryKey: "dashboard",
          kind: "content_batch",
          title: "项目内容批次",
          content: { taskId: task.taskId, count: 20 },
          createdAt: "2026-05-16T00:00:06.000Z",
          provenance: {
            sourceKind: "agent_app",
            appId: "content-factory-app",
            appVersion: "1.0.0",
            packageHash: provenance.packageHash,
            manifestHash: provenance.manifestHash,
            entryKey: "dashboard",
          },
        } satisfies AgentAppArtifactRecord,
      }),
    );
    await expect(artifactPromise).resolves.toMatchObject({
      id: "artifact-content-1",
      kind: "content_batch",
    });

    const evidencePromise = lime.evidence.record({
      kind: "fact_grounding",
      message: "内容批次已完成事实依据检查。",
      refs: [task.taskId, "artifact-content-1"],
    });
    fake.emit(
      hostResponse(latestBridgeRequest(fake), {
        ok: true,
        value: {
          id: "evidence-content-1",
          appId: "content-factory-app",
          entryKey: "dashboard",
          kind: "fact_grounding",
          message: "内容批次已完成事实依据检查。",
          refs: [task.taskId, "artifact-content-1"],
          createdAt: "2026-05-16T00:00:07.000Z",
          provenance: {
            sourceKind: "agent_app",
            appId: "content-factory-app",
            appVersion: "1.0.0",
            packageHash: provenance.packageHash,
            manifestHash: provenance.manifestHash,
            entryKey: "dashboard",
          },
        } satisfies AgentAppEvidenceRecord,
      }),
    );
    await expect(evidencePromise).resolves.toMatchObject({
      id: "evidence-content-1",
      kind: "fact_grounding",
    });

    expect(bridgeCallNames(fake)).toEqual([
      "lime.agent.startTask",
      "lime.agent.streamTask",
      "lime.agent.getTask",
      "lime.agent.submitHostResponse",
      "lime.storage.set",
      "lime.artifacts.create",
      "lime.evidence.record",
    ]);
    for (const post of fake.posts) {
      expect(post.targetOrigin).toBe("https://lime.host");
      expect(post.message.payload).toMatchObject({ provenance });
    }
    expect(invoker.pendingRequestCount).toBe(0);
    invoker.dispose();
  });
});
