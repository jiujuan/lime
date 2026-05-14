import React from "react";
import type { A2UIFormData } from "@/lib/workspace/a2ui";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { RuntimePeerMessageCards } from "./RuntimePeerMessageCards";
import {
  UserCommandMessageContent,
  UserInstalledSkillMessageContent,
} from "./MessageListUserContent";
import type { Message } from "../types";

interface MessageUserBodyProps {
  content: string;
  installedSkillMessageLabel: string | null;
  isUserCommandMessage: boolean;
  message: Message;
  onA2UISubmit?: (formData: A2UIFormData, messageId: string) => void;
  rawRuntimePeerContent: string;
  renderA2UIInline: boolean;
  shouldRenderRuntimePeerCards: boolean;
}

export function MessageUserBody({
  content,
  installedSkillMessageLabel,
  isUserCommandMessage,
  message,
  onA2UISubmit,
  rawRuntimePeerContent,
  renderA2UIInline,
  shouldRenderRuntimePeerCards,
}: MessageUserBodyProps) {
  if (!content) {
    return null;
  }

  if (installedSkillMessageLabel) {
    return (
      <UserInstalledSkillMessageContent
        content={content}
        label={installedSkillMessageLabel}
      />
    );
  }

  if (isUserCommandMessage) {
    return (
      <UserCommandMessageContent
        content={content}
        route={message.inputCapabilityRoute}
      />
    );
  }

  if (shouldRenderRuntimePeerCards) {
    return <RuntimePeerMessageCards text={rawRuntimePeerContent} />;
  }

  return (
    <MarkdownRenderer
      content={content}
      onA2UISubmit={
        onA2UISubmit ? (formData) => onA2UISubmit(formData, message.id) : undefined
      }
      renderA2UIInline={renderA2UIInline}
    />
  );
}
