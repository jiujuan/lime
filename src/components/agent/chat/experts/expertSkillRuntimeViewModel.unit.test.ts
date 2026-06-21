import { describe, expect, it } from "vitest";
import { buildExpertSkillRuntimeChipViewModels } from "./expertSkillRuntimeViewModel";

const COPY = {
  ready: "可运行",
  needsMapping: "待映射",
  needsRegistration: "待注册",
  blocked: "不可用",
};

describe("buildExpertSkillRuntimeChipViewModels", () => {
  it("应把 runtime candidate readiness 投影成稳定 chip 状态", () => {
    const chips = buildExpertSkillRuntimeChipViewModels({
      skillRefs: ["skill:docx", "service-skill:daily-trend-briefing", "legacy"],
      candidates: [
        {
          ref: "skill:docx",
          kind: "catalog_skill",
          readiness: "ready",
          reason: "matched",
          displayTitle: "docx",
          source: "expert_skill_ref",
          riskLevel: "low",
          skillLocator: {
            source: "user",
            name: "docx",
            directory: "docx",
          },
        },
        {
          ref: "service-skill:daily-trend-briefing",
          kind: "service_skill",
          readiness: "needs_mapping",
          reason: "needs scene mapping",
          displayTitle: "daily-trend-briefing",
          source: "expert_skill_ref",
          riskLevel: "medium",
        },
      ],
      resolveLabel: (ref) => ref,
      copy: COPY,
    });

    expect(chips).toEqual([
      expect.objectContaining({
        ref: "skill:docx",
        readiness: "ready",
        readinessLabel: "可运行",
        readinessTone: "ready",
        title: "skill:docx · 可运行",
      }),
      expect.objectContaining({
        ref: "service-skill:daily-trend-briefing",
        readiness: "needs_mapping",
        readinessLabel: "待映射",
        readinessTone: "warning",
      }),
      expect.objectContaining({
        ref: "legacy",
        label: "legacy",
        readiness: "blocked",
        readinessLabel: "不可用",
        readinessTone: "blocked",
      }),
    ]);
  });
});
