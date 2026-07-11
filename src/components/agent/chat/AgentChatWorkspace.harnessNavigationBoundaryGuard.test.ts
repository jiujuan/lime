import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace harness navigation runtime boundary", () => {
  it("harness settings navigation callbacks 必须由 harness navigation runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceHarnessNavigationRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceHarnessNavigationRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(60);
    for (const retiredWorkspaceHarnessNavigationGlue of [
      "SettingsTabs.Providers",
      "providerFocus",
      "SettingsTabs.ExecutionPolicy",
      "executionPolicyFocus",
    ]) {
      expect(workspaceSource).not.toContain(
        retiredWorkspaceHarnessNavigationGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceHarnessNavigationGlue);
    }
  });
});
