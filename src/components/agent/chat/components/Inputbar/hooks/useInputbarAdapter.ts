import { useMemo } from "react";
import { createAgentInputAdapter } from "@/components/input-kit";
import type { MessageImage } from "../../../types";
import type { ModelReasoningEffortLevel } from "@/lib/types/modelRegistry";

interface UseInputbarAdapterParams {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  providerType?: string;
  setProviderType?: (type: string) => void;
  model?: string;
  setModel?: (model: string) => void;
  reasoningEffort?: ModelReasoningEffortLevel | "";
  setReasoningEffort?: (value: ModelReasoningEffortLevel | "") => void;
  handleSend: () => void;
  onStop?: () => void;
  pendingImages: MessageImage[];
}

const NOOP_SET_PROVIDER_TYPE = (_type: string) => {};
const NOOP_SET_MODEL = (_model: string) => {};

export function useInputbarAdapter({
  input,
  setInput,
  isLoading,
  disabled,
  providerType,
  setProviderType,
  model,
  setModel,
  reasoningEffort,
  setReasoningEffort,
  handleSend,
  onStop,
  pendingImages,
}: UseInputbarAdapterParams) {
  return useMemo(
    () =>
      createAgentInputAdapter({
        text: input,
        setText: setInput,
        isSending: isLoading,
        disabled,
        providerType: providerType || "",
        model: model || "",
        reasoningEffort: reasoningEffort || "",
        setProviderType: setProviderType || NOOP_SET_PROVIDER_TYPE,
        setModel: setModel || NOOP_SET_MODEL,
        setReasoningEffort,
        send: () => handleSend(),
        stop: onStop,
        attachments: pendingImages,
      }),
    [
      disabled,
      handleSend,
      input,
      isLoading,
      model,
      onStop,
      pendingImages,
      providerType,
      reasoningEffort,
      setInput,
      setModel,
      setProviderType,
      setReasoningEffort,
    ],
  );
}
