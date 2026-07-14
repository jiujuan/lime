import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const PRODUCTION_PATHS = [
  "src/components/agent/chat/utils/agentTaskRuntime.ts",
  "src/components/agent/chat/utils/inputbarRuntimeStatusLine.ts",
  "src/components/agent/chat/components/MessageList.tsx",
  "src/components/agent/chat/components/MessageList.types.ts",
  "src/components/agent/chat/components/useMessageListTimelineState.ts",
  "src/components/agent/chat/workspace/useWorkspaceConversationLandingSurfaceRuntime.tsx",
  "src/components/agent/chat/workspace/useWorkspaceConversationSceneRuntime.tsx",
  "src/components/agent/chat/workspace/WorkspaceConversationScene.tsx",
  "src/components/agent/chat/workspace/useSessionRuntimeProjectionDeferral.ts",
] as const;

describe("canonical Inputbar roster boundary", () => {
  it("Inputbar、Landing 和 MessageList 不得恢复 legacy roster fallback", () => {
    const sources = PRODUCTION_PATHS.map((path) =>
      readFileSync(join(process.cwd(), path), "utf8"),
    );
    const combined = sources.join("\n");

    expect(combined).not.toContain("childSubagentSessions");
    expect(combined).not.toContain("AgentSubagentSessionInfo");
    expect(combined).toContain("canonicalChildren");
    expect(sources[0]).toContain("summarizeCanonicalChildThreads");
    expect(sources[1]).toContain("summarizeAgentTaskChildren");
  });
});
