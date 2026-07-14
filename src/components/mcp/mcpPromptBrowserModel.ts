import type { McpPromptDefinition } from "@/lib/api/mcp";

export type McpPromptsByServer = Record<string, McpPromptDefinition[]>;

export function mcpPromptTargetKey(prompt: McpPromptDefinition): string {
  return `${prompt.server_name}\u0000${prompt.name}`;
}

export function groupMcpPromptsByServer(
  prompts: readonly McpPromptDefinition[],
): McpPromptsByServer {
  return prompts.reduce<McpPromptsByServer>((acc, prompt) => {
    if (!acc[prompt.server_name]) {
      acc[prompt.server_name] = [];
    }
    acc[prompt.server_name].push(prompt);
    return acc;
  }, {});
}

export function filterMcpPromptsByServer(
  promptsByServer: McpPromptsByServer,
  query: string,
): McpPromptsByServer {
  const normalizedQuery = query.trim().toLowerCase();

  return Object.entries(promptsByServer).reduce<McpPromptsByServer>(
    (acc, [serverName, serverPrompts]) => {
      const filtered = normalizedQuery
        ? serverPrompts.filter((prompt) =>
            matchesMcpPromptQuery(prompt, normalizedQuery),
          )
        : serverPrompts;

      if (filtered.length > 0) {
        acc[serverName] = filtered;
      }
      return acc;
    },
    {},
  );
}

export function buildMcpPromptArguments(
  prompt: McpPromptDefinition,
  promptArgs: Record<string, string>,
): Record<string, unknown> {
  return prompt.arguments.reduce<Record<string, unknown>>((acc, arg) => {
    const value = promptArgs[arg.name];
    if (value) {
      acc[arg.name] = value;
    }
    return acc;
  }, {});
}

function matchesMcpPromptQuery(
  prompt: McpPromptDefinition,
  normalizedQuery: string,
): boolean {
  return (
    prompt.name.toLowerCase().includes(normalizedQuery) ||
    (prompt.description ?? "").toLowerCase().includes(normalizedQuery)
  );
}
