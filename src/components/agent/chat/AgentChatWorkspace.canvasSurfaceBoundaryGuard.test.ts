import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace canvas surface runtime boundary", () => {
  it("Canvas layout 和 task file sync 必须由 canvas surface runtime 组合", () => {
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
        "src/components/agent/chat/workspace/useWorkspaceCanvasSurfaceRuntime.ts",
      ),
      "utf8",
    );
    const shellInteractionOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceShellInteractionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useAgentChatWorkspaceShellInteractionRuntime({",
    );
    expect(workspaceSource).not.toContain("useWorkspaceCanvasSurfaceRuntime({");
    expect(shellInteractionOwnerSource).toContain(
      "useWorkspaceCanvasSurfaceRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(80);
    for (const retiredWorkspaceCanvasSurfaceGlue of [
      "useWorkspaceCanvasLayoutRuntime(",
      "useWorkspaceCanvasTaskFileSync(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceCanvasSurfaceGlue);
      expect(shellInteractionOwnerSource).not.toContain(
        retiredWorkspaceCanvasSurfaceGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceCanvasSurfaceGlue);
    }
  });
});
