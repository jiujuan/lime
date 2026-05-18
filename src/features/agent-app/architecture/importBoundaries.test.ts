import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { describe, expect, it } from "vitest";

const AGENT_APP_ROOT = path.resolve(process.cwd(), "src/features/agent-app");
const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/;
const SKIPPED_SOURCE_FILE_PATTERN = /(\.test\.(ts|tsx)|\.d\.ts)$/;

const DOMAIN_MODULES = [
  "install-mode",
  "runtime-profile",
  "projection",
  "readiness",
  "shell",
  "packaging",
] as const;

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function collectProductionSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      return collectProductionSourceFiles(absolutePath);
    }
    if (
      stats.isFile() &&
      SOURCE_FILE_PATTERN.test(entry) &&
      !SKIPPED_SOURCE_FILE_PATTERN.test(entry)
    ) {
      return [absolutePath];
    }
    return [];
  });
}

function readModuleSources(moduleName: string): Array<{
  absolutePath: string;
  relativePath: string;
  source: string;
}> {
  return collectProductionSourceFiles(path.join(AGENT_APP_ROOT, moduleName)).map(
    (absolutePath) => ({
      absolutePath,
      relativePath: toPosixPath(path.relative(process.cwd(), absolutePath)),
      source: readFileSync(absolutePath, "utf8"),
    }),
  );
}

function expectNoForbiddenPattern(
  files: ReturnType<typeof readModuleSources>,
  pattern: RegExp,
  reason: string,
) {
  const violations = files
    .filter((file) => pattern.test(file.source))
    .map((file) => file.relativePath);

  expect(violations, reason).toEqual([]);
}

describe("Agent App v2 import boundaries", () => {
  it("Domain / Shell / Packaging 模块不反向依赖 UI、Tauri 或前端命令网关", () => {
    const files = DOMAIN_MODULES.flatMap(readModuleSources);

    expectNoForbiddenPattern(
      files,
      /from\s+["'][^"']*(?:\/ui|features\/agent-app\/ui)[^"']*["']/,
      "Domain 模块不能 import UI；UI 只能消费 view model / application service 输出。",
    );
    expectNoForbiddenPattern(
      files,
      /from\s+["']@tauri-apps\//,
      "Domain 模块不能直接依赖 Tauri；系统副作用必须在 adapter / Rust command 边界。",
    );
    expectNoForbiddenPattern(
      files,
      /from\s+["']@\/lib\/api\/agentApps["']/,
      "Domain 模块不能调用前端 API gateway；命令调用只能从组合根进入。",
    );
    expectNoForbiddenPattern(
      files,
      /\b(?:safeInvoke|invoke)\s*\(/,
      "Domain 模块不能直接 invoke Tauri command；必须走 port / adapter。",
    );
  });

  it("UI 不直接触碰 Tauri invoke 或 DevBridge，只能走 agentApps API gateway", () => {
    const files = readModuleSources("ui");

    expectNoForbiddenPattern(
      files,
      /from\s+["']@tauri-apps\//,
      "UI 组件不能直接依赖 Tauri API；统一经 src/lib/api/agentApps.ts。",
    );
    expectNoForbiddenPattern(
      files,
      /from\s+["']@\/lib\/dev-bridge["']/,
      "UI 组件不能直接依赖 DevBridge；统一经 src/lib/api/agentApps.ts。",
    );
    expectNoForbiddenPattern(
      files,
      /\b(?:safeInvoke|invoke)\s*\(/,
      "UI 组件不能直接 invoke command；命令边界由 API gateway 承担。",
    );
  });

  it("Runtime / SDK 不依赖 Shell adapter，避免 standalone 反向污染核心运行时", () => {
    const files = ["runtime", "sdk"].flatMap(readModuleSources);

    expectNoForbiddenPattern(
      files,
      /from\s+["'][^"']*(?:\/shell|features\/agent-app\/shell)[^"']*["']/,
      "Runtime / SDK 只能读取 RuntimeProfile / capability contract，不能 import shell adapter。",
    );
  });
});
