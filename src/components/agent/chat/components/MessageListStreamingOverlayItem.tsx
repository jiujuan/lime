import React, { useEffect } from "react";
import {
  type AgentStreamTextOverlaySnapshot,
  useAgentStreamTextOverlay,
} from "../hooks/agentStreamTextOverlayStore";
import type { Message } from "../types";
import type { MessageListRenderGroup } from "./MessageList.types";

interface MessageListStreamingOverlayItemProps {
  msg: Message;
  group: MessageListRenderGroup;
  onOverlayUpdate?: () => void;
  render: (
    msg: Message,
    group: MessageListRenderGroup,
    overlay: AgentStreamTextOverlaySnapshot | null,
  ) => React.ReactNode;
}

export const MessageListStreamingOverlayItem = React.memo(
  ({
    msg,
    group,
    onOverlayUpdate,
    render,
  }: MessageListStreamingOverlayItemProps) => {
    const overlay = useAgentStreamTextOverlay(
      msg.role === "assistant" ? msg.id : null,
    );

    useEffect(() => {
      if (!overlay?.content) {
        return;
      }
      onOverlayUpdate?.();
    }, [onOverlayUpdate, overlay?.content, overlay?.updatedAt]);

    return <>{render(msg, group, overlay)}</>;
  },
);

MessageListStreamingOverlayItem.displayName =
  "MessageListStreamingOverlayItem";
