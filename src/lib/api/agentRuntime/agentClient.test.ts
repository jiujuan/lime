import { describe, expect, it, vi } from "vitest";
import { createAgentClient } from "./agentClient";

describe("agentRuntime agentClient", () => {
  it("应读取当前 Provider 选择并校验返回形态", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({
      provider_configured: true,
      provider_name: "Anthropic",
      model_name: "claude-sonnet-4-20250514",
    });
    const client = createAgentClient({ bridgeInvoke });

    await expect(client.getRuntimeProviderSelection()).resolves.toEqual({
      provider_configured: true,
      provider_name: "Anthropic",
      model_name: "claude-sonnet-4-20250514",
    });

    expect(bridgeInvoke).toHaveBeenCalledWith(
      "get_runtime_provider_selection",
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

  it("Provider 选择读取收到错误返回形态时应 fail closed", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({ success: true });
    const client = createAgentClient({ bridgeInvoke });

    await expect(client.getRuntimeProviderSelection()).rejects.toThrow(
      "get_runtime_provider_selection did not return runtime provider selection",
    );
  });
});
