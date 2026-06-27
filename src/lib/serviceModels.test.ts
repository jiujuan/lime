import { describe, expect, it } from "vitest";
import {
  buildServiceModelSlotMetadata,
  buildPersistedServiceModelPreference,
  hasServiceModelPreferenceOverride,
  normalizeServiceModelPreference,
} from "./serviceModels";

describe("serviceModels", () => {
  it("应归一 service model 偏好", () => {
    expect(
      normalizeServiceModelPreference({
        preferredProviderId: " openai ",
        preferredModelId: " gpt-5.4-mini ",
        enabled: undefined,
        customPrompt: "  请保留资料上下文 ",
      }),
    ).toEqual({
      preferredProviderId: "openai",
      preferredModelId: "gpt-5.4-mini",
      enabled: true,
      customPrompt: "请保留资料上下文",
    });
  });

  it("只有默认值时不应保留覆盖", () => {
    expect(
      hasServiceModelPreferenceOverride({
        enabled: true,
      }),
    ).toBe(false);
    expect(
      buildPersistedServiceModelPreference({
        enabled: true,
      }),
    ).toBeUndefined();
  });

  it("禁用开关或自定义提示词应视为有效覆盖", () => {
    expect(
      buildPersistedServiceModelPreference({
        enabled: false,
      }),
    ).toEqual({
      enabled: false,
      preferredProviderId: undefined,
      preferredModelId: undefined,
      customPrompt: undefined,
    });

    expect(
      buildPersistedServiceModelPreference({
        customPrompt: "请优先复用项目资料上下文",
      }),
    ).toEqual({
      enabled: true,
      preferredProviderId: undefined,
      preferredModelId: undefined,
      customPrompt: "请优先复用项目资料上下文",
    });
  });

  it("未指定 provider 时应清空 model", () => {
    expect(
      buildPersistedServiceModelPreference({
        preferredModelId: "gpt-5.4-mini",
        enabled: false,
      }),
    ).toEqual({
      enabled: false,
      preferredProviderId: undefined,
      preferredModelId: undefined,
      customPrompt: undefined,
    });
  });

  it("服务模型槽位元数据必须来自完整启用的 provider/model 配置", () => {
    expect(
      buildServiceModelSlotMetadata({
        preference: {
          preferredProviderId: " responsive-provider ",
          preferredModelId: " fast-model ",
        },
        source: "service_models.responsive_chat",
        reason: "fast_response_routing",
      }),
    ).toEqual({
      provider: "responsive-provider",
      model: "fast-model",
      source: "service_models.responsive_chat",
      reason: "fast_response_routing",
    });

    expect(
      buildServiceModelSlotMetadata({
        preference: {
          preferredProviderId: "responsive-provider",
          enabled: false,
        },
        source: "service_models.responsive_chat",
        reason: "fast_response_routing",
      }),
    ).toBeUndefined();
  });
});
