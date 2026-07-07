import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  APP_SERVER_METHOD_CONFIG_WARNING,
  AppServerClient,
  resetAppServerConfigWarningSubscribersForTests,
  subscribeAppServerConfigWarnings,
} from "./appServer";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

describe("App Server config warning subscribers", () => {
  beforeEach(() => {
    vi.mocked(safeInvoke).mockReset();
    resetAppServerConfigWarningSubscribersForTests();
  });

  it("request 成功时向订阅者发布 typed config warnings", async () => {
    const subscriber = vi.fn();
    subscribeAppServerConfigWarnings(subscriber);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          method: APP_SERVER_METHOD_CONFIG_WARNING,
          params: {
            summary: "App Server config warning during turn start",
            path: "/workspace/config.yaml",
            details: "invalid yaml",
          },
        }),
        line({
          id: 10,
          result: {
            ok: true,
          },
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 10 });
    const result = await client.request<{ ok: boolean }>(
      "agentSession/turn/start",
      {},
    );

    expect(result.result.ok).toBe(true);
    expect(subscriber).toHaveBeenCalledWith(
      [
        {
          summary: "App Server config warning during turn start",
          path: "/workspace/config.yaml",
          details: "invalid yaml",
        },
      ],
      {
        method: "agentSession/turn/start",
        phase: "response",
        requestId: 10,
      },
    );
  });

  it("JSON-RPC error 时仍向订阅者发布 typed config warnings", async () => {
    const subscriber = vi.fn();
    subscribeAppServerConfigWarnings(subscriber);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          method: APP_SERVER_METHOD_CONFIG_WARNING,
          params: {
            summary: "App Server config warning during initialize",
          },
        }),
        line({
          id: 11,
          error: {
            code: -32000,
            message: "request failed",
          },
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 11 });

    await expect(client.request("initialize", {})).rejects.toMatchObject({
      configWarnings: [
        {
          summary: "App Server config warning during initialize",
        },
      ],
    });
    expect(subscriber).toHaveBeenCalledWith(
      [
        {
          summary: "App Server config warning during initialize",
        },
      ],
      {
        method: "initialize",
        phase: "error",
        requestId: 11,
      },
    );
  });

  it("单个订阅者异常不会阻断 request 或其他订阅者", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const activeSubscriber = vi.fn();
    subscribeAppServerConfigWarnings(() => {
      throw new Error("subscriber failed");
    });
    subscribeAppServerConfigWarnings(activeSubscriber);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          method: APP_SERVER_METHOD_CONFIG_WARNING,
          params: {
            summary: "App Server config warning during turn start",
          },
        }),
        line({
          id: 12,
          result: {
            ok: true,
          },
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 12 });
    const result = await client.request<{ ok: boolean }>(
      "agentSession/turn/start",
      {},
    );

    expect(result.result.ok).toBe(true);
    expect(activeSubscriber).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[AppServer] config warning subscriber failed",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
