import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const INPUT_RESTORE_UI_OWNER_FILES = new Set([
  "src/components/agent/chat/components/EmptyState.tsx",
  "src/components/agent/chat/components/Inputbar/hooks/useInputbarController.ts",
]);

const INPUT_RESTORE_REQUEST_PRODUCTION_FILES = new Set([
  "src/components/agent/chat/AgentChatWorkspace.tsx",
  "src/components/agent/chat/components/EmptyState.tsx",
  "src/components/agent/chat/components/EmptyState.types.ts",
  "src/components/agent/chat/components/Inputbar/hooks/useInputbarController.ts",
  "src/components/agent/chat/components/Inputbar/index.tsx",
  "src/components/agent/chat/hooks/agentChatShared.ts",
  "src/components/agent/chat/hooks/agentStreamFlowControl.ts",
  "src/components/agent/chat/hooks/agentStreamInputRestoreTypes.ts",
  "src/components/agent/chat/hooks/index.ts",
  "src/components/agent/chat/hooks/useAgentStream.ts",
  "src/components/agent/chat/workspace/WorkspaceConversationScene.tsx",
  "src/components/agent/chat/workspace/chatSurfaceProps.ts",
  "src/components/agent/chat/workspace/useWorkspaceConversationSceneRuntime.tsx",
  "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.tsx",
]);

function readProductionAgentChatSources() {
  const root = join(process.cwd(), "src/components/agent/chat");
  const files: Array<{ relativePath: string; source: string }> = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) {
        continue;
      }
      if (entry.name.includes(".test.") || entry.name.includes(".unit.test.")) {
        continue;
      }
      const relativePath = relative(process.cwd(), absolutePath);
      files.push({
        relativePath,
        source: readFileSync(absolutePath, "utf8"),
      });
    }
  };
  visit(root);
  return files;
}

function expectInputRestoreUiWriteOwnedByCurrentOwner(pattern: string) {
  const offenders = readProductionAgentChatSources()
    .filter(({ relativePath }) => !INPUT_RESTORE_UI_OWNER_FILES.has(relativePath))
    .filter(({ source }) => source.includes(pattern))
    .map(({ relativePath }) => relativePath);

  expect(offenders, pattern).toEqual([]);
}

describe("AgentChatWorkspace input restore boundary", () => {
  it("父级 Workspace 只转发恢复请求，不再执行 text/path-only fallback", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const handlerStart = source.indexOf("const handleRestoreInterruptedInput");
    const handlerEnd = source.indexOf(
      "const handleInputRestoreRequestHandled",
      handlerStart,
    );
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);

    const handlerSource = source.slice(handlerStart, handlerEnd);
    expect(handlerSource).toContain("setInputRestoreRequest(request)");
    expect(handlerSource).not.toContain("setInput(request.draft.text)");
    expect(handlerSource).not.toContain("handleClearPathReferences()");
    expect(handlerSource).not.toContain("handleAddPathReferences");
    expect(handlerSource).not.toContain("replacePendingImages");
    expect(handlerSource).not.toContain("setActiveCapability");
  });

  it("中断输入恢复的 UI 写入只能由 EmptyState 与 Inputbar current owner 执行", () => {
    expectInputRestoreUiWriteOwnedByCurrentOwner("setInput(draft.text)");
    expectInputRestoreUiWriteOwnedByCurrentOwner(
      "replacePendingImages([...(draft.images ?? [])])",
    );
    expectInputRestoreUiWriteOwnedByCurrentOwner(
      "const restoredPathReferences = [...(draft.pathReferences ?? [])];",
    );
    expectInputRestoreUiWriteOwnedByCurrentOwner(
      "route: draft.inputCapabilityRoute",
    );
  });

  it("inputRestoreRequest 只能停留在 source / pass-through / current UI owner 清单内", () => {
    const offenders = readProductionAgentChatSources()
      .filter(
        ({ source }) =>
          source.includes("inputRestoreRequest") ||
          source.includes("InterruptedInputRestoreRequest"),
      )
      .map(({ relativePath }) => relativePath)
      .filter(
        (relativePath) =>
          !INPUT_RESTORE_REQUEST_PRODUCTION_FILES.has(relativePath),
      );

    expect(offenders).toEqual([]);
  });
});

describe("AgentChatWorkspace home input navigation boundary", () => {
  it("首页首发创建真实 session 后必须进入 Claw 对话路由", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const handlerStart = source.indexOf(
      "const handleNonMaterializedTaskCenterSessionReady",
    );
    const handlerEnd = source.indexOf(
      "useTaskCenterDraftSendDispatchRuntime",
      handlerStart,
    );
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);

    const handlerSource = source.slice(handlerStart, handlerEnd);
    expect(handlerSource).toContain(
      "markTaskCenterLocalSessionOverride(readySessionId)",
    );
    expect(handlerSource).toContain(
      "persistTaskCenterMaterializedSessionNavigation(readySessionId)",
    );
  });
});

describe("AgentChatWorkspace right surface state boundary", () => {
  it("右侧 surface setter 必须先声明再被 artifact click handler 捕获", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const stateStart = source.indexOf("const [manualRightSurface");
    const handlerStart = source.indexOf("const handleWorkspaceArtifactClick");

    expect(stateStart).toBeGreaterThanOrEqual(0);
    expect(handlerStart).toBeGreaterThan(stateStart);
    expect(source.indexOf("const [activeFilesRightSurfaceTarget")).toBeLessThan(
      handlerStart,
    );
    expect(
      source.indexOf("activeObjectCanvasRightSurfaceCandidate"),
    ).toBeLessThan(handlerStart);
    expect(source.indexOf("const [activeArticleWorkspace")).toBeLessThan(
      handlerStart,
    );
  });
});
