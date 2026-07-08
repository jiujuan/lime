import { describe, expect, it } from "vitest";

import { resolveProviderModelLoadOptions } from "./providerModelLoadOptions";

describe("providerModelLoadOptions", () => {
  it("Anthropic 兼容渠道不应强制只接受实时模型目录", () => {
    expect(
      resolveProviderModelLoadOptions({
        providerId: "custom-xfyun-coding-plan",
        providerType: "anthropic-compatible",
        apiHost: "https://spark-api-open.xf-yun.com/v1/anthropic",
      }),
    ).toEqual({
      liveFetchOnly: false,
      hasApiKey: true,
    });
  });

  it("OpenAI 兼容渠道仍应保持实时模型目录优先", () => {
    expect(
      resolveProviderModelLoadOptions({
        providerId: "custom-openai",
        providerType: "openai",
        apiHost: "https://api.openai.com/v1",
      }),
    ).toEqual({
      liveFetchOnly: true,
      hasApiKey: true,
    });
  });

  it("已有声明模型时聊天选择器不应强制实时目录", () => {
    expect(
      resolveProviderModelLoadOptions({
        providerId: "lime-hub",
        providerType: "openai",
        apiHost: "https://llm.limeai.run",
        hasApiKey: false,
        hasDeclaredModels: true,
      }),
    ).toEqual({
      liveFetchOnly: false,
      hasApiKey: false,
    });
  });

  it("需要凭证但无可用凭证时不应实时拉取模型目录", () => {
    expect(
      resolveProviderModelLoadOptions({
        providerId: "custom-openai",
        providerType: "openai",
        apiHost: "https://api.openai.com/v1",
        hasApiKey: false,
      }),
    ).toEqual({
      liveFetchOnly: false,
      hasApiKey: false,
    });
  });
});
