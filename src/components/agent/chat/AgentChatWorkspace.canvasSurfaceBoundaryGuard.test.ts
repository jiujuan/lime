import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace canvas surface runtime boundary", () => {
  it("Canvas layout 和 task file sync 必须由 canvas surface runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceCanvasSurfaceRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceCanvasSurfaceRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(80);
    for (const retiredWorkspaceCanvasSurfaceGlue of [
      "useWorkspaceCanvasLayoutRuntime(",
      "useWorkspaceCanvasTaskFileSync(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceCanvasSurfaceGlue);
      expect(ownerSource).toContain(retiredWorkspaceCanvasSurfaceGlue);
    }
  });
});
