import type { AutoContinueRequestPayload } from "@/lib/api/agentRuntime";
import type { HandleSendOptions } from "../../hooks/handleSendTypes";
import type { MessageImage } from "../../types";

export type InputbarSendTriggerSource = "button" | "enter" | "ime" | "adapter";

export interface InputbarSendPayload {
  images?: MessageImage[];
  textOverride?: string;
  autoContinuePayload?: AutoContinueRequestPayload;
  sendOptions?: HandleSendOptions;
  triggeredAt?: number;
  triggerSource?: InputbarSendTriggerSource;
}

export type InputbarSendHandler = (
  payload?: InputbarSendPayload,
) => void | Promise<boolean> | boolean;
