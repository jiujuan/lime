import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace right surface composition boundary", () => {
  it("Article Editor、coordinator、host 和 chrome 必须由 composition runtime 组合", () => {
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
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceCompositionRuntime.ts",
      ),
      "utf8",
    );
    const sceneCompositionSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneComposition.tsx",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useAgentChatWorkspaceSceneComposition({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceRightSurfaceCompositionRuntime({",
    );
    expect(sceneCompositionSource).toContain(
      "useWorkspaceRightSurfaceCompositionRuntime({",
    );
    expect(sceneCompositionSource).toContain(
      "useWorkspaceRightSurfaceExpertPanelRuntime(expertPanel)",
    );
    expect(sceneCompositionSource).toContain(
      "useWorkspaceHomeRecoveryRuntime(homeRecovery)",
    );
    expect(sceneCompositionSource).toContain(
      "renderWorkspaceFileManagerSidebarRuntime(fileManager)",
    );
    expect(sceneCompositionSource).toContain("<WorkspaceShellScene");
    expect(sceneCompositionSource.split("\n").length).toBeLessThan(180);
    expect(ownerSource.split("\n").length).toBeLessThan(160);
    for (const retiredWorkspaceRightSurfaceGlue of [
      "useWorkspaceArticleEditorImageSlotRuntime(",
      "useWorkspaceArticleEditorRightSurfaceRuntime(",
      "useWorkspaceRightSurfaceCoordinatorRuntime(",
      "useWorkspaceRightSurfaceHostRuntime(",
      "buildWorkspaceConversationRightSurfaceChrome(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceRightSurfaceGlue);
      expect(ownerSource).toContain(retiredWorkspaceRightSurfaceGlue);
    }
  });
});
