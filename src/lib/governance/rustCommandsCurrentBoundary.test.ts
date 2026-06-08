/* global process */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const RUST_COMMANDS_ROOT = "lime-rs/src/commands";

const ALLOWED_DEPRECATED_COMMAND_STUB_FILES = new Set([
  "lime-rs/src/commands/a2ui_form_cmd.rs",
  "lime-rs/src/commands/companion_cmd.rs",
  "lime-rs/src/commands/config_cmd.rs",
  "lime-rs/src/commands/connect_cmd.rs",
  "lime-rs/src/commands/document_import_cmd.rs",
  "lime-rs/src/commands/ecommerce_review_reply_cmd.rs",
  "lime-rs/src/commands/experimental_cmd.rs",
  "lime-rs/src/commands/external_tools_cmd.rs",
  "lime-rs/src/commands/image_search_cmd.rs",
  "lime-rs/src/commands/image_upload_cmd.rs",
  "lime-rs/src/commands/injection_cmd.rs",
  "lime-rs/src/commands/models_cmd.rs",
  "lime-rs/src/commands/prompt_cmd.rs",
  "lime-rs/src/commands/telemetry_cmd.rs",
  "lime-rs/src/commands/tray_cmd.rs",
  "lime-rs/src/commands/voice_test_cmd.rs",
  "lime-rs/src/commands/websocket_cmd.rs",
  "lime-rs/src/commands/webview_cmd.rs",
  "lime-rs/src/commands/window_cmd.rs",
]);

const DEPRECATED_COMMAND_STUB_PATTERN =
  /DEPRECATED_[A-Z0-9_]*COMMAND|deprecated_[a-z0-9_]*command|fail-closed 退场面|旧 Tauri .*已退场|legacy Tauri command/iu;

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function collectRustCommandFiles(dir: string): string[] {
  const absoluteDir = join(REPO_ROOT, dir);
  if (!existsSync(absoluteDir)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = join(absoluteDir, entry);
    const stats = statSync(absolutePath);
    const repoPath = `${dir}/${entry}`;

    if (stats.isDirectory()) {
      result.push(...collectRustCommandFiles(repoPath));
      continue;
    }

    if (repoPath.endsWith(".rs")) {
      result.push(repoPath);
    }
  }

  return result.sort();
}

describe("rust commands current boundary", () => {
  it("Tauri runner 不应重新注册旧 in-process App Server JSON-RPC command", () => {
    const runnerSource = readRepoFile("lime-rs/src/app/runner.rs");
    const forbiddenRegistrations = [
      "commands::aster_agent_cmd::app_server_host::app_server_handle_json_lines",
      "commands::aster_agent_cmd::app_server_host::app_server_drain_events",
    ];

    for (const registration of forbiddenRegistrations) {
      expect(runnerSource).not.toContain(registration);
    }
  });

  it("App Server host 不应重新暴露旧 Tauri in-process bridge command", () => {
    const hostSource = readRepoFile(
      "lime-rs/src/commands/aster_agent_cmd/app_server_host.rs",
    );

    expect(hostSource).toContain(
      "pub(crate) async fn handle_in_process_app_server_json_lines",
    );
    expect(hostSource).not.toMatch(
      /#\[tauri::command\]\s*(?:\n\s*)*pub\(crate\)\s+async\s+fn\s+app_server_handle_json_lines/u,
    );
    expect(hostSource).not.toMatch(
      /#\[tauri::command\]\s*(?:\n\s*)*pub\(crate\)\s+async\s+fn\s+app_server_drain_events/u,
    );
    expect(hostSource).not.toContain("struct AppServerHandleJsonLines");
    expect(hostSource).not.toContain("struct AppServerDrainEvents");
  });

  it("Agent App runtime 只能调用内部 App Server helper，不能回到旧 Tauri command", () => {
    const commonSource = readRepoFile(
      "lime-rs/src/commands/agent_app_runtime_cmd/common.rs",
    );

    expect(commonSource).toContain("handle_in_process_app_server_json_lines");
    expect(commonSource).not.toContain("app_server_handle_json_lines");
    expect(commonSource).not.toContain("app_server_drain_events");
  });

  it("commands 目录不应继续新增 deprecated/fail-closed stub 文件", () => {
    const stubFiles = collectRustCommandFiles(RUST_COMMANDS_ROOT).filter(
      (path) => DEPRECATED_COMMAND_STUB_PATTERN.test(readRepoFile(path)),
    );
    const unexpectedStubFiles = stubFiles.filter(
      (path) => !ALLOWED_DEPRECATED_COMMAND_STUB_FILES.has(path),
    );

    expect(unexpectedStubFiles).toEqual([]);
  });
});
