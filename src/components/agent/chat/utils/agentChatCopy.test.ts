import { afterEach, describe, expect, it } from "vitest";

import { resolveRequiredAgentChatCopy } from "./agentChatCopy";

afterEach(() => {
  document.documentElement.lang = "";
});

describe("agentChatCopy", () => {
  it("必需展示文案应从 agent namespace 资源读取", () => {
    document.documentElement.lang = "en-US";

    expect(
      resolveRequiredAgentChatCopy("toolCall.group.command.completed", {
        count: 2,
      }),
    ).toBe("Ran 2 commands");
  });

  it("i18n 未初始化时也应读取当前语言资源", () => {
    document.documentElement.lang = "ko-KR";

    expect(
      resolveRequiredAgentChatCopy("toolCall.group.write.running", {
        count: 1,
      }),
    ).toBe("파일 1개 저장 중");
  });

  it("缺失资源时不应静默回落到中文展示兜底", () => {
    document.documentElement.lang = "en-US";

    expect(resolveRequiredAgentChatCopy("toolCall.group.__missing__")).toBe(
      "agentChat.toolCall.group.__missing__",
    );
  });
});
