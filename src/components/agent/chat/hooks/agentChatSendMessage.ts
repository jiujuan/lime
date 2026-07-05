import type { SlashCommandStatusSnapshot } from "../commands";
import { executeSlashCommand, parseSlashCommand } from "../commands";
import { recordSlashEntryUsage } from "../skill-selection/slashEntryUsage";
import { modelRegistryApi } from "@/lib/api/modelRegistry";
import type { ModelCapabilitySummary } from "@/lib/model/inferModelCapabilities";
import { resolveModelCapabilitySummaryForSelection } from "@/lib/model/modelCapabilitySendGate";
import type {
  ClearMessagesOptions,
  SendMessageFn,
  SendMessageOptions,
} from "./agentChatShared";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";

interface AgentChatModelCapabilitySelection {
  providerType?: string | null;
  model?: string | null;
}

type AgentChatModelCapabilitySummaryResolver = (
  selection: AgentChatModelCapabilitySelection,
) => Promise<ModelCapabilitySummary | null>;

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
  resolveModelCapabilitySummary?: AgentChatModelCapabilitySummaryResolver;
}

async function resolveCurrentModelCapabilitySummary({
  providerType,
  model,
}: AgentChatModelCapabilitySelection): Promise<ModelCapabilitySummary | null> {
  const models = await modelRegistryApi.getModelRegistry();
  return resolveModelCapabilitySummaryForSelection({
    models,
    providerType,
    model,
  });
}

function hasExplicitModelCapabilitySummary(
  sendOptions?: SendMessageOptions,
): boolean {
  return sendOptions?.modelCapabilitySummary !== undefined;
}

function resolveEffectiveModelCapabilitySelection(options: {
  baseStatusSnapshot: SlashCommandStatusSnapshot;
  modelOverride?: string;
  sendOptions?: SendMessageOptions;
}): AgentChatModelCapabilitySelection {
  return {
    providerType:
      options.sendOptions?.providerOverride?.trim() ||
      options.baseStatusSnapshot.providerType,
    model:
      options.sendOptions?.modelOverride?.trim() ||
      options.modelOverride?.trim() ||
      options.baseStatusSnapshot.model,
  };
}

async function withSelectedModelCapabilitySummary(options: {
  baseStatusSnapshot: SlashCommandStatusSnapshot;
  modelOverride?: string;
  sendOptions?: SendMessageOptions;
  resolveModelCapabilitySummary: AgentChatModelCapabilitySummaryResolver;
}): Promise<SendMessageOptions | undefined> {
  const { sendOptions } = options;
  if (hasExplicitModelCapabilitySummary(sendOptions)) {
    return sendOptions;
  }

  const selection = resolveEffectiveModelCapabilitySelection(options);
  if (!selection.model?.trim()) {
    return sendOptions;
  }

  try {
    const modelCapabilitySummary =
      await options.resolveModelCapabilitySummary(selection);
    if (!modelCapabilitySummary) {
      return sendOptions;
    }
    return {
      ...(sendOptions || {}),
      modelCapabilitySummary,
    };
  } catch {
    return sendOptions;
  }
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
    resolveModelCapabilitySummary = resolveCurrentModelCapabilitySummary,
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
    const resolveSendOptions = () =>
      withSelectedModelCapabilitySummary({
        baseStatusSnapshot,
        modelOverride,
        sendOptions,
        resolveModelCapabilitySummary,
      });

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
            const resolvedSendOptions = await resolveSendOptions();
            await rawSendMessage(
              prompt,
              images,
              webSearch,
              thinking,
              skipUserMessage,
              executionStrategyOverride,
              modelOverride,
              autoContinue,
              resolvedSendOptions,
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

    const resolvedSendOptions = await resolveSendOptions();
    await rawSendMessage(
      content,
      images,
      webSearch,
      thinking,
      skipUserMessage,
      executionStrategyOverride,
      modelOverride,
      autoContinue,
      resolvedSendOptions,
    );
  };
}
