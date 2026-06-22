import type { McpContent } from "@/lib/api/mcp";

export interface McpToolInputField {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export type McpToolContentKind = "text" | "image" | "resource";

export function extractMcpToolInputFields(
  schema: Record<string, unknown>,
): McpToolInputField[] {
  const properties = (schema.properties || {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = (schema.required || []) as string[];

  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: (prop.type as string) || "string",
    description: (prop.description as string) || "",
    required: required.includes(name),
  }));
}

export function parseMcpToolFormValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function buildMcpToolFormArgs({
  fields,
  args,
}: {
  fields: readonly McpToolInputField[];
  args: Record<string, string>;
}): Record<string, unknown> {
  const callArgs: Record<string, unknown> = {};

  fields.forEach((field) => {
    const value = args[field.name];
    if (value !== undefined && value !== "") {
      callArgs[field.name] = parseMcpToolFormValue(value);
    }
  });

  return callArgs;
}

export function buildMcpToolJsonArgs(
  jsonInput: string,
): Record<string, unknown> {
  return JSON.parse(jsonInput) as Record<string, unknown>;
}

export function getMcpToolContentKind(content: McpContent): McpToolContentKind {
  return content.type;
}
