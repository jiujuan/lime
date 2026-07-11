import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Task Center surface runtime boundary", () => {
  it("草稿 surface、pending preview 和物化路由必须由 Task Center surface runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTaskCenterSurfaceRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceTaskCenterSurfaceRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(120);
    for (const retiredWorkspaceTaskCenterSurfaceGlue of [
      "resolveTaskCenterDraftSurfaceState(",
      "useTaskCenterHomePendingPreviewRuntime(",
      "buildInitialDispatchPreviewMessages(",
      "buildClawAgentParams({",
    ]) {
      expect(workspaceSource).not.toContain(
        retiredWorkspaceTaskCenterSurfaceGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceTaskCenterSurfaceGlue);
    }
  });
});
