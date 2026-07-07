import { describe, expect, it } from "vitest";
import {
  buildSoulArtifactVoiceGenerationBrief,
  buildSoulMarkdown,
  formatSoulListInput,
  hasSoulContent,
  normalizeSoulArtifactVoiceConfig,
  normalizeSoulConfig,
  parseSoulListInput,
  parseSoulMarkdown,
} from "./soulConfig";

describe("soulConfig", () => {
  it("应规范化 Soul 配置并去除空白与重复列表项", () => {
    const result = normalizeSoulConfig({
      enabled: true,
      summary: "  直接、少客套  ",
      style_profile_id: "warm_supportive_companion",
      style_intensity: "medium",
      communication_style: ["先给结论", "先给结论", "  "],
      avoid: ["不要空泛鼓励", "不要空泛鼓励"],
    });

    expect(result).toMatchObject({
      enabled: true,
      summary: "直接、少客套",
      style_profile_id: "warm_supportive_companion",
      style_intensity: "medium",
      communication_style: ["先给结论"],
      avoid: ["不要空泛鼓励"],
    });
    expect(hasSoulContent(result)).toBe(true);
  });

  it("应保留合法 registry 口吻 ID 并丢弃非法配置", () => {
    const result = normalizeSoulConfig({
      enabled: true,
      style_profile_id: "unknown_profile",
      style_intensity: "extreme" as never,
    });

    expect(result.style_profile_id).toBe("unknown_profile");
    expect(result.style_intensity).toBeUndefined();
    expect(hasSoulContent(result)).toBe(true);

    const invalid = normalizeSoulConfig({
      enabled: true,
      style_profile_id: "Not Stable",
    });

    expect(invalid.style_profile_id).toBeUndefined();
    expect(hasSoulContent(invalid)).toBe(false);
  });

  it("应把多行输入解析为稳定列表", () => {
    expect(parseSoulListInput("先给结论\n少客套，指出风险")).toEqual([
      "先给结论",
      "少客套",
      "指出风险",
    ]);
    expect(formatSoulListInput(["先给结论", "少客套"])).toBe(
      "先给结论\n少客套",
    );
  });

  it("应规范化正式产物创作声线配置", () => {
    expect(
      normalizeSoulArtifactVoiceConfig({
        enabled: true,
        voice_source: "brand_voice",
        creator_voice_id: " creator-should-not-leak ",
        brand_voice_id: " brand-1 ",
        evidence_pack_id: " pack-1 ",
        evidence_refs: [" memory:voice-1 ", "", "memory:voice-1"],
      }),
    ).toEqual({
      enabled: true,
      voice_source: "brand_voice",
      creator_voice_id: undefined,
      brand_voice_id: "brand-1",
      evidence_pack_id: "pack-1",
      evidence_refs: ["memory:voice-1"],
    });
  });

  it("缺少正式产物声线来源时不应保留孤儿声线 ID", () => {
    expect(
      normalizeSoulArtifactVoiceConfig({
        enabled: true,
        creator_voice_id: "creator-voice-1",
        brand_voice_id: "brand-voice-1",
      }),
    ).toEqual({
      enabled: true,
      voice_source: undefined,
      creator_voice_id: undefined,
      brand_voice_id: undefined,
      evidence_pack_id: undefined,
      evidence_refs: [],
    });
  });

  it("只有显式开启的创作声线才进入 Generation Brief", () => {
    expect(
      buildSoulArtifactVoiceGenerationBrief({
        enabled: true,
        summary: "直接务实",
        artifact_voice: {
          enabled: false,
          voice_source: "brand_voice",
          brand_voice_id: "brand-1",
        },
      }),
    ).toBeUndefined();

    expect(
      buildSoulArtifactVoiceGenerationBrief({
        enabled: true,
        artifact_voice: {
          enabled: true,
          voice_source: "brand_voice",
          creator_voice_id: "creator-should-not-leak",
          brand_voice_id: "brand-1",
          evidence_pack_id: "pack-1",
          evidence_refs: ["memory:voice-1"],
        },
      }),
    ).toEqual({
      voice_source: "brand_voice",
      voice_guard: "user_explicit",
      global_soul_scope: "interaction_only",
      expert_persona_scope: "current_expert_session",
      formal_artifact_voice_source: "generation_brief_only",
      inherits_global_soul: false,
      inherits_expert_persona: false,
      evidence_source: "memory.soul.artifact_voice",
      brand_voice_id: "brand-1",
      evidence_pack_id: "pack-1",
      evidence_refs: ["memory:voice-1"],
    });
  });

  it("默认 Soul 配置不应共享正式声线引用数组", () => {
    const first = normalizeSoulConfig();
    const second = normalizeSoulConfig();

    first.artifact_voice?.evidence_refs?.push("memory:voice-1");

    expect(second.artifact_voice?.evidence_refs).toEqual([]);
  });

  it("应从 SOUL.md 文本生成导入草稿并提示项目规则风险", () => {
    const result = parseSoulMarkdown(
      `# Engineering Soul

- 风格：直接、务实
- 避免空泛鼓励
- npm run verify:local
- /Users/coso/project
`,
      new Date("2026-06-02T00:00:00.000Z"),
    );

    expect(result.canImport).toBe(true);
    expect(result.draft).toMatchObject({
      enabled: true,
      imported_from: "soul_md",
      name: "Engineering Soul",
      communication_style: expect.arrayContaining(["风格：直接、务实"]),
      avoid: expect.arrayContaining(["避免空泛鼓励"]),
      updated_at: "2026-06-02T00:00:00.000Z",
    });
    expect(result.warnings).toEqual(["project_rules", "local_path"]);
    expect(result.preview).toContain("# SOUL.md");
  });

  it("空 SOUL.md 不应覆盖现有配置", () => {
    const result = parseSoulMarkdown("   ");
    expect(result.canImport).toBe(false);
    expect(result.warnings).toEqual(["empty"]);
    expect(hasSoulContent(result.draft)).toBe(false);
  });

  it("导出 Markdown 不应包含运行时诊断或本机路径", () => {
    const markdown = buildSoulMarkdown({
      enabled: true,
      summary: "先给结论，再补关键证据",
      style_profile_id: "calm_professional_partner",
      style_intensity: "low",
      communication_style: ["直接指出弱假设"],
      avoid: ["不要编造能力"],
      artifact_voice: {
        enabled: true,
        voice_source: "brand_voice",
        creator_voice_id: "creator-should-not-leak",
        brand_voice_id: "brand-1",
        evidence_pack_id: "pack-1",
      },
    });

    expect(markdown).toContain("## Communication Style");
    expect(markdown).toContain("## Interaction Style Profile");
    expect(markdown).toContain("Style profile: calm_professional_partner");
    expect(markdown).toContain("Style intensity: low");
    expect(markdown).toContain("## Creator / Brand Voice");
    expect(markdown).toContain("Brand voice ID: brand-1");
    expect(markdown).toContain("先给结论，再补关键证据");
    expect(markdown).not.toContain("creator-should-not-leak");
    expect(markdown).not.toMatch(/\/Users\/|runtime_turn|prompt composer/u);
  });
});
