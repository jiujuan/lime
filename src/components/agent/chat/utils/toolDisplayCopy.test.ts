import { afterEach, describe, expect, it } from "vitest";

import { loadNamespaceResource } from "@/i18n/loadNamespace";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import {
  selectToolAction,
  toUserFacingToolDisplayLabel,
} from "./toolDisplayCopy";

afterEach(() => {
  document.documentElement.lang = "";
});

describe("toolDisplayCopy", () => {
  it("状态动作应读取当前语言资源", () => {
    document.documentElement.lang = "en-US";

    expect(selectToolAction("command", "completed")).toBe("Ran");
    expect(selectToolAction("browser", "failed")).toBe("Operation failed");
  });

  it("用户可见工具标签应读取当前语言资源", () => {
    document.documentElement.lang = "ja-JP";

    expect(toUserFacingToolDisplayLabel("命令执行")).toBe("コマンドを実行");
    expect(toUserFacingToolDisplayLabel("图片查看")).toBe("画像を確認");
  });

  it("非中英语言未初始化时也应读取资源", () => {
    document.documentElement.lang = "ko-KR";

    expect(selectToolAction("write", "running")).toBe("저장 중");
    expect(toUserFacingToolDisplayLabel("站点能力搜索")).toBe(
      "사이트 기능 검색",
    );
  });

  it("未知标签保持原值，避免把协议名误翻译", () => {
    document.documentElement.lang = "en-US";

    expect(toUserFacingToolDisplayLabel("unknown_tool")).toBe("unknown_tool");
  });

  it("工具展示 copy 资源应覆盖所有支持语言", () => {
    const sourceResource = loadNamespaceResource("zh-CN", "agent");
    const requiredKeys = Object.keys(sourceResource).filter(
      (key) =>
        key.startsWith("agentChat.toolCall.action.") ||
        key.startsWith("agentChat.toolCall.actionOverride.") ||
        key.startsWith("agentChat.toolCall.groupTitle.") ||
        key.startsWith("agentChat.toolCall.label.") ||
        key.startsWith("agentChat.toolCall.subject.") ||
        key.startsWith("agentChat.toolCall.userFacing.") ||
        key.startsWith("agentChat.toolCall.verb.") ||
        key.startsWith("agentChat.contentWorkbenchTools."),
    );

    expect(requiredKeys).toContain("agentChat.toolCall.action.command.completed");
    expect(requiredKeys).toContain("agentChat.toolCall.label.command");
    expect(requiredKeys).toContain("agentChat.toolCall.groupTitle.command");
    expect(requiredKeys).toContain("agentChat.toolCall.verb.run");
    expect(requiredKeys).toContain("agentChat.toolCall.userFacing.command");
    expect(requiredKeys).toContain(
      "agentChat.contentWorkbenchTools.userFacing.videoGeneration",
    );

    for (const locale of SUPPORTED_LOCALES) {
      const resource = loadNamespaceResource(locale, "agent");
      for (const key of requiredKeys) {
        expect(resource[key], `${locale} missing ${key}`).toBeTruthy();
      }
    }
  });
});
