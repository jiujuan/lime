import { describe, expect, it, vi } from "vitest";
import { METHOD_MCP_SERVER_ELICITATION_REQUEST } from "@limecloud/app-server-client";

import {
  McpServerElicitationController,
  type ScopedMcpServerElicitationRequestParams,
} from "./mcpServerElicitation";

type Handler = (
  params: ScopedMcpServerElicitationRequestParams,
  request: unknown,
  signal: AbortSignal,
) => Promise<unknown> | unknown;

function createHarness() {
  let handler: Handler | undefined;
  const activeControllers: AbortController[] = [];
  const unregister = vi.fn();
  const dispatcher = {
    register: vi.fn((method: string, next: Handler) => {
      expect(method).toBe(METHOD_MCP_SERVER_ELICITATION_REQUEST);
      handler = next;
      return unregister;
    }),
  };
  const controller = new McpServerElicitationController(dispatcher as never);
  controller.attach();
  return {
    controller,
    dispatch(params = scopedParams()) {
      if (!handler) throw new Error("handler missing");
      const activeController = new AbortController();
      activeControllers.push(activeController);
      try {
        return Promise.resolve(handler(params, {}, activeController.signal));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    abort(index = activeControllers.length - 1) {
      activeControllers[index]?.abort();
    },
    unregister,
  };
}

function scopedParams(): ScopedMcpServerElicitationRequestParams {
  return {
    mode: "form",
    serverName: "release-tools",
    threadId: "thread-1",
    turnId: "turn-1",
    message: "Confirm release",
    requestedSchema: {
      type: "object",
      properties: {
        environment: {
          type: "string",
          enum: ["staging", "production"],
        },
        retries: { type: "integer", minimum: 0, maximum: 3 },
        confirmed: { type: "boolean" },
      },
      required: ["environment", "confirmed"],
    },
  };
}

describe("McpServerElicitationController", () => {
  it("accept 精确 resolve 当前 outer request 并保留 schema key 与类型", async () => {
    const harness = createHarness();
    const response = harness.dispatch();
    const [request] = harness.controller.getSnapshot();

    expect(request.params).toMatchObject({
      serverName: "release-tools",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(
      harness.controller.accept(request.key, {
        environment: "production",
        retries: 2,
        confirmed: false,
      }),
    ).toEqual([]);
    await expect(response).resolves.toEqual({
      action: "accept",
      content: {
        environment: "production",
        retries: 2,
        confirmed: false,
      },
    });
    expect(harness.controller.getSnapshot()).toEqual([]);
    expect(harness.controller.decline(request.key)).toBe(false);
  });

  it("缺 canonical scope 时 fail closed 且不创建可见请求", async () => {
    const harness = createHarness();
    await expect(
      harness.dispatch({
        ...scopedParams(),
        threadId: null,
      } as unknown as ScopedMcpServerElicitationRequestParams),
    ).rejects.toThrow("canonical threadId");
    expect(harness.controller.getSnapshot()).toEqual([]);
  });

  it("允许 Codex 协议中的 nullable turnId", async () => {
    const harness = createHarness();
    const response = harness.dispatch({ ...scopedParams(), turnId: null });
    const [request] = harness.controller.getSnapshot();

    expect(request.params.turnId).toBeNull();
    expect(harness.controller.decline(request.key)).toBe(true);
    await expect(response).resolves.toEqual({ action: "decline" });
  });

  it("校验 required、enum 与 integer 后才允许 settle", async () => {
    const harness = createHarness();
    void harness.dispatch();
    const [request] = harness.controller.getSnapshot();

    expect(
      harness.controller.accept(request.key, {
        environment: "unknown",
        retries: 1.5,
      }),
    ).toEqual([
      { code: "missing_required", field: "confirmed" },
      { code: "invalid_enum", field: "environment" },
      { code: "invalid_integer", field: "retries" },
    ]);
    expect(harness.controller.getSnapshot()).toHaveLength(1);
  });

  it("required 引用未知 property 时在显示前 fail closed", async () => {
    const harness = createHarness();
    await expect(
      harness.dispatch({
        ...scopedParams(),
        requestedSchema: {
          type: "object",
          properties: { confirmed: { type: "boolean" } },
          required: ["missing"],
        },
      }),
    ).rejects.toThrow("required field is not declared");
    expect(harness.controller.getSnapshot()).toEqual([]);
  });

  it("校验 email、URI、date 与 RFC3339 date-time", async () => {
    const harness = createHarness();
    void harness.dispatch({
      ...scopedParams(),
      requestedSchema: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          uri: { type: "string", format: "uri" },
          date: { type: "string", format: "date" },
          dateTime: { type: "string", format: "date-time" },
        },
        required: ["email", "uri", "date", "dateTime"],
      },
    });
    const [request] = harness.controller.getSnapshot();

    expect(
      harness.controller.accept(request.key, {
        email: "not-an-email",
        uri: "not a uri",
        date: "2026-02-30",
        dateTime: "2026-07-13T11:00:00",
      }),
    ).toEqual([
      { code: "invalid_format", field: "email" },
      { code: "invalid_format", field: "uri" },
      { code: "invalid_format", field: "date" },
      { code: "invalid_format", field: "dateTime" },
    ]);
    expect(
      harness.controller.accept(request.key, {
        email: "user@example.com",
        uri: "https://example.com/path",
        date: "2026-07-13",
        dateTime: "2026-07-13T11:00:00Z",
      }),
    ).toEqual([]);
  });

  it("detach 把所有 unresolved request 作为 cancel settle", async () => {
    const harness = createHarness();
    const first = harness.dispatch();
    const second = harness.dispatch();

    harness.controller.detach();

    await expect(first).resolves.toEqual({ action: "cancel" });
    await expect(second).resolves.toEqual({ action: "cancel" });
    expect(harness.unregister).toHaveBeenCalledTimes(1);
    expect(harness.controller.getSnapshot()).toEqual([]);
  });

  it("远端 resolved abort 关闭可见请求且不留下迟到 settle", async () => {
    const harness = createHarness();
    const response = harness.dispatch();
    const [request] = harness.controller.getSnapshot();

    harness.abort();

    await expect(response).resolves.toEqual({ action: "cancel" });
    expect(harness.controller.getSnapshot()).toEqual([]);
    expect(harness.controller.accept(request.key, { confirmed: true })).toEqual(
      [{ code: "missing_required", field: "$request" }],
    );
  });

  it("远端 resolved 可分别撤销队列头与非队列头", async () => {
    const harness = createHarness();
    const first = harness.dispatch();
    const second = harness.dispatch();
    const [firstRequest, secondRequest] = harness.controller.getSnapshot();

    harness.abort(1);
    await expect(second).resolves.toEqual({ action: "cancel" });
    expect(harness.controller.getSnapshot().map(({ key }) => key)).toEqual([
      firstRequest.key,
    ]);
    expect(harness.controller.decline(secondRequest.key)).toBe(false);

    harness.abort(0);
    await expect(first).resolves.toEqual({ action: "cancel" });
    expect(harness.controller.getSnapshot()).toEqual([]);
  });
});
