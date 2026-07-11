import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace team memory runtime boundary", () => {
  it("Team memory shadow、selected team preference 和 fallback 判定必须由 team memory runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTeamMemoryRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceTeamMemoryRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(160);
    for (const retiredTeamMemoryOwner of [
      "readTeamMemorySnapshot(",
      "useSelectedTeamPreference(",
      "useTeamMemoryShadowSync({",
      "persistedTeamMemoryShadowSnapshot",
      "shouldAllowPersistedTeamFallback",
      "const teamMemoryShadowSnapshot =",
    ]) {
      expect(workspaceSource).not.toContain(retiredTeamMemoryOwner);
      expect(ownerSource).toContain(retiredTeamMemoryOwner);
    }
  });
});
