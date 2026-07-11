import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace entry projection runtime boundary", () => {
  it("入口 replay、signature 和 runtime workspace 必须由 entry projection runtime 派生", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceEntryProjectionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceEntryProjectionRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(110);
    for (const retiredWorkspaceEntryProjectionGlue of [
      "extractCreationReplayMetadata(",
      "buildCreationReplaySurfaceModel(",
      "buildPendingServiceSkillLaunchSignature(",
      "shouldAllowDetachedInitialAutoSend(",
      "resolveRuntimeWorkspaceId(",
    ]) {
      expect(workspaceSource).not.toContain(
        retiredWorkspaceEntryProjectionGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceEntryProjectionGlue);
    }
  });
});
