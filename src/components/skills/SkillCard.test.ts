/**
 * @file SkillCard.test.ts
 * @description Skill 来源分类逻辑的属性测试
 * @module components/skills/SkillCard.test
 *
 * **Feature: skills-platform-mvp, Property 4: Source Classification Logic**
 * **Validates: Requirements 5.1, 5.2**
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  SkillCard,
  canInspectSkill,
  canManageSkillInstallation,
  canViewLocalSkillContent,
  getInspectActionKey,
  getSkillSource,
  type SkillSource,
} from "./SkillCard";
import type { Skill } from "@/lib/api/skills";

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: RenderResult[] = [];

/**
 * 创建一个基础 Skill 对象的辅助函数
 */
function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    key: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    directory: "test-skill",
    installed: false,
    sourceKind: "other",
    ...overrides,
  };
}

function renderSkillCard(skill: Skill): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      createElement(SkillCard, {
        skill,
        onInstall: () => {},
        onUninstall: () => {},
        onViewContent: () => {},
        installing: false,
      }),
    );
  });

  const rendered = { container, root };
  mountedRoots.push(rendered);
  return rendered;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("en-US");
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  await changeLimeLocale("zh-CN");
});

describe("getSkillSource", () => {
  /**
   * Property 4: Source Classification Logic
   *
   * *For any* Skill object, the source classification SHALL return:
   * - "builtin" if sourceKind="builtin"
   * - "project" if catalogSource="project" and sourceKind!="builtin"
   * - "local" if catalogSource="user"
   * - "official" if repoOwner="lime" AND repoName="skills"
   * - "community" if repoOwner and repoName are present but not lime/skills
   * - "local" if repoOwner or repoName is missing
   *
   * **Validates: Requirements 5.1, 5.2**
   */
  describe("Property 4: Source Classification Logic", () => {
    // 生成有效的仓库所有者名（非 lime）
    const nonLimeOwnerArb = fc
      .stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/)
      .filter((s) => s !== "lime");

    // 生成有效的仓库名（非 skills）
    const nonSkillsNameArb = fc
      .stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/)
      .filter((s) => s !== "skills");

    // 生成任意有效的仓库名
    const repoNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/);

    test.prop([fc.constant("lime"), fc.constant("skills")], {
      numRuns: 100,
    })("官方仓库 (lime/skills) 应返回 'official'", (repoOwner, repoName) => {
      const skill = createSkill({
        catalogSource: "remote",
        repoOwner,
        repoName,
      });
      const source = getSkillSource(skill);
      expect(source).toBe("official" as SkillSource);
    });

    test.prop([nonLimeOwnerArb, repoNameArb], { numRuns: 100 })(
      "非 lime 所有者的仓库应返回 'community'",
      (repoOwner, repoName) => {
        const skill = createSkill({
          catalogSource: "remote",
          repoOwner,
          repoName,
        });
        const source = getSkillSource(skill);
        expect(source).toBe("community" as SkillSource);
      },
    );

    test.prop([fc.constant("lime"), nonSkillsNameArb], { numRuns: 100 })(
      "lime 所有者但非 skills 仓库应返回 'community'",
      (repoOwner, repoName) => {
        const skill = createSkill({
          catalogSource: "remote",
          repoOwner,
          repoName,
        });
        const source = getSkillSource(skill);
        expect(source).toBe("community" as SkillSource);
      },
    );

    test.prop([fc.constant(undefined), fc.option(repoNameArb)], {
      numRuns: 100,
    })("缺少 repoOwner 应返回 'local'", (repoOwner, repoName) => {
      const skill = createSkill({
        repoOwner,
        repoName: repoName ?? undefined,
      });
      const source = getSkillSource(skill);
      expect(source).toBe("local" as SkillSource);
    });

    test.prop([fc.option(repoNameArb), fc.constant(undefined)], {
      numRuns: 100,
    })("缺少 repoName 应返回 'local'", (repoOwner, repoName) => {
      const skill = createSkill({
        repoOwner: repoOwner ?? undefined,
        repoName,
      });
      const source = getSkillSource(skill);
      expect(source).toBe("local" as SkillSource);
    });

    test.prop([fc.constant(undefined), fc.constant(undefined)], {
      numRuns: 100,
    })(
      "同时缺少 repoOwner 和 repoName 应返回 'local'",
      (repoOwner, repoName) => {
        const skill = createSkill({ repoOwner, repoName });
        const source = getSkillSource(skill);
        expect(source).toBe("local" as SkillSource);
      },
    );

    it("项目级 skills 应返回 'project'", () => {
      const skill = createSkill({
        catalogSource: "project",
        repoOwner: undefined,
        repoName: undefined,
      });
      expect(getSkillSource(skill)).toBe("project" as SkillSource);
    });

    it("用户级 skills 应优先返回 'local'", () => {
      const skill = createSkill({
        catalogSource: "user",
        repoOwner: "lime",
        repoName: "skills",
      });
      expect(getSkillSource(skill)).toBe("local" as SkillSource);
    });

    // 综合属性测试：验证分类的完备性和互斥性
    test.prop([fc.option(repoNameArb), fc.option(repoNameArb)], {
      numRuns: 100,
    })(
      "分类结果必须是 official、community 或 local 之一",
      (repoOwner, repoName) => {
        const skill = createSkill({
          repoOwner: repoOwner ?? undefined,
          repoName: repoName ?? undefined,
        });
        const source = getSkillSource(skill);
        expect([
          "builtin",
          "project",
          "official",
          "community",
          "local",
        ]).toContain(source);
      },
    );
  });
});

describe("canViewLocalSkillContent", () => {
  it("内置且已安装 skill 应可查看内容", () => {
    const skill = createSkill({
      installed: true,
      sourceKind: "builtin",
      repoOwner: undefined,
      repoName: undefined,
    });
    expect(canViewLocalSkillContent(skill)).toBe(true);
  });

  it("本地且已安装 skill 应可查看内容", () => {
    const skill = createSkill({
      installed: true,
      sourceKind: "other",
      repoOwner: undefined,
      repoName: undefined,
    });
    expect(canViewLocalSkillContent(skill)).toBe(true);
  });

  it("项目级且可用 skill 应可查看内容", () => {
    const skill = createSkill({
      installed: true,
      sourceKind: "other",
      catalogSource: "project",
      repoOwner: undefined,
      repoName: undefined,
    });
    expect(canViewLocalSkillContent(skill)).toBe(true);
  });

  it("本地但未安装 skill 不可查看内容", () => {
    const skill = createSkill({
      installed: false,
      sourceKind: "other",
      repoOwner: undefined,
      repoName: undefined,
    });
    expect(canViewLocalSkillContent(skill)).toBe(false);
  });

  it("非本地已安装 skill 不可查看内容", () => {
    const skill = createSkill({
      installed: true,
      sourceKind: "other",
      repoOwner: "lime",
      repoName: "skills",
    });
    expect(canViewLocalSkillContent(skill)).toBe(false);
  });
});

describe("canManageSkillInstallation", () => {
  it("内置 skill 不应显示安装或卸载入口", () => {
    const skill = createSkill({ sourceKind: "builtin" });
    expect(canManageSkillInstallation(skill)).toBe(false);
  });

  it("其他 skill 应保留安装或卸载入口", () => {
    const skill = createSkill({ sourceKind: "other" });
    expect(canManageSkillInstallation(skill)).toBe(true);
  });

  it("项目级 skill 不应显示安装或卸载入口", () => {
    const skill = createSkill({
      sourceKind: "other",
      catalogSource: "project",
    });
    expect(canManageSkillInstallation(skill)).toBe(false);
  });
});

describe("canInspectSkill", () => {
  it("远程 skill 即使未安装也应支持安装前预检", () => {
    const skill = createSkill({
      installed: false,
      catalogSource: "remote",
      repoOwner: "lime",
      repoName: "skills",
      repoBranch: "main",
    });
    expect(canInspectSkill(skill)).toBe(true);
  });

  it("缺少仓库信息且未本地可用的 skill 不应支持预检", () => {
    const skill = createSkill({
      installed: false,
      repoOwner: undefined,
      repoName: undefined,
      repoBranch: undefined,
    });
    expect(canInspectSkill(skill)).toBe(false);
  });
});

describe("getInspectActionKey", () => {
  it("本地可用 skill 应显示查看内容", () => {
    const skill = createSkill({
      installed: true,
      repoOwner: undefined,
      repoName: undefined,
    });
    expect(getInspectActionKey(skill)).toBe(
      "skills.skillCard.action.viewContent",
    );
  });

  it("远程 skill 应显示检查详情", () => {
    const skill = createSkill({
      installed: false,
      catalogSource: "remote",
      repoOwner: "lime",
      repoName: "skills",
      repoBranch: "main",
    });
    expect(getInspectActionKey(skill)).toBe("skills.skillCard.action.inspect");
  });
});

describe("SkillCard", () => {
  it("standardCompliance 缺少兼容字段数组时不应崩溃", () => {
    const skill = createSkill({
      standardCompliance: {
        isStandard: true,
      } as Skill["standardCompliance"],
    });

    expect(() => renderSkillCard(skill)).not.toThrow();
    expect(document.body.textContent).toContain("Standard");
  });

  it("来源与标准徽标应保持浅色主题样式", () => {
    const { container } = renderSkillCard(
      createSkill({
        installed: true,
        sourceKind: "other",
        standardCompliance: {
          isStandard: true,
          deprecatedFields: [],
          validationErrors: [],
        },
      }),
    );

    const localBadge = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent?.trim() === "Local",
    );
    const standardBadge = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent?.includes("Standard"),
    );

    expect(localBadge?.className).toContain("bg-slate-100");
    expect(localBadge?.className).not.toContain("dark:bg-slate-800/50");
    expect(standardBadge?.className).toContain("bg-emerald-100");
    expect(standardBadge?.className).not.toContain("dark:bg-emerald-900/30");
  });

  it("应通过 agent namespace 渲染英文 Skill 卡片操作文案", () => {
    const { container } = renderSkillCard(
      createSkill({
        installed: true,
        description: "",
        sourceKind: "builtin",
        standardCompliance: {
          isStandard: true,
          deprecatedFields: [],
          validationErrors: [],
        },
      }),
    );

    const text = container.textContent ?? "";
    expect(text).toContain("No description yet");
    expect(text).toContain("Built-in");
    expect(text).toContain("Installed");
    expect(text).toContain("View content");
    expect(text).toContain("Standard");
    expect(text).not.toContain("暂无描述");
    expect(text).not.toContain("已安装");
    expect(text).not.toContain("Run");
    expect(text).not.toContain("执行");
  });
});

it("内置技能应优先返回 'builtin'", () => {
  const skill = createSkill({
    sourceKind: "builtin",
    catalogSource: "remote",
    repoOwner: "lime",
    repoName: "skills",
  });
  expect(getSkillSource(skill)).toBe("builtin" as SkillSource);
});
