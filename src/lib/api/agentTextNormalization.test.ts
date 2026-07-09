import { describe, expect, it } from "vitest";

import { normalizeLegacyToolSurfaceName } from "./agentTextNormalization";

const REFERENCE_JS_TOOL_SURFACE_MAPPINGS = [
  ["AgentTool", "Agent"],
  ["BashTool", "Bash"],
  ["developer__shell", "Bash"],
  ["mcp__system__shell", "Bash"],
  ["shell_command", "Bash"],
  ["exec_command", "Bash"],
  ["local_shell_call", "Bash"],
  ["request_user_input", "request_user_input"],
  ["RequestUserInputTool", "request_user_input"],
  ["clock.sleep", "sleep"],
  ["sleep", "sleep"],
  ["update_plan", "update_plan"],
  ["UpdatePlanTool", "update_plan"],
  ["FileReadTool", "Read"],
  ["read_file", "Read"],
  ["developer__read", "Read"],
  ["mcp__system__read_file", "Read"],
  ["GlobTool", "Glob"],
  ["mcp__system__glob", "Glob"],
  ["GrepTool", "Grep"],
  ["mcp__system__grep", "Grep"],
  ["ListMcpResourcesTool", "list_mcp_resources"],
  ["PowerShellTool", "PowerShell"],
  ["ReadMcpResourceTool", "read_mcp_resource"],
  ["SendMessageTool", "SendMessage"],
  ["SkillTool", "Skill"],
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

    expect(normalizeLegacyToolSurfaceName("AskUserQuestionTool")).toBe(
      "AskUserQuestionTool",
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
    expect(normalizeLegacyToolSurfaceName("ConfigTool")).toBe("ConfigTool");
    expect(normalizeLegacyToolSurfaceName("EnterWorktreeTool")).toBe(
      "EnterWorktreeTool",
    );
    expect(normalizeLegacyToolSurfaceName("ExitWorktreeTool")).toBe(
      "ExitWorktreeTool",
    );
    expect(normalizeLegacyToolSurfaceName("NotebookEditTool")).toBe(
      "NotebookEditTool",
    );
    expect(normalizeLegacyToolSurfaceName("RemoteTriggerTool")).toBe(
      "RemoteTriggerTool",
    );
    expect(normalizeLegacyToolSurfaceName("ScheduleCronTool")).toBe(
      "ScheduleCronTool",
    );
    expect(normalizeLegacyToolSurfaceName("SleepTool")).toBe("SleepTool");
  });
});
