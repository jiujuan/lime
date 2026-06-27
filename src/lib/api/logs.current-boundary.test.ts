import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import { readAppServerApiSources } from "../../test/appServerApiSources";

const LEGACY_LOG_DIAGNOSTIC_FACADE_COMMANDS = [
  "get_logs",
  "get_persisted_logs_tail",
  "clear_logs",
  "clear_diagnostic_log_history",
  "get_log_storage_diagnostics",
  "export_support_bundle",
  "get_server_diagnostics",
  "get_windows_startup_diagnostics",
];

const CURRENT_LOG_DIAGNOSTIC_METHOD_CONSTANTS = [
  "APP_SERVER_METHOD_LOG_LIST",
  "APP_SERVER_METHOD_LOG_PERSISTED_TAIL",
  "APP_SERVER_METHOD_LOG_CLEAR",
  "APP_SERVER_METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR",
  "APP_SERVER_METHOD_DIAGNOSTICS_LOG_STORAGE_READ",
  "APP_SERVER_METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT",
  "APP_SERVER_METHOD_DIAGNOSTICS_SERVER_READ",
  "APP_SERVER_METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ",
  "APP_SERVER_METHOD_DIAGNOSTICS_TRACE_LIST",
  "APP_SERVER_METHOD_DIAGNOSTICS_TRACE_READ",
  "APP_SERVER_METHOD_DIAGNOSTICS_TRACE_EXPORT",
];

const CURRENT_LOG_DIAGNOSTIC_CLIENT_HELPERS = [
  "listLogs",
  "readPersistedLogTail",
  "clearLogs",
  "clearDiagnosticLogHistory",
  "readLogStorageDiagnostics",
  "exportSupportBundle",
  "readServerDiagnostics",
  "readWindowsStartupDiagnostics",
  "listDiagnosticsTraces",
  "readDiagnosticsTrace",
  "exportDiagnosticsTrace",
];

const CURRENT_LOG_DIAGNOSTIC_METHODS = [
  "log/list",
  "log/persistedTail",
  "log/clear",
  "log/diagnosticHistory/clear",
  "diagnostics/logStorage/read",
  "diagnostics/supportBundle/export",
  "diagnostics/server/read",
  "diagnostics/windowsStartup/read",
  "diagnostics/trace/list",
  "diagnostics/trace/read",
  "diagnostics/trace/export",
];

const LEGACY_LOG_DIAGNOSTIC_REPLACEMENT_METHODS = [
  "log/list",
  "log/persistedTail",
  "log/clear",
  "log/diagnosticHistory/clear",
  "diagnostics/logStorage/read",
  "diagnostics/supportBundle/export",
  "diagnostics/server/read",
  "diagnostics/windowsStartup/read",
];

const LEGACY_LOG_TAURI_REGISTRATIONS = [
  "app_commands::get_logs",
  "app_commands::get_persisted_logs_tail",
  "app_commands::clear_logs",
  "app_commands::clear_diagnostic_log_history",
  "app_commands::get_log_storage_diagnostics",
  "app_commands::export_support_bundle",
  "app_commands::get_server_diagnostics",
  "commands::windows_startup_cmd::get_windows_startup_diagnostics",
];

const RETIRED_LOG_WRAPPER_FILES = [
  "lime-rs/src/app/commands/logs.rs",
  "lime-rs/src/app/commands/server.rs",
  "lime-rs/src/commands/windows_startup_cmd.rs",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function expectStringLiteralsAbsent(source: string, literals: string[]): void {
  for (const literal of literals) {
    expect(source).not.toContain(`"${literal}"`);
    expect(source).not.toContain(`'${literal}'`);
  }
}

function readOptionalRepoFile(path: string): string {
  const absolutePath = resolve(cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function readAgentCommandCatalog(): Record<string, unknown> {
  return JSON.parse(
    readRepoFile("src/lib/governance/agentCommandCatalog.json"),
  );
}

function expectCatalogSurfaceAbsent(
  catalog: Record<string, unknown>,
  surface: string,
): void {
  const value = catalog[surface];
  expect(Array.isArray(value), `${surface} should be an array`).toBe(true);
  for (const command of LEGACY_LOG_DIAGNOSTIC_FACADE_COMMANDS) {
    expect(value).not.toContain(command);
  }
}

describe("logs diagnostics current App Server boundary", () => {
  it("logs / diagnostics API 应固定走 App Server current helper", () => {
    const logsSource = readRepoFile("src/lib/api/logs.ts");
    const serverRuntimeSource = readRepoFile("src/lib/api/serverRuntime.ts");
    const source = `${logsSource}\n${serverRuntimeSource}`;
    const appServerSource = readAppServerApiSources();

    for (const methodConstant of CURRENT_LOG_DIAGNOSTIC_METHOD_CONSTANTS) {
      expect(appServerSource).toContain(methodConstant);
    }
    for (const helper of CURRENT_LOG_DIAGNOSTIC_CLIENT_HELPERS) {
      expect(source).toContain(`.${helper}(`);
    }
    expect(source).toContain("createAppServerClient()");
    expectStringLiteralsAbsent(source, LEGACY_LOG_DIAGNOSTIC_FACADE_COMMANDS);
    expect(source).not.toContain("safeInvoke(");
  });

  it("App Server protocol 和治理 catalog 应记录日志诊断 current 方法", () => {
    const appServerSource = readAppServerApiSources();
    const clientProtocolSource = readRepoFile(
      "packages/app-server-client/src/protocol.ts",
    );
    const rustProtocolSource = [
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs",
      ),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/observability.rs",
      ),
    ].join("\n");
    const catalog = readAgentCommandCatalog();

    for (const method of CURRENT_LOG_DIAGNOSTIC_METHODS) {
      expect(clientProtocolSource).toContain(`"${method}"`);
      expect(rustProtocolSource).toContain(`"${method}"`);
    }
    for (const methodConstant of CURRENT_LOG_DIAGNOSTIC_METHOD_CONSTANTS) {
      expect(appServerSource).toContain(methodConstant);
    }

    expectCatalogSurfaceAbsent(catalog, "runtimeGatewayCommands");
    expectCatalogSurfaceAbsent(catalog, "capabilityDraftCommands");
    const replacements = catalog.deprecatedCommandReplacements;
    expect(
      replacements &&
        typeof replacements === "object" &&
        !Array.isArray(replacements),
      "deprecatedCommandReplacements should be an object",
    ).toBe(true);
    for (const [
      index,
      command,
    ] of LEGACY_LOG_DIAGNOSTIC_FACADE_COMMANDS.entries()) {
      expect(
        (replacements as Record<string, unknown>)[command],
        `${command} should point to current App Server method`,
      ).toBe(LEGACY_LOG_DIAGNOSTIC_REPLACEMENT_METHODS[index]);
    }
  });

  it("旧日志诊断 facade 不应回到 Electron Host、DevBridge、mock 或 legacy Rust", () => {
    const productionSources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readOptionalRepoFile("src/lib/desktop-host/configSystemMocks.ts"),
      readRepoFile("src/lib/desktop-host/core.ts"),
      readOptionalRepoFile("lime-rs/src/app/runner.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher/app_runtime.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher/logs.rs"),
    ].join("\n");
    const runnerSource = readOptionalRepoFile("lime-rs/src/app/runner.rs");

    expectStringLiteralsAbsent(
      productionSources,
      LEGACY_LOG_DIAGNOSTIC_FACADE_COMMANDS,
    );
    for (const registration of LEGACY_LOG_TAURI_REGISTRATIONS) {
      expect(runnerSource).not.toContain(registration);
    }
    expect(existsSync(resolve(cwd(), "lime-rs/src/app/runner.rs"))).toBe(false);
    expect(
      existsSync(resolve(cwd(), "lime-rs/src/dev_bridge/dispatcher.rs")),
    ).toBe(false);
    for (const retiredPath of RETIRED_LOG_WRAPPER_FILES) {
      expect(existsSync(resolve(cwd(), retiredPath))).toBe(false);
    }
  });
});
