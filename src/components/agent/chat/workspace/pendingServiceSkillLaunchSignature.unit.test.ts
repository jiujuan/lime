import { describe, expect, it } from "vitest";
import { buildPendingServiceSkillLaunchSignature } from "./pendingServiceSkillLaunchSignature";

describe("buildPendingServiceSkillLaunchSignature", () => {
  it("没有 skill id/key 时返回空签名", () => {
    expect(buildPendingServiceSkillLaunchSignature()).toBe("");
    expect(
      buildPendingServiceSkillLaunchSignature({
        skillId: "   ",
        skillKey: "   ",
      }),
    ).toBe("");
  });

  it("应稳定保留启动参数", () => {
    expect(
      JSON.parse(
        buildPendingServiceSkillLaunchSignature({
          skillId: " skill-1 ",
          skillKey: " writer ",
          requestKey: 42,
          initialSlotValues: { topic: "Codex" },
          prefillHint: "继续",
          launchUserInput: "生成报告",
        }),
      ),
    ).toEqual({
      skillId: "skill-1",
      skillKey: "writer",
      requestKey: 42,
      initialSlotValues: { topic: "Codex" },
      prefillHint: "继续",
      launchUserInput: "生成报告",
    });
  });
});
