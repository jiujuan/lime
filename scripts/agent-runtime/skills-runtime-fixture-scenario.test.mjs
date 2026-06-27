import { describe, expect, it } from "vitest";

import { createExpertPanelSkillsRuntimeFixtureScenario } from "./skills-runtime-fixture-scenario.mjs";

describe("skills runtime fixture scenario", () => {
  it("expert panel scenario carries duplicate rendering guard text", () => {
    const scenario = createExpertPanelSkillsRuntimeFixtureScenario("session-a");

    expect(scenario.dedupeGuardTexts).toContain(
      "专家 Skills runtime 证据已完成",
    );
    expect(scenario.disallowedVisibleTexts).toContain(
      "专家 Skills runtime 证据已完成",
    );
    expect(scenario.disallowedVisibleTexts).toContain(
      "我识别到专家绑定的 skillRefs",
    );
  });
});
