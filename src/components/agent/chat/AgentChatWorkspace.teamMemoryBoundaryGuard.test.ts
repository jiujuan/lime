import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace team memory boundary", () => {
  it("Team memory shadow owners are deleted from the current graph", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );

    expect(existsSync(join(process.cwd(), "src/lib/teamMemorySync.ts"))).toBe(false);
    expect(
      existsSync(
        join(
          process.cwd(),
          "src/components/agent/chat/workspace/useWorkspaceTeamMemoryRuntime.ts",
        ),
      ),
    ).toBe(false);
    expect(workspaceSource).not.toContain("teamMemoryShadow");
    expect(workspaceSource).not.toContain("useWorkspaceTeamMemoryRuntime");
  });
});
