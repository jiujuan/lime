import { describe, expect, it } from "vitest";

import {
  buildContentFactoryHostGenerationFixtureMarkdown,
  contentFactoryHostGenerationAgentRuntimeRequest,
  contentFactoryLiveHostGenerationAgentRuntimeRequest,
} from "./content-factory-host-generation-fixture.mjs";

function providerBody(prompt) {
  return {
    model: "lime-fixture-chat",
    stream: true,
    messages: [
      {
        role: "system",
        content: "只输出 Markdown 正文。",
      },
      {
        role: "user",
        content: [
          "用户原始请求：",
          prompt,
          "",
          "生成目标：",
          "- targetObjectKind: articleDraft",
          "- outputField: documentText",
        ].join("\n"),
      },
    ],
  };
}

describe("content factory host generation fixture", () => {
  it("按 provider 请求动态生成 fixture-only Markdown", () => {
    const first = buildContentFactoryHostGenerationFixtureMarkdown(
      providerBody(
        "写一篇关于 AI Agent 工作流如何让内容生产可审计的公众号文章",
      ),
    );
    const second = buildContentFactoryHostGenerationFixtureMarkdown(
      providerBody("写一篇关于团队知识库治理的公众号文章"),
    );

    expect(first).toContain("fixtureOnlyHostGeneration: true");
    expect(first).toContain("fixturePromptFingerprint:");
    expect(first).toContain("AI Agent 工作流如何让内容生产可审计");
    expect(second).toContain("团队知识库治理");
    expect(second).toContain("fixturePromptFingerprint:");
    expect(second).not.toBe(first);
    expect(first).not.toContain("受控宿主生成标题");
    expect(first).not.toContain("内容工厂插件化写作：让文章生产可审计");
    expect(first).not.toContain("## 请求摘要");
    expect(first).not.toContain("## 资料检索");
    expect(first).not.toContain("## 正文草稿");
    expect(first).not.toContain("## 交付检查");
    expect(first).not.toContain("targetObjectKind");
    expect(first).not.toContain("outputField");
    expect(first).not.toContain("右侧编辑器");
    expect(first.split(/\n\s*\n/).length).toBeGreaterThanOrEqual(6);
  });

  it("生成 RuntimeRequest 时只指向本地 fixture", () => {
    const request = contentFactoryHostGenerationAgentRuntimeRequest(
      "http://127.0.0.1:41234",
    );

    expect(request).toMatchObject({
      providerConfig: {
        providerId: "fixture-openai",
        providerName: "openai",
        modelName: "lime-fixture-chat",
        apiKey: "fixture-key",
        baseUrl: "http://127.0.0.1:41234",
      },
      providerPreference: "fixture-openai",
      modelPreference: "lime-fixture-chat",
    });
  });

  it("生成 live RuntimeRequest 时使用显式 provider config", () => {
    const request = contentFactoryLiveHostGenerationAgentRuntimeRequest({
      providerId: "agnes",
      providerName: "openai",
      model: "agnes-chat-live",
      apiKey: "sk-live-secret",
      baseUrl: "https://apihub.agnes-ai.com/v1",
    });

    expect(request).toMatchObject({
      providerConfig: {
        providerId: "agnes",
        providerName: "openai",
        modelName: "agnes-chat-live",
        apiKey: "sk-live-secret",
        baseUrl: "https://apihub.agnes-ai.com/v1",
        toolCallStrategy: "native",
      },
      providerPreference: "agnes",
      modelPreference: "agnes-chat-live",
      reasoningEffort: "low",
    });
    expect(JSON.stringify(request)).not.toContain("fixture-openai");
    expect(JSON.stringify(request)).not.toContain("lime-fixture-chat");
  });
});
