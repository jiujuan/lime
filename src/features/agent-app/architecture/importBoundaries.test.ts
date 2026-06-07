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

function readAgentAppProductionSources(): ReturnType<typeof readModuleSources> {
  return collectProductionSourceFiles(AGENT_APP_ROOT).map((absolutePath) => ({
    absolutePath,
    relativePath: toPosixPath(path.relative(process.cwd(), absolutePath)),
    source: readFileSync(absolutePath, "utf8"),
  }));
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

function escapeRegExpPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LEGACY_HOST_PACKAGE_SCOPE = `@${["ta", "uri"].join("")}-apps/`;
const LEGACY_HOST_MOCK_MODULE = ["ta", "uri", "-mock"].join("");
const LEGACY_HOST_IMPORT_PATTERN = new RegExp(
  `from\\s+["']${escapeRegExpPattern(LEGACY_HOST_PACKAGE_SCOPE)}`,
);
const LEGACY_HOST_DIRECT_IMPORT_PATTERN = new RegExp(
  `from\\s+["'](?:${escapeRegExpPattern(
    LEGACY_HOST_PACKAGE_SCOPE,
  )}|@/lib/(?:desktop-runtime|${LEGACY_HOST_MOCK_MODULE})(?:/|["']))`,
);
const LEGACY_HOST_BUILD_LABEL_PATTERN = new RegExp(
  `\\b${["Ta", "uri"].join("")}\\s+(?:build|release)\\b`,
);

describe("Agent App v2 import boundaries", () => {
  it("Domain / Shell / Packaging 模块不反向依赖 UI、Desktop Host 或前端命令网关", () => {
    const files = DOMAIN_MODULES.flatMap(readModuleSources);

    expectNoForbiddenPattern(
      files,
      /from\s+["'][^"']*(?:\/ui|features\/agent-app\/ui)[^"']*["']/,
      "Domain 模块不能 import UI；UI 只能消费 view model / application service 输出。",
    );
    expectNoForbiddenPattern(
      files,
      LEGACY_HOST_IMPORT_PATTERN,
      "Domain 模块不能直接依赖旧桌面宿主 API；系统副作用必须在 Desktop Host / App Server adapter 边界。",
    );
    expectNoForbiddenPattern(
      files,
      /from\s+["']@\/lib\/desktop-host(?:\/|["'])/,
      "Domain 模块不能直接依赖 Desktop Host API；系统副作用必须在 adapter / App Server 边界。",
    );
    expectNoForbiddenPattern(
      files,
      /from\s+["']@\/lib\/dev-bridge["']/,
      "Domain 模块不能直接依赖 DevBridge；命令调用只能从组合根或 API gateway 进入。",
    );
    expectNoForbiddenPattern(
      files,
      /from\s+["']@\/lib\/api\/agentApps["']/,
      "Domain 模块不能调用前端 API gateway；命令调用只能从组合根进入。",
    );
    expectNoForbiddenPattern(
      files,
      /\b(?:safeInvoke|invoke)\s*\(/,
      "Domain 模块不能直接 invoke Desktop/App Server command；必须走 port / adapter。",
    );
  });

  it("UI 不直接触碰 Desktop Host invoke、旧桌面宿主 API 或 DevBridge，只能走 agentApps API gateway", () => {
    const files = readModuleSources("ui");

    expectNoForbiddenPattern(
      files,
      LEGACY_HOST_IMPORT_PATTERN,
      "UI 组件不能直接依赖旧桌面宿主 API；统一经 src/lib/api/agentApps.ts。",
    );
    expectNoForbiddenPattern(
      files,
      /from\s+["']@\/lib\/desktop-host(?:\/|["'])/,
      "UI 组件不能直接依赖 Desktop Host API；统一经 src/lib/api/agentApps.ts。",
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

  it("Agent App production code 不直接 import 旧桌面宿主 API", () => {
    const files = readAgentAppProductionSources();

    expectNoForbiddenPattern(
      files,
      LEGACY_HOST_DIRECT_IMPORT_PATTERN,
      "Agent App current 生产代码不能直接 import 旧桌面宿主 API；宿主能力必须经 Desktop Host / App Server adapter 或 packaging artifact seam。",
    );
  });

  it("current standalone release 口径不再把 production artifact build 命名为旧桌面宿主 build", () => {
    const files = readAgentAppProductionSources();

    expectNoForbiddenPattern(
      files,
      LEGACY_HOST_BUILD_LABEL_PATTERN,
      "Agent App current 代码不能继续用旧桌面宿主命名 standalone production artifact build/release；旧桌面宿主只允许作为明确的 legacy/deprecated adapter 或 config artifact 语境。",
    );
  });
});
