import { describe, expect, it } from "vitest";
import type { Skill } from "@/lib/api/skills";
import {
  buildInstalledSkillCapabilityDescription,
  getInstalledSkillOutputHint,
  type InstalledSkillPresentationCopy,
  resolveInstalledSkillPromise,
  summarizeInstalledSkillRequiredInputs,
} from "./installedSkillPresentation";

const TEST_COPY: InstalledSkillPresentationCopy = {
  defaultPromise: "当你需要复用这个 Skill 时使用。",
  fallbackRequiredInputs: "对话里继续补充目标与约束",
  fallbackOutputHint: "带着该 Skill 进入生成",
  requiredPrefix: "需要：",
  outputPrefix: "交付：",
};

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    key: "local:writer",
    name: "写作助手",
    description: "本地补充技能",
    directory: "writer",
    installed: true,
    sourceKind: "other",
    ...overrides,
  };
}

describe("installedSkillPresentation", () => {
  it("已安装技能应优先复用 metadata 里的轻合同信息", () => {
    const skill = createSkill({
      metadata: {
        lime_when_to_use: "当你需要复用内容改写方法时使用。",
        lime_argument_hint: "主题、受众与风格约束",
        lime_output_hint: "沿用这套写法进入生成",
      },
    });

    expect(resolveInstalledSkillPromise(skill)).toBe(
      "当你需要复用内容改写方法时使用。",
    );
    expect(summarizeInstalledSkillRequiredInputs(skill)).toBe(
      "主题、受众与风格约束",
    );
    expect(getInstalledSkillOutputHint(skill)).toBe("沿用这套写法进入生成");
    expect(
      buildInstalledSkillCapabilityDescription(skill, { copy: TEST_COPY }),
    ).toBe(
      "当你需要复用内容改写方法时使用。 · 需要：主题、受众与风格约束 · 交付：沿用这套写法进入生成",
    );
  });

  it("已安装技能在缺少结构化 metadata 时应使用调用方注入的兜底合同", () => {
    const skill = createSkill();

    expect(
      buildInstalledSkillCapabilityDescription(skill, { copy: TEST_COPY }),
    ).toBe(
      "本地补充技能 · 需要：对话里继续补充目标与约束 · 交付：带着该 Skill 进入生成",
    );
    expect(
      buildInstalledSkillCapabilityDescription(skill, {
        includePromise: false,
        copy: TEST_COPY,
      }),
    ).toBe("需要：对话里继续补充目标与约束 · 交付：带着该 Skill 进入生成");
  });

  it("允许调用方注入本地化兜底文案", () => {
    const skill = createSkill({ description: "" });

    expect(
      buildInstalledSkillCapabilityDescription(skill, {
        copy: {
          defaultPromise: "Reuse this local Skill when it fits.",
          fallbackRequiredInputs: "Goal and constraints",
          fallbackOutputHint: "Continue in Generate",
          requiredPrefix: "Needs: ",
          outputPrefix: "Delivers: ",
        },
      }),
    ).toBe(
      "Reuse this local Skill when it fits. · Needs: Goal and constraints · Delivers: Continue in Generate",
    );
  });
});
