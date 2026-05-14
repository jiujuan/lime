import { describe, expect, it } from "vitest";
import { resolveKnowledgeHubState } from "./knowledgeHubState";

const fallbackPackLabel = "项目资料";

describe("resolveKnowledgeHubState", () => {
  it("无资料时应引导添加项目资料", () => {
    const state = resolveKnowledgeHubState({
      knowledgePackSelection: null,
      knowledgePackOptions: [],
      hasInputText: false,
      canManageKnowledgePacks: true,
      canStartKnowledgeOrganize: true,
      fallbackPackLabel,
    });

    expect(state.title.key).toBe("agentChat.inputbar.knowledge.state.add.title");
    expect(state.primaryAction).toBe("organize");
    expect(state.primaryLabel.key).toBe(
      "agentChat.inputbar.knowledge.action.organize",
    );
  });

  it("无资料但输入框已有内容时应引导沉淀当前输入", () => {
    const state = resolveKnowledgeHubState({
      knowledgePackSelection: null,
      knowledgePackOptions: [],
      hasInputText: true,
      canManageKnowledgePacks: true,
      canStartKnowledgeOrganize: true,
      fallbackPackLabel,
    });

    expect(state.primaryAction).toBe("organize");
    expect(state.primaryLabel.key).toBe(
      "agentChat.inputbar.knowledge.action.organizeWithInput",
    );
  });

  it("有待确认资料且无可用选择时应先确认资料", () => {
    const state = resolveKnowledgeHubState({
      knowledgePackSelection: null,
      knowledgePackOptions: [
        {
          packName: "draft-pack",
          label: "待确认资料",
          status: "needs-review",
        },
      ],
      hasInputText: false,
      canManageKnowledgePacks: true,
      canStartKnowledgeOrganize: true,
      fallbackPackLabel,
    });

    expect(state.title.key).toBe(
      "agentChat.inputbar.knowledge.state.pendingOnly.title",
    );
    expect(state.primaryAction).toBe("manage");
    expect(state.primaryLabel.key).toBe(
      "agentChat.inputbar.knowledge.action.review",
    );
    expect(state.pendingCount).toBe(1);
  });

  it("有可用资料但未启用时应引导使用资料", () => {
    const state = resolveKnowledgeHubState({
      knowledgePackSelection: {
        enabled: false,
        packName: "brand-pack",
        workingDir: "/workspace",
        label: "品牌资料",
        status: "ready",
      },
      knowledgePackOptions: [
        {
          packName: "brand-pack",
          label: "品牌资料",
          status: "ready",
        },
      ],
      hasInputText: false,
      canManageKnowledgePacks: true,
      canStartKnowledgeOrganize: true,
      fallbackPackLabel,
    });

    expect(state.title.key).toBe(
      "agentChat.inputbar.knowledge.state.select.title",
    );
    expect(state.primaryAction).toBe("use");
    expect(state.primaryLabel.key).toBe(
      "agentChat.inputbar.knowledge.action.use",
    );
  });

  it("已启用资料时应引导补充资料", () => {
    const state = resolveKnowledgeHubState({
      knowledgePackSelection: {
        enabled: true,
        packName: "brand-pack",
        workingDir: "/workspace",
        label: "品牌资料",
        status: "ready",
      },
      knowledgePackOptions: [
        {
          packName: "brand-pack",
          label: "品牌资料",
          status: "ready",
        },
      ],
      hasInputText: true,
      canManageKnowledgePacks: true,
      canStartKnowledgeOrganize: true,
      fallbackPackLabel,
    });

    expect(state.title.key).toBe(
      "agentChat.inputbar.knowledge.state.using.title",
    );
    expect(state.title.values).toEqual({ label: "品牌资料" });
    expect(state.primaryAction).toBe("supplement");
    expect(state.primaryLabel.key).toBe(
      "agentChat.inputbar.knowledge.action.supplementWithInput",
    );
  });
});
