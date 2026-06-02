import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { buildGeneralWorkbenchWorkflowSteps } from "./generalWorkbenchHelpers";

function buildThemeWorkbenchSteps(
  toolCalls: NonNullable<Message["toolCalls"]>,
  options: {
    userContent?: string;
    isSending?: boolean;
  } = {},
) {
  const messages: Message[] = [
    {
      id: "user-workflow",
      role: "user",
      content:
        options.userContent ??
        "/content_post_with_cover 请生成一篇 AI 眼镜的社媒稿",
      timestamp: new Date("2026-03-06T10:00:00.000Z"),
    },
    {
      id: "assistant-workflow",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-06T10:00:01.000Z"),
      isThinking: true,
      toolCalls,
    },
  ];

  return buildGeneralWorkbenchWorkflowSteps(
    messages,
    null,
    options.isSending ?? true,
    {},
  );
}

describe("generalWorkbenchWorkflowSteps", () => {
  it("应将主题工作台写入与封面工具投影为业务 workflow step", () => {
    const workflowSteps = buildThemeWorkbenchSteps([
      {
        id: "tool-write-ok",
        name: "write_file",
        arguments: JSON.stringify({ path: "content-posts/final.md" }),
        status: "completed",
        startTime: new Date("2026-03-06T10:10:01.500Z"),
        endTime: new Date("2026-03-06T10:10:02.000Z"),
      },
      {
        id: "tool-cover-failed",
        name: "social_generate_cover_image",
        arguments: JSON.stringify({ size: "1024x1024" }),
        status: "failed",
        startTime: new Date("2026-03-06T10:10:02.000Z"),
        endTime: new Date("2026-03-06T10:10:03.000Z"),
      },
    ]);

    expect(workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "生成内容主稿",
          status: "completed",
        }),
        expect.objectContaining({
          title: "写入 content-posts/final.md",
          status: "completed",
        }),
        expect.objectContaining({
          title: "生成封面图（1024x1024）",
          status: "error",
        }),
      ]),
    );
  });

  it("应将搜索和浏览器导航工具投影为业务 workflow step", () => {
    const workflowSteps = buildThemeWorkbenchSteps(
      [
        {
          id: "tool-search-1",
          name: "WebSearch",
          arguments: JSON.stringify({
            query: "Rokid Glasses 最新功能",
          }),
          status: "completed",
          startTime: new Date("2026-03-06T11:00:01.500Z"),
          endTime: new Date("2026-03-06T11:00:02.000Z"),
        },
        {
          id: "tool-browser-1",
          name: "browser_navigate",
          arguments: JSON.stringify({
            url: "https://www.rokid.com/glasses",
          }),
          status: "running",
          startTime: new Date("2026-03-06T11:00:02.500Z"),
        },
      ],
      {
        userContent: "/content_post_with_cover 请整理 Rokid Glasses 的亮点",
      },
    );

    expect(workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "检索 Rokid Glasses 最新功能",
          status: "completed",
        }),
        expect.objectContaining({
          title: "打开 https://www.rokid.com/glasses",
          status: "active",
        }),
      ]),
    );
  });

  it("应将点击、截图和媒体命令工具投影为业务 workflow step", () => {
    const workflowSteps = buildThemeWorkbenchSteps(
      [
        {
          id: "tool-click-1",
          name: "browser_click",
          arguments: JSON.stringify({ element: "发布按钮" }),
          status: "completed",
          startTime: new Date("2026-03-06T12:00:01.500Z"),
          endTime: new Date("2026-03-06T12:00:02.000Z"),
        },
        {
          id: "tool-snapshot-1",
          name: "browser_snapshot",
          arguments: JSON.stringify({ element: "结果区域" }),
          status: "completed",
          startTime: new Date("2026-03-06T12:00:02.500Z"),
          endTime: new Date("2026-03-06T12:00:03.000Z"),
        },
        {
          id: "tool-bash-1",
          name: "bash",
          arguments: JSON.stringify({
            command: "ffmpeg -i input.mp4 output.mp4",
          }),
          status: "running",
          startTime: new Date("2026-03-06T12:00:03.500Z"),
        },
      ],
      {
        userContent: "/content_post_with_cover 请继续完善并导出发布版",
      },
    );

    expect(workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "点击「发布按钮」",
          status: "completed",
        }),
        expect.objectContaining({
          title: "分析页面区域：结果区域",
          status: "completed",
        }),
        expect.objectContaining({
          title: "处理音视频素材",
          status: "active",
        }),
      ]),
    );
  });
});
