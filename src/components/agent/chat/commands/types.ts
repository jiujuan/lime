import type { AgentExecutionStrategy } from "@/lib/api/agentRuntime";

export type SlashCommandSupport = "supported" | "unsupported";
export type SlashCommandKind = "local_action" | "prompt_action" | "info";

export interface SlashCommandDefinition {
  key: string;
  commandName: string;
  commandPrefix: `/${string}`;
  label: string;
  description: string;
  aliases: string[];
  kind: SlashCommandKind;
  support: SlashCommandSupport;
  argumentHint?: string;
}

export interface ParsedSlashCommand {
  definition: SlashCommandDefinition;
  commandName: string;
  userInput: string;
  rawContent: string;
}

export interface SlashCommandStatusSnapshot {
  sessionId: string | null;
  currentTurnId: string | null;
  providerType: string;
  model: string;
  executionStrategy: AgentExecutionStrategy;
  queuedTurnsCount: number;
  isSending: boolean;
}

export interface ExecuteSlashCommandParams {
  command: ParsedSlashCommand;
  statusSnapshot: SlashCommandStatusSnapshot;
  sendPrompt: (prompt: string) => Promise<void>;
  compactSession: () => Promise<void>;
  clearMessages: (options?: {
    showToast?: boolean;
    toastMessage?: string;
  }) => void;
  createFreshSession: (sessionName?: string) => Promise<string | null>;
  appendAssistantMessage: (content: string) => void;
  notifyInfo: (message: string) => void;
  notifySuccess: (message: string) => void;
  onOpenSubagents?: () => void;
  onExecutedCommand?: (command: ParsedSlashCommand) => void;
}
