import type { ChatInputAdapter } from "./types";
import type { ComposerAttachment } from "../types";
import type { ModelReasoningEffortLevel } from "@/lib/types/modelRegistry";

interface CreateAgentInputAdapterOptions {
  text: string;
  setText: (value: string) => void;
  isSending: boolean;
  disabled?: boolean;
  providerType: string;
  model: string;
  reasoningEffort?: ModelReasoningEffortLevel | "";
  setProviderType: (providerType: string) => void;
  setModel: (model: string) => void;
  setReasoningEffort?: (value: ModelReasoningEffortLevel | "") => void;
  send: (options?: { textOverride?: string }) => void;
  stop?: () => void;
  attachments?: ComposerAttachment[];
}

export const createAgentInputAdapter = (
  options: CreateAgentInputAdapterOptions,
): ChatInputAdapter => {
  const {
    text,
    setText,
    isSending,
    disabled,
    providerType,
    model,
    reasoningEffort,
    setProviderType,
    setModel,
    setReasoningEffort,
    send,
    stop,
    attachments,
  } = options;

  return {
    state: {
      text,
      isSending,
      disabled,
      attachments,
    },
    model: {
      providerType,
      model,
      reasoningEffort,
    },
    actions: {
      setText,
      send,
      stop,
      setProviderType,
      setModel,
      setReasoningEffort,
    },
    ui: {
      showModelSelector: true,
      showToolBar: true,
    },
  };
};
