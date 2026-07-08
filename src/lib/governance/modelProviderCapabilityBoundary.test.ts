import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const TS_CAPABILITY_SOURCE = "src/lib/model/inferModelCapabilities.ts";
const RUST_CANONICAL_MODEL_SOURCE =
  "lime-rs/crates/model-provider/src/canonical/model.rs";
const RUST_CANONICAL_REGISTRY_SOURCE =
  "lime-rs/crates/model-provider/src/canonical/registry.rs";
const SCAN_ROOTS = ["src", "packages", "lime-rs/crates"];
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".rs",
  ".ts",
  ".tsx",
]);
const CAPABILITY_SUMMARY_FIELDS = [
  "capabilities",
  "task_families",
  "input_modalities",
  "output_modalities",
  "runtime_features",
  "supports_tools",
  "supports_reasoning",
  "supports_prompt_cache",
  "supports_media_input",
  "supports_media_output",
  "context_length",
  "max_output_tokens",
];

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

function extensionOf(path: string): string {
  const match = path.match(/\.[^.]+$/u);
  return match?.[0] ?? "";
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === "build" ||
        entry === "coverage" ||
        entry === "target"
      ) {
        continue;
      }
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (stat.isFile() && SOURCE_EXTENSIONS.has(extensionOf(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isAllowedCanonicalJsonOwner(path: string): boolean {
  return (
    path === RUST_CANONICAL_REGISTRY_SOURCE ||
    path.startsWith("src/lib/governance/") ||
    path.endsWith(".test.ts") ||
    path.endsWith(".test.tsx") ||
    path.endsWith(".spec.ts") ||
    path.endsWith(".spec.tsx")
  );
}

describe("Model provider capability boundary", () => {
  it("TS 与 Rust canonical capability summary 应保持同一字段合同", () => {
    const tsSource = readRepoFile(TS_CAPABILITY_SOURCE);
    const rustSource = readRepoFile(RUST_CANONICAL_MODEL_SOURCE);

    expect(tsSource).toContain("export interface ModelCapabilitySummary");
    expect(tsSource).toContain("export function getModelCapabilitySummary");
    expect(rustSource).toContain("pub struct CanonicalModelCapabilitySummary");
    expect(rustSource).toContain("pub fn capability_summary");

    for (const field of CAPABILITY_SUMMARY_FIELDS) {
      expect(tsSource, `ModelCapabilitySummary 缺少字段 ${field}`).toMatch(
        new RegExp(`\\b${field}:`, "u"),
      );
      expect(
        rustSource,
        `CanonicalModelCapabilitySummary 缺少字段 ${field}`,
      ).toMatch(new RegExp(`\\bpub ${field}:`, "u"));
      expect(tsSource, `getModelCapabilitySummary 未返回字段 ${field}`).toMatch(
        new RegExp(`\\b${field}:`, "u"),
      );
      expect(
        rustSource,
        `CanonicalModel::capability_summary 未返回字段 ${field}`,
      ).toMatch(new RegExp(`\\b${field}:`, "u"));
    }
  });

  it("生产代码不得绕过 owner 直接读取 bundled canonical model JSON", () => {
    const offenders = SCAN_ROOTS.flatMap((root) =>
      collectSourceFiles(join(REPO_ROOT, root)),
    )
      .map((file) => ({
        path: repoRelative(file),
        source: readFileSync(file, "utf8"),
      }))
      .filter(({ path }) => !isAllowedCanonicalJsonOwner(path))
      .flatMap(({ path, source }) => {
        const matches = [
          ...source.matchAll(/canonical_models\.json|canonical\/data/gu),
        ];
        return matches.map((match) => `${path}: ${match[0]}`);
      });

    expect(
      offenders,
      "bundled canonical_models.json 只能由 model-provider canonical registry 读取；前端和运行时必须消费 App Server model registry / capability summary",
    ).toEqual([]);
  });
});
