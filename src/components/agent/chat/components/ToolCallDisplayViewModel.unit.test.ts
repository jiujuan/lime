import { describe, expect, it } from "vitest";

import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";

import {
  buildRenderedToolResultContent,
  buildToolCallDisplayGroups,
  buildToolGroupPreview,
  buildToolResultMetaNoticeKeys,
  formatCommandEncoding,
  isToolSearchToolName,
  normalizeToolResultImages,
  normalizeToolResultMetadata,
  resolveCommandOutputStreams,
  resolveCommandToolSummary,
  resolveImportedSourceToolPresentation,
  resolveSkillInvocationContentInfo,
  resolveToolResultPath,
  resolveUserFacingPathName,
  shouldRenderResultAsCodeBlock,
} from "./ToolCallDisplayViewModel";

const baseToolCall = (
  overrides: Partial<ToolCallState> = {},
): ToolCallState => ({
  id: "tool-1",
  name: "bash",
  arguments: JSON.stringify({ command: "pwd" }),
  status: "completed",
  result: { success: true, output: "/workspace\n" },
  startTime: new Date("2026-03-20T12:00:00.000Z"),
  endTime: new Date("2026-03-20T12:00:01.000Z"),
  ...overrides,
});

describe("ToolCallDisplayViewModel", () => {
  it("应按文件路径和内容特征决定结果是否进入代码块渲染", () => {
    const toolCall = baseToolCall({
      name: "write_file",
      arguments: JSON.stringify({ path: "src/App.tsx" }),
    });

    expect(
      shouldRenderResultAsCodeBlock({
        toolCall,
        content: "export const ready = true;",
        language: null,
      }),
    ).toBe(true);
    expect(
      buildRenderedToolResultContent({
        toolCall,
        content: "export const ready = true;",
        filePath: "src/App.tsx",
        emptyOutputLabel: "无输出",
      }),
    ).toBe("```tsx\nexport const ready = true;\n```");
    expect(
      buildRenderedToolResultContent({
        toolCall,
        content: "## 标题\n\n- 条目",
        emptyOutputLabel: "无输出",
      }),
    ).toBe("## 标题\n\n- 条目");
    expect(
      buildRenderedToolResultContent({
        toolCall,
        content: "",
        emptyOutputLabel: "无输出",
      }),
    ).toBe("```text\n无输出\n```");
  });

  it("应从命令工具参数和 metadata 中归一化执行摘要", () => {
    const summary = resolveCommandToolSummary({
      toolName: "PowerShell",
      args: { command: "Write-Output '你好'" },
      metadata: {
        exit_code: 0,
        cwd: "C:\\Users\\lime",
        shell: "powershell",
        execution_surface: "embedded",
        encoding: "utf-8",
        decoded_with: "strict",
        stdout_length: 6,
        stderr_length: 0,
        sandboxed: true,
        sandbox_type: "workspace-write",
        output_truncated: true,
      },
    });

    expect(summary).toEqual({
      command: "Write-Output '你好'",
      cwd: "C:\\Users\\lime",
      exitCode: 0,
      stdoutLength: 6,
      stderrLength: 0,
      sandboxed: true,
      sandboxType: "workspace-write",
      outputTruncated: true,
      shell: "powershell",
      executionSurface: "embedded",
      encoding: "utf-8",
      stderrEncoding: null,
      decodedWith: "strict",
    });
    expect(formatCommandEncoding(summary!)).toBe("utf-8");
  });

  it("应从 metadata 或 JSON 输出中提取 stdout/stderr 分流", () => {
    expect(
      resolveCommandOutputStreams({
        output: JSON.stringify({
          stdout: "✓ parser.test.ts",
          stderr: "FAIL runtime.test.ts",
        }),
      }),
    ).toEqual([
      {
        key: "stdout",
        content: "✓ parser.test.ts",
        tone: "neutral",
      },
      {
        key: "stderr",
        content: "FAIL runtime.test.ts",
        tone: "error",
      },
    ]);

    expect(
      resolveCommandOutputStreams({
        output: "not-json",
        metadata: {
          stdout_text: "metadata stdout",
        },
      }),
    ).toEqual([
      {
        key: "stdout",
        content: "metadata stdout",
        tone: "neutral",
      },
    ]);
  });

  it("导入命令记录应保留事实源但隐藏原始命令和输出展示", () => {
    const toolCall = baseToolCall({
      name: "command_execution",
      arguments: JSON.stringify({ command: "npm test" }),
      result: {
        success: true,
        output: "ok",
        metadata: {
          imported: true,
          source_client: "codex",
          exit_code: 0,
          stdout_text: "ok",
        },
      },
    });

    expect(resolveImportedSourceToolPresentation(toolCall)).toEqual({
      kind: "command_record",
    });
    expect(
      resolveCommandToolSummary({
        toolName: toolCall.name,
        args: { command: "npm test" },
        metadata: normalizeToolResultMetadata(toolCall.result?.metadata),
      }),
    ).toBeNull();
    expect(
      resolveCommandOutputStreams({
        output: toolCall.result?.output,
        metadata: normalizeToolResultMetadata(toolCall.result?.metadata),
      }),
    ).toEqual([]);
    expect(
      buildToolGroupPreview([toolCall], () => "+1", () => "导入的命令记录"),
    ).toBe("导入的命令记录");
  });

  it("导入命令记录即使只有顶层 metadata 也应按只读历史记录展示", () => {
    const toolCall = baseToolCall({
      name: "exec_command",
      arguments: JSON.stringify({ command: "npm test" }),
      metadata: {
        imported: true,
        imported_synthetic: true,
        source_client: "codex",
        exit_code: 0,
      },
      result: undefined,
    });

    expect(resolveImportedSourceToolPresentation(toolCall)).toEqual({
      kind: "command_record",
    });
  });

  it("导入命令记录不应把来源判断写死到单一客户端", () => {
    const toolCall = baseToolCall({
      name: "exec_command",
      arguments: JSON.stringify({ command: "npm test" }),
      result: {
        success: true,
        output: "ok",
        metadata: {
          source_client: "claude_code",
          exit_code: 0,
          stdout_text: "ok",
        },
      },
    });

    expect(resolveImportedSourceToolPresentation(toolCall)).toEqual({
      kind: "command_record",
    });
    expect(
      resolveCommandToolSummary({
        toolName: toolCall.name,
        args: { command: "npm test" },
        metadata: normalizeToolResultMetadata(toolCall.result?.metadata),
      }),
    ).toBeNull();
    expect(
      resolveCommandOutputStreams({
        output: toolCall.result?.output,
        metadata: normalizeToolResultMetadata(toolCall.result?.metadata),
      }),
    ).toEqual([]);
    expect(
      buildToolGroupPreview([toolCall], () => "+1", () => "导入的命令记录"),
    ).toBe("导入的命令记录");
  });

  it("应识别 Skill 调用并隐藏原始 metadata 细节", () => {
    const info = resolveSkillInvocationContentInfo({
      toolCall: baseToolCall({
        name: "Skill",
        arguments: JSON.stringify({
          skill: "analysis",
          display_name: "analysis",
          source: "SKILL.md",
        }),
      }),
      args: {
        skill: "analysis",
        display_name: "analysis",
        source: "SKILL.md",
      },
      metadata: {
        tool_family: "skill",
        skill_name: "analysis",
        skill_display_name: "Analysis",
        agent_skills_standard: true,
        markdown_content_bytes: 86,
        skill_markdown_content: "# Analysis Skill",
      },
    });

    expect(info).toEqual({
      isSkillInvocation: true,
      skillName: "analysis",
      displayName: "Analysis",
      snapshotContent: "# Analysis Skill",
      markdownContentBytes: 86,
      isSnapshotStandard: true,
    });
  });

  it("应归一化结果图片、metadata 和用户可读路径名", () => {
    expect(
      normalizeToolResultImages([
        { src: " https://example.com/a.png ", mime_type: "image/png" },
        { src: "" },
        { src: "file:///tmp/b.png", origin: "file_path" },
      ]),
    ).toEqual([
      {
        src: "https://example.com/a.png",
        mimeType: "image/png",
        origin: undefined,
      },
      {
        src: "file:///tmp/b.png",
        mimeType: undefined,
        origin: "file_path",
      },
    ]);
    expect(
      normalizeToolResultImages(undefined, "", {
        model_visible_image: true,
        image_url: "data:image/png;base64,dmll",
        mime_type: "image/png",
      }),
    ).toEqual([
      {
        src: "data:image/png;base64,dmll",
        mimeType: "image/png",
        origin: "tool_payload",
      },
    ]);
    expect(normalizeToolResultMetadata({ output_file: "out.md" })).toEqual({
      output_file: "out.md",
    });
    expect(normalizeToolResultMetadata(["bad"])).toBeUndefined();
    expect(resolveUserFacingPathName("exports\\reports\\final.md")).toBe(
      "final.md",
    );
    expect(
      buildToolResultMetaNoticeKeys({
        metadata: {
          exit_code: 2,
          lime_offloaded: true,
        },
        isResultFailure: true,
      }),
    ).toEqual(["truncatedPreview", "commandFailed"]);
    expect(
      resolveToolResultPath({
        output_file: "exports/reports/final.md",
      }),
    ).toEqual({
      value: "exports/reports/final.md",
      displayValue: "final.md",
    });
  });

  it("应把连续搜索和同类完成工具分组成稳定展示组", () => {
    const groups = buildToolCallDisplayGroups([
      baseToolCall({
        id: "search-1",
        name: "WebSearch",
        arguments: JSON.stringify({ query: "Lime" }),
      }),
      baseToolCall({
        id: "search-2",
        name: "WebSearch",
        arguments: JSON.stringify({ query: "Electron" }),
      }),
      baseToolCall({
        id: "bash-1",
        name: "bash",
        arguments: JSON.stringify({ command: "pwd" }),
      }),
      baseToolCall({
        id: "bash-2",
        name: "bash",
        arguments: JSON.stringify({ command: "ls -la" }),
      }),
      baseToolCall({
        id: "ask-1",
        name: "request_user_input",
        status: "running",
        arguments: JSON.stringify({ question: "继续吗？" }),
        result: undefined,
      }),
    ]);

    expect(groups.map((group) => group.type)).toEqual([
      "search",
      "work",
      "single",
    ]);
    expect(groups[0]).toMatchObject({
      id: "search-group:search-1",
      items: [{ id: "search-1" }, { id: "search-2" }],
    });
    expect(groups[1]).toMatchObject({
      id: "work-group:bash-1",
      items: [{ id: "bash-1" }, { id: "bash-2" }],
    });
    expect(groups[2]).toMatchObject({
      id: "ask-1",
      item: { id: "ask-1" },
    });
    expect(
      buildToolGroupPreview(
        [groups[1].type === "work" ? groups[1].items[0]! : baseToolCall()],
        (count) => `+${count}`,
      ),
    ).toBe("pwd");
  });

  it("应识别 ToolSearch 工具名", () => {
    expect(isToolSearchToolName("ToolSearch")).toBe(true);
    expect(isToolSearchToolName("WebSearch")).toBe(false);
  });
});
