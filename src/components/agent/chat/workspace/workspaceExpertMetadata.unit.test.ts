import { describe, expect, it } from "vitest";
import {
  mergeExpertSkillRefsIntoRequestMetadata,
  resolveExpertPanelRequestMetadata,
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
