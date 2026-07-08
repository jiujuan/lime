import type { Message } from "../types";

export type MessageContentPart = NonNullable<Message["contentParts"]>[number];
export type TextMessageContentPart = Extract<
  MessageContentPart,
  { type: "text" }
>;
export type ThinkingMessageContentPart = Extract<
  MessageContentPart,
  { type: "thinking" }
>;
