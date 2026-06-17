import { describe, expect, it } from "vitest";
import { buildSubmitOpRuntimeCompaction } from "./submitOpRuntimeCompaction";

describe("submitOpRuntimeCompaction", () => {
  it("应裁掉已经由 session/runtime 承接的 steady-state 提交字段", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          turn_purpose: "content_review",
          preferences: {
            web_search: false,
            thinking: true,
            task: false,
            subagent: true,
          },
          theme: "general",
          session_mode: "general_workbench",
          gate_key: "write_mode",
          run_title: "社媒初稿",
          content_id: "content-social-1",
          preferred_team_preset_id: "social-preset",
          selected_team_id: "team-social-1",
          selected_team_source: "builtin",
          selected_team_label: "社媒执行团队",
          selected_team_description: "负责选题、写作和校对。",
          selected_team_summary: "负责选题、写作和校对。",
          selected_team_roles: [
            {
              id: "role-1",
              label: "写手",
              summary: "负责起草正文",
              profile_id: "writer",
              role_key: "writer",
              skill_ids: ["draft"],
            },
          ],
        },
      },
      executionRuntime: {
        session_id: "session-social-1",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
        recent_preferences: {
          webSearch: false,
          thinking: true,
          task: false,
          subagent: true,
        },
        recent_team_selection: {
          disabled: false,
          preferredTeamPresetId: "social-preset",
          selectedTeamId: "team-social-1",
          selectedTeamSource: "builtin",
          selectedTeamLabel: "社媒执行团队",
          selectedTeamDescription: "负责选题、写作和校对。",
          selectedTeamSummary: "负责选题、写作和校对。",
          selectedTeamRoles: [
            {
              id: "role-1",
              label: "写手",
              summary: "负责起草正文",
              profileId: "writer",
              roleKey: "writer",
              skillIds: ["draft"],
            },
          ],
        },
        recent_theme: "general",
        recent_session_mode: "general_workbench",
        recent_gate_key: "write_mode",
        recent_run_title: "社媒初稿",
        recent_content_id: "content-social-1",
      },
      syncedRecentPreferences: {
        task: false,
        subagent: true,
      },
      syncedSessionModelPreference: {
        providerType: "openai",
        model: "gpt-4.1",
      },
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-4.1",
    });

    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(false);
    expect(result.shouldSubmitExecutionStrategy).toBe(false);
    expect(result.shouldSubmitWebSearch).toBe(false);
    expect(result.shouldSubmitThinking).toBe(false);
    expect(result.metadata).toEqual({
      harness: {
        turn_purpose: "content_review",
      },
    });
  });

  it("runtime 快照相同但 session 模型尚未同步时仍应提交当前 provider/model", () => {
    const result = buildSubmitOpRuntimeCompaction({
      executionRuntime: {
        session_id: "session-model-pending",
        source: "runtime_snapshot",
        provider_selector: "deepseek",
        model_name: "deepseek-v4-flash",
        execution_strategy: "react",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-flash",
    });

    expect(result.shouldSubmitProviderPreference).toBe(true);
    expect(result.shouldSubmitModelPreference).toBe(true);
  });

  it("本地历史导入来源模型不应裁掉当前 provider/model 提交", () => {
    const result = buildSubmitOpRuntimeCompaction({
      executionRuntime: {
        session_id: "session-imported-source-runtime",
        source: "session",
        provider_name: "openai",
        model_name: "gpt-5.4",
        source_client: "codex",
        imported_continuation: {
          modelProvider: "openai",
          model: "gpt-5.4",
        },
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "custom-current-provider",
      effectiveModel: "gpt-5.5",
    });

    expect(result.shouldSubmitProviderPreference).toBe(true);
    expect(result.shouldSubmitModelPreference).toBe(true);
  });

  it("camelCase 本地历史导入来源模型不应裁掉当前 provider/model 提交", () => {
    const result = buildSubmitOpRuntimeCompaction({
      executionRuntime: {
        session_id: "session-imported-source-runtime-camel",
        source: "session",
        provider_name: "openai",
        model_name: "gpt-5.4",
        sourceClient: "codex",
        importedContinuation: {
          modelProvider: "openai",
          model: "gpt-5.4",
        },
      } as never,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "custom-current-provider",
      effectiveModel: "gpt-5.5",
    });

    expect(result.shouldSubmitProviderPreference).toBe(true);
    expect(result.shouldSubmitModelPreference).toBe(true);
  });

  it("应迁移未同步的旧 thinking preference，并保留其他显式变更 metadata", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          preferences: {
            thinking: true,
          },
          theme: "general",
          session_mode: "general_workbench",
          gate_key: "publish_confirm",
          run_title: "发布确认",
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
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5",
      modelOverride: "gpt-5",
    });

    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(true);
    expect(result.shouldSubmitExecutionStrategy).toBe(false);
    expect(result.shouldSubmitWebSearch).toBe(false);
    expect(result.shouldSubmitThinking).toBe(true);
    expect(result.thinkingPreference).toBe(true);
    expect(result.metadata).toEqual({
      harness: {
        gate_key: "publish_confirm",
        run_title: "发布确认",
      },
    });
  });

  it("直接收到 legacy effective execution strategy 时也应归一后比较", () => {
    const result = buildSubmitOpRuntimeCompaction({
      executionRuntime: {
        session_id: "session-legacy-strategy",
        source: "runtime_snapshot",
        execution_strategy: "react",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "code_orchestrated" as never,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(result.shouldSubmitExecutionStrategy).toBe(false);
  });

  it("新会话 current 默认 react 策略不应作为输入框选择提交", () => {
    const result = buildSubmitOpRuntimeCompaction({
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
    });

    expect(result.shouldSubmitExecutionStrategy).toBe(false);
  });

  it("execution_runtime 缺失时只裁掉 synced task/subagent，搜索和思考迁移到正式配置", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          preferences: {
            web_search: false,
            thinking: true,
            task: true,
            subagent: false,
          },
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: {
        task: true,
        subagent: false,
      },
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(result.shouldSubmitWebSearch).toBe(false);
    expect(result.shouldSubmitThinking).toBe(true);
    expect(result.thinkingPreference).toBe(true);
    expect(result.metadata).toBeUndefined();
  });

  it("新会话默认关闭搜索时不应提交显式 web_search=false", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          preferences: {
            web_search: false,
            thinking: false,
          },
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(result.shouldSubmitWebSearch).toBe(false);
    expect(result.shouldSubmitThinking).toBe(false);
    expect(result.metadata).toBeUndefined();
  });

  it("未同步 runtime 时应提交显式开启的搜索和思考开关", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          preferences: {
            web_search: true,
            thinking: true,
          },
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(result.shouldSubmitWebSearch).toBe(true);
    expect(result.shouldSubmitThinking).toBe(true);
    expect(result.metadata).toBeUndefined();
  });

  it("runtime 偏好不同步时应提交本轮搜索和思考差异", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          preferences: {
            webSearch: false,
            thinkingEnabled: true,
          },
        },
      },
      executionRuntime: {
        session_id: "session-pref-diff",
        source: "runtime_snapshot",
        recent_preferences: {
          webSearch: true,
          thinking: false,
          task: false,
          subagent: false,
        },
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(result.shouldSubmitWebSearch).toBe(true);
    expect(result.shouldSubmitThinking).toBe(true);
    expect(result.metadata).toBeUndefined();
  });

  it("access_mode 已同步时应从 metadata 裁掉，未同步时应保留", () => {
    const syncedResult = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          access_mode: "read-only",
          theme: "general",
        },
      },
      executionRuntime: {
        session_id: "session-access-synced",
        source: "runtime_snapshot",
        recent_access_mode: "read-only",
        recent_theme: "general",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(syncedResult.metadata).toBeUndefined();

    const pendingResult = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          access_mode: "read-only",
          theme: "general",
        },
      },
      executionRuntime: {
        session_id: "session-access-pending",
        source: "runtime_snapshot",
        recent_access_mode: "full-access",
        recent_theme: "general",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(pendingResult.metadata).toEqual({
      harness: {
        access_mode: "read-only",
      },
    });
  });

  it("快速响应路由应让后端解析服务模型，不应把前端当前模型作为本轮 request preference", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          fast_response_routing: {
            service_model_slot: "responsive_chat",
            routing_slot: "responsive_chat_model",
            resolver: "backend_service_model",
          },
          browser_assist: {
            enabled: true,
            profile_key: "general_browser_assist",
          },
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-pro",
    });

    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(false);
    expect(result.metadata).toEqual({
      harness: {
        fast_response_routing: {
          service_model_slot: "responsive_chat",
          routing_slot: "responsive_chat_model",
          resolver: "backend_service_model",
          fallback_provider_preference: "deepseek",
          fallback_model_preference: "deepseek-v4-pro",
        },
        browser_assist: {
          enabled: true,
          profile_key: "general_browser_assist",
        },
      },
    });
  });

  it("快速响应路由不应压过显式模型覆盖", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          fastResponseRouting: {
            serviceModelSlot: "responsive_chat",
            routingSlot: "responsive_chat_model",
          },
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4-mini",
      modelOverride: "gpt-5.4-mini",
    });

    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(true);
  });

  it("只有模型没有 provider 时不应提交半截模型偏好", () => {
    const result = buildSubmitOpRuntimeCompaction({
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "",
      effectiveModel: "gpt-5.5",
    });

    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(false);
  });

  it("只有 provider 没有模型时不应提交半截 provider/model 偏好", () => {
    const result = buildSubmitOpRuntimeCompaction({
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "",
    });

    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(false);
  });

  it("图片生成命令新会话应提交编排聊天模型 provider_config，但不锁定图片模型偏好", () => {
    const requestMetadata = {
      harness: {
        image_skill_launch: {
          skill_name: "image_generate",
          kind: "image_task",
          image_task: {
            prompt: "生成一张公众号封面",
            provider_id: "openai",
            model: "gpt-image-2",
            runtime_contract: {
              contract_key: "image_generation",
              routing_slot: "image_generation_model",
              required_capabilities: [
                "text_generation",
                "image_generation",
                "vision_input",
              ],
            },
          },
        },
      },
    };

    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata,
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-flash",
    });

    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(false);
    expect(result.providerConfig).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-flash",
    });
    expect(result.metadata).toBe(requestMetadata);
  });

  it("图片生成命令已有会话模型时不重复提交编排 provider_config", () => {
    const requestMetadata = {
      harness: {
        image_skill_launch: {
          skill_name: "image_generate",
          image_task: {
            prompt: "生成一张公众号封面",
            provider_id: "fal",
            model: "fal-ai/nano-banana-pro",
            runtime_contract: {
              contract_key: "image_generation",
              routing_slot: "image_generation_model",
            },
          },
        },
      },
    };

    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata,
      executionRuntime: {
        session_id: "session-image-1",
        source: "runtime_snapshot",
        provider_selector: "deepseek",
        model_name: "deepseek-v4-flash",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: {
        providerType: "deepseek",
        model: "deepseek-v4-flash",
      },
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-flash",
    });

    expect(result.providerConfig).toBeUndefined();
    expect(result.shouldSubmitProviderPreference).toBe(false);
    expect(result.shouldSubmitModelPreference).toBe(false);
  });

  it("应将 legacy general workbench alias runtime 视为 general_workbench 做裁剪", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          theme: "general",
          session_mode: "general_workbench",
          gate_key: "write_mode",
        },
      },
      executionRuntime: {
        session_id: "session-social-legacy",
        source: "runtime_snapshot",
        recent_session_mode: "theme_workbench",
        recent_gate_key: "write_mode",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
    });

    expect(result.metadata).toEqual({
      harness: {
        theme: "general",
      },
    });
  });

  it("不应裁掉仅存在于请求侧的 team_memory_shadow", () => {
    const result = buildSubmitOpRuntimeCompaction({
      requestMetadata: {
        harness: {
          preferred_team_preset_id: "code-triage-team",
          selected_team_id: "team-code-1",
          selected_team_source: "builtin",
          selected_team_label: "代码排障 profile",
          selected_team_summary: "分析、实现、验证三段推进。",
          selected_team_roles: [
            {
              id: "explorer",
              label: "分析",
              summary: "负责定位问题。",
            },
          ],
          team_memory_shadow: {
            repo_scope: "/tmp/repo",
            entries: [
              {
                key: "team.selection",
                content: "Team：代码排障 profile",
                updated_at: 1,
              },
            ],
          },
        },
      },
      executionRuntime: {
        session_id: "session-code-1",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
        recent_preferences: {
          task: false,
          subagent: true,
        },
        recent_team_selection: {
          disabled: false,
          preferredTeamPresetId: "code-triage-team",
          selectedTeamId: "team-code-1",
          selectedTeamSource: "builtin",
          selectedTeamLabel: "代码排障 profile",
          selectedTeamSummary: "分析、实现、验证三段推进。",
          selectedTeamRoles: [
            {
              id: "explorer",
              label: "分析",
              summary: "负责定位问题。",
            },
          ],
        },
      },
      syncedRecentPreferences: {
        task: false,
        subagent: true,
      },
      syncedSessionModelPreference: {
        providerType: "openai",
        model: "gpt-4.1",
      },
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-4.1",
    });

    expect(result.metadata).toEqual({
      harness: {
        team_memory_shadow: {
          repo_scope: "/tmp/repo",
          entries: [
            {
              key: "team.selection",
              content: "Team：代码排障 profile",
              updated_at: 1,
            },
          ],
        },
      },
    });
  });
});
