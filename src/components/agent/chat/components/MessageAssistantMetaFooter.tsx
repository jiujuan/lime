import { InputbarRuntimeStatusLine } from "./Inputbar/components/InputbarRuntimeStatusLine";
import {
  TokenUsageDisplay,
  type TokenUsagePromptCacheNotice,
} from "./TokenUsageDisplay";
import {
  AssistantStreamingInlineIndicator,
  MessageRuntimeStatusPill,
} from "./MessageListRuntimeStatus";
import type { MessageAssistantMetaFooterState } from "./messageAssistantMetaFooterState";
import { resolvePromptCacheActivity } from "../utils/tokenUsageSummary";
import type { InputbarRuntimeStatusLineModel } from "../utils/inputbarRuntimeStatusLine";
import type { Message } from "../types";

interface MessageAssistantMetaFooterProps {
  activeConversationRuntimeStatusLine: InputbarRuntimeStatusLineModel | null;
  hasAssistantBodyContent: boolean;
  message: Message;
  onInterruptCurrentTurn?: () => void | Promise<void>;
  promptCacheNotice?: TokenUsagePromptCacheNotice | null;
  providerType?: string;
  state: MessageAssistantMetaFooterState;
  tailRuntimeStatusLine: InputbarRuntimeStatusLineModel | null;
}

export function MessageAssistantMetaFooter({
  activeConversationRuntimeStatusLine,
  hasAssistantBodyContent,
  message,
  onInterruptCurrentTurn,
  promptCacheNotice,
  providerType,
  state,
  tailRuntimeStatusLine,
}: MessageAssistantMetaFooterProps) {
  if (!state.hasAssistantMetaFooter) {
    return null;
  }

  return (
    <div
      className={
        hasAssistantBodyContent
          ? "mt-2 flex flex-wrap items-center gap-2"
          : "flex flex-wrap items-center gap-2 px-1 py-0.5"
      }
      data-testid="assistant-message-meta-footer"
    >
      {state.shouldRenderTailRuntimeStatusLine ? (
        <InputbarRuntimeStatusLine
          runtime={tailRuntimeStatusLine || null}
          providerType={providerType}
          canStop={Boolean(onInterruptCurrentTurn)}
        />
      ) : null}
      {state.shouldRenderActiveRuntimeFooterIndicator &&
      activeConversationRuntimeStatusLine ? (
        <AssistantStreamingInlineIndicator
          runtime={activeConversationRuntimeStatusLine}
        />
      ) : null}
      {state.shouldRenderStatusPill && message.runtimeStatus ? (
        <MessageRuntimeStatusPill status={message.runtimeStatus} />
      ) : null}
      {state.shouldRenderUsageFooter ? (
        <TokenUsageDisplay
          usage={message.usage!}
          inline={true}
          promptCacheNotice={
            resolvePromptCacheActivity(message.usage!) <= 0
              ? promptCacheNotice
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
