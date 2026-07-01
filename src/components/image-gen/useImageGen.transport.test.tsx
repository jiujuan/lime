import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  flushEffects,
  renderIntoDom,
  setReactActEnvironment,
  type MountedRoot,
} from "./test-utils";

const { mockRequestImagesFromLocalImageServer } = vi.hoisted(() => ({
  mockRequestImagesFromLocalImageServer: vi.fn(),
}));

vi.mock("@/hooks/useApiKeyProvider", () => ({
  useApiKeyProvider: () => ({
    providers: [
      {
        id: "new-api",
        type: "openai",
        name: "New API",
        enabled: true,
        api_key_count: 1,
        api_host: "https://airgate.example.com/v1",
        custom_models: ["gpt-images-2"],
      },
      {
        id: "openai",
        type: "openai-response",
        name: "OpenAI",
        enabled: true,
        api_key_count: 1,
        api_host: "https://api.openai.com/v1",
        custom_models: ["gpt-image-1"],
      },
      {
        id: "fal",
        type: "fal",
        name: "Fal",
        enabled: true,
        api_key_count: 1,
        api_host: "https://fal.run",
      },
      {
        id: "gemini",
        type: "gemini",
        name: "Gemini",
        enabled: true,
        api_key_count: 1,
        api_host: "https://generativelanguage.googleapis.com",
      },
    ],
    loading: false,
  }),
}));

vi.mock("./localImageServerExecutor", () => ({
  requestImagesFromLocalImageServer: mockRequestImagesFromLocalImageServer,
}));

vi.mock("@/lib/api/materials", () => ({
  importMaterialFromUrl: vi.fn(),
}));

import { useImageGen } from "./useImageGen";

interface HookHarness {
  getValue: () => ReturnType<typeof useImageGen>;
}

const mountedRoots: MountedRoot[] = [];

function mountHook(
  options: {
    preferredProviderId?: string;
    preferredModelId?: string;
  } = {},
): HookHarness {
  let hookValue: ReturnType<typeof useImageGen> | null = null;

  function TestComponent() {
    hookValue = useImageGen(options);
    return null;
  }

  renderIntoDom(<TestComponent />, mountedRoots);

  return {
    getValue: () => {
      if (!hookValue) {
        throw new Error("hook 尚未初始化");
      }
      return hookValue;
    },
  };
}

async function waitForReady(harness: HookHarness, timeout = 40): Promise<void> {
  for (let i = 0; i < timeout; i += 1) {
    const value = harness.getValue();
    if (value.selectedProvider && value.selectedModelId) {
      return;
    }
    await flushEffects();
  }
  throw new Error("useImageGen 未在预期时间内就绪");
}

beforeEach(() => {
  setReactActEnvironment();
  vi.clearAllMocks();
  mockRequestImagesFromLocalImageServer.mockResolvedValue([
    "https://cdn.example.com/generated.png",
  ]);
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
  vi.restoreAllMocks();
});

describe("useImageGen transport", () => {
  it("new-api 应走本机图片服务统一入口", async () => {
    const harness = mountHook({ preferredProviderId: "new-api" });
    await act(async () => {
      await waitForReady(harness);
    });

    await act(async () => {
      await harness.getValue().generateImage("生成一张新的 API 测试图", {
        imageCount: 1,
      });
    });

    expect(mockRequestImagesFromLocalImageServer).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "new-api",
        model: "gpt-images-2",
        count: 1,
        size: "1024x1024",
      }),
    );
  });

  it("fal 也应走本机图片服务统一入口", async () => {
    const harness = mountHook({ preferredProviderId: "fal" });
    await act(async () => {
      await waitForReady(harness);
    });

    await act(async () => {
      await harness.getValue().generateImage("生成一张 Fal 测试图", {
        imageCount: 1,
      });
    });

    expect(mockRequestImagesFromLocalImageServer).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "fal",
        model: "fal-ai/nano-banana-pro",
        count: 1,
        size: "1024x1024",
      }),
    );
  });
});
