import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/mcp-config-fixture-smoke.mjs",
    "utf8",
  );
}

describe("MCP config Electron fixture smoke guard", () => {
  it("keeps the smoke on real Electron Desktop Host IPC and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain("APP_SERVER_HANDLE_JSON_LINES_COMMAND");
    expect(content).toContain("app_server_handle_json_lines");
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain(
      'typeof window.electronAPI?.invoke === "function"',
    );
    expect(content).toContain("window.electronAPI.supportsCommand");
  });

  it("creates Context7 through the GUI and verifies current MCP methods", () => {
    const content = readSmokeScript();

    expect(content).toContain('backendMode = "unavailable"');
    expect(content).toContain("APP_SERVER_BACKEND_MODE: backendMode");
    expect(content).toContain('"mcpServer/create"');
    expect(content).toContain('"mcpServer/list"');
    expect(content).toContain("mcp-config-preset-context7");
    expect(content).toContain("mcp-config-connection-url");
    expect(content).toContain("mcp-config-env-header-env-var");
    expect(content).toContain("mcp-config-save");
    expect(content).toContain("LEGACY_MCP_COMMANDS");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });

  it("does not make legacy MCP facade calls as positive evidence", () => {
    const content = readSmokeScript();
    const positiveCallSurface = content.slice(
      content.indexOf("const REQUIRED_METHODS"),
      content.indexOf("function printHelp"),
    );

    expect(positiveCallSurface).not.toContain("get_mcp_servers");
    expect(positiveCallSurface).not.toContain("mcp_start_server");
    expect(positiveCallSurface).not.toContain("add_mcp_server");
  });
});
