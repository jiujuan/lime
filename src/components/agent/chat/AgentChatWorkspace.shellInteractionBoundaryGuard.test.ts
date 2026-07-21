import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace shell interaction runtime boundary", () => {
  it("Task Center surface、Canvas surface 与 shell interaction 必须由组合 owner 提供", () => {
    const workspaceSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceShellInteractionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useAgentChatWorkspaceShellInteractionRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(800);
    for (const shellInteractionOwner of [
      "useWorkspaceTaskCenterSurfaceRuntime({",
      "resolveAgentChatWorkspaceShellViewModel({",
      "useWorkspaceCanvasSurfaceRuntime({",
      "useWorkspaceTaskCenterInteractionRuntime(",
    ]) {
      expect(workspaceSource).not.toContain(shellInteractionOwner);
      expect(ownerSource).toContain(shellInteractionOwner);
    }
  });
});
