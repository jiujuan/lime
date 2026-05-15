import type {
  AgentAppCapabilityErrorCode,
  AgentAppCapabilityErrorPayload,
} from "../types";

export class AgentAppCapabilityError extends Error {
  readonly code: AgentAppCapabilityErrorCode;
  readonly appId?: string;
  readonly entryKey?: string;
  readonly capability?: string;

  constructor(payload: AgentAppCapabilityErrorPayload) {
    super(payload.message);
    this.name = "AgentAppCapabilityError";
    this.code = payload.code;
    this.appId = payload.appId;
    this.entryKey = payload.entryKey;
    this.capability = payload.capability;
  }
}
