import { describe, expect, it } from "vitest";
import {
  buildFalModelFetchStatus,
  buildResponsesModelFetchStatus,
  extractApiModelIds,
  isFalProviderLike,
  isLikelyFalImageModel,
  isProviderApiKeyRequired,
  isResponsesImageModel,
} from "./providerModelFetchHelpers";

const copy = {
  responsesConfirmedImage: (imageModel: string) =>
    `已确认 Responses 图片模型 ${imageModel}`,
  responsesManualImage: "请手动添加 gpt-images-2",
  falConfirmedModel: (modelId: string) => `已确认 Fal 模型 ${modelId}`,
  falManualModel: "请手动添加 fal-ai/nano-banana-pro",
};

describe("providerModelFetchHelpers", () => {
  it("提取接口模型 ID 时应裁剪空白并去重", () => {
    expect(
      extractApiModelIds([
        { id: " deepseek-chat " },
        { id: "" },
        { id: "deepseek-chat" },
        { id: "deepseek-reasoner" },
        { id: null },
      ]),
    ).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("识别 Responses 图片模型与 unsupported /models 提示", () => {
    expect(isResponsesImageModel("gpt-images-2")).toBe(true);
    expect(isResponsesImageModel("gpt-5.2-pro")).toBe(false);

    expect(
      buildResponsesModelFetchStatus(
        {
          error: "当前 Responses 兼容入口未提供标准 /models 接口。",
        },
        ["gpt-images-2"],
        copy,
      ),
    ).toEqual({
      tone: "success",
      message: "已确认 Responses 图片模型 gpt-images-2",
    });
    expect(
      buildResponsesModelFetchStatus(
        {
          error: "当前 Responses 兼容入口未提供标准 /models 接口。",
        },
        [],
        copy,
      ),
    ).toEqual({
      tone: "info",
      message: "请手动添加 gpt-images-2",
    });
    expect(
      buildResponsesModelFetchStatus({ error: "普通错误" }, [], copy),
    ).toBeNull();
  });

  it("识别 Fal Provider、Fal 图片模型和 API Key 要求", () => {
    expect(
      isFalProviderLike({
        id: "fal-custom",
        type: "openai",
        api_host: "https://example.test",
      }),
    ).toBe(true);
    expect(
      isFalProviderLike({
        id: "openai",
        type: "openai",
        api_host: "https://fal.run/fal-ai",
      }),
    ).toBe(true);
    expect(isLikelyFalImageModel("fal-ai/nano-banana-pro")).toBe(true);
    expect(isLikelyFalImageModel("gpt-5.2-pro")).toBe(false);
    expect(
      isProviderApiKeyRequired(
        {
          id: "fal",
          type: "openai",
          api_host: "https://fal.run/fal-ai",
        },
        false,
      ),
    ).toBe(true);
  });

  it("Fal 不支持 /models 时应优先确认手动声明的 Fal 模型", () => {
    expect(
      buildFalModelFetchStatus(
        {
          id: "fal",
          type: "openai",
          api_host: "https://fal.run/fal-ai",
        },
        {
          error: "Fal 不提供标准 /models 枚举。",
        },
        ["fal-ai/nano-banana-pro"],
        copy,
      ),
    ).toEqual({
      tone: "success",
      message: "已确认 Fal 模型 fal-ai/nano-banana-pro",
    });
    expect(
      buildFalModelFetchStatus(
        {
          id: "fal",
          type: "openai",
          api_host: "https://fal.run/fal-ai",
        },
        {
          diagnostic_hint:
            "Fal 不提供标准 /models 枚举。" +
            "当前模型优先级没有可用 Fal 图片模型；请手动添加 fal-ai/nano-banana-pro。",
        },
        ["gpt-5.2-pro"],
        copy,
      ),
    ).toEqual({
      tone: "info",
      message: "请手动添加 fal-ai/nano-banana-pro",
    });
  });
});
