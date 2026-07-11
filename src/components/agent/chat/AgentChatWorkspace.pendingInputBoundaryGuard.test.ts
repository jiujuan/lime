import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace pending input runtime boundary", () => {
  it("输入栏待处理表单优先级和提交分发必须由 pending input runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspacePendingInputRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspacePendingInputRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(240);
    for (const retiredWorkspacePendingInputGlue of [
      "useInitialPendingServiceSkillLaunchRuntime(",
      "selectPendingInputbarApprovalAction(",
      "useWorkspaceA2UIRuntime(",
      "useWorkspaceSceneGateRuntime(",
      "useWorkspaceA2UISubmitActions(",
      "const handlePendingA2UISubmit = useCallback",
      "const handleMessageA2UISubmit = useCallback",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspacePendingInputGlue);
      expect(ownerSource).toContain(retiredWorkspacePendingInputGlue);
    }
  });
});
