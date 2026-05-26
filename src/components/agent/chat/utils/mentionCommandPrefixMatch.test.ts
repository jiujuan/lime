import { describe, expect, it } from "vitest";
import {
  parseMentionCommand,
  resolveMentionCommandPrefixMatch,
} from "./mentionCommandPrefixMatch";

const ENGINEERING_RUNTIME_COMMAND_KEY = "engineering_runtime";

describe("parseMentionCommand", () => {
  it("应通过 command catalog 解析 mention 快捷入口并保留原始正文", () => {
    const result = parseMentionCommand(
      "@工程模式 类型:重构 重构聊天区时间线组件，合并重复状态分支并补测试",
      new Map([["@工程模式", ENGINEERING_RUNTIME_COMMAND_KEY]]),
      {
        commandKey: ENGINEERING_RUNTIME_COMMAND_KEY,
      },
    );

    expect(result).toMatchObject({
      rawText: "@工程模式 类型:重构 重构聊天区时间线组件，合并重复状态分支并补测试",
      commandKey: ENGINEERING_RUNTIME_COMMAND_KEY,
      trigger: "@工程模式",
      body: "类型:重构 重构聊天区时间线组件，合并重复状态分支并补测试",
    });
    expect(result).not.toHaveProperty("taskType");
    expect(result).not.toHaveProperty("prompt");
  });

  it("应兼容 catalog 里的英文与多词别名，而不是依赖专用 parser", () => {
    const mentionCommandPrefixKeyMap = new Map([
      ["@Eng", ENGINEERING_RUNTIME_COMMAND_KEY],
      ["@Engineering Agent", ENGINEERING_RUNTIME_COMMAND_KEY],
    ]);

    expect(
      parseMentionCommand(
        "@Eng review src/components/agent/chat/workspace/useWorkspaceSendActions.ts 的发送边界",
        mentionCommandPrefixKeyMap,
        {
          commandKey: ENGINEERING_RUNTIME_COMMAND_KEY,
        },
      ),
    ).toMatchObject({
      trigger: "@Eng",
      body: "review src/components/agent/chat/workspace/useWorkspaceSendActions.ts 的发送边界",
    });

    expect(
      parseMentionCommand(
        "@Engineering Agent refactor the runtime mention registry and remove duplicate branches",
        mentionCommandPrefixKeyMap,
        {
          commandKey: ENGINEERING_RUNTIME_COMMAND_KEY,
        },
      ),
    ).toMatchObject({
      trigger: "@Engineering Agent",
      body: "refactor the runtime mention registry and remove duplicate branches",
    });
  });

  it("应只依赖调用方传入的 mention catalog", () => {
    const result = parseMentionCommand(
      "@Lime Engineering 收口 runtime mention 目录",
      new Map([["@Lime Engineering", ENGINEERING_RUNTIME_COMMAND_KEY]]),
      {
        commandKey: ENGINEERING_RUNTIME_COMMAND_KEY,
      },
    );

    expect(result).toMatchObject({
      commandKey: ENGINEERING_RUNTIME_COMMAND_KEY,
      trigger: "@Lime Engineering",
      body: "收口 runtime mention 目录",
    });
  });

  it("应按 commandKey 过滤，避免其他 builtin command 被误判成目标 route", () => {
    const result = parseMentionCommand(
      "@工程模式 帮我做一个报名表",
      new Map([["@工程模式", "form_generate"]]),
      {
        commandKey: ENGINEERING_RUNTIME_COMMAND_KEY,
      },
    );

    expect(result).toBeNull();
  });

  it("应按最长 prefix 命中，并要求 prefix 后存在边界", () => {
    const mentionCommandPrefixKeyMap = new Map([
      ["@Eng", "generic_agent_turn"],
      ["@Eng Agent", ENGINEERING_RUNTIME_COMMAND_KEY],
    ]);

    expect(
      resolveMentionCommandPrefixMatch(
        "@Eng Agent refactor runtime",
        mentionCommandPrefixKeyMap,
        { commandKey: ENGINEERING_RUNTIME_COMMAND_KEY },
      ),
    ).toMatchObject({
      commandPrefix: "@Eng Agent",
      body: "refactor runtime",
    });

    expect(
      resolveMentionCommandPrefixMatch(
        "@Engineer refactor",
        new Map([["@Eng", ENGINEERING_RUNTIME_COMMAND_KEY]]),
      ),
    ).toBeNull();
  });
});
