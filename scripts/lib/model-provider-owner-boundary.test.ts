import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd());
const rustRoot = path.join(repoRoot, "lime-rs");
const retiredProviderRoot = path.join(rustRoot, "crates", "providers");

const allowedLegacyReferences = new Set<string>();

const legacyProviderReference =
  /lime_providers::|lime-providers(?:\.workspace|\s*=)|crates[\\/]providers/;

function listRustFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        absolutePath === retiredProviderRoot ||
        entry.name === "target" ||
        entry.name === "node_modules" ||
        entry.name === ".git"
      ) {
        return [];
      }
      return listRustFiles(absolutePath);
    }
    if (
      !entry.isFile() ||
      entry.name === "Cargo.lock" ||
      (entry.name !== "Cargo.toml" && !entry.name.endsWith(".rs"))
    ) {
      return [];
    }
    return [absolutePath];
  });
}

function findLegacyProviderReferences(): string[] {
  return listRustFiles(rustRoot)
    .filter((absolutePath) => {
      const file = readFileSync(absolutePath, "utf8");
      return legacyProviderReference.test(file);
    })
    .map((absolutePath) => path.relative(repoRoot, absolutePath).split(path.sep).join("/"))
    .sort();
}

describe("model-provider owner boundary", () => {
  it("keeps the retired lime-providers crate physically absent", () => {
    expect(existsSync(retiredProviderRoot)).toBe(false);
  });

  it("does not allow new production references to the retired lime-providers owner", () => {
    const references = findLegacyProviderReferences();
    const unexpected = references.filter((file) => !allowedLegacyReferences.has(file));

    expect(unexpected).toEqual([]);
  });
});
