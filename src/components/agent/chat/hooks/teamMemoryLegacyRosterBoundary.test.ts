import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("team memory legacy roster boundary", () => {
  it("team memory shadow and its legacy roster owner are deleted", () => {
    expect(
      existsSync(
        join(process.cwd(), "src/components/agent/chat/hooks/useTeamMemoryShadowSync.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(
          process.cwd(),
          "src/components/agent/chat/workspace/useWorkspaceTeamMemoryRuntime.ts",
        ),
      ),
    ).toBe(false);
  });

  it("workspace keeps canonical child facts free of legacy roster metadata", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    expect(workspaceSource).not.toContain("childSubagentSessions");
    expect(workspaceSource).not.toContain("subagentParentContext");
  });
});
