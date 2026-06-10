import type { RefObject } from "react";

type InputbarDictationState = "idle";

interface UseInputbarDictationArgs {
  text: string;
  setText: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
}

export function useInputbarDictation({
  text,
  setText,
  textareaRef,
  disabled,
}: UseInputbarDictationArgs) {
  void text;
  void setText;
  void textareaRef;
  void disabled;

  return {
    dictationEnabled: false,
    voiceConfigLoaded: true,
    dictationState: "idle" as InputbarDictationState,
    recordingStatus: null,
    liveTranscript: "",
    isDictating: false,
    isDictationBusy: false,
    isDictationProcessing: false,
    handleDictationToggle: async () => undefined,
  };
}
