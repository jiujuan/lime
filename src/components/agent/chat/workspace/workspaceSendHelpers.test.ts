import { describe, expect, it, vi } from "vitest";
import {
  buildGeneralWorkbenchSendBoundaryState,
  buildGeneralWorkbenchResumePromptFromRunState,
  buildInitialDispatchKey,
  buildInitialDispatchPreviewMessages,
  buildRuntimeTeamDispatchPreviewMessages,
  buildSubmissionPreviewMessages,
  buildWorkspaceRequestMetadata,
  createSubmissionPreviewSnapshot,
  resolveRuntimeTeamDispatchPreviewState,
} from "./workspaceSendHelpers";

describe("workspaceSendHelpers runtime team preview", () => {
  it("initialDispatchKey 应稳定编码首轮 prompt 与图片签名", () => {
    expect(
      buildInitialDispatchKey("写一篇文章", [
        { data: "abcdef1234567890", mediaType: "image/png" },
      ]),
    ).toContain("写一篇文章");
  });

  it("bootstrap 预览消息应使用统一 initial-dispatch 结构", () => {
    const messages = buildInitialDispatchPreviewMessages({
      key: "initial-dispatch-1",
      prompt: "请开始处理这个任务",
      images: [],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "initial-dispatch:initial-dispatch-1:user",
      role: "user",
      content: "请开始处理这个任务",
    });
    expect(messages[1]).toMatchObject({
      id: "initial-dispatch:initial-dispatch-1:assistant",
      role: "assistant",
      content: "正在开始处理任务…",
      isThinking: true,
    });
  });

  it("工作区首条创作意图应包装成 current send boundary", () => {
    const boundary = buildGeneralWorkbenchSendBoundaryState({
      isThemeWorkbench: true,
      contentId: "content-1",
      initialDispatchKey: "dispatch-1",
      consumedInitialPromptKey: null,
      initialUserImages: [],
      mappedTheme: "general",
      socialArticleSkillKey: "content_post_with_cover",
      sourceText: "请生成今天的社媒主稿",
    });

    expect(boundary).toMatchObject({
      sourceText: "/content_post_with_cover 请生成今天的社媒主稿",
      shouldConsumePendingGeneralWorkbenchInitialPrompt: true,
      shouldDismissGeneralWorkbenchEntryPrompt: true,
      browserRequirementMatch: null,
    });
  });

  it("浏览器任务应在 current send boundary 中保留 requirement 检测", () => {
    const boundary = buildGeneralWorkbenchSendBoundaryState({
      isThemeWorkbench: true,
      contentId: "content-1",
      initialDispatchKey: "dispatch-1",
      consumedInitialPromptKey: null,
      initialUserImages: [],
      mappedTheme: "general",
      socialArticleSkillKey: "content_post_with_cover",
      sourceText: "帮我把这篇文章发布到微信公众号后台",
    });

    expect(boundary.sourceText).toBe(
      "/content_post_with_cover 帮我把这篇文章发布到微信公众号后台",
    );
    expect(boundary.browserRequirementMatch).toEqual(
      expect.objectContaining({
        requirement: "required_with_user_step",
        launchUrl: "https://mp.weixin.qq.com/",
        platformLabel: "微信公众号后台",
      }),
    );
  });

  it("浏览器 requirement 应进入工作区发送 metadata，而不是依赖组件挂载验证", () => {
    const metadata = buildWorkspaceRequestMetadata({
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-browser-required",
      browserRequirementMatch: {
        requirement: "required_with_user_step",
        reason: "需要在微信公众号后台完成发布流程。",
        launchUrl: "https://mp.weixin.qq.com/",
      },
      browserAssistProfileKey: "general_browser_assist",
    });

    expect(metadata).toMatchObject({
      harness: expect.objectContaining({
        theme: "general",
        session_mode: "general_workbench",
        content_id: "content-browser-required",
        browser_requirement: "required_with_user_step",
        browser_requirement_reason: "需要在微信公众号后台完成发布流程。",
        browser_launch_url: "https://mp.weixin.qq.com/",
        browser_user_step_required: true,
        browser_assist: expect.objectContaining({
          enabled: true,
          profile_key: "general_browser_assist",
        }),
      }),
    });
  });

  it("默认工作区 metadata 不应注入 Creator / Brand Voice", () => {
    const metadata = buildWorkspaceRequestMetadata({
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-no-voice",
    });

    expect(metadata.artifact).toBeUndefined();
    expect(metadata.harness).not.toHaveProperty("generation_brief");
    expect(metadata.harness).not.toHaveProperty("generationBrief");
  });

  it("输入框 plan / goal mode 应进入工作区 harness metadata", () => {
    const metadata = buildWorkspaceRequestMetadata({
      sendOptions: {
        requestMetadata: {
          harness: {
            task_mode_enabled: true,
            goal_mode_enabled: true,
            preferences: {
              task: true,
              task_mode: true,
              goal: true,
              objective: true,
            },
            collaboration_mode: {
              mode: "plan",
              source: "inputbar",
            },
            thread_goal: {
              enabled: true,
              source: "inputbar",
              status: "active",
              set: {
                threadId: "thread-workspace-plan-goal",
                objective: null,
                status: "active",
                tokenBudget: null,
              },
            },
          },
        },
        toolPreferencesOverride: {
          task: true,
          subagent: false,
        },
      },
      effectiveToolPreferences: {
        task: true,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-goal-mode",
    });

    expect(metadata).toMatchObject({
      harness: {
        preferences: {
          task: true,
          task_mode: true,
          subagent: false,
          goal: true,
          objective: true,
        },
        task_mode_enabled: true,
        goal_mode_enabled: true,
        collaboration_mode: {
          mode: "plan",
          source: "inputbar",
        },
        thread_goal: {
          enabled: true,
          source: "inputbar",
          status: "active",
          set: {
            threadId: "thread-workspace-plan-goal",
            objective: null,
            status: "active",
            tokenBudget: null,
          },
        },
      },
    });
  });

  it("应把显式 Generation Brief voice metadata 收敛到 artifact.generation_brief", () => {
    const metadata = buildWorkspaceRequestMetadata({
      workspaceRequestMetadataBase: {
        trace_id: "trace-voice-1",
      },
      sendOptions: {
        requestMetadata: {
          artifact: {
            generationBrief: {
              voiceSource: "brand_voice",
              voiceGuard: "user_explicit",
              brandVoiceId: "brand-voice-1",
              evidencePackId: "voice-pack-1",
              inheritsGlobalSoul: false,
              inheritsExpertPersona: false,
            },
          },
        },
      },
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-brand-voice",
    });

    expect(metadata).toMatchObject({
      trace_id: "trace-voice-1",
      artifact: {
        generation_brief: {
          voice_source: "brand_voice",
          voice_guard: "user_explicit",
          brand_voice_id: "brand-voice-1",
          evidence_pack_id: "voice-pack-1",
          inherits_global_soul: false,
          inherits_expert_persona: false,
        },
      },
      harness: expect.objectContaining({
        theme: "general",
        session_mode: "general_workbench",
        content_id: "content-brand-voice",
      }),
    });
    expect(metadata.artifact as Record<string, unknown>).not.toHaveProperty(
      "generationBrief",
    );
    expect(metadata.harness).not.toHaveProperty("generation_brief");
  });

  it("只带 generation_brief 时不应在前端补 Artifact Stage / Schema 合同", () => {
    const metadata = buildWorkspaceRequestMetadata({
      sendOptions: {
        requestMetadata: {
          generationBrief: {
            voiceSource: "creator_voice",
            creatorVoiceId: "creator-voice-1",
            evidenceRefs: ["memory:voice-1"],
          },
        },
      },
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: false,
      currentGateKey: "write_mode",
    });

    expect(metadata.artifact).toEqual({
      generation_brief: {
        voice_source: "creator_voice",
        creator_voice_id: "creator-voice-1",
        evidence_refs: ["memory:voice-1"],
      },
    });
    expect(metadata).not.toHaveProperty("generationBrief");
    expect(metadata.artifact as Record<string, unknown>).not.toHaveProperty(
      "artifact_mode",
    );
    expect(metadata.artifact as Record<string, unknown>).not.toHaveProperty(
      "artifact_stage",
    );
    expect(metadata.artifact as Record<string, unknown>).not.toHaveProperty(
      "artifact_kind",
    );
  });

  it("workspace base 与 sendOptions 的 artifact metadata 应深合并", () => {
    const metadata = buildWorkspaceRequestMetadata({
      workspaceRequestMetadataBase: {
        artifact: {
          artifact_mode: "draft",
          artifact_kind: "analysis",
        },
      },
      sendOptions: {
        requestMetadata: {
          artifact: {
            workbench_surface: "right_panel",
            generationBrief: {
              voiceSource: "brand_voice",
              evidencePackId: "voice-pack-1",
            },
          },
        },
      },
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-merged-artifact",
    });

    expect(metadata.artifact).toEqual({
      artifact_mode: "draft",
      artifact_kind: "analysis",
      workbench_surface: "right_panel",
      generation_brief: {
        voice_source: "brand_voice",
        evidence_pack_id: "voice-pack-1",
      },
    });
  });

  it("保存的 Soul 创作声线无本轮显式声线时应作为发送 fallback", () => {
    const metadata = buildWorkspaceRequestMetadata({
      savedSoulArtifactVoiceGenerationBrief: {
        voice_source: "brand_voice",
        voice_guard: "user_explicit",
        brand_voice_id: "saved-brand-voice",
        evidence_source: "memory.soul.artifact_voice",
      },
      soulArtifactVoiceEnabledForTurn: true,
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-saved-voice",
    });

    expect(metadata).toMatchObject({
      artifact: {
        generation_brief: {
          voice_source: "brand_voice",
          voice_guard: "user_explicit",
          brand_voice_id: "saved-brand-voice",
          evidence_source: "memory.soul.artifact_voice",
        },
      },
      diagnostics: {
        soul_artifact_voice: {
          status: "saved_applied",
          enabled_for_turn: true,
          source: "memory.soul.artifact_voice",
          guard_result: "applied",
          voice_source: "brand_voice",
          voice_guard: "user_explicit",
          evidence_source: "memory.soul.artifact_voice",
        },
      },
    });
  });

  it("本轮关闭保存的 Soul 创作声线时不应注入 artifact metadata", () => {
    const metadata = buildWorkspaceRequestMetadata({
      savedSoulArtifactVoiceGenerationBrief: {
        voice_source: "brand_voice",
        voice_guard: "user_explicit",
        brand_voice_id: "saved-brand-voice",
        evidence_source: "memory.soul.artifact_voice",
      },
      soulArtifactVoiceEnabledForTurn: false,
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-saved-voice-disabled",
    });

    expect(metadata.artifact).toBeUndefined();
    expect(metadata).toMatchObject({
      diagnostics: {
        soul_artifact_voice: {
          status: "disabled_for_turn",
          enabled_for_turn: false,
          source: "memory.soul.artifact_voice",
          guard_result: "blocked_by_turn_override",
          voice_source: "brand_voice",
          voice_guard: "user_explicit",
          evidence_source: "memory.soul.artifact_voice",
        },
      },
    });
  });

  it("本轮显式声线应覆盖保存的 Soul 创作声线且不继承保存 evidence", () => {
    const metadata = buildWorkspaceRequestMetadata({
      savedSoulArtifactVoiceGenerationBrief: {
        voice_source: "brand_voice",
        voice_guard: "user_explicit",
        brand_voice_id: "saved-brand-voice",
        evidence_source: "memory.soul.artifact_voice",
      },
      soulArtifactVoiceEnabledForTurn: true,
      sendOptions: {
        requestMetadata: {
          generationBrief: {
            voiceSource: "creator_voice",
            creatorVoiceId: "turn-creator-voice",
            evidenceRefs: ["memory:turn-voice"],
          },
        },
      },
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-turn-voice",
    });

    expect(metadata).toMatchObject({
      artifact: {
        generation_brief: {
          voice_source: "creator_voice",
          creator_voice_id: "turn-creator-voice",
          evidence_refs: ["memory:turn-voice"],
        },
      },
      diagnostics: {
        soul_artifact_voice: {
          status: "turn_explicit",
          enabled_for_turn: true,
          source: "request_metadata.generation_brief",
          guard_result: "applied",
          voice_source: "creator_voice",
          evidence_refs: ["memory:turn-voice"],
          evidence_ref_count: 1,
        },
      },
    });
    expect(metadata.artifact).not.toMatchObject({
      generation_brief: {
        brand_voice_id: "saved-brand-voice",
        evidence_source: "memory.soul.artifact_voice",
      },
    });
  });

  it("自动首发 metadata 中已有浏览器协助参数时应继续保留", () => {
    const metadata = buildWorkspaceRequestMetadata({
      sendOptions: {
        requestMetadata: {
          harness: {
            browser_assist: {
              enabled: true,
              profile_key: "general_browser_assist",
              preferred_backend: "lime_extension_bridge",
              auto_launch: false,
            },
          },
        },
      },
      effectiveToolPreferences: {
        task: false,
        subagent: false,
      },
      mappedTheme: "general",
      isThemeWorkbench: true,
      currentGateKey: "write_mode",
      contentId: "content-browser-required-bootstrap",
      browserRequirementMatch: {
        requirement: "required_with_user_step",
        reason: "需要在微信公众号后台完成发布流程。",
        launchUrl: "https://mp.weixin.qq.com/",
      },
      browserAssistProfileKey: "general_browser_assist",
    });

    expect(metadata).toMatchObject({
      harness: expect.objectContaining({
        content_id: "content-browser-required-bootstrap",
        browser_requirement: "required_with_user_step",
        browser_user_step_required: true,
        browser_assist: expect.objectContaining({
          enabled: true,
          profile_key: "general_browser_assist",
          preferred_backend: "lime_extension_bridge",
          auto_launch: false,
        }),
      }),
    });
  });

  it("run-state 应生成 resume prompt", () => {
    const prompt = buildGeneralWorkbenchResumePromptFromRunState({
      run_state: "auto_running",
      current_gate_key: "write_mode",
      queue_items: [
        {
          run_id: "run-1",
          title: "撰写主稿",
          gate_key: "write_mode",
          status: "running",
          source: "skill",
          source_ref: null,
          started_at: new Date().toISOString(),
        },
      ],
      latest_terminal: null,
      recent_terminals: [],
      updated_at: new Date().toISOString(),
    });

    expect(prompt).toMatchObject({
      kind: "resume",
      title: "发现上次未完成任务",
      actionLabel: "继续上次生成",
      description: expect.stringContaining("撰写主稿"),
    });
  });

  it("应在失败预览中覆盖 formationState 的错误信息", () => {
    const state = resolveRuntimeTeamDispatchPreviewState({
      key: "runtime-team-failed",
      prompt: "请继续处理",
      images: [],
      baseMessageCount: 0,
      status: "failed",
      failureMessage: "Provider 认证失败",
      formationState: {
        requestId: "runtime-1",
        status: "forming",
        label: "修复 Team",
        summary: "分析、执行、验证三段式推进。",
        members: [],
        blueprint: null,
        updatedAt: Date.now(),
      },
    });

    expect(state).toMatchObject({
      status: "failed",
      errorMessage: "Provider 认证失败",
    });
  });

  it("formed 预览消息应使用任务叙事", () => {
    const messages = buildRuntimeTeamDispatchPreviewMessages({
      key: "runtime-team-formed",
      prompt: "请拆成分析、执行、验证三个并行步骤继续推进",
      images: [],
      baseMessageCount: 0,
      status: "formed",
      formationState: {
        requestId: "runtime-formed-1",
        status: "formed",
        label: "修复 Team",
        summary: "分析、执行、验证三段式推进。",
        members: [
          {
            id: "task-1",
            label: "分析",
            summary: "收敛问题边界。",
            roleKey: "explorer",
            profileId: "code-explorer",
            skillIds: ["repo-exploration"],
            status: "planned",
          },
          {
            id: "task-2",
            label: "执行",
            summary: "完成修复并汇报结果。",
            roleKey: "executor",
            profileId: "code-executor",
            skillIds: ["bounded-implementation"],
            status: "planned",
          },
        ],
        blueprint: {
          label: "代码排障团队",
          summary: "分析、执行、验证三段式推进。",
          roles: [],
        },
        updatedAt: Date.now(),
      },
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("分工如下");
    expect(messages[1]?.content).toContain("这些任务会分别展开处理");
    expect(messages[1]?.runtimeStatus).toMatchObject({
      title: "任务分工已准备好",
      detail: "分析、执行、验证三段式推进。",
      checkpoints: [
        "当前方案：修复分工方案",
        "已安排 2 项任务",
        "主对话会持续同步关键进展",
      ],
    });
  });

  it("forming 预览消息应提示等待任务接手", () => {
    const messages = buildRuntimeTeamDispatchPreviewMessages({
      key: "runtime-team-forming",
      prompt: "请先拆任务再继续",
      images: [],
      baseMessageCount: 0,
      status: "forming",
      formationState: {
        requestId: "runtime-forming-1",
        status: "forming",
        label: "排障 Team",
        summary: "分析、执行两段式推进。",
        members: [],
        blueprint: null,
        updatedAt: Date.now(),
      },
    });

    expect(messages[1]?.isThinking).toBe(true);
    expect(messages[1]?.runtimeStatus).toMatchObject({
      title: "正在准备任务分工",
      detail:
        "系统正在根据当前任务安排分工，会先拆出合适的任务，再把关键进展持续汇总回主对话。",
      checkpoints: ["确认当前任务目标", "安排任务分工", "等待任务接手处理"],
    });
  });

  it("提交预览应生成等待态快照并映射成双消息预览", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);

    const snapshot = createSubmissionPreviewSnapshot({
      key: "submission-preview-1",
      prompt: "/brand-product-knowledge-builder 继续处理当前任务",
      displayContent: "继续处理当前任务",
      inputCapabilityRoute: {
        kind: "installed_skill",
        skillKey: "brand-product-knowledge-builder",
        skillName: "产品知识库",
      },
      images: [],
      executionStrategy: "react",
    });

    expect(snapshot).toMatchObject({
      key: "submission-preview-1",
      prompt: "/brand-product-knowledge-builder 继续处理当前任务",
      displayContent: "继续处理当前任务",
      createdAt: 1_710_000_000_000,
    });
    expect(snapshot.runtimeStatus).not.toBeNull();

    const messages = buildSubmissionPreviewMessages(snapshot);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "submission-preview:submission-preview-1:user",
      role: "user",
      content: "继续处理当前任务",
      inputCapabilityRoute: {
        kind: "installed_skill",
        skillKey: "brand-product-knowledge-builder",
        skillName: "产品知识库",
      },
    });
    expect(messages[1]).toMatchObject({
      id: "submission-preview:submission-preview-1:assistant",
      role: "assistant",
      isThinking: true,
      runtimeStatus: snapshot.runtimeStatus,
    });

    vi.restoreAllMocks();
  });
});
