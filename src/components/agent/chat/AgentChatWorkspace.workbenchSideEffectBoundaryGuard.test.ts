import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace workbench side-effect runtime boundary", () => {
  it("自动引导和媒体任务必须由 side-effect runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceWorkbenchSideEffectRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceWorkbenchSideEffectRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(70);
    for (const retiredWorkspaceSideEffectGlue of [
      "useGeneralWorkbenchInitialAutoGuideRuntime(",
      "useWorkspaceMediaTaskRuntime(",
      "const triggerAIGuideRef = useRef(",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceSideEffectGlue);
      expect(ownerSource).toContain(retiredWorkspaceSideEffectGlue);
    }
  });
});
