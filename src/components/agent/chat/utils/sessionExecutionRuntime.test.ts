import { describe, expect, it } from "vitest";
import {
  applyModelChangeExecutionRuntime,
  getExecutionRuntimeDisplayLabel,
  applyTurnContextExecutionRuntime,
  createExecutionRuntimeFromSessionDetail,
  createChatToolPreferencesFromExecutionRuntime,
  createSessionRecentPreferencesFromChatToolPreferences,
  createSessionRecentTeamSelectionFromTeamDefinition,
  createSessionModelPreferenceFromExecutionRuntime,
  createTeamDefinitionFromExecutionRuntimeRecentTeamSelection,
  getExecutionRuntimeProviderLabel,
  getExecutionRuntimeSummaryLabel,
  getOutputSchemaRuntimeLabel,
} from "./sessionExecutionRuntime";
import { createTeamDefinitionFromPreset } from "./teamDefinitions";

describe("sessionExecutionRuntime", () => {
  it("应根据 turn_context 事件同步 output schema runtime", () => {
    const runtime = applyTurnContextExecutionRuntime(null, {
      type: "turn_context",
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      output_schema_runtime: {
        source: "turn",
        strategy: "native",
        providerName: "openai",
        modelName: "gpt-5.4",
      },
    });

    expect(runtime).toMatchObject({
      session_id: "session-1",
      source: "turn_context",
      provider_name: "openai",
      model_name: "gpt-5.4",
      latest_turn_id: "turn-1",
      latest_turn_status: "running",
    });
  });

  it("应将 turn_context 里的 legacy execution strategy 归一到 current react", () => {
    const runtime = applyTurnContextExecutionRuntime(null, {
      type: "turn_context",
      session_id: "session-code",
      thread_id: "thread-code",
      turn_id: "turn-code",
      execution_strategy: "code_orchestrated" as never,
      output_schema_runtime: null,
    });

    expect(runtime).toMatchObject({
      session_id: "session-code",
      source: "turn_context",
      execution_strategy: "react",
      latest_turn_id: "turn-code",
      latest_turn_status: "running",
    });
  });

  it("应在 model_change 后保留 provider 与 output schema，并更新模型", () => {
    const fromTurnContext = applyTurnContextExecutionRuntime(null, {
      type: "turn_context",
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      output_schema_runtime: {
        source: "session",
        strategy: "final_output_tool",
        providerName: "openai",
        modelName: "gpt-5.4",
      },
    });

    const runtime = applyModelChangeExecutionRuntime(fromTurnContext, {
      type: "model_change",
      model: "gpt-5.4-mini",
      mode: "responses",
    });

    expect(runtime).toMatchObject({
      session_id: "session-1",
      source: "model_change",
      provider_name: "openai",
      model_name: "gpt-5.4-mini",
      mode: "responses",
    });
    expect(runtime?.output_schema_runtime?.strategy).toBe("final_output_tool");
  });

  it("应产出可读的 provider 与 schema 标签", () => {
    const runtime = {
      session_id: "session-2",
      provider_selector: "openai",
      provider_name: "openai",
      model_name: "gpt-5.4",
      source: "runtime_snapshot" as const,
      output_schema_runtime: {
        source: "turn" as const,
        strategy: "native" as const,
        providerName: "openai",
        modelName: "gpt-5.4",
      },
    };

    expect(getExecutionRuntimeProviderLabel(runtime)).toBe("OpenAI");
    expect(getExecutionRuntimeSummaryLabel(runtime)).toBe(
      "执行模型 OpenAI · gpt-5.4",
    );
    expect(getExecutionRuntimeDisplayLabel(runtime)).toBe(
      "最近执行模型 OpenAI · gpt-5.4",
    );
    expect(getExecutionRuntimeDisplayLabel(runtime, { active: true })).toBe(
      "实际执行模型 OpenAI · gpt-5.4",
    );
    expect(getOutputSchemaRuntimeLabel(runtime.output_schema_runtime)).toBe(
      "Native schema · turn contract",
    );
  });

  it("应优先使用 provider_selector 还原会话模型偏好", () => {
    expect(
      createSessionModelPreferenceFromExecutionRuntime({
        provider_selector: "custom-provider-id",
        provider_name: "openai",
        model_name: "gpt-5.4",
      }),
    ).toEqual({
      providerType: "custom-provider-id",
      model: "gpt-5.4",
    });
  });

  it("本地历史导入来源模型不应伪装为当前会话模型偏好", () => {
    expect(
      createSessionModelPreferenceFromExecutionRuntime({
        provider_selector: null,
        provider_name: "openai",
        model_name: "gpt-5.4",
        source_client: "codex",
        imported_continuation: {
          modelProvider: "openai",
          model: "gpt-5.4",
        },
      }),
    ).toBeNull();
  });

  it("camelCase 本地历史导入来源模型同样不应伪装为当前会话模型偏好", () => {
    expect(
      createSessionModelPreferenceFromExecutionRuntime({
        provider_selector: null,
        provider_name: "openai",
        model_name: "gpt-5.4",
        sourceClient: "codex",
        importedContinuation: {
          modelProvider: "openai",
          model: "gpt-5.4",
        },
      } as never),
    ).toBeNull();
  });

  it("本地历史导入会话已写入当前 provider_selector 后可还原模型偏好", () => {
    expect(
      createSessionModelPreferenceFromExecutionRuntime({
        provider_selector: "custom-current-provider",
        provider_name: "openai",
        model_name: "gpt-5.4",
        source_client: "codex",
        imported_continuation: {
          modelProvider: "openai",
          model: "gpt-5.4",
        },
      }),
    ).toEqual({
      providerType: "custom-current-provider",
      model: "gpt-5.4",
    });
  });

  it("应将 legacy general workbench alias recent_session_mode 归一为 general_workbench", () => {
    expect(
      createExecutionRuntimeFromSessionDetail({
        execution_runtime: {
          session_id: "session-legacy",
          source: "session",
          recent_session_mode: "theme_workbench",
        },
      }),
    ).toMatchObject({
      session_id: "session-legacy",
      recent_session_mode: "general_workbench",
    });
  });

  it("缺少 provider 或 model 时不应生成会话模型偏好", () => {
    expect(
      createSessionModelPreferenceFromExecutionRuntime({
        provider_selector: "openai",
        model_name: null,
      }),
    ).toBeNull();
    expect(
      createSessionModelPreferenceFromExecutionRuntime({
        provider_selector: null,
        provider_name: null,
        model_name: "gpt-5.4",
      }),
    ).toBeNull();
  });

  it("应从 execution runtime 提取最近任务偏好并丢弃旧搜索/思考偏好", () => {
    expect(
      createChatToolPreferencesFromExecutionRuntime({
        recent_preferences: {
          webSearch: true,
          thinking: true,
          task: false,
          subagent: true,
        },
      }),
    ).toEqual({
      task: false,
      subagent: true,
    });
  });

  it("legacy code_orchestrated 会话恢复时不再自动打开任务与子代理偏好", () => {
    expect(
      createChatToolPreferencesFromExecutionRuntime({
        execution_strategy: "code_orchestrated" as never,
        recent_preferences: {
          task: false,
          subagent: false,
        },
      }),
    ).toEqual({
      task: false,
      subagent: false,
    });
  });

  it("应把工具偏好转换成 session recent_preferences 请求载荷并丢弃旧搜索/思考开关", () => {
    expect(
      createSessionRecentPreferencesFromChatToolPreferences({
        task: true,
        subagent: false,
      }),
    ).toEqual({
      task: true,
      subagent: false,
    });
  });

  it("应从 execution runtime 的 recent_team_selection 还原自定义 Team", () => {
    expect(
      createTeamDefinitionFromExecutionRuntimeRecentTeamSelection({
        disabled: false,
        theme: "general",
        preferredTeamPresetId: "code-triage-team",
        selectedTeamId: "custom-team-1",
        selectedTeamSource: "custom",
        selectedTeamLabel: "前端联调团队",
        selectedTeamDescription: "分析、实现、验证三段式推进。",
        selectedTeamRoles: [
          {
            id: "explorer",
            label: "分析",
            summary: "负责定位问题与影响范围。",
            profileId: "code-explorer",
            roleKey: "explorer",
            skillIds: ["repo-exploration"],
          },
        ],
      }),
    ).toEqual({
      id: "custom-team-1",
      source: "custom",
      label: "前端联调团队",
      description: "分析、实现、验证三段式推进。",
      theme: "general",
      presetId: "code-triage-team",
      roles: [
        {
          id: "explorer",
          label: "分析",
          summary: "负责定位问题与影响范围。",
          profileId: "code-explorer",
          roleKey: "explorer",
          skillIds: ["repo-exploration"],
        },
      ],
      updatedAt: expect.any(Number),
    });
  });

  it("应把 TeamDefinition 转成 session recent_team_selection 请求载荷", () => {
    const builtinTeam = createTeamDefinitionFromPreset("code-triage-team");

    expect(
      createSessionRecentTeamSelectionFromTeamDefinition(
        builtinTeam,
        "general",
      ),
    ).toEqual({
      disabled: false,
      theme: "general",
      preferredTeamPresetId: "code-triage-team",
      selectedTeamId: "code-triage-team",
      selectedTeamSource: "builtin",
      selectedTeamLabel: "代码排障 profile",
      selectedTeamDescription: builtinTeam?.description,
      selectedTeamSummary: expect.any(String),
      selectedTeamRoles: expect.arrayContaining([
        expect.objectContaining({
          id: "explorer",
          label: "分析",
          profileId: "code-explorer",
        }),
      ]),
    });
  });

  it("空 Team 应转换成显式 disabled recent_team_selection", () => {
    expect(
      createSessionRecentTeamSelectionFromTeamDefinition(null, "general"),
    ).toEqual({
      disabled: true,
      theme: "general",
    });
  });
});
