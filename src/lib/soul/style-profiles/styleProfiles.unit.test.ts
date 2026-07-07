import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOUL_STYLE_PROFILE_REGISTRY,
  composeStyleDirectives,
  createSoulStyleProfileRegistry,
  evaluateStyleBoundary,
  normalizeSoulStyleProfileId,
  resolveSoulStyleProfile,
} from ".";
import type {
  SoulStyleProfile,
  SoulStyleProfileId,
  SoulStyleSurfaceContract,
} from "./types";

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
const builtInPacks = DEFAULT_SOUL_STYLE_PROFILE_REGISTRY.packs.filter(
  (pack) => pack.source === "built_in",
);
const builtInProfiles = DEFAULT_SOUL_STYLE_PROFILE_REGISTRY.profiles;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const productionStyleSurfaceRoots = [
  join(repoRoot, "src/components"),
  join(repoRoot, "src/lib"),
];
const allowedStyleProfileFactSourcePrefixes = [
  "src/lib/soul/style-profiles/",
];
const productionSourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const forbiddenBuiltInProfileIdPattern =
  /\b(cheeky_sassy_executor|warm_supportive_companion|cool_confident_operator|calm_professional_partner)\b/u;
const forbiddenProfileSwitchPattern =
  /switch\s*\(\s*(profileId|styleProfileId|profile\.id|resolved\.profile\.id)\s*\)/u;

function requireBuiltInProfile(profileId: SoulStyleProfileId): SoulStyleProfile {
  const profile = DEFAULT_SOUL_STYLE_PROFILE_REGISTRY.findProfile(profileId);
  if (!profile) {
    throw new Error(`Missing built-in Soul style profile: ${profileId}`);
  }
  return profile;
}

function requireBuiltInPackId(profileId: SoulStyleProfileId): string {
  return requireBuiltInProfile(profileId).packId;
}

function isAllowedStyleProfileFactSource(filePath: string): boolean {
  const relativePath = relative(repoRoot, filePath).replaceAll("\\", "/");
  return allowedStyleProfileFactSourcePrefixes.some((prefix) =>
    relativePath.startsWith(prefix),
  );
}

function shouldScanProductionSourceFile(filePath: string): boolean {
  if (!productionSourceExtensions.has(extname(filePath))) {
    return false;
  }
  if (isAllowedStyleProfileFactSource(filePath)) {
    return false;
  }
  return !/\.(test|unit\.test)\.[tj]sx?$/u.test(filePath);
}

function collectProductionStyleSurfaceFiles(root: string): string[] {
  const stat = statSync(root);
  if (stat.isFile()) {
    return shouldScanProductionSourceFile(root) ? [root] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  return readdirSync(root).flatMap((entry) =>
    collectProductionStyleSurfaceFiles(join(root, entry)),
  );
}

describe("soul style profiles", () => {
  it("内置风格应注册为四个独立 built-in Style Pack seed", () => {
    expect(builtInPacks).toHaveLength(4);
    expect(builtInProfiles.map((profile) => profile.id)).toEqual([
      "cheeky_sassy_executor",
      "warm_supportive_companion",
      "cool_confident_operator",
      "calm_professional_partner",
    ]);
    expect(builtInProfiles.map((profile) => profile.packId)).toEqual([
      "com.lime.soul.cheeky-sassy-executor",
      "com.lime.soul.warm-supportive-companion",
      "com.lime.soul.cool-confident-operator",
      "com.lime.soul.calm-professional-partner",
    ]);
    expect(new Set(builtInProfiles.map((profile) => profile.packId)).size).toBe(
      4,
    );
    expect(
      builtInPacks.every(
        (pack) =>
          pack.source === "built_in" &&
          pack.compatibility.schemaVersion === 1 &&
          pack.profiles.length === 1 &&
          pack.profiles[0]?.packId === pack.id,
      ),
    ).toBe(true);
    expect(
      builtInProfiles.every(
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
      "sassy_cute_executor",
    );
    expect(normalizeSoulStyleProfileId("custom.pack:v1")).toBe(
      "custom.pack:v1",
    );
    expect(normalizeSoulStyleProfileId("Not Stable")).toBeUndefined();

    const resolved = resolveSoulStyleProfile();
    expect(resolved.profile.id).toBe("cheeky_sassy_executor");
    expect(resolved.intensity).toBe("low");
    expect(resolved.reason).toBe("default");
  });

  it("未加载的合法 profile id 不再 alias 到四个 built-in", () => {
    const resolved = resolveSoulStyleProfile({
      styleProfileId: "sassy_cute_executor",
    });

    expect(resolved.requestedProfileId).toBe("sassy_cute_executor");
    expect(resolved.profile.id).toBe("cheeky_sassy_executor");
    expect(resolved.profile.id).not.toBe("sassy_cute_executor");
  });

  it("registry 应合并已安装风格包并让 resolver 消费同一 profile", () => {
    const installedManifest = {
      ...builtInPacks[0],
      id: "com.example.soul.local-sassy",
      source: "local_import",
      integrity: {
        digest: "sha256-local-sassy",
      },
      profiles: [
        {
          ...builtInProfiles[0],
          id: "local_sassy_executor",
          packId: "com.example.soul.local-sassy",
          nameKey: "settings.memory.soul.styleProfile.localSassy.title",
          descriptionKey:
            "settings.memory.soul.styleProfile.localSassy.description",
        },
      ],
    };
    const registry = createSoulStyleProfileRegistry({
      installedPackManifests: [installedManifest],
    });

    expect(registry.packs.map((pack) => pack.id)).toContain(
      "com.example.soul.local-sassy",
    );
    expect(registry.findProfile("local_sassy_executor")?.packId).toBe(
      "com.example.soul.local-sassy",
    );

    const resolved = resolveSoulStyleProfile(
      { styleProfileId: "local_sassy_executor" },
      registry,
    );
    expect(resolved.profile.id).toBe("local_sassy_executor");
    expect(resolved.profile.packId).toBe("com.example.soul.local-sassy");

    const directives = composeStyleDirectives(
      { styleProfileId: "local_sassy_executor" },
      registry,
    );
    expect(directives?.profileId).toBe("local_sassy_executor");
    expect(directives?.packId).toBe("com.example.soul.local-sassy");
  });

  it("registry 应拒绝缺少完整性信息的 installed pack", () => {
    const installedManifest = {
      ...builtInPacks[0],
      id: "com.example.soul.unsigned",
      source: "cloud_download",
      profiles: [
        {
          ...builtInProfiles[0],
          id: "unsigned_executor",
          packId: "com.example.soul.unsigned",
        },
      ],
    };

    expect(() =>
      createSoulStyleProfileRegistry({
        installedPackManifests: [installedManifest],
      }),
    ).toThrow(/integrity/u);
  });

  it("生产组件不得按 built-in profile id 分支生成展示文案", () => {
    const offenders = productionStyleSurfaceRoots.flatMap((root) =>
      collectProductionStyleSurfaceFiles(root).flatMap((filePath) => {
        const source = readFileSync(filePath, "utf8");
        if (
          !forbiddenBuiltInProfileIdPattern.test(source) &&
          !forbiddenProfileSwitchPattern.test(source)
        ) {
          return [];
        }
        return [relative(repoRoot, filePath).replaceAll("\\", "/")];
      }),
    );

    expect(offenders).toEqual([]);
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
      packId: requireBuiltInPackId("warm_supportive_companion"),
      tone: "warm_supportive",
      intensity: "medium",
      seriousModeFallback: "calm_professional_partner",
    });
    expect(directives?.promptLines.join("\n")).toContain("Forbidden moves:");
    expect(directives?.promptLines.join("\n")).toContain("Response contract:");
    expect(directives?.promptLines.join("\n")).toContain(
      `Style pack: ${requireBuiltInPackId("warm_supportive_companion")}`,
    );
    expect(directives?.promptLines.join("\n")).toContain("Surface contracts:");
    expect(directives?.promptLines.join("\n")).toContain(
      "Anti-repetition rules:",
    );
    expect(directives?.promptLines.join("\n")).toContain("Few-shot anchors:");
  });

  it("四种风格应覆盖同一 transcript surface contract", () => {
    for (const profile of builtInProfiles) {
      for (const surface of TRANSCRIPT_STYLE_SURFACES) {
        expect(
          profile.surfaceContracts[surface],
          `${profile.id} missing ${surface}`,
        ).toEqual(expect.arrayContaining([expect.any(String)]));
      }
      expect(profile.scopes).toContain("tool_narrative");
      expect(profile.riskFallback.profileId).toBe("calm_professional_partner");
    }

    const lifecycleContractsByProfile = builtInProfiles.map(
      (profile) =>
        TRANSCRIPT_STYLE_SURFACES.map((surface) =>
          profile.surfaceContracts[surface]?.join(" "),
        ).join("\n"),
    );
    expect(new Set(lifecycleContractsByProfile).size).toBe(
      builtInProfiles.length,
    );
  });

  it("few-shot anchors 应覆盖工具失败、正文细节和结尾建议且四种风格不同", () => {
    for (const profile of builtInProfiles) {
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
      const examples = builtInProfiles.map(
        (profile) =>
          profile.fewShotAnchors.find((anchor) => anchor.surface === surface)
            ?.example,
      );
      expect(new Set(examples).size, `${surface} examples collapsed`).toBe(
        builtInProfiles.length,
      );
    }
  });

  it("prompt directives 应写入完整工具生命周期合同而不是只含 profile id", () => {
    for (const profile of builtInProfiles) {
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
      packId: requireBuiltInPackId("cool_confident_operator"),
      tone: "cool_confident",
      intensity: "medium",
      seriousModeFallback: "calm_professional_partner",
    });
    expect(prompt).toContain("short sentences");
    expect(prompt).toContain("Do not command, intimidate");
    expect(prompt).toContain("Do not reduce useful detail");
  });
});
