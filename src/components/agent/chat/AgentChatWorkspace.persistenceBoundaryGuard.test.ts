import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace persistence runtime boundary", () => {
  it("session files、resource sync 和 document sync 胶水必须由 persistence runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspacePersistenceRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspacePersistenceRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(140);
    for (const retiredWorkspacePersistenceGlue of [
      "useSessionFiles(",
      "shouldAutoInitWorkspaceSessionFiles(",
      "useWorkspaceGeneralResourceSync(",
      "useWorkspaceCanvasContentSyncRuntime(",
      "useWorkspaceDocumentVersionStatusSyncRuntime(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspacePersistenceGlue);
      expect(ownerSource).toContain(retiredWorkspacePersistenceGlue);
    }
  });
});
