import { describe, expect, it } from "vitest";

import {
  buildGenerationBriefMetadata,
  mergeGenerationBriefIntoArtifactMetadata,
  mergeRequestMetadataWithArtifact,
  mergeSoulArtifactVoiceDiagnostics,
} from "./artifactGenerationBriefMetadata";

describe("artifactGenerationBriefMetadata", () => {
  it("默认不生成 Creator / Brand Voice metadata", () => {
    expect(buildGenerationBriefMetadata()).toBeUndefined();
    expect(buildGenerationBriefMetadata(null)).toBeUndefined();
    expect(buildGenerationBriefMetadata({})).toBeUndefined();
  });

  it("应把显式 voice metadata 归一为 snake_case 并保留 evidence", () => {
    const metadata = buildGenerationBriefMetadata({
      voiceSource: " brand_voice ",
      voiceGuard: " user_explicit ",
      formalArtifactVoiceSource: " generation_brief_only ",
      inheritsGlobalSoul: false,
      inheritsExpertPersona: false,
      evidencePackId: " voice-pack-1 ",
      evidenceRefs: [" memory:voice-1 ", "", "knowledge:brand-1"],
      diagnostic_note: "用户显式选择品牌声线",
    });

    expect(metadata).toEqual({
      voice_source: "brand_voice",
      voice_guard: "user_explicit",
      formal_artifact_voice_source: "generation_brief_only",
      inherits_global_soul: false,
      inherits_expert_persona: false,
      evidence_pack_id: "voice-pack-1",
      evidence_refs: ["memory:voice-1", "knowledge:brand-1"],
      diagnostic_note: "用户显式选择品牌声线",
    });
    expect(metadata).not.toHaveProperty("voiceSource");
    expect(metadata).not.toHaveProperty("formalArtifactVoiceSource");
    expect(metadata).not.toHaveProperty("evidencePackId");
  });

  it("应深合并 artifact metadata，避免 sendOptions 覆盖 workspace base", () => {
    expect(
      mergeRequestMetadataWithArtifact(
        {
          trace_id: "trace-1",
          artifact: {
            artifact_mode: "draft",
            artifact_kind: "analysis",
          },
        },
        {
          request_id: "request-1",
          artifact: {
            workbench_surface: "right_panel",
          },
        },
      ),
    ).toEqual({
      trace_id: "trace-1",
      request_id: "request-1",
      artifact: {
        artifact_mode: "draft",
        artifact_kind: "analysis",
        workbench_surface: "right_panel",
      },
    });
  });

  it("sendOptions 中的 generation brief alias 应覆盖 workspace base", () => {
    expect(
      mergeRequestMetadataWithArtifact(
        {
          generation_brief: {
            voice_source: "none",
            evidence_pack_id: "base-pack",
          },
          artifact: {
            artifact_mode: "draft",
            generation_brief: {
              voice_source: "creator_voice",
            },
          },
        },
        {
          generationBrief: {
            voiceSource: "brand_voice",
            evidencePackId: "overlay-pack",
          },
        },
      ),
    ).toEqual({
      artifact: {
        artifact_mode: "draft",
        generation_brief: {
          voice_source: "brand_voice",
          evidence_pack_id: "overlay-pack",
        },
      },
    });
  });

  it("切换 voice_source 时应清理不匹配的个人或品牌声线 ID", () => {
    expect(
      mergeRequestMetadataWithArtifact(
        {
          generation_brief: {
            voice_source: "brand_voice",
            brand_voice_id: "saved-brand",
          },
        },
        {
          generationBrief: {
            voiceSource: "creator_voice",
            creatorVoiceId: "turn-creator",
          },
        },
      ),
    ).toEqual({
      artifact: {
        generation_brief: {
          voice_source: "creator_voice",
          creator_voice_id: "turn-creator",
        },
      },
    });
  });

  it("未知或缺失 voice_source 时不应保留孤儿声线 ID", () => {
    expect(
      buildGenerationBriefMetadata({
        voiceSource: "legacy_voice",
        creatorVoiceId: "creator-voice-1",
        brandVoiceId: "brand-voice-1",
      }),
    ).toEqual({
      voice_source: "none",
    });

    expect(
      buildGenerationBriefMetadata({
        creatorVoiceId: "creator-voice-1",
      }),
    ).toBeUndefined();
  });

  it("只携带 generation_brief 时不应创建 artifact delivery 合同字段", () => {
    const metadata = mergeGenerationBriefIntoArtifactMetadata({
      artifact: {
        generationBrief: {
          voiceSource: "brand_voice",
          evidencePackId: "voice-pack-1",
        },
      },
    });

    expect(metadata).toEqual({
      artifact: {
        generation_brief: {
          voice_source: "brand_voice",
          evidence_pack_id: "voice-pack-1",
        },
      },
    });
    expect(metadata.artifact as Record<string, unknown>).not.toHaveProperty(
      "artifact_mode",
    );
    expect(metadata.artifact as Record<string, unknown>).not.toHaveProperty(
      "artifact_stage",
    );
    expect(metadata.artifact as Record<string, unknown>).not.toHaveProperty(
      "artifact_kind",
    );
  });

  it("显式空 generation brief alias 应保留给后端默认 guard 归一化", () => {
    expect(
      mergeGenerationBriefIntoArtifactMetadata({
        generationBrief: {},
      }),
    ).toEqual({
      artifact: {
        generation_brief: {},
      },
    });

    expect(mergeGenerationBriefIntoArtifactMetadata({}, {})).toEqual({
      artifact: {
        generation_brief: {},
      },
    });
  });

  it("root generationBrief alias 应收敛到 artifact.generation_brief", () => {
    expect(
      mergeGenerationBriefIntoArtifactMetadata({
        generationBrief: {
          voiceSource: "creator_voice",
          creatorVoiceId: "creator-1",
        },
      }),
    ).toEqual({
      artifact: {
        generation_brief: {
          voice_source: "creator_voice",
          creator_voice_id: "creator-1",
        },
      },
    });
  });

  it("保存声线被应用时应写入可解释诊断", () => {
    const metadata = mergeSoulArtifactVoiceDiagnostics(
      {
        artifact: {
          generation_brief: {
            voice_source: "brand_voice",
            voice_guard: "user_explicit",
            brand_voice_id: "brand-voice-1",
            evidence_refs: ["memory:brand-voice"],
          },
        },
      },
      {
        savedGenerationBrief: {
          voiceSource: "brand_voice",
          voiceGuard: "user_explicit",
          brandVoiceId: "brand-voice-1",
          evidenceRefs: ["memory:brand-voice"],
        },
        savedVoiceEnabledForTurn: true,
        hasExplicitGenerationBrief: false,
      },
    );

    expect(metadata.diagnostics).toEqual({
      soul_artifact_voice: {
        status: "saved_applied",
        enabled_for_turn: true,
        source: "memory.soul.artifact_voice",
        guard_result: "applied",
        voice_source: "brand_voice",
        voice_guard: "user_explicit",
        evidence_refs: ["memory:brand-voice"],
        evidence_ref_count: 1,
      },
    });
  });

  it("本轮关闭保存声线时应只保留诊断，不注入 generation brief", () => {
    const metadata = mergeSoulArtifactVoiceDiagnostics(
      {},
      {
        savedGenerationBrief: {
          voiceSource: "creator_voice",
          creatorVoiceId: "creator-voice-1",
          evidenceSource: "memory.soul.artifact_voice",
        },
        savedVoiceEnabledForTurn: false,
        hasExplicitGenerationBrief: false,
      },
    );

    expect(metadata).not.toHaveProperty("artifact");
    expect(metadata.diagnostics).toEqual({
      soul_artifact_voice: {
        status: "disabled_for_turn",
        enabled_for_turn: false,
        source: "memory.soul.artifact_voice",
        guard_result: "blocked_by_turn_override",
        voice_source: "creator_voice",
        evidence_source: "memory.soul.artifact_voice",
      },
    });
  });

  it("本轮显式 generation brief 的诊断来源应覆盖保存声线", () => {
    const metadata = mergeSoulArtifactVoiceDiagnostics(
      {
        artifact: {
          generation_brief: {
            voice_source: "creator_voice",
            creator_voice_id: "turn-creator-voice",
            evidence_refs: ["memory:turn-voice"],
          },
        },
      },
      {
        savedGenerationBrief: {
          voiceSource: "brand_voice",
          brandVoiceId: "saved-brand-voice",
          evidenceSource: "memory.soul.artifact_voice",
        },
        savedVoiceEnabledForTurn: true,
        hasExplicitGenerationBrief: true,
      },
    );

    expect(metadata.diagnostics).toEqual({
      soul_artifact_voice: {
        status: "turn_explicit",
        enabled_for_turn: true,
        source: "request_metadata.generation_brief",
        guard_result: "applied",
        voice_source: "creator_voice",
        evidence_refs: ["memory:turn-voice"],
        evidence_ref_count: 1,
      },
    });
  });
});
