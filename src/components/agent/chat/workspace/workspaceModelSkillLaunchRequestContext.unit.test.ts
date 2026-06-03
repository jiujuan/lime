import { describe, expect, it } from "vitest";
import {
  attachSessionIdToScopedRequestContext,
  buildAnalysisSkillLaunchRequestContext,
  buildBroadcastSkillLaunchRequestContext,
  buildFormSkillLaunchRequestContext,
  buildPresentationSkillLaunchRequestContext,
  buildResourceSearchSkillLaunchRequestContext,
  buildSkillLaunchRequestMetadata,
  buildSummarySkillLaunchRequestContext,
  buildTranscriptionSkillLaunchRequestContext,
  buildTranslationSkillLaunchRequestContext,
  buildTypesettingSkillLaunchRequestContext,
  buildUrlParseSkillLaunchRequestContext,
  buildWebpageSkillLaunchRequestContext,
  extractBoundSessionRequestContext,
  resolveContractEntrySource,
} from "./workspaceModelSkillLaunchRequestContext";

describe("workspaceModelSkillLaunchRequestContext", () => {
  it("model skill metadata 应合并既有 harness 并暴露可绑定 session context", () => {
    const requestMetadata = buildSkillLaunchRequestMetadata(
      "image",
      {
        trace_id: "trace-1",
        harness: {
          theme: "general",
        },
      },
      {
        kind: "image_task",
        image_task: {
          prompt: "春日咖啡馆插画",
          session_id: "__local_image_workbench__:draft",
        },
      },
    );

    expect(requestMetadata).toMatchObject({
      trace_id: "trace-1",
      harness: {
        theme: "general",
        allow_model_skills: true,
        image_skill_launch: {
          skill_name: "image_generate",
          kind: "image_task",
          image_task: {
            prompt: "春日咖啡馆插画",
            session_id: "__local_image_workbench__:draft",
          },
        },
      },
    });

    const binding = extractBoundSessionRequestContext(requestMetadata);
    expect(binding?.kind).toBe("scoped_request_context");
    if (binding?.kind === "scoped_request_context") {
      attachSessionIdToScopedRequestContext(
        binding.scopedRequestContext,
        "session-image-1",
      );
    }

    expect(requestMetadata).toMatchObject({
      harness: {
        image_skill_launch: {
          image_task: {
            session_id: "session-image-1",
          },
        },
      },
    });
  });

  it("entry source 应优先保留指定 current 入口，否则使用 runtime contract 第一个绑定入口", () => {
    expect(
      resolveContractEntrySource(
        ["legacy_alias", "at_translation_command"],
        "at_translation_command",
      ),
    ).toBe("at_translation_command");

    expect(resolveContractEntrySource(["runtime_default"], "fallback")).toBe(
      "runtime_default",
    );
    expect(resolveContractEntrySource(undefined, "fallback")).toBe("fallback");
  });

  it("播报与素材命令应构造 session-bound model skill request context", () => {
    expect(
      buildBroadcastSkillLaunchRequestContext({
        rawText: "@播报 标题: 发布会 听众: 客户 时长: 8分钟 正文: 今天发布新品",
        parsedCommand: {
          rawText: "@播报",
          trigger: "@播报",
          body: "标题: 发布会 听众: 客户 时长: 8分钟 正文: 今天发布新品",
          prompt: "发布会播报",
          content: "今天发布新品",
          title: "发布会",
          audience: "客户",
          durationHintMinutes: 8,
        },
        projectId: "project-1",
        contentId: "content-1",
        sessionId: "session-broadcast-1",
      }),
    ).toEqual({
      kind: "broadcast_task",
      broadcast_task: {
        raw_text:
          "@播报 标题: 发布会 听众: 客户 时长: 8分钟 正文: 今天发布新品",
        prompt: "发布会播报",
        content: "今天发布新品",
        title: "发布会",
        audience: "客户",
        tone: undefined,
        duration_hint_minutes: 8,
        project_id: "project-1",
        content_id: "content-1",
        session_id: "session-broadcast-1",
        entry_source: "at_broadcast_command",
      },
    });

    expect(
      buildResourceSearchSkillLaunchRequestContext({
        rawText: "@素材 视频 搜索春日咖啡",
        parsedCommand: {
          rawText: "@素材 视频 搜索春日咖啡",
          trigger: "@素材",
          body: "视频 搜索春日咖啡",
          prompt: "搜索春日咖啡",
          resourceType: "video",
          query: "spring coffee",
          usage: "campaign",
          count: 6,
        },
        promptOverride: "使用项目资料改写后的搜索词",
      }),
    ).toMatchObject({
      kind: "resource_search_task",
      resource_search_task: {
        prompt: "使用项目资料改写后的搜索词",
        resource_type: "video",
        query: "spring coffee",
        count: 6,
        entry_source: "at_resource_search_command",
      },
    });
  });

  it("转写与文本转换类 context 应携带 runtime contract 字段", () => {
    expect(
      buildTranscriptionSkillLaunchRequestContext({
        rawText: "@转写 https://example.com/audio.mp3",
        parsedCommand: {
          rawText: "@转写 https://example.com/audio.mp3",
          trigger: "@转写",
          body: "https://example.com/audio.mp3",
          prompt: "整理重点",
          sourceUrl: "https://example.com/audio.mp3",
          language: "zh-CN",
          outputFormat: "markdown",
          speakerLabels: true,
          timestamps: true,
        },
        sessionId: "session-transcription-1",
      }),
    ).toMatchObject({
      kind: "transcription_task",
      transcription_task: {
        source_url: "https://example.com/audio.mp3",
        language: "zh-CN",
        speaker_labels: true,
        timestamps: true,
        session_id: "session-transcription-1",
        entry_source: expect.any(String),
        modality_contract_key: expect.any(String),
        runtime_contract: expect.any(Object),
      },
    });

    expect(
      buildSummarySkillLaunchRequestContext({
        rawText: "@总结",
        parsedCommand: {
          rawText: "@总结",
          trigger: "@总结",
          body: "",
          prompt: "",
          content: "原文",
          focus: "决策",
          length: "short",
          style: "bullet",
          outputFormat: "行动项",
        },
      }),
    ).toMatchObject({
      kind: "summary_request",
      summary_request: {
        prompt: "请总结当前对话中的关键信息",
        content: "原文",
        modality_contract_key: expect.any(String),
      },
    });
  });

  it("翻译与分析 context 应保持各自 entry_source 和字段", () => {
    expect(
      buildTranslationSkillLaunchRequestContext({
        rawText: "@翻译 英文 科技媒体风格 原文",
        parsedCommand: {
          rawText: "@翻译 英文 科技媒体风格 原文",
          trigger: "@翻译",
          body: "英文 科技媒体风格 原文",
          prompt: "",
          content: "原文",
          targetLanguage: "英文",
          style: "科技媒体风格",
          outputFormat: "译文",
        },
      }),
    ).toMatchObject({
      kind: "translation_request",
      translation_request: {
        prompt: "请翻译当前对话中最相关的内容",
        content: "原文",
        target_language: "英文",
        entry_source: "at_translation_command",
      },
    });

    expect(
      buildAnalysisSkillLaunchRequestContext({
        rawText: "@发布合规 检查广告法风险",
        parsedCommand: {
          prompt: "检查广告法风险",
          content: "发布文案",
          focus: "广告法",
          style: "严格",
          outputFormat: "风险清单",
          analysisMode: "compliance",
        },
        entrySource: "at_publish_compliance_command",
      }),
    ).toMatchObject({
      kind: "analysis_request",
      analysis_request: {
        prompt: "检查广告法风险",
        content: "发布文案",
        analysis_mode: "compliance",
        entry_source: "at_publish_compliance_command",
      },
    });
  });

  it("URL 与排版 context 应绑定任务型 session 字段", () => {
    expect(
      buildUrlParseSkillLaunchRequestContext({
        rawText: "@Read Webpage https://example.com/post summarize",
        parsedCommand: {
          rawText: "@Read Webpage https://example.com/post summarize",
          trigger: "@Read Webpage",
          body: "https://example.com/post summarize",
          url: "https://example.com/post",
          prompt: "summarize",
        },
        sessionId: "session-url-1",
      }),
    ).toMatchObject({
      kind: "url_parse_task",
      url_parse_task: {
        url: "https://example.com/post",
        prompt: "summarize",
        session_id: "session-url-1",
        entry_source: "at_webpage_read_command",
      },
    });

    expect(
      buildTypesettingSkillLaunchRequestContext({
        rawText: "@排版 小红书 原文",
        parsedCommand: {
          rawText: "@排版 小红书 原文",
          trigger: "@排版",
          body: "小红书 原文",
          prompt: "原文",
          targetPlatform: "小红书",
        },
        sessionId: "session-typesetting-1",
      }),
    ).toMatchObject({
      kind: "typesetting_task",
      typesetting_task: {
        target_platform: "小红书",
        session_id: "session-typesetting-1",
        entry_source: "at_typesetting_command",
      },
    });
  });

  it("网页、PPT 与表单 context 应保留各自 A2UI 生成参数", () => {
    expect(
      buildWebpageSkillLaunchRequestContext({
        rawText: "@网页 官网 glassmorphism",
        parsedCommand: {
          rawText: "@网页 官网 glassmorphism",
          trigger: "@网页",
          body: "官网 glassmorphism",
          prompt: "AI workspace 官网",
          pageType: "homepage",
          style: "glassmorphism",
          techStack: "react",
        },
      }),
    ).toMatchObject({
      kind: "webpage_request",
      webpage_request: {
        prompt: "AI workspace 官网",
        page_type: "homepage",
        style: "glassmorphism",
        tech_stack: "react",
        entry_source: "at_webpage_command",
      },
    });

    expect(
      buildPresentationSkillLaunchRequestContext({
        rawText: "@PPT sales deck",
        parsedCommand: {
          rawText: "@PPT sales deck",
          trigger: "@PPT",
          body: "sales deck",
          prompt: "发布会路演",
          deckType: "sales_deck",
          style: "executive",
          audience: "客户",
          slideCount: 8,
        },
      }),
    ).toMatchObject({
      kind: "presentation_request",
      presentation_request: {
        deck_type: "sales_deck",
        audience: "客户",
        slide_count: 8,
      },
    });

    expect(
      buildFormSkillLaunchRequestContext({
        rawText: "@表单 客户调研",
        parsedCommand: {
          rawText: "@表单 客户调研",
          trigger: "@表单",
          body: "客户调研",
          prompt: "客户调研",
          formType: "survey_form",
          style: "compact",
          audience: "客户",
          fieldCount: 5,
        },
      }),
    ).toMatchObject({
      kind: "form_request",
      form_request: {
        form_type: "survey_form",
        style: "compact",
        audience: "客户",
        field_count: 5,
        entry_source: "at_form_command",
      },
    });
  });
});
