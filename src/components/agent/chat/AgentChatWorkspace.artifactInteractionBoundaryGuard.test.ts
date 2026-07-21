import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace artifact interaction boundary", () => {
  it("Artifact action 与 surface 必须由一个 interaction owner 连续编排", () => {
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
        "src/components/agent/chat/workspace/useAgentChatWorkspaceArtifactInteractionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useAgentChatWorkspaceArtifactInteractionRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceArtifactActionRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceArtifactSurfaceRuntime({",
    );
    expect(ownerSource).toContain("useWorkspaceArtifactActionRuntime(action)");
    expect(ownerSource).toContain("useWorkspaceArtifactSurfaceRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(180);
  });
});
