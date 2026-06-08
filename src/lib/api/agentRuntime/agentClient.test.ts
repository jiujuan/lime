import { describe, expect, it, vi } from "vitest";
import { createAgentClient } from "./agentClient";

describe("agentRuntime agentClient", () => {
  it("应代理 Agent process 和 Aster 状态命令并校验返回形态", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce({
        running: true,
        base_url: "http://127.0.0.1:4000",
        port: 4000,
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        running: false,
      })
      .mockResolvedValueOnce({
        initialized: true,
        provider_configured: true,
        provider_name: "Anthropic",
        model_name: "claude-sonnet-4-20250514",
      })
      .mockResolvedValueOnce({
        initialized: true,
        provider_configured: false,
      })
      .mockResolvedValueOnce({
        initialized: true,
        provider_configured: true,
        provider_name: "OpenAI",
        model_name: "gpt-4.1",
      });
    const client = createAgentClient({ bridgeInvoke });

    await expect(client.startAgentProcess()).resolves.toEqual({
      running: true,
      base_url: "http://127.0.0.1:4000",
      port: 4000,
    });
    await expect(client.stopAgentProcess()).resolves.toBeUndefined();
    await expect(client.getAgentProcessStatus()).resolves.toEqual({
      running: false,
    });
    await expect(client.initAsterAgent()).resolves.toEqual({
      initialized: true,
      provider_configured: true,
      provider_name: "Anthropic",
      model_name: "claude-sonnet-4-20250514",
    });
    await expect(client.getAsterAgentStatus()).resolves.toEqual({
      initialized: true,
      provider_configured: false,
    });
    await expect(
      client.configureAsterProvider(
        {
          provider_name: "OpenAI",
          model_name: "gpt-4.1",
        },
        "session-1",
      ),
    ).resolves.toEqual({
      initialized: true,
      provider_configured: true,
      provider_name: "OpenAI",
      model_name: "gpt-4.1",
    });

    expect(bridgeInvoke).toHaveBeenNthCalledWith(1, "agent_start_process", {});
    expect(bridgeInvoke).toHaveBeenNthCalledWith(2, "agent_stop_process");
    expect(bridgeInvoke).toHaveBeenNthCalledWith(3, "agent_get_process_status");
    expect(bridgeInvoke).toHaveBeenNthCalledWith(4, "aster_agent_init");
    expect(bridgeInvoke).toHaveBeenNthCalledWith(5, "aster_agent_status");
    expect(bridgeInvoke).toHaveBeenNthCalledWith(
      6,
      "aster_agent_configure_provider",
      {
        request: {
          provider_name: "OpenAI",
          model_name: "gpt-4.1",
        },
        session_id: "session-1",
      },
    );
  });

  it("本地标题生成不应触发 bridgeInvoke", async () => {
    const bridgeInvoke = vi.fn();
    const client = createAgentClient({ bridgeInvoke });

    await expect(
      client.generateAgentRuntimeTitle({
        sessionId: "session-title",
        previewText: "用户：请帮我总结这份材料\n助手：好的",
      }),
    ).resolves.toBe("请帮我总结这份材料");

    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("Agent process 命令收到错误返回形态时应 fail closed", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ running: "yes" })
      .mockResolvedValueOnce({ success: true });
    const client = createAgentClient({ bridgeInvoke });

    await expect(client.startAgentProcess()).rejects.toThrow(
      "agent_start_process did not return agent process status",
    );
    await expect(client.getAgentProcessStatus()).rejects.toThrow(
      "agent_get_process_status did not return agent process status",
    );
    await expect(client.stopAgentProcess()).rejects.toThrow(
      "agent_stop_process did not return void result",
    );
  });

  it("Aster 命令收到错误返回形态时应 fail closed", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        initialized: true,
        provider_name: "Anthropic",
      })
      .mockResolvedValueOnce({
        initialized: true,
        provider_configured: "yes",
      });
    const client = createAgentClient({ bridgeInvoke });

    await expect(client.initAsterAgent()).rejects.toThrow(
      "aster_agent_init did not return Aster agent status",
    );
    await expect(client.getAsterAgentStatus()).rejects.toThrow(
      "aster_agent_status did not return Aster agent status",
    );
    await expect(
      client.configureAsterProvider(
        {
          provider_name: "Anthropic",
          model_name: "claude-sonnet-4-20250514",
        },
        "session-2",
      ),
    ).rejects.toThrow(
      "aster_agent_configure_provider did not return Aster agent status",
    );
  });
});
