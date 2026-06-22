import { getMcpInnerToolName, type McpToolDefinition } from "@/lib/api/mcp";

export type McpToolsByServer = Record<string, McpToolDefinition[]>;

export function dedupeMcpTools(
  tools: readonly McpToolDefinition[],
): McpToolDefinition[] {
  const seen = new Set<string>();

  return tools.filter((tool) => {
    const key = `${tool.server_name}::${tool.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function groupMcpToolsByServer(
  tools: readonly McpToolDefinition[],
): McpToolsByServer {
  return tools.reduce<McpToolsByServer>((acc, tool) => {
    if (!acc[tool.server_name]) {
      acc[tool.server_name] = [];
    }
    acc[tool.server_name].push(tool);
    return acc;
  }, {});
}

export function filterMcpToolsByServer(
  toolsByServer: McpToolsByServer,
  query: string,
): McpToolsByServer {
  const normalizedQuery = query.trim().toLowerCase();

  return Object.entries(toolsByServer).reduce<McpToolsByServer>(
    (acc, [serverName, serverTools]) => {
      const filtered = serverTools
        .filter((tool) => matchesMcpToolQuery(tool, normalizedQuery))
        .sort(compareMcpToolsByDisplayName);

      if (filtered.length > 0) {
        acc[serverName] = filtered;
      }
      return acc;
    },
    {},
  );
}

function matchesMcpToolQuery(
  tool: McpToolDefinition,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const displayName = getMcpInnerToolName(tool.name, tool.server_name);
  return (
    displayName.toLowerCase().includes(normalizedQuery) ||
    tool.name.toLowerCase().includes(normalizedQuery) ||
    tool.description.toLowerCase().includes(normalizedQuery)
  );
}

function compareMcpToolsByDisplayName(
  left: McpToolDefinition,
  right: McpToolDefinition,
): number {
  const leftName = getMcpInnerToolName(left.name, left.server_name);
  const rightName = getMcpInnerToolName(right.name, right.server_name);
  return leftName.localeCompare(rightName);
}
