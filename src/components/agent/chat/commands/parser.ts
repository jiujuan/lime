import { SLASH_COMMANDS } from "./catalog";
import type {
  SlashCommandDefinition,
  ParsedSlashCommand,
} from "./types";

const SLASH_COMMAND_REGEX = /^\/([a-zA-Z0-9._-]+)(?:\s+([\s\S]*))?$/;

const COMMAND_LOOKUP = new Map<string, SlashCommandDefinition>();

for (const command of SLASH_COMMANDS) {
  COMMAND_LOOKUP.set(command.commandName.toLowerCase(), command);
  for (const alias of command.aliases) {
    COMMAND_LOOKUP.set(alias.toLowerCase(), command);
  }
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/^\//, "").toLowerCase();
}

export function resolveSlashCommand(
  commandName: string,
): SlashCommandDefinition | null {
  return COMMAND_LOOKUP.get(commandName.trim().toLowerCase()) ?? null;
}

export function parseSlashCommand(
  content: string,
): ParsedSlashCommand | null {
  const match = content.match(SLASH_COMMAND_REGEX);
  if (!match) {
    return null;
  }

  const [, commandName, userInput] = match;
  const definition = resolveSlashCommand(commandName);
  if (!definition) {
    return null;
  }

  return {
    definition,
    commandName: commandName.toLowerCase(),
    userInput: userInput?.trim() || "",
    rawContent: content,
  };
}

export function filterSlashCommands(
  query: string,
  options: { includeUnsupported?: boolean } = {},
): SlashCommandDefinition[] {
  const { includeUnsupported = true } = options;
  const normalizedQuery = normalizeQuery(query);
  const candidates = includeUnsupported
    ? SLASH_COMMANDS
    : SLASH_COMMANDS.filter((command) => command.support === "supported");

  if (!normalizedQuery) {
    return candidates;
  }

  return candidates.filter((command) => {
    const haystacks = [
      command.commandName,
      command.commandPrefix,
      command.label,
      command.description,
      ...command.aliases,
    ];
    return haystacks.some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });
}

export function getSupportedSlashCommands() {
  return SLASH_COMMANDS.filter(
    (command) => command.support === "supported",
  );
}

export function getUnsupportedSlashCommands() {
  return SLASH_COMMANDS.filter(
    (command) => command.support === "unsupported",
  );
}
