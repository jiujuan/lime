import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace context detail runtime boundary", () => {
  it("context detail toast 展示必须由 context detail runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceContextDetailRuntime.tsx",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceContextDetailRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(90);
    for (const retiredWorkspaceContextDetailGlue of [
      "const detail = contextWorkspace.getContextDetail(contextId);",
      "generalWorkbench.context.detail.notFound",
      "generalWorkbench.context.detail.sourceTokens",
      "detail.bodyText || detail.previewText",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceContextDetailGlue);
      expect(ownerSource).toContain(retiredWorkspaceContextDetailGlue);
    }
  });
});
