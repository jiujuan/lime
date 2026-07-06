import { describe, expect, it } from "vitest";

import {
  getProviderModelAutoFetchCapability,
  isManagedLimeHubTenantModelEndpoint,
} from "./providerModelFetchSupport";

describe("providerModelFetchSupport", () => {
  it("OpenAI 官方协议应支持自动获取且需要 API Key", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "openai",
        providerType: "openai-response",
        apiHost: "https://api.openai.com",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: true,
      requiresLiveModelTruth: true,
    });
  });

  it("Anthropic 官方协议应支持自动获取且需要 API Key", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "anthropic",
        providerType: "anthropic",
        apiHost: "https://api.anthropic.com",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: true,
      requiresLiveModelTruth: true,
    });
  });

  it("Anthropic 兼容 Host 应保留自动获取入口，但不应强制依赖实时模型目录", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "minimax-test",
        providerType: "anthropic-compatible",
        apiHost: "https://api.minimaxi.com/anthropic",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: true,
      requiresLiveModelTruth: false,
    });
  });

  it("Gemini 官方协议应支持自动获取且需要 API Key", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "google",
        providerType: "gemini",
        apiHost: "https://generativelanguage.googleapis.com",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: true,
      requiresLiveModelTruth: true,
    });
  });

  it("Ollama 应支持自动获取且不要求 API Key", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "ollama",
        providerType: "ollama",
        apiHost: "http://127.0.0.1:11434",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: false,
      requiresLiveModelTruth: true,
    });
  });

  it("本地 OpenAI 兼容地址应允许免 Key 获取模型", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "custom-local-openai",
        providerType: "openai",
        apiHost: "http://127.0.0.1:1234/v1",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: false,
      requiresLiveModelTruth: true,
    });
  });

  it("带 tenant 的 Lime Hub 受管模型网关应允许免 Key 获取模型", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "lime-hub",
        providerType: "openai",
        apiHost: "https://llm.limeai.run#lime_tenant_id=tenant-0001",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: false,
      requiresLiveModelTruth: true,
    });
  });

  it("缺少 tenant 的 Lime Hub 模型网关仍应要求显式凭证", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "lime-hub",
        providerType: "openai",
        apiHost: "https://llm.limeai.run",
      }).requiresApiKey,
    ).toBe(true);
  });

  it("只把 Lime 管理域名和合法 tenant 识别为受管模型端点", () => {
    expect(
      isManagedLimeHubTenantModelEndpoint({
        apiHost:
          "https://gateway-api.limeai.run/root#lime_tenant_id=tenant-0001",
      }),
    ).toBe(true);
    expect(
      isManagedLimeHubTenantModelEndpoint({
        apiHost: "https://limeai.run.evil.test#lime_tenant_id=tenant-0001",
      }),
    ).toBe(false);
    expect(
      isManagedLimeHubTenantModelEndpoint({
        apiHost: "https://llm.limeai.run#lime_tenant_id=tenant/0001",
      }),
    ).toBe(false);
  });

  it("Fal-like Host 应通过声明模型确认，不要求 API Key 或 /models 真相源", () => {
    expect(
      getProviderModelAutoFetchCapability({
        providerId: "fal",
        providerType: "openai",
        apiHost: "https://fal.run/fal-ai",
      }),
    ).toEqual({
      supported: true,
      requiresApiKey: false,
      requiresLiveModelTruth: false,
    });
  });

  it("Azure OpenAI 当前不应展示自动获取入口", () => {
    const capability = getProviderModelAutoFetchCapability({
      providerId: "azure-openai",
      providerType: "azure-openai",
      apiHost: "https://example.openai.azure.com",
    });

    expect(capability.supported).toBe(false);
    expect(capability.requiresLiveModelTruth).toBe(false);
    expect(capability.unsupportedReason).toContain("当前不展示自动获取入口");
  });
});
