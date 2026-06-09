import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const DOCUMENT_EXPORT_COMMAND = "save_exported_document";

const FORBIDDEN_DOCUMENT_EXPORT_SOURCES = [
  "src/lib/dev-bridge/commandPolicy.ts",
  "src/lib/dev-bridge/mockPriorityCommands.ts",
  "src/lib/desktop-host/sessionFileMocks.ts",
  "src/lib/desktop-host/fileSystemMocks.ts",
  "src/lib/desktop-host/core.ts",
  "lime-rs/src/app/runner.rs",
  "lime-rs/src/dev_bridge/dispatcher.rs",
  "lime-rs/src/dev_bridge/dispatcher/files.rs",
  "lime-rs/src/services/file_browser_service.rs",
];

const RETIRED_DOCUMENT_EXPORT_WRAPPER_FILES = [
  "lime-rs/src/commands/document_import_cmd.rs",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function readOptionalRepoFile(path: string): string {
  const absolutePath = resolve(cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function expectStringLiteralAbsent(source: string, literal: string): void {
  expect(source).not.toContain(`"${literal}"`);
  expect(source).not.toContain(`'${literal}'`);
}

describe("document export current Electron Host boundary", () => {
  it("前端 Document Export API 应只经 current 网关调用 Electron Host 命令", () => {
    const source = readRepoFile("src/lib/api/document-export.ts");

    expect(source).toContain("saveExportedDocument");
    expect(source).toContain("safeInvoke<unknown>");
    expect(source).toContain(`"${DOCUMENT_EXPORT_COMMAND}"`);
    expect(source).toContain("assertNotDiagnosticFacade");
    expect(source).not.toContain("createAppServerClient");
    expect(source).not.toContain("AppServerClient");
    expect(source).not.toContain("invokeMockOnly");
  });

  it("Electron Host / IPC 应继续拥有 save_exported_document current 壳能力", () => {
    const hostSource = readRepoFile("electron/hostCommands.ts");
    const ipcSource = readRepoFile("electron/ipcChannels.ts");
    const contractSource = readRepoFile("scripts/check-command-contracts.mjs");

    expect(hostSource).toContain(`case "${DOCUMENT_EXPORT_COMMAND}"`);
    expect(hostSource).toContain("#saveExportedDocument");
    expect(hostSource).toContain("writeFile(targetPath, content, \"utf8\")");
    expect(ipcSource).toContain(`"${DOCUMENT_EXPORT_COMMAND}"`);
    expect(contractSource).toContain("currentFileBrowserDesktopHostShellCommands");
    expect(contractSource).toContain(`"${DOCUMENT_EXPORT_COMMAND}"`);
    expect(contractSource).toContain("retiredTauriGenerateHandlerCommands");
  });

  it("旧 Document Export facade 不应回到 DevBridge、mock 或 legacy Rust", () => {
    const productionSources = FORBIDDEN_DOCUMENT_EXPORT_SOURCES.map(
      readOptionalRepoFile,
    ).join("\n");
    const runnerSource = readRepoFile("lime-rs/src/app/runner.rs");

    expectStringLiteralAbsent(productionSources, DOCUMENT_EXPORT_COMMAND);
    expect(runnerSource).not.toContain(
      "commands::document_import_cmd::save_exported_document",
    );
    for (const retiredPath of RETIRED_DOCUMENT_EXPORT_WRAPPER_FILES) {
      expect(existsSync(resolve(cwd(), retiredPath))).toBe(false);
    }
  });
});
