import { describe, expect, it } from "vitest";
import {
  buildThreadExpertProfileSwitchRequestMetadata,
  mergeExpertSkillRefsIntoRequestMetadata,
  resolveExpertPanelRequestMetadata,
  resolveSessionExpertRequestMetadata,
  resolveWorkspaceRequestMetadataWithExpertSkills,
  shouldAllowDetachedInitialAutoSend,
} from "./workspaceExpertMetadata";
import { getSeededExpertCatalog } from "@/features/experts";

describe("workspaceExpertMetadata", () => {
  it("专家面板 metadata 应优先使用 initial auto-send metadata", () => {
    const initialRequestMetadata = { source: "initial" };
    const initialAutoSendRequestMetadata = { source: "auto" };

    expect(
      resolveExpertPanelRequestMetadata({
        initialAutoSendRequestMetadata,
        initialRequestMetadata,
      }),
    ).toBe(initialAutoSendRequestMetadata);
  });

  it("专家面板 metadata 应能从历史 session metadata 恢复", () => {
    const sessionRequestMetadata = {
      title: "代码文学专家",
      expert: {
        expertId: "code-literature",
        skillRefs: ["skill:capability-report"],
      },
      harness: {
        expert: {
          expert_id: "code-literature",
          skill_refs: ["skill:capability-report"],
        },
      },
    };

    expect(
      resolveExpertPanelRequestMetadata({
        sessionRequestMetadata,
      }),
    ).toBe(sessionRequestMetadata);
  });

  it("合并 skill refs 时应同时写入 expert 与 harness expert", () => {
    expect(
      mergeExpertSkillRefsIntoRequestMetadata(
        {
          expert: { id: "expert-1" },
          harness: {
            expert: { release_id: "release-1" },
            keep: true,
          },
        },
        ["workspace_skill:writer"],
      ),
    ).toEqual({
      expert: {
        id: "expert-1",
        skillRefs: ["workspace_skill:writer"],
      },
      harness: {
        expert: {
          release_id: "release-1",
          skill_refs: ["workspace_skill:writer"],
        },
        keep: true,
      },
    });
  });

  it("workspace 请求 metadata 应优先从 initial request metadata 合并专家技能", () => {
    expect(
      resolveWorkspaceRequestMetadataWithExpertSkills({
        initialRequestMetadata: {
          expert: { id: "manual-expert" },
        },
        initialAutoSendRequestMetadata: {
          expert: { id: "auto-expert" },
        },
        expertSkillRefsOverride: ["workspace_skill:research"],
      }),
    ).toEqual({
      expert: {
        id: "manual-expert",
        skillRefs: ["workspace_skill:research"],
      },
    });
  });

  it("workspace 请求 metadata 应能从 session metadata 恢复专家配置", () => {
    expect(
      resolveWorkspaceRequestMetadataWithExpertSkills({
        sessionRequestMetadata: {
          title: "代码文学专家",
          expert: { expertId: "code-literature" },
          harness: {
            expert: { expert_id: "code-literature" },
          },
        },
        expertSkillRefsOverride: ["skill:capability-report"],
      }),
    ).toEqual({
      title: "代码文学专家",
      expert: {
        expertId: "code-literature",
        skillRefs: ["skill:capability-report"],
      },
      harness: {
        expert: {
          expert_id: "code-literature",
          skill_refs: ["skill:capability-report"],
        },
      },
    });
  });

  it("initial metadata 应优先于 session metadata", () => {
    expect(
      resolveWorkspaceRequestMetadataWithExpertSkills({
        initialRequestMetadata: {
          expert: { expertId: "initial-expert" },
        },
        sessionRequestMetadata: {
          expert: { expertId: "session-expert" },
        },
        expertSkillRefsOverride: null,
      }),
    ).toEqual({
      expert: { expertId: "initial-expert" },
    });
  });

  it("当前 Thread 内专家切换应优先覆盖下一轮请求 metadata", () => {
    const switchedMetadata = {
      expert: { expertId: "data-analyst" },
      harness: {
        expert: { expert_id: "data-analyst" },
        expert_role_switch: {
          kind: "expert_profile_switch",
          scope: "thread",
        },
      },
    };

    expect(
      resolveWorkspaceRequestMetadataWithExpertSkills({
        activeRequestMetadata: switchedMetadata,
        initialRequestMetadata: {
          expert: { expertId: "initial-expert" },
        },
        sessionRequestMetadata: {
          expert: { expertId: "session-expert" },
        },
        expertSkillRefsOverride: ["skill:capability-report"],
      }),
    ).toEqual({
      expert: {
        expertId: "data-analyst",
        skillRefs: ["skill:capability-report"],
      },
      harness: {
        expert: {
          expert_id: "data-analyst",
          skill_refs: ["skill:capability-report"],
        },
        expert_role_switch: {
          kind: "expert_profile_switch",
          scope: "thread",
        },
      },
    });
  });

  it("应只从专家 session metadata 恢复请求 metadata", () => {
    expect(
      resolveSessionExpertRequestMetadata({
        session_business_object_ref_metadata: {
          title: "普通会话",
          harness: {
            browser_assist: { url: "https://example.com" },
          },
        },
      }),
    ).toBeNull();

    expect(
      resolveSessionExpertRequestMetadata({
        session_business_object_ref_metadata: {
          title: "代码文学专家",
          expert: { expertId: "code-literature" },
        },
      }),
    ).toEqual({
      title: "代码文学专家",
      expert: { expertId: "code-literature" },
    });
  });

  it("没有 metadata 时 workspace 请求 metadata 应保持 null", () => {
    expect(
      resolveWorkspaceRequestMetadataWithExpertSkills({
        expertSkillRefsOverride: ["workspace_skill:research"],
      }),
    ).toBeNull();
  });

  it("initial auto-send metadata 携带 expert 时允许 detached session", () => {
    expect(
      shouldAllowDetachedInitialAutoSend({
        expert: { id: "expert-1" },
      }),
    ).toBe(true);
  });

  it("initial auto-send metadata 携带 harness expert 时允许 detached session", () => {
    expect(
      shouldAllowDetachedInitialAutoSend({
        harness: {
          expert: { id: "expert-1" },
        },
      }),
    ).toBe(true);
  });

  it("initial auto-send metadata 携带插件激活意图时允许 detached session", () => {
    expect(
      shouldAllowDetachedInitialAutoSend({
        harness: {
          plugin_activation_intent: {
            plugin_id: "content-factory-app",
            trigger: "@内容工厂",
          },
        },
      }),
    ).toBe(true);
  });

  it("非 expert metadata 不允许 detached session", () => {
    expect(
      shouldAllowDetachedInitialAutoSend({
        harness: {
          browser_assist: { url: "https://example.com" },
        },
      }),
    ).toBe(false);
  });

  it("应构造同一 Thread 内专家 profile switch metadata fact", () => {
    const catalog = getSeededExpertCatalog();
    const nextExpert = catalog.items.find((item) => item.id === "data-analyst");

    expect(nextExpert).toBeTruthy();

    const metadata = buildThreadExpertProfileSwitchRequestMetadata({
      currentMetadata: {
        trace_id: "trace-thread-1",
        expert: {
          expertId: "marketing-strategist",
          releaseId: "rel-marketing-strategist-20260515",
        },
        harness: {
          source: "history-session",
          expert: {
            expert_id: "marketing-strategist",
            release_id: "rel-marketing-strategist-20260515",
          },
        },
      },
      expert: nextExpert!,
      catalog,
      switchedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(metadata).toMatchObject({
      trace_id: "trace-thread-1",
      expert: {
        expertId: "data-analyst",
        releaseId: "rel-data-analyst-20260515",
      },
      harness: {
        source: "history-session",
        expert: {
          expert_id: "data-analyst",
          release_id: "rel-data-analyst-20260515",
        },
        expert_role_switch: {
          kind: "expert_profile_switch",
          scope: "thread",
          source: "expert_info_panel",
          previous_expert_id: "marketing-strategist",
          previous_release_id: "rel-marketing-strategist-20260515",
          next_expert_id: "data-analyst",
          next_release_id: "rel-data-analyst-20260515",
          switched_at: "2026-07-05T00:00:00.000Z",
        },
      },
    });
  });
});
