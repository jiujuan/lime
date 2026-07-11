import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace media task runtime boundary", () => {
  it("media task preview/action hooks 必须由 media task runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const compositionSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceWorkbenchSideEffectRuntime.ts",
      ),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceMediaTaskRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceWorkbenchSideEffectRuntime({",
    );
    expect(compositionSource).toContain("useWorkspaceMediaTaskRuntime(");
    expect(ownerSource.split("\n").length).toBeLessThan(120);
    for (const retiredWorkspaceMediaTaskGlue of [
      "useWorkspaceImageWorkbenchEventRuntime(",
      "useWorkspaceVideoTaskPreviewRuntime(",
      "useWorkspaceAudioTaskPreviewRuntime(",
      "useWorkspaceTranscriptionTaskPreviewRuntime(",
      "useWorkspaceVideoTaskActionRuntime(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceMediaTaskGlue);
      expect(ownerSource).toContain(retiredWorkspaceMediaTaskGlue);
    }
  });
});
