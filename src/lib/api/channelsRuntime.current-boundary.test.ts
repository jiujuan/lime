import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const LEGACY_CHANNEL_FACADE_COMMANDS = [
  "gateway_channel_start",
  "gateway_channel_stop",
  "gateway_channel_status",
  "telegram_channel_probe",
  "feishu_channel_probe",
  "discord_channel_probe",
  "wechat_channel_probe",
  "wechat_channel_login_start",
  "wechat_channel_login_wait",
  "wechat_channel_list_accounts",
  "wechat_channel_remove_account",
  "wechat_channel_set_runtime_model",
];

const LEGACY_CHANNEL_TAURI_REGISTRATIONS = [
  "commands::gateway_channel_cmd::gateway_channel_start",
  "commands::gateway_channel_cmd::gateway_channel_stop",
  "commands::gateway_channel_cmd::gateway_channel_status",
  "commands::gateway_channel_cmd::telegram_channel_probe",
  "commands::gateway_channel_cmd::feishu_channel_probe",
  "commands::gateway_channel_cmd::discord_channel_probe",
  "commands::gateway_channel_cmd::wechat_channel_probe",
  "commands::wechat_channel_cmd::wechat_channel_login_start",
  "commands::wechat_channel_cmd::wechat_channel_login_wait",
  "commands::wechat_channel_cmd::wechat_channel_list_accounts",
  "commands::wechat_channel_cmd::wechat_channel_remove_account",
  "commands::wechat_channel_cmd::wechat_channel_set_runtime_model",
];

function readRepoFile(path: string): string {
  return readFileSync(
    resolve(cwd(), path),
    "utf8",
  );
}

describe("channelsRuntime current App Server boundary", () => {
  it("已迁 Channels / WeChat 旧 wrapper 文件不应回流", () => {
    for (const relativePath of [
      "lime-rs/src/commands/gateway_channel_cmd.rs",
      "lime-rs/src/commands/wechat_channel_cmd.rs",
    ]) {
      expect(existsSync(resolve(cwd(), relativePath))).toBe(false);
    }
  });

  it("渠道运行态 API 不应回退旧 Tauri / DevBridge facade", () => {
    const source = readRepoFile("src/lib/api/channelsRuntime.ts");

    for (const command of LEGACY_CHANNEL_FACADE_COMMANDS) {
      expect(source).not.toContain(`"${command}"`);
      expect(source).not.toContain(`'${command}'`);
    }
  });

  it("旧 Channels facade 不应回到 runner、DevBridge truth 或 mock priority", () => {
    const runnerSource = readRepoFile("lime-rs/src/app/runner.rs");
    const commandsModSource = readRepoFile("lime-rs/src/commands/mod.rs");
    const commandPolicySource = readRepoFile("src/lib/dev-bridge/commandPolicy.ts");
    const mockPrioritySource = readRepoFile(
      "src/lib/dev-bridge/mockPriorityCommands.ts",
    );

    expect(commandsModSource).not.toContain("gateway_channel_cmd");
    expect(commandsModSource).not.toContain("wechat_channel_cmd");
    for (const registration of LEGACY_CHANNEL_TAURI_REGISTRATIONS) {
      expect(runnerSource).not.toContain(registration);
    }
    for (const command of LEGACY_CHANNEL_FACADE_COMMANDS) {
      expect(commandPolicySource).not.toContain(`"${command}"`);
      expect(commandPolicySource).not.toContain(`'${command}'`);
      expect(mockPrioritySource).not.toContain(`"${command}"`);
      expect(mockPrioritySource).not.toContain(`'${command}'`);
    }
  });
});
