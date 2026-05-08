import { describe, expect, it } from "vitest";
import { buildKnowledgeSavePageParams } from "./knowledgeSaveNavigation";

describe("buildKnowledgeSavePageParams", () => {
  it("应把助手结果转换为项目资料保存页参数", () => {
    expect(
      buildKnowledgeSavePageParams({
        projectRootPath: " /tmp/project ",
        selectedPackName: " founder-personal-ip ",
        currentSessionTitle: "本轮创作",
        requestKey: 2026050901,
        source: {
          messageId: "message-1",
          content: " 这是一段值得沉淀成项目资料的助手结果。 ",
          sourceName: " output.md ",
          description: " 对话结果资料 ",
        },
      }),
    ).toEqual({
      workingDir: "/tmp/project",
      initialView: "save",
      selectedPackName: "founder-personal-ip",
      saveDraft: {
        sourceName: "output.md",
        sourceText: "这是一段值得沉淀成项目资料的助手结果。",
        description: "对话结果资料",
        packType: "custom",
        requestKey: 2026050901,
      },
    });
  });

  it("缺省名称和说明时应使用稳定兜底", () => {
    expect(
      buildKnowledgeSavePageParams({
        projectRootPath: "/tmp/project",
        currentSessionTitle: "复盘会话",
        requestKey: 2026050902,
        source: {
          messageId: "message-2",
          content: "可复用的品牌事实和表达边界。",
        },
      }),
    ).toEqual({
      workingDir: "/tmp/project",
      initialView: "save",
      saveDraft: {
        sourceName: "agent-output-message-2.md",
        sourceText: "可复用的品牌事实和表达边界。",
        description: "复盘会话",
        packType: "custom",
        requestKey: 2026050902,
      },
    });
  });

  it("没有项目目录或正文时不进入项目资料页", () => {
    expect(
      buildKnowledgeSavePageParams({
        projectRootPath: "",
        source: {
          messageId: "message-3",
          content: "可复用内容",
        },
      }),
    ).toBeNull();
    expect(
      buildKnowledgeSavePageParams({
        projectRootPath: "/tmp/project",
        source: {
          messageId: "message-4",
          content: "   ",
        },
      }),
    ).toBeNull();
  });
});
