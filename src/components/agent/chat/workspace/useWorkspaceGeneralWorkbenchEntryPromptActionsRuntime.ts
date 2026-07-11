import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { AgentInitialInputCapabilityParams } from "@/types/page";
import type { GeneralWorkbenchFollowUpActionPayload } from "../components/generalWorkbenchSidebarContract";
import type { WorkspaceHandleSend } from "./useWorkspaceSendActions";
import type { GeneralWorkbenchEntryPromptState } from "./workspaceSendHelpers";
import { buildRuntimeInitialInputCapabilityFromFollowUpAction } from "../utils/inputCapabilityBootstrap";

interface UseWorkspaceGeneralWorkbenchEntryPromptActionsRuntimeParams {
  consumeInitialPrompt: (dispatchKey: string | null) => void;
  dismissGeneralWorkbenchEntryPrompt: (options?: {
    consumeInitialPrompt?: boolean;
    onConsumeInitialPrompt?: () => void;
  }) => void;
  entryBannerMessage?: string | null;
  generalWorkbenchEntryPrompt: GeneralWorkbenchEntryPromptState | null;
  handleSendRef: MutableRefObject<WorkspaceHandleSend>;
  initialDispatchKey: string | null;
  input: string;
  setEntryBannerVisible: Dispatch<SetStateAction<boolean>>;
  setInput: Dispatch<SetStateAction<string>>;
  setRuntimeEntryBannerMessage: Dispatch<SetStateAction<string | null>>;
  setRuntimeInitialInputCapability: Dispatch<
    SetStateAction<AgentInitialInputCapabilityParams | undefined>
  >;
}

export function useWorkspaceGeneralWorkbenchEntryPromptActionsRuntime({
  consumeInitialPrompt,
  dismissGeneralWorkbenchEntryPrompt,
  entryBannerMessage,
  generalWorkbenchEntryPrompt,
  handleSendRef,
  initialDispatchKey,
  input,
  setEntryBannerVisible,
  setInput,
  setRuntimeEntryBannerMessage,
  setRuntimeInitialInputCapability,
}: UseWorkspaceGeneralWorkbenchEntryPromptActionsRuntimeParams) {
  const handleContinueGeneralWorkbenchEntryPrompt = useCallback(async () => {
    if (!generalWorkbenchEntryPrompt) {
      return;
    }

    const promptToSend =
      input.trim() || generalWorkbenchEntryPrompt.prompt.trim();
    if (!promptToSend) {
      toast.info("请先补充要继续执行的内容");
      return;
    }

    await handleSendRef.current([], undefined, undefined, promptToSend);
  }, [generalWorkbenchEntryPrompt, handleSendRef, input]);

  const applyWorkbenchFollowUpActionPayload = useCallback(
    (payload: GeneralWorkbenchFollowUpActionPayload) => {
      const normalizedPrompt = payload.prompt.trim();
      if (!normalizedPrompt) {
        return;
      }
      const nextBannerMessage = payload.bannerMessage?.trim() || null;
      setRuntimeEntryBannerMessage(nextBannerMessage);
      setEntryBannerVisible(Boolean(nextBannerMessage || entryBannerMessage));
      setInput(normalizedPrompt);
      const nextRuntimeInitialInputCapability =
        buildRuntimeInitialInputCapabilityFromFollowUpAction({
          payload,
          requestKey: Date.now(),
        });
      if (!nextRuntimeInitialInputCapability) {
        return;
      }
      setRuntimeInitialInputCapability(nextRuntimeInitialInputCapability);
    },
    [
      entryBannerMessage,
      setEntryBannerVisible,
      setInput,
      setRuntimeEntryBannerMessage,
      setRuntimeInitialInputCapability,
    ],
  );

  const handleRestartGeneralWorkbenchEntryPrompt = useCallback(() => {
    if (!generalWorkbenchEntryPrompt) {
      return;
    }

    dismissGeneralWorkbenchEntryPrompt({
      consumeInitialPrompt:
        generalWorkbenchEntryPrompt.kind === "initial_prompt",
      onConsumeInitialPrompt: () => {
        consumeInitialPrompt(initialDispatchKey);
      },
    });
    setInput("");
  }, [
    consumeInitialPrompt,
    dismissGeneralWorkbenchEntryPrompt,
    generalWorkbenchEntryPrompt,
    initialDispatchKey,
    setInput,
  ]);

  return {
    applyWorkbenchFollowUpActionPayload,
    handleContinueGeneralWorkbenchEntryPrompt,
    handleRestartGeneralWorkbenchEntryPrompt,
  };
}
