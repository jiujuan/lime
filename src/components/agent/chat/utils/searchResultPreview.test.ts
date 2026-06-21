import { describe, expect, it } from "vitest";

import {
  isUnifiedWebSearchToolName,
  resolveSearchResultPreviewItemsFromText,
} from "./searchResultPreview";

describe("searchResultPreview", () => {
  it("应解析 web search tool_result 里的 content 数组", () => {
    const items = resolveSearchResultPreviewItemsFromText(
      JSON.stringify({
        tool_use_id: "web_search_1",
        content: [
          {
            title: "Yahoo Mail",
            url: "https://mail.yahoo.com/",
            summary: "邮箱首页",
          },
          {
            title: "Reddit",
            url: "https://www.reddit.com/r/LocalLLaMA/",
            description: "社区讨论",
          },
        ],
      }),
    );

    expect(items).toEqual([
      {
        id: "search-record-0-https://mail.yahoo.com/",
        title: "Yahoo Mail",
        url: "https://mail.yahoo.com/",
        hostname: "mail.yahoo.com",
        snippet: "邮箱首页",
      },
      {
        id: "search-record-1-https://www.reddit.com/r/LocalLLaMA/",
        title: "Reddit",
        url: "https://www.reddit.com/r/LocalLLaMA/",
        hostname: "reddit.com",
        snippet: "社区讨论",
      },
    ]);
  });

  it("应从混合文本里的 JSON 数组提取标题而不是回退成 url 字段名", () => {
    const items = resolveSearchResultPreviewItemsFromText(`
Web search results for query: "AI Agent Twitter trending past 24 hours"

Links: [{"title":"Yahoo Mail","url":"https://mail.yahoo.com/","snippet":"邮箱首页"},{"title":"Devflokers","url":"https://devflokers.com/","summary":"行业文章"}]

REMINDER: You MUST include the sources above in your response.
    `);

    expect(items).toEqual([
      {
        id: "search-record-0-https://mail.yahoo.com/",
        title: "Yahoo Mail",
        url: "https://mail.yahoo.com/",
        hostname: "mail.yahoo.com",
        snippet: "邮箱首页",
      },
      {
        id: "search-record-1-https://devflokers.com/",
        title: "Devflokers",
        url: "https://devflokers.com/",
        hostname: "devflokers.com",
        snippet: "行业文章",
      },
    ]);
  });

  it("应兼容 locator.url 与 label 形式的来源对象", () => {
    const items = resolveSearchResultPreviewItemsFromText(
      JSON.stringify({
        sources: [
          {
            label: "Anthropic Docs",
            locator: {
              url: "https://docs.anthropic.com/en/docs",
            },
            snippet: "官方文档入口",
          },
        ],
      }),
    );

    expect(items).toEqual([
      {
        id: "search-record-0-https://docs.anthropic.com/en/docs",
        title: "Anthropic Docs",
        url: "https://docs.anthropic.com/en/docs",
        hostname: "docs.anthropic.com",
        snippet: "官方文档入口",
      },
    ]);
  });

  it("应忽略空 URL 与无效来源，避免渲染脏结果", () => {
    const items = resolveSearchResultPreviewItemsFromText(
      JSON.stringify({
        results: [
          {
            title: "空链接结果",
            url: "",
            snippet: "不应出现",
          },
          {
            title: "有效结果",
            url: "https://example.com/docs",
            snippet: "应保留",
          },
        ],
      }),
    );

    expect(items).toEqual([
      {
        id: "search-record-0-https://example.com/docs",
        title: "有效结果",
        url: "https://example.com/docs",
        hostname: "example.com",
        snippet: "应保留",
      },
    ]);
  });

  it("不应把 Codex 半结构化片段中的 url 字段行当成来源标题", () => {
    const items = resolveSearchResultPreviewItemsFromText(`
"url": ""
https://help.yahoo.com/kb/mail-for-desktop
"url": ""
https://login.yahoo.com/
"title": "知乎专栏 › p › 658835261",
https://zhuanlan.zhihu.com/p/658835261
    `);

    expect(items).toEqual([
      {
        id: "search-text-0-https://zhuanlan.zhihu.com/p/658835261",
        title: "知乎专栏 › p › 658835261",
        url: "https://zhuanlan.zhihu.com/p/658835261",
        hostname: "zhuanlan.zhihu.com",
        snippet: undefined,
      },
    ]);
  });

  it("应过滤搜索引擎导航与备案页脚噪音，只保留真实来源", () => {
    const items = resolveSearchResultPreviewItemsFromText(
      JSON.stringify({
        results: [
          {
            title: "了解必应 获取新版必应壁纸应用 增值电信业务经营许可证",
            url: "https://www.bing.com/search?q=world+news",
            snippet: "京ICP备10036305号-7",
          },
          {
            title: "Reuters World News",
            url: "https://www.reuters.com/world/",
            snippet: "Latest world headlines",
          },
        ],
      }),
    );

    expect(items).toEqual([
      {
        id: "search-record-0-https://www.reuters.com/world/",
        title: "Reuters World News",
        url: "https://www.reuters.com/world/",
        hostname: "reuters.com",
        snippet: "Latest world headlines",
      },
    ]);
  });

  it("应过滤 Yahoo 搜索页导航噪音，只保留用户真正需要的来源", () => {
    const items = resolveSearchResultPreviewItemsFromText(
      JSON.stringify({
        results: [
          {
            title: "Help",
            url: "https://help.yahoo.com/kb/search-for-desktop",
            snippet: "Yahoo Search help page",
          },
          {
            title: "Sign In",
            url: "https://login.yahoo.com/?src=search",
            snippet: "Sign in to Yahoo",
          },
          {
            title: "Yahoo Scout",
            url: "https://scout.yahoo.com/chat",
            snippet: "Chat on Yahoo Scout",
          },
          {
            title: "学生学习机选购指南",
            url: "https://example.com/learning-tablet-guide",
            snippet: "五年级学习机场景对比",
          },
        ],
      }),
    );

    expect(items).toEqual([
      {
        id: "search-record-0-https://example.com/learning-tablet-guide",
        title: "学生学习机选购指南",
        url: "https://example.com/learning-tablet-guide",
        hostname: "example.com",
        snippet: "五年级学习机场景对比",
      },
    ]);
  });

  it("应通过共享工具族 helper 识别动态 WebSearch 工具名", () => {
    expect(isUnifiedWebSearchToolName("WebSearchTool")).toBe(true);
    expect(isUnifiedWebSearchToolName("mcp__system__web_search")).toBe(true);
    expect(isUnifiedWebSearchToolName("mcp__news__web_search")).toBe(true);
    expect(isUnifiedWebSearchToolName("mcp__github__search_code")).toBe(false);
  });
});
