import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace system prompt runtime boundary", () => {
  it("chat mode、compact prompt 和 Memory 注入必须由 system prompt runtime 派生", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceSystemPromptRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceSystemPromptRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(120);
    for (const retiredWorkspacePromptGlue of [
      "resolveAgentChatMode(",
      "shouldUseCompactGeneralPromptForPreferences(",
      "buildGeneralAgentSystemPrompt(",
      "generateGeneralWorkbenchPrompt(",
      "generateProjectMemoryPrompt(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspacePromptGlue);
      expect(ownerSource).toContain(retiredWorkspacePromptGlue);
    }
  });
});
