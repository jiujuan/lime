export type UIMessagePartKind =
  | "text"
  | "reasoning"
  | "tool-preview"
  | "artifact-card"
  | "evidence-citation"
  | "diagnostic-ref"
  | string;

export type UIMessagePartState =
  | "streaming"
  | "final"
  | "available"
  | "failed"
  | "unknown"
  | string;

export interface UIMessagePart {
  type: UIMessagePartKind;
  partId: string;
  messageId?: string;
  role?: "user" | "assistant" | "system" | string;
  text?: string;
  state?: UIMessagePartState;
  toolCallId?: string;
  artifactId?: string;
  evidenceId?: string;
  diagnosticId?: string;
  sourceEventId: string;
  createdAt?: string;
  refs?: string[];
}

export type UIMessageParts = UIMessagePart[];
