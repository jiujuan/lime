import { describe, expect, it, vi } from "vitest";
import {
  METHOD_MCP_SERVER_ELICITATION_REQUEST,
  METHOD_SERVER_REQUEST_RESOLVED,
  type JsonRpcRequest,
} from "../../../packages/app-server-client/src/protocol";
import { AppServerServerRequestDispatcher } from "./appServerServerRequest";
import { AppServerEventBus } from "./appServerEventBus";

function createHarness() {
  let subscription:
    | {
        onNotifications?: (
          notifications: Array<{ method: string; params?: unknown }>,
        ) => void;
        onServerRequests?: (requests: JsonRpcRequest[]) => void;
      }
    | undefined;
  const responder = {
    respondServerRequest: vi.fn(async () => undefined),
    rejectServerRequest: vi.fn(async () => undefined),
  };
  const eventBus = {
    subscribe: vi.fn((nextSubscription) => {
      subscription = nextSubscription;
      return vi.fn();
    }),
  };
  const dispatcher = new AppServerServerRequestDispatcher(responder, eventBus);
  return {
    dispatcher,
    eventBus,
    responder,
    publish: (request: JsonRpcRequest) =>
      subscription?.onServerRequests?.([request]),
    resolve: (requestId: JsonRpcRequest["id"]) =>
      subscription?.onNotifications?.([
        {
          method: METHOD_SERVER_REQUEST_RESOLVED,
          params: { requestId },
        },
      ]),
  };
}

function elicitationRequest(id = "app-server-request:1"): JsonRpcRequest {
  return {
    id,
    method: METHOD_MCP_SERVER_ELICITATION_REQUEST,
    params: {
      server: "form-server",
      message: "Choose a value",
      requestedSchema: {
        type: "object",
        properties: {},
      },
    },
  };
}

describe("AppServerServerRequestDispatcher", () => {
  it("共享 event bus 同时路由 notification 与 server request", async () => {
    const request = elicitationRequest("app-server-request:event-bus");
    const notification = {
      method: "agentSession/event",
      params: { event: { eventId: "event-1" } },
    };
    const drainEvents = vi
      .fn()
      .mockResolvedValueOnce([notification, request])
      .mockResolvedValue([]);
    const eventBus = new AppServerEventBus({ drainEvents });
    const onNotifications = vi.fn();
    const onServerRequests = vi.fn();
    const unsubscribe = eventBus.subscribe({
      getDrainOptions: () => ({ intervalMs: 1, limit: 2 }),
      onNotifications,
      onServerRequests,
    });

    await vi.waitFor(() => {
      expect(onNotifications).toHaveBeenCalledWith([notification]);
      expect(onServerRequests).toHaveBeenCalledWith([request]);
    });
    unsubscribe();
    eventBus.reset();
  });

  it("按 method 注册 typed handler 并以原 outer id 回包", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => ({
      action: "accept",
      content: { confirmed: true },
    }));
    harness.dispatcher.register(METHOD_MCP_SERVER_ELICITATION_REQUEST, handler);

    const request = elicitationRequest();
    await expect(harness.dispatcher.dispatch(request)).resolves.toBe(true);

    expect(handler).toHaveBeenCalledWith(
      request.params,
      request,
      expect.any(AbortSignal),
    );
    expect(harness.responder.respondServerRequest).toHaveBeenCalledWith(
      request.id,
      {
        action: "accept",
        content: { confirmed: true },
      },
    );
  });

  it("未知 method 与 handler 错误都 fail closed 为 JSON-RPC error", async () => {
    const harness = createHarness();
    await expect(
      harness.dispatcher.dispatch({
        id: "app-server-request:unknown",
        method: "unknown/serverRequest",
        params: {},
      }),
    ).resolves.toBe(false);
    expect(harness.responder.rejectServerRequest).toHaveBeenLastCalledWith(
      "app-server-request:unknown",
      expect.objectContaining({ code: -32601 }),
    );

    harness.dispatcher.register(
      METHOD_MCP_SERVER_ELICITATION_REQUEST,
      async () => {
        throw new Error("elicitation handler failed");
      },
    );
    await expect(
      harness.dispatcher.dispatch(elicitationRequest("app-server-request:2")),
    ).resolves.toBe(false);
    expect(harness.responder.rejectServerRequest).toHaveBeenLastCalledWith(
      "app-server-request:2",
      {
        code: -32000,
        message: "elicitation handler failed",
      },
    );
  });

  it("同 outer id 并发重复请求只执行一次", async () => {
    const harness = createHarness();
    let release: (() => void) | undefined;
    harness.dispatcher.register(
      METHOD_MCP_SERVER_ELICITATION_REQUEST,
      () =>
        new Promise((resolve) => {
          release = () => resolve({ action: "decline" });
        }),
    );
    const request = elicitationRequest("app-server-request:duplicate");
    const first = harness.dispatcher.dispatch(request);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(harness.dispatcher.dispatch(request)).resolves.toBe(false);
    release?.();
    await expect(first).resolves.toBe(true);
    expect(harness.responder.respondServerRequest).toHaveBeenCalledTimes(1);
  });

  it("同 outer id 完成后重放不再次执行 handler", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => ({ action: "decline" }));
    harness.dispatcher.register(METHOD_MCP_SERVER_ELICITATION_REQUEST, handler);
    const request = elicitationRequest("app-server-request:settled");

    await expect(harness.dispatcher.dispatch(request)).resolves.toBe(true);
    await expect(harness.dispatcher.dispatch(request)).resolves.toBe(false);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(harness.responder.respondServerRequest).toHaveBeenCalledTimes(1);
  });

  it("reset 后允许新连接复用旧 outer id", async () => {
    const harness = createHarness();
    const firstHandler = vi.fn(async () => ({ action: "decline" }));
    const request = elicitationRequest("app-server-request:reset");
    harness.dispatcher.register(
      METHOD_MCP_SERVER_ELICITATION_REQUEST,
      firstHandler,
    );
    await expect(harness.dispatcher.dispatch(request)).resolves.toBe(true);

    harness.dispatcher.reset();
    const secondHandler = vi.fn(async () => ({ action: "cancel" }));
    harness.dispatcher.register(
      METHOD_MCP_SERVER_ELICITATION_REQUEST,
      secondHandler,
    );
    await expect(harness.dispatcher.dispatch(request)).resolves.toBe(true);

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it("resolved 早于 request 时保留 tombstone 且不打开 handler", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => ({ action: "decline" }));
    harness.dispatcher.register(METHOD_MCP_SERVER_ELICITATION_REQUEST, handler);
    const request = elicitationRequest("app-server-request:resolved-first");

    harness.resolve(request.id);

    await expect(harness.dispatcher.dispatch(request)).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(harness.responder.respondServerRequest).not.toHaveBeenCalled();
    expect(harness.responder.rejectServerRequest).not.toHaveBeenCalled();
  });

  it("resolved 中止正在等待的 handler 并禁止迟到回包", async () => {
    const harness = createHarness();
    let handlerSignal: AbortSignal | undefined;
    let release: (() => void) | undefined;
    harness.dispatcher.register(
      METHOD_MCP_SERVER_ELICITATION_REQUEST,
      (_params, _request, signal) =>
        new Promise((resolve) => {
          handlerSignal = signal;
          release = () => resolve({ action: "accept", content: {} });
        }),
    );
    const request = elicitationRequest("app-server-request:remote-cancel");
    const dispatched = harness.dispatcher.dispatch(request);
    await vi.waitFor(() => expect(handlerSignal).toBeDefined());

    harness.resolve(request.id);
    expect(handlerSignal?.aborted).toBe(true);
    release?.();

    await expect(dispatched).resolves.toBe(false);
    expect(harness.responder.respondServerRequest).not.toHaveBeenCalled();
    expect(harness.responder.rejectServerRequest).not.toHaveBeenCalled();
  });

  it("reset 中止全部 handler 且旧 handler 完成后不回包", async () => {
    const harness = createHarness();
    let handlerSignal: AbortSignal | undefined;
    let release: (() => void) | undefined;
    harness.dispatcher.register(
      METHOD_MCP_SERVER_ELICITATION_REQUEST,
      (_params, _request, signal) =>
        new Promise((resolve) => {
          handlerSignal = signal;
          release = () => resolve({ action: "decline" });
        }),
    );
    const dispatched = harness.dispatcher.dispatch(
      elicitationRequest("app-server-request:reset-in-flight"),
    );
    await vi.waitFor(() => expect(handlerSignal).toBeDefined());

    harness.dispatcher.reset();
    expect(handlerSignal?.aborted).toBe(true);
    release?.();

    await expect(dispatched).resolves.toBe(false);
    expect(harness.responder.respondServerRequest).not.toHaveBeenCalled();
    expect(harness.responder.rejectServerRequest).not.toHaveBeenCalled();
  });
});
