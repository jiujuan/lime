import type { MessageImage, MessagePathReference } from "../types";
import type { InputCapabilitySendRoute } from "../skill-selection/inputCapabilitySelection";

export interface InterruptedInputDraftSnapshot {
  text: string;
  images?: readonly MessageImage[];
  pathReferences?: readonly MessagePathReference[];
  textElements?: readonly unknown[];
  inputCapabilityRoute?: InputCapabilitySendRoute;
}

export type InterruptedInputRestoreReason =
  | "no_submitted_draft"
  | "output_free_interrupted_turn"
  | "thinking_only_cancelled_turn"
  | "visible_output_present"
  | "side_effect_activity_present";

export interface InterruptedInputRestorePlan {
  shouldRestoreComposer: boolean;
  reason: InterruptedInputRestoreReason;
  draft: InterruptedInputDraftSnapshot | null;
}

export interface InterruptedInputRestoreRequest {
  requestId: string;
  reason: InterruptedInputRestoreReason;
  draft: InterruptedInputDraftSnapshot;
}
