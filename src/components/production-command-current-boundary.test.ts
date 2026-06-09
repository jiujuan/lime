import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const PRODUCTION_UI_ROOTS = ["src/components", "src/hooks", "src/features"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const TEST_OR_FIXTURE_PATTERN =
  /(?:^|\/)(?:__tests__|testFixtures|fixtures)(?:\/|$)|\.(?:test|spec|testFixtures)\.tsx?$/;
const DIRECT_INVOKE_PATTERN =
  /\b(?:safeInvoke|invoke)\s*(?:<[^>]+>)?\s*\(\s*["'`]/;
const SUPPORTS_COMMAND_PATTERN =
  /\.supportsCommand\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const DEV_BRIDGE_NAMED_IMPORT_PATTERN =
  /import\s*\{([\s\S]*?)\}\s*from\s*["'`]@\/lib\/dev-bridge(?:\/safeInvoke)?["'`]/g;
const DEV_BRIDGE_NAMESPACE_IMPORT_PATTERN =
  /import\s+\*\s+as\s+\w+\s+from\s*["'`]@\/lib\/dev-bridge(?:\/safeInvoke)?["'`]/;

const FORBIDDEN_DIRECT_COMMAND_BRIDGE_IMPORTS = new Set([
  "clearMocks",
  "invoke",
  "invokeMockOnly",
  "mockCommand",
  "safeInvoke",
]);

const ALLOWED_LEGACY_SUPPORTS_COMMAND_GATES = new Map<string, Set<string>>();

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      result.push(...collectSourceFiles(path));
      continue;
    }

    if (
      SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)) &&
      !TEST_OR_FIXTURE_PATTERN.test(path.replace(/\\/g, "/"))
    ) {
      result.push(path);
    }
  }

  return result;
}

function relativeSourcePath(path: string): string {
  return relative(cwd(), path).replace(/\\/g, "/");
}

function readProductionUiSources(): Array<{
  path: string;
  source: string;
}> {
  return PRODUCTION_UI_ROOTS.flatMap((root) =>
    collectSourceFiles(join(cwd(), root)).map((path) => ({
      path: relativeSourcePath(path),
      source: readFileSync(path, "utf8"),
    })),
  );
}

function importedNames(importList: string): string[] {
  return importList
    .split(",")
    .map((item) => item.trim().replace(/^type\s+/u, ""))
    .filter(Boolean)
    .map((item) => item.split(/\s+as\s+/iu)[0]?.trim() ?? "")
    .filter(Boolean);
}

describe("production UI command current boundary", () => {
  it("组件、Hook 与 feature island 不应直接调用命令桥", () => {
    const offenders = readProductionUiSources()
      .filter(({ source }) => DIRECT_INVOKE_PATTERN.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("组件、Hook 与 feature island 不应直接导入命令桥或 mock helper", () => {
    const offenders = readProductionUiSources().flatMap(({ path, source }) => {
      const namedImportOffenders = [
        ...source.matchAll(DEV_BRIDGE_NAMED_IMPORT_PATTERN),
      ].flatMap((match) =>
        importedNames(match[1])
          .filter((name) => FORBIDDEN_DIRECT_COMMAND_BRIDGE_IMPORTS.has(name))
          .map((name) => `${path}: ${name}`),
      );
      if (!DEV_BRIDGE_NAMESPACE_IMPORT_PATTERN.test(source)) {
        return namedImportOffenders;
      }
      return [...namedImportOffenders, `${path}: namespace dev-bridge import`];
    });

    expect(offenders).toEqual([]);
  });

  it("legacy supportsCommand gate 必须显式登记退出条件", () => {
    const offenders = readProductionUiSources().flatMap(({ path, source }) => {
      const allowedCommands =
        ALLOWED_LEGACY_SUPPORTS_COMMAND_GATES.get(path) ?? new Set<string>();
      return [...source.matchAll(SUPPORTS_COMMAND_PATTERN)]
        .map((match) => match[1])
        .filter((command) => !allowedCommands.has(command))
        .map((command) => `${path}: ${command}`);
    });

    expect(offenders).toEqual([]);
  });
});
