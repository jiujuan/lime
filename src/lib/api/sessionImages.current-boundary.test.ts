import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const RETIRED_UPLOAD_IMAGE_COMMAND = "upload_image_to_session";
const RETIRED_READ_IMAGE_COMMAND = "read_image_from_session";

const FORBIDDEN_SESSION_IMAGE_SOURCES = [
  "src/lib/api/session-files.ts",
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

const RETIRED_IMAGE_WRAPPER_FILES = [
  "lime-rs/src/commands/image_upload_cmd.rs",
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

describe("Session image legacy facade boundary", () => {
  it("前端 session-files API 不再暴露旧图片会话命令", () => {
    const source = readRepoFile("src/lib/api/session-files.ts");

    expect(source).not.toContain("uploadImageToSession");
    expect(source).not.toContain("readImageFromSession");
    expectStringLiteralAbsent(source, RETIRED_UPLOAD_IMAGE_COMMAND);
    expectStringLiteralAbsent(source, RETIRED_READ_IMAGE_COMMAND);
  });

  it("旧图片会话 facade 不应回到 Electron、DevBridge、mock 或 legacy Rust", () => {
    const restrictedSources =
      FORBIDDEN_SESSION_IMAGE_SOURCES.map(readOptionalRepoFile).join("\n");

    expectStringLiteralAbsent(restrictedSources, RETIRED_UPLOAD_IMAGE_COMMAND);
    expectStringLiteralAbsent(restrictedSources, RETIRED_READ_IMAGE_COMMAND);
    expect(restrictedSources).not.toContain("image_upload_cmd");
    for (const retiredPath of RETIRED_IMAGE_WRAPPER_FILES) {
      expect(existsSync(resolve(cwd(), retiredPath))).toBe(false);
    }
  });

  it("旧图片命令只应停留在 retired contract guard 和负向 mock 测试中", () => {
    const contractSource = readRepoFile("scripts/check-command-contracts.mjs");
    const mockGuardSource = readRepoFile(
      "src/lib/desktop-host/sessionFileMocks.test.ts",
    );

    expect(contractSource).toContain(`"${RETIRED_UPLOAD_IMAGE_COMMAND}"`);
    expect(contractSource).toContain(`"${RETIRED_READ_IMAGE_COMMAND}"`);
    expect(mockGuardSource).toContain(`"${RETIRED_UPLOAD_IMAGE_COMMAND}"`);
    expect(mockGuardSource).toContain(`"${RETIRED_READ_IMAGE_COMMAND}"`);
  });
});
