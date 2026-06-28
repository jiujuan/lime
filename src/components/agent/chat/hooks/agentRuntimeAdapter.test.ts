import { beforeEach, describe, expect, it, vi } from "vitest";
import { listenAgentRuntimeEvent } from "@/lib/api/agentRuntimeEvents";
import {
  createAgentRuntimeAdapter,
  defaultAgentRuntimeAdapter,
} from "./agentRuntimeAdapter";

const { mockCreateAgentRuntimeClient, mockRuntimeClient } = vi.hoisted(() => {
  const mockRuntimeClient = {
    compactAgentRuntimeSession: vi.fn(),
    createAgentRuntimeSession: vi.fn(),
    deleteAgentRuntimeSession: vi.fn(),
    generateAgentRuntimeSessionTitle: vi.fn(),
    getAgentRuntimeSession: vi.fn(),
    getAgentRuntimeThreadRead: vi.fn(),
    initAsterAgent: vi.fn(),
    interruptAgentRuntimeTurn: vi.fn(),
    listAgentRuntimeSessions: vi.fn(),
    promoteAgentRuntimeQueuedTurn: vi.fn(),
    replayAgentRuntimeRequest: vi.fn(),
    removeAgentRuntimeQueuedTurn: vi.fn(),
    resumeAgentRuntimeThread: vi.fn(),
    respondAgentRuntimeAction: vi.fn(),
    submitAgentRuntimeTurn: vi.fn(),
    updateAgentRuntimeSession: vi.fn(),
  };

  return {
    mockCreateAgentRuntimeClient: vi.fn(() => mockRuntimeClient),
    mockRuntimeClient,
  };
});

vi.mock("@/lib/api/agentRuntimeEvents", () => ({
  listenAgentRuntimeEvent: vi.fn(),
}));

vi.mock("@/lib/api/agentRuntime", () => ({
  createAgentRuntimeClient: mockCreateAgentRuntimeClient,
}));

describe("defaultAgentRuntimeAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 agentRuntimeEvents 代理 turn 与 team 事件监听", async () => {
    const unlisten = vi.fn();
    vi.mocked(listenAgentRuntimeEvent).mockResolvedValue(unlisten);

    const handler = vi.fn();

    await expect(
      defaultAgentRuntimeAdapter.listenToTurnEvents("turn-event", handler),
    ).resolves.toBe(unlisten);
    await expect(
      defaultAgentRuntimeAdapter.listenToTeamEvents("team-event", handler),
    ).resolves.toBe(unlisten);

    expect(listenAgentRuntimeEvent).toHaveBeenNthCalledWith(
      1,
      "turn-event",
      handler,
    );
    expect(listenAgentRuntimeEvent).toHaveBeenNthCalledWith(
      2,
      "team-event",
      handler,
    );
  });

  it("应允许注入自定义 runtime 事件监听器", async () => {
    const injectedListen = vi.fn().mockResolvedValue(vi.fn());
    const adapter = createAgentRuntimeAdapter({
      listenRuntimeEvent: injectedListen,
    });
    const handler = vi.fn();

    await adapter.listenToTurnEvents("turn-event-2", handler);
    await adapter.listenToTeamEvents("team-event-2", handler);

    expect(injectedListen).toHaveBeenNthCalledWith(1, "turn-event-2", handler);
    expect(injectedListen).toHaveBeenNthCalledWith(2, "team-event-2", handler);
  });

  it("应允许注入自定义 runtime client", async () => {
    const client = {
      ...mockRuntimeClient,
      createAgentRuntimeSession: vi.fn().mockResolvedValue("session-9"),
    };
    const adapter = createAgentRuntimeAdapter({
      client,
    });

    await expect(
      adapter.createSession("workspace-9", "新会话", "react", {
        runStartHooks: false,
      }),
    ).resolves.toBe("session-9");

    expect(client.createAgentRuntimeSession).toHaveBeenCalledWith(
      "workspace-9",
      "新会话",
      "react",
      { runStartHooks: false },
    );
  });

  it("listSessions 应透传筛选参数给 runtime client", async () => {
    const client = {
      ...mockRuntimeClient,
      listAgentRuntimeSessions: vi.fn().mockResolvedValue([]),
    };
    const adapter = createAgentRuntimeAdapter({
      client,
    });

    await expect(
      adapter.listSessions({
        workspaceId: "workspace-9",
      }),
    ).resolves.toEqual([]);

    expect(client.listAgentRuntimeSessions).toHaveBeenCalledWith({
      workspaceId: "workspace-9",
    });
  });

  it("getSession 应合并同一会话同一请求形状的并发读取", async () => {
    let resolveSession!: (value: { id: string; messages: unknown[] }) => void;
    const sessionPromise = new Promise<{ id: string; messages: unknown[] }>(
      (resolve) => {
        resolveSession = resolve;
      },
    );
    const client = {
      ...mockRuntimeClient,
      getAgentRuntimeSession: vi.fn().mockReturnValue(sessionPromise),
    };
    const adapter = createAgentRuntimeAdapter({
      client,
    });

    const first = adapter.getSession("session-9", {
      historyLimit: 40,
      source: "runtimeSync.poll",
    });
    const second = adapter.getSession("session-9", {
      historyLimit: 40,
      source: "switchTopic.direct",
    });

    expect(client.getAgentRuntimeSession).toHaveBeenCalledTimes(1);

    resolveSession({ id: "session-9", messages: [] });

    await expect(first).resolves.toMatchObject({ id: "session-9" });
    await expect(second).resolves.toMatchObject({ id: "session-9" });
  });

  it("getSession 不应合并不同历史窗口请求，完成后下一次应重新读取", async () => {
    const client = {
      ...mockRuntimeClient,
      getAgentRuntimeSession: vi
        .fn()
        .mockResolvedValueOnce({ id: "session-9", messages: ["latest"] })
        .mockResolvedValueOnce({ id: "session-9", messages: ["older"] })
        .mockResolvedValueOnce({ id: "session-9", messages: ["fresh"] }),
    };
    const adapter = createAgentRuntimeAdapter({
      client,
    });

    await Promise.all([
      adapter.getSession("session-9", { historyLimit: 40 }),
      adapter.getSession("session-9", {
        historyLimit: 50,
        historyBeforeMessageId: 123,
      }),
    ]);
    await adapter.getSession("session-9", { historyLimit: 40 });

    expect(client.getAgentRuntimeSession).toHaveBeenCalledTimes(3);
    expect(client.getAgentRuntimeSession).toHaveBeenNthCalledWith(
      1,
      "session-9",
      { historyLimit: 40 },
    );
    expect(client.getAgentRuntimeSession).toHaveBeenNthCalledWith(
      2,
      "session-9",
      { historyLimit: 50, historyBeforeMessageId: 123 },
    );
    expect(client.getAgentRuntimeSession).toHaveBeenNthCalledWith(
      3,
      "session-9",
      { historyLimit: 40 },
    );
  });

  it("generateSessionTitle 应透传标题预览文本", async () => {
    const client = {
      ...mockRuntimeClient,
      generateAgentRuntimeSessionTitle: vi.fn().mockResolvedValue("新标题"),
    };
    const adapter = createAgentRuntimeAdapter({
      client,
    });

    await expect(
      adapter.generateSessionTitle?.("session-9", "user：请整理支付异常"),
    ).resolves.toBe("新标题");

    expect(client.generateAgentRuntimeSessionTitle).toHaveBeenCalledWith(
      "session-9",
      "user：请整理支付异常",
    );
  });

  it("updateSessionMetadata 应把多个会话元数据合并成一次更新", async () => {
    const client = {
      ...mockRuntimeClient,
      updateAgentRuntimeSession: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = createAgentRuntimeAdapter({
      client,
    });

    await adapter.updateSessionMetadata?.("session-9", {
      accessMode: "full-access",
      providerType: "openai",
      model: "gpt-5.4-mini",
      executionStrategy: "react",
    });

    expect(client.updateAgentRuntimeSession).toHaveBeenCalledTimes(1);
    expect(client.updateAgentRuntimeSession).toHaveBeenCalledWith({
      session_id: "session-9",
      recent_access_mode: "full-access",
      provider_selector: "openai",
      model_name: "gpt-5.4-mini",
      execution_strategy: "react",
    });
  });
});
