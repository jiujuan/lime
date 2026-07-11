import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Task Center send scene boundary", () => {
  it("scene session、layout、empty-state 和 restoring 投影必须由 send runtime 返回", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTaskCenterSendRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceTaskCenterSendRuntime({");
    for (const retiredWorkspaceSceneProjection of [
      "taskCenterHomeSurfaceState.sceneSessionId",
      "const sceneIsRestoringSession =",
      "const sceneMessageListEmptyStateVariant =",
      "const sceneLayoutMode =",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceSceneProjection);
    }
    expect(ownerSource).toContain(
      "sceneIsRestoringSession: taskCenterHomeSurfaceState.isRestoringSession",
    );
    expect(ownerSource).toContain(
      "sceneSessionId: taskCenterHomeSurfaceState.sceneSessionId",
    );
    expect(ownerSource).toContain("sceneMessageListEmptyStateVariant:");
    expect(ownerSource).toContain("sceneLayoutMode:");
  });
});
