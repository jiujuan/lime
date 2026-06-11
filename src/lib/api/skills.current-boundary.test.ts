import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const LEGACY_SKILL_MANAGEMENT_FACADE_COMMANDS = [
  "get_skills",
  "get_skills_for_app",
  "install_skill",
  "install_skill_for_app",
  "uninstall_skill",
  "uninstall_skill_for_app",
  "get_skill_repos",
  "add_skill_repo",
  "remove_skill_repo",
  "refresh_skill_cache",
  "get_installed_lime_skills",
  "inspect_local_skill_for_app",
  "create_skill_scaffold_for_app",
  "import_local_skill_for_app",
  "inspect_remote_skill",
];

const CURRENT_SKILL_MANAGEMENT_METHOD_CONSTANTS = [
  "METHOD_SKILL_MANAGEMENT_LIST",
  "METHOD_SKILL_MANAGEMENT_INSTALL",
  "METHOD_SKILL_MANAGEMENT_UNINSTALL",
  "METHOD_SKILL_REPOSITORY_LIST",
  "METHOD_SKILL_REPOSITORY_SAVE",
  "METHOD_SKILL_REPOSITORY_DELETE",
  "METHOD_SKILL_CACHE_REFRESH",
  "METHOD_SKILL_INSTALLED_DIRECTORIES_LIST",
  "METHOD_SKILL_LOCAL_INSPECT",
  "METHOD_SKILL_LOCAL_SCAFFOLD_CREATE",
  "METHOD_SKILL_LOCAL_IMPORT",
  "METHOD_SKILL_REMOTE_INSPECT",
];

const CURRENT_SKILL_MANAGEMENT_METHODS = [
  "skillManagement/list",
  "skillManagement/install",
  "skillManagement/uninstall",
  "skillRepository/list",
  "skillRepository/save",
  "skillRepository/delete",
  "skillCache/refresh",
  "skillInstalledDirectories/list",
  "skillLocal/inspect",
  "skillLocal/scaffold/create",
  "skillLocal/import",
  "skillRemote/inspect",
];

const LEGACY_SKILL_TAURI_REGISTRATIONS = [
  "commands::skill_cmd::get_skills",
  "commands::skill_cmd::get_skills_for_app",
  "commands::skill_cmd::install_skill",
  "commands::skill_cmd::install_skill_for_app",
  "commands::skill_cmd::uninstall_skill",
  "commands::skill_cmd::uninstall_skill_for_app",
  "commands::skill_cmd::get_skill_repos",
  "commands::skill_cmd::add_skill_repo",
  "commands::skill_cmd::remove_skill_repo",
  "commands::skill_cmd::refresh_skill_cache",
  "commands::skill_cmd::get_installed_lime_skills",
  "commands::skill_cmd::inspect_local_skill_for_app",
  "commands::skill_cmd::create_skill_scaffold_for_app",
  "commands::skill_cmd::import_local_skill_for_app",
  "commands::skill_cmd::inspect_remote_skill",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function repoFileExists(path: string): boolean {
  return existsSync(resolve(cwd(), path));
}

function readOptionalRepoFile(path: string): string {
  return repoFileExists(path) ? readRepoFile(path) : "";
}

function expectStringLiteralsAbsent(source: string, literals: string[]): void {
  for (const literal of literals) {
    expect(source).not.toContain(`"${literal}"`);
    expect(source).not.toContain(`'${literal}'`);
  }
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
  for (const command of LEGACY_SKILL_MANAGEMENT_FACADE_COMMANDS) {
    expect(value).not.toContain(command);
  }
}

describe("skillsApi current App Server boundary", () => {
  it("Skill 管理 API 应固定走 App Server current method", () => {
    const source = readRepoFile("src/lib/api/skills.ts");

    for (const methodConstant of CURRENT_SKILL_MANAGEMENT_METHOD_CONSTANTS) {
      expect(source).toContain(methodConstant);
    }
    for (const method of CURRENT_SKILL_MANAGEMENT_METHODS) {
      expect(source).not.toContain(`"${method}"`);
      expect(source).not.toContain(`'${method}'`);
    }
    expectStringLiteralsAbsent(source, LEGACY_SKILL_MANAGEMENT_FACADE_COMMANDS);
  });

  it("App Server protocol 和治理 catalog 应记录 Skill 管理 current 方法", () => {
    const clientProtocolSource = readRepoFile(
      "packages/app-server-client/src/protocol.ts",
    );
    const rustProtocolSource = [
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs",
      ),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/skills.rs",
      ),
    ].join("\n");
    const catalog = readAgentCommandCatalog();

    for (const method of CURRENT_SKILL_MANAGEMENT_METHODS) {
      expect(clientProtocolSource).toContain(`"${method}"`);
      expect(rustProtocolSource).toContain(`"${method}"`);
    }

    expectCatalogSurfaceAbsent(catalog, "runtimeGatewayCommands");
    expectCatalogSurfaceAbsent(catalog, "capabilityDraftCommands");
    expect(catalog).toHaveProperty("appServerSkillManagementMethods");
    for (const method of CURRENT_SKILL_MANAGEMENT_METHODS) {
      expect(catalog.appServerSkillManagementMethods).toContain(method);
    }
  });

  it("旧 Skill 管理 facade 不应回到 Electron Host、DevBridge、mock 或 legacy Rust", () => {
    const productionSources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/desktop-host/skillManagementMocks.ts"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher/skills.rs"),
    ].join("\n");
    const runnerSource = readOptionalRepoFile("lime-rs/src/app/runner.rs");

    expect(repoFileExists("lime-rs/src/commands/skill_cmd.rs")).toBe(false);
    expect(repoFileExists("lime-rs/src/app/runner.rs")).toBe(false);
    expect(repoFileExists("lime-rs/src/dev_bridge/dispatcher/skills.rs")).toBe(
      false,
    );
    expectStringLiteralsAbsent(
      productionSources,
      LEGACY_SKILL_MANAGEMENT_FACADE_COMMANDS,
    );
    for (const registration of LEGACY_SKILL_TAURI_REGISTRATIONS) {
      expect(runnerSource).not.toContain(registration);
    }
  });
});
