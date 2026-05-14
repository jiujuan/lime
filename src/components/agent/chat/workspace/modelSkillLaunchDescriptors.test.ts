import { describe, expect, it } from "vitest";
import {
  buildModelSkillLaunchRequestMetadata,
  MODEL_SKILL_LAUNCH,
  MODEL_SKILL_LAUNCH_DESCRIPTORS,
  SESSION_BOUND_MODEL_SKILL_LAUNCHES,
} from "./modelSkillLaunchDescriptors";

describe("modelSkillLaunchDescriptors", () => {
  it("为所有 model skill launch 暴露唯一描述符", () => {
    const launchKeys = MODEL_SKILL_LAUNCH_DESCRIPTORS.map(
      (descriptor) => descriptor.launchKey,
    );
    const requestContextKeys = MODEL_SKILL_LAUNCH_DESCRIPTORS.map(
      (descriptor) => descriptor.requestContextKey,
    );

    expect(new Set(launchKeys).size).toBe(
      MODEL_SKILL_LAUNCH_DESCRIPTORS.length,
    );
    expect(new Set(requestContextKeys).size).toBe(
      MODEL_SKILL_LAUNCH_DESCRIPTORS.length,
    );
    expect(launchKeys).toContain("image_skill_launch");
    expect(launchKeys).toContain("webpage_skill_launch");
  });

  it("只把需要真实会话 ID 的 launch 纳入 session 绑定列表", () => {
    expect(
      SESSION_BOUND_MODEL_SKILL_LAUNCHES.map(
        (descriptor) => descriptor.requestContextKey,
      ),
    ).toEqual([
      "image_task",
      "cover_task",
      "video_task",
      "broadcast_task",
      "resource_search_task",
      "transcription_task",
      "url_parse_task",
      "typesetting_task",
    ]);
  });

  it("按描述符构造 harness metadata 并保留已有字段", () => {
    const metadata = buildModelSkillLaunchRequestMetadata(
      MODEL_SKILL_LAUNCH.cover,
      {
        source: "existing",
        harness: {
          trace_id: "trace-1",
        },
      },
      {
        kind: "custom_cover_task",
        cover_task: {
          prompt: "做一张封面",
        },
      },
    );

    expect(metadata).toEqual({
      source: "existing",
      harness: {
        trace_id: "trace-1",
        allow_model_skills: true,
        cover_skill_launch: {
          skill_name: "cover_generate",
          kind: "custom_cover_task",
          cover_task: {
            prompt: "做一张封面",
          },
        },
      },
    });
  });

  it("没有 scoped context 时回退到 request_context", () => {
    const metadata = buildModelSkillLaunchRequestMetadata(
      MODEL_SKILL_LAUNCH.research,
      undefined,
      {
        prompt: "查一下最新趋势",
      },
    );

    expect(metadata).toEqual({
      harness: {
        allow_model_skills: true,
        research_skill_launch: {
          skill_name: "research",
          kind: "research_request",
          request_context: {
            prompt: "查一下最新趋势",
          },
        },
      },
    });
  });
});
