import {
  invokeAppServerMethod,
  sanitizeJson,
  summarizeInvokeEntries as summarizeTransportInvokeEntries,
} from "./current-smoke-transport.mjs";

export {
  APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  invokeAppServerMethod,
  invokeBridgeCommand,
  sanitizeJson,
  waitForHealth,
  writeJsonFile,
} from "./current-smoke-transport.mjs";

export const REQUIRED_READ_METHODS = [
  "mcpServer/list",
  "mcpServerStatus/list",
  "mcpTool/list",
  "mcpTool/listForContext",
  "mcpTool/search",
  "mcpPrompt/list",
  "mcpResource/list",
];

export const FIXTURE_METHODS = [
  "mcpServer/create",
  "mcpServer/start",
  "mcpServerStatus/list",
  "mcpTool/list",
  "mcpTool/call",
  "mcpResource/list",
  "mcpResource/read",
  "mcpServer/stop",
  "mcpServer/delete",
];

export const OAUTH_FIXTURE_METHODS = [
  "mcpServer/create",
  "mcpServer/oauth/login",
  "mcpServerStatus/list",
  "mcpServer/delete",
];

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArrayField(method, result, field) {
  assert(
    result && typeof result === "object" && Array.isArray(result[field]),
    `${method} did not return ${field}`,
  );
  return result[field];
}

function assertEmptyObject(method, result) {
  assert(
    result && typeof result === "object" && !Array.isArray(result),
    `${method} did not return object result`,
  );
  assert(
    Object.keys(result).length === 0,
    `${method} did not return empty lifecycle result`,
  );
}

function assertToolOutputSchema(method, tool, expectedToolName) {
  assert(
    tool && typeof tool === "object" && tool.name === expectedToolName,
    `${method} did not return expected fixture tool ${expectedToolName}`,
  );
  const outputSchema = tool.output_schema ?? tool.outputSchema;
  assert(
    outputSchema && typeof outputSchema === "object",
    `${method} did not return output_schema for ${expectedToolName}`,
  );
  const structuredContentSchema =
    outputSchema.properties?.structuredContent ??
    outputSchema.properties?.structured_content;
  assert(
    structuredContentSchema && typeof structuredContentSchema === "object",
    `${method} output_schema did not expose structuredContent`,
  );
  assert(
    structuredContentSchema.properties?.echoedMessage?.type === "string",
    `${method} structuredContent schema did not expose echoedMessage`,
  );
  return {
    outputSchemaStructuredContentSeen: true,
    structuredContentSchemaKeys: Object.keys(
      structuredContentSchema.properties ?? {},
    ).sort(),
  };
}

function assertToolResult(
  method,
  result,
  expectedText,
  expectedStructuredContent,
) {
  assert(
    result && typeof result === "object" && Array.isArray(result.content),
    `${method} did not return content`,
  );
  assert(result.is_error === false, `${method} returned is_error=true`);
  assert(
    result.content.some(
      (item) => item?.type === "text" && item?.text === expectedText,
    ),
    `${method} did not return expected text ${expectedText}`,
  );
  const structuredContent =
    result.structuredContent ?? result.structured_content ?? null;
  if (expectedStructuredContent) {
    assert(
      structuredContent && typeof structuredContent === "object",
      `${method} did not return structuredContent`,
    );
    for (const [key, value] of Object.entries(expectedStructuredContent)) {
      assert(
        structuredContent[key] === value,
        `${method} structuredContent.${key} drifted`,
      );
    }
  }
  return structuredContent;
}

function assertResourceResult(method, result, expectedText) {
  assert(
    result && typeof result === "object" && result.uri === "fixture://status",
    `${method} did not return fixture resource uri`,
  );
  assert(
    result.text === expectedText,
    `${method} did not return expected text`,
  );
}

function assertResourceTemplate(method, templates, expectedUriTemplate) {
  const template = templates.find(
    (item) =>
      item?.uri_template === expectedUriTemplate ||
      item?.uriTemplate === expectedUriTemplate,
  );
  assert(template, `${method} did not return ${expectedUriTemplate}`);
  return template;
}

export function summarizeInvokeEntries(entries) {
  return summarizeTransportInvokeEntries(entries, {
    requiredReadMethods: REQUIRED_READ_METHODS,
    fixtureMethods: FIXTURE_METHODS,
    oauthFixtureMethods: OAUTH_FIXTURE_METHODS,
  });
}

export async function runReadChecks(options, entries) {
  assertArrayField(
    "mcpServer/list",
    await invokeAppServerMethod(options, "mcpServer/list", {}, entries),
    "servers",
  );
  assertArrayField(
    "mcpServerStatus/list",
    await invokeAppServerMethod(options, "mcpServerStatus/list", {}, entries),
    "servers",
  );
  assertArrayField(
    "mcpTool/list",
    await invokeAppServerMethod(options, "mcpTool/list", {}, entries),
    "tools",
  );
  assertArrayField(
    "mcpTool/listForContext",
    await invokeAppServerMethod(
      options,
      "mcpTool/listForContext",
      { caller: "assistant", includeDeferred: true },
      entries,
    ),
    "tools",
  );
  assertArrayField(
    "mcpTool/search",
    await invokeAppServerMethod(
      options,
      "mcpTool/search",
      { query: "fixture", caller: "tool_search", limit: 5 },
      entries,
    ),
    "tools",
  );
  assertArrayField(
    "mcpPrompt/list",
    await invokeAppServerMethod(options, "mcpPrompt/list", {}, entries),
    "prompts",
  );
  const resourceList = await invokeAppServerMethod(
    options,
    "mcpResource/list",
    {},
    entries,
  );
  assertArrayField("mcpResource/list", resourceList, "resources");
  assertArrayField("mcpResource/list", resourceList, "resourceTemplates");
}

export async function runFixtureChecks(options, entries, fixture) {
  const serverId = `mcp-current-${Date.now()}`;
  const serverName = serverId.replace(/[^a-zA-Z0-9_-]/g, "-");

  try {
    assertArrayField(
      "mcpServer/create",
      await invokeAppServerMethod(
        options,
        "mcpServer/create",
        {
          server: {
            id: serverId,
            name: serverName,
            description: "Current MCP JSON-RPC smoke fixture",
            server_config: {
              command: "node",
              args: [fixture.serverPath],
              cwd: fixture.root,
              timeout: 3,
            },
            enabled_lime: true,
            enabled_claude: false,
            enabled_codex: false,
            enabled_gemini: false,
            created_at: Date.now(),
          },
        },
        entries,
      ),
      "servers",
    );

    assertEmptyObject(
      "mcpServer/start",
      await invokeAppServerMethod(
        options,
        "mcpServer/start",
        { name: serverName },
        entries,
      ),
    );

    const statusServers = assertArrayField(
      "mcpServerStatus/list",
      await invokeAppServerMethod(options, "mcpServerStatus/list", {}, entries),
      "servers",
    );
    assert(
      statusServers.some(
        (server) =>
          server?.name === serverName &&
          server?.is_running === true &&
          server?.server_info?.supports_tools === true &&
          server?.server_info?.supports_resources === true,
      ),
      "mcpServerStatus/list did not report running fixture capabilities",
    );

    const tools = assertArrayField(
      "mcpTool/list",
      await invokeAppServerMethod(options, "mcpTool/list", {}, entries),
      "tools",
    );
    const fixtureToolName = `mcp__${serverName}__echo`;
    const fixtureTool = tools.find((tool) => tool?.name === fixtureToolName);
    assert(fixtureTool, `mcpTool/list did not return ${fixtureToolName}`);
    const outputSchemaEvidence = assertToolOutputSchema(
      "mcpTool/list",
      fixtureTool,
      fixtureToolName,
    );
    const toolsForContext = assertArrayField(
      "mcpTool/listForContext",
      await invokeAppServerMethod(
        options,
        "mcpTool/listForContext",
        { caller: "assistant", includeDeferred: true },
        entries,
      ),
      "tools",
    );
    assertToolOutputSchema(
      "mcpTool/listForContext",
      toolsForContext.find((tool) => tool?.name === fixtureToolName),
      fixtureToolName,
    );
    const searchedTools = assertArrayField(
      "mcpTool/search",
      await invokeAppServerMethod(
        options,
        "mcpTool/search",
        { query: "echo", caller: "tool_search", limit: 5 },
        entries,
      ),
      "tools",
    );
    assertToolOutputSchema(
      "mcpTool/search",
      searchedTools.find((tool) => tool?.name === fixtureToolName),
      fixtureToolName,
    );

    const structuredContent = assertToolResult(
      "mcpTool/call",
      await invokeAppServerMethod(
        options,
        "mcpTool/call",
        {
          toolName: fixtureToolName,
          arguments: { message: "hello current MCP" },
        },
        entries,
      ),
      "echo: hello current MCP",
      {
        echoedMessage: "hello current MCP",
        messageLength: "hello current MCP".length,
      },
    );

    const resourceList = await invokeAppServerMethod(
      options,
      "mcpResource/list",
      {},
      entries,
    );
    const resources = assertArrayField(
      "mcpResource/list",
      resourceList,
      "resources",
    );
    const resourceTemplates = assertArrayField(
      "mcpResource/list",
      resourceList,
      "resourceTemplates",
    );
    assert(
      resources.some((resource) => resource?.uri === "fixture://status"),
      "mcpResource/list did not return fixture://status",
    );
    const fixtureResourceTemplate = assertResourceTemplate(
      "mcpResource/list",
      resourceTemplates,
      "fixture://item/{id}",
    );

    assertResourceResult(
      "mcpResource/read",
      await invokeAppServerMethod(
        options,
        "mcpResource/read",
        { uri: "fixture://status" },
        entries,
      ),
      "fixture resource ok",
    );

    return {
      serverId,
      serverName,
      fixtureToolName,
      ...outputSchemaEvidence,
      structuredContentEcho: sanitizeJson(structuredContent),
      structuredContentKeys: Object.keys(structuredContent ?? {}).sort(),
      resourceTemplateUriTemplate:
        fixtureResourceTemplate.uri_template ??
        fixtureResourceTemplate.uriTemplate,
      resourceTemplatesSeen: true,
    };
  } finally {
    await invokeAppServerMethod(
      options,
      "mcpServer/stop",
      { name: serverName },
      entries,
    ).catch((error) => {
      console.warn(
        `[smoke:mcp-current] fixture stop failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    await invokeAppServerMethod(
      options,
      "mcpServer/delete",
      { id: serverId },
      entries,
    ).catch((error) => {
      console.warn(
        `[smoke:mcp-current] fixture delete failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}
