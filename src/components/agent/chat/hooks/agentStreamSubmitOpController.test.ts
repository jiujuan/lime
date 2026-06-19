import { describe, expect, it } from "vitest";
import { buildUserInputSubmitOp } from "../utils/buildUserInputSubmitOp";
import { buildAgentStreamSubmitOp } from "./agentStreamSubmitOpController";

describe("agentStreamSubmitOpController", () => {
  it("应按 stream submit 语义构造 runtime submitOp，并默认允许 busy queue", () => {
    const op = buildAgentStreamSubmitOp({
      activeSessionId: "session-fast-1",
      content: "只回答一个字：好",
      images: [],
      eventName: "aster_stream_fast",
      submitWorkspaceId: "workspace-1",
      requestTurnId: "turn-fast-1",
      skipPreSubmitResume: true,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-chat",
    });

    expect(op).toEqual({
      type: "user_input",
      text: "只回答一个字：好",
      sessionId: "session-fast-1",
      eventName: "aster_stream_fast",
      workspaceId: "workspace-1",
      turnId: "turn-fast-1",
      images: undefined,
      preferences: {
        providerPreference: "deepseek",
        modelPreference: "deepseek-chat",
        reasoningEffort: undefined,
        thinking: undefined,
        approvalPolicy: "on-request",
        sandboxPolicy: "workspace-write",
        executionStrategy: undefined,
        webSearch: undefined,
        autoContinue: undefined,
      },
      systemPrompt: undefined,
      metadata: undefined,
      queueIfBusy: true,
      skipPreSubmitResume: true,
    });
  });

  it("应与底层 user_input builder 保持 payload 等价", () => {
    const streamOp = buildAgentStreamSubmitOp({
      activeSessionId: "session-social-1",
      content: "继续生成社媒初稿",
      images: [
        {
          data: "base64-image",
          mediaType: "image/png",
        },
      ],
      eventName: "aster_stream_x",
      submitWorkspaceId: undefined,
      requestTurnId: "turn-1",
      systemPrompt: "system",
      requestMetadata: {
        harness: {
          preferences: {
            web_search: false,
            thinking: true,
          },
          theme: "general",
          session_mode: "general_workbench",
          gate_key: "write_mode",
          run_title: "社媒初稿",
          content_id: "content-social-1",
        },
      },
      executionRuntime: {
        session_id: "session-social-1",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
        recent_preferences: {
          task: false,
          subagent: false,
        },
        recent_theme: "general",
        recent_session_mode: "general_workbench",
        recent_gate_key: "write_mode",
        recent_run_title: "社媒初稿",
        recent_content_id: "content-social-1",
      },
      syncedRecentPreferences: {
        task: false,
        subagent: false,
      },
      syncedSessionModelPreference: {
        providerType: "openai",
        model: "gpt-4.1",
      },
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-4.1",
      autoContinue: {
        enabled: true,
        fast_mode_enabled: true,
        continuation_length: 1,
        sensitivity: 0.25,
      },
    });

    const directOp = buildUserInputSubmitOp({
      content: "继续生成社媒初稿",
      images: [
        {
          data: "base64-image",
          mediaType: "image/png",
        },
      ],
      sessionId: "session-social-1",
      eventName: "aster_stream_x",
      workspaceId: undefined,
      turnId: "turn-1",
      systemPrompt: "system",
      queueIfBusy: true,
      requestMetadata: {
        harness: {
          preferences: {
            web_search: false,
            thinking: true,
          },
          theme: "general",
          session_mode: "general_workbench",
          gate_key: "write_mode",
          run_title: "社媒初稿",
          content_id: "content-social-1",
        },
      },
      executionRuntime: {
        session_id: "session-social-1",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
        recent_preferences: {
          task: false,
          subagent: false,
        },
        recent_theme: "general",
        recent_session_mode: "general_workbench",
        recent_gate_key: "write_mode",
        recent_run_title: "社媒初稿",
        recent_content_id: "content-social-1",
      },
      syncedRecentPreferences: {
        task: false,
        subagent: false,
      },
      syncedSessionModelPreference: {
        providerType: "openai",
        model: "gpt-4.1",
      },
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-4.1",
      autoContinue: {
        enabled: true,
        fast_mode_enabled: true,
        continuation_length: 1,
        sensitivity: 0.25,
      },
    });

    expect(streamOp).toEqual(directOp);
  });

  it("应把 reasoning effort 带入 user_input preferences", () => {
    const op = buildAgentStreamSubmitOp({
      activeSessionId: "session-reasoning-1",
      content: "继续",
      images: [],
      eventName: "aster_stream_reasoning",
      submitWorkspaceId: "workspace-1",
      requestTurnId: "turn-reasoning-1",
      skipPreSubmitResume: true,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "o3-mini",
      reasoningEffort: " high ",
    });

    expect(op.preferences?.reasoningEffort).toBe("high");
  });

  it("显式搜索命令应把 web search 偏好写入 user_input preferences", () => {
    const op = buildAgentStreamSubmitOp({
      activeSessionId: "session-search-1",
      content: "@搜索 关键词:AI 行业新闻",
      images: [],
      eventName: "aster_stream_search",
      submitWorkspaceId: "workspace-1",
      requestTurnId: "turn-search-1",
      skipPreSubmitResume: true,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
      webSearch: true,
      searchMode: "allowed",
      explicitToolPreferences: true,
    });

    expect(op.preferences?.webSearch).toBe(true);
    expect(op.preferences?.searchMode).toBe("allowed");
  });

  it("应在最终 submit 边界把 thread goal 绑定到真实 session id", () => {
    const op = buildAgentStreamSubmitOp({
      activeSessionId: "session-real-1",
      content: "请按目标推进",
      images: [],
      eventName: "aster_stream_goal",
      requestTurnId: "turn-goal-1",
      requestMetadata: {
        harness: {
          goal_mode_enabled: true,
          thread_goal: {
            enabled: true,
            source: "empty_state",
            status: "active",
            set: {
              threadId: "draft-send-1",
              objective: null,
              status: "active",
              tokenBudget: null,
            },
          },
          goal: {
            enabled: true,
            source: "empty_state",
            status: "active",
            set: {
              threadId: "draft-send-1",
              objective: null,
              status: "active",
              tokenBudget: null,
            },
          },
        },
      },
      skipPreSubmitResume: true,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-chat",
    });

    expect(op.sessionId).toBe("session-real-1");
    expect(op.metadata).toMatchObject({
      harness: {
        goal_mode_enabled: true,
        thread_goal: {
          enabled: true,
          source: "empty_state",
          status: "active",
          set: {
            threadId: "session-real-1",
            objective: null,
            status: "active",
            tokenBudget: null,
          },
        },
        goal: {
          enabled: true,
          source: "empty_state",
          status: "active",
          set: {
            threadId: "session-real-1",
            objective: null,
            status: "active",
            tokenBudget: null,
          },
        },
      },
    });
  });
});
