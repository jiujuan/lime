import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace image workbench send command boundary", () => {
  it("Image Workbench 发送路由和主线 submit 必须由 send command runtime 提供", () => {
    const workspaceSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceImageWorkbenchRuntime.ts",
      ),
      "utf8",
    );
    const sendSurfaceSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceSendSurfaceRuntime.ts",
      ),
      "utf8",
    );
    const commandWiringSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandWiring.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useAgentChatWorkspaceCommandWiring({");
    expect(workspaceSource).not.toContain("useWorkspaceSendSurfaceRuntime({");
    expect(commandWiringSource).toContain("useWorkspaceSendSurfaceRuntime({");
    expect(sendSurfaceSource).toContain("useWorkspaceImageWorkbenchRuntime(");
    expect(ownerSource.split("\n").length).toBeLessThan(160);
    for (const retiredWorkspaceImageSendOwner of [
      "submitImageWorkbenchAgentCommandRef",
      "const refreshImageWorkbenchSendRoute = useCallback",
      "const prepareImageWorkbenchSkillSend = useCallback",
      "const resolveImageWorkbenchSendCommandRequest = useCallback",
      "resolveImageWorkbenchCommandRequestWithSelection",
      "ensureImageWorkbenchProviderSelectionCommitted(",
      "applyImagePreferenceToSendRouteSelection(",
      "buildImageCommandIntentRequestMetadata(",
      "imageWorkbenchSelectionRef",
      "imageWorkbenchRequestProviderId",
      "imageWorkbenchRequestModelId",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceImageSendOwner);
    }
    expect(ownerSource).toContain(
      "useWorkspaceImageWorkbenchSendCommandRuntime({",
    );
    expect(ownerSource).toContain("bindWorkspaceHandleSendRef");
  });
});

describe("AgentChatWorkspace image workbench provider boundary", () => {
  it("Image Workbench Provider 偏好和选择状态必须由 provider runtime 提供", () => {
    const workspaceSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceImageWorkbenchProviderRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceImageWorkbenchProviderRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(220);
    for (const retiredWorkspaceImageProviderOwner of [
      "useGlobalMediaGenerationDefaults({",
      "useImageGen({",
      "resolveMediaGenerationPreference(",
      "resolveImageWorkbenchPreferenceViewModel(",
      "const effectiveGlobalImagePreference",
      "const imageWorkbenchPreferenceViewModel",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceImageProviderOwner);
    }
    expect(ownerSource).toContain("useGlobalMediaGenerationDefaults({");
    expect(ownerSource).toContain("useImageGen({");
    expect(ownerSource).toContain("resolveMediaGenerationPreference(");
    expect(ownerSource).toContain("resolveImageWorkbenchPreferenceViewModel(");
    expect(ownerSource).toContain("setOnDemandMediaDefaults");
  });
});

describe("AgentChatWorkspace image workbench command action boundary", () => {
  it("Image Workbench 命令启动必须由 command action runtime 提供", () => {
    const workspaceSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");
    const actionOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceImageWorkbenchActionRuntime.ts",
      ),
      "utf8",
    );
    const commandOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceImageWorkbenchCommandActionRuntime.ts",
      ),
      "utf8",
    );
    const sendSurfaceSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceSendSurfaceRuntime.ts",
      ),
      "utf8",
    );
    const commandWiringSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandWiring.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useAgentChatWorkspaceCommandWiring({");
    expect(workspaceSource).not.toContain("useWorkspaceSendSurfaceRuntime({");
    expect(commandWiringSource).toContain("useWorkspaceSendSurfaceRuntime({");
    expect(sendSurfaceSource).toContain("useWorkspaceImageWorkbenchRuntime(");
    expect(commandOwnerSource.split("\n").length).toBeLessThan(400);
    expect(actionOwnerSource.split("\n").length).toBeLessThan(800);
    for (const retiredActionRuntimeCommandOwner of [
      "generateAgentRuntimeTitleResult",
      "buildImageWorkbenchSessionTitle(",
      "isLocalImageWorkbenchSessionKey(",
      "ensureImageWorkbenchProviderSelectionCommitted(",
      "const handleImageWorkbenchCommand = useCallback",
      "resolveImageWorkbenchCommandRequest:",
      "submitImageWorkbenchAgentCommand",
      "imageWorkbenchSelectionRef",
      "imageWorkbenchRequestProviderId",
      "imageWorkbenchRequestModelId",
    ]) {
      expect(actionOwnerSource).not.toContain(retiredActionRuntimeCommandOwner);
    }
    expect(commandOwnerSource).toContain("generateAgentRuntimeTitleResult");
    expect(commandOwnerSource).toContain("buildImageWorkbenchSessionTitle(");
    expect(commandOwnerSource).toContain("isLocalImageWorkbenchSessionKey(");
    expect(commandOwnerSource).toContain(
      "ensureImageWorkbenchProviderSelectionCommitted(",
    );
    expect(commandOwnerSource).toContain(
      "const handleImageWorkbenchCommand = useCallback",
    );
    expect(commandOwnerSource).toContain(
      "resolveImageWorkbenchCommandRequest:",
    );
    expect(commandOwnerSource).toContain("submitImageWorkbenchAgentCommand");
  });
});
