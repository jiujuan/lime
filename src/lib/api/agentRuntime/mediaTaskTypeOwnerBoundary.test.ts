import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const MEDIA_TASK_ROOT = resolve(cwd(), "src");

function readSource(relativePath: string): string {
  return readFileSync(resolve(MEDIA_TASK_ROOT, relativePath), "utf8");
}

describe("media task type owner boundary", () => {
  it("行为网关不再导出 DTO 类型", () => {
    const source = readSource("lib/api/mediaTasks.ts");
    expect(source).not.toContain("export type {");
  });

  it("MediaTaskLookupRequest 直接来自 typed owner", () => {
    const sources = [
      "components/agent/chat/workspace/imageTaskLocator.ts",
      "components/agent/chat/workspace/useWorkspaceAudioTaskPreviewRuntime.ts",
      "components/agent/chat/workspace/useWorkspaceImageWorkbenchActionRuntime.ts",
      "components/agent/chat/workspace/useWorkspaceTranscriptionTaskPreviewRuntime.ts",
      "components/workspace/design/types.ts",
      "lib/layered-design/imageTasks.ts",
    ];
    for (const relativePath of sources) {
      const source = readSource(relativePath);
      expect(source).toContain("MediaTaskLookupRequest");
      expect(source).toContain("@/lib/api/agentRuntime/mediaTaskTypes");
      expect(source).not.toMatch(
        /import type\s+\{[^}]*MediaTaskLookupRequest[^}]*\}\s+from ["']@\/lib\/api\/mediaTasks["']/su,
      );
    }
  });
});
