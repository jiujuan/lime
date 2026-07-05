import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const LIME_INPUT_MODALITY_POLICY_SOURCE =
  "src/lib/model/modelInputModalityPolicy.ts";
const DEFAULT_OPENCODE_MODEL_SCHEMA_SOURCE =
  "/Users/coso/Documents/dev/js/opencode/packages/schema/src/model.ts";
const DEFAULT_OPENCODE_MODEL_CATALOG_SOURCE =
  "/Users/coso/Documents/dev/js/opencode/packages/stats/app/src/routes/model-catalog.ts";
const OPENCODE_MODEL_SCHEMA_SOURCE =
  env.OPENCODE_MODEL_SCHEMA_SOURCE ?? DEFAULT_OPENCODE_MODEL_SCHEMA_SOURCE;
const OPENCODE_MODEL_CATALOG_SOURCE =
  env.OPENCODE_MODEL_CATALOG_SOURCE ?? DEFAULT_OPENCODE_MODEL_CATALOG_SOURCE;

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

function requireMatch(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  expect(match, `${label} not found`).not.toBeNull();
  return match?.groups?.body ?? match?.[1] ?? "";
}

function extractConstStringArray(source: string, name: string): string[] {
  const body = requireMatch(
    source,
    new RegExp(
      `export const ${name} = \\[\\n(?<body>[\\s\\S]*?)\\n\\] as const;`,
      "u",
    ),
    name,
  );
  return [...body.matchAll(/"([^"]+)"/gmu)].map((match) => match[1]);
}

describe("opencode model input modality reference", () => {
  it("opencode 参考只取多模型 / 多模态字段形态", () => {
    const schemaSource = readIfExists(OPENCODE_MODEL_SCHEMA_SOURCE);
    const catalogSource = readIfExists(OPENCODE_MODEL_CATALOG_SOURCE);
    if (!schemaSource || !catalogSource) {
      return;
    }

    expect(schemaSource).toContain("export const Capabilities");
    expect(schemaSource).toContain("input: Schema.Array(Schema.String)");
    expect(schemaSource).toContain("output: Schema.Array(Schema.String)");
    expect(catalogSource).toContain(
      "modalities: { input: string[]; output: string[] }",
    );
  });

  it("Lime input modality owner 保留 opencode / models.dev 的 audio、video、pdf 多模态词表", () => {
    const limeSource = readRepoFile(LIME_INPUT_MODALITY_POLICY_SOURCE);

    expect(extractConstStringArray(limeSource, "MODEL_INPUT_MODALITIES")).toEqual([
      "text",
      "image",
      "audio",
      "video",
      "file",
      "embedding",
      "json",
      "pdf",
    ]);
    expect(limeSource).not.toMatch(/\bSession\b|\bSessionInput\b/u);
  });
});
