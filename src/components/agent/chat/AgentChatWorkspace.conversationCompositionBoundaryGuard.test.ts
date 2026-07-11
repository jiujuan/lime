import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace conversation composition boundary", () => {
  it("landing、message list 和 scene 必须由 conversation composition runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceConversationCompositionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceConversationCompositionRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(70);
    for (const retiredWorkspaceConversationGlue of [
      "useWorkspaceConversationLandingSurfaceRuntime(",
      "useWorkspaceConversationMessageListRuntime(",
      "useWorkspaceConversationSceneRuntime(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceConversationGlue);
      expect(ownerSource).toContain(retiredWorkspaceConversationGlue);
    }
  });
});
