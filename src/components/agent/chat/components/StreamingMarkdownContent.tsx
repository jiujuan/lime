import React, { memo } from "react";
import { cn } from "@/lib/utils";
import {
  resolveStreamingMarkdownDisplaySource,
  type StreamingMarkdownDisplaySourceOptions,
} from "./streamingMarkdownDisplaySource";

interface StreamingMarkdownContentProps extends StreamingMarkdownDisplaySourceOptions {
  content: string;
  isStreaming?: boolean;
  pendingTailClassName?: string;
  renderMarkdown: (markdown: string) => React.ReactNode;
}

export const StreamingPendingMarkdownTail: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className }) => {
  if (!text) {
    return null;
  }

  return (
    <span
      data-testid="streaming-markdown-pending-tail"
      className={cn("whitespace-pre-wrap break-words", className)}
    >
      {text}
    </span>
  );
};

export const StreamingMarkdownContent: React.FC<StreamingMarkdownContentProps> =
  memo(
    ({
      content,
      isStreaming = false,
      deferMarkdownUntilComplete = false,
      pendingTailClassName,
      renderMarkdown,
    }) => {
      const displaySource = resolveStreamingMarkdownDisplaySource(
        content,
        isStreaming,
        { deferMarkdownUntilComplete },
      );

      return (
        <>
          {displaySource.markdown.trim()
            ? renderMarkdown(displaySource.markdown)
            : null}
          <StreamingPendingMarkdownTail
            text={displaySource.pendingTail}
            className={pendingTailClassName}
          />
        </>
      );
    },
  );

StreamingMarkdownContent.displayName = "StreamingMarkdownContent";
