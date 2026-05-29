import { describe, expect, it } from "vitest";

import { normalizeLegacyToolSurfaceName } from "./agentTextNormalization";

const REFERENCE_JS_TOOL_SURFACE_MAPPINGS = [
  ["AgentTool", "Agent"],
  ["AskUserQuestionTool", "AskUserQuestion"],
  ["BashTool", "Bash"],
  ["developer__shell", "Bash"],
  ["mcp__system__shell", "Bash"],
  ["shell_command", "Bash"],
  ["exec_command", "Bash"],
  ["local_shell_call", "Bash"],
  ["BriefTool", "SendUserMessage"],
  ["ConfigTool", "Config"],
  ["EnterPlanModeTool", "EnterPlanMode"],
  ["EnterWorktreeTool", "EnterWorktree"],
  ["ExitPlanModeTool", "ExitPlanMode"],
  ["ExitWorktreeTool", "ExitWorktree"],
  ["FileEditTool", "Edit"],
  ["FileReadTool", "Read"],
  ["FileWriteTool", "Write"],
  ["read_file", "Read"],
  ["developer__read", "Read"],
  ["mcp__system__read_file", "Read"],
  ["write_file", "Write"],
  ["create_file", "Write"],
  ["mcp__system__write_file", "Write"],
  ["edit_file", "Edit"],
  ["developer__text_editor", "Edit"],
  ["mcp__system__edit_file", "Edit"],
  ["GlobTool", "Glob"],
  ["mcp__system__glob", "Glob"],
  ["GrepTool", "Grep"],
  ["mcp__system__grep", "Grep"],
  ["LSPTool", "LSP"],
  ["ListMcpResourcesTool", "ListMcpResourcesTool"],
  ["NotebookEditTool", "NotebookEdit"],
  ["PowerShellTool", "PowerShell"],
  ["ReadMcpResourceTool", "ReadMcpResourceTool"],
  ["RemoteTriggerTool", "RemoteTrigger"],
  ["ScheduleCronTool", "CronCreate"],
  ["SendMessageTool", "SendMessage"],
  ["SkillTool", "Skill"],
  ["SleepTool", "Sleep"],
  ["SyntheticOutputTool", "StructuredOutput"],
  ["TaskCreateTool", "TaskCreate"],
  ["TaskGetTool", "TaskGet"],
  ["TaskListTool", "TaskList"],
  ["TaskOutputTool", "TaskOutput"],
  ["TaskStopTool", "TaskStop"],
  ["KillShell", "TaskStop"],
  ["TaskUpdateTool", "TaskUpdate"],
  ["TeamCreateTool", "TeamCreate"],
  ["TeamDeleteTool", "TeamDelete"],
  ["ListPeersTool", "ListPeers"],
  ["ToolSearchTool", "ToolSearch"],
  ["tool_search", "ToolSearch"],
  ["mcp__system__tool_search", "ToolSearch"],
  ["WebFetchTool", "WebFetch"],
  ["web_fetch", "WebFetch"],
  ["mcp__system__web_fetch", "WebFetch"],
  ["WebSearchTool", "WebSearch"],
  ["web_search", "WebSearch"],
  ["mcp__system__web_search", "WebSearch"],
  ["ViewImageTool", "view_image"],
] as const;

describe("agentTextNormalization", () => {
  it("应把参考 JS 工具目录名归一化为现役工具面", () => {
    for (const [toolName, expected] of REFERENCE_JS_TOOL_SURFACE_MAPPINGS) {
      expect(normalizeLegacyToolSurfaceName(toolName)).toBe(expected);
    }

    expect(normalizeLegacyToolSurfaceName("RequestUserInputTool")).toBe(
      "AskUserQuestion",
    );
    expect(normalizeLegacyToolSurfaceName("SyntheticOutputTool")).toBe(
      "StructuredOutput",
    );
    expect(normalizeLegacyToolSurfaceName("AgentOutputTool")).toBe(
      "TaskOutput",
    );
    expect(normalizeLegacyToolSurfaceName("BashOutputTool")).toBe("TaskOutput");
  });

  it("对当前无对应现役工具的参考例外保持原样", () => {
    expect(normalizeLegacyToolSurfaceName("MCPTool")).toBe("MCPTool");
    expect(normalizeLegacyToolSurfaceName("McpAuthTool")).toBe("McpAuthTool");
    expect(normalizeLegacyToolSurfaceName("REPLTool")).toBe("REPLTool");
  });
});
