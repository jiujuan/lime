import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("team memory legacy roster boundary", () => {
  it("team memory owner 不得序列化 legacy child 或 sibling roster", () => {
    const source = readSource(
      "src/components/agent/chat/hooks/useTeamMemoryShadowSync.ts",
    );

    for (const retiredSurface of [
      "AgentSubagentSessionInfo",
      "AgentSubagentParentContext",
      "childSubagentSessions",
      "subagentParentContext",
      "sibling_subagent_sessions",
      "team.subagents",
      "team.parent_context",
    ]) {
      expect(source, retiredSurface).not.toContain(retiredSurface);
    }
    expect(source).toContain(
      'const TEAM_SELECTION_MEMORY_KEY = "team.selection"',
    );
  });

  it("Workspace memory runtime 不得重新接收 legacy roster 参数", () => {
    const runtimeSource = readSource(
      "src/components/agent/chat/workspace/useWorkspaceTeamMemoryRuntime.ts",
    );
    expect(runtimeSource).not.toContain("childSubagentSessions");
    expect(runtimeSource).not.toContain("subagentParentContext");

    const workspaceSource = readSource(
      "src/components/agent/chat/AgentChatWorkspace.tsx",
    );
    const call = workspaceSource.match(
      /useWorkspaceTeamMemoryRuntime\(\{([\s\S]*?)\n\s{2}\}\);/,
    )?.[1];
    expect(call).toBeTruthy();
    expect(call).not.toContain("childSubagentSessions");
    expect(call).not.toContain("subagentParentContext");
  });
});
