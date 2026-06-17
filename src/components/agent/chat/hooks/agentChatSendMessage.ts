import type { SlashCommandStatusSnapshot } from "../commands";
import { executeSlashCommand, parseSlashCommand } from "../commands";
import { recordSlashEntryUsage } from "../skill-selection/slashEntryUsage";
import type { ClearMessagesOptions, SendMessageFn } from "./agentChatShared";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";

interface CreateAgentChatSendMessageOptions {
  baseStatusSnapshot: SlashCommandStatusSnapshot;
  rawSendMessage: SendMessageFn;
  compactSession: () => Promise<void>;
  clearMessages: (options?: ClearMessagesOptions) => void;
  createFreshSession: (sessionName?: string) => Promise<string | null>;
  appendAssistantMessage: (content: string) => void;
  notifyInfo: (message: string) => void;
  notifySuccess: (message: string) => void;
  onOpenSubagents?: () => void;
}

export function createAgentChatSendMessage(
  options: CreateAgentChatSendMessageOptions,
): SendMessageFn {
  const {
    baseStatusSnapshot,
    rawSendMessage,
    compactSession,
    clearMessages,
    createFreshSession,
    appendAssistantMessage,
    notifyInfo,
    notifySuccess,
    onOpenSubagents,
  } = options;

  return async (
    content,
    images,
    webSearch,
    thinking,
    skipUserMessage,
    executionStrategyOverride,
    modelOverride,
    autoContinue,
    sendOptions,
  ) => {
    if (!skipUserMessage) {
      const parsedSlashCommand = parseSlashCommand(content);
      if (parsedSlashCommand) {
        const effectiveModel =
          modelOverride?.trim() || baseStatusSnapshot.model;
        const effectiveExecutionStrategy = normalizeExecutionStrategy(
          executionStrategyOverride || baseStatusSnapshot.executionStrategy,
        );
        const handled = await executeSlashCommand({
          command: parsedSlashCommand,
          statusSnapshot: {
            ...baseStatusSnapshot,
            model: effectiveModel,
            executionStrategy: effectiveExecutionStrategy,
          },
          sendPrompt: async (prompt) => {
            await rawSendMessage(
              prompt,
              images,
              webSearch,
              thinking,
              skipUserMessage,
              executionStrategyOverride,
              modelOverride,
              autoContinue,
              sendOptions,
            );
          },
          compactSession,
          clearMessages,
          createFreshSession,
          appendAssistantMessage,
          notifyInfo,
          notifySuccess,
          onOpenSubagents,
          onExecutedCommand: (command) => {
            if (command.definition.support !== "supported") {
              return;
            }

            recordSlashEntryUsage({
              kind: "command",
              entryId: command.definition.key,
              replayText: command.userInput,
            });
          },
        });
        if (handled) {
          return;
        }
      }
    }

    await rawSendMessage(
      content,
      images,
      webSearch,
      thinking,
      skipUserMessage,
      executionStrategyOverride,
      modelOverride,
      autoContinue,
      sendOptions,
    );
  };
}
