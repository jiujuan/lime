import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace team runtime boundary", () => {
  it("Team formation、session projection 和 stop control 必须由 team runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTeamRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceTeamRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(80);
    for (const retiredWorkspaceTeamGlue of [
      "useRuntimeTeamFormation(",
      "useWorkspaceTeamSessionRuntime(",
      "useWorkspaceTeamSessionControlRuntime(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceTeamGlue);
      expect(ownerSource).toContain(retiredWorkspaceTeamGlue);
    }
  });
});
