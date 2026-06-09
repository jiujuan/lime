import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const CURRENT_DEFAULT_PROVIDER_COMMAND = "get_default_provider";

const LEGACY_PROVIDER_WRITE_FACADE_COMMANDS = [
  "set_default_provider",
  "update_provider_env_vars",
];

const LEGACY_PROVIDER_CONFIG_TAURI_COMMANDS = [
  "get_default_provider",
  ...LEGACY_PROVIDER_WRITE_FACADE_COMMANDS,
];

const LEGACY_PROVIDER_WRITE_API_EXPORTS = [
  "setDefaultProvider",
  "updateProviderEnvVars",
];

const LEGACY_PROVIDER_CONFIG_TAURI_SNIPPETS = [
  "app_commands::get_default_provider",
  "app_commands::set_default_provider",
  "app_commands::update_provider_env_vars",
  "pub async fn get_default_provider",
  "pub async fn set_default_provider",
  "pub async fn update_provider_env_vars",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function readDirectoryProductionSources(path: string): string {
  const dir = resolve(cwd(), path);
  return readdirSync(dir)
    .filter(
      (fileName) =>
        (fileName.endsWith(".ts") || fileName.endsWith(".d.ts")) &&
        !fileName.endsWith(".test.ts") &&
        !fileName.endsWith(".test.d.ts"),
    )
    .map((fileName) => readFileSync(join(dir, fileName), "utf8"))
    .join("\n");
}

function expectStringLiteralsAbsent(source: string, literals: string[]): void {
  for (const literal of literals) {
    expect(source).not.toContain(`"${literal}"`);
    expect(source).not.toContain(`'${literal}'`);
  }
}

function expectSnippetsAbsent(source: string, snippets: string[]): void {
  for (const snippet of snippets) {
    expect(source).not.toContain(snippet);
  }
}

describe("appConfig Provider current boundary", () => {
  it("默认 Provider 读取只保留 Electron Desktop Host current projection", () => {
    const appConfigSource = readRepoFile("src/lib/api/appConfig.ts");
    const electronSources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
    ].join("\n");
    const rustLegacySources = [
      readRepoFile("lime-rs/src/app/runner.rs"),
      readRepoFile("lime-rs/src/app/commands/config.rs"),
    ].join("\n");

    expect(appConfigSource).toContain("getDefaultProvider");
    expect(appConfigSource).toContain(`"${CURRENT_DEFAULT_PROVIDER_COMMAND}"`);
    expect(electronSources).toContain(`"${CURRENT_DEFAULT_PROVIDER_COMMAND}"`);
    expectSnippetsAbsent(
      rustLegacySources,
      LEGACY_PROVIDER_CONFIG_TAURI_SNIPPETS,
    );
  });

  it("Provider 写入旧 facade 不应暴露为前端 API 或生产命令入口", () => {
    const productionSources = [
      readRepoFile("src/lib/api/appConfig.ts"),
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/governance/agentCommandCatalog.json"),
      readDirectoryProductionSources("src/lib/desktop-host"),
    ].join("\n");

    expectSnippetsAbsent(productionSources, LEGACY_PROVIDER_WRITE_API_EXPORTS);
    expectStringLiteralsAbsent(
      productionSources,
      LEGACY_PROVIDER_WRITE_FACADE_COMMANDS,
    );
  });

  it("Provider/config 旧 Tauri 命令只能作为 contract retired guard 存在", () => {
    const contractGuard = readRepoFile("scripts/check-command-contracts.mjs");
    const rustLegacySources = [
      readRepoFile("lime-rs/src/app/runner.rs"),
      readRepoFile("lime-rs/src/app/commands/config.rs"),
    ].join("\n");

    for (const command of LEGACY_PROVIDER_CONFIG_TAURI_COMMANDS) {
      expect(contractGuard).toContain(`"${command}"`);
    }
    expectSnippetsAbsent(
      rustLegacySources,
      LEGACY_PROVIDER_CONFIG_TAURI_SNIPPETS,
    );
  });
});
