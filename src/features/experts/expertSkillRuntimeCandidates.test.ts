import { describe, expect, it } from "vitest";
import type { SkillCatalog } from "@/lib/api/skillCatalog";
import type { Skill } from "@/lib/api/skills";
import { buildExpertSkillRuntimeCandidates } from "./expertSkillRuntimeCandidates";

const TEST_CATALOG: SkillCatalog = {
  version: "test",
  tenantId: "local",
  syncedAt: "2026-06-21T00:00:00.000Z",
  items: [],
  entries: [
    {
      id: "skill:code-review",
      kind: "skill",
      title: "代码审查",
      summary: "审查代码风险和可维护性。",
      skillId: "code-review",
      groupKey: "engineering",
      execution: {
        kind: "agent_turn",
      },
      skillLocator: {
        source: "catalog",
        name: "code-review",
      },
    },
  ],
  groups: [],
};

const LOCAL_SKILL: Skill = {
  key: "docx",
  name: "docx",
  description: "读取 Word 文档。",
  directory: "docx",
  installed: true,
  sourceKind: "builtin",
  catalogSource: "user",
};

describe("buildExpertSkillRuntimeCandidates", () => {
  it("把专家 skill:* ref 解析成带 skillLocator 的 catalog candidate", () => {
    const [candidate] = buildExpertSkillRuntimeCandidates(
      ["skill:code-review"],
      { catalog: TEST_CATALOG },
    );

    expect(candidate).toMatchObject({
      ref: "skill:code-review",
      kind: "catalog_skill",
      readiness: "ready",
      displayTitle: "代码审查",
      source: "expert_skill_ref",
      riskLevel: "low",
      skillLocator: {
        source: "catalog",
        name: "code-review",
      },
    });
    expect(candidate?.reason).toContain("SkillCatalog");
  });

  it("保留 service-skill ref 为需映射候选，不直接授权执行", () => {
    const [candidate] = buildExpertSkillRuntimeCandidates([
      "service-skill:daily-trend-briefing",
    ]);

    expect(candidate).toMatchObject({
      ref: "service-skill:daily-trend-briefing",
      kind: "service_skill",
      readiness: "needs_mapping",
      riskLevel: "medium",
      skillLocator: {
        source: "catalog",
        name: "daily-trend-briefing",
      },
    });
    expect(candidate?.reason).toContain("service_scene_launch");
  });

  it("把已安装本地 skill:* ref 解析成可运行候选", () => {
    const [candidate] = buildExpertSkillRuntimeCandidates(["skill:docx"], {
      localSkills: [LOCAL_SKILL],
    });

    expect(candidate).toMatchObject({
      ref: "skill:docx",
      kind: "catalog_skill",
      readiness: "ready",
      displayTitle: "docx",
      riskLevel: "low",
      skillLocator: {
        source: "user",
        name: "docx",
        directory: "docx",
      },
    });
    expect(candidate?.reason).toContain("local Skill");
  });

  it("把 workspace_skill ref 标为需要 ready binding", () => {
    const [candidate] = buildExpertSkillRuntimeCandidates([
      "workspace_skill:capability-report",
    ]);

    expect(candidate).toMatchObject({
      ref: "workspace_skill:capability-report",
      kind: "workspace_skill",
      readiness: "needs_registration",
      skillLocator: {
        source: "project",
        name: "project:capability-report",
        directory: "capability-report",
      },
    });
    expect(candidate?.reason).toContain("workspaceSkillBindings/list");
  });

  it("支持 skill URI，并去重大小写等价 ref", () => {
    const candidates = buildExpertSkillRuntimeCandidates([
      "skill://project/capability-report/SKILL.md",
      "skill://project/capability-report/SKILL.md",
      "SKILL:CODE-REVIEW",
    ]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      kind: "skill_uri",
      readiness: "ready",
      skillLocator: {
        source: "other",
        name: "capability-report",
        directory: "capability-report",
        skillFilePath: "skill://project/capability-report/SKILL.md",
      },
    });
    expect(candidates[1]).toMatchObject({
      kind: "unknown",
      readiness: "blocked",
    });
  });

  it("未知 ref fail-closed 为 blocked", () => {
    const [candidate] = buildExpertSkillRuntimeCandidates(["docx"]);

    expect(candidate).toMatchObject({
      ref: "docx",
      kind: "unknown",
      readiness: "blocked",
      reason: "unsupported expert skill ref format",
    });
  });
});
