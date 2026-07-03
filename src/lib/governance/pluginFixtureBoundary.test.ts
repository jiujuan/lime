import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, "src");
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

function isSourceFile(path: string): boolean {
  return Array.from(SOURCE_EXTENSIONS).some((extension) =>
    path.endsWith(extension),
  );
}

function isAllowedTestOnlyPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return (
    normalized.includes("/src/features/plugin/testing/") ||
    /\.test\.[cm]?[tj]sx?$/.test(normalized) ||
    /\.unit\.test\.[cm]?[tj]sx?$/.test(normalized) ||
    /\.testFixtures\.[cm]?[tj]sx?$/.test(normalized)
  );
}

function listSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (stat.isFile() && isSourceFile(path)) {
      files.push(path);
    }
  }
  return files;
}

describe("pluginFixtureBoundary", () => {
  it("生产源码不得恢复 Plugin fixture 目录或导入 test-only fixture", () => {
    const violations = listSourceFiles(SRC_ROOT)
      .filter((path) => !isAllowedTestOnlyPath(path))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        const relativePath = relative(REPO_ROOT, path);
        return [
          source.includes("features/plugin/fixtures")
            ? `${relativePath}: legacy fixture path`
            : null,
          source.includes("plugin/testing/fixtures") ||
          source.includes("../testing/fixtures") ||
          source.includes("./fixtures/content-factory-app.json")
            ? `${relativePath}: test-only fixture import`
            : null,
        ].filter((value): value is string => Boolean(value));
      });

    expect(violations).toEqual([]);
  });
});
