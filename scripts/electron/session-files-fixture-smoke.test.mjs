import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/session-files-fixture-smoke.mjs",
    "utf8",
  );
}

describe("session files Electron fixture smoke guard", () => {
  it("keeps the smoke on real Electron Desktop Host IPC and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain('"--use-mock-keychain"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain(
      'typeof window.electronAPI?.invoke === "function"',
    );
    expect(content).toContain("window.electronAPI.supportsCommand");
    expect(content).toContain("app_server_handle_json_lines");
    expect(content).toContain("supportsFileShell");
    expect(content).toContain('"reveal_in_finder"');
    expect(content).toContain('"open_with_default_app"');
  });

  it("validates all sessionFile current methods and file shell commands without live backend", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "unavailable"');
    expect(content).toContain('"sessionFile/getOrCreate"');
    expect(content).toContain('"sessionFile/updateMeta"');
    expect(content).toContain('"sessionFile/save"');
    expect(content).toContain('"sessionFile/list"');
    expect(content).toContain('"sessionFile/read"');
    expect(content).toContain('"sessionFile/resolvePath"');
    expect(content).toContain('"sessionFile/delete"');
    expect(content).toContain("FILE_CONTENT");
    expect(content).toContain("assertFixtureResult");
    expect(content).toContain("savedFileName");
    expect(content).toContain("fileShellCommands");
    expect(content).toContain("assertElectronHostEmptyResult");
    expect(content).toContain("listedAfterDeleteCount");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain("--allow-live-provider");
  });

  it("does not use legacy session file commands or renderer mock fallback as success evidence", () => {
    const content = readSmokeScript();

    expect(content).toContain(
      'const FORBIDDEN_METHOD_PREFIXES = ["session_files_"]',
    );
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain("safeInvoke(");
    expect(content).not.toContain("session_files_save_file");
    expect(content).not.toContain("session_files_read_file");
  });
});
