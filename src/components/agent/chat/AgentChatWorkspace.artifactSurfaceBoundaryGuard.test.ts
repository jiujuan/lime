import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace artifact surface runtime boundary", () => {
  it("plugin history restore、service skill card 和 scene app surface 必须由 artifact surface runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceArtifactSurfaceRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceArtifactSurfaceRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(180);
    for (const retiredWorkspaceArtifactSurfaceGlue of [
      "useWorkspacePluginHistoryRestoreRuntime(",
      "useWorkspaceServiceSkillExecutionCardRuntime(",
      "useWorkspaceSceneAppExecutionSurfaceRuntime(",
      "const handleJumpToTimelineItem = useCallback(",
    ]) {
      expect(workspaceSource).not.toContain(
        retiredWorkspaceArtifactSurfaceGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceArtifactSurfaceGlue);
    }
  });
});
