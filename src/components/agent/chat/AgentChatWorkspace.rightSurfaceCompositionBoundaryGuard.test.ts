import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace right surface composition boundary", () => {
  it("Article Editor、coordinator、host 和 chrome 必须由 composition runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceCompositionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceRightSurfaceCompositionRuntime({",
    );
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
