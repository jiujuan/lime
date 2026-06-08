import { createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ElectronDevHttpBridge } from "./devHttpBridge";

const activeBridges: ElectronDevHttpBridge[] = [];
type DevHttpBridgeInvoke = ConstructorParameters<
  typeof ElectronDevHttpBridge
>[0]["invoke"];

async function createStartedBridge(
  invoke: DevHttpBridgeInvoke = vi.fn<DevHttpBridgeInvoke>(
    async () => undefined,
  ),
): Promise<{ bridge: ElectronDevHttpBridge; invoke: DevHttpBridgeInvoke }> {
  const port = await reserveLocalPort();
  const bridge = new ElectronDevHttpBridge({
    host: "127.0.0.1",
    port,
    invoke,
  });
  activeBridges.push(bridge);
  bridge.start();
  await waitForHealth(bridge.url);
  return { bridge, invoke };
}

async function reserveLocalPort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to reserve local port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("dev HTTP bridge did not become healthy");
}

async function postJson(
  baseUrl: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("electron/devHttpBridge", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const bridge of activeBridges.splice(0)) {
      bridge.stop();
    }
    vi.restoreAllMocks();
  });

  it("health 端点必须声明当前 transport 为 electron-host", async () => {
    const { bridge } = await createStartedBridge();

    const response = await fetch(`${bridge.url}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      transport: "electron-host",
    });
  });

  it("/invoke 只调用注入的 Electron Host invoke 并返回 result envelope", async () => {
    const invoke = vi.fn().mockResolvedValue({ accepted: true });
    const { bridge } = await createStartedBridge(invoke);

    const response = await postJson(bridge.url, {
      cmd: " agent_runtime_create_session ",
      args: { workspaceRoot: "/tmp/workspace" },
    });

    expect(response).toEqual({
      status: 200,
      body: { result: { accepted: true } },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("agent_runtime_create_session", {
      workspaceRoot: "/tmp/workspace",
    });
  });

  it("/invoke 缺 command 或 body 非对象时 fail closed 且不调用 invoke", async () => {
    const invoke = vi.fn();
    const { bridge } = await createStartedBridge(invoke);

    await expect(postJson(bridge.url, { args: { ignored: true } })).resolves.toEqual(
      {
        status: 400,
        body: { error: "cmd is required" },
      },
    );

    const response = await fetch(`${bridge.url}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["legacy_command"]),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      error: "request body must be a JSON object",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("/invoke 把 Electron Host 错误投影为 error envelope，不能伪装成功", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("unsupported command"));
    const { bridge } = await createStartedBridge(invoke);

    await expect(
      postJson(bridge.url, { cmd: "legacy_command", args: { a: 1 } }),
    ).resolves.toEqual({
      status: 200,
      body: { error: "unsupported command" },
    });
  });

  it("OPTIONS 和未知路径保持固定 HTTP 边界", async () => {
    const { bridge } = await createStartedBridge();

    const options = await fetch(`${bridge.url}/invoke`, { method: "OPTIONS" });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-methods")).toBe(
      "GET,POST,OPTIONS",
    );

    const notFound = await fetch(`${bridge.url}/unknown`);
    expect(notFound.status).toBe(404);
    await expect(notFound.json()).resolves.toEqual({ error: "not found" });
  });

  it("events 端点只向订阅的事件推送 SSE message", async () => {
    const { bridge } = await createStartedBridge();
    const response = await fetch(`${bridge.url}/events?event=session:update`);
    const reader = response.body?.getReader();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(reader).toBeDefined();

    bridge.broadcast("ignored:event", { ignored: true });
    bridge.broadcast("session:update", { id: "session-1" });

    const text = await readUntil(reader!, "session:update");
    expect(text).toContain(": connected");
    expect(text).toContain("event: message");
    expect(text).toContain(
      'data: {"event":"session:update","payload":{"id":"session-1"}}',
    );
    expect(text).not.toContain("ignored:event");

    await reader?.cancel();
  });
});

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 2_000;
  while (!text.includes(needle) && Date.now() < deadline) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    text += decoder.decode(result.value, { stream: true });
  }
  if (!text.includes(needle)) {
    throw new Error(`SSE stream did not include ${needle}`);
  }
  return text;
}
