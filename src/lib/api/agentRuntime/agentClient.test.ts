import { describe, expect, it, vi } from "vitest";
import { createAgentClient } from "./agentClient";

describe("agentRuntime agentClient", () => {
  it("应代理 runtime 初始化命令并校验返回形态", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({
      initialized: true,
      provider_configured: true,
      provider_name: "Anthropic",
      model_name: "claude-sonnet-4-20250514",
    });
    const client = createAgentClient({ bridgeInvoke });

    await expect(client.initAgentRuntime()).resolves.toEqual({
      initialized: true,
      provider_configured: true,
      provider_name: "Anthropic",
      model_name: "claude-sonnet-4-20250514",
    });

    expect(bridgeInvoke).toHaveBeenCalledWith("agent_init");
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

  it("runtime 初始化命令收到错误返回形态时应 fail closed", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({ success: true });
    const client = createAgentClient({ bridgeInvoke });

    await expect(client.initAgentRuntime()).rejects.toThrow(
      "agent_init did not return agent runtime init status",
    );
  });
});
