import type { AgentRuntimeWorkspaceSkillBinding } from "@/lib/api/agentRuntime/toolInventoryTypes";
import type { AgentPageParams } from "@/types/page";
import { buildHomeAgentParams } from "@/lib/workspace/navigation";
import {
  buildWorkspaceSkillRuntimeEnableHarnessMetadata,
  type WorkspaceSkillRuntimeEnableInput,
} from "@/components/agent/chat/utils/workspaceSkillBindingsMetadata";

export interface WorkspaceSkillRuntimeLaunchInput {
  workspaceRoot?: string | null;
  projectId?: string | null;
  binding: AgentRuntimeWorkspaceSkillBinding;
  prompt: string;
}

export function buildWorkspaceSkillRuntimeLaunchParams({
  workspaceRoot,
  projectId,
  binding,
  prompt,
}: WorkspaceSkillRuntimeLaunchInput): AgentPageParams | null {
  const enableInput: WorkspaceSkillRuntimeEnableInput = {
    workspaceRoot,
    bindings: [binding],
  };
  const runtimeEnableMetadata =
    buildWorkspaceSkillRuntimeEnableHarnessMetadata(enableInput);

  if (!runtimeEnableMetadata) {
    return null;
  }

  return buildHomeAgentParams({
    projectId: projectId ?? undefined,
    initialUserPrompt: prompt,
    initialRequestMetadata: {
      harness: runtimeEnableMetadata,
    },
    initialAutoSendRequestMetadata: {
      harness: runtimeEnableMetadata,
    },
    autoRunInitialPromptOnMount: true,
  });
}
