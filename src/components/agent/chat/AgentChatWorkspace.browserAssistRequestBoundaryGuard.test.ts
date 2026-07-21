import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Browser Assist request runtime boundary", () => {
  it("Browser Assist request、session ref 和 runtime navigation 必须由 browser assist request runtime 提供", () => {
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
        "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRequestRuntime.ts",
      ),
      "utf8",
    );
    const artifactCanvasOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceArtifactCanvasRuntime.ts",
      ),
      "utf8",
    );
    const canvasOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceBrowserAssistCanvasRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceArtifactCanvasRuntime({");
    expect(workspaceSource).not.toContain(
      "useWorkspaceBrowserAssistCanvasRuntime({",
    );
    expect(artifactCanvasOwnerSource).toContain(
      "useWorkspaceBrowserAssistCanvasRuntime({",
    );
    expect(canvasOwnerSource).toContain(
      "useWorkspaceBrowserAssistRequestRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(180);
    for (const retiredBrowserAssistRequestOwner of [
      "resolveWorkspaceBrowserAssistRequest(",
      "resolveBrowserRuntimeNavigationFromBrowserAssist(",
      "buildBrowserSessionRefFromBrowserAssistSessionState(",
      "const browserAssistSessionRef = useMemo(",
      "const handleOpenBrowserRuntimeForBrowserAssist = useCallback(",
    ]) {
      expect(workspaceSource).not.toContain(retiredBrowserAssistRequestOwner);
      expect(ownerSource).toContain(retiredBrowserAssistRequestOwner);
    }
  });
});
