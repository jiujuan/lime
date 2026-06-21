import { describe, expect, it } from "vitest";

import {
  extractThinkingContentFromParts,
  mergeHydratedMessagesWithLocalState,
} from "./agentChatHistory";

describe("agentChatHistory local merge", () => {
  it("应从内容片段中提取合并后的 thinkingContent", () => {
    expect(
      extractThinkingContentFromParts([
        { type: "text", text: "正文" },
        { type: "thinking", text: "先想" },
        { type: "thinking", text: "后写" },
      ]),
    ).toBe("先想后写");
  });

  it("刷新会话详情时应保留本地用户消息里的图片", () => {
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "请参考这张图继续分析",
        images: [
          {
            mediaType: "image/png",
            data: "local-image-base64",
          },
        ],
        timestamp: new Date("2026-03-19T00:00:00.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "已收到，正在分析。",
        timestamp: new Date("2026-03-19T00:00:01.000Z"),
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-1",
        role: "user" as const,
        content: "请参考这张图继续分析",
        timestamp: new Date("2026-03-19T00:00:02.000Z"),
      },
      {
        id: "history-assistant-1",
        role: "assistant" as const,
        content: "已收到，正在分析。",
        timestamp: new Date("2026-03-19T00:00:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[0]?.images).toEqual(localMessages[0]?.images);
    expect(mergedMessages[0]?.id).toBe("local-user-1");
    expect(mergedMessages[1]?.id).toBe("local-assistant-1");
    expect(mergedMessages[1]?.images).toBeUndefined();
  });

  it("刷新会话详情合并本地状态后应继续按 runtime turn 归位", () => {
    const localMessages = [
      {
        id: "local-user-turn-1",
        role: "user" as const,
        content: "第一轮问题",
        timestamp: new Date("2026-06-18T08:00:00.000Z"),
        runtimeTurnId: "turn-merge-1",
      },
      {
        id: "local-user-turn-2",
        role: "user" as const,
        content: "第二轮问题",
        images: [
          {
            mediaType: "image/png",
            data: "image-turn-2",
            sourcePath: "/tmp/turn-2.png",
          },
        ],
        timestamp: new Date("2026-06-18T08:00:02.000Z"),
        runtimeTurnId: "turn-merge-2",
      },
      {
        id: "local-assistant-turn-1",
        role: "assistant" as const,
        content: "第一轮本地过程",
        timestamp: new Date("2026-06-18T08:00:01.000Z"),
        runtimeTurnId: "turn-merge-1",
        thinkingContent: "第一轮思考",
        contentParts: [
          {
            type: "thinking" as const,
            text: "第一轮思考",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-turn-1",
        role: "user" as const,
        content: "第一轮问题",
        timestamp: new Date("2026-06-18T08:00:00.500Z"),
        runtimeTurnId: "turn-merge-1",
      },
      {
        id: "history-user-turn-2",
        role: "user" as const,
        content: "第二轮问题",
        timestamp: new Date("2026-06-18T08:00:02.500Z"),
        runtimeTurnId: "turn-merge-2",
      },
      {
        id: "history-assistant-turn-1",
        role: "assistant" as const,
        content: "第一轮回答",
        timestamp: new Date("2026-06-18T08:00:01.000Z"),
        runtimeTurnId: "turn-merge-1",
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        contentParts: [
          {
            type: "text" as const,
            text: "第一轮回答",
          },
        ],
      },
      {
        id: "history-assistant-turn-2",
        role: "assistant" as const,
        content: "第二轮回答",
        timestamp: new Date("2026-06-18T08:00:03.000Z"),
        runtimeTurnId: "turn-merge-2",
        toolCalls: [
          {
            id: "tool-turn-2",
            name: "read_file",
            arguments: '{"path":"/tmp/turn-2.png"}',
            status: "completed" as const,
            startTime: new Date("2026-06-18T08:00:02.600Z"),
            endTime: new Date("2026-06-18T08:00:02.900Z"),
            result: {
              success: true,
              output: "已读取图片",
            },
          },
        ],
        contentParts: [
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-turn-2",
              name: "read_file",
              arguments: '{"path":"/tmp/turn-2.png"}',
              status: "completed" as const,
              startTime: new Date("2026-06-18T08:00:02.600Z"),
              endTime: new Date("2026-06-18T08:00:02.900Z"),
              result: {
                success: true,
                output: "已读取图片",
              },
            },
          },
          {
            type: "text" as const,
            text: "第二轮回答",
          },
        ],
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages.map((message) => message.content)).toEqual([
      "第一轮问题",
      "第一轮本地过程",
      "第二轮问题",
      "第二轮回答",
    ]);
    expect(mergedMessages[1]).toMatchObject({
      role: "assistant",
      runtimeTurnId: "turn-merge-1",
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
      thinkingContent: "第一轮思考",
    });
    expect(mergedMessages[2]?.images?.[0]?.sourcePath).toBe("/tmp/turn-2.png");
    expect(mergedMessages[3]?.toolCalls?.[0]?.name).toBe("read_file");
  });

  it("刷新会话详情时不应把已完成输出替换成后端历史投影", () => {
    const localMessages = [
      {
        id: "local-user-output",
        role: "user" as const,
        content: "请识别这张截图",
        timestamp: new Date("2026-05-12T10:00:00.000Z"),
      },
      {
        id: "local-assistant-output",
        role: "assistant" as const,
        content: "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
        contentParts: [
          {
            type: "text" as const,
            text: "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
          },
        ],
        timestamp: new Date("2026-05-12T10:00:02.000Z"),
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-output",
        role: "user" as const,
        content: "请识别这张截图",
        timestamp: new Date("2026-05-12T10:00:03.000Z"),
      },
      {
        id: "history-assistant-output",
        role: "assistant" as const,
        content:
          "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。",
        contentParts: [
          {
            type: "text" as const,
            text: "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。",
          },
        ],
        timestamp: new Date("2026-05-12T10:00:04.000Z"),
        usage: {
          input_tokens: 1200,
          output_tokens: 80,
        },
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[0]?.id).toBe("local-user-output");
    expect(mergedMessages[1]?.id).toBe("local-assistant-output");
    expect(mergedMessages[1]?.content).toBe(
      "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
    );
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "text",
        text: "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
      },
    ]);
    expect(mergedMessages[1]?.usage).toEqual({
      input_tokens: 1200,
      output_tokens: 80,
    });
  });

  it("远端 failed runtimeStatus 应覆盖本地正在输出状态", () => {
    const localMessages = [
      {
        id: "local-user-news",
        role: "user" as const,
        content: "整理今天的国际新闻",
        timestamp: new Date("2026-06-07T09:30:00.000Z"),
      },
      {
        id: "local-assistant-news",
        role: "assistant" as const,
        content: "我会先检索多组来源并交叉核对。",
        contentParts: [
          {
            type: "text" as const,
            text: "我会先检索多组来源并交叉核对。",
          },
        ],
        toolCalls: [
          {
            id: "tool-web-search-running",
            name: "WebSearch",
            arguments: '{"query":"2026年6月7日 国际新闻"}',
            status: "running" as const,
            startTime: new Date("2026-06-07T09:30:02.000Z"),
          },
        ],
        timestamp: new Date("2026-06-07T09:30:01.000Z"),
        isThinking: true,
        runtimeStatus: {
          phase: "routing" as const,
          title: "正在输出",
          detail: "正在等待模型继续输出。",
        },
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-news",
        role: "user" as const,
        content: "整理今天的国际新闻",
        timestamp: new Date("2026-06-07T09:30:00.000Z"),
      },
      {
        id: "history-assistant-news-failed",
        role: "assistant" as const,
        content:
          "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
        contentParts: [
          {
            type: "text" as const,
            text: "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
          },
        ],
        timestamp: new Date("2026-06-07T09:30:12.000Z"),
        isThinking: false,
        runtimeTurnId: "turn-news-failed",
        runtimeStatus: {
          phase: "failed" as const,
          title: "当前处理失败",
          detail:
            "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
        },
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[1]).toMatchObject({
      id: "local-assistant-news",
      content:
        "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
      isThinking: false,
      runtimeTurnId: "turn-news-failed",
      runtimeStatus: {
        phase: "failed",
        title: "当前处理失败",
      },
    });
    expect(mergedMessages[1]?.content).not.toContain("我会先检索");
    expect(mergedMessages[1]?.runtimeStatus?.detail).toContain(
      "token-plan-cn.xiaomimimo.com",
    );
    expect(mergedMessages[1]?.toolCalls?.[0]).toMatchObject({
      id: "tool-web-search-running",
      status: "failed",
      result: {
        success: false,
        error:
          "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
      },
    });
  });

  it("刷新会话详情时应保留本地用户消息的输入能力标签", () => {
    const localMessages = [
      {
        id: "local-user-skill",
        role: "user" as const,
        content: "请说明 Minimal API 的测试策略",
        timestamp: new Date("2026-05-13T03:20:00.000Z"),
        inputCapabilityRoute: {
          kind: "installed_skill" as const,
          skillKey: "aspnet-core",
          skillName: "aspnet-core",
        },
      },
      {
        id: "local-assistant-skill",
        role: "assistant" as const,
        content: "",
        timestamp: new Date("2026-05-13T03:20:01.000Z"),
        runtimeStatus: {
          phase: "preparing" as const,
          title: "正在准备回复",
          detail: "正在准备回复",
        },
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-skill",
        role: "user" as const,
        content: "请说明 Minimal API 的测试策略",
        timestamp: new Date("2026-05-13T03:20:02.000Z"),
      },
      {
        id: "history-assistant-skill",
        role: "assistant" as const,
        content: "可以从单元测试和集成测试两层设计。",
        timestamp: new Date("2026-05-13T03:20:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[0]).toMatchObject({
      id: "local-user-skill",
      inputCapabilityRoute: {
        kind: "installed_skill",
        skillKey: "aspnet-core",
        skillName: "aspnet-core",
      },
    });
  });

  it("远端只返回助手正文时仍应保留本地用户输入与 Skill 思考过程", () => {
    const localMessages = [
      {
        id: "local-analysis-user",
        role: "user" as const,
        content: "@analysis 帮我分析一下今天的国际形势",
        timestamp: new Date("2026-05-13T17:51:40.000Z"),
      },
      {
        id: "local-analysis-assistant",
        role: "assistant" as const,
        content: "# 分析结果\n\n## 结论\n国际形势分析结果。",
        timestamp: new Date("2026-05-13T17:51:42.000Z"),
        runtimeTurnId: "skill-exec-local-analysis-assistant",
        inlineProcessRetention: "skill" as const,
        thinkingContent: "先识别 analysis Skill，再组织结论。",
        contentParts: [
          {
            type: "thinking" as const,
            text: "先识别 analysis Skill，再组织结论。",
          },
          {
            type: "text" as const,
            text: "# 分析结果\n\n## 结论\n国际形势分析结果。",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-analysis-assistant",
        role: "assistant" as const,
        content: "# 分析结果\n\n## 结论\n国际形势分析结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "# 分析结果\n\n## 结论\n国际形势分析结果。",
          },
        ],
        timestamp: new Date("2026-05-13T17:51:45.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[0]).toMatchObject({
      id: "local-analysis-user",
      role: "user",
      content: "@analysis 帮我分析一下今天的国际形势",
    });
    expect(mergedMessages[1]).toMatchObject({
      id: "local-analysis-assistant",
      role: "assistant",
      runtimeTurnId: "skill-exec-local-analysis-assistant",
      inlineProcessRetention: "skill",
      thinkingContent: "先识别 analysis Skill，再组织结论。",
    });
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先识别 analysis Skill，再组织结论。",
      },
      {
        type: "text",
        text: "# 分析结果\n\n## 结论\n国际形势分析结果。",
      },
    ]);
  });

  it("远端详情返回更新的 assistant 正文时应替换本地快照", () => {
    const localMessages = [
      {
        id: "local-user-topic",
        role: "user" as const,
        content: "继续完善上一个方案",
        timestamp: new Date("2026-04-24T10:00:00.000Z"),
      },
      {
        id: "local-assistant-topic",
        role: "assistant" as const,
        content: "这是本地快照里的最近结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "这是本地快照里的最近结果。",
          },
        ],
        timestamp: new Date("2026-04-24T10:00:02.000Z"),
      },
    ];
    const hydratedMessages = [
      {
        id: "remote-user-topic",
        role: "user" as const,
        content: "继续完善上一个方案",
        timestamp: new Date("2026-04-24T10:00:01.000Z"),
      },
      {
        id: "remote-assistant-topic",
        role: "assistant" as const,
        content: "这是远端补全后的最终结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "这是远端补全后的最终结果。",
          },
        ],
        timestamp: new Date("2026-04-24T10:00:05.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[0]?.id).toBe("local-user-topic");
    expect(mergedMessages[1]?.id).toBe("local-assistant-topic");
    expect(mergedMessages[1]?.content).toBe("这是远端补全后的最终结果。");
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "text",
        text: "这是远端补全后的最终结果。",
      },
    ]);
  });

  it("后端暂未返回历史时应保留本地消息，避免刷新后界面空白", () => {
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "继续刚才的任务",
        timestamp: new Date("2026-03-19T00:00:00.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "这是刚刚停止后的对话内容",
        timestamp: new Date("2026-03-19T00:00:01.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      [],
    );

    expect(mergedMessages).toEqual(localMessages);
  });

  it("同会话刷新详情时应保留本地 assistant 的 token usage", () => {
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "请整理成可继续编辑的文稿",
        timestamp: new Date("2026-04-07T00:00:00.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "已同步到工作区，可继续在画布里阅读、编辑和定位到对应区块。",
        timestamp: new Date("2026-04-07T00:00:01.000Z"),
        usage: {
          input_tokens: 20480,
          output_tokens: 10240,
          cached_input_tokens: 8192,
          cache_creation_input_tokens: 2048,
        },
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-1",
        role: "user" as const,
        content: "请整理成可继续编辑的文稿",
        timestamp: new Date("2026-04-07T00:00:02.000Z"),
      },
      {
        id: "history-assistant-1",
        role: "assistant" as const,
        content: "已同步到工作区，可继续在画布里阅读、编辑和定位到对应区块。",
        timestamp: new Date("2026-04-07T00:00:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[1]?.usage).toEqual({
      input_tokens: 20480,
      output_tokens: 10240,
      cached_input_tokens: 8192,
      cache_creation_input_tokens: 2048,
    });
  });
});
