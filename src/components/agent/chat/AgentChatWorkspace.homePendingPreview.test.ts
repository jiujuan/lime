import { describe, expect, it } from "vitest";
import {
  buildHomePendingPreviewMessages,
  type TaskCenterDraftSendRequest,
} from "./homePendingPreview";

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
      webSearch: false,
      thinking: false,
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
});
