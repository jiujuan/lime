import { describe, expect, it } from "vitest";

import {
  createExpertPanelSkillsRuntimeFixtureScenario,
  createSkillsRuntimeFixtureScenario,
  renderSkillsRuntimeBackendEvents,
} from "./skills-runtime-fixture-scenario.mjs";

describe("skills runtime fixture scenario", () => {
  it("emits canonical Tool Item lifecycles for search and Skill invocation", () => {
    const backendEvents = renderSkillsRuntimeBackendEvents({
      ...createSkillsRuntimeFixtureScenario("session-a"),
    });

    expect(backendEvents.match(/type: "item\.started"/g)).toHaveLength(2);
    expect(backendEvents.match(/type: "item\.completed"/g)).toHaveLength(2);
    expect(backendEvents).toContain("payload: buildCanonicalToolItem({");
    expect(backendEvents).not.toContain('type: "tool.started"');
    expect(backendEvents).not.toContain('type: "tool.result"');
  });

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
