import type { HandleSendOptions } from "../hooks/handleSendTypes";
import {
  buildWorkspaceProductProfileActionRequestMetadata,
  type WorkspaceProductProfileActionIntent,
} from "./workspaceProductProfileModel";

export type SubmitWorkspaceProductProfileAction = (
  prompt: string,
  options: HandleSendOptions,
) => Promise<boolean>;

export interface SubmitWorkspaceProductProfileActionIntentParams {
  intent: WorkspaceProductProfileActionIntent;
  submit: SubmitWorkspaceProductProfileAction;
  restoreInput?: (prompt: string) => void;
}

export async function submitWorkspaceProductProfileActionIntent({
  intent,
  restoreInput,
  submit,
}: SubmitWorkspaceProductProfileActionIntentParams): Promise<boolean> {
  const normalizedPrompt = intent.prompt.trim();
  if (!normalizedPrompt) {
    return false;
  }

  const sent = await submit(normalizedPrompt, {
    displayContent: normalizedPrompt,
    requestMetadata: buildWorkspaceProductProfileActionRequestMetadata(intent),
    skipSceneCommandRouting: true,
  });
  if (!sent) {
    restoreInput?.(normalizedPrompt);
  }
  return sent;
}
