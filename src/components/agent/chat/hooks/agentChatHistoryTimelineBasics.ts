import type {
  AgentThreadItem,
  AgentThreadTurn,
} from "@/lib/api/agentProtocol";
import type { AgentSessionDetail } from "@/lib/api/agentRuntime";
import type { Message } from "../types";
import { sanitizeMessageTextForDisplay } from "../utils/messageDisplaySanitizer";
import {
  normalizeHistoryString,
  parseHistoryTimestamp,
} from "./agentChatHistoryPrimitives";
import { dedupeAdjacentHistoryMessages } from "./agentChatHistorySignatures";

const AUXILIARY_HISTORY_TURN_ID_PREFIX = "auxiliary-runtime-projection-";

export function readThreadItemText(
  item: AgentThreadItem,
  keys: readonly string[],
): string {
  const record = item as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = normalizeHistoryString(record[key]).trim();
    if (value) {
      return value;
    }
  }
  return "";
}

export function isAuxiliaryHistoryTurn(turn: AgentThreadTurn) {
  const normalizedId = normalizeHistoryString(turn.id).trim().toLowerCase();
  if (normalizedId.startsWith(AUXILIARY_HISTORY_TURN_ID_PREFIX)) {
    return true;
  }

  const normalizedPrompt = normalizeHistoryString(turn.prompt_text).trim();
  return (
    normalizedPrompt.startsWith("辅助标题生成") ||
    normalizedPrompt.startsWith("辅助人设生成")
  );
}

export function hydrateSessionDetailMessagesFromTurns(
  detail: AgentSessionDetail,
  topicId: string,
): Message[] {
  const messages = (detail.turns || [])
    .filter((turn) => !isAuxiliaryHistoryTurn(turn))
    .map((turn): Message | null => {
      const content = sanitizeMessageTextForDisplay(
        normalizeHistoryString(turn.prompt_text),
        {
          role: "user",
          hasImages: false,
        },
      );
      if (!content) {
        return null;
      }

      return {
        id: `${topicId}-turn-${normalizeHistoryString(turn.id) || "unknown"}-prompt`,
        role: "user",
        content,
        timestamp: parseHistoryTimestamp(
          turn.started_at || turn.created_at || turn.updated_at,
        ),
        runtimeTurnId: turn.id,
      };
    })
    .filter((message): message is Message => message !== null);

  return dedupeAdjacentHistoryMessages(messages);
}
