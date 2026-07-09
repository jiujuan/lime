import { describe, expect, it } from "vitest";
import { applyImagePreferenceToSendRouteSelection } from "./imageWorkbenchSendRoute";

describe("applyImagePreferenceToSendRouteSelection", () => {
  it("显式 @配图 发送前应以图片服务默认模型覆盖陈旧 fallback 选择", () => {
    const selection = applyImagePreferenceToSendRouteSelection({
      preference: {
        preferredProviderId: "agnes",
        preferredModelId: "agnes-image-2.1-flash",
        allowFallback: true,
        source: "global",
      },
      selection: {
        preferredProviderUnavailable: false,
        providersLoading: false,
        requestProviderId: "openai",
        requestModelId: "gpt-image-1",
      },
    });

    expect(selection).toMatchObject({
      preferredProviderUnavailable: false,
      requestProviderId: "agnes",
      requestModelId: "agnes-image-2.1-flash",
    });
  });

  it("Provider 已选但模型未显式保存时，应从图片能力目录补齐默认模型", () => {
    const selection = applyImagePreferenceToSendRouteSelection({
      preference: {
        preferredProviderId: "agnes",
        preferredModelId: undefined,
        allowFallback: true,
        source: "global",
      },
      selection: {
        preferredProviderUnavailable: false,
        providersLoading: true,
        requestProviderId: undefined,
        requestModelId: undefined,
      },
    });

    expect(selection).toMatchObject({
      preferredProviderUnavailable: false,
      requestProviderId: "agnes",
      requestModelId: "agnes-image-2.1-flash",
    });
  });

  it("没有图片默认 Provider 时不改写当前选择", () => {
    const currentSelection = {
      preferredProviderUnavailable: false,
      providersLoading: false,
      requestProviderId: "fal",
      requestModelId: "fal-ai/nano-banana-pro",
    };

    expect(
      applyImagePreferenceToSendRouteSelection({
        preference: {
          preferredProviderId: undefined,
          preferredModelId: undefined,
          allowFallback: true,
          source: "auto",
        },
        selection: currentSelection,
      }),
    ).toBe(currentSelection);
  });
});
