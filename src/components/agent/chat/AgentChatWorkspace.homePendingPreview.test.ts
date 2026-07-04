import { describe, expect, it } from "vitest";
import {
  buildHomePendingPreviewMessages,
  type TaskCenterDraftSendRequest,
} from "./homePendingPreview";
import { resolveSoulInteractionCopy } from "@/lib/soul/interactionCopy";

describe("buildHomePendingPreviewMessages", () => {
  it("首页首发等待态应保留 Skill route 与用户可见文本", () => {
    const request: TaskCenterDraftSendRequest = {
      id: "draft-send-1",
      draftTabId: "session-1",
      text: "帮我整理资料",
      images: [],
      sendExecutionStrategy: "react",
      sendOptions: {
        displayContent: "帮我整理资料",
        capabilityRoute: {
          kind: "installed_skill",
          skillKey: "brand-product-knowledge-builder",
          skillName: "brand-product-knowledge-builder",
        },
      },
      submittedAt: 1_710_000_000_000,
      materializeDraft: false,
      source: "empty-state",
    };

    const messages = buildHomePendingPreviewMessages(request, "react");

    expect(messages[0]).toMatchObject({
      id: "draft-send-1:user",
      role: "user",
      content: "帮我整理资料",
      inputCapabilityRoute: {
        kind: "installed_skill",
        skillKey: "brand-product-knowledge-builder",
        skillName: "brand-product-knowledge-builder",
      },
    });
    expect(messages[1]).toMatchObject({
      id: "draft-send-1:assistant",
      role: "assistant",
      isThinking: true,
      runtimeStatus: {
        phase: "preparing",
        title: "正在进入对话",
      },
    });
  });

  it("首页首发等待态应应用 memory.soul 当前交互口吻", () => {
    const request: TaskCenterDraftSendRequest = {
      id: "draft-send-soul",
      draftTabId: "session-soul",
      text: "帮我整理资料",
      images: [],
      submittedAt: 1_710_000_000_000,
      materializeDraft: false,
      source: "empty-state",
    };

    const messages = buildHomePendingPreviewMessages(
      request,
      "react",
      resolveSoulInteractionCopy({
        soul: {
          enabled: true,
          style_profile_id: "cheeky_sassy_executor",
          style_intensity: "low",
        },
      }),
    );

    expect(messages[1]).toMatchObject({
      role: "assistant",
      runtimeStatus: {
        phase: "preparing",
        title: "接住了，正在开工",
        detail: expect.stringContaining("掉链子"),
      },
    });
  });
});
