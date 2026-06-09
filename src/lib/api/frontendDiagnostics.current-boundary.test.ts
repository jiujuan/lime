import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const FRONTEND_DIAGNOSTIC_COMMANDS = [
  "report_frontend_crash",
  "report_frontend_debug_log",
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

describe("frontend diagnostics current Electron Host boundary", () => {
  it("前端诊断 API 应固定走 Electron Host current gateway", () => {
    const crashSource = readRepoFile("src/lib/api/frontendCrash.ts");
    const debugSource = readRepoFile("src/lib/api/frontendDebug.ts");
    const source = `${crashSource}\n${debugSource}`;

    for (const command of FRONTEND_DIAGNOSTIC_COMMANDS) {
      expect(source).toContain(`"${command}"`);
    }
    expect(crashSource).toContain("isSuccessRecord");
    expect(debugSource).toContain("result !== null && result !== undefined");
    expect(source).toContain("assertNotDiagnosticFacade");
    expect(source).toContain("safeInvoke<unknown>");
    expect(source).not.toContain("createAppServerClient");
    expect(source).not.toContain("invokeMockOnly");
  });

  it("Electron Host / IPC 应继续拥有前端诊断 current 壳能力", () => {
    const hostSource = readRepoFile("electron/hostCommands.ts");
    const ipcSource = readRepoFile("electron/ipcChannels.ts");

    for (const command of FRONTEND_DIAGNOSTIC_COMMANDS) {
      expect(hostSource).toContain(`case "${command}"`);
      expect(ipcSource).toContain(`"${command}"`);
    }
    expect(hostSource).toContain("#reportFrontendCrash");
    expect(hostSource).toContain("#reportFrontendDebugLog");
    expect(hostSource).toContain("return { success: true }");
    expect(hostSource).toContain("return null");
  });

  it("旧前端诊断 Tauri facade 不应回到 DevBridge、mock 或 legacy Rust", () => {
    const restrictedSources = [
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/desktop-host/core.ts"),
      readRepoFile("src/lib/governance/agentCommandCatalog.json"),
      readRepoFile("lime-rs/src/app/runner.rs"),
      readRepoFile("lime-rs/src/dev_bridge/dispatcher.rs"),
    ].join("\n");
    const contractSource = readRepoFile("scripts/check-command-contracts.mjs");

    expectStringLiteralsAbsent(
      restrictedSources,
      FRONTEND_DIAGNOSTIC_COMMANDS,
    );
    expect(contractSource).toContain(
      "retiredFrontendDiagnosticsTauriGenerateHandlerCommands",
    );
    for (const command of FRONTEND_DIAGNOSTIC_COMMANDS) {
      expect(contractSource).toContain(`"${command}"`);
    }
  });
});
