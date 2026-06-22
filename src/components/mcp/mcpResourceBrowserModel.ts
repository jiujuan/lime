import type { McpResourceDefinition } from "@/lib/api/mcp";

export type McpResourcesByServer = Record<string, McpResourceDefinition[]>;

export function groupMcpResourcesByServer(
  resources: readonly McpResourceDefinition[],
): McpResourcesByServer {
  return resources.reduce<McpResourcesByServer>((acc, resource) => {
    if (!acc[resource.server_name]) {
      acc[resource.server_name] = [];
    }
    acc[resource.server_name].push(resource);
    return acc;
  }, {});
}

export function filterMcpResourcesByServer(
  resourcesByServer: McpResourcesByServer,
  query: string,
): McpResourcesByServer {
  const normalizedQuery = query.trim().toLowerCase();

  return Object.entries(resourcesByServer).reduce<McpResourcesByServer>(
    (acc, [serverName, serverResources]) => {
      const filtered = normalizedQuery
        ? serverResources.filter((resource) =>
            matchesMcpResourceQuery(resource, normalizedQuery),
          )
        : serverResources;

      if (filtered.length > 0) {
        acc[serverName] = filtered;
      }
      return acc;
    },
    {},
  );
}

function matchesMcpResourceQuery(
  resource: McpResourceDefinition,
  normalizedQuery: string,
): boolean {
  return (
    resource.name.toLowerCase().includes(normalizedQuery) ||
    resource.uri.toLowerCase().includes(normalizedQuery) ||
    (resource.description ?? "").toLowerCase().includes(normalizedQuery)
  );
}
