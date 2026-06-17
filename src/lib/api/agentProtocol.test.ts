import { describe, expect, it } from "vitest";
import {
  createSubmitTurnRequestFromAgentOp,
  parseAgentEvent,
} from "./agentProtocol";

describe("agentProtocol", () => {
  it("应将 AgentOp.user_input 适配为现有 runtime submit request", () => {
    expect(
      createSubmitTurnRequestFromAgentOp({
        type: "user_input",
        text: "继续处理这段对话",
        sessionId: "session-1",
        eventName: "aster_stream_session-1",
        workspaceId: "workspace-1",
        turnId: "turn-1",
        preferences: {
          providerPreference: "openai",
          modelPreference: "gpt-5.4",
          thinking: true,
          webSearch: false,
          approvalPolicy: "on-request",
          sandboxPolicy: "workspace-write",
          executionStrategy: "react",
          autoContinue: {
            enabled: true,
            fast_mode_enabled: false,
            continuation_length: 3,
            sensitivity: 0.6,
          },
        },
        systemPrompt: "保持简洁",
        metadata: {
          harness: {
            theme: "general",
          },
        },
        queueIfBusy: true,
        queuedTurnId: "queued-1",
        skipPreSubmitResume: true,
      }),
    ).toEqual({
      message: "继续处理这段对话",
      session_id: "session-1",
      event_name: "aster_stream_session-1",
      workspace_id: "workspace-1",
      turn_id: "turn-1",
      turn_config: {
        provider_preference: "openai",
        model_preference: "gpt-5.4",
        thinking_enabled: true,
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
        execution_strategy: "react",
        web_search: false,
        auto_continue: {
          enabled: true,
          fast_mode_enabled: false,
          continuation_length: 3,
          sensitivity: 0.6,
        },
        system_prompt: "保持简洁",
        metadata: {
          harness: {
            theme: "general",
          },
        },
      },
      queue_if_busy: true,
      queued_turn_id: "queued-1",
      skip_pre_submit_resume: true,
    });
  });

  it("应透传显式联网搜索模式而不是从文本关键词推断", () => {
    expect(
      createSubmitTurnRequestFromAgentOp({
        type: "user_input",
        text: "请搜索最新 AI 新闻",
        sessionId: "session-search",
        eventName: "aster_stream_session-search",
        preferences: {
          webSearch: true,
          searchMode: "required",
        },
      }).turn_config,
    ).toMatchObject({
      web_search: true,
      search_mode: "required",
    });
  });

  it("应把模型推理强度写入 runtime turn_config", () => {
    expect(
      createSubmitTurnRequestFromAgentOp({
        type: "user_input",
        text: "继续",
        sessionId: "session-reasoning",
        eventName: "aster_stream_reasoning",
        preferences: {
          reasoningEffort: "high",
        },
      }).turn_config,
    ).toMatchObject({
      reasoning_effort: "high",
    });
  });

  it("应把编排 provider_config 透传到 runtime turn_config", () => {
    expect(
      createSubmitTurnRequestFromAgentOp({
        type: "user_input",
        text: "@Nanobanana Pro 生成一张广州塔春天照片",
        sessionId: "session-image-1",
        eventName: "aster_stream_image",
        preferences: {
          providerConfig: {
            provider_id: "deepseek",
            provider_name: "deepseek",
            model_name: "deepseek-v4-pro",
          },
        },
      }).turn_config?.provider_config,
    ).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-pro",
    });
  });

  it("缺少 workspaceId 时不应在 runtime submit request 中生成 workspace_id", () => {
    expect(
      createSubmitTurnRequestFromAgentOp({
        type: "user_input",
        text: "继续处理这段对话",
        sessionId: "session-1",
        eventName: "aster_stream_session-1",
        preferences: {
          webSearch: true,
        },
      }),
    ).toEqual({
      message: "继续处理这段对话",
      session_id: "session-1",
      event_name: "aster_stream_session-1",
      turn_config: {
        web_search: true,
        system_prompt: undefined,
        metadata: undefined,
        provider_preference: undefined,
        model_preference: undefined,
        thinking_enabled: undefined,
        approval_policy: undefined,
        sandbox_policy: undefined,
        execution_strategy: undefined,
        auto_continue: undefined,
      },
      queue_if_busy: undefined,
      queued_turn_id: undefined,
      skip_pre_submit_resume: undefined,
      turn_id: undefined,
      images: undefined,
    });
  });

  it("应沿用现有流式解析逻辑解析 AgentEvent", () => {
    expect(
      parseAgentEvent({
        type: "artifact_snapshot",
        artifact: {
          artifact_id: "artifact-1",
          file_path: "drafts/demo.md",
          metadata: {
            complete: false,
          },
        },
      }),
    ).toEqual({
      type: "artifact_snapshot",
      artifact: {
        artifactId: "artifact-1",
        filePath: "drafts/demo.md",
        content: undefined,
        metadata: {
          complete: false,
        },
      },
    });
  });

  it("应解析批量正文增量事件并兼容缺失 chunks", () => {
    expect(
      parseAgentEvent({
        type: "text_delta_batch",
        text: "第一段\n",
        chunks: ["第一段", "\n"],
        boundary: "newline",
      }),
    ).toEqual({
      type: "text_delta_batch",
      text: "第一段\n",
      chunks: ["第一段", "\n"],
      boundary: "newline",
    });

    expect(
      parseAgentEvent({
        type: "text_delta_batch",
        text: "尾段",
      }),
    ).toEqual({
      type: "text_delta_batch",
      text: "尾段",
      chunks: ["尾段"],
      boundary: "provider",
    });
  });

  it("应解析工具进度与工具输出增量事件", () => {
    expect(
      parseAgentEvent({
        type: "tool_input_delta",
        tool_id: "tool-1",
        tool_name: "read_file",
        delta: '{"path"',
        accumulated_arguments: '{"path"',
        provider: "openai_compatible",
      }),
    ).toEqual({
      type: "tool_input_delta",
      tool_id: "tool-1",
      tool_name: "read_file",
      delta: '{"path"',
      accumulated_arguments: '{"path"',
      provider: "openai_compatible",
    });

    expect(
      parseAgentEvent({
        type: "tool_progress",
        tool_id: "tool-1",
        progress: {
          message: "正在处理第 2 项",
          progress: 2,
          total: 4,
          metadata: {
            notification_kind: "mcp_progress",
          },
        },
      }),
    ).toEqual({
      type: "tool_progress",
      tool_id: "tool-1",
      progress: {
        message: "正在处理第 2 项",
        progress: 2,
        total: 4,
        metadata: {
          notification_kind: "mcp_progress",
        },
      },
    });

    expect(
      parseAgentEvent({
        type: "tool_output_delta",
        tool_id: "tool-1",
        delta: "partial output",
        output_kind: "log",
        metadata: {
          notification_kind: "mcp_log",
        },
      }),
    ).toEqual({
      type: "tool_output_delta",
      tool_id: "tool-1",
      delta: "partial output",
      output_kind: "log",
      metadata: {
        notification_kind: "mcp_log",
      },
    });
  });

  it("应兼容 App Server 透传的工具开始与工具结果事件", () => {
    expect(
      parseAgentEvent({
        type: "tool_started",
        tool_id: "tool-1",
        tool_name: "WebSearch",
        arguments: {
          query: "2026年6月7日 国际新闻",
        },
      }),
    ).toEqual({
      type: "tool_start",
      tool_id: "tool-1",
      tool_name: "WebSearch",
      arguments: '{"query":"2026年6月7日 国际新闻"}',
    });

    expect(
      parseAgentEvent({
        type: "tool_result",
        tool_id: "tool-1",
        result: {
          success: true,
          output: "ok",
          metadata: {
            source: "web_search",
          },
        },
      }),
    ).toEqual({
      type: "tool_end",
      tool_id: "tool-1",
      result: {
        success: true,
        output: "ok",
        error: undefined,
        images: undefined,
        metadata: {
          source: "web_search",
        },
      },
    });

    expect(
      parseAgentEvent({
        type: "tool.result",
        toolId: "tool-2",
        output: {
          total: 2,
        },
      }),
    ).toEqual({
      type: "tool_end",
      tool_id: "tool-2",
      result: {
        success: true,
        output: '{"total":2}',
        error: undefined,
        images: undefined,
        metadata: undefined,
      },
    });
  });

  it("应解析 turn_context 的结构化 context summary", () => {
    expect(
      parseAgentEvent({
        type: "turn_context",
        session_id: "session-ctx",
        thread_id: "thread-ctx",
        turn_id: "turn-ctx",
        execution_strategy: "code_orchestrated",
        output_schema_runtime: null,
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
        context_summary: {
          memory_budget: {
            used_tokens: 640,
            max_tokens: 1200,
            status: "ready",
            source: "knowledge_context_resolver",
          },
          missing_context: [
            {
              id: "knowledge_warning:0",
              kind: "knowledge_warning",
              label: "sources/missing.md",
              status: "unknown",
              reason: "缺少来源",
              source: "knowledge_context_resolver",
            },
          ],
          retrieval_refs: [
            {
              source_id: "knowledge_pack:brand:compiled/splits/brief.md",
              kind: "knowledge_pack",
              title: "brand:brief",
              path: "compiled/splits/brief.md",
              scope: "workspace",
              status: "ready",
              source: "knowledge_context_resolver",
            },
          ],
          team_memory_refs: [
            {
              key: "team.selection",
              repo_scope: "/repo/lime",
              updated_at: 1710000000,
              source: "team_memory_shadow",
            },
          ],
        },
      }),
    ).toEqual({
      type: "turn_context",
      session_id: "session-ctx",
      thread_id: "thread-ctx",
      turn_id: "turn-ctx",
      execution_strategy: "react",
      output_schema_runtime: null,
      approval_policy: "on-request",
      sandbox_policy: "workspace-write",
      context_summary: {
        memory_budget: {
          used_tokens: 640,
          max_tokens: 1200,
          status: "ready",
          source: "knowledge_context_resolver",
        },
        missing_context: [
          {
            id: "knowledge_warning:0",
            kind: "knowledge_warning",
            label: "sources/missing.md",
            status: "unknown",
            reason: "缺少来源",
            source: "knowledge_context_resolver",
          },
        ],
        retrieval_refs: [
          {
            source_id: "knowledge_pack:brand:compiled/splits/brief.md",
            kind: "knowledge_pack",
            title: "brand:brief",
            path: "compiled/splits/brief.md",
            scope: "workspace",
            status: "ready",
            source: "knowledge_context_resolver",
          },
        ],
        team_memory_refs: [
          {
            key: "team.selection",
            repo_scope: "/repo/lime",
            updated_at: 1710000000,
            source: "team_memory_shadow",
          },
        ],
      },
    });
  });

  it("应拒绝 turn_context 中未知的 execution_strategy", () => {
    expect(
      parseAgentEvent({
        type: "turn_context",
        session_id: "session-ctx",
        thread_id: "thread-ctx",
        turn_id: "turn-ctx",
        execution_strategy: "code-workbench",
      }),
    ).toMatchObject({
      type: "turn_context",
      execution_strategy: null,
    });
  });

  it("应解析 action_required 的 scope，并兼容嵌套 data.scope", () => {
    expect(
      parseAgentEvent({
        type: "action_required",
        request_id: "req-scope-1",
        action_type: "ask_user",
        scope: {
          sessionId: "session-1",
          thread_id: "thread-1",
          turnId: "turn-1",
        },
        prompt: "请选择执行模式",
        questions: [{ question: "请选择执行模式" }],
      }),
    ).toMatchObject({
      type: "action_required",
      request_id: "req-scope-1",
      action_type: "ask_user",
      prompt: "请选择执行模式",
      scope: {
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
      },
    });

    expect(
      parseAgentEvent({
        type: "action_required",
        data: {
          id: "req-scope-2",
          type: "elicitation",
          message: "请补充发布渠道",
          requested_schema: {
            type: "object",
            properties: {
              channel: {
                type: "string",
              },
            },
          },
          scope: {
            session_id: "session-2",
            threadId: "thread-2",
          },
        },
      }),
    ).toMatchObject({
      type: "action_required",
      request_id: "req-scope-2",
      action_type: "elicitation",
      prompt: "请补充发布渠道",
      requested_schema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
          },
        },
      },
      scope: {
        session_id: "session-2",
        thread_id: "thread-2",
      },
    });
  });

  it("应解析 action_resolved 的结构化 plan approval response", () => {
    expect(
      parseAgentEvent({
        type: "action_resolved",
        request_id: "plan-req-1",
        action_type: "plan_approval",
        data: {
          decision_kind: "plan_approval_response",
          approved: false,
          feedback: "请补充验收项",
          permissionMode: "default",
          scope: {
            sessionId: "child-1",
          },
        },
      }),
    ).toEqual({
      type: "action_resolved",
      request_id: "plan-req-1",
      action_type: "plan_approval",
      scope: {
        session_id: "child-1",
        thread_id: undefined,
        turn_id: undefined,
      },
      approved: false,
      feedback: "请补充验收项",
      permission_mode: "default",
      data: {
        decision_kind: "plan_approval_response",
        approved: false,
        feedback: "请补充验收项",
        permissionMode: "default",
        scope: {
          sessionId: "child-1",
        },
      },
    });
  });

  it("兼容嵌套 artifact_snapshot 结构", () => {
    expect(
      parseAgentEvent({
        type: "artifact_snapshot",
        artifact: {
          artifactId: "artifact-1",
          filePath: "drafts/demo.md",
          content: "# 标题",
          metadata: {
            complete: false,
            writePhase: "streaming",
          },
        },
      }),
    ).toEqual({
      type: "artifact_snapshot",
      artifact: {
        artifactId: "artifact-1",
        filePath: "drafts/demo.md",
        content: "# 标题",
        metadata: {
          complete: false,
          writePhase: "streaming",
        },
      },
    });
  });

  it("应解析 runtime_status 与 thinking_delta 事件", () => {
    expect(
      parseAgentEvent({
        type: "runtime_status",
        status: {
          phase: "routing",
          title: "已决定：先深度思考",
          detail: "先做意图理解，再决定是否搜索。",
          checkpoints: ["thinking 已开启", "搜索保持候选状态"],
        },
      }),
    ).toEqual({
      type: "runtime_status",
      status: {
        phase: "routing",
        title: "先深度思考",
        detail: "先做意图理解，再决定是否搜索。",
        checkpoints: ["thinking 已开启", "搜索保持候选状态"],
      },
    });

    expect(
      parseAgentEvent({
        type: "runtime_status",
        status: {
          phase: "permission_review",
          title: "运行时权限需要确认",
          detail: "当前执行画像声明了 2 项权限。",
          metadata: {
            permission_status: "requires_confirmation",
            required_profile_keys: ["read_files", "write_artifacts"],
            ask_profile_keys: ["read_files", "write_artifacts"],
            blocking_profile_keys: [],
            decision_source: "modality_execution_profile",
            decision_scope: "declared_profile",
            confirmation_status: "not_requested",
            confirmation_source: "declared_profile_only",
            declared_only: true,
            turn_gating: true,
          },
        },
      }),
    ).toEqual({
      type: "runtime_status",
      status: {
        phase: "permission_review",
        title: "运行时权限需要确认",
        detail: "当前执行画像声明了 2 项权限。",
        checkpoints: undefined,
        metadata: {
          team_phase: undefined,
          team_parallel_budget: undefined,
          team_active_count: undefined,
          team_queued_count: undefined,
          concurrency_phase: undefined,
          concurrency_scope: undefined,
          concurrency_active_count: undefined,
          concurrency_queued_count: undefined,
          concurrency_budget: undefined,
          provider_concurrency_group: undefined,
          provider_parallel_budget: undefined,
          queue_reason: undefined,
          retryable_overload: undefined,
          permission_status: "requires_confirmation",
          required_profile_keys: ["read_files", "write_artifacts"],
          ask_profile_keys: ["read_files", "write_artifacts"],
          blocking_profile_keys: [],
          decision_source: "modality_execution_profile",
          decision_scope: "declared_profile",
          confirmation_status: "not_requested",
          confirmation_request_id: undefined,
          confirmation_source: "declared_profile_only",
          declared_only: true,
          turn_gating: true,
          limit_status: undefined,
          capability_gap: undefined,
          keepalive_kind: undefined,
          keepalive_sequence: undefined,
          keepalive_elapsed_ms: undefined,
        },
      },
    });

    expect(
      parseAgentEvent({
        type: "runtime_status",
        status: {
          phase: "routing",
          title: "仍在执行，等待下一步进度",
          detail: "运行时仍在处理。",
          metadata: {
            keepalive_kind: "runtime_turn_active",
            keepalive_sequence: 3,
            keepalive_elapsed_ms: 135000,
          },
        },
      }),
    ).toMatchObject({
      type: "runtime_status",
      status: {
        metadata: {
          keepalive_kind: "runtime_turn_active",
          keepalive_sequence: 3,
          keepalive_elapsed_ms: 135000,
        },
      },
    });

    expect(
      parseAgentEvent({
        type: "item_updated",
        item: {
          id: "turn-summary-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T10:00:00Z",
          completed_at: "2026-03-29T10:00:01Z",
          updated_at: "2026-03-29T10:00:01Z",
          type: "turn_summary",
          text: "已决定：直接回答优先\n当前请求无需默认升级为搜索或任务。",
        },
      }),
    ).toEqual({
      type: "item_updated",
      item: {
        id: "turn-summary-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-03-29T10:00:00Z",
        completed_at: "2026-03-29T10:00:01Z",
        updated_at: "2026-03-29T10:00:01Z",
        type: "turn_summary",
        text: "直接回答优先\n当前请求无需默认升级为搜索或任务。",
      },
    });

    expect(
      parseAgentEvent({
        type: "thinking_delta",
        text: "先判断任务性质",
      }),
    ).toEqual({
      type: "thinking_delta",
      text: "先判断任务性质",
    });
  });

  it("应解析任务路由链事件", () => {
    expect(
      parseAgentEvent({
        type: "task_profile_resolved",
        task_profile: {
          kind: "browser_control",
          source: "runtime_contract",
          traits: [
            "modality_runtime_contract",
            "execution_profile",
            "executor_adapter",
          ],
          modalityContractKey: "browser_control",
          routingSlot: "browser_reasoning_model",
          executionProfileKey: "browser_control_profile",
          executorAdapterKey: "browser:browser_assist",
          executorKind: "browser",
          executorBindingKey: "browser_assist",
          permissionProfileKeys: [
            "browser_control",
            "web_search",
            "request_user_input",
          ],
          userLockPolicy: "honor_explicit_model_lock_with_capability_check",
        },
      }),
    ).toEqual({
      type: "task_profile_resolved",
      task_profile: {
        kind: "browser_control",
        source: "runtime_contract",
        traits: [
          "modality_runtime_contract",
          "execution_profile",
          "executor_adapter",
        ],
        modalityContractKey: "browser_control",
        routingSlot: "browser_reasoning_model",
        executionProfileKey: "browser_control_profile",
        executorAdapterKey: "browser:browser_assist",
        executorKind: "browser",
        executorBindingKey: "browser_assist",
        permissionProfileKeys: [
          "browser_control",
          "web_search",
          "request_user_input",
        ],
        userLockPolicy: "honor_explicit_model_lock_with_capability_check",
      },
    });

    expect(
      parseAgentEvent({
        type: "candidate_set_resolved",
        routingDecision: {
          routingMode: "single_candidate",
          decisionSource: "service_model_setting",
          decisionReason: "命中 service_models.translation",
          selectedProvider: "openai",
          selectedModel: "gpt-4.1-mini",
          candidateCount: 1,
        },
      }),
    ).toEqual({
      type: "candidate_set_resolved",
      routing_decision: {
        routingMode: "single_candidate",
        decisionSource: "service_model_setting",
        decisionReason: "命中 service_models.translation",
        selectedProvider: "openai",
        selectedModel: "gpt-4.1-mini",
        candidateCount: 1,
      },
    });

    expect(
      parseAgentEvent({
        type: "routing_decision_made",
        routing_decision: {
          routingMode: "single_candidate",
          decisionSource: "service_model_setting",
          decisionReason: "命中 service_models.translation",
          selectedProvider: "openai",
          selectedModel: "gpt-4.1-mini",
          candidateCount: 1,
        },
      }),
    ).toEqual({
      type: "routing_decision_made",
      routing_decision: {
        routingMode: "single_candidate",
        decisionSource: "service_model_setting",
        decisionReason: "命中 service_models.translation",
        selectedProvider: "openai",
        selectedModel: "gpt-4.1-mini",
        candidateCount: 1,
      },
    });

    expect(
      parseAgentEvent({
        type: "routing_fallback_applied",
        fallbackApplied: true,
        requestedSelection: {
          provider: "custom-coding",
          model: "coder-large",
          source: "profile_model_slot",
        },
        routingAttempts: [
          {
            slot: "coding",
            provider: "custom-coding",
            model: "coder-large",
            source: "profile_model_slot",
            providerReadiness: {
              status: "needs_setup",
              reasonCode: "missing_enabled_api_key",
            },
          },
        ],
        routing_decision: {
          routingMode: "single_candidate",
          decisionSource: "runtime_fallback",
          decisionReason: "service_models.translation 不可用，已回退会话默认",
          selectedProvider: "anthropic",
          selectedModel: "claude-3-5-haiku",
          candidateCount: 1,
          fallbackChain: ["service_models.translation -> session_default"],
        },
      }),
    ).toEqual({
      type: "routing_fallback_applied",
      routing_decision: {
        routingMode: "single_candidate",
        decisionSource: "runtime_fallback",
        decisionReason: "service_models.translation 不可用，已回退会话默认",
        selectedProvider: "anthropic",
        selectedModel: "claude-3-5-haiku",
        candidateCount: 1,
        fallbackChain: ["service_models.translation -> session_default"],
        fallbackApplied: true,
        requestedSelection: {
          provider: "custom-coding",
          model: "coder-large",
          source: "profile_model_slot",
        },
        routingAttempts: [
          {
            slot: "coding",
            provider: "custom-coding",
            model: "coder-large",
            source: "profile_model_slot",
            providerReadiness: {
              status: "needs_setup",
              reasonCode: "missing_enabled_api_key",
            },
          },
        ],
      },
    });

    expect(
      parseAgentEvent({
        type: "limit_state_updated",
        limit_state: {
          status: "single_candidate_only",
          singleCandidateOnly: true,
          providerLocked: true,
          settingsLocked: true,
          oemLocked: false,
          candidateCount: 1,
        },
      }),
    ).toEqual({
      type: "limit_state_updated",
      limit_state: {
        status: "single_candidate_only",
        singleCandidateOnly: true,
        providerLocked: true,
        settingsLocked: true,
        oemLocked: false,
        candidateCount: 1,
      },
    });

    expect(
      parseAgentEvent({
        type: "single_candidate_only",
        limitState: {
          status: "single_candidate_only",
          singleCandidateOnly: true,
          providerLocked: true,
          settingsLocked: true,
          oemLocked: false,
          candidateCount: 1,
        },
      }),
    ).toEqual({
      type: "single_candidate_only",
      limit_state: {
        status: "single_candidate_only",
        singleCandidateOnly: true,
        providerLocked: true,
        settingsLocked: true,
        oemLocked: false,
        candidateCount: 1,
      },
    });

    expect(
      parseAgentEvent({
        type: "single_candidate_capability_gap",
        limit_state: {
          status: "single_candidate_only",
          singleCandidateOnly: true,
          providerLocked: true,
          settingsLocked: true,
          oemLocked: false,
          candidateCount: 1,
          capabilityGap: "tools_missing",
        },
      }),
    ).toEqual({
      type: "single_candidate_capability_gap",
      limit_state: {
        status: "single_candidate_only",
        singleCandidateOnly: true,
        providerLocked: true,
        settingsLocked: true,
        oemLocked: false,
        candidateCount: 1,
        capabilityGap: "tools_missing",
      },
    });

    expect(
      parseAgentEvent({
        type: "routing_not_possible",
        routing_decision: {
          routingMode: "no_candidate",
          decisionSource: "auto_default",
          decisionReason: "当前会话没有 provider/model 默认值",
          candidateCount: 0,
        },
      }),
    ).toEqual({
      type: "routing_not_possible",
      routing_decision: {
        routingMode: "no_candidate",
        decisionSource: "auto_default",
        decisionReason: "当前会话没有 provider/model 默认值",
        candidateCount: 0,
      },
    });
  });

  it("应解析成本与限额事件", () => {
    expect(
      parseAgentEvent({
        type: "cost_estimated",
        cost_state: {
          status: "estimated",
          estimatedCostClass: "low",
          inputPerMillion: 0.8,
          outputPerMillion: 3.2,
          currency: "USD",
        },
      }),
    ).toEqual({
      type: "cost_estimated",
      cost_state: {
        status: "estimated",
        estimatedCostClass: "low",
        inputPerMillion: 0.8,
        outputPerMillion: 3.2,
        currency: "USD",
      },
    });

    expect(
      parseAgentEvent({
        type: "cost_recorded",
        costState: {
          status: "recorded",
          estimatedCostClass: "medium",
          estimatedTotalCost: 0.0185,
          totalTokens: 12000,
        },
      }),
    ).toEqual({
      type: "cost_recorded",
      cost_state: {
        status: "recorded",
        estimatedCostClass: "medium",
        estimatedTotalCost: 0.0185,
        totalTokens: 12000,
      },
    });

    expect(
      parseAgentEvent({
        type: "rate_limit_hit",
        limit_event: {
          eventKind: "rate_limit_hit",
          message: "429 Too Many Requests",
          retryable: true,
        },
      }),
    ).toEqual({
      type: "rate_limit_hit",
      limit_event: {
        eventKind: "rate_limit_hit",
        message: "429 Too Many Requests",
        retryable: true,
      },
    });

    expect(
      parseAgentEvent({
        type: "quota_low",
        limit_event: {
          eventKind: "quota_low",
          message: "credits running low",
          retryable: true,
        },
      }),
    ).toEqual({
      type: "quota_low",
      limit_event: {
        eventKind: "quota_low",
        message: "credits running low",
        retryable: true,
      },
    });

    expect(
      parseAgentEvent({
        type: "quota_blocked",
        limitEvent: {
          eventKind: "quota_blocked",
          message: "余额不足",
          retryable: false,
        },
      }),
    ).toEqual({
      type: "quota_blocked",
      limit_event: {
        eventKind: "quota_blocked",
        message: "余额不足",
        retryable: false,
      },
    });
  });

  it("应解析后端完整 message 快照事件，避免被当作未知事件", () => {
    expect(
      parseAgentEvent({
        type: "message",
        message: {
          id: "msg-1",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "验收矩阵已生成。",
            },
          ],
          timestamp: 1777284240,
          usage: {
            input_tokens: 120,
            output_tokens: 80,
          },
        },
      }),
    ).toEqual({
      type: "message",
      message: {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "验收矩阵已生成。",
          },
        ],
        timestamp: 1777284240,
        usage: {
          input_tokens: 120,
          output_tokens: 80,
        },
      },
    });
  });

  it("应解析队列事件", () => {
    expect(
      parseAgentEvent({
        type: "queue_added",
        session_id: "session-1",
        queued_turn: {
          queued_turn_id: "queued-1",
          message_preview: "继续写完提案",
          message_text: "继续写完提案，补齐目录结构并输出一版正式稿",
          created_at: 1700000000000,
          image_count: 1,
          position: 1,
        },
      }),
    ).toEqual({
      type: "queue_added",
      session_id: "session-1",
      queued_turn: {
        queued_turn_id: "queued-1",
        message_preview: "继续写完提案",
        message_text: "继续写完提案，补齐目录结构并输出一版正式稿",
        created_at: 1700000000000,
        image_count: 1,
        position: 1,
      },
    });
  });

  it("应保留 context_compaction item 类型", () => {
    expect(
      parseAgentEvent({
        type: "item_started",
        item: {
          id: "context-compaction-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 3,
          status: "in_progress",
          started_at: "2026-03-23T00:00:00Z",
          updated_at: "2026-03-23T00:00:00Z",
          type: "context_compaction",
          stage: "started",
          trigger: "manual",
          detail: "Compacting session history",
        },
      }),
    ).toEqual({
      type: "item_started",
      item: {
        id: "context-compaction-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 3,
        status: "in_progress",
        started_at: "2026-03-23T00:00:00Z",
        updated_at: "2026-03-23T00:00:00Z",
        type: "context_compaction",
        stage: "started",
        trigger: "manual",
        detail: "Compacting session history",
      },
    });
  });

  it("应兼容 camelCase 的队列快照字段", () => {
    expect(
      parseAgentEvent({
        type: "queue_added",
        session_id: "session-2",
        queued_turn: {
          queuedTurnId: "queued-2",
          messagePreview: "整理采访提纲",
          messageText: "整理采访提纲，并补上关键追问问题",
          createdAt: 1700000000001,
          imageCount: 2,
          position: 3,
        },
      }),
    ).toEqual({
      type: "queue_added",
      session_id: "session-2",
      queued_turn: {
        queued_turn_id: "queued-2",
        message_preview: "整理采访提纲",
        message_text: "整理采访提纲，并补上关键追问问题",
        created_at: 1700000000001,
        image_count: 2,
        position: 3,
      },
    });
  });

  it("应解析 subagent_status_changed 事件", () => {
    expect(
      parseAgentEvent({
        type: "subagent_status_changed",
        session_id: "child-1",
        root_session_id: "root-1",
        parent_session_id: "parent-1",
        status: "running",
        latest_turn_id: "turn-1",
        latest_turn_status: "queued",
        queued_turn_count: 2,
        team_phase: "queued",
        team_parallel_budget: 3,
        team_active_count: 1,
        team_queued_count: 2,
        provider_concurrency_group: "openai:gpt-5.2",
        provider_parallel_budget: 4,
        queue_reason: "provider_busy",
        retryable_overload: true,
        closed: false,
        usage: {
          input_tokens: 120,
          output_tokens: 32,
          cached_input_tokens: 5,
          cache_creation_input_tokens: 7,
        },
        duration_ms: 12345,
        tool_count: 4,
        result_ref: "artifact://worker-result-1",
      }),
    ).toEqual({
      type: "subagent_status_changed",
      session_id: "child-1",
      root_session_id: "root-1",
      parent_session_id: "parent-1",
      status: "running",
      latest_turn_id: "turn-1",
      latest_turn_status: "queued",
      queued_turn_count: 2,
      team_phase: "queued",
      team_parallel_budget: 3,
      team_active_count: 1,
      team_queued_count: 2,
      provider_concurrency_group: "openai:gpt-5.2",
      provider_parallel_budget: 4,
      queue_reason: "provider_busy",
      retryable_overload: true,
      closed: false,
      usage: {
        input_tokens: 120,
        output_tokens: 32,
        cached_input_tokens: 5,
        cache_creation_input_tokens: 7,
      },
      duration_ms: 12345,
      tool_count: 4,
      result_ref: "artifact://worker-result-1",
    });
  });
});
