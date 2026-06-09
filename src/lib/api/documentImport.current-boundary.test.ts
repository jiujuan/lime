import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const RETIRED_IMPORT_DOCUMENT_COMMAND = "import_document";
const RETIRED_IMPORT_DOCUMENT_TO_SESSION_COMMAND = "import_document_to_session";
const CURRENT_FILE_PREVIEW_METHOD = "fileSystem/readFilePreview";

const FORBIDDEN_IMPORT_DOCUMENT_SOURCES = [
  "electron/hostCommands.ts",
  "electron/ipcChannels.ts",
  "src/lib/dev-bridge/commandPolicy.ts",
  "src/lib/dev-bridge/mockPriorityCommands.ts",
  "src/lib/desktop-host/sessionFileMocks.ts",
  "lime-rs/src/app/runner.rs",
  "lime-rs/src/commands/mod.rs",
  "lime-rs/src/dev_bridge/dispatcher.rs",
  "lime-rs/src/dev_bridge/dispatcher/files.rs",
];

const RETIRED_DOCUMENT_IMPORT_WRAPPER_FILES = [
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

describe("Document Import current App Server boundary", () => {
  it("importDocument 应固定走 App Server fileSystem/readFilePreview", () => {
    const source = readRepoFile("src/lib/api/session-files.ts");

    expect(source).toContain("new AppServerClient().readFilePreview");
    expect(source).toContain("maxSize: 2 * 1024 * 1024");
    expect(source).toContain(CURRENT_FILE_PREVIEW_METHOD);
    expectStringLiteralAbsent(source, RETIRED_IMPORT_DOCUMENT_COMMAND);
    expectStringLiteralAbsent(
      source,
      RETIRED_IMPORT_DOCUMENT_TO_SESSION_COMMAND,
    );
  });

  it("App Server protocol / client 应保留 fileSystem/readFilePreview current 方法", () => {
    const appServerSource = readRepoFile("src/lib/api/appServer.ts");
    const clientProtocolSource = readRepoFile(
      "packages/app-server-client/src/protocol.ts",
    );
    const rustProtocolSource = readRepoFile(
      "lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs",
    );

    expect(appServerSource).toContain(
      "APP_SERVER_METHOD_FILE_SYSTEM_READ_FILE_PREVIEW",
    );
    expect(appServerSource).toContain("async readFilePreview(");
    expect(clientProtocolSource).toContain(`"${CURRENT_FILE_PREVIEW_METHOD}"`);
    expect(rustProtocolSource).toContain(`"${CURRENT_FILE_PREVIEW_METHOD}"`);
  });

  it("旧 Document Import facade 不应回到 Electron、DevBridge、mock 或 legacy Rust", () => {
    const restrictedSources =
      FORBIDDEN_IMPORT_DOCUMENT_SOURCES.map(readOptionalRepoFile).join("\n");

    expectStringLiteralAbsent(
      restrictedSources,
      RETIRED_IMPORT_DOCUMENT_COMMAND,
    );
    expectStringLiteralAbsent(
      restrictedSources,
      RETIRED_IMPORT_DOCUMENT_TO_SESSION_COMMAND,
    );
    expect(restrictedSources).not.toContain("document_import_cmd");
    for (const retiredPath of RETIRED_DOCUMENT_IMPORT_WRAPPER_FILES) {
      expect(existsSync(resolve(cwd(), retiredPath))).toBe(false);
    }
  });

  it("import_document_to_session 只应停留在 retired guard 中", () => {
    const source = readRepoFile("src/lib/api/session-files.ts");
    const contractSource = readRepoFile("scripts/check-command-contracts.mjs");

    expectStringLiteralAbsent(
      source,
      RETIRED_IMPORT_DOCUMENT_TO_SESSION_COMMAND,
    );
    expect(contractSource).toContain(
      `"${RETIRED_IMPORT_DOCUMENT_TO_SESSION_COMMAND}"`,
    );
  });
});
