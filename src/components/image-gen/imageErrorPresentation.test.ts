import { beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { LocalImageServerError } from "./localImageServerErrors";
import { resolveImageErrorPresentation } from "./imageErrorPresentation";

describe("imageErrorPresentation", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("应将本机图片服务错误转成稳定展示文案", async () => {
    await changeLimeLocale("zh-CN");

    const presentation = resolveImageErrorPresentation(
      new LocalImageServerError(
        "missing_api_key",
        "本机图片服务缺少 API Key，请检查服务配置。",
      ),
    );

    expect(presentation).toEqual({
      code: "missing_api_key",
      message: "本机图片服务缺少 API Key",
      recoveryHint: "请检查图片服务配置并补充 API Key 后重试。",
    });
  });

  it("应将 401/403 文本归类为认证失败", async () => {
    await changeLimeLocale("zh-CN");

    const presentation = resolveImageErrorPresentation(
      "Request failed: 403 Forbidden",
    );

    expect(presentation.code).toBe("authentication_failed");
    expect(presentation.message).toBe("图片服务认证失败");
    expect(presentation.recoveryHint).toContain("API Key");
  });

  it("应将无效 JSON 文本归类为无效 JSON", async () => {
    const presentation = resolveImageErrorPresentation(
      new Error("The image service returned invalid JSON"),
    );

    expect(presentation.code).toBe("invalid_json");
    expect(presentation.message).toContain("无效 JSON");
  });

  it("应保留未知错误的稳定默认展示", async () => {
    const presentation = resolveImageErrorPresentation("unexpected boom");

    expect(presentation.code).toBe("image_generation_failed");
    expect(presentation.message).toBe("图片生成失败");
    expect(presentation.recoveryHint).toContain("请重试");
  });
});
