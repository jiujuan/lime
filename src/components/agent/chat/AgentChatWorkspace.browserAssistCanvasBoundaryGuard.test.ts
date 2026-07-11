import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Browser Assist canvas runtime boundary", () => {
  it("Browser Assist canvas attach/detach glue 必须由 browser assist canvas runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceArtifactCanvasRuntime.ts",
      ),
      "utf8",
    );
    const browserAssistOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceBrowserAssistCanvasRuntime.ts",
      ),
      "utf8",
    );
    const layoutSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceCanvasLayoutRuntime.ts",
      ),
      "utf8",
    );
    const artifactOpenSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceArtifactOpenRuntime.tsx",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceArtifactCanvasRuntime({");
    expect(workspaceSource).not.toContain(
      "useWorkspaceBrowserAssistCanvasRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(180);
    expect(ownerSource).toContain("useWorkspaceBrowserAssistCanvasRuntime({");
    expect(browserAssistOwnerSource).toContain(
      "useWorkspaceBrowserAssistRuntime({",
    );
    expect(browserAssistOwnerSource).toContain(
      "useWorkspaceBrowserAssistRequestRuntime({",
    );
    expect(browserAssistOwnerSource).toContain("canvasControl");
    expect(browserAssistOwnerSource).toContain("artifactOpenControl");
    expect(layoutSource).toContain("browserAssistCanvasControl");
    expect(artifactOpenSource).toContain("browserAssistArtifactOpenControl");

    for (const retiredWorkspaceCanvasGlue of [
      "useWorkspaceBrowserAssistRuntime({",
      "useWorkspaceBrowserAssistRequestRuntime({",
      "suppressBrowserAssistCanvasAutoOpen",
      "suppressGeneralCanvasArtifactAutoOpen",
      "clearBrowserAssistCanvasArtifact",
      "hasBrowserAssistArtifact",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceCanvasGlue);
      expect(`${ownerSource}\n${browserAssistOwnerSource}`).toContain(
        retiredWorkspaceCanvasGlue,
      );
    }
  });
});
