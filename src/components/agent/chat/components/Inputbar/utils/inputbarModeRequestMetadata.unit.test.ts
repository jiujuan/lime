import { describe, expect, it } from "vitest";
import { buildInputbarToolPreferencesOverride } from "./inputbarModeRequestMetadata";

describe("inputbarModeRequestMetadata", () => {
  it("未开启 plan 时不生成 toolPreferencesOverride", () => {
    expect(
      buildInputbarToolPreferencesOverride({
        planEnabled: false,
        subagentEnabled: true,
      }),
    ).toBeUndefined();
  });

  it("开启 plan 时应生成发送偏好覆盖", () => {
    expect(
      buildInputbarToolPreferencesOverride({
        planEnabled: true,
        subagentEnabled: true,
      }),
    ).toEqual({
      task: true,
      subagent: true,
    });
  });
});
