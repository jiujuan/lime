import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SOUL_STYLE_PACK_IDS,
  BUILT_IN_SOUL_STYLE_PACKS,
  BUILT_IN_SOUL_STYLE_PROFILES,
  composeStyleDirectives,
  evaluateStyleBoundary,
  normalizeSoulStyleProfileId,
  resolveSoulStyleProfile,
} from ".";
import type { SoulStyleSurfaceContract } from "./types";

const TOOL_LIFECYCLE_SURFACES: readonly SoulStyleSurfaceContract[] = [
  "before_tool",
  "tool_running",
  "after_tool_success",
  "after_tool_partial_failure",
  "after_tool_failure",
  "body_detail",
];
const TRANSCRIPT_STYLE_SURFACES: readonly SoulStyleSurfaceContract[] = [
  ...TOOL_LIFECYCLE_SURFACES,
  "closing_suggestion",
];

describe("soul style profiles", () => {
  it("内置风格应注册为四个独立 built-in Style Pack seed", () => {
    expect(BUILT_IN_SOUL_STYLE_PACKS).toHaveLength(4);
    expect(BUILT_IN_SOUL_STYLE_PROFILES.map((profile) => profile.id)).toEqual([
      "cheeky_sassy_executor",
      "warm_supportive_companion",
      "cool_confident_operator",
      "calm_professional_partner",
    ]);
    expect(
      BUILT_IN_SOUL_STYLE_PROFILES.map((profile) => profile.packId),
    ).toEqual([
      "com.lime.soul.cheeky-sassy-executor",
      "com.lime.soul.warm-supportive-companion",
      "com.lime.soul.cool-confident-operator",
      "com.lime.soul.calm-professional-partner",
    ]);
    expect(
      new Set(BUILT_IN_SOUL_STYLE_PROFILES.map((profile) => profile.packId))
        .size,
    ).toBe(4);
    expect(
      BUILT_IN_SOUL_STYLE_PACKS.every(
        (pack) =>
          pack.source === "built_in" &&
          pack.compatibility.schemaVersion === 1 &&
          pack.profiles.length === 1 &&
          pack.profiles[0]?.packId === pack.id,
      ),
    ).toBe(true);
    expect(
      BUILT_IN_SOUL_STYLE_PROFILES.every(
        (profile) =>
          profile.responseContract.length > 0 &&
          profile.voicePrimitives.length > 0 &&
          Object.keys(profile.surfaceContracts).length > 0 &&
          profile.antiRepetitionRules.length > 0 &&
          profile.fewShotAnchors.length > 0 &&
          profile.riskFallback.profileId === "calm_professional_partner",
      ),
    ).toBe(true);
  });

  it("应规范化 profile id 并默认使用贱兮兮执行官", () => {
    expect(normalizeSoulStyleProfileId("warm_supportive_companion")).toBe(
      "warm_supportive_companion",
    );
    expect(normalizeSoulStyleProfileId("cool_confident_operator")).toBe(
      "cool_confident_operator",
    );
    expect(normalizeSoulStyleProfileId("sassy_cute_executor")).toBe(
      "cheeky_sassy_executor",
    );
    expect(normalizeSoulStyleProfileId("unknown")).toBeUndefined();

    const resolved = resolveSoulStyleProfile();
    expect(resolved.profile.id).toBe("cheeky_sassy_executor");
    expect(resolved.intensity).toBe("low");
    expect(resolved.reason).toBe("default");
  });

  it("高风险和危险操作应降级到冷静专业型", () => {
    const resolved = resolveSoulStyleProfile({
      styleProfileId: "cheeky_sassy_executor",
      highRisk: true,
    });

    expect(resolved.profile.id).toBe("calm_professional_partner");
    expect(resolved.reason).toBe("serious_mode_fallback");
  });

  it("正式 artifact 正文应旁路交互口吻", () => {
    expect(evaluateStyleBoundary({ formalArtifact: true })).toEqual({
      bypassInteractionStyle: true,
      reason: "formal_artifact_bypass",
    });
    expect(composeStyleDirectives({ formalArtifact: true })).toBeNull();
  });

  it("应把 profile 组合为稳定 prompt directives", () => {
    const directives = composeStyleDirectives({
      styleProfileId: "warm_supportive_companion",
      styleIntensity: "medium",
    });

    expect(directives).toMatchObject({
      profileId: "warm_supportive_companion",
      packId: BUILT_IN_SOUL_STYLE_PACK_IDS.warm_supportive_companion,
      tone: "warm_supportive",
      intensity: "medium",
      seriousModeFallback: "calm_professional_partner",
    });
    expect(directives?.promptLines.join("\n")).toContain("Forbidden moves:");
    expect(directives?.promptLines.join("\n")).toContain("Response contract:");
    expect(directives?.promptLines.join("\n")).toContain(
      `Style pack: ${BUILT_IN_SOUL_STYLE_PACK_IDS.warm_supportive_companion}`,
    );
    expect(directives?.promptLines.join("\n")).toContain("Surface contracts:");
    expect(directives?.promptLines.join("\n")).toContain(
      "Anti-repetition rules:",
    );
    expect(directives?.promptLines.join("\n")).toContain("Few-shot anchors:");
  });

  it("四种风格应覆盖同一 transcript surface contract", () => {
    for (const profile of BUILT_IN_SOUL_STYLE_PROFILES) {
      for (const surface of TRANSCRIPT_STYLE_SURFACES) {
        expect(
          profile.surfaceContracts[surface],
          `${profile.id} missing ${surface}`,
        ).toEqual(expect.arrayContaining([expect.any(String)]));
      }
      expect(profile.scopes).toContain("tool_narrative");
      expect(profile.riskFallback.profileId).toBe("calm_professional_partner");
    }

    const lifecycleContractsByProfile = BUILT_IN_SOUL_STYLE_PROFILES.map(
      (profile) =>
        TRANSCRIPT_STYLE_SURFACES.map((surface) =>
          profile.surfaceContracts[surface]?.join(" "),
        ).join("\n"),
    );
    expect(new Set(lifecycleContractsByProfile).size).toBe(
      BUILT_IN_SOUL_STYLE_PROFILES.length,
    );
  });

  it("few-shot anchors 应覆盖工具失败、正文细节和结尾建议且四种风格不同", () => {
    for (const profile of BUILT_IN_SOUL_STYLE_PROFILES) {
      const surfaces = new Set(
        profile.fewShotAnchors.map((anchor) => anchor.surface),
      );
      for (const surface of TRANSCRIPT_STYLE_SURFACES) {
        expect(surfaces.has(surface), `${profile.id} missing ${surface}`).toBe(
          true,
        );
      }
    }

    for (const surface of TRANSCRIPT_STYLE_SURFACES) {
      const examples = BUILT_IN_SOUL_STYLE_PROFILES.map(
        (profile) =>
          profile.fewShotAnchors.find((anchor) => anchor.surface === surface)
            ?.example,
      );
      expect(new Set(examples).size, `${surface} examples collapsed`).toBe(
        BUILT_IN_SOUL_STYLE_PROFILES.length,
      );
    }
  });

  it("prompt directives 应写入完整工具生命周期合同而不是只含 profile id", () => {
    for (const profile of BUILT_IN_SOUL_STYLE_PROFILES) {
      const directives = composeStyleDirectives({
        styleProfileId: profile.id,
        styleIntensity: "high",
      });
      const prompt = directives?.promptLines.join("\n") ?? "";

      expect(prompt).toContain(`Style profile: ${profile.id}`);
      expect(prompt).toContain(`Style pack: ${profile.packId}`);
      for (const surface of TRANSCRIPT_STYLE_SURFACES) {
        expect(prompt).toContain(`${surface}:`);
        expect(prompt).toContain(`${surface} /`);
      }
      expect(prompt).toContain("Anti-repetition rules:");
      expect(prompt).toContain("Risk fallback:");
    }
  });

  it("贱兮兮风格不能退回固定口头禅或每轮强制 cue", () => {
    const directives = composeStyleDirectives({
      styleProfileId: "cheeky_sassy_executor",
      styleIntensity: "low",
    });
    const prompt = directives?.promptLines.join("\n") ?? "";

    expect(prompt).toContain("instead of a fixed prefix");
    expect(prompt).toContain(
      "Do not force a visible style cue into every reply",
    );
    expect(prompt).toContain("Do not repeat catchphrases");
    expect(prompt).not.toContain("Every normal chat reply must show");
  });

  it("拽酷风格应保持短句推进但禁止轻蔑和装腔", () => {
    const directives = composeStyleDirectives({
      styleProfileId: "cool_confident_operator",
      styleIntensity: "medium",
    });
    const prompt = directives?.promptLines.join("\n") ?? "";

    expect(directives).toMatchObject({
      profileId: "cool_confident_operator",
      packId: BUILT_IN_SOUL_STYLE_PACK_IDS.cool_confident_operator,
      tone: "cool_confident",
      intensity: "medium",
      seriousModeFallback: "calm_professional_partner",
    });
    expect(prompt).toContain("short sentences");
    expect(prompt).toContain("Do not command, intimidate");
    expect(prompt).toContain("Do not reduce useful detail");
  });
});
