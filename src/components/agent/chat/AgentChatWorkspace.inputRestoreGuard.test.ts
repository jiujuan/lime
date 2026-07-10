import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
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
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTaskCenterSendRuntime.ts",
      ),
      "utf8",
    );
    const handlerStart = ownerSource.indexOf(
      "const handleNonMaterializedSessionReady",
    );
    const handlerEnd = ownerSource.indexOf(
      "const handleSendFromEmptyState = useTaskCenterEmptyStateSendRuntime",
      handlerStart,
    );
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);

    const handlerSource = ownerSource.slice(handlerStart, handlerEnd);
    expect(workspaceSource).toMatch(
      /persistMaterializedSessionNavigation:\s*persistTaskCenterMaterializedSessionNavigation/,
    );
    expect(handlerSource).toContain(
      "upsertTaskCenterOpenTab(readySessionId, taskCenterWorkspaceId)",
    );
    expect(handlerSource).toContain(
      "markTaskCenterLocalSessionOverride(readySessionId)",
    );
    expect(handlerSource).toContain(
      "persistMaterializedSessionNavigation(readySessionId)",
    );
  });
});

describe("AgentChatWorkspace right surface state boundary", () => {
  it("右侧 surface 本地状态必须由 current hook owner 提供，并先于 artifact 打开 runtime 捕获", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceLocalStateRuntime.ts",
      ),
      "utf8",
    );
    const hookCallStart = workspaceSource.indexOf(
      "useWorkspaceRightSurfaceLocalStateRuntime()",
    );
    const artifactOpenRuntimeStart = workspaceSource.indexOf(
      "useWorkspaceRightSurfaceArtifactOpenRuntime({",
    );

    expect(hookCallStart).toBeGreaterThanOrEqual(0);
    expect(artifactOpenRuntimeStart).toBeGreaterThan(hookCallStart);
    expect(workspaceSource).not.toContain("const [manualRightSurface");
    expect(workspaceSource).not.toContain(
      "const [activeFilesRightSurfaceTarget",
    );
    expect(workspaceSource).not.toContain("const [activeArticleWorkspace");
    expect(ownerSource).toContain("const [manualRightSurface");
    expect(ownerSource).toContain("const [activeFilesRightSurfaceTarget");
    expect(ownerSource).toContain("const [activeArticleWorkspace");
    expect(ownerSource).toContain("openArticleWorkspaceRightSurface");
  });

  it("Artifact click 的 Article right surface 打开逻辑必须由 artifact open runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceArtifactOpenRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceRightSurfaceArtifactOpenRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "buildArticleWorkspaceForArtifactOpen(",
    );
    expect(workspaceSource).not.toContain("articleEditorRightSurfaceRef");
    expect(workspaceSource).not.toContain("rightSurfacePendingActionsRef");
    expect(ownerSource).toContain("buildArticleWorkspaceForArtifactOpen(");
    expect(ownerSource).toContain("bindArticleEditorRightSurface");
    expect(ownerSource).toContain("bindRightSurfacePendingActions");
    expect(ownerSource).toContain(
      'consumePendingRequestsForSurface?.(\n          "articleWorkspace"',
    );
    expect(ownerSource).toContain(
      'consumePendingRequestsForSurface?.(\n          "objectCanvas"',
    );
  });

  it("右侧 surface pending App Server runtime 必须由 pending bridge runtime 绑定", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingBridgeRuntime.ts",
      ),
      "utf8",
    );
    const coordinatorSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceCoordinatorRuntime.ts",
      ),
      "utf8",
    );

    expect(coordinatorSource).toContain(
      "useWorkspaceRightSurfacePendingBridgeRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceRightSurfacePendingBridgeRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceRightSurfacePendingRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "shouldAutoRefreshWorkspaceRightSurfacePending({",
    );
    expect(workspaceSource).not.toContain(
      "bindRightSurfacePendingActions({",
    );
    expect(ownerSource).toContain("useWorkspaceRightSurfacePendingRuntime({");
    expect(ownerSource).toContain(
      "shouldAutoRefreshWorkspaceRightSurfacePending({",
    );
    expect(ownerSource).toContain("bindRightSurfacePendingActions({");
  });

  it("右侧 surface 动作编排必须由 action runtime 提供，不回流父级 Workspace", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceActionRuntime.ts",
      ),
      "utf8",
    );
    const coordinatorSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceCoordinatorRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceRightSurfaceCoordinatorRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceRightSurfaceActionRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceRightSurfaceDerivedRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceRightSurfaceProjectionRuntime({",
    );
    expect(coordinatorSource).toContain(
      "useWorkspaceRightSurfaceActionRuntime({",
    );
    expect(coordinatorSource).toContain(
      "useWorkspaceRightSurfaceDerivedRuntime({",
    );
    expect(coordinatorSource).toContain(
      "useWorkspaceRightSurfaceProjectionRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "const handleToggleExpertInfoPanel = useCallback",
    );
    expect(ownerSource).toContain("const handleToggleExpertInfoPanel");
    expect(ownerSource).toContain(
      "consumePendingRequestsForSurface(\"expertInfo\")",
    );
    expect(ownerSource).toContain(
      "dismissPendingRequestsForSurface(\n        \"expertInfo\"",
    );
  });

  it("右侧 surface host 渲染和 Article action 写回必须由 host runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceRightSurfaceHostRuntime.ts",
      ),
      "utf8",
    );
    const hostCallStart = workspaceSource.indexOf(
      "useWorkspaceRightSurfaceHostRuntime({",
    );
    const hostCallEnd = workspaceSource.indexOf(
      "const generalWorkbenchSidebarNode",
      hostCallStart,
    );
    expect(hostCallStart).toBeGreaterThanOrEqual(0);
    expect(hostCallEnd).toBeGreaterThan(hostCallStart);
    const hostCallSource = workspaceSource.slice(hostCallStart, hostCallEnd);

    expect(workspaceSource).not.toContain(
      "renderWorkspaceRightSurfaceHostRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "submitWorkspaceArticleEditorActionIntent",
    );
    expect(workspaceSource).not.toContain(
      "buildWorkspaceArticleWorkspaceSelectionUpdateRequest",
    );
    expect(ownerSource).toContain("renderWorkspaceRightSurfaceHostRuntime({");
    expect(ownerSource).toContain("submitWorkspaceArticleEditorActionIntent");
    expect(ownerSource).toContain(
      "buildWorkspaceArticleWorkspaceSelectionUpdateRequest",
    );
    expect(hostCallSource).toContain("rightSurfaceRuntime,");
    expect(hostCallSource).not.toContain("activePluginSurfaceContainerId,");
    expect(hostCallSource).not.toContain("browserRightSurfaceAvailable,");
    expect(hostCallSource).not.toContain("filesRightSurfaceAvailable,");
    expect(hostCallSource).not.toContain("objectCanvasRightSurfaceAvailable,");
    expect(hostCallSource).not.toContain("pluginSurfaceRightSurface,");
    expect(ownerSource).toContain("rightSurfaceRuntime:");
  });

  it("Article Editor 图片槽位命令组装必须由 current image slot runtime 提供", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceArticleEditorImageSlotRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceArticleEditorImageSlotRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "buildWorkspaceArticleEditorImageSlotCommand",
    );
    expect(workspaceSource).not.toContain(
      "WorkspaceArticleWorkspaceImageSlotIntent",
    );
    expect(ownerSource).toContain(
      "buildWorkspaceArticleEditorImageSlotCommand",
    );
    expect(ownerSource).toContain("handleArticleWorkspaceImageSlotIntent");
  });
});
