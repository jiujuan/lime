import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SOUL_STYLE_PACK,
  BUILT_IN_SOUL_STYLE_PACK_ID,
  composeStyleDirectives,
  evaluateStyleBoundary,
  normalizeSoulStyleProfileId,
  resolveSoulStyleProfile,
} from ".";

describe("soul style profiles", () => {
  it("内置风格应收敛到一个 built-in Style Pack", () => {
    expect(BUILT_IN_SOUL_STYLE_PACK).toMatchObject({
      id: BUILT_IN_SOUL_STYLE_PACK_ID,
      source: "built_in",
      compatibility: { schemaVersion: 1 },
    });
    expect(BUILT_IN_SOUL_STYLE_PACK.profiles).toHaveLength(4);
    expect(
      BUILT_IN_SOUL_STYLE_PACK.profiles.every(
        (profile) => profile.packId === BUILT_IN_SOUL_STYLE_PACK_ID,
      ),
    ).toBe(true);
    expect(BUILT_IN_SOUL_STYLE_PACK.profiles.map((profile) => profile.id)).toEqual(
      [
        "cheeky_sassy_executor",
        "warm_supportive_companion",
        "cool_confident_operator",
        "calm_professional_partner",
      ],
    );
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
      packId: BUILT_IN_SOUL_STYLE_PACK_ID,
      tone: "warm_supportive",
      intensity: "medium",
      seriousModeFallback: "calm_professional_partner",
    });
    expect(directives?.promptLines.join("\n")).toContain("Forbidden moves:");
    expect(directives?.promptLines.join("\n")).toContain(
      `Style pack: ${BUILT_IN_SOUL_STYLE_PACK_ID}`,
    );
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
      packId: BUILT_IN_SOUL_STYLE_PACK_ID,
      tone: "cool_confident",
      intensity: "medium",
      seriousModeFallback: "calm_professional_partner",
    });
    expect(prompt).toContain("short sentences");
    expect(prompt).toContain("Do not command, intimidate");
    expect(prompt).toContain("Do not reduce useful detail");
  });
});
