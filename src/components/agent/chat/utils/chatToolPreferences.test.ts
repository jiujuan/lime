import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CHAT_TOOL_PREFERENCES,
  alignChatToolPreferencesWithExecutionStrategy,
  loadChatToolPreferences,
  saveChatToolPreferences,
  shouldUseCompactGeneralPromptForPreferences,
} from "./chatToolPreferences";

describe("chatToolPreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("通用对话主题默认不应强制联网搜索", () => {
    expect(loadChatToolPreferences("general")).toEqual(
      DEFAULT_CHAT_TOOL_PREFERENCES,
    );
  });

  it("通用对话主题不应继承 legacy 全局偏好", () => {
    localStorage.setItem(
      "lime.chat.tool_preferences.v1",
      JSON.stringify({ webSearch: true, thinking: true }),
    );

    expect(loadChatToolPreferences("general")).toEqual(
      DEFAULT_CHAT_TOOL_PREFERENCES,
    );
  });

  it("非通用主题仍可回退 legacy 全局偏好", () => {
    localStorage.setItem(
      "lime.chat.tool_preferences.v1",
      JSON.stringify({
        webSearch: true,
        thinking: true,
        task: true,
        subagent: true,
      }),
    );

    expect(loadChatToolPreferences("custom-theme")).toEqual({
      webSearch: true,
      thinking: true,
      task: true,
      subagent: true,
    });
  });

  it("应按主题作用域保存偏好", () => {
    saveChatToolPreferences(
      { webSearch: true, thinking: false, task: true, subagent: false },
      "general",
    );
    saveChatToolPreferences(
      { webSearch: false, thinking: true, task: false, subagent: true },
      "custom-theme",
    );

    expect(loadChatToolPreferences("general")).toEqual({
      webSearch: true,
      thinking: false,
      task: true,
      subagent: false,
    });
    expect(loadChatToolPreferences("custom-theme")).toEqual({
      webSearch: false,
      thinking: true,
      task: false,
      subagent: true,
    });
    expect(loadChatToolPreferences("another-theme")).toEqual(
      DEFAULT_CHAT_TOOL_PREFERENCES,
    );
  });

  it("通用首轮仅开启联网搜索时仍应使用紧凑 Prompt", () => {
    expect(
      shouldUseCompactGeneralPromptForPreferences({
        chatMode: "general",
        contentId: null,
        preferences: {
          webSearch: true,
          thinking: false,
          task: false,
          subagent: false,
        },
      }),
    ).toBe(true);

    expect(
      shouldUseCompactGeneralPromptForPreferences({
        chatMode: "general",
        contentId: null,
        preferences: {
          webSearch: true,
          thinking: true,
          task: false,
          subagent: false,
        },
      }),
    ).toBe(false);
  });

  it("code_orchestrated 应同步打开任务与子代理偏好，避免界面状态落后于编程底座", () => {
    expect(
      alignChatToolPreferencesWithExecutionStrategy(
        {
          webSearch: false,
          thinking: false,
          task: false,
          subagent: false,
        },
        "code_orchestrated",
      ),
    ).toEqual({
      webSearch: false,
      thinking: false,
      task: true,
      subagent: true,
    });
  });

  it("退出 code_orchestrated 时应关闭任务但保留用户手动子代理偏好", () => {
    expect(
      alignChatToolPreferencesWithExecutionStrategy(
        {
          webSearch: true,
          thinking: true,
          task: true,
          subagent: true,
        },
        "react",
      ),
    ).toEqual({
      webSearch: true,
      thinking: true,
      task: false,
      subagent: true,
    });
  });
});
