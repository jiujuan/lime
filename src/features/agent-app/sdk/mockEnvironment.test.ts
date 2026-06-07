import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildMockCapabilityProfile } from "./mockCapabilityProfile";
import { MockCapabilityHost } from "./MockCapabilityHost";
import { createMockLimeCapabilityTransport } from "./__tests__/testFixtures";

describe("Agent App mock SDK boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("生产构建不能创建 mock capability profile、host 或 transport", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITEST", "");

    expect(() => buildMockCapabilityProfile()).toThrow(
      "buildMockCapabilityProfile 只能在测试环境使用",
    );
    expect(
      () =>
        new MockCapabilityHost({
          preview: buildInstalledAppPreview({
            loadedAt: "2026-05-15T00:00:00.000Z",
            checkedAt: "2026-05-15T00:00:00.000Z",
            generatedAt: "2026-05-15T00:00:00.000Z",
          }),
        }),
    ).toThrow("MockCapabilityHost 只能在测试环境使用");
    expect(() => createMockLimeCapabilityTransport()).toThrow(
      "createMockLimeCapabilityTransport 只能在测试环境使用",
    );
  });
});
