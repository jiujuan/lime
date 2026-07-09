import { describe, expect, it } from "vitest";

import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import {
  buildThreadItems,
  TOOL_FETCH_START_TIME,
  TOOL_START_TIME,
  type Message,
} from "./messageListTimelineContentParts.testHarness";

describe("messageListTimelineContentParts reasoning merge", () => {
  it("已有内联思考时不应再插入重复的持久化 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "thinking",
        text: "先拆解历史恢复的消息结构。",
      },
      {
        type: "text",
        text: "总结完成。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "总结完成。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-duplicate-inline-thinking",
          type: "reasoning",
          turn_id: "turn-duplicate-inline-thinking",
          sequence: 1,
          text: "先拆解历史恢复的消息结构。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.500Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts).toBeUndefined();
  });

  it("已有 Markdown 形态内联思考时不应把等价 timeline reasoning 补成第二张卡", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "thinking",
        text: "**Crafting concise cheeky Chinese greeting**",
        metadata: {
          source: "thread_item_reasoning",
          turnId: "turn-cheeky-greeting",
          sequence: 1,
        },
      },
      {
        type: "text",
        text: "你好。说吧，今天要我帮你把哪件事拎清楚、推进掉。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "你好。说吧，今天要我帮你把哪件事拎清楚、推进掉。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-cheeky-greeting-official",
          type: "reasoning",
          turn_id: "turn-cheeky-greeting",
          sequence: 1,
          text: "Crafting concise cheeky Chinese greeting",
          status: "completed",
          started_at: "2026-07-09T10:00:00.000Z",
          completed_at: "2026-07-09T10:00:01.000Z",
          updated_at: "2026-07-09T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts).toBeUndefined();
  });

  it("timeline 内同轮同文本 reasoning 不应合并成重复思考正文", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "收到，我会直接给出一句话。",
      items: buildThreadItems([
        {
          id: "streamed-reasoning:turn-dedupe-reasoning:local-1",
          type: "reasoning",
          turn_id: "turn-dedupe-reasoning",
          sequence: 1,
          text: "先构造一句俏皮中文问候。",
          status: "in_progress",
          started_at: "2026-06-20T10:00:00.000Z",
          updated_at: "2026-06-20T10:00:00.500Z",
        },
        {
          id: "reasoning-dedupe-official-1",
          type: "reasoning",
          turn_id: "turn-dedupe-reasoning",
          sequence: 1,
          text: "先构造一句俏皮中文问候。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.000Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        },
        {
          id: "reasoning-dedupe-official-2",
          type: "reasoning",
          turn_id: "turn-dedupe-reasoning",
          sequence: 2,
          text: " 先构造一句俏皮中文问候。 ",
          status: "completed",
          started_at: "2026-06-20T10:00:00.000Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        },
      ]),
    });

    const thinkingParts =
      contentParts?.filter((part) => part.type === "thinking") || [];
    expect(thinkingParts).toHaveLength(1);
    expect(thinkingParts[0]).toMatchObject({
      type: "thinking",
      text: "先构造一句俏皮中文问候。",
      metadata: expect.objectContaining({
        threadItemId: "reasoning-dedupe-official-2",
      }),
    });
    expect(
      thinkingParts[0]?.type === "thinking"
        ? thinkingParts[0].text.split("先构造一句俏皮中文问候。").length - 1
        : 0,
    ).toBe(1);
  });

  it("timeline 内 Markdown 强调形态相同的 reasoning 只应保留一条", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "你好。直接说事，我来处理，省得我们俩先拿空气开会。",
      items: buildThreadItems([
        {
          id: "streamed-reasoning:turn-cheeky-greeting:local-1",
          type: "reasoning",
          turn_id: "turn-cheeky-greeting",
          sequence: 1,
          text: "**Crafting concise cheeky greeting**",
          status: "in_progress",
          started_at: "2026-07-09T10:00:00.000Z",
          updated_at: "2026-07-09T10:00:00.500Z",
        },
        {
          id: "reasoning-cheeky-greeting-official",
          type: "reasoning",
          turn_id: "turn-cheeky-greeting",
          sequence: 1,
          text: "Crafting concise cheeky greeting",
          status: "completed",
          started_at: "2026-07-09T10:00:00.000Z",
          completed_at: "2026-07-09T10:00:01.000Z",
          updated_at: "2026-07-09T10:00:01.000Z",
        },
      ]),
    });

    const thinkingParts =
      contentParts?.filter((part) => part.type === "thinking") || [];
    expect(thinkingParts).toHaveLength(1);
    expect(thinkingParts[0]).toMatchObject({
      type: "thinking",
      text: "Crafting concise cheeky greeting",
      metadata: expect.objectContaining({
        threadItemId: "reasoning-cheeky-greeting-official",
      }),
    });
  });

  it("timeline 内 clean final reasoning 应替换无空格压缩 reasoning", () => {
    const cleanReasoning =
      'The user is saying "你好" (hello) in Chinese. This is a simple greeting that I can respond to directly without any tools. According to my style guidelines, I should respond with a cheeky-sassy tone. Let me craft a response that is friendly but has that cheeky personality.';
    const fusedReasoning = `Theusersaying你好"(hello)inChineseThisissimplegreetingcandirectlywithoutanytoolsAccordingtomystyleguidelines,Ishouldrespondwith-sassytoneLetmecraftaresponse'sfriendlybuthasthatcheekypersonality. ${cleanReasoning}`;
    const contentParts = buildTimelineInlineContentParts({
      displayContent:
        "哟，终于想起找我聊天了？我还以为你把我忘了呢。说吧，今天想聊点啥还是搞点啥？我随时待命。",
      items: buildThreadItems([
        {
          id: "reasoning:resp_readable_upgrade",
          type: "reasoning",
          turn_id: "turn-readable-reasoning-upgrade",
          sequence: 2,
          text: fusedReasoning,
          status: "completed",
          started_at: "2026-07-09T10:00:00.000Z",
          completed_at: "2026-07-09T10:00:01.000Z",
          updated_at: "2026-07-09T10:00:01.000Z",
        },
        {
          id: "reasoning.final:evt_readable_upgrade",
          type: "reasoning",
          turn_id: "turn-readable-reasoning-upgrade",
          sequence: 87,
          text: cleanReasoning,
          status: "completed",
          started_at: "2026-07-09T10:00:00.000Z",
          completed_at: "2026-07-09T10:00:01.000Z",
          updated_at: "2026-07-09T10:00:01.000Z",
        },
      ]),
    });

    const thinkingParts =
      contentParts?.filter((part) => part.type === "thinking") || [];
    expect(thinkingParts).toHaveLength(1);
    expect(thinkingParts[0]).toMatchObject({
      type: "thinking",
      text: cleanReasoning,
      metadata: expect.objectContaining({
        threadItemId: "reasoning.final:evt_readable_upgrade",
      }),
    });
  });

  it("已有工具过程时应把唯一稀疏 reasoning 按时间插入同一流程", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T10:00:00.000Z"),
          endTime: new Date("2026-06-20T10:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T10:00:01.000Z"),
          endTime: new Date("2026-06-20T10:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools",
          type: "reasoning",
          turn_id: "turn-between-web-tools",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.500Z",
          completed_at: "2026-06-20T10:00:00.800Z",
          updated_at: "2026-06-20T10:00:00.800Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("历史 final 只差空白且落在工具前时仍应保留过程后最终正文", () => {
    const leadingFinalText =
      "我识别到专家绑定的 skillRefs，但仍先通过 skill_search 选择，再按需加载单个 SKILL.md。专家 Skills runtime 证据已完成：专家声明 skillRefs 只作为候选提示，实际执行仍经过 skill_search、SKILL.md 按需读取、gate 和 Skill 调用。";
    const finalText =
      "我识别到专家绑定的 skillRefs，但仍先通过 skill_search 选择，再按需加载单个 SKILL.md。 专家 Skills runtime 证据已完成：专家声明 skillRefs 只作为候选提示，实际执行仍经过 skill_search、SKILL.md 按需读取、gate 和 Skill 调用。";
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "text",
        text: leadingFinalText,
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "skill_search",
          arguments: JSON.stringify({ query: "capability report" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: TOOL_START_TIME,
        },
      },
      {
        type: "text",
        text: finalText,
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: finalText,
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-skills-runtime-hydrate",
          type: "reasoning",
          turn_id: "turn-skills-runtime-hydrate",
          sequence: 2,
          text: "先确认专家绑定技能，再选择单个 Skill。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.500Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "text",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.at(-1)).toEqual({ type: "text", text: finalText });
  });

  it("实时工具过程缺少时间戳时应按 timeline sequence 插入稀疏 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-sequence",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          startTime: TOOL_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch-sequence",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          startTime: TOOL_FETCH_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools-by-sequence",
          type: "reasoning",
          turn_id: "turn-between-web-tools-by-sequence",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "in_progress",
          started_at: "2026-06-20T12:00:00.200Z",
          updated_at: "2026-06-20T12:00:00.200Z",
        },
        {
          id: "runtime-summary-web-tools-sequence",
          type: "turn_summary",
          turn_id: "turn-between-web-tools-by-sequence",
          sequence: 4,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T12:00:00.000Z",
          completed_at: "2026-06-20T12:00:00.500Z",
          updated_at: "2026-06-20T12:00:00.500Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("完成态 hydrate 后应使用工具 content part metadata sequence 插入 WebSearch 中间 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: {
          id: "tool-search-metadata-sequence",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          startTime: TOOL_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 4 },
        toolCall: {
          id: "tool-fetch-metadata-sequence",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          startTime: TOOL_FETCH_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools-after-hydrate",
          type: "reasoning",
          turn_id: "turn-between-web-tools-after-hydrate",
          sequence: 3,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "",
          completed_at: "",
          updated_at: "",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[0]).toMatchObject({
      type: "tool_use",
      metadata: { sequence: 2 },
    });
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("turn_summary 不应阻断已有工具过程中的稀疏 reasoning 合并", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-with-summary",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T11:00:00.000Z"),
          endTime: new Date("2026-06-20T11:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch-with-summary",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T11:00:01.000Z"),
          endTime: new Date("2026-06-20T11:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "runtime-summary-web-tools",
          type: "turn_summary",
          turn_id: "turn-web-tools-with-summary",
          sequence: 1,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T11:00:00.000Z",
          completed_at: "2026-06-20T11:00:02.000Z",
          updated_at: "2026-06-20T11:00:02.000Z",
        },
        {
          id: "reasoning-web-tools-with-summary",
          type: "reasoning",
          turn_id: "turn-web-tools-with-summary",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T11:00:00.500Z",
          completed_at: "2026-06-20T11:00:00.800Z",
          updated_at: "2026-06-20T11:00:00.800Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
  });

  it("完整 WebSearch timeline 已有工具项时仍应把中间 reasoning 合并进内联工具过程", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: {
          id: "tool-search-complete-timeline",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T13:00:00.000Z"),
          endTime: new Date("2026-06-20T13:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 4 },
        toolCall: {
          id: "tool-fetch-complete-timeline",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T13:00:01.000Z"),
          endTime: new Date("2026-06-20T13:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "tool-search-complete-timeline",
          type: "tool_call",
          tool_name: "WebSearch",
          arguments: { query: "Lime WebSearch rendering" },
          output: "",
          success: true,
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 2,
          status: "completed",
          started_at: "2026-06-20T13:00:00.000Z",
          completed_at: "2026-06-20T13:00:00.200Z",
          updated_at: "2026-06-20T13:00:00.200Z",
          metadata: { sequence: 2 },
        },
        {
          id: "reasoning-complete-web-tools",
          type: "reasoning",
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 3,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T13:00:00.500Z",
          completed_at: "2026-06-20T13:00:00.800Z",
          updated_at: "2026-06-20T13:00:00.800Z",
        },
        {
          id: "tool-fetch-complete-timeline",
          type: "tool_call",
          tool_name: "WebFetch",
          arguments: {
            url: "https://example.com/lime-websearch-rendering",
          },
          output: "",
          success: true,
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 4,
          status: "completed",
          started_at: "2026-06-20T13:00:01.000Z",
          completed_at: "2026-06-20T13:00:01.200Z",
          updated_at: "2026-06-20T13:00:01.200Z",
          metadata: { sequence: 4 },
        },
        {
          id: "runtime-summary-complete-web-tools",
          type: "turn_summary",
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 5,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T13:00:00.000Z",
          completed_at: "2026-06-20T13:00:01.500Z",
          updated_at: "2026-06-20T13:00:01.500Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });
});
