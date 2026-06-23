import { describe, expect, it } from "vitest";
import {
  mergeExpertSkillRefsIntoRequestMetadata,
  resolveExpertPanelRequestMetadata,
  resolveSessionExpertRequestMetadata,
  resolveWorkspaceRequestMetadataWithExpertSkills,
  shouldAllowDetachedInitialAutoSend,
} from "./workspaceExpertMetadata";

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

  it("非 expert metadata 不允许 detached session", () => {
    expect(
      shouldAllowDetachedInitialAutoSend({
        harness: {
          browser_assist: { url: "https://example.com" },
        },
      }),
    ).toBe(false);
  });
});
