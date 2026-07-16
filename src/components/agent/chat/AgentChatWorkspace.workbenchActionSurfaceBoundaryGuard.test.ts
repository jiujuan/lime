import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace workbench action surface runtime boundary", () => {
  it("入口提示和画布 workflow 动作必须由 action surface runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const commandWiringSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandWiring.ts",
      ),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceWorkbenchActionSurfaceRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useAgentChatWorkspaceCommandWiring({");
    expect(workspaceSource).not.toContain(
      "useWorkspaceWorkbenchActionSurfaceRuntime({",
    );
    expect(commandWiringSource).toContain(
      "useWorkspaceWorkbenchActionSurfaceRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(70);
    for (const retiredWorkspaceWorkbenchActionGlue of [
      "useWorkspaceGeneralWorkbenchEntryPromptActionsRuntime(",
      "useWorkspaceCanvasWorkflowActions(",
    ]) {
      expect(workspaceSource).not.toContain(
        retiredWorkspaceWorkbenchActionGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceWorkbenchActionGlue);
    }
  });
});
