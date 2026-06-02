import type { AutoContinueRequestPayload } from "@/lib/api/agentRuntime";
import type { HandleSendOptions } from "../../hooks/handleSendTypes";
import type { MessageImage } from "../../types";

export interface InputbarSendPayload {
  images?: MessageImage[];
  textOverride?: string;
  autoContinuePayload?: AutoContinueRequestPayload;
  sendOptions?: HandleSendOptions;
}

export type InputbarSendHandler = (
  payload?: InputbarSendPayload,
) => void | Promise<boolean> | boolean;
