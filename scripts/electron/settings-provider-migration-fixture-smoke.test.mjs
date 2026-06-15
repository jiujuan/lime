import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/settings-provider-migration-fixture-smoke.mjs",
    "utf8",
  );
}

describe("settings provider migration Electron fixture smoke guard", () => {
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

  it("uses current model provider methods without legacy Provider commands", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "unavailable"');
    expect(content).toContain(
      'APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP: "retain"',
    );
    expect(content).toContain("APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP");
    expect(content).toContain("PRODUCT_DB_MIGRATION_CLEANUP_POLICY");
    expect(content).toContain('"modelProvider/create"');
    expect(content).toContain('"modelProvider/update"');
    expect(content).toContain('"modelProviderKey/create"');
    expect(content).toContain('"modelProviderUiState/write"');
    expect(content).toContain('"modelProvider/list"');
    expect(content).toContain('"modelProviderUiState/read"');
    expect(content).toContain("PRODUCT_DB_MIGRATION_CLEANUP_POLICY");
    expect(content).toContain("oldProductDbUserSchemaObjectCount");
    expect(content).toContain("readOldProductDbUserSchemaObjectCount");
    expect(content).toContain("迁移后旧 Product DB 仍保留业务 schema 对象");
    const requiredMethodsBlock = content.slice(
      content.indexOf("const SEED_REQUIRED_METHODS"),
      content.indexOf("const ELECTRON_REQUIRED_METHODS"),
    );
    const electronMethodsBlock = content.slice(
      content.indexOf("const ELECTRON_REQUIRED_METHODS"),
      content.indexOf("function printHelp"),
    );
    expect(requiredMethodsBlock).not.toContain("api_key_provider");
    expect(electronMethodsBlock).not.toContain("api_key_provider");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });
});
