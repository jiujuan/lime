import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateConfig } from "@/lib/api/appConfig";
import { updateMediaPreference } from "./mediaPreferencePersistence";

vi.mock("@/lib/api/appConfig", () => ({
  updateConfig: vi.fn(),
}));

describe("updateMediaPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应只更新目标媒体槽位并保留其它服务偏好", async () => {
    vi.mocked(updateConfig).mockImplementation(async (updater) =>
      updater({
        default_provider: "openai",
        workspace_preferences: {
          media_defaults: {
            image: {
              preferredProviderId: "old-image-provider",
              preferredModelId: "old-image-model",
              allowFallback: false,
            },
            video: {
              preferredProviderId: "video-provider",
              preferredModelId: "video-model",
              allowFallback: true,
            },
          },
        },
      }),
    );

    const result = await updateMediaPreference("image", (current) => ({
      ...current,
      preferredProviderId: "new-image-provider",
      preferredModelId: "new-image-model",
    }));

    expect(result.preference).toEqual({
      preferredProviderId: "new-image-provider",
      preferredModelId: "new-image-model",
      allowFallback: false,
    });
    expect(result.config.workspace_preferences?.media_defaults?.video).toEqual({
      preferredProviderId: "video-provider",
      preferredModelId: "video-model",
      allowFallback: true,
    });
  });
});
