import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("Workspace Canvas preview runtime boundary", () => {
  it("Canvas preview 渲染与 scene 参数投影必须由两个窄 owner 分别承接", () => {
    const workspaceSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");
    const sceneOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceCanvasSceneRuntime.tsx",
      ),
      "utf8",
    );
    const previewOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceCanvasPreviewRuntime.tsx",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceCanvasSceneRuntime({");
    expect(sceneOwnerSource).toContain("useWorkspaceCanvasPreviewRuntime({");
    expect(sceneOwnerSource.split("\n").length).toBeLessThan(800);
    expect(previewOwnerSource.split("\n").length).toBeLessThan(800);

    for (const previewOnlySurface of [
      "buildCanvasWorkbenchDefaultPreview({",
      "const artifactWorkbenchPreviewBaseProps = useMemo",
      "const renderCanvasWorkbenchPreview = useCallback",
      "<WorkspaceLiveCanvasPreview",
    ]) {
      expect(workspaceSource).not.toContain(previewOnlySurface);
      expect(sceneOwnerSource).not.toContain(previewOnlySurface);
      expect(previewOwnerSource).toContain(previewOnlySurface);
    }
  });
});
