import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const LEGACY_USAGE_STATS_FACADE_COMMANDS = [
  "get_usage_stats",
  "get_model_usage_ranking",
  "get_daily_usage_trends",
];

const CURRENT_USAGE_STATS_CLIENT_CALLS = [
  "readUsageStats",
  "listUsageStatsModelRanking",
  "listUsageStatsDailyTrends",
];

const CURRENT_USAGE_STATS_METHOD_CONSTANTS = [
  "APP_SERVER_METHOD_USAGE_STATS_READ",
  "APP_SERVER_METHOD_USAGE_STATS_MODEL_RANKING_LIST",
  "APP_SERVER_METHOD_USAGE_STATS_DAILY_TRENDS_LIST",
];

const LEGACY_USAGE_STATS_TAURI_REGISTRATIONS = [
  "app_commands::get_usage_stats",
  "app_commands::get_model_usage_ranking",
  "app_commands::get_daily_usage_trends",
  "commands::usage_stats_cmd::get_usage_stats",
  "commands::usage_stats_cmd::get_model_usage_ranking",
  "commands::usage_stats_cmd::get_daily_usage_trends",
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

describe("usageStats current App Server boundary", () => {
  it("使用统计 API 应固定走 App Server current method", () => {
    const source = readRepoFile("src/lib/api/usageStats.ts");

    for (const call of CURRENT_USAGE_STATS_CLIENT_CALLS) {
      expect(source).toContain(`.${call}(`);
    }
    for (const methodConstant of CURRENT_USAGE_STATS_METHOD_CONSTANTS) {
      expect(source).toContain(methodConstant);
    }
    expectStringLiteralsAbsent(source, LEGACY_USAGE_STATS_FACADE_COMMANDS);
  });

  it("旧 Usage Stats facade 不应回到 Electron Host、DevBridge、mock 或 legacy runner", () => {
    const sources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/governance/agentCommandCatalog.json"),
      readRepoFile("src/lib/desktop-host/mediaTaskMocks.ts"),
      readRepoFile("src/lib/desktop-host/core.ts"),
    ].join("\n");
    const runnerSource = readRepoFile("lime-rs/src/app/runner.rs");

    expectStringLiteralsAbsent(sources, LEGACY_USAGE_STATS_FACADE_COMMANDS);

    for (const registration of LEGACY_USAGE_STATS_TAURI_REGISTRATIONS) {
      expect(runnerSource).not.toContain(registration);
    }
  });
});
