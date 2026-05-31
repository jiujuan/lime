import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";

type AgentEntry = NonNullable<AgentChatWorkspaceProps["agentEntry"]>;

type AgentChatPageShellInput = Pick<
  AgentChatWorkspaceProps,
  | "agentEntry"
  | "initialInputCapability"
  | "initialKnowledgePackSelection"
  | "initialPendingServiceSkillLaunch"
  | "initialProjectFileOpenTarget"
  | "initialSiteSkillLaunch"
  | "initialUserImages"
  | "initialUserPrompt"
  | "openBrowserAssistOnMount"
  | "preferHomeForInitialInputCapability"
  | "showChatPanel"
>;

export interface AgentChatPageShellViewModel {
  hasDirectWorkspaceIntent: boolean;
  shouldForceClawWorkspace: boolean;
  effectiveAgentEntry: AgentEntry;
  effectiveShowChatPanel: AgentChatWorkspaceProps["showChatPanel"];
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function resolveAgentChatPageShellViewModel(
  props: AgentChatPageShellInput,
): AgentChatPageShellViewModel {
  const agentEntry = props.agentEntry ?? "claw";
  const preferHomeForInitialInputCapability =
    props.preferHomeForInitialInputCapability ?? false;

  const hasDirectWorkspaceIntent =
    hasText(props.initialUserPrompt) ||
    Boolean(props.initialUserImages?.length) ||
    hasText(props.initialSiteSkillLaunch?.adapterName) ||
    hasText(props.initialPendingServiceSkillLaunch?.skillId) ||
    hasText(props.initialKnowledgePackSelection?.packName) ||
    (preferHomeForInitialInputCapability
      ? false
      : Boolean(props.initialInputCapability?.capabilityRoute)) ||
    hasText(props.initialProjectFileOpenTarget?.relativePath) ||
    Boolean(props.openBrowserAssistOnMount);

  const shouldForceClawWorkspace =
    agentEntry === "new-task" && hasDirectWorkspaceIntent;

  return {
    hasDirectWorkspaceIntent,
    shouldForceClawWorkspace,
    effectiveAgentEntry: shouldForceClawWorkspace ? "claw" : agentEntry,
    effectiveShowChatPanel: shouldForceClawWorkspace
      ? true
      : props.showChatPanel,
  };
}
