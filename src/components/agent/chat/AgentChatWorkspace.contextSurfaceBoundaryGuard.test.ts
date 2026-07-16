import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace context surface runtime boundary", () => {
  it("context harness、right surface local state 和 thread timeline 胶水必须由 context surface runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceContextSurfaceRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceContextSurfaceRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(280);
    for (const retiredWorkspaceContextSurfaceGlue of [
      "deriveHarnessSessionShellState(",
      "useWorkspaceContextHarnessRuntime(",
      "useWorkspaceRightSurfaceLocalStateRuntime(",
      "resolveHarnessRuntimeVisible(",
      "shouldBuildFullThreadTimeline(",
      "deriveHarnessSessionState(",
      "hasActiveThreadReadActivity(",
      "onAgentStreamingChange?.(inputbarIsSending);",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceContextSurfaceGlue);
      expect(ownerSource).toContain(retiredWorkspaceContextSurfaceGlue);
    }

    for (const retiredSyntheticSubagentSurface of [
      "buildRealSubagentTimelineItems",
      "realSubagentTimelineItems",
      "real:subagent:",
    ]) {
      expect(workspaceSource).not.toContain(retiredSyntheticSubagentSurface);
      expect(ownerSource).not.toContain(retiredSyntheticSubagentSurface);
    }
  });
});
