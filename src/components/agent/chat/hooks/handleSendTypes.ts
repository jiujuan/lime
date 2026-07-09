import type { AssistantDraftState, SlashSkillRequest } from "./agentChatShared";
import type { AgentRuntimeWebSearchMode } from "@/lib/api/agentRuntime";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import type { InputCapabilitySendRoute } from "../skill-selection/inputCapabilitySelection";
import type { InterruptedInputDraftSnapshot } from "./agentStreamInputRestoreTypes";

export interface HandleSendObserver {
  onComplete?: (content: string) => void;
  onError?: (message: string) => void;
}

export interface HandleSendOptions {
  skipThemeSkillPrefix?: boolean;
  skipSceneCommandRouting?: boolean;
  skipWorkspaceCommandRouting?: boolean;
  purpose?: "content_review" | "text_stylize" | "style_rewrite" | "style_audit";
  observer?: HandleSendObserver;
  requestMetadata?: Record<string, unknown>;
  toolPreferencesOverride?: ChatToolPreferences;
  displayContent?: string;
  skillRequest?: SlashSkillRequest;
  capabilityRoute?: InputCapabilitySendRoute;
  inputRestoreDraft?: InterruptedInputDraftSnapshot;
  providerOverride?: string;
  modelOverride?: string;
  reasoningEffort?: string;
  systemPromptOverride?: string;
  searchMode?: AgentRuntimeWebSearchMode;
  explicitToolPreferences?: boolean;
  assistantDraft?: AssistantDraftState;
  targetSessionId?: string;
  skipSessionRestore?: boolean;
  skipSessionStartHooks?: boolean;
  skipPreSubmitResume?: boolean;
}
