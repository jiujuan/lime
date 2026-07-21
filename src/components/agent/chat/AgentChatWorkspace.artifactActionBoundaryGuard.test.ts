import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace artifact action runtime boundary", () => {
  it("artifact write/open 组合必须由 artifact action runtime 提供", () => {
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
        "src/components/agent/chat/workspace/useWorkspaceArtifactActionRuntime.ts",
      ),
      "utf8",
    );
    const interactionOwnerSource = readFileSync(
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
    expect(interactionOwnerSource).toContain(
      "useWorkspaceArtifactActionRuntime(action)",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(180);
    for (const retiredWorkspaceActionGlue of [
      "useWorkspaceWriteFileAction(",
      "useWorkspaceArtifactOpenRuntime(",
      "handleWriteFileRef.current = handleWriteFile",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceActionGlue);
      expect(interactionOwnerSource).not.toContain(retiredWorkspaceActionGlue);
      expect(ownerSource).toContain(retiredWorkspaceActionGlue);
    }
  });
});
