import { describe, expect, it } from "vitest";
import { getSeededSkillCatalog } from "@/lib/api/skillCatalog";
import { buildRuntimeMentionCommandCatalog } from "../skill-selection/runtimeInputCapabilityCatalog";
import { parseCodeWorkbenchCommand } from "./codeWorkbenchCommand";

const CODE_RUNTIME_COMMAND_KEY = "code_runtime";

function parseSeededCodeCommand(text: string) {
  const { mentionCommandPrefixKeyMap } = buildRuntimeMentionCommandCatalog(
    getSeededSkillCatalog(),
  );

  return parseCodeWorkbenchCommand(text, {
    commandKey: CODE_RUNTIME_COMMAND_KEY,
    mentionCommandPrefixKeyMap,
  });
}

describe("parseCodeWorkbenchCommand", () => {
  it("应只解析 @代码 快捷触发词并保留原始正文", () => {
    const result = parseSeededCodeCommand(
      "@代码 类型:重构 重构聊天区时间线组件，合并重复状态分支并补测试",
    );

    expect(result).toMatchObject({
      trigger: "@代码",
      body: "类型:重构 重构聊天区时间线组件，合并重复状态分支并补测试",
      prompt: "类型:重构 重构聊天区时间线组件，合并重复状态分支并补测试",
    });
    expect(result).not.toHaveProperty("taskType");
  });

  it("应兼容英文触发且不推断 code review 意图", () => {
    const result = parseSeededCodeCommand(
      "@code review src/components/agent/chat/workspace/useWorkspaceSendActions.ts 的发送边界",
    );

    expect(result).toMatchObject({
      trigger: "@code",
      prompt:
        "review src/components/agent/chat/workspace/useWorkspaceSendActions.ts 的发送边界",
    });
    expect(result).not.toHaveProperty("taskType");
  });

  it("不应从正文推断 bug fix 意图", () => {
    const result = parseSeededCodeCommand(
      "@开发 帮我修复消息历史切换后图片卡片丢失的问题",
    );

    expect(result).toMatchObject({
      trigger: "@开发",
      prompt: "帮我修复消息历史切换后图片卡片丢失的问题",
    });
    expect(result).not.toHaveProperty("taskType");
  });

  it("应兼容 多词别名风格的 @Code Agent 命令", () => {
    const result = parseSeededCodeCommand(
      "@Code Agent refactor the runtime mention registry and remove duplicate branches",
    );

    expect(result).toMatchObject({
      trigger: "@Code Agent",
      prompt:
        "refactor the runtime mention registry and remove duplicate branches",
    });
    expect(result).not.toHaveProperty("taskType");
  });

  it("应只依赖调用方传入的 mention catalog，而不是内置触发词表", () => {
    const result = parseCodeWorkbenchCommand(
      "@Lime Code 收口 runtime mention 目录",
      {
        commandKey: CODE_RUNTIME_COMMAND_KEY,
        mentionCommandPrefixKeyMap: new Map([
          ["@Lime Code", CODE_RUNTIME_COMMAND_KEY],
        ]),
      },
    );

    expect(result).toMatchObject({
      commandKey: CODE_RUNTIME_COMMAND_KEY,
      trigger: "@Lime Code",
      body: "收口 runtime mention 目录",
      prompt: "收口 runtime mention 目录",
    });
  });

  it("非代码命令应返回空", () => {
    expect(parseSeededCodeCommand("@表单 帮我做一个报名表")).toBeNull();
  });
});
