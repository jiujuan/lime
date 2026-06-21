import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readCurrentSmoke() {
  return fs.readFileSync("scripts/mcp/current-smoke.mjs", "utf8");
}

function readOAuthFixtureSmoke() {
  return fs.readFileSync("scripts/mcp/oauth-fixture-smoke.mjs", "utf8");
}

describe("mcp current smoke guard", () => {
  it("keeps MCP smoke on App Server current JSON-RPC and rejects legacy facade", () => {
    const content = readCurrentSmoke();

    expect(content).toContain(
      'const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines"',
    );
    expect(content).toContain('"mcpServer/oauth/login"');
    expect(content).toContain('"mcpTool/call"');
    expect(content).toContain('"mcpResource/read"');
    expect(content).toContain('"resources/templates/list"');
    expect(content).toContain("resourceTemplatesSeen");
    expect(content).toContain("resourceTemplateUriTemplate");
    expect(content).toContain("outputSchemaStructuredContentSeen");
    expect(content).toContain("structuredContentEcho");
    expect(content).toContain("structuredContent: {");
    expect(content).toContain("outputSchema: {");
    expect(content).toContain("LEGACY_MCP_COMMANDS");
    expect(content).toContain("summary.legacyMcpCommandsSeen.length === 0");
  });

  it("keeps optional OAuth fixture evidence behind the MCP current smoke entry", () => {
    const content = readCurrentSmoke();
    const oauthFixture = readOAuthFixtureSmoke();

    expect(content).toContain("--allow-oauth-fixture");
    expect(content).toContain("runMcpOAuthFixtureSmoke");
    expect(content).toContain("summary.oauthFixture");
    expect(oauthFixture).toContain("startMcpOAuthFixtureProvider");
    expect(oauthFixture).toContain('"mcpServer/oauth/login"');
    expect(oauthFixture).toContain('"open_external_url"');
    expect(oauthFixture).toContain('"mcpServerStatus/list"');
    expect(oauthFixture).toContain('transport: "streamable_http"');
    expect(oauthFixture).toContain('scopes: ["fixture.read"]');
    expect(oauthFixture).toContain("tokenRequestCount");
    expect(oauthFixture).not.toContain("window.open");
  });
});
