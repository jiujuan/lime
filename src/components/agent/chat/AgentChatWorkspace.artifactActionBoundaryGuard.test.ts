import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace artifact action runtime boundary", () => {
  it("artifact write/open 组合必须由 artifact action runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceArtifactActionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceArtifactActionRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(180);
    for (const retiredWorkspaceActionGlue of [
      "useWorkspaceWriteFileAction(",
      "useWorkspaceArtifactOpenRuntime(",
      "handleWriteFileRef.current = handleWriteFile",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceActionGlue);
      expect(ownerSource).toContain(retiredWorkspaceActionGlue);
    }
  });
});
