import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedAgentStreamUserInputSend } from "./agentStreamUserInputSendPreparation";
import { maybeHandleSlashSkillBeforeSend } from "./agentStreamSlashSkillPreflight";

const { mockParseSkillSlashCommand, mockTryExecuteSlashSkillCommand } =
  vi.hoisted(() => ({
    mockParseSkillSlashCommand: vi.fn(),
    mockTryExecuteSlashSkillCommand: vi.fn(),
  }));

vi.mock("./skillCommand", () => ({
  parseSkillSlashCommand: (...args: unknown[]) =>
    mockParseSkillSlashCommand(...args),
  tryExecuteSlashSkillCommand: (...args: unknown[]) =>
    mockTryExecuteSlashSkillCommand(...args),
}));

function createPreparedSend(
  overrides: Partial<PreparedAgentStreamUserInputSend> = {},
): PreparedAgentStreamUserInputSend {
  return {
    content: "/legacy_content_post 写一版主稿",
    images: [],
    skipUserMessage: false,
    expectingQueue: false,
    effectiveExecutionStrategy: "react",
    effectiveProviderType: "openai",
    effectiveModel: "gpt-5.4",
    syncedSessionModelPreference: null,
    assistantMsgId: "assistant-1",
    userMsgId: "user-1",
    userMsg: {
      id: "user-1",
      role: "user",
      content: "/legacy_content_post 写一版主稿",
      timestamp: new Date("2026-04-07T12:00:00.000Z"),
    },
    assistantMsg: {
      id: "assistant-1",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-04-07T12:00:00.000Z"),
      contentParts: [],
    },
    ...overrides,
  };
}

type SlashSkillPreflightTestEnv = Parameters<
  typeof maybeHandleSlashSkillBeforeSend
>[0]["env"];

function createEnv(): SlashSkillPreflightTestEnv {
  return {
    ensureSession: async () => "session-1",
    sessionIdRef: { current: null },
    activeStreamRef: { current: null },
    listenerMapRef: { current: new Map() },
    setMessages: vi.fn(),
    setIsSending: vi.fn(),
    setActiveStream: vi.fn(),
    clearActiveStreamIfMatch: vi.fn(() => false),
    playTypewriterSound: vi.fn(),
    playToolcallSound: vi.fn(),
    onWriteFile: vi.fn(),
    getRequiredWorkspaceId: vi.fn(() => "workspace-1"),
  };
}

describe("agentStreamSlashSkillPreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseSkillSlashCommand.mockReturnValue({
      skillName: "legacy_content_post",
      userInput: "写一版主稿",
    });
    mockTryExecuteSlashSkillCommand.mockResolvedValue(true);
  });

  it.each([
    {
      key: "service_scene_launch",
      launch: {
        kind: "local_service_skill",
        service_scene_run: {
          scene_key: "campaign-launch",
        },
      },
    },
    {
      key: "service_skill_launch",
      launch: {
        kind: "site_adapter",
        skill_id: "x-article-export",
      },
    },
  ])(
    "已携带 $key metadata 时不应再回退旧 slash skill preflight",
    async ({ key, launch }) => {
      const env = createEnv();
      const handled = await maybeHandleSlashSkillBeforeSend({
        preparedSend: createPreparedSend({
          content:
            key === "service_scene_launch"
              ? "/campaign-launch 帮我做一版新品活动方案"
              : "/x文章转存 https://x.com/GoogleCloudTech/article/2033953579824758855",
          requestMetadata: {
            harness: {
              [key]: launch,
            },
          },
        }),
        env,
      });

      expect(handled).toBe(false);
      expect(mockParseSkillSlashCommand).not.toHaveBeenCalled();
      expect(mockTryExecuteSlashSkillCommand).not.toHaveBeenCalled();
      expect(env.setActiveStream).not.toHaveBeenCalled();
    },
  );

  it("结构化 model skill metadata 应在发送前转入真实 Skill 执行，而不是继续普通 runtime submit", async () => {
    const env = createEnv();
    const launch = {
      skill_name: "analysis",
      kind: "analysis_request",
      analysis_request: {
        raw_text: "@analysis 帮我分析一下今天的国际形势",
        prompt: "帮我分析一下今天的国际形势",
        entry_source: "at_analysis_command",
      },
    };

    const handled = await maybeHandleSlashSkillBeforeSend({
      preparedSend: createPreparedSend({
        content: "@analysis 帮我分析一下今天的国际形势",
        requestMetadata: {
          harness: {
            allow_model_skills: true,
            analysis_skill_launch: launch,
          },
        },
      }),
      env,
    });

    expect(handled).toBe(true);
    expect(mockParseSkillSlashCommand).not.toHaveBeenCalled();
    expect(mockTryExecuteSlashSkillCommand).toHaveBeenCalledTimes(1);
    expect(mockTryExecuteSlashSkillCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: {
          skillName: "analysis",
          userInput: "@analysis 帮我分析一下今天的国际形势",
        },
        rawContent: "@analysis 帮我分析一下今天的国际形势",
        requestContext: undefined,
        requestMetadata: expect.objectContaining({
          harness: expect.objectContaining({
            analysis_skill_launch: launch,
          }),
        }),
        workspaceId: "workspace-1",
      }),
    );
    expect(env.setActiveStream).toHaveBeenCalledTimes(1);
  });

  it("结构化 Skill metadata 不应只 hard code analysis", async () => {
    const env = createEnv();
    const launch = {
      skill_name: "translation",
      kind: "translation_request",
      translation_request: {
        raw_text: "@翻译 内容:hello 目标语言:中文",
        prompt: "hello",
        target_language: "中文",
      },
    };

    const handled = await maybeHandleSlashSkillBeforeSend({
      preparedSend: createPreparedSend({
        content: "@翻译 内容:hello 目标语言:中文",
        requestMetadata: {
          harness: {
            allow_model_skills: true,
            translation_skill_launch: launch,
          },
        },
      }),
      env,
    });

    expect(handled).toBe(true);
    expect(mockParseSkillSlashCommand).not.toHaveBeenCalled();
    expect(mockTryExecuteSlashSkillCommand).toHaveBeenCalledTimes(1);
    expect(mockTryExecuteSlashSkillCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: {
          skillName: "translation",
          userInput: "@翻译 内容:hello 目标语言:中文",
        },
        rawContent: "@翻译 内容:hello 目标语言:中文",
        requestContext: undefined,
      }),
    );
  });

  it("未携带结构化 scene metadata 时仍应继续尝试旧 slash skill", async () => {
    const env = createEnv();
    const handled = await maybeHandleSlashSkillBeforeSend({
      preparedSend: createPreparedSend(),
      env,
    });

    expect(handled).toBe(true);
    expect(mockParseSkillSlashCommand).toHaveBeenCalledWith(
      "/legacy_content_post 写一版主稿",
    );
    expect(mockTryExecuteSlashSkillCommand).toHaveBeenCalledTimes(1);
    expect(mockTryExecuteSlashSkillCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
      }),
    );
    expect(env.setActiveStream).toHaveBeenCalledTimes(1);
  });
});
