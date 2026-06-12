import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const FRONTEND_MATERIAL_FACADE_COMMANDS = [
  "list_materials",
  "get_material_count",
  "upload_material",
  "import_material_from_url",
  "update_material",
  "delete_material",
  "get_material_content",
];

const LEGACY_RUST_MATERIAL_FACADE_COMMANDS = [
  ...FRONTEND_MATERIAL_FACADE_COMMANDS,
  "get_material",
];

const PROJECT_MATERIAL_APP_SERVER_METHODS = [
  "projectMaterial/list",
  "projectMaterial/get",
  "projectMaterial/count",
  "projectMaterial/upload",
  "projectMaterial/importFromUrl",
  "projectMaterial/update",
  "projectMaterial/delete",
  "projectMaterial/content",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function readOptionalRepoFile(path: string): string {
  const absolutePath = resolve(cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function stripRustTestModules(source: string): string {
  return source.replace(
    /(?:^|\n)\s*#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*(?:pub\s+)?mod\s+\w+\s*(?:\{[\s\S]*$|;)/m,
    "\n",
  );
}

function readOptionalRustProductionRepoFile(path: string): string {
  return stripRustTestModules(readOptionalRepoFile(path));
}

function expectStringLiteralsAbsent(source: string, literals: string[]): void {
  for (const literal of literals) {
    expect(source).not.toContain(`"${literal}"`);
    expect(source).not.toContain(`'${literal}'`);
  }
}

describe("Materials current App Server boundary", () => {
  it("materials API 应固定走 App Server projectMaterial current helper", () => {
    const source = readRepoFile("src/lib/api/materials.ts");

    expect(source).toContain("createAppServerClient");
    expect(source).toContain("APP_SERVER_METHOD_PROJECT_MATERIAL_LIST");
    expect(source).not.toContain("safeInvoke");
    expect(source).not.toContain("assertNotDiagnosticFacade");
    expectStringLiteralsAbsent(source, FRONTEND_MATERIAL_FACADE_COMMANDS);
  });

  it("App Server protocol / client 应声明 projectMaterial current 方法", () => {
    const appServerSources = [
      readRepoFile("src/lib/api/appServer.ts"),
      readRepoFile("packages/app-server-client/src/protocol.ts"),
      readRepoFile("packages/app-server-client/src/index.ts"),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs",
      ),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/project_materials.rs",
      ),
      readRepoFile("lime-rs/crates/app-server/src/processor/mod.rs"),
      readRepoFile("lime-rs/crates/app-server/src/processor/project.rs"),
      readRepoFile("lime-rs/crates/app-server/src/runtime.rs"),
      readRepoFile(
        "lime-rs/crates/app-server/src/local_data_source/project_materials.rs",
      ),
    ].join("\n");

    expect(appServerSources).toContain("APP_SERVER_METHOD_PROJECT_MATERIAL");
    expect(appServerSources).toContain("METHOD_PROJECT_MATERIAL_LIST");
    for (const method of PROJECT_MATERIAL_APP_SERVER_METHODS) {
      expect(appServerSources).toContain(`"${method}"`);
    }
  });

  it("旧 Materials facade 不应回到 Electron Host、desktop-host mock、mockPriority 或 DevBridge policy", () => {
    const restrictedSources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/desktop-host/core.ts"),
      readOptionalRepoFile("src/lib/desktop-host/mediaTaskMocks.ts"),
      readOptionalRepoFile("src/lib/desktop-host/sessionFileMocks.ts"),
    ].join("\n");

    expectStringLiteralsAbsent(
      restrictedSources,
      FRONTEND_MATERIAL_FACADE_COMMANDS,
    );
  });

  it("legacy Rust Materials wrapper / runner / dispatcher 应保持删除状态", () => {
    const runnerSource = readOptionalRustProductionRepoFile(
      "lime-rs/src/app/runner.rs",
    );
    const commandsModSource = readOptionalRustProductionRepoFile(
      "lime-rs/src/commands/mod.rs",
    );
    const dispatcherSources = [
      readOptionalRustProductionRepoFile(
        "lime-rs/src/dev_bridge/dispatcher.rs",
      ),
      readOptionalRustProductionRepoFile(
        "lime-rs/src/dev_bridge/dispatcher/project_resources.rs",
      ),
    ].join("\n");

    expect(commandsModSource).not.toContain("material_cmd");
    expect(
      existsSync(resolve(cwd(), "lime-rs/src/commands/material_cmd.rs")),
    ).toBe(false);
    for (const command of LEGACY_RUST_MATERIAL_FACADE_COMMANDS) {
      expect(runnerSource).not.toContain(`commands::material_cmd::${command}`);
    }
    expectStringLiteralsAbsent(dispatcherSources, [
      "list_materials",
      "get_material_count",
      "upload_material",
    ]);
  });
});
