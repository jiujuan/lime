import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace runtime owner boundary", () => {
  it("公共入口保持薄委托，业务组合只在 current runtime owner", () => {
    const entrySource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");

    expect(entrySource.split("\n").length).toBeLessThan(800);
    expect(entrySource).toContain("useAgentChatWorkspaceRuntime(props)");
    expect(entrySource).not.toContain("useAgentChatUnified({");
    expect(ownerSource).toContain(
      "export function useAgentChatWorkspaceRuntime(props: AgentChatWorkspaceProps)",
    );
    expect(ownerSource).toContain("useAgentChatWorkspaceEntryRuntime(props)");
    expect(ownerSource).toContain("useAgentChatWorkspaceSetupRuntime({");
    expect(ownerSource).toContain("useAgentChatWorkspaceCommandRuntime({");
    expect(ownerSource).toContain("useAgentChatWorkspaceSceneRuntime({");
    for (const ownerPath of [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]) {
      const owner = readFileSync(join(process.cwd(), ownerPath), "utf8");
      expect(owner.split("\n").length).toBeLessThan(800);
    }
  });
});
