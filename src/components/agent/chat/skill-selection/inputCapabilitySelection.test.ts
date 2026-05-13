import { describe, expect, it } from "vitest";
import type { Skill } from "@/lib/api/skills";
import {
  resolveInputCapabilitySelectionFromRoute,
  resolveInputCapabilitySendRoute,
} from "./inputCapabilitySelection";

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    key: "local:brand-product-knowledge-builder",
    name: "产品知识库",
    description: "沉淀品牌与产品资料",
    directory: "brand-product-knowledge-builder",
    installed: true,
    sourceKind: "other",
    ...overrides,
  };
}

describe("inputCapabilitySelection", () => {
  it("本地已安装 Skill 发送时应使用目录名作为 slash 执行 key", () => {
    const route = resolveInputCapabilitySendRoute({
      kind: "installed_skill",
      skill: createSkill(),
    });

    expect(route).toEqual({
      kind: "installed_skill",
      skillKey: "brand-product-knowledge-builder",
      skillName: "产品知识库",
    });
  });

  it("从 Skills 页带回 local:* 路由时仍应匹配已安装 Skill", () => {
    const skill = createSkill();

    const selection = resolveInputCapabilitySelectionFromRoute({
      route: {
        kind: "installed_skill",
        skillKey: "local:brand-product-knowledge-builder",
        skillName: "产品知识库",
      },
      skills: [skill],
    });

    expect(selection).toEqual({
      kind: "installed_skill",
      skill,
    });
  });

  it("没有目录名时应剥离 local: 前缀，避免生成 /local:* 命令", () => {
    const route = resolveInputCapabilitySendRoute({
      kind: "installed_skill",
      skill: createSkill({
        key: "local:writer",
        name: "写作助手",
        directory: "",
      }),
    });

    expect(route).toMatchObject({
      kind: "installed_skill",
      skillKey: "writer",
      skillName: "写作助手",
    });
  });
});
