/**
 * @file useImageGen New API 真实中转冒烟测试
 * @description 通过环境变量显式启用，验证 OpenAI-compatible 中转站图片生成与编辑端点
 * @module components/image-gen/useImageGen.live.test
 */

import { describe, expect, it } from "vitest";
import { __imageGenFalTestUtils } from "./useImageGen";

const { requestImageFromNewApiResponsesStream } = __imageGenFalTestUtils;

const env = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const LIVE_ENABLED =
  env?.LIME_IMAGE_GEN_LIVE === "1" &&
  (isTruthyEnv(env?.LIME_ALLOW_LIVE_PROVIDER_SMOKE) ||
    isTruthyEnv(env?.LIME_REAL_API_TEST));
const LIVE_API_HOST = env?.LIME_IMAGE_GEN_LIVE_API_HOST ?? "";
const LIVE_API_KEY = env?.LIME_IMAGE_GEN_LIVE_API_KEY ?? "";
const LIVE_MODEL = env?.LIME_IMAGE_GEN_LIVE_MODEL ?? "gpt-images-2";
const LIVE_TIMEOUT_MS = 180_000;

function isTruthyEnv(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function requireLiveConfig(): { apiHost: string; apiKey: string; model: string } {
  if (!LIVE_API_HOST.trim()) {
    throw new Error("缺少 LIME_IMAGE_GEN_LIVE_API_HOST");
  }

  if (!LIVE_API_KEY.trim()) {
    throw new Error("缺少 LIME_IMAGE_GEN_LIVE_API_KEY");
  }

  return {
    apiHost: LIVE_API_HOST.trim(),
    apiKey: LIVE_API_KEY.trim(),
    model: LIVE_MODEL.trim() || "gpt-images-2",
  };
}

function expectGeneratedImageUrl(value: string): void {
  expect(value.length).toBeGreaterThan(32);
  expect(
    value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("data:image/"),
  ).toBe(true);
}

const liveDescribe = LIVE_ENABLED ? describe : describe.skip;

liveDescribe("useImageGen New API 真实中转冒烟", () => {
  it(
    "gpt-images-2 应通过 Responses image_generation 流式生成图片",
    async () => {
      const { apiHost, apiKey, model } = requireLiveConfig();

      const result = await requestImageFromNewApiResponsesStream(
        apiHost,
        apiKey,
        model,
        "A small clean product photo of a lime-green notebook on a white desk",
        [],
        "1024x1024",
      );

      expect(result.error).toBeNull();
      expectGeneratedImageUrl(result.imageUrl ?? "");
    },
    LIVE_TIMEOUT_MS,
  );
});
